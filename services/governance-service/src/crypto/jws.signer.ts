/**
 * @file        jws.signer.ts
 * @description Signataire/vérificateur JWS compact **RS256** pour le
 *              governance-service (messages SGOGT + manifeste d'export DGE +
 *              historique d'escalade). Conforme à `SGOGT-PROTOCOL.md` §3-4 et
 *              `ELECTIONS-EXPORT-CONTRACT.md` §5.
 *
 *              ⚠️ RS256, PAS Ed25519 (CANON ADR-026/ADR-034 : Vault Transit ne
 *              supporte pas Ed25519 ; la signature asymétrique Transit est RSA).
 *
 *              PRODUCTION : signature déléguée à **Vault Transit** (`transit/sign`,
 *              `signature_algorithm=pkcs1v15`). La clé privée par-fonctionnaire
 *              (`sgogt-user-<id>`) / d'export (`elections-export`) NE QUITTE
 *              JAMAIS Vault. L'enveloppe Transit `vault:vN:<base64-standard>` est
 *              convertie en **3ᵉ segment base64url** (RFC 7515) pour un JWS
 *              interopérable (vérifiable par une librairie JWS standard côté DGE
 *              / Vérificateur Général).
 *
 *              DEV / TEST (Vault absent) : une paire RSA-2048 ÉPHÉMÈRE est
 *              générée PAR `kid` et conservée en mémoire ; la signature/vérif se
 *              fait en `node:crypto` PUR. Les JWS produits ne survivent pas au
 *              restart — toléré en dev, INTERDIT en production (fail-fast).
 *
 *              🔒 FAIL-FAST PRODUCTION : en `NODE_ENV=production`, l'absence du
 *              client Vault interrompt toute signature (pas de fallback éphémère).
 *
 * @author      Étudiant UQAR
 * @date        2026
 * @module      governance-service/crypto
 */
import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  generateKeyPairSync,
  type KeyObject,
} from 'node:crypto';
import type { VaultClient } from '@nina-aes/vault-client';
import type { Env } from '../config/env.schema.js';
import { VAULT_CLIENT } from '../vault/vault.module.js';

/**
 * En-tête JWS RS256 (compact).
 *
 * Le champ `kv` ÉPINGLE la version de clé Transit (`key_version`) utilisée à la
 * signature. Il est placé DANS l'en-tête (donc DANS l'entrée signée
 * `header.payload`) : il est ainsi couvert par la signature (immuable) ET
 * auto-décrit le JWS pour un vérificateur externe (DGE / Vérificateur Général)
 * qui résout la bonne version de clé publique sans connaître l'état de rotation
 * du Vault de l'État. Sans ce pinning, une rotation Vault invaliderait toutes
 * les signatures antérieures → non-répudiation cassée.
 */
interface JwsHeader {
  alg: 'RS256';
  typ: 'JWT';
  kid: string;
  kv: number;
}

/** Résultat du parse d'un JWS compact (pour vérification). */
export interface ParsedJws {
  header: { alg?: string; kid?: string; typ?: string; kv?: number };
  payload: Record<string, unknown>;
  /** `base64url(header).base64url(payload)` — entrée de signature RS256. */
  signingInput: string;
  /** Octets bruts de la signature RSA (3ᵉ segment base64url décodé). */
  signatureBytes: Buffer;
}

/** Paire RSA éphémère DEV conservée en mémoire (par `kid`). */
interface DevKeyPair {
  privateKey: KeyObject;
  publicKey: KeyObject;
}

/** Version de clé fictive utilisée en mode DEV (paire RSA éphémère unique). */
const DEV_KEY_VERSION = 1;

/** Encode un objet JSON en base64url (sans padding). */
function b64urlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), 'utf8').toString('base64url');
}

@Injectable()
export class JwsSigner {
  private readonly logger = new Logger(JwsSigner.name);
  private readonly isProd: boolean;
  /** Cache des paires RSA éphémères DEV, indexées par `kid`. */
  private readonly devKeys = new Map<string, DevKeyPair>();
  /**
   * Cache des clés publiques Transit pour la vérification, indexé par
   * `kid#version`. La clé de cache INCLUT la version : une rotation Vault
   * n'empoisonne pas le cache (chaque version a sa propre entrée immuable).
   */
  private readonly publicKeyCache = new Map<string, KeyObject>();

  constructor(
    cfg: ConfigService<Env, true>,
    @Inject(VAULT_CLIENT) private readonly vault: VaultClient | null,
  ) {
    this.isProd = cfg.get('NODE_ENV', { infer: true }) === 'production';
  }

  /**
   * Produit un JWS compact RS256 couvrant `claims`, signé par la clé Transit
   * `kid`. L'en-tête est `{ alg: RS256, typ: JWT, kid, kv }` où `kv` ÉPINGLE la
   * version de clé Transit utilisée (résiste à la rotation — cf. {@link JwsHeader}).
   *
   * @param claims Objet de claims (la « décision » à rendre engageante).
   * @param kid    Nom de la clé Transit signataire (= `kid` du JWS).
   * @returns JWS compact `header.payload.signature` (RFC 7515).
   * @throws InternalServerErrorException si la signature échoue (Vault KO en prod).
   */
  async sign(claims: Record<string, unknown>, kid: string): Promise<string> {
    if (this.vault) {
      return this.signWithVault(claims, kid);
    }

    // Pas de Vault. En production, refus catégorique (pas de signature éphémère).
    if (this.isProd) {
      this.logger.error('Signature impossible : Vault absent en production (fail-fast).');
      throw new InternalServerErrorException('SIGNING_UNAVAILABLE');
    }

    // DEV uniquement : paire RSA éphémère locale (version de clé fictive = 1).
    const header: JwsHeader = { alg: 'RS256', typ: 'JWT', kid, kv: DEV_KEY_VERSION };
    const signingInput = `${b64urlJson(header)}.${b64urlJson(claims)}`;
    const pair = this.getOrCreateDevKey(kid);
    const signer = createSign('RSA-SHA256');
    signer.update(signingInput);
    const sigB64Url = signer.sign(pair.privateKey).toString('base64url');
    return `${signingInput}.${sigB64Url}`;
  }

  /**
   * Signature via Vault Transit avec ÉPINGLAGE de la version de clé dans l'en-tête.
   *
   *   1. lit la version active (`latest_version`) pour la pré-inscrire dans `kv` ;
   *   2. signe l'entrée JWS `header.payload` (header contenant `kv`) ;
   *   3. RÉCONCILIE : si une rotation a fait basculer la version EFFECTIVE de
   *      signature (`key_version` renvoyé) entre l'étape 1 et l'étape 2, on
   *      resigne UNE fois avec la version correcte. Garantit que le `kv` signé
   *      correspond EXACTEMENT à la clé qui a produit la signature (sinon la
   *      vérification résoudrait une mauvaise clé publique).
   *
   * @throws InternalServerErrorException si Vault est indisponible (fail-fast prod).
   */
  private async signWithVault(claims: Record<string, unknown>, kid: string): Promise<string> {
    try {
      // Version active pré-inscrite dans l'en-tête (sera réconciliée si rotation).
      const { version: activeVersion } = await this.vault!.transitReadPublicKey(kid);
      let pinnedVersion = activeVersion;

      for (let attempt = 0; attempt < 2; attempt += 1) {
        const header: JwsHeader = { alg: 'RS256', typ: 'JWT', kid, kv: pinnedVersion };
        const signingInput = `${b64urlJson(header)}.${b64urlJson(claims)}`;
        // Transit signe l'ENTRÉE JWS (header.payload) en RS256/pkcs1v15.
        // `prehashed` NON activé : Vault hashe lui-même l'entrée en SHA-256.
        const { signature, keyVersion } = await this.vault!.transitSign(
          kid,
          Buffer.from(signingInput, 'utf8').toString('base64'),
          { signatureAlgorithm: 'pkcs1v15', hashAlgorithm: 'sha2-256' },
        );
        // La version EFFECTIVE de signature concorde avec `kv` → JWS cohérent.
        if (keyVersion === pinnedVersion) {
          // Enveloppe Transit `vault:vN:<base64-standard>` → octets RSA bruts →
          // base64url (3ᵉ segment RFC 7515) pour un JWS interopérable.
          const b64Standard = signature.replace(/^vault:v\d+:/, '');
          const sigB64Url = Buffer.from(b64Standard, 'base64').toString('base64url');
          return `${signingInput}.${sigB64Url}`;
        }
        // Rotation concurrente : on réaligne `kv` sur la version réellement utilisée.
        pinnedVersion = keyVersion;
      }
      // Deux rotations consécutives pendant une seule signature : extrêmement
      // improbable → on refuse plutôt que d'émettre un JWS dont `kv` ment.
      throw new Error('rotation Vault Transit concurrente répétée');
    } catch (err) {
      this.logger.error(`Signature Vault Transit échouée (kid=${kid}) : ${(err as Error).message}`);
      throw new InternalServerErrorException('SIGNING_UNAVAILABLE');
    }
  }

  /**
   * Parse un JWS compact SANS faire confiance à `alg` (à vérifier ensuite).
   *
   * @param jws JWS compact.
   * @returns Structure parsée {@link ParsedJws}.
   * @throws UnauthorizedException si le format est invalide.
   */
  parse(jws: string): ParsedJws {
    const parts = jws.split('.');
    if (parts.length !== 3) throw new UnauthorizedException('JWS_MALFORMED');
    const [hB64, pB64, sigB64] = parts as [string, string, string];
    let header: ParsedJws['header'];
    let payload: Record<string, unknown>;
    try {
      header = JSON.parse(Buffer.from(hB64, 'base64url').toString('utf8'));
      payload = JSON.parse(Buffer.from(pB64, 'base64url').toString('utf8'));
    } catch {
      throw new UnauthorizedException('JWS_MALFORMED');
    }
    return {
      header,
      payload,
      signingInput: `${hB64}.${pB64}`,
      signatureBytes: Buffer.from(sigB64, 'base64url'),
    };
  }

  /**
   * Vérifie un JWS compact RS256 :
   *   1. refus strict de tout `alg != RS256` (anti-confusion d'algorithme) ;
   *   2. le `kid` doit valoir `expectedKid` (cohérence identité/clé) ;
   *   3. présence d'une version de clé épinglée `kv` (en-tête signé) ;
   *   4. signature RSA valide pour la clé publique du `kid` À LA VERSION `kv`
   *      (résolution explicite — jamais `latest_version` → robuste à la rotation).
   *
   * @param jws         JWS à vérifier.
   * @param expectedKid `kid` attendu (ex. `sgogt-user-<senderId>`).
   * @returns `true` si toutes les conditions sont remplies.
   */
  async verify(jws: string, expectedKid: string): Promise<boolean> {
    const parsed = this.parse(jws);
    if (parsed.header.alg !== 'RS256') {
      throw new UnauthorizedException(`JWS_ALG_REJECTED:${parsed.header.alg}`);
    }
    if (parsed.header.kid !== expectedKid) {
      throw new UnauthorizedException('JWS_KID_MISMATCH');
    }
    // La version de clé ÉPINGLÉE dans l'en-tête signé (`kv`) — OBLIGATOIRE.
    // On résout EXACTEMENT cette version de clé publique (jamais `latest_version`),
    // sinon une rotation Vault casserait la vérification des signatures passées.
    if (!Number.isInteger(parsed.header.kv) || (parsed.header.kv as number) < 1) {
      throw new UnauthorizedException('JWS_KEY_VERSION_MISSING');
    }
    const publicKey = await this.resolvePublicKey(expectedKid, parsed.header.kv as number);
    if (!publicKey) return false;
    const verifier = createVerify('RSA-SHA256');
    verifier.update(parsed.signingInput);
    return verifier.verify(publicKey, parsed.signatureBytes);
  }

  /**
   * Résout la clé publique d'un `kid` à une VERSION PRÉCISE (Transit en prod,
   * paire DEV sinon). Le cache est indexé par `(kid, version)` : après une
   * rotation Vault, l'ancienne version reste résoluble pour vérifier les
   * signatures antérieures, et la nouvelle est lue séparément (pas
   * d'empoisonnement de cache par rotation).
   *
   * @param kid     Nom de la clé Transit.
   * @param version Version de clé épinglée (`kv` de l'en-tête JWS signé).
   */
  private async resolvePublicKey(kid: string, version: number): Promise<KeyObject | null> {
    const cacheKey = `${kid}#${version}`;
    const cached = this.publicKeyCache.get(cacheKey);
    if (cached) return cached;

    if (this.vault) {
      try {
        const { publicKeyPem } = await this.vault.transitReadPublicKey(kid, version);
        const key = createPublicKey(publicKeyPem);
        this.publicKeyCache.set(cacheKey, key);
        return key;
      } catch (err) {
        this.logger.warn(
          `Clé publique Transit indisponible (kid=${kid}, v=${version}) : ${(err as Error).message}`,
        );
        return null;
      }
    }

    // DEV : la paire éphémère locale (créée à la signature) porte la publique.
    const pair = this.devKeys.get(kid);
    return pair?.publicKey ?? null;
  }

  /** Crée (ou réutilise) une paire RSA éphémère DEV pour un `kid`. */
  private getOrCreateDevKey(kid: string): DevKeyPair {
    const existing = this.devKeys.get(kid);
    if (existing) return existing;
    const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    // Normalise en KeyObject « propres » (createPrivateKey idempotent).
    const pair: DevKeyPair = {
      privateKey: createPrivateKey(privateKey.export({ type: 'pkcs8', format: 'pem' })),
      publicKey: createPublicKey(publicKey.export({ type: 'spki', format: 'pem' })),
    };
    this.devKeys.set(kid, pair);
    this.publicKeyCache.set(`${kid}#${DEV_KEY_VERSION}`, pair.publicKey);
    return pair;
  }
}

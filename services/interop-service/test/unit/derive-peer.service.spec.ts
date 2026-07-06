/**
 * @file        derive-peer.service.spec.ts
 * @description Tests négatifs de la dérivation d'identité par cert mTLS (§4.7 /
 *              §5bis) : pas de handshake vérifié → 403, cert absent → 403, le
 *              fingerprint est recalculé EN INTERNE (pas lu d'un header), le pays
 *              vient du Subject du cert (un header X-AES-Peer-Country est IGNORÉ).
 * @module      interop-service/test
 */
import { ForbiddenException } from '@nestjs/common';
import type { Request } from 'express';
import { DerivePeerService } from '../../src/peer/derive-peer.service.js';
import { fakeConfig } from '../helpers/config.helper.js';

/** Cert BFA de test (CN=interop.dgec.bf, OU=BFA), signé Ed25519. */
const BFA_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBgzCCATWgAwIBAgIUdH+kWLaEXXP4xkKzL3oATqvacQ8wBQYDK2VwMDcxGDAW',
  'BgNVBAMMD2ludGVyb3AuZGdlYy5iZjEMMAoGA1UECwwDQkZBMQ0wCwYDVQQKDARE',
  'R0VDMB4XDTI2MDYyNzA3MjQyMVoXDTM2MDYyNDA3MjQyMVowNzEYMBYGA1UEAwwP',
  'aW50ZXJvcC5kZ2VjLmJmMQwwCgYDVQQLDANCRkExDTALBgNVBAoMBERHRUMwKjAF',
  'BgMrZXADIQDOkMjhIMK1puYuV+u1kmx50WqYr7afwx2K1i2I50rikKNTMFEwHQYD',
  'VR0OBBYEFGoXQm/lfm2WUvSgiYIXbeREAZGzMB8GA1UdIwQYMBaAFGoXQm/lfm2W',
  'UvSgiYIXbeREAZGzMA8GA1UdEwEB/wQFMAMBAf8wBQYDK2VwA0EAqChWduQvXS+B',
  'uRC7UxLVpbWQy/IpypRypz7ok6b5i8O3nBrfOe7pPsy4BHeFAG8VQvdhLW43lUSf',
  'B/UmWH3uCw==',
  '-----END CERTIFICATE-----',
].join('\n');

/** Fingerprint SHA-256 du DER du cert BFA ci-dessus (calculé indépendamment). */
const BFA_FINGERPRINT = 'd33da0ebba0b7bc924c11ee8ed8608aa2012009311a7066136765a6e17ee4006';

/**
 * Cert AMBIGU de test (Subject `OU=BFA, OU=NER`) — durcissement revue sécurité :
 * un Subject désignant PLUSIEURS pays AES distincts doit être REFUSÉ (sinon le
 * pays dépendrait de l'ordre de balayage de `AES_COUNTRIES`).
 */
const AMBIGUOUS_PEM = [
  '-----BEGIN CERTIFICATE-----',
  'MIIBqzCCAV2gAwIBAgIUIE9rSzsnImYIMG4f4clK2fE09bwwBQYDK2VwMEsxHzAd',
  'BgNVBAMMFmludGVyb3AuYW1iaWd1b3VzLnRlc3QxDDAKBgNVBAsMA0JGQTEMMAoG',
  'A1UECwwDTkVSMQwwCgYDVQQKDANBRVMwHhcNMjYwNjI3MDkwMTI3WhcNMzYwNjI0',
  'MDkwMTI3WjBLMR8wHQYDVQQDDBZpbnRlcm9wLmFtYmlndW91cy50ZXN0MQwwCgYD',
  'VQQLDANCRkExDDAKBgNVBAsMA05FUjEMMAoGA1UECgwDQUVTMCowBQYDK2VwAyEA',
  'AdYQrTDsKILaqPaOqhRO67+dnwX/2wwKqWynxWJ3zKSjUzBRMB0GA1UdDgQWBBTK',
  'm9XI3Bqtwd7UF9z2v4kYlF+iKjAfBgNVHSMEGDAWgBTKm9XI3Bqtwd7UF9z2v4kY',
  'lF+iKjAPBgNVHRMBAf8EBTADAQH/MAUGAytlcANBALjI17YbyuiKp4md9+3xWO+4',
  '3LyWMSujxr9jnMwWOs/UZai1gVQota3SSeU74DCE16jSGJ+/LqlyOQmYHiI8CQk=',
  '-----END CERTIFICATE-----',
].join('\n');

/** Forge une requête Express avec des en-têtes arbitraires. */
function reqWith(headers: Record<string, string | undefined>): Request {
  return { headers } as unknown as Request;
}

describe('DerivePeerService — identité par cert mTLS (tests négatifs §5bis)', () => {
  const svc = () => new DerivePeerService(fakeConfig({ INTEROP_TRUST_INGRESS_HEADERS: true }));

  it('handshake vérifié + cert BFA → { country:BFA, fingerprint recalculé en interne }', () => {
    const peer = svc().derivePeer(
      reqWith({
        'ssl-client-verify': 'SUCCESS',
        'ssl-client-cert': encodeURIComponent(BFA_PEM),
      }),
    );
    expect(peer.country).toBe('BFA');
    expect(peer.certFingerprint).toBe(BFA_FINGERPRINT);
  });

  it('PEM transmis NON url-encodé (déjà décodé) → même fingerprint', () => {
    const peer = svc().derivePeer(
      reqWith({ 'ssl-client-verify': 'SUCCESS', 'ssl-client-cert': BFA_PEM }),
    );
    expect(peer.certFingerprint).toBe(BFA_FINGERPRINT);
  });

  it('mTLS NON vérifié (ssl-client-verify != SUCCESS) → 403', () => {
    expect(() =>
      svc().derivePeer(
        reqWith({ 'ssl-client-verify': 'FAILED', 'ssl-client-cert': encodeURIComponent(BFA_PEM) }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('requête SANS cert mTLS → 403', () => {
    expect(() => svc().derivePeer(reqWith({ 'ssl-client-verify': 'SUCCESS' }))).toThrow(
      ForbiddenException,
    );
  });

  it('header X-AES-Peer-Country: NER IGNORÉ → pays effectif = BFA (cert)', () => {
    const peer = svc().derivePeer(
      reqWith({
        'ssl-client-verify': 'SUCCESS',
        'ssl-client-cert': encodeURIComponent(BFA_PEM),
        'x-aes-peer-country': 'NER', // tentative de spoof — doit être ignorée
        'x-aes-peer-cert-fingerprint': 'f'.repeat(64), // fingerprint forgé — ignoré
      }),
    );
    expect(peer.country).toBe('BFA'); // l'identité vient du cert, pas du header
    expect(peer.certFingerprint).toBe(BFA_FINGERPRINT); // recalculé, pas lu du header
  });

  it('cert mTLS AMBIGU (OU=BFA, OU=NER) → 403 (refus, pas de devinette ordre-dépendante)', () => {
    // Durcissement revue sécurité : un Subject portant 2 pays AES distincts ne
    // doit JAMAIS résoudre silencieusement vers le premier de `AES_COUNTRIES` ;
    // countryFromPem renvoie null → derivePeer lève 403.
    expect(() =>
      svc().derivePeer(
        reqWith({
          'ssl-client-verify': 'SUCCESS',
          'ssl-client-cert': encodeURIComponent(AMBIGUOUS_PEM),
        }),
      ),
    ).toThrow(ForbiddenException);
  });

  it('mode DEV sans peer simulé → 403 (pas de fallback silencieux)', () => {
    const dev = new DerivePeerService(fakeConfig({ INTEROP_TRUST_INGRESS_HEADERS: false }));
    expect(() => dev.derivePeer(reqWith({}))).toThrow(ForbiddenException);
  });

  it('mode DEV avec peer simulé → identité explicite (dev uniquement)', () => {
    const dev = new DerivePeerService(
      fakeConfig({
        INTEROP_TRUST_INGRESS_HEADERS: false,
        INTEROP_DEV_PEER_COUNTRY: 'BFA',
        INTEROP_DEV_PEER_FINGERPRINT: BFA_FINGERPRINT,
      }),
    );
    const peer = dev.derivePeer(reqWith({}));
    expect(peer).toEqual({ country: 'BFA', certFingerprint: BFA_FINGERPRINT });
  });
});

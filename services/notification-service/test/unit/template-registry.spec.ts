/**
 * @file        template-registry.spec.ts
 * @description Tests du moteur de templates : interpolation, fallback FR,
 *              validation des variables obligatoires, canaux indisponibles.
 * @module      notification-service/test
 */
import { NotificationChannel } from '../../src/notifications/channels/channel.types.js';
import {
  TemplateRegistry,
  TemplateRenderError,
} from '../../src/notifications/templates/template.registry.js';

describe('TemplateRegistry', () => {
  const registry = new TemplateRegistry();

  it('liste les 7 templates du catalogue', () => {
    expect(registry.list()).toHaveLength(7);
    expect(registry.has('mfa-code')).toBe(true);
    expect(registry.has('inconnu')).toBe(false);
  });

  it('rend un SMS FR en interpolant les variables', () => {
    const r = registry.render('mfa-code', NotificationChannel.SMS, 'FR', {
      code: '482913',
      ttl: 5,
    });
    expect(r.language).toBe('FR');
    expect(r.body).toContain('482913');
    expect(r.body).toContain('5 min');
    expect(r.body).not.toMatch(/\{/); // aucun placeholder résiduel
  });

  it('rend un email FR (objet + corps)', () => {
    const r = registry.render('correction-submitted', NotificationChannel.EMAIL, 'FR', {
      id: '42',
    });
    expect(r.subject).toContain('42');
    expect(r.body).toContain('42');
  });

  it('retombe sur le FR quand la langue n’a pas de traduction (BM vide)', () => {
    const r = registry.render('mfa-code', NotificationChannel.SMS, 'BM', { code: '111', ttl: 3 });
    expect(r.language).toBe('FR'); // fallback
    expect(r.body).toContain('111');
  });

  it('traite USSD comme un SMS (même slot)', () => {
    const r = registry.render('ussd-confirmation', NotificationChannel.USSD, 'FR', { ref: 'OP-9' });
    expect(r.body).toContain('OP-9');
  });

  it('lève MISSING_VARIABLE si une variable obligatoire manque', () => {
    expect(() => registry.render('mfa-code', NotificationChannel.SMS, 'FR', { code: '1' })).toThrow(
      TemplateRenderError,
    );
    try {
      registry.render('mfa-code', NotificationChannel.SMS, 'FR', { code: '1' });
    } catch (e) {
      expect((e as TemplateRenderError).code).toBe('MISSING_VARIABLE');
    }
  });

  it('lève TEMPLATE_NOT_FOUND pour une clé inconnue', () => {
    try {
      registry.render('does-not-exist', NotificationChannel.SMS, 'FR', {});
      fail('aurait dû lever');
    } catch (e) {
      expect((e as TemplateRenderError).code).toBe('TEMPLATE_NOT_FOUND');
    }
  });

  it('lève CHANNEL_NOT_FOUND si le template n’a pas le canal demandé', () => {
    // mfa-code n'existe qu'en SMS → l'email n'est pas disponible.
    try {
      registry.render('mfa-code', NotificationChannel.EMAIL, 'FR', { code: '1', ttl: 2 });
      fail('aurait dû lever');
    } catch (e) {
      expect((e as TemplateRenderError).code).toBe('CHANNEL_NOT_FOUND');
    }
  });
});

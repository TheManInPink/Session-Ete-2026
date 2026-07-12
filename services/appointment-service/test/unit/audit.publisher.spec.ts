/**
 * @file        audit.publisher.spec.ts
 * @description Contrat de fil de l'{@link AuditPublisher} : enveloppe à champs
 *              RACINE (lus par le normalizer audit-service), routing key
 *              `appointment.<action>` sur `nina.events`, en-têtes d'origine,
 *              caractère best-effort, et absence de NINA. La connexion RabbitMQ
 *              est entièrement stubbée (aucun broker requis).
 * @module      appointment-service/test
 */

// On stubbe le module de connexion pour ne PAS charger amqp-connection-manager :
// le publisher est construit avec une connexion factice.
jest.mock('../../src/appointments/messaging/rabbit.connection.js', () => ({
  RabbitConnection: class {},
}));

import { AuditPublisher, AuditAction } from '../../src/appointments/messaging/audit.publisher.js';

interface Captured {
  exchange: string;
  routingKey: string;
  body: Record<string, unknown>;
  options: Record<string, unknown>;
}

function build(opts: { enabled?: boolean; connEnabled?: boolean; failPublish?: boolean } = {}) {
  const { enabled = true, connEnabled = true, failPublish = false } = opts;
  const captured: Captured[] = [];
  const channel = {
    publish: jest.fn((exchange: string, routingKey: string, body: Buffer, options: unknown) => {
      if (failPublish) return Promise.reject(new Error('broker down'));
      captured.push({
        exchange,
        routingKey,
        body: JSON.parse(body.toString('utf8')) as Record<string, unknown>,
        options: options as Record<string, unknown>,
      });
      return Promise.resolve(undefined);
    }),
    close: jest.fn().mockResolvedValue(undefined),
  };
  const connection = {
    isEnabled: () => connEnabled,
    get: () => ({ createChannel: () => channel }),
  };
  const cfg = {
    get: (k: string) =>
      (
        ({ RABBITMQ_EVENTS_EXCHANGE: 'nina.events', APPOINTMENT_AUDIT_ENABLED: enabled }) as Record<
          string,
          unknown
        >
      )[k],
  };
  const publisher = new AuditPublisher(cfg as never, connection as never);
  return { publisher, captured, channel };
}

const event = {
  action: AuditAction.BOOKING_CREATED,
  entityType: 'Appointment',
  entityId: 'appt-uuid-1',
  actorId: 'cit-uuid-1',
  actorType: 'citizen',
  metadata: { centerId: 'ctr-1' },
};

describe('AuditPublisher', () => {
  it('publie un événement à champs RACINE sur nina.events / appointment.<action>', async () => {
    const { publisher, captured, channel } = build();
    publisher.onModuleInit();
    const ok = await publisher.publish(event);

    expect(ok).toBe(true);
    expect(channel.publish).toHaveBeenCalledTimes(1);
    const [msg] = captured;
    expect(msg.exchange).toBe('nina.events');
    expect(msg.routingKey).toBe('appointment.booking.created');
    // Champs d'audit à la RACINE (le normalizer les lit sur `b.*`, pas sous payload).
    expect(msg.body).toMatchObject({
      eventType: 'appointment.booking.created',
      action: 'booking.created',
      entityType: 'Appointment',
      entityId: 'appt-uuid-1',
      actorType: 'citizen',
      actorId: 'cit-uuid-1',
      source: 'appointment-service',
    });
    expect(msg.body.payload).toEqual({ centerId: 'ctr-1' });
    // En-têtes d'origine : émetteur résolvable par audit-service (`appId`).
    expect(msg.options.appId).toBe('appointment-service');
    expect((msg.options.headers as Record<string, unknown>)['x-nina-source']).toBe(
      'appointment-service',
    );
  });

  it('best-effort : renvoie false et ne jette pas si le broker échoue', async () => {
    const { publisher } = build({ failPublish: true });
    publisher.onModuleInit();
    await expect(publisher.publish(event)).resolves.toBe(false);
  });

  it('désactivé (APPOINTMENT_AUDIT_ENABLED=false) : aucun canal, publish=false', async () => {
    const { publisher, channel } = build({ enabled: false });
    publisher.onModuleInit();
    expect(await publisher.publish(event)).toBe(false);
    expect(channel.publish).not.toHaveBeenCalled();
  });

  it('connexion RabbitMQ désactivée : aucun canal, publish=false', async () => {
    const { publisher, channel } = build({ connEnabled: false });
    publisher.onModuleInit();
    expect(await publisher.publish(event)).toBe(false);
    expect(channel.publish).not.toHaveBeenCalled();
  });
});

/**
 * @file        audit.module.ts
 * @description Module global d'audit : expose `AuditPublisher` (publication des
 *              opérations biométriques vers audit-service via RabbitMQ + trace
 *              durable `BiometricAccessLog`). Global pour être injectable dans
 *              tous les modules métier sans réimport.
 * @author      Étudiant UQAR
 * @date        2026
 * @module      biometric-service/audit
 */
import { Global, Module } from '@nestjs/common';
import { RabbitConnection } from './rabbit.connection.js';
import { AuditPublisher } from './audit.publisher.js';

@Global()
@Module({
  providers: [RabbitConnection, AuditPublisher],
  exports: [AuditPublisher],
})
export class AuditModule {}

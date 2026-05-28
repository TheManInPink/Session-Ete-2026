/**
 * @file        identity-client.module.ts
 * @description Module global ré-exportant {@link IdentityClient} pour les
 *              autres modules métier (FdiService notamment).
 * @module      document-service/identity-client
 */
import { Global, Module } from '@nestjs/common';
import { IdentityClient } from './identity.client';

@Global()
@Module({
  providers: [IdentityClient],
  exports: [IdentityClient],
})
export class IdentityClientModule {}

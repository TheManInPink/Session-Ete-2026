/**
 * @file        storage.module.ts
 * @description Module global ré-exportant {@link MinioService}.
 * @module      document-service/storage
 */
import { Global, Module } from '@nestjs/common';
import { MinioService } from './minio.service';

@Global()
@Module({
  providers: [MinioService],
  exports: [MinioService],
})
export class StorageModule {}

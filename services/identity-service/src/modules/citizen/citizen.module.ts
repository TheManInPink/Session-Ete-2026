import { Module } from '@nestjs/common';
import { CitizenController } from './citizen.controller';
import { CitizenService } from './citizen.service';

@Module({
  controllers: [CitizenController],
  providers: [CitizenService],
  exports: [CitizenService],
})
export class CitizenModule {}

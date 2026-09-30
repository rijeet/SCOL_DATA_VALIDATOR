import { Module } from '@nestjs/common';
import { HealthJobServicesModule } from './health/HealthJobServicesModule.module';
import { AuthJobServicesModule } from './auth/AuthJobServicesModule.module';

@Module({
  imports: [HealthJobServicesModule, AuthJobServicesModule],
  exports: [HealthJobServicesModule, AuthJobServicesModule],
})
export class JobServicesModule {}

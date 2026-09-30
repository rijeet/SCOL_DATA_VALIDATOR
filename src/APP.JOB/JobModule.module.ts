import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { JobServicesModule } from '@bll/job-services/JobServicesModule.module';
import { CronJobRegistrar } from './core/CronJobRegistrar';
import { DatabasePingJob } from './cron-jobs/health/DatabasePingJob';
import { UserSessionCleanupJob } from './cron-jobs/auth/UserSessionCleanupJob';
import { AccountLockoutMaintenanceJob } from './cron-jobs/auth/AccountLockoutMaintenanceJob';
import type { ICronJob } from '@shared/interfaces/jobs/ICronJob.interface';
import { ICronJobs as ICronJobsToken } from '@shared/tokens/injection.tokens';

@Module({
  imports: [ScheduleModule.forRoot(), JobServicesModule],
  providers: [
    DatabasePingJob,
    UserSessionCleanupJob,
    AccountLockoutMaintenanceJob,
    {
      provide: ICronJobsToken,
      useFactory: (...jobs: ICronJob[]) => jobs,
      inject: [
        DatabasePingJob,
        UserSessionCleanupJob,
        AccountLockoutMaintenanceJob,
      ],
    },
    CronJobRegistrar,
  ],
})
export class JobModule {}

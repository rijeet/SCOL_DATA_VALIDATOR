import { Module, NestModule, MiddlewareConsumer } from '@nestjs/common';

// Common modules
import { GuardsModule } from './common/guards/GuardsModule.module';
import { HttpExceptionFilter } from './common/filters/HttpExceptionFilter.filter';
import { RequestLoggingMiddleware } from './common/middleware/RequestLoggingMiddleware';

// Feature modules
import { AuthModule } from './feature-controllers/auth/AuthModule.module';
import { DataEntryModule } from './feature-controllers/data-entry/DataEntryModule.module';

// Standalone controllers
import { HealthController } from './feature-controllers/health/HealthController.controller';

// BLL modules for controller dependencies
import { HealthCheckModule } from '@bll/services/health/HealthCheckModule.module';

/**
 * API Module — data-admin backend (auth + health only after Phase 1 prune).
 */
@Module({
  imports: [
    GuardsModule,
    AuthModule,
    DataEntryModule,
    HealthCheckModule,
  ],
  controllers: [HealthController],
  providers: [HttpExceptionFilter, RequestLoggingMiddleware],
})
export class ApiModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestLoggingMiddleware).forRoutes('*');
  }
}

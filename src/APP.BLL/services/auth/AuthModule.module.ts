import { Module } from '@nestjs/common';
import { AuthService } from './AuthService';
import { AuthValidationService } from './AuthValidationService';
import { TokenService } from './TokenService';
import { SessionService } from './SessionService';
import { LoginService } from './LoginService';
import { MappingModule } from '@bll/mappings/MappingModule.module';
import { RateLimitingModule } from '@infra/redis/rate-limiting/RateLimitingModule.module';

@Module({
  imports: [MappingModule, RateLimitingModule],
  providers: [
    AuthService,
    AuthValidationService,
    TokenService,
    SessionService,
    LoginService,
  ],
  exports: [AuthService, SessionService],
})
export class AuthModule {}

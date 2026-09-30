import { Injectable, Inject } from '@nestjs/common';
import { LoginService } from './LoginService';
import { SessionService } from './SessionService';
import { LoginRequestDto } from '@shared/dtos/auth/LoginRequestDto';
import { AuthResponseDto } from '@shared/dtos/auth/AuthResponseDto';
import { TokenRefreshResponseDto } from '@shared/dtos/auth/TokenRefreshResponseDto';
import { UserContextAccessor } from '@shared/context/UserContextAccessor';
import { ILogger } from '@shared/interfaces/logging';
import { ILogger as ILoggerToken } from '@shared/tokens/injection.tokens';

@Injectable()
export class AuthService {
  constructor(
    private readonly loginService: LoginService,
    private readonly sessionService: SessionService,
    @Inject(ILoggerToken) private readonly logger: ILogger,
  ) {}

  login(
    dto: LoginRequestDto,
    ip?: string,
    userAgent?: string,
  ): Promise<AuthResponseDto> {
    return this.loginService.login(dto, ip, userAgent);
  }

  refreshAccessToken(
    refreshToken: string,
    ip?: string,
  ): Promise<TokenRefreshResponseDto> {
    this.logger.LogInfo('Token refresh requested', {
      context: 'AuthService.refreshAccessToken',
      ip,
      action: 'REFRESH_TOKEN_START',
    });
    return this.sessionService.refreshAccessToken(refreshToken);
  }

  async logout(ip?: string, userAgent?: string): Promise<void> {
    const user = UserContextAccessor.userContext;
    this.logger.LogInfo('Logout requested', {
      context: 'AuthService.logout',
      userId: user.userId,
      sessionId: user.sessionId,
      ip,
      userAgent,
      action: 'LOGOUT_START',
    });
    await this.sessionService.logoutCurrentSession(user.sessionId, user.userId);
    this.logger.LogInfo('Logout successful', {
      context: 'AuthService.logout',
      userId: user.userId,
      action: 'LOGOUT_SUCCESS',
    });
  }

  logoutAll(userId: string): Promise<void> {
    return this.sessionService.logoutAll(userId);
  }
}

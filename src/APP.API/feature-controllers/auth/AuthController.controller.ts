import {
  Body,
  Controller,
  Post,
  Get,
  UseGuards,
  Headers,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import type { Response } from 'express';

import { ApiExtraModels, ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AddSwaggerDoc } from '@api/common/swagger/add-swagger-doc.decorator';
import './swagger.doc';

import { JwtAuthGuard } from '@api/common/guards/JwtAuthGuard.guard';
import { RateLimitGuard } from '@api/common/guards/RateLimitGuard.guard';

import { RateLimit } from '@api/common/decorators/RateLimit.decorator';
import {
  ReqInfo,
  ReqInfoPayload,
} from '@api/common/decorators/ReqInfo.decorator';

import { AuthService } from '@bll/services/auth/AuthService';

import { LoginRequestDto } from '@shared/dtos/auth/LoginRequestDto';

import { AuthResponseDto } from '@shared/dtos/auth/AuthResponseDto';
import { AuthResponseUserDto } from '@shared/dtos/auth/AuthResponseUserDto';
import { TokenRefreshResponseDto } from '@shared/dtos/auth/TokenRefreshResponseDto';

import { SuccessResponseDto } from '@shared/dtos/common/SuccessResponseDto';
import { ErrorResponseDto } from '@shared/dtos/common/ErrorResponseDto';

@ApiTags('auth')
@ApiExtraModels(
  LoginRequestDto,
  AuthResponseDto,
  AuthResponseUserDto,
  TokenRefreshResponseDto,
  SuccessResponseDto,
  ErrorResponseDto,
)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 10, windowSeconds: 900 })
  @AddSwaggerDoc('auth', 'login')
  async login(
    @Body() dto: LoginRequestDto,
    @ReqInfo() reqInfo: ReqInfoPayload,
  ): Promise<AuthResponseDto> {
    return await this.authService.login(dto, reqInfo.ip, reqInfo.userAgent);
  }

  @Get('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowSeconds: 300 })
  @ApiBearerAuth('JWT-auth')
  @AddSwaggerDoc('auth', 'refresh')
  async refreshGet(
    @Headers('authorization') authHeader: string | undefined,
    @ReqInfo() reqInfo: ReqInfoPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenRefreshResponseDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.refreshToken(authHeader, reqInfo);
  }

  @Post('refresh')
  @UseGuards(RateLimitGuard)
  @RateLimit({ limit: 20, windowSeconds: 300 })
  @ApiBearerAuth('JWT-auth')
  async refreshPost(
    @Headers('authorization') authHeader: string | undefined,
    @ReqInfo() reqInfo: ReqInfoPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<TokenRefreshResponseDto> {
    res.setHeader('Cache-Control', 'no-store');
    return this.refreshToken(authHeader, reqInfo);
  }

  private async refreshToken(
    authHeader: string | undefined,
    reqInfo: ReqInfoPayload,
  ): Promise<TokenRefreshResponseDto> {
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('Refresh token is required');
    }
    const refreshToken = authHeader.substring(7);
    return await this.authService.refreshAccessToken(refreshToken, reqInfo.ip);
  }

  @Get('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  @AddSwaggerDoc('auth', 'logout')
  async logoutGet(
    @ReqInfo() reqInfo: ReqInfoPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    res.setHeader('Cache-Control', 'no-store');
    return this.logout(reqInfo);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth')
  async logoutPost(
    @ReqInfo() reqInfo: ReqInfoPayload,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ message: string }> {
    res.setHeader('Cache-Control', 'no-store');
    return this.logout(reqInfo);
  }

  private async logout(
    reqInfo: ReqInfoPayload,
  ): Promise<{ message: string }> {
    await this.authService.logout(reqInfo.ip, reqInfo.userAgent);
    return { message: 'Logged out successfully' };
  }
}

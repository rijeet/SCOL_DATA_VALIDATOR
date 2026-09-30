import { Module } from '@nestjs/common';
import { AuthController } from './AuthController.controller';
import { AuthModule as AuthBllModule } from '@bll/services/auth/AuthModule.module';

@Module({
  imports: [AuthBllModule],
  controllers: [AuthController],
})
export class AuthModule {}

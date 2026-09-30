import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { IPasswordHasher } from '@shared/interfaces/security';
import { IPasswordHasher as IPasswordHasherToken } from '@shared/tokens/injection.tokens';
import { ILogger } from '@shared/tokens/injection.tokens';
import type { ILogger as ILoggerInterface } from '@shared/interfaces/logging';
import { Role } from '@shared/enums/Role.enum';
import { AccountStatus } from '@shared/enums/AccountStatus.enum';
import { UserType } from '@shared/enums/UserType.enum';

function requireAdminSeedConfig(config: ConfigService): {
  email: string;
  password: string;
  phone: string;
} {
  const email = config.get<string>('ADMIN_EMAIL');
  const password = config.get<string>('ADMIN_PASSWORD');
  const phone = config.get<string>('ADMIN_PHONE');

  if (!email?.trim() || !password?.trim() || !phone?.trim()) {
    throw new Error(
      'Set ADMIN_EMAIL, ADMIN_PASSWORD, and ADMIN_PHONE in .env before running seed:admin',
    );
  }

  return { email: email.trim(), password: password.trim(), phone: phone.trim() };
}

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);

  const db = app.get(AppDbContext);
  const hasher = app.get<IPasswordHasher>(IPasswordHasherToken);
  const logger = app.get<ILoggerInterface>(ILogger);
  const config = app.get(ConfigService);
  const { email, password, phone } = requireAdminSeedConfig(config);

  const roleRepo = db.roles;
  const userRepo = db.users;

  let adminRole = await roleRepo.findOne({
    where: { name: Role.ADMIN },
  });

  if (!adminRole) {
    adminRole = roleRepo.create({ name: Role.ADMIN });
    await roleRepo.save(adminRole);
    console.log('ADMIN role created');
  }

  let adminUser = await userRepo.findOne({
    where: { email },
    relations: { roles: true },
  });

  if (!adminUser) {
    adminUser = userRepo.create({
      email,
      phone,
      passwordHash: await hasher.hash(password),
      accountStatus: AccountStatus.Active,
      userType: UserType.Admin,
      isPhoneVerified: true,
      failedLoginAttempts: 0,
      roles: [adminRole],
    });

    await userRepo.save(adminUser);
    logger.LogInfo('Admin user created', { context: 'seed:admin', email });
  } else {
    logger.LogWarning('Admin already exists', { context: 'seed:admin', email });
  }

  await app.close();
}

bootstrap();

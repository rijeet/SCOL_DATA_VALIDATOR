import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { ILogger } from '@shared/tokens/injection.tokens';
import type { ILogger as ILoggerInterface } from '@shared/interfaces/logging';

/** Destination countries shown on the Destinations home page. */
export const DESTINATION_COUNTRIES: Array<{
  countryName: string;
  countryCode: string;
}> = [
  { countryName: 'United Kingdom', countryCode: 'GB' },
  { countryName: 'Australia', countryCode: 'AU' },
  { countryName: 'Germany', countryCode: 'DE' },
  { countryName: 'New Zealand', countryCode: 'NZ' },
];

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(AppDbContext);
  const logger = app.get<ILoggerInterface>(ILogger);
  const repo = db.Set(SysCountries);

  let created = 0;
  let existing = 0;

  for (const row of DESTINATION_COUNTRIES) {
    const found = await repo
      .createQueryBuilder('c')
      .where('c.deletedAt IS NULL')
      .andWhere(
        '(c.countryCode = :code OR lower(trim(c.countryName)) = lower(trim(:name)))',
        { code: row.countryCode, name: row.countryName },
      )
      .getOne();

    if (found) {
      existing += 1;
      continue;
    }

    await repo.save(repo.create(row));
    created += 1;
  }

  logger.LogInfo('Destination countries seeded', {
    context: 'seed:destinations',
    created,
    existing,
  });
  console.log(
    `Destinations: ${created} created, ${existing} already present (${DESTINATION_COUNTRIES.map((c) => c.countryName).join(', ')})`,
  );

  await app.close();
}

bootstrap();

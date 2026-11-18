import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { ILogger } from '@shared/tokens/injection.tokens';
import type { ILogger as ILoggerInterface } from '@shared/interfaces/logging';
import { DEGREE_SEEDS } from '@shared/constants/degreeSeeds.constants';

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(AppDbContext);
  const logger = app.get<ILoggerInterface>(ILogger);
  const repo = db.Set(SysAcademicDegrees);

  for (const seed of DEGREE_SEEDS) {
    const existing = await repo
      .createQueryBuilder('d')
      .where('d.deletedAt IS NULL')
      .andWhere('lower(trim(d.degreeName)) = lower(trim(:name))', {
        name: seed.degreeName,
      })
      .getOne();

    if (!existing) {
      await repo.save(repo.create(seed));
      logger.LogInfo(
        `Degree created (${seed.degreeName}, level ${seed.levelOrder})`,
        { context: 'seed:degrees' },
      );
      continue;
    }

    existing.degreeName = seed.degreeName;
    existing.levelOrder = seed.levelOrder;
    existing.gpaScale = seed.gpaScale;
    await repo.save(existing);
    logger.LogInfo(
      `Degree updated (${seed.degreeName}, level ${seed.levelOrder})`,
      { context: 'seed:degrees' },
    );
  }

  await repo
    .createQueryBuilder()
    .update(SysAcademicDegrees)
    .set({ levelOrder: null })
    .where('"deletedAt" IS NULL')
    .andWhere(`lower(trim("degreeName")) NOT IN ('ssc', 'hsc', 'bsc', 'msc')`)
    .execute();

  logger.LogInfo('Awarded degrees now have null levelOrder', {
    context: 'seed:degrees',
  });

  await app.close();
}

bootstrap();

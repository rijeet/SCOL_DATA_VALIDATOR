import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { ILogger } from '@shared/tokens/injection.tokens';
import type { ILogger as ILoggerInterface } from '@shared/interfaces/logging';

const ENGLISH_TEST_SEEDS = [
  { testName: 'IELTS', maxScore: '9.00' },
  { testName: 'PTE', maxScore: '90.00' },
  { testName: 'TOEFL', maxScore: '120.00' },
] as const;

async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(AppDbContext);
  const logger = app.get<ILoggerInterface>(ILogger);
  const testRepo = db.englishTests;

  for (const seed of ENGLISH_TEST_SEEDS) {
    const existing = await testRepo.findOne({
      where: { testName: seed.testName },
    });

    if (!existing) {
      await testRepo.save(testRepo.create(seed));
      logger.LogInfo(
        `English test created (${seed.testName}, max ${seed.maxScore})`,
        { context: 'seed:english-tests' },
      );
      continue;
    }

    await testRepo.update(existing.id, {
      maxScore: seed.maxScore,
      levelOrder: () => 'NULL',
    });
    logger.LogInfo(
      `English test updated (${seed.testName}, max ${seed.maxScore})`,
      { context: 'seed:english-tests' },
    );
  }

  await app.close();
}

bootstrap();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { SysAmountTypes } from '@entity/entities/SysAmountTypes.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { CourseIntakeScholarships } from '@entity/entities/CourseIntakeScholarships.entity';
import { ILogger } from '@shared/tokens/injection.tokens';
import type { ILogger as ILoggerInterface } from '@shared/interfaces/logging';
import { CommissionType } from '@shared/enums/CommissionType.enum';
import { AMOUNT_TYPES } from '@shared/constants/amountTypes.constants';

const AMOUNT_SQL = `upper(trim("COL")) IN ('AMOUNT', 'AMT')`;
const PERCENT_SQL = `upper(trim("COL")) IN ('PERCENTAGE', 'PERCENT', '%')`;

/**
 * Point DATABASE_URL at the target DB, then:
 *   npm run seed:amount-types
 *
 * 1. Upserts Amount / Percentage in sys_AmountTypes
 * 2. Sets sys_Universities.commissionType to AMOUNT | PERCENTAGE
 * 3. Sets CourseIntakeScholarships.amountType to AMOUNT | PERCENTAGE
 */
async function bootstrap() {
  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(AppDbContext);
  const logger = app.get<ILoggerInterface>(ILogger);
  const context = 'seed:amount-types';
  const types = db.Set(SysAmountTypes);

  for (const seed of AMOUNT_TYPES) {
    const existing = await types
      .createQueryBuilder('t')
      .where('t.deletedAt IS NULL')
      .andWhere(
        '(lower(trim(t.typeName)) = lower(trim(:name)) OR lower(trim(t.typeCode)) = lower(trim(:code)))',
        { name: seed.typeName, code: seed.typeCode },
      )
      .getOne();

    if (!existing) {
      await types.save(types.create(seed));
      logger.LogInfo(
        `Amount type created (${seed.typeName} / ${seed.typeCode})`,
        { context },
      );
      continue;
    }

    existing.typeName = seed.typeName;
    existing.typeCode = seed.typeCode;
    existing.displayOrder = seed.displayOrder;
    await types.save(existing);
    logger.LogInfo(
      `Amount type updated (${seed.typeName} / ${seed.typeCode})`,
      { context },
    );
  }

  const unis = db.Set(SysUniversities);
  const uniAmount = await unis
    .createQueryBuilder()
    .update()
    .set({ commissionType: CommissionType.AMOUNT })
    .where('"deletedAt" IS NULL')
    .andWhere(AMOUNT_SQL.replace('COL', 'commissionType'))
    .andWhere(`"commissionType" IS DISTINCT FROM :code`, {
      code: CommissionType.AMOUNT,
    })
    .execute();
  const uniPercent = await unis
    .createQueryBuilder()
    .update()
    .set({ commissionType: CommissionType.PERCENTAGE })
    .where('"deletedAt" IS NULL')
    .andWhere(PERCENT_SQL.replace('COL', 'commissionType'))
    .andWhere(`"commissionType" IS DISTINCT FROM :code`, {
      code: CommissionType.PERCENTAGE,
    })
    .execute();

  const scholarships = db.Set(CourseIntakeScholarships);
  const schAmount = await scholarships
    .createQueryBuilder()
    .update()
    .set({ amountType: CommissionType.AMOUNT })
    .where('"deletedAt" IS NULL')
    .andWhere(AMOUNT_SQL.replace('COL', 'amountType'))
    .andWhere(`"amountType" IS DISTINCT FROM :code`, {
      code: CommissionType.AMOUNT,
    })
    .execute();
  const schPercent = await scholarships
    .createQueryBuilder()
    .update()
    .set({ amountType: CommissionType.PERCENTAGE })
    .where('"deletedAt" IS NULL')
    .andWhere(PERCENT_SQL.replace('COL', 'amountType'))
    .andWhere(`"amountType" IS DISTINCT FROM :code`, {
      code: CommissionType.PERCENTAGE,
    })
    .execute();

  logger.LogInfo('Catalog types canonicalized to AMOUNT / PERCENTAGE', {
    context,
    universitiesAmount: uniAmount.affected ?? 0,
    universitiesPercentage: uniPercent.affected ?? 0,
    scholarshipsAmount: schAmount.affected ?? 0,
    scholarshipsPercentage: schPercent.affected ?? 0,
  });
  console.log(
    `sys_Universities.commissionType: ${uniAmount.affected ?? 0} → AMOUNT, ${uniPercent.affected ?? 0} → PERCENTAGE`,
  );
  console.log(
    `CourseIntakeScholarships.amountType: ${schAmount.affected ?? 0} → AMOUNT, ${schPercent.affected ?? 0} → PERCENTAGE`,
  );

  await app.close();
}

bootstrap();

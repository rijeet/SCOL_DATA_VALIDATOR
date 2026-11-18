import { NestFactory } from '@nestjs/core';
import { AppModule } from '../AppModule.module';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniCourseIntakes } from '@entity/entities/UniCourseIntakes.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { parseIntakeInfoList } from '../APP.BLL/services/data-entry/course/parsers/courseIntakeInfoParser';
import { DataEntryCatalogLookup } from '../APP.BLL/services/data-entry/staging/DataEntryCatalogLookup';
import { publishStagingRowToCatalog } from '../APP.BLL/services/data-entry/staging/publishStagingRowToCatalog';
import type { EntityManager } from 'typeorm';

const DEFAULT_BATCH_ID = 'd2808c8c-69dd-4499-afcc-96bc2be58a06';

function arg(name: string, fallback?: string): string | undefined {
  const prefix = `--${name}=`;
  const hit = process.argv.find((a) => a.startsWith(prefix));
  if (hit) return hit.slice(prefix.length);
  const idx = process.argv.indexOf(`--${name}`);
  if (idx >= 0) return process.argv[idx + 1];
  return fallback;
}

async function resolveUniId(
  manager: EntityManager,
  batch: DataEntryBatches,
  fields: Record<string, string>,
): Promise<string | null> {
  const uniName = (fields.uniName ?? '').trim();
  if (uniName) {
    const uni = await manager
      .createQueryBuilder(SysUniversities, 'u')
      .where('lower(trim(u.uniName)) = :n', { n: uniName.toLowerCase() })
      .andWhere('u.deletedAt IS NULL')
      .getOne();
    if (uni) return uni.id;
  }
  if (batch.sysUniversityId) return batch.sysUniversityId;
  const byKey = await manager.findOne(SysUniversities, {
    where: { uniName: batch.universityKey },
  });
  return byKey?.id ?? null;
}

async function findDegreeId(
  manager: EntityManager,
  name: string,
): Promise<string | null> {
  const key = name.trim();
  if (!key) return null;
  const existing = await manager
    .createQueryBuilder(SysAcademicDegrees, 'd')
    .where('lower(trim(d.degreeName)) = :n', { n: key.toLowerCase() })
    .andWhere('d.deletedAt IS NULL')
    .getOne();
  return existing?.id ?? null;
}

async function findCatalogCourse(
  manager: EntityManager,
  uniId: string,
  courseName: string,
  degreeId: string | null,
): Promise<UniCourses | null> {
  const byName = manager
    .createQueryBuilder(UniCourses, 'c')
    .where('c.uniId = :uniId', { uniId })
    .andWhere('lower(trim(c.courseName)) = :name', {
      name: courseName.toLowerCase(),
    })
    .andWhere('c.deletedAt IS NULL');
  if (degreeId) {
    const withDegree = await byName
      .clone()
      .andWhere('c.sysDegreeId = :degreeId', { degreeId })
      .getOne();
    if (withDegree) return withDegree;
  }
  const matches = await byName.getMany();
  return matches.length === 1 ? matches[0] : null;
}

async function reloadRowIntakes(
  manager: EntityManager,
  lookup: DataEntryCatalogLookup,
  batch: DataEntryBatches,
  row: DataEntryCourseRows,
): Promise<{
  created: number;
  restored: number;
  removed: number;
  publishedCourse: boolean;
}> {
  const fields = { ...(row.fields ?? {}) };
  const courseName = (fields.courseName ?? '').trim();
  const intakes = parseIntakeInfoList(fields.intakeInfo ?? '');
  if (!courseName || intakes.length === 0) {
    throw new Error(
      `Row ${row.rowIndex}: missing courseName or unparsable intakeInfo "${fields.intakeInfo ?? ''}"`,
    );
  }
  const uniId = await resolveUniId(manager, batch, fields);
  if (!uniId) {
    throw new Error(`Row ${row.rowIndex}: university not found`);
  }
  const degreeId = await findDegreeId(manager, fields.degreeName ?? '');
  let course = await findCatalogCourse(manager, uniId, courseName, degreeId);
  let publishedCourse = false;
  if (!course) {
    if (!(fields.programmeName ?? '').trim()) {
      fields.programmeName = courseName;
    }
    await publishStagingRowToCatalog(manager, lookup, uniId, fields);
    publishedCourse = true;
    course = await findCatalogCourse(
      manager,
      uniId,
      courseName,
      (await findDegreeId(manager, fields.degreeName ?? '')) ?? degreeId,
    );
    if (!course) {
      throw new Error(
        `Row ${row.rowIndex}: catalog course still missing after publish (${courseName} / ${fields.degreeName})`,
      );
    }
    return { created: intakes.length, restored: 0, removed: 0, publishedCourse };
  }

  const sibling = await manager.findOne(UniCourseIntakes, {
    where: { uniCourseId: course.id, isActive: true },
  });

  const keptIds: string[] = [];
  let created = 0;
  let restored = 0;
  for (const intake of intakes) {
    const existing = await manager
      .createQueryBuilder(UniCourseIntakes, 'i')
      .withDeleted()
      .where('i.uniCourseId = :cid', { cid: course.id })
      .andWhere('i.intakeYear = :year', { year: intake.year })
      .andWhere('i.intakeMonth = :month', { month: intake.month })
      .getOne();
    if (existing) {
      const wasDeleted = Boolean(existing.deletedAt);
      existing.deletedAt = null;
      existing.isActive = true;
      existing.intakeYear = intake.year;
      existing.intakeMonth = intake.month;
      await manager.save(UniCourseIntakes, existing);
      if (wasDeleted) restored += 1;
      keptIds.push(existing.id);
    } else {
      const createdRow = await manager.save(
        UniCourseIntakes,
        manager.create(UniCourseIntakes, {
          uniCourseId: course.id,
          intakeYear: intake.year,
          intakeMonth: intake.month,
          courseDuration: sibling?.courseDuration,
          applicationDeadline: sibling?.applicationDeadline,
          tuitionFee: sibling?.tuitionFee,
          currency: sibling?.currency,
          initialDeposit: sibling?.initialDeposit,
          applicationFee: sibling?.applicationFee,
          isActive: true,
        }),
      );
      created += 1;
      keptIds.push(createdRow.id);
    }
  }

  const extras = await manager
    .createQueryBuilder(UniCourseIntakes, 'i')
    .where('i.uniCourseId = :cid', { cid: course.id })
    .andWhere('i.deletedAt IS NULL')
    .andWhere('i.id NOT IN (:...ids)', { ids: keptIds })
    .getMany();
  for (const extra of extras) {
    await manager.softDelete(UniCourseIntakes, extra.id);
  }

  return { created, restored, removed: extras.length, publishedCourse };
}

async function bootstrap() {
  const batchId = arg('batchId', DEFAULT_BATCH_ID)!;
  const rowRaw = arg('row');
  const rowIndex = rowRaw != null && rowRaw !== '' ? Number(rowRaw) : null;
  if (rowIndex != null && !Number.isFinite(rowIndex)) {
    throw new Error(`Invalid --row ${rowRaw}`);
  }

  const app = await NestFactory.createApplicationContext(AppModule);
  const db = app.get(AppDbContext);

  const batch = await db.Set(DataEntryBatches).findOne({
    where: { id: batchId },
  });
  if (!batch) {
    throw new Error(`Batch not found: ${batchId}`);
  }
  if (batch.batchType !== DataEntryBatchType.COURSE) {
    throw new Error(`Batch ${batchId} is ${batch.batchType}, expected COURSE`);
  }

  const rows = await db.Set(DataEntryCourseRows).find({
    where:
      rowIndex == null
        ? { batchId }
        : { batchId, rowIndex },
    order: { rowIndex: 'ASC' },
  });
  if (rows.length === 0) {
    throw new Error(
      rowIndex == null
        ? `No course rows in batch ${batchId}`
        : `Row ${rowIndex} not found in batch ${batchId}`,
    );
  }

  let ok = 0;
  let failed = 0;
  for (const row of rows) {
    try {
      const stats = await db.transaction(async (manager) => {
        const lookup = new DataEntryCatalogLookup(manager);
        return reloadRowIntakes(manager, lookup, batch, row);
      });
      ok += 1;
      const createdNote = stats.publishedCourse ? ', published missing course' : '';
      console.log(
        `row ${row.rowIndex} ${row.fields.courseName}: ${row.fields.intakeInfo} → created ${stats.created}, restored ${stats.restored}, removed ${stats.removed}${createdNote}`,
      );
    } catch (err) {
      failed += 1;
      console.error(
        `row ${row.rowIndex} skipped: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  console.log(
    `Reloaded catalog intakes from RowEditor staging. ok=${ok} failed=${failed} batch=${batchId}`,
  );
  await app.close();
  if (failed > 0 && ok === 0) process.exit(1);
}

void bootstrap();

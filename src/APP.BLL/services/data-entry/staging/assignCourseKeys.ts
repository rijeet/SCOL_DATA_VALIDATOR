import type { EntityManager } from 'typeorm';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { UniCourses } from '@entity/entities/UniCourses.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import {
  allocateCourseKey,
  courseKeyBase,
} from '@shared/constants/courseKey.constants';

function nameDegreeKey(courseName: string, degreeName: string): string {
  return `${courseName.trim().toLowerCase()}|${degreeName.trim().toLowerCase()}`;
}

async function resolveUni(
  manager: EntityManager,
  batch: DataEntryBatches,
): Promise<{ id: string | null; name: string }> {
  if (batch.sysUniversityId) {
    const uni = await manager.findOne(SysUniversities, {
      where: { id: batch.sysUniversityId },
    });
    if (uni) return { id: uni.id, name: uni.uniName };
  }
  const key = (batch.universityKey ?? '').trim();
  if (!key) return { id: null, name: '' };
  const uni = await manager
    .createQueryBuilder(SysUniversities, 'u')
    .where('lower(trim(u.uniName)) = :n', { n: key.toLowerCase() })
    .andWhere('u.deletedAt IS NULL')
    .getOne();
  return { id: uni?.id ?? null, name: uni?.uniName ?? key };
}

/**
 * Assigns a stable courseKey on every staging row that lacks one, and backfills
 * UniCourses.courseKey for the same university when it is still empty.
 */
export async function ensureCourseKeys(
  manager: EntityManager,
  batch: DataEntryBatches,
): Promise<void> {
  if (batch.batchType === DataEntryBatchType.UNIVERSITY) return;

  const rows = await manager.find(DataEntryCourseRows, {
    where: { batchId: batch.id },
    order: { rowIndex: 'ASC' },
  });
  if (rows.length === 0) return;

  const uni = await resolveUni(manager, batch);
  const used = new Set<string>();
  let catalog: UniCourses[] = [];
  const degreeNameById = new Map<string, string>();

  if (uni.id) {
    catalog = await manager
      .createQueryBuilder(UniCourses, 'c')
      .where('c.uniId = :uniId', { uniId: uni.id })
      .andWhere('c.deletedAt IS NULL')
      .getMany();
    const degrees = await manager.find(SysAcademicDegrees, {
      select: ['id', 'degreeName'],
    });
    for (const d of degrees) {
      degreeNameById.set(d.id, d.degreeName);
    }
    for (const c of catalog) {
      const k = (c.courseKey ?? '').trim().toLowerCase();
      if (k) used.add(k);
    }
  }

  const stagingByIdentity = new Map<string, DataEntryCourseRows[]>();
  for (const row of rows) {
    const k = (row.fields.courseKey ?? '').trim().toLowerCase();
    if (k) used.add(k);
    const idKey = nameDegreeKey(
      row.fields.courseName ?? '',
      row.fields.degreeName ?? '',
    );
    const list = stagingByIdentity.get(idKey) ?? [];
    list.push(row);
    stagingByIdentity.set(idKey, list);
  }

  const catalogByIdentity = new Map<string, UniCourses[]>();
  for (const c of catalog) {
    const idKey = nameDegreeKey(
      c.courseName,
      degreeNameById.get(c.sysDegreeId) ?? '',
    );
    const list = catalogByIdentity.get(idKey) ?? [];
    list.push(c);
    catalogByIdentity.set(idKey, list);
  }

  const dirtyRows: DataEntryCourseRows[] = [];
  for (const row of rows) {
    const existing = (row.fields.courseKey ?? '').trim();
    if (existing) {
      const lower = existing.toLowerCase();
      if (lower !== existing) {
        row.fields = { ...row.fields, courseKey: lower };
        dirtyRows.push(row);
      }
      continue;
    }
    const idKey = nameDegreeKey(
      row.fields.courseName ?? '',
      row.fields.degreeName ?? '',
    );
    const stagingSiblings = stagingByIdentity.get(idKey) ?? [];
    const catalogSiblings = catalogByIdentity.get(idKey) ?? [];
    const uniqueCatalogKey =
      stagingSiblings.length === 1 &&
      catalogSiblings.length === 1 &&
      (catalogSiblings[0].courseKey ?? '').trim()
        ? catalogSiblings[0].courseKey!.trim().toLowerCase()
        : '';
    const key = uniqueCatalogKey
      ? uniqueCatalogKey
      : allocateCourseKey(
          courseKeyBase({
            uniName: (row.fields.uniName ?? '').trim() || uni.name,
            degreeName: row.fields.degreeName ?? '',
            courseName: row.fields.courseName ?? '',
            courseDuration: row.fields.courseDuration ?? '',
          }),
          used,
        );
    used.add(key);
    row.fields = { ...row.fields, courseKey: key };
    dirtyRows.push(row);
  }
  if (dirtyRows.length > 0) {
    await manager.save(DataEntryCourseRows, dirtyRows);
  }

  if (!uni.id) return;

  const stagingKeyByIdentity = new Map<string, string>();
  for (const row of rows) {
    const key = (row.fields.courseKey ?? '').trim();
    if (!key) continue;
    const idKey = nameDegreeKey(
      row.fields.courseName ?? '',
      row.fields.degreeName ?? '',
    );
    if (!stagingKeyByIdentity.has(idKey)) {
      stagingKeyByIdentity.set(idKey, key);
    } else {
      stagingKeyByIdentity.set(idKey, '');
    }
  }

  const dirtyCatalog: UniCourses[] = [];
  for (const c of catalog) {
    if ((c.courseKey ?? '').trim()) continue;
    const idKey = nameDegreeKey(
      c.courseName,
      degreeNameById.get(c.sysDegreeId) ?? '',
    );
    const fromStaging = stagingKeyByIdentity.get(idKey) ?? '';
    const key = fromStaging
      ? fromStaging
      : allocateCourseKey(
          courseKeyBase({
            uniName: uni.name,
            degreeName: degreeNameById.get(c.sysDegreeId) ?? '',
            courseName: c.courseName,
          }),
          used,
        );
    c.courseKey = key;
    dirtyCatalog.push(c);
  }
  if (dirtyCatalog.length > 0) {
    await manager.save(UniCourses, dirtyCatalog);
  }
}

import type { EntityManager } from 'typeorm';
import { UniAcademicReq } from '@entity/entities/UniAcademicReq.entity';
import { UniEngReq } from '@entity/entities/UniEngReq.entity';
import type { DataEntryCatalogLookup } from './DataEntryCatalogLookup';
import { parseOptionalDecimal } from '../course/parsers/courseCsvFieldParsers';

const ENGLISH_COLUMNS = [
  { test: 'IELTS', overall: 'ieltsMinOverall', section: 'ieltsMinSection' },
  { test: 'TOEFL', overall: 'toeflMinOverall', section: 'toeflMinSection' },
  { test: 'PTE', overall: 'pteMinOverall', section: 'pteMinSection' },
] as const;

function pickStricterDecimal(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return Number(a) >= Number(b) ? a : b;
}

/** University-wide academic / English defaults from staging rows. */
export async function publishUniversityLevelReqs(
  manager: EntityManager,
  lookup: DataEntryCatalogLookup,
  uniId: string,
  rowFields: Record<string, string>[],
): Promise<{ academic: number; english: number }> {
  await manager.delete(UniAcademicReq, { uniId });
  await manager.delete(UniEngReq, { uniId });

  const academicByDegree = new Map<
    string,
    { degreeId: string; minGpa?: string }
  >();
  const englishByTest = new Map<
    string,
    { testId: string; overall?: string; section?: string }
  >();

  for (const fields of rowFields) {
    const minDeg = (fields.minDegreeName ?? '').trim();
    const minGpa = parseOptionalDecimal(fields.minGpa ?? '');
    if (minDeg) {
      const degreeId = await lookup.degree(minDeg);
      const key = degreeId;
      const existing = academicByDegree.get(key);
      if (!existing) {
        academicByDegree.set(key, { degreeId, minGpa });
      } else if (minGpa) {
        existing.minGpa = pickStricterDecimal(existing.minGpa, minGpa);
      }
    }

    for (const col of ENGLISH_COLUMNS) {
      const overall = parseOptionalDecimal(fields[col.overall] ?? '');
      const section = parseOptionalDecimal(fields[col.section] ?? '');
      if (!overall && !section) continue;
      const testId = await lookup.englishTest(col.test);
      const existing = englishByTest.get(testId);
      if (!existing) {
        englishByTest.set(testId, { testId, overall, section });
      } else {
        existing.overall = pickStricterDecimal(existing.overall, overall);
        existing.section = pickStricterDecimal(existing.section, section);
      }
    }
  }

  let academic = 0;
  for (const { degreeId, minGpa } of academicByDegree.values()) {
    await manager.save(
      UniAcademicReq,
      manager.create(UniAcademicReq, {
        uniId,
        sysDegreeId: degreeId,
        minGpa,
      }),
    );
    academic += 1;
  }

  let english = 0;
  for (const { testId, overall, section } of englishByTest.values()) {
    await manager.save(
      UniEngReq,
      manager.create(UniEngReq, {
        uniId,
        sysEngTestId: testId,
        minOverallReq: overall,
        minSectionReq: section,
      }),
    );
    english += 1;
  }

  return { academic, english };
}

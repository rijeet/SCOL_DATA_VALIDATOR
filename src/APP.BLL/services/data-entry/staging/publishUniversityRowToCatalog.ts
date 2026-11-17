import type { EntityManager } from 'typeorm';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { CommissionType } from '@shared/enums/CommissionType.enum';
import { parseMetaDataItems } from '../common/engine/MetaDataParser';
import { parseOptionalDecimal } from '../course/parsers/courseCsvFieldParsers';
import type { DataEntryGeoLookup } from './DataEntryGeoLookup';

export type PublishUniversityStats = {
  inserted: boolean;
  universityId: string;
};

function parseQuotedUrlList(raw: string): string[] | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const matches = [...t.matchAll(/"([^"]+)"/g)].map((m) => m[1].trim());
  if (matches.length) return matches;
  return t
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function parseOptionalInt(raw: string): number | undefined {
  const t = raw.trim();
  if (!t) return undefined;
  const n = Number(t);
  return Number.isInteger(n) ? n : undefined;
}

export async function publishUniversityRowToCatalog(
  manager: EntityManager,
  geo: DataEntryGeoLookup,
  fields: Record<string, string>,
): Promise<PublishUniversityStats> {
  const uniName = (fields.uniName ?? '').trim();
  const countryId = await geo.country(fields.countryName ?? '');
  const stateId = await geo.state(countryId, fields.stateName ?? '');
  let cityId: string | undefined;
  if (stateId) {
    cityId = await geo.city(stateId, fields.cityName ?? '');
  } else if ((fields.cityName ?? '').trim()) {
    const fallbackStateId = await geo.state(countryId, 'Unknown');
    cityId = fallbackStateId
      ? await geo.city(fallbackStateId, fields.cityName ?? '')
      : undefined;
  }

  const commissionTypeRaw = (fields.commissionType ?? '').trim().toUpperCase();
  const commissionType =
    commissionTypeRaw === CommissionType.AMOUNT
      ? CommissionType.AMOUNT
      : commissionTypeRaw === CommissionType.PERCENTAGE
        ? CommissionType.PERCENTAGE
        : undefined;

  const payload: Partial<SysUniversities> = {
    uniName,
    sysCountryId: countryId,
    sysStateId: stateId,
    sysCityId: cityId,
    address: (fields.address ?? '').trim() || undefined,
    commissionType,
    commission: parseOptionalDecimal(fields.commission ?? ''),
    logoUrl: (fields.logoUrl ?? '').trim() || undefined,
    website: (fields.website ?? '').trim() || undefined,
    aboutUs: (fields.aboutUs ?? '').trim() || undefined,
    coverImageUrl: (fields.coverImageUrl ?? '').trim() || undefined,
    campusLifeLinks: parseQuotedUrlList(fields.campusLifeLinks ?? ''),
    rankingMetaData: parseMetaDataItems(fields.rankingMetaData ?? '') ?? undefined,
    locationMapMetaData: (fields.locationMapMetaData ?? '').trim() || undefined,
    establishedYear: parseOptionalInt(fields.establishedYear ?? ''),
    universityType: (fields.universityType ?? '').trim() || undefined,
    currRanking: parseOptionalInt(fields.currRanking ?? ''),
  };

  const existing = await geo.universityByName(uniName);
  if (existing) {
    Object.assign(existing, payload);
    await manager.save(SysUniversities, existing);
    geo.rememberUniversity(uniName, existing.id);
    return { inserted: false, universityId: existing.id };
  }

  const created = await manager.save(
    SysUniversities,
    manager.create(SysUniversities, payload),
  );
  geo.rememberUniversity(uniName, created.id);
  return { inserted: true, universityId: created.id };
}

export async function seedUniApplicationStages(
  manager: EntityManager,
  universityIds: string[],
): Promise<number> {
  if (universityIds.length === 0) return 0;
  const result = await manager.query(
    `INSERT INTO "UniApplicationStage" ("uniId","sysApplicationStageId","displayOrder","isEnabled")
     SELECT u.id, s.id,
            ROW_NUMBER() OVER (PARTITION BY u.id ORDER BY s."stageOrder" NULLS LAST, s."stageCode"),
            true
     FROM unnest($1::uuid[]) AS u(id)
     CROSS JOIN "sys_ApplicationStage" s
     WHERE s."deletedAt" IS NULL
     ON CONFLICT ("uniId", "sysApplicationStageId") DO NOTHING`,
    [universityIds],
  );
  return Array.isArray(result) ? result.length : 0;
}

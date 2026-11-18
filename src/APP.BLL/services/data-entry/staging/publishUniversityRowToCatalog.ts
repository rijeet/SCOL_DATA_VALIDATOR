import type { EntityManager } from 'typeorm';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';
import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';
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

  const payload: Partial<SysUniversities> = {
    uniName,
    sysCountryId: countryId,
    sysStateId: stateId,
    sysCityId: cityId,
    ...universityInfoFieldsFromStaging(fields),
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

/** Catalog column values for post-publish uni-info edits. Empty staging cells become NULL. */
export function universityCatalogInfoUpdate(
  fields: Record<string, string>,
): Record<string, string | number | string[] | object | null | undefined> {
  const patch = universityInfoFieldsFromStaging(fields);
  return {
    address: patch.address ?? null,
    commissionType: patch.commissionType ?? null,
    commission: patch.commission ?? null,
    website: patch.website ?? null,
    aboutUs: patch.aboutUs ?? null,
    logoUrl: patch.logoUrl ?? null,
    coverImageUrl: patch.coverImageUrl ?? null,
    campusLifeLinks: patch.campusLifeLinks ?? null,
    rankingMetaData: patch.rankingMetaData ?? null,
    locationMapMetaData: patch.locationMapMetaData ?? null,
    establishedYear: patch.establishedYear ?? null,
    universityType: patch.universityType ?? null,
    currRanking: patch.currRanking ?? null,
  };
}

function universityInfoFieldsFromStaging(
  fields: Record<string, string>,
): Partial<SysUniversities> {
  const commissionType = normalizeCommissionType(fields.commissionType) ?? undefined;
  return {
    address: (fields.address ?? '').trim() || undefined,
    commissionType,
    commission: parseOptionalDecimal(fields.commission ?? ''),
    website: (fields.website ?? '').trim() || undefined,
    aboutUs: (fields.aboutUs ?? '').trim() || undefined,
    logoUrl: (fields.logoUrl ?? '').trim() || undefined,
    coverImageUrl: (fields.coverImageUrl ?? '').trim() || undefined,
    campusLifeLinks: parseQuotedUrlList(fields.campusLifeLinks ?? ''),
    rankingMetaData: parseMetaDataItems(fields.rankingMetaData ?? '') ?? undefined,
    locationMapMetaData: (fields.locationMapMetaData ?? '').trim() || undefined,
    establishedYear: parseOptionalInt(fields.establishedYear ?? ''),
    universityType: (fields.universityType ?? '').trim() || undefined,
    currRanking: parseOptionalInt(fields.currRanking ?? ''),
  };
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

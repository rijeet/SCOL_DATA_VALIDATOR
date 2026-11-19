import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, Not } from 'typeorm';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { DataEntryBatches, DataEntryBatchStatus } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { SysEnglishTests } from '@entity/entities/SysEnglishTests.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { DEGREE_SEEDS } from '@shared/constants/degreeSeeds.constants';
import { normalizeCommissionType } from '@shared/constants/amountTypes.constants';
import { isCourseRowFieldRequired } from '@shared/validation/courseRowFieldValidation';
import {
  checkedToeflPairs,
  collectToeflPreview,
  rewriteToeflFields,
  type ToeflPreview,
} from '@shared/validation/toeflScale';
import type { ApplyToeflScaleRequestDto } from '@shared/dtos/data-entry/ApplyToeflScaleRequestDto';
import type {
  UnpublishedCourseSnapshot,
  UnpublishedDegreeCourseList,
  UnpublishedPatchResult,
} from '@shared/dtos/data-entry/UnpublishedCourseSnapshotDto';
import type {
  RemapUnpublishedEntryDegreesRequestDto,
  RemapUnpublishedIntakesRequestDto,
  RemapUnpublishedScholarshipsRequestDto,
  RenameUnpublishedProgrammeRequestDto,
  SetUnpublishedIntakeDeadlineRequestDto,
} from '@shared/dtos/data-entry/RemapUnpublishedCourseRequestDto';
import type { ApplyScholarshipMetaRequestDto } from '@shared/dtos/data-entry/ApplyScholarshipMetaRequestDto';
import { parseMetaDataItems } from '../common/engine/MetaDataParser';
import {
  collectScholarshipMetaPreview,
  rewriteScholarshipMeta,
  scholarshipAmountNumber,
  type ScholarshipMetaFill,
  type ScholarshipMetaPreview,
} from '@shared/validation/scholarshipMeta';
import type { CsvRow } from '../common/abstractions/CsvImportProcessor';
import { normalizeCourseCsvRow } from '../course/dto/CourseImportRowTypes';
import {
  formatIntakeInfoList,
  parseIntakeInfo,
  parseIntakeInfoList,
} from '../course/parsers/courseIntakeInfoParser';
import { CourseRowValidator } from '../course/validators/CourseRowValidator';
import { normalizeStagingCourseRow } from './courseStagingHeaders';
import { DataEntryStagingService } from './DataEntryStagingService';

const SKIPPED_STATUSES = [
  DataEntryBatchStatus.PUBLISHED,
  DataEntryBatchStatus.AWAITING_UPLOAD,
  DataEntryBatchStatus.IMPORTING,
  DataEntryBatchStatus.FAILED,
];

const ENGLISH_SCORE_FIELDS = [
  {
    name: 'IELTS',
    field: 'ieltsMinOverall',
    section: 'ieltsMinSection',
    max: 9,
    sectionMax: 9,
  },
  {
    name: 'PTE',
    field: 'pteMinOverall',
    section: 'pteMinSection',
    max: 90,
    sectionMax: 90,
  },
  {
    name: 'TOEFL',
    field: 'toeflMinOverall',
    section: 'toeflMinSection',
    max: 120,
    sectionMax: 30,
  },
] as const;

type LoadedBatch = {
  batch: DataEntryBatches;
  rows: DataEntryCourseRows[];
};

@Injectable()
export class DataEntryUnpublishedCourseService {
  constructor(
    private readonly db: AppDbContext,
    private readonly staging: DataEntryStagingService,
    private readonly validator: CourseRowValidator,
  ) {}

  async snapshot(): Promise<UnpublishedCourseSnapshot> {
    const loaded = await this.loadLatest();
    const tests = await this.db.Set(SysEnglishTests).find();
    const maxByName = new Map(
      tests.map((t) => [t.testName.trim().toUpperCase(), num(t.maxScore)]),
    );
    const minByName = new Map<string, number>();

    const degreeCounts = new Map<string, { name: string; count: number }>();
    const entryCounts = new Map<string, number>();
    const programmeCounts = new Map<string, { name: string; count: number }>();
    const scholarshipCounts = new Map<string, number>();
    const intakeCounts = new Map<string, number>();
    const englishGroupCounts = new Map<string, number>();
    const tuitionCounts = new Map<string, number>();

    const universities = loaded.map(({ batch }) => ({
      batchId: batch.id,
      uniName: uniLabel(batch),
    }));

    for (const { batch, rows } of loaded) {
      for (const row of rows) {
        const fields = row.fields ?? {};
        const degree = (fields.degreeName ?? '').trim();
        if (degree) {
          const key = degree.toLowerCase();
          const cur = degreeCounts.get(key) ?? { name: degree, count: 0 };
          cur.count += 1;
          degreeCounts.set(key, cur);
        }
        const min = (fields.minDegreeName ?? '').trim();
        if (min) {
          const high = (fields.higherDegreeName ?? '').trim();
          const key = `${batch.id}\0${min.toLowerCase()}\0${high.toLowerCase()}`;
          entryCounts.set(key, (entryCounts.get(key) ?? 0) + 1);
        }
        const programme = (fields.programmeName ?? '').trim();
        if (programme) {
          const key = programme.toLowerCase();
          const cur = programmeCounts.get(key) ?? { name: programme, count: 0 };
          cur.count += 1;
          programmeCounts.set(key, cur);
        }
        const schName = (fields.scholarshipName ?? '').trim();
        const schKey = [
          batch.id,
          degree.toLowerCase(),
          schName.toLowerCase(),
          (fields.scholarshipAmount ?? '').trim(),
          normalizeCommissionType(fields.scholarshipType) ?? '',
        ].join('\0');
        scholarshipCounts.set(schKey, (scholarshipCounts.get(schKey) ?? 0) + 1);

        for (const intake of parseIntakeInfoList(fields.intakeInfo ?? '')) {
          const key = `${batch.id}\0${intake.year}\0${intake.month}`;
          intakeCounts.set(key, (intakeCounts.get(key) ?? 0) + 1);
        }
        for (const test of ENGLISH_SCORE_FIELDS) {
          const value = num(fields[test.field]);
          if (value == null) continue;
          const prev = minByName.get(test.name);
          if (prev == null || value < prev) minByName.set(test.name, value);
          const overall = prettyScore(fields[test.field]);
          const section = prettyScore(fields[test.section]);
          if (!overall && !section) continue;
          const key = [
            batch.id,
            test.name,
            overall,
            section,
          ].join('\0');
          englishGroupCounts.set(key, (englishGroupCounts.get(key) ?? 0) + 1);
        }
        const tuitionAmount = prettyAmount(fields.tuitionFee);
        if (tuitionAmount) {
          const intakes = parseIntakeInfoList(fields.intakeInfo ?? '');
          for (const intake of intakes) {
            const tuitionKey = [
              batch.id,
              normalizeCurrency(fields.currency),
              tuitionAmount,
              intake.year,
              intake.month,
            ].join('\0');
            tuitionCounts.set(
              tuitionKey,
              (tuitionCounts.get(tuitionKey) ?? 0) + 1,
            );
          }
        }
      }
    }

    const entryDegrees = [...entryCounts.entries()].map(([key, courseCount]) => {
      const [batchId, minLower, highLower] = key.split('\0');
      const sample = loaded
        .find((l) => l.batch.id === batchId)
        ?.rows.find((row) => {
          const min = (row.fields.minDegreeName ?? '').trim().toLowerCase();
          const high = (row.fields.higherDegreeName ?? '').trim().toLowerCase();
          return min === minLower && high === highLower;
        });
      const batch = loaded.find((l) => l.batch.id === batchId)?.batch;
      const highName = (sample?.fields.higherDegreeName ?? '').trim();
      return {
        batchId,
        uniName: batch ? uniLabel(batch) : '',
        minDegreeName: (sample?.fields.minDegreeName ?? '').trim(),
        highDegreeName: highName || null,
        courseCount,
      };
    });

    const scholarships = [...scholarshipCounts.entries()].map(
      ([key, courseCount]) => {
        const [batchId, degreeLower] = key.split('\0');
        const batch = loaded.find((l) => l.batch.id === batchId)?.batch;
        const sample = loaded
          .find((l) => l.batch.id === batchId)
          ?.rows.find((row) => scholarshipKey(batchId, row.fields) === key);
        const name = (sample?.fields.scholarshipName ?? '').trim();
        return {
          batchId,
          uniName: batch ? uniLabel(batch) : '',
          degreeName: (sample?.fields.degreeName ?? degreeLower).trim(),
          name: name || null,
          amount: name ? (sample?.fields.scholarshipAmount ?? '').trim() || null : null,
          amountType: name
            ? normalizeCommissionType(sample?.fields.scholarshipType) ??
              ((sample?.fields.scholarshipType ?? '').trim() || null)
            : null,
          courseCount,
        };
      },
    );

    const intakesByUni = universities.map((uni) => ({
      batchId: uni.batchId,
      uniName: uni.uniName,
      intakes: [...intakeCounts.entries()]
        .filter(([key]) => key.startsWith(`${uni.batchId}\0`))
        .map(([key, courseCount]) => {
          const [, year, month] = key.split('\0');
          return {
            year: Number(year),
            month: Number(month),
            courseCount,
          };
        })
        .sort((a, b) => a.year - b.year || a.month - b.month),
    }));

    const englishByUni = universities
      .map((uni) => {
        const tests = ENGLISH_SCORE_FIELDS.map((test) => {
          const groups = [...englishGroupCounts.entries()]
            .filter(([key]) => key.startsWith(`${uni.batchId}\0${test.name}\0`))
            .map(([key, courseCount]) => {
              const parts = key.split('\0');
              return {
                overall: parts[2] ?? '',
                section: parts[3] ?? '',
                courseCount,
              };
            })
            .sort((a, b) =>
              compareEnglishScore(
                `${a.overall} · ${a.section}`,
                `${b.overall} · ${b.section}`,
              ),
            );
          return { name: test.name, groups };
        }).filter((test) => test.groups.length > 0);
        return { batchId: uni.batchId, uniName: uni.uniName, tests };
      })
      .filter((uni) => uni.tests.length > 0);

    const tuitionByUni = universities
      .map((uni) => ({
        batchId: uni.batchId,
        uniName: uni.uniName,
        groups: [...tuitionCounts.entries()]
          .filter(([key]) => key.startsWith(`${uni.batchId}\0`))
          .map(([key, courseCount]) => {
            const parts = key.split('\0');
            return {
              currency: parts[1] ?? '',
              amount: parts[2] ?? '',
              year: Number(parts[3]),
              month: Number(parts[4]),
              courseCount,
            };
          })
          .sort(
            (a, b) =>
              a.year - b.year ||
              a.month - b.month ||
              Number(a.amount) - Number(b.amount) ||
              a.currency.localeCompare(b.currency),
          ),
      }))
      .filter((uni) => uni.groups.length > 0);

    const countryIds = [
      ...new Set(
        loaded
          .map(({ batch }) => batch.sysCountryId)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const countryRows =
      countryIds.length === 0
        ? []
        : await this.db.Set(SysCountries).find({ where: { id: In(countryIds) } });
    const countryById = new Map(countryRows.map((c) => [c.id, c]));
    const countryGroups = new Map<
      string,
      {
        id: string;
        name: string;
        code: string | null;
        universities: { batchId: string; name: string; courseCount: number }[];
        courseCount: number;
      }
    >();
    for (const { batch, rows } of loaded) {
      const country = batch.sysCountryId
        ? countryById.get(batch.sysCountryId)
        : undefined;
      const id = country?.id ?? 'unknown';
      const group = countryGroups.get(id) ?? {
        id,
        name: country?.countryName ?? 'No country',
        code: country?.countryCode ?? null,
        universities: [],
        courseCount: 0,
      };
      group.universities.push({
        batchId: batch.id,
        name: uniLabel(batch),
        courseCount: rows.length,
      });
      group.courseCount += rows.length;
      countryGroups.set(id, group);
    }
    const countries = [...countryGroups.values()]
      .map((g) => ({
        ...g,
        universityCount: g.universities.length,
        universities: g.universities.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const courseTotal = loaded.reduce((sum, item) => sum + item.rows.length, 0);

    return {
      totals: {
        countries: countries.length,
        universities: loaded.length,
        courses: courseTotal,
      },
      countries,
      universities,
      degrees: [...degreeCounts.values()]
        .map((d) => ({
          name: d.name,
          levelOrder:
            DEGREE_SEEDS.find(
              (s) => s.degreeName.toLowerCase() === d.name.toLowerCase(),
            )?.levelOrder ?? null,
          courseCount: d.count,
        }))
        .sort((a, b) => (a.levelOrder ?? 99) - (b.levelOrder ?? 99) || a.name.localeCompare(b.name)),
      englishByUni,
      tuitionByUni,
      englishTests: ENGLISH_SCORE_FIELDS.map((test) => ({
        name: test.name,
        minScore: minByName.get(test.name) ?? null,
        maxScore: maxByName.get(test.name) ?? test.max,
      })),
      entryDegrees: entryDegrees.sort((a, b) =>
        a.uniName.localeCompare(b.uniName) ||
        a.minDegreeName.localeCompare(b.minDegreeName),
      ),
      programmes: [...programmeCounts.values()]
        .map((p) => ({ name: p.name, courseCount: p.count }))
        .sort((a, b) => a.name.localeCompare(b.name)),
      scholarships,
      intakesByUni: intakesByUni.filter((u) => u.intakes.length > 0),
    };
  }

  async listCourses(degreeName: string): Promise<UnpublishedDegreeCourseList> {
    const name = degreeName.trim();
    if (!name) throw new BadRequestException('Degree name is required');
    const loaded = await this.loadLatest();
    const courses: UnpublishedDegreeCourseList['courses'] = [];
    for (const { batch, rows } of loaded) {
      for (const row of rows) {
        const degree = (row.fields.degreeName ?? '').trim();
        if (degree.toLowerCase() !== name.toLowerCase()) continue;
        courses.push({
          batchId: batch.id,
          rowIndex: row.rowIndex,
          rowCount: batch.rowCount,
          universityKey: batch.universityKey,
          uniName: uniLabel(batch),
          courseName: (row.fields.courseName ?? '').trim() || `Row ${row.rowIndex + 1}`,
          programmeName: (row.fields.programmeName ?? '').trim() || null,
        });
      }
    }
    courses.sort((a, b) =>
      a.uniName.localeCompare(b.uniName) || a.courseName.localeCompare(b.courseName),
    );
    return { degreeName: name, courses };
  }

  async listCoursesForIntake(
    batchId: string,
    year: number,
    month: number,
  ): Promise<UnpublishedDegreeCourseList> {
    const batch = await this.requireOpenBatch(batchId);
    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId: batch.id },
      order: { rowIndex: 'ASC' },
    });
    const courses: UnpublishedDegreeCourseList['courses'] = [];
    for (const row of rows) {
      const intakes = parseIntakeInfoList(row.fields.intakeInfo ?? '');
      if (!intakes.some((i) => i.year === year && i.month === month)) continue;
      courses.push({
        batchId: batch.id,
        rowIndex: row.rowIndex,
        rowCount: batch.rowCount,
        universityKey: batch.universityKey,
        uniName: uniLabel(batch),
        courseName:
          (row.fields.courseName ?? '').trim() || `Row ${row.rowIndex + 1}`,
        programmeName: (row.fields.programmeName ?? '').trim() || null,
        applicationDeadline: (row.fields.applicationDeadline ?? '').trim() || null,
        applicationFee: (row.fields.applicationFee ?? '').trim() || null,
      });
    }
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
    return { degreeName: `${year}-${month}`, courses };
  }

  async listCoursesForProgramme(
    name: string,
  ): Promise<UnpublishedDegreeCourseList> {
    const target = name.trim();
    if (!target) throw new BadRequestException('Programme name is required');
    const loaded = await this.loadLatest();
    const courses: UnpublishedDegreeCourseList['courses'] = [];
    for (const { batch, rows } of loaded) {
      for (const row of rows) {
        const programme = (row.fields.programmeName ?? '').trim();
        if (programme.toLowerCase() !== target.toLowerCase()) continue;
        courses.push(courseItem(batch, row));
      }
    }
    courses.sort((a, b) =>
      a.uniName.localeCompare(b.uniName) || a.courseName.localeCompare(b.courseName),
    );
    return { degreeName: target, courses };
  }

  async toeflPreview(): Promise<ToeflPreview> {
    const loaded = await this.loadLatest();
    const values: { kind: 'overall' | 'section'; raw: string }[] = [];
    for (const { rows } of loaded) {
      for (const row of rows) {
        values.push(
          { kind: 'overall', raw: row.fields.toeflMinOverall ?? '' },
          { kind: 'section', raw: row.fields.toeflMinSection ?? '' },
        );
      }
    }
    return collectToeflPreview(values);
  }

  async applyToeflScale(
    dto: ApplyToeflScaleRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const pairs = checkedToeflPairs(dto.pairs, (message) => {
      throw new BadRequestException(message);
    });
    const loaded = await this.loadLatest();
    let updated = 0;
    for (const { batch } of loaded) {
      updated += await this.patchRows(batch, (fields) =>
        rewriteToeflFields(fields, pairs),
      );
    }
    return { updated };
  }

  async listCoursesForEnglishTest(
    name: string,
    filter?: { batchId?: string; overall?: string; section?: string },
  ): Promise<UnpublishedDegreeCourseList> {
    const spec = ENGLISH_SCORE_FIELDS.find(
      (test) => test.name.toLowerCase() === name.trim().toLowerCase(),
    );
    if (!spec) throw new BadRequestException('English test is required');
    const wantOverall = prettyScore(filter?.overall);
    const wantSection = prettyScore(filter?.section);
    const loaded = await this.loadLatest();
    const courses: UnpublishedDegreeCourseList['courses'] = [];
    for (const { batch, rows } of loaded) {
      if (filter?.batchId && batch.id !== filter.batchId) continue;
      for (const row of rows) {
        const overall = prettyScore(row.fields[spec.field]);
        const section = prettyScore(row.fields[spec.section]);
        if (!overall && !section) continue;
        if (wantOverall && overall !== wantOverall) continue;
        if (wantSection && section !== wantSection) continue;
        courses.push({
          ...courseItem(batch, row),
          score: [overall, section].filter(Boolean).join(' · '),
        });
      }
    }
    courses.sort(
      (a, b) =>
        compareEnglishScore(a.score, b.score) ||
        a.courseName.localeCompare(b.courseName),
    );
    return { degreeName: spec.name, courses };
  }

  async listCoursesForTuition(filter: {
    batchId: string;
    currency: string;
    amount: string;
    year: number;
    month: number;
  }): Promise<UnpublishedDegreeCourseList> {
    const batch = await this.requireOpenBatch(filter.batchId);
    const currency = normalizeCurrency(filter.currency);
    const amount = prettyAmount(filter.amount);
    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId: batch.id },
      order: { rowIndex: 'ASC' },
    });
    const courses = rows
      .filter(
        (row) =>
          normalizeCurrency(row.fields.currency) === currency &&
          prettyAmount(row.fields.tuitionFee) === amount &&
          parseIntakeInfoList(row.fields.intakeInfo ?? '').some(
            (intake) =>
              intake.year === filter.year && intake.month === filter.month,
          ),
      )
      .map((row) => ({
        ...courseItem(batch, row),
        score: tuitionLabel(currency, amount),
      }));
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
    return { degreeName: tuitionLabel(currency, amount), courses };
  }

  async remapTuition(dto: {
    batchId: string;
    fromCurrency: string;
    fromAmount: string;
    year: number;
    month: number;
    toCurrency: string;
    toAmount: string;
  }): Promise<UnpublishedPatchResult> {
    const fromCurrency = normalizeCurrency(dto.fromCurrency);
    const toCurrency = normalizeCurrency(dto.toCurrency);
    const fromAmount = assertAmount(dto.fromAmount, 'Current tuition');
    const toAmount = assertAmount(dto.toAmount, 'New tuition');
    if (!toCurrency) throw new BadRequestException('New currency is required');
    if (fromCurrency === toCurrency && fromAmount === toAmount) {
      throw new BadRequestException('New tuition must differ from the current tuition');
    }
    const batch = await this.requireOpenBatch(dto.batchId);
    const updated = await this.patchRows(batch, (fields) => {
      if (
        normalizeCurrency(fields.currency) !== fromCurrency ||
        prettyAmount(fields.tuitionFee) !== fromAmount ||
        !parseIntakeInfoList(fields.intakeInfo ?? '').some(
          (intake) => intake.year === dto.year && intake.month === dto.month,
        )
      ) {
        return null;
      }
      return { ...fields, tuitionFee: toAmount, currency: toCurrency };
    });
    return { updated };
  }

  async remapEnglishScores(dto: {
    batchId: string;
    testName: string;
    fromOverall: string;
    fromSection: string;
    toOverall: string;
    toSection: string;
  }): Promise<UnpublishedPatchResult> {
    const spec = ENGLISH_SCORE_FIELDS.find(
      (test) => test.name.toLowerCase() === dto.testName.trim().toLowerCase(),
    );
    if (!spec) throw new BadRequestException('English test is required');
    const fromOverall = assertEnglishScore(dto.fromOverall, spec.max, 'Current overall');
    const fromSection = assertEnglishScore(
      dto.fromSection,
      spec.sectionMax,
      'Current section',
    );
    const toOverall = assertEnglishScore(dto.toOverall, spec.max, 'New overall');
    const toSection = assertEnglishScore(dto.toSection, spec.sectionMax, 'New section');
    if (fromOverall === toOverall && fromSection === toSection) {
      throw new BadRequestException('New score must differ from the current score');
    }
    const batch = await this.requireOpenBatch(dto.batchId);
    const updated = await this.patchRows(batch, (fields) => {
      if (
        prettyScore(fields[spec.field]) !== fromOverall ||
        prettyScore(fields[spec.section]) !== fromSection
      ) {
        return null;
      }
      return {
        ...fields,
        [spec.field]: toOverall,
        [spec.section]: toSection,
      };
    });
    return { updated };
  }

  async listCoursesForScholarship(query: {
    batchId: string;
    degreeName: string;
    name?: string;
    amount?: string;
    amountType?: string;
  }): Promise<UnpublishedDegreeCourseList> {
    const batch = await this.requireOpenBatch(query.batchId);
    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId: batch.id },
      order: { rowIndex: 'ASC' },
    });
    const degreeName = query.degreeName.trim().toLowerCase();
    const fromName = (query.name ?? '').trim().toLowerCase();
    const fromAmount = (query.amount ?? '').trim();
    const fromType = normalizeCommissionType(query.amountType ?? '') ?? '';
    const courses = rows
      .filter((row) => {
        if ((row.fields.degreeName ?? '').trim().toLowerCase() !== degreeName) {
          return false;
        }
        const name = (row.fields.scholarshipName ?? '').trim().toLowerCase();
        const amount = (row.fields.scholarshipAmount ?? '').trim();
        const type = normalizeCommissionType(row.fields.scholarshipType) ?? '';
        return name === fromName && amount === fromAmount && type === fromType;
      })
      .map((row) => courseItem(batch, row));
    courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
    return { degreeName: query.degreeName.trim(), courses };
  }

  async remapEntryDegrees(
    dto: RemapUnpublishedEntryDegreesRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const fromHigh = (dto.fromHighDegreeName ?? '').trim();
    const toHigh = (dto.toHighDegreeName ?? '').trim();
    const fromMin = dto.fromMinDegreeName.trim();
    const toMin = dto.toMinDegreeName.trim();
    if (
      fromMin.toLowerCase() === toMin.toLowerCase() &&
      fromHigh.toLowerCase() === toHigh.toLowerCase()
    ) {
      throw new BadRequestException(
        'New min/high degree must differ from the current pair',
      );
    }
    const batch = await this.requireOpenBatch(dto.batchId);
    const updated = await this.patchRows(batch, (fields) => {
      const min = (fields.minDegreeName ?? '').trim();
      const high = (fields.higherDegreeName ?? '').trim();
      if (min.toLowerCase() !== fromMin.toLowerCase()) return null;
      if (high.toLowerCase() !== fromHigh.toLowerCase()) return null;
      return {
        ...fields,
        minDegreeName: toMin,
        higherDegreeName: toHigh,
      };
    });
    return { updated };
  }

  async renameProgramme(
    dto: RenameUnpublishedProgrammeRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const fromName = dto.fromName.trim();
    const newName = dto.newName.trim();
    if (!fromName || !newName) {
      throw new BadRequestException('Programme name is required');
    }
    if (fromName.toLowerCase() === newName.toLowerCase()) {
      throw new BadRequestException('New name must differ from the current name');
    }
    const loaded = await this.loadLatest();
    let updated = 0;
    for (const { batch } of loaded) {
      updated += await this.patchRows(batch, (fields) => {
        const name = (fields.programmeName ?? '').trim();
        if (name.toLowerCase() !== fromName.toLowerCase()) return null;
        return { ...fields, programmeName: newName };
      });
    }
    return { updated };
  }

  async remapScholarships(
    dto: RemapUnpublishedScholarshipsRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const toName = dto.toName.trim();
    const toType = normalizeCommissionType(dto.toAmountType);
    if (!toName) throw new BadRequestException('Scholarship name is required');
    if (!toType) {
      throw new BadRequestException(
        'Scholarship type must be Amount or Percentage',
      );
    }
    const batch = await this.requireOpenBatch(dto.batchId);
    const degreeName = dto.degreeName.trim().toLowerCase();
    const fromName = (dto.fromName ?? '').trim().toLowerCase();
    const fromAmount = (dto.fromAmount ?? '').trim();
    const fromType = normalizeCommissionType(dto.fromAmountType ?? '') ?? '';
    const updated = await this.patchRows(batch, (fields) => {
      if ((fields.degreeName ?? '').trim().toLowerCase() !== degreeName) {
        return null;
      }
      const name = (fields.scholarshipName ?? '').trim().toLowerCase();
      const amount = (fields.scholarshipAmount ?? '').trim();
      const type = normalizeCommissionType(fields.scholarshipType) ?? '';
      if (name !== fromName || amount !== fromAmount || type !== fromType) {
        return null;
      }
      return {
        ...fields,
        scholarshipName: toName,
        scholarshipAmount: dto.toAmount.trim(),
        scholarshipType: toType,
      };
    });
    return { updated };
  }

  async remapIntakes(
    dto: RemapUnpublishedIntakesRequestDto,
  ): Promise<UnpublishedPatchResult> {
    if (dto.fromYear === dto.toYear && dto.fromMonth === dto.toMonth) {
      throw new BadRequestException(
        'New intake must differ from the current intake',
      );
    }
    const batch = await this.requireOpenBatch(dto.batchId);
    const label = formatIntakeInfoList([
      { year: dto.toYear, month: dto.toMonth },
    ]);
    const updated = await this.patchRows(batch, (fields) => {
      const raw = fields.intakeInfo ?? '';
      const parts = raw.split(',');
      let changed = false;
      const next = parts.map((part) => {
        const parsed = parseIntakeInfo(part.trim());
        if (
          !parsed ||
          parsed.year !== dto.fromYear ||
          parsed.month !== dto.fromMonth
        ) {
          return part.trim();
        }
        changed = true;
        return label;
      });
      if (!changed) return null;
      return { ...fields, intakeInfo: next.filter(Boolean).join(', ') };
    });
    return { updated };
  }

  async setIntakeDeadline(
    dto: SetUnpublishedIntakeDeadlineRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const staging = checkedStagingDeadline(dto);
    const batch = await this.requireOpenBatch(dto.batchId);
    const updated = await this.patchRows(batch, (fields) => {
      if (!intakeMatches(fields.intakeInfo, dto.year, dto.month)) return null;
      return { ...fields, ...staging };
    });
    return { updated };
  }

  async scholarshipMetaPreview(): Promise<ScholarshipMetaPreview> {
    const loaded = await this.loadLatest();
    const samples = loaded.flatMap(({ batch, rows }) =>
      rows.map((row) => ({
        name: row.fields.scholarshipName ?? '',
        amount: row.fields.scholarshipAmount ?? '',
        metadata: row.fields.scholarshipMetaData ?? '',
        course: {
          courseName:
            (row.fields.courseName ?? '').trim() || `Row ${row.rowIndex + 1}`,
          uniName: uniLabel(batch),
          batchId: batch.id,
          rowIndex: row.rowIndex,
          rowCount: batch.rowCount,
          universityKey: batch.universityKey,
        },
      })),
    );
    return collectScholarshipMetaPreview(samples);
  }

  async applyScholarshipMeta(
    dto: ApplyScholarshipMetaRequestDto,
  ): Promise<UnpublishedPatchResult> {
    const clears = new Set(
      dto.clearMetadata.map((item) => item.trim()).filter(Boolean),
    );
    const fills = checkedScholarshipFills(dto.fills);
    const loaded = await this.loadLatest();
    let updated = 0;
    for (const { batch } of loaded) {
      updated += await this.patchRows(batch, (fields) =>
        rewriteScholarshipMeta(fields, clears, fills),
      );
    }
    return { updated };
  }

  private async loadLatest(): Promise<LoadedBatch[]> {
    const batches = await this.db.Set(DataEntryBatches).find({
      where: {
        batchType: DataEntryBatchType.COURSE,
        status: Not(In(SKIPPED_STATUSES)),
      },
      order: { createdAt: 'DESC' },
    });
    const seen = new Set<string>();
    const latest: DataEntryBatches[] = [];
    for (const batch of batches) {
      const key = batch.sysUniversityId
        ? `id:${batch.sysUniversityId}`
        : `name:${batch.universityKey.trim().toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      latest.push(batch);
    }
    const loaded: LoadedBatch[] = [];
    for (const batch of latest) {
      const rows = await this.db.Set(DataEntryCourseRows).find({
        where: { batchId: batch.id },
        order: { rowIndex: 'ASC' },
      });
      loaded.push({ batch, rows });
    }
    return loaded;
  }

  private async requireOpenBatch(batchId: string): Promise<DataEntryBatches> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch || batch.batchType !== DataEntryBatchType.COURSE) {
      throw new NotFoundException('Course batch not found');
    }
    if (SKIPPED_STATUSES.includes(batch.status)) {
      throw new ConflictException(
        'Only an unpublished course batch can be edited here',
      );
    }
    return batch;
  }

  private async patchRows(
    batch: DataEntryBatches,
    map: (fields: Record<string, string>) => Record<string, string> | null,
  ): Promise<number> {
    const rows = await this.db.Set(DataEntryCourseRows).find({
      where: { batchId: batch.id },
      order: { rowIndex: 'ASC' },
    });
    let updated = 0;
    for (const row of rows) {
      const next = map({ ...row.fields });
      if (!next) continue;
      const keptKey = (row.fields.courseKey ?? '').trim();
      const normalized = normalizeStagingCourseRow(next as CsvRow);
      if (keptKey) normalized.courseKey = keptKey;
      const courseRow = normalizeCourseCsvRow(normalized as CsvRow);
      const fieldErrors = this.validator.validateRowFieldErrors(courseRow);
      row.fields = normalized;
      row.fieldErrors = fieldErrors;
      row.isValid = !Object.keys(fieldErrors).some(isCourseRowFieldRequired);
      await this.db.Set(DataEntryCourseRows).save(row);
      updated += 1;
    }
    if (updated > 0) await this.staging.recomputeBatchCounts(batch.id);
    return updated;
  }
}

function intakeMatches(
  raw: string | undefined,
  year: number,
  month: number,
): boolean {
  return parseIntakeInfoList(raw ?? '').some(
    (intake) => intake.year === year && intake.month === month,
  );
}

function checkedStagingDeadline(dto: {
  applicationDeadline?: string;
  applicationFee?: string;
}): Record<string, string> {
  const hasDeadline = dto.applicationDeadline !== undefined;
  const hasFee = dto.applicationFee !== undefined;
  if (!hasDeadline && !hasFee) {
    throw new BadRequestException(
      'Send an application deadline, an application fee, or both',
    );
  }
  const staging: Record<string, string> = {};
  if (hasDeadline) {
    const text = (dto.applicationDeadline ?? '').trim();
    if (text && !/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
      throw new BadRequestException('Application deadline must be MM/DD/YYYY');
    }
    staging.applicationDeadline = text;
  }
  if (hasFee) {
    const text = (dto.applicationFee ?? '').trim();
    if (text && !/^\d+(\.\d+)?$/.test(text)) {
      throw new BadRequestException(
        `applicationFee: "${text}" is not a plain number (no commas, currency symbols or spaces)`,
      );
    }
    staging.applicationFee = text;
  }
  return staging;
}

function checkedScholarshipFills(
  fills: { name: string; amount: string; metadata: string }[],
): ScholarshipMetaFill[] {
  return fills.map((fill) => {
    const amount = scholarshipAmountNumber(fill.amount);
    if (amount == null || amount <= 0) {
      throw new BadRequestException('Scholarship amount must be greater than 0');
    }
    if (!parseMetaDataItems(fill.metadata)) {
      throw new BadRequestException(
        'Scholarship metadata must be valid MetaDataItem[] JSON',
      );
    }
    return {
      name: fill.name.trim().toLowerCase(),
      amount,
      metadata: fill.metadata.trim(),
    };
  });
}

function courseItem(
  batch: DataEntryBatches,
  row: DataEntryCourseRows,
): UnpublishedDegreeCourseList['courses'][number] {
  return {
    batchId: batch.id,
    rowIndex: row.rowIndex,
    rowCount: batch.rowCount,
    universityKey: batch.universityKey,
    uniName: uniLabel(batch),
    courseName: (row.fields.courseName ?? '').trim() || `Row ${row.rowIndex + 1}`,
    programmeName: (row.fields.programmeName ?? '').trim() || null,
  };
}

function uniLabel(batch: DataEntryBatches): string {
  return (batch.displayName || batch.universityKey || 'University').trim();
}

function compareEnglishScore(
  left: string | null | undefined,
  right: string | null | undefined,
): number {
  const parts = (score: string | null | undefined): [number, number] => {
    const values = (score ?? '')
      .split('·')
      .map((part) => Number(part.trim()))
      .filter((n) => Number.isFinite(n));
    const overall = values[0] ?? Number.POSITIVE_INFINITY;
    return [overall, values[1] ?? overall];
  };
  const a = parts(left);
  const b = parts(right);
  return a[0] - b[0] || a[1] - b[1];
}

function normalizeCurrency(value: unknown): string {
  return String(value ?? '').trim().toUpperCase();
}

function prettyAmount(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim().replace(/,/g, '');
  if (!text) return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  return Number.isInteger(n) ? String(n) : String(n);
}

function tuitionLabel(currency: string, amount: string): string {
  return [currency, amount].filter(Boolean).join(' ');
}

function assertAmount(raw: string, label: string): string {
  const amount = prettyAmount(raw);
  const n = Number(amount);
  if (!amount || !Number.isFinite(n) || n < 0) {
    throw new BadRequestException(`${label} must be a number`);
  }
  return amount;
}

function prettyScore(value: unknown): string {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text) return '';
  const n = Number(text);
  if (!Number.isFinite(n)) return text;
  return Number.isInteger(n) ? String(n) : String(n);
}

function assertEnglishScore(raw: string, max: number, label: string): string {
  const text = raw.trim();
  const n = Number(text);
  if (!text || !Number.isFinite(n)) {
    throw new BadRequestException(`${label} must be a number`);
  }
  if (n < 0 || n > max) {
    throw new BadRequestException(`${label} must be between 0 and ${max}`);
  }
  return prettyScore(text);
}

function num(value: string | null | undefined): number | null {
  if (value == null || value.trim() === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function scholarshipKey(
  batchId: string,
  fields: Record<string, string>,
): string {
  return [
    batchId,
    (fields.degreeName ?? '').trim().toLowerCase(),
    (fields.scholarshipName ?? '').trim().toLowerCase(),
    (fields.scholarshipAmount ?? '').trim(),
    normalizeCommissionType(fields.scholarshipType) ?? '',
  ].join('\0');
}

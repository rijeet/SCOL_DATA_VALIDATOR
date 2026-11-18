import { PassThrough } from 'node:stream';
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { DataEntryUniversityRows } from '@entity/entities/DataEntryUniversityRows.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import {
  DATA_FIX_CSV_HEADERS,
  dataFixExportFileName,
} from '@shared/constants/courseKey.constants';
import { CourseImportSchema } from '../course/CourseImportSchema';
import { UNIVERSITY_INPUT_HEADERS } from '../university/UniversityImportSchema';
import { ensureCourseKeys } from './assignCourseKeys';

const PAGE_SIZE = 500;

function csvCell(value: unknown): string {
  let s = String(value ?? '');
  if (/^[=+\-@]/.test(s)) {
    s = `\t${s}`;
  }
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function safeFileName(name: string): string {
  return (
    name
      .replace(/\.csv$/i, '')
      .replace(/[\\/:*?"<>|]+/g, '_')
      .trim() || 'export'
  );
}

@Injectable()
export class DataEntryExportService {
  constructor(
    private readonly db: AppDbContext,
    private readonly config: ConfigService,
  ) {}

  private exportAllRows(): boolean {
    return this.config.get<boolean>('DATA_ENTRY_EXPORT_ALL_ROWS') === true;
  }

  async openValidCsvStream(
    batchId: string,
    format?: string,
  ): Promise<{ stream: PassThrough; filename: string }> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const isUniversity = batch.batchType === DataEntryBatchType.UNIVERSITY;
    const dataFix = (format ?? '').trim().toLowerCase() === 'data-fix';
    if (dataFix && isUniversity) {
      throw new BadRequestException(
        'DATA FIX export is only available for course batches',
      );
    }
    if (!isUniversity) {
      await this.db.transaction(async (manager) => {
        const live = await manager.findOne(DataEntryBatches, {
          where: { id: batchId },
        });
        if (live) await ensureCourseKeys(manager, live);
      });
    }

    const entity = isUniversity
      ? DataEntryUniversityRows
      : DataEntryCourseRows;
    const headers: readonly string[] = isUniversity
      ? UNIVERSITY_INPUT_HEADERS
      : dataFix
        ? DATA_FIX_CSV_HEADERS
        : CourseImportSchema.inputHeaders;

    const allRows = dataFix || this.exportAllRows();
    const rowCount = allRows
      ? await this.db.Set(entity).count({ where: { batchId } })
      : await this.db.Set(entity).count({
          where: { batchId, isValid: true },
        });
    if (rowCount === 0) {
      throw new ConflictException(
        allRows ? 'No rows to export' : 'No valid rows to export',
      );
    }

    const filename = dataFix
      ? dataFixExportFileName(
          batch.universityKey || batch.sourceFileName || 'export',
        )
      : `${safeFileName(
          batch.sourceFileName || batch.universityKey || 'export',
        )}${allRows ? '_all.csv' : '_valid.csv'}`;

    const stream = new PassThrough();
    void this.writeCsv(stream, entity, batchId, headers, {
      validOnly: !allRows,
    }).catch((err: unknown) => {
      stream.destroy(err instanceof Error ? err : new Error(String(err)));
    });

    return { stream, filename };
  }

  private async writeCsv(
    stream: PassThrough,
    entity: typeof DataEntryCourseRows | typeof DataEntryUniversityRows,
    batchId: string,
    headers: readonly string[],
    opts: { validOnly: boolean },
  ): Promise<void> {
    stream.write('\uFEFF');
    stream.write(headers.map(csvCell).join(',') + '\r\n');

    let lastIndex = 0;
    for (;;) {
      const rows = await this.db.Set(entity).find({
        where: opts.validOnly
          ? { batchId, isValid: true, rowIndex: MoreThan(lastIndex) }
          : { batchId, rowIndex: MoreThan(lastIndex) },
        order: { rowIndex: 'ASC' },
        take: PAGE_SIZE,
        select: ['rowIndex', 'fields'],
      });
      if (rows.length === 0) break;
      for (const row of rows) {
        const fields = row.fields ?? {};
        stream.write(
          headers.map((h) => csvCell(fields[h] ?? '')).join(',') + '\r\n',
        );
        lastIndex = row.rowIndex;
      }
      if (rows.length < PAGE_SIZE) break;
    }
    stream.end();
  }
}

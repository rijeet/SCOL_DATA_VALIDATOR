import { PassThrough } from 'node:stream';
import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { MoreThan } from 'typeorm';
import { AppDbContext } from '@infra/db/typeorm/AppDbContext';
import { DataEntryBatches } from '@entity/entities/DataEntryBatches.entity';
import { DataEntryCourseRows } from '@entity/entities/DataEntryCourseRows.entity';
import { DataEntryUniversityRows } from '@entity/entities/DataEntryUniversityRows.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import { CourseImportSchema } from '../course/CourseImportSchema';
import { UNIVERSITY_INPUT_HEADERS } from '../university/UniversityImportSchema';

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
  constructor(private readonly db: AppDbContext) {}

  async openValidCsvStream(
    batchId: string,
  ): Promise<{ stream: PassThrough; filename: string }> {
    const batch = await this.db.Set(DataEntryBatches).findOne({
      where: { id: batchId },
    });
    if (!batch) {
      throw new NotFoundException('Batch not found');
    }

    const isUniversity = batch.batchType === DataEntryBatchType.UNIVERSITY;
    const entity = isUniversity
      ? DataEntryUniversityRows
      : DataEntryCourseRows;
    const headers: readonly string[] = isUniversity
      ? UNIVERSITY_INPUT_HEADERS
      : CourseImportSchema.inputHeaders;

    const validCount = await this.db.Set(entity).count({
      where: { batchId, isValid: true },
    });
    if (validCount === 0) {
      throw new ConflictException('No valid rows to export');
    }

    const filename = `${safeFileName(
      batch.sourceFileName || batch.universityKey || 'export',
    )}_valid.csv`;

    const stream = new PassThrough();
    void this.writeCsv(stream, entity, batchId, headers).catch(
      (err: unknown) => {
        stream.destroy(err instanceof Error ? err : new Error(String(err)));
      },
    );

    return { stream, filename };
  }

  private async writeCsv(
    stream: PassThrough,
    entity: typeof DataEntryCourseRows | typeof DataEntryUniversityRows,
    batchId: string,
    headers: readonly string[],
  ): Promise<void> {
    stream.write('\uFEFF');
    stream.write(headers.map(csvCell).join(',') + '\r\n');

    let lastIndex = 0;
    for (;;) {
      const rows = await this.db.Set(entity).find({
        where: { batchId, isValid: true, rowIndex: MoreThan(lastIndex) },
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

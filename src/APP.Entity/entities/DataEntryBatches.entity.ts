import { Entity, Column, Index, OneToMany, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { BaseEntity } from './BaseEntity.template';
import { DataEntryCourseRows } from './DataEntryCourseRows.entity';
import { DataEntryUniversityRows } from './DataEntryUniversityRows.entity';
import { SysCountries } from './SysCountries.entity';
import { DataEntryBatchType } from '@shared/enums/DataEntryBatchType.enum';
import type { DataEntryHelperKey } from '@shared/constants/dataEntryCloud.constants';

export enum DataEntryBatchStatus {
  AWAITING_UPLOAD = 'AWAITING_UPLOAD',
  IMPORTING = 'IMPORTING',
  READY = 'READY',
  FAILED = 'FAILED',
  /** All rows valid; ready to publish to catalog tables. */
  VALIDATED = 'VALIDATED',
  PUBLISHED = 'PUBLISHED',
}

@Entity('DataEntryBatches')
@Index('IX_DataEntryBatches_universityKey', ['universityKey'])
@Index('IX_DataEntryBatches_sysCountryId', ['sysCountryId'])
@Index('IX_DataEntryBatches_batchType', ['batchType'])
export class DataEntryBatches extends BaseEntity {
  @Column({
    name: 'batchType',
    type: 'varchar',
    length: 32,
    default: DataEntryBatchType.COURSE,
  })
  @AutoMap()
  batchType!: DataEntryBatchType;

  @Column({ name: 'universityKey', type: 'varchar', length: 512 })
  @AutoMap()
  universityKey!: string;

  @Column({ name: 'displayName', type: 'varchar', length: 512 })
  @AutoMap()
  displayName!: string;

  @Column({ name: 'csvObjectKey', type: 'varchar', length: 1024 })
  @AutoMap()
  csvObjectKey!: string;

  @Column({
    name: 'sourceFileName',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  @AutoMap()
  sourceFileName?: string | null;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 32,
    default: DataEntryBatchStatus.IMPORTING,
  })
  @AutoMap()
  status!: DataEntryBatchStatus;

  @Column({ name: 'rowCount', type: 'int', default: 0 })
  @AutoMap()
  rowCount!: number;

  @Column({ name: 'invalidRowCount', type: 'int', default: 0 })
  @AutoMap()
  invalidRowCount!: number;

  @Column({ name: 'helperObjectKeys', type: 'jsonb', nullable: true })
  @AutoMap()
  helperObjectKeys?: Partial<Record<DataEntryHelperKey, string>> | null;

  @Column({ name: 'helperDocs', type: 'jsonb', nullable: true })
  @AutoMap()
  helperDocs?: Partial<Record<DataEntryHelperKey, string>> | null;

  @Column({ name: 'failureReason', type: 'text', nullable: true })
  @AutoMap()
  failureReason?: string | null;

  @Column({ name: 'createdByUserId', type: 'uuid', nullable: true })
  @AutoMap()
  createdByUserId?: string | null;

  @Column({ name: 'sysUniversityId', type: 'uuid', nullable: true })
  @AutoMap()
  sysUniversityId?: string | null;

  @Column({ name: 'sysCountryId', type: 'uuid', nullable: true })
  @AutoMap()
  sysCountryId?: string | null;

  @Column({ name: 'publishedAt', type: 'timestamptz', nullable: true })
  @AutoMap()
  publishedAt?: Date | null;

  @ManyToOne(() => SysCountries, { nullable: true })
  @JoinColumn({ name: 'sysCountryId' })
  SysCountry?: SysCountries | null;

  @OneToMany(() => DataEntryCourseRows, (row) => row.batch)
  rows?: DataEntryCourseRows[];

  @OneToMany(() => DataEntryUniversityRows, (row) => row.batch)
  universityRows?: DataEntryUniversityRows[];
}

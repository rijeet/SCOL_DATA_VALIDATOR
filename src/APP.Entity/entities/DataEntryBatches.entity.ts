import { Entity, Column, Index, OneToMany } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { BaseEntity } from './BaseEntity.template';
import { DataEntryCourseRows } from './DataEntryCourseRows.entity';

export enum DataEntryBatchStatus {
  IMPORTING = 'IMPORTING',
  READY = 'READY',
  FAILED = 'FAILED',
  /** All rows valid; ready to publish to catalog tables. */
  VALIDATED = 'VALIDATED',
  PUBLISHED = 'PUBLISHED',
}

@Entity('DataEntryBatches')
@Index('IX_DataEntryBatches_universityKey', ['universityKey'])
export class DataEntryBatches extends BaseEntity {
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
  helperObjectKeys?: Record<string, string> | null;

  @Column({ name: 'createdByUserId', type: 'uuid', nullable: true })
  @AutoMap()
  createdByUserId?: string | null;

  @Column({ name: 'sysUniversityId', type: 'uuid', nullable: true })
  @AutoMap()
  sysUniversityId?: string | null;

  @Column({ name: 'publishedAt', type: 'timestamptz', nullable: true })
  @AutoMap()
  publishedAt?: Date | null;

  @OneToMany(() => DataEntryCourseRows, (row) => row.batch)
  rows?: DataEntryCourseRows[];
}

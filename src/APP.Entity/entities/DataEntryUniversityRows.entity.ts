import { Entity, Column, Index, ManyToOne, JoinColumn } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { BaseEntity } from './BaseEntity.template';
import { DataEntryBatches } from './DataEntryBatches.entity';

@Entity('DataEntryUniversityRows')
@Index('IX_DataEntryUniversityRows_batchId_rowIndex', ['batchId', 'rowIndex'], {
  unique: true,
})
export class DataEntryUniversityRows extends BaseEntity {
  @Column({ name: 'batchId', type: 'uuid' })
  @AutoMap()
  batchId!: string;

  @Column({ name: 'rowIndex', type: 'int' })
  @AutoMap()
  rowIndex!: number;

  @Column({ name: 'fields', type: 'jsonb' })
  @AutoMap()
  fields!: Record<string, string>;

  @Column({ name: 'fieldErrors', type: 'jsonb', default: {} })
  @AutoMap()
  fieldErrors!: Record<string, string>;

  @Column({ name: 'isValid', type: 'boolean', default: false })
  @AutoMap()
  isValid!: boolean;

  @ManyToOne(() => DataEntryBatches, (batch) => batch.universityRows, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'batchId' })
  batch?: DataEntryBatches;
}

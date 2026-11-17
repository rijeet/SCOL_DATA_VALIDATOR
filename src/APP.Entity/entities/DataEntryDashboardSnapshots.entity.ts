import { Entity, Column } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { BaseEntity } from './BaseEntity.template';
import type { DashboardSnapshotPayload } from '@shared/dtos/data-entry/DashboardSnapshotDto';

@Entity('DataEntryDashboardSnapshots')
export class DataEntryDashboardSnapshots extends BaseEntity {
  @Column({ name: 'payload', type: 'jsonb' })
  @AutoMap()
  payload!: DashboardSnapshotPayload;

  @Column({ name: 'updatedByUserId', type: 'uuid', nullable: true })
  @AutoMap()
  updatedByUserId?: string | null;
}

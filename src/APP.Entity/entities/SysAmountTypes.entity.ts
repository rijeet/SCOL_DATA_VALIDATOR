import { Entity, Column, Index } from 'typeorm';
import { AutoMap } from '@automapper/classes';
import { BaseEntity } from './BaseEntity.template';

/**
 * Seeded Amount / Percentage labels for university commission and
 * course scholarship type dropdowns.
 */
@Entity('sys_AmountTypes')
export class SysAmountTypes extends BaseEntity {
  @Column({
    name: 'typeName',
    type: 'varchar',
    length: 50,
    nullable: false,
    unique: true,
  })
  @AutoMap()
  typeName!: string;

  @Column({
    name: 'typeCode',
    type: 'varchar',
    length: 20,
    nullable: false,
    unique: true,
  })
  @AutoMap()
  typeCode!: string;

  @Index()
  @Column({
    name: 'displayOrder',
    type: 'int',
    nullable: false,
  })
  @AutoMap()
  displayOrder!: number;
}

import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { SysAcademicDegrees } from '@entity/entities/SysAcademicDegrees.entity';
import { SysProgrammes } from '@entity/entities/SysProgrammes.entity';
import { SysEnglishTests } from '@entity/entities/SysEnglishTests.entity';

export class DataEntryCatalogLookup {
  private readonly programmes = new Map<string, string>();
  private readonly degrees = new Map<string, string>();
  private readonly englishTests = new Map<string, string>();

  constructor(private readonly manager: EntityManager) {}

  async programme(name: string): Promise<string> {
    const key = name.trim();
    if (!key) {
      throw new BadRequestException('programmeName is required to publish');
    }
    const cached = this.programmes.get(key.toLowerCase());
    if (cached) return cached;

    const existing = await this.manager.findOne(SysProgrammes, {
      where: { name: key },
    });
    if (existing) {
      this.programmes.set(key.toLowerCase(), existing.id);
      return existing.id;
    }

    const created = await this.manager.save(
      SysProgrammes,
      this.manager.create(SysProgrammes, { name: key }),
    );
    this.programmes.set(key.toLowerCase(), created.id);
    return created.id;
  }

  async degree(name: string): Promise<string> {
    const key = name.trim();
    if (!key) {
      throw new BadRequestException('degree name is required to publish');
    }
    const cached = this.degrees.get(key.toLowerCase());
    if (cached) return cached;

    const existing = await this.manager.findOne(SysAcademicDegrees, {
      where: { degreeName: key },
    });
    if (existing) {
      this.degrees.set(key.toLowerCase(), existing.id);
      return existing.id;
    }

    const created = await this.manager.save(
      SysAcademicDegrees,
      this.manager.create(SysAcademicDegrees, {
        degreeName: key,
        levelOrder: 1,
        gpaScale: '4.0',
      }),
    );
    this.degrees.set(key.toLowerCase(), created.id);
    return created.id;
  }

  async englishTest(testName: string): Promise<string> {
    const key = testName.trim().toUpperCase();
    const cached = this.englishTests.get(key);
    if (cached) return cached;

    const existing = await this.manager.findOne(SysEnglishTests, {
      where: { testName: key },
    });
    if (!existing) {
      throw new BadRequestException(
        `English test "${key}" is missing from sys_EnglishTests`,
      );
    }
    this.englishTests.set(key, existing.id);
    return existing.id;
  }
}

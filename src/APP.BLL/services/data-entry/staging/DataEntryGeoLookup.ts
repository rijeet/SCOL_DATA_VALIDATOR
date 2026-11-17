import { BadRequestException } from '@nestjs/common';
import type { EntityManager } from 'typeorm';
import { SysCountries } from '@entity/entities/SysCountries.entity';
import { SysStates } from '@entity/entities/SysStates.entity';
import { SysCities } from '@entity/entities/SysCities.entity';
import { SysUniversities } from '@entity/entities/SysUniversities.entity';

export class DataEntryGeoLookup {
  private readonly countries = new Map<string, string>();
  private readonly states = new Map<string, string>();
  private readonly cities = new Map<string, string>();
  private readonly universities = new Map<string, string>();

  constructor(private readonly manager: EntityManager) {}

  async country(name: string, countryCode?: string): Promise<string> {
    const key = name.trim();
    if (!key) {
      throw new BadRequestException('countryName is required to publish');
    }
    const cacheKey = key.toLowerCase();
    const cached = this.countries.get(cacheKey);
    if (cached) return cached;

    const existing = await this.manager
      .createQueryBuilder(SysCountries, 'c')
      .where('lower(trim(c.countryName)) = :n', { n: cacheKey })
      .andWhere('c.deletedAt IS NULL')
      .getOne();
    if (existing) {
      this.countries.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.manager.save(
      SysCountries,
      this.manager.create(SysCountries, {
        countryName: key,
        countryCode: countryCode?.trim() || undefined,
      }),
    );
    this.countries.set(cacheKey, created.id);
    return created.id;
  }

  async state(countryId: string, name: string): Promise<string | undefined> {
    const key = name.trim();
    if (!key) return undefined;
    const cacheKey = `${countryId}:${key.toLowerCase()}`;
    const cached = this.states.get(cacheKey);
    if (cached) return cached;

    const existing = await this.manager
      .createQueryBuilder(SysStates, 's')
      .where('s.sysCountryId = :countryId', { countryId })
      .andWhere('lower(trim(s.stateName)) = :n', { n: key.toLowerCase() })
      .andWhere('s.deletedAt IS NULL')
      .getOne();
    if (existing) {
      this.states.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.manager.save(
      SysStates,
      this.manager.create(SysStates, {
        sysCountryId: countryId,
        stateName: key,
      }),
    );
    this.states.set(cacheKey, created.id);
    return created.id;
  }

  async city(stateId: string, name: string): Promise<string | undefined> {
    const key = name.trim();
    if (!key) return undefined;
    const cacheKey = `${stateId}:${key.toLowerCase()}`;
    const cached = this.cities.get(cacheKey);
    if (cached) return cached;

    const existing = await this.manager
      .createQueryBuilder(SysCities, 'c')
      .where('c.sysStateId = :stateId', { stateId })
      .andWhere('lower(trim(c.cityName)) = :n', { n: key.toLowerCase() })
      .andWhere('c.deletedAt IS NULL')
      .getOne();
    if (existing) {
      this.cities.set(cacheKey, existing.id);
      return existing.id;
    }

    const created = await this.manager.save(
      SysCities,
      this.manager.create(SysCities, {
        sysStateId: stateId,
        cityName: key,
      }),
    );
    this.cities.set(cacheKey, created.id);
    return created.id;
  }

  async universityByName(uniName: string): Promise<SysUniversities | null> {
    const key = uniName.trim();
    if (!key) return null;
    const cacheKey = key.toLowerCase();
    const cachedId = this.universities.get(cacheKey);
    if (cachedId) {
      return this.manager.findOne(SysUniversities, { where: { id: cachedId } });
    }
    const existing = await this.manager
      .createQueryBuilder(SysUniversities, 'u')
      .where('lower(trim(u.uniName)) = :n', { n: cacheKey })
      .andWhere('u.deletedAt IS NULL')
      .getOne();
    if (existing) {
      this.universities.set(cacheKey, existing.id);
    }
    return existing;
  }

  rememberUniversity(uniName: string, id: string): void {
    this.universities.set(uniName.trim().toLowerCase(), id);
  }
}

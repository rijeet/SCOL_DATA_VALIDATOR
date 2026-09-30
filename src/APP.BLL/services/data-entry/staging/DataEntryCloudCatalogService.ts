import { Injectable, NotFoundException } from '@nestjs/common';
import { CloudinaryUniversityDataService } from '@infra/cloudinary/CloudinaryUniversityData.service';
import {
  DATA_ENTRY_HELPER_CLOUD_PATHS,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';

export interface DataEntryUniversityPackDto {
  universityKey: string;
  displayName: string;
  csvObjectKey: string | null;
  helpersPresent: DataEntryHelperKey[];
  helpersMissing: DataEntryHelperKey[];
}

@Injectable()
export class DataEntryCloudCatalogService {
  constructor(private readonly cloudinary: CloudinaryUniversityDataService) {}

  async listUniversityPacks(): Promise<DataEntryUniversityPackDto[]> {
    const keys = await this.cloudinary.listUniversityKeys();
    const packs: DataEntryUniversityPackDto[] = [];

    for (const universityKey of keys) {
      const resources =
        await this.cloudinary.listUniversityResources(universityKey);
      const csvPublicId = this.cloudinary.findReviewedCsvPublicId(
        universityKey,
        resources,
      );

      const helpersPresent: DataEntryHelperKey[] = [];
      const helpersMissing: DataEntryHelperKey[] = [];
      for (const helperKey of Object.keys(
        DATA_ENTRY_HELPER_CLOUD_PATHS,
      ) as DataEntryHelperKey[]) {
        const id = this.cloudinary.findHelperPublicId(
          universityKey,
          helperKey,
          resources,
        );
        if (id) {
          helpersPresent.push(helperKey);
        } else {
          helpersMissing.push(helperKey);
        }
      }

      packs.push({
        universityKey,
        displayName: universityKey,
        csvObjectKey: csvPublicId,
        helpersPresent,
        helpersMissing,
      });
    }

    return packs;
  }

  async resolvePack(universityKey: string): Promise<{
    csvPublicId: string;
    helperPublicIds: Partial<Record<DataEntryHelperKey, string>>;
  }> {
    const resources =
      await this.cloudinary.listUniversityResources(universityKey);
    const csvPublicId = this.cloudinary.findReviewedCsvPublicId(
      universityKey,
      resources,
    );
    if (!csvPublicId) {
      throw new NotFoundException(
        `No *_reviewed.csv at university root for "${universityKey}" in SCOL_DATA`,
      );
    }

    const helperPublicIds: Partial<Record<DataEntryHelperKey, string>> = {};
    for (const helperKey of Object.keys(
      DATA_ENTRY_HELPER_CLOUD_PATHS,
    ) as DataEntryHelperKey[]) {
      const id = this.cloudinary.findHelperPublicId(
        universityKey,
        helperKey,
        resources,
      );
      if (id) {
        helperPublicIds[helperKey] = id;
      }
    }

    return { csvPublicId, helperPublicIds };
  }

  async readCsvText(universityKey: string): Promise<string> {
    const { csvPublicId } = await this.resolvePack(universityKey);
    return this.cloudinary.fetchRawText(csvPublicId);
  }

  async readHelperMarkdown(
    universityKey: string,
    helper: DataEntryHelperKey,
  ): Promise<string> {
    const { helperPublicIds } = await this.resolvePack(universityKey);
    const publicId = helperPublicIds[helper];
    if (!publicId) {
      throw new NotFoundException(
        `Helper "${helper}" (${DATA_ENTRY_HELPER_CLOUD_PATHS[helper]}) not found for "${universityKey}"`,
      );
    }
    return this.cloudinary.fetchRawText(publicId);
  }
}

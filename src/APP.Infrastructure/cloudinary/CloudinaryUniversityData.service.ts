import {
  Injectable,
  Logger,
  OnModuleInit,
  ServiceUnavailableException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary } from 'cloudinary';
import {
  DATA_ENTRY_HELPER_CLOUD_PATHS,
  DATA_ENTRY_REVIEWED_CSV_MARKER,
  type DataEntryHelperKey,
} from '@shared/constants/dataEntryCloud.constants';

type RawResource = {
  public_id: string;
  secure_url?: string;
};

const ROOT_MARKER_PUBLIC_ID_SUFFIX = '_scol_data_root';
const RAW_INDEX_TTL_MS = 5 * 60 * 1000;

type CloudinaryApiErrorShape = {
  error?: { message?: string; http_code?: number };
  http_code?: number;
  message?: string;
};

@Injectable()
export class CloudinaryUniversityDataService implements OnModuleInit {
  private readonly logger = new Logger(CloudinaryUniversityDataService.name);
  private configured = false;
  private rootEnsurePromise: Promise<void> | null = null;
  private rawIndexCache: { fetchedAt: number; resources: RawResource[] } | null =
    null;

  constructor(private readonly config: ConfigService) {
    const cloudName = this.config.get<string>('CLOUDINARY_CLOUD_NAME');
    const apiKey = this.config.get<string>('CLOUDINARY_API_KEY');
    const apiSecret = this.config.get<string>('CLOUDINARY_API_SECRET');
    if (cloudName && apiKey && apiSecret) {
      cloudinary.config({
        cloud_name: cloudName,
        api_key: apiKey,
        api_secret: apiSecret,
        secure: true,
      });
      this.configured = true;
    }
  }

  private get rootFolder(): string {
    const raw =
      this.config.get<string>('DATA_ENTRY_CLOUD_ROOT') ??
      'SCOL_DATA';
    return raw.replace(/^\/+|\/+$/g, '');
  }

  private assertConfigured(): void {
    if (!this.configured) {
      throw new ServiceUnavailableException(
        'Cloudinary is not configured (CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET)',
      );
    }
  }

  private parseCloudinaryApiError(err: unknown): {
    message: string;
    httpCode?: number;
  } {
    const e = err as CloudinaryApiErrorShape;
    const httpCode = e?.error?.http_code ?? e?.http_code;
    const message =
      e?.error?.message ??
      (typeof e?.message === 'string' ? e.message : undefined) ??
      'Unknown Cloudinary API error';
    return { message, httpCode };
  }

  private unavailableFromCloudinary(err: unknown): ServiceUnavailableException {
    const { message, httpCode } = this.parseCloudinaryApiError(err);
    if (httpCode === 420) {
      return new ServiceUnavailableException(
        `Cloudinary API rate limit reached (resets hourly). ${message}`,
      );
    }
    return new ServiceUnavailableException(
      `Could not list Cloudinary folders. Upload a folder under SCOL_DATA in Cloudinary. (${message})`,
    );
  }

  uniPrefix(universityKey: string): string {
    return `${this.rootFolder}/${universityKey}`;
  }

  async onModuleInit(): Promise<void> {
    if (this.configured) {
      await this.ensureRootFolderExists();
    }
  }

  /**
   * Cloudinary has no empty folders — upload a tiny raw marker so `SCOL_DATA` exists.
   */
  async ensureRootFolderExists(): Promise<void> {
    if (!this.configured) {
      return;
    }
    if (this.rootEnsurePromise) {
      return this.rootEnsurePromise;
    }
    this.rootEnsurePromise = this.doEnsureRootFolder();
    return this.rootEnsurePromise;
  }

  private async doEnsureRootFolder(): Promise<void> {
    this.assertConfigured();
    const markerPublicId = `${this.rootFolder}/${ROOT_MARKER_PUBLIC_ID_SUFFIX}`;
    try {
      await cloudinary.api.resource(markerPublicId, { resource_type: 'raw' });
      return;
    } catch {
      /* create below */
    }

    const readme = [
      'SCOL data-entry root folder.',
      'Add one subfolder per university, e.g.:',
      `  ${this.rootFolder}/Anglia Ruskin University - ARU/`,
      '  - *_reviewed.csv at university root',
      '  - clean/uni/*.md helpers',
    ].join('\n');

    try {
      await cloudinary.uploader.upload(
        `data:text/plain;base64,${Buffer.from(readme, 'utf8').toString('base64')}`,
        {
          resource_type: 'raw',
          public_id: markerPublicId,
          overwrite: false,
        },
      );
      this.logger.log(`Cloudinary folder created: ${this.rootFolder}`);
    } catch (err: unknown) {
      const http = (err as { http_code?: number })?.http_code;
      const message = String((err as Error)?.message ?? err);
      if (http === 409 || message.toLowerCase().includes('already exists')) {
        return;
      }
      this.logger.warn(
        `Could not create Cloudinary root "${this.rootFolder}": ${message}`,
      );
    }
  }

  async listUniversityKeys(): Promise<string[]> {
    this.assertConfigured();
    await this.ensureRootFolderExists();
    try {
      const res = await cloudinary.api.sub_folders(this.rootFolder);
      const folders = (res.folders ?? []) as { name: string }[];
      if (folders.length > 0) {
        return folders.map((f) => f.name).sort((a, b) => a.localeCompare(b));
      }
    } catch (err: unknown) {
      const http = (err as { http_code?: number })?.http_code;
      if (http === 404) {
        return [];
      }
      this.logger.debug(
        `Cloudinary sub_folders("${this.rootFolder}") unavailable; listing raw assets instead.`,
      );
    }
    const resources = await this.fetchAllRawUnderRoot();
    return this.universityKeysFromRawResources(resources);
  }

  /** Raw uploads use public_id paths; sub_folders often does not see them. */
  private universityKeysFromRawResources(resources: RawResource[]): string[] {
    const prefix = `${this.rootFolder}/`;
    const keys = new Set<string>();
    for (const r of resources) {
      const rel = r.public_id.startsWith(prefix)
        ? r.public_id.slice(prefix.length)
        : r.public_id;
      const first = rel.split('/')[0]?.trim();
      if (!first || first === ROOT_MARKER_PUBLIC_ID_SUFFIX) {
        continue;
      }
      keys.add(first);
    }
    return [...keys].sort((a, b) => a.localeCompare(b));
  }

  /**
   * One paginated Admin API list under SCOL_DATA (cached). Per-university lists filter this
   * index instead of issuing N separate list calls.
   */
  async fetchAllRawUnderRoot(forceRefresh = false): Promise<RawResource[]> {
    this.assertConfigured();
    const now = Date.now();
    if (
      !forceRefresh &&
      this.rawIndexCache &&
      now - this.rawIndexCache.fetchedAt < RAW_INDEX_TTL_MS
    ) {
      return this.rawIndexCache.resources;
    }

    const prefix = `${this.rootFolder}/`;
    const out: RawResource[] = [];
    try {
      let nextCursor: string | undefined;
      do {
        const res = await cloudinary.api.resources({
          resource_type: 'raw',
          type: 'upload',
          prefix,
          max_results: 500,
          ...(nextCursor ? { next_cursor: nextCursor } : {}),
        });
        out.push(...((res.resources ?? []) as RawResource[]));
        nextCursor = res.next_cursor as string | undefined;
      } while (nextCursor);
      this.rawIndexCache = { fetchedAt: now, resources: out };
      return out;
    } catch (err: unknown) {
      const { message, httpCode } = this.parseCloudinaryApiError(err);
      this.logger.warn(
        `Cloudinary raw list failed (http ${httpCode ?? 'n/a'}): ${message}`,
      );
      if (this.rawIndexCache) {
        this.logger.warn(
          'Serving cached SCOL_DATA raw index after Cloudinary error.',
        );
        return this.rawIndexCache.resources;
      }
      throw this.unavailableFromCloudinary(err);
    }
  }

  private async listRawUnderPrefix(prefix: string): Promise<RawResource[]> {
    this.assertConfigured();
    const all = await this.fetchAllRawUnderRoot();
    return all.filter((r) => r.public_id.startsWith(prefix));
  }

  async listUniversityResources(universityKey: string): Promise<RawResource[]> {
    return this.listRawUnderPrefix(this.uniPrefix(universityKey));
  }

  findReviewedCsvPublicId(
    universityKey: string,
    resources: RawResource[],
  ): string | null {
    const uniRoot = this.uniPrefix(universityKey);
    const candidates = resources.filter((r) => {
      const id = r.public_id;
      if (!id.startsWith(uniRoot)) {
        return false;
      }
      const rel = id.slice(uniRoot.length).replace(/^\//, '');
      if (rel.includes('/')) {
        return false;
      }
      return id.includes(DATA_ENTRY_REVIEWED_CSV_MARKER);
    });
    if (candidates.length === 0) {
      return null;
    }
    candidates.sort((a, b) => a.public_id.localeCompare(b.public_id));
    return candidates[0].public_id;
  }

  findHelperPublicId(
    universityKey: string,
    helper: DataEntryHelperKey,
    resources: RawResource[],
  ): string | null {
    const rel = DATA_ENTRY_HELPER_CLOUD_PATHS[helper];
    const full = `${this.uniPrefix(universityKey)}/${rel}`;
    const withoutExt = full.replace(/\.md$/i, '');
    const match = resources.find((r) => {
      const id = r.public_id;
      return (
        id === full ||
        id === withoutExt ||
        id.endsWith(`/${rel}`) ||
        id.endsWith(`/${rel.replace(/\.md$/i, '')}`)
      );
    });
    return match?.public_id ?? null;
  }

  async fetchRawText(publicId: string): Promise<string> {
    this.assertConfigured();
    const url = cloudinary.url(publicId, {
      resource_type: 'raw',
      type: 'upload',
      sign_url: true,
    });
    const res = await fetch(url);
    if (!res.ok) {
      throw new NotFoundException(
        `Could not download Cloudinary asset: ${publicId}`,
      );
    }
    return res.text();
  }
}

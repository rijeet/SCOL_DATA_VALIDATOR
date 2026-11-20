import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IStorageService } from '@shared/interfaces/IStorageService.interface';


const DEFAULT_UPLOAD_URL_EXPIRES_IN = 3600; // 1 hour
const DOWNLOAD_URL_EXPIRES_IN = 3600; // 1 hour

@Injectable()
export class BackblazeStorageService implements IStorageService {
  private readonly client: S3Client | null;
  private readonly bucket: string;

  constructor(private readonly config: ConfigService) {
    const storage = this.config.get<{
      keyId?: string;
      applicationKey?: string;
      bucketName?: string;
      endpoint?: string;
      region?: string;
    }>('storage');

    this.bucket = storage?.bucketName?.trim() ?? '';
    const keyId = storage?.keyId?.trim() ?? '';
    const applicationKey = storage?.applicationKey?.trim() ?? '';
    const endpoint = storage?.endpoint;
    if (keyId && applicationKey && endpoint && this.bucket) {
      this.client = new S3Client({
        endpoint,
        region: storage?.region ?? 'us-east-005',
        credentials: {
          accessKeyId: keyId,
          secretAccessKey: applicationKey,
        },
        forcePathStyle: true,
      });
    } else {
      this.client = null;
    }
  }

  private requireClient(): S3Client {
    if (!this.client || !this.bucket) {
      throw new ServiceUnavailableException(
        'Private storage is not configured. Set B2_KEY_ID, B2_APPLICATION_KEY, B2_BUCKET_NAME, and B2_ENDPOINT.',
      );
    }
    return this.client;
  }

  async generateUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds: number = DEFAULT_UPLOAD_URL_EXPIRES_IN,
  ): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: mimeType,
    });
    return getSignedUrl(this.requireClient(), command, {
      expiresIn: expiresInSeconds,
    });
  }

  async generateDownloadUrl(key: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });
    return getSignedUrl(this.requireClient(), command, {
      expiresIn: DOWNLOAD_URL_EXPIRES_IN,
    });
  }

  async objectExists(key: string): Promise<boolean> {
    try {
      await this.requireClient().send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return true;
    } catch (err: unknown) {
      const code = (err as { name?: string })?.name;
      if (code === 'NotFound' || code === 'NoSuchKey') {
        return false;
      }
      throw err;
    }
  }

  async deleteObject(key: string): Promise<void> {
    await this.requireClient().send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  async listCommonPrefixes(prefix: string): Promise<string[]> {
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const res = await this.requireClient().send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: normalized,
        Delimiter: '/',
      }),
    );
    return (res.CommonPrefixes ?? [])
      .map((p) => p.Prefix ?? '')
      .filter(Boolean);
  }

  async listObjectKeys(prefix: string): Promise<string[]> {
    const normalized = prefix.endsWith('/') ? prefix : `${prefix}/`;
    const res = await this.requireClient().send(
      new ListObjectsV2Command({
        Bucket: this.bucket,
        Prefix: normalized,
        Delimiter: '/',
      }),
    );
    return (res.Contents ?? [])
      .map((c) => c.Key ?? '')
      .filter((k) => k && k !== normalized);
  }

  async getObjectAsText(key: string): Promise<string> {
    const res = await this.requireClient().send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    const body = res.Body;
    if (!body) {
      return '';
    }
    return await body.transformToString('utf-8');
  }
}

/**
 * Storage Service Interface
 *
 * Abstraction for object storage (e.g. Backblaze B2).
 * Used for presigned upload/download URLs; files do not pass through the API.
 */
export interface IStorageService {
  generateUploadUrl(
    key: string,
    mimeType: string,
    expiresInSeconds?: number,
  ): Promise<string>;
  generateDownloadUrl(key: string): Promise<string>;
  objectExists(key: string): Promise<boolean>;
  deleteObject(key: string): Promise<void>;
  /** List immediate child "folders" under `prefix` (S3 common prefixes). */
  listCommonPrefixes(prefix: string): Promise<string[]>;
  /** List object keys directly under `prefix` (non-recursive). */
  listObjectKeys(prefix: string): Promise<string[]>;
  getObjectAsText(key: string): Promise<string>;
}

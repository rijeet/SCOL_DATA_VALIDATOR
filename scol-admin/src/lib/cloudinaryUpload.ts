export type CloudinarySignedUpload = {
  uploadUrl: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  publicId: string;
  folder?: string;
  resourceType: 'raw' | 'image';
  overwrite: string;
  tags?: string;
};

export async function uploadFileToCloudinary(
  file: File,
  signed: CloudinarySignedUpload,
): Promise<{ publicId: string; secureUrl?: string }> {
  const body = new FormData();
  body.append('file', file);
  body.append('api_key', signed.apiKey);
  body.append('timestamp', String(signed.timestamp));
  body.append('signature', signed.signature);
  body.append('public_id', signed.publicId);
  body.append('overwrite', signed.overwrite || 'true');
  if (signed.folder) {
    body.append('folder', signed.folder);
  }
  if (signed.tags) {
    body.append('tags', signed.tags);
  }
  const res = await fetch(signed.uploadUrl, { method: 'POST', body });
  const text = await res.text();
  let json: {
    error?: { message?: string };
    public_id?: string;
    secure_url?: string;
  } | null = null;
  try {
    json = JSON.parse(text) as {
      error?: { message?: string };
      public_id?: string;
      secure_url?: string;
    };
  } catch {
    json = null;
  }
  if (!res.ok || json?.error) {
    throw new Error(
      json?.error?.message || text || `Cloudinary upload failed (${res.status})`,
    );
  }
  return {
    publicId: json?.public_id || signed.publicId,
    secureUrl: json?.secure_url,
  };
}

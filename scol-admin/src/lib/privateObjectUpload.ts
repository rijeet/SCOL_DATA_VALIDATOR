export type PrivateObjectUpload = {
  uploadUrl: string;
  storageKey: string;
  headers?: Record<string, string>;
};

export async function uploadPrivateObject(
  file: File,
  ticket: PrivateObjectUpload,
): Promise<void> {
  if (!ticket.uploadUrl) {
    throw new Error('The server did not return an upload URL.');
  }
  const put = await fetch(ticket.uploadUrl, {
    method: 'PUT',
    headers: ticket.headers ?? {},
    body: file,
  });
  if (!put.ok) {
    throw new Error(`Upload failed (${put.status}). Please try again.`);
  }
}

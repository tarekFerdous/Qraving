export type UploadErrorReason =
  | 'not_authenticated'
  | 'not_authorized'
  | 'invalid_file'
  | 'service_unavailable'
  | 'unknown';

const UPLOAD_ERROR_MESSAGES: Record<UploadErrorReason, string> = {
  not_authenticated: 'Your session has expired. Please log in again.',
  not_authorized: "You don't have permission to upload here.",
  invalid_file: 'File is too large. Please choose a smaller image.',
  service_unavailable: 'Upload service is temporarily unavailable. Please try again later.',
  unknown: 'Upload failed. Please try again.',
};

export function messageForUploadErrorReason(reason: string | undefined | null): string {
  if (reason && reason in UPLOAD_ERROR_MESSAGES) {
    return UPLOAD_ERROR_MESSAGES[reason as UploadErrorReason];
  }
  return UPLOAD_ERROR_MESSAGES.unknown;
}

/**
 * Fetches a Vercel Blob client token via a plain fetch (rather than the
 * high-level `upload()` helper) so that a failure response's JSON body —
 * including our `reason` field — is actually readable. `upload()` discards
 * the response body and throws a fixed generic error on any non-2xx status.
 */
export async function requestUploadClientToken(
  handleUploadUrl: string,
  pathname: string,
): Promise<{ ok: true; clientToken: string } | { ok: false; reason: UploadErrorReason }> {
  try {
    const res = await fetch(handleUploadUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        type: 'blob.generate-client-token',
        payload: { pathname, multipart: false, clientPayload: null },
      }),
    });

    if (!res.ok) {
      const data = (await res.json().catch(() => null)) as { reason?: string } | null;
      const reason = data?.reason;
      return { ok: false, reason: reason && reason in UPLOAD_ERROR_MESSAGES ? (reason as UploadErrorReason) : 'unknown' };
    }

    const data = (await res.json()) as { clientToken: string };
    return { ok: true, clientToken: data.clientToken };
  } catch {
    return { ok: false, reason: 'unknown' };
  }
}

import {
  API_BASE,
  attemptTokenRefresh,
  dispatchUnauthorized,
  getAccessToken,
} from './auth';
import { isCloudinaryConfigured, uploadToCloudinary } from './cloudinary';

/**
 * Upload offer image:
 * 1. Cloudinary direct (if VITE_CLOUDINARY_* set) — permanent HTTPS URL, no CORP issues.
 * 2. API multipart POST /api/upload/offer-image (JWT) — Cloudinary server-side if
 *    CLOUDINARY_API_KEY/SECRET set on API, else local disk under /uploads/offers.
 */
async function postUpload(file: File, token: string | null): Promise<Response> {
  const formData = new FormData();
  formData.append('file', file);

  return fetch(`${API_BASE}/upload/offer-image`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData,
  });
}

async function uploadViaApi(file: File): Promise<string> {
  let token = getAccessToken();
  let response = await postUpload(file, token);

  if (response.status === 401) {
    const refreshed = await attemptTokenRefresh();
    if (refreshed) {
      token = refreshed;
      response = await postUpload(file, token);
    } else {
      dispatchUnauthorized();
      throw new Error('Your session has expired. Please sign in again.');
    }
  }

  if (!response.ok) {
    let message = `Upload failed (${response.status})`;
    try {
      const err = await response.json();
      message = err.message || message;
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }

  const data = await response.json();
  if (!data?.url || typeof data.url !== 'string') {
    throw new Error('Upload did not return a URL.');
  }
  return data.url;
}

export async function uploadProductImage(file: File): Promise<string> {
  if (isCloudinaryConfigured()) {
    try {
      return await uploadToCloudinary(file, 'agrimarket/offers');
    } catch (err) {
      console.warn('[upload] Cloudinary direct failed, falling back to API:', err);
    }
  }
  return uploadViaApi(file);
}

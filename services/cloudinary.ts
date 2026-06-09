/**
 * Browser-direct Cloudinary upload (unsigned preset).
 * Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET in .env.
 */

const CLOUD_NAME = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME as string | undefined;
const UPLOAD_PRESET = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET as string | undefined;

export const isCloudinaryConfigured = (): boolean =>
  Boolean(CLOUD_NAME && UPLOAD_PRESET);

export async function uploadToCloudinary(
  file: File,
  folder = 'agrimarket/offers',
): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) {
    throw new Error(
      'Cloudinary is not configured. Set VITE_CLOUDINARY_CLOUD_NAME and VITE_CLOUDINARY_UPLOAD_PRESET.',
    );
  }
  const url = `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`;
  const form = new FormData();
  form.append('file', file);
  form.append('upload_preset', UPLOAD_PRESET);
  form.append('folder', folder);

  const res = await fetch(url, { method: 'POST', body: form });
  if (!res.ok) {
    let message = `Cloudinary upload failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.error?.message) message = String(body.error.message);
    } catch {
      /* ignore */
    }
    throw new Error(message);
  }
  const data = await res.json();
  if (!data?.secure_url) {
    throw new Error('Cloudinary did not return a URL.');
  }
  return String(data.secure_url);
}

/** Placeholder when offer has no imageUrl (avoids React warning for src=""). */
export const PRODUCT_IMAGE_PLACEHOLDER =
  'https://placehold.co/96x96/e5e7eb/6b7280?text=No+image';

/** Rewrite API-origin local upload URLs to Vite-relative paths (proxied in vite.config). */
function toProxiedUploadUrl(url: string): string {
  try {
    const parsed = new URL(url);
    if (
      (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1') &&
      parsed.pathname.startsWith('/uploads/')
    ) {
      return `${parsed.pathname}${parsed.search}`;
    }
  } catch {
    /* not an absolute URL */
  }
  if (url.startsWith('/uploads/')) return url;
  return url;
}

/**
 * Safe src for <img>: never pass "" (React warns and browsers may refetch the page).
 * Local API upload URLs are rewritten for the Vite /uploads proxy to avoid CORP errors.
 */
export function resolveProductImageSrc(url?: string | null): string {
  const trimmed = String(url ?? '').trim();
  if (!trimmed || trimmed === 'null' || trimmed === 'undefined') {
    return PRODUCT_IMAGE_PLACEHOLDER;
  }
  return toProxiedUploadUrl(trimmed);
}

/** True if value is a data URL or blob URL (must be uploaded before API create). */
export function isInlineImageData(url?: string | null): boolean {
  const v = String(url ?? '').trim();
  return v.startsWith('data:') || v.startsWith('blob:');
}

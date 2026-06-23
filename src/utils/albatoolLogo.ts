/**
 * Helper to get the Albatool logo URL for all printable/exportable surfaces.
 *
 * The logo file is hosted on Lovable's CDN at /__l5e/assets-v1/... .
 * We must serve it as an ABSOLUTE URL because most templates are rendered
 * inside printed popup windows (`about:blank`) or in iframes opened via
 * `document.write(html)` where relative URLs have no base to resolve against.
 */

export const ALBATOOL_LOGO_PATH =
  "/__l5e/assets-v1/500bd936-6a3c-4957-91cc-bfbfd7703993/albatool-logo.png";

export function getAlbatoolLogoUrl(): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return origin + ALBATOOL_LOGO_PATH;
}

/**
 * Resolve a company logo URL into a printable absolute URL.
 * - If empty/null, returns the Albatool default logo.
 * - If absolute (http/https/data), returns as-is.
 * - If relative (e.g. stored as /__l5e/...), prepends the current origin.
 */
export function resolveLogoUrl(logoUrl?: string | null): string {
  const fallback = getAlbatoolLogoUrl();
  if (!logoUrl) return fallback;
  if (/^(https?:|data:)/i.test(logoUrl)) return logoUrl;
  if (logoUrl.startsWith("/")) {
    const origin = typeof window !== "undefined" ? window.location.origin : "";
    return origin + logoUrl;
  }
  return logoUrl;
}

/**
 * Shared auth/token helpers for the AgriAdmin frontend.
 *
 * The NestJS API issues short-lived access tokens (JWT_EXPIRATION_TIME=15m in
 * API .env) and longer-lived refresh tokens. Without rotation the dashboard
 * would fail after ~15 minutes idle — which is exactly what was happening on
 * POST /api/upload/offer-image (returns 401 once the bearer expires).
 *
 * The flow:
 *   1. fetchClient / uploadProductImage call the API with the current access token.
 *   2. On 401, they delegate to `attemptTokenRefresh()`.
 *   3. If a refresh token is available and POST /auth/refresh succeeds, the new
 *      access token (and rotated refresh token, when returned in body) is stored
 *      and the original request is retried once.
 *   4. If refresh fails, all tokens are cleared and `auth:unauthorized` is fired
 *      so App.tsx can drop the user back on the login screen.
 *
 * Refresh is single-flighted: many concurrent 401s share the same in-flight
 * refresh promise so we never spam /auth/refresh.
 */

export const ACCESS_TOKEN_KEY = "agriadmin_token";
export const REFRESH_TOKEN_KEY = "agriadmin_refresh_token";

export const API_BASE: string =
  (import.meta.env.VITE_API_URL as string | undefined) || "/api";

export function getAccessToken(): string | null {
  return localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string | null): void {
  if (token) localStorage.setItem(ACCESS_TOKEN_KEY, token);
  else localStorage.removeItem(ACCESS_TOKEN_KEY);
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

export function setRefreshToken(token: string | null): void {
  if (token) localStorage.setItem(REFRESH_TOKEN_KEY, token);
  else localStorage.removeItem(REFRESH_TOKEN_KEY);
}

export function clearTokens(): void {
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  localStorage.removeItem(REFRESH_TOKEN_KEY);
}

let inFlightRefresh: Promise<string | null> | null = null;

/**
 * Try once to swap the stored refresh token for a fresh access token.
 * Returns the new access token, or null on failure (caller should treat as logout).
 */
export function attemptTokenRefresh(): Promise<string | null> {
  if (inFlightRefresh) return inFlightRefresh;

  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    return Promise.resolve(null);
  }

  inFlightRefresh = (async () => {
    try {
      const res = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
      if (!res.ok) return null;
      const data = (await res.json()) as {
        accessToken?: string;
        refreshToken?: string;
      };
      if (!data?.accessToken) return null;
      setAccessToken(data.accessToken);
      if (data.refreshToken) setRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch {
      return null;
    } finally {
      // Release the latch on next tick so concurrent callers all see the same result.
      setTimeout(() => {
        inFlightRefresh = null;
      }, 0);
    }
  })();

  return inFlightRefresh;
}

export function dispatchUnauthorized(): void {
  clearTokens();
  window.dispatchEvent(new Event("auth:unauthorized"));
}

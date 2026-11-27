import { authService } from '../services/authService';

/**
 * Builds authenticated headers for protected admin/staff backend endpoints
 * using the in-memory server-verified session token.
 */
export async function getAdminAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extraHeaders };

  const adminSessionToken = authService.getSessionToken();
  if (adminSessionToken) {
    headers.Authorization = `Bearer ${adminSessionToken}`;
    headers['X-Admin-Session'] = adminSessionToken;
  }

  return headers;
}

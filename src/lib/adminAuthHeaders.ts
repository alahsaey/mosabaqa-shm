import { auth } from './firebase';
import { biometricService } from '../services/biometricService';

/**
 * Builds authenticated headers for protected admin/staff backend endpoints.
 * Supports both Firebase Google Auth ID tokens and server-issued WebAuthn admin sessions.
 */
export async function getAdminAuthHeaders(
  extraHeaders: Record<string, string> = {}
): Promise<Record<string, string>> {
  const headers: Record<string, string> = { ...extraHeaders };

  try {
    if (auth.currentUser) {
      const idToken = await auth.currentUser.getIdToken();
      if (idToken) {
        headers.Authorization = `Bearer ${idToken}`;
      }
    }
  } catch {
    // Fall back to biometric session token if available
  }

  const adminSessionToken = biometricService.getStoredSessionToken();
  if (adminSessionToken) {
    headers['X-Admin-Session'] = adminSessionToken;
  }

  return headers;
}

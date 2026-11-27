import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { dataService } from '../lib/dataService';
import { getAdminAuthHeaders } from '../lib/adminAuthHeaders';
import { authService, normalizeUsername } from './authService';
import { AdminPasskeyRecord, AuthSessionUser } from '../types';

const PASSKEYS_STORAGE_KEY = 'abf_user_passkeys_v2';
const LOCAL_CREDENTIAL_HINT_KEY = 'abf_webauthn_credential_hint_v2';

const passkeyListeners = new Set<(passkeys: AdminPasskeyRecord[]) => void>();

export function detectDeviceName(): string {
  if (typeof navigator === 'undefined') return 'جهاز غير معروف';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'هاتف Android (بصمة الإصبع / القفل)';
  if (/iphone|ipad|ipod/i.test(ua)) return 'جهاز Apple (Face ID / Touch ID)';
  if (/macintosh/i.test(ua)) return 'حاسوب Mac (Touch ID)';
  if (/windows/i.test(ua)) return 'حاسوب Windows (Windows Hello)';
  if (/linux/i.test(ua)) return 'جهاز Linux';
  return 'متصفح معتمد';
}

export function isWebAuthnAvailableInWindow(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.PublicKeyCredential !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    Boolean(navigator.credentials) &&
    browserSupportsWebAuthn()
  );
}

function bufferToBase64Url(buf: ArrayBuffer | Uint8Array): string {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let bin = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  const pad = '='.repeat((4 - (base64url.length % 4)) % 4);
  const b64 = (base64url + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) {
    out[i] = raw.charCodeAt(i);
  }
  return out;
}

function readLocalPasskeys(): AdminPasskeyRecord[] {
  try {
    const raw = localStorage.getItem(PASSKEYS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((p) => p && p.credentialId && p.userId) : [];
  } catch {
    return [];
  }
}

function writeLocalPasskeys(passkeys: AdminPasskeyRecord[]): AdminPasskeyRecord[] {
  try {
    localStorage.setItem(PASSKEYS_STORAGE_KEY, JSON.stringify(passkeys));
  } catch {}
  passkeyListeners.forEach((cb) => cb(passkeys));
  return passkeys;
}

function syncUserCredentialList(userId: string, allPasskeys: AdminPasskeyRecord[]) {
  const activeIds = allPasskeys
    .filter((p) => p.userId === userId && p.isActive !== false)
    .map((p) => p.credentialId);
  authService.syncUserBiometrics(userId, activeIds);
}

export const biometricService = {
  getLocalCredentialHint(): string | null {
    try {
      return localStorage.getItem(LOCAL_CREDENTIAL_HINT_KEY);
    } catch {
      return null;
    }
  },

  async isPlatformSupported(): Promise<boolean> {
    try {
      if (!isWebAuthnAvailableInWindow()) return false;
      if (typeof window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable === 'function') {
        const available = await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
        if (available) return true;
      }
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
    }
  },

  listPasskeys(userId?: string): AdminPasskeyRecord[] {
    const all = readLocalPasskeys().filter((p) => p.isActive !== false);
    if (!userId) return all;
    return all.filter((p) => p.userId === userId);
  },

  subscribePasskeys(callback: (passkeys: AdminPasskeyRecord[]) => void, userId?: string): () => void {
    const wrapped = (all: AdminPasskeyRecord[]) => {
      const active = all.filter((p) => p.isActive !== false);
      callback(userId ? active.filter((p) => p.userId === userId) : active);
    };
    passkeyListeners.add(wrapped);
    wrapped(readLocalPasskeys());
    return () => {
      passkeyListeners.delete(wrapped);
    };
  },

  /**
   * Returns active passkeys eligible for biometric login on this device,
   * optionally narrowed by a typed username. Only returns passkeys whose
   * linked user account is currently active and has biometricEnabled=true.
   */
  getEligiblePasskeys(usernameHint?: string): AdminPasskeyRecord[] {
    const cleanHint = usernameHint ? normalizeUsername(usernameHint) : '';
    const all = readLocalPasskeys().filter((p) => p.isActive !== false);

    return all.filter((pk) => {
      const user = authService.findUserById(pk.userId) || authService.findUserByUsername(pk.username);
      if (!user || !user.isActive || !user.biometricEnabled) return false;
      if (cleanHint && normalizeUsername(user.username) !== cleanHint) return false;
      return true;
    });
  },

  async hasRegisteredPasskey(usernameHint?: string): Promise<{
    supported: boolean;
    hasAny: boolean;
    thisDeviceMatch: AdminPasskeyRecord | null;
    allPasskeys: AdminPasskeyRecord[];
  }> {
    const supported = await this.isPlatformSupported();
    const eligible = this.getEligiblePasskeys(usernameHint);
    const localId = this.getLocalCredentialHint();
    const thisDeviceMatch =
      (localId && eligible.find((p) => p.credentialId === localId)) || eligible[0] || null;
    return {
      supported,
      hasAny: eligible.length > 0,
      thisDeviceMatch,
      allPasskeys: eligible,
    };
  },

  /**
   * Enrolls this device's biometric authenticator (Fingerprint / Face ID / Windows Hello)
   * directly for the currently logged-in user (super_admin, admin, or operator).
   * Uses server-verified WebAuthn when Express is reachable, and native WebAuthn API on static hosts.
   */
  async enrollDeviceForUser(
    user: AuthSessionUser,
    customDeviceLabel?: string
  ): Promise<{
    success: boolean;
    passkey?: AdminPasskeyRecord;
    error?: string;
  }> {
    const deviceName = customDeviceLabel?.trim() || detectDeviceName();

    try {
      if (!isWebAuthnAvailableInWindow()) {
        return {
          success: false,
          error: 'المتصفح أو الجهاز الحالي لا يدعم تقنية البصمة ومفاتيح المرور (WebAuthn).',
        };
      }

      const existing = readLocalPasskeys();
      const userPasskeys = existing.filter((p) => p.userId === user.id && p.isActive !== false);
      let createdPasskey: AdminPasskeyRecord | null = null;

      // 1. Try server-verified WebAuthn registration if Express backend is reachable
      if (authService.getSessionToken()) {
        try {
          const headers = await getAdminAuthHeaders({ 'Content-Type': 'application/json' });
          const optsRes = await fetch('/api/auth/webauthn/register-options', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              clientOrigin: window.location.origin,
              excludeCredentialIds: userPasskeys.map((p) => p.credentialId),
            }),
          });

          const optsCT = optsRes.headers.get('content-type') || '';
          if (optsRes.ok && optsCT.includes('application/json')) {
            const optsData = await optsRes.json();
            const registrationResponse = await startRegistration({
              optionsJSON: optsData.options,
            });

            const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
              method: 'POST',
              headers,
              body: JSON.stringify({
                registrationResponse,
                challengeToken: optsData.challengeToken,
                deviceName,
              }),
            });

            const verifyCT = verifyRes.headers.get('content-type') || '';
            if (verifyRes.ok && verifyCT.includes('application/json')) {
              const verifyData = await verifyRes.json();
              if (verifyData?.verified && verifyData?.passkey) {
                createdPasskey = {
                  ...verifyData.passkey,
                  id: verifyData.passkey.credentialId,
                  userId: user.id,
                  username: user.username,
                  fullName: user.fullName,
                  role: user.role,
                  verificationMode: 'server',
                  createdAt: new Date().toISOString(),
                };
              }
            }
          }
        } catch (serverErr: any) {
          // If user explicitly cancelled the biometric prompt, stop immediately
          if (
            serverErr?.name === 'NotAllowedError' ||
            serverErr?.name === 'InvalidStateError' ||
            serverErr?.name === 'SecurityError'
          ) {
            throw serverErr;
          }
          // Otherwise fall through to native browser WebAuthn for static Cloudflare Pages hosting
        }
      }

      // 2. Native browser WebAuthn fallback (Cloudflare Pages / static deployment)
      if (!createdPasskey) {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const rpId = window.location.hostname;
        const userIdBytes = new TextEncoder().encode(user.id);

        const credential = (await navigator.credentials.create({
          publicKey: {
            challenge,
            rp: {
              name: 'مسابقة أبو الفواطم',
              id: rpId,
            },
            user: {
              id: userIdBytes,
              name: user.username,
              displayName: user.fullName || user.username,
            },
            pubKeyCredParams: [
              { type: 'public-key', alg: -7 }, // ES256
              { type: 'public-key', alg: -257 }, // RS256
            ],
            authenticatorSelection: {
              authenticatorAttachment: 'platform',
              residentKey: 'preferred',
              userVerification: 'required',
            },
            excludeCredentials: userPasskeys.map((p) => ({
              id: base64UrlToUint8Array(p.credentialId) as unknown as BufferSource,
              type: 'public-key' as const,
            })),
            timeout: 60000,
            attestation: 'none',
          },
        })) as PublicKeyCredential | null;

        if (!credential) {
          return { success: false, error: 'لم يتم إنشاء مفتاح البصمة على الجهاز.' };
        }

        const credentialId = bufferToBase64Url(credential.rawId);
        const response = credential.response as AuthenticatorAttestationResponse;
        const publicKeyBuf =
          typeof response.getPublicKey === 'function' ? response.getPublicKey() : null;
        const publicKeyB64 = publicKeyBuf ? bufferToBase64Url(publicKeyBuf) : '';

        createdPasskey = {
          id: credentialId,
          credentialId,
          userId: user.id,
          username: user.username,
          fullName: user.fullName,
          role: user.role,
          publicKeyB64,
          counter: 0,
          transports: typeof response.getTransports === 'function' ? response.getTransports() : ['internal'],
          rpId,
          deviceName,
          isActive: true,
          integrityHash: '',
          verificationMode: 'client',
          createdAt: new Date().toISOString(),
          lastUsedAt: new Date().toISOString(),
        };
      }

      const nextList = [
        ...existing.filter((p) => p.credentialId !== createdPasskey!.credentialId),
        createdPasskey,
      ];
      writeLocalPasskeys(nextList);
      syncUserCredentialList(user.id, nextList);

      try {
        localStorage.setItem(LOCAL_CREDENTIAL_HINT_KEY, createdPasskey.credentialId);
      } catch {}

      // Best-effort cloud sync (non-blocking if Firestore is offline)
      dataService.savePasskey(createdPasskey).catch(() => {});

      await dataService.logSecurityEvent({
        eventType: 'biometric_enrolled',
        username: user.username,
        email: user.username,
        actorName: user.fullName,
        deviceName,
        authMethod: 'webauthn',
        result: 'success',
        details: `تم تفعيل الدخول بالبصمة لحساب (@${user.username}) على الجهاز: ${deviceName}`,
      });

      return { success: true, passkey: createdPasskey };
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'تم إلغاء عملية البصمة أو لم يتم التحقق من الهوية على الجهاز.'
          : err?.name === 'SecurityError'
            ? 'تعذر تشغيل مستشعر البصمة داخل الإطار الحالي. افتح رابط الموقع مباشرة عبر HTTPS.'
            : err?.name === 'InvalidStateError'
              ? 'هذا الجهاز مسجل بالفعل مسبقاً ببصمة نشطة لهذا الحساب.'
              : err?.message || 'حدث خطأ أثناء تفعيل بصمة الجهاز.';

      await dataService.logSecurityEvent({
        eventType: 'biometric_enrolled',
        username: user.username,
        email: user.username,
        actorName: user.fullName,
        deviceName,
        authMethod: 'webauthn',
        result: 'failed',
        details: msg,
      });

      return { success: false, error: msg };
    }
  },

  /**
   * Verifies biometric authentication via WebAuthn and grants the exact linked user's session.
   */
  async verifyBiometricLogin(usernameHint?: string): Promise<{
    success: boolean;
    user?: AuthSessionUser;
    error?: string;
  }> {
    const deviceName = detectDeviceName();

    try {
      if (!isWebAuthnAvailableInWindow()) {
        return {
          success: false,
          error: 'المتصفح الحالي لا يدعم المصادقة بالبصمة (WebAuthn).',
        };
      }

      const eligible = this.getEligiblePasskeys(usernameHint);
      if (eligible.length === 0) {
        return {
          success: false,
          error: usernameHint
            ? `لا توجد بصمة مسجلة ومفعّلة للحساب (${usernameHint}) على هذا الجهاز.`
            : 'لا توجد بصمة مفعّلة على هذا الجهاز بعد. سجّل الدخول باسم المستخدم وكلمة المرور أولاً ثم فعّل البصمة من الإعدادات.',
        };
      }

      const localHint = this.getLocalCredentialHint();
      const ordered = localHint
        ? [
            ...eligible.filter((p) => p.credentialId === localHint),
            ...eligible.filter((p) => p.credentialId !== localHint),
          ]
        : eligible;

      const hasServerSealed = ordered.some((p) => p.verificationMode === 'server' && p.integrityHash);
      let matchedPasskey: AdminPasskeyRecord | undefined;
      let serverToken: string | null = null;
      let newCounter: number | undefined;

      // 1. Try server-verified WebAuthn assertion when passkey has server seal & Express is reachable
      if (hasServerSealed) {
        try {
          const serverCandidates = ordered.filter((p) => p.verificationMode === 'server' && p.integrityHash);
          const optsRes = await fetch('/api/auth/webauthn/login-options', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              clientOrigin: window.location.origin,
              credentialIds: serverCandidates.map((p) => p.credentialId),
            }),
          });

          const optsCT = optsRes.headers.get('content-type') || '';
          if (optsRes.ok && optsCT.includes('application/json')) {
            const optsData = await optsRes.json();
            const assertionResponse = await startAuthentication({
              optionsJSON: optsData.options,
            });

            const candidate = serverCandidates.find((p) => p.credentialId === assertionResponse.id);
            if (!candidate) {
              return { success: false, error: 'مفتاح البصمة غير مرتبط بحساب نشط.' };
            }

            const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                assertionResponse,
                challengeToken: optsData.challengeToken,
                passkeyRecord: candidate,
              }),
            });

            const verifyCT = verifyRes.headers.get('content-type') || '';
            if (verifyRes.ok && verifyCT.includes('application/json')) {
              const verifyData = await verifyRes.json();
              if (verifyData?.verified) {
                matchedPasskey = candidate;
                serverToken = verifyData.adminSessionToken || null;
                newCounter = verifyData.newCounter;
              } else {
                return { success: false, error: verifyData?.error || 'فشلت مطابقة التوقيع التشفيري للبصمة.' };
              }
            }
          }
        } catch (serverErr: any) {
          if (serverErr?.name === 'NotAllowedError' || serverErr?.name === 'SecurityError') {
            throw serverErr;
          }
          // Fall through to native WebAuthn assertion if server is unavailable (e.g. Cloudflare Pages)
        }
      }

      // 2. Native WebAuthn platform verification (Cloudflare Pages / client-bound passkey)
      if (!matchedPasskey) {
        const challenge = new Uint8Array(32);
        crypto.getRandomValues(challenge);
        const rpId = window.location.hostname;

        const assertion = (await navigator.credentials.get({
          publicKey: {
            challenge,
            rpId,
            userVerification: 'required',
            allowCredentials: ordered.map((p) => ({
              id: base64UrlToUint8Array(p.credentialId) as unknown as BufferSource,
              type: 'public-key' as const,
            })),
            timeout: 60000,
          },
        })) as PublicKeyCredential | null;

        if (!assertion) {
          return { success: false, error: 'تعذر التحقق من البصمة على الجهاز.' };
        }

        const assertedId = bufferToBase64Url(assertion.rawId);
        matchedPasskey = ordered.find((p) => p.credentialId === assertedId);
        if (!matchedPasskey) {
          return { success: false, error: 'البصمة المستخدمة غير مسجلة أو تم إلغاء صلاحيتها.' };
        }
      }

      // Resolve the exact linked user and verify they are still active & biometric-enabled
      const linkedUser =
        authService.findUserById(matchedPasskey.userId) ||
        authService.findUserByUsername(matchedPasskey.username);

      if (!linkedUser) {
        return { success: false, error: 'الحساب المرتبط بهذه البصمة لم يعد موجوداً.' };
      }
      if (!linkedUser.isActive) {
        return { success: false, error: 'تم تعطيل هذا الحساب من قبل الإدارة ولا يمكن الدخول به.' };
      }
      if (!linkedUser.biometricEnabled) {
        return { success: false, error: 'تم تعطيل الدخول بالبصمة على هذا الحساب.' };
      }

      // Update usage metadata
      const all = readLocalPasskeys().map((p) =>
        p.credentialId === matchedPasskey!.credentialId
          ? {
              ...p,
              counter: newCounter ?? (p.counter || 0) + 1,
              lastUsedAt: new Date().toISOString(),
            }
          : p
      );
      writeLocalPasskeys(all);

      try {
        localStorage.setItem(LOCAL_CREDENTIAL_HINT_KEY, matchedPasskey.credentialId);
      } catch {}

      const sessionUser = authService.completeBiometricSession(linkedUser, serverToken);

      await dataService.logSecurityEvent({
        eventType: 'biometric_login_success',
        username: linkedUser.username,
        email: linkedUser.username,
        actorName: linkedUser.fullName,
        deviceName: matchedPasskey.deviceName || deviceName,
        authMethod: 'webauthn',
        result: 'success',
        details: `دخول ناجح بالبصمة لحساب (@${linkedUser.username}).`,
      });

      return { success: true, user: sessionUser };
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'تم إلغاء الفحص البيومتري أو لم تتطابق البصمة.'
          : err?.name === 'SecurityError'
            ? 'تعذر تشغيل مستشعر البصمة داخل الإطار الحالي. افتح الموقع مباشرة عبر HTTPS.'
            : err?.message || 'تعذر إكمال التحقق بالبصمة.';

      await dataService.logSecurityEvent({
        eventType: 'biometric_login_failed',
        username: usernameHint || '',
        email: usernameHint || '',
        deviceName,
        authMethod: 'webauthn',
        result: 'failed',
        details: msg,
      });

      return { success: false, error: msg };
    }
  },

  async revokePasskey(credentialId: string, actorUsername: string): Promise<void> {
    const existing = readLocalPasskeys();
    const target = existing.find((p) => p.credentialId === credentialId);
    const remaining = existing.filter((p) => p.credentialId !== credentialId);
    writeLocalPasskeys(remaining);

    if (target) {
      syncUserCredentialList(target.userId, remaining);
    }

    if (this.getLocalCredentialHint() === credentialId) {
      try {
        localStorage.removeItem(LOCAL_CREDENTIAL_HINT_KEY);
      } catch {}
    }

    dataService.deletePasskey(credentialId).catch(() => {});

    await dataService.logSecurityEvent({
      eventType: 'biometric_revoked',
      username: target?.username || actorUsername,
      email: target?.username || actorUsername,
      actorName: actorUsername,
      deviceName: target?.deviceName || detectDeviceName(),
      authMethod: 'webauthn',
      result: 'success',
      details: `إلغاء تفعيل بصمة الجهاز (${target?.deviceName || credentialId.slice(0, 10)}) لحساب (@${target?.username || actorUsername}).`,
    });
  },

  async resetUserBiometrics(userId: string, actorUsername: string): Promise<void> {
    const existing = readLocalPasskeys();
    const removed = existing.filter((p) => p.userId === userId);
    const remaining = existing.filter((p) => p.userId !== userId);
    writeLocalPasskeys(remaining);
    authService.syncUserBiometrics(userId, []);

    const localHint = this.getLocalCredentialHint();
    if (localHint && removed.some((p) => p.credentialId === localHint)) {
      try {
        localStorage.removeItem(LOCAL_CREDENTIAL_HINT_KEY);
      } catch {}
    }

    removed.forEach((p) => {
      dataService.deletePasskey(p.credentialId).catch(() => {});
    });

    const targetUser = authService.findUserById(userId);
    await dataService.logSecurityEvent({
      eventType: 'biometric_revoked',
      username: targetUser?.username || userId,
      email: targetUser?.username || userId,
      actorName: actorUsername,
      deviceName: detectDeviceName(),
      authMethod: 'webauthn',
      result: 'success',
      details: `إعادة ضبط كافة بصمات المستخدم (@${targetUser?.username || userId}).`,
    });
  },
};

import {
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
  startAuthentication,
  startRegistration,
} from '@simplewebauthn/browser';
import { auth } from '../lib/firebase';
import { dataService } from '../lib/dataService';
import { AdminPasskeyRecord } from '../types';

const LOCAL_CREDENTIAL_HINT_KEY = 'abf_webauthn_credential_hint';
const ADMIN_SESSION_TOKEN_KEY = 'abf_admin_session_token';

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

export const biometricService = {
  getStoredSessionToken(): string | null {
    try {
      return sessionStorage.getItem(ADMIN_SESSION_TOKEN_KEY);
    } catch {
      return null;
    }
  },

  setStoredSessionToken(token: string | null): void {
    try {
      if (token) {
        sessionStorage.setItem(ADMIN_SESSION_TOKEN_KEY, token);
      } else {
        sessionStorage.removeItem(ADMIN_SESSION_TOKEN_KEY);
      }
      // Clean up legacy insecure flags if present
      localStorage.removeItem('abf_admin_authenticated');
      sessionStorage.removeItem('abf_admin_authenticated');
      localStorage.removeItem('abf_biometric_enrolled');
    } catch {}
  },

  getLocalCredentialHint(): string | null {
    try {
      return localStorage.getItem(LOCAL_CREDENTIAL_HINT_KEY);
    } catch {
      return null;
    }
  },

  async isPlatformSupported(): Promise<boolean> {
    try {
      if (!browserSupportsWebAuthn()) return false;
      return await platformAuthenticatorIsAvailable();
    } catch {
      return false;
    }
  },

  async hasRegisteredPasskey(): Promise<{
    hasAny: boolean;
    thisDeviceMatch: AdminPasskeyRecord | null;
    allPasskeys: AdminPasskeyRecord[];
  }> {
    const allPasskeys = await dataService.getActivePasskeys();
    const localId = this.getLocalCredentialHint();
    const thisDeviceMatch =
      (localId && allPasskeys.find((p) => p.credentialId === localId)) || allPasskeys[0] || null;
    return {
      hasAny: allPasskeys.length > 0,
      thisDeviceMatch,
      allPasskeys,
    };
  },

  /**
   * Step-up Server-Verified WebAuthn Registration
   * Requires signed-in verified Google owner (alahsaey@gmail.com)
   */
  async enrollDevice(customDeviceLabel?: string): Promise<{
    success: boolean;
    passkey?: AdminPasskeyRecord;
    error?: string;
  }> {
    try {
      if (!browserSupportsWebAuthn()) {
        return { success: false, error: 'المتصفح الحالي لا يدعم تقنية مفاتيح المرور (WebAuthn).' };
      }

      const currentUser = auth.currentUser;
      if (!currentUser) {
        return { success: false, error: 'يجب تسجيل الدخول بحساب Google المعتمد أولاً قبل تفعيل البصمة.' };
      }

      const idToken = await currentUser.getIdToken(true);
      const existingPasskeys = await dataService.getActivePasskeys();
      const deviceName = customDeviceLabel?.trim() || detectDeviceName();

      // 1. Get challenge & registration options from server
      const optsRes = await fetch('/api/auth/webauthn/register-options', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          clientOrigin: window.location.origin,
          excludeCredentialIds: existingPasskeys.map((p) => p.credentialId),
        }),
      });

      const optsData = await optsRes.json();
      if (!optsRes.ok) {
        return { success: false, error: optsData.error || 'فشل طلب تحدي التسجيل من الخادم.' };
      }

      // 2. Prompt native OS biometric authenticator (Fingerprint / FaceID / TouchID)
      const registrationResponse = await startRegistration({
        optionsJSON: optsData.options,
      });

      // 3. Verify cryptographic attestation on the server
      const verifyRes = await fetch('/api/auth/webauthn/register-verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          registrationResponse,
          challengeToken: optsData.challengeToken,
          deviceName,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified || !verifyData.passkey) {
        await dataService.logSecurityEvent({
          eventType: 'biometric_enrolled',
          email: currentUser.email || '',
          deviceName,
          authMethod: 'webauthn',
          result: 'failed',
          details: verifyData.error || 'فشل التحقق التشفيري من تسجيل البصمة',
        });
        return { success: false, error: verifyData.error || 'فشل التحقق التشفيري من البصمة على الخادم.' };
      }

      // 4. Persist verified public-key credential to Firestore (no raw biometric data!)
      await dataService.savePasskey(verifyData.passkey);
      try {
        localStorage.setItem(LOCAL_CREDENTIAL_HINT_KEY, verifyData.passkey.credentialId);
      } catch {}

      await dataService.logSecurityEvent({
        eventType: 'biometric_enrolled',
        email: currentUser.email || '',
        deviceName,
        authMethod: 'webauthn',
        result: 'success',
        details: `تم تسجيل مفتاح بصمة موثق (${verifyData.passkey.credentialId.slice(0, 12)}...)`,
      });

      return { success: true, passkey: verifyData.passkey };
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'تم إلغاء عملية البصمة أو رفض الإذن من الجهاز.'
          : err?.name === 'SecurityError'
            ? 'البيئة الحالية أو النطاق يمنع تشغيل مستشعر WebAuthn. افتح الموقع مباشرة عبر HTTPS.'
            : err?.name === 'InvalidStateError'
              ? 'هذا الجهاز مسجل بالفعل مسبقاً ببصمة نشطة.'
              : err?.message || 'حدث خطأ أثناء تفعيل بصمة الجهاز.';

      await dataService.logSecurityEvent({
        eventType: 'biometric_enrolled',
        email: auth.currentUser?.email || '',
        deviceName: detectDeviceName(),
        authMethod: 'webauthn',
        result: 'failed',
        details: msg,
      });

      return { success: false, error: msg };
    }
  },

  /**
   * Server-verified WebAuthn Passkey Authentication
   */
  async verifyBiometric(): Promise<{
    success: boolean;
    email?: string;
    adminSessionToken?: string;
    error?: string;
  }> {
    const deviceName = detectDeviceName();
    try {
      if (!browserSupportsWebAuthn()) {
        return { success: false, error: 'المتصفح الحالي لا يدعم المصادقة البيومترية (WebAuthn).' };
      }

      const activePasskeys = await dataService.getActivePasskeys();
      if (activePasskeys.length === 0) {
        return {
          success: false,
          error: 'لا توجد أجهزة مفعلة بالبصمة بعد. سجّل الدخول بحساب Google المعتمد ثم فعّل البصمة من الإعدادات.',
        };
      }

      const localHint = this.getLocalCredentialHint();
      const preferredOrder = localHint
        ? [
            ...activePasskeys.filter((p) => p.credentialId === localHint),
            ...activePasskeys.filter((p) => p.credentialId !== localHint),
          ]
        : activePasskeys;

      // 1. Request challenge from server
      const optsRes = await fetch('/api/auth/webauthn/login-options', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientOrigin: window.location.origin,
          credentialIds: preferredOrder.map((p) => p.credentialId),
        }),
      });

      const optsData = await optsRes.json();
      if (!optsRes.ok) {
        return { success: false, error: optsData.error || 'تعذر بدء تحدي البصمة.' };
      }

      // 2. Prompt OS biometric hardware
      const assertionResponse = await startAuthentication({
        optionsJSON: optsData.options,
      });

      const matchedPasskey = activePasskeys.find((p) => p.credentialId === assertionResponse.id);
      if (!matchedPasskey) {
        await dataService.logSecurityEvent({
          eventType: 'biometric_login_failed',
          deviceName,
          authMethod: 'webauthn',
          result: 'blocked',
          details: 'محاولة دخول بمفتاح غير مسجل في قائمة الأجهزة الموثوقة.',
        });
        return { success: false, error: 'هذا المفتاح غير مسجل أو تم إلغاء صلاحيته.' };
      }

      // 3. Cryptographic signature verification on server
      const verifyRes = await fetch('/api/auth/webauthn/login-verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          assertionResponse,
          challengeToken: optsData.challengeToken,
          passkeyRecord: matchedPasskey,
        }),
      });

      const verifyData = await verifyRes.json();
      if (!verifyRes.ok || !verifyData.verified) {
        await dataService.logSecurityEvent({
          eventType: 'biometric_login_failed',
          email: 'alahsaey@gmail.com',
          deviceName: matchedPasskey.deviceName || deviceName,
          authMethod: 'webauthn',
          result: 'failed',
          details: verifyData.error || 'فشل التحقق من التوقيع البيومتري.',
        });
        return { success: false, error: verifyData.error || 'فشلت مطابقة التوقيع التشفيري للبصمة.' };
      }

      this.setStoredSessionToken(verifyData.adminSessionToken);
      try {
        localStorage.setItem(LOCAL_CREDENTIAL_HINT_KEY, matchedPasskey.credentialId);
      } catch {}

      if (auth.currentUser?.email?.toLowerCase() === 'alahsaey@gmail.com') {
        await dataService.updatePasskey(matchedPasskey.credentialId, {
          counter: verifyData.newCounter,
          lastUsedAt: new Date().toISOString(),
        });
      }

      await dataService.logSecurityEvent({
        eventType: 'biometric_login_success',
        email: verifyData.email,
        deviceName: matchedPasskey.deviceName || deviceName,
        authMethod: 'webauthn',
        result: 'success',
        details: 'تم التحقق من البصمة عبر الخادم ومنح جلسة إدارة موثقة.',
      });

      return {
        success: true,
        email: verifyData.email,
        adminSessionToken: verifyData.adminSessionToken,
      };
    } catch (err: any) {
      const msg =
        err?.name === 'NotAllowedError'
          ? 'تم إلغاء الفحص البيومتري أو تعذر التحقق من بصمة الجهاز.'
          : err?.name === 'SecurityError'
            ? 'تعذر تشغيل WebAuthn داخل الإطار الحالي. افتح الموقع مباشرة عبر HTTPS.'
            : err?.message || 'فشل التحقق البيومتري.';

      await dataService.logSecurityEvent({
        eventType: 'biometric_login_failed',
        deviceName,
        authMethod: 'webauthn',
        result: 'failed',
        details: msg,
      });

      return { success: false, error: msg };
    }
  },

  async revokePasskey(credentialId: string, deviceName?: string): Promise<void> {
    await dataService.deletePasskey(credentialId);
    const hint = this.getLocalCredentialHint();
    if (hint === credentialId) {
      try {
        localStorage.removeItem(LOCAL_CREDENTIAL_HINT_KEY);
      } catch {}
    }
    await dataService.logSecurityEvent({
      eventType: 'biometric_revoked',
      email: auth.currentUser?.email || 'alahsaey@gmail.com',
      deviceName: deviceName || detectDeviceName(),
      authMethod: 'webauthn',
      result: 'success',
      details: `تم إزالة وتجميد بصمة الجهاز (${credentialId.slice(0, 12)}...)`,
    });
  },

  async verifyCurrentAdminSession(): Promise<{
    authenticated: boolean;
    email?: string;
    isOwner?: boolean;
    authMethod?: string;
  }> {
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth.currentUser) {
        const idToken = await auth.currentUser.getIdToken();
        headers.Authorization = `Bearer ${idToken}`;
      }
      const adminSessionToken = this.getStoredSessionToken();
      const res = await fetch('/api/auth/session/verify', {
        method: 'POST',
        headers,
        body: JSON.stringify({ adminSessionToken }),
      });
      if (!res.ok) return { authenticated: false };
      return await res.json();
    } catch {
      return { authenticated: false };
    }
  },

  async logoutAdminSession(): Promise<void> {
    const token = this.getStoredSessionToken();
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminSessionToken: token }),
      });
    } catch {}
    await dataService.logSecurityEvent({
      eventType: 'admin_logout',
      email: auth.currentUser?.email || '',
      deviceName: detectDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: 'تسجيل خروج صريح وإلغاء رمز جلسة الإدارة.',
    });
    this.setStoredSessionToken(null);
  },
};

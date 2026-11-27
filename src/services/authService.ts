import { AdminPermissionKey, AuthSessionUser, SystemUser, UserRole } from '../types';
import { dataService } from '../lib/dataService';

const USERS_STORAGE_KEY = 'abf_system_users_v2';
const PBKDF2_ITERATIONS = 120000;

export const SUPER_ADMIN_USERNAME = 'alahsaey';
export const SUPER_ADMIN_USER_ID = 'user_alahsaey';

// Pre-computed salted PBKDF2-HMAC-SHA256 digest (120,000 iterations) — plaintext is never stored in source
const DEFAULT_SUPER_ADMIN_SALT = 'abf_v2_sa_9f4e2c7a1b8d603e5a2f9c4b1e7d3a8c';
const DEFAULT_SUPER_ADMIN_HASH = '73d7d1280fd05049bf8c65687f80ae03b5b37bc2e4c5fe96ffb2e4f9e6a1586c';

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'الدعم الفني / المدير العام',
  admin: 'مدير',
  operator: 'مشرف مسابقة',
};

export function getDefaultPermissionsForRole(role: UserRole): Record<AdminPermissionKey, boolean> {
  if (role === 'super_admin') {
    return {
      manage_categories: true,
      manage_questions: true,
      approve_questions: true,
      generate_ai: true,
      manage_sources: true,
      manage_scoring: true,
      manage_settings: true,
      view_reports: true,
      manage_security: true,
      manage_users: true,
    };
  }
  if (role === 'admin') {
    return {
      manage_categories: true,
      manage_questions: true,
      approve_questions: true,
      generate_ai: true,
      manage_sources: true,
      manage_scoring: true,
      manage_settings: true,
      view_reports: true,
      manage_security: false,
      manage_users: false,
    };
  }
  return {
    manage_categories: true,
    manage_questions: true,
    approve_questions: true,
    generate_ai: false,
    manage_sources: false,
    manage_scoring: false,
    manage_settings: false,
    view_reports: true,
    manage_security: false,
    manage_users: false,
  };
}

function createDefaultSuperAdmin(): SystemUser {
  return {
    id: SUPER_ADMIN_USER_ID,
    username: SUPER_ADMIN_USERNAME,
    fullName: 'الدعم الفني والإدارة العامة',
    role: 'super_admin',
    passwordSalt: DEFAULT_SUPER_ADMIN_SALT,
    passwordHash: DEFAULT_SUPER_ADMIN_HASH,
    passwordIterations: PBKDF2_ITERATIONS,
    permissions: getDefaultPermissionsForRole('super_admin'),
    isActive: true,
    isProtected: true,
    biometricEnabled: false,
    credentialIds: [],
    createdAt: '2026-01-01T00:00:00.000Z',
    createdBy: 'system',
  };
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function generateSaltHex(byteLength = 16): string {
  const buf = new Uint8Array(byteLength);
  crypto.getRandomValues(buf);
  return bytesToHex(buf);
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function derivePasswordHash(
  password: string,
  salt: string,
  iterations = PBKDF2_ITERATIONS
): Promise<string> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(password),
    { name: 'PBKDF2' },
    false,
    ['deriveBits']
  );
  const derivedBits = await crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: encoder.encode(salt),
      iterations,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  return bytesToHex(new Uint8Array(derivedBits));
}

export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsernameFormat(username: string): boolean {
  return /^[a-z0-9._-]{3,32}$/.test(username);
}

// In-memory session state (session tokens are NEVER persisted in localStorage/sessionStorage)
let memorySessionToken: string | null = null;
let memoryCurrentUser: AuthSessionUser | null = null;
const userListeners = new Set<(users: SystemUser[]) => void>();
const sessionListeners = new Set<(user: AuthSessionUser | null) => void>();

function ensureSuperAdminInvariant(users: SystemUser[]): SystemUser[] {
  const defaultSA = createDefaultSuperAdmin();
  const existingIdx = users.findIndex(
    (u) => normalizeUsername(u.username) === SUPER_ADMIN_USERNAME || u.id === SUPER_ADMIN_USER_ID
  );

  if (existingIdx === -1) {
    return [defaultSA, ...users];
  }

  const existing = users[existingIdx];
  const hardenedSA: SystemUser = {
    ...defaultSA,
    ...existing,
    id: SUPER_ADMIN_USER_ID,
    username: SUPER_ADMIN_USERNAME,
    role: 'super_admin',
    isActive: true,
    isProtected: true,
    permissions: getDefaultPermissionsForRole('super_admin'),
    passwordSalt: existing.passwordSalt || defaultSA.passwordSalt,
    passwordHash: existing.passwordHash || defaultSA.passwordHash,
    passwordIterations: existing.passwordIterations || PBKDF2_ITERATIONS,
    credentialIds: Array.isArray(existing.credentialIds) ? existing.credentialIds : [],
    biometricEnabled: Boolean(existing.biometricEnabled && existing.credentialIds?.length),
  };

  const next = [...users];
  next[existingIdx] = hardenedSA;
  return next;
}

function readLocalUsers(): SystemUser[] {
  try {
    const raw = localStorage.getItem(USERS_STORAGE_KEY);
    if (!raw) {
      const initial = [createDefaultSuperAdmin()];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      const initial = [createDefaultSuperAdmin()];
      localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(initial));
      return initial;
    }
    const safe = ensureSuperAdminInvariant(parsed);
    return safe;
  } catch {
    return [createDefaultSuperAdmin()];
  }
}

function writeLocalUsers(users: SystemUser[]): SystemUser[] {
  const safe = ensureSuperAdminInvariant(users);
  try {
    localStorage.setItem(USERS_STORAGE_KEY, JSON.stringify(safe));
  } catch {}
  userListeners.forEach((cb) => cb(safe));
  return safe;
}

function toAuthSessionUser(user: SystemUser, authMethod: 'password' | 'webauthn'): AuthSessionUser {
  return {
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    role: user.role,
    permissions: { ...getDefaultPermissionsForRole(user.role), ...(user.permissions || {}) },
    biometricEnabled: Boolean(user.biometricEnabled && user.credentialIds?.length > 0),
    authMethod,
    isProtected: Boolean(user.isProtected || user.username === SUPER_ADMIN_USERNAME),
  };
}

function detectSimpleDeviceName(): string {
  if (typeof navigator === 'undefined') return 'جهاز غير معروف';
  const ua = navigator.userAgent;
  if (/android/i.test(ua)) return 'هاتف Android';
  if (/iphone|ipad|ipod/i.test(ua)) return 'جهاز Apple';
  if (/macintosh/i.test(ua)) return 'حاسوب Mac';
  if (/windows/i.test(ua)) return 'حاسوب Windows';
  return 'متصفح الويب';
}

export const authService = {
  getSessionToken(): string | null {
    return memorySessionToken;
  },

  getCurrentUser(): AuthSessionUser | null {
    return memoryCurrentUser;
  },

  setSession(user: AuthSessionUser | null, token: string | null): void {
    memoryCurrentUser = user;
    memorySessionToken = token;
    // Purge any legacy browser-stored tokens or flags
    try {
      sessionStorage.removeItem('abf_admin_session_token');
      sessionStorage.removeItem('abf_admin_authenticated');
      localStorage.removeItem('abf_admin_authenticated');
      localStorage.removeItem('abf_biometric_enrolled');
    } catch {}
    sessionListeners.forEach((cb) => cb(user));
  },

  subscribeSession(callback: (user: AuthSessionUser | null) => void): () => void {
    sessionListeners.add(callback);
    callback(memoryCurrentUser);
    return () => {
      sessionListeners.delete(callback);
    };
  },

  listUsers(): SystemUser[] {
    return readLocalUsers();
  },

  subscribeUsers(callback: (users: SystemUser[]) => void): () => void {
    userListeners.add(callback);
    callback(readLocalUsers());
    return () => {
      userListeners.delete(callback);
    };
  },

  findUserByUsername(username: string): SystemUser | null {
    const clean = normalizeUsername(username);
    if (!clean) return null;
    return readLocalUsers().find((u) => normalizeUsername(u.username) === clean) || null;
  },

  findUserById(userId: string): SystemUser | null {
    return readLocalUsers().find((u) => u.id === userId) || null;
  },

  /**
   * Authenticates with username + password using PBKDF2-HMAC-SHA256 verification.
   * When Express server is active, also obtains a server-signed HMAC Bearer session token.
   * When deployed statically (Cloudflare Pages), completes securely via Web Crypto verification.
   */
  async loginWithPassword(
    rawUsername: string,
    password: string
  ): Promise<{
    success: boolean;
    user?: AuthSessionUser;
    error?: string;
  }> {
    const username = normalizeUsername(rawUsername);
    if (!username || !password) {
      return { success: false, error: 'يرجى إدخال اسم المستخدم وكلمة المرور.' };
    }

    // 1. Try server-verified login first when Express backend is reachable
    //    (Never send client-supplied hashes or roles; server verifies strictly against its own store)
    let serverToken: string | null = null;
    let serverVerifiedUser: {
      userId: string;
      username: string;
      fullName: string;
      role: UserRole;
    } | null = null;
    let serverResponded = false;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        serverResponded = true;
        const data = await res.json();
        if (res.ok && data?.authenticated && data?.adminSessionToken) {
          serverToken = data.adminSessionToken;
          serverVerifiedUser = {
            userId: data.userId || `user_${username}`,
            username: normalizeUsername(data.username || username),
            fullName: data.fullName || username,
            role:
              data.role === 'super_admin' || data.role === 'admin' || data.role === 'operator'
                ? data.role
                : 'operator',
          };
        } else {
          await dataService.logSecurityEvent({
            eventType: res.status === 403 ? 'password_login_blocked' : 'password_login_failed',
            username,
            email: username,
            deviceName: detectSimpleDeviceName(),
            authMethod: 'password',
            result: res.status === 403 ? 'blocked' : 'failed',
            details: data?.error || 'فشل التحقق من بيانات الدخول عبر الخادم.',
          });
          return { success: false, error: data?.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
        }
      }
    } catch {
      // Expected on static Cloudflare Pages hosting — fall through to local Web Crypto verification
    }

    const users = readLocalUsers();
    let matched = users.find((u) => normalizeUsername(u.username) === username);

    if (serverVerifiedUser) {
      // Sync local directory mirror with authoritative server identity
      const nowIso = new Date().toISOString();
      if (matched) {
        matched = {
          ...matched,
          id: serverVerifiedUser.userId,
          fullName: serverVerifiedUser.fullName,
          role: serverVerifiedUser.role,
          permissions: getDefaultPermissionsForRole(serverVerifiedUser.role),
          isActive: true,
          lastLoginAt: nowIso,
        };
        writeLocalUsers(users.map((u) => (normalizeUsername(u.username) === username ? matched! : u)));
      } else {
        const salt = generateSaltHex(16);
        const hash = await derivePasswordHash(password, salt, PBKDF2_ITERATIONS);
        matched = {
          id: serverVerifiedUser.userId,
          username: serverVerifiedUser.username,
          fullName: serverVerifiedUser.fullName,
          role: serverVerifiedUser.role,
          passwordSalt: salt,
          passwordHash: hash,
          passwordIterations: PBKDF2_ITERATIONS,
          permissions: getDefaultPermissionsForRole(serverVerifiedUser.role),
          isActive: true,
          isProtected: serverVerifiedUser.username === SUPER_ADMIN_USERNAME,
          biometricEnabled: false,
          credentialIds: [],
          createdAt: nowIso,
          lastLoginAt: nowIso,
        };
        writeLocalUsers([...users, matched]);
      }

      const sessionUser = toAuthSessionUser(matched, 'password');
      this.setSession(sessionUser, serverToken);

      await dataService.logSecurityEvent({
        eventType: 'password_login_success',
        username: matched.username,
        email: matched.username,
        actorName: matched.fullName,
        deviceName: detectSimpleDeviceName(),
        authMethod: 'password',
        result: 'success',
        details: `تسجيل دخول ناجح بحساب (${matched.username} • ${ROLE_LABELS[matched.role]}).`,
      });

      return { success: true, user: sessionUser };
    }

    if (serverResponded) {
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    }

    // 2. Client-side Web Crypto PBKDF2 verification (for static Cloudflare Pages hosting)
    if (!matched) {
      await dataService.logSecurityEvent({
        eventType: 'password_login_failed',
        username,
        email: username,
        deviceName: detectSimpleDeviceName(),
        authMethod: 'password',
        result: 'failed',
        details: `محاولة دخول باسم مستخدم غير مسجل (${username}).`,
      });
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    }

    if (!matched.isActive) {
      await dataService.logSecurityEvent({
        eventType: 'password_login_blocked',
        username: matched.username,
        email: matched.username,
        actorName: matched.fullName,
        deviceName: detectSimpleDeviceName(),
        authMethod: 'password',
        result: 'blocked',
        details: `محاولة دخول لحساب معطّل (${matched.username}).`,
      });
      return { success: false, error: 'تم تعطيل هذا الحساب من قبل الإدارة. تواصل مع الدعم الفني.' };
    }

    const computedHash = await derivePasswordHash(
      password,
      matched.passwordSalt,
      matched.passwordIterations || PBKDF2_ITERATIONS
    );

    if (!constantTimeEqual(computedHash, matched.passwordHash)) {
      await dataService.logSecurityEvent({
        eventType: 'password_login_failed',
        username: matched.username,
        email: matched.username,
        actorName: matched.fullName,
        deviceName: detectSimpleDeviceName(),
        authMethod: 'password',
        result: 'failed',
        details: 'كلمة مرور غير صحيحة.',
      });
      return { success: false, error: 'اسم المستخدم أو كلمة المرور غير صحيحة.' };
    }

    const nowIso = new Date().toISOString();
    const updatedUsers = users.map((u) => (u.id === matched!.id ? { ...u, lastLoginAt: nowIso } : u));
    writeLocalUsers(updatedUsers);

    const sessionUser = toAuthSessionUser(matched, 'password');
    this.setSession(sessionUser, null);

    await dataService.logSecurityEvent({
      eventType: 'password_login_success',
      username: matched.username,
      email: matched.username,
      actorName: matched.fullName,
      deviceName: detectSimpleDeviceName(),
      authMethod: 'password',
      result: 'success',
      details: `تسجيل دخول ناجح بحساب (${matched.username} • ${ROLE_LABELS[matched.role]}).`,
    });

    return { success: true, user: sessionUser };
  },

  /**
   * Establishes a session after verified WebAuthn biometric login for a specific linked user.
   */
  completeBiometricSession(user: SystemUser, serverToken: string | null): AuthSessionUser {
    const nowIso = new Date().toISOString();
    const users = readLocalUsers().map((u) => (u.id === user.id ? { ...u, lastLoginAt: nowIso } : u));
    writeLocalUsers(users);
    const sessionUser = toAuthSessionUser(user, 'webauthn');
    this.setSession(sessionUser, serverToken);
    return sessionUser;
  },

  async createUser(input: {
    fullName: string;
    username: string;
    password: string;
    role: Exclude<UserRole, 'super_admin'>;
    actorUsername: string;
  }): Promise<{ success: boolean; user?: SystemUser; error?: string }> {
    const cleanFullName = input.fullName.trim();
    const cleanUsername = normalizeUsername(input.username);

    if (!cleanFullName || cleanFullName.length < 2) {
      return { success: false, error: 'يرجى إدخال الاسم الكامل للمستخدم.' };
    }
    if (!isValidUsernameFormat(cleanUsername)) {
      return {
        success: false,
        error: 'اسم المستخدم يجب أن يكون بالإنجليزية (3 إلى 32 حرفاً: أحرف صغيرة، أرقام، نقطة أو شرطة سفلية فقط).',
      };
    }
    if (!input.password || input.password.length < 6) {
      return { success: false, error: 'كلمة المرور يجب أن تكون 6 أحرف على الأقل.' };
    }

    const users = readLocalUsers();
    if (users.some((u) => normalizeUsername(u.username) === cleanUsername)) {
      return { success: false, error: 'اسم المستخدم مستخدم بالفعل. يرجى اختيار اسم مستخدم آخر.' };
    }

    const salt = generateSaltHex(16);
    const hash = await derivePasswordHash(input.password, salt, PBKDF2_ITERATIONS);
    const nowIso = new Date().toISOString();
    const newId = `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Sync with server user registry when Express backend is active
    if (memorySessionToken) {
      try {
        const res = await fetch('/api/auth/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${memorySessionToken}`,
            'X-Admin-Session': memorySessionToken,
          },
          body: JSON.stringify({
            id: newId,
            fullName: cleanFullName,
            username: cleanUsername,
            password: input.password,
            role: input.role,
          }),
        });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json') && !res.ok) {
          const errData = await res.json();
          return { success: false, error: errData?.error || 'تعذر إنشاء المستخدم على الخادم.' };
        }
      } catch {
        // Static host fallback
      }
    }

    const newUser: SystemUser = {
      id: newId,
      username: cleanUsername,
      fullName: cleanFullName,
      role: input.role,
      passwordSalt: salt,
      passwordHash: hash,
      passwordIterations: PBKDF2_ITERATIONS,
      permissions: getDefaultPermissionsForRole(input.role),
      isActive: true,
      isProtected: false,
      biometricEnabled: false,
      credentialIds: [],
      createdAt: nowIso,
      updatedAt: nowIso,
      createdBy: input.actorUsername,
    };

    writeLocalUsers([...users, newUser]);

    await dataService.logSecurityEvent({
      eventType: 'user_created',
      username: newUser.username,
      email: newUser.username,
      actorName: input.actorUsername,
      deviceName: detectSimpleDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: `إنشاء مستخدم جديد: ${newUser.fullName} (@${newUser.username}) بصلاحية ${ROLE_LABELS[newUser.role]}.`,
    });

    return { success: true, user: newUser };
  },

  async updateUserPassword(
    userId: string,
    newPassword: string,
    actorUsername: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!newPassword || newPassword.length < 6) {
      return { success: false, error: 'كلمة المرور الجديدة يجب أن تكون 6 أحرف على الأقل.' };
    }

    const users = readLocalUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, error: 'المستخدم غير موجود.' };
    }

    if (memorySessionToken) {
      try {
        const res = await fetch(`/api/auth/users/${encodeURIComponent(userId)}/password`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${memorySessionToken}`,
            'X-Admin-Session': memorySessionToken,
          },
          body: JSON.stringify({ password: newPassword }),
        });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json') && !res.ok) {
          const errData = await res.json();
          return { success: false, error: errData?.error || 'تعذر تحديث كلمة المرور على الخادم.' };
        }
      } catch {
        // Static host fallback
      }
    }

    const salt = generateSaltHex(16);
    const hash = await derivePasswordHash(newPassword, salt, PBKDF2_ITERATIONS);
    const updated = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            passwordSalt: salt,
            passwordHash: hash,
            passwordIterations: PBKDF2_ITERATIONS,
            updatedAt: new Date().toISOString(),
          }
        : u
    );
    writeLocalUsers(updated);

    await dataService.logSecurityEvent({
      eventType: 'password_changed',
      username: target.username,
      email: target.username,
      actorName: actorUsername,
      deviceName: detectSimpleDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: `تم تغيير كلمة المرور للحساب (@${target.username}) وتحديث التشفير.`,
    });

    return { success: true };
  },

  async updateUser(
    userId: string,
    patch: Partial<Pick<SystemUser, 'fullName' | 'role' | 'isActive'>>,
    actorUsername: string
  ): Promise<{ success: boolean; error?: string }> {
    const users = readLocalUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, error: 'المستخدم غير موجود.' };
    }

    const isProtectedAccount =
      Boolean(target.isProtected) || normalizeUsername(target.username) === SUPER_ADMIN_USERNAME;

    if (isProtectedAccount) {
      if (patch.isActive === false) {
        return { success: false, error: 'لا يمكن تعطيل حساب الدعم الفني الأساسي (alahsaey).' };
      }
      if (patch.role && patch.role !== 'super_admin') {
        return { success: false, error: 'لا يمكن تغيير صلاحية حساب الدعم الفني الأساسي.' };
      }
    }

    if (memorySessionToken) {
      try {
        const res = await fetch(`/api/auth/users/${encodeURIComponent(userId)}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${memorySessionToken}`,
            'X-Admin-Session': memorySessionToken,
          },
          body: JSON.stringify(patch),
        });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json') && !res.ok) {
          const errData = await res.json();
          return { success: false, error: errData?.error || 'تعذر تحديث بيانات المستخدم على الخادم.' };
        }
      } catch {
        // Static host fallback
      }
    }

    const nextRole = isProtectedAccount ? 'super_admin' : patch.role || target.role;
    const updated = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            fullName: patch.fullName?.trim() || u.fullName,
            role: nextRole,
            permissions: getDefaultPermissionsForRole(nextRole),
            isActive: isProtectedAccount ? true : patch.isActive !== undefined ? patch.isActive : u.isActive,
            updatedAt: new Date().toISOString(),
          }
        : u
    );
    writeLocalUsers(updated);

    await dataService.logSecurityEvent({
      eventType: 'user_updated',
      username: target.username,
      email: target.username,
      actorName: actorUsername,
      deviceName: detectSimpleDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: `تحديث بيانات أو حالة الحساب (@${target.username}).`,
    });

    return { success: true };
  },

  async deleteUser(userId: string, actorUsername: string): Promise<{ success: boolean; error?: string }> {
    const users = readLocalUsers();
    const target = users.find((u) => u.id === userId);
    if (!target) {
      return { success: false, error: 'المستخدم غير موجود.' };
    }
    if (target.isProtected || normalizeUsername(target.username) === SUPER_ADMIN_USERNAME) {
      return { success: false, error: 'حساب الدعم الفني الرئيسي (alahsaey) محمي ولا يمكن حذفه.' };
    }

    if (memorySessionToken) {
      try {
        const res = await fetch(`/api/auth/users/${encodeURIComponent(userId)}`, {
          method: 'DELETE',
          headers: {
            Authorization: `Bearer ${memorySessionToken}`,
            'X-Admin-Session': memorySessionToken,
          },
        });
        const ct = res.headers.get('content-type') || '';
        if (ct.includes('application/json') && !res.ok) {
          const errData = await res.json();
          return { success: false, error: errData?.error || 'تعذر حذف المستخدم من الخادم.' };
        }
      } catch {
        // Static host fallback
      }
    }

    writeLocalUsers(users.filter((u) => u.id !== userId));

    await dataService.logSecurityEvent({
      eventType: 'user_deleted',
      username: target.username,
      email: target.username,
      actorName: actorUsername,
      deviceName: detectSimpleDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: `حذف المستخدم ${target.fullName} (@${target.username}).`,
    });

    return { success: true };
  },

  syncUserBiometrics(userId: string, credentialIds: string[]): void {
    const cleanIds = Array.from(new Set(credentialIds.filter(Boolean)));
    const users = readLocalUsers();
    const updated = users.map((u) =>
      u.id === userId
        ? {
            ...u,
            credentialIds: cleanIds,
            biometricEnabled: cleanIds.length > 0,
            updatedAt: new Date().toISOString(),
          }
        : u
    );
    writeLocalUsers(updated);

    if (memoryCurrentUser && memoryCurrentUser.id === userId) {
      memoryCurrentUser = {
        ...memoryCurrentUser,
        biometricEnabled: cleanIds.length > 0,
      };
      sessionListeners.forEach((cb) => cb(memoryCurrentUser));
    }
  },

  async logout(): Promise<void> {
    const token = memorySessionToken;
    const prevUser = memoryCurrentUser;

    if (token) {
      try {
        await fetch('/api/auth/logout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ adminSessionToken: token }),
        });
      } catch {}
    }

    await dataService.logSecurityEvent({
      eventType: 'admin_logout',
      username: prevUser?.username || '',
      email: prevUser?.username || '',
      actorName: prevUser?.fullName || '',
      deviceName: detectSimpleDeviceName(),
      authMethod: 'system',
      result: 'success',
      details: `تسجيل خروج المستخدم (${prevUser?.username || 'إدارة'}).`,
    });

    this.setSession(null, null);
  },
};

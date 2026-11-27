import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  UserPlus,
  Trash2,
  Power,
  CheckCircle2,
  XCircle,
  Lock,
  History,
  KeyRound,
  Fingerprint,
  Eye,
  EyeOff,
  Users,
  AlertCircle,
  RotateCcw,
  X,
} from 'lucide-react';
import { AuthSessionUser, SecurityLogEntry, SystemUser, UserRole } from '../../types';
import { dataService } from '../../lib/dataService';
import { authService, ROLE_LABELS, SUPER_ADMIN_USERNAME } from '../../services/authService';
import { biometricService } from '../../services/biometricService';
import BiometricDeviceManager from '../BiometricDeviceManager';

interface AdminSecurityTabProps {
  currentUser: AuthSessionUser;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

export const AdminSecurityTab: React.FC<AdminSecurityTabProps> = ({ currentUser, playSound }) => {
  const isSuperAdmin =
    currentUser.role === 'super_admin' || currentUser.username === SUPER_ADMIN_USERNAME;

  const [users, setUsers] = useState<SystemUser[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>([]);

  // Create new user form state
  const [newFullName, setNewFullName] = useState('');
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [newRole, setNewRole] = useState<Exclude<UserRole, 'super_admin'>>('operator');
  const [creating, setCreating] = useState(false);

  // Change password modal state (works for super_admin changing any user or user changing own password)
  const [passwordTarget, setPasswordTarget] = useState<{ id: string; username: string; fullName: string } | null>(null);
  const [updatedPassword, setUpdatedPassword] = useState('');
  const [showUpdatedPassword, setShowUpdatedPassword] = useState(false);
  const [updatingPassword, setUpdatingPassword] = useState(false);

  // Confirm delete inline state
  const [confirmDeleteUser, setConfirmDeleteUser] = useState<SystemUser | null>(null);

  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    const u1 = authService.subscribeUsers(setUsers);
    const u2 = dataService.subscribeSecurityLogs(setSecurityLogs);
    return () => {
      u1();
      u2();
    };
  }, []);

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isSuperAdmin || creating) return;
    setCreating(true);
    setStatusBanner(null);

    try {
      const res = await authService.createUser({
        fullName: newFullName,
        username: newUsername,
        password: newPassword,
        role: newRole,
        actorUsername: currentUser.username,
      });

      if (res.success && res.user) {
        playSound?.('correct');
        setNewFullName('');
        setNewUsername('');
        setNewPassword('');
        setNewRole('operator');
        setStatusBanner({
          type: 'success',
          text: `تم إنشاء حساب «${res.user.fullName}» (@${res.user.username}) بصلاحية ${ROLE_LABELS[res.user.role]} بنجاح.`,
        });
      } else {
        playSound?.('wrong');
        setStatusBanner({ type: 'error', text: res.error || 'تعذر إنشاء المستخدم.' });
      }
    } finally {
      setCreating(false);
    }
  };

  const handleSavePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordTarget || updatingPassword) return;
    setUpdatingPassword(true);
    setStatusBanner(null);
    try {
      const res = await authService.updateUserPassword(
        passwordTarget.id,
        updatedPassword,
        currentUser.username
      );
      if (res.success) {
        playSound?.('correct');
        setStatusBanner({
          type: 'success',
          text: `تم تحديث كلمة المرور للحساب (@${passwordTarget.username}) بنجاح.`,
        });
        setPasswordTarget(null);
        setUpdatedPassword('');
      } else {
        playSound?.('wrong');
        setStatusBanner({ type: 'error', text: res.error || 'تعذر تحديث كلمة المرور.' });
      }
    } finally {
      setUpdatingPassword(false);
    }
  };

  const handleToggleUserActive = async (target: SystemUser) => {
    if (!isSuperAdmin) return;
    setStatusBanner(null);
    const res = await authService.updateUser(
      target.id,
      { isActive: !target.isActive },
      currentUser.username
    );
    if (res.success) {
      playSound?.('click');
      setStatusBanner({
        type: 'success',
        text: target.isActive
          ? `تم تعطيل حساب (@${target.username}) مؤقتاً.`
          : `تم إعادة تفعيل حساب (@${target.username}).`,
      });
    } else {
      playSound?.('wrong');
      setStatusBanner({ type: 'error', text: res.error || 'تعذر تعديل حالة الحساب.' });
    }
  };

  const handleChangeUserRole = async (target: SystemUser, role: Exclude<UserRole, 'super_admin'>) => {
    if (!isSuperAdmin || target.isProtected || target.username === SUPER_ADMIN_USERNAME) return;
    const res = await authService.updateUser(target.id, { role }, currentUser.username);
    if (res.success) {
      playSound?.('click');
      setStatusBanner({
        type: 'success',
        text: `تم تحديث صلاحية (@${target.username}) إلى «${ROLE_LABELS[role]}».`,
      });
    } else {
      playSound?.('wrong');
      setStatusBanner({ type: 'error', text: res.error || 'تعذر تعديل الصلاحية.' });
    }
  };

  const handleResetUserBiometrics = async (target: SystemUser) => {
    if (!isSuperAdmin) return;
    setStatusBanner(null);
    await biometricService.resetUserBiometrics(target.id, currentUser.username);
    playSound?.('click');
    setStatusBanner({
      type: 'success',
      text: `تمت إعادة ضبط وإلغاء جميع البصمات المرتبطة بحساب (@${target.username}).`,
    });
  };

  const handleConfirmDeleteUser = async () => {
    if (!isSuperAdmin || !confirmDeleteUser) return;
    setStatusBanner(null);
    await biometricService.resetUserBiometrics(confirmDeleteUser.id, currentUser.username);
    const res = await authService.deleteUser(confirmDeleteUser.id, currentUser.username);
    if (res.success) {
      playSound?.('click');
      setStatusBanner({
        type: 'success',
        text: `تم حذف المستخدم (@${confirmDeleteUser.username}) نهائياً.`,
      });
    } else {
      playSound?.('wrong');
      setStatusBanner({ type: 'error', text: res.error || 'تعذر حذف المستخدم.' });
    }
    setConfirmDeleteUser(null);
  };

  return (
    <div className="space-y-8 text-right">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">
          إدارة المستخدمين والصلاحيات والأمان
        </h2>
        <p className="text-xs text-slate-600 mt-0.5">
          إدارة حسابات الإدارة والمشرفين، كلمات المرور المشفرة، وتفعيل الدخول السريع بالبصمة (WebAuthn)
        </p>
      </div>

      {statusBanner && (
        <div
          className={`p-3.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 border ${
            statusBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-rose-50 border-rose-200 text-rose-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="opacity-70 hover:opacity-100 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Current Signed-In Account Card */}
      <div className="p-5 rounded-2xl bg-[#0B192C] text-white border border-[#C9A24D]/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#13253E] border border-[#C9A24D]/50 flex items-center justify-center text-[#C9A24D]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#D9B768]">
              الحساب الحالي • {ROLE_LABELS[currentUser.role]}
            </div>
            <div className="font-display font-extrabold text-base mt-0.5 flex items-center gap-2 flex-wrap">
              <span>{currentUser.fullName}</span>
              <span className="font-mono text-xs text-slate-300 bg-white/10 px-2 py-0.5 rounded-md">
                @{currentUser.username}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            type="button"
            onClick={() => {
              setPasswordTarget({
                id: currentUser.id,
                username: currentUser.username,
                fullName: currentUser.fullName,
              });
              setUpdatedPassword('');
            }}
            className="px-4 py-2 rounded-xl bg-white/10 hover:bg-white/15 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-4 h-4 text-[#C9A24D]" />
            <span>تغيير كلمة مروري</span>
          </button>

          {isSuperAdmin && (
            <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-400/30">
              <Lock className="w-3.5 h-3.5" />
              حساب محمي (Super Admin)
            </span>
          )}
        </div>
      </div>

      {/* Self-Service WebAuthn Biometric Manager (Available for every signed-in staff user) */}
      <BiometricDeviceManager currentUser={currentUser} playSound={playSound} />

      {/* Super Admin Only: Users & Permissions Management */}
      {isSuperAdmin && (
        <div className="surface-card rounded-2xl p-6 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display font-extrabold text-lg text-[#0B192C] flex items-center gap-2">
                <Users className="w-5 h-5 text-[#9B7729]" />
                <span>إدارة المستخدمين والصلاحيات</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                إنشاء حسابات جديدة للمدراء ومشرفي المسابقة، تغيير كلمات المرور، وإعادة ضبط البصمة أو تعطيل الحسابات
              </p>
            </div>
            <span className="text-xs font-bold text-[#0B192C] bg-[#FAF7F2] border border-[#E6DFD1] px-3 py-1.5 rounded-xl tabular-nums">
              إجمالي الحسابات: {users.length}
            </span>
          </div>

          {/* Create New User Form */}
          <form
            onSubmit={handleCreateUser}
            className="p-5 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-4"
          >
            <div className="text-xs font-extrabold text-[#0B192C] flex items-center gap-1.5">
              <UserPlus className="w-4 h-4 text-[#9B7729]" />
              <span>إنشاء مستخدم جديد</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الاسم الكامل</label>
                <input
                  type="text"
                  required
                  value={newFullName}
                  onChange={(e) => setNewFullName(e.target.value)}
                  placeholder="مثال: أحمد العلي"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold text-[#0B192C] focus:outline-none focus:border-[#C9A24D]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  اسم المستخدم (بالإنجليزية)
                </label>
                <input
                  type="text"
                  dir="ltr"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  placeholder="ahmad_admin"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono font-bold text-[#0B192C] text-left focus:outline-none focus:border-[#C9A24D]"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">كلمة المرور</label>
                <div className="relative">
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={6}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="6 أحرف فأكثر"
                    className="w-full pr-3 pl-9 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono font-bold text-[#0B192C] text-left focus:outline-none focus:border-[#C9A24D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword((p) => !p)}
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B192C] cursor-pointer"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">الصلاحية</label>
                <select
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value as Exclude<UserRole, 'super_admin'>)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold text-[#0B192C] focus:outline-none focus:border-[#C9A24D]"
                >
                  <option value="admin">مدير (admin)</option>
                  <option value="operator">مشرف مسابقة (operator)</option>
                </select>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-[11px] text-slate-500">
                • <strong>مدير (admin):</strong> إدارة الأقسام، الأسئلة، الذكاء الاصطناعي، المصادر والإعدادات •{' '}
                <strong>مشرف مسابقة (operator):</strong> تشغيل المسابقة ومراجعة وإدارة الأسئلة.
              </p>

              <button
                type="submit"
                disabled={creating}
                className="px-5 py-2.5 bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-50 text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#C9A24D]" />
                <span>{creating ? 'جاري الإنشاء...' : 'إضافة المستخدم'}</span>
              </button>
            </div>
          </form>

          {/* Users Table */}
          <div className="overflow-x-auto rounded-2xl border border-[#E6DFD1]">
            <table className="w-full text-right border-collapse">
              <thead>
                <tr className="bg-[#FAF7F2] border-b border-[#E6DFD1] text-[11px] font-extrabold text-slate-600">
                  <th className="py-3.5 px-4">المستخدم</th>
                  <th className="py-3.5 px-4">الصلاحية</th>
                  <th className="py-3.5 px-4">حالة البصمة</th>
                  <th className="py-3.5 px-4">حالة الحساب</th>
                  <th className="py-3.5 px-4 text-left">الإجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E6DFD1] text-xs bg-white">
                {users.map((u) => {
                  const protectedAccount = Boolean(u.isProtected || u.username === SUPER_ADMIN_USERNAME);
                  const bioCount = u.credentialIds?.length || 0;
                  const bioActive = Boolean(u.biometricEnabled && bioCount > 0);

                  return (
                    <tr key={u.id} className={!u.isActive ? 'bg-slate-50/70 opacity-75' : ''}>
                      <td className="py-3.5 px-4">
                        <div className="font-bold text-[#0B192C] flex items-center gap-1.5">
                          <span>{u.fullName}</span>
                          {protectedAccount && (
                            <span
                              title="الحساب الرئيسي محمي ضد الحذف أو التعطيل"
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0B192C] text-[#D9B768] text-[10px] font-bold"
                            >
                              <Lock className="w-3 h-3" />
                              أساسي
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] font-mono text-slate-500 mt-0.5">@{u.username}</div>
                      </td>

                      <td className="py-3.5 px-4">
                        {protectedAccount ? (
                          <span className="inline-flex items-center px-2.5 py-1 rounded-lg bg-[#F7F1DF] border border-[#C9A24D]/50 text-[#0B192C] font-bold text-[11px]">
                            {ROLE_LABELS.super_admin}
                          </span>
                        ) : (
                          <select
                            value={u.role}
                            onChange={(e) =>
                              handleChangeUserRole(u, e.target.value as Exclude<UserRole, 'super_admin'>)
                            }
                            className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E6DFD1] text-[11px] font-bold text-[#0B192C] cursor-pointer"
                          >
                            <option value="admin">مدير (admin)</option>
                            <option value="operator">مشرف مسابقة (operator)</option>
                          </select>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        {bioActive ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-[11px] font-bold">
                            <Fingerprint className="w-3.5 h-3.5 text-emerald-600" />
                            <span>مفعّلة ({bioCount})</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-slate-100 border border-slate-200 text-slate-500 text-[11px] font-bold">
                            <Fingerprint className="w-3.5 h-3.5" />
                            <span>غير مفعّلة</span>
                          </span>
                        )}
                      </td>

                      <td className="py-3.5 px-4">
                        <span
                          className={`inline-flex items-center gap-1 text-[11px] font-bold ${
                            u.isActive ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {u.isActive ? (
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          ) : (
                            <XCircle className="w-3.5 h-3.5" />
                          )}
                          <span>{u.isActive ? 'نشط' : 'معطّل'}</span>
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center justify-end gap-1.5 flex-wrap">
                          <button
                            type="button"
                            onClick={() => {
                              setPasswordTarget({ id: u.id, username: u.username, fullName: u.fullName });
                              setUpdatedPassword('');
                            }}
                            className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[11px] font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                            title="تغيير كلمة المرور"
                          >
                            <KeyRound className="w-3.5 h-3.5 text-[#9B7729]" />
                            <span>كلمة المرور</span>
                          </button>

                          {bioActive && (
                            <button
                              type="button"
                              onClick={() => handleResetUserBiometrics(u)}
                              className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-amber-50 border border-[#E6DFD1] text-[11px] font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                              title="إعادة ضبط وإلغاء البصمات المرتبطة بالحساب"
                            >
                              <RotateCcw className="w-3.5 h-3.5 text-[#9B7729]" />
                              <span>ضبط البصمة</span>
                            </button>
                          )}

                          {!protectedAccount && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleToggleUserActive(u)}
                                className="px-2.5 py-1.5 rounded-lg bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[11px] font-bold text-[#0B192C] flex items-center gap-1 cursor-pointer"
                              >
                                <Power className="w-3.5 h-3.5 text-[#9B7729]" />
                                <span>{u.isActive ? 'تعطيل' : 'تفعيل'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => setConfirmDeleteUser(u)}
                                className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 cursor-pointer"
                                title="حذف المستخدم"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Security Audit Log */}
      <div className="surface-card rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-bold text-lg text-[#0B192C] flex items-center gap-2">
          <History className="w-5 h-5 text-[#9B7729]" />
          <span>سجل الدخول والأحداث الأمنية</span>
        </h3>

        {securityLogs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">لا توجد أحداث أمنية مسجلة بعد.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {securityLogs.map((log, i) => {
              const dt = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : 'حديث';
              return (
                <div
                  key={log.id || i}
                  className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2 text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 font-bold text-[#0B192C]">
                      {log.result === 'success' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                      ) : (
                        <XCircle className="w-4 h-4 text-rose-600" />
                      )}
                      <span>{log.details || log.eventType}</span>
                    </div>
                    <div className="text-[11px] text-slate-500">
                      {log.username || log.email || 'زائر'} • {log.deviceName || 'غير محدد'}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{dt}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Change Password Modal */}
      {passwordTarget && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm">
          <form
            onSubmit={handleSavePasswordChange}
            className="w-full max-w-md bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden"
          >
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between">
              <div>
                <h4 className="font-display font-extrabold text-base">تغيير كلمة المرور</h4>
                <p className="text-[11px] text-[#D9B768] font-mono mt-0.5">
                  {passwordTarget.fullName} (@{passwordTarget.username})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                className="p-2 rounded-xl bg-white/10 hover:bg-white/20 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#0B192C] mb-1.5">
                  كلمة المرور الجديدة (6 أحرف على الأقل)
                </label>
                <div className="relative">
                  <input
                    type={showUpdatedPassword ? 'text' : 'password'}
                    dir="ltr"
                    required
                    minLength={6}
                    value={updatedPassword}
                    onChange={(e) => setUpdatedPassword(e.target.value)}
                    placeholder="أدخل كلمة المرور الجديدة"
                    className="w-full pr-3.5 pl-10 py-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-sm font-mono font-bold text-[#0B192C] text-left focus:outline-none focus:border-[#C9A24D]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowUpdatedPassword((p) => !p)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#0B192C] cursor-pointer"
                  >
                    {showUpdatedPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="p-4 bg-[#FAF7F2] border-t border-[#E6DFD1] flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setPasswordTarget(null)}
                className="px-4 py-2 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold text-slate-600 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="submit"
                disabled={updatingPassword}
                className="px-5 py-2 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {updatingPassword ? 'جاري التحديث...' : 'حفظ كلمة المرور'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Confirm Delete User Modal */}
      {confirmDeleteUser && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden p-6 space-y-4 text-right">
            <h4 className="font-display font-extrabold text-base text-[#0B192C]">تأكيد حذف المستخدم</h4>
            <p className="text-xs text-slate-600 leading-relaxed">
              هل أنت متأكد من حذف حساب <strong>{confirmDeleteUser.fullName}</strong> (
              <span className="font-mono">@{confirmDeleteUser.username}</span>) وإلغاء بصماته المسجلة نهائياً؟
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteUser(null)}
                className="px-4 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-slate-700 cursor-pointer"
              >
                إلغاء
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteUser}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
              >
                حذف نهائياً
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

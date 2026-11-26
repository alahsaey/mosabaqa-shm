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
} from 'lucide-react';
import { AdminPermissionKey, AdminRoleUser, SecurityLogEntry } from '../../types';
import { dataService } from '../../lib/dataService';
import BiometricDeviceManager from '../BiometricDeviceManager';

const PERMISSION_LABELS: { key: AdminPermissionKey; label: string }[] = [
  { key: 'manage_categories', label: 'إدارة الأقسام والتصنيفات' },
  { key: 'manage_questions', label: 'إدارة بنك الأسئلة' },
  { key: 'approve_questions', label: 'اعتماد ورفض الأسئلة' },
  { key: 'generate_ai', label: 'تشغيل محرك الذكاء الاصطناعي' },
  { key: 'manage_sources', label: 'إدارة المصادر المعتمدة' },
  { key: 'manage_scoring', label: 'تعديل نظام النقاط' },
  { key: 'manage_settings', label: 'إعدادات المسابقة العامة' },
  { key: 'view_reports', label: 'الاطلاع على التقارير والسجلات' },
  { key: 'manage_security', label: 'إدارة الصلاحيات والأجهزة' },
];

interface AdminSecurityTabProps {
  isOwner: boolean;
  actorEmail: string;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

export const AdminSecurityTab: React.FC<AdminSecurityTabProps> = ({ isOwner, actorEmail, playSound }) => {
  const [roles, setRoles] = useState<AdminRoleUser[]>([]);
  const [securityLogs, setSecurityLogs] = useState<SecurityLogEntry[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [newPerms, setNewPerms] = useState<Record<AdminPermissionKey, boolean>>({
    manage_categories: true,
    manage_questions: true,
    approve_questions: true,
    generate_ai: true,
    manage_sources: false,
    manage_scoring: false,
    manage_settings: false,
    view_reports: true,
    manage_security: false,
  });
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  useEffect(() => {
    const u1 = dataService.subscribeAdminRoles(setRoles);
    const u2 = dataService.subscribeSecurityLogs(setSecurityLogs);
    return () => {
      u1();
      u2();
    };
  }, []);

  const handleAddSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    const email = newEmail.trim().toLowerCase();
    if (!email || email === 'alahsaey@gmail.com') return;

    await dataService.upsertAdminRole({
      email,
      displayName: newName.trim() || email.split('@')[0],
      role: 'subadmin',
      permissions: newPerms,
      isActive: true,
      addedBy: actorEmail,
    });
    await dataService.logSecurityEvent({
      eventType: 'role_updated',
      email,
      actorName: actorEmail,
      authMethod: 'google',
      result: 'success',
      details: `إضافة مشرف مساعد بصلاحيات مخصصة`,
    });
    setNewEmail('');
    setNewName('');
    setStatusMsg(`تم منح صلاحية الإشراف المخصصة لـ ${email}`);
  };

  return (
    <div className="space-y-8 text-right">
      <div>
        <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">إدارة صلاحيات الدخول والأمان</h2>
        <p className="text-xs text-slate-600 mt-0.5">
          حماية المالك الأساسي، إدارة المشرفين المفوضين، تفعيل بصمة الأجهزة الموثوقة (WebAuthn)، وسجل محاولات الدخول
        </p>
      </div>

      {/* Owner Identity Lock Banner */}
      <div className="p-5 rounded-2xl bg-[#0B192C] text-white border border-[#C9A24D]/40 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-[#13253E] border border-[#C9A24D]/50 flex items-center justify-center text-[#C9A24D]">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs font-bold text-[#D9B768]">المالك الأساسي المحمي (لا يمكن تغييره أو حذفه)</div>
            <div className="font-mono font-bold text-base mt-0.5">alahsaey@gmail.com</div>
          </div>
        </div>
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-300">
          <Lock className="w-4 h-4" />
          صلاحية كاملة ومغلقة تشفيرياً
        </span>
      </div>

      {/* WebAuthn Biometric Manager */}
      <BiometricDeviceManager playSound={playSound} />

      {/* Sub-Admin RBAC Management (Owner Only) */}
      <div className="surface-card rounded-2xl p-6 space-y-5">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-bold text-lg text-[#0B192C]">المشرفون المفوضون وصلاحياتهم</h3>
            <p className="text-xs text-slate-500">يمكن للمالك إضافة مشرفين فرعيين ببريد Google وتحديد صلاحيات دقيقة لكل منهم</p>
          </div>
        </div>

        {statusMsg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold">
            {statusMsg}
          </div>
        )}

        {isOwner && (
          <form onSubmit={handleAddSubAdmin} className="p-4 rounded-2xl bg-[#FAF7F2] border border-[#E6DFD1] space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="بريد Google للمشرف المساعد (example@gmail.com)"
                className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-mono dir-ltr"
              />
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="الاسم التعريفي للمشرف"
                className="px-3.5 py-2.5 rounded-xl bg-white border border-[#E6DFD1] text-xs font-bold"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {PERMISSION_LABELS.map((p) => (
                <label
                  key={p.key}
                  className="p-2.5 rounded-xl bg-white border border-[#E6DFD1] flex items-center gap-2 text-[11px] font-bold text-[#0B192C] cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={newPerms[p.key]}
                    onChange={(e) => setNewPerms({ ...newPerms, [p.key]: e.target.checked })}
                  />
                  <span>{p.label}</span>
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <button
                type="submit"
                className="px-5 py-2.5 bg-[#0B192C] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
              >
                <UserPlus className="w-4 h-4 text-[#C9A24D]" />
                <span>إضافة مشرف مفوض</span>
              </button>
            </div>
          </form>
        )}

        <div className="space-y-3">
          {roles.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-4">لا يوجد مشرفون إضافيون مسجلون حالياً.</p>
          ) : (
            roles.map((r) => (
              <div key={r.id} className="p-4 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-[#0B192C]">{r.displayName}</span>
                    <span className={`text-[11px] font-bold ${r.isActive ? 'text-emerald-700' : 'text-rose-700'}`}>
                      {r.isActive ? '• نشط' : '• موقوف'}
                    </span>
                  </div>
                  <div className="text-xs font-mono text-slate-500 mt-0.5">{r.email}</div>
                </div>

                {isOwner && (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dataService.upsertAdminRole({ ...r, isActive: !r.isActive })}
                      className="px-3 py-1.5 rounded-lg bg-white border border-[#E6DFD1] text-xs font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <Power className="w-3.5 h-3.5 text-[#9B7729]" />
                      <span>{r.isActive ? 'تجميد' : 'تفعيل'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => dataService.deleteAdminRole(r.email)}
                      className="p-1.5 rounded-lg text-rose-600 hover:bg-rose-50 cursor-pointer"
                      title="سحب الصلاحية"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Security Audit Log */}
      <div className="surface-card rounded-2xl p-6 space-y-4">
        <h3 className="font-display font-bold text-lg text-[#0B192C] flex items-center gap-2">
          <History className="w-5 h-5 text-[#9B7729]" />
          <span>سجل الدخول والأحداث الأمنية (غير قابل للتعديل)</span>
        </h3>

        {securityLogs.length === 0 ? (
          <p className="text-xs text-slate-400 text-center py-6">لا توجد أحداث أمنية مسجلة بعد.</p>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
            {securityLogs.map((log, i) => {
              const dt = log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ar-SA') : 'حديث';
              return (
                <div key={log.id || i} className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex flex-wrap items-center justify-between gap-2 text-xs">
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
                      {log.email || 'زائر'} • {log.deviceName || 'غير محدد'}
                    </div>
                  </div>
                  <span className="text-[11px] font-mono text-slate-400">{dt}</span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

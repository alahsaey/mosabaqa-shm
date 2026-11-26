import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Fingerprint,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  LogOut,
  X,
  ShieldAlert,
  Loader2,
  Scan,
  UserCheck,
  Copy,
  ExternalLink,
  Check,
  Globe,
  Smartphone,
} from 'lucide-react';
import { User, signOut } from 'firebase/auth';
import { auth, signInWithGoogle, getAuthErrorMessage } from '../lib/firebase';
import { dataService } from '../lib/dataService';
import { biometricService, detectDeviceName } from '../services/biometricService';
import { AdminPasskeyRecord, AdminRoleUser } from '../types';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (authInfo: { email: string; isOwner: boolean; roleUser?: AdminRoleUser | null; authMethod: 'google' | 'webauthn' }) => void;
  currentUser: User | null;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

const AUTHORIZED_OWNER_EMAIL = 'alahsaey@gmail.com';
const FIREBASE_PROJECT_ID = 'gen-lang-client-0332714924';

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  playSound,
}) => {
  const [authMethod, setAuthMethod] = useState<'google' | 'biometric'>('google');
  const [isScanningBiometric, setIsScanningBiometric] = useState(false);
  const [biometricStatus, setBiometricStatus] = useState<'idle' | 'scanning' | 'success' | 'failed'>('idle');
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isUnauthorizedDomain, setIsUnauthorizedDomain] = useState(false);
  const [domainCopied, setDomainCopied] = useState(false);
  const [registeredPasskey, setRegisteredPasskey] = useState<AdminPasskeyRecord | null>(null);
  const [checkingPasskeys, setCheckingPasskeys] = useState(false);
  const [currentUserRole, setCurrentUserRole] = useState<AdminRoleUser | null>(null);

  const currentHostname = typeof window !== 'undefined' ? window.location.hostname : '';

  useEffect(() => {
    if (!isOpen) return;
    setBiometricStatus('idle');
    setLoginError(null);
    setIsUnauthorizedDomain(false);
    setCheckingPasskeys(true);

    biometricService
      .hasRegisteredPasskey()
      .then((res) => {
        setRegisteredPasskey(res.thisDeviceMatch);
      })
      .finally(() => setCheckingPasskeys(false));

    if (currentUser?.email) {
      const lower = currentUser.email.toLowerCase();
      if (lower !== AUTHORIZED_OWNER_EMAIL) {
        dataService.getAdminRoleByEmail(lower).then((role) => {
          setCurrentUserRole(role && role.isActive ? role : null);
        });
      } else {
        setCurrentUserRole(null);
      }
    } else {
      setCurrentUserRole(null);
    }
  }, [isOpen, currentUser]);

  if (!isOpen) return null;

  const currentEmail = currentUser?.email?.toLowerCase() || '';
  const isOwnerEmail = currentEmail === AUTHORIZED_OWNER_EMAIL && currentUser?.emailVerified === true;
  const isAuthorizedStaff = isOwnerEmail || Boolean(currentUserRole && currentUserRole.isActive && currentUser?.emailVerified);

  const handleCopyDomain = async () => {
    try {
      await navigator.clipboard.writeText(currentHostname);
      setDomainCopied(true);
      playSound?.('click');
      setTimeout(() => setDomainCopied(false), 3000);
    } catch {}
  };

  const handleGoogleSignIn = async () => {
    if (isLoggingIn) return;
    setIsLoggingIn(true);
    setLoginError(null);
    setIsUnauthorizedDomain(false);

    try {
      const res = await signInWithGoogle();
      const signedInUser = res.user;
      const emailLower = (signedInUser.email || '').toLowerCase();

      if (!signedInUser.emailVerified) {
        await dataService.logSecurityEvent({
          eventType: 'google_login_blocked',
          email: emailLower,
          deviceName: detectDeviceName(),
          authMethod: 'google',
          result: 'blocked',
          details: 'تم رفض الحساب لأن البريد الإلكتروني غير موثق (email_verified=false).',
        });
        setLoginError('هذا البريد الإلكتروني غير موثق لدى Google ولا يمكن منحه صلاحية الإدارة.');
        playSound?.('wrong');
        return;
      }

      if (emailLower === AUTHORIZED_OWNER_EMAIL) {
        await dataService.logSecurityEvent({
          eventType: 'google_login_success',
          email: emailLower,
          actorName: signedInUser.displayName || 'المالك',
          deviceName: detectDeviceName(),
          authMethod: 'google',
          result: 'success',
          details: 'دخول مالك المنصة بحساب Google المعتمد.',
        });
        playSound?.('correct');
        onSuccess({ email: emailLower, isOwner: true, roleUser: null, authMethod: 'google' });
        return;
      }

      // Check sub-admin RBAC record
      const subAdmin = await dataService.getAdminRoleByEmail(emailLower);
      if (subAdmin && subAdmin.isActive) {
        await dataService.logSecurityEvent({
          eventType: 'google_login_success',
          email: emailLower,
          actorName: subAdmin.displayName || signedInUser.displayName || 'مشرف مساعد',
          deviceName: detectDeviceName(),
          authMethod: 'google',
          result: 'success',
          details: 'دخول مشرف مفوض عبر حساب Google.',
        });
        playSound?.('correct');
        onSuccess({ email: emailLower, isOwner: false, roleUser: subAdmin, authMethod: 'google' });
        return;
      }

      await dataService.logSecurityEvent({
        eventType: 'google_login_blocked',
        email: emailLower,
        actorName: signedInUser.displayName || '',
        deviceName: detectDeviceName(),
        authMethod: 'google',
        result: 'blocked',
        details: 'محاولة دخول ببريد غير مصرح له.',
      });
      playSound?.('wrong');
      setLoginError(`تم حظر الوصول: البريد الحالي (${signedInUser.email}) غير مصرح له بلوحة التحكم.`);
    } catch (err: any) {
      if (err?.code === 'auth/popup-closed-by-user' || err?.code === 'auth/cancelled-popup-request') {
        return;
      }
      if (err?.code === 'auth/unauthorized-domain') {
        setIsUnauthorizedDomain(true);
      }
      const msg = getAuthErrorMessage(err);
      setLoginError(msg);
      await dataService.logSecurityEvent({
        eventType: 'google_login_failed',
        deviceName: detectDeviceName(),
        authMethod: 'google',
        result: 'failed',
        details: err?.code || msg,
      });
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBiometricScan = async () => {
    if (isScanningBiometric) return;
    setIsScanningBiometric(true);
    setBiometricStatus('scanning');
    setLoginError(null);
    playSound?.('click');

    try {
      const res = await biometricService.verifyBiometric();
      if (res.success && res.email) {
        setBiometricStatus('success');
        playSound?.('victory');
        setTimeout(() => {
          onSuccess({
            email: res.email!,
            isOwner: res.email!.toLowerCase() === AUTHORIZED_OWNER_EMAIL,
            roleUser: null,
            authMethod: 'webauthn',
          });
        }, 700);
      } else {
        setBiometricStatus('failed');
        setLoginError(res.error || 'فشلت مطابقة التوقيع البيومتري على الخادم.');
        playSound?.('wrong');
      }
    } catch (err: any) {
      setBiometricStatus('failed');
      setLoginError(err?.message || 'تعذر إكمال التحقق البيومتري.');
      playSound?.('wrong');
    } finally {
      setIsScanningBiometric(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-[#07111E]/85 backdrop-blur-md overflow-y-auto">
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-lg bg-white rounded-3xl shadow-2xl border border-[#E6DFD1] overflow-hidden flex flex-col my-8"
      >
        {/* Header */}
        <div className="p-6 bg-[#0B192C] text-[#FAF7F2] relative border-b border-[#C9A24D]/30">
          <button
            type="button"
            onClick={() => {
              playSound?.('click');
              onClose();
            }}
            className="absolute top-5 left-5 w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
            title="إغلاق"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-[#13253E] border border-[#C9A24D]/50 flex items-center justify-center text-[#C9A24D] shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-[#D9B768]">بوابة الحماية والتحقق المزدوج</span>
              <h3 className="text-xl font-extrabold text-white mt-0.5">دخول صاحب الصلاحية والإدارة</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                الصلاحية الأساسية محصورة بـ <span className="text-[#D9B768] font-bold">{AUTHORIZED_OWNER_EMAIL}</span> والمشرفين المفوضين
              </p>
            </div>
          </div>
        </div>

        {/* Unauthorized Warning */}
        {currentUser && !isAuthorizedStaff && (
          <div className="p-4 bg-rose-50 border-b border-rose-200 flex items-start gap-3 text-rose-900 text-xs">
            <ShieldAlert className="w-5 h-5 text-rose-700 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">تم رصد حساب غير مخول ({currentUser.email})</p>
              <p className="mt-0.5 text-rose-700">تم حجب صلاحيات الإدارة عن هذا الحساب وتسجيل المحاولة في سجل الأمان.</p>
            </div>
          </div>
        )}

        {/* Auth Method Tabs */}
        <div className="grid grid-cols-2 bg-[#F3EFE6] p-1.5 mx-6 mt-6 rounded-2xl border border-[#E6DFD1] text-xs font-bold gap-1.5">
          <button
            type="button"
            onClick={() => {
              playSound?.('click');
              setAuthMethod('google');
              setLoginError(null);
            }}
            className={`py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              authMethod === 'google' ? 'bg-white text-[#0B192C] shadow-sm' : 'text-slate-600 hover:text-[#0B192C]'
            }`}
          >
            <UserCheck className="w-4 h-4 text-[#0B192C]" />
            <span>حساب Google المعتمد</span>
          </button>

          <button
            type="button"
            onClick={() => {
              playSound?.('click');
              setAuthMethod('biometric');
              setLoginError(null);
            }}
            className={`py-3 px-3 rounded-xl transition-all flex items-center justify-center gap-2 cursor-pointer ${
              authMethod === 'biometric' ? 'bg-white text-[#0B192C] shadow-sm' : 'text-slate-600 hover:text-[#0B192C]'
            }`}
          >
            <Fingerprint className="w-4 h-4 text-[#9B7729]" />
            <span>بصمة الجهاز (WebAuthn)</span>
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5">
          {authMethod === 'google' ? (
            <div className="space-y-4 text-center">
              {currentUser ? (
                <div className="p-5 bg-[#FAF7F2] rounded-2xl border border-[#E6DFD1] flex flex-col items-center gap-4">
                  <div className="w-16 h-16 rounded-2xl bg-[#0B192C] text-[#D9B768] flex items-center justify-center font-extrabold text-2xl border border-[#C9A24D]/40">
                    {(currentUser.displayName || currentUser.email || 'A').charAt(0).toUpperCase()}
                  </div>

                  <div>
                    <h4 className="font-bold text-[#0F172A] text-base">{currentUser.displayName || 'مستخدم مسجل'}</h4>
                    <p className="text-xs text-slate-500 mt-0.5 font-mono">{currentUser.email}</p>
                  </div>

                  {isAuthorizedStaff ? (
                    <div className="w-full p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-700 shrink-0" />
                      <span>{isOwnerEmail ? 'مالك المنصة • صلاحيات كاملة' : 'مشرف مفوض • دخول مصرح به'}</span>
                    </div>
                  ) : (
                    <div className="w-full p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-center justify-center gap-2">
                      <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
                      <span>حساب غير مصرح له بالإدارة.</span>
                    </div>
                  )}

                  <div className="w-full flex gap-3">
                    {isAuthorizedStaff ? (
                      <button
                        type="button"
                        onClick={() => {
                          playSound?.('correct');
                          onSuccess({
                            email: currentEmail,
                            isOwner: isOwnerEmail,
                            roleUser: currentUserRole,
                            authMethod: 'google',
                          });
                        }}
                        className="flex-1 py-3.5 bg-[#0B192C] hover:bg-[#13253E] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        <Lock className="w-4 h-4 text-[#C9A24D]" />
                        <span>فتح لوحة التحكم</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={handleGoogleSignIn}
                        disabled={isLoggingIn}
                        className="flex-1 py-3.5 bg-[#0B192C] hover:bg-[#13253E] text-white font-bold rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {isLoggingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserCheck className="w-4 h-4 text-[#C9A24D]" />}
                        <span>التبديل للحساب المعتمد</span>
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        playSound?.('click');
                        signOut(auth);
                      }}
                      className="px-4 py-3.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl border border-rose-200 transition-colors cursor-pointer"
                      title="تسجيل الخروج"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-[#FAF7F2] border border-[#E6DFD1] rounded-2xl text-right space-y-1.5">
                    <h5 className="font-bold text-[#0B192C] text-sm">التحقق الإلزامي عبر Google</h5>
                    <p className="text-xs text-slate-600 leading-relaxed">
                      يعتمد النظام تحققاً مزدوجاً عبر خادم المنصة وقواعد Firestore لضمان عدم دخول أي جهة غير مخولة أو استخدام جلسات محلية غير موثقة.
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={handleGoogleSignIn}
                    disabled={isLoggingIn}
                    className="w-full py-4 bg-[#0B192C] hover:bg-[#13253E] text-white font-bold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-3 cursor-pointer disabled:opacity-60"
                  >
                    {isLoggingIn ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin text-[#C9A24D]" />
                        <span>جاري التحقق من الحساب...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-5 h-5 text-[#C9A24D]" />
                        <span>تسجيل الدخول بحساب Google المعتمد</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-col items-center text-center space-y-5">
              {checkingPasskeys ? (
                <div className="py-10 flex flex-col items-center gap-3 text-slate-500 text-xs font-bold">
                  <Loader2 className="w-6 h-6 animate-spin text-[#0B192C]" />
                  <span>جاري التحقق من الأجهزة المسجلة...</span>
                </div>
              ) : registeredPasskey ? (
                <>
                  <div className="w-full p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-900 text-xs font-bold flex items-center justify-center gap-2">
                    <Smartphone className="w-4 h-4 text-emerald-700" />
                    <span>جهاز مسجل: {registeredPasskey.deviceName}</span>
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricScan}
                    disabled={isScanningBiometric}
                    className="relative group cursor-pointer focus:outline-none"
                  >
                    <div
                      className={`w-28 h-28 rounded-full border-4 flex items-center justify-center bg-[#0B192C] text-white shadow-xl transition-all ${
                        biometricStatus === 'scanning'
                          ? 'border-[#C9A24D]'
                          : biometricStatus === 'success'
                            ? 'border-emerald-500'
                            : biometricStatus === 'failed'
                              ? 'border-rose-500'
                              : 'border-[#C9A24D]/60 group-hover:border-[#C9A24D]'
                      }`}
                    >
                      {biometricStatus === 'scanning' ? (
                        <Scan className="w-12 h-12 text-[#C9A24D] animate-pulse" />
                      ) : biometricStatus === 'success' ? (
                        <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                      ) : biometricStatus === 'failed' ? (
                        <XCircle className="w-12 h-12 text-rose-400" />
                      ) : (
                        <Fingerprint className="w-14 h-14 text-[#D9B768]" />
                      )}
                    </div>
                  </button>

                  <div className="space-y-1">
                    <p className="font-bold text-[#0B192C] text-sm">
                      {biometricStatus === 'scanning'
                        ? 'يرجى تأكيد البصمة على مستشعر جهازك...'
                        : biometricStatus === 'success'
                          ? 'تم التحقق التشفيري من البصمة بنجاح'
                          : 'المصادقة السريعة ببصمة الجهاز الموثق'}
                    </p>
                    <p className="text-xs text-slate-500">يتم التحقق من التوقيع الرقمي عبر الخادم دون تخزين أي بيانات حيوية</p>
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricScan}
                    disabled={isScanningBiometric}
                    className="w-full py-3.5 bg-[#0F766E] hover:bg-[#0D5F59] text-white font-bold text-sm rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                  >
                    <Fingerprint className="w-4 h-4" />
                    <span>{isScanningBiometric ? 'جاري التحقق التشفيري...' : 'التحقق بالبصمة الآن'}</span>
                  </button>
                </>
              ) : (
                <div className="p-5 bg-[#FAF7F2] border border-[#E6DFD1] rounded-2xl text-right space-y-4 w-full">
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-[#F7F1DF] text-[#9B7729] flex items-center justify-center shrink-0">
                      <Fingerprint className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-[#0B192C] text-sm">لم يتم ربط بصمة هذا الجهاز بعد</h4>
                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        لأسباب أمنية، لا تُفعّل البصمة إلا بعد تسجيل الدخول بحساب المالك المعتمد أولاً ثم ربط الجهاز من قسم «إدارة صلاحيات الدخول» داخل الإعدادات.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setAuthMethod('google')}
                    className="w-full py-3 bg-[#0B192C] hover:bg-[#13253E] text-white rounded-xl text-xs font-bold cursor-pointer"
                  >
                    الانتقال لتسجيل الدخول بـ Google
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Unauthorized Domain Guidance */}
          {(isUnauthorizedDomain || (loginError && loginError.includes('Authorized Domains'))) && (
            <div className="p-4 bg-[#F7F1DF] border border-[#C9A24D] rounded-2xl text-right space-y-3">
              <div className="flex items-start gap-2.5">
                <Globe className="w-5 h-5 text-[#9B7729] shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-bold text-[#0B192C] text-xs">النطاق غير مصرح به في إعدادات Firebase</h4>
                  <p className="text-[11px] text-slate-700 mt-0.5">أضف النطاق التالي إلى قائمة Authorized Domains في وحدة تحكم Firebase:</p>
                </div>
              </div>
              <div className="p-2.5 bg-white rounded-xl border border-[#E6DFD1] flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={handleCopyDomain}
                  className="px-3 py-1.5 bg-[#0B192C] text-white text-xs font-bold rounded-lg flex items-center gap-1 cursor-pointer shrink-0"
                >
                  {domainCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  <span>{domainCopied ? 'تم النسخ' : 'نسخ'}</span>
                </button>
                <span className="font-mono text-xs text-slate-700 truncate dir-ltr">{currentHostname}</span>
              </div>
              <a
                href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/settings`}
                target="_blank"
                rel="noopener noreferrer"
                className="w-full py-2.5 bg-white border border-[#E6DFD1] hover:bg-slate-50 text-[#0B192C] rounded-xl text-xs font-bold flex items-center justify-center gap-1.5"
              >
                <ExternalLink className="w-3.5 h-3.5 text-[#9B7729]" />
                <span>فتح إعدادات النطاقات في Firebase</span>
              </a>
            </div>
          )}

          {loginError && !isUnauthorizedDomain && !loginError.includes('Authorized Domains') && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-start gap-2 text-right">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{loginError}</span>
            </div>
          )}
        </div>

        <div className="p-3.5 bg-[#FAF7F2] border-t border-[#E6DFD1] flex items-center justify-between px-6 text-[11px] text-slate-500 font-semibold">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>مصادقة مشفرة • سجل تدقيق أمني</span>
          </span>
          <span className="font-mono">{AUTHORIZED_OWNER_EMAIL}</span>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminAuthModal;

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
  ShieldCheck,
  Lock,
  Fingerprint,
  AlertTriangle,
  X,
  Loader2,
  Eye,
  EyeOff,
  User as UserIcon,
  KeyRound,
  CheckCircle2,
  Scan,
} from 'lucide-react';
import { authService, ROLE_LABELS } from '../services/authService';
import { biometricService } from '../services/biometricService';
import { AdminPasskeyRecord, AuthSessionUser } from '../types';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (user: AuthSessionUser) => void;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

export const AdminAuthModal: React.FC<AdminAuthModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  playSound,
}) => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  const [biometricSupported, setBiometricSupported] = useState(false);
  const [eligiblePasskeys, setEligiblePasskeys] = useState<AdminPasskeyRecord[]>([]);
  const [isScanningBiometric, setIsScanningBiometric] = useState(false);
  const [biometricSuccessName, setBiometricSuccessName] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoginError(null);
    setPassword('');
    setShowPassword(false);
    setBiometricSuccessName(null);

    let cancelled = false;
    biometricService.hasRegisteredPasskey(username.trim() || undefined).then((res) => {
      if (cancelled) return;
      setBiometricSupported(res.supported);
      setEligiblePasskeys(res.allPasskeys);
    });

    return () => {
      cancelled = true;
    };
  }, [isOpen, username]);

  if (!isOpen) return null;

  const canUseBiometric = biometricSupported && eligiblePasskeys.length > 0;
  const primaryPasskey = eligiblePasskeys[0] || null;

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLoggingIn || isScanningBiometric) return;

    const cleanUser = username.trim();
    if (!cleanUser || !password) {
      setLoginError('يرجى إدخال اسم المستخدم وكلمة المرور.');
      playSound?.('wrong');
      return;
    }

    setIsLoggingIn(true);
    setLoginError(null);
    try {
      const result = await authService.loginWithPassword(cleanUser, password);
      if (result.success && result.user) {
        playSound?.('correct');
        setPassword('');
        onSuccess(result.user);
      } else {
        playSound?.('wrong');
        setLoginError(result.error || 'اسم المستخدم أو كلمة المرور غير صحيحة.');
      }
    } catch {
      playSound?.('wrong');
      setLoginError('تعذر إتمام تسجيل الدخول حالياً. يرجى المحاولة مجدداً.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleBiometricLogin = async () => {
    if (isScanningBiometric || isLoggingIn) return;
    setIsScanningBiometric(true);
    setLoginError(null);
    playSound?.('click');

    try {
      const result = await biometricService.verifyBiometricLogin(username.trim() || undefined);
      if (result.success && result.user) {
        setBiometricSuccessName(`${result.user.fullName} (${ROLE_LABELS[result.user.role]})`);
        playSound?.('victory');
        window.setTimeout(() => {
          onSuccess(result.user!);
        }, 450);
      } else {
        playSound?.('wrong');
        setLoginError(result.error || 'تعذر التحقق من البصمة. يمكنك الدخول باسم المستخدم وكلمة المرور.');
      }
    } catch {
      playSound?.('wrong');
      setLoginError('تعذر إكمال التحقق بالبصمة على هذا الجهاز.');
    } finally {
      setIsScanningBiometric(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-[#07111E]/85 backdrop-blur-md overflow-y-auto"
      dir="rtl"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0, y: 16 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        className="relative w-full max-w-md bg-white rounded-3xl shadow-2xl border border-[#E6DFD1] overflow-hidden flex flex-col my-8"
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

          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-[#13253E] border border-[#C9A24D]/50 flex items-center justify-center text-[#C9A24D] shrink-0">
              <ShieldCheck className="w-7 h-7" />
            </div>
            <div className="text-right">
              <span className="text-[11px] font-bold text-[#D9B768]">بوابة الإدارة والصلاحيات</span>
              <h3 className="text-xl font-extrabold text-white mt-0.5">تسجيل دخول المشرفين</h3>
              <p className="text-xs text-slate-300 mt-0.5">
                الدخول مخصص للحسابات المعتمدة من إدارة المسابقة فقط
              </p>
            </div>
          </div>
        </div>

        {/* Form Body */}
        <div className="p-6 space-y-5">
          {biometricSuccessName ? (
            <div className="py-8 flex flex-col items-center text-center space-y-3">
              <div className="w-16 h-16 rounded-2xl bg-emerald-50 border border-emerald-200 flex items-center justify-center text-emerald-700">
                <CheckCircle2 className="w-9 h-9" />
              </div>
              <p className="font-display font-extrabold text-base text-[#0B192C]">
                تم التحقق بالبصمة بنجاح
              </p>
              <p className="text-xs font-bold text-emerald-800">{biometricSuccessName}</p>
            </div>
          ) : (
            <>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div>
                  <label
                    htmlFor="admin-login-username"
                    className="block text-xs font-bold text-[#0B192C] mb-1.5"
                  >
                    اسم المستخدم
                  </label>
                  <div className="relative">
                    <UserIcon className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-login-username"
                      type="text"
                      autoComplete="username"
                      dir="ltr"
                      required
                      value={username}
                      onChange={(e) => {
                        setUsername(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      placeholder="أدخل اسم المستخدم"
                      className="w-full pr-10 pl-3.5 py-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] focus:border-[#C9A24D] focus:bg-white focus:outline-none text-sm font-bold text-[#0B192C] text-right transition-colors"
                    />
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="admin-login-password"
                    className="block text-xs font-bold text-[#0B192C] mb-1.5"
                  >
                    كلمة المرور
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    <input
                      id="admin-login-password"
                      type={showPassword ? 'text' : 'password'}
                      autoComplete="current-password"
                      dir="ltr"
                      required
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (loginError) setLoginError(null);
                      }}
                      placeholder="••••••••••••"
                      className="w-full pr-10 pl-11 py-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] focus:border-[#C9A24D] focus:bg-white focus:outline-none text-sm font-bold text-[#0B192C] text-right transition-colors"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-[#0B192C] cursor-pointer"
                      aria-label={showPassword ? 'إخفاء كلمة المرور' : 'إظهار كلمة المرور'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoggingIn || isScanningBiometric}
                  className="w-full py-3.5 bg-[#0B192C] hover:bg-[#13253E] disabled:opacity-55 text-white font-display font-extrabold text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin text-[#C9A24D]" />
                      <span>جاري التحقق...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4 text-[#C9A24D]" />
                      <span>تسجيل الدخول</span>
                    </>
                  )}
                </button>
              </form>

              {/* Automatic Biometric Login Button (shown only when device supports WebAuthn & user has enrolled passkey) */}
              {canUseBiometric && (
                <div className="pt-1 space-y-3">
                  <div className="relative flex items-center justify-center">
                    <div className="border-t border-[#E6DFD1] w-full" />
                    <span className="bg-white px-3 text-[11px] font-bold text-slate-400 shrink-0">
                      أو الدخول السريع
                    </span>
                    <div className="border-t border-[#E6DFD1] w-full" />
                  </div>

                  <button
                    type="button"
                    onClick={handleBiometricLogin}
                    disabled={isScanningBiometric || isLoggingIn}
                    className="w-full py-3.5 px-4 bg-[#FAF7F2] hover:bg-[#F3EFE6] border-2 border-[#C9A24D]/60 hover:border-[#C9A24D] text-[#0B192C] font-display font-extrabold text-sm rounded-xl transition-colors flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-55"
                  >
                    {isScanningBiometric ? (
                      <>
                        <Scan className="w-5 h-5 text-[#9B7729] animate-pulse" />
                        <span>يرجى تأكيد البصمة على جهازك...</span>
                      </>
                    ) : (
                      <>
                        <Fingerprint className="w-5 h-5 text-[#9B7729]" />
                        <span>الدخول بالبصمة 👆</span>
                      </>
                    )}
                  </button>

                  {primaryPasskey && (
                    <p className="text-[11px] text-center text-slate-500 font-semibold">
                      البصمة مفعّلة لهذا الجهاز ({primaryPasskey.deviceName})
                      {eligiblePasskeys.length === 1 ? ` • @${primaryPasskey.username}` : ''}
                    </p>
                  )}
                </div>
              )}

              {loginError && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 text-xs font-bold flex items-start gap-2 text-right">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span>{loginError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="p-3.5 bg-[#FAF7F2] border-t border-[#E6DFD1] flex items-center justify-between px-6 text-[11px] text-slate-500 font-semibold">
          <span className="flex items-center gap-1.5">
            <Lock className="w-3.5 h-3.5 text-[#0F766E]" />
            <span>تحقق مشفر (PBKDF2 / WebAuthn)</span>
          </span>
          <span>لا يتاح التسجيل الذاتي</span>
        </div>
      </motion.div>
    </div>
  );
};

export default AdminAuthModal;

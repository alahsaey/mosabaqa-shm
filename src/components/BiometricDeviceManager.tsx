import React, { useState, useEffect } from 'react';
import {
  Fingerprint,
  CheckCircle2,
  AlertTriangle,
  ShieldCheck,
  Smartphone,
  Loader2,
  Trash2,
  Scan,
  Plus,
} from 'lucide-react';
import { biometricService, detectDeviceName } from '../services/biometricService';
import { AdminPasskeyRecord, AuthSessionUser } from '../types';

interface BiometricDeviceManagerProps {
  currentUser: AuthSessionUser;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
  onEnrollmentChange?: (hasPasskeys: boolean) => void;
}

export const BiometricDeviceManager: React.FC<BiometricDeviceManagerProps> = ({
  currentUser,
  playSound,
  onEnrollmentChange,
}) => {
  const [passkeys, setPasskeys] = useState<AdminPasskeyRecord[]>([]);
  const [deviceLabel, setDeviceLabel] = useState('');
  const [isSupported, setIsSupported] = useState(false);
  const [checkedSupport, setCheckedSupport] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const currentLocalId = biometricService.getLocalCredentialHint();

  useEffect(() => {
    biometricService.isPlatformSupported().then((supported) => {
      setIsSupported(supported);
      setCheckedSupport(true);
    });

    const unsub = biometricService.subscribePasskeys((list) => {
      setPasskeys(list);
      onEnrollmentChange?.(list.some((p) => p.isActive !== false));
    }, currentUser.id);

    return () => unsub();
  }, [currentUser.id, onEnrollmentChange]);

  const handleEnroll = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    playSound?.('click');

    const res = await biometricService.enrollDeviceForUser(
      currentUser,
      deviceLabel.trim() || detectDeviceName()
    );
    setIsProcessing(false);

    if (res.success) {
      playSound?.('victory');
      setDeviceLabel('');
      setStatusMessage({
        type: 'success',
        text: `تم تفعيل الدخول بالبصمة لحساب (@${currentUser.username}) على هذا الجهاز بنجاح.`,
      });
    } else {
      playSound?.('wrong');
      setStatusMessage({
        type: 'error',
        text: res.error || 'تعذر تفعيل بصمة الجهاز.',
      });
    }
  };

  const handleTest = async () => {
    setIsProcessing(true);
    setStatusMessage(null);
    playSound?.('click');

    const res = await biometricService.verifyBiometricLogin(currentUser.username);
    setIsProcessing(false);

    if (res.success) {
      playSound?.('correct');
      setStatusMessage({
        type: 'success',
        text: 'نجح اختبار المطابقة بالبصمة بنجاح! يمكنك استخدام «الدخول بالبصمة 👆» من شاشة الدخول.',
      });
    } else {
      playSound?.('wrong');
      setStatusMessage({
        type: 'error',
        text: res.error || 'فشل اختبار البصمة.',
      });
    }
  };

  const handleRemove = async (pk: AdminPasskeyRecord) => {
    setIsProcessing(true);
    setStatusMessage(null);
    playSound?.('click');
    try {
      await biometricService.revokePasskey(pk.credentialId, currentUser.username);
      setStatusMessage({
        type: 'success',
        text: `تم إلغاء تفعيل بصمة الجهاز (${pk.deviceName}) فوراً.`,
      });
    } catch (err: any) {
      setStatusMessage({
        type: 'error',
        text: err?.message || 'تعذر حذف البصمة.',
      });
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <div className="w-full bg-[#0B192C] text-[#FAF7F2] rounded-2xl p-6 border border-[#C9A24D]/30 space-y-5 text-right">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-xl bg-[#13253E] border border-[#C9A24D]/40 flex items-center justify-center text-[#C9A24D]">
            <Fingerprint className="w-6 h-6" />
          </div>
          <div>
            <h4 className="text-base font-bold text-white">تفعيل وإدارة الدخول بالبصمة (WebAuthn)</h4>
            <p className="text-xs text-slate-300 mt-0.5">
              مرتبطة مباشرة بحسابك (<span className="font-mono text-[#D9B768]">@{currentUser.username}</span>) دون الحاجة لحساب Google
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span
            className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${
              passkeys.length > 0
                ? 'bg-emerald-500/15 border-emerald-400/40 text-emerald-300'
                : 'bg-white/5 border-white/15 text-slate-300'
            }`}
          >
            {passkeys.length > 0 ? `مفعّلة (${passkeys.length})` : 'غير مفعّلة'}
          </span>

          {passkeys.length > 0 && (
            <button
              type="button"
              onClick={handleTest}
              disabled={isProcessing}
              className="px-4 py-1.5 bg-[#13253E] hover:bg-[#1D3554] border border-[#C9A24D]/40 text-[#D9B768] rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Scan className="w-4 h-4" />
              <span>اختبار البصمة</span>
            </button>
          )}
        </div>
      </div>

      {/* Registered Passkeys List for Current User */}
      {passkeys.length > 0 ? (
        <div className="space-y-2.5">
          {passkeys.map((pk) => {
            const isThisDevice = currentLocalId === pk.credentialId;
            return (
              <div
                key={pk.credentialId}
                className="p-3.5 bg-[#13253E] rounded-xl border border-white/10 flex items-center justify-between gap-3 flex-wrap"
              >
                <div className="flex items-center gap-3">
                  <Smartphone className="w-5 h-5 text-[#C9A24D] shrink-0" />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-white">{pk.deviceName}</span>
                      {isThisDevice && (
                        <span className="text-[11px] font-bold text-emerald-300">• هذا الجهاز</span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                      ID: {pk.credentialId.slice(0, 14)}... • @{pk.username}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-400">
                    <ShieldCheck className="w-4 h-4" />
                    مفعّل
                  </span>
                  <button
                    type="button"
                    onClick={() => handleRemove(pk)}
                    disabled={isProcessing}
                    className="px-2.5 py-1.5 text-rose-300 hover:text-rose-100 hover:bg-rose-500/20 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
                    title="إلغاء تفعيل بصمة هذا الجهاز"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>إلغاء</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="p-4 bg-[#13253E] rounded-xl border border-white/10 text-xs text-slate-300">
          لم تقم بتفعيل الدخول بالبصمة على حسابك بعد. فعّل البصمة أدناه لتسجيل الدخول بضغطة واحدة دون إعادة كتابة كلمة المرور.
        </div>
      )}

      {/* Enrollment Form */}
      <div className="pt-2 border-t border-white/10 space-y-3">
        {checkedSupport && !isSupported && (
          <div className="p-3 bg-amber-500/15 border border-amber-400/30 rounded-xl text-xs text-amber-200">
            هذا المتصفح أو الجهاز لا يُظهر مستشعر بصمة مدمجاً (PublicKeyCredential). يرجى فتح الموقع عبر HTTPS على جهاز يدعم بصمة الإصبع أو الوجه أو Windows Hello.
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          <input
            type="text"
            value={deviceLabel}
            onChange={(e) => setDeviceLabel(e.target.value)}
            placeholder={`اسم الجهاز (مثال: ${detectDeviceName()})`}
            className="flex-1 px-4 py-2.5 bg-[#13253E] border border-white/15 rounded-xl text-xs text-white placeholder:text-slate-400 focus:outline-none focus:border-[#C9A24D]"
          />
          <button
            type="button"
            onClick={handleEnroll}
            disabled={isProcessing}
            className="px-5 py-2.5 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-bold text-xs rounded-xl flex items-center justify-center gap-2 transition-colors cursor-pointer disabled:opacity-50 whitespace-nowrap"
          >
            {isProcessing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            <span>تفعيل بصمة هذا الجهاز</span>
          </button>
        </div>
      </div>

      {statusMessage && (
        <div
          className={`p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
            statusMessage.type === 'success'
              ? 'bg-emerald-500/20 text-emerald-200 border border-emerald-500/30'
              : 'bg-rose-500/20 text-rose-200 border border-rose-500/30'
          }`}
        >
          {statusMessage.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
          )}
          <span>{statusMessage.text}</span>
        </div>
      )}
    </div>
  );
};

export default BiometricDeviceManager;

import React, { useState } from 'react';
import { Download, Share, PlusSquare, X, Smartphone } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { BRAND_ASSETS } from '../../lib/assets';
import { isValidCustomLogoUrl } from '../../services/pwaBrandingService';

interface PWAInstallButtonProps {
  competitionName?: string;
  logoUrl?: string;
  variant?: 'header' | 'modal';
  onAction?: () => void;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  competitionName = 'مسابقة ابوالفواطم',
  logoUrl,
  variant = 'header',
  onAction,
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) return null;
  if (!isInstallable && !isIOS) return null;

  const resolvedIcon = isValidCustomLogoUrl(logoUrl) ? logoUrl! : BRAND_ASSETS.emblem;

  const handleClick = async () => {
    onAction?.();
    if (isInstallable) {
      await install();
    } else if (isIOS) {
      setShowIOSGuide(true);
    }
  };

  return (
    <>
      {variant === 'header' ? (
        <button
          type="button"
          onClick={handleClick}
          title="تثبيت التطبيق على الجهاز"
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-bold bg-white/10 hover:bg-white/20 text-[#D9B768] border border-[#C9A24D]/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <Download className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">تثبيت التطبيق</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={handleClick}
          className="w-full py-3 px-4 rounded-xl bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#C9A24D]/60 text-[#0B192C] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
        >
          <Smartphone className="w-4 h-4 text-[#9B7729]" />
          <span>تثبيت التطبيق على الشاشة الرئيسية بأيقونة الشعار المعتمد</span>
        </button>
      )}

      {showIOSGuide && (
        <div className="fixed inset-0 z-[9995] flex items-center justify-center p-4 bg-[#07111E]/75 backdrop-blur-sm text-right">
          <div className="w-full max-w-sm bg-white rounded-3xl border border-[#E6DFD1] shadow-2xl overflow-hidden">
            <div className="p-5 bg-[#0B192C] text-white flex items-center justify-between border-b border-[#C9A24D]/30">
              <div className="flex items-center gap-3">
                <img
                  src={resolvedIcon}
                  alt={competitionName}
                  className="w-11 h-11 rounded-2xl object-cover border border-[#C9A24D]/60 bg-[#13253E]"
                  onError={(e) => {
                    e.currentTarget.src = BRAND_ASSETS.emblem;
                  }}
                />
                <div>
                  <span className="text-[11px] font-bold text-[#D9B768]">تثبيت على iPhone / iPad</span>
                  <h3 className="font-display font-extrabold text-base">{competitionName}</h3>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-8 h-8 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-sm text-[#0B192C]">
              <p className="text-xs text-slate-600 leading-relaxed">
                لإضافة التطبيق إلى الشاشة الرئيسية بأيقونة الشعار المعتمد في متصفح Safari:
              </p>
              <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center gap-3 text-xs font-bold">
                <Share className="w-5 h-5 text-[#9B7729] shrink-0" />
                <span>١. اضغط على زر المشاركة (Share) في أسفل متصفح Safari.</span>
              </div>
              <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center gap-3 text-xs font-bold">
                <PlusSquare className="w-5 h-5 text-[#0F766E] shrink-0" />
                <span>٢. مرّر للأسفل واختر «إضافة إلى الشاشة الرئيسية» (Add to Home Screen).</span>
              </div>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full py-2.5 rounded-xl bg-[#0B192C] text-[#D9B768] text-xs font-bold cursor-pointer"
              >
                فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default PWAInstallButton;

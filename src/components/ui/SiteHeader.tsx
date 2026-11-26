import React from 'react';
import {
  Volume2,
  VolumeX,
  Maximize2,
  Minimize2,
  BarChart3,
  History,
  Settings,
  ShieldCheck,
  Home,
  Wifi,
  WifiOff,
  Loader2,
} from 'lucide-react';
import { BRAND_ASSETS } from '../../lib/assets';
import { isValidCustomLogoUrl } from '../../services/pwaBrandingService';
import { PWAInstallButton } from './PWAInstallButton';

interface SiteHeaderProps {
  competitionName: string;
  logoUrl?: string;
  dbConnected: 'connecting' | 'connected' | 'error';
  enableSounds: boolean;
  onToggleSounds: () => void;
  isFullscreen: boolean;
  onToggleFullscreen: () => void;
  onGoHome: () => void;
  onOpenStats: () => void;
  onOpenRecent: () => void;
  onOpenSettings: () => void;
  onOpenAdmin: () => void;
  isAdmin: boolean;
  adminEmail?: string;
  stageLabel?: string;
  hideControlsInTv?: boolean;
}

export const SiteHeader: React.FC<SiteHeaderProps> = ({
  competitionName,
  logoUrl,
  dbConnected,
  enableSounds,
  onToggleSounds,
  isFullscreen,
  onToggleFullscreen,
  onGoHome,
  onOpenStats,
  onOpenRecent,
  onOpenSettings,
  onOpenAdmin,
  isAdmin,
  stageLabel,
  hideControlsInTv = false,
}) => {
  if (hideControlsInTv) return null;

  const resolvedLogo = isValidCustomLogoUrl(logoUrl) ? logoUrl! : BRAND_ASSETS.emblem;

  return (
    <header className="sticky top-0 z-50 w-full bg-[#0B192C] text-[#FAF7F2] border-b border-[#C9A24D]/30 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
        {/* Zone 1: Brand Identity */}
        <button
          type="button"
          onClick={onGoHome}
          className="flex items-center gap-3 text-right hover:opacity-90 transition-opacity cursor-pointer shrink-0"
        >
          <img
            src={resolvedLogo}
            alt={competitionName}
            className="w-10 h-10 rounded-xl object-cover border border-[#C9A24D]/60 bg-[#13253E]"
            onError={(e) => {
              e.currentTarget.src = BRAND_ASSETS.emblem;
            }}
          />
          <div className="flex flex-col leading-tight">
            <span className="font-display font-extrabold text-base sm:text-lg text-[#FAF7F2] whitespace-nowrap">
              {competitionName}
            </span>
          </div>
        </button>

        {/* Zone 2: Stage / Status */}
        <div className="hidden md:flex items-center gap-4 text-xs font-medium text-[#FAF7F2]/80">
          {stageLabel && (
            <span className="text-[#D9B768] font-semibold whitespace-nowrap">{stageLabel}</span>
          )}
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            {dbConnected === 'connected' ? (
              <>
                <Wifi className="w-3.5 h-3.5 text-emerald-400" />
                <span>قاعدة البيانات متصلة</span>
              </>
            ) : dbConnected === 'connecting' ? (
              <>
                <Loader2 className="w-3.5 h-3.5 text-[#D9B768] animate-spin" />
                <span>جاري الاتصال...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-3.5 h-3.5 text-rose-400" />
                <span>وضع عدم الاتصال</span>
              </>
            )}
          </span>
        </div>

        {/* Zone 3: Navigation & Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onGoHome}
            title="الرئيسية"
            className="p-2 rounded-lg text-[#FAF7F2]/80 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Home className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={onOpenRecent}
            title="سجل المسابقات"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#FAF7F2]/85 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
          >
            <History className="w-4 h-4 text-[#C9A24D]" />
            <span>السجل</span>
          </button>

          <button
            type="button"
            onClick={onOpenStats}
            title="الإحصائيات"
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-[#FAF7F2]/85 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors whitespace-nowrap cursor-pointer"
          >
            <BarChart3 className="w-4 h-4 text-[#C9A24D]" />
            <span>الإحصائيات</span>
          </button>

          <button
            type="button"
            onClick={onToggleSounds}
            title={enableSounds ? 'كتم الصوت' : 'تفعيل الصوت'}
            className="p-2 rounded-lg text-[#FAF7F2]/80 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            {enableSounds ? <Volume2 className="w-4 h-4 text-[#C9A24D]" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          </button>

          <button
            type="button"
            onClick={onToggleFullscreen}
            title={isFullscreen ? 'إنهاء ملء الشاشة' : 'ملء الشاشة'}
            className="hidden sm:inline-flex p-2 rounded-lg text-[#FAF7F2]/80 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>

          <button
            type="button"
            onClick={onOpenSettings}
            title="خيارات المسابقة"
            className="p-2 rounded-lg text-[#FAF7F2]/80 hover:text-[#FAF7F2] hover:bg-white/10 transition-colors cursor-pointer"
          >
            <Settings className="w-4 h-4" />
          </button>

          <PWAInstallButton competitionName={competitionName} logoUrl={logoUrl} variant="header" />

          <button
            type="button"
            onClick={onOpenAdmin}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <ShieldCheck className="w-4 h-4" />
            <span>{isAdmin ? 'لوحة الإدارة' : 'دخول الإدارة'}</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default SiteHeader;

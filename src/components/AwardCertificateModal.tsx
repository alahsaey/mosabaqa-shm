import React, { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Award, 
  Download, 
  Share2, 
  Printer, 
  X, 
  Sparkles, 
  Check, 
  Star,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { Team } from '../types';

interface AwardCertificateModalProps {
  isOpen: boolean;
  onClose: () => void;
  team: Team | null;
  rank: number; // 1, 2, 3...
  competitionName: string;
  competitionSlogan?: string;
  dateStr?: string;
  totalTeamsCount?: number;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

export const AwardCertificateModal: React.FC<AwardCertificateModalProps> = ({
  isOpen,
  onClose,
  team,
  rank,
  competitionName,
  competitionSlogan,
  dateStr,
  playSound
}) => {
  const [isExporting, setIsExporting] = useState(false);
  const [downloadSuccess, setDownloadSuccess] = useState(false);
  const certificateRef = useRef<HTMLDivElement>(null);

  if (!isOpen || !team) return null;

  const currentDate = dateStr || new Date().toLocaleDateString('ar-SA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });

  const rankLabel = rank === 1 ? 'المركز الأول • بطل المسابقة' :
                    rank === 2 ? 'المركز الثاني • وصيف البطولة' :
                    rank === 3 ? 'المركز الثالث • درع التميز' :
                    `المركز ${rank} • شهادة مشاركة وتقدير`;

  const rankBadgeColor = rank === 1 ? 'from-[#D9B768] via-[#C9A24D] to-[#9B7729] text-[#0B192C]' :
                         rank === 2 ? 'from-slate-200 via-slate-300 to-slate-400 text-[#0B192C]' :
                         rank === 3 ? 'from-[#9B7729] via-[#7A5B1A] to-[#5B4211] text-[#FAF7F2]' :
                         'from-[#13253E] to-[#0B192C] text-[#D9B768]';

  /**
   * High-resolution 2K Certificate Generator via Native Canvas
   */
  const handleDownloadPNG = async () => {
    setIsExporting(true);
    playSound?.('click');

    try {
      const canvas = document.createElement('canvas');
      const width = 1920;
      const height = 1080;
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');

      if (!ctx) throw new Error('Canvas not supported');

      // 1. Rich Navy Broadcast Background
      const bgGrad = ctx.createLinearGradient(0, 0, width, height);
      bgGrad.addColorStop(0, '#0B192C');
      bgGrad.addColorStop(0.5, '#13253E');
      bgGrad.addColorStop(1, '#07111E');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, width, height);

      // Decorative radial gold glow
      const radialGlow = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 700);
      radialGlow.addColorStop(0, 'rgba(201, 162, 77, 0.22)');
      radialGlow.addColorStop(0.5, 'rgba(201, 162, 77, 0.08)');
      radialGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = radialGlow;
      ctx.fillRect(0, 0, width, height);

      // 2. Ornate Dual Gold Borders
      ctx.strokeStyle = '#C9A24D';
      ctx.lineWidth = 14;
      ctx.strokeRect(60, 60, width - 120, height - 120);

      ctx.strokeStyle = 'rgba(217, 183, 104, 0.45)';
      ctx.lineWidth = 3;
      ctx.strokeRect(84, 84, width - 168, height - 168);

      // Corner Accents
      const drawCorner = (x: number, y: number, angle: number) => {
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate(angle);
        ctx.fillStyle = '#C9A24D';
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(40, 0);
        ctx.lineTo(40, 10);
        ctx.lineTo(10, 10);
        ctx.lineTo(10, 40);
        ctx.lineTo(0, 40);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      };
      drawCorner(60, 60, 0);
      drawCorner(width - 60, 60, Math.PI / 2);
      drawCorner(width - 60, height - 60, Math.PI);
      drawCorner(60, height - 60, -Math.PI / 2);

      const arabicFont = '"Tajawal", "IBM Plex Sans Arabic", sans-serif';

      // 3. Text Header - Islamic / Cultural Heading
      ctx.textAlign = 'center';
      ctx.fillStyle = '#D9B768';
      ctx.font = `bold 36px ${arabicFont}`;
      ctx.fillText('بِسْمِ اللَّـهِ الرَّحْمَـٰنِ الرَّحِيمِ', width / 2, 140);

      // Main Competition Name
      ctx.fillStyle = '#FAF7F2';
      ctx.font = `900 68px ${arabicFont}`;
      ctx.fillText(competitionName || 'مسابقة ابوالفواطم الثقافية', width / 2, 230);

      if (competitionSlogan) {
        ctx.fillStyle = '#cbd5e1';
        ctx.font = `bold 30px ${arabicFont}`;
        ctx.fillText(competitionSlogan, width / 2, 280);
      }

      // Title: شهادة تتويج وتقدير
      const titleGrad = ctx.createLinearGradient(width / 2 - 300, 0, width / 2 + 300, 0);
      titleGrad.addColorStop(0, '#F7F1DF');
      titleGrad.addColorStop(0.5, '#D9B768');
      titleGrad.addColorStop(1, '#C9A24D');
      ctx.fillStyle = titleGrad;
      ctx.font = `900 76px ${arabicFont}`;
      ctx.fillText('شَهَادَةُ تَتْوِيجٍ وَتَقْدِيرٍ', width / 2, 380);

      // Award Statement
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold 32px ${arabicFont}`;
      ctx.fillText('تتشرف إدارة المسابقة بمنح هذه الشهادة المتميزة إلى أبطال:', width / 2, 450);

      // Winning Team Name with highlight banner
      ctx.fillStyle = 'rgba(255, 255, 255, 0.08)';
      ctx.beginPath();
      ctx.roundRect(width / 2 - 450, 480, 900, 110, [28]);
      ctx.fill();
      ctx.strokeStyle = '#C9A24D';
      ctx.lineWidth = 4;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = `900 64px ${arabicFont}`;
      ctx.fillText(team.name, width / 2, 558);

      // Rank & Achievement
      ctx.fillStyle = '#D9B768';
      ctx.font = `900 42px ${arabicFont}`;
      ctx.fillText(rankLabel, width / 2, 650);

      // Score Callout
      ctx.fillStyle = '#FAF7F2';
      ctx.font = `bold 32px ${arabicFont}`;
      ctx.fillText(`برصيد نهائي مستحق قدره: ${team.score} نقطة`, width / 2, 715);

      // Appreciation Note
      ctx.fillStyle = '#cbd5e1';
      ctx.font = `28px ${arabicFont}`;
      ctx.fillText('تقديراً لجهودهم المعرفية وتألقهم المتميز وروحهم التنافسية العالية', width / 2, 775);

      // Footer - Official Seal & Signatures
      ctx.textAlign = 'right';
      ctx.fillStyle = '#e2e8f0';
      ctx.font = `bold 28px ${arabicFont}`;
      ctx.fillText(`التاريخ: ${currentDate}`, width - 150, 950);

      ctx.textAlign = 'left';
      ctx.fillText('إدارة مسابقة ابوالفواطم', 150, 930);
      ctx.fillStyle = '#D9B768';
      ctx.font = `24px ${arabicFont}`;
      ctx.fillText('موثق رسمياً • منصة ثقافية', 150, 970);

      // Center Official Golden Seal
      ctx.beginPath();
      ctx.arc(width / 2, 920, 55, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(201, 162, 77, 0.2)';
      ctx.fill();
      ctx.strokeStyle = '#C9A24D';
      ctx.lineWidth = 3;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.fillStyle = '#D9B768';
      ctx.font = `bold 20px ${arabicFont}`;
      ctx.fillText('الختم الرسمي', width / 2, 915);
      ctx.fillText('معتمد', width / 2, 942);

      // Trigger download
      const dataUrl = canvas.toDataURL('image/png');
      const link = document.createElement('a');
      link.download = `شهادة_فوز_${team.name.replace(/\s+/g, '_')}_${competitionName.replace(/\s+/g, '_')}.png`;
      link.href = dataUrl;
      link.click();

      playSound?.('victory');
      setDownloadSuccess(true);
      setTimeout(() => setDownloadSuccess(false), 3500);
    } catch (err) {
      console.error('Failed to export certificate:', err);
      playSound?.('wrong');
    } finally {
      setIsExporting(false);
    }
  };

  const handleShare = async () => {
    playSound?.('click');
    const shareText = `🏆 نبارك لـ ${team.name} فوزهم بـ (${rankLabel}) في ${competitionName} برصيد ${team.score} نقطة! 🎉`;
    
    if (navigator.share) {
      try {
        await navigator.share({
          title: `شهادة فوز ${team.name} - ${competitionName}`,
          text: shareText,
          url: window.location.href
        });
      } catch {}
    } else {
      try {
        await navigator.clipboard.writeText(shareText + '\n' + window.location.href);
        setDownloadSuccess(true);
        setTimeout(() => setDownloadSuccess(false), 3000);
      } catch {}
    }
  };

  const handlePrint = () => {
    playSound?.('click');
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-2xl animate-in fade-in duration-300 overflow-y-auto">
      <motion.div 
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        className="relative w-full max-w-4xl bg-white rounded-3xl shadow-[0_35px_120px_rgba(0,0,0,0.5)] border-2 border-[#C9A24D] overflow-hidden my-6 flex flex-col"
      >
        {/* Top Control Bar */}
        <div className="p-4 md:p-6 bg-[#0B192C] border-b border-[#C9A24D]/30 flex items-center justify-between text-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-[#C9A24D]/20 border border-[#C9A24D] text-[#D9B768] flex items-center justify-center">
              <Award className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-display font-black text-white">شهادة التكريم والبطولة الرسمية</h3>
              <p className="text-[11px] text-slate-300 font-bold">جاهزة للتحميل كصورة عالية الدقة أو الطباعة</p>
            </div>
          </div>

          <button 
            type="button"
            onClick={() => { playSound?.('click'); onClose(); }}
            className="w-10 h-10 rounded-2xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Certificate Visual Canvas Preview */}
        <div className="p-4 md:p-8 bg-[#FAF7F2] flex items-center justify-center overflow-x-auto">
          <div 
            ref={certificateRef}
            className="certificate-print-area relative w-full max-w-3xl aspect-[16/10] bg-gradient-to-br from-[#0B192C] via-[#13253E] to-[#07111E] rounded-3xl p-6 md:p-10 border-8 border-[#C9A24D] shadow-2xl text-center text-white flex flex-col justify-between overflow-hidden select-none"
            style={{
              boxShadow: '0 0 50px rgba(201, 162, 77, 0.2), inset 0 0 40px rgba(0,0,0,0.55)'
            }}
          >
            {/* Background Ornate Glow & Pattern */}
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-[#C9A24D]/15 via-transparent to-transparent pointer-events-none" />
            <div className="absolute inset-2 border-2 border-[#C9A24D]/45 rounded-2xl pointer-events-none" />

            {/* Header: Basmala & Competition Name */}
            <div className="space-y-1 relative z-10">
              <p className="text-[#D9B768] text-[11px] md:text-sm font-serif">بِسْمِ اللَّـهِ الرَّحْمَـٰنِ الرَّحِيمِ</p>
              <h2 className="text-xl md:text-3xl font-display font-black text-white drop-shadow-md">
                {competitionName || 'مسابقة ابوالفواطم الثقافية'}
              </h2>
              {competitionSlogan && (
                <p className="text-xs md:text-sm text-slate-300 font-medium">{competitionSlogan}</p>
              )}
            </div>

            {/* Certificate Title Badge */}
            <div className="my-2 relative z-10">
              <div className="inline-block px-8 py-2 md:py-3 rounded-2xl bg-gradient-to-r from-[#D9B768] via-[#C9A24D] to-[#9B7729] text-[#0B192C] shadow-xl border border-[#F7F1DF]">
                <h1 className="text-xl md:text-3xl font-display font-black tracking-wide">
                  شَهَادَةُ تَتْوِيجٍ وَتَقْدِيرٍ
                </h1>
              </div>
            </div>

            {/* Middle: Honored Team */}
            <div className="space-y-3 relative z-10">
              <p className="text-xs md:text-sm text-slate-200 font-bold">
                تمنح إدارة المسابقة هذه الشهادة التكريمية إلى أبطال:
              </p>
              
              <div 
                className="py-3 px-8 rounded-2xl inline-block bg-white/10 backdrop-blur-md border-2 shadow-xl"
                style={{ borderColor: team.color && team.color !== '#0B192C' ? team.color : '#C9A24D' }}
              >
                <h3 className="text-2xl md:text-4xl font-display font-black text-white drop-shadow-lg tracking-tight">
                  {team.name}
                </h3>
              </div>

              <div>
                <span className={`inline-block px-4 py-1 rounded-xl text-xs md:text-sm font-black bg-gradient-to-r ${rankBadgeColor} shadow-md`}>
                  {rankLabel}
                </span>
                <p className="text-sm md:text-base font-black text-slate-200 mt-1">
                  برصيد نهائي مستحق: <strong className="text-[#D9B768] text-lg md:text-xl font-mono tabular-nums">{team.score}</strong> نقطة
                </p>
              </div>

              <p className="text-[11px] md:text-xs text-slate-300">
                تقديراً لجهودهم المعرفية وتألقهم المتميز وروحهم التنافسية العالية
              </p>
            </div>

            {/* Footer Signatures & Date */}
            <div className="flex items-end justify-between pt-4 border-t border-[#C9A24D]/35 text-[10px] md:text-xs text-slate-300 relative z-10">
              <div className="text-right">
                <p className="font-black text-white">إدارة مسابقة ابوالفواطم</p>
                <p className="text-[#D9B768] font-bold">موثق رسمياً</p>
              </div>

              {/* Gold Seal Stamp */}
              <div className="w-14 h-14 md:w-16 md:h-16 rounded-full border-2 border-[#C9A24D] bg-[#C9A24D]/20 flex flex-col items-center justify-center text-[#D9B768] font-black shadow-lg">
                <Star className="w-4 h-4 fill-[#C9A24D] text-[#C9A24D]" />
                <span className="text-[8px] tracking-wide mt-0.5">الختم الرسمي</span>
              </div>

              <div className="text-left">
                <p className="text-slate-300">التاريخ:</p>
                <p className="font-bold text-white flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-[#C9A24D]" />
                  <span>{currentDate}</span>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Action Buttons Toolbar */}
        <div className="p-4 md:p-6 bg-[#0B192C] border-t border-[#C9A24D]/30 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadPNG}
              disabled={isExporting}
              className="px-6 py-3.5 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-display font-black text-sm rounded-2xl shadow-xl flex items-center gap-2.5 transition-all cursor-pointer disabled:opacity-50"
            >
              {downloadSuccess ? (
                <>
                  <Check className="w-5 h-5 text-[#0B192C]" />
                  <span>تم حفظ الشهادة بنجاح</span>
                </>
              ) : (
                <>
                  <Download className="w-5 h-5" />
                  <span>{isExporting ? 'جاري إنشاء الشهادة...' : 'تحميل الشهادة صورة (PNG عالية الدقة)'}</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShare}
              className="px-5 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-2xl flex items-center gap-2 transition-all cursor-pointer"
            >
              <Share2 className="w-4 h-4 text-[#C9A24D]" />
              <span>مشاركة</span>
            </button>

            <button
              type="button"
              onClick={handlePrint}
              className="px-4 py-3.5 bg-white/10 hover:bg-white/20 text-white font-bold text-sm rounded-2xl flex items-center gap-2 transition-all cursor-pointer"
              title="طباعة الشهادة"
            >
              <Printer className="w-4 h-4 text-[#C9A24D]" />
            </button>
          </div>

          <button
            type="button"
            onClick={() => { playSound?.('click'); onClose(); }}
            className="px-6 py-3.5 bg-white/10 hover:bg-white/20 text-slate-200 font-bold text-sm rounded-2xl transition-all cursor-pointer"
          >
            إغلاق
          </button>
        </div>
      </motion.div>
    </div>
  );
};

export default AwardCertificateModal;

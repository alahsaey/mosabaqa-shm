import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Trophy, 
  Award, 
  Star, 
  Sparkles, 
  Crown, 
  Medal, 
  Users, 
  FileText, 
  RotateCcw,
  RefreshCcw,
  CheckCircle2,
  XCircle,
  Share2
} from 'lucide-react';
import { Team } from '../types';
import { AwardCertificateModal } from './AwardCertificateModal';

interface ChampionshipPodiumProps {
  teams: Team[];
  isDraw?: boolean;
  gameDuration: number;
  competitionName: string;
  competitionSlogan?: string;
  onNewGame: () => void;
  isRegenerating?: boolean;
  regProgress?: string;
  regError?: string;
  regSuccess?: boolean;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

const formatDuration = (seconds: number): string => {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s < 10 ? '0' : ''}${s}`;
};

export const ChampionshipPodium: React.FC<ChampionshipPodiumProps> = ({
  teams,
  isDraw: isDrawProp,
  gameDuration,
  competitionName,
  competitionSlogan,
  onNewGame,
  isRegenerating,
  regProgress,
  regError,
  regSuccess,
  playSound
}) => {
  const [selectedTeamForCert, setSelectedTeamForCert] = useState<{ team: Team; rank: number } | null>(null);

  // Preserve pre-sorted order from ResultsView (respects accuracy_tiebreaker mode)
  const orderedTeams = teams;
  const first = orderedTeams[0] || null;
  const second = orderedTeams[1] || null;
  const third = orderedTeams[2] || null;
  const others = orderedTeams.slice(3);

  const isDraw =
    typeof isDrawProp === 'boolean'
      ? isDrawProp
      : orderedTeams.length > 1 && orderedTeams[0].score === orderedTeams[1].score;

  return (
    <div className="w-full max-w-6xl mx-auto space-y-12 py-6 px-4 text-center">
      {/* Trophy & Atmosphere Header */}
      <div className="relative inline-block">
        <motion.div
          animate={{ y: [-6, 6, -6] }}
          transition={{ duration: 4, repeat: Infinity, ease: 'easeInOut' }}
          className="relative inline-block mb-4"
        >
          <div className="w-24 h-24 md:w-28 md:h-28 rounded-3xl bg-[#0B192C] text-[#C9A24D] flex items-center justify-center shadow-2xl border-2 border-[#C9A24D] mx-auto">
            <Trophy className="w-14 h-14 md:w-16 md:h-16" />
          </div>
        </motion.div>

        <h1 className="text-4xl md:text-5xl font-display font-black text-[#0B192C] tracking-tight">
          {isDraw ? 'تعادل مستحق في صدارة المسابقة' : 'منصة التتويج والأبطال'}
        </h1>
        <p className="text-slate-600 font-bold text-base md:text-lg mt-2 max-w-xl mx-auto">
          {isDraw
            ? `${competitionName} • تساوى الفريقان في النتيجة النهائية بعد منافسة متكافئة`
            : `${competitionName} • تكريم العقول المتميزة والجهود المعرفية`}
        </p>

        {/* Total Duration & Draw Notice */}
        <div className="flex flex-wrap items-center justify-center gap-3 mt-4">
          <div className="inline-flex items-center gap-3 px-5 py-2 bg-white border border-[#E6DFD1] rounded-xl shadow-sm text-[#0B192C] font-bold text-sm">
            <RefreshCcw className="w-4 h-4 text-[#9B7729]" />
            <span>مدة المسابقة:</span>
            <span className="text-[#0B192C] font-mono text-base tabular-nums">{formatDuration(gameDuration)}</span>
          </div>
          {isDraw && (
            <div className="inline-flex items-center gap-2 px-5 py-2 bg-[#0B192C] border border-[#C9A24D] rounded-xl text-[#D9B768] font-bold text-sm">
              <Award className="w-4 h-4 text-[#C9A24D]" />
              <span>تعادل بالمركز الأول</span>
            </div>
          )}
        </div>
      </div>

      {/* 3D-Styled Championship Podium (1st, 2nd, 3rd) */}
      <div className="relative pt-12 pb-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 md:gap-4 items-end max-w-4xl mx-auto">
          {/* Second Place Podium Step (Left) */}
          {second && (
            <motion.div
              initial={{ y: 60, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.2, type: 'spring', damping: 15 }}
              className="flex flex-col items-center order-2 md:order-1"
            >
              {/* Team Avatar & Info */}
              <div className="relative mb-3 flex flex-col items-center">
                <div 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-3xl border-4 border-slate-300 shadow-xl flex items-center justify-center text-white font-black text-2xl relative overflow-hidden"
                  style={{ backgroundColor: second.color }}
                >
                  {second.name.charAt(0)}
                  <span className="absolute -bottom-1 -right-1 w-7 h-7 bg-slate-300 text-slate-900 rounded-full border-2 border-white flex items-center justify-center font-black text-xs shadow-md">
                    2
                  </span>
                </div>
                <h3 className="font-black text-slate-900 text-lg md:text-xl mt-2 truncate max-w-[200px]">{second.name}</h3>
                <span className="text-2xl font-black text-slate-600 font-mono">{second.score} نقطة</span>
              </div>

              {/* Podium Block */}
              <div className="w-full bg-gradient-to-b from-[#F3EFE6] via-[#E6DFD1] to-[#D6CBB8] rounded-t-3xl p-6 text-center border-t-4 border-white shadow-xl min-h-[190px] flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/85 rounded-xl text-xs font-black text-[#0B192C] shadow-sm border border-[#E6DFD1]">
                    <Medal className="w-4 h-4 text-[#9B7729]" />
                    <span>{isDraw ? 'شريك الصدارة (تعادل)' : 'المركز الثاني (فضية)'}</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { playSound?.('click'); setSelectedTeamForCert({ team: second, rank: isDraw ? 1 : 2 }); }}
                  className="w-full py-2.5 bg-white hover:bg-[#0B192C] hover:text-white text-[#0B192C] rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer mt-4"
                >
                  <FileText className="w-4 h-4 text-[#9B7729]" />
                  <span>شهادة التكريم</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* First Place Champion Podium Step (Center - Tallest) */}
          {first && (
            <motion.div
              initial={{ y: 80, opacity: 0, scale: 0.9 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              transition={{ delay: 0.4, type: 'spring', damping: 14 }}
              className="flex flex-col items-center order-1 md:order-2 z-20"
            >
              {/* Champion Crown & Aura */}
              <div className="relative mb-3 flex flex-col items-center">
                <motion.div
                  animate={{ y: [-6, 6, -6] }}
                  transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
                  className="mb-1"
                >
                  <Crown className="w-10 h-10 text-[#C9A24D] fill-[#D9B768] drop-shadow-md" />
                </motion.div>

                <div 
                  className="w-20 h-20 md:w-24 md:h-24 rounded-3xl border-4 border-[#C9A24D] shadow-2xl flex items-center justify-center text-white font-black text-3xl relative overflow-hidden ring-8 ring-[#C9A24D]/20"
                  style={{ backgroundColor: first.color || '#0B192C' }}
                >
                  {first.name.charAt(0)}
                  <span className="absolute -bottom-1 -right-1 w-8 h-8 bg-[#C9A24D] text-[#0B192C] rounded-full border-2 border-white flex items-center justify-center font-black text-sm shadow-md">
                    1
                  </span>
                </div>

                <h3 className="font-black text-[#0B192C] text-xl md:text-2xl mt-2 truncate max-w-[220px]">
                  {first.name}
                </h3>
                <div className="flex items-center gap-1 mt-0.5">
                  <Star className="w-5 h-5 text-[#C9A24D] fill-[#D9B768]" />
                  <span className="text-3xl font-black text-[#9B7729] font-mono tabular-nums">{first.score}</span>
                  <span className="text-sm font-bold text-slate-500">نقطة</span>
                </div>
              </div>

              {/* Podium Block (Tallest) */}
              <div className="w-full bg-gradient-to-b from-[#D9B768] via-[#C9A24D] to-[#9B7729] rounded-t-3xl p-6 text-center border-t-4 border-[#F7F1DF] shadow-2xl shadow-[#C9A24D]/25 min-h-[250px] flex flex-col justify-between">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-4 py-1.5 bg-[#0B192C] text-[#D9B768] rounded-xl text-xs font-black shadow-md border border-[#C9A24D]/40">
                    <Trophy className="w-4 h-4 text-[#C9A24D]" />
                    <span>{isDraw ? 'المركز الأول مكرر (تعادل)' : 'بطل المسابقة (ذهبية)'}</span>
                  </div>
                  <p className="text-xs font-black text-[#0B192C] mt-2">
                    {isDraw ? 'أداء متكافئ ومميز بين الفريقين!' : 'مبارك التتويج المستحق!'}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => { playSound?.('victory'); setSelectedTeamForCert({ team: first, rank: 1 }); }}
                  className="w-full py-3 bg-[#0B192C] hover:bg-[#13253E] text-[#D9B768] rounded-xl text-xs font-black flex items-center justify-center gap-2 shadow-xl transition-all cursor-pointer mt-4 border border-[#C9A24D]/45"
                >
                  <Award className="w-4 h-4 text-[#C9A24D]" />
                  <span>{isDraw ? 'شهادة المركز الأول' : 'شهادة بطل المسابقة'}</span>
                </button>
              </div>
            </motion.div>
          )}

          {/* Third Place Podium Step (Right) */}
          {third && (
            <motion.div
              initial={{ y: 50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.3, type: 'spring', damping: 16 }}
              className="flex flex-col items-center order-3"
            >
              {/* Team Avatar & Info */}
              <div className="relative mb-3 flex flex-col items-center">
                <div 
                  className="w-16 h-16 md:w-20 md:h-20 rounded-3xl border-4 border-amber-700/40 shadow-xl flex items-center justify-center text-white font-black text-2xl relative overflow-hidden"
                  style={{ backgroundColor: third.color }}
                >
                  {third.name.charAt(0)}
                  <span className="absolute -bottom-1 -right-1 w-7 h-7 bg-amber-700 text-white rounded-full border-2 border-white flex items-center justify-center font-black text-xs shadow-md">
                    3
                  </span>
                </div>
                <h3 className="font-black text-slate-900 text-lg md:text-xl mt-2 truncate max-w-[200px]">{third.name}</h3>
                <span className="text-2xl font-black text-slate-600 font-mono">{third.score} نقطة</span>
              </div>

              {/* Podium Block */}
              <div className="w-full bg-gradient-to-b from-amber-700 via-amber-800 to-amber-900 rounded-t-3xl p-6 text-center border-t-4 border-amber-500/40 shadow-xl min-h-[160px] flex flex-col justify-between text-white">
                <div>
                  <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white/20 rounded-full text-xs font-black text-amber-100 shadow-sm">
                    <Medal className="w-4 h-4 text-amber-300" />
                    <span>المركز الثالث (برونزية)</span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => { playSound?.('click'); setSelectedTeamForCert({ team: third, rank: 3 }); }}
                  className="w-full py-2.5 bg-white/20 hover:bg-white text-white hover:text-slate-950 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 shadow-md transition-all cursor-pointer mt-4"
                >
                  <FileText className="w-4 h-4 text-amber-300" />
                  <span>شهادة التكريم</span>
                </button>
              </div>
            </motion.div>
          )}
        </div>
      </div>

      {/* Remaining Teams (4th, 5th, etc.) */}
      {others.length > 0 && (
        <div className="max-w-2xl mx-auto space-y-3 pt-6 text-right">
          <h4 className="text-sm font-black text-slate-400 uppercase tracking-widest text-center mb-4">
            بقية الفرق المشاركة
          </h4>
          {others.map((t, idx) => (
            <div 
              key={t.id}
              className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm flex items-center justify-between gap-4"
            >
              <div className="flex items-center gap-3">
                <span className="font-mono font-black text-slate-400 text-sm">#{idx + 4}</span>
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center text-white font-black text-sm"
                  style={{ backgroundColor: t.color }}
                >
                  {t.name.charAt(0)}
                </div>
                <div>
                  <p className="font-black text-slate-800 text-sm">{t.name}</p>
                  <p className="text-xs font-mono font-bold text-slate-500">{t.score} نقطة</p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => { playSound?.('click'); setSelectedTeamForCert({ team: t, rank: idx + 4 }); }}
                className="px-4 py-2 bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#E6DFD1] text-[#0B192C] rounded-xl text-xs font-black flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <Award className="w-3.5 h-3.5 text-[#9B7729]" />
                <span>شهادة تقدير</span>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Question Auto-Generation Status Banner */}
      {(isRegenerating || regSuccess || regError) && (
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-2xl mx-auto p-6 rounded-3xl border bg-white flex flex-col gap-3 text-right shadow-xl" 
          style={{ borderColor: regError ? '#fee2e2' : regSuccess ? '#bbf7d0' : '#e2e8f0' }}
        >
          <div className="flex items-center gap-4 justify-between flex-row-reverse">
            <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${regError ? 'bg-red-50 text-red-500' : regSuccess ? 'bg-green-50 text-green-600' : 'bg-slate-50 text-indigo-600'}`}>
              {regError ? <XCircle className="w-6 h-6" /> : regSuccess ? <CheckCircle2 className="w-6 h-6 animate-bounce" /> : <RefreshCcw className="w-6 h-6 animate-spin" />}
            </div>
            <div className="flex-1 text-right">
              <h4 className="text-base font-black text-slate-800">التحديث التلقائي لأسئلة الجولة الجديدة</h4>
              <p className={`text-xs mt-0.5 font-bold ${regError ? 'text-red-500' : regSuccess ? 'text-green-600' : 'text-indigo-600'}`}>
                {regProgress || regError}
              </p>
            </div>
          </div>
        </motion.div>
      )}

      {/* Action Footer Button */}
      <div className="flex flex-wrap justify-center gap-4 pt-6">
        <button 
          disabled={isRegenerating}
          onClick={() => { playSound?.('click'); onNewGame(); }}
          className={`px-10 py-5 bg-[#0B192C] hover:bg-[#13253E] text-white rounded-2xl flex items-center justify-center gap-3 transition-all font-display font-black text-lg shadow-xl cursor-pointer ${isRegenerating ? 'opacity-40 cursor-not-allowed' : ''}`}
        >
          {isRegenerating ? <RefreshCcw className="w-5 h-5 animate-spin text-slate-400" /> : <RotateCcw className="w-5 h-5 text-[#C9A24D]" />}
          <span>بدء مسابقة جديدة</span>
        </button>
      </div>

      {/* Award Certificate Modal */}
      {selectedTeamForCert && (
        <AwardCertificateModal
          isOpen={true}
          onClose={() => setSelectedTeamForCert(null)}
          team={selectedTeamForCert.team}
          rank={selectedTeamForCert.rank}
          competitionName={competitionName}
          competitionSlogan={competitionSlogan}
          totalTeamsCount={teams.length}
          playSound={playSound}
        />
      )}
    </div>
  );
};

export default ChampionshipPodium;

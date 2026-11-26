import React, { useState } from 'react';
import { ArrowRight, ArrowLeft, Users, UserPlus, X, Check, Clock, Layers, Trophy } from 'lucide-react';
import { CompetitionConfig, ScoringSettings, Team } from '../../types';

const TEAM_COLORS = [
  { id: 'navy', hex: '#0B192C', label: 'كحلي ملكي' },
  { id: 'gold', hex: '#9B7729', label: 'ذهبي عتيق' },
  { id: 'emerald', hex: '#0F766E', label: 'أخضر زمردي' },
  { id: 'crimson', hex: '#991B1B', label: 'عنابي رصين' },
  { id: 'slate', hex: '#334155', label: 'أردوازي' },
];

interface SetupViewProps {
  teams: Team[];
  competitionConfig: CompetitionConfig;
  scoringSettings: ScoringSettings;
  onUpdateTeams: (teams: Team[]) => void;
  onBack: () => void;
  onProceedToSelection: () => void;
  playSound?: (type: 'click' | 'correct' | 'wrong') => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  teams,
  competitionConfig,
  scoringSettings,
  onUpdateTeams,
  onBack,
  onProceedToSelection,
  playSound,
}) => {
  const [participantInputs, setParticipantInputs] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);

  const handleTeamNameChange = (idx: number, name: string) => {
    const next = [...teams];
    next[idx] = { ...next[idx], name };
    onUpdateTeams(next);
    setValidationError(null);
  };

  const handleTeamColorChange = (idx: number, color: string) => {
    playSound?.('click');
    const next = [...teams];
    next[idx] = { ...next[idx], color };
    onUpdateTeams(next);
  };

  const handleAddParticipant = (idx: number) => {
    const team = teams[idx];
    const raw = (participantInputs[team.id] || '').trim();
    if (!raw) return;
    playSound?.('click');
    const currentList = team.participants || [];
    if (currentList.includes(raw)) return;
    const next = [...teams];
    next[idx] = { ...team, participants: [...currentList, raw] };
    onUpdateTeams(next);
    setParticipantInputs((prev) => ({ ...prev, [team.id]: '' }));
  };

  const handleRemoveParticipant = (teamIdx: number, pIdx: number) => {
    playSound?.('click');
    const team = teams[teamIdx];
    const nextList = (team.participants || []).filter((_, i) => i !== pIdx);
    const next = [...teams];
    next[teamIdx] = { ...team, participants: nextList };
    onUpdateTeams(next);
  };

  const handleContinue = () => {
    const hasEmptyName = teams.some((t) => !t.name.trim());
    if (hasEmptyName) {
      playSound?.('wrong');
      setValidationError('يرجى كتابة اسم واضح لكل فريق قبل المتابعة لاختيار الأقسام.');
      return;
    }
    playSound?.('correct');
    onProceedToSelection();
  };

  return (
    <div className="max-w-5xl mx-auto space-y-8 pb-16">
      {/* Header Strip */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="text-right">
          <p className="text-xs font-bold text-[#9B7729]">الخطوة ١ من ٣ • إعداد الفرق</p>
          <h1 className="font-display font-extrabold text-3xl text-[#0B192C] mt-1">تسمية الفرق وإضافة المشاركين</h1>
          <p className="text-sm text-slate-600 mt-1">
            أدخل أسماء الفريقين وأعضاء كل فريق لتظهر في لوحة الصدارة وشهادات التكريم
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            playSound?.('click');
            onBack();
          }}
          className="px-4 py-2.5 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] font-bold text-xs rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <ArrowRight className="w-4 h-4" />
          <span>العودة للرئيسية</span>
        </button>
      </div>

      {/* Rules Summary Bar */}
      <div className="surface-card rounded-2xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4 text-right">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EFE6] text-[#0B192C] flex items-center justify-center shrink-0">
            <Layers className="w-5 h-5 text-[#9B7729]" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-semibold">الأقسام المطلوبة</div>
            <div className="text-sm font-bold text-[#0B192C]">
              {competitionConfig.categoriesPerTeam} أقسام لكل فريق
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EFE6] text-[#0B192C] flex items-center justify-center shrink-0">
            <Clock className="w-5 h-5 text-[#9B7729]" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-semibold">توقيت السؤال</div>
            <div className="text-sm font-bold text-[#0B192C] tabular-nums">
              60 ث للأول • 30 ث للثاني
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#F3EFE6] text-[#0B192C] flex items-center justify-center shrink-0">
            <Trophy className="w-5 h-5 text-[#9B7729]" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-semibold">نظام النقاط</div>
            <div className="text-sm font-bold text-[#0B192C]">
              {scoringSettings.deductOnWrong
                ? `صحيح +${scoringSettings.correctBonus} مكافأة • خصم ${scoringSettings.wrongDeductionAmount} عند الخطأ`
                : `احتساب نقاط السؤال${scoringSettings.correctBonus > 0 ? ` + مكافأة ${scoringSettings.correctBonus}` : ''} دون خصم`}
            </div>
          </div>
        </div>
      </div>

      {/* Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {teams.map((team, idx) => {
          const teamColor = team.color || (idx === 0 ? '#0B192C' : '#9B7729');
          const inputVal = participantInputs[team.id] || '';
          const participants = team.participants || [];

          return (
            <div
              key={team.id}
              className="surface-card rounded-2xl overflow-hidden flex flex-col"
            >
              <div className="h-2 w-full" style={{ backgroundColor: teamColor }} />
              <div className="p-6 space-y-5 flex-1 text-right">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div
                      className="w-11 h-11 rounded-xl text-white font-display font-extrabold text-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: teamColor }}
                    >
                      {idx + 1}
                    </div>
                    <div>
                      <span className="text-xs font-bold text-slate-500">الفريق {idx === 0 ? 'الأول' : idx === 1 ? 'الثاني' : idx + 1}</span>
                      <h2 className="font-display font-bold text-lg text-[#0B192C]">{team.name || `الفريق ${idx + 1}`}</h2>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-bold text-slate-500 tabular-nums">
                    {participants.length} مشارك
                  </span>
                </div>

                {/* Team Name Input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold text-[#0B192C] block">اسم الفريق</label>
                  <input
                    type="text"
                    value={team.name}
                    onChange={(e) => handleTeamNameChange(idx, e.target.value)}
                    placeholder={`أدخل اسم الفريق ${idx + 1}`}
                    maxLength={40}
                    className="w-full px-4 py-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] focus:border-[#C9A24D] focus:outline-none text-sm font-bold text-[#0B192C]"
                  />
                </div>

                {/* Color Selection */}
                <div className="space-y-2">
                  <label className="text-xs font-bold text-[#0B192C] block">لون تمييز الفريق</label>
                  <div className="flex flex-wrap gap-2">
                    {TEAM_COLORS.map((c) => {
                      const active = teamColor.toLowerCase() === c.hex.toLowerCase();
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onClick={() => handleTeamColorChange(idx, c.hex)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-colors cursor-pointer ${
                            active
                              ? 'border-[#0B192C] bg-[#F3EFE6] text-[#0B192C]'
                              : 'border-[#E6DFD1] bg-white text-slate-600 hover:bg-[#FAF7F2]'
                          }`}
                        >
                          <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: c.hex }} />
                          <span>{c.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Participants List */}
                <div className="space-y-2.5 pt-2 border-t border-[#E6DFD1]">
                  <label className="text-xs font-bold text-[#0B192C] flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-[#9B7729]" />
                    <span>أسماء المشاركين في الفريق (اختياري)</span>
                  </label>

                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={inputVal}
                      onChange={(e) => setParticipantInputs((p) => ({ ...p, [team.id]: e.target.value }))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddParticipant(idx);
                        }
                      }}
                      placeholder="اكتب اسم المشارك واضغط إضافة..."
                      maxLength={35}
                      className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] focus:border-[#C9A24D] focus:outline-none text-xs font-semibold text-[#0B192C]"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddParticipant(idx)}
                      className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shrink-0"
                    >
                      <UserPlus className="w-4 h-4 text-[#C9A24D]" />
                      <span>إضافة</span>
                    </button>
                  </div>

                  {participants.length > 0 ? (
                    <div className="flex flex-wrap gap-2 pt-1">
                      {participants.map((member, mIdx) => (
                        <span
                          key={mIdx}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-bold text-[#0B192C]"
                        >
                          <span>{member}</span>
                          <button
                            type="button"
                            onClick={() => handleRemoveParticipant(idx, mIdx)}
                            className="text-slate-400 hover:text-rose-600 cursor-pointer"
                            title="حذف المشارك"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-[11px] text-slate-400">يمكنك ترك القائمة فارغة أو إضافة أسماء أعضاء الفريق.</p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {validationError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-bold text-right">
          {validationError}
        </div>
      )}

      {/* Primary Action Footer */}
      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleContinue}
          className="px-8 py-4 bg-[#0B192C] hover:bg-[#13253E] text-white font-display font-extrabold text-base rounded-2xl shadow-lg flex items-center gap-3 cursor-pointer"
        >
          <Check className="w-5 h-5 text-[#C9A24D]" />
          <span>حفظ الفرق والانتقال لاختيار الأقسام</span>
          <ArrowLeft className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
};

export default SetupView;

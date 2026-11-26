import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { RotateCcw, Home, CheckCircle2, XCircle, SkipForward, Users } from 'lucide-react';
import { CompetitionConfig, Team } from '../../types';
import ChampionshipPodium from '../ChampionshipPodium';

interface ResultsViewProps {
  teams: Team[];
  gameDuration: number;
  competitionName: string;
  competitionSlogan: string;
  competitionConfig: CompetitionConfig;
  onReplaySameTeams: () => void;
  onNewGame: () => void;
  onGoHome: () => void;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  teams,
  gameDuration,
  competitionName,
  competitionSlogan,
  competitionConfig,
  onReplaySameTeams,
  onNewGame,
  onGoHome,
  playSound,
}) => {
  useEffect(() => {
    playSound?.('victory');
    if (competitionConfig.enableVisualEffects) {
      try {
        confetti({
          particleCount: 90,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#C9A24D', '#0B192C', '#0F766E', '#FAF7F2'],
        });
      } catch {}
    }
  }, [competitionConfig.enableVisualEffects]);

  const getAccuracy = (t: Team) => {
    const attempts = (t.correctCount || 0) + (t.wrongCount || 0);
    return attempts > 0 ? (t.correctCount || 0) / attempts : 0;
  };

  const sortedTeams = [...teams].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    if (competitionConfig.winnerCalculationMode === 'accuracy_tiebreaker') {
      return getAccuracy(b) - getAccuracy(a);
    }
    return 0;
  });

  const isDraw =
    sortedTeams.length > 1 &&
    sortedTeams[0].score === sortedTeams[1].score &&
    (competitionConfig.winnerCalculationMode !== 'accuracy_tiebreaker' ||
      Math.abs(getAccuracy(sortedTeams[0]) - getAccuracy(sortedTeams[1])) < 1e-6);

  return (
    <div className="max-w-6xl mx-auto space-y-10 pb-16">
      <ChampionshipPodium
        teams={sortedTeams}
        isDraw={isDraw}
        gameDuration={gameDuration}
        competitionName={competitionName}
        competitionSlogan={competitionSlogan}
        onNewGame={onNewGame}
        playSound={playSound}
      />

      {/* Team Detailed Performance Statistics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {sortedTeams.map((team, idx) => {
          const correct = team.correctCount || 0;
          const wrong = team.wrongCount || 0;
          const skipped = team.skippedCount || 0;
          const totalAttempts = correct + wrong;
          const accuracy = totalAttempts > 0 ? Math.round((correct / totalAttempts) * 100) : 0;

          return (
            <div key={team.id} className="surface-card rounded-2xl p-6 space-y-4 text-right">
              <div className="flex items-center justify-between gap-3 border-b border-[#E6DFD1] pb-3">
                <div className="flex items-center gap-3">
                  <div
                    className="w-10 h-10 rounded-xl text-white font-display font-extrabold flex items-center justify-center shrink-0"
                    style={{ backgroundColor: team.color || '#0B192C' }}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <h3 className="font-display font-extrabold text-lg text-[#0B192C]">{team.name}</h3>
                    {team.participants && team.participants.length > 0 && (
                      <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                        <Users className="w-3.5 h-3.5 text-[#9B7729]" />
                        <span>{team.participants.join('، ')}</span>
                      </p>
                    )}
                  </div>
                </div>
                <div className="text-left">
                  <div className="text-2xl font-extrabold font-mono text-[#0B192C] tabular-nums">
                    {team.score}
                  </div>
                  <div className="text-[11px] text-slate-500 font-semibold">نقطة نهائية</div>
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2.5 text-center">
                <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200">
                  <CheckCircle2 className="w-4 h-4 text-emerald-700 mx-auto mb-1" />
                  <div className="text-lg font-extrabold text-emerald-900 tabular-nums">{correct}</div>
                  <div className="text-[10px] font-bold text-emerald-700">صحيحة</div>
                </div>
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200">
                  <XCircle className="w-4 h-4 text-rose-700 mx-auto mb-1" />
                  <div className="text-lg font-extrabold text-rose-900 tabular-nums">{wrong}</div>
                  <div className="text-[10px] font-bold text-rose-700">خاطئة</div>
                </div>
                <div className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1]">
                  <SkipForward className="w-4 h-4 text-slate-500 mx-auto mb-1" />
                  <div className="text-lg font-extrabold text-[#0B192C] tabular-nums">{skipped}</div>
                  <div className="text-[10px] font-bold text-slate-500">تخطي</div>
                </div>
                <div className="p-3 rounded-xl bg-[#F7F1DF] border border-[#C9A24D]/40">
                  <div className="text-xs font-bold text-[#9B7729] mb-1">الدقة</div>
                  <div className="text-lg font-extrabold text-[#0B192C] tabular-nums">%{accuracy}</div>
                  <div className="text-[10px] font-bold text-slate-600">نسبة الصواب</div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center justify-center gap-3">
        {competitionConfig.allowReplay !== false && (
          <button
            type="button"
            onClick={() => {
              playSound?.('click');
              onReplaySameTeams();
            }}
            className="px-6 py-3.5 bg-[#C9A24D] hover:bg-[#D9B768] text-[#0B192C] font-display font-extrabold text-sm rounded-xl flex items-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
            <span>إعادة اللعب بنفس الفريقين</span>
          </button>
        )}

        <button
          type="button"
          onClick={() => {
            playSound?.('click');
            onGoHome();
          }}
          className="px-6 py-3.5 bg-white border border-[#E6DFD1] hover:bg-[#F3EFE6] text-[#0B192C] font-bold text-sm rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <Home className="w-4 h-4 text-[#9B7729]" />
          <span>العودة للواجهة الرئيسية</span>
        </button>
      </div>
    </div>
  );
};

export default ResultsView;

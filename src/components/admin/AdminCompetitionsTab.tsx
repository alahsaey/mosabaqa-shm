import React, { useState, useMemo } from 'react';
import { Trophy, Search, Trash2, Download, CheckCircle2, Clock, Users } from 'lucide-react';
import { dataService, DBGameSession } from '../../lib/dataService';

interface AdminCompetitionsTabProps {
  sessions: DBGameSession[];
  actorEmail: string;
}

export const AdminCompetitionsTab: React.FC<AdminCompetitionsTabProps> = ({ sessions, actorEmail }) => {
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<'all' | 'completed' | 'active'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return sessions.filter((s) => {
      if (filterStatus === 'completed' && !s.isCompleted) return false;
      if (filterStatus === 'active' && s.isCompleted) return false;
      if (!term) return true;
      const teamMatch = (s.teams || []).some((t) => t.name.toLowerCase().includes(term));
      const catMatch = (s.categories || []).some((c) => c.toLowerCase().includes(term));
      return teamMatch || catMatch;
    });
  }, [sessions, search, filterStatus]);

  const handleDelete = async (session: DBGameSession) => {
    if (!session.id) return;
    setDeletingId(session.id);
    try {
      await dataService.deleteSession(session.id);
      await dataService.logActivity({
        action: 'حذف سجل مسابقة',
        targetType: 'competition',
        targetName: (session.teams || []).map((t) => t.name).join(' × '),
        actorEmail,
      });
    } finally {
      setDeletingId(null);
    }
  };

  const handleExportCSV = () => {
    let csv = '\ufeffالتاريخ,الحالة,الفرق والنتائج,المشاركون,الأقسام\n';
    filtered.forEach((s) => {
      const date = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-SA') : 'غير محدد';
      const teamsStr = (s.teams || []).map((t) => `${t.name}: ${t.score}`).join(' | ');
      const playersStr = (s.teams || [])
        .map((t) => (t.participants || []).join('، '))
        .filter(Boolean)
        .join(' | ');
      const cats = (s.categories || []).join(' - ');
      csv += `"${date}","${s.isCompleted ? 'مكتملة' : 'جارية'}","${teamsStr}","${playersStr}","${cats}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `سجل_المسابقات_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6 text-right">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display font-extrabold text-2xl text-[#0B192C]">إدارة المسابقات والجولات</h2>
          <p className="text-xs text-slate-600 mt-0.5">متابعة الجولات المسجلة ونتائج الفرق وتصدير التقارير</p>
        </div>
        <button
          type="button"
          onClick={handleExportCSV}
          className="px-4 py-2.5 bg-[#0B192C] hover:bg-[#13253E] text-white text-xs font-bold rounded-xl flex items-center gap-2 cursor-pointer"
        >
          <Download className="w-4 h-4 text-[#C9A24D]" />
          <span>تصدير السجل (CSV)</span>
        </button>
      </div>

      <div className="surface-card rounded-2xl p-4 flex flex-col sm:flex-row gap-3 justify-between">
        <div className="flex gap-2">
          {(['all', 'completed', 'active'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setFilterStatus(k)}
              className={`px-3.5 py-2 rounded-xl text-xs font-bold cursor-pointer ${
                filterStatus === k ? 'bg-[#0B192C] text-white' : 'bg-[#FAF7F2] text-slate-700 border border-[#E6DFD1]'
              }`}
            >
              {k === 'all' ? 'الكل' : k === 'completed' ? 'مكتملة' : 'قيد اللعب'}
            </button>
          ))}
        </div>

        <div className="relative sm:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="بحث باسم الفريق أو القسم..."
            className="w-full pr-9 pl-3 py-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs font-semibold text-[#0B192C] focus:outline-none focus:border-[#C9A24D]"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="surface-card rounded-2xl p-10 text-center text-slate-400">
          <Trophy className="w-10 h-10 mx-auto mb-2 opacity-40" />
          <p className="font-bold text-sm">لا توجد مسابقات مطابقة للبحث.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => {
            const dateLabel = s.createdAt?.toDate ? s.createdAt.toDate().toLocaleString('ar-SA') : 'جلسة حديثة';
            return (
              <div key={s.id} className="surface-card rounded-2xl p-5 flex flex-col md:flex-row justify-between gap-4">
                <div className="space-y-3 flex-1">
                  <div className="flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-bold text-slate-500">{dateLabel}</span>
                    <span
                      className={`inline-flex items-center gap-1 font-bold ${
                        s.isCompleted ? 'text-emerald-700' : 'text-[#9B7729]'
                      }`}
                    >
                      {s.isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {s.isCompleted ? 'مكتملة' : 'قيد التنفيذ'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(s.teams || []).map((t, idx) => (
                      <div key={idx} className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] flex items-center justify-between">
                        <div>
                          <div className="font-bold text-sm text-[#0B192C]">{t.name}</div>
                          {t.participants && t.participants.length > 0 && (
                            <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                              <Users className="w-3 h-3" />
                              <span>{t.participants.join('، ')}</span>
                            </div>
                          )}
                        </div>
                        <div className="font-mono font-extrabold text-xl text-[#0B192C] tabular-nums">{t.score}</div>
                      </div>
                    ))}
                  </div>

                  {s.categories && s.categories.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 text-[11px] text-slate-600">
                      {s.categories.map((c, idx) => (
                        <span key={idx} className="px-2.5 py-1 rounded-lg bg-white border border-[#E6DFD1]">
                          {c}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                <div className="flex items-center justify-end">
                  <button
                    type="button"
                    disabled={deletingId === s.id}
                    onClick={() => handleDelete(s)}
                    className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-1.5 border border-rose-200 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>حذف السجل</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

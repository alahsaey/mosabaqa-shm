import React, { useMemo } from 'react';
import {
  Layers,
  HelpCircle,
  BookOpen,
  Clock,
  Trophy,
  Sparkles,
  CheckCircle2,
  ShieldCheck,
  Activity,
  Plus,
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from 'recharts';
import { ActivityLogEntry, ApprovedSource, Category } from '../../types';
import { DBGameSession } from '../../lib/dataService';

export type AdminTabKey =
  | 'overview'
  | 'competitions'
  | 'categories'
  | 'questions'
  | 'video_clips'
  | 'ai_generator'
  | 'review_queue'
  | 'sources'
  | 'scoring'
  | 'competition_config'
  | 'reports'
  | 'activity_logs'
  | 'security'
  | 'general_settings';

interface AdminOverviewTabProps {
  categories: Category[];
  sources: ApprovedSource[];
  sessions: DBGameSession[];
  activityLogs: ActivityLogEntry[];
  onNavigateTab: (tab: AdminTabKey) => void;
}

export const AdminOverviewTab: React.FC<AdminOverviewTabProps> = ({
  categories,
  sources,
  sessions,
  activityLogs,
  onNavigateTab,
}) => {
  const stats = useMemo(() => {
    const allQuestions = categories.flatMap((c) => c.questions || []);
    const approved = allQuestions.filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length;
    const pending = allQuestions.filter((q) => q.reviewStatus === 'pending').length;
    const needsManual = allQuestions.filter((q) => q.needsManualVerification).length;
    const activeSources = sources.filter((s) => s.isApproved).length;
    const completedSessions = sessions.filter((s) => s.isCompleted).length;

    const chartData = categories.slice(0, 8).map((c) => ({
      name: c.name.length > 14 ? `${c.name.slice(0, 14)}…` : c.name,
      approved: (c.questions || []).filter((q) => !q.reviewStatus || q.reviewStatus === 'approved').length,
      pending: (c.questions || []).filter((q) => q.reviewStatus === 'pending').length,
    }));

    return {
      totalCategories: categories.length,
      totalQuestions: allQuestions.length,
      approved,
      pending,
      needsManual,
      activeSources,
      totalSessions: sessions.length,
      completedSessions,
      chartData,
    };
  }, [categories, sources, sessions]);

  return (
    <div className="space-y-6 text-right">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('categories')}
          className="surface-card rounded-2xl p-5 text-right hover:border-[#C9A24D] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">الأقسام الثقافية</span>
            <Layers className="w-5 h-5 text-[#9B7729]" />
          </div>
          <div className="text-3xl font-extrabold text-[#0B192C] font-mono tabular-nums mt-2">
            {stats.totalCategories}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            {categories.filter((c) => c.isActive !== false).length} قسم نشط في المسابقة
          </p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('questions')}
          className="surface-card rounded-2xl p-5 text-right hover:border-[#C9A24D] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">بنك الأسئلة المعتمد</span>
            <HelpCircle className="w-5 h-5 text-[#0F766E]" />
          </div>
          <div className="text-3xl font-extrabold text-[#0B192C] font-mono tabular-nums mt-2">
            {stats.approved}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">من أصل {stats.totalQuestions} سؤال مسجل</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('review_queue')}
          className="surface-card rounded-2xl p-5 text-right hover:border-[#C9A24D] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">بانتظار المراجعة</span>
            <Clock className="w-5 h-5 text-amber-600" />
          </div>
          <div className="text-3xl font-extrabold text-[#9B7729] font-mono tabular-nums mt-2">
            {stats.pending}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{stats.needsManual} يتطلب تحققاً يدوياً</p>
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('sources')}
          className="surface-card rounded-2xl p-5 text-right hover:border-[#C9A24D] transition-colors cursor-pointer"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500">المصادر الشيعية المعتمدة</span>
            <BookOpen className="w-5 h-5 text-[#0B192C]" />
          </div>
          <div className="text-3xl font-extrabold text-[#0B192C] font-mono tabular-nums mt-2">
            {stats.activeSources}
          </div>
          <p className="text-[11px] text-slate-500 mt-1">{stats.completedSessions} مسابقة مكتملة</p>
        </button>
      </div>

      {/* Quick Shortcuts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <button
          type="button"
          onClick={() => onNavigateTab('ai_generator')}
          className="p-5 rounded-2xl bg-[#0B192C] text-white border border-[#C9A24D]/40 hover:bg-[#13253E] transition-colors flex items-center justify-between cursor-pointer"
        >
          <div className="text-right">
            <div className="font-display font-bold text-base text-[#D9B768]">توليد أسئلة من المصادر المعتمدة</div>
            <div className="text-xs text-slate-300 mt-0.5">إنشاء أسئلة موثقة بالنص الأصلي والجزء والصفحة</div>
          </div>
          <Sparkles className="w-6 h-6 text-[#C9A24D] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('categories')}
          className="surface-card rounded-2xl p-5 hover:border-[#C9A24D] transition-colors flex items-center justify-between cursor-pointer"
        >
          <div className="text-right">
            <div className="font-display font-bold text-base text-[#0B192C]">إضافة قسم ثقافي جديد</div>
            <div className="text-xs text-slate-500 mt-0.5">تحديد الصعوبة والمصادر المرتبطة والوسائط</div>
          </div>
          <Plus className="w-6 h-6 text-[#9B7729] shrink-0" />
        </button>

        <button
          type="button"
          onClick={() => onNavigateTab('security')}
          className="surface-card rounded-2xl p-5 hover:border-[#C9A24D] transition-colors flex items-center justify-between cursor-pointer"
        >
          <div className="text-right">
            <div className="font-display font-bold text-base text-[#0B192C]">الأجهزة الموثوقة والصلاحيات</div>
            <div className="text-xs text-slate-500 mt-0.5">إدارة بصمة WebAuthn والمشرفين وسجل الأمان</div>
          </div>
          <ShieldCheck className="w-6 h-6 text-[#0F766E] shrink-0" />
        </button>
      </div>

      {/* Distribution Chart & Recent Activity */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 surface-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-[#0B192C]">توزيع الأسئلة حسب الأقسام</h3>
            <span className="text-xs text-slate-500">معتمدة مقابل بانتظار المراجعة</span>
          </div>
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: 0, bottom: 25 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E6DFD1" />
                <XAxis dataKey="name" tick={{ fill: '#334155', fontSize: 11, fontWeight: 700 }} interval={0} />
                <YAxis tick={{ fill: '#64748B', fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="approved" name="معتمدة" fill="#0B192C" radius={[6, 6, 0, 0]} />
                <Bar dataKey="pending" name="للمراجعة" fill="#C9A24D" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="lg:col-span-5 surface-card rounded-2xl p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-lg text-[#0B192C] flex items-center gap-2">
              <Activity className="w-5 h-5 text-[#9B7729]" />
              <span>آخر نشاطات الإدارة</span>
            </h3>
            <button
              type="button"
              onClick={() => onNavigateTab('activity_logs')}
              className="text-xs font-bold text-[#9B7729] hover:underline cursor-pointer"
            >
              عرض الكل
            </button>
          </div>

          {activityLogs.length === 0 ? (
            <p className="text-xs text-slate-400 py-8 text-center">لا توجد نشاطات إدارية مسجلة بعد.</p>
          ) : (
            <div className="space-y-2.5 max-h-64 overflow-y-auto custom-scrollbar">
              {activityLogs.slice(0, 7).map((log, i) => (
                <div key={log.id || i} className="p-3 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-xs space-y-0.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-[#0B192C]">{log.action}</span>
                    <CheckCircle2 className="w-3.5 h-3.5 text-[#0F766E] shrink-0" />
                  </div>
                  {log.targetName && <p className="text-slate-600 truncate">{log.targetName}</p>}
                  <p className="text-[10px] text-slate-400 font-mono">{log.actorEmail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

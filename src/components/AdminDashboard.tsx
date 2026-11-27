import React, { useState, useEffect, useMemo } from 'react';
import {
  LayoutDashboard,
  Trophy,
  Layers,
  HelpCircle,
  Sparkles,
  CheckSquare,
  BookOpen,
  Award,
  Sliders,
  BarChart3,
  Activity,
  ShieldCheck,
  Settings,
  ArrowRight,
  LogOut,
  Menu,
  X,
  Film,
  Fingerprint,
} from 'lucide-react';
import {
  ActivityLogEntry,
  AdminPermissionKey,
  ApprovedSource,
  AuthSessionUser,
  Category,
  CompetitionConfig,
  ScoringSettings,
  VideoSourceRecord,
} from '../types';
import { dataService, DBAppSettings, DBGameSession, DBGroup } from '../lib/dataService';
import { ROLE_LABELS } from '../services/authService';
import { BRAND_ASSETS } from '../lib/assets';
import { isValidCustomLogoUrl } from '../services/pwaBrandingService';
import { AdminOverviewTab, AdminTabKey } from './admin/AdminOverviewTab';
import { AdminCompetitionsTab } from './admin/AdminCompetitionsTab';
import { AdminCategoriesTab } from './admin/AdminCategoriesTab';
import { AdminQuestionsBankTab } from './admin/AdminQuestionsBankTab';
import { AdminVideoStudioTab } from './admin/AdminVideoStudioTab';
import { AdminAiGeneratorTab } from './admin/AdminAiGeneratorTab';
import { AdminReviewQueueTab } from './admin/AdminReviewQueueTab';
import { AdminSourcesTab } from './admin/AdminSourcesTab';
import { AdminScoringAndConfigTab } from './admin/AdminScoringAndConfigTab';
import { AdminSecurityTab } from './admin/AdminSecurityTab';
import { AdminLogsAndDataTab } from './admin/AdminLogsAndDataTab';

interface AdminDashboardProps {
  categories: Category[];
  groups: DBGroup[];
  sources: ApprovedSource[];
  settings: DBAppSettings;
  scoringSettings: ScoringSettings;
  competitionConfig: CompetitionConfig;
  currentUser: AuthSessionUser;
  onBackToApp: () => void;
  onLogout: () => void;
  playSound?: (type: 'correct' | 'wrong' | 'victory' | 'intro' | 'click') => void;
}

const NAV_ITEMS: {
  id: AdminTabKey;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  permission?: AdminPermissionKey;
}[] = [
  { id: 'overview', label: 'الرئيسية', icon: LayoutDashboard },
  { id: 'competitions', label: 'إدارة المسابقات', icon: Trophy },
  { id: 'categories', label: 'إدارة الأقسام', icon: Layers, permission: 'manage_categories' },
  { id: 'questions', label: 'بنك الأسئلة', icon: HelpCircle, permission: 'manage_questions' },
  { id: 'video_clips', label: 'مقاطع الفيديو الذكية', icon: Film, permission: 'manage_questions' },
  { id: 'ai_generator', label: 'توليد الأسئلة بالذكاء الاصطناعي', icon: Sparkles, permission: 'generate_ai' },
  { id: 'review_queue', label: 'مراجعة الأسئلة', icon: CheckSquare, permission: 'approve_questions' },
  { id: 'sources', label: 'إدارة المصادر المعتمدة', icon: BookOpen, permission: 'manage_sources' },
  { id: 'scoring', label: 'إعدادات نظام النقاط', icon: Award, permission: 'manage_scoring' },
  { id: 'competition_config', label: 'إعدادات المسابقة', icon: Sliders, permission: 'manage_settings' },
  { id: 'reports', label: 'التقارير والإحصائيات', icon: BarChart3, permission: 'view_reports' },
  { id: 'activity_logs', label: 'سجل النشاطات', icon: Activity, permission: 'view_reports' },
  { id: 'security', label: 'المستخدمون والبصمة والأمان', icon: ShieldCheck },
  { id: 'general_settings', label: 'الإعدادات العامة', icon: Settings, permission: 'manage_settings' },
];

export const AdminDashboard: React.FC<AdminDashboardProps> = ({
  categories,
  groups,
  sources,
  settings,
  scoringSettings,
  competitionConfig,
  currentUser,
  onBackToApp,
  onLogout,
  playSound,
}) => {
  const [activeTab, setActiveTab] = useState<AdminTabKey>('overview');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [sessions, setSessions] = useState<DBGameSession[]>([]);
  const [activityLogs, setActivityLogs] = useState<ActivityLogEntry[]>([]);
  const [videoSources, setVideoSources] = useState<VideoSourceRecord[]>([]);
  const [selectedVideoQuestion, setSelectedVideoQuestion] = useState<{ catId: string; questionId: string } | null>(null);

  const isSuperAdmin = currentUser.role === 'super_admin';
  const actorIdentity = `@${currentUser.username}`;

  useEffect(() => {
    const u1 = dataService.subscribeGameSessions(true, undefined, setSessions);
    const u2 = dataService.subscribeActivityLogs(setActivityLogs);
    const u3 = dataService.subscribeVideoSources(setVideoSources);
    return () => {
      u1();
      u2();
      u3();
    };
  }, []);

  const openVideoStudioForQuestion = (catId: string, questionId: string) => {
    setSelectedVideoQuestion({ catId, questionId });
    setActiveTab('video_clips');
  };

  const visibleNav = useMemo(() => {
    if (isSuperAdmin) return NAV_ITEMS;
    return NAV_ITEMS.filter((item) => {
      if (!item.permission) return true;
      return Boolean(currentUser.permissions?.[item.permission]);
    });
  }, [isSuperAdmin, currentUser.permissions]);

  const pendingReviewCount = useMemo(
    () =>
      categories.reduce(
        (sum, c) => sum + (c.questions || []).filter((q) => q.reviewStatus === 'pending').length,
        0
      ),
    [categories]
  );

  const activeNavMeta = NAV_ITEMS.find((n) => n.id === activeTab) || NAV_ITEMS[0];

  return (
    <div className="min-h-screen bg-[#FAF7F2] text-[#0F172A] flex flex-col lg:flex-row" dir="rtl">
      {/* Mobile Sidebar Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-[#07111E]/60 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* RTL Right Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 right-0 z-50 h-screen w-[275px] bg-[#0B192C] text-[#FAF7F2] border-l border-[#C9A24D]/30 flex flex-col transition-transform duration-200 shrink-0 ${
          mobileMenuOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="p-5 border-b border-white/10 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={isValidCustomLogoUrl(settings.logoUrl) ? settings.logoUrl! : BRAND_ASSETS.emblem}
              alt="شعار الإدارة"
              className="w-10 h-10 rounded-xl object-cover border border-[#C9A24D]/60 shrink-0"
              onError={(e) => {
                e.currentTarget.src = BRAND_ASSETS.emblem;
              }}
            />
            <div className="min-w-0">
              <div className="font-display font-extrabold text-sm text-white truncate">
                {settings.competitionName || 'مسابقة ابوالفواطم'}
              </div>
              <div className="text-[11px] font-bold text-[#D9B768]">لوحة التحكم والإدارة</div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setMobileMenuOpen(false)}
            className="lg:hidden p-1.5 text-slate-300 hover:text-white cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1 overflow-y-auto custom-scrollbar">
          {visibleNav.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  playSound?.('click');
                  setActiveTab(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full px-3.5 py-2.5 rounded-xl text-xs font-bold flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                  active
                    ? 'bg-[#C9A24D] text-[#0B192C] shadow-sm'
                    : 'text-slate-300 hover:text-white hover:bg-white/10'
                }`}
              >
                <span className="flex items-center gap-2.5 min-w-0">
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </span>
                {item.id === 'review_queue' && pendingReviewCount > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono font-extrabold ${
                      active ? 'bg-[#0B192C] text-[#D9B768]' : 'bg-amber-500/20 text-[#D9B768]'
                    }`}
                  >
                    {pendingReviewCount}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 space-y-2 text-xs">
          <div className="px-3 py-2 rounded-xl bg-[#13253E] border border-white/10">
            <div className="font-bold text-white truncate">{currentUser.fullName}</div>
            <div className="flex items-center justify-between text-[11px] text-slate-300 mt-0.5">
              <span className="font-mono truncate">@{currentUser.username}</span>
              <span className="text-[#D9B768] font-bold shrink-0">{ROLE_LABELS[currentUser.role]}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={onBackToApp}
              className="py-2 px-3 rounded-xl bg-white/10 hover:bg-white/15 text-white font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5" />
              <span>المسابقة</span>
            </button>
            <button
              type="button"
              onClick={onLogout}
              className="py-2 px-3 rounded-xl bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 font-bold flex items-center justify-center gap-1 cursor-pointer"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>خروج</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Sticky Admin Header */}
        <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-sm border-b border-[#E6DFD1] px-4 sm:px-8 h-16 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl bg-[#FAF7F2] border border-[#E6DFD1] text-[#0B192C] cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div>
              <div className="text-[11px] font-bold text-[#9B7729]">
                لوحة التحكم • {ROLE_LABELS[currentUser.role]}
              </div>
              <h1 className="font-display font-extrabold text-base sm:text-lg text-[#0B192C]">
                {activeNavMeta.label}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {!currentUser.biometricEnabled && activeTab !== 'security' && (
              <button
                type="button"
                onClick={() => {
                  playSound?.('click');
                  setActiveTab('security');
                }}
                className="hidden md:inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#FAF7F2] hover:bg-[#F3EFE6] border border-[#C9A24D]/50 text-[#0B192C] text-xs font-bold cursor-pointer"
              >
                <Fingerprint className="w-4 h-4 text-[#9B7729]" />
                <span>تفعيل الدخول بالبصمة</span>
              </button>
            )}
            <button
              type="button"
              onClick={onBackToApp}
              className="hidden sm:inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#0B192C] text-white text-xs font-bold cursor-pointer"
            >
              <ArrowRight className="w-3.5 h-3.5 text-[#C9A24D]" />
              <span>العودة للمسابقة</span>
            </button>
          </div>
        </header>

        {/* Active Tab Workspace */}
        <main className="p-4 sm:p-8 flex-1 max-w-7xl w-full mx-auto">
          {activeTab === 'overview' && (
            <AdminOverviewTab
              categories={categories}
              sources={sources}
              sessions={sessions}
              activityLogs={activityLogs}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'competitions' && (
            <AdminCompetitionsTab sessions={sessions} actorEmail={actorIdentity} />
          )}

          {activeTab === 'categories' && (
            <AdminCategoriesTab
              categories={categories}
              groups={groups}
              sources={sources}
              actorEmail={actorIdentity}
            />
          )}

          {activeTab === 'questions' && (
            <AdminQuestionsBankTab
              categories={categories}
              sources={sources}
              scoringSettings={scoringSettings}
              actorEmail={actorIdentity}
              onOpenVideoStudio={openVideoStudioForQuestion}
            />
          )}

          {activeTab === 'video_clips' && (
            <AdminVideoStudioTab
              categories={categories}
              sources={sources}
              videoSources={videoSources}
              scoringSettings={scoringSettings}
              actorEmail={actorIdentity}
              initialQuestionSelection={selectedVideoQuestion}
            />
          )}

          {activeTab === 'ai_generator' && (
            <AdminAiGeneratorTab
              categories={categories}
              sources={sources}
              scoringSettings={scoringSettings}
              competitionConfig={competitionConfig}
              actorEmail={actorIdentity}
            />
          )}

          {activeTab === 'review_queue' && (
            <AdminReviewQueueTab
              categories={categories}
              actorEmail={actorIdentity}
              onOpenVideoStudio={openVideoStudioForQuestion}
            />
          )}

          {activeTab === 'sources' && (
            <AdminSourcesTab sources={sources} categories={categories} actorEmail={actorIdentity} />
          )}

          {(activeTab === 'scoring' || activeTab === 'competition_config') && (
            <AdminScoringAndConfigTab
              mode={activeTab}
              scoringSettings={scoringSettings}
              competitionConfig={competitionConfig}
              actorEmail={actorIdentity}
            />
          )}

          {(activeTab === 'reports' || activeTab === 'activity_logs' || activeTab === 'general_settings') && (
            <AdminLogsAndDataTab
              mode={activeTab}
              categories={categories}
              sessions={sessions}
              activityLogs={activityLogs}
              settings={settings}
              actorEmail={actorIdentity}
            />
          )}

          {activeTab === 'security' && (
            <AdminSecurityTab currentUser={currentUser} playSound={playSound} />
          )}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;

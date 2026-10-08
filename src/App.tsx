import React, { lazy, Suspense } from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { InviteBanner } from './components/InviteBanner';
import { SearchModal } from './components/SearchModal';
import { AIAssistantFAB } from './components/AIAssistantFAB';

// Login is small and on the critical path — keep it synchronous
import { Login } from './pages/Login';

// All authenticated pages are lazy-loaded to reduce initial bundle size
const Dashboard          = lazy(() => import('./pages/Dashboard').then(m => ({ default: m.Dashboard })));
const Projects           = lazy(() => import('./pages/Projects').then(m => ({ default: m.Projects })));
const CreateProjectWizard = lazy(() => import('./pages/CreateProjectWizard').then(m => ({ default: m.CreateProjectWizard })));
const ProjectDetails     = lazy(() => import('./pages/ProjectDetails').then(m => ({ default: m.ProjectDetails })));
const Deployments        = lazy(() => import('./pages/Deployments').then(m => ({ default: m.Deployments })));
const DeploymentDetails  = lazy(() => import('./pages/DeploymentDetails').then(m => ({ default: m.DeploymentDetails })));
const Incidents          = lazy(() => import('./pages/Incidents').then(m => ({ default: m.Incidents })));
const RollbackRecovery   = lazy(() => import('./pages/RollbackRecovery').then(m => ({ default: m.RollbackRecovery })));
const AIAssistant        = lazy(() => import('./pages/AIAssistant').then(m => ({ default: m.AIAssistant })));
const Notifications      = lazy(() => import('./pages/Notifications').then(m => ({ default: m.Notifications })));
const Settings           = lazy(() => import('./pages/Settings').then(m => ({ default: m.Settings })));
const Integrations       = lazy(() => import('./pages/Integrations').then(m => ({ default: m.Integrations })));
const PluginConfig       = lazy(() => import('./pages/PluginConfig').then(m => ({ default: m.PluginConfig })));
const Monitoring         = lazy(() => import('./pages/Monitoring').then(m => ({ default: m.Monitoring })));
const Automation         = lazy(() => import('./pages/Automation').then(m => ({ default: m.Automation })));
const ScheduledTasks     = lazy(() => import('./pages/ScheduledTasks').then(m => ({ default: m.ScheduledTasks })));
const ShareView          = lazy(() => import('./pages/ShareView').then(m => ({ default: m.ShareView })));

/** Minimal spinner shown while a lazy page chunk is loading. */
function PageLoader() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="w-5 h-5 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
    </div>
  );
}

const AppContent: React.FC = () => {
  const { user, currentPage, authReady } = usePlatform();

  // Public, auth-free share routes: /share/{type}/{id}?token=...
  if (window.location.pathname.startsWith('/share/')) {
    return (
      <Suspense fallback={<PageLoader />}>
        <ShareView />
      </Suspense>
    );
  }

  // Hydration gate: never redirect to login before the stored session
  // has been validated, or a hard reload will flash-kick real sessions.
  if (!authReady) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-dark-950">
        <div className="flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-zinc-700 border-t-zinc-300 animate-spin" />
          <p className="text-xs text-zinc-500 font-mono">Restoring session…</p>
        </div>
      </div>
    );
  }

  // Hard guard: never render protected pages without a user
  if (!user) {
    return <Login />;
  }

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':          return <Dashboard />;
      case 'projects':           return <Projects />;
      case 'create-project':     return <CreateProjectWizard />;
      case 'project-details':    return <ProjectDetails />;
      case 'deployments':        return <Deployments />;
      case 'deployment-details': return <DeploymentDetails />;
      case 'incidents':          return <Incidents />;
      case 'rollback-recovery':  return <RollbackRecovery />;
      case 'ai-assistant':       return <AIAssistant />;
      case 'notifications':      return <Notifications />;
      case 'settings':           return <Settings />;
      case 'integrations':       return <Integrations />;
      case 'plugin-config':      return <PluginConfig />;
      case 'monitoring':         return <Monitoring />;
      case 'automation':         return <Automation />;
      case 'scheduled-tasks':    return <ScheduledTasks />;
      case 'login':
      default:                   return <Dashboard />;
    }
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <InviteBanner />
        <main className="flex-1 overflow-y-auto p-6 bg-dark-950">
          <Suspense fallback={<PageLoader />}>
            {renderPage()}
          </Suspense>
        </main>
      </div>
      <SearchModal />
      <AIAssistantFAB />
    </div>
  );
};

export default function App() {
  return (
    <PlatformProvider>
      <AppContent />
    </PlatformProvider>
  );
}

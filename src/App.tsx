import React from 'react';
import { PlatformProvider, usePlatform } from './context/PlatformContext';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Projects } from './pages/Projects';
import { CreateProjectWizard } from './pages/CreateProjectWizard';
import { ProjectDetails } from './pages/ProjectDetails';
import { Deployments } from './pages/Deployments';
import { DeploymentDetails } from './pages/DeploymentDetails';
import { Incidents } from './pages/Incidents';
import { RollbackRecovery } from './pages/RollbackRecovery';
import { AIAssistant } from './pages/AIAssistant';
import { Notifications } from './pages/Notifications';
import { Settings } from './pages/Settings';
import { Integrations } from './pages/Integrations';
import { PluginConfig } from './pages/PluginConfig';
import { Monitoring } from './pages/Monitoring';

const AppContent: React.FC = () => {
  const { user, currentPage } = usePlatform();

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
      case 'login':
      default:                   return <Login />;
    }
  };

  if (!user) return <Login />;

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-dark-950">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <Header />
        <main className="flex-1 overflow-y-auto p-6 bg-dark-950">
          {renderPage()}
        </main>
      </div>
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

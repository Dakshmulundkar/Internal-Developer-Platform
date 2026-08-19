import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  ArrowLeft, ArrowRight, CheckCircle2, Cpu, 
  Github, GitBranch, Key, Check, Info, AlertCircle 
} from 'lucide-react';
import type { ProviderType, EnvironmentType } from '../types/platform';

export const CreateProjectWizard: React.FC = () => {
  const { createProject, navigateTo } = usePlatform();
  const [step, setStep] = useState(1);

  // Form State
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [repoOwner, setRepoOwner] = useState('devcorp');
  const [repoName, setRepoName] = useState('');
  const [provider, setProvider] = useState<ProviderType>('vercel');
  const [environment, setEnvironment] = useState<EnvironmentType>('production');
  const [branch, setBranch] = useState('main');
  const [apiToken, setApiToken] = useState('');

  // Validation & Loading Simulation State
  const [connectionState, setConnectionState] = useState<'idle' | 'testing' | 'success' | 'error'>('idle');
  const [validationError, setValidationError] = useState('');

  const nextStep = () => {
    // Step validation checks
    if (step === 1) {
      if (!name) {
        setValidationError('Please specify a project service name.');
        return;
      }
      setValidationError('');
    } else if (step === 2) {
      if (!repoName) {
        setValidationError('Please select or specify a GitHub repository name.');
        return;
      }
      setValidationError('');
    } else if (step === 4) {
      if (!branch) {
        setValidationError('Target production branch is required.');
        return;
      }
      setValidationError('');
    } else if (step === 5) {
      if (!apiToken) {
        setValidationError('API Token credential access token is required for authentication integration.');
        return;
      }
      setValidationError('');
      
      // Simulate credential verification checks
      setConnectionState('testing');
      setTimeout(() => {
        setConnectionState('success');
      }, 2500);
    }
    
    setStep(prev => Math.min(prev + 1, 6));
  };

  const prevStep = () => {
    setValidationError('');
    setConnectionState('idle');
    setStep(prev => Math.max(prev - 1, 1));
  };

  const handleCreate = () => {
    createProject({
      name,
      description,
      repoOwner,
      repoName,
      branch,
      provider,
      environment,
      apiTokenHint: apiToken ? `${provider === 'vercel' ? 'vcl' : 'nf'}_••••••••••••••••••••${apiToken.substr(-4)}` : undefined
    });
  };

  const stepsList = [
    { num: 1, label: 'Metadata' },
    { num: 2, label: 'Repository' },
    { num: 3, label: 'Hosting Provider' },
    { num: 4, label: 'Target Branch' },
    { num: 5, label: 'Credentials' },
    { num: 6, label: 'Review' },
  ];

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Back button */}
      <button
        onClick={() => navigateTo('projects')}
        className="flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-slate-200 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to projects catalog
      </button>

      {/* Step Indicators */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4">
        <div className="flex justify-between items-center relative px-2">
          {/* Connector Line */}
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-dark-700 -translate-y-1/2 -z-10"></div>
          
          {stepsList.map(s => {
            const isCompleted = step > s.num;
            const isActive = step === s.num;
            return (
              <div key={s.num} className="flex flex-col items-center gap-1.5 relative z-10">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold font-mono transition-all duration-300 ${
                  isCompleted ? 'bg-brand-600 border-brand-500 text-white' :
                  isActive ? 'bg-dark-900 border-brand-500 text-brand-500 shadow-md shadow-brand-500/10' :
                  'bg-dark-950 border-dark-700 text-slate-500'
                }`}>
                  {isCompleted ? <Check size={12} strokeWidth={3} /> : s.num}
                </div>
                <span className={`text-[9px] font-semibold tracking-wide uppercase transition-colors hidden md:block ${
                  isActive ? 'text-brand-400' : isCompleted ? 'text-slate-300' : 'text-slate-500'
                }`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Errors */}
      {validationError && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{validationError}</span>
        </div>
      )}

      {/* Wizard Form Panels */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-6 min-h-[300px] flex flex-col justify-between">
        
        {/* STEP 1: Metadata */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Service Information</h3>
              <p className="text-[11px] text-slate-400">Specify details to identify this project on the dashboard.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Payments Microservice"
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what responsibilities this service handles..."
                  rows={4}
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all leading-normal"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Github Repo Selection */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">GitHub Integration</h3>
              <p className="text-[11px] text-slate-400">Choose the repository target branch to listen to webhooks.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">GitHub Owner/Organization</label>
                <div className="relative">
                  <Github className="absolute left-3 top-3 text-slate-500" size={16} />
                  <input
                    type="text"
                    required
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-500 transition-all font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Repository Name</label>
                <input
                  type="text"
                  required
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="e.g. payments-api"
                  className="w-full bg-dark-950 border border-dark-750 rounded-lg p-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Provider Selection */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Deployment Provider</h3>
              <p className="text-[11px] text-slate-400">Select where the application is hosted. Aether does not host code, we integrate via APIs.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => setProvider('vercel')}
                className={`border rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between h-36 ${
                  provider === 'vercel' 
                    ? 'border-brand-500 bg-brand-600/5 glow-info' 
                    : 'border-dark-700 hover:border-dark-600 bg-dark-950/20'
                }`}
              >
                <span className="bg-black text-white text-[9px] font-black font-mono tracking-widest px-2 py-0.5 rounded self-start">
                  VERCEL
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">Vercel Cloud Integration</h4>
                  <p className="text-[10px] text-slate-500 leading-normal mt-1">Excellent choice for Next.js, React SPA, and static deployments.</p>
                </div>
              </div>

              <div 
                onClick={() => setProvider('netlify')}
                className={`border rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between h-36 ${
                  provider === 'netlify' 
                    ? 'border-brand-500 bg-brand-600/5 glow-info' 
                    : 'border-dark-700 hover:border-dark-600 bg-dark-950/20'
                }`}
              >
                <span className="bg-teal-500/10 text-teal-400 text-[9px] font-black font-mono tracking-widest px-2 py-0.5 rounded self-start border border-teal-500/20">
                  NETLIFY
                </span>
                <div>
                  <h4 className="text-xs font-bold text-white">Netlify Hosting Router</h4>
                  <p className="text-[10px] text-slate-500 leading-normal mt-1">Highly reliable integration for static JAMstack SPA frameworks.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Branch and Environment settings */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Branch and Environment settings</h3>
              <p className="text-[11px] text-slate-400">Configure environments and tracking parameters.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Target Environment Scope</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['production', 'staging', 'preview'] as EnvironmentType[]).map(env => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEnvironment(env)}
                      className={`py-2 rounded border text-xs capitalize font-mono ${
                        environment === env 
                          ? 'border-brand-500 bg-brand-500/10 text-brand-400 font-bold' 
                          : 'border-dark-700 hover:bg-dark-700 text-slate-400'
                      }`}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">Webhook Listening Branch</label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-3 text-slate-500" size={16} />
                  <input
                    type="text"
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white focus:outline-none focus:border-brand-500 transition-all font-mono"
                  />
                </div>
                <p className="text-[10px] text-slate-500 mt-1 flex items-center gap-1">
                  <Info size={10} />
                  <span>Commits pushed to this branch will automatically trigger builds.</span>
                </p>
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: Provider connection step */}
        {step === 5 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Credentials Access integration</h3>
              <p className="text-[11px] text-slate-400">Configure OAuth tokens or personal access keys to read build lists.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1">
                  {provider === 'vercel' ? 'Vercel API Token' : 'Netlify Site Auth token'}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 text-slate-500" size={16} />
                  <input
                    type="password"
                    required
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder={provider === 'vercel' ? 'vcl_xxxxxxxxxxxxxxxxxxxx' : 'nf_xxxxxxxxxxxxxxxxxxxx'}
                    className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
                  />
                </div>
              </div>

              {connectionState !== 'idle' && (
                <div className={`p-4 rounded-lg border text-xs flex flex-col gap-1.5 transition-all duration-300 ${
                  connectionState === 'testing' ? 'border-brand-500/20 bg-brand-500/5 text-brand-400' :
                  connectionState === 'success' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' :
                  'border-rose-500/20 bg-rose-500/5 text-rose-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      connectionState === 'testing' ? 'bg-brand-500 animate-ping' :
                      connectionState === 'success' ? 'bg-emerald-500' : 'bg-rose-500'
                    }`}></span>
                    <span className="font-bold">
                      {connectionState === 'testing' ? 'Verifying access credentials...' :
                       connectionState === 'success' ? 'Access token successfully authenticated!' :
                       'Verification failed.'}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500">
                    {connectionState === 'testing' ? 'Attempting handshake with hosting server API endpoints...' :
                     connectionState === 'success' ? 'Handshake complete. Registered webhooks hooks successfully.' :
                     'Unable to reach server. Please review input strings.'}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {/* STEP 6: Review & Onboarding creation */}
        {step === 6 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-bold text-white mb-1">Onboarding summary</h3>
              <p className="text-[11px] text-slate-400">Review deployment configuration parameters.</p>
            </div>
            
            <div className="bg-dark-950/40 border border-dark-750 rounded-lg divide-y divide-dark-750 text-xs">
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">Service Identifier</span>
                <span className="font-bold text-slate-200">{name}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">Code Repository</span>
                <span className="font-mono text-[10px] text-slate-300">{repoOwner}/{repoName}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">Hosting Provider</span>
                <span className="font-mono text-[10px] text-brand-400 uppercase font-bold">{provider}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">Listening Branch</span>
                <span className="font-mono text-[10px] text-slate-300">{branch}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-slate-500">Webhook Status</span>
                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  READY TO REGISTER
                </span>
              </div>
            </div>

            <div className="p-3 bg-dark-950/20 rounded border border-dark-750 text-[10px] text-slate-500 flex gap-2">
              <Info size={16} className="shrink-0 text-slate-400" />
              <span>
                Registering this service will deploy webhooks to GitHub. Pushing new commits will build directly on {provider}. Aether registers pipelines status.
              </span>
            </div>
          </div>
        )}

        {/* Footer Wizard Controls */}
        <div className="flex justify-between items-center border-t border-dark-750 pt-5 mt-6">
          {step > 1 ? (
            <button
              onClick={prevStep}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors font-semibold"
            >
              <ArrowLeft size={12} />
              Previous Stage
            </button>
          ) : <div />}

          {step < 6 ? (
            <button
              onClick={nextStep}
              disabled={connectionState === 'testing'}
              className="bg-brand-600 hover:bg-brand-500 disabled:opacity-50 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md flex items-center gap-1.5"
            >
              Continue
              <ArrowRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-4 rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5"
            >
              Verify & Instantiate Service
              <Check size={14} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

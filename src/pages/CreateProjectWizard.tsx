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
        className="flex items-center gap-2 text-xs font-medium text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        <ArrowLeft size={14} />
        Back to projects catalog
      </button>

      {/* Step Indicators */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4">
        <div className="flex justify-between items-center relative px-2">
          {/* Connector Line */}
          <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-white/[0.06] -translate-y-1/2 -z-10"></div>
          
          {stepsList.map(s => {
            const isCompleted = step > s.num;
            const isActive = step === s.num;
            return (
              <div key={s.num} className="flex flex-col items-center gap-1.5 relative z-10">
                <div className={`w-8 h-8 rounded-full border flex items-center justify-center text-xs font-bold font-mono transition-all duration-300 ${
                  isCompleted ? 'bg-white text-black border-white' :
                  isActive ? 'bg-white/[0.03] border-zinc-400 text-zinc-200' :
                  'bg-[#050505] border-white/[0.06] text-zinc-600'
                }`}>
                  {isCompleted ? <Check size={12} strokeWidth={3} /> : s.num}
                </div>
                <span className={`text-[9px] font-semibold tracking-wide uppercase transition-colors hidden md:block ${
                  isActive ? 'text-zinc-200' : isCompleted ? 'text-zinc-400' : 'text-zinc-600'
                }`}>{s.label}</span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Errors */}
      {validationError && (
        <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3 flex items-center gap-2">
          <AlertCircle size={14} />
          <span>{validationError}</span>
        </div>
      )}

      {/* Wizard Form Panels */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-6 min-h-[300px] flex flex-col justify-between">
        
        {/* STEP 1: Metadata */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Service Information</h3>
              <p className="text-[11px] text-zinc-400">Specify details to identify this project on the dashboard.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Project Name</label>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Payments Microservice"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono p-2.5"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Briefly describe what responsibilities this service handles..."
                  rows={4}
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs p-2.5 leading-normal"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 2: Github Repo Selection */}
        {step === 2 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">GitHub Integration</h3>
              <p className="text-[11px] text-zinc-400">Choose the repository target branch to listen to webhooks.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">GitHub Owner/Organization</label>
                <div className="relative">
                  <Github className="absolute left-3 top-3 text-zinc-600" size={16} />
                  <input
                    type="text"
                    required
                    value={repoOwner}
                    onChange={(e) => setRepoOwner(e.target.value)}
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Repository Name</label>
                <input
                  type="text"
                  required
                  value={repoName}
                  onChange={(e) => setRepoName(e.target.value)}
                  placeholder="e.g. payments-api"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono p-2.5"
                />
              </div>
            </div>
          </div>
        )}

        {/* STEP 3: Provider Selection */}
        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Deployment Provider</h3>
              <p className="text-[11px] text-zinc-400">Select where the application is hosted. Aether does not host code, we integrate via APIs.</p>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => setProvider('vercel')}
                className={`border rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between h-36 ${
                  provider === 'vercel' 
                    ? 'border-white/20 bg-white/[0.05]' 
                    : 'border-white/[0.06] hover:border-white/10 bg-white/[0.02]'
                }`}
              >
                <span className="bg-black/40 text-zinc-200 border border-white/10 text-[9px] font-black font-mono tracking-widest px-2 py-0.5 rounded self-start">
                  VERCEL
                </span>
                <div>
                  <h4 className="text-xs font-semibold text-white">Vercel Cloud Integration</h4>
                  <p className="text-[10px] text-zinc-500 leading-normal mt-1">Excellent choice for Next.js, React SPA, and static deployments.</p>
                </div>
              </div>

              <div 
                onClick={() => setProvider('netlify')}
                className={`border rounded-xl p-5 cursor-pointer transition-all flex flex-col justify-between h-36 ${
                  provider === 'netlify' 
                    ? 'border-white/20 bg-white/[0.05]' 
                    : 'border-white/[0.06] hover:border-white/10 bg-white/[0.02]'
                }`}
              >
                <span className="bg-teal-500/10 text-teal-400 text-[9px] font-black font-mono tracking-widest px-2 py-0.5 rounded self-start border border-teal-500/20">
                  NETLIFY
                </span>
                <div>
                  <h4 className="text-xs font-semibold text-white">Netlify Hosting Router</h4>
                  <p className="text-[10px] text-zinc-500 leading-normal mt-1">Highly reliable integration for static JAMstack SPA frameworks.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* STEP 4: Branch and Environment settings */}
        {step === 4 && (
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-semibold text-white mb-1">Branch and Environment settings</h3>
              <p className="text-[11px] text-zinc-400">Configure environments and tracking parameters.</p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Target Environment Scope</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['production', 'staging', 'preview'] as EnvironmentType[]).map(env => (
                    <button
                      key={env}
                      type="button"
                      onClick={() => setEnvironment(env)}
                      className={`py-2 rounded border text-xs capitalize font-mono transition-all ${
                        environment === env 
                          ? 'border-white/20 bg-white/5 text-zinc-100 font-semibold' 
                          : 'border-white/[0.06] hover:bg-white/[0.03] text-zinc-500'
                      }`}
                    >
                      {env}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">Webhook Listening Branch</label>
                <div className="relative">
                  <GitBranch className="absolute left-3 top-3 text-zinc-600" size={16} />
                  <input
                    type="text"
                    required
                    value={branch}
                    onChange={(e) => setBranch(e.target.value)}
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4"
                  />
                </div>
                <p className="text-[10px] text-zinc-500 mt-1 flex items-center gap-1">
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
              <h3 className="text-sm font-semibold text-white mb-1">Credentials Access integration</h3>
              <p className="text-[11px] text-zinc-400">Configure OAuth tokens or personal access keys to read build lists.</p>
            </div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-400 mb-1">
                  {provider === 'vercel' ? 'Vercel API Token' : 'Netlify Site Auth token'}
                </label>
                <div className="relative">
                  <Key className="absolute left-3 top-3 text-zinc-600" size={16} />
                  <input
                    type="password"
                    required
                    value={apiToken}
                    onChange={(e) => setApiToken(e.target.value)}
                    placeholder={provider === 'vercel' ? 'vcl_xxxxxxxxxxxxxxxxxxxx' : 'nf_xxxxxxxxxxxxxxxxxxxx'}
                    className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4"
                  />
                </div>
              </div>

              {connectionState !== 'idle' && (
                <div className={`p-4 rounded-lg border text-xs flex flex-col gap-1.5 transition-all duration-300 ${
                  connectionState === 'testing' ? 'border-white/10 bg-white/[0.03] text-zinc-300' :
                  connectionState === 'success' ? 'border-emerald-500/20 bg-emerald-500/5 text-emerald-400' :
                  'border-red-500/20 bg-red-500/5 text-red-400'
                }`}>
                  <div className="flex items-center gap-2">
                    <span className={`w-2 h-2 rounded-full ${
                      connectionState === 'testing' ? 'bg-zinc-400 animate-ping' :
                      connectionState === 'success' ? 'bg-emerald-500' : 'bg-red-500'
                    }`}></span>
                    <span className="font-semibold">
                      {connectionState === 'testing' ? 'Verifying access credentials...' :
                       connectionState === 'success' ? 'Access token successfully authenticated!' :
                       'Verification failed.'}
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-500">
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
              <h3 className="text-sm font-semibold text-white mb-1">Onboarding summary</h3>
              <p className="text-[11px] text-zinc-400">Review deployment configuration parameters.</p>
            </div>
            
            <div className="bg-white/[0.02] border border-white/[0.06] rounded-lg divide-y divide-white/[0.06] text-xs">
              <div className="p-3 flex justify-between">
                <span className="text-zinc-500">Service Identifier</span>
                <span className="font-semibold text-zinc-200">{name}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-zinc-500">Code Repository</span>
                <span className="font-mono text-[10px] text-zinc-300">{repoOwner}/{repoName}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-zinc-500">Hosting Provider</span>
                <span className="font-mono text-[10px] text-zinc-200 uppercase font-bold">{provider}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-zinc-500">Listening Branch</span>
                <span className="font-mono text-[10px] text-zinc-300">{branch}</span>
              </div>
              <div className="p-3 flex justify-between">
                <span className="text-zinc-500">Webhook Status</span>
                <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded flex items-center gap-1">
                  <CheckCircle2 size={10} />
                  READY TO REGISTER
                </span>
              </div>
            </div>

            <div className="p-3 bg-amber-500/5 border border-amber-500/20 rounded text-[10px] text-amber-400 flex gap-2">
              <Info size={16} className="shrink-0" />
              <span>
                Registering this service will deploy webhooks to GitHub. Pushing new commits will build directly on {provider}. Aether registers pipelines status.
              </span>
            </div>
          </div>
        )}

        {/* Footer Wizard Controls */}
        <div className="flex justify-between items-center border-t border-white/[0.06] pt-5 mt-6">
          {step > 1 ? (
            <button
              onClick={prevStep}
              className="flex items-center gap-1.5 text-xs text-zinc-400 hover:text-zinc-200 transition-colors font-medium"
            >
              <ArrowLeft size={12} />
              Previous Stage
            </button>
          ) : <div />}

          {step < 6 ? (
            <button
              onClick={nextStep}
              disabled={connectionState === 'testing'}
              className="bg-white text-black hover:bg-zinc-200 disabled:opacity-50 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
            >
              Continue
              <ArrowRight size={12} />
            </button>
          ) : (
            <button
              onClick={handleCreate}
              className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/20 font-medium py-2 px-4 rounded-lg text-xs transition-all flex items-center gap-1.5"
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

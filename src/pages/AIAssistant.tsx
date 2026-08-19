import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  Bot, Send, Sparkles, HelpCircle, Terminal, 
  Info, Cpu, ChevronRight, AlertCircle 
} from 'lucide-react';
import type { AIChatMessage } from '../types/platform';
import { aiExplanations } from '../data/seedData';

export const AIAssistant: React.FC = () => {
  const { 
    projects, 
    deployments, 
    incidents, 
    activeProjectId, 
    activeDeploymentId 
  } = usePlatform();

  const [selectedProjId, setSelectedProjId] = useState<string>(activeProjectId || projects[0]?.id || '');
  const [selectedDeployId, setSelectedDeployId] = useState<string>(activeDeploymentId || '');
  const [selectedIncidentId, setSelectedIncidentId] = useState<string>('');

  const [chatInput, setChatInput] = useState('');
  const [messages, setMessages] = useState<AIChatMessage[]>([
    {
      id: 'm1',
      sender: 'assistant',
      content: 'Hello! I am Aether, your IDP Recovery Co-pilot. Select a service or incident context, then ask me to diagnose pipeline failures, summarize errors, or list suggested troubleshooting routines.',
      createdAt: new Date().toISOString()
    }
  ]);
  const [isTyping, setIsTyping] = useState(false);

  // Update deployment selections based on selected project
  const projectDeploys = deployments.filter(d => d.projectId === selectedProjId);
  const projectIncidents = incidents.filter(i => i.projectId === selectedProjId);

  // Auto-set deployment/incident targets when project changes
  useEffect(() => {
    if (projectDeploys.length > 0) {
      setSelectedDeployId(projectDeploys[0].id);
    } else {
      setSelectedDeployId('');
    }

    if (projectIncidents.length > 0) {
      setSelectedIncidentId(projectIncidents[0].id);
    } else {
      setSelectedIncidentId('');
    }
  }, [selectedProjId, deployments, incidents]);

  const handleSendMessage = (e?: React.FormEvent, customMsg?: string) => {
    if (e) e.preventDefault();
    const queryText = customMsg || chatInput;
    if (!queryText.trim()) return;

    // 1. User Message
    const userMsg: AIChatMessage = {
      id: 'mu_' + Math.random().toString(36).substr(2, 9),
      sender: 'user',
      content: queryText,
      createdAt: new Date().toISOString(),
      context: {
        projectId: selectedProjId,
        deploymentId: selectedDeployId,
        incidentId: selectedIncidentId
      }
    };

    setMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsTyping(true);

    // 2. Simulate AI Analysis trigger
    setTimeout(() => {
      let aiResponse: Partial<AIChatMessage> = {
        id: 'ma_' + Math.random().toString(36).substr(2, 9),
        sender: 'assistant',
        createdAt: new Date().toISOString(),
        content: 'I have analyzed the current deployment log telemetry.'
      };

      // Custom Context matching
      const targetDeploy = deployments.find(d => d.id === selectedDeployId);
      const targetIncident = incidents.find(i => i.id === selectedIncidentId);

      if (queryText.includes('Why did') || queryText.includes('fail') || queryText.includes('diagnose')) {
        if (targetDeploy && targetDeploy.status === 'failed') {
          const details = aiExplanations[targetDeploy.id];
          if (details) {
            aiResponse.content = `I have diagnosed the compiler logs for version ${targetDeploy.version}.`;
            aiResponse.confidenceScore = details.confidenceScore;
            aiResponse.causes = details.causes;
            aiResponse.recommendations = details.recommendations;
            aiResponse.content += `\n\n${details.explanation}`;
          } else {
            aiResponse.content = `The deployment ${targetDeploy.version} is showing a failed state. The logs indicate a connection timeout during environment propagation. Please verify API access keys in settings.`;
            aiResponse.confidenceScore = 75;
            aiResponse.recommendations = ['Verify Vercel integration keys.', 'Re-dispatch webhook push.'];
          }
        } else {
          aiResponse.content = 'The currently selected deployment runs are reporting healthy stability statuses (Ready). No compiler compile warnings detected.';
          aiResponse.confidenceScore = 99;
        }
      } else if (queryText.includes('incident') || queryText.includes('Incident') || queryText.includes('Summarize')) {
        if (targetIncident) {
          aiResponse.content = `Incident "${targetIncident.title}" is currently flagged as ${targetIncident.status.toUpperCase()} severity ${targetIncident.severity.toUpperCase()}.`;
          aiResponse.content += `\n\nIt was triggered by a build failure in deployment ${targetIncident.deploymentId || 'N/A'}. Let me list the suggested resolution actions:`;
          aiResponse.recommendations = [
            targetIncident.suggestedAction || 'Verify environment credentials settings.',
            'Collaborate with developers inside Discussion comments feed.',
            'Run a rollback to a stable target candidate.'
          ];
          aiResponse.confidenceScore = 90;
        } else {
          aiResponse.content = 'No active incident alert context selected. Select a project and incident from the filters to review metrics.';
          aiResponse.confidenceScore = 95;
        }
      } else {
        // Fallback generic response
        aiResponse.content = `I understand you are asking: "${queryText}". As an integration co-pilot, I monitor deployment health. Let me suggest common steps:`;
        aiResponse.recommendations = [
          'Navigate to Projects to review logs metrics.',
          'Verify webhook connection signature validity settings.',
          'Inspect recent rollbacks audit events logs.'
        ];
        aiResponse.confidenceScore = 80;
      }

      setMessages(prev => [...prev, aiResponse as AIChatMessage]);
      setIsTyping(false);
    }, 2000);
  };

  const sampleQuestions = [
    'Why did this deployment fail?',
    'Summarize this incident.',
    'What should I check next?'
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)] items-stretch">
      {/* Context Selection Panel */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-4 lg:col-span-1 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-dark-750 pb-2.5">
            <Cpu size={16} className="text-brand-400" />
            <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">AI Diagnostic Scope</h3>
          </div>

          {/* Project select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase">Service Project</label>
            <select
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="w-full bg-dark-950 border border-dark-750 rounded p-1.5 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Deployment select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase">Build Run</label>
            <select
              value={selectedDeployId}
              onChange={(e) => setSelectedDeployId(e.target.value)}
              className="w-full bg-dark-950 border border-dark-750 rounded p-1.5 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
            >
              <option value="">-- Choose run --</option>
              {projectDeploys.map(d => (
                <option key={d.id} value={d.id}>
                  {d.version} ({d.status})
                </option>
              ))}
            </select>
          </div>

          {/* Incident select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-slate-400 uppercase">Incident Alert</label>
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="w-full bg-dark-950 border border-dark-750 rounded p-1.5 text-xs text-white focus:outline-none focus:border-brand-500 font-mono"
            >
              <option value="">-- Choose incident --</option>
              {projectIncidents.map(i => (
                <option key={i.id} value={i.id}>
                  {i.title.substr(0, 35)}...
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* AI Disclaimer */}
        <div className="p-3 bg-dark-950/40 rounded border border-dark-750 text-[10px] text-slate-500 leading-normal flex gap-2">
          <Info size={18} className="shrink-0 text-slate-400" />
          <span>
            <b>Aether Guardrails:</b> Aether diagnostics provide advice. AI does not perform destructive rollbacks autonomously. Manual confirmations are required.
          </span>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl lg:col-span-3 flex flex-col overflow-hidden shadow-2xl h-full">
        {/* Chat Header */}
        <div className="bg-dark-950 border-b border-dark-750 px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Bot size={16} className="text-brand-400" />
            <span className="font-bold text-slate-200">Aether Diagnostic Assistant</span>
          </div>
          <span className="text-[10px] font-mono text-emerald-400 flex items-center gap-1">
            <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span>
            Co-pilot Active
          </span>
        </div>

        {/* Chat Feed */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4 font-sans text-xs">
          {messages.map((msg) => {
            const isAI = msg.sender === 'assistant';
            return (
              <div key={msg.id} className={`flex gap-3 max-w-3xl ${isAI ? '' : 'ml-auto flex-row-reverse'}`}>
                {/* Avatar */}
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border border-dark-700 ${
                  isAI ? 'bg-brand-600/10 text-brand-400 glow-info' : 'bg-dark-950 text-slate-400'
                }`}>
                  {isAI ? <Bot size={16} /> : <Terminal size={14} />}
                </div>

                {/* Message Body */}
                <div className={`p-4 rounded-xl space-y-3 leading-relaxed border ${
                  isAI 
                    ? 'bg-dark-950/20 border-dark-750 text-slate-300' 
                    : 'bg-brand-600 border-brand-500 text-white shadow-lg shadow-brand-600/10'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Dynamic AI Diagnostic metadata indicators */}
                  {isAI && msg.confidenceScore && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-dark-750 text-[10px] font-mono text-slate-500">
                      <span>Confidence score: <b className="text-brand-400">{msg.confidenceScore}%</b></span>
                    </div>
                  )}

                  {/* Causes items */}
                  {isAI && msg.causes && msg.causes.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-dark-750/30">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-rose-400 font-mono">Potential Faults</span>
                      <ul className="list-disc pl-4 space-y-1 text-slate-400">
                        {msg.causes.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations items */}
                  {isAI && msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 font-mono">Recovery Steps</span>
                      <ul className="list-decimal pl-4 space-y-1 text-slate-400">
                        {msg.recommendations.map((r, i) => <li key={i}>{r}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Typing Indicator */}
          {isTyping && (
            <div className="flex gap-3 max-w-sm">
              <div className="w-8 h-8 rounded-lg bg-brand-600/10 text-brand-400 border border-dark-700 flex items-center justify-center">
                <Bot size={16} className="animate-bounce" />
              </div>
              <div className="p-3 bg-dark-950/20 border border-dark-750 text-slate-400 rounded-xl flex items-center gap-1.5 font-mono text-[10px]">
                <span className="ai-dots flex gap-1">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                <span>Scanning build traces...</span>
              </div>
            </div>
          )}
        </div>

        {/* Sample Questions Drawer */}
        <div className="px-4 py-2 border-t border-dark-750/50 bg-dark-950/10 flex flex-wrap gap-2">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => handleSendMessage(e, q)}
              className="bg-dark-800 hover:bg-dark-750 text-[10px] text-slate-400 hover:text-slate-200 border border-dark-700 rounded-full px-3 py-1 font-mono transition-all flex items-center gap-1"
            >
              <HelpCircle size={10} />
              {q}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} className="p-3 bg-dark-950 border-t border-dark-750 flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask Aether diagnostic questions (e.g. Why did this build run fail?)..."
            className="flex-1 bg-dark-900 border border-dark-750 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-sans"
          />
          <button
            type="submit"
            className="bg-brand-600 hover:bg-brand-500 text-white font-bold p-2.5 rounded-lg transition-all shadow-md shadow-brand-600/10"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};

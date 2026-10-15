import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { 
  Bot, Send, HelpCircle, Terminal, 
  Info, Cpu
} from 'lucide-react';
import type { AIChatMessage } from '../types/platform';

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

  // Restore persisted conversation when the incident context changes.
  // Best-effort: an empty or failed history simply leaves the greeting.
  useEffect(() => {
    if (!selectedIncidentId || !isApiAvailable()) return;
    let cancelled = false;
    api.ai.chatHistory(selectedIncidentId)
      .then(res => {
        if (cancelled) return;
        const turns = (res.turns || []).map((t, idx) => ({
          id: `hist-${idx}`,
          sender: t.role === 'user' ? 'user' as const : 'assistant' as const,
          content: t.content,
          createdAt: new Date().toISOString(),
        }));
        if (turns.length > 0) setMessages(turns);
      })
      .catch(() => { /* offline or table missing — keep greeting */ });
    return () => { cancelled = true; };
  }, [selectedIncidentId]);

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

  const handleSendMessage = async (e?: React.FormEvent, customMsg?: string) => {
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

    // Try real API first
    if (isApiAvailable()) {
      try {
        const targetDeploy = deployments.find(d => d.id === selectedDeployId);
        const targetIncident = incidents.find(i => i.id === selectedIncidentId);
        const context = {
          incident_id: selectedIncidentId || undefined,
          user_question: queryText,
          title: targetIncident?.title || targetDeploy?.projectName || 'General Query',
          description: targetIncident?.description,
          error_message: targetDeploy?.errorMessage,
          logs: targetDeploy?.logs,
          provider: targetDeploy?.provider || targetIncident?.provider,
          deployment_status: targetDeploy?.status,
          deployment_version: targetDeploy?.version,
          incident_severity: targetIncident?.severity,
          incident_status: targetIncident?.status,
        };
        const result = await api.ai.analyze(context);
        const aiResponse: AIChatMessage = {
          id: 'ma_' + Math.random().toString(36).substr(2, 9),
          sender: 'assistant',
          content: result.explanation,
          confidenceScore: result.confidence,
          causes: result.causes,
          recommendations: result.steps.map((s: { title: string; description: string }) => `${s.title}${s.description ? ': ' + s.description : ''}`),
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, aiResponse]);
        setIsTyping(false);
        return;
      } catch (err) {
        console.warn('[AI] api.ai.analyze failed:', err);
        const unavailable: AIChatMessage = {
          id: 'ma_' + Math.random().toString(36).substr(2, 9),
          sender: 'assistant',
          content: 'Analysis is unavailable right now — the backend did not respond. Check that the API server is running and try again.',
          createdAt: new Date().toISOString(),
        };
        setMessages(prev => [...prev, unavailable]);
        setIsTyping(false);
        return;
      }
    }

    // Backend unavailable — say so instead of simulating an answer.
    setIsTyping(false);
    const offline: AIChatMessage = {
      id: 'ma_' + Math.random().toString(36).substr(2, 9),
      sender: 'assistant',
      content: 'The AI backend is not connected. Start the API server to enable diagnostics.',
      createdAt: new Date().toISOString(),
    };
    setMessages(prev => [...prev, offline]);
  };

  const sampleQuestions = [
    'Why did this deployment fail?',
    'Summarize this incident.',
    'What should I check next?'
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 h-[calc(100vh-140px)] items-stretch">
      {/* Context Selection Panel */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl p-4 space-y-4 lg:col-span-1 flex flex-col justify-between">
        <div className="space-y-4">
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-2.5">
            <Cpu size={16} className="text-zinc-500" />
            <h3 className="text-xs font-semibold text-zinc-100 uppercase tracking-wider">AI Diagnostic Scope</h3>
          </div>

          {/* Project select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase">Service Project</label>
            <select
              value={selectedProjId}
              onChange={(e) => setSelectedProjId(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:outline-none focus:border-white/20 rounded-md p-1.5 text-xs font-mono"
            >
              {projects.map(p => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Deployment select */}
          <div className="space-y-1.5">
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase">Build Run</label>
            <select
              value={selectedDeployId}
              onChange={(e) => setSelectedDeployId(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:outline-none focus:border-white/20 rounded-md p-1.5 text-xs font-mono"
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
            <label className="block text-[10px] font-semibold text-zinc-500 uppercase">Incident Alert</label>
            <select
              value={selectedIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 focus:outline-none focus:border-white/20 rounded-md p-1.5 text-xs font-mono"
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
        <div className="p-3 bg-white/[0.02] rounded border border-white/[0.06] text-[10px] text-zinc-500 leading-normal flex gap-2">
          <Info size={18} className="shrink-0 text-zinc-600" />
          <span>
            <b className="text-zinc-400">Aether Guardrails:</b> Aether diagnostics provide advice. AI does not perform destructive rollbacks autonomously. Manual confirmations are required.
          </span>
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="bg-white/[0.03] border border-white/[0.06] rounded-xl lg:col-span-3 flex flex-col overflow-hidden h-full">
        {/* Chat Header */}
        <div className="bg-white/[0.02] border-b border-white/[0.06] px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs">
            <Bot size={16} className="text-zinc-400" />
            <span className="font-semibold text-zinc-200">Aether Diagnostic Assistant</span>
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
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${
                  isAI ? 'bg-white/[0.03] text-zinc-400 border-white/[0.06]' : 'bg-white/[0.03] text-zinc-500 border-white/[0.06]'
                }`}>
                  {isAI ? <Bot size={16} /> : <Terminal size={14} />}
                </div>

                {/* Message Body */}
                <div className={`p-4 rounded-xl space-y-3 leading-relaxed border ${
                  isAI 
                    ? 'bg-white/[0.02] border-white/[0.06] text-zinc-300' 
                    : 'bg-white/5 border-white/10 text-zinc-100'
                }`}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>

                  {/* Dynamic AI Diagnostic metadata indicators */}
                  {isAI && msg.confidenceScore && (
                    <div className="flex flex-wrap gap-2 pt-2 border-t border-white/[0.06] text-[10px] font-mono text-zinc-500">
                      <span>Confidence score: <b className="text-zinc-300">{msg.confidenceScore}%</b></span>
                    </div>
                  )}

                  {/* Causes items */}
                  {isAI && msg.causes && msg.causes.length > 0 && (
                    <div className="space-y-1 pt-2 border-t border-white/[0.06]">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-red-400 font-mono">Potential Faults</span>
                      <ul className="list-disc pl-4 space-y-1 text-zinc-400">
                        {msg.causes.map((c, i) => <li key={i}>{c}</li>)}
                      </ul>
                    </div>
                  )}

                  {/* Recommendations items */}
                  {isAI && msg.recommendations && msg.recommendations.length > 0 && (
                    <div className="space-y-1 pt-2">
                      <span className="text-[9px] font-bold uppercase tracking-wider text-emerald-400 font-mono">Recovery Steps</span>
                      <ul className="list-decimal pl-4 space-y-1 text-zinc-400">
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
              <div className="w-8 h-8 rounded-lg bg-white/[0.03] text-zinc-500 border border-white/[0.06] flex items-center justify-center">
                <Bot size={16} className="animate-bounce" />
              </div>
              <div className="p-3 bg-white/[0.02] border border-white/[0.06] text-zinc-500 rounded-xl flex items-center gap-1.5 font-mono text-[10px]">
                <span className="ai-dots flex gap-1">
                  <span>.</span><span>.</span><span>.</span>
                </span>
                <span>Scanning build traces...</span>
              </div>
            </div>
          )}
        </div>

        {/* Sample Questions Drawer */}
        <div className="px-4 py-2 border-t border-white/[0.06] bg-white/[0.01] flex flex-wrap gap-2">
          {sampleQuestions.map((q, idx) => (
            <button
              key={idx}
              type="button"
              onClick={(e) => handleSendMessage(e, q)}
              className="bg-white/[0.03] hover:bg-white/5 text-[10px] text-zinc-500 hover:text-zinc-300 border border-white/[0.06] rounded-full px-3 py-1 font-mono transition-all flex items-center gap-1"
            >
              <HelpCircle size={10} />
              {q}
            </button>
          ))}
        </div>

        {/* Input Form */}
        <form onSubmit={handleSendMessage} className="p-3 bg-white/[0.02] border-t border-white/[0.06] flex gap-2">
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            placeholder="Ask Aether diagnostic questions (e.g. Why did this build run fail?)..."
            className="flex-1 bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md px-3 py-2 text-xs font-sans"
          />
          <button
            type="submit"
            className="bg-white text-black hover:bg-zinc-200 font-medium p-2.5 rounded-lg transition-all"
          >
            <Send size={14} />
          </button>
        </form>
      </div>
    </div>
  );
};

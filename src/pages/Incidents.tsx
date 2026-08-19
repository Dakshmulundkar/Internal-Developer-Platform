import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { 
  AlertTriangle, Search, Filter, ShieldAlert, CheckCircle,
  MessageSquare, User, Calendar, Clock, Send, ShieldCheck
} from 'lucide-react';
import type { Incident, IncidentSeverity, IncidentStatus } from '../types/platform';

export const Incidents: React.FC = () => {
  const { 
    incidents, 
    activeIncidentId, 
    navigateTo, 
    addComment, 
    resolveIncident, 
    user 
  } = usePlatform();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [commentText, setCommentText] = useState('');

  // Selected incident details state helper
  const [localActiveId, setLocalActiveId] = useState<string | null>(activeIncidentId || null);

  const selectedIncident = incidents.find(i => i.id === (localActiveId || activeIncidentId));

  const filteredIncidents = incidents.filter(inc => {
    const matchesSearch = inc.title.toLowerCase().includes(searchTerm.toLowerCase()) || 
      inc.projectName.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || 
      (statusFilter === 'open' && inc.status !== 'resolved') ||
      (statusFilter === 'resolved' && inc.status === 'resolved');
    return matchesSearch && matchesStatus;
  });

  const getSeverityStyle = (severity: IncidentSeverity) => {
    switch (severity) {
      case 'critical': return 'bg-rose-500/10 text-rose-400 border-rose-500/25 font-bold animate-pulse';
      case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
      case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
    }
  };

  const getStatusColor = (status: IncidentStatus) => {
    switch (status) {
      case 'resolved': return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/25';
      case 'investigating': return 'bg-blue-500/10 text-blue-400 border-blue-500/25';
      default: return 'bg-rose-500/10 text-rose-400 border-rose-500/25 animate-pulse';
    }
  };

  const handlePostComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim() || !selectedIncident) return;
    addComment(selectedIncident.id, commentText);
    setCommentText('');
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
      {/* Incidents Sidebar List */}
      <div className="bg-dark-900 border border-dark-700 rounded-xl p-4 space-y-4 lg:col-span-1 h-[calc(100vh-140px)] flex flex-col">
        <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider">Incidents Log</h3>
        
        {/* Search and filter controls */}
        <div className="space-y-2 shrink-0">
          <div className="relative">
            <Search className="absolute left-2.5 top-2 text-slate-500" size={14} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by title or project..."
              className="w-full bg-dark-950 border border-dark-750 rounded p-1.5 pl-8 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 font-mono"
            />
          </div>

          <div className="grid grid-cols-3 gap-1">
            {['all', 'open', 'resolved'].map(opt => (
              <button
                key={opt}
                onClick={() => setStatusFilter(opt)}
                className={`py-1 rounded border text-[10px] uppercase font-mono font-semibold ${
                  statusFilter === opt 
                    ? 'border-brand-500 bg-brand-500/10 text-brand-400' 
                    : 'border-dark-750 hover:bg-dark-850 text-slate-500'
                }`}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>

        {/* List scroll area */}
        <div className="flex-1 overflow-y-auto divide-y divide-dark-750">
          {filteredIncidents.length === 0 ? (
            <div className="p-4 text-center text-slate-500 font-mono text-[10px]">No alerts found.</div>
          ) : (
            filteredIncidents.map(inc => {
              const isSelected = selectedIncident?.id === inc.id;
              return (
                <div
                  key={inc.id}
                  onClick={() => setLocalActiveId(inc.id)}
                  className={`p-3 cursor-pointer hover:bg-dark-800 transition-all ${
                    isSelected ? 'bg-dark-850 border-l-2 border-brand-500' : ''
                  }`}
                >
                  <div className="flex justify-between items-start gap-2 mb-1.5">
                    <span className="font-semibold text-slate-200 line-clamp-1 hover:underline text-xs">
                      {inc.title}
                    </span>
                    <span className={`px-1.5 py-0.5 border rounded text-[8px] font-mono capitalize ${getSeverityBadgeStyle(inc.severity)}`}>
                      {inc.severity}
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 block">Project: {inc.projectName}</p>
                  <div className="flex justify-between items-center text-[9px] text-slate-500 mt-2">
                    <span className={`px-1 rounded-sm uppercase ${
                      inc.status === 'resolved' ? 'text-emerald-400 bg-emerald-500/5' : 'text-rose-400 bg-rose-500/5'
                    }`}>{inc.status}</span>
                    <span>{new Date(inc.createdAt).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Incident Detail deep dive board */}
      <div className="lg:col-span-2 space-y-6">
        {selectedIncident ? (
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-5 space-y-5">
            {/* Header title */}
            <div className="flex flex-col md:flex-row justify-between md:items-center gap-4 border-b border-dark-750 pb-4">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-bold capitalize ${getSeverityStyle(selectedIncident.severity)}`}>
                    {selectedIncident.severity} Severity
                  </span>
                  <span className={`px-2 py-0.5 border rounded-full text-[9px] font-mono font-bold capitalize ${getStatusColor(selectedIncident.status)}`}>
                    {selectedIncident.status}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono uppercase bg-black text-white px-1.5 py-0.5 rounded">
                    {selectedIncident.provider}
                  </span>
                </div>
                
                <h2 className="text-sm font-bold text-white tracking-wide mt-2">
                  {selectedIncident.title}
                </h2>
                
                <p className="text-[11px] text-slate-500 mt-1">
                  Service Project: <b className="text-slate-300 font-semibold">{selectedIncident.projectName}</b> • Triggered: {new Date(selectedIncident.createdAt).toLocaleString()}
                </p>
              </div>

              {selectedIncident.status !== 'resolved' && (
                <button
                  onClick={() => resolveIncident(selectedIncident.id)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all shadow-md shadow-emerald-600/10 flex items-center gap-1.5 font-mono"
                >
                  <ShieldCheck size={14} />
                  Resolve Incident
                </button>
              )}
            </div>

            {/* Description */}
            <div className="space-y-1.5">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block">Incident Summary</span>
              <p className="text-xs text-slate-300 leading-relaxed font-sans">{selectedIncident.description}</p>
            </div>

            {/* Suggested actions alert panel */}
            {selectedIncident.suggestedAction && selectedIncident.status !== 'resolved' && (
              <div className="bg-brand-500/5 border border-brand-500/20 p-4 rounded-lg flex items-start gap-2.5 text-xs text-slate-300 glow-info">
                <ShieldAlert className="text-brand-500 shrink-0 mt-0.5" size={16} />
                <div>
                  <span className="font-bold text-white block mb-0.5">Aether AI Recovery Advice</span>
                  <p className="leading-relaxed text-slate-400">{selectedIncident.suggestedAction}</p>
                  
                  {selectedIncident.deploymentId && (
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => navigateTo('deployment-details', { deploymentId: selectedIncident.deploymentId })}
                        className="bg-brand-600 hover:bg-brand-500 text-white font-bold py-1 px-2.5 rounded text-[10px] transition-all"
                      >
                        Inspect logs
                      </button>
                      <button
                        onClick={() => navigateTo('rollback-recovery', { projectId: selectedIncident.projectId })}
                        className="bg-dark-800 hover:bg-dark-750 text-slate-300 border border-dark-700 font-bold py-1 px-2.5 rounded text-[10px] transition-all"
                      >
                        Recover
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Discussion Thread Feed */}
            <div className="border-t border-dark-750 pt-4 space-y-4">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block">Incident Discussion Feed</span>
              
              <div className="space-y-3 max-h-48 overflow-y-auto pr-1">
                {selectedIncident.comments.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">No comments posted yet. Start the diagnostic process below.</p>
                ) : (
                  selectedIncident.comments.map(c => (
                    <div key={c.id} className="flex gap-2.5 text-xs bg-dark-950/20 p-3 rounded-lg border border-dark-750">
                      <img src={c.userAvatar} alt="" className="w-6.5 h-6.5 rounded-full mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-baseline mb-1">
                          <span className="font-semibold text-slate-200">{c.userName}</span>
                          <span className="text-[9px] text-slate-500">{new Date(c.createdAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                        </div>
                        <p className="text-slate-400 leading-normal font-sans">{c.content}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>

              {/* Add Comment Form */}
              {selectedIncident.status !== 'resolved' && (
                <form onSubmit={handlePostComment} className="flex gap-2 mt-2">
                  <input
                    type="text"
                    required
                    value={commentText}
                    onChange={(e) => setCommentText(e.target.value)}
                    placeholder="Enter troubleshooting notes or observations..."
                    className="flex-1 bg-dark-950 border border-dark-750 rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-sans"
                  />
                  <button
                    type="submit"
                    className="bg-brand-600 hover:bg-brand-500 text-white font-bold p-2.5 rounded-lg transition-all"
                  >
                    <Send size={14} />
                  </button>
                </form>
              )}
            </div>

            {/* Timeline steps log */}
            <div className="border-t border-dark-750 pt-4 space-y-3">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider font-mono block">Timeline Trace Log</span>
              
              <div className="space-y-2.5">
                {selectedIncident.timeline.map((evt, idx) => (
                  <div key={idx} className="flex items-center gap-2.5 text-[10px]">
                    <span className="font-mono text-slate-500">
                      {new Date(evt.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className={`w-1.5 h-1.5 rounded-full ${
                      evt.type === 'alert' ? 'bg-rose-500' :
                      evt.type === 'comment' ? 'bg-brand-500' :
                      evt.type === 'status_change' ? 'bg-emerald-500' : 'bg-slate-400'
                    }`}></span>
                    <span className="text-slate-400">{evt.event}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-dark-900 border border-dark-700 rounded-xl p-12 text-center text-slate-500">
            <ShieldCheck size={32} className="text-slate-600 mx-auto mb-3" />
            <h3 className="text-sm font-bold text-white mb-1">No Incident Selected</h3>
            <p className="text-xs text-slate-400">Select an incident from the log view to review details.</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Helper for sidebar item styles
const getSeverityBadgeStyle = (severity: IncidentSeverity) => {
  switch (severity) {
    case 'critical': return 'bg-rose-500/10 text-rose-400 border-rose-500/25';
    case 'high': return 'bg-orange-500/10 text-orange-400 border-orange-500/25';
    case 'medium': return 'bg-amber-500/10 text-amber-400 border-amber-500/25';
    default: return 'bg-slate-500/10 text-slate-400 border-slate-500/25';
  }
};

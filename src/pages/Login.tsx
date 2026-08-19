import React, { useState } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { Terminal, Lock, Mail, Github, Chrome } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginUser } = usePlatform();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) {
      setError('Please provide a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must contain at least 6 characters.');
      return;
    }
    setError('');
    loginUser(email);
  };

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background glowing shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-brand-600/10 rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-600/5 rounded-full blur-3xl -z-10"></div>

      <div className="w-full max-w-md bg-dark-900 border border-dark-700 rounded-2xl shadow-2xl p-8 relative">
        {/* Tech Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-brand-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-brand-600/20 glow-info mb-3">
            <Terminal size={24} />
          </div>
          <h2 className="text-xl font-bold text-white tracking-wide">Aether Developer Portal</h2>
          <p className="text-xs text-slate-400 mt-1">Sign in to control delivery pipelines and recoveries.</p>
        </div>

        {/* Errors */}
        {error && (
          <div className="bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-lg p-3 mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></span>
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-1.5">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-slate-500" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-slate-400">Password</label>
              <button 
                type="button" 
                onClick={() => alert('Demo Mode: Enter any password with 6+ characters or sign in with OAuth.')}
                className="text-[10px] text-brand-500 hover:underline"
              >
                Forgot credentials?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-slate-500" size={16} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-dark-950 border border-dark-750 rounded-lg py-2.5 pl-10 pr-4 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-brand-500 transition-all font-mono"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-brand-600 hover:bg-brand-500 text-white font-bold py-2.5 rounded-lg text-xs transition-all shadow-md shadow-brand-600/10"
          >
            Authenticate Credentials
          </button>
        </form>

        {/* Separator */}
        <div className="relative my-6 text-center">
          <hr className="border-dark-700" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-dark-900 px-3 text-[10px] text-slate-500 font-semibold tracking-wider uppercase">
            Or continue with
          </span>
        </div>

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => loginUser('github.user@github.com', 'GitHub')}
            className="flex items-center justify-center gap-2 bg-dark-950 border border-dark-750 hover:bg-dark-800 text-slate-200 py-2.5 rounded-lg text-xs transition-all"
          >
            <Github size={14} />
            <span>GitHub</span>
          </button>
          <button
            type="button"
            onClick={() => loginUser('google.user@gmail.com', 'Google')}
            className="flex items-center justify-center gap-2 bg-dark-950 border border-dark-750 hover:bg-dark-800 text-slate-200 py-2.5 rounded-lg text-xs transition-all"
          >
            <Chrome size={14} className="text-slate-400" />
            <span>Google</span>
          </button>
        </div>

        {/* Demo Notice */}
        <div className="mt-8 text-center text-[10px] text-slate-500 border-t border-dark-800 pt-4 font-mono">
          Security Sandbox Enforced • ISO 27001 Certified
        </div>
      </div>
    </div>
  );
};

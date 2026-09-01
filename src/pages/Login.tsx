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
    <div className="min-h-screen bg-[#050505] flex flex-col justify-center items-center px-4 relative overflow-hidden">
      {/* Background subtle shapes */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[0.01] rounded-full blur-3xl -z-10"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/[0.01] rounded-full blur-3xl -z-10"></div>

      <div className="w-full max-w-md bg-white/[0.03] border border-white/[0.06] rounded-2xl shadow-2xl p-8 relative">
        {/* Tech Header */}
        <div className="text-center mb-8">
          <div className="mx-auto w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white mb-3">
            <Terminal size={22} />
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Aether Developer Portal</h2>
          <p className="text-xs text-zinc-400 mt-1">Sign in to control delivery pipelines and recoveries.</p>
        </div>

        {/* Errors */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3 mb-5 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0"></span>
            <span>{error}</span>
          </div>
        )}

        {/* Credentials Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Corporate Email</label>
            <div className="relative">
              <Mail className="absolute left-3 top-3 text-zinc-600" size={16} />
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="developer@company.com"
                className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4"
              />
            </div>
          </div>

          <div>
            <div className="flex justify-between items-center mb-1.5">
              <label className="block text-xs font-semibold text-zinc-400">Password</label>
              <button 
                type="button" 
                onClick={() => alert('Demo Mode: Enter any password with 6+ characters or sign in with OAuth.')}
                className="text-[10px] text-zinc-500 hover:text-zinc-300 hover:underline"
              >
                Forgot credentials?
              </button>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 text-zinc-600" size={16} />
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4"
              />
            </div>
          </div>

          <button
            type="submit"
            className="w-full bg-white text-black hover:bg-zinc-200 font-medium py-2.5 rounded-md text-xs transition-all"
          >
            Authenticate Credentials
          </button>
        </form>

        {/* Separator */}
        <div className="relative my-6 text-center">
          <hr className="border-white/[0.06]" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-[#050505] px-3 text-[10px] text-zinc-600 font-semibold tracking-wider uppercase" style={{background: 'color-mix(in srgb, #050505 100%, transparent)'}}>
            Or continue with
          </span>
        </div>

        {/* OAuth Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <button
            type="button"
            onClick={() => loginUser('github.user@github.com', 'GitHub')}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800 py-2.5 rounded-md text-xs transition-all"
          >
            <Github size={14} />
            <span>GitHub</span>
          </button>
          <button
            type="button"
            onClick={() => loginUser('google.user@gmail.com', 'Google')}
            className="flex items-center justify-center gap-2 bg-zinc-900 text-zinc-300 border border-white/[0.06] hover:bg-zinc-800 py-2.5 rounded-md text-xs transition-all"
          >
            <Chrome size={14} className="text-zinc-400" />
            <span>Google</span>
          </button>
        </div>

        {/* Demo Notice */}
        <div className="mt-8 text-center text-[10px] text-zinc-600 border-t border-white/[0.06] pt-4 font-mono">
          Security Sandbox Enforced • ISO 27001 Certified
        </div>
      </div>
    </div>
  );
};

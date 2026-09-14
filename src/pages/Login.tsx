import React, { useState, useEffect } from 'react';
import { usePlatform } from '../context/PlatformContext';
import { isApiAvailable, api } from '../services/api';
import { Terminal, Lock, Mail, Github, UserPlus, LogIn, CheckCircle } from 'lucide-react';

export const Login: React.FC = () => {
  const { loginUser } = usePlatform();
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [githubLoading, setGithubLoading] = useState(false);

  // ── Handle OAuth callback from GitHub ──────────────────────────────────────
  useEffect(() => {
    // Hash-based callback: http://localhost:5173/#/auth/github/success?token=...
    const hash = window.location.hash; // e.g. "#/auth/github/success?token=..."
    if (hash.startsWith('#/auth/github/success')) {
      const queryStr = hash.includes('?') ? hash.split('?')[1] : '';
      const params = new URLSearchParams(queryStr);

      const token = params.get('token');
      const ghName = params.get('name') || 'Developer';
      const ghEmail = params.get('email') || '';
      const ghAvatar = params.get('avatar') || '';
      const ghUsername = params.get('github') || '';
      // gh_token is intentionally NOT passed through the redirect URL anymore
      // (security fix: GitHub access token is stored server-side during OAuth callback)

      if (token) {
        setGithubLoading(true);
        window.history.replaceState({}, '', '/');
        localStorage.setItem('idp_jwt', token);
        loginUser(`__oauth__${token}__${ghEmail}__${ghName}__${ghAvatar}__${ghUsername}__`, 'GitHubOAuth')
          .catch(() => setError('GitHub login failed after redirect. Please try again.'))
          .finally(() => setGithubLoading(false));
      }
      return;
    }

    // Error fallback
    const urlParams = new URLSearchParams(window.location.search);
    const githubError = urlParams.get('github_error');
    if (githubError) {
      setError(`GitHub login failed: ${decodeURIComponent(githubError)}`);
      window.history.replaceState({}, '', '/');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── GitHub OAuth — opens GitHub via Vite proxy ────────────────────────────
  const handleGithubLogin = () => {
    if (!isApiAvailable()) {
      // Demo mode — just do a mock login
      loginUser('github-demo@localhost', 'GitHub');
      return;
    }
    // Use Vite proxy path so it works in both dev and prod
    window.location.href = '/auth/github/oauth';
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!email) { setError('Email is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      await loginUser(email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Sign in failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) { setError('Name is required.'); return; }
    if (!email) { setError('Email is required.'); return; }
    if (password.length < 6) { setError('Password must be at least 6 characters.'); return; }
    setLoading(true);
    try {
      if (isApiAvailable()) {
        await api.auth.register(email, password, name.trim());
        await loginUser(email, password);
      } else {
        await loginUser(email, password);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign up failed.';
      if (msg.includes('confirm') || msg.includes('verification') || msg.includes('email')) {
        setError('Account created! Check your email for a confirmation link, then sign in.');
        setMode('signin');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  // Full-screen loading while processing GitHub OAuth callback
  if (githubLoading) {
    return (
      <div className="min-h-screen bg-dark-950 flex flex-col items-center justify-center gap-4">
        <CheckCircle size={40} className="text-emerald-400 animate-pulse" />
        <p className="text-white text-sm font-semibold">Completing GitHub sign-in…</p>
        <p className="text-zinc-500 text-xs">Setting up your workspace</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-dark-950 flex flex-col justify-center items-center px-4 relative overflow-hidden">
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-white/[0.01] rounded-full blur-3xl -z-10" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-white/[0.01] rounded-full blur-3xl -z-10" />

      <div className="w-full max-w-md bg-white/[0.03] border border-white/[0.06] rounded-2xl shadow-2xl p-8 relative">
        {/* Header */}
        <div className="text-center mb-6">
          <div className="mx-auto w-12 h-12 bg-white/5 border border-white/10 rounded-xl flex items-center justify-center text-white mb-3">
            <Terminal size={22} />
          </div>
          <h2 className="text-xl font-semibold text-white tracking-tight">Aether Developer Portal</h2>
          <p className="text-xs text-zinc-400 mt-1">Unified control plane for deployments, incidents, and recovery.</p>
        </div>

        {/* GitHub OAuth button — prominent, at the top */}
        <button
          onClick={handleGithubLogin}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2.5 bg-dark-800 hover:bg-dark-700 border border-white/[0.1] hover:border-white/20 text-zinc-100 py-3 rounded-lg text-sm font-medium transition-all mb-5"
        >
          <Github size={16} />
          Continue with GitHub
        </button>

        {/* Divider */}
        <div className="relative my-5 text-center">
          <hr className="border-white/[0.06]" />
          <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-dark-950 px-3 text-[10px] text-zinc-600 font-semibold tracking-wider uppercase">
            or continue with email
          </span>
        </div>

        {/* Mode tabs */}
        <div className="flex border border-white/[0.06] rounded-lg overflow-hidden mb-5 text-xs font-semibold">
          <button
            onClick={() => { setMode('signin'); setError(''); }}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-all ${mode === 'signin' ? 'bg-white text-black' : 'bg-white/[0.03] text-zinc-400 hover:bg-white/5'}`}
          >
            <LogIn size={12} /> Sign In
          </button>
          <button
            onClick={() => { setMode('signup'); setError(''); }}
            className={`flex-1 py-2 flex items-center justify-center gap-1.5 transition-all ${mode === 'signup' ? 'bg-white text-black' : 'bg-white/[0.03] text-zinc-400 hover:bg-white/5'}`}
          >
            <UserPlus size={12} /> Sign Up
          </button>
        </div>

        {/* Error */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/20 text-red-400 text-xs rounded-lg p-3 mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-red-500 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Sign In form */}
        {mode === 'signin' && (
          <form onSubmit={handleSignIn} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-60 font-medium py-2.5 rounded-md text-xs transition-all">
              {loading ? 'Signing in…' : 'Sign In'}
            </button>
          </form>
        )}

        {/* Sign Up form */}
        {mode === 'signup' && (
          <form onSubmit={handleSignUp} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Full Name</label>
              <div className="relative">
                <UserPlus className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="text" required value={name} onChange={e => setName(e.target.value)}
                  placeholder="Your name"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="email" required value={email} onChange={e => setEmail(e.target.value)}
                  placeholder="you@company.com"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-400 mb-1.5">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-3 text-zinc-600" size={16} />
                <input type="password" required value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="Min 6 characters"
                  className="w-full bg-black/30 border border-white/[0.06] text-zinc-100 placeholder-zinc-600 focus:border-white/20 focus:outline-none rounded-md text-xs font-mono py-2.5 pl-10 pr-4" />
              </div>
            </div>
            <button type="submit" disabled={loading}
              className="w-full bg-white text-black hover:bg-zinc-200 disabled:opacity-60 font-medium py-2.5 rounded-md text-xs transition-all">
              {loading ? 'Creating account…' : 'Create Account'}
            </button>
          </form>
        )}

        <div className="mt-6 text-center text-[10px] text-zinc-600 border-t border-white/[0.06] pt-4 font-mono">
          Security Sandbox Enforced • ISO 27001 Certified
        </div>
      </div>
    </div>
  );
};

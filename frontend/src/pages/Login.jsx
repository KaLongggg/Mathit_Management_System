import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { supabase } from '../lib/supabase.js';
import { useAuth } from '../lib/auth.jsx';
import { Spinner, ErrorBanner } from '../components/ui.jsx';

export default function Login() {
  const { session, loading } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (loading) return null;
  if (session) return <Navigate to="/dashboard" replace />;

  async function onSubmit(e) {
    e.preventDefault();
    setError('');
    setBusy(true);
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error || !data?.session) setError(error?.message || 'Sign in failed.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-dvh lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden overflow-hidden bg-brand-700 lg:block">
        <div
          className="absolute inset-0 opacity-[0.12]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, white 1px, transparent 0)',
            backgroundSize: '22px 22px',
          }}
        />
        <div className="relative flex h-full flex-col justify-between p-12 text-white">
          <div className="flex items-center gap-3">
            <img src="/favicon.png" alt="" className="h-11 w-11 rounded-2xl bg-white/95 p-1.5" />
            <span className="font-display text-lg font-semibold">Mathit Management</span>
          </div>
          <div className="max-w-md">
            <h1 className="font-display text-4xl font-semibold leading-tight">
              Run the academy from one calm console.
            </h1>
            <p className="mt-4 text-brand-100/85">
              Students, courses, enrolments and WhatsApp campaigns — synced from Thinkific,
              managed in one place.
            </p>
          </div>
          <p className="text-sm text-brand-200/70">© Mathit Education Limited</p>
        </div>
      </div>

      {/* Sign-in form */}
      <div className="flex items-center justify-center bg-paper px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex items-center gap-3 lg:hidden">
            <img src="/favicon.png" alt="" className="h-10 w-10 rounded-xl" />
            <span className="font-display text-lg font-semibold">Mathit Management</span>
          </div>

          <h2 className="text-2xl font-semibold">Sign in</h2>
          <p className="mt-1 text-sm text-slate-500">Use your work email and password.</p>

          <form className="mt-7 space-y-4" onSubmit={onSubmit}>
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                className="input"
                autoComplete="username"
                placeholder="you@mathit.hk"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div>
              <label className="label" htmlFor="password">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={showPwd ? 'text' : 'password'}
                  className="input pr-16"
                  autoComplete="current-password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((s) => !s)}
                  className="absolute inset-y-0 right-2 my-auto h-8 rounded-lg px-2 text-sm font-medium text-slate-500 hover:text-slate-700"
                >
                  {showPwd ? 'Hide' : 'Show'}
                </button>
              </div>
            </div>

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? <Spinner /> : 'Sign in'}
            </button>

            <ErrorBanner message={error} />

            <p className="pt-2 text-center text-xs text-slate-400">
              Having trouble? Contact an administrator to reset your access.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}

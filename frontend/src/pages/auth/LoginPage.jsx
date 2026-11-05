import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { HOME_BY_ROLE } from '@/utils/roles';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  async function onSubmit(e) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    try {
      const user = await login(email.trim(), password);
      toast.success(`Welcome, ${user.firstName}`);
      navigate(HOME_BY_ROLE[user.role] || '/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Login failed';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-screen flex-col justify-center bg-gradient-to-br from-brand-700 via-brand-600 to-brand-500 px-6 py-12">
      <div className="mx-auto w-full max-w-md">
        <div className="mb-8 text-center text-white">
          <h1 className="text-3xl font-bold tracking-tight">CodeSmartNG ERMS</h1>
          <p className="mt-2 text-sm text-white/80">Election Results Management System</p>
        </div>

        <form onSubmit={onSubmit} className="card p-6">
          <div className="space-y-4">
            <div>
              <label className="label" htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="input"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="label" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
          </div>

          <button type="submit" disabled={busy} className="btn-primary mt-6 w-full">
            {busy ? 'Signing in…' : 'Sign in'}
          </button>

          <p className="mt-4 text-center text-xs text-slate-500">
            Accounts are provisioned by your administrator.
          </p>
        </form>

        <p className="mt-6 text-center text-xs text-white/60">
          Independent Election Observation · Nigeria
        </p>
      </div>
    </div>
  );
}

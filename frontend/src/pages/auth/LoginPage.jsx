import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useAuth } from '@/context/AuthContext';
import { HOME_BY_ROLE } from '@/utils/roles';
import { ShieldCheck } from 'lucide-react';
import InstallAppButton from '@/components/InstallAppButton';

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
      toast.success(`Welcome back, ${user.firstName}`);
      navigate(HOME_BY_ROLE[user.role] || '/', { replace: true });
    } catch (err) {
      const msg = err.response?.data?.error || err.message || 'Login failed';
      toast.error(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative flex min-h-screen flex-col justify-center bg-slate-900 px-6 py-12 overflow-hidden">
      
      {/* Background Gradient Orbs */}
      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-brand-600/30 blur-[100px]" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-brand-400/20 blur-[100px]" />

      <div className="relative z-10 mx-auto w-full max-w-md animate-slide-up">
        <div className="mb-10 text-center text-white">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 shadow-glow">
            <ShieldCheck className="h-8 w-8 text-brand-400" />
          </div>
          <h1 className="font-display text-4xl font-bold tracking-tight">CodeSmartNG</h1>
          <p className="mt-2 text-sm font-medium text-brand-200/80">Election Results Management System</p>
        </div>

        <form onSubmit={onSubmit} className="rounded-3xl border border-white/10 bg-white/5 p-8 shadow-2xl backdrop-blur-xl">
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="email">Email Address</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 focus:outline-none transition-all"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-300" htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                className="block w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-white placeholder:text-slate-500 focus:border-brand-400 focus:ring-2 focus:ring-brand-400/30 focus:outline-none transition-all"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••••"
              />
            </div>
          </div>

          <button type="submit" disabled={busy} className="mt-8 w-full rounded-xl bg-brand-500 px-4 py-3.5 text-sm font-bold text-white shadow-[0_0_20px_rgba(34,197,94,0.3)] transition-all hover:bg-brand-400 hover:shadow-[0_0_25px_rgba(34,197,94,0.5)] active:scale-95 disabled:opacity-50">
            {busy ? 'Authenticating…' : 'Sign in to Dashboard'}
          </button>

          <div className="mt-4">
            <InstallAppButton className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white backdrop-blur-md transition-all hover:bg-white/10" />
          </div>

          <p className="mt-6 text-center text-xs font-medium text-slate-400">
            Accounts are provisioned by your administrator.
          </p>
        </form>

        <p className="mt-10 text-center text-xs font-medium text-slate-500/60">
          Independent Election Observation · Nigeria
        </p>
      </div>
    </div>
  );
}

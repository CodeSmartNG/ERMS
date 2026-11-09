import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { FileText, AlertTriangle, Upload, LogOut, WifiOff } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { listQueue, QUEUE_STATUS } from '@/services/offlineQueue';
import { startSyncLoop } from '@/services/syncService';
import InstallAppButton from '@/components/InstallAppButton'; // <-- ADDED

export default function AgentHome() {
  const { user, logout } = useAuth();
  const [queue, setQueue] = useState([]);
  const [online, setOnline] = useState(navigator.onLine);

  const refresh = useCallback(async () => {
    const q = await listQueue();
    setQueue(q.sort((a, b) => b.createdAt - a.createdAt));
  }, []);

  useEffect(() => {
    refresh();
    const stop = startSyncLoop(refresh);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      stop?.();
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [refresh]);

  const pending = queue.filter((r) => r.status === QUEUE_STATUS.PENDING).length;
  const failed = queue.filter((r) => r.status === QUEUE_STATUS.FAILED).length;
  const sent = queue.filter((r) => r.status === QUEUE_STATUS.SENT).length;

  return (
    <div className="min-h-screen bg-slate-50 pb-24">
      <header className="sticky top-0 z-10 border-b border-slate-200 bg-white px-5 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs text-slate-500">Polling Unit Agent</p>
            <p className="text-base font-semibold text-slate-900">{user.firstName} {user.lastName}</p>
          </div>
          <button onClick={logout} className="btn-ghost -mr-2 p-2" aria-label="Log out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>
        {!online && (
          <div className="mt-3 flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-800">
            <WifiOff className="h-4 w-4" />
            Offline — submissions will be saved locally and sent when online
          </div>
        )}
      </header>

      <main className="mx-auto max-w-xl space-y-4 px-5 py-6">
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Pending" value={pending} tone="warn" />
          <Stat label="Sent" value={sent} tone="success" />
          <Stat label="Failed" value={failed} tone="danger" />
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ActionCard to="/agent/submit-result" icon={FileText} title="Submit Result" subtitle="Form EC8A + evidence" />
          <ActionCard to="/agent/submit-incident" icon={AlertTriangle} title="Report Incident" subtitle="With photos / video" />
        </div>

        {/* ADDED: Install App Button */}
        <InstallAppButton className="w-full btn-secondary flex items-center justify-center gap-2 py-3" />

        {queue.length > 0 && (
          <Link to="/agent/queue" className="card block p-4 hover:bg-slate-50">
            <div className="flex items-center gap-3">
              <Upload className="h-5 w-5 text-brand-600" />
              <div className="flex-1">
                <p className="text-sm font-medium text-slate-900">View submission queue</p>
                <p className="text-xs text-slate-500">{queue.length} item{queue.length !== 1 ? 's' : ''} in queue</p>
              </div>
              <span className="text-slate-400">›</span>
            </div>
          </Link>
        )}
      </main>
    </div>
  );
}

function Stat({ label, value, tone }) {
  const tones = {
    warn:    'bg-amber-50 text-amber-700',
    success: 'bg-green-50 text-green-700',
    danger:  'bg-red-50 text-red-700',
  };
  return (
    <div className={`rounded-lg p-3 text-center ${tones[tone]}`}>
      <p className="text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-xs font-medium">{label}</p>
    </div>
  );
}

function ActionCard({ to, icon: Icon, title, subtitle }) {
  return (
    <Link to={to} className="card block p-4 hover:border-brand-300 hover:bg-brand-50/30">
      <div className="flex items-start gap-3">
        <div className="rounded-lg bg-brand-100 p-2 text-brand-700">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
        </div>
      </div>
    </Link>
  );
}

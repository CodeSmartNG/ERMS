import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, RefreshCw, Trash2, CheckCircle2, 
  AlertCircle, Clock, Image as ImageIcon, Cloud 
} from 'lucide-react';
import { listQueue, removeFromQueue, QUEUE_STATUS } from '@/services/offlineQueue';
import { flushQueue } from '@/services/syncService';
import api from '@/services/api';

export default function OfflineQueuePage() {
  const navigate = useNavigate();
  const [localItems, setLocalItems] = useState([]);
  const [serverItems, setServerItems] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    // 1. Load local queue
    const local = await listQueue();
    setLocalItems(local.sort((a, b) => b.createdAt - a.createdAt));

    // 2. Load server history (only this agent's results)
    try {
      const res = await api.get('/results', { params: { limit: 20 } });
      setServerItems(res.data.results || []);
    } catch (err) {
      console.error('Failed to fetch server history', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5000); // refresh every 5s
    return () => clearInterval(id);
  }, [refresh]);

  async function onFlush() {
    setRefreshing(true);
    try { await flushQueue(); } finally { await refresh(); setRefreshing(false); }
  }

  async function onDelete(localId) {
    if (!confirm('Delete this queued submission? It will not be sent.')) return;
    await removeFromQueue(localId);
    refresh();
  }

  const pendingCount = localItems.filter(i => i.status === QUEUE_STATUS.PENDING).length;
  const failedCount = localItems.filter(i => i.status === QUEUE_STATUS.FAILED).length;

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-slate-200 bg-white px-5 py-3">
        <button onClick={() => navigate(-1)} className="btn-ghost -ml-2 p-2">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-semibold">My Submissions</h1>
          <p className="text-xs text-slate-500">
            {pendingCount} pending · {failedCount} failed · {serverItems.length} sent
          </p>
        </div>
        <button 
          onClick={onFlush} 
          disabled={refreshing} 
          className="btn-ghost p-2" 
          aria-label="Retry all"
        >
          <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </header>

      <main className="mx-auto max-w-xl space-y-5 px-5 py-6">
        
        {/* Local Queue Section */}
        {localItems.length > 0 && (
          <div className="space-y-2">
            <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
              On this device
            </h2>
            {localItems.map((r) => (
              <QueueCard key={r.localId} record={r} onDelete={onDelete} />
            ))}
          </div>
        )}

        {/* Server History Section */}
        <div className="space-y-2">
          <h2 className="px-1 text-xs font-bold uppercase tracking-wider text-slate-500">
            Sent to server
          </h2>
          
          {loading ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              Loading history…
            </div>
          ) : serverItems.length === 0 ? (
            <div className="card p-8 text-center text-sm text-slate-500">
              {localItems.length === 0 
                ? 'Queue is empty. All submissions have been sent.'
                : 'No submissions sent to server yet.'}
            </div>
          ) : (
            serverItems.map((r) => <ServerResultCard key={r._id} result={r} />)
          )}
        </div>
      </main>
    </div>
  );
}

function QueueCard({ record, onDelete }) {
  const cfg = {
    [QUEUE_STATUS.PENDING]:  { icon: Clock,          tone: 'text-amber-600',  bg: 'bg-amber-50',   label: 'Pending' },
    [QUEUE_STATUS.SENDING]:  { icon: RefreshCw,      tone: 'text-blue-600',   bg: 'bg-blue-50',    label: 'Sending' },
    [QUEUE_STATUS.SENT]:     { icon: CheckCircle2,   tone: 'text-green-600',  bg: 'bg-green-50',   label: 'Sent' },
    [QUEUE_STATUS.FAILED]:   { icon: AlertCircle,    tone: 'text-red-600',    bg: 'bg-red-50',     label: 'Failed' },
  }[record.status] || { icon: Clock, tone: 'text-slate-500', bg: 'bg-slate-50', label: record.status };

  const Icon = cfg.icon;
  const kindLabel = record.kind === 'result' ? 'Result' : 'Incident';
  const fileCount = record.evidenceFiles?.length || (record.evidenceBlob ? 1 : 0);

  return (
    <div className={`card p-4 ${record.status === QUEUE_STATUS.SENDING ? 'border-blue-200' : ''}`}>
      <div className="flex items-start gap-3">
        <div className={`rounded-lg p-2 ${cfg.bg}`}>
          <Icon className={`h-5 w-5 ${cfg.tone} ${record.status === QUEUE_STATUS.SENDING ? 'animate-spin' : ''}`} />
        </div>
        
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">{kindLabel}</p>
            <span className={`text-xs font-medium ${cfg.tone}`}>{cfg.label}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(record.createdAt).toLocaleString()}
            {record.attempts > 0 && ` · ${record.attempts} attempt${record.attempts !== 1 ? 's' : ''}`}
          </p>
          {fileCount > 0 && (
            <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
              <ImageIcon className="h-3 w-3" /> {fileCount} photo{fileCount !== 1 ? 's' : ''}
            </p>
          )}
          {record.lastError && (
            <p className="mt-2 rounded bg-red-50 px-2 py-1 text-xs text-red-700">
              {record.lastError}
            </p>
          )}
        </div>
        
        {record.status !== QUEUE_STATUS.SENDING && (
          <button 
            onClick={() => onDelete(record.localId)} 
            className="btn-ghost -mr-2 p-2 text-slate-400 hover:text-red-600"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function ServerResultCard({ result }) {
  const statusColor = {
    VERIFIED: 'text-green-600',
    FLAGGED:  'text-amber-600',
    REJECTED: 'text-red-600',
    SUBMITTED: 'text-blue-600',
  }[result.status] || 'text-slate-500';

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="rounded-lg p-2 bg-slate-100">
          <Cloud className="h-5 w-5 text-slate-600" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-semibold text-slate-900">Result</p>
            <span className={`text-xs font-bold ${statusColor}`}>{result.status}</span>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {new Date(result.submittedAt).toLocaleString()}
          </p>
          <p className="mt-1 font-mono text-xs text-slate-500">
            PU: {result.puCode}
          </p>
          {result.totalVotesCast != null && (
            <p className="mt-1 text-xs text-slate-500">
              {result.totalVotesCast.toLocaleString()} votes cast
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

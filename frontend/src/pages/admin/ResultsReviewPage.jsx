import { useMemo, useState } from 'react';
import { RefreshCw, CheckCircle2, AlertTriangle, XCircle, Search } from 'lucide-react';
import { toast } from 'sonner';
import { useApi } from '@/hooks/useApi';
import { resultsApi } from '@/services/api';
import { resolve } from '@/utils/confirm';

const STATUS_BADGES = {
  SUBMITTED: 'badge-warning',
  VERIFIED:  'badge-success',
  FLAGGED:   'badge-danger',
  REJECTED:  'badge-neutral',
  SUPERSEDED:'badge-neutral',
};

const FILTERS = [
  { key: 'SUBMITTED', label: 'Pending review' },
  { key: 'VERIFIED',  label: 'Verified' },
  { key: 'FLAGGED',   label: 'Flagged' },
  { key: 'REJECTED',  label: 'Rejected' },
];

export default function ResultsReviewPage() {
  const [status, setStatus] = useState('SUBMITTED');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);

  const listApi = useApi(
    () => resultsApi.list({ status, limit: 100 }).then((r) => r.data),
    [status],
    { pollMs: 15000, initial: { results: [], pagination: {} } }
  );

  const items = useMemo(() => {
    const all = listApi.data?.results || [];
    if (!query.trim()) return all;
    const q = query.toLowerCase();
    return all.filter((r) =>
      r.puCode?.toLowerCase().includes(q) ||
      r.pollingUnit?.name?.toLowerCase().includes(q)
    );
  }, [listApi.data, query]);

  async function handleVerify(r) {
    if (!(await resolve('Mark this result as VERIFIED?', { confirmText: 'Verify' }))) return;
    setBusyId(r._id);
    try {
      await resultsApi.verify(r._id);
      toast.success(`Result ${r.puCode} verified`);
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to verify');
    } finally { setBusyId(null); }
  }

  async function handleFlag(r) {
    const reason = prompt('Reason for flagging:');
    if (!reason || reason.length < 5) return;
    setBusyId(r._id);
    try {
      await resultsApi.flag(r._id, reason);
      toast.success('Result flagged');
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to flag');
    } finally { setBusyId(null); }
  }

  async function handleReject(r) {
    const reason = prompt('Reason for rejection:');
    if (!reason || reason.length < 5) return;
    setBusyId(r._id);
    try {
      await resultsApi.reject(r._id, reason);
      toast.success('Result rejected');
      listApi.refetch();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reject');
    } finally { setBusyId(null); }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Results</h1>
          <p className="mt-1 text-sm text-slate-500">
            {listApi.data?.pagination?.total ?? 0} result{(listApi.data?.pagination?.total ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="input pl-9"
              placeholder="Search by PU code or name"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <button
            onClick={() => listApi.refetch()}
            className="btn-secondary p-2.5"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${listApi.loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Status filter pills */}
      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setStatus(f.key)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              status === f.key
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {listApi.error && <div className="card p-4 text-sm text-red-600">{listApi.error}</div>}

      {items.length === 0 ? (
        <div className="card p-12 text-center text-sm text-slate-500">
          {listApi.loading ? 'Loading…' : 'No results in this category'}
        </div>
      ) : (
        <div className="space-y-3">
          {items.map((r) => (
            <ResultRow
              key={r._id}
              result={r}
              busy={busyId === r._id}
              onVerify={handleVerify}
              onFlag={handleFlag}
              onReject={handleReject}
              showActions={status === 'SUBMITTED' || status === 'VERIFIED'}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ResultRow({ result, busy, onVerify, onFlag, onReject, showActions }) {
  const top = [...(result.partyVotes || [])].sort((a, b) => b.votes - a.votes)[0];

  return (
    <div className="card p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-slate-900">{result.puCode}</span>
            <span className={STATUS_BADGES[result.status] || 'badge-neutral'}>{result.status}</span>
            {result.version > 1 && (
              <span className="badge-neutral">v{result.version}</span>
            )}
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {result.pollingUnit?.name || 'Polling unit'}
            {' · '}
            {new Date(result.submittedAt).toLocaleString()}
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-600">
            <span><strong className="text-slate-900">{result.accreditedVoters.toLocaleString()}</strong> accredited</span>
            <span><strong className="text-slate-900">{result.totalVotesCast.toLocaleString()}</strong> cast</span>
            <span><strong className="text-slate-900">{result.totalValidVotes.toLocaleString()}</strong> valid</span>
            {top && (
              <span>Leading: <strong className="text-brand-700">{top.partyCode} ({top.votes.toLocaleString()})</strong></span>
            )}
          </div>
        </div>

        {showActions && (
          <div className="flex shrink-0 gap-2">
            {result.status === 'SUBMITTED' && (
              <button onClick={() => onVerify(result)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Verify
              </button>
            )}
            {result.status !== 'REJECTED' && (
              <>
                <button onClick={() => onFlag(result)} disabled={busy} className="btn-secondary px-3 py-1.5 text-xs">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Flag
                </button>
                <button onClick={() => onReject(result)} disabled={busy} className="btn-danger px-3 py-1.5 text-xs">
                  <XCircle className="h-3.5 w-3.5" />
                  Reject
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

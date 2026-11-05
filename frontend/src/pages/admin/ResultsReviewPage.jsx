import { useMemo, useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  RefreshCw, CheckCircle2, AlertTriangle, XCircle,
  Search, X, Eye, Image as ImageIcon,
} from 'lucide-react';
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
  { key: 'ALL',       label: 'All' },
  { key: 'SUBMITTED', label: 'Pending review' },
  { key: 'VERIFIED',  label: 'Verified' },
  { key: 'FLAGGED',   label: 'Flagged' },
  { key: 'REJECTED',  label: 'Rejected' },
];

export default function ResultsReviewPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const puCodeParam = (searchParams.get('puCode') || '').toUpperCase();
  const electionParam = searchParams.get('election') || '';

  // Default filter: ALL when viewing a specific PU (so the drill-down always
  // shows the result regardless of status), SUBMITTED otherwise.
  const [status, setStatus] = useState(puCodeParam ? 'ALL' : 'SUBMITTED');
  const [query, setQuery] = useState('');
  const [busyId, setBusyId] = useState(null);
  const [detailId, setDetailId] = useState(null);

  // Sync state when URL params change (navigating between PU drill-downs)
  useEffect(() => {
    if (puCodeParam) {
      setStatus('ALL');
      setQuery('');
    } else {
      setStatus('SUBMITTED');
      setQuery('');
    }
  }, [puCodeParam]);

  const listApi = useApi(
    () => resultsApi.list({
      status: status === 'ALL' ? undefined : status,
      election: electionParam || undefined,
      puCode: puCodeParam || undefined, // backend should filter by this if supported
      limit: 100,
    }).then((r) => r.data),
    [status, puCodeParam, electionParam],
    { pollMs: 15000, initial: { results: [], pagination: {} } }
  );

  // Client-side filtering: defensive PU filter + search overlay
  const items = useMemo(() => {
    const all = listApi.data?.results || [];
    const puFiltered = puCodeParam
      ? all.filter((r) => r.puCode?.toUpperCase() === puCodeParam)
      : all;
    if (!query.trim()) return puFiltered;
    const q = query.toLowerCase();
    return puFiltered.filter((r) =>
      r.puCode?.toLowerCase().includes(q) ||
      r.pollingUnit?.name?.toLowerCase().includes(q)
    );
  }, [listApi.data, query, puCodeParam]);

  function clearPuFilter() {
    const next = new URLSearchParams(searchParams);
    next.delete('puCode');
    setSearchParams(next);
  }

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

  const emptyMessage =
    listApi.loading ? 'Loading…'
    : puCodeParam ? `No current result for polling unit ${puCodeParam}`
    : query ? `No results match "${query}"`
    : 'No results in this category';

  return (
    <div className="mx-auto max-w-7xl space-y-4 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Results</h1>
          <p className="mt-1 text-sm text-slate-500">
            {listApi.data?.pagination?.total ?? 0} result
            {(listApi.data?.pagination?.total ?? 0) !== 1 ? 's' : ''}
            {puCodeParam && (
              <> · <span className="font-mono">{puCodeParam}</span></>
            )}
          </p>
        </div>
        <div className="flex gap-2">
          {puCodeParam ? (
            <div className="flex items-center gap-2 rounded-lg border border-brand-200 bg-brand-50 px-3 py-2">
              <span className="text-xs font-medium text-brand-700">PU:</span>
              <span className="font-mono text-sm font-semibold text-brand-900">{puCodeParam}</span>
              <button
                onClick={clearPuFilter}
                className="rounded p-0.5 text-brand-600 hover:bg-brand-100"
                aria-label="Clear PU filter"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="input pl-9"
                placeholder="Search by PU code or name"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          )}
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

      {listApi.error && (
        <div className="card p-4 text-sm text-red-600">{listApi.error}</div>
      )}

      {items.length === 0 ? (
        <div className="card p-12 text-center text-sm text-slate-500">{emptyMessage}</div>
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
              onOpenDetail={() => setDetailId(r._id)}
            />
          ))}
        </div>
      )}

      {detailId && (
        <ResultDetailModal
          resultId={detailId}
          onClose={() => setDetailId(null)}
          onAction={(action, r) => {
            setDetailId(null);
            if (action === 'verify') handleVerify(r);
            else if (action === 'flag') handleFlag(r);
            else if (action === 'reject') handleReject(r);
          }}
        />
      )}
    </div>
  );
}

function ResultRow({ result, busy, onVerify, onFlag, onReject, onOpenDetail }) {
  const top = [...(result.partyVotes || [])].sort((a, b) => b.votes - a.votes)[0];
  const terminal = ['REJECTED', 'SUPERSEDED'].includes(result.status);

  return (
    <div
      onClick={onOpenDetail}
      className="card cursor-pointer p-4 transition-colors hover:border-brand-300 hover:bg-brand-50/20"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onOpenDetail(); }}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm font-semibold text-slate-900">{result.puCode}</span>
            <span className={STATUS_BADGES[result.status] || 'badge-neutral'}>{result.status}</span>
            {result.version > 1 && <span className="badge-neutral">v{result.version}</span>}
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
              <span>
                Leading: <strong className="text-brand-700">{top.partyCode} ({top.votes.toLocaleString()})</strong>
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-start gap-2" onClick={(e) => e.stopPropagation()}>
          {result.status === 'SUBMITTED' && (
            <button onClick={() => onVerify(result)} disabled={busy} className="btn-primary px-3 py-1.5 text-xs">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Verify
            </button>
          )}
          {!terminal && (
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
          <button onClick={onOpenDetail} className="btn-ghost p-1.5 text-slate-400" aria-label="View details">
            <Eye className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function ResultDetailModal({ resultId, onClose, onAction }) {
  const detailApi = useApi(
    () => resultsApi.get(resultId).then((r) => r.data.result),
    [resultId]
  );
  const result = detailApi.data;

  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/50" onClick={onClose} />
      <div className="absolute inset-x-0 bottom-0 top-12 overflow-y-auto rounded-t-2xl bg-white shadow-2xl sm:inset-y-6 sm:left-1/2 sm:right-auto sm:w-full sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <div>
            <p className="text-xs text-slate-500">Result details</p>
            <h2 className="font-mono text-base font-semibold">{result?.puCode || 'Loading…'}</h2>
          </div>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-5 p-5">
          {detailApi.loading && !result && (
            <p className="text-center text-sm text-slate-500">Loading…</p>
          )}

          {result && (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <span className={STATUS_BADGES[result.status] || 'badge-neutral'}>{result.status}</span>
                {result.version > 1 && <span className="badge-neutral">Version {result.version}</span>}
                {result.isCurrent === false && <span className="badge-neutral">Superseded</span>}
              </div>

              <div>
                <p className="text-sm font-semibold text-slate-900">
                  {result.pollingUnit?.name || 'Polling unit'}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {result.pollingUnit?.code || result.puCode}
                  {result.path?.length > 0 && ` · ${result.path.slice(0, 3).join(' / ')}`}
                </p>
              </div>

              {result.evidence?.photoUrl && (
                <div>
                  <p className="mb-2 flex items-center gap-2 text-xs font-medium text-slate-600">
                    <ImageIcon className="h-3.5 w-3.5" />
                    Form EC8A evidence
                  </p>
                  <a
                    href={result.evidence.photoUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block overflow-hidden rounded-lg border border-slate-200"
                  >
                    <img
                      src={result.evidence.photoUrl}
                      alt="Evidence"
                      className="max-h-96 w-full bg-slate-50 object-contain"
                    />
                  </a>
                  {result.evidence.photoHash && (
                    <p className="mt-1 truncate font-mono text-[10px] text-slate-400">
                      SHA-256: {result.evidence.photoHash}
                    </p>
                  )}
                </div>
              )}

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Registered" value={result.registeredVoters?.toLocaleString()} />
                <Stat label="Accredited" value={result.accreditedVoters?.toLocaleString()} />
                <Stat label="Votes cast" value={result.totalVotesCast?.toLocaleString()} />
                <Stat label="Rejected" value={result.rejectedBallots?.toLocaleString() ?? '0'} />
              </div>

              <div>
                <p className="mb-2 text-xs font-medium text-slate-600">Party votes</p>
                <div className="overflow-hidden rounded-lg border border-slate-200">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                      <tr>
                        <th className="px-3 py-2 text-left font-medium">Party</th>
                        <th className="px-3 py-2 text-right font-medium">Votes</th>
                        <th className="px-3 py-2 text-right font-medium">%</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {[...(result.partyVotes || [])]
                        .sort((a, b) => b.votes - a.votes)
                        .map((p) => {
                          const pct = result.totalValidVotes > 0
                            ? (p.votes / result.totalValidVotes) * 100
                            : 0;
                          return (
                            <tr key={p.partyCode}>
                              <td className="px-3 py-2 font-medium text-slate-900">{p.partyCode}</td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-700">
                                {p.votes.toLocaleString()}
                              </td>
                              <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                                {pct.toFixed(1)}%
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                    <tfoot className="bg-slate-50 text-xs font-semibold">
                      <tr>
                        <td className="px-3 py-2 text-slate-700">Total valid</td>
                        <td className="px-3 py-2 text-right tabular-nums text-slate-900">
                          {result.totalValidVotes?.toLocaleString()}
                        </td>
                        <td className="px-3 py-2 text-right text-slate-500">100%</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              </div>

              <div className="space-y-1 text-xs text-slate-500">
                <p>
                  <span className="font-medium text-slate-600">Submitted</span>{' '}
                  {new Date(result.submittedAt).toLocaleString()}
                  {result.submittedBy?.firstName && (
                    <> by {result.submittedBy.firstName} {result.submittedBy.lastName}</>
                  )}
                </p>
                {result.verifiedAt && (
                  <p>
                    <span className="font-medium text-slate-600">Verified</span>{' '}
                    {new Date(result.verifiedAt).toLocaleString()}
                    {result.verifiedBy?.firstName && (
                      <> by {result.verifiedBy.firstName} {result.verifiedBy.lastName}</>
                    )}
                  </p>
                )}
                {result.flagReason && (
                  <p className="rounded bg-amber-50 p-2 text-amber-800">
                    <span className="font-medium">Flag reason:</span> {result.flagReason}
                  </p>
                )}
                {result.rejectReason && (
                  <p className="rounded bg-red-50 p-2 text-red-800">
                    <span className="font-medium">Rejection reason:</span> {result.rejectReason}
                  </p>
                )}
                <p className="truncate pt-2 font-mono text-[10px] text-slate-400">
                  hash: {result.hash?.slice(0, 32)}…
                </p>
              </div>

              {!['REJECTED', 'SUPERSEDED'].includes(result.status) && (
                <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-4">
                  {result.status === 'SUBMITTED' && (
                    <button onClick={() => onAction('verify', result)} className="btn-primary">
                      <CheckCircle2 className="h-4 w-4" />
                      Verify
                    </button>
                  )}
                  <button onClick={() => onAction('flag', result)} className="btn-secondary">
                    <AlertTriangle className="h-4 w-4" />
                    Flag
                  </button>
                  <button onClick={() => onAction('reject', result)} className="btn-danger">
                    <XCircle className="h-4 w-4" />
                    Reject
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 text-center">
      <p className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">{value ?? '—'}</p>
    </div>
  );
}

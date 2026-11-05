import { useEffect, useMemo } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, RefreshCw } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import api, { collationApi } from '@/services/api';
import PartyBar from '@/components/PartyBar';
import ReportingRing from '@/components/ReportingRing';

const STATUS_BADGE = {
  SUBMITTED: 'badge-warning',
  VERIFIED: 'badge-success',
  FLAGGED: 'badge-danger',
  REJECTED: 'badge-neutral',
  SUPERSEDED: 'badge-neutral',
};

export default function DashboardWard() {
  const { code } = useParams();
  const wardCode = code?.toUpperCase();
  const [searchParams, setSearchParams] = useSearchParams();
  const electionId = searchParams.get('election') || '';

  const electionsApi = useApi(
    () => api.get('/elections', { params: { status: 'ACTIVE' } }).then((r) => r.data.elections),
    [],
    { initial: [] }
  );
  const elections = electionsApi.data || [];

  useEffect(() => {
    if (!electionId && elections.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('election', elections[0]._id);
      setSearchParams(next, { replace: true });
    }
  }, [electionId, elections, searchParams, setSearchParams]);

  const wardApi = useApi(
    () =>
      electionId && wardCode
        ? collationApi.ward(electionId, wardCode).then((r) => r.data)
        : Promise.resolve(null),
    [electionId, wardCode],
    { pollMs: 10000 }
  );

  const data = wardApi.data;
  const loading = wardApi.loading;

  // Sum all PU rows for a "raw votes reported" total (includes SUBMITTED, not
  // just VERIFIED). This differs from the collation's totalValidVotes which
  // only counts verified results — the difference is a useful signal here.
  const puSummary = useMemo(() => {
    if (!data?.results?.length) return null;
    const rows = data.results;
    return {
      total: rows.length,
      submitted: rows.filter((r) => r.status === 'SUBMITTED').length,
      verified: rows.filter((r) => r.status === 'VERIFIED').length,
      flagged: rows.filter((r) => r.status === 'FLAGGED').length,
      rejected: rows.filter((r) => r.status === 'REJECTED').length,
    };
  }, [data]);

  if (!wardCode) {
    return <div className="p-6 text-sm text-red-600">Missing ward code in URL</div>;
  }

  const lgaCode = data?.ward?.lgaCode;
  const stateCode = data?.ward?.stateCode;
  const stateName = data?.ward?.stateName || stateCode || 'State';
  const lgaName = data?.ward?.lgaName || lgaCode || 'LGA';

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Breadcrumb */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link to={`/admin/dashboard?election=${electionId}`} className="text-brand-600 hover:underline">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        {stateCode ? (
          <Link
            to={`/admin/dashboard/state/${stateCode}?election=${electionId}`}
            className="text-brand-600 hover:underline"
          >
            {stateName}
          </Link>
        ) : (
          <span className="text-slate-500">{stateName}</span>
        )}
        <ChevronRight className="h-4 w-4 text-slate-400" />
        {lgaCode ? (
          <Link
            to={`/admin/dashboard/lga/${lgaCode}?election=${electionId}`}
            className="text-brand-600 hover:underline"
          >
            {lgaName}
          </Link>
        ) : (
          <span className="text-slate-500">{lgaName}</span>
        )}
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="font-medium text-slate-900">
          {data?.ward?.wardName || data?.ward?.entityName || wardCode}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {data?.ward?.wardName || data?.ward?.entityName || wardCode}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{lgaName} · {stateName} · Ward overview</p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input max-w-xs"
            value={electionId}
            onChange={(e) => {
              const next = new URLSearchParams(searchParams);
              next.set('election', e.target.value);
              setSearchParams(next);
            }}
          >
            {elections.map((el) => (
              <option key={el._id} value={el._id}>{el.title}</option>
            ))}
          </select>
          <button onClick={() => wardApi.refetch()} className="btn-secondary p-2.5" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="card p-12 text-center text-slate-500">Loading…</div>
      )}
      {!loading && !data && (
        <div className="card p-12 text-center text-slate-500">
          No collation data yet for this ward.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="PUs verified"
              value={`${data.ward.pollingUnitsVerified.toLocaleString()} / ${data.ward.pollingUnitsTotal.toLocaleString()}`}
            />
            <SummaryCard label="Accredited voters" value={data.ward.accreditedVoters.toLocaleString()} />
            <SummaryCard label="Total votes" value={data.ward.totalVotesCast.toLocaleString()} />
            <div className="card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Reporting</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {data.ward.reportingPercentage.toFixed(1)}%
                </p>
              </div>
              <ReportingRing pct={data.ward.reportingPercentage} />
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">Party leaderboard</h2>
              <span className="text-xs text-slate-500">
                {data.ward.totalValidVotes.toLocaleString()} valid votes
              </span>
            </div>
            <div className="card-body space-y-4">
              {data.ward.partyTotals.length === 0 ? (
                <p className="text-sm text-slate-500">No verified votes yet</p>
              ) : (
                data.ward.partyTotals.map((p, i) => (
                  <div key={p.partyCode} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                    <div className="flex-1">
                      <PartyBar
                        partyCode={p.partyCode}
                        votes={p.votes}
                        totalVotes={data.ward.totalValidVotes}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Polling unit results — the raw rows */}
          <div className="card overflow-hidden">
            <div className="card-header">
              <div>
                <h2 className="text-base font-semibold">Polling units</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  {data.results?.length || 0} submitted
                  {puSummary && (
                    <>
                      {' · '}
                      <span className="text-amber-600">{puSummary.submitted} pending</span>
                      {' · '}
                      <span className="text-green-600">{puSummary.verified} verified</span>
                      {puSummary.flagged > 0 && (
                        <>
                          {' · '}
                          <span className="text-red-600">{puSummary.flagged} flagged</span>
                        </>
                      )}
                    </>
                  )}
                </p>
              </div>
            </div>
            {!data.results?.length ? (
              <div className="p-8 text-center text-sm text-slate-500">
                No polling unit results submitted yet
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Polling unit</th>
                      <th className="px-4 py-3 text-left font-medium">Status</th>
                      <th className="px-4 py-3 text-right font-medium">Accredited</th>
                      <th className="px-4 py-3 text-right font-medium">Votes</th>
                      <th className="px-4 py-3 text-left font-medium">Leading</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.results.map((r) => {
                      const top = [...(r.partyVotes || [])].sort((a, b) => b.votes - a.votes)[0];
                      return (
                        <tr key={r._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3">
                            <div className="font-medium text-slate-900">
                              {r.pollingUnit?.name || r.puCode}
                            </div>
                            <div className="text-xs text-slate-500">{r.puCode}</div>
                          </td>
                          <td className="px-4 py-3">
                            <span className={STATUS_BADGE[r.status] || 'badge-neutral'}>
                              {r.status}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {r.accreditedVoters.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {r.totalValidVotes.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {top ? (
                              <span className="font-semibold text-brand-700">
                                {top.partyCode} ({top.votes.toLocaleString()})
                              </span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/admin/results?puCode=${r.puCode}&election=${electionId}`}
                              className="text-slate-400 hover:text-brand-600"
                            >
                              <ChevronRight className="h-4 w-4" />
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-lg font-bold tabular-nums text-slate-900">{value}</p>
    </div>
  );
}

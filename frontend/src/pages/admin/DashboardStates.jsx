import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import api, { collationApi } from '@/services/api';
import PartyBar from '@/components/PartyBar';
import ReportingRing from '@/components/ReportingRing';

export default function DashboardState() {
  const { code } = useParams();
  const stateCode = code?.toUpperCase();
  const [searchParams, setSearchParams] = useSearchParams();
  const electionId = searchParams.get('election') || '';

  // Election picker
  const electionsApi = useApi(
    () => api.get('/elections', { params: { status: 'ACTIVE' } }).then((r) => r.data.elections),
    [],
    { initial: [] }
  );
  const elections = electionsApi.data || [];

  // Auto-pick first election if none in URL
  useEffect(() => {
    if (!electionId && elections.length > 0) {
      const next = new URLSearchParams(searchParams);
      next.set('election', elections[0]._id);
      setSearchParams(next, { replace: true });
    }
  }, [electionId, elections, searchParams, setSearchParams]);

  const stateApi = useApi(
    () =>
      electionId && stateCode
        ? collationApi.state(electionId, stateCode).then((r) => r.data)
        : Promise.resolve(null),
    [electionId, stateCode],
    { pollMs: 10000 }
  );

  const data = stateApi.data;
  const loading = stateApi.loading;

  if (!stateCode) {
    return <div className="p-6 text-sm text-red-600">Missing state code in URL</div>;
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm">
        <Link to={`/admin/dashboard?election=${electionId}`} className="text-brand-600 hover:underline">
          Dashboard
        </Link>
        <ChevronRight className="h-4 w-4 text-slate-400" />
        <span className="font-medium text-slate-900">{data?.state?.entityName || stateCode}</span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {data?.state?.entityName || stateCode}
          </h1>
          <p className="mt-1 text-sm text-slate-500">State overview</p>
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
          <button onClick={() => stateApi.refetch()} className="btn-secondary p-2.5" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="card p-12 text-center text-slate-500">Loading…</div>
      )}
      {!loading && !data && (
        <div className="card p-12 text-center text-slate-500">
          No collation data yet for this state.
        </div>
      )}

      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="PUs verified"
              value={`${data.state.pollingUnitsVerified.toLocaleString()} / ${data.state.pollingUnitsTotal.toLocaleString()}`}
            />
            <SummaryCard label="Accredited voters" value={data.state.accreditedVoters.toLocaleString()} />
            <SummaryCard label="Total votes" value={data.state.totalVotesCast.toLocaleString()} />
            <div className="card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Reporting</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {data.state.reportingPercentage.toFixed(1)}%
                </p>
              </div>
              <ReportingRing pct={data.state.reportingPercentage} />
            </div>
          </div>

          {/* Data quality */}
          {data.state.dataIssues?.length > 0 && (
            <div className="card border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Data quality warnings</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                    {data.state.dataIssues.map((issue) => (
                      <li key={issue}>{issue.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {/* Party leaderboard */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">Party leaderboard</h2>
              <span className="text-xs text-slate-500">
                {data.state.totalValidVotes.toLocaleString()} valid votes
              </span>
            </div>
            <div className="card-body space-y-4">
              {data.state.partyTotals.length === 0 ? (
                <p className="text-sm text-slate-500">No verified votes yet</p>
              ) : (
                data.state.partyTotals.map((p, i) => (
                  <div key={p.partyCode} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                    <div className="flex-1">
                      <PartyBar
                        partyCode={p.partyCode}
                        votes={p.votes}
                        totalVotes={data.state.totalValidVotes}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* LGAs table */}
          {data.lgas?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="text-base font-semibold">LGAs</h2>
                <span className="text-xs text-slate-500">{data.lgas.length} reporting</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">LGA</th>
                      <th className="px-4 py-3 text-right font-medium">PUs</th>
                      <th className="px-4 py-3 text-right font-medium">Votes</th>
                      <th className="px-4 py-3 text-left font-medium">Leading</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.lgas.map((l) => {
                      const top = l.leadingParty?.partyCode ? l.leadingParty : l.partyTotals[0];
                      return (
                        <tr key={l._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {l.lgaName || l.entityName || l.lgaCode}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {l.pollingUnitsVerified}/{l.pollingUnitsTotal}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {l.totalValidVotes.toLocaleString()}
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
                              to={`/admin/dashboard/lga/${l.lgaCode}?election=${electionId}`}
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
            </div>
          )}
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

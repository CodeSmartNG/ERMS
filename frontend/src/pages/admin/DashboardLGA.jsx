import { useEffect } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ChevronRight, MapPin, RefreshCw, AlertTriangle } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import api, { collationApi } from '@/services/api';
import PartyBar from '@/components/PartyBar';
import ReportingRing from '@/components/ReportingRing';

export default function DashboardLGA() {
  const { code } = useParams();
  const lgaCode = code?.toUpperCase();
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

  const lgaApi = useApi(
    () =>
      electionId && lgaCode
        ? collationApi.lga(electionId, lgaCode).then((r) => r.data)
        : Promise.resolve(null),
    [electionId, lgaCode],
    { pollMs: 10000 }
  );

  const data = lgaApi.data;
  const loading = lgaApi.loading;

  if (!lgaCode) {
    return <div className="p-6 text-sm text-red-600">Missing LGA code in URL</div>;
  }

  const stateCode = data?.lga?.stateCode;
  const stateName = data?.lga?.stateName || stateCode || 'State';

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
        <span className="font-medium text-slate-900">
          {data?.lga?.lgaName || data?.lga?.entityName || lgaCode}
        </span>
      </div>

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            {data?.lga?.lgaName || data?.lga?.entityName || lgaCode}
          </h1>
          <p className="mt-1 text-sm text-slate-500">{stateName} · LGA overview</p>
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
          <button onClick={() => lgaApi.refetch()} className="btn-secondary p-2.5" aria-label="Refresh">
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading && !data && (
        <div className="card p-12 text-center text-slate-500">Loading…</div>
      )}
      {!loading && !data && (
        <div className="card p-12 text-center text-slate-500">
          No collation data yet for this LGA.
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard
              label="PUs verified"
              value={`${data.lga.pollingUnitsVerified.toLocaleString()} / ${data.lga.pollingUnitsTotal.toLocaleString()}`}
            />
            <SummaryCard label="Accredited voters" value={data.lga.accreditedVoters.toLocaleString()} />
            <SummaryCard label="Total votes" value={data.lga.totalVotesCast.toLocaleString()} />
            <div className="card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Reporting</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {data.lga.reportingPercentage.toFixed(1)}%
                </p>
              </div>
              <ReportingRing pct={data.lga.reportingPercentage} />
            </div>
          </div>

          {data.lga.dataIssues?.length > 0 && (
            <div className="card border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                <div>
                  <p className="text-sm font-medium text-amber-800">Data quality warnings</p>
                  <ul className="mt-1 list-disc pl-5 text-xs text-amber-700">
                    {data.lga.dataIssues.map((issue) => (
                      <li key={issue}>{issue.replace(/_/g, ' ')}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">Party leaderboard</h2>
              <span className="text-xs text-slate-500">
                {data.lga.totalValidVotes.toLocaleString()} valid votes
              </span>
            </div>
            <div className="card-body space-y-4">
              {data.lga.partyTotals.length === 0 ? (
                <p className="text-sm text-slate-500">No verified votes yet</p>
              ) : (
                data.lga.partyTotals.map((p, i) => (
                  <div key={p.partyCode} className="flex items-center gap-3">
                    <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                    <div className="flex-1">
                      <PartyBar
                        partyCode={p.partyCode}
                        votes={p.votes}
                        totalVotes={data.lga.totalValidVotes}
                      />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {data.wards?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="text-base font-semibold">Wards</h2>
                <span className="text-xs text-slate-500">{data.wards.length} reporting</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">Ward</th>
                      <th className="px-4 py-3 text-right font-medium">PUs</th>
                      <th className="px-4 py-3 text-right font-medium">Votes</th>
                      <th className="px-4 py-3 text-left font-medium">Leading</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {data.wards.map((w) => {
                      const top = w.leadingParty?.partyCode ? w.leadingParty : w.partyTotals[0];
                      return (
                        <tr key={w._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {w.wardName || w.entityName || w.wardCode}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {w.pollingUnitsVerified}/{w.pollingUnitsTotal}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {w.totalValidVotes.toLocaleString()}
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
                              to={`/admin/dashboard/ward/${w.wardCode}?election=${electionId}`}
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

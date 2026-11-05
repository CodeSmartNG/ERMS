import { useAuth } from '@/context/AuthContext';

import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronRight, RefreshCw, MapPin } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { collationApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';
import { ROLES } from '@/utils/roles';
import PartyBar from '@/components/PartyBar';
import ReportingRing from '@/components/ReportingRing';

export default function AdminDashboard() {
  const { user } = useAuth();
  const [electionId, setElectionId] = useState('');

  // Load elections once
  const electionsApi = useApi(
    () => import('@/services/api').then(({ default: api }) => api.get('/elections', { params: { status: 'ACTIVE' } }).then((r) => r.data.elections)),
    [],
    { initial: [] }
  );

  const elections = electionsApi.data || [];

  // Auto-pick the first active election
  if (!electionId && elections.length > 0) setElectionId(elections[0]._id);

  // ---- fetch national collation (or scoped level based on role) ----
  const nationalApi = useApi(
    () => electionId ? collationApi.national(electionId).then((r) => r.data.collation) : Promise.resolve(null),
    [electionId],
    { pollMs: 10000 }
  );

  const statesApi = useApi(
    () => electionId ? collationApi.states(electionId).then((r) => r.data.states) : Promise.resolve([]),
    [electionId],
    { pollMs: 10000, initial: [] }
  );

  const loading = nationalApi.loading || statesApi.loading;
  const national = nationalApi.data;

  const rankedParties = useMemo(() => {
    if (!national?.partyTotals) return [];
    return [...national.partyTotals].sort((a, b) => b.votes - a.votes);
  }, [national]);

  if (elections.length === 0) {
    return (
      <div className="mx-auto max-w-2xl p-8">
        <div className="card p-8 text-center">
          <p className="text-slate-600">No active elections.</p>
          <p className="mt-2 text-sm text-slate-500">Create one from the admin panel (coming soon) or via API.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
          <p className="mt-1 text-sm text-slate-500">
            {ROLE_LABELS_LOOKUP[user.role] || user.role} view
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            className="input max-w-xs"
            value={electionId}
            onChange={(e) => setElectionId(e.target.value)}
          >
            {elections.map((el) => (
              <option key={el._id} value={el._id}>{el.title}</option>
            ))}
          </select>
          <button
            onClick={() => { nationalApi.refetch(); statesApi.refetch(); }}
            className="btn-secondary p-2.5"
            aria-label="Refresh"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Summary cards */}
      {!national && loading && <div className="card p-12 text-center text-slate-500">Loading collation…</div>}
      {!national && !loading && (
        <div className="card p-12 text-center text-slate-500">
          No collation data yet. Once results are verified, this view will populate.
        </div>
      )}

      {national && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <SummaryCard label="PUs verified" value={`${national.pollingUnitsVerified.toLocaleString()} / ${national.pollingUnitsTotal.toLocaleString()}`} />
            <SummaryCard label="Accredited voters" value={national.accreditedVoters.toLocaleString()} />
            <SummaryCard label="Total votes" value={national.totalVotesCast.toLocaleString()} />
            <div className="card flex items-center justify-between p-4">
              <div>
                <p className="text-xs font-medium text-slate-500">Reporting</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">{national.reportingPercentage.toFixed(1)}%</p>
              </div>
              <ReportingRing pct={national.reportingPercentage} />
            </div>
          </div>

          {/* Party leaderboard */}
          <div className="card">
            <div className="card-header">
              <h2 className="text-base font-semibold">Party leaderboard</h2>
              <span className="text-xs text-slate-500">
                {national.totalValidVotes.toLocaleString()} valid votes
              </span>
            </div>
            <div className="card-body space-y-4">
              {rankedParties.length === 0 ? (
                <p className="text-sm text-slate-500">No verified votes yet</p>
              ) : rankedParties.map((p, i) => (
                <div key={p.partyCode} className="flex items-center gap-3">
                  <span className="w-6 text-center text-sm font-bold text-slate-400">{i + 1}</span>
                  <div className="flex-1">
                    <PartyBar partyCode={p.partyCode} votes={p.votes} totalVotes={national.totalValidVotes} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* States table — the drill-down */}
          {statesApi.data?.length > 0 && (
            <div className="card overflow-hidden">
              <div className="card-header">
                <h2 className="text-base font-semibold">States & FCT</h2>
                <span className="text-xs text-slate-500">{statesApi.data.length} reporting</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium">State</th>
                      <th className="px-4 py-3 text-right font-medium">PUs</th>
                      <th className="px-4 py-3 text-right font-medium">Votes</th>
                      <th className="px-4 py-3 text-left font-medium">Leading</th>
                      <th className="w-10"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {statesApi.data.map((s) => {
                      const top = s.partyTotals[0];
                      return (
                        <tr key={s._id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <MapPin className="h-3.5 w-3.5 text-slate-400" />
                              {stateNameFromCode(s.stateCode)}
                            </div>
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {s.pollingUnitsVerified}/{s.pollingUnitsTotal}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-slate-600">
                            {s.totalValidVotes.toLocaleString()}
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {top ? (
                              <span className="font-semibold text-brand-700">{top.partyCode} ({top.votes.toLocaleString()})</span>
                            ) : '—'}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <Link
                              to={`/admin/dashboard/state/${s.stateCode}?election=${electionId}`}
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

const ROLE_LABELS_LOOKUP = {
  NATIONAL_SUPER_ADMIN: 'National',
  STATE_ADMIN: 'State',
  LGA_ADMIN: 'LGA',
  WARD_ADMIN: 'Ward',
  OBSERVER: 'Observer',
};

// Minimal mapping — the backend can expose state names via a join or endpoint later.
function stateNameFromCode(code) {
  return code || '—';
}

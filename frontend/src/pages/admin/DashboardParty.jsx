

import { useEffect } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ShieldCheck,
  Trophy,
  Vote,
  RefreshCw,
  AlertTriangle,
  Building2,
  MapPin,
  ArrowLeft,
} from 'lucide-react';

import { useApi } from '@/hooks/useApi';
import api, { collationApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

function getId(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return String(value._id || value.id || '');
  }

  return String(value);
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString();
}

function StatCard({ label, value, icon: Icon, description }) {
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-500">
          {label}
        </p>

        {Icon && (
          <Icon className="h-5 w-5 text-brand-600" />
        )}
      </div>

      <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
        {value}
      </p>

      {description && (
        <p className="mt-1 text-xs text-slate-500">
          {description}
        </p>
      )}
    </div>
  );
}

export default function DashboardParty() {
  const { user } = useAuth();

  const [searchParams, setSearchParams] = useSearchParams();

  const electionId = searchParams.get('election') || '';

  const userScope = user?.scope || {};

  const assignedPartyId = getId(userScope.party);
  const assignedStateId = getId(userScope.state);

  // -------------------------------------------------------
  // ELECTIONS
  // -------------------------------------------------------

  const electionsApi = useApi(
    () =>
      api
        .get('/elections', {
          params: { status: 'ACTIVE' },
        })
        .then((response) => response.data.elections || []),
    [],
    { initial: [] }
  );

  const elections = electionsApi.data || [];

  // Select the first available election automatically.
  useEffect(() => {
    if (!electionId && elections.length > 0) {
      const next = new URLSearchParams(searchParams);

      next.set('election', elections[0]._id);

      setSearchParams(next, { replace: true });
    }
  }, [
    electionId,
    elections,
    searchParams,
    setSearchParams,
  ]);

  // -------------------------------------------------------
  // PARTY COLLATION
  // -------------------------------------------------------

  const rankingApi = useApi(
    () =>
      electionId
        ? collationApi
            .parties(electionId, 'STATE')
            .then((response) => response.data)
        : Promise.resolve(null),
    [electionId],
    { initial: null, pollMs: 10000 }
  );

  const data = rankingApi.data;

  const ranking = data?.ranking || [];

  const loading = rankingApi.loading;

  // Backend must return only this user's assigned party.
  const party = ranking.find(
    (item) =>
      getId(item.partyId) === assignedPartyId
  ) || ranking[0];

  // -------------------------------------------------------
  // ASSIGNMENT INFORMATION
  // -------------------------------------------------------

  const partyName =
    party?.partyName ||
    userScope.party?.name ||
    userScope.party?.code ||
    'Assigned political party';

  const partyCode =
    party?.partyCode ||
    userScope.party?.code ||
    'N/A';

  const stateName =
    userScope.state?.name ||
    userScope.state?.stateName ||
    userScope.state?.code ||
    (assignedStateId
      ? `Assigned state (${assignedStateId})`
      : 'State not assigned');

  // -------------------------------------------------------
  // VALIDATION
  // -------------------------------------------------------

  if (!assignedPartyId || !assignedStateId) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="card border border-amber-200 bg-amber-50 p-6">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-6 w-6 shrink-0 text-amber-600" />

            <div>
              <h1 className="font-semibold text-amber-900">
                Party assignment required
              </h1>

              <p className="mt-2 text-sm text-amber-800">
                Your Party Admin account must have both
                a political party and a state assigned.
                Please contact your administrator.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------
  // DASHBOARD
  // -------------------------------------------------------

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 sm:p-6">

      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">

        <div>
          <Link
            to="/admin/dashboard"
            className="mb-3 inline-flex items-center gap-2 text-sm text-brand-600 hover:underline"
          >
            <ArrowLeft className="h-4 w-4" />
            Dashboard
          </Link>

          <h1 className="text-2xl font-bold text-slate-900">
            Party Admin Dashboard
          </h1>

          <p className="mt-1 text-sm text-slate-500">
            Election monitoring for your assigned political party.
          </p>
        </div>

        <div className="flex items-center gap-2">

          <select
            className="input max-w-xs"
            value={electionId}
            onChange={(event) => {
              const next = new URLSearchParams(searchParams);

              next.set('election', event.target.value);

              setSearchParams(next);
            }}
          >
            <option value="">
              Select election
            </option>

            {elections.map((election) => (
              <option
                key={election._id}
                value={election._id}
              >
                {election.title}
              </option>
            ))}
          </select>

          <button
            onClick={() => rankingApi.refetch()}
            className="btn-secondary p-2.5"
            aria-label="Refresh dashboard"
          >
            <RefreshCw
              className={`h-4 w-4 ${
                loading ? 'animate-spin' : ''
              }`}
            />
          </button>
        </div>
      </div>

      {/* Assignment card */}
      <div className="card border border-brand-100 bg-brand-50/40 p-5">

        <div className="flex items-start gap-3">

          <div className="rounded-xl bg-white p-3 shadow-sm">
            <ShieldCheck className="h-7 w-7 text-brand-600" />
          </div>

          <div className="min-w-0 flex-1">

            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Your assigned party
            </p>

            <h2 className="mt-1 text-xl font-bold text-slate-900">
              {partyName}
            </h2>

            <div className="mt-2 flex flex-wrap gap-x-5 gap-y-2 text-sm text-slate-600">

              <span className="inline-flex items-center gap-1.5">
                <Building2 className="h-4 w-4" />
                Party code: {partyCode}
              </span>

              <span className="inline-flex items-center gap-1.5">
                <MapPin className="h-4 w-4" />
                {stateName}
              </span>

            </div>
          </div>
        </div>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="card p-12 text-center text-slate-500">
          Loading party election data...
        </div>
      )}

      {/* No election */}
      {!electionId && !loading && (
        <div className="card p-10 text-center text-slate-500">
          No active election is available.
        </div>
      )}

      {/* No results */}
      {electionId && !loading && !data && (
        <div className="card p-10 text-center text-slate-500">
          No party collation data is available yet.
        </div>
      )}

      {/* Results */}
      {data && (
        <>
          {/* Summary */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">

            <StatCard
              label="Party votes"
              value={formatNumber(party?.votes)}
              icon={Vote}
              description="Verified votes in your assigned state"
            />

            <StatCard
              label="Party ranking"
              value={party ? 'Available' : 'Pending'}
              icon={Trophy}
              description="Your assigned party's collation"
            />

            <StatCard
              label="Election"
              value={
                elections.find(
                  (item) => item._id === electionId
                )?.title || 'Selected election'
              }
              icon={Building2}
              description="Currently selected election"
            />

          </div>

          {/* Party result */}
          <div className="card overflow-hidden">

            <div className="card-header">
              <h2 className="text-base font-semibold">
                Your party's election result
              </h2>

              <span className="text-xs text-slate-500">
                State-level collation
              </span>
            </div>

            <div className="card-body">

              {!party ? (
                <div className="py-8 text-center">

                  <AlertTriangle className="mx-auto h-8 w-8 text-amber-500" />

                  <p className="mt-3 text-sm font-medium text-slate-700">
                    No verified votes recorded for your party yet.
                  </p>

                  <p className="mt-1 text-xs text-slate-500">
                    Results will appear when verified collation becomes available.
                  </p>

                </div>
              ) : (
                <div className="rounded-xl border border-slate-200 p-5">

                  <div className="flex items-center justify-between gap-4">

                    <div>
                      <p className="text-xs text-slate-500">
                        Political party
                      </p>

                      <h3 className="mt-1 text-lg font-bold text-slate-900">
                        {party.partyName || party.partyCode}
                      </h3>

                      <p className="mt-1 text-sm text-slate-500">
                        {party.partyCode}
                      </p>
                    </div>

                    <div className="text-right">
                      <p className="text-xs text-slate-500">
                        Verified votes
                      </p>

                      <p className="mt-1 text-2xl font-bold tabular-nums text-brand-700">
                        {formatNumber(party.votes)}
                      </p>
                    </div>

                  </div>

                </div>
              )}

            </div>
          </div>

          {/* Scope notice */}
          <div className="card p-4">

            <div className="flex items-start gap-3">

              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-green-600" />

              <div>
                <h3 className="text-sm font-semibold text-slate-800">
                  Restricted party access
                </h3>

                <p className="mt-1 text-xs leading-5 text-slate-500">
                  This dashboard uses your authenticated Party Admin
                  assignment. The backend is responsible for restricting
                  election results to your assigned party and state.
                </p>
              </div>

            </div>
          </div>

        </>
      )}

      {/* API error */}
      {rankingApi.error && (
        <div className="card border border-red-200 bg-red-50 p-4">

          <div className="flex items-start gap-2">

            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />

            <div>
              <p className="text-sm font-semibold text-red-800">
                Unable to load party results
              </p>

              <p className="mt-1 text-xs text-red-700">
                Please refresh the dashboard. If the problem
                continues, contact your system administrator.
              </p>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}

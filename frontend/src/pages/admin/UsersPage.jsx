
import { useState, useEffect, Component } from 'react';
import { toast } from 'sonner';
import { AlertCircle, RefreshCw } from 'lucide-react';

import { useApi } from '@/hooks/useApi';
import { usersApi, geoApi, partiesApi } from '@/services/api';
import { useAuth } from '@/context/AuthContext';

// ============================================================
// ERROR BOUNDARY
// ============================================================

class ErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error('UsersPage crashed:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-red-50 p-6 text-red-700">
          <h1 className="text-2xl font-bold">
            Page Crashed
          </h1>

          <p className="mt-3">
            {this.state.error?.toString()}
          </p>

          <pre className="mt-4 overflow-auto rounded bg-white p-4 text-xs">
            {this.state.error?.stack}
          </pre>
        </div>
      );
    }

    return this.props.children;
  }
}

// ============================================================
// ROLE PERMISSIONS
// ============================================================

const CREATABLE_ROLES = {
  NATIONAL_SUPER_ADMIN: [
    'STATE_ADMIN',
    'PARTY_ADMIN',
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT',
    'OBSERVER',
  ],

  STATE_ADMIN: [
    'PARTY_ADMIN',
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT',
    'OBSERVER',
  ],

  PARTY_ADMIN: [
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT',
    'OBSERVER',
  ],

  LGA_ADMIN: [
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT',
    'OBSERVER',
  ],

  WARD_ADMIN: [
    'POLLING_UNIT_AGENT',
    'OBSERVER',
  ],

  POLLING_UNIT_AGENT: [],
  OBSERVER: [],
};

const ROLE_LABELS = {
  STATE_ADMIN: 'State Admin',
  PARTY_ADMIN: 'Party Admin',
  LGA_ADMIN: 'LGA Admin',
  WARD_ADMIN: 'Ward Admin',
  POLLING_UNIT_AGENT: 'Polling Unit Agent',
  OBSERVER: 'Observer',
};

const ROLE_NEEDS_PARTY = new Set([
  'PARTY_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT',
]);

const STATE_ROLES = [
  'STATE_ADMIN',
  'PARTY_ADMIN',
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT',
];

const LGA_ROLES = [
  'LGA_ADMIN',
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT',
];

const WARD_ROLES = [
  'WARD_ADMIN',
  'POLLING_UNIT_AGENT',
];

// ============================================================
// RESPONSE NORMALIZATION
// ============================================================

function getArray(data, keys = []) {
  if (Array.isArray(data)) {
    return data;
  }

  if (!data || typeof data !== 'object') {
    return [];
  }

  for (const key of keys) {
    if (Array.isArray(data[key])) {
      return data[key];
    }
  }

  if (Array.isArray(data.data)) {
    return data.data;
  }

  return [];
}

// ============================================================
// MONGODB ID NORMALIZATION
// ============================================================

function getId(value) {
  if (!value) return '';

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'object') {
    return (
      value._id?.toString?.() ||
      value.id?.toString?.() ||
      ''
    );
  }

  return String(value);
}

// ============================================================
// BACKEND ERROR HANDLING
// ============================================================

function getErrorMessage(err) {
  const response = err?.response?.data;

  if (!response) {
    return err?.message || 'Network error. Please try again.';
  }

  const details = response.details || response.errors;

  if (Array.isArray(details)) {
    return details
      .map(item =>
        typeof item === 'string'
          ? item
          : item.message || JSON.stringify(item)
      )
      .join(', ');
  }

  if (details && typeof details === 'object') {
    return Object.entries(details)
      .map(([field, message]) =>
        `${field}: ${
          typeof message === 'string'
            ? message
            : JSON.stringify(message)
        }`
      )
      .join(', ');
  }

  return (
    response.message ||
    response.error ||
    'User registration failed.'
  );
}

// ============================================================
// MAIN PAGE
// ============================================================

function UsersPageContent() {
  const { user } = useAuth();

  const allowedRoles = CREATABLE_ROLES[user?.role] || [];

  // ----------------------------------------------------------
  // FORM STATE
  // ----------------------------------------------------------

  const [role, setRole] = useState('');

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');

  const [partyId, setPartyId] = useState('');

  const [stateCode, setStateCode] = useState('');
  const [lgaCode, setLgaCode] = useState('');
  const [wardCode, setWardCode] = useState('');
  const [puId, setPuId] = useState('');

  const [busy, setBusy] = useState(false);

  // ----------------------------------------------------------
  // INITIAL ROLE
  // ----------------------------------------------------------

  useEffect(() => {
    if (!role && allowedRoles.length > 0) {
      setRole(allowedRoles[0]);
    }
  }, [role, allowedRoles.join(',')]);

  // ----------------------------------------------------------
  // LOAD PARTIES
  // ----------------------------------------------------------

  const partiesHook = useApi(
    () => partiesApi.list(),
    [],
    { initial: [] }
  );

  const safeParties = getArray(
    partiesHook.data,
    ['parties']
  );

  // ----------------------------------------------------------
  // LOAD STATES
  // ----------------------------------------------------------

  const statesApi = useApi(
    () => geoApi.states(),
    [],
    { initial: [] }
  );

  const safeStates = getArray(
    statesApi.data,
    ['states']
  );

  // ----------------------------------------------------------
  // LOAD LGAS
  // ----------------------------------------------------------

  const lgasApi = useApi(
    () => stateCode
      ? geoApi.lgas(stateCode)
      : Promise.resolve([]),
    [stateCode],
    { initial: [] }
  );

  const safeLgas = getArray(
    lgasApi.data,
    ['lgas']
  );

  // ----------------------------------------------------------
  // LOAD WARDS
  // ----------------------------------------------------------

  const wardsApi = useApi(
    () => lgaCode
      ? geoApi.wards(lgaCode)
      : Promise.resolve([]),
    [lgaCode],
    { initial: [] }
  );

  const safeWards = getArray(
    wardsApi.data,
    ['wards']
  );

  // ----------------------------------------------------------
  // LOAD POLLING UNITS
  // ----------------------------------------------------------

  const pusApi = useApi(
    () => wardCode
      ? geoApi.pollingUnits(wardCode)
      : Promise.resolve([]),
    [wardCode],
    { initial: [] }
  );

  const safePus = getArray(
    pusApi.data,
    ['pollingUnits']
  );

  // ----------------------------------------------------------
  // CURRENT USER SCOPE
  // ----------------------------------------------------------

  const userPartyId = getId(user?.scope?.party);
  const userStateId = getId(user?.scope?.state);
  const userLgaId = getId(user?.scope?.lga);

  const isPartyLocked =
    user?.role !== 'NATIONAL_SUPER_ADMIN' &&
    !!userPartyId;

  const isStateLocked =
    user?.role !== 'NATIONAL_SUPER_ADMIN' &&
    !!userStateId;

  const isLgaLocked = [
    'LGA_ADMIN',
    'WARD_ADMIN',
    'POLLING_UNIT_AGENT',
  ].includes(user?.role);

  // ----------------------------------------------------------
  // AUTO SELECT PARTY
  // ----------------------------------------------------------

  useEffect(() => {
    if (isPartyLocked && userPartyId) {
      setPartyId(userPartyId);
    }
  }, [isPartyLocked, userPartyId]);

  // ----------------------------------------------------------
  // AUTO SELECT STATE
  // ----------------------------------------------------------

  useEffect(() => {
    if (isStateLocked && userStateId && safeStates.length) {
      const state = safeStates.find(
        s => getId(s._id) === userStateId
      );

      if (state) {
        setStateCode(state.code);
      }
    }
  }, [isStateLocked, userStateId, safeStates]);

  // ----------------------------------------------------------
  // AUTO SELECT LGA
  // ----------------------------------------------------------

  useEffect(() => {
    if (isLgaLocked && userLgaId && safeLgas.length) {
      const lga = safeLgas.find(
        l => getId(l._id) === userLgaId
      );

      if (lga) {
        setLgaCode(lga.code);
      }
    }
  }, [isLgaLocked, userLgaId, safeLgas]);

  // ----------------------------------------------------------
  // RESET DEPENDENT GEOGRAPHICAL SELECTIONS
  // ----------------------------------------------------------

  useEffect(() => {
    setLgaCode('');
    setWardCode('');
    setPuId('');
  }, [stateCode]);

  useEffect(() => {
    setWardCode('');
    setPuId('');
  }, [lgaCode]);

  useEffect(() => {
    setPuId('');
  }, [wardCode]);

  // ----------------------------------------------------------
  // RESET PARTY WHEN ROLE DOES NOT REQUIRE IT
  // ----------------------------------------------------------

  useEffect(() => {
    if (!ROLE_NEEDS_PARTY.has(role) && !isPartyLocked) {
      setPartyId('');
    }
  }, [role, isPartyLocked]);

  // ----------------------------------------------------------
  // FORM REQUIREMENTS
  // ----------------------------------------------------------

  const needsParty = ROLE_NEEDS_PARTY.has(role);
  const needsState = STATE_ROLES.includes(role);
  const needsLga = LGA_ROLES.includes(role);
  const needsWard = WARD_ROLES.includes(role);
  const needsPu = role === 'POLLING_UNIT_AGENT';

  // ----------------------------------------------------------
  // CREATE USER
  // ----------------------------------------------------------

  async function handleCreate(e) {
    e.preventDefault();

    if (busy) return;

    if (!role) {
      toast.error('Please select a role.');
      return;
    }

    setBusy(true);

    try {
      // Resolve state ID
      const stateId = isStateLocked
        ? userStateId
        : getId(
            safeStates.find(
              s => s.code === stateCode
            )?._id
          );

      // Resolve party ID
      const resolvedPartyId = isPartyLocked
        ? userPartyId
        : getId(partyId);

      // Resolve LGA ID
      const lgaId = isLgaLocked
        ? userLgaId
        : getId(
            safeLgas.find(
              l => l.code === lgaCode
            )?._id
          );

      // Resolve ward ID
      const wardId = getId(
        safeWards.find(
          w => w.code === wardCode
        )?._id
      );

      // Resolve polling unit ID
      const pollingUnitId = getId(puId);

      // Build scope
      const scope = {};

      // PARTY
      if (needsParty) {
        if (!resolvedPartyId) {
          toast.error('Please select a valid party.');
          return;
        }

        scope.party = resolvedPartyId;
      }

      // STATE
      if (needsState) {
        if (!stateId) {
          toast.error('Please select a valid state.');
          return;
        }

        scope.state = stateId;
      }

      // LGA
      if (needsLga) {
        if (!lgaId) {
          toast.error('Please select a valid LGA.');
          return;
        }

        scope.lga = lgaId;
      }

      // WARD
      if (needsWard) {
        if (!wardId) {
          toast.error('Please select a valid ward.');
          return;
        }

        scope.ward = wardId;
      }

      // POLLING UNIT
      if (needsPu) {
        if (!pollingUnitId) {
          toast.error('Please select a polling unit.');
          return;
        }

        scope.pollingUnit = pollingUnitId;
      }

      // FINAL PAYLOAD
      const payload = {
        email: email.trim().toLowerCase(),
        password,
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        role,
        scope,
      };

      // DIAGNOSTICS
      console.log('USER REGISTRATION PAYLOAD:', {
        ...payload,
        password: '[HIDDEN]',
      });

      console.log('REGISTRATION SCOPE CHECK:', {
        role,
        party: scope.party || null,
        state: scope.state || null,
        lga: scope.lga || null,
        ward: scope.ward || null,
        pollingUnit: scope.pollingUnit || null,
        partyIsString: typeof scope.party === 'string',
        stateIsString: typeof scope.state === 'string',
      });

      // API REQUEST
      await usersApi.register(payload);

      toast.success(
        `${ROLE_LABELS[role] || role} created successfully.`
      );

      // RESET FORM
      setEmail('');
      setPassword('');
      setFirstName('');
      setLastName('');

      if (!isPartyLocked) {
        setPartyId('');
      }

      if (!isStateLocked) {
        setStateCode('');
      }

      if (!isLgaLocked) {
        setLgaCode('');
      }

      setWardCode('');
      setPuId('');

    } catch (err) {
      console.error(
        'USER CREATION FAILED:',
        err?.response?.data || err
      );

      toast.error(getErrorMessage(err), {
        duration: 8000,
      });

    } finally {
      setBusy(false);
    }
  }

  // ----------------------------------------------------------
  // SUBMISSION VALIDATION
  // ----------------------------------------------------------

  const canSubmit =
    !busy &&
    !!role &&
    !!email.trim() &&
    !!password &&
    !!firstName.trim() &&
    !!lastName.trim() &&
    (!needsParty || !!(isPartyLocked ? userPartyId : partyId)) &&
    (!needsState || !!stateCode) &&
    (!needsLga || !!lgaCode) &&
    (!needsWard || !!wardCode) &&
    (!needsPu || !!puId);

  // ----------------------------------------------------------
  // LOADING
  // ----------------------------------------------------------

  if (!user) {
    return (
      <div className="p-6">
        Loading user...
      </div>
    );
  }

  // ----------------------------------------------------------
  // PERMISSION CHECK
  // ----------------------------------------------------------

  if (allowedRoles.length === 0) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-bold">
          User Management
        </h1>

        <p className="mt-2 text-sm text-slate-600">
          You do not have permission to create users.
        </p>
      </div>
    );
  }

  // ----------------------------------------------------------
  // UI
  // ----------------------------------------------------------

  return (
    <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">

      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900">
          User Management
        </h1>
      </div>

      {/* STATES ERROR */}

      {statesApi.error && (
        <div className="card border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />

            <div>
              <p className="text-sm font-medium text-red-800">
                Failed to load states
              </p>

              <p className="mt-1 text-xs text-red-600">
                {String(statesApi.error)}
              </p>

              <button
                type="button"
                onClick={() => statesApi.refetch()}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* PARTIES ERROR */}

      {partiesHook.error && (
        <div className="card border border-red-200 bg-red-50 p-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-5 w-5 text-red-600" />

            <div>
              <p className="text-sm font-medium text-red-800">
                Failed to load parties
              </p>

              <p className="mt-1 text-xs text-red-600">
                {String(partiesHook.error)}
              </p>

              <button
                type="button"
                onClick={() => partiesHook.refetch()}
                className="mt-2 flex items-center gap-1 text-xs font-semibold text-red-700"
              >
                <RefreshCw className="h-3 w-3" />
                Try again
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CREATE USER FORM */}

      <form
        onSubmit={handleCreate}
        className="card space-y-4 p-5"
      >

        {/* ROLE */}

        <div>
          <label className="label">
            Role
          </label>

          <select
            required
            className="input font-semibold"
            value={role}
            onChange={e => setRole(e.target.value)}
          >
            {allowedRoles.map(r => (
              <option key={r} value={r}>
                {ROLE_LABELS[r] || r}
              </option>
            ))}
          </select>
        </div>

        {/* USER INFORMATION */}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          <div>
            <label className="label">
              First Name
            </label>

            <input
              required
              className="input"
              value={firstName}
              onChange={e => setFirstName(e.target.value)}
              autoComplete="given-name"
            />
          </div>

          <div>
            <label className="label">
              Last Name
            </label>

            <input
              required
              className="input"
              value={lastName}
              onChange={e => setLastName(e.target.value)}
              autoComplete="family-name"
            />
          </div>

          <div>
            <label className="label">
              Email
            </label>

            <input
              type="email"
              required
              className="input"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="label">
              Password
            </label>

            <input
              type="password"
              required
              minLength={12}
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Minimum 12 characters"
              autoComplete="new-password"
            />
          </div>

        </div>

        {/* ASSIGN SCOPE */}

        <h2 className="mt-4 border-t border-slate-200 pt-3 font-semibold">
          Assign Scope
        </h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">

          {/* PARTY */}

          {needsParty && (
            <div>
              <label className="label">
                Party
              </label>

              <select
                required
                className="input"
                value={isPartyLocked ? userPartyId : partyId}
                onChange={e => setPartyId(e.target.value)}
                disabled={
                  partiesHook.loading ||
                  isPartyLocked
                }
              >
                <option value="">
                  {partiesHook.loading
                    ? 'Loading parties...'
                    : safeParties.length === 0
                      ? 'No parties available'
                      : 'Select Party...'}
                </option>

                {safeParties.map(p => (
                  <option
                    key={getId(p._id)}
                    value={getId(p._id)}
                  >
                    {p.abbreviation || p.code || ''}
                    {p.abbreviation || p.code ? ' — ' : ''}
                    {p.name}
                  </option>
                ))}
              </select>

              {isPartyLocked && (
                <p className="mt-1 text-xs text-slate-500">
                  Locked to your party
                </p>
              )}
            </div>
          )}

          {/* STATE */}

          {needsState && (
            <div>
              <label className="label">
                State
              </label>

              <select
                required
                className="input"
                value={stateCode}
                onChange={e => setStateCode(e.target.value)}
                disabled={
                  statesApi.loading ||
                  isStateLocked
                }
              >
                <option value="">
                  {statesApi.loading
                    ? 'Loading states...'
                    : 'Select State...'}
                </option>

                {safeStates.map(s => (
                  <option
                    key={getId(s._id)}
                    value={s.code}
                  >
                    {s.name}
                  </option>
                ))}
              </select>

              {isStateLocked && (
                <p className="mt-1 text-xs text-slate-500">
                  Locked to your state
                </p>
              )}
            </div>
          )}

          {/* LGA */}

          {needsLga && (
            <div>
              <label className="label">
                LGA
              </label>

              <select
                required
                className="input"
                value={lgaCode}
                onChange={e => setLgaCode(e.target.value)}
                disabled={
                  !stateCode ||
                  isLgaLocked
                }
              >
                <option value="">
                  Select LGA...
                </option>

                {safeLgas.map(l => (
                  <option
                    key={getId(l._id)}
                    value={l.code}
                  >
                    {l.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* WARD */}

          {needsWard && (
            <div>
              <label className="label">
                Ward
              </label>

              <select
                required
                className="input"
                value={wardCode}
                onChange={e => setWardCode(e.target.value)}
                disabled={!lgaCode}
              >
                <option value="">
                  Select Ward...
                </option>

                {safeWards.map(w => (
                  <option
                    key={getId(w._id) || w.code}
                    value={w.code}
                  >
                    {w.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* POLLING UNIT */}

          {needsPu && (
            <div>
              <label className="label">
                Polling Unit
              </label>

              <select
                required
                className="input"
                value={puId}
                onChange={e => setPuId(e.target.value)}
                disabled={!wardCode}
              >
                <option value="">
                  Select Polling Unit...
                </option>

                {safePus.map(p => (
                  <option
                    key={getId(p._id)}
                    value={getId(p._id)}
                  >
                    {p.name} ({p.code})
                  </option>
                ))}
              </select>
            </div>
          )}

        </div>

        {/* SUBMIT */}

        <button
          type="submit"
          disabled={!canSubmit}
          className="btn-primary mt-4 w-full disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy
            ? 'Creating...'
            : `Create ${ROLE_LABELS[role] || role}`}
        </button>

      </form>
    </div>
  );
}

// ============================================================
// ERROR BOUNDARY WRAPPER
// ============================================================

export default function UsersPage() {
  return (
    <ErrorBoundary>
      <UsersPageContent />
    </ErrorBoundary>
  );
}

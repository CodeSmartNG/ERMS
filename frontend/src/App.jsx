import {
  Routes,
  Route,
  Navigate,
  Outlet,
  useLocation,
} from 'react-router-dom';

import { useEffect } from 'react';

import { useAuth } from './context/AuthContext';
import { HOME_BY_ROLE, ROLES } from './utils/roles';

import LoadingScreen from './components/LoadingScreen';
import AppShell from './components/AppShell';

// Agent pages
import AgentHome from './pages/agent/AgentHome';
import SubmitResultPage from './pages/agent/SubmitResultPage';
import SubmitIncidentPage from './pages/agent/SubmitIncidentPage';
import OfflineQueuePage from './pages/agent/OfflineQueuePage';

// Admin pages
import AdminDashboard from './pages/admin/AdminDashboard';
import DashboardState from './pages/admin/DashboardState';
import DashboardLGA from './pages/admin/DashboardLGA';
import DashboardWard from './pages/admin/DashboardWard';

import ResultsReviewPage from './pages/admin/ResultsReviewPage';
import IncidentsPage from './pages/admin/IncidentsPage';
import ElectionsPage from './pages/admin/ElectionsPage';
import PartiesPage from './pages/admin/PartiesPage';
import CandidatesPage from './pages/admin/CandidatesPage';
import UsersPage from './pages/admin/UsersPage';

// Authentication
import LoginPage from './pages/auth/LoginPage';

// General
import NotFoundPage from './pages/NotFoundPage';

/*
|--------------------------------------------------------------------------
| ADMIN ROLES
|--------------------------------------------------------------------------
*/

const ADMIN_ROLES = [
  ROLES.NATIONAL_SUPER_ADMIN,
  ROLES.STATE_ADMIN,
  ROLES.LGA_ADMIN,
  ROLES.WARD_ADMIN,
  ROLES.OBSERVER,
];

/*
|--------------------------------------------------------------------------
| AUTHENTICATION PROTECTION
|--------------------------------------------------------------------------
*/

function RequireAuth({ roles }) {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (roles && !roles.includes(user?.role)) {
    return (
      <Navigate
        to={HOME_BY_ROLE[user?.role] || '/'}
        replace
      />
    );
  }

  return <Outlet />;
}

/*
|--------------------------------------------------------------------------
| SCROLL TO TOP
|--------------------------------------------------------------------------
*/

function ScrollToTop() {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({
      top: 0,
      behavior: 'instant',
    });
  }, [pathname]);

  return null;
}

/*
|--------------------------------------------------------------------------
| MAIN APPLICATION
|--------------------------------------------------------------------------
*/

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) {
    return <LoadingScreen />;
  }

  return (
    <>
      <ScrollToTop />

      <Routes>

        {/* -------------------------------------------------
            AUTHENTICATION
        ------------------------------------------------- */}

        <Route
          path="/login"
          element={
            isAuthenticated ? (
              <Navigate
                to={HOME_BY_ROLE[user?.role] || '/'}
                replace
              />
            ) : (
              <LoginPage />
            )
          }
        />

        {/* -------------------------------------------------
            POLLING UNIT AGENT AREA
        ------------------------------------------------- */}

        <Route
          element={
            <RequireAuth
              roles={[ROLES.POLLING_UNIT_AGENT]}
            />
          }
        >
          <Route
            path="/agent"
            element={<AgentHome />}
          />

          <Route
            path="/agent/submit-result"
            element={<SubmitResultPage />}
          />

          <Route
            path="/agent/submit-incident"
            element={<SubmitIncidentPage />}
          />

          <Route
            path="/agent/queue"
            element={<OfflineQueuePage />}
          />
        </Route>

        {/* -------------------------------------------------
            ADMIN AREA
            NATIONAL, STATE, LGA, WARD, OBSERVER
        ------------------------------------------------- */}

        <Route element={<RequireAuth roles={ADMIN_ROLES} />}>

          <Route element={<AppShell />}>

            {/* Main dashboard */}
            <Route
              path="/admin/dashboard"
              element={<AdminDashboard />}
            />

            {/* Geographic drill-down dashboards */}
            <Route
              path="/admin/dashboard/state/:code"
              element={<DashboardState />}
            />

            <Route
              path="/admin/dashboard/lga/:code"
              element={<DashboardLGA />}
            />

            <Route
              path="/admin/dashboard/ward/:code"
              element={<DashboardWard />}
            />

            {/* Election results */}
            <Route
              path="/admin/results"
              element={<ResultsReviewPage />}
            />

            {/* Incidents */}
            <Route
              path="/admin/incidents"
              element={<IncidentsPage />}
            />

            {/* Election management */}
            <Route
              path="/admin/elections"
              element={<ElectionsPage />}
            />

            {/* Political parties */}
            <Route
              path="/admin/parties"
              element={<PartiesPage />}
            />

            {/* Candidates */}
            <Route
              path="/admin/candidates"
              element={<CandidatesPage />}
            />

            {/* User management */}
            <Route
              path="/admin/users"
              element={<UsersPage />}
            />

          </Route>
        </Route>

        {/* -------------------------------------------------
            DEFAULT ROUTE
        ------------------------------------------------- */}

        <Route
          path="/"
          element={
            isAuthenticated ? (
              <Navigate
                to={HOME_BY_ROLE[user?.role] || '/'}
                replace
              />
            ) : (
              <Navigate
                to="/login"
                replace
              />
            )
          }
        />

        {/* -------------------------------------------------
            404
        ------------------------------------------------- */}

        <Route
          path="*"
          element={<NotFoundPage />}
        />

      </Routes>
    </>
  );
}

import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { HOME_BY_ROLE, ROLES } from './utils/roles';
import LoadingScreen from './components/LoadingScreen';

import LoginPage from './pages/auth/LoginPage';
import AgentHome from './pages/agent/AgentHome';
import SubmitResultPage from './pages/agent/SubmitResultPage';
import SubmitIncidentPage from './pages/agent/SubmitIncidentPage';
import OfflineQueuePage from './pages/agent/OfflineQueuePage';
import AdminDashboard from './pages/admin/AdminDashboard';
import ResultsReviewPage from './pages/admin/ResultsReviewPage';
import IncidentsPage from './pages/admin/IncidentsPage';
import NotFoundPage from './pages/NotFoundPage';

function RequireAuth({ roles }) {
  const { isAuthenticated, loading, user } = useAuth();
  if (loading) return <LoadingScreen />;
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  if (roles && !roles.includes(user.role)) {
    return <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace />;
  }
  return <Outlet />;
}

export default function App() {
  const { isAuthenticated, loading, user } = useAuth();

  if (loading) return <LoadingScreen />;

  return (
    <Routes>
      <Route path="/login" element={
        isAuthenticated ? <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace /> : <LoginPage />
      } />

      {/* Agent area — only POLLING_UNIT_AGENT */}
      <Route element={<RequireAuth roles={[ROLES.POLLING_UNIT_AGENT]} />}>
        <Route path="/agent" element={<AgentHome />} />
        <Route path="/agent/submit-result" element={<SubmitResultPage />} />
        <Route path="/agent/submit-incident" element={<SubmitIncidentPage />} />
        <Route path="/agent/queue" element={<OfflineQueuePage />} />
      </Route>

      {/* Admin area — all admins + observers */}
      <Route element={<RequireAuth roles={[
        ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN,
        ROLES.LGA_ADMIN, ROLES.WARD_ADMIN, ROLES.OBSERVER,
      ]} />}>
        <Route path="/admin/dashboard" element={<AdminDashboard />} />
        <Route path="/admin/results" element={<ResultsReviewPage />} />
        <Route path="/admin/incidents" element={<IncidentsPage />} />
      </Route>

      <Route path="/" element={
        isAuthenticated ? <Navigate to={HOME_BY_ROLE[user.role] || '/'} replace /> : <Navigate to="/login" replace />
      } />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}

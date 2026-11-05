import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Outlet, Link } from 'react-router-dom';
import { LayoutDashboard, ClipboardCheck, AlertTriangle, Bell, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS } from '@/utils/roles';
import { notificationsApi } from '@/services/notifications';

const NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/admin/results', label: 'Results', icon: ClipboardCheck },
  { to: '/admin/incidents', label: 'Incidents', icon: AlertTriangle },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      const data = await notificationsApi.list();
      if (mounted) setUnread(data.unread || 0);
    };
    load();
    const id = setInterval(load, 60000);
    return () => { mounted = false; clearInterval(id); };
  }, []);

  async function onLogout() {
    await logout();
    navigate('/login', { replace: true });
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white">
        <div className="flex h-14 items-center gap-3 px-4 sm:px-6">
          <button
            className="btn-ghost -ml-2 p-2 sm:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
          <Link to="/admin/dashboard" className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">E</div>
            <span className="hidden text-sm font-semibold text-slate-900 sm:inline">CodeSmartNG ERMS</span>
          </Link>
          <div className="ml-auto flex items-center gap-2">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative btn-ghost p-2"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-danger-600 px-1 text-[10px] font-bold text-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            <div className="hidden text-right sm:block">
              <p className="text-xs font-medium text-slate-900">{user.firstName} {user.lastName}</p>
              <p className="text-[11px] text-slate-500">{ROLE_LABELS[user.role]}</p>
            </div>
            <button onClick={onLogout} className="btn-ghost p-2" aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Desktop sidebar */}
        <aside className="hidden w-60 shrink-0 border-r border-slate-200 bg-white sm:block">
          <nav className="sticky top-14 space-y-1 p-3">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Mobile slide-over */}
        {mobileOpen && (
          <div className="fixed inset-0 z-20 sm:hidden">
            <div className="absolute inset-0 bg-slate-900/40" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-14 h-full w-64 bg-white p-3 shadow-xl">
              <nav className="space-y-1">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    <item.icon className="h-4 w-4" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* Main content */}
        <main className="min-w-0 flex-1">
          <Outlet />
        </main>
      </div>

      {/* Notification drawer */}
      {notifOpen && (
        <NotificationDrawer onClose={() => setNotifOpen(false)} onUnreadChange={setUnread} />
      )}
    </div>
  );
}

function NotificationDrawer({ onClose, onUnreadChange }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const data = await notificationsApi.list();
      if (!mounted) return;
      setItems(data.notifications || []);
      onUnreadChange?.(0);
      setLoading(false);
    })();
    return () => { mounted = false; };
  }, [onUnreadChange]);

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-slate-900/40" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-200 bg-white px-5 py-4">
          <h2 className="text-base font-semibold">Notifications</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-3">
          {loading ? (
            <p className="py-8 text-center text-sm text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No notifications</p>
          ) : items.map((n) => (
            <div key={n._id} className={`mb-2 rounded-lg border p-3 ${n.isRead ? 'border-slate-100 bg-white' : 'border-brand-100 bg-brand-50/40'}`}>
              <p className="text-sm font-semibold text-slate-900">{n.title}</p>
              <p className="mt-1 text-xs text-slate-600">{n.body}</p>
              <p className="mt-2 text-[11px] text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

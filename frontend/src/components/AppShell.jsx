import { useEffect, useState } from 'react';
import { NavLink, useNavigate, Outlet, Link } from 'react-router-dom';
import { 
  LayoutDashboard, ClipboardCheck, AlertTriangle, 
  Bell, LogOut, Menu, X, Vote, Flag, Users, UserPlus 
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { ROLE_LABELS, ROLES } from '@/utils/roles';
import { notificationsApi } from '@/services/notifications';

// 1. RBAC FILTER: Define who can see what
const ALL_NAV = [
  { to: '/admin/dashboard', label: 'Dashboard', icon: LayoutDashboard, allowed: [ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.LGA_ADMIN, ROLES.WARD_ADMIN, ROLES.OBSERVER] },
  { to: '/admin/results', label: 'Results', icon: ClipboardCheck, allowed: [ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.LGA_ADMIN, ROLES.WARD_ADMIN, ROLES.OBSERVER] },
  { to: '/admin/incidents', label: 'Incidents', icon: AlertTriangle, allowed: [ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.LGA_ADMIN, ROLES.WARD_ADMIN, ROLES.OBSERVER] },
  { to: '/admin/elections', label: 'Elections', icon: Vote, allowed: [ROLES.NATIONAL_SUPER_ADMIN] },
  { to: '/admin/parties', label: 'Parties', icon: Flag, allowed: [ROLES.NATIONAL_SUPER_ADMIN] },
  { to: '/admin/candidates', label: 'Candidates', icon: Users, allowed: [ROLES.NATIONAL_SUPER_ADMIN] },
  { to: '/admin/users', label: 'User Management', icon: UserPlus, allowed: [ROLES.NATIONAL_SUPER_ADMIN, ROLES.STATE_ADMIN, ROLES.LGA_ADMIN, ROLES.WARD_ADMIN] },
];

export default function AppShell() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [unread, setUnread] = useState(0);

  // 2. Filter the menu based on the logged-in user's role
  const NAV = ALL_NAV.filter(item => item.allowed.includes(user.role));

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
    <div className="min-h-screen bg-slate-50 flex flex-col">
      {/* PREMIUM TOP BAR */}
      <header className="sticky top-0 z-30 border-b border-slate-200/60 bg-white/80 backdrop-blur-md">
        <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
          <button
            className="btn-ghost -ml-2 p-2 sm:hidden"
            onClick={() => setMobileOpen((v) => !v)}
            aria-label="Menu"
          >
            {mobileOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
          </button>
          
          <Link to="/admin/dashboard" className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-600 text-sm font-bold text-white shadow-sm">E</div>
            <span className="hidden font-display text-lg font-bold text-slate-900 sm:inline tracking-tight">CodeSmartNG ERMS</span>
          </Link>
          
          <div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setNotifOpen((v) => !v)}
              className="relative btn-ghost p-2 rounded-full"
              aria-label="Notifications"
            >
              <Bell className="h-5 w-5" />
              {unread > 0 && (
                <span className="absolute right-1 top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white ring-2 ring-white">
                  {unread > 99 ? '99+' : unread}
                </span>
              )}
            </button>
            
            <div className="hidden text-right sm:block border-l border-slate-200 pl-3 ml-1">
              <p className="text-sm font-semibold text-slate-900">{user.firstName} {user.lastName}</p>
              <p className="text-[11px] font-medium text-brand-600">{ROLE_LABELS[user.role]}</p>
            </div>
            
            <button onClick={onLogout} className="btn-ghost p-2 rounded-full text-slate-500 hover:text-red-600 hover:bg-red-50" aria-label="Log out">
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* PREMIUM DESKTOP SIDEBAR */}
        <aside className="hidden w-64 shrink-0 border-r border-slate-200/60 bg-white sm:block">
          <nav className="sticky top-16 space-y-1 p-4">
            {NAV.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 shadow-sm border border-brand-100'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 border border-transparent'
                  }`
                }
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* MOBILE SLIDE-OVER */}
        {mobileOpen && (
          <div className="fixed inset-0 z-20 sm:hidden">
            <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <div className="absolute left-0 top-16 h-[calc(100%-4rem)] w-72 bg-white p-4 shadow-2xl rounded-r-2xl animate-slide-up">
              <nav className="space-y-1">
                {NAV.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-semibold ${
                        isActive ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-100'
                      }`
                    }
                  >
                    <item.icon className="h-5 w-5" />
                    {item.label}
                  </NavLink>
                ))}
              </nav>
            </div>
          </div>
        )}

        {/* MAIN CONTENT */}
        <main className="min-w-0 flex-1 p-4 sm:p-8">
          <Outlet />
        </main>
      </div>

      {/* NOTIFICATION DRAWER */}
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
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl sm:rounded-l-3xl animate-slide-up">
        <div className="sticky top-0 flex items-center justify-between border-b border-slate-100 bg-white/90 backdrop-blur-md px-6 py-5">
          <h2 className="font-display text-lg font-bold text-slate-900">Notifications</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-2 rounded-full bg-slate-100" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="p-4">
          {loading ? (
            <p className="py-8 text-center text-sm font-medium text-slate-500">Loading…</p>
          ) : items.length === 0 ? (
            <p className="py-8 text-center text-sm font-medium text-slate-500">No new notifications</p>
          ) : items.map((n) => (
            <div key={n._id} className={`mb-3 rounded-2xl border p-4 transition-all ${n.isRead ? 'border-slate-100 bg-white' : 'border-brand-100 bg-brand-50/50 shadow-sm'}`}>
              <p className="text-sm font-bold text-slate-900">{n.title}</p>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">{n.body}</p>
              <p className="mt-3 text-[11px] font-medium text-slate-400">{new Date(n.createdAt).toLocaleString()}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
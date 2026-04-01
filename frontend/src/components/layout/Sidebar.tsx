import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useAppStore } from '../../store/appStore';
import {
  LayoutDashboard, Calendar, Droplets, FileText, Car, Users, LogOut, ChevronDown, X,
} from 'lucide-react';

const navItems = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/shifts', label: 'Shifts', icon: Calendar },
  { to: '/washers', label: 'Washers', icon: Droplets },
  { to: '/cases', label: 'Cases', icon: FileText },
  { to: '/fleet', label: 'Fleet', icon: Car },
  { to: '/staff', label: 'Staff', icon: Users },
];

export function Sidebar() {
  const { user, logout } = useAuthStore();
  const { stations, currentStationId, setCurrentStation, sidebarOpen, toggleSidebar } = useAppStore();
  const navigate = useNavigate();

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <>
      {sidebarOpen && (
        <div className="fixed inset-0 bg-black/40 z-20 lg:hidden" onClick={toggleSidebar} />
      )}
      <aside
        className={`fixed inset-y-0 left-0 z-30 w-64 bg-gray-900 text-gray-100 flex flex-col transition-transform duration-200 lg:relative lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 items-center justify-between px-4 border-b border-gray-700">
          <span className="text-lg font-bold tracking-tight text-white">GeminiToolKit</span>
          <button onClick={toggleSidebar} className="lg:hidden p-1 rounded hover:bg-gray-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        {stations.length > 1 && (
          <div className="px-3 py-2 border-b border-gray-700">
            <div className="relative">
              <select
                value={currentStationId || ''}
                onChange={(e) => setCurrentStation(e.target.value)}
                className="w-full bg-gray-800 text-sm rounded px-3 py-1.5 appearance-none border border-gray-600 focus:outline-none focus:ring-1 focus:ring-brand-500"
              >
                {stations.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
              <ChevronDown className="absolute right-2 top-2 h-4 w-4 text-gray-400 pointer-events-none" />
            </div>
          </div>
        )}

        <nav className="flex-1 py-3 space-y-0.5 px-2 overflow-y-auto">
          {navItems.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              onClick={() => window.innerWidth < 1024 && toggleSidebar()}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-brand-600 text-white'
                    : 'text-gray-300 hover:bg-gray-800 hover:text-white'
                }`
              }
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-gray-700 p-3">
          <div className="flex items-center gap-3 mb-2">
            <div className="h-8 w-8 rounded-full bg-brand-600 flex items-center justify-center text-sm font-bold text-white">
              {user?.displayName?.charAt(0) || '?'}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user?.displayName}</div>
              <div className="text-xs text-gray-400 truncate">{user?.role?.replace('_', ' ')}</div>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 w-full px-3 py-1.5 text-sm text-gray-400 hover:text-white hover:bg-gray-800 rounded transition-colors"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </div>
      </aside>
    </>
  );
}

import { useEffect, ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { useAppStore } from '../../store/appStore';
import { api } from '../../api/client';
import { Menu } from 'lucide-react';

export function AppShell({ children }: { children: ReactNode }) {
  const { setStations, sidebarOpen, toggleSidebar } = useAppStore();

  useEffect(() => {
    api.get('/dashboard/stations').then((data) => {
      setStations(data.stations || []);
    }).catch(() => {});
  }, [setStations]);

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-14 items-center gap-3 border-b bg-white px-4 lg:hidden">
          <button onClick={toggleSidebar} className="p-1 rounded hover:bg-gray-100">
            <Menu className="h-5 w-5" />
          </button>
          <span className="font-semibold text-gray-800">GeminiToolKit</span>
        </header>
        <main className="flex-1 overflow-y-auto p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

import { create } from 'zustand';

interface AppState {
  currentStationId: string | null;
  stations: { id: string; code: string; name: string }[];
  sidebarOpen: boolean;
  setCurrentStation: (id: string) => void;
  setStations: (stations: { id: string; code: string; name: string }[]) => void;
  toggleSidebar: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  currentStationId: null,
  stations: [],
  sidebarOpen: true,

  setCurrentStation: (id) => set({ currentStationId: id }),
  setStations: (stations) => set((state) => ({
    stations,
    currentStationId: state.currentStationId || stations[0]?.id || null,
  })),
  toggleSidebar: () => set((s) => ({ sidebarOpen: !s.sidebarOpen })),
}));

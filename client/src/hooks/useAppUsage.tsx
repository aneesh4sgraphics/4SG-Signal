import { useState, useEffect, useCallback, createContext, useContext } from 'react';

interface AppUsageData {
  path: string;
  count: number;
  lastUsed: number;
}

interface AppUsageContextType {
  usageData: Record<string, AppUsageData>;
  trackUsage: (path: string) => void;
  getTopApps: (count?: number) => string[];
  getRecentApps: (count?: number) => string[];
}

const STORAGE_KEY = '4s-app-usage-data';

const AppUsageContext = createContext<AppUsageContextType | null>(null);

function loadUsageData(): Record<string, AppUsageData> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      return JSON.parse(stored);
    }
  } catch (e) {
    console.warn('Failed to load usage data:', e);
  }
  return {};
}

function saveUsageData(data: Record<string, AppUsageData>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('Failed to save usage data:', e);
  }
}

export function useAppUsageProvider() {
  const [usageData, setUsageData] = useState<Record<string, AppUsageData>>(loadUsageData);

  useEffect(() => {
    saveUsageData(usageData);
  }, [usageData]);

  const trackUsage = useCallback((path: string) => {
    setUsageData((prev) => {
      const existing = prev[path] || { path, count: 0, lastUsed: 0 };
      return {
        ...prev,
        [path]: {
          path,
          count: existing.count + 1,
          lastUsed: Date.now(),
        },
      };
    });
  }, []);

  const getTopApps = useCallback((count = 4): string[] => {
    return Object.values(usageData)
      .sort((a, b) => b.count - a.count)
      .slice(0, count)
      .map((item) => item.path);
  }, [usageData]);

  const getRecentApps = useCallback((count = 5): string[] => {
    return Object.values(usageData)
      .sort((a, b) => b.lastUsed - a.lastUsed)
      .slice(0, count)
      .map((item) => item.path);
  }, [usageData]);

  return {
    usageData,
    trackUsage,
    getTopApps,
    getRecentApps,
  };
}

export function AppUsageProvider({ children }: { children: React.ReactNode }) {
  const value = useAppUsageProvider();
  return (
    <AppUsageContext.Provider value={value}>
      {children}
    </AppUsageContext.Provider>
  );
}

export function useAppUsage() {
  const context = useContext(AppUsageContext);
  if (!context) {
    throw new Error('useAppUsage must be used within AppUsageProvider');
  }
  return context;
}

import { useLocation } from 'wouter';
import { X, Search, Grid3X3 } from 'lucide-react';
import { useState } from 'react';
import { NAV_ITEMS } from './CommandPalette';
import { useAppUsage } from '@/hooks/useAppUsage';
import { useAuth } from '@/hooks/useAuth';
import { Input } from '@/components/ui/input';

interface AppSwitcherDrawerProps {
  open: boolean;
  onClose: () => void;
  onOpenCommandPalette: () => void;
}

export function AppSwitcherDrawer({ open, onClose, onOpenCommandPalette }: AppSwitcherDrawerProps) {
  const [, navigate] = useLocation();
  const [location] = useLocation();
  const { user } = useAuth();
  const { trackUsage, getTopApps, usageData } = useAppUsage();
  const [searchQuery, setSearchQuery] = useState('');

  const isAdmin = (user as any)?.role === 'admin';
  const topAppPaths = getTopApps(4);

  const filteredItems = NAV_ITEMS
    .filter(item => !item.adminOnly || isAdmin)
    .filter(item => {
      if (!searchQuery) return true;
      const query = searchQuery.toLowerCase();
      return (
        item.label.toLowerCase().includes(query) ||
        item.keywords?.some(kw => kw.includes(query))
      );
    });

  const mainApps = filteredItems.filter(item => !item.adminOnly);
  const adminApps = filteredItems.filter(item => item.adminOnly);

  const handleNavigate = (path: string) => {
    trackUsage(path);
    navigate(path);
    onClose();
  };

  const getTileSize = (path: string): 'large' | 'normal' => {
    const isTopApp = topAppPaths.slice(0, 2).includes(path);
    const usage = usageData[path]?.count || 0;
    return isTopApp && usage >= 3 ? 'large' : 'normal';
  };

  if (!open) return null;

  return (
    <>
      <div 
        className="fixed inset-0 bg-black/30 backdrop-blur-sm z-50 transition-opacity"
        onClick={onClose}
        data-testid="app-switcher-overlay"
      />
      
      <div 
        className="fixed left-4 top-4 bottom-4 w-[340px] md:w-[420px] z-50 overflow-hidden rounded-2xl shadow-2xl"
        style={{
          background: 'rgba(255, 255, 255, 0.95)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.6)'
        }}
        data-testid="app-switcher-drawer"
      >
        <div className="h-full flex flex-col">
          <div className="flex items-center justify-between p-4 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <Grid3X3 className="h-5 w-5 text-gray-500" />
              <h2 className="text-lg font-semibold text-gray-900">Apps</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
              data-testid="button-close-switcher"
            >
              <X className="h-5 w-5 text-gray-500" />
            </button>
          </div>

          <div className="p-4 border-b border-gray-100">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search apps... (Press / or ⌘K)"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  onOpenCommandPalette();
                  onClose();
                }}
                className="pl-9 bg-gray-50 border-gray-200"
                data-testid="input-app-search"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {mainApps.length > 0 && (
              <div className="mb-6">
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Menu</p>
                <div className="grid grid-cols-3 gap-3">
                  {mainApps.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    const tileSize = getTileSize(item.path);
                    const usageCount = usageData[item.path]?.count || 0;
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        className={`
                          relative group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200
                          ${tileSize === 'large' ? 'col-span-2 row-span-1' : ''}
                          ${isActive 
                            ? 'bg-gray-900 text-white shadow-lg' 
                            : 'bg-gray-50 hover:bg-gray-100 text-gray-700 hover:shadow-md hover:-translate-y-0.5'
                          }
                        `}
                        style={{ aspectRatio: tileSize === 'large' ? '2/1' : '1/1' }}
                        data-testid={`tile-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        {usageCount >= 5 && (
                          <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-blue-500 animate-pulse" />
                        )}
                        <div className={`
                          w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-all
                          ${isActive 
                            ? 'bg-white/20' 
                            : 'bg-white shadow-sm group-hover:shadow'
                          }
                        `}>
                          <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                        </div>
                        <span className={`text-xs font-medium text-center leading-tight ${isActive ? 'text-white' : ''}`}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {adminApps.length > 0 && isAdmin && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3 px-1">Admin</p>
                <div className="grid grid-cols-3 gap-3">
                  {adminApps.map((item) => {
                    const Icon = item.icon;
                    const isActive = location === item.path;
                    
                    return (
                      <button
                        key={item.path}
                        onClick={() => handleNavigate(item.path)}
                        className={`
                          relative group flex flex-col items-center justify-center p-4 rounded-xl transition-all duration-200
                          ${isActive 
                            ? 'bg-purple-600 text-white shadow-lg' 
                            : 'bg-purple-50 hover:bg-purple-100 text-purple-700 hover:shadow-md hover:-translate-y-0.5'
                          }
                        `}
                        style={{ aspectRatio: '1/1' }}
                        data-testid={`tile-admin-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                      >
                        <div className={`
                          w-10 h-10 rounded-xl flex items-center justify-center mb-2 transition-all
                          ${isActive 
                            ? 'bg-white/20' 
                            : 'bg-white shadow-sm group-hover:shadow'
                          }
                        `}>
                          <Icon className={`h-5 w-5 ${isActive ? 'text-white' : 'text-purple-600'}`} />
                        </div>
                        <span className={`text-xs font-medium text-center leading-tight ${isActive ? 'text-white' : ''}`}>
                          {item.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="p-4 border-t border-gray-100 text-center">
            <p className="text-xs text-gray-400">Press <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">/</kbd> or <kbd className="px-1.5 py-0.5 bg-gray-100 rounded text-gray-600 font-mono">⌘K</kbd> for command palette</p>
          </div>
        </div>
      </div>
    </>
  );
}

import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Home, 
  FileText, 
  DollarSign, 
  Users, 
  Database, 
  Settings, 
  LogOut,
  Menu,
  Activity,
  Calculator,
  TrendingUp,
  Truck,
  RefreshCw,
  ChevronLeft,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import type { User } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { resetAppData } from '@/lib/cache';
import { queryClient } from '@/lib/queryClient';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

interface OdooLayoutProps {
  children: React.ReactNode;
}

const mainItems = [
  { path: '/', icon: Home, label: 'Dashboard' },
  { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes' },
  { path: '/price-list', icon: DollarSign, label: 'Price List' },
  { path: '/saved-quotes', icon: FileText, label: 'Saved Quotes' },
  { path: '/clients', icon: Users, label: 'Clients' },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping' },
];

const adminItems = [
  { path: '/admin', icon: Users, label: 'Users' },
  { path: '/activity-logs', icon: Activity, label: 'Activity' },
  { path: '/product-pricing-management', icon: Database, label: 'Products' },
  { path: '/pdf-settings', icon: FileText, label: 'PDF Settings' },
];

function SettingsMenu() {
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  const handleReset = () => {
    resetAppData({ whitelistKeys: ['theme'] });
  };
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="contra-icon-btn">
            <Settings className="h-4 w-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowResetDialog(true)} className="cursor-pointer">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset App Data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent className="glass-card">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-xl font-bold">Reset App Data</AlertDialogTitle>
            <AlertDialogDescription className="text-gray-500">
              This clears local filters and cache. Server data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="glass-btn">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="glass-btn-primary">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function OdooLayout({ children }: OdooLayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  
  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  };

  const isAdmin = (user as any)?.role === 'admin';
  
  const getUserInitials = (email: string | undefined): string => {
    if (!email) return 'U';
    const emailLower = email.toLowerCase();
    if (emailLower.includes('aneesh')) return 'AP';
    if (emailLower.includes('patricio')) return 'PD';
    if (emailLower.includes('santiago')) return 'SC';
    if (emailLower.includes('oscar')) return 'OA';
    if (emailLower.includes('warehouse') || emailLower.includes('rey')) return 'RC';
    if (emailLower.includes('gustavo')) return 'GR';
    return email.slice(0, 2).toUpperCase();
  };
  const userInitials = getUserInitials((user as any)?.email);

  return (
    <div className="min-h-screen flex" style={{
      background: 'linear-gradient(135deg, #e0e7ef 0%, #dfe7f2 25%, #e8e4f0 50%, #ede7e3 75%, #e5ebe8 100%)',
      backgroundSize: '400% 400%',
      animation: 'gentleShift 20s ease infinite'
    }}>
      {/* Global animation keyframes */}
      <style>{`
        @keyframes gentleShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes gentleFloat1 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, -30px); }
          66% { transform: translate(-20px, 20px); }
        }
        @keyframes gentleFloat2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-40px, 20px); }
          66% { transform: translate(25px, -25px); }
        }
        @keyframes gentleFloat3 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(20px, 30px); }
          66% { transform: translate(-30px, -20px); }
        }
      `}</style>

      {/* Ambient floating orbs */}
      <div style={{
        position: 'fixed',
        top: '15%',
        left: '10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(147, 197, 253, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat1 25s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{
        position: 'fixed',
        top: '50%',
        right: '15%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(196, 181, 253, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat2 30s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 0
      }} />
      <div style={{
        position: 'fixed',
        bottom: '20%',
        left: '35%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(167, 243, 208, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat3 22s ease-in-out infinite',
        pointerEvents: 'none',
        zIndex: 0
      }} />

      {/* Glass Sidebar */}
      <aside 
        className={`${sidebarExpanded ? 'w-64' : 'w-[72px]'} h-screen transition-all duration-300 flex flex-col fixed left-0 top-0 z-40`}
        style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(40px) saturate(150%)',
          WebkitBackdropFilter: 'blur(40px) saturate(150%)',
          borderRight: '1px solid rgba(255, 255, 255, 0.5)'
        }}
      >
        {/* Logo/Brand */}
        <div className="h-16 flex items-center justify-between px-4" style={{ borderBottom: '1px solid rgba(148, 163, 184, 0.15)' }}>
          {sidebarExpanded ? (
            <>
              <div className="flex items-center gap-2">
                <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center flex-shrink-0">
                  <span className="text-white font-bold text-sm">4S</span>
                </div>
                <div>
                  <h1 className="font-bold text-gray-900 text-base leading-tight">Graphics</h1>
                  <p className="text-[10px] text-gray-400 leading-tight">Portal</p>
                </div>
              </div>
              <SettingsMenu />
            </>
          ) : (
            <div className="w-full flex justify-center">
              <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
                <span className="text-white font-bold text-sm">4S</span>
              </div>
            </div>
          )}
        </div>

        {/* Toggle Button */}
        <button 
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center shadow-lg hover:scale-110 transition-all z-50"
          style={{
            background: 'rgba(255, 255, 255, 0.9)',
            backdropFilter: 'blur(10px)',
            border: '1px solid rgba(255, 255, 255, 0.5)'
          }}
        >
          {sidebarExpanded ? (
            <ChevronLeft className="h-3 w-3 text-gray-500" />
          ) : (
            <ChevronRight className="h-3 w-3 text-gray-500" />
          )}
        </button>

        {/* Navigation */}
        <nav className="flex-1 py-4 overflow-y-auto">
          {/* Main Items */}
          <div className="px-3 space-y-1">
            {sidebarExpanded && (
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Menu</p>
            )}
            {mainItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link 
                  key={item.path} 
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                    isActive 
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  }`}
                  title={!sidebarExpanded ? item.label : undefined}
                >
                  <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                  {sidebarExpanded && (
                    <span className="text-sm font-medium truncate">{item.label}</span>
                  )}
                </Link>
              );
            })}
          </div>

          {/* Admin Items */}
          {isAdmin && (
            <div className="px-3 space-y-1 mt-6">
              {sidebarExpanded && (
                <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-3 mb-2">Admin</p>
              )}
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group ${
                      isActive 
                        ? 'bg-gray-900 text-white'
                        : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                    }`}
                    title={!sidebarExpanded ? item.label : undefined}
                  >
                    <Icon className={`h-5 w-5 flex-shrink-0 ${isActive ? 'text-white' : ''}`} />
                    {sidebarExpanded && (
                      <span className="text-sm font-medium truncate">{item.label}</span>
                    )}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-3 border-t border-gray-100">
          {sidebarExpanded ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-2 rounded-xl bg-gray-50">
                <Avatar className="h-9 w-9 bg-gray-900">
                  <AvatarFallback className="bg-gray-900 text-white text-xs font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {(user as any)?.firstName || (user as any)?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-400 truncate">{(user as any)?.email}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                onClick={logout}
                disabled={isLoggingOut}
                className="w-full justify-start gap-2 text-gray-600 hover:text-red-600 hover:bg-red-50 disabled:opacity-50"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
                <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Avatar className="h-9 w-9 bg-gray-900">
                <AvatarFallback className="bg-gray-900 text-white text-xs font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <button
                onClick={logout}
                disabled={isLoggingOut}
                className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                data-testid="button-logout"
                title={isLoggingOut ? 'Logging out...' : 'Log out'}
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className={`flex-1 ${sidebarExpanded ? 'ml-64' : 'ml-[72px]'} transition-all duration-300 relative z-10`}>
        <div className="min-h-screen p-6">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}

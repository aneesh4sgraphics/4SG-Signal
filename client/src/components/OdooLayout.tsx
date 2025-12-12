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
  X,
  Building2,
  Activity,
  Calculator,
  TrendingUp,
  Truck,
  RefreshCw,
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
  { path: '/', icon: Home, label: 'Dashboard', hoverBg: 'linear-gradient(135deg, #3b82f6, #1d4ed8)' },
  { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes', hoverBg: 'linear-gradient(135deg, #10b981, #047857)' },
  { path: '/price-list', icon: DollarSign, label: 'Price List', hoverBg: 'linear-gradient(135deg, #fbbf24, #d97706)' },
  { path: '/saved-quotes', icon: FileText, label: 'Saved Quotes', hoverBg: 'linear-gradient(135deg, #a855f7, #7e22ce)' },
  { path: '/clients', icon: Building2, label: 'Client Database', hoverBg: 'linear-gradient(135deg, #06b6d4, #0891b2)' },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator', hoverBg: 'linear-gradient(135deg, #ec4899, #be185d)' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices', hoverBg: 'linear-gradient(135deg, #f97316, #c2410c)' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping Calculator', hoverBg: 'linear-gradient(135deg, #6366f1, #4338ca)' },
];

const adminItems = [
  { path: '/admin', icon: Users, label: 'User Management', hoverBg: 'linear-gradient(135deg, #ef4444, #b91c1c)' },
  { path: '/activity-logs', icon: Activity, label: 'Activity Logs', hoverBg: 'linear-gradient(135deg, #84cc16, #4d7c0f)' },
  { path: '/product-pricing-management', icon: Database, label: 'Product Pricing', hoverBg: 'linear-gradient(135deg, #f59e0b, #b45309)' },
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
          <Button variant="ghost" size="sm" className="p-2 hover:bg-gray-100">
            <Settings className="h-5 w-5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowResetDialog(true)} className="cursor-pointer">
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset App Data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="heading-sm">Reset App Data</AlertDialogTitle>
            <AlertDialogDescription className="body-base text-gray-600">
              This clears local filters/cache only. Saved quotes on the server are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="ghost-button">Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="primary-button">
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

export default function OdooLayout({ children }: OdooLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  
  const handleMouseEnter = () => setSidebarOpen(true);
  const handleMouseLeave = () => setSidebarOpen(false);
  
  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  };

  const isAdmin = (user as any)?.role === 'admin';
  const userInitials = (user as any)?.email?.slice(0, 2).toUpperCase() || 'U';

  return (
    <div className="min-h-screen bg-white flex">
      {/* Modern Sidebar */}
      <aside 
        className={`${sidebarOpen ? 'w-72' : 'w-20'} bg-gray-50 border-r border-gray-200 h-screen transition-all duration-300 flex flex-col`}
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {/* Header */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            {sidebarOpen ? (
              <>
                <div className="space-y-1">
                  <h1 className="heading-sm text-black">4S Graphics</h1>
                  <p className="body-sm text-gray-500">Employee Portal</p>
                </div>
                <SettingsMenu />
              </>
            ) : (
              <div className="flex justify-center w-full">
                <Menu className="h-5 w-5 text-gray-500" />
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-8 overflow-y-auto">
          {/* Main Items */}
          <div className="space-y-1">
            {sidebarOpen && (
              <p className="label-caps text-gray-500 px-3 mb-3">Main</p>
            )}
            {mainItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link 
                  key={item.path} 
                  href={item.path}
                  className={`group flex items-center ${sidebarOpen ? 'justify-between px-3 py-2' : 'justify-center px-2 py-3'} rounded-xl transition-all duration-200 cursor-pointer ${
                    isActive 
                      ? 'bg-gray-100 shadow-sm'
                      : 'hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div 
                      className={`${sidebarOpen ? 'w-9 h-9' : 'w-10 h-10'} rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 nav-icon-box`}
                      style={{ '--hover-bg': item.hoverBg } as React.CSSProperties}
                    >
                      <Icon className={`${sidebarOpen ? 'h-4 w-4' : 'h-5 w-5'} transition-colors duration-300 nav-icon`} />
                    </div>
                    {sidebarOpen && <span className={`font-medium body-sm ${isActive ? 'text-black' : 'text-gray-700'}`}>{item.label}</span>}
                  </div>
                  {sidebarOpen && isActive && <ChevronRight className="h-4 w-4 text-gray-500" />}
                </Link>
              );
            })}
          </div>

          {/* Admin Items */}
          {isAdmin && (
            <div className="space-y-1">
              {sidebarOpen && (
                <p className="label-caps text-gray-500 px-3 mb-3">Admin</p>
              )}
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                
                return (
                  <Link 
                    key={item.path} 
                    href={item.path}
                    className={`group flex items-center ${sidebarOpen ? 'justify-between px-3 py-2' : 'justify-center px-2 py-3'} rounded-xl transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? 'bg-gray-100 shadow-sm'
                        : 'hover:bg-gray-100'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div 
                        className={`${sidebarOpen ? 'w-9 h-9' : 'w-10 h-10'} rounded-xl flex items-center justify-center shadow-sm transition-all duration-300 nav-icon-box`}
                        style={{ '--hover-bg': item.hoverBg } as React.CSSProperties}
                      >
                        <Icon className={`${sidebarOpen ? 'h-4 w-4' : 'h-5 w-5'} transition-colors duration-300 nav-icon`} />
                      </div>
                      {sidebarOpen && <span className={`font-medium body-sm ${isActive ? 'text-black' : 'text-gray-700'}`}>{item.label}</span>}
                    </div>
                    {sidebarOpen && isActive && <ChevronRight className="h-4 w-4 text-gray-500" />}
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-gray-200">
          {sidebarOpen ? (
            <div className="space-y-3">
              <div className="flex items-center gap-3 p-3 rounded-lg bg-white border border-gray-200">
                <Avatar className="h-10 w-10 bg-black">
                  <AvatarFallback className="bg-black text-white font-semibold">
                    {userInitials}
                  </AvatarFallback>
                </Avatar>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-black truncate">
                    {(user as any)?.firstName || (user as any)?.email?.split('@')[0] || 'User'}
                  </p>
                  <p className="text-xs text-gray-500 truncate">{(user as any)?.email}</p>
                </div>
              </div>
              <Button
                variant="outline"
                onClick={logout}
                disabled={isLoggingOut}
                className="w-full justify-center gap-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 disabled:opacity-50"
                data-testid="button-logout"
                aria-label="Log out of your account"
              >
                <LogOut className="h-4 w-4" />
                <span>{isLoggingOut ? 'Logging out...' : 'Logout'}</span>
              </Button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <Avatar className="h-10 w-10 bg-black">
                <AvatarFallback className="bg-black text-white font-semibold">
                  {userInitials}
                </AvatarFallback>
              </Avatar>
              <Button
                variant="outline"
                size="sm"
                onClick={logout}
                disabled={isLoggingOut}
                className="p-2 text-red-600 border-red-200 hover:bg-red-50 hover:border-red-300 hover:text-red-700 rounded-lg disabled:opacity-50"
                data-testid="button-logout"
                aria-label="Log out of your account"
                title={isLoggingOut ? 'Logging out...' : 'Logout'}
              >
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto bg-white">
        <div className="p-8 max-w-[1600px] mx-auto">
          {children}
        </div>
      </main>
    </div>
  );
}

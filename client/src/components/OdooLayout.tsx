import React, { useState } from 'react';
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
  { path: '/', icon: Home, label: 'Dashboard' },
  { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes' },
  { path: '/price-list', icon: DollarSign, label: 'Price List' },
  { path: '/saved-quotes', icon: FileText, label: 'Saved Quotes' },
  { path: '/clients', icon: Building2, label: 'Client Database' },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'ComIntel' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping Calculator' },
];

const adminItems = [
  { path: '/admin', icon: Users, label: 'User Management' },
  { path: '/activity-logs', icon: Activity, label: 'Activity Logs' },
  { path: '/product-pricing-management', icon: Database, label: 'Product Pricing' },
];

function SettingsMenu() {
  const [showResetDialog, setShowResetDialog] = React.useState(false);
  
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
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [location] = useLocation();
  const { user } = useAuth();
  
  const logout = () => {
    queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
    queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    queryClient.invalidateQueries({ queryKey: ['/api/sent-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['/api/upload-batches'] });
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
      <aside className={`${sidebarOpen ? 'w-72' : 'w-20'} bg-gray-50 border-r border-gray-200 h-screen transition-all duration-300 flex flex-col`}>
        {/* Header */}
        <div className="p-6 border-b border-gray-200">
          <div className="flex items-center justify-between mb-4">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="p-2 hover:bg-gray-200 rounded-lg"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
            {sidebarOpen && <SettingsMenu />}
          </div>
          
          {sidebarOpen && (
            <div className="space-y-1">
              <h1 className="heading-sm text-black">4S Graphics</h1>
              <p className="body-sm text-gray-500">Employee Portal</p>
            </div>
          )}
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
                <Link key={item.path} href={item.path}>
                  <a className={`group flex items-center ${sidebarOpen ? 'justify-between px-4 py-3' : 'justify-center px-3 py-4'} rounded-lg transition-all duration-200 cursor-pointer ${
                    isActive 
                      ? 'bg-black text-white shadow-sm'
                      : 'text-gray-700 hover:bg-gray-200'
                  }`}>
                    <div className="flex items-center gap-3">
                      <Icon className={`${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'} transition-all duration-200 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                      {sidebarOpen && <span className="font-medium body-sm">{item.label}</span>}
                    </div>
                    {sidebarOpen && isActive && <ChevronRight className="h-4 w-4" />}
                  </a>
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
                  <Link key={item.path} href={item.path}>
                    <a className={`group flex items-center ${sidebarOpen ? 'justify-between px-4 py-3' : 'justify-center px-3 py-4'} rounded-lg transition-all duration-200 cursor-pointer ${
                      isActive 
                        ? 'bg-primary text-white shadow-sm'
                        : 'text-gray-700 hover:bg-gray-200'
                    }`}>
                      <div className="flex items-center gap-3">
                        <Icon className={`${sidebarOpen ? 'h-5 w-5' : 'h-6 w-6'} transition-all duration-200 ${isActive ? 'text-white' : 'text-gray-600'}`} />
                        {sidebarOpen && <span className="font-medium body-sm">{item.label}</span>}
                      </div>
                      {sidebarOpen && isActive && <ChevronRight className="h-4 w-4" />}
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User Profile */}
        <div className="p-4 border-t border-gray-200">
          {sidebarOpen ? (
            <div className="flex items-center justify-between p-3 rounded-lg bg-white border border-gray-200">
              <div className="flex items-center gap-3">
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
                variant="ghost"
                size="sm"
                onClick={logout}
                className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg"
                data-testid="button-logout"
              >
                <LogOut className="h-4 w-4" />
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
                variant="ghost"
                size="sm"
                onClick={logout}
                className="p-2 hover:bg-red-50 hover:text-red-600 rounded-lg"
                data-testid="button-logout"
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

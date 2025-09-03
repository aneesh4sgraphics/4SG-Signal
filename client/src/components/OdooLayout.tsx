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
  ScanText,
  RefreshCw
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
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'ComIntel' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping Calculator' },
  { path: '/text-parser', icon: ScanText, label: 'Text Parser' },
];

const adminItems = [
  { path: '/admin', icon: Users, label: 'User Management' },
  { path: '/activity-logs', icon: Activity, label: 'Activity Logs' },
  { path: '/customers', icon: Building2, label: 'Customers' },
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
          <Button variant="ghost" size="sm" className="p-2">
            <Settings className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setShowResetDialog(true)}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Reset App Data
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      
      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset App Data</AlertDialogTitle>
            <AlertDialogDescription>
              This clears local filters/cache only. Saved quotes on the server are not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset}>
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
    // Invalidate all user-specific queries
    queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
    queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    queryClient.invalidateQueries({ queryKey: ['/api/sent-quotes'] });
    queryClient.invalidateQueries({ queryKey: ['/api/upload-batches'] });
    queryClient.clear(); // Clear all cache
    
    // Clear any local storage first
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  };

  const isAdmin = (user as any)?.role === 'admin';

  return (
    <div className="min-h-screen bg-gray-50 flex">
      {/* Sidebar */}
      <aside className={`${sidebarOpen ? 'w-60' : 'w-16'} bg-white h-screen border-r border-gray-200 transition-all duration-300 flex flex-col`}>
        {/* Header */}
        <div className="p-4 border-b border-gray-200 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <img 
              src="/company-logo.jpg" 
              alt="4S Graphics Logo" 
              className="h-8 w-8 object-contain flex-shrink-0"
            />
            {sidebarOpen && (
              <div>
                <h1 className="text-lg font-semibold text-gray-900">4S Graphics</h1>
                <p className="text-xs text-gray-500">Employee Portal</p>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="p-2"
          >
            {sidebarOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 p-4 space-y-4">
          {/* Main Items */}
          <div className="space-y-2">
            {mainItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              
              return (
                <Link key={item.path} href={item.path}>
                  <a className={`flex items-center ${sidebarOpen ? 'space-x-3 px-3 py-2' : 'justify-center px-2 py-3'} rounded-md text-sm font-medium transition-colors cursor-pointer ${
                    isActive 
                      ? 'bg-purple-100 text-purple-700 border border-purple-200'
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}>
                    <Icon className={`${sidebarOpen ? 'h-5 w-5' : 'h-7 w-7'} transition-all duration-300`} />
                    {sidebarOpen && <span>{item.label}</span>}
                  </a>
                </Link>
              );
            })}
          </div>

          {/* Admin Section */}
          {isAdmin && (
            <div className="space-y-2">
              {sidebarOpen && (
                <div className="px-3 py-2">
                  <h3 className="text-xs font-semibold text-orange-600 uppercase tracking-wider">
                    Administration
                  </h3>
                </div>
              )}
              {adminItems.map((item) => {
                const Icon = item.icon;
                const isActive = location === item.path;
                
                return (
                  <Link key={item.path} href={item.path}>
                    <a className={`flex items-center ${sidebarOpen ? 'space-x-3 px-3 py-2' : 'justify-center px-2 py-3'} rounded-md text-sm font-medium transition-colors cursor-pointer ${
                      isActive 
                        ? 'bg-orange-100 text-orange-700 border border-orange-200'
                        : 'text-orange-700 hover:bg-orange-50'
                    }`}>
                      <Icon className={`${sidebarOpen ? 'h-5 w-5' : 'h-7 w-7'} transition-all duration-300`} />
                      {sidebarOpen && <span>{item.label}</span>}
                    </a>
                  </Link>
                );
              })}
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="p-4 border-t border-gray-200">
          <div className={`flex items-center ${sidebarOpen ? 'space-x-3' : 'justify-center'}`}>
            <Avatar className="h-8 w-8">
              <AvatarFallback className="bg-purple-100 text-purple-700 text-xs">
                {(user as any)?.email?.charAt(0).toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  {(user as any)?.email?.split('@')[0] || 'User'}
                </p>
                <p className="text-xs text-gray-500 capitalize">{(user as any)?.role || 'employee'}</p>
              </div>
            )}
          </div>
          {sidebarOpen && (
            <Button
              variant="ghost"
              size="sm"
              onClick={logout}
              className="w-full mt-3 justify-start text-gray-600 hover:text-gray-900"
            >
              <LogOut className="h-4 w-4 mr-2" />
              Sign Out
            </Button>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Bar */}
        <header className="bg-white border-b border-gray-200 px-6 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-xl font-semibold text-gray-900">
                {[...mainItems, ...adminItems].find(item => item.path === location)?.label || 'Dashboard'}
              </h2>
              <nav className="flex items-center space-x-2 text-sm text-gray-500 mt-1">
                <span>Home</span>
                <span>/</span>
                <span className="text-gray-900">
                  {[...mainItems, ...adminItems].find(item => item.path === location)?.label || 'Dashboard'}
                </span>
              </nav>
            </div>
            <div className="flex items-center space-x-3">
              <SettingsMenu />
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {children}
        </div>
      </main>
    </div>
  );
}
import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import logoPath from '@assets/4s_logo_Clean_120x_1764801255491.png';
import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import type { User } from '@shared/schema';
import { useAuth } from '@/hooks/useAuth';
import { useAppUsage, AppUsageProvider } from '@/hooks/useAppUsage';
import { CommandPalette, useCommandPalette, NAV_ITEMS } from './CommandPalette';
import { AppSwitcherDrawer } from './AppSwitcherDrawer';
import {
  SettingsIcon,
  LogoutIcon,
  MenuIcon,
  GridIcon,
  RefreshIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CommandIcon,
} from '@/components/HandDrawnIcons';
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
import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { useIsMobile } from '@/hooks/use-mobile';

interface OdooLayoutProps {
  children: React.ReactNode;
}

const coreItems = NAV_ITEMS.filter(item => !item.adminOnly && item.group === 'core');
const toolItems = NAV_ITEMS.filter(item => !item.adminOnly && item.group === 'tools');
const adminItems = NAV_ITEMS.filter(item => item.adminOnly);

function SettingsMenu() {
  const [showResetDialog, setShowResetDialog] = useState(false);
  
  const handleReset = () => {
    resetAppData({ whitelistKeys: ['theme', '4s-app-usage-data'] });
  };
  
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
            <SettingsIcon className="h-4 w-4 text-gray-500" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem onClick={() => setShowResetDialog(true)} className="cursor-pointer">
            <RefreshIcon className="h-4 w-4 mr-2" />
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

function OdooLayoutContent({ children }: OdooLayoutProps) {
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [toolsExpanded, setToolsExpanded] = useState(() => {
    try { return localStorage.getItem('4s-tools-expanded') === 'true'; } catch { return false; }
  });
  const [appSwitcherOpen, setAppSwitcherOpen] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  const { trackUsage } = useAppUsage();
  const { open: commandOpen, setOpen: setCommandOpen } = useCommandPalette();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (location) {
      trackUsage(location);
    }
  }, [location, trackUsage]);

  
  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  };

  const toggleTools = () => {
    const next = !toolsExpanded;
    setToolsExpanded(next);
    try { localStorage.setItem('4s-tools-expanded', String(next)); } catch {}
  };

  const isToolActive = toolItems.some(item => location === item.path);

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

  const MobileSidebar = () => (
    <Sheet>
      <SheetTrigger asChild>
        <button 
          className="lg:hidden fixed left-4 top-4 z-50 p-2.5 rounded-lg bg-white border border-[#EAEAEA] shadow-sm hover:bg-[#F7F7F5] transition-all duration-150 ease-out"
          data-testid="button-mobile-menu"
        >
          <MenuIcon className="h-5 w-5 text-[#37352F]" />
        </button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[300px] p-0">
        <div className="h-full flex flex-col bg-white">
          <div className="h-16 flex items-center gap-3 px-4 border-b">
            <img src={logoPath} alt="4S Graphics" className="w-9 h-9 object-contain" />
            <div>
              <h1 className="font-bold text-gray-900">4S Graphics</h1>
              <p className="text-xs text-gray-400">Portal</p>
            </div>
          </div>
          
          <button
            onClick={() => setAppSwitcherOpen(true)}
            className="m-4 flex items-center gap-3 px-4 py-2.5 rounded-lg bg-[#F7F7F5] hover:bg-[#EAEAEA] transition-all duration-150 ease-out"
            data-testid="button-mobile-app-switcher"
          >
            <GridIcon className="h-5 w-5 text-[#73726E]" />
            <span className="font-medium text-[#37352F]">All Apps</span>
          </button>
          
          <nav className="flex-1 px-4 py-2 overflow-y-auto">
            <p className="text-[11px] font-medium text-[#9B9A97] uppercase tracking-wide px-3 mb-2">Menu</p>
            {coreItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ease-out mb-1 relative ${
                    isActive 
                      ? 'bg-[#F7F7F5] text-[#37352F] font-medium' 
                      : 'text-[#73726E] hover:bg-[#F7F7F5]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#37352F] rounded-r-full" />
                  )}
                  <span 
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  >
                    <Icon className="h-5 w-5 text-[#37352F]" />
                  </span>
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}

            <button
              onClick={toggleTools}
              className="flex items-center gap-3 px-3 py-2 rounded-lg w-full text-[#9B9A97] hover:bg-[#F7F7F5] hover:text-[#37352F] transition-all duration-150 ease-out mt-2 mb-1"
            >
              <ChevronRightIcon className={`h-3 w-3 transition-transform duration-200 ${toolsExpanded ? 'rotate-90' : ''}`} />
              <span className="text-[11px] font-medium uppercase tracking-wide">Tools</span>
              {isToolActive && !toolsExpanded && (
                <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
              )}
            </button>
            {toolsExpanded && toolItems.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              return (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ease-out mb-1 relative ${
                    isActive 
                      ? 'bg-[#F7F7F5] text-[#37352F] font-medium' 
                      : 'text-[#73726E] hover:bg-[#F7F7F5]'
                  }`}
                >
                  {isActive && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-[#37352F] rounded-r-full" />
                  )}
                  <span 
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0"
                  >
                    <Icon className="h-5 w-5 text-[#37352F]" />
                  </span>
                  <span className="text-sm">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          
          <div className="p-4 border-t">
            <div className="flex items-center gap-3 p-2 rounded-xl bg-gray-50 mb-3">
              <Avatar className="h-9 w-9 bg-gray-900">
                <AvatarFallback className="bg-gray-900 text-white text-xs font-semibold">{userInitials}</AvatarFallback>
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
              className="w-full justify-start gap-2 text-gray-600 hover:text-red-600 hover:bg-red-50"
              data-testid="button-logout-mobile"
            >
              <LogoutIcon className="h-4 w-4" />
              <span>{isLoggingOut ? 'Logging out...' : 'Log out'}</span>
            </Button>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );

  return (
    <div className="min-h-screen flex bg-[#F7F7F7]">

      {isMobile && <MobileSidebar />}

      <aside 
        className={`hidden lg:flex ${sidebarExpanded ? 'w-64' : 'w-[72px]'} h-screen transition-all duration-200 ease-out flex-col fixed left-0 top-0 z-40 bg-white border-r border-[#EAEAEA]`}
      >
        <div className="h-14 flex items-center justify-between px-4 border-b border-[#EAEAEA]">
          {sidebarExpanded ? (
            <>
              <div className="flex items-center gap-2">
                <img src={logoPath} alt="4S Graphics Logo" className="w-9 h-9 object-contain flex-shrink-0" />
                <div>
                  <h1 className="font-bold text-gray-900 text-base leading-tight">4S Graphics</h1>
                  <p className="text-[10px] text-gray-400 leading-tight">Portal</p>
                </div>
              </div>
              <SettingsMenu />
            </>
          ) : (
            <div className="w-full flex justify-center">
              <img src={logoPath} alt="4S Graphics Logo" className="w-9 h-9 object-contain" />
            </div>
          )}
        </div>

        <button 
          onClick={() => setSidebarExpanded(!sidebarExpanded)}
          className="absolute -right-3 top-20 w-6 h-6 rounded-full flex items-center justify-center bg-white border border-[#EAEAEA] hover:bg-[#F7F7F5] transition-all duration-150 ease-out z-50 shadow-sm"
          data-testid="button-toggle-sidebar"
        >
          {sidebarExpanded ? <ChevronLeftIcon className="h-3 w-3 text-[#73726E]" /> : <ChevronRightIcon className="h-3 w-3 text-[#73726E]" />}
        </button>

        <nav className="flex-1 py-2 overflow-y-auto">
          <TooltipProvider delayDuration={100}>
          {(() => {
            const renderNavItem = (item: typeof coreItems[0]) => {
              const Icon = item.icon;
              const isActive = location === item.path;
              const bg = item.iconBg || '#2563eb';
              const fg = item.iconColor || '#ffffff';

              const linkContent = (
                <Link
                  key={item.path}
                  href={item.path}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg transition-all duration-150 ease-out group relative ${
                    isActive
                      ? 'font-medium'
                      : 'text-[#73726E] hover:bg-[#F7F7F5] hover:text-[#37352F]'
                  }`}
                  style={isActive ? { backgroundColor: `${bg}18`, color: bg } : undefined}
                >
                  {isActive && (
                    <span
                      className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-6 rounded-r-full"
                      style={{ backgroundColor: bg }}
                    />
                  )}
                  <span
                    className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 transition-all duration-150"
                    style={isActive ? { backgroundColor: bg } : undefined}
                  >
                    <Icon
                      className="h-5 w-5"
                      style={isActive ? { color: fg } : undefined}
                    />
                  </span>
                  {sidebarExpanded && (
                    <span className="text-sm truncate">{item.label}</span>
                  )}
                </Link>
              );

              if (!sidebarExpanded) {
                return (
                  <Tooltip key={item.path}>
                    <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
                    <TooltipContent side="right" className="font-medium">
                      <p>{item.label}</p>
                    </TooltipContent>
                  </Tooltip>
                );
              }
              return <div key={item.path}>{linkContent}</div>;
            };

            return (
              <>
                <div className="px-3 space-y-1">
                  {sidebarExpanded && (
                    <p className="text-[11px] font-medium text-[#9B9A97] uppercase tracking-wide px-3 mb-2">Menu</p>
                  )}
                  {coreItems.map(renderNavItem)}
                </div>

                <div className="px-3 space-y-1 mt-3">
                  <button
                    onClick={toggleTools}
                    className={`flex items-center gap-3 px-3 py-2 rounded-lg w-full transition-all duration-150 ease-out ${
                      isToolActive && !toolsExpanded
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-[#9B9A97] hover:bg-[#F7F7F5] hover:text-[#37352F]'
                    }`}
                  >
                    {sidebarExpanded ? (
                      <>
                        <ChevronRightIcon className={`h-3 w-3 transition-transform duration-200 ${toolsExpanded ? 'rotate-90' : ''}`} />
                        <span className="text-[11px] font-medium uppercase tracking-wide">Tools</span>
                        {isToolActive && !toolsExpanded && (
                          <span className="ml-auto w-1.5 h-1.5 rounded-full bg-blue-600" />
                        )}
                      </>
                    ) : (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0">
                            <ChevronRightIcon className={`h-4 w-4 text-[#73726E] transition-transform duration-200 ${toolsExpanded ? 'rotate-90' : ''}`} />
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="right" className="font-medium">
                          <p>Tools</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </button>
                  {(toolsExpanded || isToolActive) && toolItems.map((item) => {
                    if (!toolsExpanded && location !== item.path) return null;
                    return renderNavItem(item);
                  })}
                </div>

                {isAdmin && (
                  <div className="px-3 space-y-1 mt-6">
                    {sidebarExpanded && (
                      <p className="text-[11px] font-medium text-[#9B9A97] uppercase tracking-wide px-3 mb-2">Admin</p>
                    )}
                    {adminItems.map(renderNavItem)}
                  </div>
                )}
              </>
            );
          })()}
          </TooltipProvider>
        </nav>

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
                <LogoutIcon className="h-4 w-4" />
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
                <LogoutIcon className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      <main className={`flex-1 ${isMobile ? 'ml-0 pt-20' : sidebarExpanded ? 'lg:ml-64' : 'lg:ml-[72px]'} transition-all duration-300 relative z-10`}>
        <div className="min-h-screen p-6">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
      <AppSwitcherDrawer 
        open={appSwitcherOpen} 
        onClose={() => setAppSwitcherOpen(false)}
        onOpenCommandPalette={() => setCommandOpen(true)}
      />
    </div>
  );
}

export default function OdooLayout({ children }: OdooLayoutProps) {
  return (
    <AppUsageProvider>
      <OdooLayoutContent>{children}</OdooLayoutContent>
    </AppUsageProvider>
  );
}

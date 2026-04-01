import { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import logoPath from '@assets/4s_logo_Clean_120x_1764801255491.png';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { useAuth } from '@/hooks/useAuth';
import { useAppUsage, AppUsageProvider } from '@/hooks/useAppUsage';
import { CommandPalette, useCommandPalette } from './CommandPalette';
import {
  Search,
  Settings,
  ChevronDown,
  ChevronRight,
  Menu,
  Home,
  LayoutDashboard,
  FileText,
  Mail,
  BarChart3,
  Users,
  Building2,
  Target,
  Sparkles,
  Package,
  Truck,
  Tag,
  TrendingUp,
  Calendar,
  BookOpen,
  ListChecks,
  Activity,
  Layers,
  RefreshCw,
  Settings2,
  DollarSign,
  Clock,
  Contact,
  Zap,
  Lightbulb,
  ShoppingBag,
  Database,
  LogOut,
} from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { resetAppData } from '@/lib/cache';
import { queryClient } from '@/lib/queryClient';
import { filterAppsByUser } from '@/lib/nav-links';

interface OdooLayoutProps {
  children: React.ReactNode;
}

interface NavItemDef {
  path: string;
  label: string;
  icon: React.ElementType;
  iconColor: string;
  adminOnly?: boolean;
}

// ── Top pinned items (always visible, no section header) ──────────────────────
const TOP_ITEMS: NavItemDef[] = [
  { path: '/dashboard', label: 'Home', icon: Home, iconColor: '#6366f1' },
  { path: '/', label: 'Spotlight', icon: Sparkles, iconColor: '#f59e0b' },
];

// ── Main flat list (no section header) ───────────────────────────────────────
const MAIN_ITEMS: NavItemDef[] = [
  { path: '/leads', label: 'Leads', icon: Zap, iconColor: '#10b981' },
  { path: '/odoo-contacts', label: 'Contacts', icon: Contact, iconColor: '#6366f1' },
  { path: '/customer-management', label: 'Companies', icon: Building2, iconColor: '#8b5cf6' },
  { path: '/opportunities', label: 'Opportunities', icon: Target, iconColor: '#f59e0b' },
  { path: '/quick-quotes', label: 'QuickQuotes', icon: DollarSign, iconColor: '#d97706' },
  { path: '/price-list', label: 'Price List', icon: FileText, iconColor: '#ca8a04' },
  { path: '/saved-quotes', label: 'Saved Quotes', icon: BookOpen, iconColor: '#be185d' },
  { path: '/competitor-pricing', label: 'Market Prices', icon: TrendingUp, iconColor: '#0c6e99' },
  { path: '/shipping-calculator', label: 'Shipping', icon: Truck, iconColor: '#d97706' },
  { path: '/shipping-labels', label: 'Shipping Labels', icon: Package, iconColor: '#6366f1' },
  { path: '/product-labels', label: 'Product Labels', icon: Tag, iconColor: '#0e7b6c' },
];

// ── Automations section (collapsible) ─────────────────────────────────────────
const AUTOMATION_ITEMS: NavItemDef[] = [
  { path: '/tasks', label: 'Tasks', icon: ListChecks, iconColor: '#f59e0b' },
  { path: '/crm-journey', label: 'CRM Journey', icon: Target, iconColor: '#8b5cf6' },
  { path: '/calendar', label: 'Calendar', icon: Calendar, iconColor: '#ef4444' },
];

// ── Admin section (collapsible, admin only) ───────────────────────────────────
const ADMIN_ITEMS: NavItemDef[] = [
  { path: '/integrations', label: 'Integrations', icon: Settings2, iconColor: '#0c6e99', adminOnly: true },
  { path: '/email-app', label: 'Email Studio', icon: Mail, iconColor: '#ad1972', adminOnly: true },
  { path: '/reports', label: 'Reports', icon: BarChart3, iconColor: '#3b82f6', adminOnly: true },
  { path: '/admin', label: 'Users', icon: Users, iconColor: '#ef4444', adminOnly: true },
  { path: '/customer-margins', label: 'Customer Margins', icon: BarChart3, iconColor: '#7c3aed', adminOnly: true },
  { path: '/spotlight-overview', label: 'Spotlight Overview', icon: Clock, iconColor: '#4f46e5', adminOnly: true },
  { path: '/activity-logs', label: 'Activity', icon: Activity, iconColor: '#d97706', adminOnly: true },
  { path: '/product-pricing-management', label: 'Products Pricing', icon: Database, iconColor: '#0284c7', adminOnly: true },
  { path: '/product-mapping', label: 'Product Mapping', icon: Layers, iconColor: '#d97706', adminOnly: true },
  { path: '/pdf-settings', label: 'PDF Settings', icon: FileText, iconColor: '#64473a', adminOnly: true },
  { path: '/odoo-settings', label: 'Odoo', icon: RefreshCw, iconColor: '#693fa5', adminOnly: true },
  { path: '/shopify-settings', label: 'Shopify', icon: ShoppingBag, iconColor: '#0e7b6c', adminOnly: true },
];

function getUserInitials(email: string | undefined): string {
  if (!email) return 'U';
  const e = email.toLowerCase();
  if (e.includes('aneesh')) return 'AP';
  if (e.includes('patricio')) return 'PD';
  if (e.includes('santiago')) return 'SC';
  if (e.includes('oscar')) return 'OA';
  if (e.includes('warehouse') || e.includes('rey')) return 'RC';
  if (e.includes('gustavo')) return 'GR';
  return email.slice(0, 2).toUpperCase();
}

function NavLink({ item, isActive, onClick }: { item: NavItemDef; isActive: boolean; onClick?: () => void }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.path}
      onClick={onClick}
      className={`flex items-center gap-2.5 px-2 py-[5px] rounded-md text-sm transition-colors duration-100 ${
        isActive
          ? 'bg-gray-100 text-gray-900 font-medium'
          : 'text-gray-500 hover:bg-gray-50 hover:text-gray-700'
      }`}
    >
      <Icon
        className="h-[15px] w-[15px] flex-shrink-0"
        style={{ color: isActive ? item.iconColor : '#9ca3af' }}
      />
      <span className="truncate leading-snug">{item.label}</span>
    </Link>
  );
}

function CollapsibleSection({
  label,
  items,
  isAdmin,
  location,
  storageKey,
  onNavClick,
}: {
  label: string;
  items: NavItemDef[];
  isAdmin: boolean;
  location: string;
  storageKey: string;
  onNavClick?: () => void;
}) {
  const [open, setOpen] = useState(() => {
    try { return localStorage.getItem(storageKey) !== 'false'; } catch { return true; }
  });

  const visibleItems = items.filter(i => !i.adminOnly || isAdmin);
  if (visibleItems.length === 0) return null;

  const toggle = () => {
    const next = !open;
    setOpen(next);
    try { localStorage.setItem(storageKey, String(next)); } catch {}
  };

  return (
    <div className="mt-3">
      <button
        onClick={toggle}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wider hover:text-gray-500 transition-colors"
      >
        {open
          ? <ChevronDown className="h-3 w-3 flex-shrink-0" />
          : <ChevronRight className="h-3 w-3 flex-shrink-0" />
        }
        {label}
      </button>
      {open && (
        <div className="mt-0.5 space-y-px">
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              item={item}
              isActive={location === item.path}
              onClick={onNavClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SidebarContent({
  location,
  isAdmin,
  user,
  userInitials,
  onLogout,
  isLoggingOut,
  onNavClick,
  onOpenCommand,
}: {
  location: string;
  isAdmin: boolean;
  user: any;
  userInitials: string;
  onLogout: () => void;
  isLoggingOut: boolean;
  onNavClick?: () => void;
  onOpenCommand: () => void;
}) {
  const [showResetDialog, setShowResetDialog] = useState(false);
  const userEmail = user?.email as string | undefined;
  const visibleMainItems = filterAppsByUser(MAIN_ITEMS, userEmail);

  return (
    <div className="h-full flex flex-col bg-white select-none">
      {/* Header */}
      <div className="flex items-center justify-between px-3 h-11 border-b border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <img src={logoPath} alt="4S Graphics" className="w-5 h-5 object-contain flex-shrink-0" />
          <span className="text-[13px] font-semibold text-gray-800 truncate">4S Graphics, inc</span>
          <ChevronDown className="h-3 w-3 text-gray-400 flex-shrink-0" />
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={onOpenCommand}
            className="p-1.5 rounded-md hover:bg-gray-100 transition-colors"
            title="Search (⌘K)"
          >
            <Search className="h-3.5 w-3.5 text-gray-400" />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="p-1.5 rounded-md hover:bg-gray-100 transition-colors">
                <Settings className="h-3.5 w-3.5 text-gray-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuItem onClick={() => setShowResetDialog(true)} className="cursor-pointer text-sm">
                <RefreshCw className="h-3.5 w-3.5 mr-2 text-gray-500" />
                Reset App Data
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={onLogout}
                disabled={isLoggingOut}
                className="cursor-pointer text-sm text-red-600 focus:text-red-600"
              >
                <LogOut className="h-3.5 w-3.5 mr-2" />
                {isLoggingOut ? 'Logging out...' : 'Log out'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto px-2 py-2">
        {/* Top pinned items */}
        <div className="space-y-px mb-1">
          {TOP_ITEMS.map(item => (
            <NavLink
              key={item.path}
              item={item}
              isActive={location === item.path}
              onClick={onNavClick}
            />
          ))}
        </div>

        {/* Divider */}
        <div className="my-2 border-t border-gray-100" />

        {/* Main flat list */}
        <div className="space-y-px">
          {visibleMainItems.map(item => (
            <NavLink
              key={item.path}
              item={item}
              isActive={location === item.path}
              onClick={onNavClick}
            />
          ))}
        </div>

        {/* Automations collapsible */}
        <CollapsibleSection
          label="Automations"
          items={AUTOMATION_ITEMS}
          isAdmin={isAdmin}
          location={location}
          storageKey="4s-nav-automations"
          onNavClick={onNavClick}
        />

        {/* Admin collapsible */}
        {isAdmin && (
          <CollapsibleSection
            label="Admin"
            items={ADMIN_ITEMS}
            isAdmin={isAdmin}
            location={location}
            storageKey="4s-nav-admin"
            onNavClick={onNavClick}
          />
        )}
      </nav>

      {/* Footer */}
      <div className="px-2 py-2 border-t border-gray-100 flex-shrink-0">
        <div className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors">
          <Avatar className="h-5 w-5 flex-shrink-0">
            <AvatarFallback className="bg-gray-800 text-white text-[9px] font-semibold">
              {userInitials}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-gray-700 truncate leading-none">
              {user?.firstName || user?.email?.split('@')[0] || 'User'}
            </p>
            <p className="text-[10px] text-gray-400 truncate mt-0.5">{user?.email}</p>
          </div>
        </div>
      </div>

      <AlertDialog open={showResetDialog} onOpenChange={setShowResetDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset App Data</AlertDialogTitle>
            <AlertDialogDescription>
              This clears local filters and cache. Server data is not affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => resetAppData({ whitelistKeys: ['theme', '4s-app-usage-data'] })}>
              Reset
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function OdooLayoutContent({ children }: OdooLayoutProps) {
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [location] = useLocation();
  const { user } = useAuth();
  const { trackUsage } = useAppUsage();
  const { open: commandOpen, setOpen: setCommandOpen } = useCommandPalette();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (location) trackUsage(location);
  }, [location, trackUsage]);

  const logout = () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  };

  const isAdmin = (user as any)?.role === 'admin';
  const userEmail = (user as any)?.email;
  const userInitials = getUserInitials(userEmail);

  const sidebarProps = {
    location,
    isAdmin,
    user: user as any,
    userInitials,
    onLogout: logout,
    isLoggingOut,
    onOpenCommand: () => setCommandOpen(true),
  };

  return (
    <div className="min-h-screen flex bg-[#F8F8F8]">
      {/* Mobile trigger */}
      {isMobile && (
        <Sheet>
          <SheetTrigger asChild>
            <button
              className="lg:hidden fixed left-3 top-3 z-50 p-2 rounded-lg bg-white border border-gray-200 shadow-sm"
              data-testid="button-mobile-menu"
            >
              <Menu className="h-4 w-4 text-gray-600" />
            </button>
          </SheetTrigger>
          <SheetContent side="left" className="w-[224px] p-0">
            <SidebarContent {...sidebarProps} onNavClick={() => {}} />
          </SheetContent>
        </Sheet>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden lg:flex w-56 h-screen flex-col fixed left-0 top-0 z-40 bg-white border-r border-gray-100">
        <SidebarContent {...sidebarProps} />
      </aside>

      {/* Main content */}
      <main className={`flex-1 ${isMobile ? 'ml-0 pt-16' : 'lg:ml-56'} min-h-screen`}>
        <div className="p-6">
          <div className="max-w-[1400px] mx-auto">
            {children}
          </div>
        </div>
      </main>

      <CommandPalette open={commandOpen} onOpenChange={setCommandOpen} />
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

import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { 
  Home, FileText, DollarSign, Users, Database, Settings, LogOut,
  Activity, Calculator, TrendingUp, Truck, Package, Tag, Search, Clock,
  Target, AlertTriangle, Mail, Building2, BarChart3, Plug, Layers, Sparkles, CalendarDays
} from 'lucide-react';
import { SiShopify } from 'react-icons/si';
import odooLogoPath from '@assets/Odoo_idrS-IC4Vn_0_1768250561474.jpeg';
import { useAppUsage } from '@/hooks/useAppUsage';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';
import { resetAppData } from '@/lib/cache';

type IconComponent = typeof Home | React.FC<{ className?: string }>;

export const QuickQuotesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <text x="2" y="17" fontSize="14" fontWeight="bold" fill="currentColor" stroke="none">QQ</text>
  </svg>
);

export const SavedQuotesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <text x="8" y="17" fontSize="9" fontWeight="bold" fill="currentColor" stroke="none">$</text>
  </svg>
);

export const PdfSettingsIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
    <polyline points="14 2 14 8 20 8" />
    <circle cx="16" cy="18" r="3" strokeWidth="1.5" />
    <path d="M16 16v1h1" strokeWidth="1.5" />
  </svg>
);

export const OdooIcon: React.FC<{ className?: string }> = ({ className }) => (
  <img src={odooLogoPath} alt="Odoo" className={className} style={{ objectFit: 'contain' }} />
);

interface NavItem {
  path: string;
  icon: IconComponent;
  label: string;
  keywords?: string[];
  adminOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: Home, label: 'Dashboard', keywords: ['home', 'main', 'overview'] },
  { path: '/quick-quotes', icon: QuickQuotesIcon, label: 'QuickQuotes', keywords: ['quote', 'estimate', 'pricing'] },
  { path: '/clients', icon: Users, label: 'Clients', keywords: ['customers', 'contacts', 'database'] },
  { path: '/reports', icon: BarChart3, label: 'Reports', keywords: ['analytics', 'reports', 'dashboard', 'sales', 'metrics', 'insights'] },
  { path: '/calendar', icon: CalendarDays, label: 'Calendar', keywords: ['calendar', 'tasks', 'events', 'schedule', 'google', 'meetings'] },
  { path: '/price-list', icon: DollarSign, label: 'Price List', keywords: ['prices', 'costs', 'rates'] },
  { path: '/saved-quotes', icon: SavedQuotesIcon, label: 'Saved Quotes', keywords: ['history', 'saved', 'previous'] },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator', keywords: ['area', 'square meter', 'calculate'] },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices', keywords: ['competitors', 'market', 'comparison'] },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping', keywords: ['delivery', 'freight', 'transport'] },
  { path: '/shipping-labels', icon: Package, label: 'Shipping Labels', keywords: ['labels', 'packages', 'shipment'] },
  { path: '/product-labels', icon: Tag, label: 'Product Labels', keywords: ['tags', 'stickers', 'product'] },
  { path: '/crm-journey', icon: Target, label: 'CRM Journey', keywords: ['pipeline', 'sales', 'customers', 'conversion', 'samples', 'swatches'] },
  { path: '/objections', icon: AlertTriangle, label: 'Objections', keywords: ['objections', 'issues', 'blockers', 'concerns', 'problems'] },
  { path: '/email-app', icon: Mail, label: 'Email Studio', keywords: ['email', 'templates', 'mail', 'compose', 'send'], adminOnly: true },
  { path: '/email-insights', icon: Sparkles, label: 'Email Intelligence', keywords: ['ai', 'insights', 'promises', 'followup', 'sales', 'opportunities', 'reminders'] },
  { path: '/integrations', icon: Plug, label: 'Integrations', keywords: ['gmail', 'calendar', 'odoo', 'connect', 'settings', 'google'], adminOnly: true },
  { path: '/product-mapping', icon: Layers, label: 'Product Mapping', keywords: ['map', 'category', 'type', 'size', 'sqm', 'fix', 'unmapped'], adminOnly: true },
  { path: '/shopify-settings', icon: SiShopify, label: 'Shopify', keywords: ['shopify', 'orders', 'ecommerce', 'integration'], adminOnly: true },
  { path: '/odoo-settings', icon: OdooIcon, label: 'Odoo', keywords: ['odoo', 'erp', 'sync', 'partners', 'integration'], adminOnly: true },
  { path: '/admin', icon: Users, label: 'Users', keywords: ['admin', 'management', 'roles'], adminOnly: true },
  { path: '/activity-logs', icon: Activity, label: 'Activity', keywords: ['logs', 'history', 'audit'], adminOnly: true },
  { path: '/product-pricing-management', icon: Database, label: 'Products', keywords: ['inventory', 'catalog', 'items'], adminOnly: true },
  { path: '/pdf-settings', icon: PdfSettingsIcon, label: 'PDF Settings', keywords: ['pdf', 'export', 'documents'], adminOnly: true },
];

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { trackUsage, getRecentApps } = useAppUsage();
  
  const isAdmin = (user as any)?.role === 'admin';
  const recentPaths = getRecentApps(5);

  const handleSelect = useCallback((path: string) => {
    trackUsage(path);
    navigate(path);
    onOpenChange(false);
  }, [navigate, onOpenChange, trackUsage]);

  const handleLogout = useCallback(() => {
    queryClient.clear();
    localStorage.clear();
    sessionStorage.clear();
    window.location.href = '/api/logout';
  }, []);

  const handleResetCache = useCallback(() => {
    resetAppData({ whitelistKeys: ['theme', '4s-app-usage-data'] });
    onOpenChange(false);
  }, [onOpenChange]);

  const filteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const recentItems = filteredItems.filter(item => recentPaths.includes(item.path));

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <Command className="rounded-lg border-0 shadow-2xl">
        <CommandInput placeholder="Search apps, commands..." className="h-12" data-testid="command-input" />
        <CommandList className="max-h-[400px]">
          <CommandEmpty>No results found.</CommandEmpty>
          
          {recentItems.length > 0 && (
            <CommandGroup heading="Recent">
              {recentItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`recent-${item.path}`}
                    onSelect={() => handleSelect(item.path)}
                    className="flex items-center gap-3 py-3 cursor-pointer"
                    data-testid={`cmd-recent-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div>
                      <p className="font-medium">{item.label}</p>
                    </div>
                    <Clock className="ml-auto h-3 w-3 text-gray-400" />
                  </CommandItem>
                );
              })}
            </CommandGroup>
          )}

          <CommandGroup heading="Apps">
            {filteredItems.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.path}
                  onSelect={() => handleSelect(item.path)}
                  className="flex items-center gap-3 py-3 cursor-pointer"
                  data-testid={`cmd-app-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
                  value={`${item.label} ${item.keywords?.join(' ') || ''}`}
                >
                  <div className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Icon className="h-4 w-4 text-gray-600" />
                  </div>
                  <div>
                    <p className="font-medium">{item.label}</p>
                  </div>
                  {item.adminOnly && (
                    <span className="ml-auto text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Admin</span>
                  )}
                </CommandItem>
              );
            })}
          </CommandGroup>

          <CommandSeparator />

          <CommandGroup heading="Quick Actions">
            <CommandItem
              onSelect={handleResetCache}
              className="flex items-center gap-3 py-3 cursor-pointer"
              data-testid="cmd-reset-cache"
            >
              <div className="w-8 h-8 rounded-lg bg-blue-100 flex items-center justify-center">
                <Settings className="h-4 w-4 text-blue-600" />
              </div>
              <p className="font-medium">Reset App Cache</p>
            </CommandItem>
            <CommandItem
              onSelect={handleLogout}
              className="flex items-center gap-3 py-3 cursor-pointer"
              data-testid="cmd-logout"
            >
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <LogOut className="h-4 w-4 text-red-600" />
              </div>
              <p className="font-medium">Log Out</p>
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </Command>
    </CommandDialog>
  );
}

export function useCommandPalette() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isInput = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      
      if (e.key === '/' && !isInput) {
        e.preventDefault();
        setOpen(true);
      }
      
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(true);
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  return { open, setOpen };
}

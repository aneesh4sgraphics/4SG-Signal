import { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { SiShopify } from 'react-icons/si';
import { useAppUsage } from '@/hooks/useAppUsage';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';
import { resetAppData } from '@/lib/cache';
import { filterAppsByUser } from '@/lib/nav-links';
import {
  DashboardIcon,
  QuickQuotesIcon,
  ClientsIcon,
  ReportsIcon,
  CalendarIcon,
  PriceListIcon,
  SavedQuotesIcon,
  CalculatorIcon,
  MarketPricesIcon,
  ShippingIcon,
  ShippingLabelsIcon,
  ProductLabelsIcon,
  CrmJourneyIcon,
  ObjectionsIcon,
  EmailIcon,
  SparkleIcon,
  OpportunityIcon,
  IntegrationsIcon,
  ProductMappingIcon,
  UsersIcon,
  ActivityIcon,
  DatabaseIcon,
  PdfIcon,
  ClockIcon,
  RefreshIcon,
  LogoutIcon,
  PackageIcon,
} from '@/components/HandDrawnIcons';

type IconComponent = React.FC<{ className?: string }>;

export const OdooIcon: React.FC<{ className?: string }> = ({ className }) => (
  <span className={`font-bold text-purple-600 ${className}`}>O</span>
);

export { QuickQuotesIcon, SavedQuotesIcon, PdfIcon as PdfSettingsIcon };

interface NavItem {
  path: string;
  icon: IconComponent;
  label: string;
  keywords?: string[];
  adminOnly?: boolean;
  group?: 'core' | 'tools';
  iconBg?: string;
  iconColor?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { path: '/', icon: DashboardIcon, label: 'Spotlight', group: 'core', keywords: ['home', 'main', 'overview', 'spotlight', 'coaching', 'tasks', 'email intelligence', 'ai', 'insights'], iconBg: '#0C6E99', iconColor: '#FFFFFF' },
  { path: '/dashboard', icon: ReportsIcon, label: 'Dashboard', group: 'core', keywords: ['dashboard', 'analytics', 'overview', 'stats', 'charts'], iconBg: '#2D7D6A', iconColor: '#FFFFFF' },
  { path: '/quick-quotes', icon: QuickQuotesIcon, label: 'QuickQuotes', group: 'core', keywords: ['quote', 'estimate', 'pricing'], iconBg: '#D9730B', iconColor: '#FFFFFF' },
  { path: '/odoo-contacts', icon: ClientsIcon, label: 'Clients', group: 'core', keywords: ['customers', 'contacts', 'database', 'odoo', 'partners'], iconBg: '#693FA5', iconColor: '#FFFFFF' },
  { path: '/leads', icon: SparkleIcon, label: 'Leads', group: 'core', keywords: ['leads', 'prospects', 'pipeline', 'sales', 'trust', 'new'], iconBg: '#10B981', iconColor: '#FFFFFF' },
  { path: '/opportunities', icon: OpportunityIcon, label: 'Opportunities', group: 'core', keywords: ['opportunities', 'scoring', 'prospects', 'samples', 'upsell', 'follow-up', 'machine', 'fit'], iconBg: '#F59E0B', iconColor: '#FFFFFF' },
  { path: '/calendar', icon: CalendarIcon, label: 'Calendar', group: 'core', keywords: ['calendar', 'tasks', 'events', 'schedule', 'google', 'meetings'], iconBg: '#E03D3E', iconColor: '#FFFFFF' },
  { path: '/odoo-products', icon: PackageIcon, label: 'Products', group: 'tools', keywords: ['products', 'inventory', 'catalog', 'items', 'odoo', 'sku'], iconBg: '#0E7B6C', iconColor: '#FFFFFF' },
  { path: '/customer-margins', icon: ReportsIcon, label: 'Customer Margins', group: 'tools', keywords: ['margin', 'margins', 'profit', 'customer', 'average', 'search', 'profitability'], iconBg: '#7C3AED', iconColor: '#FFFFFF' },
  { path: '/reports', icon: ReportsIcon, label: 'Reports', group: 'tools', keywords: ['analytics', 'reports', 'dashboard', 'sales', 'metrics', 'insights'], iconBg: '#2D7D6A', iconColor: '#FFFFFF' },
  { path: '/price-list', icon: PriceListIcon, label: 'Price List', group: 'tools', keywords: ['prices', 'costs', 'rates'], iconBg: '#DFAB00', iconColor: '#37352F' },
  { path: '/saved-quotes', icon: SavedQuotesIcon, label: 'Saved Quotes', group: 'tools', keywords: ['history', 'saved', 'previous'], iconBg: '#AD1972', iconColor: '#FFFFFF' },
  { path: '/area-pricer', icon: CalculatorIcon, label: 'SqM Calculator', group: 'tools', keywords: ['area', 'square meter', 'calculate'], iconBg: '#64473A', iconColor: '#FFFFFF' },
  { path: '/competitor-pricing', icon: MarketPricesIcon, label: 'Market Prices', group: 'tools', keywords: ['competitors', 'market', 'comparison'], iconBg: '#0C6E99', iconColor: '#FFFFFF' },
  { path: '/shipping-calculator', icon: ShippingIcon, label: 'Shipping', group: 'tools', keywords: ['delivery', 'freight', 'transport'], iconBg: '#D9730B', iconColor: '#FFFFFF' },
  { path: '/shipping-labels', icon: ShippingLabelsIcon, label: 'Shipping Labels', group: 'tools', keywords: ['labels', 'packages', 'shipment'], iconBg: '#693FA5', iconColor: '#FFFFFF' },
  { path: '/product-labels', icon: ProductLabelsIcon, label: 'Product Labels', group: 'tools', keywords: ['tags', 'stickers', 'product'], iconBg: '#0E7B6C', iconColor: '#FFFFFF' },
  { path: '/crm-journey', icon: CrmJourneyIcon, label: 'CRM Journey', group: 'tools', keywords: ['pipeline', 'sales', 'customers', 'conversion', 'samples', 'swatches'], iconBg: '#E03D3E', iconColor: '#FFFFFF' },
  { path: '/objections', icon: ObjectionsIcon, label: 'Objections', group: 'tools', keywords: ['objections', 'issues', 'blockers', 'concerns', 'problems'], iconBg: '#DFAB00', iconColor: '#37352F' },
  { path: '/email-app', icon: EmailIcon, label: 'Email Studio', keywords: ['email', 'templates', 'mail', 'compose', 'send'], adminOnly: true, iconBg: '#AD1972', iconColor: '#FFFFFF' },
  { path: '/integrations', icon: IntegrationsIcon, label: 'Integrations', keywords: ['gmail', 'calendar', 'odoo', 'connect', 'settings', 'google'], adminOnly: true, iconBg: '#0C6E99', iconColor: '#FFFFFF' },
  { path: '/product-mapping', icon: ProductMappingIcon, label: 'Product Mapping', keywords: ['map', 'category', 'type', 'size', 'sqm', 'fix', 'unmapped'], adminOnly: true, iconBg: '#D9730B', iconColor: '#FFFFFF' },
  { path: '/shopify-settings', icon: SiShopify, label: 'Shopify', keywords: ['shopify', 'orders', 'ecommerce', 'integration'], adminOnly: true, iconBg: '#0E7B6C', iconColor: '#FFFFFF' },
  { path: '/odoo-settings', icon: OdooIcon, label: 'Odoo', keywords: ['odoo', 'erp', 'sync', 'partners', 'integration'], adminOnly: true, iconBg: '#693FA5', iconColor: '#FFFFFF' },
  { path: '/spotlight-overview', icon: ClockIcon, label: 'Spotlight Overview', keywords: ['spotlight', 'overview', 'claims', 'snooze', 'manager', 'team'], adminOnly: true, iconBg: '#4F46E5', iconColor: '#FFFFFF' },
  { path: '/admin', icon: UsersIcon, label: 'Users', keywords: ['admin', 'management', 'roles'], adminOnly: true, iconBg: '#E03D3E', iconColor: '#FFFFFF' },
  { path: '/activity-logs', icon: ActivityIcon, label: 'Activity', keywords: ['logs', 'history', 'audit'], adminOnly: true, iconBg: '#DFAB00', iconColor: '#37352F' },
  { path: '/product-pricing-management', icon: DatabaseIcon, label: 'Products', keywords: ['inventory', 'catalog', 'items'], adminOnly: true, iconBg: '#AD1972', iconColor: '#FFFFFF' },
  { path: '/pdf-settings', icon: PdfIcon, label: 'PDF Settings', keywords: ['pdf', 'export', 'documents'], adminOnly: true, iconBg: '#64473A', iconColor: '#FFFFFF' },
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

  // Filter by admin access, then by user-specific restrictions
  const adminFilteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const filteredItems = filterAppsByUser(adminFilteredItems, user?.email);
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
                    <ClockIcon className="ml-auto h-3 w-3 text-gray-400" />
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
                <RefreshIcon className="h-4 w-4 text-blue-600" />
              </div>
              <p className="font-medium">Reset App Cache</p>
            </CommandItem>
            <CommandItem
              onSelect={handleLogout}
              className="flex items-center gap-3 py-3 cursor-pointer"
              data-testid="cmd-logout"
            >
              <div className="w-8 h-8 rounded-lg bg-red-100 flex items-center justify-center">
                <LogoutIcon className="h-4 w-4 text-red-600" />
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

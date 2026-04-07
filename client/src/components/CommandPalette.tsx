import { useState, useEffect, useCallback, useRef } from 'react';
import { useLocation } from 'wouter';
import { Command, CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator } from '@/components/ui/command';
import { SiShopify } from 'react-icons/si';
import { User, Building2, UserCheck } from 'lucide-react';
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
  SalesChartsIcon,
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
  { path: '/dashboard', icon: SalesChartsIcon, label: 'Dashboard', group: 'tools', keywords: ['dashboard', 'analytics', 'overview', 'stats', 'charts'], iconBg: '#2D7D6A', iconColor: '#FFFFFF' },
  { path: '/quick-quotes', icon: QuickQuotesIcon, label: 'QuickQuotes', group: 'core', keywords: ['quote', 'estimate', 'pricing'], iconBg: '#D9730B', iconColor: '#FFFFFF' },
  { path: '/odoo-contacts', icon: ClientsIcon, label: 'Clients', group: 'core', keywords: ['customers', 'contacts', 'database', 'odoo', 'partners'], iconBg: '#693FA5', iconColor: '#FFFFFF' },
  { path: '/leads', icon: SparkleIcon, label: 'Leads', group: 'core', keywords: ['leads', 'prospects', 'pipeline', 'sales', 'trust', 'new'], iconBg: '#10B981', iconColor: '#FFFFFF' },
  { path: '/opportunities', icon: OpportunityIcon, label: 'Opportunities', group: 'tools', keywords: ['opportunities', 'scoring', 'prospects', 'samples', 'upsell', 'follow-up', 'machine', 'fit'], iconBg: '#F59E0B', iconColor: '#FFFFFF' },
  { path: '/calendar', icon: CalendarIcon, label: 'Calendar', group: 'tools', keywords: ['calendar', 'tasks', 'events', 'schedule', 'google', 'meetings'], iconBg: '#E03D3E', iconColor: '#FFFFFF' },
  { path: '/odoo-products', icon: PackageIcon, label: 'Products', group: 'tools', keywords: ['products', 'inventory', 'catalog', 'items', 'odoo', 'sku'], iconBg: '#0E7B6C', iconColor: '#FFFFFF' },
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
  { path: '/sequences', icon: EmailIcon, label: 'Email Sequences', keywords: ['email', 'sequences', 'templates', 'mail', 'drip', 'campaigns', 'send'], adminOnly: true, iconBg: '#6366F1', iconColor: '#FFFFFF' },
  { path: '/integrations', icon: IntegrationsIcon, label: 'Integrations', keywords: ['gmail', 'calendar', 'odoo', 'connect', 'settings', 'google'], adminOnly: true, iconBg: '#0C6E99', iconColor: '#FFFFFF' },
  { path: '/product-mapping', icon: ProductMappingIcon, label: 'Product Mapping', keywords: ['map', 'category', 'type', 'size', 'sqm', 'fix', 'unmapped'], adminOnly: true, iconBg: '#D9730B', iconColor: '#FFFFFF' },
  { path: '/shopify-settings', icon: SiShopify, label: 'Shopify', keywords: ['shopify', 'orders', 'ecommerce', 'integration'], adminOnly: true, iconBg: '#0E7B6C', iconColor: '#FFFFFF' },
  { path: '/odoo-settings', icon: OdooIcon, label: 'Odoo', keywords: ['odoo', 'erp', 'sync', 'partners', 'integration'], adminOnly: true, iconBg: '#693FA5', iconColor: '#FFFFFF' },
  { path: '/admin', icon: UsersIcon, label: 'Users', keywords: ['admin', 'management', 'roles'], adminOnly: true, iconBg: '#E03D3E', iconColor: '#FFFFFF' },
  { path: '/activity-logs', icon: ActivityIcon, label: 'Activity', keywords: ['logs', 'history', 'audit'], adminOnly: true, iconBg: '#DFAB00', iconColor: '#37352F' },
  { path: '/product-pricing-management', icon: DatabaseIcon, label: 'Products', keywords: ['inventory', 'catalog', 'items'], adminOnly: true, iconBg: '#0284C7', iconColor: '#FFFFFF' },
  { path: '/pdf-settings', icon: PdfIcon, label: 'PDF Settings', keywords: ['pdf', 'export', 'documents'], adminOnly: true, iconBg: '#64473A', iconColor: '#FFFFFF' },
];

interface SearchResults {
  leads: { id: number; name: string; email: string | null; company: string | null; stage: string }[];
  customers: { id: string; company: string | null; email: string | null; firstName: string | null; lastName: string | null }[];
  contacts: { id: number; name: string; email: string | null; role: string | null; customerId: string }[];
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Match a nav item against a query string — checks label + keywords */
function matchesQuery(item: NavItem, q: string): boolean {
  if (!q) return true;
  const lower = q.toLowerCase();
  if (item.label.toLowerCase().includes(lower)) return true;
  return (item.keywords || []).some(k => k.toLowerCase().includes(lower));
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { trackUsage, getRecentApps } = useAppUsage();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResults | null>(null);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isAdmin = (user as any)?.role === 'admin';
  const recentPaths = getRecentApps(5);

  // Reset state when dialog closes
  useEffect(() => {
    if (!open) {
      setQuery('');
      setSearchResults(null);
      setSearching(false);
    }
  }, [open]);

  // Debounced live data search — fires 300ms after user stops typing
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.length < 2) {
      setSearchResults(null);
      setSearching(false);
      return;
    }

    setSearching(true);
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {
        // ignore network errors silently
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

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

  // Filter by admin access, then by user restrictions, then by query
  const adminFilteredItems = NAV_ITEMS.filter(item => !item.adminOnly || isAdmin);
  const userFilteredItems = filterAppsByUser(adminFilteredItems, user?.email);
  const recentItems = userFilteredItems.filter(item => recentPaths.includes(item.path));

  // Manual query filtering for apps — we control all filtering (shouldFilter=false always)
  const visibleApps = query.length >= 2
    ? userFilteredItems.filter(item => matchesQuery(item, query))
    : userFilteredItems;

  const hasDataResults = searchResults && (
    searchResults.leads.length > 0 ||
    searchResults.customers.length > 0 ||
    searchResults.contacts.length > 0
  );

  const showRecent = query.length < 2 && recentItems.length > 0;
  const isSearching = query.length >= 2;

  const hasAnyResults = hasDataResults || visibleApps.length > 0;

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      {/*
        shouldFilter is ALWAYS false — we do all filtering ourselves.
        This prevents cmdk from re-ordering items or accidentally
        matching the "Log Out" button against user-typed queries.
      */}
      <Command className="rounded-lg border-0 shadow-2xl" shouldFilter={false}>
        <CommandInput
          placeholder="Search pages, leads, companies, contacts..."
          className="h-12"
          data-testid="command-input"
          onValueChange={setQuery}
        />
        <CommandList className="max-h-[480px]">
          {!hasAnyResults && !searching && (
            <CommandEmpty>{isSearching ? 'No results found.' : 'Type to search…'}</CommandEmpty>
          )}
          {searching && (
            <div className="px-4 py-3 text-sm text-gray-400">Searching…</div>
          )}

          {/* ── Live data results (shown when query ≥ 2 chars and data loaded) ── */}
          {hasDataResults && (
            <>
              {searchResults!.leads.length > 0 && (
                <CommandGroup heading="Leads">
                  {searchResults!.leads.map(lead => (
                    <CommandItem
                      key={`lead-${lead.id}`}
                      value={`lead-${lead.id}`}
                      onSelect={() => handleSelect(`/leads/${lead.id}`)}
                      className="flex items-center gap-3 py-2.5 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                        <User className="h-3.5 w-3.5 text-emerald-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{lead.name}</p>
                        <p className="text-xs text-gray-400 truncate">{lead.company || lead.email || '—'}</p>
                      </div>
                      <span className="text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-1.5 py-0.5 rounded-full capitalize flex-shrink-0">{lead.stage}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {searchResults!.customers.length > 0 && (
                <CommandGroup heading="Companies">
                  {searchResults!.customers.map(c => (
                    <CommandItem
                      key={`customer-${c.id}`}
                      value={`customer-${c.id}`}
                      onSelect={() => handleSelect(`/odoo-contacts/${c.id}`)}
                      className="flex items-center gap-3 py-2.5 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-purple-100 flex items-center justify-center flex-shrink-0">
                        <Building2 className="h-3.5 w-3.5 text-purple-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{c.company || `${c.firstName ?? ''} ${c.lastName ?? ''}`.trim() || 'Unnamed'}</p>
                        <p className="text-xs text-gray-400 truncate">{c.email || '—'}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {searchResults!.contacts.length > 0 && (
                <CommandGroup heading="Contacts">
                  {searchResults!.contacts.map(ct => (
                    <CommandItem
                      key={`contact-${ct.id}`}
                      value={`contact-${ct.id}`}
                      onSelect={() => handleSelect(`/contacts/${ct.id}`)}
                      className="flex items-center gap-3 py-2.5 cursor-pointer"
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                        <UserCheck className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-sm truncate">{ct.name}</p>
                        <p className="text-xs text-gray-400 truncate">{ct.role ? `${ct.role} · ` : ''}{ct.email || '—'}</p>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              <CommandSeparator />
            </>
          )}

          {/* ── Recent apps (only shown when not searching) ── */}
          {showRecent && (
            <CommandGroup heading="Recent">
              {recentItems.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`recent-${item.path}`}
                    value={`recent-${item.path}`}
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

          {/* ── Apps — always shown, filtered by query when typing ── */}
          {visibleApps.length > 0 && (
            <CommandGroup heading={isSearching ? 'Matching Pages' : 'Apps'}>
              {visibleApps.map((item) => {
                const Icon = item.icon;
                return (
                  <CommandItem
                    key={`app-${item.path}`}
                    value={`app-${item.path}`}
                    onSelect={() => handleSelect(item.path)}
                    className="flex items-center gap-3 py-3 cursor-pointer"
                    data-testid={`cmd-app-${item.label.toLowerCase().replace(/\s+/g, '-')}`}
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
          )}

          {/* ── Quick Actions — always at the bottom, separated ── */}
          <CommandSeparator />
          <CommandGroup heading="Quick Actions">
            <CommandItem
              value="action-reset-cache"
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
              value="action-logout"
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

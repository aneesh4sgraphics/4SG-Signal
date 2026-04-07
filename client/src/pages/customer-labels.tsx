import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search, Printer, Plus, Check, Building2, Zap, MapPin, X, ChevronDown, ChevronUp,
  SlidersHorizontal, Flame, Home, Users, Layers, Star, Tag, Clock,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useLabelQueue, type CustomerAddress } from '@/components/PrintLabelButton';
import { useDebounce } from '@/hooks/useDebounce';

interface Customer {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  address1: string | null;
  city: string | null;
  province: string | null;
  zip: string | null;
  country: string | null;
  isCompany: boolean;
  email: string | null;
  pricingTier: string | null;
  salesRepName: string | null;
  customerType: string | null;
  isHotProspect: boolean;
  lastOutboundEmailAt: string | null;
  totalOrders: number | null;
}

interface Lead {
  id: number;
  name: string;
  company: string | null;
  street: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  email: string | null;
}

interface SalesRep {
  id: string;
  name: string;
  email?: string;
}

function customerToAddress(c: Customer): CustomerAddress {
  return {
    id: c.id,
    company: c.company,
    firstName: c.firstName,
    lastName: c.lastName,
    address1: c.address1,
    city: c.city,
    province: c.province,
    zip: c.zip,
    country: c.country,
  };
}

function leadToAddress(l: Lead): CustomerAddress {
  return {
    id: `lead-${l.id}`,
    company: l.company || l.name,
    firstName: !l.company ? l.name : undefined,
    address1: l.street,
    city: l.city,
    province: l.state,
    zip: l.zip,
  };
}

function formatLocation(city?: string | null, province?: string | null, zip?: string | null) {
  return [city, province, zip].filter(Boolean).join(', ');
}

const STRENGTH_LABELS: Record<string, { label: string; color: string }> = {
  very_strong: { label: 'Very Strong (≤30d)', color: 'bg-green-100 text-green-700 border-green-200' },
  strong: { label: 'Strong (≤90d)', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' },
  moderate: { label: 'Moderate (≤180d)', color: 'bg-yellow-100 text-yellow-700 border-yellow-200' },
  weak: { label: 'Weak (≤365d)', color: 'bg-orange-100 text-orange-700 border-orange-200' },
  cold: { label: 'Cold (>365d)', color: 'bg-slate-100 text-slate-600 border-slate-200' },
};

function FilterChip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-xs font-medium border border-indigo-200">
      {label}
      <button onClick={onRemove} className="ml-0.5 hover:text-indigo-900">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

export default function CustomerLabels() {
  const [search, setSearch] = useState('');
  const [selectedState, setSelectedState] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedSalesRep, setSelectedSalesRep] = useState('');
  const [selectedPricingTier, setSelectedPricingTier] = useState('');
  const [selectedCustomerType, setSelectedCustomerType] = useState('');
  const [selectedStrength, setSelectedStrength] = useState('');
  const [selectedTag, setSelectedTag] = useState('');
  const [selectedRecentDays, setSelectedRecentDays] = useState('');
  const [hotProspectsOnly, setHotProspectsOnly] = useState(false);
  const [hasAddressOnly, setHasAddressOnly] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);

  const debouncedSearch = useDebounce(search, 300);
  const { queue, addToQueue, isInQueue, openPrintDialog } = useLabelQueue();

  const hasStateFilter = !!selectedState;
  const hasCityFilter = !!selectedCity;
  const hasSalesRepFilter = !!selectedSalesRep;
  const hasPricingFilter = !!selectedPricingTier;
  const hasTypeFilter = !!selectedCustomerType;
  const hasStrengthFilter = !!selectedStrength;
  const hasTagFilter = !!selectedTag;
  const hasRecentFilter = !!selectedRecentDays;
  const hasHotFilter = hotProspectsOnly;
  const hasAddrFilter = hasAddressOnly;

  const activeFilterCount = [
    hasStateFilter, hasCityFilter, hasSalesRepFilter, hasPricingFilter,
    hasTypeFilter, hasStrengthFilter, hasHotFilter, hasAddrFilter,
    hasTagFilter, hasRecentFilter,
  ].filter(Boolean).length;

  const hasSearch = debouncedSearch.trim().length >= 2;
  const enabled = hasSearch || activeFilterCount > 0;

  const { data: availableStates = [] } = useQuery<string[]>({
    queryKey: ['/api/label-states'],
    staleTime: 300000,
  });

  const { data: availableCities = [] } = useQuery<string[]>({
    queryKey: ['/api/label-cities', selectedState],
    queryFn: async () => {
      if (!selectedState) return [];
      const res = await fetch(`/api/label-cities?state=${encodeURIComponent(selectedState)}`, { credentials: 'include' });
      return res.json();
    },
    enabled: hasStateFilter,
    staleTime: 120000,
  });

  const { data: salesRepsData } = useQuery<SalesRep[]>({
    queryKey: ['/api/sales-reps'],
    staleTime: 300000,
  });
  const salesReps = salesRepsData ?? [];

  const { data: availableTags = [] } = useQuery<string[]>({
    queryKey: ['/api/leads/tags'],
    staleTime: 300000,
  });

  const { data: customersData, isLoading: customersLoading } = useQuery<{ customers: Customer[] }>({
    queryKey: ['/api/customers', 'label-search', debouncedSearch, selectedState, selectedCity,
      selectedSalesRep, selectedPricingTier, selectedCustomerType, selectedStrength,
      hotProspectsOnly, hasAddressOnly, selectedRecentDays],
    queryFn: async () => {
      const params = new URLSearchParams({ pageSize: '200', page: '1' });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (hasStateFilter) params.set('province', selectedState);
      if (hasCityFilter) params.set('city', selectedCity);
      if (hasSalesRepFilter) params.set('salesRepId', selectedSalesRep);
      if (hasPricingFilter) params.set('pricingTier', selectedPricingTier);
      if (hasTypeFilter) params.set('customerType', selectedCustomerType);
      if (hasStrengthFilter) params.set('connectionStrength', selectedStrength);
      if (hotProspectsOnly) params.set('isHotProspect', 'true');
      if (hasAddressOnly) params.set('hasAddress', 'true');
      if (hasRecentFilter) params.set('createdAfterDays', selectedRecentDays);
      const res = await fetch(`/api/customers?${params}`, { credentials: 'include' });
      const data = await res.json();
      return { customers: data.data ?? [] };
    },
    enabled,
    staleTime: 30000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery<{ leads: Lead[]; total: number }>({
    queryKey: ['/api/leads', 'label-search', debouncedSearch, selectedState, selectedCity, selectedSalesRep, selectedTag],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: '200' });
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      if (hasStateFilter) params.set('state', selectedState);
      if (hasCityFilter) params.set('city', selectedCity);
      if (hasSalesRepFilter) params.set('salesRepId', selectedSalesRep);
      if (hasTagFilter) params.set('tag', selectedTag);
      const res = await fetch(`/api/leads?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled,
    staleTime: 30000,
  });

  const customers = customersData?.customers ?? [];
  const leads = leadsData?.leads ?? [];
  const isLoading = customersLoading || leadsLoading;
  const hasResults = customers.length > 0 || leads.length > 0;

  const clearAllFilters = () => {
    setSelectedState('');
    setSelectedCity('');
    setSelectedSalesRep('');
    setSelectedPricingTier('');
    setSelectedCustomerType('');
    setSelectedStrength('');
    setSelectedTag('');
    setSelectedRecentDays('');
    setHotProspectsOnly(false);
    setHasAddressOnly(false);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Customer Labels</h1>
            <p className="text-sm text-gray-500 mt-1">
              Filter clients and leads, add them to the queue, then print labels.
            </p>
          </div>
          <Button
            onClick={openPrintDialog}
            className="flex items-center gap-2"
            disabled={queue.length === 0}
          >
            <Printer className="h-4 w-4" />
            Print Labels
            {queue.length > 0 && (
              <Badge variant="secondary" className="ml-1 bg-white/20 text-white">
                {queue.length}
              </Badge>
            )}
          </Button>
        </div>

        {queue.length > 0 && (
          <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg">
            <Printer className="h-4 w-4 text-blue-600 flex-shrink-0" />
            <span className="text-sm text-blue-700">
              <span className="font-medium">{queue.length} address{queue.length !== 1 ? 'es' : ''}</span> ready to print
            </span>
            <Button
              size="sm"
              variant="ghost"
              onClick={openPrintDialog}
              className="ml-auto text-blue-700 hover:text-blue-900 hover:bg-blue-100 h-7 px-2 text-xs"
            >
              Open print dialog →
            </Button>
          </div>
        )}
      </div>

      {/* Search bar */}
      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, company, email, or city…"
          className="pl-9 pr-9 h-10 bg-white"
          autoFocus
        />
        {search && (
          <button
            onClick={() => setSearch('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Filters toggle */}
      <div className="mb-3">
        <button
          onClick={() => setFiltersOpen(v => !v)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-colors w-full
            ${filtersOpen || activeFilterCount > 0
              ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
              : 'bg-white border-gray-200 text-gray-600 hover:bg-gray-50'}`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          Filters
          {activeFilterCount > 0 && (
            <span className="ml-1 inline-flex items-center justify-center h-5 w-5 rounded-full bg-indigo-600 text-white text-xs">
              {activeFilterCount}
            </span>
          )}
          <span className="ml-auto">
            {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </span>
        </button>

        {filtersOpen && (
          <div className="mt-2 p-4 bg-white border border-gray-200 rounded-lg space-y-3">
            {/* Row 1: State + City */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> State
                </label>
                <Select
                  value={selectedState || 'all'}
                  onValueChange={v => {
                    setSelectedState(v === 'all' ? '' : v);
                    setSelectedCity('');
                  }}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="All States" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All States</SelectItem>
                    {availableStates.map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Home className="h-3 w-3" /> City
                  {!hasStateFilter && <span className="text-gray-300 font-normal">(select state first)</span>}
                </label>
                <Select
                  value={selectedCity || 'all'}
                  onValueChange={v => setSelectedCity(v === 'all' ? '' : v)}
                  disabled={!hasStateFilter}
                >
                  <SelectTrigger className={`h-9 text-sm bg-white ${!hasStateFilter ? 'opacity-50' : ''}`}>
                    <SelectValue placeholder="All Cities" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Cities</SelectItem>
                    {availableCities.map(c => (
                      <SelectItem key={c} value={c}>{c}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 2: Sales Rep + Pricing Tier */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Users className="h-3 w-3" /> Sales Rep
                </label>
                <Select
                  value={selectedSalesRep || 'all'}
                  onValueChange={v => setSelectedSalesRep(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="All Reps" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Reps</SelectItem>
                    {salesReps.map(rep => (
                      <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Pricing Tier
                </label>
                <Select
                  value={selectedPricingTier || 'all'}
                  onValueChange={v => setSelectedPricingTier(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="All Tiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    {['LANDED PRICE','EXPORT ONLY','DISTRIBUTOR','DEALER-VIP','DEALER',
                      'SHOPIFY LOWEST','SHOPIFY3','SHOPIFY2','SHOPIFY1','SHOPIFY-ACCOUNT','RETAIL'].map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 3: Customer Type + Connection Strength */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Building2 className="h-3 w-3" /> Customer Type
                </label>
                <Select
                  value={selectedCustomerType || 'all'}
                  onValueChange={v => setSelectedCustomerType(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="All Types" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="reseller">Reseller</SelectItem>
                    <SelectItem value="printer">Printer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Star className="h-3 w-3" /> Connection Strength
                </label>
                <Select
                  value={selectedStrength || 'all'}
                  onValueChange={v => setSelectedStrength(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="Any Strength" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Strength</SelectItem>
                    <SelectItem value="very_strong">Very Strong (≤30 days)</SelectItem>
                    <SelectItem value="strong">Strong (≤90 days)</SelectItem>
                    <SelectItem value="moderate">Moderate (≤180 days)</SelectItem>
                    <SelectItem value="weak">Weak (≤365 days)</SelectItem>
                    <SelectItem value="cold">Cold (&gt;365 days / never)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 4: Tags + Recently Added */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Tag className="h-3 w-3" /> Lead Tag
                </label>
                <Select
                  value={selectedTag || 'all'}
                  onValueChange={v => setSelectedTag(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="Any Tag" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Tag</SelectItem>
                    {availableTags.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500 mb-1 flex items-center gap-1">
                  <Clock className="h-3 w-3" /> Recently Added
                </label>
                <Select
                  value={selectedRecentDays || 'all'}
                  onValueChange={v => setSelectedRecentDays(v === 'all' ? '' : v)}
                >
                  <SelectTrigger className="h-9 text-sm bg-white">
                    <SelectValue placeholder="Any Time" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Time</SelectItem>
                    <SelectItem value="7">Last 7 days</SelectItem>
                    <SelectItem value="30">Last 30 days</SelectItem>
                    <SelectItem value="90">Last 90 days</SelectItem>
                    <SelectItem value="180">Last 6 months</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Row 5: Toggle chips */}
            <div className="flex items-center gap-3 pt-1">
              <button
                onClick={() => setHotProspectsOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  hotProspectsOnly
                    ? 'bg-orange-100 border-orange-300 text-orange-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <Flame className="h-3.5 w-3.5" />
                Hot Prospects Only
                {hotProspectsOnly && <X className="h-3 w-3 ml-0.5" />}
              </button>
              <button
                onClick={() => setHasAddressOnly(v => !v)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium transition-colors ${
                  hasAddressOnly
                    ? 'bg-blue-100 border-blue-300 text-blue-700'
                    : 'bg-white border-gray-200 text-gray-500 hover:border-gray-300'
                }`}
              >
                <MapPin className="h-3.5 w-3.5" />
                Has Address Only
                {hasAddressOnly && <X className="h-3 w-3 ml-0.5" />}
              </button>
              {activeFilterCount > 0 && (
                <button
                  onClick={clearAllFilters}
                  className="ml-auto text-xs text-red-500 hover:text-red-700 font-medium"
                >
                  Clear all filters
                </button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Active filter chips summary */}
      {activeFilterCount > 0 && !filtersOpen && (
        <div className="flex flex-wrap items-center gap-1.5 mb-3">
          <span className="text-xs text-gray-400">Active:</span>
          {hasStateFilter && <FilterChip label={`State: ${selectedState}`} onRemove={() => { setSelectedState(''); setSelectedCity(''); }} />}
          {hasCityFilter && <FilterChip label={`City: ${selectedCity}`} onRemove={() => setSelectedCity('')} />}
          {hasSalesRepFilter && <FilterChip label={`Rep: ${salesReps.find(r => r.id === selectedSalesRep)?.name ?? selectedSalesRep}`} onRemove={() => setSelectedSalesRep('')} />}
          {hasPricingFilter && <FilterChip label={selectedPricingTier} onRemove={() => setSelectedPricingTier('')} />}
          {hasTypeFilter && <FilterChip label={selectedCustomerType} onRemove={() => setSelectedCustomerType('')} />}
          {hasStrengthFilter && <FilterChip label={STRENGTH_LABELS[selectedStrength]?.label ?? selectedStrength} onRemove={() => setSelectedStrength('')} />}
          {hasTagFilter && <FilterChip label={`Tag: ${selectedTag}`} onRemove={() => setSelectedTag('')} />}
          {hasRecentFilter && <FilterChip label={`Added: last ${selectedRecentDays}d`} onRemove={() => setSelectedRecentDays('')} />}
          {hotProspectsOnly && <FilterChip label="Hot Prospects" onRemove={() => setHotProspectsOnly(false)} />}
          {hasAddressOnly && <FilterChip label="Has Address" onRemove={() => setHasAddressOnly(false)} />}
          <button onClick={clearAllFilters} className="text-xs text-red-400 hover:text-red-600 ml-1">Clear all</button>
        </div>
      )}

      {/* Results empty state */}
      {!enabled && (
        <div className="text-center py-16 text-gray-400">
          <SlidersHorizontal className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Type at least 2 characters to search,</p>
          <p className="text-sm">or open Filters to browse by location, tier, rep, tag, or recently added</p>
        </div>
      )}

      {enabled && isLoading && (
        <div className="text-center py-16 text-gray-400">
          <div className="h-6 w-6 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Searching…</p>
        </div>
      )}

      {enabled && !isLoading && !hasResults && (
        <div className="text-center py-16 text-gray-400">
          <p className="text-sm">No clients or leads matched your filters.</p>
          {activeFilterCount > 0 && (
            <button onClick={clearAllFilters} className="mt-2 text-sm text-indigo-500 hover:text-indigo-700">
              Clear filters
            </button>
          )}
        </div>
      )}

      {enabled && !isLoading && hasResults && (
        <div className="space-y-5">
          {/* Clients */}
          {customers.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Building2 className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Clients ({customers.length})
                </span>
              </div>
              <div className="space-y-1">
                {customers.map(c => {
                  const name = c.company || [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
                  const location = formatLocation(c.city, c.province, c.zip);
                  const inQueue = isInQueue(c.id);
                  return (
                    <div
                      key={c.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                          {c.isHotProspect && (
                            <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-orange-100 text-orange-700 border border-orange-200">
                              <Flame className="h-2.5 w-2.5" /> Hot
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 flex-wrap mt-0.5">
                          {location ? (
                            <p className="text-xs text-gray-400 flex items-center gap-1">
                              <MapPin className="h-3 w-3 flex-shrink-0" />
                              {c.address1 && <span className="truncate">{c.address1}, </span>}
                              <span className="truncate">{location}</span>
                            </p>
                          ) : (
                            <p className="text-xs text-gray-300 italic">No address on file</p>
                          )}
                          {c.salesRepName && (
                            <span className="text-[10px] text-gray-400">{c.salesRepName}</span>
                          )}
                          {c.pricingTier && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-500">{c.pricingTier}</span>
                          )}
                        </div>
                      </div>
                      <button
                        onClick={() => addToQueue(customerToAddress(c))}
                        disabled={inQueue}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          inQueue
                            ? 'bg-green-50 text-green-700 cursor-default'
                            : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200'
                        }`}
                      >
                        {inQueue
                          ? <><Check className="h-3.5 w-3.5" /> Added</>
                          : <><Plus className="h-3.5 w-3.5" /> Add</>
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Leads */}
          {leads.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-2">
                <Zap className="h-3.5 w-3.5 text-gray-400" />
                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
                  Leads ({leads.length})
                </span>
              </div>
              <div className="space-y-1">
                {leads.map(l => {
                  const location = formatLocation(l.city, l.state, l.zip);
                  const inQueue = isInQueue(`lead-${l.id}`);
                  return (
                    <div
                      key={l.id}
                      className="flex items-center gap-3 px-3 py-2.5 bg-white rounded-lg border border-gray-100 hover:border-gray-200 transition-colors"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-gray-900 truncate">{l.name}</p>
                        {l.company && l.company !== l.name && (
                          <p className="text-xs text-gray-500 truncate">{l.company}</p>
                        )}
                        {location ? (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {l.street && <span className="truncate">{l.street}, </span>}
                            <span className="truncate">{location}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-300 italic mt-0.5">No address on file</p>
                        )}
                      </div>
                      <button
                        onClick={() => addToQueue(leadToAddress(l), l.id)}
                        disabled={inQueue}
                        className={`flex-shrink-0 flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                          inQueue
                            ? 'bg-green-50 text-green-700 cursor-default'
                            : 'bg-gray-50 text-gray-600 hover:bg-blue-50 hover:text-blue-700 border border-gray-200 hover:border-blue-200'
                        }`}
                      >
                        {inQueue
                          ? <><Check className="h-3.5 w-3.5" /> Added</>
                          : <><Plus className="h-3.5 w-3.5" /> Add</>
                        }
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

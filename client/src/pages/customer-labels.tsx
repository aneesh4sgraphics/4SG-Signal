import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Printer, Plus, Check, Building2, Zap, MapPin, X } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export default function CustomerLabels() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 300);
  const { queue, addToQueue, isInQueue, openPrintDialog } = useLabelQueue();

  const enabled = debouncedSearch.trim().length >= 2;

  const { data: customersData, isLoading: customersLoading } = useQuery<{ customers: Customer[] }>({
    queryKey: ['/api/customers', 'label-search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch, pageSize: '12', page: '1' });
      const res = await fetch(`/api/customers?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled,
    staleTime: 30000,
  });

  const { data: leadsData, isLoading: leadsLoading } = useQuery<Lead[]>({
    queryKey: ['/api/leads', 'label-search', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams({ search: debouncedSearch });
      const res = await fetch(`/api/leads?${params}`, { credentials: 'include' });
      return res.json();
    },
    enabled,
    staleTime: 30000,
  });

  const customers = customersData?.customers ?? [];
  const leads = leadsData ?? [];
  const isLoading = customersLoading || leadsLoading;
  const hasResults = customers.length > 0 || leads.length > 0;

  const handleAddCustomer = async (c: Customer) => {
    await addToQueue(customerToAddress(c));
  };

  const handleAddLead = async (l: Lead) => {
    await addToQueue(leadToAddress(l), l.id);
  };

  return (
    <div className="max-w-2xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Customer Labels</h1>
            <p className="text-sm text-gray-500 mt-1">
              Search for clients or leads, add them to the print queue, then generate labels.
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

        {/* Queue summary */}
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

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search clients or leads by name, company, or city…"
          className="pl-9 h-10 bg-white"
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

      {/* Results */}
      {!enabled && (
        <div className="text-center py-16 text-gray-400">
          <Search className="h-8 w-8 mx-auto mb-3 opacity-40" />
          <p className="text-sm">Type at least 2 characters to search</p>
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
          <p className="text-sm">No clients or leads found for "{debouncedSearch}"</p>
        </div>
      )}

      {enabled && !isLoading && hasResults && (
        <div className="space-y-5">
          {/* Clients / Companies */}
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
                        <p className="text-sm font-medium text-gray-900 truncate">{name}</p>
                        {location ? (
                          <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            {c.address1 && <span className="truncate">{c.address1}, </span>}
                            <span className="truncate">{location}</span>
                          </p>
                        ) : (
                          <p className="text-xs text-gray-300 italic mt-0.5">No address on file</p>
                        )}
                      </div>
                      <button
                        onClick={() => handleAddCustomer(c)}
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
                        onClick={() => handleAddLead(l)}
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

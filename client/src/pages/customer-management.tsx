import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Building2, X, MapPin, Globe } from 'lucide-react';
import { SiShopify } from 'react-icons/si';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useDebounce } from '@/hooks/useDebounce';

interface CompanyEntry {
  id: number | null;
  name: string;
  source: 'odoo' | 'shopify' | 'contact';
  city: string | null;
  stateProvince: string | null;
  domain: string | null;
}

function SourceBadge({ source }: { source: CompanyEntry['source'] }) {
  if (source === 'odoo') {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-purple-200 text-purple-700 bg-purple-50 font-normal">
        Odoo
      </Badge>
    );
  }
  if (source === 'shopify') {
    return (
      <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-green-200 text-green-700 bg-green-50 font-normal flex items-center gap-1">
        <SiShopify className="h-2.5 w-2.5" />
        Shopify
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 border-gray-200 text-gray-500 bg-gray-50 font-normal">
      Contact
    </Badge>
  );
}

export default function CustomerManagement() {
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);

  const { data: companies = [], isLoading } = useQuery<CompanyEntry[]>({
    queryKey: ['/api/companies/all-names', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/companies/all-names?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  const odooCount = companies.filter(c => c.source === 'odoo').length;
  const shopifyCount = companies.filter(c => c.source === 'shopify').length;
  const contactCount = companies.filter(c => c.source === 'contact').length;

  return (
    <div className="max-w-3xl mx-auto">
      {/* Header */}
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-gray-900">Companies</h1>
        <p className="text-sm text-gray-500 mt-1">
          All company names from Odoo, Shopify, and contact records — deduplicated.
        </p>
        {!isLoading && companies.length > 0 && (
          <div className="flex items-center gap-3 mt-2.5">
            <span className="text-xs text-gray-400">{companies.length} total</span>
            {odooCount > 0 && <span className="text-xs text-purple-600">{odooCount} Odoo</span>}
            {shopifyCount > 0 && <span className="text-xs text-green-600">{shopifyCount} Shopify</span>}
            {contactCount > 0 && <span className="text-xs text-gray-500">{contactCount} from contacts</span>}
          </div>
        )}
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
        <Input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search company names…"
          className="pl-9 h-10 bg-white"
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

      {/* States */}
      {isLoading && (
        <div className="text-center py-16 text-gray-400">
          <div className="h-6 w-6 border-2 border-gray-200 border-t-blue-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading companies…</p>
        </div>
      )}

      {!isLoading && companies.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          <Building2 className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {debouncedSearch ? `No companies match "${debouncedSearch}"` : 'No companies found'}
          </p>
        </div>
      )}

      {/* Company list */}
      {!isLoading && companies.length > 0 && (
        <div className="bg-white border border-gray-100 rounded-xl overflow-hidden divide-y divide-gray-50">
          {companies.map((c, i) => {
            const location = [c.city, c.stateProvince].filter(Boolean).join(', ');
            return (
              <div
                key={`${c.source}-${c.id ?? c.name}-${i}`}
                className="flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors"
              >
                {/* Icon */}
                <div className="flex-shrink-0 h-8 w-8 rounded-lg bg-gray-100 flex items-center justify-center">
                  <Building2 className="h-4 w-4 text-gray-400" />
                </div>

                {/* Name + meta */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 truncate">{c.name}</p>
                  <div className="flex items-center gap-3 mt-0.5">
                    {location && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {location}
                      </span>
                    )}
                    {c.domain && (
                      <span className="text-xs text-gray-400 flex items-center gap-1">
                        <Globe className="h-3 w-3" />
                        {c.domain}
                      </span>
                    )}
                  </div>
                </div>

                {/* Source badge */}
                <SourceBadge source={c.source} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

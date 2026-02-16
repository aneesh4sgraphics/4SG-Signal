import { useState, useRef, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Link } from "wouter";
import {
  Search, TrendingUp, DollarSign, Building2, Mail, Phone,
  MapPin, ExternalLink, Loader2, BarChart3, ShoppingCart, AlertCircle
} from "lucide-react";

interface CustomerMarginResult {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  city: string | null;
  province: string | null;
  pricingTier: string | null;
  odooPartnerId: number | null;
  averageMargin: number | null;
  lifetimeSales: number;
  orderCount: number;
}

function MarginBadge({ margin }: { margin: number | null }) {
  if (margin === null) {
    return (
      <span className="text-xs text-gray-400 italic">No data</span>
    );
  }

  let color = 'bg-red-100 text-red-800 border-red-300';
  if (margin >= 40) color = 'bg-green-100 text-green-800 border-green-300';
  else if (margin >= 25) color = 'bg-emerald-100 text-emerald-800 border-emerald-300';
  else if (margin >= 15) color = 'bg-amber-100 text-amber-800 border-amber-300';
  else if (margin >= 0) color = 'bg-orange-100 text-orange-800 border-orange-300';

  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-sm font-bold border ${color}`}>
      <TrendingUp className="w-3.5 h-3.5" />
      {margin.toFixed(1)}%
    </span>
  );
}

function MarginBar({ margin }: { margin: number | null }) {
  if (margin === null) return null;
  const clampedMargin = Math.max(0, Math.min(100, margin));
  
  let barColor = 'bg-red-400';
  if (margin >= 40) barColor = 'bg-green-500';
  else if (margin >= 25) barColor = 'bg-emerald-500';
  else if (margin >= 15) barColor = 'bg-amber-500';
  else if (margin >= 0) barColor = 'bg-orange-400';

  return (
    <div className="w-full bg-gray-100 rounded-full h-2.5 mt-1">
      <div
        className={`h-2.5 rounded-full transition-all duration-500 ${barColor}`}
        style={{ width: `${clampedMargin}%` }}
      />
    </div>
  );
}

function formatCurrency(val: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(val);
}

export default function CustomerMarginsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSearchChange = useCallback((val: string) => {
    setSearchTerm(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setDebouncedSearch(val), 400);
  }, []);

  const { data, isLoading, isFetching } = useQuery<{ results: CustomerMarginResult[] }>({
    queryKey: ['/api/customer-margins/search', debouncedSearch],
    queryFn: async () => {
      if (debouncedSearch.trim().length < 2) return { results: [] };
      const res = await fetch(`/api/customer-margins/search?q=${encodeURIComponent(debouncedSearch)}`);
      if (!res.ok) throw new Error('Search failed');
      return res.json();
    },
    enabled: debouncedSearch.trim().length >= 2,
    staleTime: 30000,
  });

  const results = data?.results || [];
  const withMargins = results.filter(r => r.averageMargin !== null);
  const avgOfAll = withMargins.length > 0
    ? withMargins.reduce((sum, r) => sum + (r.averageMargin || 0), 0) / withMargins.length
    : null;

  return (
    <div className="min-h-screen bg-[#FDFBF7] p-4 md:p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-violet-500" />
            Customer Margins
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Search for a customer to see their average margin from confirmed orders
          </p>
        </div>

        <Card className="bg-white/90 backdrop-blur border shadow-sm">
          <CardContent className="p-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
              <Input
                placeholder="Search by company name, contact name, or email..."
                value={searchTerm}
                onChange={(e) => handleSearchChange(e.target.value)}
                className="pl-10 h-12 text-base bg-gray-50 border-gray-200 focus:bg-white"
              />
              {(isLoading || isFetching) && debouncedSearch.length >= 2 && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-violet-400 animate-spin" />
              )}
            </div>
          </CardContent>
        </Card>

        {debouncedSearch.length >= 2 && results.length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-gray-800">{results.length}</div>
                <div className="text-xs text-gray-500">Customers Found</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-violet-600">{withMargins.length}</div>
                <div className="text-xs text-gray-500">With Margin Data</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className={`text-2xl font-bold ${
                  avgOfAll !== null && avgOfAll >= 25 ? 'text-green-600' : 'text-amber-600'
                }`}>
                  {avgOfAll !== null ? `${avgOfAll.toFixed(1)}%` : '—'}
                </div>
                <div className="text-xs text-gray-500">Avg Margin</div>
              </CardContent>
            </Card>
            <Card className="bg-white/80 backdrop-blur">
              <CardContent className="p-4 text-center">
                <div className="text-2xl font-bold text-blue-600">
                  {formatCurrency(results.reduce((sum, r) => sum + r.lifetimeSales, 0))}
                </div>
                <div className="text-xs text-gray-500">Total Revenue</div>
              </CardContent>
            </Card>
          </div>
        )}

        {debouncedSearch.length < 2 && (
          <Card className="bg-white/80">
            <CardContent className="p-12 text-center">
              <Search className="w-12 h-12 text-gray-200 mx-auto mb-4" />
              <h3 className="font-semibold text-gray-600 mb-1">Search for a Customer</h3>
              <p className="text-sm text-gray-400">
                Type at least 2 characters to search by company, name, or email
              </p>
            </CardContent>
          </Card>
        )}

        {debouncedSearch.length >= 2 && !isLoading && results.length === 0 && (
          <Card className="bg-white/80">
            <CardContent className="p-8 text-center">
              <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
              <h3 className="font-semibold text-gray-700 mb-1">No Results</h3>
              <p className="text-sm text-gray-500">No customers matched "{debouncedSearch}"</p>
            </CardContent>
          </Card>
        )}

        {results.length > 0 && (
          <div className="space-y-3">
            {results
              .sort((a, b) => {
                if (a.averageMargin === null && b.averageMargin === null) return 0;
                if (a.averageMargin === null) return 1;
                if (b.averageMargin === null) return -1;
                return b.lifetimeSales - a.lifetimeSales;
              })
              .map((customer) => (
              <Card key={customer.id} className="bg-white hover:shadow-md transition-shadow border">
                <CardContent className="p-4">
                  <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-100 to-purple-100 flex items-center justify-center shrink-0">
                      <Building2 className="w-6 h-6 text-violet-600" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-semibold text-gray-900 truncate">
                          {customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unnamed'}
                        </h3>
                        {customer.pricingTier && (
                          <Badge variant="secondary" className="capitalize text-xs bg-violet-100 text-violet-700 shrink-0">
                            {customer.pricingTier}
                          </Badge>
                        )}
                        {!customer.odooPartnerId && (
                          <Badge variant="outline" className="text-xs text-gray-400 border-gray-200 shrink-0">
                            Not in Odoo
                          </Badge>
                        )}
                        <Link href={`/odoo-contacts/${customer.id}`} className="ml-auto shrink-0">
                          <span className="text-xs text-blue-500 hover:text-blue-700 flex items-center gap-1">
                            <ExternalLink className="w-3 h-3" /> View
                          </span>
                        </Link>
                      </div>

                      {customer.company && (customer.firstName || customer.lastName) && (
                        <p className="text-sm text-gray-500 mb-1">
                          {[customer.firstName, customer.lastName].filter(Boolean).join(' ')}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 mb-3">
                        {customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3" /> {customer.email}
                          </span>
                        )}
                        {customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {customer.phone}
                          </span>
                        )}
                        {(customer.city || customer.province) && (
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {[customer.city, customer.province].filter(Boolean).join(', ')}
                          </span>
                        )}
                      </div>

                      <div className="grid grid-cols-3 gap-4 p-3 bg-gray-50 rounded-lg">
                        <div>
                          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <TrendingUp className="w-3 h-3" /> Avg Margin
                          </div>
                          <MarginBadge margin={customer.averageMargin} />
                          <MarginBar margin={customer.averageMargin} />
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <DollarSign className="w-3 h-3" /> Lifetime Sales
                          </div>
                          <div className="font-semibold text-gray-800">
                            {customer.lifetimeSales > 0 ? formatCurrency(customer.lifetimeSales) : '—'}
                          </div>
                        </div>
                        <div>
                          <div className="text-xs text-gray-500 mb-1 flex items-center gap-1">
                            <ShoppingCart className="w-3 h-3" /> Orders
                          </div>
                          <div className="font-semibold text-gray-800">
                            {customer.orderCount > 0 ? customer.orderCount : '—'}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

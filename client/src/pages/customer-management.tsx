import { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Search, Building2, X, MapPin, Globe, Phone, Mail,
  Users, TrendingUp, ShoppingCart, DollarSign, ChevronRight,
  User, BarChart3, Filter, Clock, ArrowUpDown, RefreshCw,
  CheckSquare, Square, Loader2, Pencil, Trash2, AlertTriangle,
} from 'lucide-react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { useDebounce } from '@/hooks/useDebounce';
import { PRICING_TIERS } from '@shared/schema';

type ConnectionStrength = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold';

interface CompanyCard {
  id: number | null;
  name: string;
  source: 'odoo' | 'contact';
  city: string | null;
  stateProvince: string | null;
  domain: string | null;
  mainPhone: string | null;
  generalEmail: string | null;
  addressLine1: string | null;
  country: string | null;
  contactCount: number;
  lifetimeSales: number;
  totalOrders: number;
  primarySalesRep: string | null;
  primaryPricingTier: string | null;
  primaryCustomerType: string | null;
  lastInteractionDate: string | null;
  connectionStrength: ConnectionStrength;
  companyTags: string | null;
  isOdooLinked: boolean;
  isShopifyLinked: boolean;
  importWarning: string | null;
}

// ─── Connection strength helpers ───────────────────────────────────────────────
const STRENGTH_CONFIG: Record<ConnectionStrength, { label: string; dot: string; text: string }> = {
  very_strong: { label: 'Very Strong', dot: 'bg-green-500',  text: 'text-green-700' },
  strong:      { label: 'Strong',      dot: 'bg-blue-500',   text: 'text-blue-700'  },
  moderate:    { label: 'Moderate',    dot: 'bg-amber-400',  text: 'text-amber-700' },
  weak:        { label: 'Weak',        dot: 'bg-orange-400', text: 'text-orange-700' },
  cold:        { label: 'Cold',        dot: 'bg-red-500',    text: 'text-red-600'   },
};

function StrengthBadge({ strength }: { strength: ConnectionStrength }) {
  const c = STRENGTH_CONFIG[strength];
  return (
    <span className={`inline-flex items-center gap-1.5 text-[11px] font-medium ${c.text}`}>
      <span className={`h-2 w-2 rounded-full flex-shrink-0 ${c.dot}`} />
      {c.label}
    </span>
  );
}

function fmtRelative(iso: string | null): string {
  if (!iso) return '—';
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

interface Customer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  role: string | null;
  pricingTier: string | null;
  tags: string | null;
  totalSpent: string | null;
  totalOrders: number | null;
  salesRepName: string | null;
  note: string | null;
  isCompany: boolean;
  odooPartnerId: number | null;
  sources: string[] | null;
}

type SortOption = 'name' | 'strength_desc' | 'strength_asc' | 'last_contacted_desc' | 'last_contacted_asc';

interface Filters {
  state: string | null;
  source: 'all' | 'odoo' | 'contact';
  hasSales: boolean | null;
  pricingTier: string | null;
  salesRep: string | null;
  hasContacts: boolean | null;
  tag: string | null;
  customerType: string | null;
  sort: SortOption;
  localOnly: boolean;
  missingEmail: boolean;
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function fmt$(n: number) {
  if (n === 0) return '$0';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(0)}K`;
  return `$${n.toLocaleString()}`;
}

const TIER_COLORS: Record<string, string> = {
  diamond: 'bg-blue-100 text-blue-700 border-blue-200',
  gold: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  silver: 'bg-gray-100 text-gray-600 border-gray-200',
  bronze: 'bg-orange-100 text-orange-600 border-orange-200',
  standard: 'bg-slate-100 text-slate-600 border-slate-200',
};

function TierBadge({ tier }: { tier: string | null }) {
  if (!tier) return null;
  const cls = TIER_COLORS[tier.toLowerCase()] ?? 'bg-gray-100 text-gray-600 border-gray-200';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium border ${cls} capitalize`}>
      {tier}
    </span>
  );
}

// ─── Contacts panel ────────────────────────────────────────────────────────────
function CompanyContacts({ company }: { company: CompanyCard }) {
  const { toast } = useToast();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const queryKey = company.id
    ? ['/api/companies', company.id, 'contacts']
    : ['/api/companies/by-name/contacts', company.name];

  const { data, isLoading } = useQuery<{ contacts: Customer[] }>({
    queryKey,
    queryFn: async () => {
      const url = company.id
        ? `/api/companies/${company.id}/contacts`
        : `/api/companies/by-name/contacts?name=${encodeURIComponent(company.name)}`;
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load contacts');
      return res.json();
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await apiRequest('DELETE', `/api/customers/${id}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete failed');
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Contact deleted' });
      queryClient.invalidateQueries({ queryKey });
      queryClient.invalidateQueries({ queryKey: ['/api/companies/directory'] });
      setPendingDeleteId(null);
    },
    onError: (e: Error) => {
      toast({ title: 'Delete failed', description: e.message, variant: 'destructive' });
      setPendingDeleteId(null);
    },
  });

  const contacts = data?.contacts ?? [];

  if (isLoading) {
    return (
      <div className="py-8 text-center text-gray-400">
        <div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto mb-2" />
        <p className="text-sm">Loading contacts…</p>
      </div>
    );
  }

  if (contacts.length === 0) {
    return <p className="text-sm text-gray-400 italic py-4 text-center">No contacts linked to this company</p>;
  }

  return (
    <>
      <div className="space-y-2">
        {contacts.map(c => {
          const name = c.isCompany
            ? c.company || c.firstName || 'Unknown'
            : [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown';
          const spent = parseFloat(c.totalSpent || '0');
          const location = [c.city, c.province].filter(Boolean).join(', ');
          const isOdooContact = c.id.toString().startsWith('odoo_') || !!c.odooPartnerId;
          const isShopifyContact = c.sources?.includes('shopify') ?? false;
          const canDelete = !isOdooContact && !isShopifyContact;
          return (
            <div key={c.id} className="rounded-lg border border-gray-100 p-3 bg-gray-50 hover:bg-white transition-colors">
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0 h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold">
                  {initials(name)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">{name}</p>
                    {c.role && <span className="text-[11px] text-gray-400">{c.role}</span>}
                    <TierBadge tier={c.pricingTier} />
                    {isOdooContact && <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">Odoo</span>}
                    {isShopifyContact && <span className="text-[10px] px-1.5 py-0.5 rounded bg-green-100 text-green-700 font-medium">Shopify</span>}
                  </div>
                  {c.tags && (
                    <div className="flex flex-wrap gap-1 mt-1">
                      {c.tags.split(',').map((tag, i) => (
                        <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 text-teal-800">
                          {tag.trim()}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="mt-1 space-y-0.5">
                    {c.email && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Mail className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        <a href={`mailto:${c.email}`} className="hover:text-indigo-600 truncate">{c.email}</a>
                      </p>
                    )}
                    {(c.phone || c.cell) && (
                      <p className="text-xs text-gray-500 flex items-center gap-1.5">
                        <Phone className="h-3 w-3 flex-shrink-0 text-gray-400" />
                        {c.phone || c.cell}
                      </p>
                    )}
                    {location && (
                      <p className="text-xs text-gray-400 flex items-center gap-1.5">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        {location}
                      </p>
                    )}
                  </div>
                  {(spent > 0 || (c.totalOrders ?? 0) > 0) && (
                    <div className="flex items-center gap-3 mt-1.5 pt-1.5 border-t border-gray-100">
                      {spent > 0 && (
                        <span className="text-[11px] text-gray-500">
                          <span className="font-medium text-gray-700">{fmt$(spent)}</span> spent
                        </span>
                      )}
                      {(c.totalOrders ?? 0) > 0 && (
                        <span className="text-[11px] text-gray-500">
                          <span className="font-medium text-gray-700">{c.totalOrders}</span> orders
                        </span>
                      )}
                      {c.salesRepName && (
                        <span className="text-[11px] text-gray-400">via {c.salesRepName}</span>
                      )}
                    </div>
                  )}
                </div>
                {canDelete && (
                  <button
                    onClick={() => setPendingDeleteId(c.id)}
                    className="flex-shrink-0 p-1.5 rounded-md text-gray-300 hover:text-rose-500 hover:bg-rose-50 transition-colors"
                    title="Delete contact"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={open => { if (!open) setPendingDeleteId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-rose-500" />
              Delete this contact?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the contact. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 hover:bg-rose-700 text-white"
              onClick={() => pendingDeleteId && deleteContactMutation.mutate(pendingDeleteId)}
            >
              {deleteContactMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Company detail Sheet ──────────────────────────────────────────────────────
function CompanySheet({ company, onClose }: { company: CompanyCard | null; onClose: () => void }) {
  if (!company) return null;

  const avgOrderValue = company.totalOrders > 0 ? company.lifetimeSales / company.totalOrders : 0;
  const address = [company.addressLine1, company.city, company.stateProvince, company.country]
    .filter(Boolean).join(', ');

  return (
    <Sheet open={!!company} onOpenChange={v => { if (!v) onClose(); }}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-0" side="right">
        <div className="sticky top-0 z-10 bg-white border-b border-gray-100 px-6 py-5">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-3">
              <div className="h-11 w-11 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-lg font-bold flex-shrink-0">
                {initials(company.name)}
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <p className="text-base font-semibold text-gray-900 leading-tight truncate">{company.name}</p>
                  {company.importWarning === 'no_email' && (
                    <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200 flex-shrink-0">
                      <AlertTriangle className="w-2.5 h-2.5" />No Email
                    </span>
                  )}
                </div>
                {company.domain && (
                  <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5">
                    <Globe className="h-3 w-3" />{company.domain}
                  </p>
                )}
              </div>
            </SheetTitle>
          </SheetHeader>
        </div>

        <div className="px-6 py-5 space-y-6">
          {(address || company.mainPhone || company.generalEmail) && (
            <div className="space-y-1.5">
              {address && (
                <div className="flex items-start gap-2 text-sm text-gray-600">
                  <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
                  <span>{address}</span>
                </div>
              )}
              {company.mainPhone && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Phone className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <a href={`tel:${company.mainPhone}`} className="hover:text-indigo-600">{company.mainPhone}</a>
                </div>
              )}
              {company.generalEmail && (
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <Mail className="h-4 w-4 text-gray-400 flex-shrink-0" />
                  <a href={`mailto:${company.generalEmail}`} className="hover:text-indigo-600 truncate">{company.generalEmail}</a>
                </div>
              )}
            </div>
          )}

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Company Financials</h3>
            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <DollarSign className="h-3.5 w-3.5 text-green-500" />
                  <span className="text-[11px] text-gray-400 font-medium">Lifetime Sales</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{fmt$(company.lifetimeSales)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <ShoppingCart className="h-3.5 w-3.5 text-blue-500" />
                  <span className="text-[11px] text-gray-400 font-medium">Total Orders</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{company.totalOrders.toLocaleString()}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <TrendingUp className="h-3.5 w-3.5 text-purple-500" />
                  <span className="text-[11px] text-gray-400 font-medium">Avg. Order Value</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{fmt$(avgOrderValue)}</p>
              </div>
              <div className="rounded-xl border border-gray-100 bg-gray-50 p-3">
                <div className="flex items-center gap-1.5 mb-1">
                  <Users className="h-3.5 w-3.5 text-orange-500" />
                  <span className="text-[11px] text-gray-400 font-medium">Contacts</span>
                </div>
                <p className="text-xl font-bold text-gray-900">{company.contactCount}</p>
              </div>
            </div>
            <div className="flex items-center justify-between mt-2.5 px-3 py-2 rounded-lg bg-gray-50 border border-gray-100">
              <div className="flex items-center gap-2">
                <StrengthBadge strength={company.connectionStrength} />
                <span className="text-xs text-gray-400 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {company.lastInteractionDate ? fmtRelative(company.lastInteractionDate) : 'No activity'}
                </span>
              </div>
              {company.primaryPricingTier && <TierBadge tier={company.primaryPricingTier} />}
            </div>

            {(company.primarySalesRep || company.primaryPricingTier) && (
              <div className="flex items-center gap-3 mt-2 px-3 py-2 rounded-lg bg-indigo-50 border border-indigo-100">
                {company.primarySalesRep && (
                  <div className="flex items-center gap-1.5">
                    <User className="h-3.5 w-3.5 text-indigo-400" />
                    <span className="text-xs text-indigo-700 font-medium">{company.primarySalesRep}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div>
            <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">
              Contacts ({company.contactCount})
            </h3>
            <CompanyContacts company={company} />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}



// ─── Business card ─────────────────────────────────────────────────────────────
function CompanyCardItem({
  company, onClick, selectMode = false, isSelected = false, onToggle,
}: {
  company: CompanyCard;
  onClick: () => void;
  selectMode?: boolean;
  isSelected?: boolean;
  onToggle?: () => void;
}) {
  const location = [company.city, company.stateProvince].filter(Boolean).join(', ');
  const hasFinancials = company.lifetimeSales > 0 || company.totalOrders > 0;

  const handleClick = () => {
    if (selectMode) { onToggle?.(); } else { onClick(); }
  };

  return (
    <button
      onClick={handleClick}
      className={`w-full text-left rounded-xl border transition-all p-4 group ${
        isSelected
          ? 'bg-indigo-50 border-indigo-300 shadow-sm'
          : 'bg-white border-gray-100 hover:border-indigo-200 hover:shadow-md'
      }`}
    >
      <div className="flex items-start gap-3 mb-3">
        {selectMode ? (
          <div className="flex-shrink-0 h-10 w-10 flex items-center justify-center">
            {isSelected
              ? <CheckSquare className="h-5 w-5 text-indigo-600" />
              : <Square className="h-5 w-5 text-gray-300 group-hover:text-gray-400" />
            }
          </div>
        ) : (
          <div className="flex-shrink-0 h-10 w-10 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-sm font-bold group-hover:bg-indigo-200 transition-colors">
            {initials(company.name)}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="text-sm font-semibold text-gray-900 truncate leading-tight">{company.name}</p>
            {company.primaryCustomerType && (
              <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium capitalize ${
                company.primaryCustomerType === 'reseller'
                  ? 'bg-blue-100 text-blue-700'
                  : company.primaryCustomerType === 'printer'
                  ? 'bg-purple-100 text-purple-700'
                  : 'bg-gray-100 text-gray-600'
              }`}>
                {company.primaryCustomerType}
              </span>
            )}
            {company.isOdooLinked && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700">Odoo</span>
            )}
            {company.isShopifyLinked && (
              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-green-100 text-green-700">Shopify</span>
            )}
            {company.importWarning === 'no_email' && (
              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-100 text-amber-700 border border-amber-200">
                <AlertTriangle className="w-2.5 h-2.5" />No Email
              </span>
            )}
          </div>
          {location ? (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
              <MapPin className="h-3 w-3 flex-shrink-0" />{location}
            </p>
          ) : company.domain ? (
            <p className="text-xs text-gray-400 flex items-center gap-1 mt-0.5 truncate">
              <Globe className="h-3 w-3 flex-shrink-0" />{company.domain}
            </p>
          ) : null}
        </div>
        {!selectMode && (
          <ChevronRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 flex-shrink-0 mt-0.5 transition-colors" />
        )}
      </div>

      {hasFinancials ? (
        <div className="grid grid-cols-3 gap-1.5 mb-2.5">
          <div className="rounded-lg bg-gray-50 px-2 py-1.5 text-center">
            <p className="text-[10px] text-gray-400">Sales</p>
            <p className="text-xs font-bold text-gray-800">{fmt$(company.lifetimeSales)}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-2 py-1.5 text-center">
            <p className="text-[10px] text-gray-400">Orders</p>
            <p className="text-xs font-bold text-gray-800">{company.totalOrders}</p>
          </div>
          <div className="rounded-lg bg-gray-50 px-2 py-1.5 text-center">
            <p className="text-[10px] text-gray-400">Contacts</p>
            <p className="text-xs font-bold text-gray-800">{company.contactCount}</p>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 mb-2.5">
          <span className="text-xs text-gray-400 flex items-center gap-1">
            <Users className="h-3 w-3" />{company.contactCount} contact{company.contactCount !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      <div className="flex items-center justify-between mt-1">
        <StrengthBadge strength={company.connectionStrength} />
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-gray-400 flex items-center gap-1">
            <Clock className="h-2.5 w-2.5" />
            {company.lastInteractionDate ? fmtRelative(company.lastInteractionDate) : 'No activity'}
          </span>
          {company.primaryPricingTier && <TierBadge tier={company.primaryPricingTier} />}
        </div>
      </div>
    </button>
  );
}

function companyKey(c: { id: number | null; name: string }): string {
  return c.id !== null ? `id:${c.id}` : `name:${c.name}`;
}

// ─── Main page ─────────────────────────────────────────────────────────────────
const STRENGTH_ORDER: Record<string, number> = {
  very_strong: 0, strong: 1, moderate: 2, weak: 3, cold: 4,
};

const DEFAULT_FILTERS: Filters = {
  state: null,
  source: 'all',
  hasSales: null,
  pricingTier: null,
  salesRep: null,
  hasContacts: null,
  tag: null,
  customerType: null,
  sort: 'name',
  localOnly: false,
  missingEmail: false,
};

export default function CustomerManagement() {
  const [, navigate] = useLocation();
  const { user } = useAuth();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const debouncedSearch = useDebounce(search, 250);
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());
  const [bulkType, setBulkType] = useState<string>('');

  const toggleSelect = (key: string) => setSelectedKeys(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const selectAll = () => setSelectedKeys(new Set(companies.map(companyKey)));
  const clearSelection = () => setSelectedKeys(new Set());
  const exitSelectMode = () => { setSelectMode(false); clearSelection(); setBulkType(''); };

  const bulkTypeMutation = useMutation({
    mutationFn: async (customerType: string | null) => {
      const selected = companies.filter(c => selectedKeys.has(companyKey(c)));
      const companyIds = selected.filter(c => c.id !== null).map(c => c.id as number);
      const companyNames = selected.filter(c => c.id === null).map(c => c.name);
      const res = await apiRequest('POST', '/api/companies/bulk-set-customer-type', {
        companyIds, companyNames, customerType,
      });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Customer type updated',
        description: `Updated ${data.updated} contact${data.updated !== 1 ? 's' : ''} across ${selectedKeys.size} compan${selectedKeys.size !== 1 ? 'ies' : 'y'}.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/companies/directory'] });
      exitSelectMode();
    },
    onError: () => toast({ title: 'Update failed', variant: 'destructive' }),
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest('POST', '/api/odoo/sync-companies').then(r => r.json()),
    onSuccess: (data: any) => {
      toast({
        title: 'Odoo sync complete',
        description: `Created ${data.created}, updated ${data.updated}, linked ${data.linkedCustomers} contacts.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/companies/directory'] });
    },
    onError: () => toast({ title: 'Sync failed', description: 'Could not sync companies from Odoo.', variant: 'destructive' }),
  });

  const { data: allCompanies = [], isLoading } = useQuery<CompanyCard[]>({
    queryKey: ['/api/companies/directory', debouncedSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (debouncedSearch.trim()) params.set('search', debouncedSearch.trim());
      const res = await fetch(`/api/companies/directory?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      return Array.isArray(data) ? data : [];
    },
    staleTime: 60000,
  });

  // Derive filter options from loaded data
  const uniqueStates = useMemo(() =>
    Array.from(new Set(allCompanies.map(c => c.stateProvince).filter(Boolean) as string[])).sort(),
    [allCompanies]
  );
  const uniqueSalesReps = useMemo(() =>
    Array.from(new Set(allCompanies.map(c => c.primarySalesRep).filter(Boolean) as string[])).sort(),
    [allCompanies]
  );

  const uniqueCompanyTags = useMemo(() =>
    Array.from(new Set(
      allCompanies.flatMap(c => c.companyTags ? c.companyTags.split(',').map(t => t.trim()).filter(Boolean) : [])
    )).sort(),
    [allCompanies]
  );

  // Apply client-side filters
  const companies = useMemo(() => {
    const filtered = allCompanies.filter(c => {
      if (filters.source !== 'all' && c.source !== filters.source) return false;
      if (filters.state && c.stateProvince !== filters.state) return false;
      if (filters.hasSales === true && c.lifetimeSales <= 0) return false;
      if (filters.hasSales === false && c.lifetimeSales > 0) return false;
      if (filters.pricingTier && c.primaryPricingTier?.toLowerCase() !== filters.pricingTier.toLowerCase()) return false;
      if (filters.salesRep && c.primarySalesRep !== filters.salesRep) return false;
      if (filters.hasContacts === true && c.contactCount === 0) return false;
      if (filters.hasContacts === false && c.contactCount > 0) return false;
      if (filters.tag && !c.companyTags?.split(',').map(t => t.trim()).includes(filters.tag)) return false;
      if (filters.customerType && c.primaryCustomerType?.toLowerCase() !== filters.customerType.toLowerCase()) return false;
      if (filters.localOnly && (c.isOdooLinked || c.isShopifyLinked)) return false;
      if (filters.missingEmail && c.importWarning !== 'no_email') return false;
      return true;
    });

    const sorted = [...filtered];
    if (filters.sort === 'name') {
      sorted.sort((a, b) => a.name.localeCompare(b.name));
    } else if (filters.sort === 'strength_desc') {
      sorted.sort((a, b) => {
        const av = STRENGTH_ORDER[a.connectionStrength ?? 'cold'] ?? 4;
        const bv = STRENGTH_ORDER[b.connectionStrength ?? 'cold'] ?? 4;
        return av !== bv ? av - bv : a.name.localeCompare(b.name);
      });
    } else if (filters.sort === 'strength_asc') {
      sorted.sort((a, b) => {
        const av = STRENGTH_ORDER[a.connectionStrength ?? 'cold'] ?? 4;
        const bv = STRENGTH_ORDER[b.connectionStrength ?? 'cold'] ?? 4;
        return av !== bv ? bv - av : a.name.localeCompare(b.name);
      });
    } else if (filters.sort === 'last_contacted_desc') {
      sorted.sort((a, b) => {
        if (!a.lastInteractionDate && !b.lastInteractionDate) return a.name.localeCompare(b.name);
        if (!a.lastInteractionDate) return 1;
        if (!b.lastInteractionDate) return -1;
        return new Date(b.lastInteractionDate).getTime() - new Date(a.lastInteractionDate).getTime();
      });
    } else if (filters.sort === 'last_contacted_asc') {
      sorted.sort((a, b) => {
        if (!a.lastInteractionDate && !b.lastInteractionDate) return a.name.localeCompare(b.name);
        if (!a.lastInteractionDate) return 1;
        if (!b.lastInteractionDate) return -1;
        return new Date(a.lastInteractionDate).getTime() - new Date(b.lastInteractionDate).getTime();
      });
    }
    return sorted;
  }, [allCompanies, filters]);

  const activeFiltersCount = [
    filters.state !== null ? 1 : 0,
    filters.source !== 'all' ? 1 : 0,
    filters.hasSales !== null ? 1 : 0,
    filters.pricingTier !== null ? 1 : 0,
    filters.salesRep !== null ? 1 : 0,
    filters.hasContacts !== null ? 1 : 0,
    filters.tag !== null ? 1 : 0,
    filters.customerType !== null ? 1 : 0,
    filters.localOnly ? 1 : 0,
    filters.missingEmail ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  return (
    <div>
      {/* Page header */}
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Companies</h1>
          {!isLoading && (
            <p className="text-sm text-gray-400 mt-0.5">
              {companies.length} of {allCompanies.length} {allCompanies.length === 1 ? 'company' : 'companies'}
              {debouncedSearch && ` matching "${debouncedSearch}"`}
            </p>
          )}
        </div>
        {user?.role === 'admin' && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending}
            className="gap-1.5 text-xs"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? 'Syncing…' : 'Sync from Odoo'}
          </Button>
        )}
      </div>

      {/* Search + filter toolbar */}
      <div className="mb-4">
        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
            <Input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search companies…"
              className="pl-9 h-9 bg-white"
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
          <Select
            value={filters.sort}
            onValueChange={v => setFilters(f => ({ ...f, sort: v as SortOption }))}
          >
            <SelectTrigger className="h-9 w-auto gap-1.5 text-sm border bg-white pl-2.5 pr-2">
              <ArrowUpDown className="h-3.5 w-3.5 text-gray-500 shrink-0" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="name">Name (A–Z)</SelectItem>
              <SelectItem value="strength_desc">Strongest first</SelectItem>
              <SelectItem value="strength_asc">Weakest first</SelectItem>
              <SelectItem value="last_contacted_desc">Last contacted (newest)</SelectItem>
              <SelectItem value="last_contacted_asc">Last contacted (oldest)</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            className="gap-2 h-9"
            onClick={() => setShowFilters(v => !v)}
          >
            <Filter className="h-4 w-4" />
            Filters
            {activeFiltersCount > 0 && (
              <Badge className="ml-0.5 h-5 w-5 p-0 flex items-center justify-center text-[10px] bg-indigo-600">
                {activeFiltersCount}
              </Badge>
            )}
          </Button>
          <Button
            variant={selectMode ? 'secondary' : 'outline'}
            size="sm"
            className="gap-2 h-9"
            onClick={() => { if (selectMode) { exitSelectMode(); } else { setSelectMode(true); } }}
          >
            <Pencil className="h-4 w-4" />
            {selectMode ? 'Cancel' : 'Bulk Edit'}
          </Button>
        </div>

        {/* Filter panel */}
        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden"
            >
              <div className="pt-3 flex flex-wrap items-center gap-2.5">
                {/* Source */}
                <Select
                  value={filters.source}
                  onValueChange={v => setFilters(f => ({ ...f, source: v as Filters['source'] }))}
                >
                  <SelectTrigger className="w-[140px] h-9 bg-white text-sm">
                    <SelectValue placeholder="Source" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="odoo">Odoo</SelectItem>
                    <SelectItem value="contact">From Contacts</SelectItem>
                  </SelectContent>
                </Select>

                {/* State/Province */}
                {uniqueStates.length > 0 && (
                  <Select
                    value={filters.state || 'all'}
                    onValueChange={v => setFilters(f => ({ ...f, state: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[160px] h-9 bg-white text-sm">
                      <SelectValue placeholder="State/Province" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueStates.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Pricing Tier */}
                <Select
                  value={filters.pricingTier || 'all'}
                  onValueChange={v => setFilters(f => ({ ...f, pricingTier: v === 'all' ? null : v }))}
                >
                  <SelectTrigger className="w-[155px] h-9 bg-white text-sm">
                    <SelectValue placeholder="Pricing Tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Tiers</SelectItem>
                    {PRICING_TIERS.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {/* Sales Rep */}
                {uniqueSalesReps.length > 0 && (
                  <Select
                    value={filters.salesRep || 'all'}
                    onValueChange={v => setFilters(f => ({ ...f, salesRep: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[175px] h-9 bg-white text-sm">
                      <SelectValue placeholder="Sales Rep" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Sales Reps</SelectItem>
                      {uniqueSalesReps.map(r => (
                        <SelectItem key={r} value={r}>{r}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Has Sales */}
                <Select
                  value={filters.hasSales === null ? 'all' : filters.hasSales ? 'yes' : 'no'}
                  onValueChange={v => setFilters(f => ({ ...f, hasSales: v === 'all' ? null : v === 'yes' }))}
                >
                  <SelectTrigger className="w-[145px] h-9 bg-white text-sm">
                    <SelectValue placeholder="Sales" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Sales</SelectItem>
                    <SelectItem value="yes">Has Sales</SelectItem>
                    <SelectItem value="no">No Sales</SelectItem>
                  </SelectContent>
                </Select>

                {/* Has Contacts */}
                <Select
                  value={filters.hasContacts === null ? 'all' : filters.hasContacts ? 'yes' : 'no'}
                  onValueChange={v => setFilters(f => ({ ...f, hasContacts: v === 'all' ? null : v === 'yes' }))}
                >
                  <SelectTrigger className="w-[155px] h-9 bg-white text-sm">
                    <SelectValue placeholder="Contacts" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Any Contacts</SelectItem>
                    <SelectItem value="yes">Has Contacts</SelectItem>
                    <SelectItem value="no">No Contacts</SelectItem>
                  </SelectContent>
                </Select>

                {/* Customer Type */}
                <Select
                  value={filters.customerType || 'all'}
                  onValueChange={v => setFilters(f => ({ ...f, customerType: v === 'all' ? null : v }))}
                >
                  <SelectTrigger className="w-[155px] h-9 bg-white text-sm">
                    <SelectValue placeholder="Customer Type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Types</SelectItem>
                    <SelectItem value="reseller">Reseller</SelectItem>
                    <SelectItem value="printer">Printer</SelectItem>
                  </SelectContent>
                </Select>

                {/* Tag Filter */}
                {uniqueCompanyTags.length > 0 && (
                  <Select
                    value={filters.tag || 'all'}
                    onValueChange={v => setFilters(f => ({ ...f, tag: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[175px] h-9 bg-white text-sm">
                      <SelectValue placeholder="All Tags" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tags</SelectItem>
                      {uniqueCompanyTags.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                {/* Missing Email toggle */}
                <Button
                  variant={filters.missingEmail ? 'default' : 'outline'}
                  size="sm"
                  className={`h-9 gap-1.5 text-sm ${filters.missingEmail ? 'bg-amber-500 hover:bg-amber-600 text-white border-amber-500' : 'text-amber-700 border-amber-200 hover:bg-amber-50'}`}
                  onClick={() => setFilters(f => ({ ...f, missingEmail: !f.missingEmail }))}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  Missing Email
                </Button>

                {/* Local only toggle */}
                <Button
                  variant={filters.localOnly ? 'default' : 'outline'}
                  size="sm"
                  className={`h-9 gap-1.5 text-sm ${filters.localOnly ? 'bg-rose-600 hover:bg-rose-700 text-white border-rose-600' : 'text-gray-600'}`}
                  onClick={() => setFilters(f => ({ ...f, localOnly: !f.localOnly }))}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Local only
                </Button>

                {/* Clear */}
                {activeFiltersCount > 0 && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="text-gray-500 h-9">
                    <X className="h-4 w-4 mr-1" />
                    Clear
                  </Button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Loading */}
      {isLoading && (
        <div className="text-center py-20 text-gray-400">
          <div className="h-7 w-7 border-2 border-gray-200 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm">Loading companies…</p>
        </div>
      )}

      {/* Empty */}
      {!isLoading && companies.length === 0 && (
        <div className="text-center py-20 text-gray-400">
          <Building2 className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">
            {debouncedSearch || activeFiltersCount > 0
              ? 'No companies match the current filters'
              : 'No companies found'}
          </p>
          {activeFiltersCount > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFilters} className="mt-2 text-gray-500">
              Clear filters
            </Button>
          )}
        </div>
      )}

      {/* Cards grid */}
      {!isLoading && companies.length > 0 && (
        <>
          {/* Select-mode helper bar */}
          {selectMode && (
            <div className="mb-3 flex items-center gap-3 px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg">
              <span className="text-sm text-indigo-700 font-medium">
                {selectedKeys.size} of {companies.length} selected
              </span>
              <button onClick={selectAll} className="text-xs text-indigo-600 hover:text-indigo-800 font-medium underline underline-offset-2">
                Select all {companies.length}
              </button>
              {selectedKeys.size > 0 && (
                <button onClick={clearSelection} className="text-xs text-indigo-500 hover:text-indigo-700">
                  Deselect all
                </button>
              )}
            </div>
          )}

          <div className={`grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 ${selectMode ? 'pb-32' : ''}`}>
            {companies.map((c, i) => {
              const key = companyKey(c);
              return (
                <CompanyCardItem
                  key={`${c.source}-${c.id ?? c.name}-${i}`}
                  company={c}
                  selectMode={selectMode}
                  isSelected={selectedKeys.has(key)}
                  onToggle={() => toggleSelect(key)}
                  onClick={() => {
                    if (c.id !== null) {
                      navigate(`/companies/${c.id}`);
                    } else {
                      navigate(`/companies/name/${encodeURIComponent(c.name)}`);
                    }
                  }}
                />
              );
            })}
          </div>
        </>
      )}

      {/* ── Bulk Edit Action Bar ── */}
      {selectMode && selectedKeys.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 flex items-center gap-3 px-5 py-3 bg-gray-900 text-white rounded-2xl shadow-2xl border border-gray-700">
          <span className="text-sm font-medium pr-3 border-r border-gray-600">
            {selectedKeys.size} compan{selectedKeys.size !== 1 ? 'ies' : 'y'} selected
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-400">Set type:</span>
            <Select
              value={bulkType}
              onValueChange={v => setBulkType(v)}
            >
              <SelectTrigger className="h-8 w-[140px] bg-gray-800 border-gray-600 text-white text-xs">
                <SelectValue placeholder="Choose type…" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="reseller">Reseller</SelectItem>
                <SelectItem value="printer">Printer</SelectItem>
                <SelectItem value="clear">Clear type</SelectItem>
              </SelectContent>
            </Select>
            <Button
              size="sm"
              disabled={!bulkType || bulkTypeMutation.isPending}
              onClick={() => bulkTypeMutation.mutate(bulkType === 'clear' ? null : bulkType)}
              className="bg-indigo-600 hover:bg-indigo-700 h-8 text-xs gap-1.5"
            >
              {bulkTypeMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Saving…</>
                : 'Apply'
              }
            </Button>
          </div>
          <button
            onClick={exitSelectMode}
            className="ml-1 text-gray-400 hover:text-white transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

    </div>
  );
}

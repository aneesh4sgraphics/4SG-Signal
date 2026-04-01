import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Building2, Phone, MapPin, Mail, TrendingUp,
  FileText, Activity, Users, StickyNote, CheckSquare,
  FolderOpen, DollarSign, PhoneCall, Package, Clock,
  ArrowUpRight, ArrowDownLeft, Send, List, Tag,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

type ConnectionStrength = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold';

interface OdooKpis {
  avgMargin: number | null;
  invoiceCount: number | null;
  outstanding: number | null;
}

interface CompanyData {
  id: number | null;
  name: string;
  domain?: string | null;
  odooCompanyPartnerId?: number | null;
  mainPhone?: string | null;
  generalEmail?: string | null;
  addressLine1?: string | null;
  city?: string | null;
  stateProvince?: string | null;
  country?: string | null;
  source?: string;
}

interface CompanyOverview {
  company: CompanyData;
  contactCount: number;
  lifetimeSales: number;
  totalOrders: number;
  connectionStrength: ConnectionStrength;
  lastInteractionDate: string | null;
  odooKpis: OdooKpis;
}

interface ActivityEvent {
  id: number;
  customerId: string;
  eventType: string;
  title: string;
  description: string | null;
  eventDate: string | null;
  createdByName: string | null;
  amount: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
  contactEmail: string | null;
}

interface CompanyEmail {
  id: number;
  direction: string;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  toName: string | null;
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
  customerId: string | null;
  contactFirstName: string | null;
  contactLastName: string | null;
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  cell: string | null;
  company: string | null;
  address1: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  jobTitle: string | null;
  isCompany: boolean;
}

interface InvoiceLineItem {
  id: number;
  sku: string;
  description: string;
  pricePerUnit: number;
  quantity: number;
  total: number;
}

interface Invoice {
  invoiceNumber: string;
  invoiceDate: string | null;
  partnerName: string;
  lines: InvoiceLineItem[];
  invoiceTotal: number;
}

const STRENGTH_CONFIG: Record<ConnectionStrength, { label: string; dot: string; text: string }> = {
  very_strong: { label: 'Very Strong', dot: 'bg-green-500', text: 'text-green-700' },
  strong: { label: 'Strong', dot: 'bg-blue-500', text: 'text-blue-700' },
  moderate: { label: 'Moderate', dot: 'bg-amber-400', text: 'text-amber-700' },
  weak: { label: 'Weak', dot: 'bg-orange-400', text: 'text-orange-700' },
  cold: { label: 'Cold', dot: 'bg-red-500', text: 'text-red-600' },
};

function fmt$(n: number) {
  if (n === 0) return '$0.00';
  if (n >= 1000000) return `$${(n / 1000000).toFixed(1)}M`;
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}K`;
  return `$${n.toFixed(2)}`;
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

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?';
}

function KpiTile({ label, value, icon: Icon, color = 'bg-white', textColor = 'text-gray-900', subtext }: {
  label: string; value: string | number; icon: LucideIcon; color?: string; textColor?: string; subtext?: string;
}) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 text-gray-400" />
        <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-2xl font-bold ${textColor}`}>{value}</p>
      {subtext && <p className="text-xs text-gray-400 mt-1">{subtext}</p>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, message }: { icon: LucideIcon; title: string; message: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon className="h-10 w-10 mb-3 opacity-30" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      <p className="text-xs text-gray-400 mt-1">{message}</p>
    </div>
  );
}

function OverviewTab({ overview }: { overview: CompanyOverview }) {
  const hasOdooLink = !!overview.company?.odooCompanyPartnerId;
  const kpis = overview.odooKpis;
  const noOdooSubtext = 'Not linked to Odoo';

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiTile
          label="Connection Strength"
          value={STRENGTH_CONFIG[overview.connectionStrength]?.label || 'Unknown'}
          icon={Activity}
          subtext={overview.lastInteractionDate ? `Last: ${fmtRelative(overview.lastInteractionDate)}` : undefined}
        />
        <KpiTile
          label="Avg. Margin %"
          value={hasOdooLink ? (kpis.avgMargin != null ? `${kpis.avgMargin.toFixed(1)}%` : '—') : '—'}
          icon={TrendingUp}
          color="bg-blue-50 border-blue-200"
          textColor="text-blue-700"
          subtext={!hasOdooLink ? noOdooSubtext : undefined}
        />
        <KpiTile
          label="No. of Invoices"
          value={hasOdooLink ? (kpis.invoiceCount ?? '—') : '—'}
          icon={FileText}
          subtext={!hasOdooLink ? noOdooSubtext : undefined}
        />
        <KpiTile
          label="Current Outstanding"
          value={hasOdooLink ? (kpis.outstanding != null ? fmt$(kpis.outstanding) : '—') : '—'}
          icon={DollarSign}
          color="bg-red-50 border-red-200"
          textColor="text-red-700"
          subtext={!hasOdooLink ? noOdooSubtext : undefined}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-400 mb-1">Lifetime Sales</p>
          <p className="text-xl font-bold text-gray-900">{fmt$(overview.lifetimeSales || 0)}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-400 mb-1">Total Orders</p>
          <p className="text-xl font-bold text-gray-900">{(overview.totalOrders || 0).toLocaleString()}</p>
        </div>
        <div className="rounded-xl border bg-white p-4">
          <p className="text-xs text-gray-400 mb-1">Contacts</p>
          <p className="text-xl font-bold text-gray-900">{(overview.contactCount || 0).toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function ActivityTab({ companyId, companyName }: { companyId: number | null; companyName: string }) {
  const url = companyId
    ? `/api/companies/${companyId}/activity`
    : `/api/companies/by-name/activity?name=${encodeURIComponent(companyName)}`;

  const { data, isLoading } = useQuery<{ events: ActivityEvent[] }>({
    queryKey: companyId ? ['/api/companies', companyId, 'activity'] : ['/api/companies/by-name/activity', companyName],
    queryFn: async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center"><div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>;

  const events = data?.events ?? [];
  if (events.length === 0) return <EmptyState icon={Activity} title="No activity yet" message="Activity events for this company's contacts will appear here" />;

  return (
    <div className="space-y-3 max-h-[600px] overflow-y-auto">
      {events.map((ev) => {
        const contactName = [ev.contactFirstName, ev.contactLastName].filter(Boolean).join(' ') || ev.contactEmail || 'Unknown';
        return (
          <div key={ev.id} className="flex gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50">
            <div className="flex-shrink-0 mt-1">
              <div className="h-8 w-8 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600 text-xs font-semibold">
                {initials(contactName)}
              </div>
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-medium text-gray-900">{ev.title}</p>
                <Badge variant="outline" className="text-[10px]">{ev.eventType}</Badge>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">{contactName}</p>
              {ev.description && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{ev.description}</p>}
              <p className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {ev.eventDate ? new Date(ev.eventDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—'}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmailsTab({ companyId, companyName }: { companyId: number | null; companyName: string }) {
  const url = companyId
    ? `/api/companies/${companyId}/emails`
    : `/api/companies/by-name/emails?name=${encodeURIComponent(companyName)}`;

  const { data, isLoading } = useQuery<{ emails: CompanyEmail[] }>({
    queryKey: companyId ? ['/api/companies', companyId, 'emails'] : ['/api/companies/by-name/emails', companyName],
    queryFn: async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center"><div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>;

  const emails = data?.emails ?? [];
  if (emails.length === 0) return <EmptyState icon={Mail} title="No emails yet" message="Gmail messages involving this company's contacts will appear here" />;

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {emails.map((em) => {
        const isInbound = em.direction === 'inbound';
        return (
          <div key={em.id} className="p-3 rounded-lg border bg-white hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <div className={`flex-shrink-0 mt-0.5 rounded-full p-1.5 ${isInbound ? 'bg-green-100' : 'bg-blue-100'}`}>
                {isInbound ? <ArrowDownLeft className="h-3.5 w-3.5 text-green-600" /> : <ArrowUpRight className="h-3.5 w-3.5 text-blue-600" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">{em.subject || '(no subject)'}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                  <span>{isInbound ? em.fromName || em.fromEmail : em.toName || em.toEmail}</span>
                  <span className="text-gray-300">·</span>
                  <span>{em.sentAt ? fmtRelative(em.sentAt) : '—'}</span>
                </div>
                {em.snippet && <p className="text-xs text-gray-400 mt-1 line-clamp-2">{em.snippet}</p>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TeamTab({ companyId, companyName }: { companyId: number | null; companyName: string }) {
  const url = companyId
    ? `/api/companies/${companyId}/contacts`
    : `/api/companies/by-name/contacts?name=${encodeURIComponent(companyName)}`;

  const { data, isLoading } = useQuery<{ contacts: Contact[] }>({
    queryKey: companyId ? ['/api/companies', companyId, 'contacts'] : ['/api/companies/by-name/contacts', companyName],
    queryFn: async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center"><div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>;

  const contacts = data?.contacts ?? [];
  if (contacts.length === 0) return <EmptyState icon={Users} title="No contacts" message="No contacts linked to this company" />;

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {contacts.map((c) => {
        const name = c.isCompany
          ? c.company || c.firstName || 'Unknown'
          : [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown';
        const address = [c.address1, c.city, c.province, c.country].filter(Boolean).join(', ');
        return (
          <div key={c.id} className="p-3 rounded-lg border bg-white hover:bg-gray-50">
            <div className="flex items-start gap-3">
              <div className="flex-shrink-0 h-9 w-9 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-xs font-semibold">
                {initials(name)}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-900">{name}</p>
                {c.jobTitle && <p className="text-xs text-gray-500">{c.jobTitle}</p>}
                <div className="mt-1.5 space-y-0.5">
                  {c.email && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Mail className="h-3 w-3 text-gray-400" />
                      <a href={`mailto:${c.email}`} className="hover:text-indigo-600 truncate">{c.email}</a>
                    </p>
                  )}
                  {(c.phone || c.cell) && (
                    <p className="text-xs text-gray-500 flex items-center gap-1.5">
                      <Phone className="h-3 w-3 text-gray-400" />
                      {c.phone || c.cell}
                    </p>
                  )}
                  {address && (
                    <p className="text-xs text-gray-400 flex items-center gap-1.5">
                      <MapPin className="h-3 w-3" />
                      {address}
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface CompanyFilesData {
  emailSends: Array<{
    id: number; subject: string; recipientEmail: string; recipientName?: string | null;
    sentBy?: string | null; sentAt: string | null; status: string | null;
    contactFirstName?: string | null; contactLastName?: string | null;
  }>;
  quoteEvents: Array<{
    id: number; quoteNumber?: string | null; eventType: string;
    totalAmount?: string | null; itemCount?: number | null;
    createdAt: string | null;
    contactFirstName?: string | null; contactLastName?: string | null;
  }>;
  priceListEvents: Array<{
    id: number; eventType: string; priceTier?: string | null;
    productTypes?: string[] | null; userEmail?: string | null;
    createdAt: string | null;
    contactFirstName?: string | null; contactLastName?: string | null;
  }>;
}

function FilesTab({ companyId, companyName }: { companyId: number | null; companyName: string }) {
  const url = companyId
    ? `/api/companies/${companyId}/files`
    : `/api/companies/by-name/files?name=${encodeURIComponent(companyName)}`;

  const { data, isLoading } = useQuery<CompanyFilesData>({
    queryKey: companyId ? ['/api/companies', companyId, 'files'] : ['/api/companies/by-name/files', companyName],
    queryFn: async () => {
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
  });

  if (isLoading) return <div className="py-8 text-center"><div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>;

  const sends = data?.emailSends ?? [];
  const quotes = data?.quoteEvents ?? [];
  const priceLists = data?.priceListEvents ?? [];
  const total = sends.length + quotes.length + priceLists.length;

  if (total === 0) return <EmptyState icon={FolderOpen} title="No files yet" message="Email sends, QuickQuotes, and Price Lists sent to this company will appear here" />;

  const QUOTE_TYPE_COLORS: Record<string, string> = {
    sent: 'bg-blue-100 text-blue-700',
    viewed: 'bg-amber-100 text-amber-700',
    accepted: 'bg-green-100 text-green-700',
    rejected: 'bg-red-100 text-red-700',
    expired: 'bg-gray-100 text-gray-600',
  };

  const PRICE_EVENT_COLORS: Record<string, string> = {
    email: 'bg-indigo-100 text-indigo-700',
    download: 'bg-purple-100 text-purple-700',
    view: 'bg-teal-100 text-teal-700',
  };

  return (
    <div className="space-y-6">
      {sends.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <Send className="h-3.5 w-3.5" /> CRM Emails Sent ({sends.length})
          </h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {sends.map(s => {
              const contact = [s.contactFirstName, s.contactLastName].filter(Boolean).join(' ') || s.recipientName || s.recipientEmail;
              return (
                <div key={s.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Send className="h-3.5 w-3.5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{s.subject || '(no subject)'}</p>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                      <span className="truncate">To: {contact}</span>
                      {s.sentBy && <><span className="text-gray-300">·</span><span>by {s.sentBy}</span></>}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {s.sentAt ? fmtRelative(s.sentAt) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {quotes.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> QuickQuotes ({quotes.length})
          </h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {quotes.map(q => {
              const contact = [q.contactFirstName, q.contactLastName].filter(Boolean).join(' ') || '—';
              const colorClass = QUOTE_TYPE_COLORS[q.eventType] || 'bg-gray-100 text-gray-600';
              return (
                <div key={q.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-green-100 flex items-center justify-center">
                    <FileText className="h-3.5 w-3.5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      {q.quoteNumber && <span className="text-sm font-semibold text-gray-900 font-mono">{q.quoteNumber}</span>}
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${colorClass}`}>{q.eventType}</Badge>
                      {q.totalAmount && <span className="text-sm font-medium text-gray-700">${parseFloat(q.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>}
                    </div>
                    <p className="text-xs text-gray-500 mt-0.5">{contact}{q.itemCount ? ` · ${q.itemCount} items` : ''}</p>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {q.createdAt ? fmtRelative(q.createdAt) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {priceLists.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 flex items-center gap-1.5">
            <List className="h-3.5 w-3.5" /> Price Lists Sent ({priceLists.length})
          </h3>
          <div className="space-y-2 max-h-[320px] overflow-y-auto">
            {priceLists.map(p => {
              const contact = [p.contactFirstName, p.contactLastName].filter(Boolean).join(' ') || p.userEmail || '—';
              const colorClass = PRICE_EVENT_COLORS[p.eventType] || 'bg-gray-100 text-gray-600';
              return (
                <div key={p.id} className="flex items-start gap-3 p-3 rounded-lg border bg-white hover:bg-gray-50">
                  <div className="flex-shrink-0 h-8 w-8 rounded-full bg-orange-100 flex items-center justify-center">
                    <List className="h-3.5 w-3.5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Badge className={`text-[10px] px-1.5 py-0 h-4 border-0 ${colorClass}`}>{p.eventType}</Badge>
                      {p.priceTier && (
                        <span className="text-xs font-medium text-gray-700 flex items-center gap-1">
                          <Tag className="h-3 w-3 text-gray-400" />{p.priceTier}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                      <span>{contact}</span>
                      {p.productTypes && p.productTypes.length > 0 && (
                        <><span className="text-gray-300">·</span><span className="truncate">{p.productTypes.join(', ')}</span></>
                      )}
                    </div>
                  </div>
                  <span className="text-[11px] text-gray-400 flex-shrink-0 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    {p.createdAt ? fmtRelative(p.createdAt) : '—'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function ProductPricesTab({ companyId }: { companyId: number | null }) {
  const [expandedInvoices, setExpandedInvoices] = useState<Record<string, boolean>>({});

  const { data, isLoading } = useQuery<{ invoices: Invoice[]; message?: string }>({
    queryKey: ['/api/companies', companyId, 'invoice-lines'],
    queryFn: async () => {
      if (!companyId) return { invoices: [], message: 'Shopify only — no Odoo data' };
      const res = await fetch(`/api/companies/${companyId}/invoice-lines`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: !!companyId,
  });

  if (!companyId) {
    return <EmptyState icon={Package} title="Shopify Only" message="Invoice line data is only available for companies linked to Odoo" />;
  }

  if (isLoading) return <div className="py-8 text-center"><div className="h-5 w-5 border-2 border-gray-200 border-t-blue-400 rounded-full animate-spin mx-auto" /></div>;

  const invoices = data?.invoices ?? [];
  if (invoices.length === 0) {
    return <EmptyState icon={Package} title="No invoices" message={data?.message || "No invoice data found in Odoo"} />;
  }

  const toggleInvoice = (invNum: string) => {
    setExpandedInvoices(prev => ({ ...prev, [invNum]: !prev[invNum] }));
  };

  return (
    <div className="space-y-2 max-h-[600px] overflow-y-auto">
      {invoices.map((inv) => {
        const isExpanded = expandedInvoices[inv.invoiceNumber] ?? false;
        return (
          <div key={inv.invoiceNumber} className="rounded-lg border bg-white overflow-hidden">
            <button
              onClick={() => toggleInvoice(inv.invoiceNumber)}
              className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex-shrink-0 h-9 w-9 rounded-lg bg-indigo-50 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-indigo-500" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-gray-900 font-mono">{inv.invoiceNumber}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {inv.lines.length} {inv.lines.length === 1 ? 'item' : 'items'}
                    </Badge>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500">
                    {inv.invoiceDate && (
                      <span>{new Date(inv.invoiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                    )}
                    {inv.invoiceDate && inv.partnerName && <span className="text-gray-300">·</span>}
                    {inv.partnerName && <span className="truncate">{inv.partnerName}</span>}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-3 flex-shrink-0">
                <span className="text-sm font-bold text-gray-900">${inv.invoiceTotal.toFixed(2)}</span>
                <svg
                  className={`h-4 w-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor"
                >
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </div>
            </button>

            {isExpanded && (
              <div className="border-t bg-gray-50/50">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">SKU</th>
                      <th className="text-left py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Description</th>
                      <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Price/Unit</th>
                      <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Qty</th>
                      <th className="text-right py-2 px-3 text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {inv.lines.map((line) => (
                      <tr key={line.id} className="hover:bg-white/60">
                        <td className="py-1.5 px-3 text-gray-600 text-xs font-mono">{line.sku || '—'}</td>
                        <td className="py-1.5 px-3 text-gray-700 text-xs max-w-[300px] truncate">{line.description}</td>
                        <td className="py-1.5 px-3 text-right text-gray-700 text-xs">${(line.pricePerUnit || 0).toFixed(2)}</td>
                        <td className="py-1.5 px-3 text-right text-gray-700 text-xs">{line.quantity}</td>
                        <td className="py-1.5 px-3 text-right font-medium text-gray-900 text-xs">${(line.total || 0).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function RightSidebar({ overview, contacts }: { overview: CompanyOverview; contacts: Contact[] }) {
  const company = overview.company;
  const address = company ? [company.addressLine1, company.city, company.stateProvince, company.country].filter(Boolean).join(', ') : null;

  return (
    <div className="space-y-5">
      {company?.mainPhone && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Phone</h3>
          <a href={`tel:${company.mainPhone}`} className="text-sm text-gray-700 flex items-center gap-2 hover:text-indigo-600">
            <Phone className="h-4 w-4 text-gray-400" />
            {company.mainPhone}
          </a>
        </div>
      )}
      {address && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Address</h3>
          <p className="text-sm text-gray-700 flex items-start gap-2">
            <MapPin className="h-4 w-4 text-gray-400 mt-0.5 flex-shrink-0" />
            {address}
          </p>
        </div>
      )}
      {company?.generalEmail && (
        <div>
          <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">Email</h3>
          <a href={`mailto:${company.generalEmail}`} className="text-sm text-gray-700 flex items-center gap-2 hover:text-indigo-600 truncate">
            <Mail className="h-4 w-4 text-gray-400" />
            {company.generalEmail}
          </a>
        </div>
      )}
      <div>
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
          Team Members ({contacts.length})
        </h3>
        <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
          {contacts.length === 0 ? (
            <p className="text-xs text-gray-400 italic">No contacts linked</p>
          ) : (
            contacts.map((c) => {
              const name = c.isCompany
                ? c.company || c.firstName || 'Unknown'
                : [c.firstName, c.lastName].filter(Boolean).join(' ') || 'Unknown';
              return (
                <div key={c.id} className="flex items-center gap-2 py-1">
                  <div className="h-6 w-6 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-700 text-[10px] font-semibold flex-shrink-0">
                    {initials(name)}
                  </div>
                  <span className="text-sm text-gray-700 truncate">{name}</span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

export default function CompanyDetail() {
  const [, setLocation] = useLocation();
  const [matchedById, paramsById] = useRoute("/companies/:id");
  const [matchedByName, paramsByName] = useRoute("/companies/name/:name");
  const [activeTab, setActiveTab] = useState("overview");

  const companyId = matchedById && paramsById ? parseInt(paramsById.id) : null;
  const companyName = matchedByName && paramsByName ? decodeURIComponent(paramsByName.name) : null;
  const isById = companyId !== null && !isNaN(companyId);

  const overviewUrl = isById
    ? `/api/companies/${companyId}/overview`
    : `/api/companies/by-name/overview?name=${encodeURIComponent(companyName || '')}`;

  const { data: overview, isLoading: overviewLoading } = useQuery<CompanyOverview>({
    queryKey: isById ? ['/api/companies', companyId, 'overview'] : ['/api/companies/by-name/overview', companyName],
    queryFn: async () => {
      const res = await fetch(overviewUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isById || !!companyName,
  });

  const contactsUrl = isById
    ? `/api/companies/${companyId}/contacts`
    : `/api/companies/by-name/contacts?name=${encodeURIComponent(companyName || '')}`;

  const { data: contactsData } = useQuery<{ contacts: Contact[] }>({
    queryKey: isById ? ['/api/companies', companyId, 'contacts'] : ['/api/companies/by-name/contacts', companyName],
    queryFn: async () => {
      const res = await fetch(contactsUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed');
      return res.json();
    },
    enabled: isById || !!companyName,
  });

  const contacts = contactsData?.contacts ?? [];
  const displayName = overview?.company?.name || companyName || 'Company';
  const isOrphan = overview?.company?.id == null;
  const hasOdooLink = !!overview?.company?.odooCompanyPartnerId;
  const resolvedCompanyId = overview?.company?.id ?? companyId;

  if (overviewLoading) {
    return (
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-32 mt-2" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-3 space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
          <div className="space-y-4">
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      <div className="mb-5 flex items-center gap-4">
        <button
          onClick={() => setLocation('/customer-management')}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-indigo-600 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Companies
        </button>
      </div>

      <div className="mb-6 flex items-center gap-4">
        <div className="h-12 w-12 rounded-xl bg-indigo-100 flex items-center justify-center text-indigo-700 text-lg font-bold flex-shrink-0">
          {initials(displayName)}
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold text-gray-900 truncate">{displayName}</h1>
            {isOrphan && (
              <Badge className="bg-green-100 text-green-700 border-green-200 gap-1 text-[10px]">
                <SiShopify className="h-3 w-3" />
                Shopify Only
              </Badge>
            )}
            {!isOrphan && !hasOdooLink && (
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300 bg-amber-50">
                No Odoo Link
              </Badge>
            )}
          </div>
          {overview?.company?.domain && (
            <p className="text-sm text-gray-400">{overview.company.domain}</p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        <div className="lg:col-span-3">
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="w-full justify-start bg-gray-100/80 rounded-lg h-10 p-1 flex-wrap gap-0.5">
              <TabsTrigger value="overview" className="text-xs px-3">Overview</TabsTrigger>
              <TabsTrigger value="activity" className="text-xs px-3">Activity</TabsTrigger>
              <TabsTrigger value="emails" className="text-xs px-3">Emails</TabsTrigger>
              <TabsTrigger value="calls" className="text-xs px-3">Calls</TabsTrigger>
              <TabsTrigger value="team" className="text-xs px-3">Team</TabsTrigger>
              <TabsTrigger value="notes" className="text-xs px-3">Notes</TabsTrigger>
              <TabsTrigger value="tasks" className="text-xs px-3">Tasks</TabsTrigger>
              <TabsTrigger value="files" className="text-xs px-3">Files</TabsTrigger>
              <TabsTrigger value="product-prices" className="text-xs px-3">Product Prices</TabsTrigger>
            </TabsList>

            <div className="mt-4">
              <TabsContent value="overview">
                {overview && <OverviewTab overview={overview} />}
              </TabsContent>

              <TabsContent value="activity">
                <ActivityTab companyId={resolvedCompanyId} companyName={displayName} />
              </TabsContent>

              <TabsContent value="emails">
                <EmailsTab companyId={resolvedCompanyId} companyName={displayName} />
              </TabsContent>

              <TabsContent value="calls">
                <EmptyState icon={PhoneCall} title="No calls yet" message="Call records for this company will appear here" />
              </TabsContent>

              <TabsContent value="team">
                <TeamTab companyId={resolvedCompanyId} companyName={displayName} />
              </TabsContent>

              <TabsContent value="notes">
                <EmptyState icon={StickyNote} title="No notes yet" message="Notes for this company will appear here" />
              </TabsContent>

              <TabsContent value="tasks">
                <EmptyState icon={CheckSquare} title="No tasks yet" message="Tasks for this company will appear here" />
              </TabsContent>

              <TabsContent value="files">
                <FilesTab companyId={resolvedCompanyId} companyName={displayName} />
              </TabsContent>

              <TabsContent value="product-prices">
                <ProductPricesTab companyId={resolvedCompanyId} />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        <div className="lg:col-span-1">
          <div className="rounded-xl border bg-white p-4 sticky top-4">
            <h2 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-gray-400" />
              Company Info
            </h2>
            {overview && <RightSidebar overview={overview} contacts={contacts} />}
          </div>
        </div>
      </div>
    </div>
  );
}

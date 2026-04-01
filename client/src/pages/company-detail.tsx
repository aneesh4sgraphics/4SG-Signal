import { useRoute, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  ArrowLeft, Building2, Phone, MapPin, Mail, Users, TrendingUp,
  AlertCircle, FileText, Activity, Clock, MessageSquare, PhoneCall,
  StickyNote, CheckSquare, Folder, Package, Tag, ExternalLink, User,
} from "lucide-react";

type ConnectionStrength = 'very_strong' | 'strong' | 'moderate' | 'weak' | 'cold';

const STRENGTH_CONFIG: Record<ConnectionStrength, { label: string; color: string; dot: string }> = {
  very_strong: { label: 'Very Strong', color: 'text-green-700 bg-green-50 border-green-200', dot: 'bg-green-500' },
  strong:      { label: 'Strong',      color: 'text-blue-700 bg-blue-50 border-blue-200',   dot: 'bg-blue-500' },
  moderate:    { label: 'Moderate',    color: 'text-amber-700 bg-amber-50 border-amber-200', dot: 'bg-amber-500' },
  weak:        { label: 'Weak',        color: 'text-orange-700 bg-orange-50 border-orange-200', dot: 'bg-orange-400' },
  cold:        { label: 'Cold',        color: 'text-red-700 bg-red-50 border-red-200',      dot: 'bg-red-500' },
};

function StrengthBadge({ strength }: { strength: ConnectionStrength }) {
  const cfg = STRENGTH_CONFIG[strength] || STRENGTH_CONFIG.cold;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border ${cfg.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
      {cfg.label}
    </span>
  );
}

function fmtRelative(iso: string | null | undefined): string {
  if (!iso) return 'No activity';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'No activity';
  const mins = Math.floor((Date.now() - d.getTime()) / 60000);
  if (mins < 60) return mins <= 1 ? 'just now' : `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  if (days < 30) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function fmtCurrency(val: number | null | undefined): string {
  if (val === null || val === undefined) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
}

function InitialsAvatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  const colors = ['bg-indigo-100 text-indigo-700', 'bg-purple-100 text-purple-700', 'bg-blue-100 text-blue-700', 'bg-teal-100 text-teal-700'];
  const color = colors[(name.charCodeAt(0) || 0) % colors.length];
  return (
    <div className={`w-14 h-14 rounded-xl text-xl font-bold flex items-center justify-center ${color} shrink-0`}>
      {initials || <Building2 className="w-6 h-6" />}
    </div>
  );
}

function SmallAvatar({ name }: { name: string }) {
  const initials = name.split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase() || '').join('');
  return (
    <div className="w-7 h-7 rounded-full bg-indigo-100 text-indigo-700 text-xs font-semibold flex items-center justify-center shrink-0">
      {initials || <User className="w-3 h-3" />}
    </div>
  );
}

const ACTIVITY_ICONS: Record<string, string> = {
  quote_sent: '📄', quote_viewed: '👁', quote_accepted: '✅', quote_rejected: '❌',
  call_made: '📞', call_received: '📲', email_sent: '📧', email_received: '📨',
  meeting_scheduled: '📅', meeting_completed: '🤝', note_added: '📝',
  order_placed: '🛒', sample_requested: '🧪', sample_shipped: '📦', sample_delivered: '✔',
  price_list_sent: '💰', price_list_viewed: '👁', product_info_shared: '📋', sample_feedback: '💬',
};

function EmptyState({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 py-16 text-center text-gray-400">
      <div className="flex justify-center mb-2">{icon}</div>
      <p className="text-sm">{label}</p>
    </div>
  );
}

export default function CompanyDetailPage() {
  const [matchById, paramsById] = useRoute<{ id: string }>("/companies/:id");
  const [matchByName, paramsByName] = useRoute<{ name: string }>("/companies/name/:name");
  const [, navigate] = useLocation();

  const companyId = matchById && paramsById?.id ? parseInt(paramsById.id) : null;
  const companyName = matchByName && paramsByName?.name ? decodeURIComponent(paramsByName.name) : null;
  const isOrphan = !companyId;
  const encodedName = encodeURIComponent(companyName || '');

  const overviewKey = isOrphan
    ? [`/api/companies/by-name/overview?name=${encodedName}`]
    : ['/api/companies', companyId, 'overview'];

  const odooKey = isOrphan
    ? ['/api/companies/by-name/odoo-metrics']
    : ['/api/companies', companyId, 'odoo-metrics'];

  const activityKey = isOrphan
    ? [`/api/companies/by-name/activity?name=${encodedName}`]
    : ['/api/companies', companyId, 'activity'];

  const emailsKey = isOrphan
    ? [`/api/companies/by-name/emails?name=${encodedName}`]
    : ['/api/companies', companyId, 'emails'];

  const invoiceLinesKey = isOrphan
    ? ['/api/companies/by-name/invoice-lines']
    : ['/api/companies', companyId, 'invoice-lines'];

  const enabled = !!(companyId || companyName);

  const { data: overview, isLoading: overviewLoading } = useQuery<any>({ queryKey: overviewKey, enabled });
  const { data: odooMetrics, isLoading: odooLoading } = useQuery<any>({ queryKey: odooKey, enabled });
  const { data: activityData, isLoading: activityLoading } = useQuery<any>({ queryKey: activityKey, enabled });
  const { data: emailsData, isLoading: emailsLoading } = useQuery<any>({ queryKey: emailsKey, enabled });
  const { data: invoiceLinesData, isLoading: invoiceLinesLoading } = useQuery<any>({ queryKey: invoiceLinesKey, enabled });

  const company = overview?.company;
  const contacts: any[] = overview?.contacts || [];
  const connectionStrength: ConnectionStrength = overview?.connectionStrength || 'cold';
  const lastInteractionDate: string | null = overview?.lastInteractionDate || null;
  const displayName = company?.name || companyName || '...';

  const events: any[] = activityData?.events || [];
  const emails: any[] = emailsData?.emails || [];
  const invoiceLines: any[] = invoiceLinesData?.lines || [];

  const linesByInvoice = new Map<number, { invoice: any; lines: any[] }>();
  for (const line of invoiceLines) {
    const existing = linesByInvoice.get(line.invoiceId);
    if (existing) {
      existing.lines.push(line);
    } else {
      linesByInvoice.set(line.invoiceId, {
        invoice: { id: line.invoiceId, name: line.invoiceName, date: line.invoiceDate, state: line.invoiceState },
        lines: [line],
      });
    }
  }

  const companyPhone = company?.mainPhone || contacts[0]?.phone || null;
  const companyAddress = [
    company?.addressLine1 || contacts[0]?.street,
    company?.city || contacts[0]?.city,
    company?.stateProvince || contacts[0]?.state,
    company?.country || contacts[0]?.country,
  ].filter(Boolean).join(', ');

  const hasOdoo = !isOrphan && !odooLoading && odooMetrics?.odooAvailable;

  if (overviewLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6">
        <Skeleton className="h-6 w-40 mb-6" />
        <Skeleton className="h-20 w-full mb-4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto">
          <button
            onClick={() => navigate('/customer-management')}
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 mb-3 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" /> Back to Companies
          </button>
          <div className="flex items-start gap-4">
            <InitialsAvatar name={displayName} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-3 flex-wrap">
                <h1 className="text-2xl font-bold text-gray-900">{displayName}</h1>
                {isOrphan && (
                  <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 text-xs">
                    Shopify Only
                  </Badge>
                )}
                {!isOrphan && company?.odooCompanyPartnerId && (
                  <Badge variant="outline" className="text-gray-400 border-gray-200 text-[10px]">
                    Odoo #{company.odooCompanyPartnerId}
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-4 mt-1 flex-wrap">
                {(company?.city || company?.stateProvince) && (
                  <span className="flex items-center gap-1 text-sm text-gray-500">
                    <MapPin className="w-3.5 h-3.5" />
                    {[company.city, company.stateProvince, company.country].filter(Boolean).join(', ')}
                  </span>
                )}
                {company?.domain && (
                  <a
                    href={`https://${company.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 text-sm text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    {company.domain}
                  </a>
                )}
                <span className="flex items-center gap-1 text-sm text-gray-500">
                  <Users className="w-3.5 h-3.5" />
                  {contacts.length} contact{contacts.length !== 1 ? 's' : ''}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="max-w-7xl mx-auto flex gap-6 px-6 py-6">
        {/* Main Content */}
        <div className="flex-1 min-w-0">
          <Tabs defaultValue="overview">
            <TabsList className="bg-white border border-gray-200 p-1 rounded-xl h-auto flex flex-wrap gap-0.5 mb-5 w-full justify-start">
              {[
                { value: 'overview', icon: <Building2 className="w-3.5 h-3.5" />, label: 'Overview' },
                { value: 'activity', icon: <Activity className="w-3.5 h-3.5" />, label: 'Activity' },
                { value: 'emails',   icon: <Mail className="w-3.5 h-3.5" />,     label: 'Emails' },
                { value: 'calls',    icon: <PhoneCall className="w-3.5 h-3.5" />, label: 'Calls' },
                { value: 'team',     icon: <Users className="w-3.5 h-3.5" />,    label: 'Team' },
                { value: 'notes',    icon: <StickyNote className="w-3.5 h-3.5" />, label: 'Notes' },
                { value: 'tasks',    icon: <CheckSquare className="w-3.5 h-3.5" />, label: 'Tasks' },
                { value: 'files',    icon: <Folder className="w-3.5 h-3.5" />,   label: 'Files' },
                { value: 'prices',   icon: <Package className="w-3.5 h-3.5" />,  label: 'Product Prices' },
              ].map(t => (
                <TabsTrigger
                  key={t.value}
                  value={t.value}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg data-[state=active]:bg-indigo-600 data-[state=active]:text-white"
                >
                  {t.icon}{t.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {/* ── OVERVIEW ── */}
            <TabsContent value="overview" className="mt-0 space-y-4">
              {isOrphan && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 text-sm text-blue-700 flex items-start gap-3">
                  <Tag className="w-4 h-4 mt-0.5 shrink-0" />
                  <span>This company exists only in Shopify and has not been synced to Odoo. Financial data is not available.</span>
                </div>
              )}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Connection Strength */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <Activity className="w-3.5 h-3.5" /> Connection
                  </div>
                  <StrengthBadge strength={connectionStrength} />
                  <div className="mt-2 text-[11px] text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />{fmtRelative(lastInteractionDate)}
                  </div>
                </div>

                {/* Avg. Margin */}
                <div className={`rounded-xl border p-4 ${hasOdoo ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`flex items-center gap-2 text-xs mb-2 ${hasOdoo ? 'text-blue-500' : 'text-gray-400'}`}>
                    <TrendingUp className="w-3.5 h-3.5" /> Avg. Margin
                  </div>
                  {odooLoading ? (
                    <Skeleton className="h-8 w-16" />
                  ) : hasOdoo && odooMetrics.averageMargin !== null ? (
                    <p className="text-2xl font-bold text-blue-700">{odooMetrics.averageMargin}%</p>
                  ) : (
                    <p className="text-lg text-gray-400">—</p>
                  )}
                </div>

                {/* No. of Invoices */}
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <div className="flex items-center gap-2 text-gray-400 text-xs mb-2">
                    <FileText className="w-3.5 h-3.5" /> Invoices
                  </div>
                  {odooLoading ? (
                    <Skeleton className="h-8 w-12" />
                  ) : hasOdoo ? (
                    <p className="text-2xl font-bold text-gray-800">{odooMetrics.invoiceCount ?? '—'}</p>
                  ) : (
                    <p className="text-lg text-gray-400">—</p>
                  )}
                </div>

                {/* Current Outstanding */}
                <div className={`rounded-xl border p-4 ${hasOdoo && odooMetrics.totalOutstanding > 0 ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className={`flex items-center gap-2 text-xs mb-2 ${hasOdoo && odooMetrics.totalOutstanding > 0 ? 'text-red-500' : 'text-gray-400'}`}>
                    <AlertCircle className="w-3.5 h-3.5" /> Outstanding
                  </div>
                  {odooLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : hasOdoo ? (
                    <p className={`text-2xl font-bold ${odooMetrics.totalOutstanding > 0 ? 'text-red-700' : 'text-gray-800'}`}>
                      {fmtCurrency(odooMetrics.totalOutstanding)}
                    </p>
                  ) : (
                    <p className="text-lg text-gray-400">—</p>
                  )}
                </div>
              </div>

              {contacts.length > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 p-4">
                  <h3 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                    <Users className="w-4 h-4 text-gray-400" /> Team Contacts
                  </h3>
                  <div className="space-y-2.5">
                    {contacts.slice(0, 5).map((c: any) => {
                      const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(unnamed)';
                      return (
                        <div key={c.id} className="flex items-center gap-3">
                          <SmallAvatar name={name} />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-800 truncate">{name}</p>
                            {c.email && <p className="text-xs text-gray-400 truncate">{c.email}</p>}
                          </div>
                        </div>
                      );
                    })}
                    {contacts.length > 5 && (
                      <p className="text-xs text-gray-400 pt-1">+{contacts.length - 5} more — see Team tab</p>
                    )}
                  </div>
                </div>
              )}
            </TabsContent>

            {/* ── ACTIVITY ── */}
            <TabsContent value="activity" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Activity Timeline</h3>
                </div>
                {activityLoading ? (
                  <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-14 w-full" />)}</div>
                ) : events.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Activity className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No activity recorded for this company yet</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {events.map((evt: any) => (
                      <div key={evt.id} className="flex gap-4 px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="text-lg shrink-0 mt-0.5">{ACTIVITY_ICONS[evt.eventType] || '📌'}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <p className="text-sm font-medium text-gray-800">{evt.title}</p>
                            <span className="text-xs text-gray-400 shrink-0 mt-0.5">{fmtRelative(evt.eventDate)}</span>
                          </div>
                          {evt.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{evt.description}</p>}
                          {evt.createdByName && <p className="text-xs text-gray-400 mt-1">by {evt.createdByName}</p>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── EMAILS ── */}
            <TabsContent value="emails" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">Recent Emails (last 10)</h3>
                </div>
                {emailsLoading ? (
                  <div className="p-5 space-y-3">{[...Array(4)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}</div>
                ) : emails.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Mail className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No emails found for this company</p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {emails.map((email: any) => (
                      <div key={email.id} className="px-5 py-4 hover:bg-gray-50 transition-colors">
                        <div className="flex items-start justify-between gap-3 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${email.direction === 'inbound' ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                              {email.direction === 'inbound' ? '↙ In' : '↗ Out'}
                            </span>
                            <p className="text-sm font-medium text-gray-800 truncate">{email.subject || '(no subject)'}</p>
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{fmtRelative(email.sentAt)}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-500 mb-1 flex-wrap">
                          <span>From: {email.fromName || email.fromEmail || '—'}</span>
                          <span>To: {email.toName || email.toEmail || '—'}</span>
                        </div>
                        {email.snippet && <p className="text-xs text-gray-400 line-clamp-2">{email.snippet}</p>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── CALLS ── */}
            <TabsContent value="calls" className="mt-0">
              <EmptyState icon={<PhoneCall className="w-10 h-10 opacity-30" />} label="No calls logged for this company yet" />
            </TabsContent>

            {/* ── TEAM ── */}
            <TabsContent value="team" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100">
                  <h3 className="text-sm font-semibold text-gray-700">{contacts.length} Contact{contacts.length !== 1 ? 's' : ''}</h3>
                </div>
                {contacts.length === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Users className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No contacts linked to this company</p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-xs text-gray-500 uppercase tracking-wide">
                          <th className="text-left px-5 py-3 font-medium">Name</th>
                          <th className="text-left px-5 py-3 font-medium">Email</th>
                          <th className="text-left px-5 py-3 font-medium">Phone</th>
                          <th className="text-left px-5 py-3 font-medium">Address</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-100">
                        {contacts.map((c: any) => {
                          const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(unnamed)';
                          return (
                            <tr key={c.id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-5 py-3">
                                <div className="flex items-center gap-2">
                                  <SmallAvatar name={name} />
                                  <div>
                                    <p className="font-medium text-gray-800">{name}</p>
                                    {c.role && <p className="text-xs text-gray-400">{c.role}</p>}
                                  </div>
                                </div>
                              </td>
                              <td className="px-5 py-3 text-gray-600">{c.email || '—'}</td>
                              <td className="px-5 py-3 text-gray-600">{c.phone || c.mobile || '—'}</td>
                              <td className="px-5 py-3 text-gray-500 text-xs">
                                {[c.street, c.city, c.state, c.country].filter(Boolean).join(', ') || '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </TabsContent>

            {/* ── NOTES ── */}
            <TabsContent value="notes" className="mt-0">
              <EmptyState icon={<StickyNote className="w-10 h-10 opacity-30" />} label="No notes for this company yet" />
            </TabsContent>

            {/* ── TASKS ── */}
            <TabsContent value="tasks" className="mt-0">
              <EmptyState icon={<CheckSquare className="w-10 h-10 opacity-30" />} label="No tasks for this company yet" />
            </TabsContent>

            {/* ── FILES ── */}
            <TabsContent value="files" className="mt-0">
              <EmptyState icon={<Folder className="w-10 h-10 opacity-30" />} label="No files for this company yet" />
            </TabsContent>

            {/* ── PRODUCT PRICES ── */}
            <TabsContent value="prices" className="mt-0">
              <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Invoice Line Items (last 5 invoices)</h3>
                  {!isOrphan && company?.odooCompanyPartnerId && (
                    <span className="text-xs text-gray-400 flex items-center gap-1">
                      <Package className="w-3.5 h-3.5" /> Odoo
                    </span>
                  )}
                </div>

                {isOrphan || !company?.odooCompanyPartnerId ? (
                  <div className="py-16 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No Odoo invoices available</p>
                    {isOrphan && <p className="text-xs mt-1 text-gray-400">Shopify-only customer</p>}
                  </div>
                ) : invoiceLinesLoading ? (
                  <div className="p-5 space-y-3">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : linesByInvoice.size === 0 ? (
                  <div className="py-16 text-center text-gray-400">
                    <Package className="w-10 h-10 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No posted invoices found in Odoo</p>
                  </div>
                ) : (
                  <div>
                    {Array.from(linesByInvoice.values()).map(({ invoice, lines }) => (
                      <div key={invoice.id} className="border-b border-gray-100 last:border-0">
                        <div className="px-5 py-3 bg-gray-50 flex items-center gap-3">
                          <FileText className="w-4 h-4 text-gray-400" />
                          <span className="text-sm font-semibold text-gray-700">Invoice #{invoice.name}</span>
                          <span className="text-xs text-gray-400">{fmtDate(invoice.date)}</span>
                          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${
                            invoice.state === 'posted' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                          }`}>
                            {invoice.state}
                          </span>
                        </div>
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="text-xs text-gray-400 uppercase tracking-wide border-b border-gray-100">
                              <th className="text-left px-5 py-2 font-medium">SKU</th>
                              <th className="text-left px-5 py-2 font-medium">Description</th>
                              <th className="text-right px-5 py-2 font-medium">Price/Unit</th>
                              <th className="text-right px-5 py-2 font-medium">Qty</th>
                              <th className="text-right px-5 py-2 font-medium">Total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {lines.map((line: any, idx: number) => (
                              <tr key={idx} className="hover:bg-gray-50 transition-colors">
                                <td className="px-5 py-2.5 text-xs font-mono text-indigo-600 whitespace-nowrap">
                                  {line.sku || '—'}
                                </td>
                                <td className="px-5 py-2.5 text-gray-700 max-w-xs">
                                  <p className="truncate">{line.lineName || line.productName || '—'}</p>
                                  {line.productName && line.lineName && line.lineName !== line.productName && (
                                    <p className="text-xs text-gray-400 truncate">{line.productName}</p>
                                  )}
                                </td>
                                <td className="px-5 py-2.5 text-right text-gray-700 whitespace-nowrap">{fmtCurrency(line.priceUnit)}</td>
                                <td className="px-5 py-2.5 text-right text-gray-700">{line.quantity}</td>
                                <td className="px-5 py-2.5 text-right font-semibold text-gray-800 whitespace-nowrap">{fmtCurrency(line.priceSubtotal)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        {/* Right Sidebar */}
        <aside className="w-64 shrink-0 space-y-4 sticky top-28 self-start">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Company Info</h4>
            <div className="space-y-3">
              {companyPhone && (
                <div className="flex items-start gap-2.5">
                  <Phone className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700">{companyPhone}</span>
                </div>
              )}
              {company?.generalEmail && (
                <div className="flex items-start gap-2.5">
                  <Mail className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700 break-all">{company.generalEmail}</span>
                </div>
              )}
              {companyAddress && (
                <div className="flex items-start gap-2.5">
                  <MapPin className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                  <span className="text-sm text-gray-700">{companyAddress}</span>
                </div>
              )}
              {!companyPhone && !companyAddress && !company?.generalEmail && (
                <p className="text-xs text-gray-400">No contact info on file</p>
              )}
            </div>
          </div>

          {contacts.length > 0 && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Users className="w-3.5 h-3.5" /> Team ({contacts.length})
              </h4>
              <div className="space-y-2">
                {contacts.map((c: any) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || '(unnamed)';
                  return (
                    <div key={c.id} className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-indigo-100 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                        {((c.firstName?.[0] || '') + (c.lastName?.[0] || '')).toUpperCase() || '?'}
                      </div>
                      <span className="text-sm text-gray-700 truncate">{name}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {hasOdoo && (
            <div className="bg-white rounded-xl border border-gray-200 p-4">
              <h4 className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-3">Odoo Summary</h4>
              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Lifetime Sales</span>
                  <span className="font-semibold text-gray-800">{fmtCurrency(odooMetrics.lifetimeSales)}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Avg. Margin</span>
                  <span className="font-semibold text-blue-700">
                    {odooMetrics.averageMargin !== null ? `${odooMetrics.averageMargin}%` : '—'}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Outstanding</span>
                  <span className={`font-semibold ${odooMetrics.totalOutstanding > 0 ? 'text-red-600' : 'text-gray-800'}`}>
                    {fmtCurrency(odooMetrics.totalOutstanding)}
                  </span>
                </div>
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

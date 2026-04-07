import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRoute } from "wouter";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { useEmailComposer } from "@/components/email-composer";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Mail, Phone, MapPin, User, Building2, Activity,
  PhoneCall, StickyNote, CheckSquare, FolderOpen, AtSign,
  ArrowUpRight, ArrowDownLeft, Edit, Loader2, Plus, X,
  Heart, TrendingUp, DollarSign, FileText, BarChart2,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface CustomerContact {
  id: number;
  customerId: string;
  name: string;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface Company {
  id: string;
  company: string | null;
  city: string | null;
  province: string | null;
}

interface ContactEmail {
  id: number | string;
  direction: string;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
  source?: "gmail" | "send";
}

interface CompanyRecord {
  id: number;
  name: string;
  odooCompanyPartnerId: number | null;
}

interface OdooMetrics {
  odooAvailable: boolean;
  averageMargin: number | null;
  totalOutstanding: number | null;
  lifetimeSales: number | null;
  invoiceCount: number | null;
}

interface ContactDetailData {
  contact: CustomerContact;
  company: Company | null;
  companyRecord: CompanyRecord | null;
  emails: ContactEmail[];
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HighlightTile({ label, icon: Icon, children }: { label: string; icon: LucideIcon; children: React.ReactNode }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 bg-white flex flex-col gap-2 min-h-[90px]">
      <div className="flex items-center justify-between text-[11px] font-medium text-gray-400 uppercase tracking-wide">
        {label}
        <Icon className="h-3.5 w-3.5 text-gray-300" />
      </div>
      <div className="text-sm text-gray-700">{children}</div>
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: LucideIcon; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-gray-400">
      <Icon className="h-10 w-10 mb-3 text-gray-200" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

// ─── Connection strength display (derived from role + email presence) ─────────
const STRENGTH_LABELS: Record<string, { label: string; color: string; dot: string }> = {
  primary:   { label: "Key Contact", dot: "bg-green-500", color: "text-green-700" },
  has_email: { label: "Good",        dot: "bg-blue-500",  color: "text-blue-700"  },
  basic:     { label: "Basic",       dot: "bg-amber-500", color: "text-amber-700" },
};
function connectionStrength(contact: CustomerContact) {
  if (contact.isPrimary) return STRENGTH_LABELS.primary;
  if (contact.email) return STRENGTH_LABELS.has_email;
  return STRENGTH_LABELS.basic;
}

type TabKey = "overview" | "activity" | "emails" | "calls" | "notes" | "tasks" | "files";
interface TabDef { key: TabKey; label: string; icon: LucideIcon; count?: number }

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function ContactDetail() {
  const [, params] = useRoute("/contacts/:id");
  const contactId = params?.id;
  const { toast } = useToast();
  const emailComposer = useEmailComposer();
  const queryClientInstance = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNoteOpen, setIsNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [editForm, setEditForm] = useState<Partial<CustomerContact>>({});

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data, isLoading } = useQuery<ContactDetailData>({
    queryKey: ["/api/crm/customer-contacts", contactId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customer-contacts/${contactId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to load contact");
      return res.json();
    },
    enabled: !!contactId,
    staleTime: 2 * 60 * 1000,
  });

  const linkedCompanyId = data?.companyRecord?.id;
  const { data: odooMetrics } = useQuery<OdooMetrics>({
    queryKey: ["/api/companies", linkedCompanyId, "odoo-metrics"],
    queryFn: async () => {
      const res = await fetch(`/api/companies/${linkedCompanyId}/odoo-metrics`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    enabled: !!linkedCompanyId,
    staleTime: 5 * 60 * 1000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async (form: Partial<CustomerContact>) => {
      const res = await apiRequest("PUT", `/api/crm/customer-contacts/${contactId}`, form);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated" });
      setIsEditOpen(false);
      setEditForm({});
      queryClientInstance.invalidateQueries({ queryKey: ["/api/crm/customer-contacts", contactId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message || "Failed to update contact", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: async (note: string) => {
      const fresh = queryClientInstance.getQueryData<ContactDetailData>(["/api/crm/customer-contacts", contactId]);
      const current = fresh?.contact.notes || "";
      const dateLabel = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
      const combined = current ? `${current}\n\n${dateLabel}: ${note}` : `${dateLabel}: ${note}`;
      const res = await apiRequest("PUT", `/api/crm/customer-contacts/${contactId}`, { notes: combined });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNewNoteText(""); setIsNoteOpen(false);
      queryClientInstance.invalidateQueries({ queryKey: ["/api/crm/customer-contacts", contactId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message || "Failed to add note", variant: "destructive" }),
  });

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="min-h-screen bg-white">
        <div className="border-b border-gray-200 px-6 py-4">
          <Skeleton className="h-7 w-48 mb-1" />
          <Skeleton className="h-4 w-32" />
        </div>
        <div className="px-6 py-6 space-y-4">
          <Skeleton className="h-10 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-24" /><Skeleton className="h-24" /><Skeleton className="h-24" />
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-6 text-center py-24">
        <p className="text-gray-500 mb-4">Contact not found</p>
        <Link href="/odoo-contacts">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Contacts</Button>
        </Link>
      </div>
    );
  }

  const { contact, company, companyRecord, emails } = data;
  const strength = connectionStrength(contact);
  const fmt$ = (n: number | null | undefined) =>
    n != null ? `$${n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 0 })}` : "—";
  const hasOdoo = !!companyRecord?.odooCompanyPartnerId && odooMetrics?.odooAvailable;

  // Parse notes into lines
  const noteLines = (contact.notes || "").split(/\n\n+/).filter(Boolean);

  const TABS: TabDef[] = [
    { key: "overview", label: "Overview", icon: TrendingUp },
    { key: "activity", label: "Activity", icon: Activity },
    { key: "emails", label: "Emails", icon: Mail, count: emails.length || undefined },
    { key: "calls", label: "Calls", icon: PhoneCall, count: 0 },
    { key: "notes", label: "Notes", icon: StickyNote, count: noteLines.length || undefined },
    { key: "tasks", label: "Tasks", icon: CheckSquare, count: 0 },
    { key: "files", label: "Files", icon: FolderOpen, count: 0 },
  ];

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 pt-4 pb-0">
          {/* Back + actions row */}
          <div className="flex items-center justify-between mb-4">
            <Link href="/odoo-contacts">
              <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Contacts
              </button>
            </Link>
            <div className="flex items-center gap-2">
              {contact.email && (
                <Button
                  variant="outline" size="sm" className="h-8 text-xs border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() => emailComposer.open({
                    to: contact.email || "",
                    customerName: contact.name,
                    usageType: "lead_email",
                    variables: { "contact.name": contact.name, "contact.email": contact.email || "" },
                  })}
                >
                  <Mail className="h-3.5 w-3.5 mr-1" /> Email
                </Button>
              )}
              <Button
                variant="outline" size="sm" className="h-8 text-xs"
                onClick={() => { setEditForm({ name: contact.name, email: contact.email, phone: contact.phone, role: contact.role, notes: contact.notes }); setIsEditOpen(true); }}
              >
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>
            </div>
          </div>

          {/* Avatar + Name */}
          <div className="flex items-start gap-3 mb-4">
            <div className="w-9 h-9 rounded-full bg-indigo-100 flex items-center justify-center flex-shrink-0 text-indigo-700 text-sm font-semibold">
              {initials(contact.name)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900 leading-tight">{contact.name}</h1>
                {contact.isPrimary && (
                  <Badge className="bg-green-100 text-green-700 border border-green-200 text-[11px] h-5 px-2">Primary</Badge>
                )}
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {contact.role && <span>{contact.role}{company?.company ? " · " : ""}</span>}
                {company?.company ? (
                  <Link href={`/companies/${company.id}`}>
                    <span className="font-medium hover:underline cursor-pointer">{company.company}</span>
                  </Link>
                ) : <span className="italic">No company</span>}
              </p>
            </div>
          </div>

          {/* Tabs */}
          <div className="flex items-end gap-0 -mb-px">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.key;
              return (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center gap-1.5 px-3.5 py-2.5 text-sm border-b-2 transition-colors whitespace-nowrap ${
                    active
                      ? "border-gray-900 text-gray-900 font-medium"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {tab.label}
                  {tab.count !== undefined && tab.count > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${active ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-600"}`}>
                      {tab.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Tab Content ───────────────────────────────────────────────────────── */}
      <div className="flex-1 px-6 py-6 bg-gray-50">

        {/* ── OVERVIEW ─────────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <div className="space-y-6 max-w-5xl">
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Highlights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <HighlightTile label="Connection strength" icon={Heart}>
                  <div className="flex items-center gap-2">
                    <span className={`inline-block w-2 h-2 rounded-full ${strength.dot}`} />
                    <span className={`font-semibold ${strength.color}`}>{strength.label}</span>
                  </div>
                  {contact.role && <p className="text-xs text-gray-500 mt-1">{contact.role}</p>}
                </HighlightTile>

                <HighlightTile label="Next calendar interaction" icon={Activity}>
                  <span className="text-gray-400">No interaction</span>
                </HighlightTile>

                <HighlightTile label="Company" icon={Building2}>
                  {company ? (
                    <>
                      <Link href={`/companies/${company.id}`}>
                        <span className="font-semibold text-gray-800 hover:underline cursor-pointer">{company.company}</span>
                      </Link>
                      {(company.city || company.province) && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          {[company.city, company.province].filter(Boolean).join(", ")}
                        </p>
                      )}
                    </>
                  ) : (
                    <span className="text-gray-400">No company linked</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Email addresses" icon={AtSign}>
                  {contact.email ? (
                    <button
                      onClick={() => emailComposer.open({
                        to: contact.email || "",
                        customerName: contact.name,
                        usageType: "lead_email",
                        variables: { "contact.name": contact.name, "contact.email": contact.email || "" },
                      })}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {contact.email}
                    </button>
                  ) : (
                    <span className="text-gray-400 text-sm">No email address</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Phone numbers" icon={Phone}>
                  {contact.phone ? (
                    <a href={`tel:${contact.phone}`} className="text-sm text-gray-700">{contact.phone}</a>
                  ) : (
                    <span className="text-gray-400 text-sm">No phone numbers</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Primary location" icon={MapPin}>
                  {(company?.city || company?.province) ? (
                    <span className="text-sm">{[company?.city, company?.province].filter(Boolean).join(", ")}</span>
                  ) : (
                    <span className="text-gray-400 text-sm">No Primary location</span>
                  )}
                </HighlightTile>
              </div>
            </div>

            {/* Business Performance — from linked company's Odoo data */}
            {companyRecord && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <BarChart2 className="h-3.5 w-3.5" /> Business Performance
                  {companyRecord && (
                    <Link href={`/companies/${companyRecord.id}`}>
                      <span className="normal-case font-normal text-blue-500 text-xs hover:underline cursor-pointer ml-1">
                        {companyRecord.name} ↗
                      </span>
                    </Link>
                  )}
                </h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Lifetime Sales</p>
                      <DollarSign className="h-3.5 w-3.5 text-green-400" />
                    </div>
                    <p className="text-xl font-bold text-green-700">
                      {hasOdoo ? fmt$(odooMetrics!.lifetimeSales) : "—"}
                    </p>
                    {hasOdoo && odooMetrics!.lifetimeSales != null && (
                      <p className="text-[10px] text-gray-400 mt-0.5">Net of credit memos</p>
                    )}
                    {!hasOdoo && <p className="text-[10px] text-gray-400 mt-0.5">Not linked to Odoo</p>}
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Avg. Margin</p>
                      <TrendingUp className="h-3.5 w-3.5 text-blue-400" />
                    </div>
                    <p className="text-xl font-bold text-blue-700">
                      {hasOdoo && odooMetrics!.averageMargin != null ? `${odooMetrics!.averageMargin.toFixed(1)}%` : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Invoices</p>
                      <FileText className="h-3.5 w-3.5 text-gray-300" />
                    </div>
                    <p className="text-xl font-bold text-gray-900">
                      {hasOdoo && odooMetrics!.invoiceCount != null ? odooMetrics!.invoiceCount.toLocaleString() : "—"}
                    </p>
                  </div>
                  <div className="rounded-xl border bg-white p-4">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide">Outstanding</p>
                      <DollarSign className="h-3.5 w-3.5 text-red-300" />
                    </div>
                    <p className="text-xl font-bold text-red-600">
                      {hasOdoo ? fmt$(odooMetrics!.totalOutstanding) : "—"}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Emails preview on overview */}
            {emails.length > 0 && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" /> Emails
                    <span className="normal-case font-normal text-gray-400 text-xs">{emails.length}</span>
                  </h2>
                  <button
                    onClick={() => setActiveTab("emails")}
                    className="text-xs text-blue-600 hover:text-blue-800 font-medium flex items-center gap-1"
                  >
                    View all <ArrowUpRight className="h-3 w-3" />
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                  {emails.slice(0, 3).map((email) => (
                    <div key={email.id} className="flex items-start gap-3 px-4 py-3">
                      <div className={`mt-0.5 shrink-0 ${email.direction === "inbound" ? "text-blue-500" : "text-gray-400"}`}>
                        {email.direction === "inbound" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-sm font-medium text-gray-800 truncate">
                            {email.direction === "inbound" ? (email.fromName || email.fromEmail) : (email.fromName || "You")}
                          </span>
                          <span className="text-xs text-gray-400 shrink-0">{relativeTime(email.sentAt)}</span>
                        </div>
                        <p className="text-xs font-medium text-gray-600 truncate mt-0.5">{email.subject || "(no subject)"}</p>
                        {email.snippet && <p className="text-xs text-gray-400 truncate mt-0.5">{email.snippet}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Notes on overview */}
            {contact.notes && (
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <StickyNote className="h-3.5 w-3.5" /> Notes
                </h2>
                <div className="border border-amber-200 rounded-lg bg-amber-50 p-4">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{contact.notes}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ─────────────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div className="max-w-3xl">
            <EmptyState icon={Activity} title="No activity recorded" sub="Activity related to this contact will appear here" />
          </div>
        )}

        {/* ── EMAILS ───────────────────────────────────────────────────────────── */}
        {activeTab === "emails" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Emails {emails.length > 0 && <span className="normal-case font-normal text-gray-400">({emails.length})</span>}
              </h2>
              {contact.email && (
                <Button size="sm" variant="outline" onClick={() => emailComposer.open({
                  to: contact.email || "", customerName: contact.name, usageType: "lead_email",
                  variables: { "contact.name": contact.name, "contact.email": contact.email || "" },
                  onSent: () => queryClientInstance.invalidateQueries({ queryKey: ["/api/crm/customer-contacts", contactId] }),
                })}>
                  <Plus className="w-4 h-4 mr-1" /> Compose
                </Button>
              )}
            </div>
            {emails.length === 0 ? (
              <EmptyState icon={Mail} title="No emails yet" sub={contact.email ? "Email history will appear here" : "No email address on this contact"} />
            ) : (
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {emails.map((email) => {
                  const isInbound = email.direction === "inbound" || email.direction === "in";
                  const isSentDirect = email.source === "send";
                  const senderGmail = isSentDirect ? (email.fromEmail || email.fromName) : null;
                  return (
                    <div key={email.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className={`mt-0.5 shrink-0 ${isInbound ? "text-blue-500" : "text-indigo-400"}`}>
                        {isInbound ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-sm font-medium text-gray-800 truncate">
                              {isInbound ? (email.fromName || email.fromEmail) : "You"}
                            </span>
                            {isSentDirect && (
                              <span className="text-[10px] font-medium text-indigo-600 bg-indigo-50 border border-indigo-100 rounded px-1 py-0 shrink-0">Sent</span>
                            )}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{relativeTime(email.sentAt)}</span>
                        </div>
                        <p className="text-xs font-medium text-gray-600 truncate mt-0.5">{email.subject || "(no subject)"}</p>
                        {isSentDirect && senderGmail && (
                          <p className="text-[11px] text-indigo-500 truncate mt-0.5 flex items-center gap-1">
                            <Mail className="h-3 w-3 shrink-0" />
                            Sent via {senderGmail}
                          </p>
                        )}
                        {!isSentDirect && email.snippet && <p className="text-xs text-gray-400 truncate mt-0.5">{email.snippet}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── CALLS ────────────────────────────────────────────────────────────── */}
        {activeTab === "calls" && (
          <div className="max-w-3xl">
            <EmptyState icon={PhoneCall} title="No calls logged" sub="Call logs will appear here" />
          </div>
        )}

        {/* ── NOTES ────────────────────────────────────────────────────────────── */}
        {activeTab === "notes" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Notes</h2>
              <Button size="sm" variant="outline" onClick={() => setIsNoteOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Note
              </Button>
            </div>
            {noteLines.length === 0 ? (
              <EmptyState icon={StickyNote} title="No notes yet" sub="Add notes to track important details" />
            ) : (
              <div className="space-y-3">
                {noteLines.map((line, i) => (
                  <div key={i} className="border border-amber-200 rounded-lg bg-amber-50 p-4">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{line}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TASKS ────────────────────────────────────────────────────────────── */}
        {activeTab === "tasks" && (
          <div className="max-w-3xl">
            <EmptyState icon={CheckSquare} title="No tasks yet" sub="Tasks will appear here" />
          </div>
        )}

        {/* ── FILES ────────────────────────────────────────────────────────────── */}
        {activeTab === "files" && (
          <div className="max-w-3xl">
            <EmptyState icon={FolderOpen} title="No files attached" />
          </div>
        )}
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      {/* Edit Contact */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit Contact</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={editForm.name || ""} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input type="email" value={editForm.email || ""} onChange={(e) => setEditForm(p => ({ ...p, email: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={editForm.phone || ""} onChange={(e) => setEditForm(p => ({ ...p, phone: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Role / Title</Label>
              <Input placeholder="e.g., Buyer, Owner, Production Manager" value={editForm.role || ""} onChange={(e) => setEditForm(p => ({ ...p, role: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm(p => ({ ...p, notes: e.target.value }))} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateMutation.mutate(editForm)} disabled={!editForm.name?.trim() || updateMutation.isPending}>
              {updateMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Note */}
      <Dialog open={isNoteOpen} onOpenChange={setIsNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <div className="py-4">
            <Textarea placeholder="Enter your note..." value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNoteOpen(false)}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate(newNoteText)} disabled={!newNoteText.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

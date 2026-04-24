import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { PRICING_TIERS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin, DollarSign, TrendingUp,
  Package, CreditCard, AlertCircle, AlertTriangle, ChevronRight, ChevronLeft, Tag, Pencil,
  Upload, CheckCircle2, XCircle, Loader2, Printer, PhoneCall, FileText,
  Activity, Calendar, StickyNote, Plus, UserPlus, GitMerge, Trash2, Truck,
  Target, Eye, Trophy, Linkedin, MapPinned, Video, ClipboardList, Clock,
  Star, MessageSquare, UserCheck, ArrowUpRight, ArrowDownLeft, Globe, ExternalLink,
  Info, ShieldAlert,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useEmailComposer } from "@/components/email-composer";
import { useLabelQueue } from "@/components/PrintLabelButton";
import { useAuth } from "@/hooks/useAuth";

// ─── Types ────────────────────────────────────────────────────────────────────
interface PricingTier { id: number; name: string; description?: string | null; }

interface ShopifyCustomerMapping {
  id: number; shopifyEmail: string | null; shopifyCustomerId: string | null;
  crmCustomerId: string; crmCustomerName: string | null; isActive: boolean;
  shopifyCompanyName: string | null;
}

interface Contact {
  id: string; firstName: string | null; lastName: string | null;
  email: string | null; emailNormalized: string | null; email2: string | null; email2Normalized: string | null; company: string | null;
  phone: string | null; phone2: string | null; cell: string | null;
  address1: string | null; address2: string | null; city: string | null;
  province: string | null; country: string | null; zip: string | null;
  website: string | null; isCompany: boolean; contactType: string | null;
  customerType: string | null; salesRepName: string | null; pricingTier: string | null;
  tags: string | null; note: string | null; isHotProspect: boolean;
  odooPartnerId: number | null; odooSyncStatus: string | null;
  odooPendingChanges: any | null; odooLastSyncError: string | null;
  totalOrders: number; totalSpent: string; createdAt: string; updatedAt: string;
  importWarning: string | null;
}

interface BusinessMetrics {
  salesPerson: string | null; paymentTerms: string | null;
  totalOutstanding: number; lifetimeSales: number; averageMargin: number | null;
  topProducts: Array<{ name: string; quantity: number; totalSpent: number }>;
  purchasedCategories: Array<{ id: number; name: string }>;
  allCategories: Array<{ id: number; name: string }>;
  connected: boolean;
}

interface OdooContact { id: number; name: string; email: string | null; phone: string | null; function: string | null; tags?: string | null; localId?: string; localOnly?: boolean; }

interface ActivityEvent {
  id: number; customerId: string; eventType: string; title: string;
  description: string | null; sourceType: string | null; sourceTable: string | null;
  createdAt: string; userId: string | null; createdByName: string | null;
  metadata: { mailerId?: number; mailerName?: string; thumbnailPath?: string } | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
type TabKey = "overview" | "activity" | "emails" | "notes" | "contacts" | "business";

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDate(d: string | null | undefined): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: "CAD", minimumFractionDigits: 0 }).format(amount);
}

function initials(name: string) {
  return name.split(/\s+/).slice(0, 2).map(w => w[0]).join("").toUpperCase() || "?";
}

function HighlightTile({ label, icon: Icon, children, onEdit }: { label: string; icon: any; children: React.ReactNode; onEdit?: () => void }) {
  return (
    <div className="group bg-white border border-gray-200 rounded-lg px-4 py-3 relative">
      <div className="flex items-center justify-between mb-1">
        <p className="text-xs text-gray-400 uppercase tracking-wide font-medium flex items-center gap-1">
          <Icon className="h-3 w-3" /> {label}
        </p>
        {onEdit && (
          <button
            type="button"
            onClick={onEdit}
            className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-700"
          >
            <Pencil className="h-3 w-3" />
          </button>
        )}
      </div>
      <div className="text-sm font-medium text-gray-800">{children}</div>
    </div>
  );
}

function KpiTile({ label, value, sub, color }: { label: string; value: string | React.ReactNode; sub?: string; color: string }) {
  return (
    <div className={`rounded-xl border p-4 ${color}`}>
      <div className="text-xs font-medium opacity-70 mb-1">{label}</div>
      <div className="text-xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60 mt-0.5">{sub}</div>}
    </div>
  );
}

function EmptyState({ icon: Icon, title, sub }: { icon: any; title: string; sub?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-gray-400">
      <Icon className="w-10 h-10 mb-3 opacity-30" />
      <p className="text-sm font-medium text-gray-500">{title}</p>
      {sub && <p className="text-xs mt-1">{sub}</p>}
    </div>
  );
}

const ACTIVITY_TYPES = [
  { value: "call", label: "Phone Call", icon: PhoneCall, eventType: "call", titleTemplate: "Call Logged" },
  { value: "meeting", label: "Meeting", icon: Video, eventType: "meeting", titleTemplate: "Meeting Logged" },
  { value: "visit", label: "In-Person Visit", icon: MapPinned, eventType: "visit", titleTemplate: "Visit Logged" },
  { value: "linkedin", label: "LinkedIn Outreach", icon: Linkedin, eventType: "outreach", titleTemplate: "LinkedIn Outreach Logged" },
  { value: "email_sent", label: "Email Sent", icon: Mail, eventType: "email_sent", titleTemplate: "Email Logged" },
  { value: "note", label: "General Note", icon: StickyNote, eventType: "note", titleTemplate: "Note Added" },
];

function getEventIcon(type: string) {
  switch (type) {
    case "call": return <PhoneCall className="w-4 h-4 text-green-500" />;
    case "email": case "email_sent": return <Mail className="w-4 h-4 text-blue-500" />;
    case "quote": case "quote_sent": return <FileText className="w-4 h-4 text-purple-500" />;
    case "spotlight_action": return <UserCheck className="w-4 h-4 text-orange-500" />;
    case "follow_up_completed": return <CheckCircle2 className="w-4 h-4 text-green-500" />;
    case "press_kit_shipped": case "sample_shipped": return <Package className="w-4 h-4 text-indigo-500" />;
    case "outreach": return <Linkedin className="w-4 h-4 text-cyan-500" />;
    case "meeting": return <Video className="w-4 h-4 text-violet-500" />;
    case "visit": return <MapPinned className="w-4 h-4 text-rose-500" />;
    case "data_update": return <Pencil className="w-4 h-4 text-amber-500" />;
    case "enablement": return <FileText className="w-4 h-4 text-teal-500" />;
    case "note": return <StickyNote className="w-4 h-4 text-amber-500" />;
    case "shopify_order": return <Star className="w-4 h-4 text-emerald-500" />;
    case "price_list_sent": return <Tag className="w-4 h-4 text-blue-400" />;
    default: return <MessageSquare className="w-4 h-4 text-gray-500" />;
  }
}

function getEventLabel(type: string): string {
  const labels: Record<string, string> = {
    call: "Call", email: "Email", email_sent: "Email Sent", quote: "Quote",
    quote_sent: "Quote Sent", spotlight_action: "Spotlight", follow_up_completed: "Follow-up",
    press_kit_shipped: "Press Kit", sample_shipped: "Sample Sent", outreach: "LinkedIn",
    meeting: "Meeting", visit: "Visit", data_update: "Data Update", enablement: "Enablement",
    note: "Note", shopify_order: "Order", price_list_sent: "Price List",
  };
  return labels[type] || type.replace(/_/g, " ").replace(/\b\w/g, l => l.toUpperCase());
}

function getEventBadgeColor(type: string): string {
  switch (type) {
    case "call": return "bg-green-100 text-green-700";
    case "email": case "email_sent": return "bg-blue-100 text-blue-700";
    case "quote": case "quote_sent": return "bg-purple-100 text-purple-700";
    case "spotlight_action": return "bg-orange-100 text-orange-700";
    case "follow_up_completed": return "bg-green-100 text-green-700";
    case "outreach": return "bg-cyan-100 text-cyan-700";
    case "meeting": return "bg-violet-100 text-violet-700";
    case "visit": return "bg-rose-100 text-rose-700";
    case "note": return "bg-amber-50 text-amber-700";
    case "shopify_order": return "bg-emerald-100 text-emerald-700";
    default: return "bg-gray-100 text-gray-700";
  }
}

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function OdooCompanyDetail() {
  const [, params] = useRoute("/odoo-contacts/:id");
  const companyId = params?.id;
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<TabKey>("overview");
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [tagSaveSuccess, setTagSaveSuccess] = useState(false);
  const [paymentTermsSaveSuccess, setPaymentTermsSaveSuccess] = useState(false);
  const [salesPersonSaveSuccess, setSalesPersonSaveSuccess] = useState(false);
  const [isCreateOdooDialogOpen, setIsCreateOdooDialogOpen] = useState(false);
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string; recipientEmail: string; sentAt: string } | null>(null);
  const [duplicatePartners, setDuplicatePartners] = useState<Array<{ id: number; name: string; email: string; isCompany: boolean }>>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [isLogActivityOpen, setIsLogActivityOpen] = useState(false);
  const [logActivityType, setLogActivityType] = useState<string>("call");
  const [logActivityNote, setLogActivityNote] = useState("");
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ name: "", email: "", phone: "", function: "" });
  const [isMergeContactsOpen, setIsMergeContactsOpen] = useState(false);
  const [selectedMergeContacts, setSelectedMergeContacts] = useState<number[]>([]);
  const [keepContactId, setKeepContactId] = useState<number | null>(null);
  const [currentMergeGroupIndex, setCurrentMergeGroupIndex] = useState(0);
  const [editingContact, setEditingContact] = useState<OdooContact | null>(null);
  const [editContactForm, setEditContactForm] = useState({ name: "", email: "", phone: "", function: "" });
  const [expandedDomainContactId, setExpandedDomainContactId] = useState<string | null>(null);
  const labelQueue = useLabelQueue();
  const [editForm, setEditForm] = useState({
    company: "", firstName: "", lastName: "",
    email: "", phone: "", address1: "", address2: "",
    city: "", province: "", zip: "", country: "", website: "", note: "",
  });
  type CardKey = "email" | "phone" | "website" | "salesRep" | "customerType" | "location" | "pricingTier";
  const [editingCard, setEditingCard] = useState<CardKey | null>(null);
  const [cardValues, setCardValues] = useState({
    email: "", email2: "", phone: "", cell: "",
    website: "", salesRepName: "", salesRepId: "",
    customerType: "", pricingTier: "", address1: "", address2: "",
    city: "", province: "", zip: "", country: "",
  });
  const { toast } = useToast();
  const { user } = useAuth();
  const emailComposer = useEmailComposer();
  const queryClient = useQueryClient();

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: conflictEmailsData } = useQuery<{ emails: string[] }>({
    queryKey: ['/api/admin/email-conflict-emails'],
    staleTime: 60 * 1000,
  });
  const conflictEmailSet = new Set<string>(conflictEmailsData?.emails ?? []);

  const { data: company, isLoading: companyLoading } = useQuery<Contact>({
    queryKey: ["/api/customers", companyId],
    queryFn: async () => { const r = await fetch(`/api/customers/${companyId}`); if (!r.ok) throw new Error("Not found"); return r.json(); },
    enabled: !!companyId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<BusinessMetrics>({
    queryKey: ["/api/odoo/customer", companyId, "business-metrics"],
    queryFn: async () => { const r = await fetch(`/api/odoo/customer/${companyId}/business-metrics`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!companyId, staleTime: 60000,
  });

  const { data: opportunityData } = useQuery<any>({
    queryKey: ["/api/opportunities/customer", companyId],
    queryFn: async () => { const r = await fetch(`/api/opportunities/customer/${companyId}`); if (!r.ok) return null; return r.json(); },
    enabled: !!companyId, staleTime: 60000,
  });

  const { data: winPathData } = useQuery<any>({
    queryKey: ["/api/customers", companyId, "win-path"],
    queryFn: async () => { const r = await fetch(`/api/customers/${companyId}/win-path`); if (!r.ok) return null; return r.json(); },
    enabled: !!companyId, staleTime: 120000,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: OdooContact[] }>({
    queryKey: ["/api/odoo/customer", companyId, "contacts"],
    queryFn: async () => { const r = await fetch(`/api/odoo/customer/${companyId}/contacts`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!companyId, staleTime: 60000,
  });

  type DomainContactResult = { contactId: string; name: string; email: string | null; domain: string | null; status: 'match' | 'personal' | 'mismatch' | 'no_email'; acknowledged: boolean };
  type DomainCheckData = { majorityDomain: string | null; companyId: string; contacts: DomainContactResult[]; mismatchCount: number };
  const { data: domainCheck, refetch: refetchDomainCheck } = useQuery<DomainCheckData>({
    queryKey: ["/api/customers", companyId, "domain-check"],
    queryFn: async () => { const r = await fetch(`/api/customers/${companyId}/domain-check`); if (!r.ok) throw new Error("Failed"); return r.json(); },
    enabled: !!companyId && !!(company?.isCompany),
    staleTime: 30000,
  });
  const domainCheckMap = useMemo(() => {
    const m: Record<string, DomainContactResult> = {};
    for (const c of domainCheck?.contacts ?? []) m[c.contactId] = c;
    return m;
  }, [domainCheck]);

  const { data: paymentTermsOptions = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/odoo/payment-terms"],
    queryFn: async () => { const r = await fetch("/api/odoo/payment-terms"); if (!r.ok) return []; return r.json(); },
    staleTime: 300000,
  });

  const { data: partnerCategories = [], isLoading: categoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ["/api/odoo/partner-categories"],
    queryFn: async () => { const r = await fetch("/api/odoo/partner-categories"); if (!r.ok) return []; return r.json(); },
    staleTime: 300000,
  });

  const { data: salesPeopleOptions = [], isLoading: salesPeopleLoading } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ["/api/sales-reps"],
    staleTime: 300000,
  });

  const { data: standardPricingTiers = [], isLoading: pricingTiersLoading } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
    staleTime: 300000,
  });

  const { data: shopifyMappings = [] } = useQuery<ShopifyCustomerMapping[]>({
    queryKey: ["/api/shopify/customer-mappings"],
    staleTime: 60000,
  });

  const internalCustomerId = (company as any)?.id;
  const { data: activityEvents = [], isLoading: activityLoading } = useQuery<ActivityEvent[]>({
    queryKey: ["/api/customer-activity/events", internalCustomerId],
    queryFn: async () => { const r = await fetch(`/api/customer-activity/events?customerId=${internalCustomerId}`); if (!r.ok) return []; return r.json(); },
    enabled: !!internalCustomerId, staleTime: 30000,
  });

  const companyEmailForQuery = (company as any)?.email;
  const { data: gmailEmailsData = [], isLoading: gmailEmailsLoading } = useQuery<Array<{
    id: string; direction: string; fromEmail: string | null; fromName: string | null;
    toEmail: string | null; subject: string | null; snippet: string | null; sentAt: string | null;
  }>>({
    queryKey: ["/api/customer-activity/emails", internalCustomerId, companyEmailForQuery],
    queryFn: async () => {
      const params = companyEmailForQuery
        ? `contactEmail=${encodeURIComponent(companyEmailForQuery)}&limit=50`
        : `customerId=${internalCustomerId}&limit=50`;
      const r = await fetch(`/api/customer-activity/emails?${params}`, { credentials: "include" });
      if (!r.ok) return [];
      return r.json();
    },
    enabled: !!internalCustomerId || !!companyEmailForQuery,
    staleTime: 30000,
  });

  const { data: machineProfiles = [], refetch: refetchMachines } = useQuery<Array<{ id: number; machineFamily: string; confirmed: boolean; otherDetails?: string }>>({
    queryKey: ["/api/crm/machine-profiles", companyId],
    queryFn: async () => { const r = await fetch(`/api/crm/machine-profiles/${companyId}`, { credentials: "include" }); if (!r.ok) return []; return r.json(); },
    enabled: !!companyId,
  });

  const { data: machineTypes = [] } = useQuery<Array<{ id: number; code: string; label: string; icon: string }>>({
    queryKey: ["/api/crm/machine-types"],
    staleTime: 5 * 60 * 1000,
  });

  const { data: navigation } = useQuery<{ prevId: string | null; prevName: string | null; nextId: string | null; nextName: string | null }>({
    queryKey: [`/api/customers/${companyId}/navigation`],
    staleTime: 60000, enabled: !!companyId,
  });
  const { data: odooBaseUrlData } = useQuery<{ baseUrl: string | null }>({
    queryKey: ['/api/odoo/base-url'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/base-url', { credentials: 'include' });
      return res.json();
    },
  });
  const odooBaseUrl = odooBaseUrlData?.baseUrl || '';

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const r = await apiRequest("POST", "/api/customer-activity/events", { customerId: companyId, eventType: "note", eventCategory: "internal", title: "Note Added", description: noteText });
      if (!r.ok) throw new Error("Failed to add note");
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNewNoteText(""); setIsNewNoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/events", internalCustomerId] });
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const logActivityMutation = useMutation({
    mutationFn: async () => {
      const actType = ACTIVITY_TYPES.find(a => a.value === logActivityType)!;
      const r = await apiRequest("POST", "/api/customer-activity/events", { customerId: internalCustomerId, eventType: actType.eventType, eventCategory: "manual", title: actType.titleTemplate, description: logActivityNote.trim() || null });
      if (!r.ok) throw new Error("Failed to log activity");
      return r.json();
    },
    onSuccess: () => {
      const actType = ACTIVITY_TYPES.find(a => a.value === logActivityType)!;
      toast({ title: `${actType.label} logged` });
      setLogActivityNote(""); setLogActivityType("call"); setIsLogActivityOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/events", internalCustomerId] });
    },
    onError: (e: Error) => toast({ title: "Failed to log activity", description: e.message, variant: "destructive" }),
  });

  const updatePaymentTermsMutation = useMutation({
    mutationFn: async ({ paymentTermId, paymentTermName }: { paymentTermId: number | null; paymentTermName: string }) => {
      const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/payment-terms`, { paymentTermId, paymentTermName });
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Payment Terms Updated" });
      setPaymentTermsSaveSuccess(true); setTimeout(() => setPaymentTermsSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "business-metrics"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const updateSalesPersonMutation = useMutation({
    mutationFn: async ({ salesPersonId, salesPersonName }: { salesPersonId: number | null; salesPersonName: string }) => {
      const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/sales-person`, { salesPersonId, salesPersonName });
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Sales Person Updated" });
      setSalesPersonSaveSuccess(true); setTimeout(() => setSalesPersonSaveSuccess(false), 3000);
      queryClient.setQueryData<Contact>(["/api/customers", companyId], old => old ? { ...old, salesRepName: vars.salesPersonName } : old);
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "business-metrics"] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const updatePricingTierMutation = useMutation({
    mutationFn: async ({ categoryId, categoryName }: { categoryId: number; categoryName: string }) => {
      const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/category`, { categoryId, categoryName });
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Tag Updated" });
      setTagSaveSuccess(true); setTimeout(() => setTagSaveSuccess(false), 3000);
      queryClient.setQueryData<Contact>(["/api/customers", companyId], old => old ? { ...old, pricingTier: vars.categoryName } : old);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const updateLocalPricingTierMutation = useMutation({
    mutationFn: async ({ pricingTier }: { pricingTier: string }) => {
      const r = await apiRequest("PUT", `/api/customers/${companyId}`, { pricingTier });
      return r.json();
    },
    onSuccess: (_, vars) => {
      toast({ title: "Pricing Tier Updated" });
      setTagSaveSuccess(true); setTimeout(() => setTagSaveSuccess(false), 3000);
      queryClient.setQueryData<Contact>(["/api/customers", companyId], old => old ? { ...old, pricingTier: vars.pricingTier } : old);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const saveEditsMutation = useMutation({
    mutationFn: async (changes: typeof editForm) => {
      const r = await apiRequest("PATCH", `/api/odoo/customer/${companyId}/edit`, { changes });
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Changes Saved", description: data.message || `${data.queued} change(s) queued for sync` });
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed", variant: "destructive" }),
  });

  const quickEditMutation = useMutation({
    mutationFn: async (data: Record<string, string | null>) => {
      const r = await apiRequest("PUT", `/api/customers/${companyId}`, data);
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Updated" });
      setEditingCard(null);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message || "Failed to save", variant: "destructive" }),
  });

  const openCardEdit = (card: CardKey) => {
    if (!company) return;
    setCardValues({
      email: company.email || "", email2: company.email2 || "",
      phone: company.phone || "", cell: company.cell || "",
      website: company.website || "",
      salesRepName: company.salesRepName || "", salesRepId: "",
      customerType: company.customerType || "",
      pricingTier: company.pricingTier || "",
      address1: company.address1 || "", address2: company.address2 || "",
      city: company.city || "", province: company.province || "",
      zip: company.zip || "", country: company.country || "",
    });
    setEditingCard(card);
  };

  const saveCardEdit = () => {
    if (!editingCard) return;
    if (editingCard === "email") quickEditMutation.mutate({ email: cardValues.email, email2: cardValues.email2 || null });
    else if (editingCard === "phone") quickEditMutation.mutate({ phone: cardValues.phone, cell: cardValues.cell || null });
    else if (editingCard === "website") quickEditMutation.mutate({ website: cardValues.website });
    else if (editingCard === "salesRep") quickEditMutation.mutate({ salesRepName: cardValues.salesRepName || null, salesRepId: cardValues.salesRepId || null });
    else if (editingCard === "customerType") quickEditMutation.mutate({ customerType: cardValues.customerType || null });
    else if (editingCard === "pricingTier") updateLocalPricingTierMutation.mutate({ pricingTier: cardValues.pricingTier });
    else if (editingCard === "location") quickEditMutation.mutate({ address1: cardValues.address1, address2: cardValues.address2 || null, city: cardValues.city, province: cardValues.province, zip: cardValues.zip, country: cardValues.country });
  };

  const pushSyncMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/push-sync`); return r.json(); },
    onSuccess: (data) => {
      if (data.conflict) toast({ title: "Sync Conflict", description: "Data changed in Odoo. Please refresh.", variant: "destructive" });
      else toast({ title: "Synced to Odoo", description: data.message });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
    },
    onError: (e: any) => toast({ title: "Sync Failed", description: e.message, variant: "destructive" }),
  });

  const createInOdooMutation = useMutation({
    mutationFn: async () => { const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/create`); return r.json(); },
    onSuccess: (data) => {
      toast({ title: "Created in Odoo", description: data.message });
      setIsCreateOdooDialogOpen(false); setDuplicatePartners([]);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "business-metrics"] });
    },
    onError: (e: any) => {
      if (e.duplicates?.length > 0) setDuplicatePartners(e.duplicates);
      else toast({ title: "Failed to Create", description: e.message, variant: "destructive" });
    },
  });

  const linkToOdooMutation = useMutation({
    mutationFn: async (odooPartnerId: number) => { const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/link`, { odooPartnerId }); return r.json(); },
    onSuccess: (data) => {
      toast({ title: "Linked to Odoo", description: data.message });
      setIsCreateOdooDialogOpen(false); setDuplicatePartners([]);
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
    },
    onError: (e: any) => toast({ title: "Failed to Link", description: e.message, variant: "destructive" }),
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; function: string }) => {
      const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/contacts`, data);
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Contact Created", description: data.message });
      setIsNewContactOpen(false); setNewContactForm({ name: "", email: "", phone: "", function: "" });
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "contacts"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const editContactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; function: string; localId?: string }) => {
      const contactId = editingContact?.id ?? 0;
      const r = await apiRequest("PATCH", `/api/odoo/customer/${companyId}/contacts/${contactId}`, { ...data, localId: editingContact?.localId });
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed"); }
      return r.json();
    },
    onSuccess: () => {
      toast({ title: "Contact updated" });
      setEditingContact(null);
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "contacts"] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const mergeContactsMutation = useMutation({
    mutationFn: async (data: { keepContactId: number; deleteContactIds: number[] }) => {
      const r = await apiRequest("POST", `/api/odoo/customer/${companyId}/contacts/merge`, data);
      if (!r.ok) { const err = await r.json(); throw new Error(err.error || "Failed"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: "Contacts Merged", description: data.message });
      setIsMergeContactsOpen(false); setSelectedMergeContacts([]); setKeepContactId(null);
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "contacts"] });
    },
    onError: (e: Error) => toast({ title: "Failed to Merge", description: e.message, variant: "destructive" }),
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const r = await apiRequest("DELETE", `/api/customers/${companyId}`);
      if (!r.ok) { if (r.status === 404) return { alreadyDeleted: true }; const err = await r.json().catch(() => ({})); throw new Error(err.error || "Failed"); }
      return r.json();
    },
    onSuccess: (data) => {
      toast({ title: data?.alreadyDeleted ? "Already Deleted" : "Customer Deleted" });
      setIsDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setLocation("/odoo-contacts");
    },
    onError: (e: Error) => toast({ title: "Failed to Delete", description: e.message, variant: "destructive" }),
  });

  const updateCustomerTypeMutation = useMutation({
    mutationFn: async (customerType: "printer" | "reseller") => {
      const r = await apiRequest("PUT", `/api/customers/${companyId}`, { customerType });
      if (!r.ok) throw new Error("Failed");
      return r.json();
    },
    onSuccess: (_, customerType) => {
      toast({ title: customerType === "printer" ? "Marked as Printing Company" : "Marked as Reseller" });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId] });
    },
    onError: (e: Error) => toast({ title: "Failed", description: e.message, variant: "destructive" }),
  });

  const toggleMachineMutation = useMutation({
    mutationFn: async ({ machineFamily, currentlyEnabled }: { machineFamily: string; currentlyEnabled: boolean }) => {
      const r = await apiRequest("POST", "/api/crm/machine-profiles", { customerId: companyId, machineFamily, enabled: !currentlyEnabled });
      return r.json();
    },
    onSuccess: () => { refetchMachines(); toast({ title: "Machine profile updated" }); },
    onError: () => toast({ title: "Failed to update machine", variant: "destructive" }),
  });

  const acknowledgeDomainMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const r = await apiRequest("POST", `/api/customers/${companyId}/contacts/${contactId}/acknowledge-domain`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId, "domain-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers/domain-mismatch-contact-ids"] });
      setExpandedDomainContactId(null);
      toast({ title: "Domain mismatch acknowledged", description: "This contact will no longer show a warning." });
    },
    onError: () => toast({ title: "Failed to acknowledge", variant: "destructive" }),
  });

  const moveStandaloneMutation = useMutation({
    mutationFn: async (contactId: string) => {
      const r = await apiRequest("POST", `/api/customers/${companyId}/contacts/${contactId}/move-standalone`, {});
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/odoo/customer", companyId, "contacts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", companyId, "domain-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers/domain-mismatch-contact-ids"] });
      setExpandedDomainContactId(null);
      toast({ title: "Contact moved", description: "Contact is now a standalone record." });
    },
    onError: () => toast({ title: "Failed to move contact", variant: "destructive" }),
  });

  // ── Computed ─────────────────────────────────────────────────────────────────
  const shopifyEmails = new Set(shopifyMappings.filter(m => m.shopifyEmail).map(m => m.shopifyEmail!.toLowerCase()));
  const isShopifyEmail = (email: string | null) => email ? shopifyEmails.has(email.toLowerCase()) : false;

  const duplicateEmailContacts = useMemo(() => {
    if (!contactsData?.contacts) return [];
    const emailCounts: Record<string, OdooContact[]> = {};
    contactsData.contacts.forEach(c => { if (c.email) { const k = c.email.toLowerCase().trim(); emailCounts[k] = [...(emailCounts[k] || []), c]; } });
    return Object.entries(emailCounts).filter(([, cs]) => cs.length >= 2).map(([email, contacts]) => ({ email, contacts }));
  }, [contactsData?.contacts]);

  const openEditDialog = () => {
    if (company) {
      setEditForm({
        company: company.company || "",
        firstName: company.firstName || "",
        lastName: company.lastName || "",
        email: company.email || "",
        phone: company.phone || "",
        address1: company.address1 || "",
        address2: company.address2 || "",
        city: company.city || "",
        province: company.province || "",
        zip: company.zip || "",
        country: company.country || "",
        website: company.website || "",
        note: company.note || "",
      });
      setIsEditOpen(true);
    }
  };

  const navigateToPrev = () => { if (navigation?.prevId) setLocation(`/odoo-contacts/${navigation.prevId}`); };
  const navigateToNext = () => { if (navigation?.nextId) setLocation(`/odoo-contacts/${navigation.nextId}`); };

  const noteEvents = activityEvents.filter(e => e.eventType === "note" || e.eventType === "note_added");
  const nonNoteEvents = activityEvents.filter(e => e.eventType !== "note" && e.eventType !== "note_added");
  const emailEvents = activityEvents.filter(e => e.eventType === "email_sent" || e.eventType === "email");

  // ── Loading/Error States ──────────────────────────────────────────────────────
  if (companyLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA]">
        <div className="border-b border-gray-100 bg-white px-6 py-4">
          <Skeleton className="h-6 w-48 mb-4" />
          <div className="flex items-center gap-4">
            <Skeleton className="h-14 w-14 rounded-xl" />
            <div><Skeleton className="h-7 w-48 mb-2" /><Skeleton className="h-4 w-32" /></div>
          </div>
        </div>
        <div className="px-6 py-6 space-y-4">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-lg" />)}
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-500 mb-4">Contact not found.</p>
          <Link href="/odoo-contacts"><Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Back to Contacts</Button></Link>
        </div>
      </div>
    );
  }

  const personName = `${company.firstName || ""} ${company.lastName || ""}`.trim();
  const displayName = company.isCompany
    ? (company.company || personName || "Unnamed")
    : (personName || company.company || company.email || "Unnamed");
  const address = [company.address1, company.address2, company.city, company.province, company.zip, company.country].filter(Boolean).join(", ");

  const TABS: { key: TabKey; label: string; count?: number }[] = [
    { key: "overview", label: "Overview" },
    { key: "activity", label: "Activity", count: nonNoteEvents.length || undefined },
    { key: "emails", label: "Emails", count: gmailEmailsData.length || undefined },
    { key: "notes", label: "Notes", count: noteEvents.length || undefined },
    ...(company.isCompany ? [{ key: "contacts" as TabKey, label: "People", count: contactsData?.contacts?.length || undefined }] : []),
    { key: "business", label: "Business" },
  ];

  return (
    <div className="min-h-screen bg-[#FAFAFA]">

      {/* ── STICKY HEADER ──────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-40 bg-white border-b border-gray-100 shadow-sm">
        <div className="px-6 pt-4 pb-0">

          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-3">
            <Link href="/odoo-contacts"><span className="hover:text-gray-700 cursor-pointer">Contacts</span></Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-700 truncate max-w-[200px]">{displayName}</span>
          </div>

          {/* Name row */}
          <div className="flex items-start justify-between gap-4 mb-3">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white font-semibold text-sm shrink-0">
                {company.isCompany ? <Building2 className="w-5 h-5" /> : initials(displayName)}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h1 className="text-xl font-bold text-gray-900">{displayName}</h1>
                  {company.isHotProspect && <Badge className="bg-orange-100 text-orange-700 text-xs">🔥 Hot Prospect</Badge>}
                  {company.pricingTier && <Badge variant="secondary" className="text-xs capitalize bg-violet-100 text-violet-700">{company.pricingTier}</Badge>}
                  {company.importWarning === 'no_email' && (
                    <Badge className="bg-amber-100 text-amber-700 text-xs gap-1 border border-amber-200">
                      <AlertTriangle className="w-3 h-3" /> No Email
                    </Badge>
                  )}
                  {company.odooPartnerId ? (
                    <Badge className="bg-green-100 text-green-700 text-xs gap-1">
                      <CheckCircle2 className="w-3 h-3" /> Odoo #{company.odooPartnerId}
                    </Badge>
                  ) : (
                    <button
                      onClick={() => createInOdooMutation.mutate()}
                      disabled={createInOdooMutation.isPending}
                      className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 disabled:opacity-50 transition-colors cursor-pointer"
                    >
                      {createInOdooMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
                      Push to Odoo
                    </button>
                  )}
                </div>
                {!company.isCompany && company.company && (
                  <p className="text-sm font-medium text-gray-600 mt-0.5">{company.company}</p>
                )}
                <p className="text-sm text-gray-500 mt-0.5">
                  {company.email && <span className="mr-3">{company.email}</span>}
                  {company.phone && <span>{company.phone}</span>}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
              {company.odooPartnerId && (
                <Button variant="outline" size="sm" onClick={openEditDialog} className="h-8 text-xs gap-1">
                  <Pencil className="w-3.5 h-3.5" /> Edit
                </Button>
              )}
              {company.email && (
                <Button variant="outline" size="sm" onClick={() => emailComposer.open({ to: company.email || "", customerId: company.id, customerName: displayName, usageType: "client_email", variables: { "client.firstName": company.firstName || "", "client.lastName": company.lastName || "", "client.name": displayName, "client.company": company.company || "", "client.email": company.email || "" } })} className="h-8 text-xs gap-1">
                  <Mail className="w-3.5 h-3.5" /> Email
                </Button>
              )}
              {(company.address1 || company.city) && (
                <Button variant="outline" size="sm" onClick={() => {
                  const inQueue = labelQueue.isInQueue(String(companyId));
                  if (inQueue) { labelQueue.removeFromQueue(String(companyId)); toast({ title: "Removed from label queue" }); }
                  else { labelQueue.addToQueue({ id: String(companyId), company: company.company, firstName: company.firstName, lastName: company.lastName, address1: company.address1, address2: company.address2, city: company.city, province: company.province, zip: company.zip, country: company.country }); toast({ title: "Added to label queue" }); }
                }} className={`h-8 text-xs gap-1 ${labelQueue.isInQueue(String(companyId)) ? "bg-green-50 border-green-200 text-green-700" : ""}`}>
                  <Printer className="w-3.5 h-3.5" /> {labelQueue.isInQueue(String(companyId)) ? "In Queue" : "Label"}
                </Button>
              )}

              {/* Printer/Reseller toggle */}
              <div className="flex items-center gap-0.5 border border-[#EBEBEB] rounded-lg p-0.5 bg-[#F4F3F0]">
                <Button variant={company.customerType === "printer" ? "default" : "ghost"} size="sm" onClick={() => updateCustomerTypeMutation.mutate("printer")} disabled={updateCustomerTypeMutation.isPending} className={`h-7 px-2.5 text-xs font-medium rounded-md ${company.customerType === "printer" ? "bg-[#1A1A1A] text-white" : "text-[#8A8A8A]"}`}>
                  <Printer className="w-3.5 h-3.5 mr-1" /> Printer
                </Button>
                <Button variant={company.customerType === "reseller" ? "default" : "ghost"} size="sm" onClick={() => updateCustomerTypeMutation.mutate("reseller")} disabled={updateCustomerTypeMutation.isPending} className={`h-7 px-2.5 text-xs font-medium rounded-md ${company.customerType === "reseller" ? "bg-[#1A1A1A] text-white" : "text-[#8A8A8A]"}`}>
                  <Truck className="w-3.5 h-3.5 mr-1" /> Reseller
                </Button>
              </div>

              {/* Prev/Next */}
              <div className="flex items-center gap-0.5 border border-[#EBEBEB] rounded-lg">
                <Button variant="ghost" size="sm" onClick={navigateToPrev} disabled={!navigation?.prevId} className="px-2 h-8" title={navigation?.prevName || ""}>
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button variant="ghost" size="sm" onClick={navigateToNext} disabled={!navigation?.nextId} className="px-2 h-8" title={navigation?.nextName || ""}>
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>

              {company.odooPartnerId ? (
                <a
                  href={`${odooBaseUrl}/web#model=res.partner&id=${company.odooPartnerId}&view_type=form`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-violet-200 bg-violet-50 text-violet-700 text-xs font-medium hover:bg-violet-100 transition-colors h-8"
                  title={`Open in Odoo (Partner #${company.odooPartnerId})`}
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Go to Odoo</span>
                </a>
              ) : user?.role === "admin" ? (
                <Button variant="ghost" size="sm" onClick={() => setIsDeleteConfirmOpen(true)} className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50" title="Delete (not in Odoo)">
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>
              ) : null}
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex gap-0 border-b-0 overflow-x-auto">
            {TABS.map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)} className={`flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap transition-colors ${activeTab === tab.key ? "border-gray-900 text-gray-900" : "border-transparent text-gray-500 hover:text-gray-700"}`}>
                {tab.label}
                {tab.count ? <span className="text-xs bg-gray-100 text-gray-600 rounded-full px-1.5 py-0.5 font-normal">{tab.count}</span> : null}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Conflict Warning Banner ───────────────────────────────────────── */}
      {company && (
        (company.emailNormalized && conflictEmailSet.has(company.emailNormalized)) ||
        (company.email2Normalized && conflictEmailSet.has(company.email2Normalized))
      ) && (
        <div className="bg-orange-50 border-b border-orange-200 px-6 py-3 flex items-center gap-3">
          <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0" />
          <p className="text-sm text-orange-800 flex-1">
            <strong>Email conflict:</strong> {company?.email} also exists as a Lead. This creates duplicated identity records.
          </p>
          <Link href="/admin/data-integrity">
            <span className="text-xs font-semibold text-orange-700 underline cursor-pointer hover:text-orange-900">
              Resolve now →
            </span>
          </Link>
        </div>
      )}

      {/* ── TAB CONTENT ────────────────────────────────────────────────────── */}
      <div className="px-6 py-6 space-y-6">

        {/* ── OVERVIEW ─────────────────────────────────────────────────────── */}
        {activeTab === "overview" && (
          <>
            {/* Highlights grid */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Highlights</h2>
              <div className="grid grid-cols-2 gap-3">
                <HighlightTile label="Email" icon={Mail} onEdit={() => openCardEdit("email")}>
                  {company.email ? (
                    <>
                      <button onClick={() => emailComposer.open({ to: company.email || "", customerId: company.id, customerName: displayName, usageType: "client_email", variables: { "client.name": displayName, "client.company": company.company || "", "client.email": company.email || "", "client.firstName": company.firstName || "", "client.lastName": company.lastName || "" } })} className="text-violet-600 hover:text-green-600 transition-colors truncate block">
                        {company.email}
                        {isShopifyEmail(company.email) && <SiShopify className="inline ml-1 w-3.5 h-3.5 text-green-600" />}
                      </button>
                      {company.email2 && <p className="text-xs text-gray-400 mt-0.5 truncate">{company.email2} (secondary)</p>}
                    </>
                  ) : <span className="text-gray-400">—</span>}
                </HighlightTile>
                <HighlightTile label="Phone" icon={Phone} onEdit={() => openCardEdit("phone")}>
                  {(company.phone || company.cell) ? (
                    <>
                      {company.phone && <a href={`tel:${company.phone}`} className="text-violet-600 hover:underline block">{company.phone}</a>}
                      {company.cell && <a href={`tel:${company.cell}`} className="text-xs text-gray-500 hover:text-violet-600 block mt-0.5">{company.cell} (mobile)</a>}
                    </>
                  ) : <span className="text-gray-400">—</span>}
                </HighlightTile>
                <HighlightTile label="Location" icon={MapPin} onEdit={() => openCardEdit("location")}>
                  {address ? <span className="text-gray-700 text-xs">{address}</span> : <span className="text-gray-400">—</span>}
                </HighlightTile>
                <HighlightTile label="Website" icon={Globe} onEdit={() => openCardEdit("website")}>
                  {company.website ? (
                    <a href={company.website.startsWith("http") ? company.website : `https://${company.website}`} target="_blank" rel="noopener noreferrer" className="text-violet-600 hover:underline truncate block">{company.website}</a>
                  ) : <span className="text-gray-400">—</span>}
                </HighlightTile>
                <HighlightTile label="Sales Rep" icon={User} onEdit={() => openCardEdit("salesRep")}>
                  {metricsLoading ? <Skeleton className="h-4 w-24" /> : <span>{metrics?.salesPerson || company.salesRepName || "—"}</span>}
                </HighlightTile>
                <HighlightTile label="Customer Type" icon={Printer} onEdit={() => openCardEdit("customerType")}>
                  <span className="capitalize">{company.customerType || "—"}</span>
                </HighlightTile>
                <HighlightTile label="Pricing Tier" icon={Tag} onEdit={() => openCardEdit("pricingTier")}>
                  {company.pricingTier ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">{company.pricingTier}</span>
                  ) : <span className="text-gray-400">—</span>}
                </HighlightTile>
              </div>
            </div>

            {/* Quick-edit card Dialog */}
            <Dialog open={editingCard !== null} onOpenChange={(o) => { if (!o) setEditingCard(null); }}>
              <DialogContent className="max-w-sm">
                <DialogHeader>
                  <DialogTitle>
                    {editingCard === "email" && "Edit Email"}
                    {editingCard === "phone" && "Edit Phone"}
                    {editingCard === "website" && "Edit Website"}
                    {editingCard === "salesRep" && "Assign Sales Rep"}
                    {editingCard === "customerType" && "Set Customer Type"}
                    {editingCard === "pricingTier" && "Set Pricing Tier"}
                    {editingCard === "location" && "Edit Location"}
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-3 pt-1">
                  {editingCard === "email" && (
                    <>
                      <div className="space-y-1"><Label>Primary Email</Label><Input type="email" value={cardValues.email} onChange={e => setCardValues(v => ({ ...v, email: e.target.value }))} placeholder="email@example.com" /></div>
                      <div className="space-y-1"><Label>Secondary Email</Label><Input type="email" value={cardValues.email2} onChange={e => setCardValues(v => ({ ...v, email2: e.target.value }))} placeholder="Optional" /></div>
                    </>
                  )}
                  {editingCard === "phone" && (
                    <>
                      <div className="space-y-1"><Label>Phone</Label><Input value={cardValues.phone} onChange={e => setCardValues(v => ({ ...v, phone: e.target.value }))} placeholder="+1 555-000-0000" /></div>
                      <div className="space-y-1"><Label>Mobile / Cell</Label><Input value={cardValues.cell} onChange={e => setCardValues(v => ({ ...v, cell: e.target.value }))} placeholder="Optional" /></div>
                    </>
                  )}
                  {editingCard === "website" && (
                    <div className="space-y-1"><Label>Website URL</Label><Input value={cardValues.website} onChange={e => setCardValues(v => ({ ...v, website: e.target.value }))} placeholder="https://example.com" /></div>
                  )}
                  {editingCard === "salesRep" && (
                    <div className="space-y-1">
                      <Label>Sales Rep</Label>
                      <Select value={cardValues.salesRepId || cardValues.salesRepName || "__none__"} onValueChange={val => {
                        if (val === "__none__") { setCardValues(v => ({ ...v, salesRepId: "", salesRepName: "" })); }
                        else {
                          const rep = salesPeopleOptions.find(r => r.id === val);
                          setCardValues(v => ({ ...v, salesRepId: val, salesRepName: rep?.name || val }));
                        }
                      }}>
                        <SelectTrigger><SelectValue placeholder="Select rep…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">Unassigned</SelectItem>
                          {salesPeopleOptions.map(r => <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {editingCard === "customerType" && (
                    <div className="space-y-1">
                      <Label>Customer Type</Label>
                      <Select value={cardValues.customerType || "__none__"} onValueChange={val => setCardValues(v => ({ ...v, customerType: val === "__none__" ? "" : val }))}>
                        <SelectTrigger><SelectValue placeholder="Select type…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not set —</SelectItem>
                          <SelectItem value="printer">Printer</SelectItem>
                          <SelectItem value="reseller">Reseller</SelectItem>
                          <SelectItem value="enduser">End User</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {editingCard === "pricingTier" && (
                    <div className="space-y-1">
                      <Label>Pricing Tier</Label>
                      <Select value={cardValues.pricingTier || "__none__"} onValueChange={val => setCardValues(v => ({ ...v, pricingTier: val === "__none__" ? "" : val }))}>
                        <SelectTrigger><SelectValue placeholder="Select tier…" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">— Not set —</SelectItem>
                          {PRICING_TIERS.map(tier => <SelectItem key={tier} value={tier}>{tier}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  )}
                  {editingCard === "location" && (
                    <>
                      <div className="space-y-1"><Label>Address</Label><Input value={cardValues.address1} onChange={e => setCardValues(v => ({ ...v, address1: e.target.value }))} placeholder="Street address" /></div>
                      <div className="space-y-1"><Label>Address 2</Label><Input value={cardValues.address2} onChange={e => setCardValues(v => ({ ...v, address2: e.target.value }))} placeholder="Suite, unit…" /></div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label>City</Label><Input value={cardValues.city} onChange={e => setCardValues(v => ({ ...v, city: e.target.value }))} /></div>
                        <div className="space-y-1"><Label>State / Province</Label><Input value={cardValues.province} onChange={e => setCardValues(v => ({ ...v, province: e.target.value }))} /></div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div className="space-y-1"><Label>ZIP / Postal</Label><Input value={cardValues.zip} onChange={e => setCardValues(v => ({ ...v, zip: e.target.value }))} /></div>
                        <div className="space-y-1"><Label>Country</Label><Input value={cardValues.country} onChange={e => setCardValues(v => ({ ...v, country: e.target.value }))} /></div>
                      </div>
                    </>
                  )}
                </div>
                <DialogFooter className="pt-2">
                  <Button type="button" variant="outline" onClick={() => setEditingCard(null)}>Cancel</Button>
                  <Button type="button" onClick={saveCardEdit} disabled={quickEditMutation.isPending}>
                    {quickEditMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                    Save
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {/* KPI tiles */}
            <div>
              <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wide mb-3">Business Performance</h2>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <KpiTile label="Lifetime Sales" color="bg-green-50 border-green-100 text-green-800" value={metricsLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(metrics?.lifetimeSales || 0)} />
                <KpiTile label="Outstanding" color="bg-red-50 border-red-100 text-red-800" value={metricsLoading ? <Skeleton className="h-6 w-20" /> : formatCurrency(metrics?.totalOutstanding || 0)} />
                <KpiTile label="Avg Margin" color="bg-blue-50 border-blue-100 text-blue-800" value={metricsLoading ? <Skeleton className="h-6 w-16" /> : (metrics?.averageMargin != null ? `${metrics.averageMargin}%` : "N/A")} />
                <KpiTile label="Products" color="bg-purple-50 border-purple-100 text-purple-800" value={metricsLoading ? <Skeleton className="h-6 w-10" /> : String(metrics?.topProducts?.length || 0)} />
              </div>
            </div>

            {/* Opportunity Signals */}
            {opportunityData?.score > 0 && opportunityData?.signals?.length > 0 && (
              <div className="border border-amber-200 bg-amber-50/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Target className="w-4 h-4 text-amber-500" />
                  <h2 className="text-sm font-semibold text-gray-700">Opportunity Signals</h2>
                  <span className={`ml-auto text-xs font-semibold px-2 py-0.5 rounded-full ${opportunityData.score >= 70 ? "bg-green-100 text-green-800" : opportunityData.score >= 50 ? "bg-amber-100 text-amber-800" : "bg-blue-100 text-blue-800"}`}>
                    Score: {opportunityData.score}/100
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {opportunityData.signals.map((signal: any, i: number) => (
                    <div key={i} className="flex items-start gap-2 text-sm p-2 bg-white rounded-lg border border-amber-100">
                      <span className="text-green-600 font-semibold shrink-0">+{signal.points}</span>
                      <span className="text-gray-700">{signal.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Win Path */}
            {winPathData?.hasWins && winPathData.paths?.length > 0 && (
              <div className="border border-emerald-200 bg-emerald-50/30 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Trophy className="w-4 h-4 text-emerald-600" />
                  <h2 className="text-sm font-semibold text-gray-700">Win Path</h2>
                  <span className="ml-auto text-xs bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full">{winPathData.paths.length} {winPathData.paths.length === 1 ? "Win" : "Wins"}</span>
                </div>
                <div className="space-y-4">
                  {winPathData.paths.map((path: any, pi: number) => (
                    <div key={path.orderId} className={pi > 0 ? "pt-4 border-t border-emerald-100" : ""}>
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center gap-2 text-sm">
                          <SiShopify className="w-4 h-4 text-green-600" />
                          <span className="font-semibold text-gray-800">Order {path.orderNumber}</span>
                          <span className="font-bold text-emerald-700">${path.orderTotal.toFixed(2)}</span>
                        </div>
                        <span className="text-xs text-gray-500">{path.daysToWin}d from first touch</span>
                      </div>
                      <div className="relative pl-6">
                        <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-emerald-200" />
                        {path.steps?.map((step: any, si: number) => {
                          const iconMap: Record<string, string> = { email: "✉️", swatch_book: "📚", press_test_kit: "🧪", mailer: "📬", call_made: "📞", quote_sent: "📄", quote_accepted: "✅", sample_shipped: "📦", order: "🏆" };
                          return (
                            <div key={si} className="relative flex items-start gap-3 mb-2">
                              <div className={`relative z-10 w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center text-xs shrink-0 ${si === path.steps.length - 1 ? "ring-2 ring-emerald-400" : ""}`}>
                                {iconMap[step.type] || "•"}
                              </div>
                              <div className="flex-1">
                                <span className={`text-sm ${si === path.steps.length - 1 ? "font-bold text-emerald-700" : "font-medium text-gray-800"}`}>{step.label}</span>
                                <span className="text-xs text-gray-400 ml-2">{new Date(step.date).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Company note */}
            {company.note && (
              <div className="border border-gray-200 rounded-xl p-4 bg-white">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">Notes</h2>
                <p className="text-sm text-gray-700 whitespace-pre-wrap">{company.note}</p>
              </div>
            )}
          </>
        )}

        {/* ── ACTIVITY ─────────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Activity Timeline</h2>
              <Button size="sm" variant="default" onClick={() => setIsLogActivityOpen(true)} className="bg-gray-900 hover:bg-gray-800 h-8 text-xs gap-1">
                <Plus className="w-3.5 h-3.5" /> Add Activity
              </Button>
            </div>
            {activityLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : nonNoteEvents.length === 0 ? (
              <EmptyState icon={Activity} title="No activities yet" sub="Interactions from Spotlight will appear here" />
            ) : (
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {nonNoteEvents.map(event => (
                  <div key={event.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50">
                    <div className="mt-0.5 shrink-0">{getEventIcon(event.eventType)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium text-gray-800">{event.title}</span>
                        <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${getEventBadgeColor(event.eventType)}`}>{getEventLabel(event.eventType)}</span>
                        <span className="text-xs text-gray-400 ml-auto">{relativeTime(event.createdAt)}</span>
                      </div>
                      {event.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{event.description}</p>}
                      {event.metadata?.thumbnailPath && (
                        <img src={event.metadata.thumbnailPath} alt={event.metadata.mailerName || "Mailer"} className="mt-2 rounded border border-gray-200" style={{ width: 120, height: 75, objectFit: "cover" }} onError={e => { (e.target as HTMLImageElement).style.display = "none"; }} />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── EMAILS ───────────────────────────────────────────────────────── */}
        {activeTab === "emails" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Emails {gmailEmailsData.length > 0 && <span className="normal-case font-normal text-gray-400">({gmailEmailsData.length})</span>}
              </h2>
              {company.email && (
                <Button size="sm" variant="outline" onClick={() => emailComposer.open({ to: company.email || "", customerId: company.id, customerName: displayName, usageType: "client_email", variables: { "client.name": displayName, "client.company": company.company || "", "client.email": company.email || "", "client.firstName": company.firstName || "", "client.lastName": company.lastName || "" } })}>
                  <Plus className="w-4 h-4 mr-1" /> Compose
                </Button>
              )}
            </div>
            {gmailEmailsLoading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-14 w-full rounded-lg" />)}
              </div>
            ) : gmailEmailsData.length === 0 ? (
              <EmptyState icon={Mail} title="No emails yet" sub={company.email ? "Gmail messages involving this company will appear here" : "No email address on record"} />
            ) : (
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {gmailEmailsData.map(email => {
                  const isInbound = email.direction === "inbound";
                  const senderLabel = isInbound ? (email.fromName || email.fromEmail || "Customer") : (email.fromName || "You");
                  const timeLabel = email.sentAt ? relativeTime(email.sentAt) : "";
                  return (
                    <div key={email.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 cursor-pointer group"
                      onClick={() => {
                        const q = email.subject ? `subject:"${email.subject}"` : (email.fromEmail || '');
                        window.open(`https://mail.google.com/mail/u/0/#search/${encodeURIComponent(q)}`, '_blank');
                      }}>
                      <div className={`mt-0.5 shrink-0 ${isInbound ? "text-blue-500" : "text-gray-400"}`}>
                        {isInbound ? <ArrowDownLeft className="w-4 h-4" /> : <ArrowUpRight className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-gray-500 shrink-0">{senderLabel}</span>
                          <span className="text-xs text-gray-400 shrink-0">{timeLabel}</span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate mt-0.5 group-hover:text-violet-600">{email.subject || "(no subject)"}</p>
                        {email.snippet && <p className="text-xs text-gray-400 truncate mt-0.5">{email.snippet}</p>}
                      </div>
                      <ExternalLink className="w-3.5 h-3.5 text-gray-300 opacity-0 group-hover:opacity-100 transition-opacity mt-1 shrink-0" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── NOTES ────────────────────────────────────────────────────────── */}
        {activeTab === "notes" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Notes</h2>
              <Button size="sm" variant="outline" onClick={() => setIsNewNoteOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Note
              </Button>
            </div>
            {activityLoading ? (
              <div className="space-y-3">{[1,2].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : noteEvents.length === 0 ? (
              <EmptyState icon={StickyNote} title="No notes yet" sub='Add notes from Spotlight or click "+ New Note"' />
            ) : (
              <div className="space-y-3">
                {noteEvents.map(note => (
                  <div key={note.id} className="p-4 bg-amber-50 rounded-lg border border-amber-100">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800">{note.description || note.title || "No content"}</p>
                        <p className="text-xs text-gray-400 mt-2 flex items-center gap-1">
                          <Calendar className="w-3 h-3" /> {fmtDate(note.createdAt)}
                          {note.createdByName && <><span>•</span><span>{note.createdByName}</span></>}
                        </p>
                      </div>
                      <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-red-400 hover:text-red-600 hover:bg-red-50 shrink-0" onClick={async () => {
                        if (confirm("Delete this note?")) {
                          try { await apiRequest("DELETE", `/api/customer-activity/events/${note.id}`); queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/events", internalCustomerId] }); toast({ title: "Note deleted" }); }
                          catch { toast({ title: "Failed to delete", variant: "destructive" }); }
                        }
                      }}>
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── CONTACTS ─────────────────────────────────────────────────────── */}
        {activeTab === "contacts" && (
          <div>
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                  Contacts {contactsData?.contacts?.length ? <span className="normal-case font-normal text-gray-400">({contactsData.contacts.length})</span> : ""}
                </h2>
                {(domainCheck?.mismatchCount ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-200">
                    <ShieldAlert className="w-3 h-3" /> {domainCheck!.mismatchCount} {domainCheck!.mismatchCount === 1 ? "contact needs" : "contacts need"} attention
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {duplicateEmailContacts.length > 0 && (
                  <Button size="sm" variant="outline" className="text-amber-600 border-amber-300 h-8 text-xs gap-1" onClick={() => { setCurrentMergeGroupIndex(0); setSelectedMergeContacts([]); setKeepContactId(null); setIsMergeContactsOpen(true); }}>
                    <GitMerge className="w-3.5 h-3.5" /> Merge ({duplicateEmailContacts.length})
                  </Button>
                )}
                {company.odooPartnerId && (
                  <Button size="sm" variant="outline" onClick={() => setIsNewContactOpen(true)} className="h-8 text-xs gap-1">
                    <UserPlus className="w-3.5 h-3.5" /> Add Contact
                  </Button>
                )}
              </div>
            </div>
            {contactsLoading ? (
              <div className="space-y-3">{[1,2,3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}</div>
            ) : !contactsData?.contacts?.length ? (
              <EmptyState icon={User} title="No contacts found" sub="Add a contact linked to this account" />
            ) : (
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {contactsData.contacts.map(contact => {
                  const domainInfo = contact.localId ? domainCheckMap[contact.localId] : undefined;
                  const isExpanded = expandedDomainContactId === contact.localId;
                  return (
                    <div key={contact.localId || contact.id}>
                      <div className="px-4 py-3 hover:bg-gray-50 group">
                        <div className="flex items-center justify-between gap-2 mb-1">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-violet-700 text-xs font-semibold shrink-0">{initials(contact.name)}</div>
                            <div className="min-w-0">
                              {contact.localId ? (
                                <Link href={`/odoo-contacts/${contact.localId}`} className="text-sm font-medium text-gray-800 hover:text-violet-600 hover:underline">{contact.name}</Link>
                              ) : (
                                <p className="text-sm font-medium text-gray-800">{contact.name}</p>
                              )}
                              {contact.function && <p className="text-xs text-gray-400">{contact.function}</p>}
                              {contact.tags && (
                                <div className="flex flex-wrap gap-1 mt-0.5">
                                  {contact.tags.split(',').map((tag, i) => (
                                    <span key={i} className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-teal-100 text-teal-800">
                                      {tag.trim()}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            {domainInfo?.status === 'personal' && (
                              <button title="This contact uses a personal email address. That's fine if they prefer it." className="p-1 rounded text-blue-400 hover:text-blue-600">
                                <Info className="w-4 h-4" />
                              </button>
                            )}
                            {domainInfo?.status === 'mismatch' && !domainInfo.acknowledged && (
                              <button
                                title={`This contact uses @${domainInfo.domain} but the rest of this company uses @${domainCheck?.majorityDomain}. Were they added to the right company?`}
                                onClick={() => setExpandedDomainContactId(isExpanded ? null : contact.localId!)}
                                className="p-1 rounded text-orange-500 hover:text-orange-700 hover:bg-orange-50"
                              >
                                <AlertTriangle className="w-4 h-4" />
                              </button>
                            )}
                            {contact.localOnly && (
                              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">Local</span>
                            )}
                            <button
                              onClick={() => { setEditingContact(contact); setEditContactForm({ name: contact.name, email: contact.email || "", phone: contact.phone || "", function: contact.function || "" }); }}
                              className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-gray-700"
                              title="Edit contact"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                        <div className="flex flex-wrap gap-3 mt-1 text-xs ml-9">
                          {contact.email && (
                            <button onClick={() => emailComposer.open({ to: contact.email || "", customerId: contact.localId || company.id, customerName: contact.name, usageType: "client_email", variables: { "client.name": contact.name, "client.company": company.company || "", "client.email": contact.email || "", "client.firstName": contact.name.split(" ")[0] || "", "client.lastName": contact.name.split(" ").slice(1).join(" ") || "" } })} className="flex items-center gap-1 text-violet-600 hover:text-green-600">
                              <Mail className="w-3 h-3" /> {contact.email}
                              {isShopifyEmail(contact.email) && <SiShopify className="w-3 h-3 text-green-600" />}
                            </button>
                          )}
                          {contact.phone && <a href={`tel:${contact.phone}`} className="flex items-center gap-1 text-gray-500 hover:text-violet-600"><Phone className="w-3 h-3" /> {contact.phone}</a>}
                        </div>
                      </div>
                      {isExpanded && domainInfo && contact.localId && (() => {
                        const otherDomains = [...new Set(
                          (domainCheck?.contacts ?? [])
                            .filter(c => c.contactId !== contact.localId && c.status === 'match' && c.domain)
                            .map(c => c.domain!)
                        )];
                        return (
                          <div className="mx-4 mb-3 p-3 rounded-lg border border-orange-200 bg-orange-50">
                            <div className="flex items-start gap-2 mb-2">
                              <AlertTriangle className="w-4 h-4 text-orange-600 mt-0.5 shrink-0" />
                              <div className="text-sm text-orange-900">
                                <p className="font-medium mb-1">Domain mismatch detected</p>
                                <div className="text-xs text-orange-700 space-y-0.5">
                                  <p><span className="font-semibold">{contact.name}</span> email: <span className="font-mono font-semibold">{domainInfo.email || '(no email)'}</span></p>
                                  <p>Company domain: <span className="font-mono font-semibold">@{domainCheck?.majorityDomain}</span></p>
                                  {otherDomains.length > 0 && (
                                    <p>Other contacts use: {otherDomains.slice(0, 3).map(d => (
                                      <span key={d} className="font-mono font-semibold mr-1">@{d}</span>
                                    ))}{otherDomains.length > 3 && <span>+{otherDomains.length - 3} more</span>}</p>
                                  )}
                                  <p className="mt-1 italic">Were they added to the right company?</p>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center gap-2 mt-2">
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-orange-300 text-orange-800 hover:bg-orange-100"
                                disabled={acknowledgeDomainMutation.isPending}
                                onClick={() => acknowledgeDomainMutation.mutate(contact.localId!)}
                              >
                                {acknowledgeDomainMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <CheckCircle2 className="w-3 h-3" />}
                                Keep in this company
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 text-xs border-red-200 text-red-700 hover:bg-red-50"
                                disabled={moveStandaloneMutation.isPending}
                                onClick={() => moveStandaloneMutation.mutate(contact.localId!)}
                              >
                                {moveStandaloneMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <XCircle className="w-3 h-3" />}
                                Move to standalone contact
                              </Button>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── BUSINESS ─────────────────────────────────────────────────────── */}
        {activeTab === "business" && (
          <div className="space-y-6">
            {/* Not in Odoo banner */}
            {!company.odooPartnerId && (
              <div className="flex items-center justify-between p-4 bg-amber-50 border border-amber-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600" />
                  <p className="text-sm text-amber-800">This contact is not linked to Odoo.</p>
                </div>
                <Button size="sm" variant="outline" onClick={() => setIsCreateOdooDialogOpen(true)} className="gap-1.5 text-amber-700 border-amber-300">
                  <Upload className="w-3.5 h-3.5" /> Create in Odoo
                </Button>
              </div>
            )}

            {/* Sales Person & Payment Terms & Pricing Tier */}
            <div className="border border-gray-200 rounded-xl bg-white divide-y divide-gray-100">
              {/* Sales Person */}
              <div className="flex items-start gap-3 px-4 py-3">
                <User className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-gray-500 font-medium">Sales Person</p>
                    {salesPersonSaveSuccess && !updateSalesPersonMutation.isPending && <span className="text-xs text-green-600">✓ Saved</span>}
                  </div>
                  {metricsLoading || salesPeopleLoading ? <Skeleton className="h-8 w-full" /> : !company.odooPartnerId ? (
                    <p className="text-sm text-gray-700">{company.salesRepName || "—"}</p>
                  ) : salesPeopleOptions.length > 0 ? (
                    <Select value={salesPeopleOptions.find(sp => sp.name === (metrics?.salesPerson || company.salesRepName))?.id || ""} onValueChange={value => { if (value === "unassign") { updateSalesPersonMutation.mutate({ salesPersonId: null, salesPersonName: "" }); } else { const p = salesPeopleOptions.find(sp => sp.id === value); if (p) updateSalesPersonMutation.mutate({ salesPersonId: p.id as any, salesPersonName: p.name }); } }} disabled={updateSalesPersonMutation.isPending}>
                      <SelectTrigger className={`text-sm ${salesPersonSaveSuccess ? "border-green-400" : ""}`}><SelectValue placeholder={metrics?.salesPerson || "Select sales person"} /></SelectTrigger>
                      <SelectContent><SelectItem value="unassign" className="text-gray-400 italic">Unassign</SelectItem>{salesPeopleOptions.map(p => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <p className="text-sm text-gray-700">{metrics?.salesPerson || company.salesRepName || "—"}</p>}
                </div>
              </div>

              {/* Payment Terms */}
              <div className="flex items-start gap-3 px-4 py-3">
                <CreditCard className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-gray-500 font-medium">Payment Terms</p>
                    {paymentTermsSaveSuccess && !updatePaymentTermsMutation.isPending && <span className="text-xs text-green-600">✓ Saved</span>}
                  </div>
                  {metricsLoading ? <Skeleton className="h-8 w-full" /> : !company.odooPartnerId ? (
                    <p className="text-sm text-gray-500">Not linked to Odoo</p>
                  ) : paymentTermsOptions.length > 0 ? (
                    <Select value={paymentTermsOptions.find(t => t.name === metrics?.paymentTerms)?.id.toString() || ""} onValueChange={value => { const t = paymentTermsOptions.find(t2 => t2.id.toString() === value); if (t) updatePaymentTermsMutation.mutate({ paymentTermId: t.id, paymentTermName: t.name }); }} disabled={updatePaymentTermsMutation.isPending}>
                      <SelectTrigger className={`text-sm ${paymentTermsSaveSuccess ? "border-green-400" : ""}`}><SelectValue placeholder={metrics?.paymentTerms || "Select"} /></SelectTrigger>
                      <SelectContent>{paymentTermsOptions.map(t => <SelectItem key={t.id} value={t.id.toString()}>{t.name}</SelectItem>)}</SelectContent>
                    </Select>
                  ) : <p className="text-sm text-gray-700">{metrics?.paymentTerms || "—"}</p>}
                </div>
              </div>

              {/* Pricing Tier */}
              <div className="flex items-start gap-3 px-4 py-3">
                <Tag className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <p className="text-xs text-gray-500 font-medium">Pricing Tier</p>
                    {tagSaveSuccess && !updatePricingTierMutation.isPending && !updateLocalPricingTierMutation.isPending && <span className="text-xs text-green-600">✓ Saved</span>}
                  </div>
                  {categoriesLoading || pricingTiersLoading ? <Skeleton className="h-8 w-full" /> : (
                    <Select value={company.pricingTier || ""} onValueChange={value => {
                      if (company.odooPartnerId) { const cat = partnerCategories.find(c => c.name === value); if (cat) updatePricingTierMutation.mutate({ categoryId: cat.id, categoryName: cat.name }); else updateLocalPricingTierMutation.mutate({ pricingTier: value }); }
                      else updateLocalPricingTierMutation.mutate({ pricingTier: value });
                    }} disabled={updatePricingTierMutation.isPending || updateLocalPricingTierMutation.isPending}>
                      <SelectTrigger className={`text-sm ${tagSaveSuccess ? "border-green-400" : ""}`}><SelectValue placeholder={company.pricingTier || "Select tier"} /></SelectTrigger>
                      <SelectContent>{PRICING_TIERS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
                    </Select>
                  )}
                </div>
              </div>

              {/* Tags */}
              {company.tags && (
                <div className="flex items-start gap-3 px-4 py-3">
                  <Tag className="w-4 h-4 text-gray-400 mt-1 shrink-0" />
                  <div className="flex-1">
                    <p className="text-xs text-gray-500 font-medium mb-2">Customer Tags</p>
                    <div className="flex flex-wrap gap-1.5">
                      {company.tags.split(",").map((tag, i) => <span key={i} className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800">{tag.trim()}</span>)}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Machine Profiles */}
            <div className="border border-gray-200 rounded-xl bg-white p-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Machine Profiles</h2>
              <div className="flex flex-wrap gap-2">
                {(machineTypes.length > 0 ? machineTypes : [
                  { code: "offset", label: "Offset" }, { code: "digital_toner", label: "Digital Toner" },
                  { code: "digital_inkjet", label: "Digital Inkjet" }, { code: "wide_format", label: "Wide Format" },
                  { code: "screen_printing", label: "Screen Printing" }, { code: "distributor", label: "Distributor" },
                ]).map((mt: any) => {
                  const isEnabled = machineProfiles.some(p => p.machineFamily === mt.code);
                  return <Button key={mt.code} variant={isEnabled ? "default" : "outline"} size="sm" className={`rounded-full text-xs ${isEnabled ? "bg-violet-600 hover:bg-violet-700" : "hover:bg-violet-50"}`} onClick={() => toggleMachineMutation.mutate({ machineFamily: mt.code, currentlyEnabled: isEnabled })} disabled={toggleMachineMutation.isPending}>{mt.label}</Button>;
                })}
              </div>
            </div>

            {/* Products Purchased */}
            {metrics?.topProducts && metrics.topProducts.length > 0 && (
              <div className="border border-gray-200 rounded-xl bg-white p-4">
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3">Products Purchased</h2>
                <div className="space-y-2">
                  {metrics.topProducts.slice(0, 10).map((p: any, i: number) => (
                    <div key={i} className="flex items-center justify-between text-sm group">
                      {p.productId ? (
                        <Link href={`/odoo-products/${p.productId}`} className="text-gray-700 truncate max-w-[60%] hover:text-violet-600 hover:underline">
                          {p.name}
                        </Link>
                      ) : (
                        <span className="text-gray-700 truncate max-w-[60%]">{p.name}</span>
                      )}
                      <div className="flex items-center gap-3 text-xs text-gray-500">
                        <span>qty {p.quantity}</span>
                        <span className="font-medium text-gray-700">{formatCurrency(p.totalSpent)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── DIALOGS ──────────────────────────────────────────────────────────── */}

      {/* Edit Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-violet-600" />
              {company?.isCompany ? "Edit Company Information" : "Edit Contact Information"}
            </DialogTitle>
            <DialogDescription>Changes queued for Odoo sync.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            {company?.isCompany ? (
              <div className="grid gap-2">
                <Label>Company Name</Label>
                <Input value={editForm.company} onChange={e => setEditForm({ ...editForm, company: e.target.value })} placeholder="Company name" />
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>First Name</Label>
                  <Input value={editForm.firstName} onChange={e => setEditForm({ ...editForm, firstName: e.target.value })} placeholder="First name" />
                </div>
                <div className="grid gap-2">
                  <Label>Last Name</Label>
                  <Input value={editForm.lastName} onChange={e => setEditForm({ ...editForm, lastName: e.target.value })} placeholder="Last name" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Email</Label><Input type="email" value={editForm.email} onChange={e => setEditForm({ ...editForm, email: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Phone</Label><Input value={editForm.phone} onChange={e => setEditForm({ ...editForm, phone: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Address</Label><Input value={editForm.address1} onChange={e => setEditForm({ ...editForm, address1: e.target.value })} /><Input value={editForm.address2} onChange={e => setEditForm({ ...editForm, address2: e.target.value })} placeholder="Address line 2" /></div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2"><Label>City</Label><Input value={editForm.city} onChange={e => setEditForm({ ...editForm, city: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Province</Label><Input value={editForm.province} onChange={e => setEditForm({ ...editForm, province: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Zip</Label><Input value={editForm.zip} onChange={e => setEditForm({ ...editForm, zip: e.target.value })} /></div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2"><Label>Country</Label><Input value={editForm.country} onChange={e => setEditForm({ ...editForm, country: e.target.value })} /></div>
              <div className="grid gap-2"><Label>Website</Label><Input value={editForm.website} onChange={e => setEditForm({ ...editForm, website: e.target.value })} /></div>
            </div>
            <div className="grid gap-2"><Label>Internal Note</Label><Textarea value={editForm.note} onChange={e => setEditForm({ ...editForm, note: e.target.value })} rows={3} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={() => saveEditsMutation.mutate(editForm)} disabled={saveEditsMutation.isPending}>
              {saveEditsMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirm */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="text-red-600 flex items-center gap-2"><Trash2 className="w-5 h-5" />Delete Customer</DialogTitle>
            <DialogDescription>Permanently delete <strong>{displayName}</strong>? This cannot be undone.</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsDeleteConfirmOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={() => deleteCustomerMutation.mutate()} disabled={deleteCustomerMutation.isPending}>
              {deleteCustomerMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Trash2 className="w-4 h-4 mr-2" />} Delete Permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Log Activity Dialog */}
      <Dialog open={isLogActivityOpen} onOpenChange={setIsLogActivityOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><ClipboardList className="w-5 h-5 text-blue-500" />Log Activity</DialogTitle>
            <DialogDescription>Record any interaction with this customer.</DialogDescription>
          </DialogHeader>
          <div className="py-3 space-y-4">
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">What type of activity?</p>
              <div className="grid grid-cols-3 gap-2">
                {ACTIVITY_TYPES.map(at => {
                  const Icon = at.icon;
                  return (
                    <button key={at.value} type="button" onClick={() => setLogActivityType(at.value)} className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-all text-center ${logActivityType === at.value ? "border-blue-500 bg-blue-50 text-blue-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                      <Icon className="w-5 h-5" /><span className="text-[11px] font-medium">{at.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-700 mb-1">Notes <span className="text-gray-400 font-normal">(optional)</span></p>
              <Textarea placeholder="What happened? Any outcome or next step?" value={logActivityNote} onChange={e => setLogActivityNote(e.target.value)} className="min-h-[90px]" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsLogActivityOpen(false)}>Cancel</Button>
            <Button onClick={() => logActivityMutation.mutate()} disabled={logActivityMutation.isPending} className="bg-blue-600 hover:bg-blue-700">
              {logActivityMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Note Dialog */}
      <Dialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Add Note</DialogTitle><DialogDescription>Notes are visible to all team members.</DialogDescription></DialogHeader>
          <div className="py-4"><Textarea placeholder="Write your note here..." value={newNoteText} onChange={e => setNewNoteText(e.target.value)} className="min-h-[120px]" /></div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewNoteOpen(false)}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate(newNoteText)} disabled={!newNoteText.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />} Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Contact Dialog */}
      <Dialog open={!!editingContact} onOpenChange={open => { if (!open) setEditingContact(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Pencil className="w-4 h-4 text-violet-600" />Edit Contact</DialogTitle>
            <DialogDescription>Changes will be saved to this app and synced to Odoo.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name *</Label><Input placeholder="John Doe" value={editContactForm.name} onChange={e => setEditContactForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Job Title / Function</Label><Input placeholder="Sales Manager" value={editContactForm.function} onChange={e => setEditContactForm(p => ({ ...p, function: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@example.com" value={editContactForm.email} onChange={e => setEditContactForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input placeholder="+1 555-123-4567" value={editContactForm.phone} onChange={e => setEditContactForm(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingContact(null)}>Cancel</Button>
            <Button type="button" onClick={() => editContactMutation.mutate(editContactForm)} disabled={!editContactForm.name.trim() || editContactMutation.isPending}>
              {editContactMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Pencil className="w-4 h-4 mr-2" />} Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Contact Dialog */}
      <Dialog open={isNewContactOpen} onOpenChange={setIsNewContactOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add New Contact</DialogTitle><DialogDescription>Add a contact person for this company. Will be created in Odoo.</DialogDescription></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2"><Label>Name *</Label><Input placeholder="John Doe" value={newContactForm.name} onChange={e => setNewContactForm(p => ({ ...p, name: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Job Title / Function</Label><Input placeholder="Sales Manager" value={newContactForm.function} onChange={e => setNewContactForm(p => ({ ...p, function: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Email</Label><Input type="email" placeholder="john@example.com" value={newContactForm.email} onChange={e => setNewContactForm(p => ({ ...p, email: e.target.value }))} /></div>
            <div className="space-y-2"><Label>Phone</Label><Input placeholder="+1 555-123-4567" value={newContactForm.phone} onChange={e => setNewContactForm(p => ({ ...p, phone: e.target.value }))} /></div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewContactOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => createContactMutation.mutate(newContactForm)} disabled={!newContactForm.name.trim() || createContactMutation.isPending}>
              {createContactMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <UserPlus className="w-4 h-4 mr-2" />} Add Contact
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create in Odoo Dialog */}
      <Dialog open={isCreateOdooDialogOpen} onOpenChange={open => { setIsCreateOdooDialogOpen(open); if (!open) setDuplicatePartners([]); }}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Create Contact in Odoo</DialogTitle><DialogDescription>This will create a new partner record in Odoo.</DialogDescription></DialogHeader>
          <div className="space-y-3 py-4">
            <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Building2 className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Name</p><p className="font-medium">{company.company || [company.firstName, company.lastName].filter(Boolean).join(" ")}</p></div></div>
            {company.email && <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Mail className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Email</p><p className="font-medium">{company.email}</p></div></div>}
            {(company.phone || company.cell) && <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"><Phone className="w-5 h-5 text-gray-400" /><div><p className="text-xs text-gray-500">Phone</p><p className="font-medium">{company.phone || company.cell}</p></div></div>}
          </div>
          {duplicatePartners.length > 0 && (
            <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2"><AlertCircle className="w-4 h-4 text-amber-600" /><p className="font-medium text-amber-800 text-sm">Potential Duplicate Found</p></div>
              <p className="text-sm text-amber-700 mb-3">A partner with this email already exists in Odoo. Link to an existing partner?</p>
              <div className="space-y-2">
                {duplicatePartners.map(p => (
                  <div key={p.id} className="flex items-center justify-between p-2 bg-white rounded border">
                    <div><p className="font-medium text-sm">{p.name}</p><p className="text-xs text-gray-500">{p.email}</p></div>
                    <Button size="sm" variant="outline" onClick={() => linkToOdooMutation.mutate(p.id)} disabled={linkToOdooMutation.isPending}>{linkToOdooMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : "Link"}</Button>
                  </div>
                ))}
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCreateOdooDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => createInOdooMutation.mutate()} disabled={createInOdooMutation.isPending} className="gap-2">
              {createInOdooMutation.isPending ? <><Loader2 className="w-4 h-4 animate-spin" />Creating...</> : <><Upload className="w-4 h-4" />Create in Odoo</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Preview */}
      <Dialog open={!!emailPreview} onOpenChange={open => { if (!open) setEmailPreview(null); }}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Mail className="w-5 h-5 text-blue-500" />Email Preview</DialogTitle>
            <DialogDescription>Sent to {emailPreview?.recipientEmail} on {emailPreview?.sentAt ? fmtDate(emailPreview.sentAt) : ""}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg"><span className="text-sm font-medium text-gray-500">Subject:</span><span className="text-sm font-semibold">{emailPreview?.subject}</span></div>
            <div className="border rounded-lg p-4 bg-white"><div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html: emailPreview?.body || "" }} /></div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Merge Contacts */}
      <Dialog open={isMergeContactsOpen} onOpenChange={setIsMergeContactsOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Duplicate Contacts</DialogTitle>
            <DialogDescription>{duplicateEmailContacts.length > 1 ? `Group ${currentMergeGroupIndex + 1} of ${duplicateEmailContacts.length}: Select which contact to keep.` : "Select which contact to keep. Others will be removed."}</DialogDescription>
          </DialogHeader>
          {duplicateEmailContacts[currentMergeGroupIndex] && (
            <div className="space-y-4 py-4">
              <div className="border rounded-lg p-3 bg-amber-50/50">
                <p className="text-sm font-medium text-amber-700 mb-3"><Mail className="w-4 h-4 inline-block mr-1" />Email: {duplicateEmailContacts[currentMergeGroupIndex].email}</p>
                <RadioGroup value={keepContactId?.toString() || ""} onValueChange={value => { const id = parseInt(value); const grp = duplicateEmailContacts[currentMergeGroupIndex]; setKeepContactId(id); setSelectedMergeContacts(grp.contacts.filter(c => c.id !== id).map(c => c.id)); }}>
                  {duplicateEmailContacts[currentMergeGroupIndex].contacts.map(c => (
                    <div key={c.id} className="flex items-center gap-2 p-2 rounded hover:bg-white bg-white/50">
                      <RadioGroupItem value={c.id.toString()} id={`c-${c.id}`} />
                      <Label htmlFor={`c-${c.id}`} className="flex-1 cursor-pointer"><span className="font-medium">{c.name}</span>{c.function && <span className="text-xs text-gray-500 ml-2">({c.function})</span>}</Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            </div>
          )}
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm"><AlertCircle className="w-4 h-4 inline-block mr-1 text-amber-600" /><strong>Important:</strong> After merging, update Odoo and Shopify manually if needed.</div>
          <DialogFooter className="flex-col gap-2 sm:flex-row">
            {duplicateEmailContacts.length > 1 && (
              <div className="flex gap-2 mr-auto">
                <Button variant="outline" size="sm" disabled={currentMergeGroupIndex === 0} onClick={() => { setCurrentMergeGroupIndex(p => p - 1); setKeepContactId(null); setSelectedMergeContacts([]); }}><ChevronLeft className="w-4 h-4" /> Prev</Button>
                <Button variant="outline" size="sm" disabled={currentMergeGroupIndex >= duplicateEmailContacts.length - 1} onClick={() => { setCurrentMergeGroupIndex(p => p + 1); setKeepContactId(null); setSelectedMergeContacts([]); }}>Next <ChevronRight className="w-4 h-4" /></Button>
              </div>
            )}
            <Button variant="outline" onClick={() => setIsMergeContactsOpen(false)}>Cancel</Button>
            <Button type="button" onClick={() => { if (keepContactId && selectedMergeContacts.length > 0) mergeContactsMutation.mutate({ keepContactId, deleteContactIds: selectedMergeContacts }); }} disabled={!keepContactId || selectedMergeContacts.length === 0 || mergeContactsMutation.isPending} className="bg-amber-600 hover:bg-amber-700">
              {mergeContactsMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <GitMerge className="w-4 h-4 mr-2" />} Merge This Group
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

    </div>
  );
}

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { PRICING_TIERS } from "@shared/schema";
import { useEmailComposer } from "@/components/email-composer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeft, Building2, User, Mail, Phone, MapPin, DollarSign,
  Clock, Calendar, Target, Percent, Package, FileText, MessageSquare,
  PhoneCall, Send, Gift, Loader2, Plus, Edit, CheckCircle2, Star,
  Users, Globe, Briefcase, StickyNote, Printer, Truck, Upload,
  CheckCircle, Zap, X, Activity, FolderOpen, CheckSquare,
  AtSign, ArrowUpRight, ArrowDownLeft, TrendingUp,
} from "lucide-react";
import { PrintLabelButton } from "@/components/PrintLabelButton";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  return new DOMParser().parseFromString(html, "text/html").body.textContent || "";
}

function relativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "";
  const diff = (Date.now() - new Date(dateStr).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}
function fmtDateTime(d: string | null) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

// ─── Types ────────────────────────────────────────────────────────────────────
interface LeadActivity {
  id: number;
  leadId: number;
  activityType: string;
  summary: string;
  details: string | null;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

interface LeadEmail {
  id: number;
  direction: string;
  fromEmail: string | null;
  fromName: string | null;
  toEmail: string | null;
  subject: string | null;
  snippet: string | null;
  sentAt: string | null;
}

interface Lead {
  id: number;
  odooLeadId: number | null;
  sourceType: string;
  sourceCustomerId: string | null;
  name: string;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  stage: string;
  priority: string | null;
  score: number;
  probability: number;
  expectedRevenue: string | null;
  swatchbookSentAt: string | null;
  sampleSentAt: string | null;
  priceListSentAt: string | null;
  catalogSentAt: string | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  totalTouchpoints: number;
  preferredContact: string | null;
  bestTimeToCall: string | null;
  description: string | null;
  internalNotes: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  tags: string | null;
  isCompany: boolean;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  customerType: string | null;
  pricingTier: string | null;
  salesRepId: string | null;
  salesRepName: string | null;
  odooPartnerId: number | null;
  createdAt: string;
  updatedAt: string;
  activities?: LeadActivity[];
}

// ─── Config ───────────────────────────────────────────────────────────────────
const stageConfig: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-300" },
  contacted: { label: "Contacted", color: "bg-purple-100 text-purple-700 border-purple-300" },
  meeting_set: { label: "Meeting Set", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  qualified: { label: "Qualified", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  nurturing: { label: "Nurturing", color: "bg-amber-100 text-amber-700 border-amber-300" },
  proposal: { label: "Proposal Sent", color: "bg-orange-100 text-orange-700 border-orange-300" },
  negotiation: { label: "Negotiation", color: "bg-pink-100 text-pink-700 border-pink-300" },
  converted: { label: "Won", color: "bg-green-100 text-green-700 border-green-300" },
  lost: { label: "Lost", color: "bg-red-100 text-red-700 border-red-300" },
  contact_later: { label: "Contact Later", color: "bg-slate-100 text-slate-600 border-slate-300" },
  not_a_fit: { label: "Not a Fit", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

const priorityConfig: Record<string, { label: string; color: string }> = {
  low: { label: "Low", color: "text-slate-400" },
  medium: { label: "Medium", color: "text-amber-500" },
  high: { label: "High", color: "text-orange-500" },
  urgent: { label: "Urgent", color: "text-red-500" },
};

const activityTypeConfig: Record<string, { label: string; icon: LucideIcon; color: string }> = {
  email_sent: { label: "Email Sent", icon: Send, color: "bg-blue-100 text-blue-600" },
  call_made: { label: "Call Made", icon: PhoneCall, color: "bg-green-100 text-green-600" },
  sample_sent: { label: "Sample Sent", icon: Gift, color: "bg-purple-100 text-purple-600" },
  meeting: { label: "Meeting", icon: Users, color: "bg-indigo-100 text-indigo-600" },
  note: { label: "Note", icon: FileText, color: "bg-amber-100 text-amber-600" },
  quote_sent: { label: "Quote Sent", icon: FileText, color: "bg-orange-100 text-orange-600" },
  mailer_one_page: { label: "One-Page Mailer Sent", icon: Mail, color: "bg-orange-100 text-orange-600" },
  mailer_envelope: { label: "Sample Envelope Sent", icon: Package, color: "bg-orange-100 text-orange-700" },
  mailer_press_kit: { label: "Press Test Kit Sent", icon: Package, color: "bg-purple-100 text-purple-600" },
};

// ─── Tab definition ───────────────────────────────────────────────────────────
type TabKey = "overview" | "activity" | "emails" | "calls" | "notes" | "tasks" | "files";

interface TabDef {
  key: TabKey;
  label: string;
  icon: LucideIcon;
  count?: number;
}

// ─── Sub-components ───────────────────────────────────────────────────────────
function HighlightTile({
  label, icon: Icon, children,
}: { label: string; icon: LucideIcon; children: React.ReactNode }) {
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

// ─── Page ─────────────────────────────────────────────────────────────────────
export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const leadId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const emailComposer = useEmailComposer();
  const queryClientInstance = useQueryClient();

  const [activeTab, setActiveTab] = useState<TabKey>("activity");
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newActivity, setNewActivity] = useState({ activityType: "note", summary: "", details: "" });
  const [editForm, setEditForm] = useState<Partial<Lead>>({});
  const [showDripEnroll, setShowDripEnroll] = useState(false);
  const [showPushConfirm, setShowPushConfirm] = useState(false);
  const [selectedDripCampaignId, setSelectedDripCampaignId] = useState<string>("");

  // ── Queries ─────────────────────────────────────────────────────────────────
  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: ["/api/leads", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch lead");
      return res.json();
    },
    enabled: !!leadId,
  });

  const { data: leadEmails = [], isLoading: emailsLoading } = useQuery<LeadEmail[]>({
    queryKey: ["/api/customer-activity/emails", leadId],
    queryFn: async () => {
      const res = await fetch(`/api/customer-activity/emails?leadId=${leadId}&limit=50`, { credentials: "include" });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!leadId,
    staleTime: 2 * 60 * 1000,
  });

  const { data: dripCampaigns = [] } = useQuery<{ id: number; name: string; description: string | null; isActive: boolean }[]>({
    queryKey: ["/api/drip-campaigns"],
    staleTime: 5 * 60 * 1000,
    enabled: showDripEnroll,
  });

  const { data: leadDripAssignments = [], refetch: refetchDripAssignments } = useQuery<{
    id: number; campaignId: number; campaignName: string; campaignDescription: string | null;
    status: string; startedAt: string; completedAt: string | null; cancelledAt: string | null; assignedBy: string | null;
  }[]>({
    queryKey: ["/api/leads", leadId, "drip-assignments"],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}/drip-assignments`, { credentials: "include" });
      if (!res.ok) throw new Error("Failed to fetch drip assignments");
      return res.json();
    },
    enabled: !!leadId,
  });

  const { data: salesReps = [] } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ["/api/sales-reps"],
    staleTime: 30 * 60 * 1000,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────
  const addActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; summary: string; details: string }) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/activities`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Activity added" });
      setIsAddActivityOpen(false);
      setNewActivity({ activityType: "note", summary: "", details: "" });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message || "Failed to add activity", variant: "destructive" }),
  });

  const updateLeadMutation = useMutation({
    mutationFn: async (data: Partial<Lead>) => {
      const res = await apiRequest("PUT", `/api/leads/${leadId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lead updated" });
      setIsEditOpen(false);
      setEditForm({});
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message || "Failed to update lead", variant: "destructive" }),
  });

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      const res = await apiRequest("PUT", `/api/leads/${leadId}`, { stage });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stage updated" });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update stage", variant: "destructive" }),
  });

  const updateSalesRepMutation = useMutation({
    mutationFn: async ({ salesRepId, salesRepName }: { salesRepId: string | null; salesRepName: string | null }) => {
      const res = await apiRequest("PUT", `/api/leads/${leadId}`, { salesRepId, salesRepName });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Sales rep assigned" });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to assign sales rep", variant: "destructive" }),
  });

  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/activities`, {
        activityType: "note", summary: noteText, details: "",
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Note added" });
      setNewNoteText(""); setIsNewNoteOpen(false);
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
    },
    onError: (e: Error) => toast({ title: "Failed to add note", description: e.message, variant: "destructive" }),
  });

  const pushToOdooMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/leads/${leadId}/push-to-odoo`, {});
      if (!res.ok) { const err = await res.json(); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.alreadyPushed) {
        toast({ title: "Already in Odoo", description: `Partner #${data.odooPartnerId}` });
      } else {
        toast({ title: "Moved to Contacts" });
        queryClientInstance.invalidateQueries({ queryKey: ["/api/leads"] });
        queryClientInstance.invalidateQueries({ queryKey: ["/api/customers"] });
        setTimeout(() => setLocation(`/odoo-contacts/${data.customerId}`), 600);
      }
    },
    onError: (e: Error) => toast({ title: "Push to Odoo failed", description: e.message || "Could not connect to Odoo. The lead has not been deleted — please try again.", variant: "destructive" }),
  });

  const enrollDripMutation = useMutation({
    mutationFn: async (campaignId: number) => {
      const res = await apiRequest("POST", `/api/drip-campaigns/${campaignId}/assignments`, { leadIds: [Number(leadId)] });
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || "Failed"); }
      return res.json();
    },
    onSuccess: (data) => {
      if (data.created === 0) toast({ title: "Already enrolled" });
      else { toast({ title: "Drip campaign started" }); refetchDripAssignments(); }
      setShowDripEnroll(false); setSelectedDripCampaignId("");
    },
    onError: (e: Error) => toast({ title: "Enrollment failed", description: e.message, variant: "destructive" }),
  });

  const cancelDripMutation = useMutation({
    mutationFn: async (assignmentId: number) => {
      const res = await apiRequest("PATCH", `/api/drip-campaigns/assignments/${assignmentId}`, { status: "cancelled" });
      if (!res.ok) throw new Error("Failed");
      return res.json();
    },
    onSuccess: () => { toast({ title: "Campaign cancelled" }); refetchDripAssignments(); },
    onError: (e: Error) => toast({ title: "Failed to cancel", description: e.message, variant: "destructive" }),
  });

  const updateCustomerTypeMutation = useMutation({
    mutationFn: async (customerType: "printer" | "reseller") => {
      const res = await apiRequest("PUT", `/api/leads/${leadId}`, { customerType });
      return res.json();
    },
    onSuccess: (_, customerType) => {
      toast({ title: customerType === "printer" ? "Marked as Printing Company" : "Marked as Reseller" });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads", leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ["/api/leads"] });
    },
    onError: () => toast({ title: "Error", description: "Failed to update customer type", variant: "destructive" }),
  });

  // ── Loading / Error ──────────────────────────────────────────────────────────
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

  if (!lead) {
    return (
      <div className="p-6 text-center py-24">
        <p className="text-gray-500 mb-4">Lead not found</p>
        <Link href="/leads">
          <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" /> Back to Leads</Button>
        </Link>
      </div>
    );
  }

  const activities = lead.activities || [];
  const notes = activities.filter(a => a.activityType === "note");
  const nonNoteActivities = activities.filter(a => a.activityType !== "note");
  const emailActivities = activities.filter(a => a.activityType === "email_sent");
  const stageInfo = stageConfig[lead.stage] || { label: lead.stage, color: "bg-gray-100 text-gray-600" };
  const address = [lead.street, lead.street2, lead.city, lead.state, lead.zip, lead.country].filter(Boolean).join(", ");

  // Merge Gmail messages with email_sent activities (activities as fallback when gmail msg not found)
  const gmailSubjects = new Set(leadEmails.map(e => (e.subject || "").toLowerCase().trim()));
  const activityEmailRows = emailActivities
    .filter(a => !gmailSubjects.has((a.summary || "").toLowerCase().trim()))
    .map(a => {
      const rawDetails = a.details || "";
      const cleanSnippet = (() => {
        const m = rawDetails.match(/^gmailMsgId=[^|]+\|to:(.+)$/);
        if (m) return `To: ${m[1]}`;
        if (rawDetails.startsWith('gmailMsgId=')) return '';
        return rawDetails;
      })();
      return {
        id: `act-${a.id}`,
        subject: a.summary || "(email sent)",
        snippet: cleanSnippet,
        direction: "outbound" as const,
        sentAt: a.performedAt,
        fromName: "You",
        fromEmail: "",
        isFromActivity: true,
      };
    });
  const allEmails = [
    ...leadEmails.map(e => ({ ...e, isFromActivity: false })),
    ...activityEmailRows,
  ].sort((a, b) => new Date(b.sentAt).getTime() - new Date(a.sentAt).getTime());

  const TABS: TabDef[] = [
    { key: "activity", label: "Activity", icon: Activity, count: nonNoteActivities.length || undefined },
    { key: "overview", label: "Overview", icon: TrendingUp },
    { key: "emails", label: "Emails", icon: Mail, count: allEmails.length || undefined },
    { key: "calls", label: "Calls", icon: PhoneCall, count: 0 },
    { key: "notes", label: "Notes", icon: StickyNote, count: notes.length || undefined },
    { key: "tasks", label: "Tasks", icon: CheckSquare, count: 0 },
    { key: "files", label: "Files", icon: FolderOpen, count: 0 },
  ];

  const handleEditClick = () => {
    setEditForm({
      name: lead.name, email: lead.email, phone: lead.phone, mobile: lead.mobile,
      company: lead.company, jobTitle: lead.jobTitle, website: lead.website,
      street: lead.street, city: lead.city, state: lead.state, zip: lead.zip, country: lead.country,
      description: lead.description, internalNotes: lead.internalNotes,
      expectedRevenue: lead.expectedRevenue, probability: lead.probability,
      priority: lead.priority, pricingTier: lead.pricingTier,
      salesRepId: lead.salesRepId, salesRepName: lead.salesRepName,
      preferredContact: lead.preferredContact, bestTimeToCall: lead.bestTimeToCall,
    });
    setIsEditOpen(true);
  };

  return (
    <div className="min-h-screen bg-white flex flex-col">
      {/* ── Header ────────────────────────────────────────────────────────────── */}
      <div className="border-b border-gray-200 bg-white">
        <div className="px-6 pt-4 pb-0">
          {/* Back + actions row */}
          <div className="flex items-center justify-between mb-4">
            <Link href="/leads">
              <button className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors">
                <ArrowLeft className="h-4 w-4" />
                Back to Leads
              </button>
            </Link>

            <div className="flex items-center gap-2">
              {/* Customer type toggle */}
              <div className="flex items-center gap-0.5 border border-gray-200 rounded-lg p-0.5 bg-gray-50">
                <button
                  onClick={() => updateCustomerTypeMutation.mutate("printer")}
                  disabled={updateCustomerTypeMutation.isPending}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    lead.customerType === "printer" ? "bg-blue-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"
                  }`}
                >
                  <Printer className="h-3 w-3" /> Printer
                </button>
                <button
                  onClick={() => updateCustomerTypeMutation.mutate("reseller")}
                  disabled={updateCustomerTypeMutation.isPending}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    lead.customerType === "reseller" ? "bg-amber-600 text-white shadow-sm" : "text-gray-500 hover:bg-white"
                  }`}
                >
                  <Truck className="h-3 w-3" /> Reseller
                </button>
              </div>

              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleEditClick}>
                <Edit className="h-3.5 w-3.5 mr-1" /> Edit
              </Button>

              <Button
                variant="outline" size="sm" className="h-8 text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                onClick={() => setShowDripEnroll(true)}
              >
                <Zap className="h-3.5 w-3.5 mr-1" /> Drip
              </Button>

              {lead.email && (
                <Button
                  variant="outline" size="sm" className="h-8 text-xs border-green-200 text-green-700 hover:bg-green-50"
                  onClick={() => emailComposer.open({
                    to: lead.email || "", customerName: lead.name, usageType: "lead_email",
                    variables: { "lead.name": lead.name, "lead.company": lead.company || "", "lead.email": lead.email || "", "lead.id": String(lead.id) },
                  })}
                >
                  <Mail className="h-3.5 w-3.5 mr-1" /> Email
                </Button>
              )}

              {lead.odooPartnerId ? (
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-green-200 bg-green-50 text-green-700 text-xs font-medium">
                  <CheckCircle className="h-3.5 w-3.5" /> In Odoo
                </span>
              ) : (
                <Button
                  variant="outline" size="sm" className="h-8 text-xs border-violet-200 text-violet-700 hover:bg-violet-50"
                  onClick={() => setShowPushConfirm(true)}
                  disabled={pushToOdooMutation.isPending}
                >
                  {pushToOdooMutation.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Upload className="h-3.5 w-3.5 mr-1" />}
                  Push to Odoo
                </Button>
              )}
            </div>
          </div>

          {/* Name + stage */}
          <div className="flex items-start gap-3 mb-4">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 ${lead.isCompany ? "bg-blue-100" : "bg-gray-100"}`}>
              {lead.isCompany ? <Building2 className="w-4 h-4 text-blue-600" /> : <User className="w-4 h-4 text-gray-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl font-semibold text-gray-900 leading-tight">{lead.name}</h1>
                <Badge className={`${stageInfo.color} border text-[11px] h-5 px-2`}>{stageInfo.label}</Badge>
              </div>
              <p className="text-sm text-gray-500 mt-0.5">
                {lead.jobTitle && <span>{lead.jobTitle}{lead.company ? " · " : ""}</span>}
                {lead.company && <span className="font-medium">{lead.company}</span>}
                {!lead.jobTitle && !lead.company && <span className="italic">No company</span>}
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
            {/* Highlights */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <TrendingUp className="h-3.5 w-3.5" /> Highlights
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <HighlightTile label="Stage" icon={Target}>
                  <div className="flex items-center gap-2">
                    <Badge className={`${stageInfo.color} border text-xs`}>{stageInfo.label}</Badge>
                  </div>
                  <Select value={lead.stage} onValueChange={(v) => updateStageMutation.mutate(v)}>
                    <SelectTrigger className="h-7 text-xs mt-1.5 border-gray-200 bg-gray-50">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(stageConfig).map(([k, v]) => (
                        <SelectItem key={k} value={k} className="text-xs">{v.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </HighlightTile>

                <HighlightTile label="Email addresses" icon={AtSign}>
                  {lead.email ? (
                    <button
                      onClick={() => emailComposer.open({
                        to: lead.email || "", customerName: lead.name, usageType: "lead_email",
                        variables: { "lead.name": lead.name, "lead.company": lead.company || "", "lead.email": lead.email || "", "lead.id": String(lead.id) },
                      })}
                      className="text-blue-600 hover:underline text-sm"
                    >
                      {lead.email}
                    </button>
                  ) : (
                    <span className="text-gray-400 text-sm">No email address</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Phone numbers" icon={Phone}>
                  {lead.phone ? (
                    <a href={`tel:${lead.phone}`} className="text-sm text-gray-700">{lead.phone}</a>
                  ) : lead.mobile ? (
                    <a href={`tel:${lead.mobile}`} className="text-sm text-gray-700">{lead.mobile}</a>
                  ) : (
                    <span className="text-gray-400 text-sm">No phone numbers</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Company" icon={Building2}>
                  {lead.company ? (
                    <p className="text-sm font-medium text-gray-800">{lead.company}</p>
                  ) : (
                    <span className="text-gray-400 text-sm">No company</span>
                  )}
                  {lead.jobTitle && <p className="text-xs text-gray-500 mt-0.5">{lead.jobTitle}</p>}
                </HighlightTile>

                <HighlightTile label="Primary location" icon={MapPin}>
                  {address ? (
                    <div className="flex items-start gap-1">
                      <span className="text-sm text-gray-700 leading-snug">{address}</span>
                      {lead.street && (
                        <PrintLabelButton
                          customer={{
                            id: String(lead.id), company: lead.company,
                            firstName: lead.name?.split(" ")[0] || null, lastName: lead.name?.split(" ").slice(1).join(" ") || null,
                            address1: lead.street, address2: lead.street2, city: lead.city, province: lead.state, zip: lead.zip, country: lead.country,
                          }}
                          leadId={lead.id}
                          variant="icon"
                        />
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400 text-sm">No Primary location</span>
                  )}
                </HighlightTile>

                <HighlightTile label="Sales rep / Tier" icon={User}>
                  <div className="flex items-center gap-1 flex-wrap">
                    {lead.salesRepName ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-200">
                        {lead.salesRepName}
                      </span>
                    ) : <span className="text-gray-400 text-sm">Unassigned</span>}
                    {lead.pricingTier && (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-violet-100 text-violet-800">
                        {lead.pricingTier}
                      </span>
                    )}
                  </div>
                  <Select
                    value={lead.salesRepId || "__none__"}
                    onValueChange={(v) => {
                      const rep = salesReps.find(r => r.id === v);
                      updateSalesRepMutation.mutate({
                        salesRepId: v === "__none__" ? null : v,
                        salesRepName: v === "__none__" ? null : (rep?.name ?? null),
                      });
                    }}
                    disabled={updateSalesRepMutation.isPending}
                  >
                    <SelectTrigger className="h-7 text-xs mt-1.5 border-gray-200 bg-gray-50">
                      <SelectValue placeholder="Assign rep…" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">Unassigned</SelectItem>
                      {salesReps.map(rep => (
                        <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </HighlightTile>
              </div>
            </div>

            {/* Pipeline & Scoring */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <Target className="h-3.5 w-3.5" /> Pipeline & Scoring
              </h2>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Score</p>
                  <p className="text-2xl font-semibold text-gray-900">{lead.score}<span className="text-sm text-gray-400 font-normal">/100</span></p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Probability</p>
                  <p className="text-2xl font-semibold text-gray-900">{lead.probability}<span className="text-sm text-gray-400 font-normal">%</span></p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Expected Revenue</p>
                  <p className="text-lg font-semibold text-gray-900">
                    {lead.expectedRevenue ? `$${parseFloat(lead.expectedRevenue).toLocaleString()}` : "—"}
                  </p>
                </div>
                <div className="border border-gray-200 rounded-lg p-4 bg-white">
                  <p className="text-[11px] font-medium text-gray-400 uppercase tracking-wide mb-1.5">Priority</p>
                  <p className={`text-sm font-semibold ${priorityConfig[lead.priority || "medium"]?.color}`}>
                    {priorityConfig[lead.priority || "medium"]?.label}
                  </p>
                </div>
              </div>
            </div>

            {/* Trust Building */}
            <div>
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                <CheckCircle2 className="h-3.5 w-3.5" /> Trust Building
              </h2>
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {[
                  { label: "Swatchbook Sent", icon: Package, date: lead.swatchbookSentAt },
                  { label: "Sample Sent", icon: Gift, date: lead.sampleSentAt },
                  { label: "Price List Sent", icon: FileText, date: lead.priceListSentAt },
                  { label: "Catalog Sent", icon: FileText, date: lead.catalogSentAt },
                ].map(({ label, icon: Icon, date }) => (
                  <div key={label} className="flex items-center justify-between px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <Icon className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-700">{label}</span>
                    </div>
                    {date ? (
                      <div className="flex items-center gap-1.5 text-green-600">
                        <CheckCircle2 className="w-4 h-4" />
                        <span className="text-xs font-medium">{fmtDate(date)}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Not yet</span>
                    )}
                  </div>
                ))}
                {/* Mailer Sent — count-based coloring */}
                {(() => {
                  const count = lead.mailerSentCount || 0;
                  return (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Truck className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">Mailer Sent</span>
                      </div>
                      {count === 0 ? (
                        <span className="text-xs text-gray-400">Not yet</span>
                      ) : (
                        <div className="flex items-center gap-1.5 text-green-600">
                          <CheckCircle2 className="w-4 h-4" />
                          <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-50 text-green-700">
                            {count} sent
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Emails Sent — count-based coloring */}
                {(() => {
                  const count = allEmails.length;
                  const isGreen = count >= 6;
                  const isYellow = count >= 2 && count < 6;
                  return (
                    <div className="flex items-center justify-between px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <Mail className="w-4 h-4 text-gray-400" />
                        <span className="text-sm text-gray-700">Emails Sent</span>
                      </div>
                      {count === 0 ? (
                        <span className="text-xs text-gray-400">None yet</span>
                      ) : (
                        <div className={`flex items-center gap-1.5 ${isGreen ? "text-green-600" : isYellow ? "text-yellow-600" : "text-gray-500"}`}>
                          {isGreen && <CheckCircle2 className="w-4 h-4" />}
                          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                            isGreen ? "bg-green-50 text-green-700" : isYellow ? "bg-yellow-50 text-yellow-700" : "bg-gray-100 text-gray-600"
                          }`}>
                            {count} sent
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            </div>

            {/* Engagement stats + Drip */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5" /> Engagement
                </h2>
                <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                  {[
                    { label: "Total Touchpoints", value: lead.totalTouchpoints },
                    { label: "First Contact", value: fmtDate(lead.firstContactAt) },
                    { label: "Last Contact", value: fmtDate(lead.lastContactAt) },
                    { label: "Created", value: fmtDate(lead.createdAt) },
                    { label: "Source", value: lead.sourceType?.replace("_", " ") || "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between px-4 py-2.5">
                      <span className="text-sm text-gray-500">{label}</span>
                      <span className="text-sm text-gray-800 font-medium capitalize">{value}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide flex items-center gap-1.5">
                    <Zap className="h-3.5 w-3.5" /> Drip Campaigns
                  </h2>
                  <button
                    onClick={() => setShowDripEnroll(true)}
                    className="text-xs text-amber-700 hover:text-amber-800 font-medium flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> Enroll
                  </button>
                </div>
                <div className="border border-gray-200 rounded-lg bg-white min-h-[120px]">
                  {leadDripAssignments.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-8 text-gray-400">
                      <Zap className="w-7 h-7 mb-1.5 text-gray-200" />
                      <p className="text-xs">No campaigns</p>
                    </div>
                  ) : (
                    <div className="divide-y divide-gray-100">
                      {leadDripAssignments.map((a) => {
                        const statusColors: Record<string, string> = {
                          active: "bg-green-100 text-green-700",
                          completed: "bg-blue-100 text-blue-700",
                          cancelled: "bg-gray-100 text-gray-500",
                          paused: "bg-amber-100 text-amber-700",
                        };
                        return (
                          <div key={a.id} className="flex items-center justify-between px-4 py-2.5">
                            <div>
                              <p className="text-sm font-medium text-gray-700">{a.campaignName}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${statusColors[a.status] || "bg-gray-100 text-gray-500"}`}>
                                  {a.status}
                                </span>
                                <span className="text-xs text-gray-400">{new Date(a.startedAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                              </div>
                            </div>
                            {a.status === "active" && (
                              <button onClick={() => cancelDripMutation.mutate(a.id)} className="text-gray-300 hover:text-red-500 p-0.5">
                                <X className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Description / Internal Notes */}
            {(lead.description || lead.internalNotes) && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {lead.description && (
                  <div className="border border-gray-200 rounded-lg bg-white p-4">
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">Description</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{stripHtml(lead.description)}</p>
                  </div>
                )}
                {lead.internalNotes && (
                  <div className="border border-amber-100 rounded-lg bg-amber-50 p-4">
                    <p className="text-xs font-semibold text-amber-600 uppercase tracking-wide mb-2">Internal Notes</p>
                    <p className="text-sm text-gray-700 whitespace-pre-wrap">{lead.internalNotes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ── ACTIVITY ─────────────────────────────────────────────────────────── */}
        {activeTab === "activity" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">Activity Timeline</h2>
              <Button size="sm" onClick={() => setIsAddActivityOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> Add Activity
              </Button>
            </div>
            {nonNoteActivities.length === 0 ? (
              <EmptyState icon={Activity} title="No activities yet" sub="Log calls, meetings, emails and more" />
            ) : (
              <div className="space-y-3">
                {nonNoteActivities.map((activity) => {
                  const cfg = activityTypeConfig[activity.activityType] || { label: activity.activityType, icon: MessageSquare, color: "bg-gray-100 text-gray-600" };
                  const Icon = cfg.icon;
                  const isGmail = activity.performedBy === "gmail_external";
                  return (
                    <div key={activity.id} className={`border rounded-lg p-4 bg-white flex gap-3 ${isGmail ? "border-blue-100 bg-blue-50/30" : "border-gray-200"}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${isGmail ? "bg-blue-100 text-blue-600" : cfg.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-gray-800">{cfg.label}</span>
                            {isGmail && <Badge variant="outline" className="text-[10px] border-blue-300 text-blue-600 bg-blue-50 h-4">Gmail</Badge>}
                          </div>
                          <span className="text-xs text-gray-400 shrink-0">{relativeTime(activity.createdAt)}</span>
                        </div>
                        <p className="text-sm text-gray-700 mt-0.5">{activity.summary}</p>
                        {activity.details && !isGmail && <p className="text-xs text-gray-500 mt-1">{activity.details}</p>}
                        {activity.performedByName && !isGmail && <p className="text-xs text-gray-400 mt-1">by {activity.performedByName}</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── EMAILS ───────────────────────────────────────────────────────────── */}
        {activeTab === "emails" && (
          <div className="max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wide">
                Emails {allEmails.length > 0 && <span className="normal-case font-normal text-gray-400">({allEmails.length})</span>}
              </h2>
              {lead.email && (
                <Button size="sm" variant="outline" onClick={() => emailComposer.open({
                  to: lead.email || "", customerName: lead.name, usageType: "lead_email",
                  variables: { "lead.name": lead.name, "lead.company": lead.company || "", "lead.email": lead.email || "", "lead.id": String(lead.id) },
                })}>
                  <Plus className="w-4 h-4 mr-1" /> Compose
                </Button>
              )}
            </div>
            {emailsLoading && allEmails.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 rounded-lg" />)}
              </div>
            ) : allEmails.length === 0 ? (
              <EmptyState icon={Mail} title="No emails yet" sub={lead.email ? "Email history will appear here" : "No email address on this lead"} />
            ) : (
              <div className="border border-gray-200 rounded-lg bg-white divide-y divide-gray-100">
                {allEmails.map((email) => (
                  <div key={email.id} className="flex items-start gap-3 px-4 py-3 hover:bg-gray-50 transition-colors">
                    <div className={`mt-0.5 shrink-0 ${email.direction === "inbound" ? "text-blue-500" : "text-gray-400"}`}>
                      {email.direction === "inbound" ? <ArrowDownLeft className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-800 truncate">
                          {email.direction === "inbound" ? ((email as any).fromName || (email as any).fromEmail) : ((email as any).fromName || "You")}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          {(email as any).isDrip && (
                            <span className="text-xs bg-violet-50 text-violet-600 border border-violet-100 rounded px-1.5 py-0.5">Drip</span>
                          )}
                          {(email as any).isFromActivity && (
                            <span className="text-xs bg-blue-50 text-blue-600 border border-blue-100 rounded px-1.5 py-0.5">Gmail</span>
                          )}
                          <span className="text-xs text-gray-400">{relativeTime(email.sentAt)}</span>
                        </div>
                      </div>
                      <p className="text-xs font-medium text-gray-600 truncate mt-0.5">{email.subject || "(no subject)"}</p>
                      {(email as any).snippet && <p className="text-xs text-gray-400 truncate mt-0.5">{(email as any).snippet}</p>}
                    </div>
                  </div>
                ))}
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
              <Button size="sm" variant="outline" onClick={() => setIsNewNoteOpen(true)}>
                <Plus className="w-4 h-4 mr-1" /> New Note
              </Button>
            </div>
            {notes.length === 0 ? (
              <EmptyState icon={StickyNote} title="No notes yet" sub="Add notes to track important information" />
            ) : (
              <div className="space-y-3">
                {notes.map((note) => (
                  <div key={note.id} className="border border-amber-200 rounded-lg bg-amber-50 p-4">
                    <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.summary}</p>
                    {note.details && <p className="text-xs text-gray-500 mt-1">{note.details}</p>}
                    <div className="flex items-center justify-between mt-2 text-xs text-gray-400">
                      <span>{note.performedByName || "Unknown"}</span>
                      <span>{relativeTime(note.createdAt)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── TASKS ────────────────────────────────────────────────────────────── */}
        {activeTab === "tasks" && (
          <div className="max-w-3xl">
            <EmptyState icon={CheckSquare} title="No tasks yet" sub="Tasks assigned to this lead will appear here" />
          </div>
        )}

        {/* ── FILES ────────────────────────────────────────────────────────────── */}
        {activeTab === "files" && (
          <div className="max-w-3xl">
            <EmptyState icon={FolderOpen} title="No files attached" sub="Files attached to this lead will appear here" />
          </div>
        )}
      </div>

      {/* ── Floating Log button ───────────────────────────────────────────────── */}
      <div className="sticky bottom-4 flex justify-end pr-6 pointer-events-none">
        <button
          className="pointer-events-auto bg-gray-900 text-white text-sm font-medium px-4 py-2.5 rounded-full shadow-lg hover:bg-gray-700 transition-colors"
          onClick={() => { setNewActivity({ activityType: "call_made", summary: "", details: "" }); setIsAddActivityOpen(true); }}
        >
          + Log interaction
        </button>
      </div>

      {/* ── Dialogs ───────────────────────────────────────────────────────────── */}

      {/* Add Activity */}
      <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Log Activity</DialogTitle></DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Activity Type</Label>
              <Select value={newActivity.activityType} onValueChange={(v) => setNewActivity(p => ({ ...p, activityType: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="note">Note</SelectItem>
                  <SelectItem value="email_sent">Email Sent</SelectItem>
                  <SelectItem value="call_made">Call Made</SelectItem>
                  <SelectItem value="meeting">Meeting</SelectItem>
                  <SelectItem value="sample_sent">Sample Sent</SelectItem>
                  <SelectItem value="quote_sent">Quote Sent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Summary *</Label>
              <Input placeholder="Brief summary" value={newActivity.summary} onChange={(e) => setNewActivity(p => ({ ...p, summary: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Details</Label>
              <Textarea placeholder="Additional details..." value={newActivity.details} onChange={(e) => setNewActivity(p => ({ ...p, details: e.target.value }))} rows={4} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddActivityOpen(false)}>Cancel</Button>
            <Button onClick={() => addActivityMutation.mutate(newActivity)} disabled={!newActivity.summary.trim() || addActivityMutation.isPending}>
              {addActivityMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Log Activity
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Note */}
      <Dialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Add Note</DialogTitle></DialogHeader>
          <div className="py-4">
            <Textarea placeholder="Enter your note..." value={newNoteText} onChange={(e) => setNewNoteText(e.target.value)} rows={4} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewNoteOpen(false)}>Cancel</Button>
            <Button onClick={() => addNoteMutation.mutate(newNoteText)} disabled={!newNoteText.trim() || addNoteMutation.isPending}>
              {addNoteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drip Campaign Enrollment */}
      <Dialog open={showDripEnroll} onOpenChange={setShowDripEnroll}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="w-5 h-5 text-amber-500" /> Enroll in Drip Campaign
            </DialogTitle>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <p className="text-sm text-gray-600">
              Select a campaign for <span className="font-medium">{lead?.name}</span>.
            </p>
            {dripCampaigns.filter(c => c.isActive).length === 0 ? (
              <div className="text-center py-6 text-gray-400">
                <Zap className="w-10 h-10 mx-auto mb-2 text-gray-200" />
                <p className="text-sm">No active campaigns available.</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {dripCampaigns.filter(c => c.isActive).map((campaign) => (
                  <button
                    key={campaign.id}
                    onClick={() => setSelectedDripCampaignId(String(campaign.id))}
                    className={`w-full text-left p-3 rounded-lg border transition-colors ${
                      selectedDripCampaignId === String(campaign.id) ? "border-amber-400 bg-amber-50" : "border-gray-200 bg-white hover:border-amber-200"
                    }`}
                  >
                    <p className="text-sm font-medium text-gray-800">{campaign.name}</p>
                    {campaign.description && <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">{campaign.description}</p>}
                  </button>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowDripEnroll(false); setSelectedDripCampaignId(""); }}>Cancel</Button>
            <Button
              className="bg-amber-600 hover:bg-amber-700 text-white"
              disabled={!selectedDripCampaignId || enrollDripMutation.isPending}
              onClick={() => enrollDripMutation.mutate(Number(selectedDripCampaignId))}
            >
              {enrollDripMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
              Start Campaign
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Lead */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader><DialogTitle>Edit Lead</DialogTitle></DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input value={editForm.name || ""} onChange={(e) => setEditForm(p => ({ ...p, name: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input value={editForm.company || ""} onChange={(e) => setEditForm(p => ({ ...p, company: e.target.value }))} />
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
              <Label>Mobile</Label>
              <Input value={editForm.mobile || ""} onChange={(e) => setEditForm(p => ({ ...p, mobile: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input value={editForm.jobTitle || ""} onChange={(e) => setEditForm(p => ({ ...p, jobTitle: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input value={editForm.website || ""} onChange={(e) => setEditForm(p => ({ ...p, website: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editForm.priority || "medium"} onValueChange={(v) => setEditForm(p => ({ ...p, priority: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Pricing Tier</Label>
              <Select value={editForm.pricingTier || "__none__"} onValueChange={(v) => setEditForm(p => ({ ...p, pricingTier: v === "__none__" ? null : v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Not set</SelectItem>
                  {PRICING_TIERS.map(tier => <SelectItem key={tier} value={tier}>{tier}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Sales Rep</Label>
              <Select
                value={editForm.salesRepId || "__none__"}
                onValueChange={(v) => setEditForm(p => ({ ...p, salesRepId: v === "__none__" ? null : v, salesRepName: salesReps.find(r => r.id === v)?.name || p.salesRepName }))}
              >
                <SelectTrigger><SelectValue placeholder="Assign rep..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Unassigned</SelectItem>
                  {salesReps.map(rep => <SelectItem key={rep.id} value={rep.id}>{rep.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Street Address</Label>
              <Input value={editForm.street || ""} onChange={(e) => setEditForm(p => ({ ...p, street: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input value={editForm.city || ""} onChange={(e) => setEditForm(p => ({ ...p, city: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>State/Province</Label>
              <Input value={editForm.state || ""} onChange={(e) => setEditForm(p => ({ ...p, state: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>ZIP/Postal Code</Label>
              <Input value={editForm.zip || ""} onChange={(e) => setEditForm(p => ({ ...p, zip: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input value={editForm.country || ""} onChange={(e) => setEditForm(p => ({ ...p, country: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Expected Revenue ($)</Label>
              <Input type="number" value={editForm.expectedRevenue || ""} onChange={(e) => setEditForm(p => ({ ...p, expectedRevenue: e.target.value }))} />
            </div>
            <div className="space-y-2">
              <Label>Probability (%)</Label>
              <Input type="number" min={0} max={100} value={editForm.probability || 10} onChange={(e) => setEditForm(p => ({ ...p, probability: parseInt(e.target.value) || 10 }))} />
            </div>
            <div className="space-y-2">
              <Label>Preferred Contact</Label>
              <Select value={editForm.preferredContact || ""} onValueChange={(v) => setEditForm(p => ({ ...p, preferredContact: v }))}>
                <SelectTrigger><SelectValue placeholder="Select..." /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Best Time to Call</Label>
              <Input placeholder="e.g., 9am-12pm PST" value={editForm.bestTimeToCall || ""} onChange={(e) => setEditForm(p => ({ ...p, bestTimeToCall: e.target.value }))} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea value={editForm.description || ""} onChange={(e) => setEditForm(p => ({ ...p, description: e.target.value }))} rows={3} />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Internal Notes</Label>
              <Textarea placeholder="Notes visible only to your team..." value={editForm.internalNotes || ""} onChange={(e) => setEditForm(p => ({ ...p, internalNotes: e.target.value }))} rows={3} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button onClick={() => updateLeadMutation.mutate(editForm)} disabled={!editForm.name?.trim() || updateLeadMutation.isPending}>
              {updateLeadMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Push to Odoo Confirmation */}
      <AlertDialog open={showPushConfirm} onOpenChange={setShowPushConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Push to Odoo and convert to Contact?</AlertDialogTitle>
            <AlertDialogDescription>
              This will create {lead?.name} as a Contact in Odoo and move them out of Leads permanently. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { setShowPushConfirm(false); pushToOdooMutation.mutate(); }}
              className="bg-purple-600 hover:bg-purple-700 text-white"
            >
              Yes, push to Odoo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

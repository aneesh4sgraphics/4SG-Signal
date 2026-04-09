import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { useEmailComposer } from "@/components/email-composer";
import BulkEmailComposer from "@/components/BulkEmailComposer";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Search,
  Plus,
  RefreshCw,
  User,
  Building2,
  Mail,
  Phone,
  MapPin,
  Globe,
  Sparkles,
  Target,
  TrendingUp,
  Users,
  Package,
  Calendar,
  Star,
  MessageSquare,
  ArrowRight,
  Loader2,
  Filter,
  LayoutGrid,
  List,
  ChevronDown,
  ShoppingBag,
  UserMinus,
  CheckCircle2,
  Clock,
  XCircle,
  CalendarCheck,
  Columns,
  BarChart3,
  Send,
  GripVertical,
  SlidersHorizontal,
  ArrowUpDown,
  Check,
  X,
  Printer,
  Upload,
  CheckCircle,
  Zap,
  Camera,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PrintLabelButton, useLabelQueue, CustomerAddress } from "@/components/PrintLabelButton";
import ScreenshotImportModal from "@/components/ScreenshotImportModal";
import { motion, AnimatePresence } from "framer-motion";
import { SiOdoo, SiShopify } from "react-icons/si";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
  firstEmailSentAt: string | null;
  firstEmailReplyAt: string | null;
  swatchbookSentAt: string | null;
  sampleSentAt: string | null;
  priceListSentAt: string | null;
  catalogSentAt: string | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  totalTouchpoints: number;
  salesRepId: string | null;
  salesRepName: string | null;
  tags: string | null;
  description: string | null;
  createdAt: string;
  updatedAt: string;
  // Origin tracking (for leads converted from contacts)
  existsInOdooAsContact: boolean | null;
  existsInShopify: boolean | null;
  sourceContactOdooPartnerId: number | null;
  // Company/Contact relationship (like HubSpot/Pipedrive)
  isCompany: boolean | null;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  // Odoo push tracking
  odooPartnerId: number | null;
}

interface LeadStats {
  total: number;
  byStage: Record<string, number>;
}

const STAGES = [
  { value: 'new', label: 'New', color: 'bg-blue-100 text-blue-700' },
  { value: 'contacted', label: 'Contacted', color: 'bg-purple-100 text-purple-700' },
  { value: 'qualified', label: 'Qualified', color: 'bg-green-100 text-green-700' },
  { value: 'nurturing', label: 'Nurturing', color: 'bg-amber-100 text-amber-700' },
  { value: 'contact_later', label: 'Contact Later', color: 'bg-orange-100 text-orange-700' },
  { value: 'not_a_fit', label: 'Not a Fit', color: 'bg-slate-100 text-slate-600' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600' },
];

function getLeadHealth(lead: { pricingTier: string | null; street: string | null; city: string | null; phone: string | null; mobile: string | null; email: string | null }): { missing: string[]; isRed: boolean } {
  const missing: string[] = [];
  if (!lead.pricingTier) missing.push('No tier');
  if (!lead.street && !lead.city) missing.push('No address');
  if (!lead.phone && !lead.mobile) missing.push('No phone');
  if (!lead.email) missing.push('No email');
  return { missing, isRed: missing.length >= 2 };
}

export default function LeadsPage() {
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const emailComposer = useEmailComposer();
  
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [stateFilter, setStateFilter] = useState<string>('all');
  const [sourceFilter, setSourceFilter] = useState<string>('all');
  const [tagFilter, setTagFilter] = useState<string>('all');
  const [filterIncomplete, setFilterIncomplete] = useState(false);
  const [hasEmail, setHasEmail] = useState<boolean | null>(null);
  const [hasWebsite, setHasWebsite] = useState<boolean | null>(null);
  const [hasPhone, setHasPhone] = useState<boolean | null>(null);
  const [hasAddress, setHasAddress] = useState<boolean | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'list' | 'kanban' | 'funnel'>('cards');
  const [sortField, setSortField] = useState<'name' | 'company' | 'state' | 'createdAt'>('createdAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');
  const [currentPage, setCurrentPage] = useState(1);
  const leadsPerPage = 50;
  const [selectedLeads, setSelectedLeads] = useState<Set<number>>(new Set());

  let labelQueue: ReturnType<typeof useLabelQueue> | null = null;
  try { labelQueue = useLabelQueue(); } catch { labelQueue = null; }

  const LEAD_COLUMNS = [
    { key: 'name', label: 'Name', alwaysVisible: true },
    { key: 'company', label: 'Company' },
    { key: 'email', label: 'Email' },
    { key: 'stage', label: 'Stage' },
    { key: 'priority', label: 'Priority' },
    { key: 'origin', label: 'Origin' },
    { key: 'primaryContact', label: 'Primary Contact' },
    { key: 'touchpoints', label: 'Touchpoints' },
    { key: 'score', label: 'Score' },
    { key: 'salesRep', label: 'Sales Rep' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'createdAt', label: 'Created' },
  ] as const;

  const [visibleLeadColumns, setVisibleLeadColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('leads-visible-columns');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { name: true, company: true, email: true, stage: true, priority: true, origin: true, primaryContact: true, touchpoints: true, score: true, salesRep: true };
  });

  const toggleLeadColumn = (key: string) => {
    setVisibleLeadColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('leads-visible-columns', JSON.stringify(next));
      return next;
    });
  };
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showScreenshotImport, setShowScreenshotImport] = useState(false);
  const [importStatus, setImportStatus] = useState<{ message: string; progress: number } | null>(null);
  const [showBulkDrip, setShowBulkDrip] = useState(false);
  const [showBulkEmail, setShowBulkEmail] = useState(false);
  const [selectedBulkDripCampaignId, setSelectedBulkDripCampaignId] = useState<string>('');
  const [showMondayReview, setShowMondayReview] = useState(false);
  const [mondayReviewDismissed, setMondayReviewDismissed] = useState(() => {
    // Only keep the dismissal if it happened during *this* Monday (00:00 onward).
    // A rolling 7-day window caused the dialog to stay hidden into the next Monday
    // when users had dismissed it in the afternoon the previous week.
    const dismissed = localStorage.getItem('mondayReviewDismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      // Compute start of this Monday at midnight local time
      const dayOfWeek = now.getDay(); // 0=Sun, 1=Mon, …
      const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
      const thisMonday = new Date(now);
      thisMonday.setDate(now.getDate() - daysFromMonday);
      thisMonday.setHours(0, 0, 0, 0);
      // Still dismissed only if the user closed it earlier today (this Monday)
      return dismissedDate >= thisMonday;
    }
    return false;
  });
  const [newLead, setNewLead] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    description: '',
  });

  const { data: conflictEmailsData } = useQuery<{ emails: string[] }>({
    queryKey: ['/api/admin/email-conflict-emails'],
    staleTime: 60 * 1000,
  });
  const conflictEmailSet = new Set<string>(conflictEmailsData?.emails ?? []);

  const { data: leadsData, isLoading, refetch } = useQuery<{ leads: Lead[]; total: number }>({
    queryKey: ['/api/leads', { stage: stageFilter, search }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (stageFilter !== 'all') params.set('stage', stageFilter);
      if (search) params.set('search', search);
      params.set('limit', '100');
      const res = await fetch(`/api/leads?${params.toString()}`, { credentials: 'include' });
      return res.json();
    },
  });

  const { data: stats } = useQuery<LeadStats>({
    queryKey: ['/api/leads/stats'],
  });

  // Query for leads that need Monday morning review (active leads from last week)
  const { data: reviewLeads, isLoading: isLoadingReview } = useQuery<Lead[]>({
    queryKey: ['/api/leads/needs-review'],
    queryFn: async () => {
      const res = await fetch('/api/leads/needs-review', { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      return data.leads || [];
    },
    enabled: !mondayReviewDismissed,
  });

  // Check if it's Monday and show the review dialog
  const isMonday = new Date().getDay() === 1;
  const hasLeadsToReview = reviewLeads && reviewLeads.length > 0;

  // Auto-show Monday review dialog if conditions are met
  useEffect(() => {
    if (isMonday && hasLeadsToReview && !mondayReviewDismissed) {
      setShowMondayReview(true);
    }
  }, [isMonday, hasLeadsToReview, mondayReviewDismissed]);

  // Drip campaign queries and mutations
  const { data: dripCampaigns = [] } = useQuery<{ id: number; name: string; description: string | null; isActive: boolean }[]>({
    queryKey: ['/api/drip-campaigns'],
    staleTime: 5 * 60 * 1000,
    enabled: showBulkDrip,
  });

  const bulkEnrollDripMutation = useMutation({
    mutationFn: async ({ campaignId, leadIds }: { campaignId: number; leadIds: number[] }) => {
      const res = await apiRequest('POST', `/api/drip-campaigns/${campaignId}/assignments`, { leadIds });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Enrollment failed');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: `${data.created} lead${data.created !== 1 ? 's' : ''} enrolled`,
        description: data.created > 0 ? 'Drip campaign started for selected leads.' : 'All selected leads are already in this campaign.',
      });
      setShowBulkDrip(false);
      setSelectedBulkDripCampaignId('');
      setSelectedLeads(new Set());
    },
    onError: (error: Error) => {
      toast({ title: 'Enrollment failed', description: error.message, variant: 'destructive' });
    },
  });

  // Mutation to update lead stage for quick review actions
  const updateLeadStageMutation = useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: number; stage: string }) => {
      const res = await apiRequest('PUT', `/api/leads/${leadId}`, { stage });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/needs-review'] });
    },
  });

  const handleDismissMondayReview = () => {
    setShowMondayReview(false);
    setMondayReviewDismissed(true);
    localStorage.setItem('mondayReviewDismissed', new Date().toISOString());
  };

  const importMutation = useMutation({
    mutationFn: async () => {
      setImportStatus({ message: 'Connecting to Odoo CRM Leads module...', progress: 10 });
      await new Promise(r => setTimeout(r, 500));
      setImportStatus({ message: 'Fetching leads from Odoo...', progress: 30 });
      const res = await apiRequest('POST', '/api/leads/import-from-odoo');
      setImportStatus({ message: 'Processing lead records...', progress: 70 });
      const data = await res.json();
      setImportStatus({ message: 'Finalizing import...', progress: 90 });
      await new Promise(r => setTimeout(r, 300));
      return data;
    },
    onSuccess: (data) => {
      setImportStatus({ message: 'Import complete!', progress: 100 });
      setTimeout(() => setImportStatus(null), 2000);
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      
      const parts = [];
      parts.push(`${data.imported} new leads imported`);
      if (data.updated > 0) parts.push(`${data.updated} updated`);
      if (data.skippedExistingCustomer > 0) parts.push(`${data.skippedExistingCustomer} skipped (already in Contacts)`);
      
      toast({
        title: 'Import Complete',
        description: parts.join(', ') + '. Sales reps auto-assigned by location.',
      });
    },
    onError: (error: any) => {
      setImportStatus(null);
      toast({
        title: 'Import Failed',
        description: error.message || 'Could not import leads from Odoo',
        variant: 'destructive',
      });
    },
  });

  const createMutation = useMutation({
    mutationFn: async (data: typeof newLead) => {
      const res = await apiRequest('POST', '/api/leads', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      setShowCreateDialog(false);
      setNewLead({ name: '', email: '', phone: '', company: '', description: '' });
      toast({ title: 'Lead Created', description: 'New lead added successfully' });
    },
    onError: (error: any) => {
      if (error.status === 409 || error.message?.includes('duplicate')) {
        const data = error.data || {};
        toast({
          title: 'Duplicate lead',
          description: data.message || 'A lead or contact with this email already exists.',
          variant: 'destructive',
        });
      } else {
        toast({ title: 'Failed to create lead', description: error.message, variant: 'destructive' });
      }
    },
  });

  // Mutation for converting $0 spending contacts to leads
  const convertZeroSpendingMutation = useMutation({
    mutationFn: async () => {
      setImportStatus({ message: 'Finding contacts with $0 spending...', progress: 20 });
      await new Promise(r => setTimeout(r, 300));
      setImportStatus({ message: 'Converting contacts to leads...', progress: 50 });
      const res = await apiRequest('POST', '/api/leads/convert-zero-spending-contacts');
      setImportStatus({ message: 'Processing conversions...', progress: 80 });
      const data = await res.json();
      setImportStatus({ message: 'Conversion complete!', progress: 100 });
      await new Promise(r => setTimeout(r, 300));
      return data;
    },
    onSuccess: (data) => {
      setTimeout(() => setImportStatus(null), 2000);
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      
      toast({
        title: 'Conversion Complete',
        description: `Converted ${data.converted} contacts to leads (${data.skipped} skipped as duplicates)`,
      });
    },
    onError: (error: any) => {
      setImportStatus(null);
      toast({
        title: 'Conversion Failed',
        description: error.message || 'Could not convert contacts to leads',
        variant: 'destructive',
      });
    },
  });

  const allLeads = leadsData?.leads || [];
  const uniqueStates = Array.from(new Set(allLeads.map(l => l.state).filter(Boolean) as string[])).sort();
  const uniqueSources = Array.from(new Set(allLeads.map(l => l.sourceType).filter(Boolean) as string[])).sort();
  const uniqueTags = Array.from(new Set(
    allLeads.flatMap(l => l.tags ? l.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [])
  )).sort();

  const SOURCE_LABELS: Record<string, string> = {
    odoo: 'Odoo',
    manual: 'Manual',
    converted_contact: 'Converted Contact',
    lusha: 'Lusha',
  };

  const leads = allLeads.filter(l => {
    if (stateFilter !== 'all' && l.state !== stateFilter) return false;
    if (sourceFilter !== 'all' && l.sourceType !== sourceFilter) return false;
    if (tagFilter !== 'all' && !l.tags?.split(',').map((t: string) => t.trim()).includes(tagFilter)) return false;
    if (hasEmail === true && !l.email) return false;
    if (hasEmail === false && l.email) return false;
    if (hasWebsite === true && !l.website) return false;
    if (hasWebsite === false && l.website) return false;
    if (hasPhone === true && !l.phone && !l.mobile) return false;
    if (hasPhone === false && (l.phone || l.mobile)) return false;
    if (hasAddress === true && !l.street && !l.city) return false;
    if (hasAddress === false && (l.street || l.city)) return false;
    return true;
  }).sort((a, b) => {
    let aVal: string | number, bVal: string | number;
    switch (sortField) {
      case 'name':
        aVal = (a.name || '').toLowerCase();
        bVal = (b.name || '').toLowerCase();
        break;
      case 'company':
        aVal = (a.company || '').toLowerCase();
        bVal = (b.company || '').toLowerCase();
        break;
      case 'state':
        aVal = (a.state || '').toLowerCase();
        bVal = (b.state || '').toLowerCase();
        break;
      case 'createdAt':
        aVal = new Date(a.createdAt || 0).getTime();
        bVal = new Date(b.createdAt || 0).getTime();
        break;
      default:
        aVal = '';
        bVal = '';
    }
    if (sortOrder === 'asc') return aVal > bVal ? 1 : aVal < bVal ? -1 : 0;
    return aVal < bVal ? 1 : aVal > bVal ? -1 : 0;
  }).filter(lead => filterIncomplete ? getLeadHealth(lead).missing.length > 0 : true);

  const totalPages = Math.ceil(leads.length / leadsPerPage);
  const paginatedLeads = leads.slice((currentPage - 1) * leadsPerPage, currentPage * leadsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [search, stageFilter, stateFilter, sourceFilter, tagFilter, hasEmail, hasWebsite, hasPhone, hasAddress, sortField, sortOrder]);

  const activeLeadFilters = [
    stageFilter !== 'all' ? 1 : 0,
    stateFilter !== 'all' ? 1 : 0,
    sourceFilter !== 'all' ? 1 : 0,
    tagFilter !== 'all' ? 1 : 0,
    hasEmail !== null ? 1 : 0,
    hasWebsite !== null ? 1 : 0,
    hasPhone !== null ? 1 : 0,
    hasAddress !== null ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearLeadFilters = () => {
    setStageFilter('all');
    setStateFilter('all');
    setSourceFilter('all');
    setTagFilter('all');
    setHasEmail(null);
    setHasWebsite(null);
    setHasPhone(null);
    setHasAddress(null);
  };

  const getStageInfo = (stage: string) => STAGES.find(s => s.value === stage) || STAGES[0];
  const getPriorityInfo = (priority: string | null) => PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];

  const getTrustBuildingProgress = (lead: Lead) => {
    const items = [
      { sent: !!lead.firstEmailSentAt, label: 'Email Sent' },
      { sent: !!lead.firstEmailReplyAt, label: 'Reply Received' },
      { sent: !!lead.swatchbookSentAt, label: 'SwatchBook' },
      { sent: !!lead.sampleSentAt, label: 'Samples' },
      { sent: !!lead.priceListSentAt, label: 'Price List' },
      { sent: !!lead.catalogSentAt, label: 'Catalog' },
      { sent: (lead.mailerSentCount ?? 0) > 0, label: 'Mailer' },
    ];
    const sentCount = items.filter(i => i.sent).length;
    return { items, sentCount, total: items.length };
  };

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#FDFBF7' }}>
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800 flex items-center gap-2">
              <Target className="w-6 h-6 text-purple-500" />
              Leads
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Prospects with no business history - build trust and convert to customers
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => importMutation.mutate()}
              disabled={importMutation.isPending || convertZeroSpendingMutation.isPending}
              className="gap-2"
            >
              {importMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <SiOdoo className="w-4 h-4" />
              )}
              Import from Odoo
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => convertZeroSpendingMutation.mutate()}
              disabled={importMutation.isPending || convertZeroSpendingMutation.isPending}
              className="gap-2 border-amber-300 text-amber-700 hover:bg-amber-50"
            >
              {convertZeroSpendingMutation.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <UserMinus className="w-4 h-4" />
              )}
              Move $0 Contacts
            </Button>
            {hasLeadsToReview && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowMondayReview(true)}
                className="gap-2 border-amber-200 text-amber-700 hover:bg-amber-50"
              >
                <CalendarCheck className="w-4 h-4" />
                Weekly Review ({reviewLeads?.length || 0})
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              Refresh
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowScreenshotImport(true)}
              className="gap-2"
              title="Import lead from screenshot"
            >
              <Camera className="w-4 h-4" />
              From Screenshot
            </Button>
            <Button
              size="sm"
              onClick={() => setShowCreateDialog(true)}
              className="gap-2 bg-purple-600 hover:bg-purple-700"
            >
              <Plus className="w-4 h-4" />
              Add Lead
            </Button>
          </div>
        </div>

        {/* Import Progress Bar */}
        {importStatus && (
          <Card className="mb-6 border-purple-200 bg-gradient-to-r from-purple-50 to-blue-50">
            <CardContent className="py-4">
              <div className="flex items-center gap-3 mb-2">
                <Loader2 className="w-5 h-5 animate-spin text-purple-600" />
                <span className="text-sm font-medium text-purple-700">{importStatus.message}</span>
              </div>
              <Progress value={importStatus.progress} className="h-2" />
              <p className="text-xs text-slate-500 mt-2">
                Syncing from Odoo CRM Leads module (crm.lead) - not Contacts
              </p>
            </CardContent>
          </Card>
        )}

        {/* Stats Cards */}
        <div className="grid grid-cols-4 md:grid-cols-7 gap-3 mb-6">
          {STAGES.map(stage => (
            <Card 
              key={stage.value}
              className={`cursor-pointer transition-all hover:shadow-md ${stageFilter === stage.value ? 'ring-2 ring-purple-400' : ''}`}
              onClick={() => setStageFilter(stageFilter === stage.value ? 'all' : stage.value)}
              style={{ backgroundColor: 'rgba(255,255,255,0.8)', backdropFilter: 'blur(8px)' }}
            >
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${stage.color}`}>
                    {stage.label}
                  </span>
                  <span className="text-2xl font-bold text-slate-700">
                    {stats?.byStage?.[stage.value] || 0}
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filters Row */}
        <div className="flex flex-col gap-2 mb-6">
          <div className="relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search leads by name, company, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white/80 border-slate-200 w-full"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
          <Select value={stageFilter} onValueChange={setStageFilter}>
            <SelectTrigger className="w-40 bg-white/80">
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGES.map(s => (
                <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={stateFilter} onValueChange={setStateFilter}>
            <SelectTrigger className="w-40 bg-white/80">
              <SelectValue placeholder="All States" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All States</SelectItem>
              {uniqueStates.map(s => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={sourceFilter} onValueChange={setSourceFilter}>
            <SelectTrigger className="w-36 bg-white/80">
              <SelectValue placeholder="All Sources" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Sources</SelectItem>
              {uniqueSources.map(s => (
                <SelectItem key={s} value={s}>{SOURCE_LABELS[s] || s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {uniqueTags.length > 0 && (
            <Select value={tagFilter} onValueChange={setTagFilter}>
              <SelectTrigger className="w-44 bg-white/80">
                <SelectValue placeholder="All Tags" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tags</SelectItem>
                {uniqueTags.map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
          <button
            onClick={() => setFilterIncomplete(f => !f)}
            className={`text-sm px-3 py-1.5 rounded-md border font-medium transition-colors ${filterIncomplete ? 'bg-red-50 border-red-300 text-red-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
          >
            {filterIncomplete ? 'Showing incomplete' : 'Incomplete only'}
          </button>
          <Select
            value={hasEmail === null ? 'all' : hasEmail ? 'yes' : 'no'}
            onValueChange={(v) => setHasEmail(v === 'all' ? null : v === 'yes')}
          >
            <SelectTrigger className="w-36 bg-white/80">
              <SelectValue placeholder="Email" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Email</SelectItem>
              <SelectItem value="yes">Has Email</SelectItem>
              <SelectItem value="no">No Email</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={hasWebsite === null ? 'all' : hasWebsite ? 'yes' : 'no'}
            onValueChange={(v) => setHasWebsite(v === 'all' ? null : v === 'yes')}
          >
            <SelectTrigger className="w-36 bg-white/80">
              <SelectValue placeholder="Website" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Website</SelectItem>
              <SelectItem value="yes">Has Website</SelectItem>
              <SelectItem value="no">No Website</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={hasPhone === null ? 'all' : hasPhone ? 'yes' : 'no'}
            onValueChange={(v) => setHasPhone(v === 'all' ? null : v === 'yes')}
          >
            <SelectTrigger className="w-36 bg-white/80">
              <SelectValue placeholder="Phone" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Phone</SelectItem>
              <SelectItem value="yes">Has Phone</SelectItem>
              <SelectItem value="no">No Phone</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={hasAddress === null ? 'all' : hasAddress ? 'yes' : 'no'}
            onValueChange={(v) => setHasAddress(v === 'all' ? null : v === 'yes')}
          >
            <SelectTrigger className="w-36 bg-white/80">
              <SelectValue placeholder="Address" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Any Address</SelectItem>
              <SelectItem value="yes">Has Address</SelectItem>
              <SelectItem value="no">No Address</SelectItem>
            </SelectContent>
          </Select>
          {activeLeadFilters > 0 && (
            <Button variant="ghost" size="sm" onClick={clearLeadFilters} className="text-gray-500">
              <X className="w-4 h-4 mr-1" />
              Clear ({activeLeadFilters})
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2 bg-white/80">
                <ArrowUpDown className="w-4 h-4" />
                Sort
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onClick={() => { setSortField('createdAt'); setSortOrder('desc'); }}>
                Recently Created
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('name'); setSortOrder('asc'); }}>
                Name A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('name'); setSortOrder('desc'); }}>
                Name Z-A
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('company'); setSortOrder('asc'); }}>
                Company A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('state'); setSortOrder('asc'); }}>
                State A-Z
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => { setSortField('state'); setSortOrder('desc'); }}>
                State Z-A
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          {viewMode === 'list' && (
            <Popover>
              <PopoverTrigger asChild>
                <Button variant="outline" size="sm" className="gap-2 bg-white/80">
                  <SlidersHorizontal className="w-4 h-4" />
                  Columns
                </Button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-52 p-2">
                <p className="text-xs font-medium text-gray-500 uppercase px-2 py-1.5">Toggle Columns</p>
                {LEAD_COLUMNS.map(col => (
                  <label
                    key={col.key}
                    className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-50 ${
                      'alwaysVisible' in col && col.alwaysVisible ? 'opacity-50 pointer-events-none' : ''
                    }`}
                  >
                    <Checkbox
                      checked={!!visibleLeadColumns[col.key] || ('alwaysVisible' in col && !!col.alwaysVisible)}
                      onCheckedChange={() => !('alwaysVisible' in col && col.alwaysVisible) && toggleLeadColumn(col.key)}
                      disabled={'alwaysVisible' in col && !!col.alwaysVisible}
                    />
                    {col.label}
                  </label>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <div className="flex border rounded-md bg-white/80">
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="rounded-r-none"
              title="Card View"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-none border-l"
              title="List View"
            >
              <List className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'kanban' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              className="rounded-none border-l"
              title="Kanban View"
            >
              <Columns className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'funnel' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('funnel')}
              className="rounded-l-none border-l"
              title="Funnel View"
            >
              <BarChart3 className="w-4 h-4" />
            </Button>
          </div>
            </div>
        </div>

        {/* Multi-select bar */}
        <AnimatePresence>
          {selectedLeads.size > 0 && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-violet-50 rounded-lg border border-violet-200 mb-4 overflow-hidden"
            >
              <div className="px-4 py-3">
                <div className="flex items-center gap-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                    <Check className="w-4 h-4" />
                    {selectedLeads.size} selected
                  </div>
                  <div className="h-4 w-px bg-violet-300" />
                  {labelQueue && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="gap-2 bg-white"
                      onClick={() => {
                        const items = paginatedLeads
                          .filter(l => selectedLeads.has(l.id))
                          .filter(l => l.street || l.city)
                          .map(l => ({
                            customer: {
                              id: `lead-${l.id}`,
                              company: l.company,
                              firstName: l.name?.split(' ')[0] || null,
                              lastName: l.name?.split(' ').slice(1).join(' ') || null,
                              address1: l.street,
                              address2: l.street2,
                              city: l.city,
                              province: l.state,
                              zip: l.zip,
                              country: l.country,
                            } as CustomerAddress,
                            leadId: l.id,
                          }));
                        if (items.length === 0) {
                          toast({ title: 'No addresses available', description: 'None of the selected leads have addresses on file.', variant: 'destructive' });
                          return;
                        }
                        labelQueue!.addBulkToQueueAndOpen(items);
                        toast({ title: `${items.length} address${items.length !== 1 ? 'es' : ''} added to label queue` });
                      }}
                    >
                      <Printer className="w-4 h-4" />
                      Print Address Labels
                    </Button>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white border-amber-300 text-amber-700 hover:bg-amber-50"
                    onClick={() => setShowBulkDrip(true)}
                  >
                    <Zap className="w-4 h-4" />
                    Drip Campaign
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white border-green-300 text-green-700 hover:bg-green-50"
                    onClick={() => setShowBulkEmail(true)}
                  >
                    <Mail className="w-4 h-4" />
                    Send Email
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white border-violet-300 text-violet-700 hover:bg-violet-50"
                    onClick={async () => {
                      const unpushed = paginatedLeads
                        .filter(l => selectedLeads.has(l.id) && !l.odooPartnerId)
                        .map(l => l.id);
                      if (unpushed.length === 0) {
                        toast({ title: 'Already in Odoo', description: 'All selected leads have already been pushed to Odoo.' });
                        return;
                      }
                      try {
                        const res = await apiRequest('POST', '/api/leads/push-to-odoo-bulk', { leadIds: unpushed });
                        const data = await res.json();
                        queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
                        queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
                        toast({
                          title: `${data.pushed} contact${data.pushed !== 1 ? 's' : ''} moved to Contacts`,
                          description: [
                            data.pushed > 0 ? `Created in Odoo and added to Contacts page` : null,
                            data.skipped > 0 ? `${data.skipped} already pushed` : null,
                            data.failed > 0 ? `${data.failed} failed` : null,
                          ].filter(Boolean).join(' · ') || undefined,
                        });
                      } catch (e: any) {
                        toast({ title: 'Push failed', description: e.message, variant: 'destructive' });
                      }
                    }}
                  >
                    <Upload className="w-4 h-4" />
                    Push {paginatedLeads.filter(l => selectedLeads.has(l.id) && !l.odooPartnerId).length > 0
                      ? `${paginatedLeads.filter(l => selectedLeads.has(l.id) && !l.odooPartnerId).length} `
                      : ''}to Odoo
                  </Button>
                  <div className="flex-1" />
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelectedLeads(new Set())}
                    className="text-gray-500"
                  >
                    <X className="w-4 h-4 mr-1" />
                    Clear Selection
                  </Button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Leads Grid/List */}
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
          </div>
        ) : leads.length === 0 ? (
          <Card className="bg-white/60 backdrop-blur">
            <CardContent className="py-16 text-center">
              <Target className="w-12 h-12 mx-auto mb-4 text-slate-300" />
              <h3 className="text-lg font-medium text-slate-600 mb-2">No leads found</h3>
              <p className="text-sm text-slate-500 mb-4">
                Import leads from Odoo or create new ones manually
              </p>
              <div className="flex items-center justify-center gap-2">
                <Button variant="outline" onClick={() => importMutation.mutate()} disabled={importMutation.isPending}>
                  <SiOdoo className="w-4 h-4 mr-2" />
                  Import from Odoo
                </Button>
                <Button onClick={() => setShowCreateDialog(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Create Lead
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : viewMode === 'cards' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {paginatedLeads.map(lead => {
              const stageInfo = getStageInfo(lead.stage);
              const priorityInfo = getPriorityInfo(lead.priority);
              const trustProgress = getTrustBuildingProgress(lead);
              const isSelected = selectedLeads.has(lead.id);
              
              return (
                <div key={lead.id} className="relative block">
                  <div className="absolute top-3 left-3 z-10" onClick={(e) => e.stopPropagation()}>
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={(checked) => {
                        setSelectedLeads(prev => {
                          const next = new Set(prev);
                          if (checked) next.add(lead.id); else next.delete(lead.id);
                          return next;
                        });
                      }}
                      className="bg-white border-slate-300"
                    />
                  </div>
                  <Link href={`/leads/${lead.id}`} className="block">
                  <Card 
                    className={`hover:shadow-lg transition-all cursor-pointer group ${isSelected ? 'ring-2 ring-violet-400 bg-violet-50/50' : ''}`}
                    style={{ backgroundColor: isSelected ? undefined : 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}
                  >
                    <CardContent className="p-4 pl-10">
                    {/* Header */}
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-slate-800 truncate group-hover:text-purple-600 transition-colors">
                          {lead.name}
                        </h3>
                        {lead.company && (
                          <p className="text-sm text-slate-500 flex items-center gap-1 truncate">
                            <Building2 className="w-3 h-3 flex-shrink-0" />
                            {lead.company}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1">
                        <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                        {(() => { const h = getLeadHealth(lead); return h.missing.length > 0 ? (
                          <div className="flex flex-col gap-0.5 mt-1">
                            {h.missing.map(m => (
                              <span key={m} className={`text-xs px-1.5 py-0.5 rounded font-medium ${h.isRed ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>{m}</span>
                            ))}
                          </div>
                        ) : null; })()}
                        {lead.priority && (
                          <Badge variant="outline" className={priorityInfo.color}>
                            {priorityInfo.label}
                          </Badge>
                        )}
                        {/* Origin badges for converted contacts */}
                        {(lead.existsInOdooAsContact || lead.existsInShopify) && (
                          <div className="flex items-center gap-1 mt-1">
                            {lead.existsInOdooAsContact && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-purple-50 border-purple-200 text-purple-700 flex items-center gap-1">
                                <SiOdoo className="w-3 h-3" />
                                <span>Odoo</span>
                              </Badge>
                            )}
                            {lead.existsInShopify && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 border-green-200 text-green-700 flex items-center gap-1">
                                <SiShopify className="w-3 h-3" />
                                <span>Shopify</span>
                              </Badge>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Primary Contact for Companies */}
                    {lead.isCompany && lead.primaryContactName && (
                      <div className="mt-2 px-2 py-1.5 bg-blue-50 rounded-md border border-blue-100">
                        <div className="flex items-center gap-2 text-xs">
                          <User className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-medium text-blue-700">Primary Contact:</span>
                          <span className="text-blue-600">{lead.primaryContactName}</span>
                        </div>
                        {lead.primaryContactEmail && (
                          <div className="flex items-center gap-2 text-xs mt-0.5 ml-5">
                            <Mail className="w-3 h-3 text-blue-400" />
                            <span className="text-blue-500">{lead.primaryContactEmail}</span>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Contact Info */}
                    <div className="space-y-1 mb-3 text-sm mt-2">
                      {lead.email && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Mail className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">{lead.email}</span>
                        </div>
                      )}
                      {(lead.phone || lead.mobile) && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <Phone className="w-3.5 h-3.5 text-slate-400" />
                          <span>{lead.phone || lead.mobile}</span>
                        </div>
                      )}
                      {(lead.city || lead.state || lead.country) && (
                        <div className="flex items-center gap-2 text-slate-600">
                          <MapPin className="w-3.5 h-3.5 text-slate-400" />
                          <span className="truncate">
                            {[lead.city, lead.state, lead.country].filter(Boolean).join(', ')}
                          </span>
                        </div>
                      )}
                    </div>

                    <Separator className="my-3" />

                    {/* Trust Building Progress */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-xs font-medium text-slate-500">Trust Building</span>
                        <span className="text-xs text-slate-400">
                          {trustProgress.sentCount}/{trustProgress.total}
                        </span>
                      </div>
                      <div className="flex gap-1">
                        {trustProgress.items.map((item, i) => (
                          <div
                            key={i}
                            className={`flex-1 h-1.5 rounded-full ${item.sent ? 'bg-green-400' : 'bg-slate-200'}`}
                            title={item.label}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Stats */}
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-3 h-3" />
                        <span>{lead.totalTouchpoints} touchpoints</span>
                      </div>
                      {lead.score > 0 && (
                        <div className="flex items-center gap-1">
                          <Star className="w-3 h-3 text-amber-500" />
                          <span>Score: {lead.score}</span>
                        </div>
                      )}
                      {lead.emailNormalized && conflictEmailSet.has(lead.emailNormalized) && (
                        <Link href="/admin/data-integrity" onClick={(e) => e.stopPropagation()}>
                          <span title="This email exists in both Leads and Contacts" className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-orange-100 text-orange-600 text-xs font-medium cursor-pointer hover:bg-orange-200">
                            ⚠ Duplicate
                          </span>
                        </Link>
                      )}
                      {lead.odooLeadId && (
                        <SiOdoo className="w-3.5 h-3.5 text-purple-500" title="Synced from Odoo" />
                      )}
                    </div>

                    {/* Sales Rep */}
                    {lead.salesRepName && (
                      <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2 text-xs text-slate-500">
                        <User className="w-3 h-3" />
                        <span>{lead.salesRepName}</span>
                      </div>
                    )}

                    {/* Quick Actions */}
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-center gap-2" onClick={(e) => e.preventDefault()}>
                      <Select
                        value={lead.stage}
                        onValueChange={(value) => {
                          updateLeadStageMutation.mutate({ leadId: lead.id, stage: value });
                          toast({ title: 'Stage updated', description: `${lead.name} moved to ${STAGES.find(s => s.value === value)?.label}` });
                        }}
                      >
                        <SelectTrigger className="h-7 text-xs flex-1" onClick={(e) => e.stopPropagation()}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent onClick={(e) => e.stopPropagation()}>
                          {STAGES.map(s => (
                            <SelectItem key={s.value} value={s.value}>
                              <span className={`px-1.5 py-0.5 rounded text-xs ${s.color}`}>{s.label}</span>
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <div onClick={(e) => { e.stopPropagation(); e.preventDefault(); }}>
                        <PrintLabelButton
                          customer={{
                            id: `lead-${lead.id}`,
                            company: lead.company,
                            firstName: lead.name?.split(' ')[0] || null,
                            lastName: lead.name?.split(' ').slice(1).join(' ') || null,
                            address1: lead.street,
                            address2: lead.street2,
                            city: lead.city,
                            province: lead.state,
                            zip: lead.zip,
                            country: lead.country,
                          }}
                          leadId={lead.id}
                          variant="icon"
                        />
                      </div>
                      {lead.email && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 px-2 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            e.preventDefault();
                            emailComposer.open({
                              to: lead.email!,
                              subject: `Following up from ${lead.company || 'your inquiry'}`,
                              customerName: lead.name || lead.company || 'Lead',
                              variables: {
                                'client.email': lead.email || '',
                                'client.name': lead.name || '',
                                'client.firstName': lead.name?.split(' ')[0] || '',
                                'client.company': lead.company || '',
                                'client.salesRep': lead.salesRepName || '',
                                'name': lead.name || '',
                                'customer_name': lead.company || lead.name || '',
                                'contact_name': lead.name || '',
                                'salesRep': lead.salesRepName || '',
                              },
                            });
                          }}
                        >
                          <Send className="w-3 h-3 mr-1" />
                          Email
                        </Button>
                      )}
                    </div>
                    </CardContent>
                  </Card>
                  </Link>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'list' ? (
          <Card className="bg-white/80 backdrop-blur">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="w-10 p-3">
                      <Checkbox
                        checked={paginatedLeads.length > 0 && paginatedLeads.every(l => selectedLeads.has(l.id))}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedLeads(new Set(paginatedLeads.map(l => l.id)));
                          } else {
                            setSelectedLeads(new Set());
                          }
                        }}
                      />
                    </th>
                    {visibleLeadColumns.name !== false && <th className="text-left p-3 font-medium text-slate-600">Name</th>}
                    {visibleLeadColumns.company && <th className="text-left p-3 font-medium text-slate-600">Company</th>}
                    {visibleLeadColumns.email && <th className="text-left p-3 font-medium text-slate-600">Email</th>}
                    {visibleLeadColumns.stage && <th className="text-left p-3 font-medium text-slate-600">Stage</th>}
                    {visibleLeadColumns.priority && <th className="text-left p-3 font-medium text-slate-600">Priority</th>}
                    {visibleLeadColumns.origin && <th className="text-left p-3 font-medium text-slate-600">Origin</th>}
                    {visibleLeadColumns.primaryContact && <th className="text-left p-3 font-medium text-slate-600">Primary Contact</th>}
                    {visibleLeadColumns.touchpoints && <th className="text-left p-3 font-medium text-slate-600">Touchpoints</th>}
                    {visibleLeadColumns.score && <th className="text-left p-3 font-medium text-slate-600">Score</th>}
                    {visibleLeadColumns.salesRep && <th className="text-left p-3 font-medium text-slate-600">Sales Rep</th>}
                    {visibleLeadColumns.phone && <th className="text-left p-3 font-medium text-slate-600">Phone</th>}
                    {visibleLeadColumns.location && <th className="text-left p-3 font-medium text-slate-600">Location</th>}
                    {visibleLeadColumns.createdAt && <th className="text-left p-3 font-medium text-slate-600">Created</th>}
                  </tr>
                </thead>
                <tbody>
                  {paginatedLeads.map(lead => {
                    const stageInfo = getStageInfo(lead.stage);
                    const priorityInfo = getPriorityInfo(lead.priority);
                    const isSelected = selectedLeads.has(lead.id);
                    return (
                      <tr 
                        key={lead.id} 
                        className={`border-t border-slate-100 hover:bg-slate-50/50 cursor-pointer ${isSelected ? 'bg-violet-50/50' : ''}`}
                        onClick={() => setLocation(`/leads/${lead.id}`)}
                      >
                        <td className="p-3" onClick={(e) => e.stopPropagation()}>
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) => {
                              setSelectedLeads(prev => {
                                const next = new Set(prev);
                                if (checked) next.add(lead.id); else next.delete(lead.id);
                                return next;
                              });
                            }}
                          />
                        </td>
                        {visibleLeadColumns.name !== false && <td className="p-3 font-medium text-slate-800">{lead.name}</td>}
                        {visibleLeadColumns.company && <td className="p-3 text-slate-600">{lead.company || '-'}</td>}
                        {visibleLeadColumns.email && <td className="p-3 text-slate-600">{lead.email || '-'}</td>}
                        {visibleLeadColumns.stage && (
                        <td className="p-3">
                          <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                        </td>
                        )}
                        {visibleLeadColumns.priority && (
                        <td className="p-3">
                          <Badge variant="outline" className={priorityInfo.color}>
                            {priorityInfo.label}
                          </Badge>
                        </td>
                        )}
                        {visibleLeadColumns.origin && (
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {lead.existsInOdooAsContact && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-purple-50 border-purple-200 text-purple-700 flex items-center gap-1">
                                <SiOdoo className="w-3 h-3" />
                              </Badge>
                            )}
                            {lead.existsInShopify && (
                              <Badge variant="outline" className="text-xs px-1.5 py-0.5 bg-green-50 border-green-200 text-green-700 flex items-center gap-1">
                                <SiShopify className="w-3 h-3" />
                              </Badge>
                            )}
                            {!lead.existsInOdooAsContact && !lead.existsInShopify && '-'}
                          </div>
                        </td>
                        )}
                        {visibleLeadColumns.primaryContact && (
                        <td className="p-3 text-slate-600">
                          {lead.primaryContactName ? (
                            <div className="flex flex-col">
                              <span className="text-slate-700 text-sm">{lead.primaryContactName}</span>
                              {lead.primaryContactEmail && (
                                <span className="text-slate-400 text-xs">{lead.primaryContactEmail}</span>
                              )}
                            </div>
                          ) : (
                            '-'
                          )}
                        </td>
                        )}
                        {visibleLeadColumns.touchpoints && <td className="p-3 text-slate-600">{lead.totalTouchpoints}</td>}
                        {visibleLeadColumns.score && <td className="p-3 text-slate-600">{lead.score}</td>}
                        {visibleLeadColumns.salesRep && <td className="p-3 text-slate-600">{lead.salesRepName || '-'}</td>}
                        {visibleLeadColumns.phone && <td className="p-3 text-slate-600">{lead.phone || lead.mobile || '-'}</td>}
                        {visibleLeadColumns.location && <td className="p-3 text-slate-600">{[lead.city, lead.state, lead.country].filter(Boolean).join(', ') || '-'}</td>}
                        {visibleLeadColumns.createdAt && <td className="p-3 text-xs text-slate-500">{lead.createdAt ? new Date(lead.createdAt).toLocaleDateString() : '-'}</td>}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        ) : viewMode === 'kanban' ? (
          /* Kanban View */
          <div className="flex gap-4 overflow-x-auto pb-4">
            {STAGES.filter(s => !['not_a_fit', 'lost'].includes(s.value)).map(stage => {
              const stageLeads = leads.filter(l => l.stage === stage.value);
              return (
                <div 
                  key={stage.value} 
                  className="flex-shrink-0 w-72 bg-white/60 backdrop-blur rounded-xl border border-slate-200"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const leadId = parseInt(e.dataTransfer.getData('leadId'));
                    if (leadId) {
                      updateLeadStageMutation.mutate({ leadId, stage: stage.value });
                      toast({ title: 'Lead moved', description: `Lead moved to ${stage.label}` });
                    }
                  }}
                >
                  <div className={`p-3 border-b border-slate-200 rounded-t-xl ${stage.color}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold text-sm">{stage.label}</h3>
                      <Badge variant="secondary" className="text-xs">{stageLeads.length}</Badge>
                    </div>
                  </div>
                  <div className="p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                    {stageLeads.map(lead => (
                      <div
                        key={lead.id}
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('leadId', lead.id.toString());
                        }}
                        onClick={() => setLocation(`/leads/${lead.id}`)}
                        className="bg-white rounded-lg border border-slate-100 p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-shadow"
                      >
                        <div className="flex items-start gap-2">
                          <GripVertical className="w-4 h-4 text-slate-300 flex-shrink-0 mt-0.5" />
                          <div className="flex-1 min-w-0">
                            <h4 className="font-medium text-sm text-slate-800 truncate">{lead.name}</h4>
                            {lead.company && (
                              <p className="text-xs text-slate-500 truncate flex items-center gap-1">
                                <Building2 className="w-3 h-3" />
                                {lead.company}
                              </p>
                            )}
                            <div className="flex items-center gap-2 mt-2">
                              {lead.email && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 px-2 text-xs"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    emailComposer.open({
                                      to: lead.email!,
                                      subject: `Following up from ${lead.company || 'your inquiry'}`,
                                      customerName: lead.name || lead.company || 'Lead',
                                      variables: {
                                        'client.email': lead.email || '',
                                        'client.name': lead.name || '',
                                        'client.firstName': lead.name?.split(' ')[0] || '',
                                        'client.company': lead.company || '',
                                        'client.salesRep': lead.salesRepName || '',
                                        'name': lead.name || '',
                                        'customer_name': lead.company || lead.name || '',
                                        'contact_name': lead.name || '',
                                        'salesRep': lead.salesRepName || '',
                                      },
                                    });
                                  }}
                                >
                                  <Mail className="w-3 h-3" />
                                </Button>
                              )}
                              {lead.totalTouchpoints > 0 && (
                                <span className="text-xs text-slate-400">{lead.totalTouchpoints} touches</span>
                              )}
                              {lead.score > 0 && (
                                <Badge variant="outline" className="text-xs px-1 py-0">
                                  <Star className="w-2.5 h-2.5 mr-0.5 text-amber-500" />
                                  {lead.score}
                                </Badge>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                    {stageLeads.length === 0 && (
                      <div className="text-center py-8 text-slate-400 text-sm">
                        Drop leads here
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        ) : viewMode === 'funnel' ? (
          /* Funnel View */
          <Card className="bg-white/80 backdrop-blur p-6">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-purple-500" />
                Sales Funnel Overview
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {STAGES.map((stage, index) => {
                  const stageLeads = leads.filter(l => l.stage === stage.value);
                  const maxCount = Math.max(...STAGES.map(s => leads.filter(l => l.stage === s.value).length), 1);
                  const percentage = (stageLeads.length / maxCount) * 100;
                  const totalRevenue = stageLeads.reduce((sum, l) => sum + parseFloat(l.expectedRevenue || '0'), 0);
                  
                  return (
                    <div key={stage.value} className="relative">
                      <div className="flex items-center gap-4">
                        <div className="w-32 flex-shrink-0 text-right">
                          <span className="text-sm font-medium text-slate-700">{stage.label}</span>
                        </div>
                        <div className="flex-1 relative">
                          <div 
                            className={`h-12 rounded-lg ${stage.color} transition-all duration-500 flex items-center justify-between px-4`}
                            style={{ 
                              width: `${Math.max(percentage, 10)}%`,
                              clipPath: index < STAGES.length - 1 ? 'polygon(0 0, calc(100% - 20px) 0, 100% 50%, calc(100% - 20px) 100%, 0 100%)' : undefined
                            }}
                          >
                            <span className="font-bold text-lg">{stageLeads.length}</span>
                            {totalRevenue > 0 && (
                              <span className="text-sm opacity-80">${totalRevenue.toLocaleString()}</span>
                            )}
                          </div>
                        </div>
                        <div className="w-24 text-right">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-xs"
                            onClick={() => {
                              setStageFilter(stage.value);
                              setViewMode('cards');
                            }}
                          >
                            View All →
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {/* Funnel Summary */}
              <div className="mt-8 pt-6 border-t border-slate-200 grid grid-cols-3 gap-4">
                <div className="text-center">
                  <div className="text-2xl font-bold text-slate-800">{leads.length}</div>
                  <div className="text-sm text-slate-500">Total Leads</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">
                    {leads.filter(l => l.stage === 'qualified').length}
                  </div>
                  <div className="text-sm text-slate-500">Qualified</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">
                    ${leads.reduce((sum, l) => sum + parseFloat(l.expectedRevenue || '0'), 0).toLocaleString()}
                  </div>
                  <div className="text-sm text-slate-500">Pipeline Value</div>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : null}

        {(viewMode === 'cards' || viewMode === 'list') && totalPages > 1 && (
          <div className="flex items-center justify-between mt-4 px-2">
            <p className="text-sm text-slate-500">
              Showing {((currentPage - 1) * leadsPerPage) + 1}–{Math.min(currentPage * leadsPerPage, leads.length)} of {leads.length} leads
            </p>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === 1}
                onClick={() => setCurrentPage(p => p - 1)}
              >
                Previous
              </Button>
              {Array.from({ length: totalPages }, (_, i) => i + 1)
                .filter(page => page === 1 || page === totalPages || Math.abs(page - currentPage) <= 2)
                .reduce<(number | string)[]>((acc, page, idx, arr) => {
                  if (idx > 0 && page - (arr[idx - 1] as number) > 1) acc.push('...');
                  acc.push(page);
                  return acc;
                }, [])
                .map((page, idx) =>
                  typeof page === 'string' ? (
                    <span key={`ellipsis-${idx}`} className="px-1 text-slate-400">...</span>
                  ) : (
                    <Button
                      key={page}
                      variant={page === currentPage ? "default" : "outline"}
                      size="sm"
                      className="w-9"
                      onClick={() => setCurrentPage(page)}
                    >
                      {page}
                    </Button>
                  )
                )}
              <Button
                variant="outline"
                size="sm"
                disabled={currentPage === totalPages}
                onClick={() => setCurrentPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}

        {/* Screenshot Import Modal */}
        <ScreenshotImportModal
          isOpen={showScreenshotImport}
          onClose={() => setShowScreenshotImport(false)}
          defaultSaveAs="lead"
        />

        {/* Create Lead Dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create New Lead</DialogTitle>
              <DialogDescription>
                Add a new prospect to your leads database
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Contact Name *</Label>
                <Input
                  id="name"
                  value={newLead.name}
                  onChange={(e) => setNewLead({ ...newLead, name: e.target.value })}
                  placeholder="John Smith"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={newLead.company}
                  onChange={(e) => setNewLead({ ...newLead, company: e.target.value })}
                  placeholder="Acme Printing Co."
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={newLead.email}
                  onChange={(e) => setNewLead({ ...newLead, email: e.target.value })}
                  placeholder="john@example.com"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={newLead.phone}
                  onChange={(e) => setNewLead({ ...newLead, phone: e.target.value })}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Notes</Label>
                <Textarea
                  id="description"
                  value={newLead.description}
                  onChange={(e) => setNewLead({ ...newLead, description: e.target.value })}
                  placeholder="How did you find this lead? Any context?"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => createMutation.mutate(newLead)}
                disabled={!newLead.name || createMutation.isPending}
              >
                {createMutation.isPending ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  'Create Lead'
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Monday Morning Review Dialog */}
        <Dialog open={showMondayReview} onOpenChange={setShowMondayReview}>
          <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CalendarCheck className="w-5 h-5 text-amber-500" />
                Monday Morning Review
              </DialogTitle>
              <DialogDescription>
                Clear off last week's leads. Mark them as "Not a Fit" or "Contact Later" to keep your pipeline moving.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4">
              {isLoadingReview ? (
                <div className="text-center py-8 text-slate-500">
                  <Loader2 className="w-8 h-8 mx-auto mb-3 text-slate-400 animate-spin" />
                  <p className="text-sm">Loading leads to review...</p>
                </div>
              ) : reviewLeads && reviewLeads.length > 0 ? (
                <div className="space-y-3">
                  {reviewLeads.map((lead) => {
                    const stageInfo = getStageInfo(lead.stage);
                    return (
                      <div key={lead.id} className="p-3 bg-slate-50 rounded-lg border">
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <a
                                href={lead.sourceCustomerId ? `/odoo-contacts/${lead.sourceCustomerId}` : `/leads/${lead.id}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="font-medium text-slate-800 hover:text-blue-600 hover:underline truncate transition-colors"
                              >
                                {lead.name}
                              </a>
                              <Badge className={stageInfo.color} variant="outline">{stageInfo.label}</Badge>
                            </div>
                            <div className="text-sm text-slate-500">
                              {lead.company && (
                                <a
                                  href={lead.sourceCustomerId ? `/odoo-contacts/${lead.sourceCustomerId}` : `/leads/${lead.id}`}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="hover:text-blue-500 hover:underline transition-colors"
                                >
                                  {lead.company}
                                </a>
                              )}
                              {lead.company && (lead.email || lead.phone) && <span> • </span>}
                              {lead.email || lead.phone || (!lead.company && 'No contact info')}
                            </div>
                          </div>
                          <div className="flex items-center gap-2 ml-4">
                            {(lead.street || lead.city) && (
                              <PrintLabelButton
                                customer={{
                                  id: String(lead.id),
                                  company: lead.company,
                                  firstName: lead.name?.split(' ')[0] || null,
                                  lastName: lead.name?.split(' ').slice(1).join(' ') || null,
                                  address1: lead.street,
                                  city: lead.city,
                                  province: lead.state,
                                  zip: lead.zip,
                                  country: lead.country,
                                }}
                                leadId={lead.id}
                                variant="icon"
                                size="sm"
                              />
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-orange-600 border-orange-200 hover:bg-orange-50"
                              onClick={() => {
                                updateLeadStageMutation.mutate({ leadId: lead.id, stage: 'contact_later' });
                                toast({ title: 'Lead updated', description: `${lead.name} marked as Contact Later` });
                              }}
                              disabled={updateLeadStageMutation.isPending}
                            >
                              <Clock className="w-4 h-4 mr-1" />
                              Later
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-slate-600 border-slate-200 hover:bg-slate-100"
                              onClick={() => {
                                updateLeadStageMutation.mutate({ leadId: lead.id, stage: 'not_a_fit' });
                                toast({ title: 'Lead updated', description: `${lead.name} marked as Not a Fit` });
                              }}
                              disabled={updateLeadStageMutation.isPending}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Not a Fit
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => {
                                updateLeadStageMutation.mutate({ leadId: lead.id, stage: 'qualified' });
                                toast({ title: 'Lead updated', description: `${lead.name} marked as Qualified` });
                              }}
                              disabled={updateLeadStageMutation.isPending}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Qualified
                            </Button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-8 text-slate-500">
                  <CheckCircle2 className="w-12 h-12 mx-auto mb-3 text-green-400" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm">No leads need review this week.</p>
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={handleDismissMondayReview}>
                Dismiss for this week
              </Button>
              <Button onClick={() => setShowMondayReview(false)}>
                Done
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Bulk Drip Campaign Enrollment Dialog */}
        <Dialog open={showBulkDrip} onOpenChange={setShowBulkDrip}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Zap className="w-5 h-5 text-amber-500" />
                Enroll in Drip Campaign
              </DialogTitle>
              <DialogDescription>
                Enroll {selectedLeads.size} selected lead{selectedLeads.size !== 1 ? 's' : ''} in an automated email sequence.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {dripCampaigns.filter(c => c.isActive).length === 0 ? (
                <div className="text-center py-6 text-slate-400">
                  <Zap className="w-10 h-10 mx-auto mb-2 text-slate-200" />
                  <p className="text-sm">No active campaigns available.</p>
                  <p className="text-xs mt-1">Create a drip campaign in the Email section first.</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {dripCampaigns.filter(c => c.isActive).map((campaign) => (
                    <button
                      key={campaign.id}
                      onClick={() => setSelectedBulkDripCampaignId(String(campaign.id))}
                      className={`w-full text-left p-3 rounded-lg border transition-colors ${
                        selectedBulkDripCampaignId === String(campaign.id)
                          ? 'border-amber-400 bg-amber-50'
                          : 'border-slate-200 bg-white hover:border-amber-200 hover:bg-amber-50/30'
                      }`}
                    >
                      <p className="text-sm font-medium text-slate-800">{campaign.name}</p>
                      {campaign.description && (
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{campaign.description}</p>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowBulkDrip(false); setSelectedBulkDripCampaignId(''); }}>
                Cancel
              </Button>
              <Button
                className="bg-amber-600 hover:bg-amber-700 text-white"
                disabled={!selectedBulkDripCampaignId || bulkEnrollDripMutation.isPending}
                onClick={() => bulkEnrollDripMutation.mutate({
                  campaignId: Number(selectedBulkDripCampaignId),
                  leadIds: Array.from(selectedLeads),
                })}
              >
                {bulkEnrollDripMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Zap className="w-4 h-4 mr-2" />}
                Start Campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      {showBulkEmail && (
        <Dialog open={showBulkEmail} onOpenChange={setShowBulkEmail}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Send Email to {selectedLeads.size} Lead{selectedLeads.size !== 1 ? 's' : ''}</DialogTitle>
              <DialogDescription>Compose a one-time email to all selected leads. Each lead receives a personalized copy.</DialogDescription>
            </DialogHeader>
            <BulkEmailComposer
              leadIds={Array.from(selectedLeads)}
              onClose={() => setShowBulkEmail(false)}
              onSent={(count) => {
                toast({ title: `Email sent to ${count} lead${count !== 1 ? 's' : ''}` });
                setShowBulkEmail(false);
                setSelectedLeads(new Set());
              }}
            />
          </DialogContent>
        </Dialog>
      )}
      </div>
    </div>
  );
}

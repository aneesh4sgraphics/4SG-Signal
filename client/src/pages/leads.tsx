import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
} from "lucide-react";
import { SiOdoo, SiShopify } from "react-icons/si";
import { Progress } from "@/components/ui/progress";

interface Lead {
  id: number;
  odooLeadId: number | null;
  sourceType: string;
  sourceCustomerId: string | null;
  name: string;
  email: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  city: string | null;
  state: string | null;
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
  { value: 'converted', label: 'Converted', color: 'bg-emerald-100 text-emerald-700' },
  { value: 'not_a_fit', label: 'Not a Fit', color: 'bg-slate-100 text-slate-600' },
  { value: 'lost', label: 'Lost', color: 'bg-red-100 text-red-700' },
];

const PRIORITIES = [
  { value: 'low', label: 'Low', color: 'bg-slate-100 text-slate-600' },
  { value: 'medium', label: 'Medium', color: 'bg-blue-100 text-blue-600' },
  { value: 'high', label: 'High', color: 'bg-orange-100 text-orange-600' },
  { value: 'urgent', label: 'Urgent', color: 'bg-red-100 text-red-600' },
];

export default function LeadsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'cards' | 'list'>('cards');
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [importStatus, setImportStatus] = useState<{ message: string; progress: number } | null>(null);
  const [showMondayReview, setShowMondayReview] = useState(false);
  const [mondayReviewDismissed, setMondayReviewDismissed] = useState(() => {
    // Check if user already dismissed the Monday review this week
    const dismissed = localStorage.getItem('mondayReviewDismissed');
    if (dismissed) {
      const dismissedDate = new Date(dismissed);
      const now = new Date();
      // If dismissed was more than a week ago, show again
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      return dismissedDate > weekAgo;
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
      toast({ title: 'Error', description: error.message || 'Failed to create lead', variant: 'destructive' });
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

  const leads = leadsData?.leads || [];

  const getStageInfo = (stage: string) => STAGES.find(s => s.value === stage) || STAGES[0];
  const getPriorityInfo = (priority: string | null) => PRIORITIES.find(p => p.value === priority) || PRIORITIES[1];

  const getTrustBuildingProgress = (lead: Lead) => {
    const items = [
      { sent: !!lead.swatchbookSentAt, label: 'SwatchBook' },
      { sent: !!lead.sampleSentAt, label: 'Samples' },
      { sent: !!lead.priceListSentAt, label: 'Price List' },
      { sent: !!lead.catalogSentAt, label: 'Catalog' },
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4 mb-6">
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
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Search leads by name, company, or email..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10 bg-white/80 border-slate-200"
            />
          </div>
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
          <div className="flex border rounded-md bg-white/80">
            <Button
              variant={viewMode === 'cards' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('cards')}
              className="rounded-r-none"
            >
              <LayoutGrid className="w-4 h-4" />
            </Button>
            <Button
              variant={viewMode === 'list' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setViewMode('list')}
              className="rounded-l-none"
            >
              <List className="w-4 h-4" />
            </Button>
          </div>
        </div>

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
            {leads.map(lead => {
              const stageInfo = getStageInfo(lead.stage);
              const priorityInfo = getPriorityInfo(lead.priority);
              const trustProgress = getTrustBuildingProgress(lead);
              
              return (
                <Card 
                  key={lead.id}
                  className="hover:shadow-lg transition-all cursor-pointer group"
                  style={{ backgroundColor: 'rgba(255,255,255,0.85)', backdropFilter: 'blur(8px)' }}
                >
                  <CardContent className="p-4">
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
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <Card className="bg-white/80 backdrop-blur">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    <th className="text-left p-3 font-medium text-slate-600">Name</th>
                    <th className="text-left p-3 font-medium text-slate-600">Company</th>
                    <th className="text-left p-3 font-medium text-slate-600">Email</th>
                    <th className="text-left p-3 font-medium text-slate-600">Stage</th>
                    <th className="text-left p-3 font-medium text-slate-600">Priority</th>
                    <th className="text-left p-3 font-medium text-slate-600">Origin</th>
                    <th className="text-left p-3 font-medium text-slate-600">Primary Contact</th>
                    <th className="text-left p-3 font-medium text-slate-600">Touchpoints</th>
                    <th className="text-left p-3 font-medium text-slate-600">Score</th>
                    <th className="text-left p-3 font-medium text-slate-600">Sales Rep</th>
                  </tr>
                </thead>
                <tbody>
                  {leads.map(lead => {
                    const stageInfo = getStageInfo(lead.stage);
                    const priorityInfo = getPriorityInfo(lead.priority);
                    return (
                      <tr key={lead.id} className="border-t border-slate-100 hover:bg-slate-50/50">
                        <td className="p-3 font-medium text-slate-800">{lead.name}</td>
                        <td className="p-3 text-slate-600">{lead.company || '-'}</td>
                        <td className="p-3 text-slate-600">{lead.email || '-'}</td>
                        <td className="p-3">
                          <Badge className={stageInfo.color}>{stageInfo.label}</Badge>
                        </td>
                        <td className="p-3">
                          <Badge variant="outline" className={priorityInfo.color}>
                            {priorityInfo.label}
                          </Badge>
                        </td>
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
                        <td className="p-3 text-slate-600">{lead.totalTouchpoints}</td>
                        <td className="p-3 text-slate-600">{lead.score}</td>
                        <td className="p-3 text-slate-600">{lead.salesRepName || '-'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </Card>
        )}

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
                      <div key={lead.id} className="flex items-center justify-between p-3 bg-slate-50 rounded-lg border">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-slate-800 truncate">{lead.name}</span>
                            <Badge className={stageInfo.color} variant="outline">{stageInfo.label}</Badge>
                          </div>
                          <div className="text-sm text-slate-500">
                            {lead.company && <span>{lead.company} • </span>}
                            {lead.email || lead.phone || 'No contact info'}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 ml-4">
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
      </div>
    </div>
  );
}

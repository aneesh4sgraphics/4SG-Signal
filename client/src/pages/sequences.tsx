import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Plus, ChevronLeft, Mail, Clock, Users, Zap, Play, Pause, X,
  MoreHorizontal, Trash2, Edit2, Search, Check, UserPlus, ArrowRight,
  RotateCcw, Ban, CheckCircle2,
} from 'lucide-react';
import type { DripCampaign, DripCampaignStep } from '@shared/schema';

// ── Types ────────────────────────────────────────────────────────────────────

interface SequenceWithSteps extends DripCampaign {
  steps?: DripCampaignStep[];
}

interface EnrichedAssignment {
  id: number;
  campaignId: number;
  customerId: string | null;
  leadId: number | null;
  status: string;
  startedAt: string | null;
  completedAt: string | null;
  pausedAt: string | null;
  cancelledAt: string | null;
  assignedBy: string | null;
  name: string;
  email: string | null;
  company: string | null;
  type: 'lead' | 'customer';
  stepsSent: number;
  stepsTotal: number;
}

interface AssignmentCount { campaignId: number; count: number; leadCount?: number }

// ── Constants ────────────────────────────────────────────────────────────────

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  on_signup: 'On Signup',
  on_purchase: 'On Purchase',
  on_quote: 'On Quote Sent',
};

const STATUS_CONFIG: Record<string, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  active: { label: 'Active', className: 'bg-green-100 text-green-700 border-green-200', icon: Play },
  paused: { label: 'Paused', className: 'bg-yellow-100 text-yellow-700 border-yellow-200', icon: Pause },
  completed: { label: 'Completed', className: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', className: 'bg-red-100 text-red-700 border-red-200', icon: Ban },
};

function formatDelay(amount: number, unit: string) {
  if (amount === 0) return 'immediately';
  return `after ${amount} ${unit}`;
}

function timeAgo(dateStr: string | null) {
  if (!dateStr) return '–';
  const d = new Date(dateStr);
  const diff = Math.floor((Date.now() - d.getTime()) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function Sequences() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = (user as any)?.role === 'admin';

  const [view, setView] = useState<'list' | 'detail'>('list');
  const [selected, setSelected] = useState<SequenceWithSteps | null>(null);
  const [activeTab, setActiveTab] = useState<'steps' | 'people'>('steps');

  // Dialogs
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [editingSequence, setEditingSequence] = useState<DripCampaign | null>(null);
  const [showStepDialog, setShowStepDialog] = useState(false);
  const [editingStep, setEditingStep] = useState<DripCampaignStep | null>(null);
  const [showEnrollDialog, setShowEnrollDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null);

  // Forms
  const [seqForm, setSeqForm] = useState({ name: '', description: '', triggerType: 'manual', isActive: false });
  const [stepForm, setStepForm] = useState({ name: '', subject: '', body: '', delayAmount: 0, delayUnit: 'days' });

  // Enroll dialog state
  const [enrollTarget, setEnrollTarget] = useState<'leads' | 'customers'>('leads');
  const [enrollSearch, setEnrollSearch] = useState('');
  const [selectedEnrollIds, setSelectedEnrollIds] = useState<string[]>([]);

  // ── Data queries ─────────────────────────────────────────────────────────

  const { data: sequences = [], isLoading } = useQuery<DripCampaign[]>({
    queryKey: ['/api/drip-campaigns'],
  });

  const { data: counts = [] } = useQuery<AssignmentCount[]>({
    queryKey: ['/api/drip-campaigns/assignment-counts'],
  });

  const { data: detail } = useQuery<SequenceWithSteps>({
    queryKey: ['/api/drip-campaigns', selected?.id],
    enabled: !!selected?.id,
  });

  const { data: enrolledPeople = [] } = useQuery<EnrichedAssignment[]>({
    queryKey: ['/api/drip-campaigns', selected?.id, 'assignments', 'enriched'],
    queryFn: async () => {
      if (!selected?.id) return [];
      const res = await fetch(`/api/drip-campaigns/${selected.id}/assignments/enriched`, { credentials: 'include' });
      return res.json();
    },
    enabled: !!selected?.id && activeTab === 'people',
  });

  const { data: leadsData = [] } = useQuery<any[]>({
    queryKey: ['/api/leads'],
    enabled: showEnrollDialog && enrollTarget === 'leads',
  });

  const { data: customersRaw } = useQuery<{ data: any[] }>({
    queryKey: ['/api/customers', 'enroll', 'paginated'],
    queryFn: async () => {
      const res = await fetch('/api/customers?pageSize=200&page=1', { credentials: 'include' });
      return res.json();
    },
    enabled: showEnrollDialog && enrollTarget === 'customers',
  });
  const customersData = customersRaw?.data ?? [];

  const getCount = (id: number) => counts.find(c => c.campaignId === id);
  const steps = detail?.steps ?? [];

  // ── Mutations ─────────────────────────────────────────────────────────────

  const createSeq = useMutation({
    mutationFn: (data: typeof seqForm) => apiRequest('POST', '/api/drip-campaigns', data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      setShowCreateDialog(false);
      setSeqForm({ name: '', description: '', triggerType: 'manual', isActive: false });
      toast({ title: 'Sequence created' });
    },
    onError: () => toast({ title: 'Failed to create sequence', variant: 'destructive' }),
  });

  const updateSeq = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) => apiRequest('PATCH', `/api/drip-campaigns/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      if (selected) queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected.id] });
      setEditingSequence(null);
      toast({ title: 'Sequence updated' });
    },
    onError: () => toast({ title: 'Failed to update sequence', variant: 'destructive' }),
  });

  const deleteSeq = useMutation({
    mutationFn: (id: number) => apiRequest('DELETE', `/api/drip-campaigns/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      setShowDeleteConfirm(null);
      setView('list');
      setSelected(null);
      toast({ title: 'Sequence deleted' });
    },
    onError: () => toast({ title: 'Failed to delete sequence', variant: 'destructive' }),
  });

  const createStep = useMutation({
    mutationFn: (data: typeof stepForm & { campaignId: number }) =>
      apiRequest('POST', `/api/drip-campaigns/${data.campaignId}/steps`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected?.id] });
      setShowStepDialog(false);
      setEditingStep(null);
      setStepForm({ name: '', subject: '', body: '', delayAmount: 0, delayUnit: 'days' });
      toast({ title: 'Step added' });
    },
    onError: () => toast({ title: 'Failed to add step', variant: 'destructive' }),
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, data }: { stepId: number; data: any }) =>
      apiRequest('PATCH', `/api/drip-campaigns/${selected?.id}/steps/${stepId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected?.id] });
      setShowStepDialog(false);
      setEditingStep(null);
      setStepForm({ name: '', subject: '', body: '', delayAmount: 0, delayUnit: 'days' });
      toast({ title: 'Step updated' });
    },
    onError: () => toast({ title: 'Failed to update step', variant: 'destructive' }),
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: number) => apiRequest('DELETE', `/api/drip-campaigns/${selected?.id}/steps/${stepId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected?.id] });
      toast({ title: 'Step deleted' });
    },
    onError: () => toast({ title: 'Failed to delete step', variant: 'destructive' }),
  });

  const enroll = useMutation({
    mutationFn: async ({ campaignId, ids }: { campaignId: number; ids: string[] }) => {
      const body = enrollTarget === 'leads'
        ? { leadIds: ids }
        : { customerIds: ids };
      const res = await apiRequest('POST', `/api/drip-campaigns/${campaignId}/assignments`, body);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns/assignment-counts'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected?.id, 'assignments', 'enriched'] });
      setShowEnrollDialog(false);
      setSelectedEnrollIds([]);
      setEnrollSearch('');
      toast({ title: `${data.created ?? selectedEnrollIds.length} contact(s) enrolled` });
    },
    onError: () => toast({ title: 'Failed to enroll contacts', variant: 'destructive' }),
  });

  const updateAssignment = useMutation({
    mutationFn: ({ assignmentId, status }: { assignmentId: number; status: string }) =>
      apiRequest('PATCH', `/api/drip-campaigns/assignments/${assignmentId}`, { status }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selected?.id, 'assignments', 'enriched'] });
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns/assignment-counts'] });
      toast({ title: 'Status updated' });
    },
    onError: () => toast({ title: 'Failed to update status', variant: 'destructive' }),
  });

  // ── Helpers ───────────────────────────────────────────────────────────────

  const openSeqDetail = (seq: DripCampaign) => {
    setSelected(seq);
    setView('detail');
    setActiveTab('steps');
  };

  const openStepEditor = (step?: DripCampaignStep) => {
    if (step) {
      setEditingStep(step);
      setStepForm({ name: step.name, subject: step.subject, body: step.body, delayAmount: step.delayAmount, delayUnit: step.delayUnit || 'days' });
    } else {
      setEditingStep(null);
      setStepForm({ name: '', subject: '', body: '', delayAmount: 0, delayUnit: 'days' });
    }
    setShowStepDialog(true);
  };

  const handleSaveStep = () => {
    if (!selected) return;
    if (editingStep) {
      updateStep.mutate({ stepId: editingStep.id, data: stepForm });
    } else {
      createStep.mutate({ ...stepForm, campaignId: selected.id });
    }
  };

  const filteredEnrollList = (() => {
    const q = enrollSearch.toLowerCase();
    if (enrollTarget === 'leads') {
      return leadsData.filter((l: any) =>
        l.name?.toLowerCase().includes(q) || l.company?.toLowerCase().includes(q)
      ).slice(0, 60);
    }
    return customersData.filter((c: any) =>
      c.company?.toLowerCase().includes(q) ||
      c.email?.toLowerCase().includes(q) ||
      `${c.firstName} ${c.lastName}`.toLowerCase().includes(q)
    ).slice(0, 60);
  })();

  const toggleEnroll = (id: string) =>
    setSelectedEnrollIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);

  // ── LIST VIEW ──────────────────────────────────────────────────────────────

  if (view === 'list') {
    return (
      <div>
        {/* Page header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Sequences</h1>
            <p className="text-sm text-gray-500 mt-0.5">
              Automated multi-step email sequences for leads and customers
            </p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCreateDialog(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              New Sequence
            </Button>
          )}
        </div>

        {/* Sequence grid */}
        {isLoading ? (
          <div className="text-center py-20 text-gray-400">
            <div className="h-6 w-6 border-2 border-gray-300 border-t-indigo-500 rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm">Loading sequences…</p>
          </div>
        ) : sequences.length === 0 ? (
          <div className="text-center py-20 text-gray-400">
            <div className="w-16 h-16 rounded-full bg-indigo-50 flex items-center justify-center mx-auto mb-4">
              <Zap className="h-8 w-8 text-indigo-400" />
            </div>
            <h3 className="text-base font-medium text-gray-700 mb-1">No sequences yet</h3>
            <p className="text-sm mb-4">Create your first sequence to start automating outreach</p>
            {isAdmin && (
              <Button onClick={() => setShowCreateDialog(true)} variant="outline" className="gap-2">
                <Plus className="h-4 w-4" />
                Create Sequence
              </Button>
            )}
          </div>
        ) : (
          <div className="grid gap-3">
            {sequences.map(seq => {
              const cnt = getCount(seq.id);
              const total = (cnt?.count ?? 0) + (cnt?.leadCount ?? 0);
              return (
                <div
                  key={seq.id}
                  onClick={() => openSeqDetail(seq)}
                  className="group flex items-center gap-4 px-5 py-4 bg-white rounded-xl border border-gray-200 hover:border-indigo-300 hover:shadow-sm cursor-pointer transition-all"
                >
                  {/* Status dot */}
                  <div className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${seq.isActive ? 'bg-green-500' : 'bg-gray-300'}`} />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-gray-900">{seq.name}</span>
                      <Badge variant="outline" className="text-xs capitalize px-1.5 py-0">
                        {TRIGGER_LABELS[seq.triggerType || 'manual']}
                      </Badge>
                      {seq.isActive
                        ? <Badge className="text-xs bg-green-100 text-green-700 border border-green-200 px-1.5 py-0">Active</Badge>
                        : <Badge variant="secondary" className="text-xs px-1.5 py-0">Draft</Badge>
                      }
                    </div>
                    <p className="text-sm text-gray-500 mt-0.5 truncate">{seq.description || 'No description'}</p>
                  </div>

                  {/* Stats */}
                  <div className="flex items-center gap-5 text-sm text-gray-500 flex-shrink-0">
                    <div className="flex items-center gap-1.5 text-center">
                      <Users className="h-3.5 w-3.5" />
                      <span className="font-medium text-gray-700">{total}</span>
                      <span className="hidden sm:inline">enrolled</span>
                    </div>
                    <ArrowRight className="h-4 w-4 text-gray-300 group-hover:text-indigo-400 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Create sequence dialog */}
        <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingSequence ? 'Edit Sequence' : 'New Sequence'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={seqForm.name}
                  onChange={e => setSeqForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="e.g. Welcome Series"
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description <span className="text-gray-400 font-normal">(optional)</span></Label>
                <Textarea
                  value={seqForm.description}
                  onChange={e => setSeqForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="What is this sequence for?"
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={seqForm.triggerType} onValueChange={v => setSeqForm(p => ({ ...p, triggerType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual — enroll contacts by hand</SelectItem>
                    <SelectItem value="on_signup">On Customer Signup</SelectItem>
                    <SelectItem value="on_purchase">On Purchase</SelectItem>
                    <SelectItem value="on_quote">On Quote Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3">
                <Switch
                  checked={seqForm.isActive}
                  onCheckedChange={v => setSeqForm(p => ({ ...p, isActive: v }))}
                />
                <span className="text-sm text-gray-600">Activate immediately</span>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCreateDialog(false)}>Cancel</Button>
              <Button
                onClick={() => createSeq.mutate(seqForm)}
                disabled={!seqForm.name.trim() || createSeq.isPending}
              >
                {createSeq.isPending ? 'Creating…' : 'Create Sequence'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ── DETAIL VIEW ─────────────────────────────────────────────────────────────

  if (view === 'detail' && selected) {
    const currentSeq = detail ?? selected;
    const cnt = getCount(selected.id);
    const totalEnrolled = (cnt?.count ?? 0) + (cnt?.leadCount ?? 0);

    return (
      <div>
        {/* Breadcrumb / back */}
        <button
          onClick={() => { setView('list'); setSelected(null); }}
          className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-5"
        >
          <ChevronLeft className="h-4 w-4" />
          Sequences
        </button>

        {/* Header */}
        <div className="flex items-start gap-4 mb-6">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-semibold text-gray-900">{currentSeq.name}</h1>
              {currentSeq.isActive
                ? <Badge className="bg-green-100 text-green-700 border border-green-200">Active</Badge>
                : <Badge variant="secondary">Draft</Badge>
              }
              <Badge variant="outline" className="capitalize">{TRIGGER_LABELS[currentSeq.triggerType || 'manual']}</Badge>
            </div>
            {currentSeq.description && (
              <p className="text-sm text-gray-500 mt-1">{currentSeq.description}</p>
            )}
          </div>

          {isAdmin && (
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Toggle active */}
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-gray-200 bg-white">
                <Switch
                  checked={currentSeq.isActive}
                  onCheckedChange={v => updateSeq.mutate({ id: selected.id, data: { isActive: v } })}
                />
                <span className="text-xs text-gray-500">{currentSeq.isActive ? 'Active' : 'Draft'}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSeqForm({ name: currentSeq.name, description: currentSeq.description || '', triggerType: currentSeq.triggerType || 'manual', isActive: currentSeq.isActive });
                  setEditingSequence(currentSeq);
                }}
              >
                <Edit2 className="h-3.5 w-3.5 mr-1.5" />
                Edit
              </Button>
              <Button variant="outline" size="sm" className="text-red-500 hover:text-red-700 hover:border-red-200" onClick={() => setShowDeleteConfirm(selected.id)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="flex items-center gap-6 mb-6 px-4 py-3 bg-gray-50 rounded-xl border border-gray-100">
          <div>
            <p className="text-xs text-gray-400">Steps</p>
            <p className="text-lg font-semibold text-gray-900">{steps.length}</p>
          </div>
          <div className="w-px h-8 bg-gray-200" />
          <div>
            <p className="text-xs text-gray-400">Enrolled</p>
            <p className="text-lg font-semibold text-gray-900">{totalEnrolled}</p>
          </div>
          {enrolledPeople.length > 0 && (
            <>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-xs text-gray-400">Active</p>
                <p className="text-lg font-semibold text-green-600">
                  {enrolledPeople.filter(p => p.status === 'active').length}
                </p>
              </div>
              <div className="w-px h-8 bg-gray-200" />
              <div>
                <p className="text-xs text-gray-400">Completed</p>
                <p className="text-lg font-semibold text-blue-600">
                  {enrolledPeople.filter(p => p.status === 'completed').length}
                </p>
              </div>
            </>
          )}
          <div className="ml-auto">
            {isAdmin && (
              <Button size="sm" onClick={() => { setShowEnrollDialog(true); setSelectedEnrollIds([]); setEnrollSearch(''); }} className="gap-1.5">
                <UserPlus className="h-3.5 w-3.5" />
                Enroll People
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={v => setActiveTab(v as any)}>
          <TabsList className="mb-4">
            <TabsTrigger value="steps">Steps ({steps.length})</TabsTrigger>
            <TabsTrigger value="people">People ({totalEnrolled})</TabsTrigger>
          </TabsList>

          {/* ── STEPS TAB ── */}
          <TabsContent value="steps">
            <div className="space-y-0">
              {steps.length === 0 ? (
                <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-xl">
                  <Mail className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p className="text-sm font-medium text-gray-500">No steps yet</p>
                  <p className="text-xs mb-4">Add an email step to get started</p>
                  {isAdmin && (
                    <Button size="sm" variant="outline" onClick={() => openStepEditor()} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      Add First Step
                    </Button>
                  )}
                </div>
              ) : (
                <div className="relative">
                  {/* Vertical connector line */}
                  <div className="absolute left-5 top-6 bottom-0 w-px bg-gray-200 z-0" style={{ bottom: '2.5rem' }} />

                  {steps.map((step, idx) => (
                    <div key={step.id} className="relative z-10 mb-0">
                      {/* Delay indicator (between steps) */}
                      {idx > 0 && (
                        <div className="flex items-center gap-2 ml-10 py-2 text-xs text-gray-400">
                          <Clock className="h-3 w-3 flex-shrink-0" />
                          {formatDelay(step.delayAmount, step.delayUnit || 'days')}
                        </div>
                      )}

                      <div className="flex items-start gap-4">
                        {/* Step node */}
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-indigo-100 border-2 border-white shadow flex items-center justify-center">
                          <Mail className="h-4 w-4 text-indigo-600" />
                        </div>

                        {/* Step card */}
                        <div className="flex-1 mb-3 bg-white border border-gray-200 rounded-xl p-4 hover:border-gray-300 transition-colors">
                          <div className="flex items-start gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-0.5">
                                <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Step {idx + 1}</span>
                                {idx === 0 && (
                                  <span className="text-xs px-1.5 py-0 rounded bg-indigo-50 text-indigo-600 border border-indigo-100">
                                    Day 0
                                  </span>
                                )}
                              </div>
                              <p className="font-medium text-gray-900">{step.name}</p>
                              <p className="text-sm text-gray-500 mt-0.5 truncate">{step.subject}</p>
                            </div>
                            {isAdmin && (
                              <div className="flex items-center gap-1 flex-shrink-0">
                                <button
                                  onClick={() => openStepEditor(step)}
                                  className="p-1.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                                >
                                  <Edit2 className="h-3.5 w-3.5" />
                                </button>
                                <button
                                  onClick={() => deleteStep.mutate(step.id)}
                                  className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* Add step */}
                  {isAdmin && (
                    <div className="flex items-center gap-4">
                      <div className="flex-shrink-0 w-10 h-10 rounded-full bg-gray-100 border-2 border-dashed border-gray-300 flex items-center justify-center">
                        <Plus className="h-4 w-4 text-gray-400" />
                      </div>
                      <button
                        onClick={() => openStepEditor()}
                        className="flex-1 py-3 px-4 border-2 border-dashed border-gray-200 rounded-xl text-sm text-gray-400 hover:border-indigo-300 hover:text-indigo-500 hover:bg-indigo-50/50 transition-all text-left"
                      >
                        + Add step
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          {/* ── PEOPLE TAB ── */}
          <TabsContent value="people">
            {enrolledPeople.length === 0 ? (
              <div className="text-center py-16 text-gray-400 border-2 border-dashed rounded-xl">
                <Users className="h-8 w-8 mx-auto mb-3 opacity-40" />
                <p className="text-sm font-medium text-gray-500">No one enrolled yet</p>
                <p className="text-xs mb-4">Enroll leads or customers to start the sequence</p>
                {isAdmin && (
                  <Button size="sm" variant="outline" onClick={() => setShowEnrollDialog(true)} className="gap-1.5">
                    <UserPlus className="h-3.5 w-3.5" />
                    Enroll People
                  </Button>
                )}
              </div>
            ) : (
              <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50 border-b border-gray-200">
                    <tr>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Contact</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Type</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Status</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Progress</th>
                      <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">Enrolled</th>
                      {isAdmin && <th className="px-4 py-3" />}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {enrolledPeople.map(person => {
                      const sc = STATUS_CONFIG[person.status] ?? STATUS_CONFIG.active;
                      const Icon = sc.icon;
                      return (
                        <tr key={person.id} className="hover:bg-gray-50 transition-colors">
                          <td className="px-4 py-3">
                            <div>
                              <p className="font-medium text-gray-900">{person.name}</p>
                              {person.email && <p className="text-xs text-gray-400">{person.email}</p>}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant="outline" className={`text-xs capitalize ${person.type === 'lead' ? 'text-purple-700 border-purple-200' : 'text-blue-700 border-blue-200'}`}>
                              {person.type}
                            </Badge>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sc.className}`}>
                              <Icon className="h-3 w-3" />
                              {sc.label}
                            </span>
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 bg-gray-100 rounded-full h-1.5 w-16">
                                <div
                                  className="bg-indigo-500 h-1.5 rounded-full transition-all"
                                  style={{ width: person.stepsTotal > 0 ? `${(person.stepsSent / person.stepsTotal) * 100}%` : '0%' }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">{person.stepsSent}/{person.stepsTotal || steps.length}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-xs text-gray-400">{timeAgo(person.startedAt)}</td>
                          {isAdmin && (
                            <td className="px-4 py-3">
                              <div className="flex items-center gap-1 justify-end">
                                {person.status === 'active' && (
                                  <button
                                    onClick={() => updateAssignment.mutate({ assignmentId: person.id, status: 'paused' })}
                                    title="Pause"
                                    className="p-1.5 rounded hover:bg-yellow-50 text-gray-400 hover:text-yellow-600 transition-colors"
                                  >
                                    <Pause className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {person.status === 'paused' && (
                                  <button
                                    onClick={() => updateAssignment.mutate({ assignmentId: person.id, status: 'active' })}
                                    title="Resume"
                                    className="p-1.5 rounded hover:bg-green-50 text-gray-400 hover:text-green-600 transition-colors"
                                  >
                                    <RotateCcw className="h-3.5 w-3.5" />
                                  </button>
                                )}
                                {['active', 'paused'].includes(person.status) && (
                                  <button
                                    onClick={() => updateAssignment.mutate({ assignmentId: person.id, status: 'cancelled' })}
                                    title="Cancel"
                                    className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                                  >
                                    <X className="h-3.5 w-3.5" />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>

        {/* ── Step editor dialog ── */}
        <Dialog open={showStepDialog} onOpenChange={setShowStepDialog}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStep ? 'Edit Step' : 'Add Step'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label>Step name</Label>
                  <Input
                    value={stepForm.name}
                    onChange={e => setStepForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="e.g. Intro email"
                    autoFocus
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>Delay before sending</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={stepForm.delayAmount}
                      onChange={e => setStepForm(p => ({ ...p, delayAmount: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                    />
                    <Select value={stepForm.delayUnit} onValueChange={v => setStepForm(p => ({ ...p, delayUnit: v }))}>
                      <SelectTrigger className="flex-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="minutes">Minutes</SelectItem>
                        <SelectItem value="hours">Hours</SelectItem>
                        <SelectItem value="days">Days</SelectItem>
                        <SelectItem value="weeks">Weeks</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <p className="text-xs text-gray-400">
                    {stepForm.delayAmount === 0 ? 'Sends immediately when enrolled' : `Sends ${stepForm.delayAmount} ${stepForm.delayUnit} after the previous step`}
                  </p>
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Email subject</Label>
                <Input
                  value={stepForm.subject}
                  onChange={e => setStepForm(p => ({ ...p, subject: e.target.value }))}
                  placeholder="Subject line…"
                />
                <p className="text-xs text-gray-400">Use <code className="bg-gray-100 px-1 rounded">{'{{client.firstName}}'}</code> for personalization</p>
              </div>
              <div className="space-y-1.5">
                <Label>Email body</Label>
                <Textarea
                  value={stepForm.body}
                  onChange={e => setStepForm(p => ({ ...p, body: e.target.value }))}
                  placeholder="Write your email here. Supports HTML and template variables like {{client.firstName}}, {{client.company}}…"
                  rows={10}
                  className="font-mono text-sm"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowStepDialog(false)}>Cancel</Button>
              <Button
                onClick={handleSaveStep}
                disabled={!stepForm.name.trim() || !stepForm.subject.trim() || createStep.isPending || updateStep.isPending}
              >
                {createStep.isPending || updateStep.isPending ? 'Saving…' : editingStep ? 'Save Changes' : 'Add Step'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Edit sequence dialog ── */}
        <Dialog open={!!editingSequence} onOpenChange={v => { if (!v) setEditingSequence(null); }}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Edit Sequence</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-1.5">
                <Label>Name</Label>
                <Input
                  value={seqForm.name}
                  onChange={e => setSeqForm(p => ({ ...p, name: e.target.value }))}
                  autoFocus
                />
              </div>
              <div className="space-y-1.5">
                <Label>Description</Label>
                <Textarea
                  value={seqForm.description}
                  onChange={e => setSeqForm(p => ({ ...p, description: e.target.value }))}
                  rows={2}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Trigger</Label>
                <Select value={seqForm.triggerType} onValueChange={v => setSeqForm(p => ({ ...p, triggerType: v }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">Manual</SelectItem>
                    <SelectItem value="on_signup">On Customer Signup</SelectItem>
                    <SelectItem value="on_purchase">On Purchase</SelectItem>
                    <SelectItem value="on_quote">On Quote Sent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditingSequence(null)}>Cancel</Button>
              <Button
                onClick={() => editingSequence && updateSeq.mutate({ id: editingSequence.id, data: seqForm })}
                disabled={!seqForm.name.trim() || updateSeq.isPending}
              >
                {updateSeq.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Delete confirm ── */}
        <Dialog open={showDeleteConfirm !== null} onOpenChange={v => { if (!v) setShowDeleteConfirm(null); }}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>Delete Sequence?</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-gray-500 py-2">
              This will permanently delete the sequence, all its steps, and all enrollment records. This cannot be undone.
            </p>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowDeleteConfirm(null)}>Cancel</Button>
              <Button
                variant="destructive"
                onClick={() => showDeleteConfirm && deleteSeq.mutate(showDeleteConfirm)}
                disabled={deleteSeq.isPending}
              >
                {deleteSeq.isPending ? 'Deleting…' : 'Delete'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Enroll contacts dialog ── */}
        <Dialog open={showEnrollDialog} onOpenChange={v => { setShowEnrollDialog(v); if (!v) { setSelectedEnrollIds([]); setEnrollSearch(''); } }}>
          <DialogContent className="sm:max-w-lg max-h-[90vh]">
            <DialogHeader>
              <DialogTitle>Enroll in "{currentSeq.name}"</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {/* Leads / Customers toggle */}
              <div className="flex gap-1 p-1 bg-gray-100 rounded-lg">
                {(['leads', 'customers'] as const).map(t => (
                  <button
                    key={t}
                    onClick={() => { setEnrollTarget(t); setSelectedEnrollIds([]); }}
                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors capitalize ${enrollTarget === t ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'}`}
                  >
                    {t}
                  </button>
                ))}
              </div>

              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400 pointer-events-none" />
                <Input
                  value={enrollSearch}
                  onChange={e => setEnrollSearch(e.target.value)}
                  placeholder="Search…"
                  className="pl-9"
                />
              </div>

              <div className="border rounded-lg max-h-72 overflow-y-auto">
                {filteredEnrollList.length === 0 ? (
                  <div className="p-8 text-center text-sm text-gray-400">No results found</div>
                ) : (
                  filteredEnrollList.map((item: any) => {
                    const id = String(item.id);
                    const label = enrollTarget === 'leads'
                      ? item.name
                      : (item.company || `${item.firstName ?? ''} ${item.lastName ?? ''}`.trim() || item.email || id);
                    const sub = enrollTarget === 'leads' ? item.company : item.email;
                    const selected = selectedEnrollIds.includes(id);
                    return (
                      <div
                        key={id}
                        onClick={() => toggleEnroll(id)}
                        className={`flex items-center gap-3 px-3 py-2.5 cursor-pointer hover:bg-gray-50 border-b last:border-b-0 ${selected ? 'bg-indigo-50' : ''}`}
                      >
                        <div className={`w-4 h-4 rounded flex items-center justify-center flex-shrink-0 border transition-colors ${selected ? 'bg-indigo-600 border-indigo-600' : 'border-gray-300'}`}>
                          {selected && <Check className="h-3 w-3 text-white" />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 truncate">{label}</p>
                          {sub && <p className="text-xs text-gray-400 truncate">{sub}</p>}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>

              {selectedEnrollIds.length > 0 && (
                <p className="text-sm text-indigo-600 font-medium">{selectedEnrollIds.length} selected</p>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowEnrollDialog(false)}>Cancel</Button>
              <Button
                onClick={() => enroll.mutate({ campaignId: selected.id, ids: selectedEnrollIds })}
                disabled={selectedEnrollIds.length === 0 || enroll.isPending || steps.length === 0}
                title={steps.length === 0 ? 'Add at least one step first' : ''}
              >
                {enroll.isPending ? 'Enrolling…' : `Enroll ${selectedEnrollIds.length > 0 ? `(${selectedEnrollIds.length})` : ''}`}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}

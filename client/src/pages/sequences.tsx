import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import {
  ChevronLeft,
  Star,
  Share2,
  HelpCircle,
  MoreHorizontal,
  Mail,
  Plus,
  ArrowDown,
  Clock,
  Trash2,
  MoreVertical,
  Users,
  Settings,
  Edit3,
  Info,
  Play,
  AlertCircle,
  Search,
  CheckCircle2,
  PauseCircle,
  XCircle,
  ChevronDown,
  Zap,
  User,
  Building2,
  Braces,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
interface DripCampaign {
  id: number;
  name: string;
  description?: string | null;
  isActive: boolean;
  triggerType?: string;
  settings?: {
    sendingWindowStart?: string;
    sendingWindowEnd?: string;
    timezone?: string;
    businessDaysOnly?: boolean;
    unsubscribeLinkText?: string;
    threadEmails?: boolean;
    includeSenderSignature?: boolean;
    exitOnReply?: boolean;
  };
  steps?: DripStep[];
  createdAt?: string;
}

interface DripStep {
  id: number;
  campaignId: number;
  stepOrder: number;
  name: string;
  subject: string;
  body: string;
  delayAmount: number;
  delayUnit: string;
  isActive: boolean;
}

interface EnrichedAssignment {
  id: number;
  campaignId: number;
  customerId?: string | null;
  leadId?: number | null;
  status: string;
  currentStepIndex: number;
  enrolledAt?: string;
  name?: string;
  type?: 'lead' | 'customer';
  stepsSent?: number;
  stepsTotal?: number;
}

const TRIGGER_LABELS: Record<string, string> = {
  manual: 'Manual',
  on_purchase: 'On Purchase',
  on_quote: 'On Quote Sent',
  on_signup: 'On Sign-up',
};

const TIMEZONE_OPTIONS = [
  { value: 'America/New_York', label: 'America/New_Y...' },
  { value: 'America/Chicago', label: 'America/Chicago' },
  { value: 'America/Denver', label: 'America/Denver' },
  { value: 'America/Los_Angeles', label: 'America/Los_A...' },
  { value: 'America/Phoenix', label: 'America/Phoenix' },
  { value: 'UTC', label: 'UTC' },
];

const UNSUB_OPTIONS = [
  { value: 'Stop hearing from me', label: 'Stop hearing from me' },
  { value: 'Unsubscribe', label: 'Unsubscribe' },
  { value: 'Opt-out', label: 'Opt-out' },
  { value: 'None', label: 'None' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────
function delayLabel(amount: number, unit: string): string {
  if (amount === 0) return 'immediately';
  return `${amount} ${amount === 1 ? unit.replace(/s$/, '') : unit}`;
}

function statusBadge(status: string) {
  switch (status) {
    case 'active':
      return <Badge className="bg-green-100 text-green-700 border-0">Active</Badge>;
    case 'paused':
      return <Badge className="bg-yellow-100 text-yellow-700 border-0">Paused</Badge>;
    case 'completed':
      return <Badge className="bg-blue-100 text-blue-700 border-0">Completed</Badge>;
    case 'cancelled':
      return <Badge className="bg-gray-100 text-gray-600 border-0">Cancelled</Badge>;
    default:
      return <Badge variant="outline">{status}</Badge>;
  }
}

// ─── Available template variables ─────────────────────────────────────────────
const TEMPLATE_VARIABLES = [
  { label: 'First Name',     token: '{{First Name}}',     group: 'Contact' },
  { label: 'Last Name',      token: '{{Last Name}}',      group: 'Contact' },
  { label: 'Full Name',      token: '{{Full Name}}',      group: 'Contact' },
  { label: 'Email',          token: '{{Email}}',          group: 'Contact' },
  { label: 'Company',        token: '{{Company}}',        group: 'Contact' },
  { label: 'Sales Rep Name', token: '{{Sales Rep Name}}', group: 'Sender' },
  { label: 'Unsubscribe Link', token: '{{Unsubscribe Link}}', group: 'Sender' },
];

// ─── Step Card ────────────────────────────────────────────────────────────────
function StepCard({
  step,
  index,
  onUpdate,
  onDelete,
}: {
  step: DripStep;
  index: number;
  onUpdate: (id: number, data: Partial<DripStep>) => void;
  onDelete: (id: number) => void;
}) {
  const [subject, setSubject] = useState(step.subject || '');
  const [body, setBody] = useState(step.body || '');
  const [showVars, setShowVars] = useState(false);
  const [activeField, setActiveField] = useState<'subject' | 'body'>('body');

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { setSubject(step.subject || ''); }, [step.subject]);
  useEffect(() => { setBody(step.body || ''); }, [step.body]);

  function insertVariable(token: string) {
    if (activeField === 'subject' && subjectRef.current) {
      const el = subjectRef.current;
      const start = el.selectionStart ?? subject.length;
      const end = el.selectionEnd ?? subject.length;
      const newVal = subject.slice(0, start) + token + subject.slice(end);
      setSubject(newVal);
      // Restore cursor after token
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      onUpdate(step.id, { subject: newVal });
    } else if (bodyRef.current) {
      const el = bodyRef.current;
      const start = el.selectionStart ?? body.length;
      const end = el.selectionEnd ?? body.length;
      const newVal = body.slice(0, start) + token + body.slice(end);
      setBody(newVal);
      requestAnimationFrame(() => {
        el.focus();
        el.setSelectionRange(start + token.length, start + token.length);
      });
      onUpdate(step.id, { body: newVal });
    }
    setShowVars(false);
  }

  return (
    <div className="bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden">
      {/* Card header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-50 border-b border-gray-100">
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded bg-indigo-100 flex items-center justify-center">
            <Mail className="h-3 w-3 text-indigo-600" />
          </div>
          <span className="text-sm font-medium text-gray-700">Step {index + 1}</span>
          <span className="text-sm text-gray-400">Automated email</span>
        </div>
        <div className="flex items-center gap-1">
          {/* Variables button */}
          <div className="relative">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-xs text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50 gap-1"
              onClick={() => setShowVars(v => !v)}
            >
              <Braces className="h-3.5 w-3.5" />
              Variables
            </Button>
            {showVars && (
              <div className="absolute right-0 top-8 z-50 w-56 bg-white border border-gray-200 rounded-lg shadow-lg py-1">
                <p className="px-3 py-1.5 text-[10px] font-semibold tracking-wider text-gray-400 uppercase border-b border-gray-100">
                  Insert variable — active field: {activeField}
                </p>
                {['Contact', 'Sender'].map(group => (
                  <div key={group}>
                    <p className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-gray-400 uppercase tracking-wide">{group}</p>
                    {TEMPLATE_VARIABLES.filter(v => v.group === group).map(v => (
                      <button
                        key={v.token}
                        className="w-full text-left flex items-center justify-between px-3 py-1.5 text-sm text-gray-700 hover:bg-indigo-50 hover:text-indigo-700 transition-colors"
                        onMouseDown={e => { e.preventDefault(); insertVariable(v.token); }}
                      >
                        <span>{v.label}</span>
                        <code className="text-[10px] text-gray-400 font-mono">{v.token}</code>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            )}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                <MoreVertical className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-500" onClick={() => onDelete(step.id)}>
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Remove step
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Subject */}
      <div className="flex items-center px-4 py-2.5 border-b border-gray-100">
        <span className="text-xs font-medium text-gray-400 w-14 shrink-0">Subject</span>
        <input
          ref={subjectRef}
          type="text"
          className="flex-1 text-sm text-gray-800 bg-transparent outline-none placeholder:text-gray-300"
          placeholder="Enter email subject…"
          value={subject}
          onChange={e => setSubject(e.target.value)}
          onFocus={() => { setActiveField('subject'); setShowVars(false); }}
          onBlur={() => {
            if (subject !== (step.subject || '')) onUpdate(step.id, { subject });
          }}
        />
      </div>

      {/* Body */}
      <div className="px-4 py-3">
        <textarea
          ref={bodyRef}
          className="w-full text-sm text-gray-700 bg-transparent outline-none resize-none placeholder:text-gray-300 min-h-[80px]"
          placeholder="Start typing, or pick a template (use ↑↓ to navigate)"
          value={body}
          onChange={e => setBody(e.target.value)}
          onFocus={() => { setActiveField('body'); setShowVars(false); }}
          onBlur={() => {
            if (body !== (step.body || '')) onUpdate(step.id, { body });
          }}
          rows={4}
        />
        <div className="mt-2 pt-2 border-t border-gray-100">
          <p className="text-[10px] font-semibold tracking-wider text-gray-400 uppercase mb-1">
            Favorite Templates
          </p>
          <p className="text-xs text-gray-300">Templates that you favorite will appear here</p>
          <div className="mt-2 flex items-center gap-1.5 text-xs text-indigo-500 cursor-pointer hover:text-indigo-700">
            <div className="w-4 h-4 rounded border border-indigo-300 flex items-center justify-center">
              <Mail className="h-2.5 w-2.5" />
            </div>
            View all templates
          </div>
        </div>
      </div>

      {/* Click-outside overlay to close vars panel */}
      {showVars && (
        <div className="fixed inset-0 z-40" onClick={() => setShowVars(false)} />
      )}
    </div>
  );
}

// ─── Enroll Dialog ────────────────────────────────────────────────────────────
function EnrollDialog({
  open,
  onClose,
  campaignId,
}: {
  open: boolean;
  onClose: () => void;
  campaignId: number;
}) {
  const { toast } = useToast();
  const [type, setType] = useState<'lead' | 'customer'>('lead');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ['/api/leads', { limit: 100 }],
    enabled: open && type === 'lead',
  });

  const { data: customers = [] } = useQuery<any[]>({
    queryKey: ['/api/customers', { limit: 100 }],
    enabled: open && type === 'customer',
  });

  const items = type === 'lead'
    ? leads.filter((l: any) => (l.name || l.firstName || '').toLowerCase().includes(search.toLowerCase()))
    : (customers as any[]).filter((c: any) => (c.company || '').toLowerCase().includes(search.toLowerCase()));

  const enroll = useMutation({
    mutationFn: async () => {
      const promises = Array.from(selected).map(id => {
        const body = type === 'lead'
          ? { leadId: parseInt(id), campaignId }
          : { customerId: id, campaignId };
        return apiRequest('POST', `/api/drip-campaigns/${campaignId}/assignments`, body);
      });
      await Promise.all(promises);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', campaignId, 'assignments', 'enriched'] });
      toast({ title: `${selected.size} contact(s) enrolled` });
      setSelected(new Set());
      onClose();
    },
    onError: () => toast({ title: 'Failed to enroll', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Enroll Recipients</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-3">
          {(['lead', 'customer'] as const).map(t => (
            <Button
              key={t}
              variant={type === t ? 'default' : 'outline'}
              size="sm"
              onClick={() => { setType(t); setSelected(new Set()); }}
              className="capitalize"
            >
              {t === 'lead' ? <User className="h-3.5 w-3.5 mr-1.5" /> : <Building2 className="h-3.5 w-3.5 mr-1.5" />}
              {t}s
            </Button>
          ))}
        </div>

        <div className="relative mb-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="Search…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9 h-8 text-sm"
          />
        </div>

        <div className="border rounded-lg max-h-56 overflow-y-auto divide-y">
          {items.slice(0, 50).map((item: any) => {
            const id = String(type === 'lead' ? item.id : item.id);
            const label = type === 'lead' ? (item.name || `${item.firstName || ''} ${item.lastName || ''}`.trim() || `Lead #${item.id}`) : (item.company || `Customer #${item.id}`);
            return (
              <label key={id} className="flex items-center gap-3 px-3 py-2 hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={selected.has(id)}
                  onChange={e => {
                    const n = new Set(selected);
                    e.target.checked ? n.add(id) : n.delete(id);
                    setSelected(n);
                  }}
                  className="rounded"
                />
                <span className="text-sm text-gray-800">{label}</span>
              </label>
            );
          })}
          {items.length === 0 && (
            <p className="text-sm text-gray-400 text-center py-6">No results</p>
          )}
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={selected.size === 0 || enroll.isPending}
            onClick={() => enroll.mutate()}
          >
            Enroll {selected.size > 0 ? `(${selected.size})` : ''}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── New Sequence Dialog ───────────────────────────────────────────────────────
function NewSequenceDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (id: number) => void;
}) {
  const { toast } = useToast();
  const [name, setName] = useState('');

  const create = useMutation({
    mutationFn: () => apiRequest('POST', '/api/drip-campaigns', { name: name || 'Untitled Sequence', isActive: false, triggerType: 'manual' }),
    onSuccess: async (res: any) => {
      const data = await res.json();
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      onCreated(data.id);
      setName('');
      onClose();
    },
    onError: () => toast({ title: 'Failed to create sequence', variant: 'destructive' }),
  });

  return (
    <Dialog open={open} onOpenChange={v => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>New Sequence</DialogTitle>
        </DialogHeader>
        <Input
          placeholder="e.g. CliQ Aqueous Products – New Customer Intro"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && create.mutate()}
          autoFocus
        />
        <p className="text-xs text-gray-400 mt-1.5 leading-relaxed">
          Use the format <span className="font-medium text-gray-500">[Product / Campaign] – [Audience or Stage]</span> so you can instantly tell who this sequence targets and why. A clear name makes it easy to enroll the right people and track results.
        </p>
        <DialogFooter className="mt-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SequencesPage() {
  const { toast } = useToast();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'editor' | 'recipients' | 'settings'>('editor');
  const [showNewDialog, setShowNewDialog] = useState(false);
  const [showEnroll, setShowEnroll] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [addingStep, setAddingStep] = useState(false);
  const [newStepName, setNewStepName] = useState('');

  // ── Queries ──────────────────────────────────────────────────────────────
  const { data: campaigns = [], isLoading } = useQuery<DripCampaign[]>({
    queryKey: ['/api/drip-campaigns'],
  });

  const { data: currentSeq } = useQuery<DripCampaign>({
    queryKey: ['/api/drip-campaigns', selectedId],
    enabled: selectedId !== null,
  });

  const { data: enrichedAssignments = [] } = useQuery<EnrichedAssignment[]>({
    queryKey: ['/api/drip-campaigns', selectedId, 'assignments', 'enriched'],
    queryFn: async () => {
      const res = await fetch(`/api/drip-campaigns/${selectedId}/assignments/enriched`);
      return res.json();
    },
    enabled: selectedId !== null,
  });

  // Local settings state (right panel), synced when campaign loads
  const [localSettings, setLocalSettings] = useState<NonNullable<DripCampaign['settings']>>({
    sendingWindowStart: '09:00',
    sendingWindowEnd: '17:00',
    timezone: 'America/New_York',
    businessDaysOnly: true,
    unsubscribeLinkText: 'Stop hearing from me',
    threadEmails: true,
    includeSenderSignature: true,
    exitOnReply: true,
  });

  useEffect(() => {
    if (currentSeq?.settings) {
      setLocalSettings(s => ({ ...s, ...currentSeq.settings }));
    }
  }, [currentSeq?.id]);

  // Name/description inline editing
  const [localName, setLocalName] = useState('');
  const [localDesc, setLocalDesc] = useState('');
  useEffect(() => {
    if (currentSeq) {
      setLocalName(currentSeq.name);
      setLocalDesc(currentSeq.description || '');
    }
  }, [currentSeq?.id]);

  // ── Mutations ─────────────────────────────────────────────────────────────
  const updateCampaign = useMutation({
    mutationFn: (data: Partial<DripCampaign>) =>
      apiRequest('PATCH', `/api/drip-campaigns/${selectedId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] }),
    onError: () => toast({ title: 'Save failed', variant: 'destructive' }),
  });

  const deleteCampaign = useMutation({
    mutationFn: () => apiRequest('DELETE', `/api/drip-campaigns/${selectedId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns'] });
      setSelectedId(null);
      toast({ title: 'Sequence deleted' });
    },
    onError: () => toast({ title: 'Delete failed', variant: 'destructive' }),
  });

  const createStep = useMutation({
    mutationFn: (data: any) => apiRequest('POST', `/api/drip-campaigns/${selectedId}/steps`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] });
      setAddingStep(false);
      setNewStepName('');
    },
    onError: () => toast({ title: 'Failed to add step', variant: 'destructive' }),
  });

  const updateStep = useMutation({
    mutationFn: ({ stepId, data }: { stepId: number; data: Partial<DripStep> }) =>
      apiRequest('PATCH', `/api/drip-campaigns/${selectedId}/steps/${stepId}`, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] }),
    onError: () => toast({ title: 'Failed to update step', variant: 'destructive' }),
  });

  const deleteStep = useMutation({
    mutationFn: (stepId: number) =>
      apiRequest('DELETE', `/api/drip-campaigns/${selectedId}/steps/${stepId}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId] }),
    onError: () => toast({ title: 'Failed to delete step', variant: 'destructive' }),
  });

  const updateAssignment = useMutation({
    mutationFn: ({ id, status }: { id: number; status: string }) =>
      apiRequest('PATCH', `/api/drip-campaigns/assignments/${id}`, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/drip-campaigns', selectedId, 'assignments', 'enriched'] }),
  });

  // ── Settings save helper ──────────────────────────────────────────────────
  function saveSettings(patch: NonNullable<DripCampaign['settings']>) {
    const merged = { ...localSettings, ...patch };
    setLocalSettings(merged);
    updateCampaign.mutate({ settings: merged });
  }

  const steps = (currentSeq?.steps || []).sort((a, b) => a.stepOrder - b.stepOrder);

  // ─────────────────────────────────────────────────────────────────────────
  // LIST VIEW
  // ─────────────────────────────────────────────────────────────────────────
  if (!selectedId) {
    return (
      <div className="flex flex-col h-full bg-gray-50">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 bg-white border-b">
          <div className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-indigo-500" />
            <h1 className="text-lg font-semibold text-gray-900">Sequences</h1>
            <span className="text-sm text-gray-400 ml-2">{campaigns.length} sequences</span>
          </div>
          <Button
            size="sm"
            onClick={() => setShowNewDialog(true)}
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            New Sequence
          </Button>
        </div>

        {/* Table */}
        <div className="flex-1 overflow-auto px-6 py-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-40 text-gray-400">Loading…</div>
          ) : campaigns.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-60 gap-3 text-center">
              <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center">
                <Zap className="h-6 w-6 text-indigo-400" />
              </div>
              <p className="text-sm font-medium text-gray-700">No sequences yet</p>
              <p className="text-xs text-gray-400">Create your first automated email sequence</p>
              <Button size="sm" onClick={() => setShowNewDialog(true)}>
                <Plus className="h-4 w-4 mr-1.5" />
                New Sequence
              </Button>
            </div>
          ) : (
            <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Name</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Trigger</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Status</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Steps</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500 text-xs">Created</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {campaigns.map(c => (
                    <tr
                      key={c.id}
                      className="hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => { setSelectedId(c.id); setActiveTab('editor'); }}
                    >
                      <td className="px-4 py-3 font-medium text-gray-800">{c.name}</td>
                      <td className="px-4 py-3 text-gray-500">
                        {TRIGGER_LABELS[c.triggerType || 'manual'] || c.triggerType}
                      </td>
                      <td className="px-4 py-3">
                        {c.isActive
                          ? <Badge className="bg-green-100 text-green-700 border-0 text-xs">Active</Badge>
                          : <Badge className="bg-gray-100 text-gray-500 border-0 text-xs">Draft</Badge>}
                      </td>
                      <td className="px-4 py-3 text-gray-500">{(c.steps || []).length}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">
                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString() : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <NewSequenceDialog
          open={showNewDialog}
          onClose={() => setShowNewDialog(false)}
          onCreated={id => setSelectedId(id)}
        />
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // DETAIL VIEW (Attio-style)
  // ─────────────────────────────────────────────────────────────────────────
  if (!currentSeq) {
    return <div className="flex items-center justify-center h-full text-gray-400">Loading sequence…</div>;
  }

  return (
    <div className="flex flex-col h-full bg-white">
      {/* ── Top breadcrumb bar ─────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b bg-white z-10">
        <div className="flex items-center gap-1.5 text-sm">
          <button
            onClick={() => setSelectedId(null)}
            className="flex items-center gap-1 text-gray-500 hover:text-gray-800 transition-colors"
          >
            <ChevronLeft className="h-4 w-4" />
            Sequences
          </button>
          <span className="text-gray-300">/</span>
          <span className="font-medium text-gray-800">{currentSeq.name}</span>
          <button className="ml-1 text-gray-300 hover:text-yellow-400 transition-colors">
            <Star className="h-4 w-4" />
          </button>
        </div>
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" className="gap-1.5 text-sm text-gray-600">
            <Share2 className="h-4 w-4" />
            Share
          </Button>
          <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
            <HelpCircle className="h-4 w-4 text-gray-400" />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className="w-8 h-8 p-0">
                <MoreHorizontal className="h-4 w-4 text-gray-400" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-red-500"
                onClick={() => setShowDeleteConfirm(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                Delete sequence
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Sub-nav: Tabs + Enable toggle + Enroll button ──────────────── */}
      <div className="flex items-center justify-between px-4 py-1.5 border-b bg-white">
        {/* Tabs */}
        <div className="flex items-center gap-0">
          {(['editor', 'recipients', 'settings'] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              {tab === 'editor' && <Edit3 className="h-3.5 w-3.5" />}
              {tab === 'recipients' && <Users className="h-3.5 w-3.5" />}
              {tab === 'settings' && <Settings className="h-3.5 w-3.5" />}
              <span className="capitalize">{tab}</span>
              {tab === 'recipients' && (
                <span className="ml-0.5 text-xs text-gray-400">{enrichedAssignments.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Right controls */}
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={currentSeq.isActive}
              onCheckedChange={v => updateCampaign.mutate({ isActive: v })}
            />
            <span className="text-sm text-gray-600">Enable sequence</span>
          </div>
          <Button
            size="sm"
            className="bg-indigo-600 hover:bg-indigo-700 text-white"
            onClick={() => setShowEnroll(true)}
          >
            Enroll recipients
          </Button>
        </div>
      </div>

      {/* ── Main content area ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── Center / Editor column ─────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto bg-gray-50">

          {/* ── EDITOR TAB ──────────────────────────────────────────── */}
          {activeTab === 'editor' && (
            <div className="flex flex-col items-center py-6 px-4 min-h-full">

              {/* Not published banner */}
              {!currentSeq.isActive && (
                <div className="w-full max-w-2xl mb-5">
                  <div className="flex items-center justify-between bg-blue-50 border border-blue-200 rounded-lg px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <Info className="h-4 w-4 text-blue-500" />
                      <span className="text-sm text-blue-700">This sequence has not yet been published</span>
                    </div>
                    <Button
                      size="sm"
                      className="bg-indigo-600 hover:bg-indigo-700 text-white h-7 text-xs"
                      onClick={() => updateCampaign.mutate({ isActive: true })}
                    >
                      Publish sequence
                    </Button>
                  </div>
                </div>
              )}

              {/* Start trigger row */}
              <div className="w-full max-w-2xl mb-4">
                <div className="flex items-center gap-2 text-sm text-gray-500">
                  <div className="w-4 h-4 rounded-full border-2 border-gray-300 flex items-center justify-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400" />
                  </div>
                  <span>Start</span>
                  <button className="inline-flex items-center gap-1 font-medium text-gray-800 hover:text-indigo-600 transition-colors">
                    immediately
                    <ChevronDown className="h-3.5 w-3.5" />
                  </button>
                  <span>after enrollment</span>
                  <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
                </div>
              </div>

              {/* Steps */}
              <div className="w-full max-w-2xl flex flex-col gap-0">
                {steps.map((step, idx) => (
                  <div key={step.id} className="flex flex-col">
                    {/* Delay indicator between steps (not before first) */}
                    {idx > 0 && (
                      <div className="flex flex-col items-center py-2">
                        <div className="w-px h-4 bg-gray-300" />
                        <div className="flex items-center gap-1.5 my-1 px-3 py-1 rounded-full bg-white border border-gray-200 text-xs text-gray-500 shadow-sm">
                          <Clock className="h-3 w-3" />
                          Wait {delayLabel(step.delayAmount, step.delayUnit)}
                        </div>
                        <div className="w-px h-4 bg-gray-300" />
                      </div>
                    )}
                    <StepCard
                      step={step}
                      index={idx}
                      onUpdate={(id, data) => updateStep.mutate({ stepId: id, data })}
                      onDelete={id => deleteStep.mutate(id)}
                    />
                  </div>
                ))}
              </div>

              {/* Add step */}
              <div className="w-full max-w-2xl mt-4 flex flex-col items-center">
                <div className="w-px h-5 bg-gray-300" />
                {addingStep ? (
                  <div className="bg-white border border-gray-200 rounded-lg shadow-sm p-4 w-full">
                    <p className="text-xs font-semibold text-gray-500 mb-2">New Step</p>
                    <Input
                      placeholder="Step name (e.g. Introduction email)"
                      value={newStepName}
                      onChange={e => setNewStepName(e.target.value)}
                      className="mb-3 text-sm"
                      autoFocus
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          createStep.mutate({
                            name: newStepName || 'Step',
                            subject: '',
                            body: '',
                            delayAmount: steps.length === 0 ? 0 : 3,
                            delayUnit: 'days',
                            stepOrder: steps.length + 1,
                          });
                        }
                        if (e.key === 'Escape') setAddingStep(false);
                      }}
                    />
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        disabled={createStep.isPending}
                        onClick={() => createStep.mutate({
                          name: newStepName || 'Step',
                          subject: '',
                          body: '',
                          delayAmount: steps.length === 0 ? 0 : 3,
                          delayUnit: 'days',
                          stepOrder: steps.length + 1,
                        })}
                      >
                        Add step
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setAddingStep(false)}>Cancel</Button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => setAddingStep(true)}
                    className="flex items-center gap-2 px-4 py-2 rounded-full border border-dashed border-gray-300 bg-white text-sm text-gray-500 hover:border-indigo-400 hover:text-indigo-600 transition-colors shadow-sm"
                  >
                    <Plus className="h-4 w-4" />
                    Add step to sequence
                  </button>
                )}
              </div>
            </div>
          )}

          {/* ── RECIPIENTS TAB ──────────────────────────────────────── */}
          {activeTab === 'recipients' && (
            <div className="p-6">
              {enrichedAssignments.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-48 gap-3 text-center">
                  <Users className="h-8 w-8 text-gray-300" />
                  <p className="text-sm text-gray-500">No recipients enrolled yet</p>
                  <Button size="sm" onClick={() => setShowEnroll(true)}>
                    <Plus className="h-4 w-4 mr-1.5" />
                    Enroll recipients
                  </Button>
                </div>
              ) : (
                <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b bg-gray-50">
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Name</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Type</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Status</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Progress</th>
                        <th className="text-left px-4 py-3 text-xs font-medium text-gray-500">Enrolled</th>
                        <th className="px-4 py-3" />
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100">
                      {enrichedAssignments.map(a => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-3 font-medium text-gray-800">
                            {a.name || `#${a.id}`}
                          </td>
                          <td className="px-4 py-3 text-gray-500 capitalize">
                            {a.type || '—'}
                          </td>
                          <td className="px-4 py-3">{statusBadge(a.status)}</td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-2">
                              <div className="w-20 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-indigo-500 rounded-full"
                                  style={{ width: `${a.stepsTotal ? (a.stepsSent || 0) / a.stepsTotal * 100 : 0}%` }}
                                />
                              </div>
                              <span className="text-xs text-gray-400">
                                {a.stepsSent || 0}/{a.stepsTotal || steps.length}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-3 text-gray-400 text-xs">
                            {a.enrolledAt ? new Date(a.enrolledAt).toLocaleDateString() : '—'}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {a.status === 'active' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-yellow-600"
                                  onClick={() => updateAssignment.mutate({ id: a.id, status: 'paused' })}
                                >
                                  <PauseCircle className="h-3.5 w-3.5 mr-1" />
                                  Pause
                                </Button>
                              )}
                              {a.status === 'paused' && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-green-600"
                                  onClick={() => updateAssignment.mutate({ id: a.id, status: 'active' })}
                                >
                                  <Play className="h-3.5 w-3.5 mr-1" />
                                  Resume
                                </Button>
                              )}
                              {(a.status === 'active' || a.status === 'paused') && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs text-red-500"
                                  onClick={() => updateAssignment.mutate({ id: a.id, status: 'cancelled' })}
                                >
                                  <XCircle className="h-3.5 w-3.5 mr-1" />
                                  Cancel
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* ── SETTINGS TAB ────────────────────────────────────────── */}
          {activeTab === 'settings' && (
            <div className="p-6 max-w-md">
              <div className="bg-white border border-gray-200 rounded-lg p-4 space-y-4">
                <div>
                  <label className="text-xs font-medium text-gray-500 mb-1 block">Trigger Type</label>
                  <Select
                    value={currentSeq.triggerType || 'manual'}
                    onValueChange={v => updateCampaign.mutate({ triggerType: v })}
                  >
                    <SelectTrigger className="text-sm h-9">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(TRIGGER_LABELS).map(([v, l]) => (
                        <SelectItem key={v} value={v}>{l}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="pt-4 border-t">
                  <p className="text-xs font-medium text-red-500 mb-2">Danger Zone</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-red-500 border-red-200 hover:bg-red-50"
                    onClick={() => setShowDeleteConfirm(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                    Delete this sequence
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* ── Right settings panel ────────────────────────────────────── */}
        {(activeTab === 'editor' || activeTab === 'recipients') && (
          <div className="w-72 border-l border-gray-200 bg-white overflow-y-auto shrink-0">
            <div className="p-4 space-y-5">

              {/* Sequence name */}
              <div>
                <input
                  type="text"
                  className="w-full font-semibold text-gray-900 text-base bg-transparent outline-none border-0 p-0 placeholder:text-gray-300"
                  value={localName}
                  onChange={e => setLocalName(e.target.value)}
                  onBlur={() => {
                    if (localName !== currentSeq.name) {
                      updateCampaign.mutate({ name: localName });
                    }
                  }}
                  placeholder="Sequence name"
                />
                <textarea
                  className="w-full text-sm text-gray-400 bg-transparent outline-none resize-none mt-1 placeholder:text-gray-300"
                  rows={2}
                  placeholder="Add a description…"
                  value={localDesc}
                  onChange={e => setLocalDesc(e.target.value)}
                  onBlur={() => {
                    if (localDesc !== (currentSeq.description || '')) {
                      updateCampaign.mutate({ description: localDesc });
                    }
                  }}
                />
              </div>

              {/* Delivery */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-800 mb-3">Delivery</p>

                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">Sending window</p>
                  <div className="flex items-center gap-1.5">
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.sendingWindowStart || '09:00'}
                      onChange={e => saveSettings({ sendingWindowStart: e.target.value })}
                    >
                      {['06:00','07:00','08:00','09:00','10:00','11:00','12:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <span className="text-gray-400 text-xs">-</span>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.sendingWindowEnd || '17:00'}
                      onChange={e => saveSettings({ sendingWindowEnd: e.target.value })}
                    >
                      {['12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:00','20:00'].map(t => (
                        <option key={t} value={t}>{t}</option>
                      ))}
                    </select>
                    <select
                      className="flex-1 text-xs border border-gray-200 rounded px-2 py-1.5 bg-white text-gray-700 focus:outline-none focus:border-indigo-400"
                      value={localSettings.timezone || 'America/New_York'}
                      onChange={e => saveSettings({ timezone: e.target.value })}
                    >
                      {TIMEZONE_OPTIONS.map(tz => (
                        <option key={tz.value} value={tz.value}>{tz.label}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm text-gray-700">Business days only</span>
                    <HelpCircle className="h-3.5 w-3.5 text-gray-300" />
                  </div>
                  <Switch
                    checked={!!localSettings.businessDaysOnly}
                    onCheckedChange={v => saveSettings({ businessDaysOnly: v })}
                  />
                </div>
              </div>

              {/* Email */}
              <div className="border-t pt-4">
                <p className="text-sm font-semibold text-gray-800 mb-3">Email</p>

                <div className="mb-3">
                  <p className="text-xs text-gray-500 mb-1.5">Unsubscribe link</p>
                  <Select
                    value={localSettings.unsubscribeLinkText || 'Stop hearing from me'}
                    onValueChange={v => saveSettings({ unsubscribeLinkText: v })}
                  >
                    <SelectTrigger className="text-xs h-8">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {UNSUB_OPTIONS.map(o => (
                        <SelectItem key={o.value} value={o.value} className="text-sm">{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-gray-700">Thread emails</span>
                  <Switch
                    checked={!!localSettings.threadEmails}
                    onCheckedChange={v => saveSettings({ threadEmails: v })}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700">Include sender signature</span>
                  <Switch
                    checked={!!localSettings.includeSenderSignature}
                    onCheckedChange={v => saveSettings({ includeSenderSignature: v })}
                  />
                </div>
              </div>

              {/* Exit criteria */}
              <div className="border-t pt-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-800">Exit criteria</p>
                </div>

                <div className="flex flex-col gap-1 px-3 py-2.5 bg-gray-50 rounded-lg border border-gray-100">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className={`h-4 w-4 ${localSettings.exitOnReply ? 'text-green-500' : 'text-gray-300'}`} />
                      <span className="text-sm text-gray-700">Reply received</span>
                    </div>
                    <Switch
                      checked={!!localSettings.exitOnReply}
                      onCheckedChange={v => saveSettings({ exitOnReply: v })}
                    />
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5 pl-6">
                    {localSettings.exitOnReply
                      ? 'When a recipient replies, the sequence stops automatically — no further steps will send.'
                      : 'Enable to stop the sequence when the recipient replies.'}
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ── Dialogs ─────────────────────────────────────────────────────── */}
      <EnrollDialog
        open={showEnroll}
        onClose={() => setShowEnroll(false)}
        campaignId={selectedId}
      />

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete sequence?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{currentSeq.name}" and all its steps and enrollments.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => { setShowDeleteConfirm(false); deleteCampaign.mutate(); }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <NewSequenceDialog
        open={showNewDialog}
        onClose={() => setShowNewDialog(false)}
        onCreated={id => setSelectedId(id)}
      />
    </div>
  );
}

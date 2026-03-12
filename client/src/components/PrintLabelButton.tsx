import { useState, useEffect, createContext, useContext } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Loader2, X, Users } from "lucide-react";

export interface CustomerAddress {
  id: string;
  company?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  province?: string | null;
  zip?: string | null;
  country?: string | null;
}

interface ServerQueueItem {
  id: number;
  customerId: string | null;
  leadId: number | null;
  addedBy: string | null;
  addedAt: string;
  address: CustomerAddress | null;
}

interface LabelQueueContextType {
  queue: ServerQueueItem[];
  isLoading: boolean;
  addToQueue: (customer: CustomerAddress, leadId?: number) => Promise<void>;
  addToQueueAndOpen: (customer: CustomerAddress, leadId?: number) => Promise<void>;
  addBulkToQueueAndOpen: (items: { customer: CustomerAddress; leadId?: number }[]) => Promise<void>;
  removeFromQueue: (entityId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  isInQueue: (entityId: string) => boolean;
  openPrintDialog: () => void;
}

const LabelQueueContext = createContext<LabelQueueContextType | null>(null);

export function useLabelQueue() {
  const ctx = useContext(LabelQueueContext);
  if (!ctx) throw new Error("useLabelQueue must be used within LabelQueueProvider");
  return ctx;
}

function entityId(item: ServerQueueItem): string {
  if (item.customerId) return item.customerId;
  if (item.leadId) return `lead-${item.leadId}`;
  return String(item.id);
}

export function LabelQueueProvider({ children }: { children: React.ReactNode }) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: queue = [], isLoading } = useQuery<ServerQueueItem[]>({
    queryKey: ['/api/label-queue'],
    refetchInterval: 30000,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['/api/label-queue'] });

  const addMutation = useMutation({
    mutationFn: async ({ customerId, leadId }: { customerId?: string; leadId?: number }) => {
      const res = await apiRequest('POST', '/api/label-queue', { customerId, leadId });
      return res.json();
    },
    onSuccess: invalidate,
  });

  const removeMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/label-queue/${id}`);
    },
    onSuccess: invalidate,
  });

  const clearMutation = useMutation({
    mutationFn: async () => {
      await apiRequest('DELETE', '/api/label-queue/clear');
    },
    onSuccess: invalidate,
  });

  const isInQueue = (id: string) => queue.some(item => entityId(item) === id);

  const addToQueue = async (customer: CustomerAddress, leadId?: number) => {
    const id = leadId ? `lead-${leadId}` : customer.id;
    if (isInQueue(id)) return;
    await addMutation.mutateAsync(leadId ? { leadId } : { customerId: customer.id });
  };

  const addToQueueAndOpen = async (customer: CustomerAddress, leadId?: number) => {
    await addToQueue(customer, leadId);
    setDialogOpen(true);
  };

  const addBulkToQueueAndOpen = async (items: { customer: CustomerAddress; leadId?: number }[]) => {
    const newItems = items.filter(i => {
      const id = i.leadId ? `lead-${i.leadId}` : i.customer.id;
      return !isInQueue(id);
    });
    await Promise.all(newItems.map(i =>
      addMutation.mutateAsync(i.leadId ? { leadId: i.leadId } : { customerId: i.customer.id })
    ));
    await invalidate();
    setDialogOpen(true);
    toast({ title: `Added ${newItems.length} address${newItems.length !== 1 ? 'es' : ''} to the shared queue` });
  };

  const removeFromQueue = async (id: string) => {
    const item = queue.find(q => entityId(q) === id);
    if (!item) return;
    await removeMutation.mutateAsync(item.id);
  };

  const clearQueue = async () => {
    await clearMutation.mutateAsync();
  };

  const openPrintDialog = () => setDialogOpen(true);

  return (
    <LabelQueueContext.Provider value={{ queue, isLoading, addToQueue, addToQueueAndOpen, addBulkToQueueAndOpen, removeFromQueue, clearQueue, isInQueue, openPrintDialog }}>
      {children}
      <BatchPrintDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </LabelQueueContext.Provider>
  );
}

function formatContactName(c: CustomerAddress) {
  const name = [c.firstName, c.lastName].filter(Boolean).join(' ');
  return name || c.company || 'Customer';
}

function formatAddressPreview(c: CustomerAddress) {
  const name = formatContactName(c);
  const lines = [name];
  if (c.company && name !== c.company) lines.push(c.company);
  if (c.address1) lines.push(c.address1);
  if (c.address2) lines.push(c.address2);
  const cityLine = [c.city, c.province, c.zip].filter(Boolean).join(', ');
  if (cityLine) lines.push(cityLine);
  return lines;
}

type LabelFormat = 'thermal_4x6' | 'letter_30up';

interface MailerType {
  id: number;
  name: string;
  thumbnailPath: string;
  isActive: boolean;
  displayOrder: number;
}

interface ConflictData {
  sameMailer: { name: string; sentDate: string; entityType: string }[];
  tooRecent: { name: string; lastMailerDate: string; daysAgo: number; entityType: string }[];
  totalConflicts: number;
}

function getQueueItemName(q: ServerQueueItem): string {
  const a = q.address;
  if (!a) return 'Unknown';
  return a.company || [a.firstName, a.lastName].filter(Boolean).join(' ') || 'Unknown';
}

function BatchPrintDialog({ open, onOpenChange }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { queue, removeFromQueue, clearQueue } = useLabelQueue();
  const [labelType, setLabelType] = useState<'swatch_book' | 'press_test_kit' | 'mailer' | 'letter' | 'other'>('swatch_book');
  const [labelOtherDescription, setLabelOtherDescription] = useState('');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('thermal_4x6');
  const [selectedMailerId, setSelectedMailerId] = useState<number | null>(null);
  const [conflictData, setConflictData] = useState<ConflictData | null>(null);
  const [isCheckingConflicts, setIsCheckingConflicts] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: mailerTypes = [] } = useQuery<MailerType[]>({
    queryKey: ['/api/admin/mailer-types'],
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    setSelectedMailerId(null);
    setConflictData(null);
  }, [labelType]);

  const executePrint = async () => {
    const payload: Record<string, unknown> = {
      labelType,
      labelFormat,
      otherDescription: labelType === 'other' ? labelOtherDescription : undefined,
      mailerId: labelType === 'mailer' && selectedMailerId ? selectedMailerId : undefined,
      addresses: queue
        .filter(q => q.address)
        .map(q => ({
          customerId: q.leadId ? undefined : q.customerId,
          leadId: q.leadId ?? undefined,
        })),
    };
    const res = await apiRequest('POST', '/api/labels/print-batch', payload);
    return res.json();
  };

  const printMutation = useMutation({
    mutationFn: executePrint,
    onSuccess: async (data) => {
      if (!data.pdf) {
        toast({ title: 'Failed to print labels', description: 'No PDF data received', variant: 'destructive' });
        return;
      }
      const byteCharacters = atob(data.pdf);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `labels-batch-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      const labelsPerPage = labelFormat === 'letter_30up' ? 30 : 4;
      toast({ title: 'Labels printed', description: `${queue.length} labels generated on ${Math.ceil(queue.length / labelsPerPage)} page(s)` });

      queue.forEach(q => {
        if (q.customerId) {
          queryClient.invalidateQueries({ queryKey: ['/api/customers', q.customerId, 'label-stats'] });
          queryClient.invalidateQueries({ queryKey: ['/api/customers', q.customerId, 'activity'] });
        }
        if (q.leadId) {
          queryClient.invalidateQueries({ queryKey: ['/api/leads', q.leadId, 'activities'] });
        }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/label-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/labels/today'] });

      await clearQueue();
      setConflictData(null);
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to print labels', description: error.message, variant: 'destructive' });
    },
  });

  const handlePrintClick = async () => {
    // Only run conflict checks for mailers
    if (labelType !== 'mailer') {
      printMutation.mutate();
      return;
    }
    const selectedMailer = mailerTypes.find(m => m.id === selectedMailerId);
    const addresses = queue
      .filter(q => q.address)
      .map(q => ({
        customerId: q.leadId ? undefined : q.customerId ?? undefined,
        leadId: q.leadId ?? undefined,
        name: getQueueItemName(q),
      }));
    setIsCheckingConflicts(true);
    try {
      const res = await apiRequest('POST', '/api/labels/check-mailer-conflicts', {
        mailerId: selectedMailerId,
        mailerName: selectedMailer?.name ?? null,
        addresses,
      });
      const data: ConflictData = await res.json();
      if (data.totalConflicts > 0) {
        setConflictData(data);
      } else {
        printMutation.mutate();
      }
    } catch {
      // If check fails, proceed anyway
      printMutation.mutate();
    } finally {
      setIsCheckingConflicts(false);
    }
  };

  const canPrint = queue.length >= 1
    && (labelType !== 'other' || labelOtherDescription.trim())
    && (labelType !== 'mailer' || selectedMailerId !== null || mailerTypes.length === 0);
  const labelsPerPage = labelFormat === 'letter_30up' ? 30 : 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-600" />
            Print Address Labels
          </DialogTitle>
          <DialogDescription className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-blue-500" />
            Shared queue — all team members contribute to this list.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          <div className="grid gap-2">
            <Label>Label Format</Label>
            <RadioGroup value={labelFormat} onValueChange={(v) => setLabelFormat(v as LabelFormat)} className="grid grid-cols-2 gap-3">
              <label
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                  labelFormat === 'thermal_4x6' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <RadioGroupItem value="thermal_4x6" className="sr-only" />
                <div className="flex items-center gap-1.5">
                  <div className="w-4 h-6 border-2 border-current rounded-sm" />
                  <span className="text-sm font-medium">4×6 Thermal</span>
                </div>
                <span className="text-[11px] text-slate-500">4 labels per sheet</span>
              </label>
              <label
                className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 cursor-pointer transition-all ${
                  labelFormat === 'letter_30up' ? 'border-blue-500 bg-blue-50' : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <RadioGroupItem value="letter_30up" className="sr-only" />
                <div className="flex items-center gap-1.5">
                  <div className="w-5 h-6 border-2 border-current rounded-sm grid grid-cols-3 grid-rows-3 gap-px p-px">
                    {Array.from({length: 9}).map((_, i) => <div key={i} className="bg-current rounded-[1px] opacity-40" />)}
                  </div>
                  <span className="text-sm font-medium">Letter 30-up</span>
                </div>
                <span className="text-[11px] text-slate-500">30 labels per sheet (3×10)</span>
              </label>
            </RadioGroup>
          </div>

          <div className="grid gap-2">
            <Label>What are you sending?</Label>
            <Select value={labelType} onValueChange={(v: any) => setLabelType(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="swatch_book">Swatch Book</SelectItem>
                <SelectItem value="press_test_kit">Press Test Kit</SelectItem>
                <SelectItem value="mailer">Mailer</SelectItem>
                <SelectItem value="letter">Letter</SelectItem>
                <SelectItem value="other">Something Else</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {labelType === 'other' && (
            <div className="grid gap-2">
              <Label htmlFor="batchOtherDesc">What are you sending?</Label>
              <Input
                id="batchOtherDesc"
                value={labelOtherDescription}
                onChange={(e) => setLabelOtherDescription(e.target.value)}
                placeholder="Describe what you're sending..."
              />
            </div>
          )}

          {labelType === 'mailer' && mailerTypes.length > 0 && (
            <div className="grid gap-2">
              <Label>Which mailer?</Label>
              <div className="grid grid-cols-3 gap-2">
                {mailerTypes.filter(m => m.isActive).map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelectedMailerId(m.id)}
                    className={`relative rounded-lg border-2 p-1 transition-all text-left ${
                      selectedMailerId === m.id
                        ? 'border-blue-500 ring-2 ring-blue-200'
                        : 'border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <img
                      src={m.thumbnailPath}
                      alt={m.name}
                      className="w-full rounded object-cover"
                      style={{ height: '70px', objectFit: 'cover' }}
                    />
                    <p className="text-[10px] text-slate-600 mt-1 leading-tight line-clamp-2">{m.name}</p>
                    {selectedMailerId === m.id && (
                      <div className="absolute top-1 right-1 w-4 h-4 bg-blue-500 rounded-full flex items-center justify-center">
                        <svg viewBox="0 0 12 12" className="w-2.5 h-2.5 text-white fill-current">
                          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                    )}
                  </button>
                ))}
              </div>
              {selectedMailerId === null && (
                <p className="text-xs text-amber-600">Please select which mailer you're sending</p>
              )}
            </div>
          )}

          {queue.length > 0 && queue[0].address && (
            <div className="grid gap-2">
              <Label>Label Preview</Label>
              <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">
                  How each label will print ({labelFormat === 'letter_30up' ? '2⅝″ × 1″ letter sheet' : '4×6 thermal'}):
                </p>
                {(() => {
                  const lines = formatAddressPreview(queue[0].address!);
                  return (
                    <div className={`bg-slate-50 rounded border border-slate-200 p-3 font-mono leading-relaxed ${
                      labelFormat === 'letter_30up' ? 'text-xs' : 'text-sm'
                    }`}>
                      {lines.map((line, i) => (
                        <p key={i} className={i === 0 ? 'font-bold text-slate-900' : 'text-slate-700'}>{line}</p>
                      ))}
                    </div>
                  );
                })()}
                {queue.length > 1 && (
                  <p className="text-xs text-slate-400 mt-2 text-center">
                    + {queue.length - 1} more label{queue.length - 1 !== 1 ? 's' : ''} with the same format
                  </p>
                )}
                <p className="text-[10px] text-slate-400 mt-2 italic">
                  Note: Only the address prints on the label. "{labelType === 'other' ? (labelOtherDescription || 'your item') : labelType.replace(/_/g, ' ')}" is logged for tracking only.
                </p>
              </div>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-2">
              <Label>Addresses ({queue.length})</Label>
              {queue.length > 0 && (
                <span className="text-xs text-gray-500">You can add more addresses before printing</span>
              )}
            </div>
            {queue.length === 0 ? (
              <div className="bg-gray-50 rounded-lg p-6 border border-dashed border-gray-300 text-center">
                <Printer className="w-8 h-8 mx-auto text-gray-300 mb-2" />
                <p className="text-sm text-gray-500">Click the printer icon next to contacts to add them here</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto">
                {queue.map((q, i) => {
                  const addr = q.address;
                  if (!addr) return null;
                  const lines = formatAddressPreview(addr);
                  return (
                    <div key={q.id} className="bg-gray-50 rounded-lg p-3 border flex items-start gap-3">
                      <span className="text-xs text-gray-400 font-mono mt-0.5 w-5 text-center flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        {lines.map((line, li) => (
                          <p key={li} className={`text-sm ${li === 0 ? 'font-semibold text-gray-900' : 'text-gray-600'} truncate`}>{line}</p>
                        ))}
                        {q.addedBy && (
                          <p className="text-[10px] text-gray-400 mt-0.5">Added by {q.addedBy}</p>
                        )}
                      </div>
                      <button
                        onClick={() => removeFromQueue(entityId(q))}
                        className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-500 flex-shrink-0"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {queue.length >= 1 && (
            <p className="text-xs text-gray-500">
              {Math.ceil(queue.length / labelsPerPage)} page(s) will be generated
              {labelFormat === 'letter_30up'
                ? ` with up to 30 labels per sheet (3 columns × 10 rows)`
                : ` with ${queue.length % 4 === 0 ? 4 : queue.length % 4} label(s) on the last page`
              }
            </p>
          )}
        </div>

        {/* Conflict Warning Panel */}
        {conflictData && conflictData.totalConflicts > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 p-4 space-y-3">
            <div className="flex items-start gap-2">
              <span className="text-amber-600 text-lg leading-none">⚠️</span>
              <div>
                <p className="text-sm font-semibold text-amber-800">
                  Mailer conflicts detected for {conflictData.totalConflicts} contact{conflictData.totalConflicts !== 1 ? 's' : ''}
                </p>
                <p className="text-xs text-amber-600 mt-0.5">Review before printing — or override and print anyway.</p>
              </div>
            </div>

            {conflictData.sameMailer.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-red-700 mb-1.5">
                  🔁 Already received this mailer ({conflictData.sameMailer.length}):
                </p>
                <ul className="space-y-1">
                  {conflictData.sameMailer.slice(0, 5).map((c, i) => (
                    <li key={i} className="text-xs text-red-700 flex justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-red-500">
                        sent {new Date(c.sentDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </li>
                  ))}
                  {conflictData.sameMailer.length > 5 && (
                    <li className="text-xs text-red-500">+ {conflictData.sameMailer.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            {conflictData.tooRecent.length > 0 && (
              <div>
                <p className="text-xs font-semibold text-amber-700 mb-1.5">
                  ⏳ Received a mailer within last 10 days ({conflictData.tooRecent.length}):
                </p>
                <ul className="space-y-1">
                  {conflictData.tooRecent.slice(0, 5).map((c, i) => (
                    <li key={i} className="text-xs text-amber-700 flex justify-between">
                      <span className="font-medium">{c.name}</span>
                      <span className="text-amber-600">
                        {c.daysAgo === 0 ? 'today' : `${c.daysAgo} day${c.daysAgo !== 1 ? 's' : ''} ago`}
                        {' '}— wait {10 - c.daysAgo} more day{10 - c.daysAgo !== 1 ? 's' : ''}
                      </span>
                    </li>
                  ))}
                  {conflictData.tooRecent.length > 5 && (
                    <li className="text-xs text-amber-600">+ {conflictData.tooRecent.length - 5} more</li>
                  )}
                </ul>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="flex-1 border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={() => setConflictData(null)}
              >
                Go Back
              </Button>
              <Button
                size="sm"
                className="flex-1 bg-amber-600 hover:bg-amber-700 text-white"
                onClick={() => { setConflictData(null); printMutation.mutate(); }}
                disabled={printMutation.isPending}
              >
                {printMutation.isPending ? <Loader2 className="w-3 h-3 mr-1 animate-spin" /> : null}
                Print Anyway
              </Button>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2">
          {queue.length > 0 && !conflictData && (
            <Button variant="ghost" size="sm" onClick={() => clearQueue()} className="mr-auto text-red-500 hover:text-red-600">
              Clear All
            </Button>
          )}
          {!conflictData && (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                onClick={handlePrintClick}
                disabled={!canPrint || printMutation.isPending || isCheckingConflicts}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {(printMutation.isPending || isCheckingConflicts) ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Printer className="w-4 h-4 mr-2" />
                )}
                {isCheckingConflicts ? 'Checking...' : `Print ${queue.length} Label${queue.length !== 1 ? 's' : ''}`}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface PrintLabelButtonProps {
  customer: CustomerAddress;
  leadId?: number;
  variant?: "icon" | "button";
  size?: "sm" | "default";
}

type SendType = 'swatch_book' | 'press_test_kit' | 'mailer' | 'letter' | 'other';

const SEND_TYPE_LABELS: Record<SendType, string> = {
  swatch_book: 'Swatch Book',
  press_test_kit: 'Press Test Kit',
  mailer: 'Mailer',
  letter: 'Letter',
  other: 'Something Else',
};

export function PrintLabelButton({ customer, leadId, variant = "icon", size = "sm" }: PrintLabelButtonProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [sendType, setSendType] = useState<SendType>('swatch_book');
  const [otherDesc, setOtherDesc] = useState('');

  let labelQueue: LabelQueueContextType | null = null;
  try {
    labelQueue = useLabelQueue();
  } catch {
    labelQueue = null;
  }

  const hasAddress = customer.address1 || customer.city;
  if (!hasAddress) return null;

  const entityKey = leadId ? `lead-${leadId}` : customer.id;
  const inQueue = labelQueue?.isInQueue(entityKey) ?? false;

  const printNowMutation = useMutation({
    mutationFn: async () => {
      const payload: Record<string, unknown> = {
        labelType: sendType === 'letter' ? 'other' : sendType,
        otherDescription: sendType === 'letter' ? 'Letter' : (sendType === 'other' ? otherDesc : undefined),
        quantity: 1,
      };
      if (leadId) {
        payload.leadId = leadId;
      } else {
        payload.customerId = customer.id;
      }
      const res = await apiRequest('POST', '/api/labels/print', payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.pdf) {
        toast({ title: 'Failed to print label', variant: 'destructive' });
        return;
      }
      const byteCharacters = atob(data.pdf);
      const byteArray = new Uint8Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) byteArray[i] = byteCharacters.charCodeAt(i);
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `label-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
      toast({ title: 'Label printed', description: `${SEND_TYPE_LABELS[sendType]} label generated` });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/label-stats'] });
      if (leadId) queryClient.invalidateQueries({ queryKey: ['/api/leads', leadId, 'activities'] });
      else queryClient.invalidateQueries({ queryKey: ['/api/customers', customer.id, 'activity'] });
      setDialogOpen(false);
    },
    onError: (err: any) => {
      toast({ title: 'Print failed', description: err.message, variant: 'destructive' });
    },
  });

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (inQueue) {
      labelQueue?.removeFromQueue(entityKey);
      toast({ title: 'Removed from shared queue' });
      return;
    }
    setDialogOpen(true);
  };

  const handleAddToQueue = async () => {
    if (!labelQueue) {
      toast({ title: 'Label queue not available', variant: 'destructive' });
      return;
    }
    await labelQueue.addToQueue(customer, leadId);
    toast({ title: 'Added to shared queue', description: 'All team members can see this in the queue.' });
    setDialogOpen(false);
  };

  const canConfirm = sendType !== 'other' || otherDesc.trim().length > 0;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {variant === "icon" ? (
              <button
                onClick={handleClick}
                className={`p-1 rounded transition-colors ${
                  inQueue
                    ? 'bg-blue-100 text-blue-600 hover:bg-blue-200'
                    : 'hover:bg-gray-100 text-gray-400 hover:text-blue-600'
                }`}
                title={inQueue ? "Remove from shared queue" : "Print label"}
              >
                <Printer className="w-4 h-4" />
              </button>
            ) : (
              <Button
                variant={inQueue ? "default" : "outline"}
                size={size}
                onClick={handleClick}
                className={inQueue ? "bg-blue-600 hover:bg-blue-700" : "border-blue-200 text-blue-600 hover:bg-blue-50"}
              >
                <Printer className="w-4 h-4 mr-2" />
                {inQueue ? 'In Queue' : 'Print Label'}
              </Button>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>{inQueue ? 'Remove from shared queue' : 'Print label'}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-4 h-4 text-blue-600" />
              Print Address Label
            </DialogTitle>
            <DialogDescription>
              What are you sending to {customer.company || [customer.firstName, customer.lastName].filter(Boolean).join(' ') || 'this contact'}?
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid gap-2">
              <Label>What are you sending?</Label>
              <Select value={sendType} onValueChange={(v) => setSendType(v as SendType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="swatch_book">Swatch Book</SelectItem>
                  <SelectItem value="press_test_kit">Press Test Kit</SelectItem>
                  <SelectItem value="mailer">Mailer</SelectItem>
                  <SelectItem value="letter">Letter</SelectItem>
                  <SelectItem value="other">Something Else</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {sendType === 'other' && (
              <div className="grid gap-2">
                <Label>Describe what you're sending</Label>
                <Input
                  value={otherDesc}
                  onChange={(e) => setOtherDesc(e.target.value)}
                  placeholder="e.g. Catalog, Sample pack..."
                />
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              size="sm"
              onClick={handleAddToQueue}
              disabled={!canConfirm || printNowMutation.isPending}
              className="flex-1"
            >
              Add to Shared Queue
            </Button>
            <Button
              size="sm"
              onClick={() => printNowMutation.mutate()}
              disabled={!canConfirm || printNowMutation.isPending}
              className="flex-1 bg-blue-600 hover:bg-blue-700"
            >
              {printNowMutation.isPending
                ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Printing...</>
                : <><Printer className="w-4 h-4 mr-2" />Print Now</>
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function LabelQueueIndicator() {
  const { queue, isLoading, openPrintDialog } = useLabelQueue();

  if (isLoading || queue.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50">
      <button
        onClick={openPrintDialog}
        className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white rounded-full px-4 py-2.5 shadow-lg transition-all hover:shadow-xl"
      >
        <Printer className="w-4 h-4" />
        <span className="text-sm font-medium">{queue.length} label{queue.length !== 1 ? 's' : ''} ready</span>
        <span className="bg-white text-blue-600 text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center">
          {queue.length}
        </span>
      </button>
    </div>
  );
}

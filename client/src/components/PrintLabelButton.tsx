import { useState, createContext, useContext } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Loader2, X } from "lucide-react";

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

interface QueuedLabel {
  customer: CustomerAddress;
  leadId?: number;
}

interface LabelQueueContextType {
  queue: QueuedLabel[];
  addToQueue: (customer: CustomerAddress, leadId?: number) => void;
  addToQueueAndOpen: (customer: CustomerAddress, leadId?: number) => void;
  addBulkToQueueAndOpen: (items: { customer: CustomerAddress; leadId?: number }[]) => void;
  removeFromQueue: (customerId: string) => void;
  clearQueue: () => void;
  isInQueue: (customerId: string) => boolean;
  openPrintDialog: () => void;
}

const LabelQueueContext = createContext<LabelQueueContextType | null>(null);

export function useLabelQueue() {
  const ctx = useContext(LabelQueueContext);
  if (!ctx) throw new Error("useLabelQueue must be used within LabelQueueProvider");
  return ctx;
}

export function LabelQueueProvider({ children }: { children: React.ReactNode }) {
  const [queue, setQueue] = useState<QueuedLabel[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);

  const addToQueue = (customer: CustomerAddress, leadId?: number) => {
    setQueue(prev => {
      if (prev.some(q => q.customer.id === customer.id)) return prev;
      return [...prev, { customer, leadId }];
    });
  };

  const addToQueueAndOpen = (customer: CustomerAddress, leadId?: number) => {
    setQueue(prev => {
      if (prev.some(q => q.customer.id === customer.id)) return prev;
      return [...prev, { customer, leadId }];
    });
    setDialogOpen(true);
  };

  const addBulkToQueueAndOpen = (items: { customer: CustomerAddress; leadId?: number }[]) => {
    setQueue(prev => {
      const existingIds = new Set(prev.map(q => q.customer.id));
      const newItems = items.filter(item => !existingIds.has(item.customer.id));
      return [...prev, ...newItems];
    });
    setDialogOpen(true);
  };

  const removeFromQueue = (customerId: string) => {
    setQueue(prev => prev.filter(q => q.customer.id !== customerId));
  };

  const clearQueue = () => setQueue([]);
  const isInQueue = (customerId: string) => queue.some(q => q.customer.id === customerId);
  const openPrintDialog = () => setDialogOpen(true);

  return (
    <LabelQueueContext.Provider value={{ queue, addToQueue, addToQueueAndOpen, addBulkToQueueAndOpen, removeFromQueue, clearQueue, isInQueue, openPrintDialog }}>
      {children}
      <BatchPrintDialog open={dialogOpen} onOpenChange={setDialogOpen} queue={queue} removeFromQueue={removeFromQueue} clearQueue={clearQueue} />
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

function BatchPrintDialog({ open, onOpenChange, queue, removeFromQueue, clearQueue }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  queue: QueuedLabel[];
  removeFromQueue: (id: string) => void;
  clearQueue: () => void;
}) {
  const [labelType, setLabelType] = useState<'swatch_book' | 'press_test_kit' | 'mailer' | 'letter' | 'other'>('swatch_book');
  const [labelOtherDescription, setLabelOtherDescription] = useState('');
  const [labelFormat, setLabelFormat] = useState<LabelFormat>('thermal_4x6');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const printMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        labelType,
        labelFormat,
        otherDescription: labelType === 'other' ? labelOtherDescription : undefined,
        addresses: queue.map(q => ({
          customerId: q.leadId ? undefined : q.customer.id,
          leadId: q.leadId,
        })),
      };
      const res = await apiRequest('POST', '/api/labels/print-batch', payload);
      return res.json();
    },
    onSuccess: (data) => {
      if (!data.pdf) {
        toast({ title: 'Failed to print labels', description: 'No PDF data received', variant: 'destructive' });
        return;
      }
      const byteCharacters = atob(data.pdf);
      const byteNumbers = new Array(byteCharacters.length);
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i);
      }
      const byteArray = new Uint8Array(byteNumbers);
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
        queryClient.invalidateQueries({ queryKey: ['/api/customers', q.customer.id, 'label-stats'] });
        queryClient.invalidateQueries({ queryKey: ['/api/customers', q.customer.id, 'activity'] });
        if (q.leadId) {
          queryClient.invalidateQueries({ queryKey: ['/api/leads', q.leadId, 'activities'] });
        }
      });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/label-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/labels/today'] });

      clearQueue();
      onOpenChange(false);
    },
    onError: (error: any) => {
      toast({ title: 'Failed to print labels', description: error.message, variant: 'destructive' });
    },
  });

  const canPrint = queue.length >= 1 && (labelType !== 'other' || labelOtherDescription.trim());
  const labelsPerPage = labelFormat === 'letter_30up' ? 30 : 4;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Printer className="w-5 h-5 text-blue-600" />
            Print Address Labels
          </DialogTitle>
          <DialogDescription>
            Choose your label format and what you're sending, then print.
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

          {queue.length > 0 && (
            <div className="grid gap-2">
              <Label>Label Preview</Label>
              <div className="bg-white rounded-lg border-2 border-dashed border-slate-300 p-4">
                <p className="text-[10px] uppercase tracking-wider text-slate-400 mb-3">
                  How each label will print ({labelFormat === 'letter_30up' ? '2⅝″ × 1″ letter sheet' : '4×6 thermal'}):
                </p>
                {(() => {
                  const sample = queue[0];
                  const lines = formatAddressPreview(sample.customer);
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
                  const lines = formatAddressPreview(q.customer);
                  return (
                    <div key={q.customer.id} className="bg-gray-50 rounded-lg p-3 border flex items-start gap-3">
                      <span className="text-xs text-gray-400 font-mono mt-0.5 w-5 text-center flex-shrink-0">{i + 1}</span>
                      <div className="flex-1 min-w-0">
                        {lines.map((line, li) => (
                          <p key={li} className={`text-sm ${li === 0 ? 'font-semibold text-gray-900' : 'text-gray-600'} truncate`}>{line}</p>
                        ))}
                      </div>
                      <button
                        onClick={() => removeFromQueue(q.customer.id)}
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

        <DialogFooter className="gap-2">
          {queue.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearQueue} className="mr-auto text-red-500 hover:text-red-600">
              Clear All
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => printMutation.mutate()}
            disabled={!canPrint || printMutation.isPending}
            className="bg-blue-600 hover:bg-blue-700"
          >
            {printMutation.isPending ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Printer className="w-4 h-4 mr-2" />
            )}
            Print {queue.length} Label{queue.length !== 1 ? 's' : ''}
          </Button>
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

  const inQueue = labelQueue?.isInQueue(customer.id) ?? false;

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
      labelQueue?.removeFromQueue(customer.id);
      toast({ title: 'Removed from label queue' });
      return;
    }
    setDialogOpen(true);
  };

  const handleAddToQueue = () => {
    if (!labelQueue) {
      toast({ title: 'Label queue not available', variant: 'destructive' });
      return;
    }
    labelQueue.addToQueue(customer, leadId);
    toast({ title: 'Added to label queue', description: 'Click the floating button to print when ready.' });
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
                title={inQueue ? "Remove from queue" : "Print label"}
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
            <p>{inQueue ? 'Remove from queue' : 'Print label'}</p>
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
              Add to Queue
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
  let labelQueue: LabelQueueContextType | null = null;
  try {
    labelQueue = useLabelQueue();
  } catch {
    return null;
  }

  if (!labelQueue || labelQueue.queue.length === 0) return null;

  const count = labelQueue.queue.length;
  const nextFull4 = Math.ceil(count / 4) * 4;
  const toFill4 = nextFull4 - count;
  const hintText = toFill4 === 0
    ? 'Ready to print!'
    : `${toFill4} more to fill a 4×6 sheet`;

  return (
    <Button
      onClick={() => labelQueue!.openPrintDialog()}
      size="sm"
      className="fixed bottom-6 right-6 z-50 bg-blue-600 hover:bg-blue-700 shadow-lg rounded-2xl h-auto px-5 py-2.5 gap-1 flex-col items-center"
    >
      <div className="flex items-center gap-2">
        <Printer className="w-5 h-5" />
        <span className="font-semibold">{count} Label{count !== 1 ? 's' : ''} Queued</span>
      </div>
      <span className="text-[11px] opacity-80">{hintText}</span>
    </Button>
  );
}

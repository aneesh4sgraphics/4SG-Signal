import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { Printer, Loader2 } from "lucide-react";

interface CustomerAddress {
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

interface LabelStats {
  stats: Array<{ labelType: string; label: string; count: number; totalQuantity: number; lastPrintedAt: string | null }>;
  total: number;
}

interface PrintLabelButtonProps {
  customer: CustomerAddress;
  variant?: "icon" | "button";
  size?: "sm" | "default";
}

export function PrintLabelButton({ customer, variant = "icon", size = "sm" }: PrintLabelButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [labelType, setLabelType] = useState<'swatch_book' | 'press_test_kit' | 'mailer' | 'other'>('swatch_book');
  const [labelOtherDescription, setLabelOtherDescription] = useState('');
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelNotes, setLabelNotes] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: labelStats } = useQuery<LabelStats>({
    queryKey: ['/api/customers', customer.id, 'label-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customer.id}/label-stats`);
      if (!res.ok) throw new Error('Failed to fetch label stats');
      return res.json();
    },
    enabled: isOpen,
    staleTime: 30000,
  });

  const printLabelMutation = useMutation({
    mutationFn: async (data: { labelType: string; otherDescription?: string; quantity: number; notes?: string }) => {
      const res = await apiRequest('POST', '/api/labels/print', {
        customerId: customer.id,
        ...data,
      });
      return res.json();
    },
    onSuccess: (data) => {
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
      const recipientName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'customer';
      a.download = `label-${recipientName.replace(/[^a-zA-Z0-9]/g, '-')}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: 'Label printed successfully', description: data.message });
      setIsOpen(false);
      setLabelType('swatch_book');
      setLabelOtherDescription('');
      setLabelQuantity(1);
      setLabelNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/customers', customer.id, 'label-stats'] });
      queryClient.invalidateQueries({ queryKey: ['/api/dashboard/label-stats'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to print label', description: error.message, variant: 'destructive' });
    },
  });

  const recipientName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Customer';
  const hasAddress = customer.address1 || customer.city;

  if (!hasAddress) return null;

  return (
    <>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            {variant === "icon" ? (
              <button
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
                className="p-1 rounded hover:bg-gray-100 text-gray-400 hover:text-blue-600 transition-colors"
                title="Print shipping label"
              >
                <Printer className="w-4 h-4" />
              </button>
            ) : (
              <Button
                variant="outline"
                size={size}
                onClick={(e) => { e.stopPropagation(); setIsOpen(true); }}
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Label
              </Button>
            )}
          </TooltipTrigger>
          <TooltipContent>
            <p>Print shipping label</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md" onClick={(e) => e.stopPropagation()}>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-blue-600" />
              Print Address Label
            </DialogTitle>
            <DialogDescription>
              Generate a 4"x3" thermal label for shipping marketing materials.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>What are you sending?</Label>
              <Select value={labelType} onValueChange={(v: 'swatch_book' | 'press_test_kit' | 'mailer' | 'other') => setLabelType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select label type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="swatch_book">Swatch Book</SelectItem>
                  <SelectItem value="press_test_kit">Press Test Kit</SelectItem>
                  <SelectItem value="mailer">Mailer</SelectItem>
                  <SelectItem value="other">Something Else</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {labelType === 'other' && (
              <div className="grid gap-2">
                <Label htmlFor="otherDescription">Description</Label>
                <Input
                  id="otherDescription"
                  value={labelOtherDescription}
                  onChange={(e) => setLabelOtherDescription(e.target.value)}
                  placeholder="What are you sending?"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={labelQuantity}
                onChange={(e) => setLabelQuantity(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={labelNotes}
                onChange={(e) => setLabelNotes(e.target.value)}
                placeholder="Any special instructions..."
                rows={2}
              />
            </div>

            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-xs text-gray-500 mb-2">Shipping To:</p>
              <p className="font-semibold">{recipientName}</p>
              {customer.address1 && <p className="text-sm text-gray-700">{customer.address1}</p>}
              {customer.address2 && <p className="text-sm text-gray-700">{customer.address2}</p>}
              <p className="text-sm text-gray-700">
                {[customer.city, customer.province, customer.zip].filter(Boolean).join(', ')}
              </p>
              {customer.country && !['US', 'USA', 'CA', 'CAN'].includes(customer.country) && (
                <p className="text-sm text-gray-700">{customer.country}</p>
              )}
            </div>

            {labelStats && labelStats.total > 0 && (
              <div className="bg-blue-50 rounded-lg p-3 border border-blue-100">
                <p className="text-xs text-blue-600 mb-2 font-medium">Previously Sent:</p>
                <div className="flex flex-wrap gap-2">
                  {labelStats.stats.map(stat => (
                    <Badge key={stat.labelType} variant="secondary" className="bg-blue-100 text-blue-700">
                      {stat.label}: {stat.count}
                    </Badge>
                  ))}
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => printLabelMutation.mutate({
                labelType,
                otherDescription: labelType === 'other' ? labelOtherDescription : undefined,
                quantity: labelQuantity,
                notes: labelNotes || undefined,
              })}
              disabled={printLabelMutation.isPending || (labelType === 'other' && !labelOtherDescription.trim())}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {printLabelMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

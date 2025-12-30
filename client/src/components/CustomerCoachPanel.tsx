import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Printer,
  Package,
  Phone,
  FileText,
  RefreshCw,
  Heart,
  Calendar,
  Trophy,
  ChevronRight,
  ChevronDown,
  Sparkles,
  TrendingUp,
  AlertCircle,
  Clock,
  CheckCircle2,
  Star,
  Zap,
  Check,
  HelpCircle,
  DollarSign,
  Truck,
  Users,
  MoreHorizontal,
  AlertTriangle,
  Settings,
} from "lucide-react";
import type { Customer, CustomerMachineProfile, CategoryTrust, CategoryObjection } from "@shared/schema";

const ACCOUNT_STATE_CONFIG: Record<string, { label: string; color: string; bgColor: string; description: string }> = {
  prospect: { label: 'Prospect', color: 'text-gray-600', bgColor: 'bg-gray-100', description: 'No orders yet' },
  first_trust: { label: 'First Trust', color: 'text-blue-600', bgColor: 'bg-blue-100', description: '1 category adopted' },
  expansion_possible: { label: 'Expansion Possible', color: 'text-purple-600', bgColor: 'bg-purple-100', description: 'Could expand to more categories' },
  expansion_in_progress: { label: 'Expanding', color: 'text-indigo-600', bgColor: 'bg-indigo-100', description: 'Testing new categories' },
  multi_category: { label: 'Multi-Category', color: 'text-green-600', bgColor: 'bg-green-100', description: 'Ordering multiple categories' },
  embedded: { label: 'Embedded', color: 'text-emerald-600', bgColor: 'bg-emerald-100', description: 'Fully integrated supplier' },
};

const CATEGORY_STATE_CONFIG: Record<string, { label: string; progress: number; color: string; bgColor: string }> = {
  not_introduced: { label: 'Not Introduced', progress: 0, color: 'text-gray-500', bgColor: 'bg-gray-200' },
  introduced: { label: 'Introduced', progress: 25, color: 'text-blue-500', bgColor: 'bg-blue-200' },
  evaluated: { label: 'Evaluated', progress: 50, color: 'text-purple-500', bgColor: 'bg-purple-200' },
  adopted: { label: 'Adopted', progress: 75, color: 'text-green-500', bgColor: 'bg-green-200' },
  habitual: { label: 'Habitual', progress: 100, color: 'text-emerald-600', bgColor: 'bg-emerald-200' },
};

const MACHINE_FAMILIES = [
  { id: 'offset', label: 'Offset' },
  { id: 'digital_toner', label: 'Digital Dry Toner' },
  { id: 'hp_indigo', label: 'Digital - HP Indigo' },
  { id: 'digital_inkjet_uv', label: 'Digital Inkjet UV (KM1, Fuji)' },
  { id: 'label_press', label: 'Label Press' },
  { id: 'screen_printing', label: 'Screen Printing' },
  { id: 'wide_format_flatbed', label: 'Wide Format - Flat Bed' },
  { id: 'wide_format_roll', label: 'Wide Format - Roll to Roll' },
  { id: 'aqueous_photo', label: 'Aqueous Photo Printers' },
  { id: 'distributor', label: 'Distributor', requiresNote: true },
  { id: 'dealer', label: 'Dealer', requiresNote: true },
  { id: 'other', label: 'Other', requiresNote: true },
];

const REQUIRES_NOTE_MACHINES = ['distributor', 'dealer', 'other'];

// Category Groups based on machine compatibility
// Group A: Graffiti Logic - works with Offset, Digital Dry Toner, HP Indigo, Digital Inkjet UV
const GRAFFITI_CATEGORIES = [
  'Graffiti Polyester Paper',
  'Graffiti Blended Poly',
  'Graffiti Soft Poly',
  'GraffitiStick CoolStick',
  'GraffitiStick ClearStick',
  'GraffitiStick MetalStick',
  'GraffitiStick SilverStick',
  'GraffitiStick DuraStick',
  'GraffitiStick PaperStick',
];
const GRAFFITI_MACHINES = ['offset', 'digital_toner', 'hp_indigo', 'digital_inkjet_uv'];

// Group B: Solvit & Rang Lux - Wide Format
const WIDE_FORMAT_CATEGORIES = [
  'Solvit Sign & Display Media',
  'Rang Lux Print Canvas',
];
const WIDE_FORMAT_MACHINES = ['wide_format_flatbed', 'wide_format_roll'];

// Group C: Cliq & Rang Duo - Aqueous
const AQUEOUS_CATEGORIES = [
  'Cliq Aqueous Media',
  'Rang Duo Print Canvas',
];
const AQUEOUS_MACHINES = ['aqueous_photo'];

// Group D: Screen Print
const SCREEN_PRINT_CATEGORIES = [
  'EiE Inkjet Film',
  'eLe Laser Film',
];
const SCREEN_PRINT_MACHINES = ['screen_printing'];

// All product categories for reference
const ALL_PRODUCT_CATEGORIES = [
  ...GRAFFITI_CATEGORIES,
  ...WIDE_FORMAT_CATEGORIES,
  ...AQUEOUS_CATEGORIES,
  ...SCREEN_PRINT_CATEGORIES,
];

// Machine to category group mapping
const CATEGORY_MACHINE_COMPATIBILITY: Record<string, string[]> = {
  offset: GRAFFITI_CATEGORIES,
  digital_toner: GRAFFITI_CATEGORIES,
  hp_indigo: GRAFFITI_CATEGORIES,
  digital_inkjet_uv: GRAFFITI_CATEGORIES,
  label_press: ['Label Stocks', 'Synthetic Labels'],
  screen_printing: SCREEN_PRINT_CATEGORIES,
  wide_format_flatbed: WIDE_FORMAT_CATEGORIES,
  wide_format_roll: WIDE_FORMAT_CATEGORIES,
  aqueous_photo: AQUEOUS_CATEGORIES,
  distributor: ALL_PRODUCT_CATEGORIES,
  dealer: ALL_PRODUCT_CATEGORIES,
  other: ALL_PRODUCT_CATEGORIES,
};

const OBJECTION_TYPES = [
  { id: 'price', label: 'Price', icon: DollarSign },
  { id: 'compatibility', label: 'Compatibility', icon: Settings },
  { id: 'moq', label: 'MOQ', icon: Package },
  { id: 'lead_time', label: 'Lead Time', icon: Truck },
  { id: 'has_supplier', label: 'Has Supplier', icon: Users },
];

const CATEGORY_STATES = ['not_introduced', 'introduced', 'evaluated', 'adopted', 'habitual'] as const;

interface CustomerCoachPanelProps {
  customer: Customer;
  onNavigateToPressProfiles?: () => void;
}

export default function CustomerCoachPanel({ customer, onNavigateToPressProfiles }: CustomerCoachPanelProps) {
  const [objectionDialog, setObjectionDialog] = useState<{ open: boolean; categoryName: string; trustId?: number }>({ open: false, categoryName: '' });
  const [machineNoteDialog, setMachineNoteDialog] = useState<{ open: boolean; machineId: string; machineLabel: string; details: string }>({ open: false, machineId: '', machineLabel: '', details: '' });
  const [machineProfileOpen, setMachineProfileOpen] = useState(true);
  const { toast } = useToast();

  const { data: machineProfiles = [], refetch: refetchMachines } = useQuery<CustomerMachineProfile[]>({
    queryKey: ['/api/crm/machine-profiles', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/machine-profiles/${customer.id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: categoryTrusts = [], refetch: refetchTrusts } = useQuery<CategoryTrust[]>({
    queryKey: ['/api/crm/category-trust', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/category-trust/${customer.id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: objections = [] } = useQuery<CategoryObjection[]>({
    queryKey: ['/api/crm/objections', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/objections/${customer.id}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
  });

  useEffect(() => {
    if (machineProfiles.length > 0) {
      setMachineProfileOpen(false);
    } else {
      setMachineProfileOpen(true);
    }
  }, [machineProfiles.length]);

  const hasMachines = machineProfiles.length > 0;

  const toggleMachineMutation = useMutation({
    mutationFn: async ({ machineFamily, currentlyEnabled, otherDetails }: { machineFamily: string; currentlyEnabled: boolean; otherDetails?: string }) => {
      if (currentlyEnabled) {
        const existing = machineProfiles.find(p => p.machineFamily === machineFamily);
        if (existing) {
          await apiRequest('DELETE', `/api/crm/machine-profiles/${existing.id}`, undefined);
        }
        return null;
      } else {
        const res = await apiRequest('POST', '/api/crm/machine-profiles', {
          customerId: customer.id,
          machineFamily,
          status: 'inferred',
          otherDetails: otherDetails || null,
        });
        return res.json();
      }
    },
    onSuccess: () => {
      refetchMachines();
      queryClient.invalidateQueries({ queryKey: ['/api/crm/machine-profiles', customer.id] });
      setMachineNoteDialog({ open: false, machineId: '', machineLabel: '', details: '' });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update machine", variant: "destructive" });
    },
  });

  const confirmMachineMutation = useMutation({
    mutationFn: async (profileId: number) => {
      const res = await apiRequest('POST', `/api/crm/machine-profiles/${profileId}/confirm`, {});
      return res.json();
    },
    onSuccess: () => {
      refetchMachines();
      toast({ title: "Confirmed", description: "Machine profile confirmed" });
    },
  });

  const advanceCategoryMutation = useMutation({
    mutationFn: async ({ categoryName, machineFamily }: { categoryName: string; machineFamily?: string }) => {
      const existing = categoryTrusts.find(t => t.categoryName === categoryName);
      if (existing) {
        const res = await apiRequest('POST', `/api/crm/category-trust/${existing.id}/advance`, {});
        return res.json();
      } else {
        const res = await apiRequest('POST', '/api/crm/category-trust', {
          customerId: customer.id,
          categoryName,
          machineType: machineFamily,
          trustLevel: 'introduced',
        });
        return res.json();
      }
    },
    onSuccess: () => {
      refetchTrusts();
      toast({ title: "Progress updated", description: "Category trust advanced" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update category", variant: "destructive" });
    },
  });

  const logObjectionMutation = useMutation({
    mutationFn: async ({ categoryName, objectionType }: { categoryName: string; objectionType: string }) => {
      const res = await apiRequest('POST', '/api/crm/objections', {
        customerId: customer.id,
        categoryName,
        objectionType,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/objections', customer.id] });
      setObjectionDialog({ open: false, categoryName: '' });
      toast({ title: "Objection logged", description: "Objection recorded" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to log objection", variant: "destructive" });
    },
  });

  const syncFromDataMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/crm/category-trust/${customer.id}/sync`, {});
      return res.json();
    },
    onSuccess: (data: any) => {
      refetchTrusts();
      if (data.synced?.length > 0) {
        toast({ title: "Synced", description: `Updated ${data.synced.length} categories from samples` });
      } else {
        toast({ title: "Up to date", description: "No new data to sync" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to sync data", variant: "destructive" });
    },
  });

  const confirmedMachines = machineProfiles.filter(p => p.status === 'confirmed').map(p => p.machineFamily);
  const inferredMachines = machineProfiles.filter(p => p.status === 'inferred').map(p => p.machineFamily);
  const allMachines = [...confirmedMachines, ...inferredMachines];

  const getCompatibleCategories = (): string[] => {
    if (allMachines.length === 0) return [];
    const categories = new Set<string>();
    allMachines.forEach(machine => {
      const compatible = CATEGORY_MACHINE_COMPATIBILITY[machine] || [];
      compatible.forEach(cat => categories.add(cat));
    });
    return Array.from(categories);
  };

  const compatibleCategories = getCompatibleCategories();

  const getCategoryState = (categoryName: string): string => {
    const trust = categoryTrusts.find(t => t.categoryName === categoryName);
    return trust?.trustLevel || 'not_introduced';
  };

  const getCategoryTrust = (categoryName: string): CategoryTrust | undefined => {
    return categoryTrusts.find(t => t.categoryName === categoryName);
  };

  const computeAccountState = (): string => {
    const adoptedCategories = categoryTrusts.filter(t => t.trustLevel === 'adopted' || t.trustLevel === 'habitual');
    const evaluatingCategories = categoryTrusts.filter(t => t.trustLevel === 'evaluated');
    const totalOrders = parseInt(String(customer.totalOrders || '0'));

    if (adoptedCategories.length >= 3 && totalOrders >= 10) return 'embedded';
    if (adoptedCategories.length >= 2) return 'multi_category';
    if (evaluatingCategories.length > 0 && adoptedCategories.length >= 1) return 'expansion_in_progress';
    if (adoptedCategories.length === 1 && compatibleCategories.length > 1) return 'expansion_possible';
    if (adoptedCategories.length === 1) return 'first_trust';
    return 'prospect';
  };

  const computeNextBestMove = (): { action: string; reason: string; priority: 'low' | 'normal' | 'high' | 'urgent' } | null => {
    if (allMachines.length === 0) {
      return { action: 'confirm_machine', reason: 'No machine profile - confirm equipment type', priority: 'high' };
    }
    if (confirmedMachines.length === 0 && inferredMachines.length > 0) {
      return { action: 'confirm_machine', reason: 'Confirm inferred machine types', priority: 'normal' };
    }

    const adoptedWithReorderDue = categoryTrusts.filter(t => 
      (t.trustLevel === 'adopted' || t.trustLevel === 'habitual') && 
      t.reorderStatus === 'due' || t.reorderStatus === 'overdue'
    );
    if (adoptedWithReorderDue.length > 0) {
      return { action: 'check_reorder', reason: `Reorder due: ${adoptedWithReorderDue[0].categoryName}`, priority: 'urgent' };
    }

    const stuckEvaluated = categoryTrusts.filter(t => t.trustLevel === 'evaluated');
    if (stuckEvaluated.length > 0) {
      return { action: 'follow_up', reason: `Follow up on ${stuckEvaluated[0].categoryName} evaluation`, priority: 'high' };
    }

    const introduced = categoryTrusts.filter(t => t.trustLevel === 'introduced');
    if (introduced.length > 0) {
      return { action: 'send_sample', reason: `Send sample for ${introduced[0].categoryName}`, priority: 'normal' };
    }

    const unexplored = compatibleCategories.filter(cat => !categoryTrusts.find(t => t.categoryName === cat));
    if (unexplored.length > 0) {
      return { action: 'introduce_category', reason: `Introduce ${unexplored[0]}`, priority: 'low' };
    }

    return null;
  };

  const accountState = computeAccountState();
  const accountConfig = ACCOUNT_STATE_CONFIG[accountState];
  const nextMove = computeNextBestMove();

  const getActionLabel = (action: string): string => {
    const labels: Record<string, string> = {
      confirm_machine: 'Confirm Machine',
      check_reorder: 'Check Reorder',
      follow_up: 'Follow Up',
      send_sample: 'Send Sample',
      introduce_category: 'Introduce Category',
    };
    return labels[action] || action;
  };

  const getPriorityStyles = (priority: string): string => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 hover:bg-red-600 text-white';
      case 'high': return 'bg-orange-500 hover:bg-orange-600 text-white';
      case 'normal': return 'bg-blue-500 hover:bg-blue-600 text-white';
      case 'low': return 'bg-gray-400 hover:bg-gray-500 text-white';
      default: return 'bg-blue-500 hover:bg-blue-600 text-white';
    }
  };

  const adoptedCount = categoryTrusts.filter(t => t.trustLevel === 'adopted' || t.trustLevel === 'habitual').length;
  const trustProgress = compatibleCategories.length > 0 ? (adoptedCount / compatibleCategories.length) * 100 : 0;

  return (
    <div className="space-y-4" data-testid="customer-coach-panel">
      <div className="flex items-center gap-3 mb-2">
        <TrendingUp className="h-5 w-5 text-purple-500" />
        <h3 className="font-semibold text-lg">Customer Journey</h3>
        <Badge className={`${accountConfig?.bgColor} ${accountConfig?.color} border-0`}>
          {accountConfig?.label}
        </Badge>
        {machineProfiles.length > 0 && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger>
                <div className="flex items-center justify-center h-6 w-6 rounded-full bg-green-500 text-white text-xs font-bold" data-testid="machine-indicator">
                  M
                </div>
              </TooltipTrigger>
              <TooltipContent>
                {machineProfiles.length} machine{machineProfiles.length > 1 ? 's' : ''} configured
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </div>

      {nextMove && (
        <Card className="border-2 border-purple-200 bg-purple-50/50">
          <CardContent className="py-3">
            <p className="text-xs text-gray-500 mb-1">Next Best Move</p>
            <Button
              className={`w-full ${getPriorityStyles(nextMove.priority)}`}
              data-testid="next-best-move-button"
            >
              <Zap className="h-4 w-4 mr-2" />
              {getActionLabel(nextMove.action)}
              <ChevronRight className="h-4 w-4 ml-auto" />
            </Button>
            <p className="text-xs text-gray-500 mt-1 text-center">{nextMove.reason}</p>
          </CardContent>
        </Card>
      )}

      <Collapsible open={machineProfileOpen} onOpenChange={setMachineProfileOpen}>
        <Card className={hasMachines ? 'border-green-200' : ''}>
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50/50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm flex items-center gap-2">
                  <Printer className="h-4 w-4" />
                  Machine Profile
                  {hasMachines && (
                    <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                      {machineProfiles.length} selected
                    </Badge>
                  )}
                </CardTitle>
                <div className="flex items-center gap-2">
                  {hasMachines && onNavigateToPressProfiles && (
                    <Button 
                      variant="link" 
                      size="sm" 
                      className="h-auto p-0 text-xs text-blue-600"
                      onClick={(e) => {
                        e.stopPropagation();
                        onNavigateToPressProfiles();
                      }}
                      data-testid="link-press-profiles"
                    >
                      View Press Details →
                    </Button>
                  )}
                  <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${machineProfileOpen ? 'rotate-180' : ''}`} />
                </div>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent>
              <p className="text-xs text-gray-500 mb-3">
                Select the broad machine types this customer uses. For detailed press information, use the Press Profiles tab.
              </p>
              <div className="grid grid-cols-2 gap-2">
                {MACHINE_FAMILIES.map(machine => {
                  const profile = machineProfiles.find(p => p.machineFamily === machine.id);
                  const isEnabled = !!profile;
                  const isConfirmed = profile?.status === 'confirmed';

                  return (
                    <div
                      key={machine.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition-colors ${
                        isEnabled
                          ? isConfirmed
                            ? 'bg-green-50 border-green-200'
                            : 'bg-blue-50 border-blue-200'
                          : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                      }`}
                      onClick={() => {
                        if (REQUIRES_NOTE_MACHINES.includes(machine.id) && !isEnabled) {
                          setMachineNoteDialog({ open: true, machineId: machine.id, machineLabel: machine.label, details: '' });
                        } else {
                          toggleMachineMutation.mutate({ machineFamily: machine.id, currentlyEnabled: isEnabled });
                        }
                      }}
                      data-testid={`machine-${machine.id}`}
                    >
                      <Checkbox
                        checked={isEnabled}
                        className="pointer-events-none"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">{machine.label}</p>
                        {isEnabled && (
                          <p className="text-xs text-gray-500">
                            {isConfirmed ? (
                              <span className="text-green-600 flex items-center gap-1">
                                <CheckCircle2 className="h-3 w-3" /> Confirmed
                              </span>
                            ) : REQUIRES_NOTE_MACHINES.includes(machine.id) && profile?.otherDetails ? (
                              <span className="text-blue-600 truncate">{profile.otherDetails}</span>
                            ) : (
                              <span className="text-blue-600">Inferred</span>
                            )}
                          </p>
                        )}
                      </div>
                      {isEnabled && !isConfirmed && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-6 w-6 p-0"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (profile) confirmMachineMutation.mutate(profile.id);
                                }}
                                data-testid={`confirm-machine-${machine.id}`}
                              >
                                <Check className="h-4 w-4 text-green-600" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Confirm machine</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </div>
                  );
                })}
              </div>
              {hasMachines && onNavigateToPressProfiles && (
                <div className="mt-3 pt-3 border-t">
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full"
                    onClick={onNavigateToPressProfiles}
                    data-testid="btn-go-to-press-profiles"
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Add Detailed Press Information
                  </Button>
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2">
              <Package className="h-4 w-4" />
              Category Trust
            </CardTitle>
            <div className="flex items-center gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      className="h-6 w-6 p-0"
                      onClick={() => syncFromDataMutation.mutate()}
                      disabled={syncFromDataMutation.isPending}
                      data-testid="sync-category-trust"
                    >
                      <RefreshCw className={`h-3 w-3 ${syncFromDataMutation.isPending ? 'animate-spin' : ''}`} />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Sync from samples</TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <span className="text-xs text-gray-500">{adoptedCount}/{compatibleCategories.length}</span>
              <Progress value={trustProgress} className="w-20 h-2" />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {compatibleCategories.length === 0 ? (
            <div className="text-center py-4 text-gray-500">
              <HelpCircle className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Select machine types to see compatible categories</p>
            </div>
          ) : (
            <div className="space-y-2">
              {compatibleCategories.map(category => {
                const state = getCategoryState(category);
                const config = CATEGORY_STATE_CONFIG[state];
                const trust = getCategoryTrust(category);
                const categoryObjections = objections.filter(o => o.categoryName === category && o.status === 'open');
                const isMaxLevel = state === 'habitual';
                const isAdopted = state === 'adopted' || state === 'habitual';

                return (
                  <div key={category} className="flex items-center gap-2 group">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm truncate">{category}</span>
                        {categoryObjections.length > 0 && (
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger>
                                <AlertTriangle className="h-3 w-3 text-orange-500" />
                              </TooltipTrigger>
                              <TooltipContent>
                                {categoryObjections.map(o => o.objectionType).join(', ')}
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        )}
                        {isAdopted && trust?.reorderStatus && (
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              trust.reorderStatus === 'overdue' ? 'border-red-500 text-red-600' :
                              trust.reorderStatus === 'due' ? 'border-orange-500 text-orange-600' :
                              'border-green-500 text-green-600'
                            }`}
                          >
                            {trust.reorderStatus}
                          </Badge>
                        )}
                      </div>
                      <Progress value={config.progress} className="h-1.5 mt-1" />
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {!isMaxLevel && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-7 px-2"
                                onClick={() => advanceCategoryMutation.mutate({ categoryName: category })}
                                disabled={advanceCategoryMutation.isPending}
                                data-testid={`advance-${category}`}
                              >
                                <ChevronRight className="h-4 w-4" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Advance to next stage</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {OBJECTION_TYPES.map(obj => (
                            <DropdownMenuItem
                              key={obj.id}
                              onClick={() => logObjectionMutation.mutate({ categoryName: category, objectionType: obj.id })}
                            >
                              <obj.icon className="h-4 w-4 mr-2" />
                              Log: {obj.label}
                            </DropdownMenuItem>
                          ))}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <Badge variant="outline" className={`text-xs ${config.color} shrink-0`}>
                      {config.label}
                    </Badge>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {categoryTrusts.filter(t => (t.trustLevel === 'adopted' || t.trustLevel === 'habitual') && t.lastOrderDate).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <RefreshCw className="h-4 w-4" />
              Reorder Intelligence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {categoryTrusts
                .filter(t => (t.trustLevel === 'adopted' || t.trustLevel === 'habitual') && t.lastOrderDate)
                .map(trust => (
                  <div key={trust.id} className="flex items-center justify-between text-sm">
                    <span>{trust.categoryName}</span>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">
                        {trust.avgOrderFrequencyDays ? `Every ${trust.avgOrderFrequencyDays}d` : 'No pattern'}
                      </span>
                      {trust.reorderStatus && (
                        <Badge
                          variant={trust.reorderStatus === 'overdue' ? 'destructive' : 'outline'}
                          className="text-xs"
                        >
                          {trust.reorderStatus === 'overdue' && <AlertCircle className="h-3 w-3 mr-1" />}
                          {trust.reorderStatus === 'due' && <Clock className="h-3 w-3 mr-1" />}
                          {trust.reorderStatus}
                        </Badge>
                      )}
                    </div>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={machineNoteDialog.open} onOpenChange={(open) => setMachineNoteDialog({ ...machineNoteDialog, open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{machineNoteDialog.machineLabel}</DialogTitle>
            <DialogDescription>
              {machineNoteDialog.machineId === 'other' 
                ? 'Please describe the machine type this customer uses.'
                : `Please add a note for this ${machineNoteDialog.machineLabel.toLowerCase()}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="machine-note">
                {machineNoteDialog.machineId === 'other' ? 'Machine Details' : 'Note'}
              </Label>
              <Input
                id="machine-note"
                placeholder={machineNoteDialog.machineId === 'other' 
                  ? 'e.g., Letterpress, Gravure, etc.' 
                  : 'e.g., Company name, contact info...'}
                value={machineNoteDialog.details}
                onChange={(e) => setMachineNoteDialog({ ...machineNoteDialog, details: e.target.value })}
                data-testid="input-machine-note"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMachineNoteDialog({ open: false, machineId: '', machineLabel: '', details: '' })}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (machineNoteDialog.details.trim()) {
                  toggleMachineMutation.mutate({ 
                    machineFamily: machineNoteDialog.machineId, 
                    currentlyEnabled: false, 
                    otherDetails: machineNoteDialog.details.trim() 
                  });
                }
              }}
              disabled={!machineNoteDialog.details.trim() || toggleMachineMutation.isPending}
              data-testid="btn-save-machine-note"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

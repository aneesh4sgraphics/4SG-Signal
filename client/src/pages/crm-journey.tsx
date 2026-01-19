import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import StartYourDayDashboard from "@/components/StartYourDayDashboard";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Check, ChevronsUpDown } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import JourneyCreatorModal from "@/components/JourneyCreatorModal";
import {
  Users,
  Search,
  Plus,
  ArrowRight,
  TrendingUp,
  Package,
  FileText,
  Clock,
  Building2,
  Mail,
  Phone,
  ChevronRight,
  Target,
  AlertTriangle,
  Handshake,
  FlaskConical,
  CheckCircle,
  Rocket,
  LayoutGrid,
  List,
  Settings,
  Pencil,
  Trash2,
  MoreHorizontal,
  Sun,
  GitBranch,
} from "lucide-react";
import type { Customer, CustomerJourney } from "@shared/schema";

const JOURNEY_STAGE_CONFIG = [
  { id: 'trigger', label: 'Trigger', icon: Target, color: 'bg-red-500', description: 'Price increase detected' },
  { id: 'internal_alarm', label: 'Internal Alarm', icon: AlertTriangle, color: 'bg-orange-500', description: 'Margin erosion recognized' },
  { id: 'supplier_pushback', label: 'Supplier Pushback', icon: Handshake, color: 'bg-yellow-500', description: 'Challenging current supplier' },
  { id: 'pilot_alignment', label: 'Pilot Alignment', icon: Users, color: 'bg-blue-500', description: 'Approval to trial' },
  { id: 'controlled_trial', label: 'Controlled Trial', icon: FlaskConical, color: 'bg-indigo-500', description: 'Samples in press' },
  { id: 'validation_proof', label: 'Validation & Proof', icon: CheckCircle, color: 'bg-purple-500', description: 'Gate sign-off' },
  { id: 'conversion', label: 'Conversion', icon: Rocket, color: 'bg-green-500', description: 'Supplier committed' },
];

const PRODUCT_LINE_LABELS: Record<string, string> = {
  commodity_cut_size: 'Commodity Cut Size',
  specialty_coated: 'Specialty Coated',
  large_format: 'Large Format',
  label_stocks: 'Label Stocks',
  digital_media: 'Digital Media',
  packaging: 'Packaging',
};

interface JourneyWithCustomer extends CustomerJourney {
  customer?: Customer;
}

export default function CRMJourneyDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [selectedJourney, setSelectedJourney] = useState<JourneyWithCustomer | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerPopoverOpen, setCustomerPopoverOpen] = useState(false);
  const [customerSearchTerm, setCustomerSearchTerm] = useState("");
  const [newJourneyData, setNewJourneyData] = useState({
    journeyStage: 'trigger',
    primaryProductLine: '',
    currentSupplier: '',
    estimatedAnnualVolume: '',
    assignedSalesRep: '',
    notes: '',
  });
  const [isJourneyCreatorOpen, setIsJourneyCreatorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<any>(null);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();

  // Fetch journey templates
  const { data: journeyTemplates = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/journey-templates'],
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async (templateId: number) => {
      await apiRequest('DELETE', `/api/crm/journey-templates/${templateId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journey-templates'] });
      toast({ title: "Deleted", description: "Pipeline template deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to delete template", variant: "destructive" });
    },
  });

  // Fetch journeys and customers
  const { data: journeys = [], isLoading: journeysLoading } = useQuery<CustomerJourney[]>({
    queryKey: ['/api/crm/journeys'],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ['/api/customers'],
  });

  // Create journey mutation
  const createJourneyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/crm/journeys', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journeys'] });
      setIsAddDialogOpen(false);
      setSelectedCustomerId("");
      setCustomerSearchTerm("");
      setNewJourneyData({
        journeyStage: 'trigger',
        primaryProductLine: '',
        currentSupplier: '',
        estimatedAnnualVolume: '',
        assignedSalesRep: '',
        notes: '',
      });
      toast({ title: "Success", description: "Customer added to journey pipeline" });
      logActivity('CRM_JOURNEY_CREATE', 'Added customer to journey pipeline');
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create journey", variant: "destructive" });
    },
  });

  // Update journey mutation
  const updateJourneyMutation = useMutation({
    mutationFn: async ({ customerId, data }: { customerId: string; data: any }) => {
      const res = await apiRequest('PUT', `/api/crm/journeys/${customerId}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journeys'] });
      setSelectedJourney(null);
      toast({ title: "Success", description: "Journey updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update journey", variant: "destructive" });
    },
  });

  // Combine journeys with customer data
  const journeysWithCustomers = useMemo(() => {
    const customerMap = new Map(customers.map(c => [c.id, c]));
    return journeys.map(j => ({
      ...j,
      customer: customerMap.get(j.customerId),
    }));
  }, [journeys, customers]);

  // Filter by search
  const filteredJourneys = useMemo(() => {
    if (!searchTerm) return journeysWithCustomers;
    const term = searchTerm.toLowerCase();
    return journeysWithCustomers.filter(j => {
      const customer = j.customer;
      if (!customer) return false;
      return (
        customer.company?.toLowerCase().includes(term) ||
        customer.firstName?.toLowerCase().includes(term) ||
        customer.lastName?.toLowerCase().includes(term) ||
        customer.email?.toLowerCase().includes(term) ||
        j.currentSupplier?.toLowerCase().includes(term)
      );
    });
  }, [journeysWithCustomers, searchTerm]);

  // Group by stage for kanban
  const journeysByStage = useMemo(() => {
    const grouped: Record<string, JourneyWithCustomer[]> = {};
    JOURNEY_STAGE_CONFIG.forEach(stage => {
      grouped[stage.id] = filteredJourneys.filter(j => j.journeyStage === stage.id);
    });
    return grouped;
  }, [filteredJourneys]);

  // Stats
  const stats = useMemo(() => {
    const total = journeys.length;
    const byStage = JOURNEY_STAGE_CONFIG.map(stage => ({
      ...stage,
      count: journeys.filter(j => j.journeyStage === stage.id).length,
    }));
    const totalVolume = journeys.reduce((sum, j) => sum + parseFloat(j.estimatedAnnualVolume || '0'), 0);
    return { total, byStage, totalVolume };
  }, [journeys]);

  // Get customers not yet in journey
  const availableCustomers = useMemo(() => {
    const inJourney = new Set(journeys.map(j => j.customerId));
    return customers.filter(c => !inJourney.has(c.id));
  }, [customers, journeys]);

  // Filter available customers for main search bar
  const filteredAvailableCustomers = useMemo(() => {
    const term = (searchTerm || '').toLowerCase();
    if (!term || term.length < 2) return [];
    return availableCustomers
      .filter(c =>
        c.company?.toLowerCase().includes(term) ||
        c.firstName?.toLowerCase().includes(term) ||
        c.lastName?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
      )
      .slice(0, 20);
  }, [availableCustomers, searchTerm]);

  // Filter available customers for dialog combobox
  const filteredDialogCustomers = useMemo(() => {
    if (!customerSearchTerm) return availableCustomers.slice(0, 50);
    const term = customerSearchTerm.toLowerCase();
    return availableCustomers
      .filter(c =>
        c.company?.toLowerCase().includes(term) ||
        c.firstName?.toLowerCase().includes(term) ||
        c.lastName?.toLowerCase().includes(term) ||
        c.email?.toLowerCase().includes(term)
      )
      .slice(0, 50);
  }, [availableCustomers, customerSearchTerm]);

  // Get selected customer display name
  const selectedCustomerName = useMemo(() => {
    const customer = customers.find(c => c.id === selectedCustomerId);
    if (!customer) return "";
    return customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
  }, [customers, selectedCustomerId]);

  const handleMoveStage = (journey: JourneyWithCustomer, newStage: string) => {
    updateJourneyMutation.mutate({
      customerId: journey.customerId,
      data: { journeyStage: newStage },
    });
    logActivity('CRM_STAGE_CHANGE', `Moved ${journey.customer?.company || 'customer'} to ${newStage}`);
  };

  const handleAddJourney = () => {
    if (!selectedCustomerId) {
      toast({ title: "Error", description: "Please select a customer", variant: "destructive" });
      return;
    }
    const customer = customers.find(c => c.id === selectedCustomerId);
    createJourneyMutation.mutate({
      customerId: selectedCustomerId,
      customerName: customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Unknown',
      journeyStage: newJourneyData.journeyStage,
      primaryProductLine: newJourneyData.primaryProductLine || null,
      currentSupplier: newJourneyData.currentSupplier || null,
      estimatedAnnualVolume: newJourneyData.estimatedAnnualVolume ? newJourneyData.estimatedAnnualVolume : null,
      assignedSalesRep: newJourneyData.assignedSalesRep || null,
      notes: newJourneyData.notes || null,
    });
  };

  const isLoading = journeysLoading || customersLoading;

  return (
    <div className="space-y-6" data-testid="crm-journey-page">
      <Tabs defaultValue="daily" className="w-full">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900" data-testid="page-title">Customer Activity Hub</h1>
            <p className="text-gray-500">Track engagement, follow-ups, and customer journeys</p>
          </div>
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="daily" className="flex items-center gap-2" data-testid="tab-daily">
              <Sun className="h-4 w-4" />
              Start Your Day
            </TabsTrigger>
            <TabsTrigger value="pipeline" className="flex items-center gap-2" data-testid="tab-pipeline">
              <GitBranch className="h-4 w-4" />
              Journey Pipeline
            </TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="daily" className="mt-6">
          <StartYourDayDashboard />
        </TabsContent>

        <TabsContent value="pipeline" className="mt-6 space-y-6">
          {/* Pipeline Controls */}
          <div className="flex items-center gap-3 justify-end">
            <Button
              variant={viewMode === 'kanban' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('kanban')}
              data-testid="btn-kanban-view"
            >
              <LayoutGrid className="h-4 w-4 mr-1" />
              Kanban
            </Button>
            <Button
              variant={viewMode === 'list' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setViewMode('list')}
              data-testid="btn-list-view"
            >
              <List className="h-4 w-4 mr-1" />
              List
            </Button>
            <Button onClick={() => setIsAddDialogOpen(true)} data-testid="btn-add-to-pipeline">
              <Plus className="h-4 w-4 mr-1" />
              Add to Pipeline
            </Button>
            <Button 
              variant="outline" 
              onClick={() => {
                setEditingTemplate(null);
                setIsJourneyCreatorOpen(true);
              }}
              data-testid="btn-create-pipeline"
            >
              <Settings className="h-4 w-4 mr-1" />
              Create Pipeline
            </Button>
          </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-3">
        <Card className="glass-card col-span-2 md:col-span-1">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-blue-600" />
              <div>
                <p className="text-xs text-gray-500">Total</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        {stats.byStage.map(stage => (
          <Card key={stage.id} className="glass-card">
            <CardContent className="p-3">
              <div className="flex items-center gap-2">
                <div className={`w-2 h-2 rounded-full ${stage.color}`} />
                <div>
                  <p className="text-xs text-gray-500 truncate">{stage.label}</p>
                  <p className="text-lg font-bold">{stage.count}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Pipeline Templates Section */}
      {journeyTemplates.length > 0 && (
        <Card className="glass-card">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <Settings className="h-4 w-4" />
                Your Pipeline Templates
              </CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setEditingTemplate(null);
                  setIsJourneyCreatorOpen(true);
                }}
                data-testid="btn-create-new-template"
              >
                <Plus className="h-3 w-3 mr-1" />
                New Template
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
              {journeyTemplates.map((template: any) => (
                <div
                  key={template.id}
                  data-testid={`template-card-${template.id}`}
                  className="border rounded-lg p-3 bg-white dark:bg-gray-800 hover:shadow-md transition-shadow"
                >
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h4 className="font-medium text-sm">{template.name}</h4>
                      {template.description && (
                        <p className="text-xs text-gray-500 mt-0.5">{template.description}</p>
                      )}
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem
                          onClick={() => {
                            setEditingTemplate(template);
                            setIsJourneyCreatorOpen(true);
                          }}
                        >
                          <Pencil className="h-3 w-3 mr-2" />
                          Edit
                        </DropdownMenuItem>
                        {!template.isSystemDefault && (
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => {
                              if (confirm('Delete this pipeline template?')) {
                                deleteTemplateMutation.mutate(template.id);
                              }
                            }}
                          >
                            <Trash2 className="h-3 w-3 mr-2" />
                            Delete
                          </DropdownMenuItem>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                  <div className="flex items-center gap-1 overflow-x-auto pb-1">
                    {(template.stages || []).slice(0, 5).map((stage: any, i: number) => (
                      <div key={i} className="flex items-center flex-shrink-0">
                        <div
                          className="px-2 py-0.5 rounded text-[10px] font-medium text-white"
                          style={{ backgroundColor: stage.color || '#3b82f6' }}
                        >
                          {stage.name}
                        </div>
                        {i < Math.min((template.stages || []).length, 5) - 1 && (
                          <ChevronRight className="h-3 w-3 text-gray-300 mx-0.5" />
                        )}
                      </div>
                    ))}
                    {(template.stages || []).length > 5 && (
                      <span className="text-[10px] text-gray-400 ml-1">
                        +{(template.stages || []).length - 5} more
                      </span>
                    )}
                  </div>
                  <div className="text-[10px] text-gray-400 mt-1">
                    {(template.stages || []).length} stages
                    {template.isSystemDefault && (
                      <Badge variant="secondary" className="ml-2 text-[9px] py-0">Default</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Search with Customer Suggestions */}
      <div className="relative max-w-lg">
        <Popover open={searchTerm.length > 1 && filteredAvailableCustomers.length > 0} onOpenChange={() => {}}>
          <PopoverTrigger asChild>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search customers to add to pipeline..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </PopoverTrigger>
          <PopoverContent className="w-[500px] p-0" align="start" onOpenAutoFocus={(e) => e.preventDefault()}>
            <div className="p-2 text-xs text-gray-500 border-b">
              Showing {filteredAvailableCustomers.length} matching customers (not in pipeline)
            </div>
            <ScrollArea className="h-[300px]">
              <div className="p-1">
                {filteredAvailableCustomers.map(customer => {
                  const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
                  return (
                    <div
                      key={customer.id}
                      className="flex items-center justify-between p-2 hover:bg-gray-100 rounded cursor-pointer"
                      onClick={() => {
                        setSelectedCustomerId(customer.id);
                        setIsAddDialogOpen(true);
                        setSearchTerm("");
                      }}
                    >
                      <div className="flex flex-col">
                        <span className="font-medium text-sm">{displayName}</span>
                        <span className="text-xs text-gray-500">
                          {customer.email} {customer.city && `• ${customer.city}`}
                        </span>
                      </div>
                      <Button size="sm" variant="outline" className="h-7 text-xs">
                        <Plus className="h-3 w-3 mr-1" />
                        Add
                      </Button>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>
          </PopoverContent>
        </Popover>
      </div>

      {/* Kanban View */}
      {viewMode === 'kanban' && (
        <div className="overflow-x-auto pb-4">
          <div className="flex gap-4 min-w-max">
            {JOURNEY_STAGE_CONFIG.map((stage, index) => {
              const StageIcon = stage.icon;
              const stageJourneys = journeysByStage[stage.id] || [];
              const nextStage = JOURNEY_STAGE_CONFIG[index + 1];
              
              return (
                <div key={stage.id} className="w-72 flex-shrink-0">
                  <div className={`rounded-t-lg p-3 ${stage.color} text-white`}>
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <StageIcon className="h-4 w-4" />
                        <span className="font-medium text-sm">{stage.label}</span>
                      </div>
                      <Badge variant="secondary" className="bg-white/20 text-white">
                        {stageJourneys.length}
                      </Badge>
                    </div>
                    <p className="text-xs text-white/80 mt-1">{stage.description}</p>
                  </div>
                  <ScrollArea className="h-[500px] bg-gray-50 rounded-b-lg border border-t-0 p-2">
                    <div className="space-y-2">
                      {stageJourneys.map(journey => (
                        <Card 
                          key={journey.id} 
                          className="glass-card cursor-pointer hover:shadow-md transition-shadow"
                          onClick={() => setSelectedJourney(journey)}
                          data-testid={`journey-card-${journey.id}`}
                        >
                          <CardContent className="p-3">
                            <div className="flex items-start justify-between mb-2">
                              <div>
                                <p className="font-medium text-sm truncate max-w-[180px]">
                                  {journey.customer?.company || 'Unknown Company'}
                                </p>
                                <p className="text-xs text-gray-500 truncate max-w-[180px]">
                                  {journey.customer?.firstName} {journey.customer?.lastName}
                                </p>
                              </div>
                              {nextStage && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      size="icon"
                                      variant="ghost"
                                      className="h-6 w-6"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleMoveStage(journey, nextStage.id);
                                      }}
                                      data-testid={`btn-advance-${journey.id}`}
                                    >
                                      <ChevronRight className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Move to {nextStage.label}</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            {journey.primaryProductLine && (
                              <Badge variant="outline" className="text-xs mb-2">
                                {PRODUCT_LINE_LABELS[journey.primaryProductLine] || journey.primaryProductLine}
                              </Badge>
                            )}
                            <div className="flex items-center gap-3 text-xs text-gray-500">
                              {journey.quotesReceived && journey.quotesReceived > 0 && (
                                <span className="flex items-center gap-1">
                                  <FileText className="h-3 w-3" />
                                  {journey.quotesReceived} quotes
                                </span>
                              )}
                              {journey.priceListViews && journey.priceListViews > 0 && (
                                <span className="flex items-center gap-1">
                                  <TrendingUp className="h-3 w-3" />
                                  {journey.priceListViews} views
                                </span>
                              )}
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {stageJourneys.length === 0 && (
                        <div className="text-center text-gray-400 py-8 text-sm">
                          No customers in this stage
                        </div>
                      )}
                    </div>
                  </ScrollArea>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <Card className="glass-card">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Company</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Contact</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Stage</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Product Line</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Quotes</th>
                    <th className="text-left p-3 text-sm font-medium text-gray-600">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredJourneys.map(journey => {
                    const stageConfig = JOURNEY_STAGE_CONFIG.find(s => s.id === journey.journeyStage);
                    return (
                      <tr 
                        key={journey.id} 
                        className="border-b hover:bg-gray-50 cursor-pointer"
                        onClick={() => setSelectedJourney(journey)}
                        data-testid={`journey-row-${journey.id}`}
                      >
                        <td className="p-3">
                          <p className="font-medium">{journey.customer?.company || 'N/A'}</p>
                        </td>
                        <td className="p-3">
                          <p className="text-sm">{journey.customer?.firstName} {journey.customer?.lastName}</p>
                          {journey.customer?.email && (
                              <a 
                                href={`mailto:${journey.customer.email}`} 
                                className="text-xs text-gray-500 hover:text-primary hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                {journey.customer.email}
                              </a>
                            )}
                        </td>
                        <td className="p-3">
                          {stageConfig && (
                            <Badge className={`${stageConfig.color} text-white`}>
                              {stageConfig.label}
                            </Badge>
                          )}
                        </td>
                        <td className="p-3 text-sm">
                          {PRODUCT_LINE_LABELS[journey.primaryProductLine || ''] || '-'}
                        </td>
                        <td className="p-3 text-sm">
                          {journey.quotesReceived || 0}
                        </td>
                        <td className="p-3">
                          <Button size="sm" variant="outline">View</Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add to Pipeline Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Add Customer to Pipeline</DialogTitle>
            <DialogDescription>
              Start tracking a customer's journey through the sales process
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Customer</Label>
              <Popover open={customerPopoverOpen} onOpenChange={setCustomerPopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={customerPopoverOpen}
                    className="w-full justify-between font-normal"
                    data-testid="select-customer"
                  >
                    {selectedCustomerName || "Search for a customer..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[400px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type to search customers..."
                      value={customerSearchTerm}
                      onValueChange={setCustomerSearchTerm}
                    />
                    <CommandList>
                      <CommandEmpty>
                        {customerSearchTerm ? "No customers found." : "Start typing to search..."}
                      </CommandEmpty>
                      <CommandGroup>
                        {filteredDialogCustomers.map(customer => {
                          const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
                          return (
                            <CommandItem
                              key={customer.id}
                              value={customer.id}
                              onSelect={() => {
                                setSelectedCustomerId(customer.id);
                                setCustomerPopoverOpen(false);
                              }}
                            >
                              <Check
                                className={`mr-2 h-4 w-4 ${selectedCustomerId === customer.id ? "opacity-100" : "opacity-0"}`}
                              />
                              <div className="flex flex-col">
                                <span className="font-medium">{displayName}</span>
                                {customer.email && (
                                  <span className="text-xs text-gray-500">{customer.email}</span>
                                )}
                              </div>
                            </CommandItem>
                          );
                        })}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label>Starting Stage</Label>
              <Select 
                value={newJourneyData.journeyStage} 
                onValueChange={(v) => setNewJourneyData(prev => ({ ...prev, journeyStage: v }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {JOURNEY_STAGE_CONFIG.map(stage => (
                    <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Primary Product Line</Label>
              <Select 
                value={newJourneyData.primaryProductLine} 
                onValueChange={(v) => setNewJourneyData(prev => ({ ...prev, primaryProductLine: v }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select product line..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_LINE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Current Supplier</Label>
              <Input
                value={newJourneyData.currentSupplier}
                onChange={(e) => setNewJourneyData(prev => ({ ...prev, currentSupplier: e.target.value }))}
                placeholder="e.g., Domtar, Sappi, etc."
              />
            </div>
            <div>
              <Label>Estimated Annual Volume ($)</Label>
              <Input
                type="number"
                value={newJourneyData.estimatedAnnualVolume}
                onChange={(e) => setNewJourneyData(prev => ({ ...prev, estimatedAnnualVolume: e.target.value }))}
                placeholder="50000"
              />
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={newJourneyData.notes}
                onChange={(e) => setNewJourneyData(prev => ({ ...prev, notes: e.target.value }))}
                placeholder="Initial notes about this opportunity..."
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleAddJourney} 
              disabled={createJourneyMutation.isPending}
              data-testid="btn-confirm-add"
            >
              {createJourneyMutation.isPending ? 'Adding...' : 'Add to Pipeline'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Journey Detail Dialog */}
      <Dialog open={!!selectedJourney} onOpenChange={() => setSelectedJourney(null)}>
        <DialogContent className="max-w-2xl">
          {selectedJourney && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Building2 className="h-5 w-5" />
                  {selectedJourney.customer?.company || 'Customer Details'}
                </DialogTitle>
                <DialogDescription>
                  {selectedJourney.customer?.firstName} {selectedJourney.customer?.lastName}
                </DialogDescription>
              </DialogHeader>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-gray-500">Current Stage</Label>
                  <Select 
                    value={selectedJourney.journeyStage || 'trigger'}
                    onValueChange={(v) => handleMoveStage(selectedJourney, v)}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {JOURNEY_STAGE_CONFIG.map(stage => (
                        <SelectItem key={stage.id} value={stage.id}>{stage.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Product Line</Label>
                  <p className="font-medium">{PRODUCT_LINE_LABELS[selectedJourney.primaryProductLine || ''] || 'Not set'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Current Supplier</Label>
                  <p className="font-medium">{selectedJourney.currentSupplier || 'Not set'}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Estimated Annual Volume</Label>
                  <p className="font-medium">${parseFloat(selectedJourney.estimatedAnnualVolume || '0').toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Quotes Received</Label>
                  <p className="font-medium">{selectedJourney.quotesReceived || 0}</p>
                </div>
                <div>
                  <Label className="text-xs text-gray-500">Price List Views</Label>
                  <p className="font-medium">{selectedJourney.priceListViews || 0}</p>
                </div>
                {selectedJourney.customer?.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-400" />
                    <a 
                      href={`mailto:${selectedJourney.customer.email}`}
                      className="text-sm text-primary hover:underline"
                    >
                      {selectedJourney.customer.email}
                    </a>
                  </div>
                )}
                {selectedJourney.customer?.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-400" />
                    <span className="text-sm">{selectedJourney.customer.phone}</span>
                  </div>
                )}
              </div>
              {selectedJourney.notes && (
                <div className="mt-4">
                  <Label className="text-xs text-gray-500">Notes</Label>
                  <p className="text-sm bg-gray-50 p-3 rounded">{selectedJourney.notes}</p>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>

        </TabsContent>
      </Tabs>

      {/* Journey Creator Modal */}
      <JourneyCreatorModal
        open={isJourneyCreatorOpen}
        onOpenChange={setIsJourneyCreatorOpen}
        editTemplate={editingTemplate}
      />
    </div>
  );
}
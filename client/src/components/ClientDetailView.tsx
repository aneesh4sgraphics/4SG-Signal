import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import {
  ArrowLeft,
  Mail,
  Phone,
  User,
  Building2,
  MapPin,
  Trash2,
  Pencil,
  ChevronRight,
  Check,
  Clock,
  Package,
  FileText,
  FlaskConical,
  Palette,
  Plus,
  AlertTriangle,
  Target,
  Handshake,
  Users,
  CheckCircle,
  Rocket,
  X,
  ChevronsUpDown,
} from "lucide-react";
import type { Customer, CustomerJourney, PressProfile, SampleRequest, TestOutcome, SwatchBookShipment, SwatchSelection, ProductCategory, QuoteEvent, PriceListEvent } from "@shared/schema";

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
  commodity_cut_size: 'Commodity Cut-Size Paper',
  specialty_coated: 'Specialty Coated',
  large_format: 'Large Format',
  label_stocks: 'Label Stocks',
  digital_media: 'Digital Media',
  packaging: 'Packaging',
};

interface ClientDetailViewProps {
  customer: Customer;
  onBack: () => void;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customerId: string) => void;
}

export default function ClientDetailView({ customer, onBack, onEdit, onDelete }: ClientDetailViewProps) {
  const [activeTab, setActiveTab] = useState("press-profiles");
  const [isAddPressProfileOpen, setIsAddPressProfileOpen] = useState(false);
  const [isAddSampleOpen, setIsAddSampleOpen] = useState(false);
  const [newPressProfile, setNewPressProfile] = useState({
    pressType: '',
    pressName: '',
    inkType: '',
    substrateFocus: [] as string[],
    notes: '',
  });
  const [substratePopoverOpen, setSubstratePopoverOpen] = useState(false);
  const [newSample, setNewSample] = useState({
    productCategory: '',
    productName: '',
    quantity: '',
    pressProfileId: '',
    notes: '',
  });
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();

  const { data: journey, refetch: refetchJourney } = useQuery<CustomerJourney | null>({
    queryKey: ['/api/crm/journeys', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/journeys/${customer.id}`);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Failed to fetch journey');
      return res.json();
    },
  });

  const { data: pressProfiles = [], refetch: refetchPressProfiles } = useQuery<PressProfile[]>({
    queryKey: ['/api/crm/press-profiles', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/press-profiles?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: sampleRequests = [], refetch: refetchSamples } = useQuery<SampleRequest[]>({
    queryKey: ['/api/crm/sample-requests', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/sample-requests?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: swatchShipments = [] } = useQuery<SwatchBookShipment[]>({
    queryKey: ['/api/crm/swatch-shipments', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/swatch-shipments?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: productCategories = [] } = useQuery<ProductCategory[]>({
    queryKey: ['/api/product-categories'],
  });

  const { data: quoteEvents = [] } = useQuery<QuoteEvent[]>({
    queryKey: ['/api/crm/quote-events', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quote-events?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const { data: priceListEvents = [] } = useQuery<PriceListEvent[]>({
    queryKey: ['/api/crm/price-list-events', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/price-list-events?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  const createJourneyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/crm/journeys', data);
      return res.json();
    },
    onSuccess: () => {
      refetchJourney();
      toast({ title: "Success", description: "Customer journey started" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create journey", variant: "destructive" });
    },
  });

  const updateJourneyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PUT', `/api/crm/journeys/${customer.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchJourney();
      toast({ title: "Success", description: "Journey stage updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update journey", variant: "destructive" });
    },
  });

  const createPressProfileMutation = useMutation({
    mutationFn: async (data: any) => {
      console.log('createPressProfileMutation - sending data:', data);
      const res = await apiRequest('POST', '/api/crm/press-profiles', data);
      const result = await res.json();
      console.log('createPressProfileMutation - response:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('createPressProfileMutation - onSuccess:', data);
      refetchPressProfiles();
      setIsAddPressProfileOpen(false);
      setNewPressProfile({ pressType: '', pressName: '', inkType: '', substrateFocus: [], notes: '' });
      toast({ title: "Success", description: "Press profile added" });
    },
    onError: (error: any) => {
      console.error('createPressProfileMutation - onError:', error);
      toast({ title: "Error", description: error.message || "Failed to add press profile", variant: "destructive" });
    },
  });

  const createSampleMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/crm/sample-requests', data);
      return res.json();
    },
    onSuccess: () => {
      refetchSamples();
      setIsAddSampleOpen(false);
      setNewSample({ productCategory: '', productName: '', quantity: '', pressProfileId: '', notes: '' });
      toast({ title: "Success", description: "Sample request created" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to create sample", variant: "destructive" });
    },
  });

  const currentStageIndex = journey ? JOURNEY_STAGE_CONFIG.findIndex(s => s.id === journey.journeyStage) : -1;
  const customerName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown';

  const handleStartJourney = () => {
    if (!customer.id) {
      toast({ title: "Error", description: "Customer ID is missing", variant: "destructive" });
      return;
    }
    
    createJourneyMutation.mutate({
      customerId: String(customer.id),
      journeyStage: 'trigger',
    });
  };

  const handleAdvanceStage = () => {
    if (!journey || currentStageIndex >= JOURNEY_STAGE_CONFIG.length - 1) return;
    const nextStage = JOURNEY_STAGE_CONFIG[currentStageIndex + 1];
    updateJourneyMutation.mutate({
      journeyStage: nextStage.id,
      stageUpdatedAt: new Date().toISOString(),
    });
    logActivity('CRM_STAGE_ADVANCE', `Advanced ${customerName} to ${nextStage.label}`);
  };

  const handleAddPressProfile = () => {
    console.log('=== handleAddPressProfile called ===');
    const payload = {
      customerId: String(customer.id),
      pressType: newPressProfile.pressType,
      pressModel: newPressProfile.pressName,
      inkType: newPressProfile.inkType,
      substrateFocus: newPressProfile.substrateFocus.join(', '),
      notes: newPressProfile.notes,
    };
    console.log('Press profile payload:', payload);
    createPressProfileMutation.mutate(payload);
  };

  const handleAddSample = () => {
    createSampleMutation.mutate({
      customerId: customer.id,
      ...newSample,
      quantity: newSample.quantity ? parseInt(newSample.quantity) : 1,
      pressProfileId: newSample.pressProfileId ? parseInt(newSample.pressProfileId) : null,
    });
  };

  return (
    <div className="space-y-6" data-testid="client-detail-view">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="btn-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900" data-testid="client-name">{customerName}</h1>
              {journey && (
                <Badge className={`${JOURNEY_STAGE_CONFIG[currentStageIndex]?.color || 'bg-gray-500'} text-white`}>
                  {journey.journeyStage}
                </Badge>
              )}
            </div>
            {customer.firstName && customer.lastName && customer.company && (
              <p className="text-gray-500">{customer.firstName} {customer.lastName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {onEdit && (
            <Button variant="outline" size="icon" onClick={() => onEdit(customer)} data-testid="btn-edit-client">
              <Pencil className="h-4 w-4" />
            </Button>
          )}
          {onDelete && (
            <Button variant="outline" size="icon" onClick={() => onDelete(customer.id)} data-testid="btn-delete-client">
              <Trash2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Contact Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {customer.email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail className="h-4 w-4 text-gray-400" />
                <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline">{customer.email}</a>
              </div>
            )}
            {customer.phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone className="h-4 w-4 text-gray-400" />
                <span>{customer.phone}</span>
              </div>
            )}
            {(customer.city || customer.province) && (
              <div className="flex items-center gap-2 text-sm">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span>{[customer.city, customer.province].filter(Boolean).join(', ')}</span>
              </div>
            )}
            {!customer.email && !customer.phone && (
              <p className="text-sm text-gray-400">No contact info</p>
            )}
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Risk Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Margin Pressure</span>
              <Badge variant="secondary">Medium</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Risk Sensitivity</span>
              <Badge variant="secondary">Medium</Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Engagement</span>
              <Badge variant="outline" className="bg-gray-100">
                {journey ? 'Active' : 'New'}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">Pending Tasks</CardTitle>
              <Badge variant="secondary">0</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-gray-400">No pending tasks</p>
          </CardContent>
        </Card>
      </div>

      <Card className="glass-card">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-lg font-semibold">Customer Journey</CardTitle>
              {journey?.primaryProductLine && (
                <p className="text-sm text-gray-500">
                  {PRODUCT_LINE_LABELS[journey.primaryProductLine] || journey.primaryProductLine}
                  <Badge variant="outline" className="ml-2 bg-green-50 text-green-700 border-green-200">low risk</Badge>
                </p>
              )}
            </div>
            {journey && currentStageIndex < JOURNEY_STAGE_CONFIG.length - 1 && (
              <Button onClick={handleAdvanceStage} disabled={updateJourneyMutation.isPending} data-testid="btn-advance-stage">
                <ChevronRight className="h-4 w-4 mr-1" />
                Advance Stage
              </Button>
            )}
            {!journey && (
              <Button type="button" onClick={handleStartJourney} disabled={createJourneyMutation.isPending} data-testid="btn-start-journey">
                <Plus className="h-4 w-4 mr-1" />
                Start Journey
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {journey ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between gap-2 overflow-x-auto pb-2">
                {JOURNEY_STAGE_CONFIG.map((stage, index) => {
                  const isCompleted = index < currentStageIndex;
                  const isCurrent = index === currentStageIndex;
                  const StageIcon = stage.icon;
                  return (
                    <div key={stage.id} className="flex items-center flex-1 min-w-0">
                      <div className="flex flex-col items-center min-w-[80px]">
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold transition-all ${
                            isCompleted ? 'bg-green-500' : isCurrent ? stage.color : 'bg-gray-200 text-gray-500'
                          }`}
                        >
                          {isCompleted ? <Check className="h-5 w-5" /> : index + 1}
                        </div>
                        <span className={`text-xs mt-1 text-center truncate max-w-[80px] ${isCurrent ? 'font-semibold text-gray-900' : 'text-gray-500'}`}>
                          {stage.label.split(' ')[0]}...
                        </span>
                      </div>
                      {index < JOURNEY_STAGE_CONFIG.length - 1 && (
                        <div className={`h-0.5 flex-1 mx-1 ${index < currentStageIndex ? 'bg-green-500' : 'bg-gray-200'}`} />
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="pt-2 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Overall Gate Progress</span>
                  <span className="font-medium">{currentStageIndex + 1} / {JOURNEY_STAGE_CONFIG.length}</span>
                </div>
                <div className="w-full h-2 bg-gray-100 rounded-full mt-2">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${((currentStageIndex + 1) / JOURNEY_STAGE_CONFIG.length) * 100}%` }}
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Target className="h-12 w-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No journey started for this customer</p>
              <Button type="button" onClick={handleStartJourney} disabled={createJourneyMutation.isPending}>
                <Plus className="h-4 w-4 mr-1" />
                Start Journey Tracking
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="swatch-book" className="flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Swatch Book
          </TabsTrigger>
          <TabsTrigger value="press-profiles" className="flex items-center gap-2">
            <Building2 className="h-4 w-4" />
            Press Profiles ({pressProfiles.length})
          </TabsTrigger>
          <TabsTrigger value="samples" className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4" />
            Samples ({sampleRequests.length})
          </TabsTrigger>
          <TabsTrigger value="quotes-prices" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            Quotes & Prices ({quoteEvents.length + priceListEvents.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="swatch-book" className="mt-4">
          <Card className="glass-card">
            <CardContent className="p-6">
              {swatchShipments.length > 0 ? (
                <div className="space-y-3">
                  {swatchShipments.map(shipment => (
                    <div key={shipment.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{shipment.swatchBookVersion || 'Swatch Book'}</p>
                        <p className="text-sm text-gray-500">
                          {shipment.shippedAt ? `Shipped ${new Date(shipment.shippedAt).toLocaleDateString()}` : 'Pending shipment'}
                        </p>
                      </div>
                      <Badge variant={shipment.status === 'delivered' ? 'default' : 'secondary'}>
                        {shipment.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Palette className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No swatch books sent to this customer yet</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="press-profiles" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Press Equipment</CardTitle>
              <Button size="sm" onClick={() => setIsAddPressProfileOpen(true)} data-testid="btn-add-press-profile">
                <Plus className="h-4 w-4 mr-1" />
                Add Press Profile
              </Button>
            </CardHeader>
            <CardContent>
              {pressProfiles.length > 0 ? (
                <div className="space-y-3">
                  {pressProfiles.map(profile => (
                    <div key={profile.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{profile.pressModel || profile.pressType}</p>
                        <p className="text-sm text-gray-500">
                          {[profile.inkType, profile.substrateFocus].filter(Boolean).join(' • ')}
                        </p>
                      </div>
                      <Badge variant="outline">{profile.pressType}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Building2 className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No press profiles recorded</p>
                  <Button size="sm" variant="outline" onClick={() => setIsAddPressProfileOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add First Press Profile
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="samples" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base">Sample Requests</CardTitle>
              <Button size="sm" onClick={() => setIsAddSampleOpen(true)} data-testid="btn-add-sample">
                <Plus className="h-4 w-4 mr-1" />
                Request Sample
              </Button>
            </CardHeader>
            <CardContent>
              {sampleRequests.length > 0 ? (
                <div className="space-y-3">
                  {sampleRequests.map(sample => (
                    <div key={sample.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div>
                        <p className="font-medium">{sample.productName || 'Sample Request'}</p>
                        <p className="text-sm text-gray-500">
                          Qty: {sample.quantity} • {sample.status}
                        </p>
                      </div>
                      <Badge variant={sample.status === 'completed' ? 'default' : 'secondary'}>
                        {sample.status}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FlaskConical className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500 mb-4">No samples requested</p>
                  <Button size="sm" variant="outline" onClick={() => setIsAddSampleOpen(true)}>
                    <Plus className="h-4 w-4 mr-1" />
                    Request First Sample
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="quotes-prices" className="mt-4">
          <Card className="glass-card">
            <CardHeader>
              <CardTitle className="text-base">Quotes & Price Lists Sent</CardTitle>
            </CardHeader>
            <CardContent>
              {quoteEvents.length > 0 || priceListEvents.length > 0 ? (
                <div className="space-y-4">
                  {quoteEvents.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-600 mb-2">Quotes from QuickQuotes</h4>
                      <div className="space-y-2">
                        {quoteEvents.map(event => (
                          <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium">{event.quoteNumber || `Quote #${event.id}`}</p>
                              <p className="text-sm text-gray-500">
                                {event.itemCount ? `${event.itemCount} items` : ''} 
                                {event.totalAmount ? ` • $${parseFloat(event.totalAmount).toLocaleString()}` : ''}
                              </p>
                              <p className="text-xs text-gray-400">
                                {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : ''}
                              </p>
                            </div>
                            <Badge variant={event.eventType === 'accepted' ? 'default' : event.eventType === 'rejected' ? 'destructive' : 'secondary'}>
                              {event.eventType}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {priceListEvents.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-600 mb-2">Price Lists from Price List App</h4>
                      <div className="space-y-2">
                        {priceListEvents.map(event => (
                          <div key={event.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                            <div>
                              <p className="font-medium">
                                {event.eventType === 'email' ? 'Emailed Price List' : 
                                 event.eventType === 'download' ? 'Downloaded Price List' : 'Viewed Price List'}
                              </p>
                              <p className="text-sm text-gray-500">
                                {event.priceTier && `Tier: ${event.priceTier}`}
                                {event.productTypes && event.productTypes.length > 0 && ` • ${event.productTypes.length} product types`}
                              </p>
                              <p className="text-xs text-gray-400">
                                {event.createdAt ? new Date(event.createdAt).toLocaleDateString() : ''}
                                {event.userEmail && ` • by ${event.userEmail}`}
                              </p>
                            </div>
                            <Badge variant="outline">
                              {event.eventType}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No quotes or price lists sent to this customer yet</p>
                  <p className="text-xs text-gray-400 mt-2">Use QuickQuotes or Price List apps to send pricing to this customer</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={isAddPressProfileOpen} onOpenChange={setIsAddPressProfileOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Press Profile</DialogTitle>
            <DialogDescription>Record the customer's printing equipment details</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Press Type</Label>
              <Select value={newPressProfile.pressType} onValueChange={(v) => setNewPressProfile(p => ({ ...p, pressType: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select press type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="offset">Offset</SelectItem>
                  <SelectItem value="digital_dry_toner">Digital Dry Toner</SelectItem>
                  <SelectItem value="hp_indigo">HP Indigo</SelectItem>
                  <SelectItem value="inkjet">Inkjet</SelectItem>
                  <SelectItem value="flexo">Flexographic</SelectItem>
                  <SelectItem value="gravure">Gravure</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Press Name / Model</Label>
              <Input
                value={newPressProfile.pressName}
                onChange={(e) => setNewPressProfile(p => ({ ...p, pressName: e.target.value }))}
                placeholder="e.g., Heidelberg Speedmaster XL 106"
              />
            </div>
            <div>
              <Label>Ink Type</Label>
              <Select value={newPressProfile.inkType} onValueChange={(v) => setNewPressProfile(p => ({ ...p, inkType: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select ink type..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="dry_toner">Dry Toner</SelectItem>
                  <SelectItem value="hp_indigo">HP Indigo</SelectItem>
                  <SelectItem value="uv">UV</SelectItem>
                  <SelectItem value="aqueous">Aqueous</SelectItem>
                  <SelectItem value="solvent">Solvent</SelectItem>
                  <SelectItem value="latex">Latex</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Substrate Focus</Label>
              <Popover open={substratePopoverOpen} onOpenChange={setSubstratePopoverOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    className="w-full justify-between font-normal"
                    data-testid="substrate-focus-trigger"
                  >
                    {newPressProfile.substrateFocus.length > 0
                      ? `${newPressProfile.substrateFocus.length} selected`
                      : "Select substrates..."}
                    <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-full p-0" align="start">
                  <ScrollArea className="h-60">
                    <div className="p-2 space-y-1">
                      {productCategories.map((category) => (
                        <div
                          key={category.id}
                          className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                          onClick={() => {
                            const name = category.name;
                            setNewPressProfile(p => ({
                              ...p,
                              substrateFocus: p.substrateFocus.includes(name)
                                ? p.substrateFocus.filter(s => s !== name)
                                : [...p.substrateFocus, name]
                            }));
                          }}
                        >
                          <Checkbox
                            checked={newPressProfile.substrateFocus.includes(category.name)}
                            onCheckedChange={() => {}}
                          />
                          <span className="text-sm">{category.name}</span>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </PopoverContent>
              </Popover>
              {newPressProfile.substrateFocus.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {newPressProfile.substrateFocus.map((substrate) => (
                    <Badge
                      key={substrate}
                      variant="secondary"
                      className="flex items-center gap-1"
                    >
                      {substrate}
                      <X
                        className="h-3 w-3 cursor-pointer hover:text-red-500"
                        onClick={() => setNewPressProfile(p => ({
                          ...p,
                          substrateFocus: p.substrateFocus.filter(s => s !== substrate)
                        }))}
                      />
                    </Badge>
                  ))}
                </div>
              )}
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea
                value={newPressProfile.notes}
                onChange={(e) => setNewPressProfile(p => ({ ...p, notes: e.target.value }))}
                placeholder="Additional notes..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setIsAddPressProfileOpen(false)}>Cancel</Button>
            <Button type="button" onClick={handleAddPressProfile} disabled={createPressProfileMutation.isPending}>
              {createPressProfileMutation.isPending ? 'Adding...' : 'Add Profile'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isAddSampleOpen} onOpenChange={setIsAddSampleOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Sample</DialogTitle>
            <DialogDescription>Create a sample request for this customer</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Product Category</Label>
              <Select value={newSample.productCategory} onValueChange={(v) => setNewSample(p => ({ ...p, productCategory: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(PRODUCT_LINE_LABELS).map(([key, label]) => (
                    <SelectItem key={key} value={key}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Product Name</Label>
              <Input
                value={newSample.productName}
                onChange={(e) => setNewSample(p => ({ ...p, productName: e.target.value }))}
                placeholder="e.g., Accent Opaque 80# Cover"
              />
            </div>
            <div>
              <Label>Quantity</Label>
              <Input
                type="number"
                value={newSample.quantity}
                onChange={(e) => setNewSample(p => ({ ...p, quantity: e.target.value }))}
                placeholder="1"
              />
            </div>
            {pressProfiles.length > 0 && (
              <div>
                <Label>Link to Press Profile (optional)</Label>
                <Select value={newSample.pressProfileId} onValueChange={(v) => setNewSample(p => ({ ...p, pressProfileId: v }))}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select press..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pressProfiles.map(profile => (
                      <SelectItem key={profile.id} value={profile.id.toString()}>
                        {profile.pressModel || profile.pressType}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div>
              <Label>Notes</Label>
              <Textarea
                value={newSample.notes}
                onChange={(e) => setNewSample(p => ({ ...p, notes: e.target.value }))}
                placeholder="Special requirements..."
                rows={2}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsAddSampleOpen(false)}>Cancel</Button>
            <Button onClick={handleAddSample} disabled={createSampleMutation.isPending}>
              {createSampleMutation.isPending ? 'Creating...' : 'Create Request'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

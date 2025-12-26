import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  FlaskConical,
  BookOpen,
  FileText,
  Plus,
  Check,
  Clock,
  Package,
  Truck,
  CheckCircle,
  XCircle,
  ChevronRight,
  Trash2,
  AlertCircle,
} from "lucide-react";
import type { 
  Customer, 
  CustomerJourneyInstance, 
  CustomerJourneyStep, 
  PressTestJourneyDetail,
  ProductPricingMaster 
} from "@shared/schema";

const JOURNEY_TYPE_CONFIG = {
  press_test: {
    label: 'Press Test Journey',
    icon: FlaskConical,
    color: 'bg-blue-500',
    description: 'Track sample requests through testing',
    steps: [
      { key: 'sample_requested', label: 'Sample Requested', icon: Package },
      { key: 'tracking_added', label: 'Tracking Added', icon: Truck },
      { key: 'received', label: 'Received', icon: CheckCircle },
      { key: 'result', label: 'Result', icon: Check },
    ],
  },
  swatch_book: {
    label: 'Swatch Book Journey',
    icon: BookOpen,
    color: 'bg-purple-500',
    description: 'Track swatch book requests',
    steps: [],
  },
  quote_sent: {
    label: 'Quote Sent Journey',
    icon: FileText,
    color: 'bg-green-500',
    description: 'Track quote follow-ups',
    steps: [],
  },
};

interface JourneyWithDetails {
  instance: CustomerJourneyInstance;
  steps: CustomerJourneyStep[];
  details: PressTestJourneyDetail | null;
}

interface CustomerJourneyPanelProps {
  customer: Customer;
  isOpen: boolean;
  onClose: () => void;
}

export default function CustomerJourneyPanel({ customer, isOpen, onClose }: CustomerJourneyPanelProps) {
  const [activeJourneyType, setActiveJourneyType] = useState<'press_test' | 'swatch_book' | 'quote_sent'>('press_test');
  const [isNewJourneyOpen, setIsNewJourneyOpen] = useState(false);
  const [selectedJourney, setSelectedJourney] = useState<JourneyWithDetails | null>(null);
  const { toast } = useToast();

  // Fetch all journey instances for this customer
  const { data: journeyInstances = [], refetch: refetchJourneys } = useQuery<CustomerJourneyInstance[]>({
    queryKey: ['/api/crm/journey-instances', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/journey-instances?customerId=${customer.id}`);
      if (!res.ok) throw new Error('Failed to fetch journeys');
      return res.json();
    },
    enabled: isOpen,
  });

  // Fetch products for selection
  const { data: products = [] } = useQuery<ProductPricingMaster[]>({
    queryKey: ['/api/product-pricing-master'],
    enabled: isOpen,
  });

  // Filter journeys by type
  const filteredJourneys = journeyInstances.filter(j => j.journeyType === activeJourneyType);

  const createJourneyMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/crm/journey-instances', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journey-instances', customer.id] });
      refetchJourneys();
      setIsNewJourneyOpen(false);
      toast({ title: "Journey created successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Failed to create journey", description: error.message, variant: "destructive" });
    },
  });

  const deleteJourneyMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/crm/journey-instances/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journey-instances', customer.id] });
      refetchJourneys();
      setSelectedJourney(null);
      toast({ title: "Journey deleted" });
    },
  });

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent side="right" className="w-full sm:w-[540px] sm:max-w-xl p-0">
        <SheetHeader className="p-6 pb-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <SheetTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            Customer Journeys
          </SheetTitle>
          <SheetDescription>
            Track {customer.companyName || customer.name}'s journey through different processes
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col h-[calc(100vh-140px)]">
          {/* Journey Type Tabs */}
          <Tabs value={activeJourneyType} onValueChange={(v) => setActiveJourneyType(v as any)} className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 mx-4 mt-4 max-w-[calc(100%-32px)]">
              <TabsTrigger value="press_test" className="text-xs" data-testid="tab-press-test">
                <FlaskConical className="w-3 h-3 mr-1" />
                Press Test
              </TabsTrigger>
              <TabsTrigger value="swatch_book" className="text-xs" data-testid="tab-swatch-book">
                <BookOpen className="w-3 h-3 mr-1" />
                Swatch Book
              </TabsTrigger>
              <TabsTrigger value="quote_sent" className="text-xs" data-testid="tab-quote-sent">
                <FileText className="w-3 h-3 mr-1" />
                Quote Sent
              </TabsTrigger>
            </TabsList>

            <ScrollArea className="flex-1 p-4">
              {/* Press Test Journey Tab */}
              <TabsContent value="press_test" className="mt-0 space-y-4">
                <div className="flex justify-between items-center">
                  <p className="text-sm text-muted-foreground">
                    {filteredJourneys.length} active journey{filteredJourneys.length !== 1 ? 's' : ''}
                  </p>
                  <Button 
                    size="sm" 
                    onClick={() => setIsNewJourneyOpen(true)}
                    data-testid="btn-new-press-test"
                  >
                    <Plus className="w-4 h-4 mr-1" />
                    New Press Test
                  </Button>
                </div>

                {filteredJourneys.length === 0 ? (
                  <Card className="border-dashed">
                    <CardContent className="py-8 text-center">
                      <FlaskConical className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                      <p className="text-muted-foreground">No press test journeys yet</p>
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="mt-4"
                        onClick={() => setIsNewJourneyOpen(true)}
                      >
                        Start First Journey
                      </Button>
                    </CardContent>
                  </Card>
                ) : (
                  <div className="space-y-3">
                    {filteredJourneys.map((journey) => (
                      <JourneyCard
                        key={journey.id}
                        journey={journey}
                        config={JOURNEY_TYPE_CONFIG.press_test}
                        onSelect={async () => {
                          const res = await fetch(`/api/crm/journey-instances/${journey.id}`);
                          if (res.ok) {
                            const data = await res.json();
                            setSelectedJourney(data);
                          }
                        }}
                        onDelete={() => deleteJourneyMutation.mutate(journey.id)}
                      />
                    ))}
                  </div>
                )}
              </TabsContent>

              {/* Swatch Book Journey Tab */}
              <TabsContent value="swatch_book" className="mt-0">
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <BookOpen className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground font-medium">Swatch Book Journey</p>
                    <p className="text-sm text-muted-foreground mt-1">Coming soon - steps to be decided</p>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Quote Sent Journey Tab */}
              <TabsContent value="quote_sent" className="mt-0">
                <Card className="border-dashed">
                  <CardContent className="py-8 text-center">
                    <FileText className="w-12 h-12 mx-auto text-muted-foreground/50 mb-3" />
                    <p className="text-muted-foreground font-medium">Quote Sent Journey</p>
                    <p className="text-sm text-muted-foreground mt-1">Coming soon - steps to be decided</p>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        </div>

        {/* New Press Test Journey Dialog */}
        <NewPressTestDialog
          isOpen={isNewJourneyOpen}
          onClose={() => setIsNewJourneyOpen(false)}
          customerId={customer.id}
          products={products}
          onSubmit={(data) => createJourneyMutation.mutate(data)}
          isPending={createJourneyMutation.isPending}
        />

        {/* Journey Detail Dialog */}
        {selectedJourney && (
          <JourneyDetailDialog
            journey={selectedJourney}
            isOpen={!!selectedJourney}
            onClose={() => setSelectedJourney(null)}
            onUpdate={() => {
              refetchJourneys();
              // Refresh the selected journey
              if (selectedJourney) {
                fetch(`/api/crm/journey-instances/${selectedJourney.instance.id}`)
                  .then(res => res.json())
                  .then(data => setSelectedJourney(data));
              }
            }}
          />
        )}
      </SheetContent>
    </Sheet>
  );
}

// Journey Card Component
function JourneyCard({ 
  journey, 
  config, 
  onSelect,
  onDelete 
}: { 
  journey: CustomerJourneyInstance; 
  config: typeof JOURNEY_TYPE_CONFIG.press_test;
  onSelect: () => void;
  onDelete: () => void;
}) {
  const currentStepIndex = config.steps.findIndex(s => s.key === journey.currentStep);
  
  return (
    <Card 
      className="cursor-pointer hover:border-blue-300 transition-colors group"
      onClick={onSelect}
      data-testid={`journey-card-${journey.id}`}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between mb-3">
          <div>
            <div className="flex items-center gap-2">
              <Badge variant={journey.status === 'completed' ? 'default' : 'secondary'}>
                {journey.status === 'completed' ? 'Completed' : 'In Progress'}
              </Badge>
              {journey.notes && (
                <span className="text-xs text-muted-foreground truncate max-w-[150px]">
                  {journey.notes}
                </span>
              )}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Started {new Date(journey.startedAt || journey.createdAt!).toLocaleDateString()}
            </p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            data-testid={`btn-delete-journey-${journey.id}`}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>

        {/* Step Progress */}
        <div className="flex items-center gap-1">
          {config.steps.map((step, index) => {
            const isCompleted = index <= currentStepIndex;
            const isCurrent = index === currentStepIndex;
            const StepIcon = step.icon;
            
            return (
              <div key={step.key} className="flex items-center">
                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-full border-2 transition-colors ${
                    isCompleted
                      ? 'bg-blue-500 border-blue-500 text-white'
                      : 'border-gray-300 text-gray-400'
                  } ${isCurrent ? 'ring-2 ring-blue-200' : ''}`}
                >
                  <StepIcon className="w-4 h-4" />
                </div>
                {index < config.steps.length - 1 && (
                  <div
                    className={`w-4 h-0.5 ${
                      index < currentStepIndex ? 'bg-blue-500' : 'bg-gray-200'
                    }`}
                  />
                )}
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground mt-2">
          Current: {config.steps[currentStepIndex]?.label || journey.currentStep}
        </p>
      </CardContent>
    </Card>
  );
}

// New Press Test Dialog
function NewPressTestDialog({
  isOpen,
  onClose,
  customerId,
  products,
  onSubmit,
  isPending,
}: {
  isOpen: boolean;
  onClose: () => void;
  customerId: string;
  products: ProductPricingMaster[];
  onSubmit: (data: any) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    productId: '',
    productName: '',
    sizeRequested: '',
    quantityRequested: '',
    notes: '',
  });

  const handleProductChange = (productId: string) => {
    const product = products.find(p => p.id.toString() === productId);
    setFormData({
      ...formData,
      productId,
      productName: product ? `${product.category} - ${product.productType} ${product.productName || ''}`.trim() : '',
    });
  };

  const handleSubmit = () => {
    onSubmit({
      customerId,
      journeyType: 'press_test',
      currentStep: 'sample_requested',
      status: 'in_progress',
      notes: formData.notes,
      pressTestDetails: {
        productId: formData.productId ? parseInt(formData.productId) : null,
        productName: formData.productName,
        sizeRequested: formData.sizeRequested,
        quantityRequested: formData.quantityRequested ? parseInt(formData.quantityRequested) : null,
      },
    });
    setFormData({ productId: '', productName: '', sizeRequested: '', quantityRequested: '', notes: '' });
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            New Press Test Journey
          </DialogTitle>
          <DialogDescription>
            Start a new press test journey by requesting a sample
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="product">Product</Label>
            <Select value={formData.productId} onValueChange={handleProductChange}>
              <SelectTrigger data-testid="select-product">
                <SelectValue placeholder="Select a product" />
              </SelectTrigger>
              <SelectContent className="max-h-[300px]">
                {products.map((product) => (
                  <SelectItem key={product.id} value={product.id.toString()}>
                    {product.category} - {product.productType} {product.productName || ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="size">Size Requested</Label>
              <Input
                id="size"
                placeholder="e.g., 12x18, A4"
                value={formData.sizeRequested}
                onChange={(e) => setFormData({ ...formData, sizeRequested: e.target.value })}
                data-testid="input-size"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                placeholder="e.g., 500"
                value={formData.quantityRequested}
                onChange={(e) => setFormData({ ...formData, quantityRequested: e.target.value })}
                data-testid="input-quantity"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Any additional notes about this sample request..."
              value={formData.notes}
              onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
              rows={3}
              data-testid="textarea-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button 
            onClick={handleSubmit} 
            disabled={isPending || !formData.productName}
            data-testid="btn-create-journey"
          >
            {isPending ? "Creating..." : "Create Journey"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Journey Detail Dialog
function JourneyDetailDialog({
  journey,
  isOpen,
  onClose,
  onUpdate,
}: {
  journey: JourneyWithDetails;
  isOpen: boolean;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const { toast } = useToast();
  const config = JOURNEY_TYPE_CONFIG.press_test;
  const currentStepIndex = config.steps.findIndex(s => s.key === journey.instance.currentStep);
  const [trackingNumber, setTrackingNumber] = useState(journey.details?.trackingNumber || '');
  const [result, setResult] = useState<'good' | 'bad' | 'neutral' | ''>(
    (journey.details?.result as any) || ''
  );
  const [resultFeedback, setResultFeedback] = useState(journey.details?.resultFeedback || '');

  const advanceJourneyMutation = useMutation({
    mutationFn: async (data: { nextStep: string; payload?: any }) => {
      const res = await apiRequest('POST', `/api/crm/journey-instances/${journey.instance.id}/advance`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/journey-instances'] });
      onUpdate();
      toast({ title: "Journey advanced successfully" });
    },
  });

  const updateDetailsMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('PUT', `/api/crm/journey-instances/${journey.instance.id}/press-test-details`, data);
      return res.json();
    },
    onSuccess: () => {
      onUpdate();
      toast({ title: "Details updated" });
    },
  });

  const handleAdvance = (nextStep: string) => {
    // Update details based on step
    if (nextStep === 'tracking_added' && trackingNumber) {
      updateDetailsMutation.mutate({ trackingNumber, shippedAt: new Date() });
    } else if (nextStep === 'received') {
      updateDetailsMutation.mutate({ receivedAt: new Date() });
    } else if (nextStep === 'result' && result) {
      updateDetailsMutation.mutate({ result, resultFeedback });
    }
    
    advanceJourneyMutation.mutate({ nextStep });
  };

  const completeJourney = async () => {
    if (result) {
      await updateDetailsMutation.mutateAsync({ result, resultFeedback });
    }
    await apiRequest('PUT', `/api/crm/journey-instances/${journey.instance.id}`, {
      status: 'completed',
      completedAt: new Date(),
    });
    queryClient.invalidateQueries({ queryKey: ['/api/crm/journey-instances'] });
    onUpdate();
    toast({ title: "Journey completed!" });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FlaskConical className="w-5 h-5 text-blue-600" />
            Press Test Journey Details
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Journey Progress */}
          <div className="flex items-center justify-between">
            {config.steps.map((step, index) => {
              const isCompleted = index <= currentStepIndex;
              const isCurrent = index === currentStepIndex;
              const StepIcon = step.icon;
              
              return (
                <div key={step.key} className="flex flex-col items-center flex-1">
                  <div
                    className={`flex items-center justify-center w-10 h-10 rounded-full border-2 transition-colors ${
                      isCompleted
                        ? 'bg-blue-500 border-blue-500 text-white'
                        : 'border-gray-300 text-gray-400'
                    } ${isCurrent ? 'ring-2 ring-blue-200' : ''}`}
                  >
                    <StepIcon className="w-5 h-5" />
                  </div>
                  <span className={`text-xs mt-2 ${isCompleted ? 'text-blue-600 font-medium' : 'text-muted-foreground'}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Sample Details */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Sample Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product:</span>
                <span className="font-medium">{journey.details?.productName || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Size:</span>
                <span>{journey.details?.sizeRequested || 'Not specified'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Quantity:</span>
                <span>{journey.details?.quantityRequested || 'Not specified'}</span>
              </div>
              {journey.details?.trackingNumber && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Tracking:</span>
                  <span className="font-mono text-xs">{journey.details.trackingNumber}</span>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Step-specific Actions */}
          {journey.instance.currentStep === 'sample_requested' && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 space-y-3">
                <Label>Add Tracking Number</Label>
                <div className="flex gap-2">
                  <Input
                    placeholder="Enter tracking number"
                    value={trackingNumber}
                    onChange={(e) => setTrackingNumber(e.target.value)}
                    data-testid="input-tracking"
                  />
                  <Button 
                    onClick={() => handleAdvance('tracking_added')}
                    disabled={!trackingNumber || advanceJourneyMutation.isPending}
                    data-testid="btn-add-tracking"
                  >
                    <Truck className="w-4 h-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {journey.instance.currentStep === 'tracking_added' && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4">
                <Button 
                  onClick={() => handleAdvance('received')}
                  disabled={advanceJourneyMutation.isPending}
                  className="w-full"
                  data-testid="btn-mark-received"
                >
                  <CheckCircle className="w-4 h-4 mr-2" />
                  Mark as Received
                </Button>
              </CardContent>
            </Card>
          )}

          {journey.instance.currentStep === 'received' && (
            <Card className="border-blue-200 bg-blue-50/50">
              <CardContent className="pt-4 space-y-4">
                <div className="space-y-2">
                  <Label>Test Result</Label>
                  <div className="flex gap-2">
                    <Button
                      variant={result === 'good' ? 'default' : 'outline'}
                      className={result === 'good' ? 'bg-green-600 hover:bg-green-700' : ''}
                      onClick={() => setResult('good')}
                      data-testid="btn-result-good"
                    >
                      <CheckCircle className="w-4 h-4 mr-1" />
                      Good
                    </Button>
                    <Button
                      variant={result === 'neutral' ? 'default' : 'outline'}
                      className={result === 'neutral' ? 'bg-yellow-600 hover:bg-yellow-700' : ''}
                      onClick={() => setResult('neutral')}
                      data-testid="btn-result-neutral"
                    >
                      <AlertCircle className="w-4 h-4 mr-1" />
                      Neutral
                    </Button>
                    <Button
                      variant={result === 'bad' ? 'default' : 'outline'}
                      className={result === 'bad' ? 'bg-red-600 hover:bg-red-700' : ''}
                      onClick={() => setResult('bad')}
                      data-testid="btn-result-bad"
                    >
                      <XCircle className="w-4 h-4 mr-1" />
                      Bad
                    </Button>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Feedback Notes</Label>
                  <Textarea
                    placeholder="Describe the test results, any issues, or feedback..."
                    value={resultFeedback}
                    onChange={(e) => setResultFeedback(e.target.value)}
                    rows={3}
                    data-testid="textarea-feedback"
                  />
                </div>
                <Button 
                  onClick={completeJourney}
                  disabled={!result || advanceJourneyMutation.isPending}
                  className="w-full"
                  data-testid="btn-complete-journey"
                >
                  <Check className="w-4 h-4 mr-2" />
                  Complete Journey
                </Button>
              </CardContent>
            </Card>
          )}

          {journey.instance.status === 'completed' && (
            <Card className="border-green-200 bg-green-50/50">
              <CardContent className="pt-4 text-center">
                <CheckCircle className="w-8 h-8 mx-auto text-green-600 mb-2" />
                <p className="font-medium text-green-800">Journey Completed</p>
                {journey.details?.result && (
                  <Badge className={`mt-2 ${
                    journey.details.result === 'good' ? 'bg-green-500' :
                    journey.details.result === 'neutral' ? 'bg-yellow-500' : 'bg-red-500'
                  }`}>
                    Result: {journey.details.result.charAt(0).toUpperCase() + journey.details.result.slice(1)}
                  </Badge>
                )}
                {journey.details?.resultFeedback && (
                  <p className="text-sm text-muted-foreground mt-2">{journey.details.resultFeedback}</p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Step History */}
          {journey.steps.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Step History</Label>
              <div className="space-y-1">
                {journey.steps.map((step, index) => (
                  <div key={step.id} className="flex items-center gap-2 text-sm">
                    <Check className="w-4 h-4 text-green-500" />
                    <span className="capitalize">{step.stepKey.replace(/_/g, ' ')}</span>
                    <span className="text-muted-foreground text-xs">
                      {step.completedAt ? new Date(step.completedAt).toLocaleString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

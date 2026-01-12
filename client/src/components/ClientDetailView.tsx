import { useState, useRef, useEffect } from "react";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useEmailComposer } from "./email-composer";
import CustomerJourneyPanel from "./CustomerJourneyPanel";
import CustomerCoachPanel from "./CustomerCoachPanel";
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
  ChevronLeft,
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
  Route,
  Copy,
  Printer,
  ExternalLink,
  ShoppingCart,
  Flame,
  Tag,
  UserCog,
  RefreshCw,
  Link2,
  Receipt,
  UserX,
  Ban,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import type { Customer, CustomerJourney, PressProfile, SampleRequest, TestOutcome, SwatchBookShipment, SwatchSelection, ProductCategory, QuoteEvent, PriceListEvent, SentQuote, CustomerJourneyInstance, CustomerContact, EmailSend } from "@shared/schema";
import { EmailLaunchIcon } from "@/components/email-composer";
import { Send, Zap, Wrench } from "lucide-react";
import type { DripCampaign } from "@shared/schema";

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
  companyContacts?: Customer[]; // Other people from the same company
  onBack: () => void;
  onEdit?: (customer: Customer) => void;
  onDelete?: (customerId: string) => void;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
}

function NowModeActivitiesTab({ customerId }: { customerId: string }) {
  const { data: activities = [], isLoading } = useQuery<any[]>({
    queryKey: [`/api/customers/${customerId}/now-mode-activities`],
  });

  const getOutcomeBadgeColor = (outcome: string) => {
    if (outcome.includes('connected') || outcome.includes('ordered')) return 'bg-green-100 text-green-800';
    if (outcome.includes('left_voicemail') || outcome.includes('callback')) return 'bg-blue-100 text-blue-800';
    if (outcome.includes('no_answer') || outcome.includes('bad_number')) return 'bg-orange-100 text-orange-800';
    if (outcome.includes('complete') || outcome.includes('verified')) return 'bg-purple-100 text-purple-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getBucketLabel = (bucket: string) => {
    const labels: Record<string, string> = {
      calls: 'Call',
      followups: 'Follow-up',
      outreach: 'Outreach',
      data_hygiene: 'Data Hygiene',
      enablement: 'Enablement',
    };
    return labels[bucket] || bucket;
  };

  if (isLoading) {
    return (
      <Card className="glass-card">
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Zap className="h-5 w-5 text-indigo-600" />
          NOW MODE Activity History
        </CardTitle>
      </CardHeader>
      <CardContent className="p-6 pt-2">
        {activities.length > 0 ? (
          <div className="space-y-3">
            {activities.map((activity: any) => (
              <div key={activity.id} className="flex items-start justify-between p-3 bg-gray-50 rounded-lg border">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {getBucketLabel(activity.bucket)}
                    </Badge>
                    <Badge className={`text-xs ${getOutcomeBadgeColor(activity.outcome)}`}>
                      {activity.outcome?.replace(/_/g, ' ')}
                    </Badge>
                    {activity.isSkip && (
                      <Badge variant="destructive" className="text-xs">Skipped</Badge>
                    )}
                  </div>
                  {activity.notes && (
                    <p className="text-sm text-gray-600 mt-1">{activity.notes}</p>
                  )}
                  <p className="text-xs text-gray-400 mt-1">
                    {activity.createdAt ? new Date(activity.createdAt).toLocaleString() : ''}
                    {activity.userId && ` • Rep ID: ${activity.userId}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8">
            <Zap className="h-12 w-12 text-gray-300 mx-auto mb-3" />
            <p className="text-gray-500">No NOW MODE activities recorded for this customer</p>
            <p className="text-sm text-gray-400 mt-1">Activities appear when reps interact with this customer in NOW MODE</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ClientDetailView({ customer, companyContacts = [], onBack, onEdit, onDelete, onPrev, onNext, hasPrev = false, hasNext = false }: ClientDetailViewProps) {
  const [activeTab, setActiveTab] = useState("quotes-prices");
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
  const [selectedQuote, setSelectedQuote] = useState<SentQuote | null>(null);
  const [isJourneyPanelOpen, setIsJourneyPanelOpen] = useState(false);
  const [newSample, setNewSample] = useState({
    productCategory: '',
    productName: '',
    quantity: '',
    pressProfileId: '',
    notes: '',
  });
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [isAddingContact, setIsAddingContact] = useState(false);
  const [newContact, setNewContact] = useState({ name: '', email: '', phone: '', role: '' });
  const [isEditingAddress, setIsEditingAddress] = useState(false);
  const [editAddress, setEditAddress] = useState({
    address1: customer.address1 || '',
    address2: customer.address2 || '',
    city: customer.city || '',
    province: customer.province || '',
    country: customer.country || '',
    zip: customer.zip || '',
  });
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printDialogStep, setPrintDialogStep] = useState<'select-person' | 'select-type'>('select-person');
  const [selectedPrintPerson, setSelectedPrintPerson] = useState<{ name: string; company: string } | null>(null);
  const [printLabelType, setPrintLabelType] = useState<'swatchbook' | 'presskit' | 'mailer' | 'other' | null>(null);
  const [printLabelNotes, setPrintLabelNotes] = useState('');
  const [highlightAddPressProfile, setHighlightAddPressProfile] = useState(false);
  const [isDripCampaignDialogOpen, setIsDripCampaignDialogOpen] = useState(false);
  const [selectedDripCampaignId, setSelectedDripCampaignId] = useState<string>("");
  const addPressProfileButtonRef = useRef<HTMLButtonElement>(null);
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();
  const { open: openEmailComposer } = useEmailComposer();

  useEffect(() => {
    if (highlightAddPressProfile && addPressProfileButtonRef.current) {
      setTimeout(() => {
        addPressProfileButtonRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }, 100);
      const timer = setTimeout(() => {
        setHighlightAddPressProfile(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [highlightAddPressProfile]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied!", description: `${label} copied to clipboard` });
    }).catch(() => {
      toast({ title: "Failed to copy", variant: "destructive" });
    });
  };

  // Has some address data - can print a label
  const hasAnyAddress = !!(customer.address1?.trim() || customer.city?.trim());
  // Full address requires all 5 fields: address1, city, province/state, zip, and country
  const hasCompleteAddress = !!(
    customer.address1?.trim() && 
    customer.city?.trim() && 
    customer.province?.trim() && 
    customer.zip?.trim() && 
    customer.country?.trim()
  );

  const openGoogleMapsSearch = () => {
    const searchQuery = encodeURIComponent(customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim());
    window.open(`https://www.google.com/maps/search/${searchQuery}`, '_blank');
  };

  const printAddressLabel = (personName?: string) => {
    const lines: string[] = [];
    const nameToUse = personName || [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    if (nameToUse) lines.push(nameToUse);
    if (customer.company && customer.company.trim() !== nameToUse) lines.push(customer.company.trim());
    if (customer.address1?.trim()) lines.push(customer.address1.trim());
    if (customer.address2?.trim()) lines.push(customer.address2.trim());
    const cityStateZip = [customer.city?.trim(), customer.province?.trim(), customer.zip?.trim()]
      .filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1');
    if (cityStateZip) lines.push(cityStateZip);

    if (lines.length === 0) {
      toast({ title: "No address available", description: "This contact doesn't have address information to print.", variant: "destructive" });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=400,height=250');
    if (!printWindow) {
      toast({ title: "Popup blocked", description: "Please allow popups to print labels.", variant: "destructive" });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Address Label</title>
        <style>
          @page { size: 4in 2in; margin: 0; }
          * { margin: 0; padding: 0; box-sizing: border-box; }
          body { width: 4in; height: 2in; padding: 0.15in 0.2in; font-family: Arial, Helvetica, sans-serif; display: flex; flex-direction: column; justify-content: center; }
          .label-line { font-size: 11pt; line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
          .label-line.name { font-weight: bold; font-size: 12pt; }
          .label-line.company { font-weight: 600; }
        </style>
      </head>
      <body>
        ${lines.map((line, i) => `<div class="label-line ${i === 0 ? 'name' : i === 1 && lines.length > 2 ? 'company' : ''}">${line}</div>`).join('')}
      </body>
      </html>
    `);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); printWindow.close(); }, 250);
  };

  const handlePrintClick = () => {
    setIsPrintDialogOpen(true);
    setPrintLabelType(null);
    setPrintLabelNotes('');
    setSelectedPrintPerson(null);
    
    // Get all available people for this company (primary customer + contacts table + other company members)
    const primaryPerson = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const allPeople = [
      primaryPerson ? { name: primaryPerson, company: customer.company || '' } : null,
      ...customerContacts.map(c => ({ name: c.name, company: customer.company || '' })),
      ...companyContacts.map(c => ({ 
        name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(), 
        company: customer.company || '' 
      }))
    ].filter((p): p is { name: string; company: string } => !!p?.name);
    
    // Remove duplicates by name
    const uniquePeople = allPeople.filter((person, index, self) => 
      index === self.findIndex(p => p.name === person.name)
    );
    
    if (uniquePeople.length <= 1) {
      // Only one person or no contacts, skip to type selection
      setSelectedPrintPerson(uniquePeople[0] || { name: '', company: customer.company || '' });
      setPrintDialogStep('select-type');
    } else {
      setPrintDialogStep('select-person');
    }
  };

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

  // Fetch quote events
  const { data: quoteEvents = [] } = useQuery<QuoteEvent[]>({
    queryKey: ['/api/crm/quote-events', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/quote-events?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'quotes-prices',
    staleTime: 2 * 60 * 1000,
  });

  // Fetch price list events for this customer
  const { data: priceListEvents = [] } = useQuery<PriceListEvent[]>({
    queryKey: ['/api/crm/price-list-events', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/price-list-events?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 2 * 60 * 1000,
  });

  const { data: sentQuotes = [] } = useQuery<SentQuote[]>({
    queryKey: ['/api/crm/customer-sent-quotes', customer.email, customer.company],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (customer.email) params.append('email', customer.email);
      if (customer.company) params.append('company', customer.company);
      const res = await fetch(`/api/crm/customer-sent-quotes?${params.toString()}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!(customer.email || customer.company),
  });

  // Fetch journey instances (Press Test, Swatch Book, Quote Sent journeys)
  const { data: journeyInstances = [], refetch: refetchJourneyInstances } = useQuery<CustomerJourneyInstance[]>({
    queryKey: ['/api/crm/journey-instances', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/journey-instances?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch customer contacts (people at the company)
  const { data: customerContacts = [], refetch: refetchContacts } = useQuery<CustomerContact[]>({
    queryKey: ['/api/crm/customer-contacts', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/crm/customer-contacts?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch Odoo base URL for constructing links
  const { data: odooBaseUrlData } = useQuery<{ baseUrl: string | null }>({
    queryKey: ['/api/odoo/base-url'],
  });
  const odooBaseUrl = odooBaseUrlData?.baseUrl || '';

  // Fetch Shopify orders matched to this customer
  const { data: shopifyOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/shopify/orders', 'customer', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/shopify/orders?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'orders',
  });

  // Fetch Odoo confirmed orders for this customer
  const { data: odooOrders = [] } = useQuery<any[]>({
    queryKey: ['/api/odoo/customer', customer.id, 'orders'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${customer.id}/orders`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'orders' && !!(customer as any).odooPartnerId,
  });

  // Fetch Odoo invoices for this customer
  const { data: odooInvoices = [] } = useQuery<any[]>({
    queryKey: ['/api/odoo/customer', customer.id, 'invoices'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${customer.id}/invoices`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'orders' && !!(customer as any).odooPartnerId,
  });

  // Fetch Odoo stats for this customer (for the Odoo-style stat bar)
  const { data: odooStats } = useQuery<{
    sales: number;
    salesCount: number;
    invoiced: number;
    invoicedCount: number;
    due: number;
    dueCount: number;
    quotesCount: number;
    quotesTotal: number;
    connected: boolean;
  }>({
    queryKey: ['/api/odoo/customer', customer.id, 'stats'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${customer.id}/stats`);
      if (!res.ok) return { sales: 0, salesCount: 0, invoiced: 0, invoicedCount: 0, due: 0, dueCount: 0, quotesCount: 0, quotesTotal: 0, connected: false };
      return res.json();
    },
    enabled: !!(customer as any).odooPartnerId,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Fetch Odoo quotes for this customer
  const { data: odooQuotes = [] } = useQuery<any[]>({
    queryKey: ['/api/odoo/customer', customer.id, 'quotes'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${customer.id}/quotes`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: activeTab === 'quotes-prices' && !!(customer as any).odooPartnerId,
  });

  // Fetch email sends for this customer
  const { data: emailSends = [] } = useQuery<EmailSend[]>({
    queryKey: ['/api/email/sends', customer.id],
    queryFn: async () => {
      const res = await fetch(`/api/email/sends?customerId=${customer.id}`);
      if (!res.ok) return [];
      return res.json();
    },
  });

  // Fetch drip campaigns for assignment
  const { data: dripCampaigns = [] } = useQuery<DripCampaign[]>({
    queryKey: ['/api/drip-campaigns'],
  });

  // Fetch all approved users for sales rep assignment
  interface TeamUser {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
    role: string;
    displayName: string;
  }
  const { data: teamUsers = [], isLoading: teamUsersLoading } = useQuery<TeamUser[]>({
    queryKey: ['/api/users'],
  });

  // Mutation to update sales rep assignment
  const updateSalesRepMutation = useMutation({
    mutationFn: async ({ salesRepId, salesRepName }: { salesRepId: string; salesRepName: string }) => {
      const res = await apiRequest('PUT', `/api/customers/${customer.id}/sales-rep`, {
        salesRepId,
        salesRepName
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers', customer.id] });
      toast({ title: "Success", description: "Sales rep assigned" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to assign sales rep", variant: "destructive" });
    },
  });

  // Mutation to assign customer to drip campaign
  const assignToDripCampaignMutation = useMutation({
    mutationFn: async ({ campaignId, customerId }: { campaignId: number; customerId: string }) => {
      return await apiRequest('POST', `/api/drip-campaigns/${campaignId}/assignments`, { customerIds: [customerId] });
    },
    onSuccess: () => {
      setIsDripCampaignDialogOpen(false);
      setSelectedDripCampaignId("");
      toast({ title: "Success", description: "Customer enrolled in drip campaign" });
      logActivity('DRIP_CAMPAIGN_ENROLLED', `Enrolled customer ${customer.firstName || customer.company || customer.id} in drip campaign ${selectedDripCampaignId}`);
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to enroll customer", variant: "destructive" });
    },
  });

  const createContactMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await apiRequest('POST', '/api/crm/customer-contacts', data);
      return res.json();
    },
    onSuccess: () => {
      refetchContacts();
      setIsAddingContact(false);
      setNewContact({ name: '', email: '', phone: '', role: '' });
      toast({ title: "Success", description: "Contact added" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to add contact", variant: "destructive" });
    },
  });

  const updateContactMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: any }) => {
      const res = await apiRequest('PUT', `/api/crm/customer-contacts/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      refetchContacts();
      setEditingContact(null);
      toast({ title: "Success", description: "Contact updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update contact", variant: "destructive" });
    },
  });

  const deleteContactMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest('DELETE', `/api/crm/customer-contacts/${id}`);
    },
    onSuccess: () => {
      refetchContacts();
      toast({ title: "Success", description: "Contact removed" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to remove contact", variant: "destructive" });
    },
  });

  const updateAddressMutation = useMutation({
    mutationFn: async (data: typeof editAddress) => {
      const res = await apiRequest('PUT', `/api/customers/${customer.id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setIsEditingAddress(false);
      toast({ title: "Success", description: "Address updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update address", variant: "destructive" });
    },
  });

  const resyncFromOdooMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/odoo/customer/${customer.id}/resync`);
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      if (data.customer) {
        setEditAddress({
          address1: data.customer.address1 || '',
          address2: data.customer.address2 || '',
          city: data.customer.city || '',
          province: data.customer.province || '',
          country: data.customer.country || '',
          zip: data.customer.zip || '',
        });
      }
      toast({ title: "Success", description: "Address synced from Odoo" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to sync from Odoo", variant: "destructive" });
    },
  });

  const toggleHotProspectMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('PUT', `/api/customers/${customer.id}`, {
        isHotProspect: !customer.isHotProspect
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ 
        title: customer.isHotProspect ? "Removed Hot Prospect" : "Marked as Hot Prospect",
        description: customer.isHotProspect 
          ? `${customerName} is no longer a hot prospect`
          : `${customerName} is now marked as a hot prospect`
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update hot prospect status", variant: "destructive" });
    },
  });

  const toggleDoNotContactMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/customers/${customer.id}/do-not-contact`, {
        doNotContact: !(customer as any).doNotContact,
        reason: (customer as any).doNotContact ? undefined : "Marked as bad fit via CRM"
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ 
        title: (customer as any).doNotContact ? "Removed Do Not Contact" : "Marked as Do Not Contact",
        description: (customer as any).doNotContact 
          ? `${customerName} is now active and will appear in NOW MODE`
          : `${customerName} is marked as Bad Fit and excluded from NOW MODE`
      });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update Do Not Contact status", variant: "destructive" });
    },
  });

  const fixEmailMutation = useMutation({
    mutationFn: async (email: string) => {
      const res = await apiRequest('PUT', `/api/customers/${customer.id}`, { email });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ title: "Success", description: "Email address updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update email", variant: "destructive" });
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
      const res = await apiRequest('POST', '/api/crm/press-profiles', data);
      return res.json();
    },
    onSuccess: () => {
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

  const createSwatchShipmentMutation = useMutation({
    mutationFn: async (data: { customerId: string; notes?: string }) => {
      const res = await apiRequest('POST', '/api/crm/swatch-shipments', {
        customerId: data.customerId,
        status: 'shipped',
        notes: data.notes || 'Printed address label',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/swatch-shipments', customer.id] });
      toast({ title: "Success", description: "SwatchBook shipment recorded" });
    },
    onError: (error: any) => {
      console.error('SwatchBook shipment error:', error);
      toast({ title: "Error", description: error.message || "Failed to record shipment", variant: "destructive" });
    },
  });

  const createPressKitShipmentMutation = useMutation({
    mutationFn: async (data: { customerId: string; notes?: string }) => {
      const res = await apiRequest('POST', '/api/crm/press-kit-shipments', {
        customerId: data.customerId,
        status: 'shipped',
        notes: data.notes || 'Printed address label',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/press-kit-shipments', customer.id] });
      toast({ title: "Success", description: "Press Kit shipment recorded" });
    },
    onError: (error: any) => {
      console.error('Press Kit shipment error:', error);
      toast({ title: "Error", description: error.message || "Failed to record shipment", variant: "destructive" });
    },
  });

  const confirmPrintLabel = () => {
    printAddressLabel(selectedPrintPerson?.name);
    
    const recipientDesc = selectedPrintPerson?.name 
      ? `${selectedPrintPerson.name} at ${customer.company || 'company'}`
      : customer.company || customer.firstName || customer.email;
    
    if (printLabelType === 'swatchbook') {
      createSwatchShipmentMutation.mutate({ customerId: String(customer.id), notes: `Addressed to: ${selectedPrintPerson?.name || 'N/A'}` });
      logActivity("PRINTED LABEL", `SwatchBook label for ${recipientDesc}`);
    } else if (printLabelType === 'presskit') {
      // Create a sample request for Press Kit so it shows in Samples tab
      createSampleMutation.mutate({
        customerId: String(customer.id),
        productCategory: 'press_kit',
        productName: 'Press Kit',
        quantity: '1',
        status: 'shipped',
        notes: `Addressed to: ${selectedPrintPerson?.name || 'N/A'}`,
      });
      logActivity("PRINTED LABEL", `Press Kit label for ${recipientDesc}`);
    } else if (printLabelType === 'mailer') {
      // Record Mailer in Swatch Book tab
      createSwatchShipmentMutation.mutate({ customerId: String(customer.id), notes: `Mailer: ${printLabelNotes || 'Promotional Mailer'} - Addressed to: ${selectedPrintPerson?.name || 'N/A'}` });
      logActivity("PRINTED LABEL", `Mailer label for ${recipientDesc}${printLabelNotes ? ` - Mailer: ${printLabelNotes}` : ''}`);
    } else {
      // Record Others in Swatch Book tab
      createSwatchShipmentMutation.mutate({ customerId: String(customer.id), notes: `Other: ${printLabelNotes || 'Miscellaneous'} - Addressed to: ${selectedPrintPerson?.name || 'N/A'}` });
      logActivity("PRINTED LABEL", `Address label for ${recipientDesc}${printLabelNotes ? ` - ${printLabelNotes}` : ''}`);
    }
    
    setIsPrintDialogOpen(false);
    setPrintLabelType(null);
    setPrintLabelNotes('');
    setSelectedPrintPerson(null);
  };

  // Get all people for this company (for print dialog)
  const getAllPeopleForPrint = () => {
    const primaryPerson = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    const allPeople = [
      primaryPerson ? { name: primaryPerson, company: customer.company || '', isPrimary: true } : null,
      ...customerContacts.map(c => ({ name: c.name, company: customer.company || '', isPrimary: false })),
      ...companyContacts.map(c => ({ 
        name: [c.firstName, c.lastName].filter(Boolean).join(' ').trim(), 
        company: customer.company || '', 
        isPrimary: false 
      }))
    ].filter((p): p is { name: string; company: string; isPrimary: boolean } => !!p?.name);
    
    // Remove duplicates by name
    return allPeople.filter((person, index, self) => 
      index === self.findIndex(p => p.name === person.name)
    );
  };

  const currentStageIndex = journey ? JOURNEY_STAGE_CONFIG.findIndex(s => s.id === journey.journeyStage) : -1;
  const customerName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown';

  const getCountryFlag = (country: string | null | undefined): string | null => {
    if (!country) return null;
    const countryMap: Record<string, string> = {
      'usa': '🇺🇸', 'united states': '🇺🇸', 'us': '🇺🇸', 'america': '🇺🇸',
      'canada': '🇨🇦', 'ca': '🇨🇦',
      'mexico': '🇲🇽', 'mx': '🇲🇽',
      'uk': '🇬🇧', 'united kingdom': '🇬🇧', 'great britain': '🇬🇧', 'england': '🇬🇧', 'gb': '🇬🇧',
      'germany': '🇩🇪', 'de': '🇩🇪',
      'france': '🇫🇷', 'fr': '🇫🇷',
      'italy': '🇮🇹', 'it': '🇮🇹',
      'spain': '🇪🇸', 'es': '🇪🇸',
      'china': '🇨🇳', 'cn': '🇨🇳',
      'japan': '🇯🇵', 'jp': '🇯🇵',
      'india': '🇮🇳', 'in': '🇮🇳',
      'brazil': '🇧🇷', 'br': '🇧🇷',
      'australia': '🇦🇺', 'au': '🇦🇺',
      'south korea': '🇰🇷', 'korea': '🇰🇷', 'kr': '🇰🇷',
      'netherlands': '🇳🇱', 'nl': '🇳🇱',
      'switzerland': '🇨🇭', 'ch': '🇨🇭',
      'sweden': '🇸🇪', 'se': '🇸🇪',
      'poland': '🇵🇱', 'pl': '🇵🇱',
      'belgium': '🇧🇪', 'be': '🇧🇪',
      'austria': '🇦🇹', 'at': '🇦🇹',
      'ireland': '🇮🇪', 'ie': '🇮🇪',
      'portugal': '🇵🇹', 'pt': '🇵🇹',
      'argentina': '🇦🇷', 'ar': '🇦🇷',
      'chile': '🇨🇱', 'cl': '🇨🇱',
      'colombia': '🇨🇴', 'co': '🇨🇴',
      'peru': '🇵🇪', 'pe': '🇵🇪',
      'russia': '🇷🇺', 'ru': '🇷🇺',
      'turkey': '🇹🇷', 'tr': '🇹🇷',
      'israel': '🇮🇱', 'il': '🇮🇱',
      'singapore': '🇸🇬', 'sg': '🇸🇬',
      'hong kong': '🇭🇰', 'hk': '🇭🇰',
      'taiwan': '🇹🇼', 'tw': '🇹🇼',
      'indonesia': '🇮🇩', 'id': '🇮🇩',
      'thailand': '🇹🇭', 'th': '🇹🇭',
      'vietnam': '🇻🇳', 'vn': '🇻🇳',
      'philippines': '🇵🇭', 'ph': '🇵🇭',
      'malaysia': '🇲🇾', 'my': '🇲🇾',
      'new zealand': '🇳🇿', 'nz': '🇳🇿',
      'south africa': '🇿🇦', 'za': '🇿🇦',
      'nigeria': '🇳🇬', 'ng': '🇳🇬',
      'egypt': '🇪🇬', 'eg': '🇪🇬',
      'saudi arabia': '🇸🇦', 'sa': '🇸🇦',
      'uae': '🇦🇪', 'united arab emirates': '🇦🇪', 'ae': '🇦🇪',
    };
    return countryMap[country.toLowerCase().trim()] || null;
  };

  const countryFlag = getCountryFlag(customer.country);

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
    const payload = {
      customerId: String(customer.id),
      pressType: newPressProfile.pressType,
      pressModel: newPressProfile.pressName,
      inkType: newPressProfile.inkType,
      substrateFocus: newPressProfile.substrateFocus.join(', '),
      notes: newPressProfile.notes,
    };
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
    <div className="space-y-4 font-odoo" data-testid="client-detail-view">
      {/* Sticky Header with Client Name & Contacts - Odoo Style */}
      <div className={`sticky top-0 z-20 backdrop-blur-sm border-b -mx-4 px-4 py-3 mb-2 shadow-sm ${
        customer.isHotProspect 
          ? 'bg-orange-100/95 border-orange-300' 
          : 'bg-white/95 border-[#E6E1EB]'
      }`}>
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-3">
            <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8 mt-0.5 text-[#875A7B] hover:bg-[#875A7B]/10" data-testid="btn-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-odoo-heading text-xl font-semibold text-[#2C2C2C]" data-testid="client-name">{customerName}</h1>
                {/* Flag + Pricing Tier Combo - Creative Ribbon Style */}
                {(countryFlag || customer.pricingTier) && (
                  <div className="flex items-center" data-testid="flag-tier-combo">
                    {countryFlag && (
                      <span className="text-lg px-1.5 py-0.5 bg-gray-50 rounded-l-md border border-r-0 border-gray-200" data-testid="country-flag">{countryFlag}</span>
                    )}
                    {customer.pricingTier && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span 
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 text-xs font-bold tracking-wide uppercase text-white shadow-sm cursor-default ${
                              countryFlag ? 'rounded-r-md' : 'rounded-md'
                            } bg-gradient-to-r from-[#875A7B] to-[#714B67]`}
                            data-testid="pricing-tier-badge"
                          >
                            <Tag className="h-3 w-3" />
                            {customer.pricingTier}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Pricing Tier: {customer.pricingTier}</p>
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                )}
                {priceListEvents.length > 0 && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-100 border border-amber-400 rounded-md text-amber-700" data-testid="price-list-indicator">
                        <AlertTriangle className="h-3.5 w-3.5" />
                        <FileText className="h-3.5 w-3.5" />
                        <span className="text-xs font-semibold">{priceListEvents.length}</span>
                      </div>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p className="font-semibold text-amber-600">Price List Already Sent!</p>
                      <p className="text-sm">{priceListEvents.length} price list{priceListEvents.length !== 1 ? 's' : ''} previously sent. Check before sending new pricing to avoid customer confusion.</p>
                    </TooltipContent>
                  </Tooltip>
                )}
                {journey && (
                  <Badge className={`${JOURNEY_STAGE_CONFIG[currentStageIndex]?.color || 'bg-gray-500'} text-white text-xs`}>
                    {journey.journeyStage?.replace(/_/g, ' ')}
                  </Badge>
                )}
              </div>
              {/* Sales Rep Assignment */}
              <div className="flex items-center gap-2 mt-1" data-testid="sales-rep-assignment">
                <UserCog className="h-4 w-4 text-green-600" />
                <Select
                  value={(customer as any).salesRepId || ""}
                  onValueChange={(value) => {
                    const selectedUser = teamUsers.find(u => u.id === value);
                    if (selectedUser) {
                      updateSalesRepMutation.mutate({
                        salesRepId: selectedUser.id,
                        salesRepName: selectedUser.displayName
                      });
                    }
                  }}
                >
                  <SelectTrigger className="h-7 w-[180px] text-sm bg-white border-green-200" data-testid="select-sales-rep">
                    <SelectValue placeholder="Assign Sales Rep" />
                  </SelectTrigger>
                  <SelectContent>
                    {teamUsersLoading ? (
                      <div className="px-2 py-1 text-sm text-gray-500">Loading...</div>
                    ) : teamUsers.length === 0 ? (
                      <div className="px-2 py-1 text-sm text-gray-500">No sales reps available</div>
                    ) : (
                      teamUsers.map(user => (
                        <SelectItem key={user.id} value={user.id}>
                          {user.displayName}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
                {(customer as any).salesRepName && (
                  <span className="text-sm text-green-700 font-medium">
                    {(customer as any).salesRepName}
                  </span>
                )}
              </div>
              {/* Contact Lines */}
              <div className="mt-1 space-y-0.5">
                {/* Primary customer contact with email dropdown */}
                {(() => {
                  const allEmails: { email: string; source: string }[] = [];
                  if (customer.email) allEmails.push({ email: customer.email, source: 'Primary' });
                  if ((customer as any).email2) allEmails.push({ email: (customer as any).email2, source: 'Secondary' });
                  customerContacts.forEach(c => {
                    if (c.email && !allEmails.find(e => e.email.toLowerCase() === c.email!.toLowerCase())) {
                      allEmails.push({ email: c.email, source: c.name || 'Contact' });
                    }
                  });
                  companyContacts.forEach(c => {
                    if (c.email && c.id !== customer.id && !allEmails.find(e => e.email.toLowerCase() === c.email!.toLowerCase())) {
                      allEmails.push({ email: c.email, source: `${c.firstName || ''} ${c.lastName || ''}`.trim() || 'Company' });
                    }
                  });
                  
                  const hasPrimaryOrPhone = customer.email || customer.phone;
                  const hasAlternativeEmails = allEmails.length > 0;
                  
                  if (!hasPrimaryOrPhone && !hasAlternativeEmails) return null;
                  
                  return (
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-gray-600 font-medium min-w-[100px] truncate">
                        {`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Primary'}
                      </span>
                      {allEmails.length > 1 ? (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button className="text-blue-600 hover:underline flex items-center gap-1" data-testid="btn-email-dropdown">
                              <Mail className="h-3 w-3" />
                              {customer.email || <span className="text-amber-600 italic">No primary email</span>}
                              <ChevronsUpDown className="h-3 w-3 ml-1 text-gray-400" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-2" align="start">
                            <div className="text-xs text-gray-500 mb-2 font-medium">Select Primary Email for Shopify/Odoo</div>
                            <div className="space-y-1">
                              {allEmails.map((item, idx) => (
                                <button
                                  key={idx}
                                  onClick={() => {
                                    if (item.email !== customer.email) {
                                      fixEmailMutation.mutate(item.email);
                                    }
                                  }}
                                  className={`w-full text-left px-2 py-1.5 rounded text-sm flex items-center justify-between hover:bg-gray-100 ${item.email === customer.email ? 'bg-blue-50 border border-blue-200' : ''}`}
                                >
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3 w-3 text-gray-400" />
                                    <span className="truncate">{item.email}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-xs text-gray-400">{item.source}</span>
                                    {item.email === customer.email && <Check className="h-3 w-3 text-blue-600" />}
                                  </div>
                                </button>
                              ))}
                            </div>
                          </PopoverContent>
                        </Popover>
                      ) : allEmails.length === 1 && !customer.email ? (
                        <button
                          onClick={() => fixEmailMutation.mutate(allEmails[0].email)}
                          className="text-amber-600 hover:underline flex items-center gap-1"
                          data-testid="btn-fix-email"
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Set {allEmails[0].email} as primary
                        </button>
                      ) : customer.email ? (
                        <button 
                          onClick={() => openEmailComposer({
                            to: customer.email!,
                            customerId: customer.id,
                            customerName: customerName,
                            usageType: 'client_email',
                            variables: { 'client.name': customerName, 'client.company': customer.company || '' }
                          })}
                          className="text-blue-600 hover:underline flex items-center gap-1"
                          data-testid="btn-email-customer"
                        >
                          <Mail className="h-3 w-3" />
                          {customer.email}
                        </button>
                      ) : (
                        <span className="text-amber-600 italic flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          No email address
                        </span>
                      )}
                      {customer.phone && (
                        <a href={`tel:${customer.phone}`} className="text-green-600 hover:underline flex items-center gap-1">
                          <Phone className="h-3 w-3" />
                          {customer.phone}
                        </a>
                      )}
                    </div>
                  );
                })()}
                {/* Company contacts */}
                {companyContacts.filter(c => c.id !== customer.id).slice(0, 3).map(contact => (
                  <div key={contact.id} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600 font-medium min-w-[100px] truncate">
                      {`${contact.firstName || ''} ${contact.lastName || ''}`.trim() || 'Contact'}
                    </span>
                    {contact.email && (
                      <button 
                        onClick={() => openEmailComposer({
                          to: contact.email!,
                          customerId: customer.id,
                          customerName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || customerName,
                          usageType: 'client_email',
                          variables: { 'client.name': `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || customerName, 'client.company': customer.company || '' }
                        })}
                        className="text-blue-600 hover:underline flex items-center gap-1"
                        data-testid={`btn-email-contact-${contact.id}`}
                      >
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </button>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-green-600 hover:underline flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </a>
                    )}
                  </div>
                ))}
                {/* Additional contacts from contacts table */}
                {customerContacts.slice(0, 2).map(contact => (
                  <div key={contact.id} className="flex items-center gap-3 text-sm">
                    <span className="text-gray-600 font-medium min-w-[100px] truncate">{contact.name}</span>
                    {contact.email && (
                      <button 
                        onClick={() => openEmailComposer({
                          to: contact.email!,
                          customerId: customer.id,
                          customerName: contact.name,
                          usageType: 'client_email',
                          variables: { 'client.name': contact.name, 'client.company': customer.company || '' }
                        })}
                        className="text-blue-600 hover:underline flex items-center gap-1"
                        data-testid={`btn-email-additional-${contact.id}`}
                      >
                        <Mail className="h-3 w-3" />
                        {contact.email}
                      </button>
                    )}
                    {contact.phone && (
                      <a href={`tel:${contact.phone}`} className="text-green-600 hover:underline flex items-center gap-1">
                        <Phone className="h-3 w-3" />
                        {contact.phone}
                      </a>
                    )}
                  </div>
                ))}
                {/* Show count if more contacts */}
                {(companyContacts.length > 4 || customerContacts.length > 2) && (
                  <p className="text-xs text-gray-400">
                    +{(companyContacts.length - 4) + (customerContacts.length - 2)} more contacts
                  </p>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={customer.isHotProspect ? "default" : "outline"}
                    size="sm"
                    onClick={() => toggleHotProspectMutation.mutate()} 
                    className={`gap-1 h-8 ${customer.isHotProspect ? 'bg-orange-500 hover:bg-orange-600 text-white' : ''}`}
                    data-testid="btn-hot-prospect"
                    disabled={toggleHotProspectMutation.isPending}
                  >
                    <Flame className={`h-3.5 w-3.5 ${customer.isHotProspect ? 'fill-current' : ''}`} />
                    <span className="hidden sm:inline">{customer.isHotProspect ? 'Hot Lead' : 'Mark Hot'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {customer.isHotProspect ? 'Remove hot prospect status' : 'Mark as hot prospect for priority follow-up'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            <TooltipProvider delayDuration={200}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button 
                    variant={(customer as any).doNotContact ? "destructive" : "outline"}
                    size="sm"
                    onClick={() => toggleDoNotContactMutation.mutate()} 
                    className={`gap-1 h-8 ${(customer as any).doNotContact ? '' : 'text-gray-500 hover:text-red-600 hover:border-red-300'}`}
                    data-testid="btn-do-not-contact"
                    disabled={toggleDoNotContactMutation.isPending}
                  >
                    <Ban className="h-3.5 w-3.5" />
                    <span className="hidden sm:inline">{(customer as any).doNotContact ? 'DNC Active' : 'Bad Fit'}</span>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  {(customer as any).doNotContact 
                    ? 'Remove Do Not Contact status and include in NOW MODE' 
                    : 'Mark as Bad Fit / Do Not Contact - excludes from NOW MODE forever'}
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {(customer as any).odooPartnerId && (
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="sm"
                      className="bg-[#00A09D]/10 text-[#00A09D] hover:bg-[#00A09D]/20 gap-1 h-8 px-3 border-[#00A09D]/30"
                      data-testid="btn-open-odoo"
                      onClick={() => {
                        const odooPartnerId = (customer as any).odooPartnerId;
                        window.open(`${odooBaseUrl}/web#id=${odooPartnerId}&model=res.partner&view_type=form`, '_blank');
                      }}
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open in Odoo</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    Open this contact in Odoo (Partner #{(customer as any).odooPartnerId})
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => setIsJourneyPanelOpen(true)} 
              className="gap-1 h-8 border-[#875A7B]/30 text-[#875A7B] hover:bg-[#875A7B]/10"
              data-testid="btn-journey-panel"
            >
              <Route className="h-3 w-3" />
              <span className="hidden sm:inline">Journeys</span>
            </Button>
            {onEdit && (
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onEdit(customer)} data-testid="btn-edit-client">
                <Pencil className="h-3 w-3" />
              </Button>
            )}
            {onDelete && (
              <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => onDelete(customer.id)} data-testid="btn-delete-client">
                <Trash2 className="h-3 w-3" />
              </Button>
            )}
          </div>
        </div>
        {/* Prev/Next Navigation */}
        {(onPrev || onNext) && (
          <div className="flex items-center justify-end gap-2 mt-2 pt-2 border-t border-gray-200">
            <Button
              variant="outline"
              size="sm"
              onClick={onPrev}
              disabled={!hasPrev}
              className="gap-1 h-7 px-3 text-xs font-odoo border-[#875A7B] text-[#875A7B] hover:bg-[#875A7B]/10 disabled:opacity-40"
              data-testid="btn-prev-client"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
              Previous
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onNext}
              disabled={!hasNext}
              className="gap-1 h-7 px-3 text-xs font-odoo border-[#875A7B] text-[#875A7B] hover:bg-[#875A7B]/10 disabled:opacity-40"
              data-testid="btn-next-client"
            >
              Next
              <ChevronRight className="h-3.5 w-3.5" />
            </Button>
          </div>
        )}
      </div>

      {/* Data Cleanup Alert - Show when customer has incomplete email */}
      {(() => {
        const email = customer.email;
        const hasIncompleteEmail = !email || 
          email.trim() === '' || 
          email.trim().toLowerCase() === 'n/a' || 
          email.trim().toLowerCase() === 'na' ||
          email.trim().toLowerCase() === 'none' ||
          email.trim() === '-' ||
          !email.includes('@');
        
        if (hasIncompleteEmail) {
          const availableEmails: { email: string; source: string }[] = [];
          
          companyContacts.forEach(c => {
            if (c.email && c.email.includes('@') && c.id !== customer.id) {
              availableEmails.push({ 
                email: c.email, 
                source: `${c.firstName || ''} ${c.lastName || ''}`.trim() || c.company || 'Contact'
              });
            }
          });
          
          customerContacts.forEach(c => {
            if (c.email && c.email.includes('@')) {
              availableEmails.push({ 
                email: c.email, 
                source: c.name || 'Contact'
              });
            }
          });
          
          const uniqueEmails = availableEmails.filter((e, i, arr) => 
            arr.findIndex(x => x.email.toLowerCase() === e.email.toLowerCase()) === i
          );

          return (
            <Alert variant="destructive" className="bg-amber-50 border-amber-400 text-amber-800">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 font-semibold">Data Cleanup Required</AlertTitle>
              <AlertDescription className="text-amber-700">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <span className="font-medium">Issue: </span>
                    {!email ? 'Email address is missing' : 
                     !email.includes('@') ? `Invalid email format: "${email}"` :
                     `Email appears to be a placeholder: "${email}"`}
                    {uniqueEmails.length === 0 && (
                      <span className="block mt-1">Please update the email address using the Edit button above.</span>
                    )}
                  </div>
                  {uniqueEmails.length > 0 && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button 
                          size="sm" 
                          variant="outline"
                          className="shrink-0 bg-white border-amber-500 text-amber-700 hover:bg-amber-100"
                          disabled={fixEmailMutation.isPending}
                        >
                          <Wrench className="h-3.5 w-3.5 mr-1.5" />
                          {fixEmailMutation.isPending ? 'Fixing...' : 'Fix'}
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <div className="px-2 py-1.5 text-xs font-medium text-gray-500">
                          Select email to use:
                        </div>
                        {uniqueEmails.map((e, idx) => (
                          <DropdownMenuItem 
                            key={idx}
                            onClick={() => fixEmailMutation.mutate(e.email)}
                            className="flex flex-col items-start gap-0.5 cursor-pointer"
                          >
                            <span className="text-sm font-medium">{e.email}</span>
                            <span className="text-xs text-gray-500">from {e.source}</span>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              </AlertDescription>
            </Alert>
          );
        }
        return null;
      })()}

      {/* Odoo-Style Stat Bar */}
      <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-2 overflow-x-auto">
        {/* Quotes */}
        <button 
          onClick={() => setActiveTab('quotes-prices')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <FileText className="h-4 w-4" />
            <span className="text-xs font-medium">Quotes</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{sentQuotes.length + (odooStats?.quotesCount || 0)}</span>
        </button>
        
        {/* Sales (Odoo) */}
        <button 
          onClick={() => setActiveTab('orders')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <ShoppingCart className="h-4 w-4" />
            <span className="text-xs font-medium">Sales</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{odooStats?.salesCount || customer.totalOrders || 0}</span>
        </button>
        
        {/* Invoiced (Odoo) */}
        <button 
          onClick={() => setActiveTab('orders')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-green-600">
            <Receipt className="h-4 w-4" />
            <span className="text-xs font-medium">Invoiced</span>
          </div>
          <span className="text-sm font-bold text-green-700">
            ${((odooStats?.invoiced || 0) / 1000).toFixed(1)}k
          </span>
        </button>
        
        {/* Due (Odoo) */}
        <button 
          onClick={() => setActiveTab('orders')}
          className={`flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200 ${(odooStats?.due || 0) > 0 ? 'bg-amber-50' : ''}`}
        >
          <div className={`flex items-center gap-1.5 ${(odooStats?.due || 0) > 0 ? 'text-amber-600' : 'text-gray-600'}`}>
            <Clock className="h-4 w-4" />
            <span className="text-xs font-medium">Due</span>
          </div>
          <span className={`text-sm font-bold ${(odooStats?.due || 0) > 0 ? 'text-amber-700' : 'text-gray-900'}`}>
            ${((odooStats?.due || 0) / 1000).toFixed(1)}k
          </span>
        </button>
        
        {/* Emails */}
        <button 
          onClick={() => setActiveTab('emails')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <Mail className="h-4 w-4" />
            <span className="text-xs font-medium">Emails</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{emailSends.length}</span>
        </button>
        
        {/* Samples */}
        <button 
          onClick={() => setActiveTab('samples')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <FlaskConical className="h-4 w-4" />
            <span className="text-xs font-medium">Samples</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{sampleRequests.length}</span>
        </button>
        
        {/* Swatch */}
        <button 
          onClick={() => setActiveTab('swatch-book')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <Palette className="h-4 w-4" />
            <span className="text-xs font-medium">Swatch</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{swatchShipments.length}</span>
        </button>
        
        {/* Press Profiles */}
        <button 
          onClick={() => setActiveTab('press-profiles')}
          className="flex flex-col items-center px-3 py-2 rounded hover:bg-gray-100 transition-colors min-w-[80px] border border-transparent hover:border-gray-200"
        >
          <div className="flex items-center gap-1.5 text-gray-600">
            <Printer className="h-4 w-4" />
            <span className="text-xs font-medium">Press</span>
          </div>
          <span className="text-sm font-bold text-gray-900">{pressProfiles.length}</span>
        </button>
      </div>

      {/* Customer Coach Panel - Moved Up */}
      <Card className="glass-card">
        <CardContent className="pt-4">
          <CustomerCoachPanel 
            customer={customer} 
            onNavigateToPressProfiles={() => {
              setActiveTab('press-profiles');
              setHighlightAddPressProfile(true);
            }}
          />
        </CardContent>
      </Card>

      {/* Collapsible People & Address Section */}
      <Collapsible defaultOpen={false}>
        <Card className="glass-card">
          <CollapsibleTrigger asChild>
            <CardHeader className="pb-2 cursor-pointer hover:bg-gray-50 transition-colors">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  People & Address
                  <Badge variant="outline" className="ml-2 text-xs">{companyContacts.length + customerContacts.length || 1}</Badge>
                </CardTitle>
                <ChevronsUpDown className="h-4 w-4 text-gray-400" />
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-2 pt-0">
              <div className="flex items-center justify-end mb-2">
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setIsAddingContact(true)}
                  className="h-7 px-2"
                  data-testid="btn-add-contact"
                >
                  <Plus className="h-3 w-3 mr-1" />
                  Add Contact
                </Button>
              </div>
            {/* Show all company contacts (people from the same company) */}
            {companyContacts.length > 0 ? (
              <>
                {companyContacts.map((contact) => (
                  <div key={contact.id} className="p-2 bg-blue-50 rounded-lg" data-testid={`company-contact-${contact.id}`}>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                          <User className="h-4 w-4 text-blue-600" />
                        </div>
                        <div>
                          <p className="text-sm font-medium">
                            {`${contact.firstName || ''} ${contact.lastName || ''}`.trim() || contact.email || 'Contact'}
                          </p>
                          {contact.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-3 w-3 text-gray-400" />
                              <button 
                                onClick={() => openEmailComposer({
                                  to: contact.email!,
                                  customerId: customer.id,
                                  customerName: `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || customerName,
                                  usageType: 'client_email',
                                  variables: { 'client.name': `${contact.firstName || ''} ${contact.lastName || ''}`.trim() || customerName, 'client.company': customer.company || '' }
                                })}
                                className="text-xs text-blue-600 hover:underline"
                                data-testid={`btn-email-company-${contact.id}`}
                              >
                                {contact.email}
                              </button>
                              <button 
                                onClick={() => copyToClipboard(contact.email!, 'Email')}
                                className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                                title="Copy email"
                                data-testid={`copy-email-${contact.id}`}
                              >
                                <Copy className="h-3 w-3 text-gray-400 hover:text-blue-600" />
                              </button>
                            </div>
                          )}
                          {contact.phone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-3 w-3 text-gray-400" />
                              <a href={`tel:${contact.phone}`} className="text-xs text-gray-600 hover:text-blue-600">{contact.phone}</a>
                              <button 
                                onClick={() => copyToClipboard(contact.phone!, 'Phone')}
                                className="p-0.5 hover:bg-blue-100 rounded transition-colors"
                                title="Copy phone"
                                data-testid={`copy-phone-${contact.id}`}
                              >
                                <Copy className="h-3 w-3 text-gray-400 hover:text-blue-600" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </>
            ) : (
              /* Show primary customer info if no company contacts */
              (customer.firstName || customer.lastName || customer.email) && customerContacts.length === 0 && (
                <div className="p-2 bg-gray-50 rounded-lg">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-gray-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{`${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Primary Contact'}</p>
                        {customer.email && (
                          <div className="flex items-center gap-1">
                            <Mail className="h-3 w-3 text-gray-400" />
                            <button 
                              onClick={() => openEmailComposer({
                                to: customer.email!,
                                customerId: customer.id,
                                customerName: customerName,
                                usageType: 'client_email',
                                variables: { 'client.name': customerName, 'client.company': customer.company || '' }
                              })}
                              className="text-xs text-blue-600 hover:underline"
                              data-testid="btn-email-primary-contact"
                            >
                              {customer.email}
                            </button>
                            <button 
                              onClick={() => copyToClipboard(customer.email!, 'Email')}
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                              title="Copy email"
                              data-testid="copy-primary-email"
                            >
                              <Copy className="h-3 w-3 text-gray-400 hover:text-blue-600" />
                            </button>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-1">
                            <Phone className="h-3 w-3 text-gray-400" />
                            <a href={`tel:${customer.phone}`} className="text-xs text-gray-600 hover:text-blue-600">{customer.phone}</a>
                            <button 
                              onClick={() => copyToClipboard(customer.phone!, 'Phone')}
                              className="p-0.5 hover:bg-gray-200 rounded transition-colors"
                              title="Copy phone"
                              data-testid="copy-primary-phone"
                            >
                              <Copy className="h-3 w-3 text-gray-400 hover:text-blue-600" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            )}

            {/* Additional contacts from contacts table */}
            {customerContacts.map(contact => (
              <div key={contact.id} className="p-2 bg-gray-50 rounded-lg group" data-testid={`contact-${contact.id}`}>
                {editingContact?.id === contact.id ? (
                  <div className="space-y-2">
                    <Input
                      placeholder="Name"
                      value={editingContact.name}
                      onChange={(e) => setEditingContact({ ...editingContact, name: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-edit-contact-name"
                    />
                    <Input
                      placeholder="Email"
                      value={editingContact.email || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, email: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-edit-contact-email"
                    />
                    <Input
                      placeholder="Phone"
                      value={editingContact.phone || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, phone: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-edit-contact-phone"
                    />
                    <Input
                      placeholder="Role (e.g., Buyer, Manager)"
                      value={editingContact.role || ''}
                      onChange={(e) => setEditingContact({ ...editingContact, role: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-edit-contact-role"
                    />
                    <div className="flex gap-2">
                      <Button 
                        size="sm" 
                        onClick={() => updateContactMutation.mutate({ id: contact.id, data: editingContact })}
                        disabled={updateContactMutation.isPending}
                        data-testid="btn-save-contact"
                      >
                        Save
                      </Button>
                      <Button 
                        size="sm" 
                        variant="outline" 
                        onClick={() => setEditingContact(null)}
                        data-testid="btn-cancel-edit-contact"
                      >
                        Cancel
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                        <User className="h-4 w-4 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium">{contact.name}</p>
                          {contact.role && <Badge variant="secondary" className="text-[10px] py-0">{contact.role}</Badge>}
                        </div>
                        {contact.email && (
                          <button 
                            onClick={() => openEmailComposer({
                              to: contact.email!,
                              customerId: customer.id,
                              customerName: contact.name,
                              usageType: 'client_email',
                              variables: { 'client.name': contact.name, 'client.company': customer.company || '' }
                            })}
                            className="text-xs text-blue-600 hover:underline"
                            data-testid={`btn-email-ccontact-${contact.id}`}
                          >
                            {contact.email}
                          </button>
                        )}
                        {contact.phone && (
                          <p className="text-xs text-gray-500">{contact.phone}</p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6"
                        onClick={() => setEditingContact(contact)}
                        data-testid={`btn-edit-contact-${contact.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="icon" 
                        className="h-6 w-6 text-red-500 hover:text-red-600"
                        onClick={() => deleteContactMutation.mutate(contact.id)}
                        data-testid={`btn-delete-contact-${contact.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Add new contact form */}
            {isAddingContact && (
              <div className="p-2 border border-dashed border-gray-300 rounded-lg space-y-2">
                <Input
                  placeholder="Name *"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="h-8 text-sm"
                  data-testid="input-new-contact-name"
                />
                <Input
                  placeholder="Email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="h-8 text-sm"
                  data-testid="input-new-contact-email"
                />
                <Input
                  placeholder="Phone"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="h-8 text-sm"
                  data-testid="input-new-contact-phone"
                />
                <Input
                  placeholder="Role (e.g., Buyer, Manager)"
                  value={newContact.role}
                  onChange={(e) => setNewContact({ ...newContact, role: e.target.value })}
                  className="h-8 text-sm"
                  data-testid="input-new-contact-role"
                />
                <div className="flex gap-2">
                  <Button 
                    size="sm" 
                    onClick={() => createContactMutation.mutate({ customerId: customer.id, ...newContact })}
                    disabled={!newContact.name || createContactMutation.isPending}
                    data-testid="btn-create-contact"
                  >
                    Add Contact
                  </Button>
                  <Button 
                    size="sm" 
                    variant="outline" 
                    onClick={() => { setIsAddingContact(false); setNewContact({ name: '', email: '', phone: '', role: '' }); }}
                    data-testid="btn-cancel-add-contact"
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}

            {customerContacts.length === 0 && !customer.email && !customer.phone && !isAddingContact && (
              <p className="text-sm text-gray-400 text-center py-2">No contacts added</p>
            )}

            {/* Company Address Section */}
            <div className="pt-3 mt-3 border-t">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-600 flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  Company Address
                </span>
                <div className="flex items-center gap-1">
                  {!isEditingAddress && hasAnyAddress && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={handlePrintClick}
                            className="h-6 w-6 p-0 border-blue-200"
                            data-testid="btn-print-address-label"
                          >
                            <Printer className="h-3 w-3 text-blue-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Print Address Label (4x2")</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isEditingAddress && !hasCompleteAddress && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={openGoogleMapsSearch}
                            className="h-6 w-6 p-0 border-orange-200"
                            data-testid="btn-search-address"
                          >
                            <ExternalLink className="h-3 w-3 text-orange-500" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Search address on Google Maps</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isEditingAddress && customer.odooPartnerId && (
                    <TooltipProvider>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button 
                            variant="outline" 
                            size="sm" 
                            onClick={() => resyncFromOdooMutation.mutate()}
                            disabled={resyncFromOdooMutation.isPending}
                            className="h-6 w-6 p-0 border-green-200"
                            data-testid="btn-sync-address-odoo"
                          >
                            <RefreshCw className={`h-3 w-3 text-green-500 ${resyncFromOdooMutation.isPending ? 'animate-spin' : ''}`} />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>Sync address from Odoo</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                  {!isEditingAddress && (
                    <Button 
                      variant="ghost" 
                      size="sm" 
                      onClick={() => {
                        setEditAddress({
                          address1: customer.address1 || '',
                          address2: customer.address2 || '',
                          city: customer.city || '',
                          province: customer.province || '',
                          country: customer.country || '',
                          zip: customer.zip || '',
                        });
                        setIsEditingAddress(true);
                      }}
                      className="h-6 px-2 text-xs"
                      data-testid="btn-edit-address"
                    >
                      <Pencil className="h-3 w-3 mr-1" />
                      {(customer.address1 || customer.city) ? 'Edit' : 'Add'}
                    </Button>
                  )}
                </div>
              </div>
              
              {isEditingAddress ? (
                <div className="space-y-2">
                  <Input
                    placeholder="Street Address"
                    value={editAddress.address1}
                    onChange={(e) => setEditAddress({ ...editAddress, address1: e.target.value })}
                    className="h-8 text-sm"
                    data-testid="input-address1"
                  />
                  <Input
                    placeholder="Address Line 2"
                    value={editAddress.address2}
                    onChange={(e) => setEditAddress({ ...editAddress, address2: e.target.value })}
                    className="h-8 text-sm"
                    data-testid="input-address2"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="City"
                      value={editAddress.city}
                      onChange={(e) => setEditAddress({ ...editAddress, city: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-city"
                    />
                    <Input
                      placeholder="Province/State"
                      value={editAddress.province}
                      onChange={(e) => setEditAddress({ ...editAddress, province: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-province"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Input
                      placeholder="Postal Code"
                      value={editAddress.zip}
                      onChange={(e) => setEditAddress({ ...editAddress, zip: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-zip"
                    />
                    <Input
                      placeholder="Country"
                      value={editAddress.country}
                      onChange={(e) => setEditAddress({ ...editAddress, country: e.target.value })}
                      className="h-8 text-sm"
                      data-testid="input-country"
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button 
                      size="sm" 
                      onClick={() => updateAddressMutation.mutate(editAddress)}
                      disabled={updateAddressMutation.isPending}
                      data-testid="btn-save-address"
                    >
                      Save
                    </Button>
                    <Button 
                      size="sm" 
                      variant="outline" 
                      onClick={() => setIsEditingAddress(false)}
                      data-testid="btn-cancel-address"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                (customer.address1 || customer.city) ? (
                  <div className="text-sm text-gray-600 space-y-0.5">
                    {customer.address1 && <p>{customer.address1}</p>}
                    {customer.address2 && <p>{customer.address2}</p>}
                    <p>
                      {[customer.city, customer.province, customer.zip].filter(Boolean).join(', ')}
                    </p>
                    {customer.country && <p>{customer.country}</p>}
                  </div>
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-gray-400 italic">No address on file</p>
                    {shopifyOrders.length > 0 && (() => {
                      const orderWithAddress = shopifyOrders.find((o: any) => 
                        o.shippingAddress?.address1 || o.billingAddress?.address1
                      );
                      if (orderWithAddress) {
                        const addr = orderWithAddress.shippingAddress || orderWithAddress.billingAddress;
                        return (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs"
                            onClick={() => {
                              setEditAddress({
                                address1: addr.address1 || '',
                                address2: addr.address2 || '',
                                city: addr.city || '',
                                province: addr.province || addr.province_code || '',
                                zip: addr.zip || '',
                                country: addr.country || addr.country_code || '',
                              });
                              setIsEditingAddress(true);
                            }}
                            data-testid="btn-pull-shopify-address"
                          >
                            <ShoppingCart className="h-3 w-3 mr-1" />
                            Pull from Shopify Order
                          </Button>
                        );
                      }
                      return null;
                    })()}
                  </div>
                )
              )}
            </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-7 max-w-5xl bg-gray-100 p-1 rounded-lg">
          <TabsTrigger 
            value="quotes-prices" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-orange-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-quotes-prices"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Quotes</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{sentQuotes.length + quoteEvents.length + priceListEvents.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="orders" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-orders"
          >
            <ShoppingCart className="h-4 w-4" />
            <span className="hidden sm:inline">Orders</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{shopifyOrders.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="emails" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-pink-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-emails"
          >
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Emails</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{emailSends.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="samples" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-teal-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-samples"
          >
            <FlaskConical className="h-4 w-4" />
            <span className="hidden sm:inline">Samples</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{sampleRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="swatch-book" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-swatch-book"
          >
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Swatch</span>
          </TabsTrigger>
          <TabsTrigger 
            value="press-profiles" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-press-profiles"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Press</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{pressProfiles.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="now-mode" 
            className="flex items-center gap-1 data-[state=active]:bg-white data-[state=active]:text-indigo-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all text-xs"
            data-testid="tab-now-mode"
          >
            <Zap className="h-4 w-4" />
            <span className="hidden sm:inline">NOW</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="orders" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-green-600" />
                Orders from Shopify
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {shopifyOrders.length > 0 ? (
                <div className="space-y-4">
                  {shopifyOrders.map((order: any) => (
                    <div key={order.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-lg">{order.orderNumber}</span>
                            <Badge variant={order.financialStatus === 'paid' ? 'default' : 'secondary'}>
                              {order.financialStatus}
                            </Badge>
                          </div>
                          <p className="text-sm text-gray-500">
                            {order.shopifyCreatedAt ? new Date(order.shopifyCreatedAt).toLocaleDateString('en-US', { 
                              year: 'numeric', month: 'short', day: 'numeric' 
                            }) : 'Unknown date'}
                          </p>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-lg text-green-600">${order.totalPrice}</p>
                          <a 
                            href={`https://${order.shopDomain || 'admin.shopify.com'}/admin/orders/${order.shopifyOrderId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1 justify-end mt-1"
                            data-testid={`link-shopify-order-${order.id}`}
                          >
                            View in Shopify <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      </div>
                      {order.lineItems && Array.isArray(order.lineItems) && order.lineItems.length > 0 && (
                        <div className="border-t pt-3 mt-3">
                          <p className="text-xs font-medium text-gray-500 mb-2">Products Ordered:</p>
                          <div className="space-y-2">
                            {order.lineItems.slice(0, 5).map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between text-sm py-1">
                                <div className="flex items-center gap-2 flex-1">
                                  <Package className="h-4 w-4 text-gray-400 shrink-0" />
                                  <span className="truncate">{item.title || item.name}</span>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                  <Badge variant="secondary" className="text-xs">Qty: {item.quantity || 1}</Badge>
                                  <span className="text-gray-600 w-20 text-right">${item.price || (item.price_set?.shop_money?.amount)}</span>
                                </div>
                              </div>
                            ))}
                            {order.lineItems.length > 5 && (
                              <p className="text-xs text-gray-400">+{order.lineItems.length - 5} more items</p>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <ShoppingCart className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No Shopify orders matched to this customer yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Odoo Orders Section */}
          {(customer as any).odooPartnerId && (
            <Card className="glass-card mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-5 w-5 text-purple-600" />
                  Orders from Odoo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2">
                {odooOrders.length > 0 ? (
                  <div className="space-y-3">
                    {odooOrders.map((order: any) => (
                      <div key={order.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{order.name}</span>
                              <Badge variant={order.state === 'done' ? 'default' : 'secondary'}>
                                {order.state === 'sale' ? 'Confirmed' : order.state === 'done' ? 'Done' : order.state}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              {order.date_order ? new Date(order.date_order).toLocaleDateString('en-US', { 
                                year: 'numeric', month: 'short', day: 'numeric' 
                              }) : 'Unknown date'}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-green-600">${parseFloat(order.amount_total || 0).toLocaleString()}</p>
                            <a 
                              href={`${odooBaseUrl}/web#id=${order.id}&model=sale.order&view_type=form`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 justify-end mt-1"
                            >
                              View in Odoo <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <FileText className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No confirmed orders in Odoo</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* Odoo Invoices Section */}
          {(customer as any).odooPartnerId && (
            <Card className="glass-card mt-4">
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="h-5 w-5 text-blue-600" />
                  Invoices from Odoo
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6 pt-2">
                {odooInvoices.length > 0 ? (
                  <div className="space-y-3">
                    {odooInvoices.map((invoice: any) => (
                      <div key={invoice.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{invoice.name}</span>
                              <Badge variant={
                                invoice.payment_state === 'paid' ? 'default' : 
                                invoice.payment_state === 'partial' ? 'outline' : 'secondary'
                              }>
                                {invoice.payment_state === 'paid' ? 'Paid' : 
                                 invoice.payment_state === 'partial' ? 'Partial' : 
                                 invoice.payment_state === 'not_paid' ? 'Not Paid' : invoice.payment_state}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-500">
                              {invoice.invoice_date ? new Date(invoice.invoice_date).toLocaleDateString('en-US', { 
                                year: 'numeric', month: 'short', day: 'numeric' 
                              }) : 'Unknown date'}
                              {invoice.invoice_origin && <span className="ml-2">• From: {invoice.invoice_origin}</span>}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-lg text-blue-600">${parseFloat(invoice.amount_total || 0).toLocaleString()}</p>
                            {invoice.amount_residual > 0 && (
                              <p className="text-xs text-orange-600">Due: ${parseFloat(invoice.amount_residual).toLocaleString()}</p>
                            )}
                            <a 
                              href={`${odooBaseUrl}/web#id=${invoice.id}&model=account.move&view_type=form`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-purple-600 hover:text-purple-800 flex items-center gap-1 justify-end mt-1"
                            >
                              View in Odoo <ExternalLink className="h-3 w-3" />
                            </a>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6">
                    <Receipt className="h-10 w-10 text-gray-300 mx-auto mb-2" />
                    <p className="text-gray-500 text-sm">No invoices in Odoo</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <Card className="glass-card">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base flex items-center gap-2">
                  <Mail className="h-5 w-5 text-pink-600" />
                  Email History
                </CardTitle>
                <div className="flex items-center gap-2">
                  {customer.email && (
                    <EmailLaunchIcon
                      email={customer.email}
                      customerId={customer.id}
                      customerName={customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email}
                      variables={{
                        'client.firstName': customer.firstName || '',
                        'client.lastName': customer.lastName || '',
                        'client.company': customer.company || '',
                        'client.email': customer.email,
                      }}
                      size="md"
                    />
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsDripCampaignDialogOpen(true)}
                    className="gap-1"
                    data-testid="btn-send-drip-email"
                  >
                    <Zap className="h-4 w-4" />
                    Send Drip Email
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 pt-2">
              {emailSends.length > 0 ? (
                <div className="space-y-3">
                  {emailSends.map((email) => (
                    <div key={email.id} className="border rounded-lg p-4 bg-white hover:shadow-sm transition-shadow" data-testid={`email-send-${email.id}`}>
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <Send className="h-4 w-4 text-pink-500" />
                            <span className="font-medium text-sm">{email.subject}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">
                            To: {email.recipientEmail}
                          </p>
                        </div>
                        <div className="text-right">
                          <Badge variant="secondary" className="text-xs">
                            {email.status}
                          </Badge>
                          <p className="text-xs text-gray-400 mt-1">
                            {email.sentAt ? new Date(email.sentAt).toLocaleDateString('en-US', { 
                              year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
                            }) : ''}
                          </p>
                        </div>
                      </div>
                      <div className="text-xs text-gray-600 bg-gray-50 rounded p-2 mt-2 line-clamp-2">
                        {email.body?.substring(0, 200)}{email.body && email.body.length > 200 ? '...' : ''}
                      </div>
                      {email.sentBy && (
                        <p className="text-xs text-gray-400 mt-2">Sent by: {email.sentBy}</p>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <Mail className="h-12 w-12 text-gray-300 mx-auto mb-3" />
                  <p className="text-gray-500">No emails sent to this customer yet</p>
                  {customer.email && (
                    <div className="mt-4">
                      <EmailLaunchIcon
                        email={customer.email}
                        customerId={customer.id}
                        customerName={customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email}
                        variables={{
                          'client.firstName': customer.firstName || '',
                          'client.lastName': customer.lastName || '',
                          'client.company': customer.company || '',
                        }}
                        size="md"
                      />
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

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
              <Button 
                ref={addPressProfileButtonRef}
                size="sm" 
                onClick={() => setIsAddPressProfileOpen(true)} 
                data-testid="btn-add-press-profile"
                className={highlightAddPressProfile ? 'animate-pulse ring-2 ring-primary ring-offset-2 bg-primary text-primary-foreground' : ''}
              >
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
              {sentQuotes.length > 0 || quoteEvents.length > 0 || priceListEvents.length > 0 || odooQuotes.length > 0 ? (
                <div className="space-y-4">
                  {/* Odoo Quotes Section */}
                  {odooQuotes.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-purple-600 mb-2 flex items-center gap-2">
                        <FileText className="h-4 w-4" />
                        Quotes from Odoo
                      </h4>
                      <div className="space-y-2">
                        {odooQuotes.map((quote: any) => (
                          <div 
                            key={quote.id} 
                            className="flex items-center justify-between p-3 bg-purple-50 rounded-lg hover:bg-purple-100 transition-colors"
                          >
                            <div>
                              <p className="font-medium">{quote.name}</p>
                              <p className="text-sm text-gray-500">
                                ${parseFloat(quote.amount_total || 0).toLocaleString()}
                              </p>
                              <p className="text-xs text-gray-400">
                                {quote.date_order ? new Date(quote.date_order).toLocaleDateString() : ''}
                                {quote.validity_date && ` • Valid until: ${new Date(quote.validity_date).toLocaleDateString()}`}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={quote.state === 'sent' ? 'outline' : 'secondary'}>
                                {quote.state === 'draft' ? 'Draft' : quote.state === 'sent' ? 'Sent' : quote.state}
                              </Badge>
                              <a 
                                href={`${odooBaseUrl}/web#id=${quote.id}&model=sale.order&view_type=form`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-purple-600 hover:text-purple-800"
                              >
                                <ExternalLink className="h-4 w-4" />
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {sentQuotes.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-600 mb-2">Quotes from QuickQuotes</h4>
                      <div className="space-y-2">
                        {sentQuotes.map(quote => (
                          <div 
                            key={quote.id} 
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100 transition-colors"
                            onClick={() => setSelectedQuote(quote)}
                            data-testid={`quote-row-${quote.id}`}
                          >
                            <div>
                              <p className="font-medium">Quote #{quote.quoteNumber}</p>
                              <p className="text-sm text-gray-500">
                                ${parseFloat(quote.totalAmount).toLocaleString()} • via {quote.sentVia}
                              </p>
                              <p className="text-xs text-gray-400">
                                {quote.createdAt ? new Date(quote.createdAt).toLocaleDateString() : ''}
                              </p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge variant={quote.status === 'accepted' ? 'default' : quote.status === 'viewed' ? 'outline' : 'secondary'}>
                                {quote.status}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {quoteEvents.length > 0 && (
                    <div>
                      <h4 className="font-medium text-sm text-gray-600 mb-2">Quote Events (CRM Tracked)</h4>
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
                  <Link href={`/quote-calculator?customerId=${customer.id}`}>
                    <Button className="mt-4" data-testid="btn-create-first-quote">
                      <Plus className="h-4 w-4 mr-2" />
                      Create First Quote
                    </Button>
                  </Link>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="now-mode" className="mt-4">
          <NowModeActivitiesTab customerId={customer.id} />
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
                  <SelectItem value="digital_toner">Digital Dry Toner</SelectItem>
                  <SelectItem value="hp_indigo">Digital - HP Indigo</SelectItem>
                  <SelectItem value="digital_inkjet_uv">Digital Inkjet UV (KM1, Fuji)</SelectItem>
                  <SelectItem value="label_press">Label Press</SelectItem>
                  <SelectItem value="screen_printing">Screen Printing</SelectItem>
                  <SelectItem value="wide_format_flatbed">Wide Format - Flat Bed</SelectItem>
                  <SelectItem value="wide_format_roll">Wide Format - Roll to Roll</SelectItem>
                  <SelectItem value="aqueous_photo">Aqueous Photo Printers</SelectItem>
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

      {/* Quote Detail Dialog */}
      <Dialog open={!!selectedQuote} onOpenChange={(open) => !open && setSelectedQuote(null)}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Quote #{selectedQuote?.quoteNumber}
            </DialogTitle>
            <DialogDescription>
              Sent to {selectedQuote?.customerName} on {selectedQuote?.createdAt ? new Date(selectedQuote.createdAt).toLocaleDateString() : ''}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-gray-50 p-3 rounded-lg">
              <div>
                <p className="text-sm text-gray-500">Total Amount</p>
                <p className="text-2xl font-bold text-green-600">
                  ${selectedQuote ? parseFloat(selectedQuote.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Sent Via</p>
                <Badge variant="outline" className="mt-1">{selectedQuote?.sentVia}</Badge>
              </div>
            </div>

            <div>
              <h4 className="font-medium mb-2">Products in this Quote</h4>
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="text-left p-2">Product</th>
                      <th className="text-left p-2">Size</th>
                      <th className="text-right p-2">Qty</th>
                      <th className="text-right p-2">Price/Sheet</th>
                      <th className="text-right p-2">Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedQuote?.quoteItems && (() => {
                      try {
                        const items = typeof selectedQuote.quoteItems === 'string' 
                          ? JSON.parse(selectedQuote.quoteItems) 
                          : selectedQuote.quoteItems;
                        return Array.isArray(items) ? items.map((item: any, index: number) => (
                          <tr key={item.id || index} className="border-t">
                            <td className="p-2">
                              <p className="font-medium">{item.productName || 'Unknown Product'}</p>
                              <p className="text-xs text-gray-500">{item.productType || item.itemCode || ''}</p>
                            </td>
                            <td className="p-2">{item.size || '-'}</td>
                            <td className="p-2 text-right">{item.quantity?.toLocaleString() || '-'}</td>
                            <td className="p-2 text-right">
                              ${Number(item.pricePerSheet || item.price || 0).toFixed(4)}
                            </td>
                            <td className="p-2 text-right font-medium">
                              ${Number(item.total || (item.quantity * (item.pricePerSheet || item.price || 0)) || 0).toFixed(2)}
                            </td>
                          </tr>
                        )) : <tr><td colSpan={5} className="p-2 text-center text-gray-500">No items found</td></tr>;
                      } catch (e) {
                        return <tr><td colSpan={5} className="p-2 text-center text-gray-500">Unable to parse quote items</td></tr>;
                      }
                    })()}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedQuote(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <CustomerJourneyPanel
        customer={customer}
        isOpen={isJourneyPanelOpen}
        onClose={() => setIsJourneyPanelOpen(false)}
      />

      {/* Print Label Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {printDialogStep === 'select-person' ? 'Who should this be addressed to?' : 'Print Address Label'}
            </DialogTitle>
            <DialogDescription>
              {printDialogStep === 'select-person' 
                ? 'Select the person whose name will appear on the label'
                : `Label for: ${selectedPrintPerson?.name || 'Company'}`
              }
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {printDialogStep === 'select-person' ? (
              <div className="flex flex-col gap-2">
                {getAllPeopleForPrint().map((person, idx) => (
                  <Button
                    key={idx}
                    variant="outline"
                    className="justify-start h-auto py-3"
                    onClick={() => {
                      setSelectedPrintPerson(person);
                      setPrintDialogStep('select-type');
                    }}
                    data-testid={`btn-select-person-${idx}`}
                  >
                    <User className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <p className="font-medium">{person.name}</p>
                      {person.isPrimary && <p className="text-xs text-muted-foreground">Primary contact</p>}
                    </div>
                  </Button>
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-col gap-3">
                  <Button
                    variant={printLabelType === 'swatchbook' ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => setPrintLabelType('swatchbook')}
                    data-testid="btn-label-swatchbook"
                  >
                    <Palette className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <p className="font-medium">SwatchBook</p>
                      <p className="text-xs text-muted-foreground">Record shipment in customer's SwatchBook tab</p>
                    </div>
                  </Button>
                  
                  <Button
                    variant={printLabelType === 'presskit' ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => setPrintLabelType('presskit')}
                    data-testid="btn-label-presskit"
                  >
                    <Package className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <p className="font-medium">Press Kit</p>
                      <p className="text-xs text-muted-foreground">Record shipment in customer's Press Kit tab</p>
                    </div>
                  </Button>
                  
                  <Button
                    variant={printLabelType === 'mailer' ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => setPrintLabelType('mailer')}
                    data-testid="btn-label-mailer"
                  >
                    <Mail className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <p className="font-medium">Mailer</p>
                      <p className="text-xs text-muted-foreground">Promotional mailer or flyer</p>
                    </div>
                  </Button>
                  
                  <Button
                    variant={printLabelType === 'other' ? 'default' : 'outline'}
                    className="justify-start h-auto py-3"
                    onClick={() => setPrintLabelType('other')}
                    data-testid="btn-label-other"
                  >
                    <FileText className="h-5 w-5 mr-3" />
                    <div className="text-left">
                      <p className="font-medium">Something Else</p>
                      <p className="text-xs text-muted-foreground">Just print the label without recording</p>
                    </div>
                  </Button>
                </div>
                
                {printLabelType === 'mailer' && (
                  <div className="space-y-2">
                    <Label>Which mailer are you sending?</Label>
                    <Input
                      placeholder="e.g., Spring 2025 Promo, New Product Announcement"
                      value={printLabelNotes}
                      onChange={(e) => setPrintLabelNotes(e.target.value)}
                      data-testid="input-mailer-notes"
                    />
                  </div>
                )}
                
                {printLabelType === 'other' && (
                  <div className="space-y-2">
                    <Label>Notes (optional)</Label>
                    <Textarea
                      placeholder="What are you sending?"
                      value={printLabelNotes}
                      onChange={(e) => setPrintLabelNotes(e.target.value)}
                      className="h-20"
                      data-testid="input-label-notes"
                    />
                  </div>
                )}
              </>
            )}
          </div>

          <DialogFooter>
            {printDialogStep === 'select-type' && getAllPeopleForPrint().length > 1 && (
              <Button 
                variant="ghost" 
                onClick={() => setPrintDialogStep('select-person')}
                className="mr-auto"
              >
                Back
              </Button>
            )}
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            {printDialogStep === 'select-type' && (
              <Button 
                onClick={confirmPrintLabel}
                disabled={!printLabelType || createSwatchShipmentMutation.isPending || createPressKitShipmentMutation.isPending}
                data-testid="btn-confirm-print"
              >
                <Printer className="h-4 w-4 mr-2" />
                Print Label
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Drip Campaign Assignment Dialog */}
      <Dialog open={isDripCampaignDialogOpen} onOpenChange={setIsDripCampaignDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Enroll in Drip Campaign</DialogTitle>
            <DialogDescription>
              Select a drip email campaign to automatically send scheduled emails to {customer.company || customer.firstName || 'this customer'}.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Select Campaign</Label>
              <Select 
                value={selectedDripCampaignId} 
                onValueChange={setSelectedDripCampaignId}
              >
                <SelectTrigger data-testid="select-drip-campaign">
                  <SelectValue placeholder="Choose a drip campaign..." />
                </SelectTrigger>
                <SelectContent>
                  {dripCampaigns.filter(c => c.isActive).map((campaign) => (
                    <SelectItem 
                      key={campaign.id} 
                      value={campaign.id.toString()}
                      data-testid={`campaign-option-${campaign.id}`}
                    >
                      <div className="flex items-center gap-2">
                        <Zap className="h-4 w-4 text-yellow-500" />
                        {campaign.name}
                      </div>
                    </SelectItem>
                  ))}
                  {dripCampaigns.filter(c => c.isActive).length === 0 && (
                    <SelectItem value="none" disabled>
                      No active campaigns available
                    </SelectItem>
                  )}
                </SelectContent>
              </Select>
            </div>

            {selectedDripCampaignId && (
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                <p className="text-sm text-blue-800">
                  <Zap className="h-4 w-4 inline mr-1" />
                  This customer will receive automated emails from this campaign according to its schedule.
                </p>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setIsDripCampaignDialogOpen(false);
                setSelectedDripCampaignId("");
              }}
            >
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (selectedDripCampaignId) {
                  assignToDripCampaignMutation.mutate({
                    campaignId: parseInt(selectedDripCampaignId),
                    customerId: customer.id,
                  });
                }
              }}
              disabled={!selectedDripCampaignId || assignToDripCampaignMutation.isPending}
              data-testid="btn-confirm-drip-enroll"
            >
              {assignToDripCampaignMutation.isPending ? "Enrolling..." : "Enroll Customer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

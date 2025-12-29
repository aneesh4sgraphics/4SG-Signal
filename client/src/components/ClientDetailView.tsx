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
import CustomerJourneyPanel from "./CustomerJourneyPanel";
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
  Route,
  Copy,
  Printer,
  ExternalLink,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Link } from "wouter";
import type { Customer, CustomerJourney, PressProfile, SampleRequest, TestOutcome, SwatchBookShipment, SwatchSelection, ProductCategory, QuoteEvent, PriceListEvent, SentQuote, CustomerJourneyInstance, CustomerContact } from "@shared/schema";

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
}

export default function ClientDetailView({ customer, companyContacts = [], onBack, onEdit, onDelete }: ClientDetailViewProps) {
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
  const { toast } = useToast();
  const { logActivity } = useActivityLogger();

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast({ title: "Copied!", description: `${label} copied to clipboard` });
    }).catch(() => {
      toast({ title: "Failed to copy", variant: "destructive" });
    });
  };

  const hasAddress = !!(customer.address1?.trim() || customer.city?.trim() || customer.province?.trim() || customer.zip?.trim());

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
        shippedAt: new Date().toISOString(),
        notes: data.notes || 'Printed address label',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/swatch-shipments', customer.id] });
      toast({ title: "Success", description: "SwatchBook shipment recorded" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record shipment", variant: "destructive" });
    },
  });

  const createPressKitShipmentMutation = useMutation({
    mutationFn: async (data: { customerId: string; notes?: string }) => {
      const res = await apiRequest('POST', '/api/crm/press-kit-shipments', {
        customerId: data.customerId,
        status: 'shipped',
        shippedAt: new Date().toISOString(),
        notes: data.notes || 'Printed address label',
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/press-kit-shipments', customer.id] });
      toast({ title: "Success", description: "Press Kit shipment recorded" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to record shipment", variant: "destructive" });
    },
  });

  const confirmPrintLabel = () => {
    printAddressLabel(selectedPrintPerson?.name);
    
    const recipientDesc = selectedPrintPerson?.name 
      ? `${selectedPrintPerson.name} at ${customer.company || 'company'}`
      : customer.company || customer.firstName || customer.email;
    
    if (printLabelType === 'swatchbook') {
      createSwatchShipmentMutation.mutate({ customerId: String(customer.id), notes: printLabelNotes || `Addressed to: ${selectedPrintPerson?.name || 'N/A'}` });
      logActivity("PRINTED LABEL", `SwatchBook label for ${recipientDesc}`);
    } else if (printLabelType === 'presskit') {
      createPressKitShipmentMutation.mutate({ customerId: String(customer.id), notes: printLabelNotes || `Addressed to: ${selectedPrintPerson?.name || 'N/A'}` });
      logActivity("PRINTED LABEL", `Press Kit label for ${recipientDesc}`);
    } else if (printLabelType === 'mailer') {
      logActivity("PRINTED LABEL", `Mailer label for ${recipientDesc}${printLabelNotes ? ` - Mailer: ${printLabelNotes}` : ''}`);
    } else {
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
    <div className="space-y-6" data-testid="client-detail-view">
      {/* Breadcrumb Navigation */}
      <nav className="flex items-center gap-2 text-sm text-gray-500" data-testid="breadcrumb-nav">
        <Link href="/customers" className="hover:text-blue-600 transition-colors">
          Clients
        </Link>
        <ChevronRight className="h-4 w-4" />
        <span className="text-gray-900 font-medium">{customerName}</span>
      </nav>

      <div className="flex items-start justify-between">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack} data-testid="btn-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-gray-900" data-testid="client-name">{customerName}</h1>
              {countryFlag && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <span className="text-2xl cursor-default" data-testid="country-flag">{countryFlag}</span>
                    </TooltipTrigger>
                    <TooltipContent>{customer.country}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
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
          <Button 
            variant="outline" 
            onClick={() => setIsJourneyPanelOpen(true)} 
            className="gap-2"
            data-testid="btn-journey-panel"
          >
            <Route className="h-4 w-4" />
            Journeys
          </Button>
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
        {/* People Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-gray-600">People</CardTitle>
              <Button 
                variant="ghost" 
                size="sm" 
                onClick={() => setIsAddingContact(true)}
                className="h-7 px-2"
                data-testid="btn-add-contact"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
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
                              <a href={`mailto:${contact.email}`} className="text-xs text-blue-600 hover:underline">{contact.email}</a>
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
                            <a href={`mailto:${customer.email}`} className="text-xs text-blue-600 hover:underline">{customer.email}</a>
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
                          <a href={`mailto:${contact.email}`} className="text-xs text-blue-600 hover:underline">{contact.email}</a>
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
                  {!isEditingAddress && hasAddress && (
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
                  {!isEditingAddress && !hasAddress && (
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
                  <p className="text-sm text-gray-400 italic">No address on file</p>
                )
              )}
            </div>
          </CardContent>
        </Card>

        {/* Risk Profile Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Risk Profile</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total Spent</span>
              <span className="font-medium">${parseFloat(customer.totalSpent || '0').toLocaleString()}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Total Orders</span>
              <span className="font-medium">{customer.totalOrders || 0}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Engagement</span>
              <Badge variant="outline" className={journey ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-100'}>
                {journey ? 'Active' : 'New'}
              </Badge>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Journey Stage</span>
              <Badge className={`${JOURNEY_STAGE_CONFIG[currentStageIndex]?.color || 'bg-gray-400'} text-white text-xs`}>
                {journey?.journeyStage?.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) || 'None'}
              </Badge>
            </div>
            {(customer.city || customer.province) && (
              <div className="flex items-center gap-2 text-sm pt-2 border-t">
                <MapPin className="h-4 w-4 text-gray-400" />
                <span className="text-gray-600">{[customer.city, customer.province].filter(Boolean).join(', ')}</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Activity Summary Card */}
        <Card className="glass-card">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-gray-600">Activity Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="h-4 w-4 text-blue-600" />
                </div>
                <span className="text-gray-600">Quotes Sent</span>
              </div>
              <Badge variant="secondary" className="text-base px-3">{sentQuotes.length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <Package className="h-4 w-4 text-purple-600" />
                </div>
                <span className="text-gray-600">Sample Kits Sent</span>
              </div>
              <Badge variant="secondary" className="text-base px-3">{sampleRequests.filter(s => s.status === 'shipped' || s.status === 'delivered').length}</Badge>
            </div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-sm">
                <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center">
                  <Clock className="h-4 w-4 text-orange-600" />
                </div>
                <span className="text-gray-600">Follow-up Tasks</span>
              </div>
              <Badge variant="secondary" className="text-base px-3">{journeyInstances.filter(j => j.status === 'in_progress').length}</Badge>
            </div>
            {journeyInstances.filter(j => j.status === 'in_progress').length > 0 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-gray-500 mb-1">Active Journeys:</p>
                {journeyInstances.filter(j => j.status === 'in_progress').slice(0, 2).map(j => (
                  <div key={j.id} className="text-xs text-gray-600 flex items-center gap-1">
                    <ChevronRight className="h-3 w-3" />
                    {j.journeyType === 'press_test' ? 'Press Test' : j.journeyType === 'swatch_book' ? 'Swatch Book' : 'Quote'} - {j.currentStep?.replace(/_/g, ' ')}
                  </div>
                ))}
              </div>
            )}
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

              {/* Active Journey Instances */}
              {journeyInstances.length > 0 && (
                <div className="pt-4 border-t mt-4">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-medium text-gray-700">Active Journeys</h4>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsJourneyPanelOpen(true)}
                      data-testid="btn-add-journey"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Add
                    </Button>
                  </div>
                  <div className="space-y-3">
                    {[...journeyInstances]
                      .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                      .map(instance => {
                        // Define steps for each journey type
                        const journeySteps = instance.journeyType === 'press_test' 
                          ? [
                              { key: 'sample_requested', label: 'Sample Requested' },
                              { key: 'tracking_added', label: 'Tracking Added' },
                              { key: 'received', label: 'Received' },
                              { key: 'result', label: 'Result' },
                            ]
                          : instance.journeyType === 'swatch_book'
                          ? [
                              { key: 'requested', label: 'Requested' },
                              { key: 'shipped', label: 'Shipped' },
                              { key: 'delivered', label: 'Delivered' },
                            ]
                          : [
                              { key: 'quote_created', label: 'Quote Created' },
                              { key: 'sent', label: 'Sent' },
                              { key: 'viewed', label: 'Viewed' },
                              { key: 'responded', label: 'Responded' },
                            ];
                        
                        const currentStepIndex = journeySteps.findIndex(s => s.key === instance.currentStep);
                        const isCompleted = instance.status === 'completed';
                        
                        return (
                          <div 
                            key={instance.id} 
                            className="p-4 bg-gray-50 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors border border-gray-100"
                            onClick={() => setIsJourneyPanelOpen(true)}
                            data-testid={`journey-instance-${instance.id}`}
                          >
                            {/* Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center ${
                                  instance.journeyType === 'press_test' ? 'bg-blue-100 text-blue-600' :
                                  instance.journeyType === 'swatch_book' ? 'bg-purple-100 text-purple-600' :
                                  'bg-green-100 text-green-600'
                                }`}>
                                  {instance.journeyType === 'press_test' ? <FlaskConical className="h-3.5 w-3.5" /> :
                                   instance.journeyType === 'swatch_book' ? <Palette className="h-3.5 w-3.5" /> :
                                   <FileText className="h-3.5 w-3.5" />}
                                </div>
                                <span className="font-medium text-sm">
                                  {instance.journeyType === 'press_test' ? 'Press Test' :
                                   instance.journeyType === 'swatch_book' ? 'Swatch Book' :
                                   'Quote Sent'}
                                </span>
                                <Badge variant={isCompleted ? 'default' : 'secondary'} className="text-xs ml-1">
                                  {isCompleted ? 'Completed' : 'In Progress'}
                                </Badge>
                              </div>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                            
                            {/* Steps Progress */}
                            <div className="flex items-center gap-1">
                              {journeySteps.map((step, index) => {
                                const stepCompleted = isCompleted || index < currentStepIndex;
                                const stepCurrent = !isCompleted && index === currentStepIndex;
                                
                                return (
                                  <div key={step.key} className="flex items-center flex-1">
                                    <div className="flex flex-col items-center flex-1">
                                      <div
                                        className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-all ${
                                          stepCompleted ? 'bg-green-500 text-white' : 
                                          stepCurrent ? 'bg-blue-500 text-white' : 
                                          'bg-gray-200 text-gray-500'
                                        }`}
                                      >
                                        {stepCompleted ? <Check className="h-3 w-3" /> : index + 1}
                                      </div>
                                      <span className={`text-[10px] mt-1 text-center truncate max-w-[60px] ${
                                        stepCurrent ? 'font-medium text-gray-900' : 'text-gray-500'
                                      }`}>
                                        {step.label.split(' ')[0]}
                                      </span>
                                    </div>
                                    {index < journeySteps.length - 1 && (
                                      <div className={`h-0.5 w-full mx-0.5 ${
                                        stepCompleted ? 'bg-green-500' : 'bg-gray-200'
                                      }`} />
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                </div>
              )}

              {journeyInstances.length === 0 && (
                <div className="pt-4 border-t mt-4">
                  <div className="text-center py-4">
                    <p className="text-sm text-gray-500 mb-2">No active journeys</p>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => setIsJourneyPanelOpen(true)}
                      data-testid="btn-start-first-journey"
                    >
                      <Plus className="h-3 w-3 mr-1" />
                      Start a Journey
                    </Button>
                  </div>
                </div>
              )}
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
        <TabsList className="grid w-full grid-cols-4 max-w-2xl bg-gray-100 p-1 rounded-lg">
          <TabsTrigger 
            value="swatch-book" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-purple-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all"
            data-testid="tab-swatch-book"
          >
            <Palette className="h-4 w-4" />
            <span className="hidden sm:inline">Swatch Book</span>
            <span className="sm:hidden">Swatch</span>
          </TabsTrigger>
          <TabsTrigger 
            value="press-profiles" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-blue-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all"
            data-testid="tab-press-profiles"
          >
            <Building2 className="h-4 w-4" />
            <span className="hidden sm:inline">Press Profiles</span>
            <span className="sm:hidden">Press</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{pressProfiles.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="samples" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-green-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all"
            data-testid="tab-samples"
          >
            <FlaskConical className="h-4 w-4" />
            <span>Samples</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{sampleRequests.length}</Badge>
          </TabsTrigger>
          <TabsTrigger 
            value="quotes-prices" 
            className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:text-orange-700 data-[state=active]:shadow-sm data-[state=active]:font-medium transition-all"
            data-testid="tab-quotes-prices"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Quotes & Prices</span>
            <span className="sm:hidden">Quotes</span>
            <Badge variant="secondary" className="ml-1 h-5 px-1.5 text-xs">{sentQuotes.length + quoteEvents.length + priceListEvents.length}</Badge>
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
              {sentQuotes.length > 0 || quoteEvents.length > 0 || priceListEvents.length > 0 ? (
                <div className="space-y-4">
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
                              ${item.pricePerSheet?.toFixed(4) || item.price?.toFixed(4) || '0.0000'}
                            </td>
                            <td className="p-2 text-right font-medium">
                              ${item.total?.toFixed(2) || (item.quantity * (item.pricePerSheet || item.price || 0)).toFixed(2)}
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
    </div>
  );
}

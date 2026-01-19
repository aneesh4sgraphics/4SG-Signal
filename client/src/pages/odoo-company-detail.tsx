import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { PRICING_TIERS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  TrendingUp,
  Package,
  CreditCard,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Tag,
  Pencil,
  RefreshCw,
  Upload,
  CheckCircle2,
  XCircle,
  Loader2,
  Printer,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

interface PricingTier {
  id: number;
  name: string;
  description?: string | null;
}

interface ShopifyCustomerMapping {
  id: number;
  shopifyEmail: string | null;
  shopifyCompanyName: string | null;
  shopifyCustomerId: string | null;
  crmCustomerId: string;
  crmCustomerName: string | null;
  isActive: boolean;
}

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  email2: string | null;
  company: string | null;
  phone: string | null;
  phone2: string | null;
  cell: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  website: string | null;
  isCompany: boolean;
  contactType: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  tags: string | null;
  note: string | null;
  isHotProspect: boolean;
  odooPartnerId: number | null;
  odooSyncStatus: string | null;
  odooPendingChanges: any | null;
  odooLastSyncError: string | null;
  totalOrders: number;
  totalSpent: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductCategory {
  id: number;
  name: string;
}

interface BusinessMetrics {
  salesPerson: string | null;
  paymentTerms: string | null;
  totalOutstanding: number;
  lifetimeSales: number;
  averageMargin: number | null;  // null means no margin data available
  topProducts: Array<{ name: string; quantity: number; totalSpent: number }>;
  purchasedCategories: ProductCategory[];
  allCategories: ProductCategory[];
  connected: boolean;
}

interface OdooContact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  function: string | null;
}

export default function OdooCompanyDetail() {
  const [, params] = useRoute("/odoo-contacts/:id");
  const companyId = params?.id;
  const [, setLocation] = useLocation();
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [tagSaveSuccess, setTagSaveSuccess] = useState(false);
  const [paymentTermsSaveSuccess, setPaymentTermsSaveSuccess] = useState(false);
  const [salesPersonSaveSuccess, setSalesPersonSaveSuccess] = useState(false);
  const [isCreateOdooDialogOpen, setIsCreateOdooDialogOpen] = useState(false);
  const [duplicatePartners, setDuplicatePartners] = useState<Array<{ id: number; name: string; email: string; isCompany: boolean }>>([]);
  const [isPrintLabelOpen, setIsPrintLabelOpen] = useState(false);
  const [labelType, setLabelType] = useState<'swatch_book' | 'press_test_kit' | 'mailer' | 'other'>('swatch_book');
  const [labelOtherDescription, setLabelOtherDescription] = useState('');
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelNotes, setLabelNotes] = useState('');
  const [editForm, setEditForm] = useState({
    company: '',
    email: '',
    phone: '',
    address1: '',
    address2: '',
    city: '',
    province: '',
    zip: '',
    country: '',
    website: '',
    note: '',
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: company, isLoading: companyLoading } = useQuery<Contact>({
    queryKey: ['/api/customers', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company');
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<BusinessMetrics>({
    queryKey: ['/api/odoo/customer', companyId, 'business-metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${companyId}/business-metrics`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: OdooContact[] }>({
    queryKey: ['/api/odoo/customer', companyId, 'contacts'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${companyId}/contacts`);
      if (!res.ok) throw new Error('Failed to fetch contacts');
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  // Fetch available payment terms from Odoo
  const { data: paymentTermsOptions } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/odoo/payment-terms'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/payment-terms');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch available partner categories (tags) from Odoo for pricing tier dropdown
  const { data: partnerCategories, isLoading: categoriesLoading } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/odoo/partner-categories'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/partner-categories');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch available sales people from Odoo
  const { data: salesPeopleOptions = [], isLoading: salesPeopleLoading } = useQuery<Array<{ id: number; name: string; email: string }>>({
    queryKey: ['/api/odoo/sales-people'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/sales-people');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch standard pricing tiers from database (for non-Odoo customers)
  const { data: standardPricingTiers = [], isLoading: pricingTiersLoading } = useQuery<PricingTier[]>({
    queryKey: ['/api/pricing-tiers'],
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch Shopify customer mappings to show Shopify indicator on contact emails
  const { data: shopifyMappings = [] } = useQuery<ShopifyCustomerMapping[]>({
    queryKey: ['/api/shopify/customer-mappings'],
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch label print stats for this customer
  interface LabelStats {
    stats: Array<{ labelType: string; label: string; count: number; totalQuantity: number; lastPrintedAt: string | null }>;
    recentPrints: Array<{ id: number; labelType: string; quantity: number; createdAt: string; printedByUserName: string | null }>;
    total: number;
  }
  const { data: labelStats } = useQuery<LabelStats>({
    queryKey: ['/api/customers', companyId, 'label-stats'],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${companyId}/label-stats`);
      if (!res.ok) throw new Error('Failed to fetch label stats');
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  // Print label mutation
  const printLabelMutation = useMutation({
    mutationFn: async (data: { labelType: string; otherDescription?: string; quantity: number; notes?: string }) => {
      const res = await apiRequest('POST', '/api/labels/print', {
        customerId: companyId,
        ...data,
      });
      return res.json();
    },
    onSuccess: (data) => {
      // Download the PDF
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
      a.download = `label-${company?.company || 'customer'}-${Date.now()}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      toast({ title: 'Label printed successfully', description: data.message });
      setIsPrintLabelOpen(false);
      setLabelType('swatch_book');
      setLabelOtherDescription('');
      setLabelQuantity(1);
      setLabelNotes('');
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId, 'label-stats'] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to print label', description: error.message, variant: 'destructive' });
    },
  });

  // Create a Set of lowercase Shopify emails for quick lookup
  const shopifyEmails = new Set(
    shopifyMappings
      .filter(m => m.shopifyEmail)
      .map(m => m.shopifyEmail!.toLowerCase())
  );

  // Helper to check if an email exists in Shopify
  const isShopifyEmail = (email: string | null): boolean => {
    if (!email) return false;
    return shopifyEmails.has(email.toLowerCase());
  };

  // Fetch all companies for prev/next navigation
  const { data: allCompanies = [] } = useQuery<Contact[]>({
    queryKey: ['/api/customers'],
    staleTime: 60000,
  });

  // Calculate prev/next navigation - filter to companies only, sorted by company name
  const companiesList = allCompanies
    .filter(c => c.isCompany)
    .sort((a, b) => (a.company || '').localeCompare(b.company || ''));
  
  const currentIndex = companiesList.findIndex(c => c.id === companyId);
  const prevCompany = currentIndex > 0 ? companiesList[currentIndex - 1] : null;
  const nextCompany = currentIndex < companiesList.length - 1 ? companiesList[currentIndex + 1] : null;

  const navigateToPrev = () => {
    if (prevCompany) setLocation(`/odoo-contacts/${prevCompany.id}`);
  };
  const navigateToNext = () => {
    if (nextCompany) setLocation(`/odoo-contacts/${nextCompany.id}`);
  };

  // Mutation to update payment terms (immediate Odoo update)
  const updatePaymentTermsMutation = useMutation({
    mutationFn: async ({ paymentTermId, paymentTermName }: { paymentTermId: number | null; paymentTermName: string }) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/payment-terms`, { paymentTermId, paymentTermName });
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Payment Terms Updated",
        description: "Payment terms updated in Odoo",
      });
      // Show success indicator for 3 seconds
      setPaymentTermsSaveSuccess(true);
      setTimeout(() => setPaymentTermsSaveSuccess(false), 3000);
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'business-metrics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update payment terms",
        variant: "destructive",
      });
    },
  });

  // Mutation to update sales person (immediate Odoo update)
  const updateSalesPersonMutation = useMutation({
    mutationFn: async ({ salesPersonId, salesPersonName }: { salesPersonId: number | null; salesPersonName: string }) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/sales-person`, { salesPersonId, salesPersonName });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Sales Person Updated",
        description: data.message || "Sales person updated in Odoo",
      });
      // Show success indicator for 3 seconds
      setSalesPersonSaveSuccess(true);
      setTimeout(() => setSalesPersonSaveSuccess(false), 3000);
      // Update the local cache
      queryClient.setQueryData<Contact>(['/api/customers', companyId], (oldData) => {
        if (oldData) {
          return { ...oldData, salesRepName: variables.salesPersonName };
        }
        return oldData;
      });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'business-metrics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update sales person",
        variant: "destructive",
      });
    },
  });

  // Mutation to update pricing tier (category/tag in Odoo) - also propagates to child contacts
  const updatePricingTierMutation = useMutation({
    mutationFn: async ({ categoryId, categoryName }: { categoryId: number; categoryName: string }) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/category`, { categoryId, categoryName });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Tag Updated",
        description: data.message || "Tag updated in Odoo",
      });
      // Show success indicator for 3 seconds
      setTagSaveSuccess(true);
      setTimeout(() => setTagSaveSuccess(false), 3000);
      // Update the local cache directly with the new tag value
      queryClient.setQueryData<Contact>(['/api/customers', companyId], (oldData) => {
        if (oldData) {
          return { ...oldData, pricingTier: variables.categoryName };
        }
        return oldData;
      });
      // Update the customers list cache directly
      queryClient.setQueryData<Contact[]>(['/api/customers'], (oldData) => {
        if (oldData) {
          return oldData.map(customer => 
            customer.id === companyId 
              ? { ...customer, pricingTier: variables.categoryName }
              : customer
          );
        }
        return oldData;
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update category",
        variant: "destructive",
      });
    },
  });

  // Mutation to update LOCAL pricing tier (for non-Odoo customers)
  const updateLocalPricingTierMutation = useMutation({
    mutationFn: async ({ pricingTier }: { pricingTier: string }) => {
      const res = await apiRequest('PUT', `/api/customers/${companyId}`, { pricingTier });
      return res.json();
    },
    onSuccess: (data, variables) => {
      toast({
        title: "Pricing Tier Updated",
        description: `Pricing tier set to ${variables.pricingTier}`,
      });
      // Show success indicator for 3 seconds
      setTagSaveSuccess(true);
      setTimeout(() => setTagSaveSuccess(false), 3000);
      // Update the local cache directly
      queryClient.setQueryData<Contact>(['/api/customers', companyId], (oldData) => {
        if (oldData) {
          return { ...oldData, pricingTier: variables.pricingTier };
        }
        return oldData;
      });
      // Update the customers list cache directly
      queryClient.setQueryData<Contact[]>(['/api/customers'], (oldData) => {
        if (oldData) {
          return oldData.map(customer => 
            customer.id === companyId 
              ? { ...customer, pricingTier: variables.pricingTier }
              : customer
          );
        }
        return oldData;
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update pricing tier",
        variant: "destructive",
      });
    },
  });

  // Mutation to save customer edits (queues for Odoo sync)
  const saveEditsMutation = useMutation({
    mutationFn: async (changes: typeof editForm) => {
      const res = await apiRequest('PATCH', `/api/odoo/customer/${companyId}/edit`, { changes });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Changes Saved",
        description: data.message || `${data.queued} change(s) queued for Odoo sync`,
      });
      setIsEditOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId] });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to save changes",
        variant: "destructive",
      });
    },
  });

  // Mutation to push sync to Odoo immediately
  const pushSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/push-sync`);
      return res.json();
    },
    onSuccess: (data) => {
      if (data.conflict) {
        toast({
          title: "Sync Conflict",
          description: "Data was changed in Odoo since last sync. Please refresh and review.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Synced to Odoo",
          description: data.message || `${data.synced} change(s) synced`,
        });
      }
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync to Odoo",
        variant: "destructive",
      });
    },
  });

  // Mutation to create customer in Odoo
  const createInOdooMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/create`);
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Created in Odoo",
        description: data.message || "Customer successfully created in Odoo",
      });
      setIsCreateOdooDialogOpen(false);
      setDuplicatePartners([]);
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'business-metrics'] });
    },
    onError: (error: any) => {
      if (error.duplicates && error.duplicates.length > 0) {
        setDuplicatePartners(error.duplicates);
      } else {
        toast({
          title: "Failed to Create",
          description: error.message || "Failed to create customer in Odoo",
          variant: "destructive",
        });
      }
    },
  });

  // Mutation to link customer to existing Odoo partner
  const linkToOdooMutation = useMutation({
    mutationFn: async (odooPartnerId: number) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/link`, { odooPartnerId });
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Linked to Odoo",
        description: data.message || "Customer successfully linked to existing Odoo partner",
      });
      setIsCreateOdooDialogOpen(false);
      setDuplicatePartners([]);
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'business-metrics'] });
    },
    onError: (error: any) => {
      toast({
        title: "Failed to Link",
        description: error.message || "Failed to link customer to Odoo",
        variant: "destructive",
      });
    },
  });

  // Initialize edit form when company data is available and dialog opens
  const openEditDialog = () => {
    if (company) {
      setEditForm({
        company: company.company || '',
        email: company.email || '',
        phone: company.phone || '',
        address1: company.address1 || '',
        address2: company.address2 || '',
        city: company.city || '',
        province: company.province || '',
        zip: company.zip || '',
        country: company.country || '',
        website: company.website || '',
        note: company.note || '',
      });
      setIsEditOpen(true);
    }
  };

  const handleSaveEdits = () => {
    saveEditsMutation.mutate(editForm);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-CA').format(num);
  };

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Company Not Found</h2>
          <p className="text-gray-500 mb-4">The company you're looking for doesn't exist.</p>
          <Link href="/odoo-contacts">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Companies
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayName = company.company || `${company.firstName || ''} ${company.lastName || ''}`.trim() || 'Unnamed';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link href="/">
              <span className="hover:text-gray-900 cursor-pointer">Home</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/odoo-contacts">
              <span className="hover:text-gray-900 cursor-pointer">Companies</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{displayName}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{displayName}</h1>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                  {company.email && (
                    <a href={`mailto:${company.email}`} className="flex items-center gap-1 hover:text-violet-600">
                      <Mail className="w-3.5 h-3.5" />
                      <span>{company.email}</span>
                    </a>
                  )}
                  {company.phone && (
                    <a href={`tel:${company.phone}`} className="flex items-center gap-1 hover:text-violet-600">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{company.phone}</span>
                    </a>
                  )}
                  {(company.address1 || company.city) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{[company.address1, company.city, company.province, company.zip, company.country].filter(Boolean).join(', ')}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {company.pricingTier && (
                    <Badge variant="secondary" className="capitalize bg-violet-100 text-violet-700">
                      {company.pricingTier}
                    </Badge>
                  )}
                  {company.isHotProspect && (
                    <Badge className="bg-orange-100 text-orange-700">Hot Prospect</Badge>
                  )}
                  {!metrics?.connected && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Not linked to Odoo
                    </Badge>
                  )}
                  {company.odooSyncStatus === 'pending' && (
                    <Badge className="bg-amber-100 text-amber-700 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      Pending Sync
                    </Badge>
                  )}
                  {company.odooSyncStatus === 'error' && (
                    <Badge className="bg-red-100 text-red-700 flex items-center gap-1">
                      <XCircle className="w-3 h-3" />
                      Sync Error
                    </Badge>
                  )}
                  {company.odooSyncStatus === 'conflict' && (
                    <Badge className="bg-orange-100 text-orange-700 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" />
                      Conflict
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {company.odooPartnerId && (
                <>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    onClick={openEditDialog}
                    className="border-violet-200 text-violet-600 hover:bg-violet-50"
                  >
                    <Pencil className="w-4 h-4 mr-2" />
                    Edit
                  </Button>
                  {company.odooSyncStatus === 'pending' && (
                    <Button 
                      variant="outline" 
                      size="sm" 
                      onClick={() => pushSyncMutation.mutate()}
                      disabled={pushSyncMutation.isPending}
                      className="border-green-200 text-green-600 hover:bg-green-50"
                    >
                      {pushSyncMutation.isPending ? (
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      ) : (
                        <Upload className="w-4 h-4 mr-2" />
                      )}
                      Push to Odoo
                    </Button>
                  )}
                </>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setIsPrintLabelOpen(true)}
                className="border-blue-200 text-blue-600 hover:bg-blue-50"
                title="Print shipping label"
              >
                <Printer className="w-4 h-4 mr-2" />
                Print Label
              </Button>
              
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={navigateToPrev}
                  disabled={!prevCompany}
                  className="px-2"
                  title={prevCompany ? `Previous: ${prevCompany.company}` : 'No previous company'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={navigateToNext}
                  disabled={!nextCompany}
                  className="px-2"
                  title={nextCompany ? `Next: ${nextCompany.company}` : 'No next company'}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
              
              <Link href="/odoo-contacts">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Edit Customer Dialog */}
      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="w-5 h-5 text-violet-600" />
              Edit Company Information
            </DialogTitle>
            <DialogDescription>
              Changes will be saved locally and queued for Odoo sync. Use "Push to Odoo" to sync immediately, or wait for the nightly batch sync.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="company">Company Name</Label>
              <Input
                id="company"
                value={editForm.company}
                onChange={(e) => setEditForm({ ...editForm, company: e.target.value })}
                placeholder="Company name"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  placeholder="email@company.com"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editForm.phone}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  placeholder="+1 (555) 123-4567"
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label htmlFor="website">Website</Label>
              <Input
                id="website"
                value={editForm.website}
                onChange={(e) => setEditForm({ ...editForm, website: e.target.value })}
                placeholder="https://www.company.com"
              />
            </div>

            <Separator className="my-2" />

            <div className="grid gap-2">
              <Label htmlFor="address1">Street Address</Label>
              <Input
                id="address1"
                value={editForm.address1}
                onChange={(e) => setEditForm({ ...editForm, address1: e.target.value })}
                placeholder="123 Main Street"
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="address2">Address Line 2</Label>
              <Input
                id="address2"
                value={editForm.address2}
                onChange={(e) => setEditForm({ ...editForm, address2: e.target.value })}
                placeholder="Suite 100"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editForm.city}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  placeholder="City"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="province">Province/State</Label>
                <Input
                  id="province"
                  value={editForm.province}
                  onChange={(e) => setEditForm({ ...editForm, province: e.target.value })}
                  placeholder="Province or State"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label htmlFor="zip">Postal Code</Label>
                <Input
                  id="zip"
                  value={editForm.zip}
                  onChange={(e) => setEditForm({ ...editForm, zip: e.target.value })}
                  placeholder="A1A 1A1"
                />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={editForm.country}
                  onChange={(e) => setEditForm({ ...editForm, country: e.target.value })}
                  placeholder="Country"
                />
              </div>
            </div>

            <Separator className="my-2" />

            <div className="grid gap-2">
              <Label htmlFor="note">Notes</Label>
              <Textarea
                id="note"
                value={editForm.note}
                onChange={(e) => setEditForm({ ...editForm, note: e.target.value })}
                placeholder="Add notes about this company..."
                rows={3}
              />
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveEdits}
              disabled={saveEditsMutation.isPending}
              className="bg-violet-600 hover:bg-violet-700"
            >
              {saveEditsMutation.isPending ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Label Dialog */}
      <Dialog open={isPrintLabelOpen} onOpenChange={setIsPrintLabelOpen}>
        <DialogContent className="max-w-md">
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

            {/* Address Preview */}
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-xs text-gray-500 mb-2">Shipping To:</p>
              <p className="font-semibold">{company?.company || `${company?.firstName} ${company?.lastName}`.trim()}</p>
              {company?.address1 && <p className="text-sm text-gray-700">{company.address1}</p>}
              {company?.address2 && <p className="text-sm text-gray-700">{company.address2}</p>}
              <p className="text-sm text-gray-700">
                {[company?.city, company?.province, company?.zip].filter(Boolean).join(', ')}
              </p>
              {company?.country && !['US', 'USA', 'CA', 'CAN'].includes(company.country) && (
                <p className="text-sm text-gray-700">{company.country}</p>
              )}
            </div>

            {/* Label Stats */}
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
            <Button variant="outline" onClick={() => setIsPrintLabelOpen(false)}>
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

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-sm font-medium">Lifetime Sales</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(metrics?.lifetimeSales || 0)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Outstanding</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-red-700">
                      {formatCurrency(metrics?.totalOutstanding || 0)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-medium">Avg. Margin</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-blue-700">
                      {metrics?.averageMargin !== null && metrics?.averageMargin !== undefined 
                        ? `${metrics.averageMargin}%` 
                        : <span className="text-gray-400 text-lg">N/A</span>}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-2">
                    <Package className="w-5 h-5" />
                    <span className="text-sm font-medium">Products</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-purple-700">
                      {metrics?.topProducts?.length || 0}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="w-5 h-5 text-violet-500" />
                  Product Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="purchased" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="purchased">Products Purchased</TabsTrigger>
                    <TabsTrigger value="not-purchased">Categories Not Purchased</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="purchased">
                    {metricsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : metrics?.topProducts && metrics.topProducts.length > 0 ? (
                      <div className="space-y-3">
                        {metrics.topProducts.map((product, index) => (
                          <div
                            key={product.name}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-semibold text-sm">
                                {index + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                                <p className="text-xs text-gray-500">
                                  Qty: {formatNumber(product.quantity)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">
                                {formatCurrency(product.totalSpent)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No purchase history available</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="not-purchased">
                    {metricsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : (() => {
                      const purchasedCategoryIds = new Set(metrics?.purchasedCategories?.map(c => c.id) || []);
                      const notPurchasedCategories = (metrics?.allCategories || []).filter(c => !purchasedCategoryIds.has(c.id));
                      
                      return notPurchasedCategories.length > 0 ? (
                        <div className="space-y-2">
                          {notPurchasedCategories.map((category) => (
                            <div
                              key={category.id}
                              className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100"
                            >
                              <Tag className="w-4 h-4 text-amber-600" />
                              <p className="font-medium text-gray-900 text-sm">{category.name}</p>
                            </div>
                          ))}
                          <p className="text-xs text-gray-500 mt-4 text-center">
                            These are product categories this customer hasn't purchased yet - potential upsell opportunities
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                          <p>Customer has purchased from all categories!</p>
                        </div>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-lg">Business Details</CardTitle>
                {!company.odooPartnerId && (
                  <Dialog open={isCreateOdooDialogOpen} onOpenChange={(open) => {
                    setIsCreateOdooDialogOpen(open);
                    if (!open) setDuplicatePartners([]);
                  }}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-2">
                        <Upload className="w-4 h-4" />
                        Create in Odoo
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create Contact in Odoo</DialogTitle>
                        <DialogDescription>
                          This will create a new partner record in Odoo with the following details:
                        </DialogDescription>
                      </DialogHeader>
                      
                      <div className="space-y-3 py-4">
                        <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                          <Building2 className="w-5 h-5 text-gray-400" />
                          <div>
                            <p className="text-xs text-gray-500">Name</p>
                            <p className="font-medium">{company.isCompany ? company.company : [company.firstName, company.lastName].filter(Boolean).join(' ')}</p>
                          </div>
                        </div>
                        
                        {company.email && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <Mail className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-500">Email</p>
                              <p className="font-medium">{company.email}</p>
                            </div>
                          </div>
                        )}
                        
                        {(company.phone || company.cell) && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <Phone className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-500">Phone</p>
                              <p className="font-medium">{company.phone || company.cell}</p>
                            </div>
                          </div>
                        )}
                        
                        {(company.city || company.province) && (
                          <div className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                            <MapPin className="w-5 h-5 text-gray-400" />
                            <div>
                              <p className="text-xs text-gray-500">Location</p>
                              <p className="font-medium">{[company.city, company.province, company.country].filter(Boolean).join(', ')}</p>
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {duplicatePartners.length > 0 && (
                        <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                          <div className="flex items-center gap-2 mb-2">
                            <AlertCircle className="w-4 h-4 text-amber-600" />
                            <p className="font-medium text-amber-800 text-sm">Potential Duplicate Found</p>
                          </div>
                          <p className="text-sm text-amber-700 mb-3">
                            A partner with this email already exists in Odoo. Would you like to link to an existing partner instead?
                          </p>
                          <div className="space-y-2">
                            {duplicatePartners.map((partner) => (
                              <div key={partner.id} className="flex items-center justify-between p-2 bg-white rounded border">
                                <div>
                                  <p className="font-medium text-sm">{partner.name}</p>
                                  <p className="text-xs text-gray-500">{partner.email}</p>
                                </div>
                                <Button 
                                  size="sm" 
                                  variant="outline"
                                  onClick={() => linkToOdooMutation.mutate(partner.id)}
                                  disabled={linkToOdooMutation.isPending}
                                >
                                  {linkToOdooMutation.isPending ? (
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                  ) : (
                                    'Link'
                                  )}
                                </Button>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsCreateOdooDialogOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          onClick={() => createInOdooMutation.mutate()}
                          disabled={createInOdooMutation.isPending}
                          className="gap-2"
                        >
                          {createInOdooMutation.isPending ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin" />
                              Creating...
                            </>
                          ) : (
                            <>
                              <Upload className="w-4 h-4" />
                              Create in Odoo
                            </>
                          )}
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {!company.odooPartnerId && (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg mb-4">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600" />
                      <p className="text-sm text-amber-800">
                        This contact is not linked to Odoo. Create in Odoo to enable editing these fields.
                      </p>
                    </div>
                  </div>
                )}
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-gray-500">Sales Person</p>
                      {updateSalesPersonMutation.isPending && (
                        <span className="flex items-center gap-1 text-xs text-violet-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {salesPersonSaveSuccess && !updateSalesPersonMutation.isPending && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium animate-pulse">
                          <CheckCircle2 className="w-3 h-3" />
                          Saved!
                        </span>
                      )}
                    </div>
                    {metricsLoading || salesPeopleLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : !company.odooPartnerId ? (
                      <p className="font-medium text-gray-500 text-sm">
                        {company.salesRepName || 'Not linked to Odoo'}
                      </p>
                    ) : salesPeopleOptions && salesPeopleOptions.length > 0 ? (
                      <Select
                        value={salesPeopleOptions.find(sp => sp.name === (metrics?.salesPerson || company.salesRepName))?.id.toString() || ''}
                        onValueChange={(value) => {
                          if (value === 'unassign') {
                            updateSalesPersonMutation.mutate({ salesPersonId: null, salesPersonName: '' });
                          } else {
                            const person = salesPeopleOptions.find(sp => sp.id.toString() === value);
                            if (person) {
                              updateSalesPersonMutation.mutate({ salesPersonId: person.id, salesPersonName: person.name });
                            }
                          }
                        }}
                        disabled={updateSalesPersonMutation.isPending}
                      >
                        <SelectTrigger className={`w-full transition-all duration-300 ${updateSalesPersonMutation.isPending ? 'opacity-50' : ''} ${salesPersonSaveSuccess ? 'border-green-500 ring-2 ring-green-200' : ''}`}>
                          <SelectValue placeholder={metrics?.salesPerson || company.salesRepName || 'Select sales person'} />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="unassign" className="text-gray-400 italic">
                            Unassign
                          </SelectItem>
                          {salesPeopleOptions.map((person) => (
                            <SelectItem key={person.id} value={person.id.toString()}>
                              {person.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium text-gray-900">
                        {metrics?.salesPerson || company.salesRepName || 'Not Assigned'}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-gray-500">Payment Terms</p>
                      {updatePaymentTermsMutation.isPending && (
                        <span className="flex items-center gap-1 text-xs text-violet-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {paymentTermsSaveSuccess && !updatePaymentTermsMutation.isPending && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium animate-pulse">
                          <CheckCircle2 className="w-3 h-3" />
                          Saved!
                        </span>
                      )}
                    </div>
                    {metricsLoading ? (
                      <Skeleton className="h-9 w-full" />
                    ) : !company.odooPartnerId ? (
                      <p className="font-medium text-gray-500 text-sm">
                        Not linked to Odoo
                      </p>
                    ) : paymentTermsOptions && paymentTermsOptions.length > 0 ? (
                      <Select
                        value={paymentTermsOptions.find(t => t.name === metrics?.paymentTerms)?.id.toString() || ''}
                        onValueChange={(value) => {
                          const term = paymentTermsOptions.find(t => t.id.toString() === value);
                          if (term) {
                            updatePaymentTermsMutation.mutate({ paymentTermId: term.id, paymentTermName: term.name });
                          }
                        }}
                        disabled={updatePaymentTermsMutation.isPending}
                      >
                        <SelectTrigger className={`w-full transition-all duration-300 ${updatePaymentTermsMutation.isPending ? 'opacity-50' : ''} ${paymentTermsSaveSuccess ? 'border-green-500 ring-2 ring-green-200' : ''}`}>
                          <SelectValue placeholder={metrics?.paymentTerms || 'Select payment terms'} />
                        </SelectTrigger>
                        <SelectContent>
                          {paymentTermsOptions.map((term) => (
                            <SelectItem key={term.id} value={term.id.toString()}>
                              {term.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium text-gray-900">
                        {metrics?.paymentTerms || 'Not Set'}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Tag className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm text-gray-500">Pricing Tier</p>
                      {(updatePricingTierMutation.isPending || updateLocalPricingTierMutation.isPending) && (
                        <span className="flex items-center gap-1 text-xs text-violet-600">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          Saving...
                        </span>
                      )}
                      {tagSaveSuccess && !updatePricingTierMutation.isPending && !updateLocalPricingTierMutation.isPending && (
                        <span className="flex items-center gap-1 text-xs text-green-600 font-medium animate-pulse">
                          <CheckCircle2 className="w-3 h-3" />
                          Saved!
                        </span>
                      )}
                    </div>
                    {(categoriesLoading || pricingTiersLoading) ? (
                      <Skeleton className="h-9 w-full" />
                    ) : !company.odooPartnerId ? (
                      <Select
                        value={company.pricingTier || ''}
                        onValueChange={(value) => {
                          updateLocalPricingTierMutation.mutate({ pricingTier: value });
                        }}
                        disabled={updateLocalPricingTierMutation.isPending}
                      >
                        <SelectTrigger className={`w-full transition-all duration-300 ${updateLocalPricingTierMutation.isPending ? 'opacity-50' : ''} ${tagSaveSuccess ? 'border-green-500 ring-2 ring-green-200' : ''}`}>
                          <SelectValue placeholder={company.pricingTier || 'Select pricing tier'} />
                        </SelectTrigger>
                        <SelectContent>
                          {PRICING_TIERS.map((tier) => (
                            <SelectItem key={tier} value={tier}>
                              {tier}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : partnerCategories && partnerCategories.length > 0 ? (
                      <Select
                        value={partnerCategories.find(c => c.name === company.pricingTier)?.id.toString() || ''}
                        onValueChange={(value) => {
                          const category = partnerCategories.find(c => c.id.toString() === value);
                          if (category) {
                            updatePricingTierMutation.mutate({ categoryId: category.id, categoryName: category.name });
                          }
                        }}
                        disabled={updatePricingTierMutation.isPending}
                      >
                        <SelectTrigger className={`w-full transition-all duration-300 ${updatePricingTierMutation.isPending ? 'opacity-50' : ''} ${tagSaveSuccess ? 'border-green-500 ring-2 ring-green-200' : ''}`}>
                          <SelectValue placeholder={company.pricingTier || 'Select category'} />
                        </SelectTrigger>
                        <SelectContent>
                          {partnerCategories.map((category) => (
                            <SelectItem key={category.id} value={category.id.toString()}>
                              {category.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    ) : (
                      <p className="font-medium text-gray-900">
                        {company.pricingTier || 'Not Set'}
                      </p>
                    )}
                  </div>
                </div>

                {/* Display actual customer tags from Shopify/Odoo */}
                {company.tags && (
                  <>
                    <Separator />
                    <div className="flex items-start gap-3">
                      <Tag className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1">
                        <p className="text-sm text-gray-500 mb-2">Customer Tags</p>
                        <div className="flex flex-wrap gap-1.5">
                          {company.tags.split(',').map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-violet-100 text-violet-800"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </>
                )}

                {/* Contact Information Section */}
                <Separator />
                <div className="space-y-4">
                  <p className="text-sm font-medium text-gray-700">Contact Information</p>
                  
                  {/* Email addresses */}
                  {(company.email || company.email2) && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Mail className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <p className="text-xs text-gray-500">Email</p>
                        {company.email && (
                          <a 
                            href={`mailto:${company.email}`}
                            className="flex items-center gap-1 text-violet-600 hover:text-violet-800 hover:underline font-medium"
                          >
                            {company.email}
                            {isShopifyEmail(company.email) && (
                              <img 
                                src="https://cdn.shopify.com/shopifycloud/brochure/assets/brand-assets/shopify-logo-shopping-bag-512.svg" 
                                className="w-4 h-4 ml-1" 
                                alt="Shopify customer"
                                title="Shopify customer"
                              />
                            )}
                          </a>
                        )}
                        {company.email2 && (
                          <a 
                            href={`mailto:${company.email2}`}
                            className="flex items-center gap-1 text-violet-600 hover:text-violet-800 hover:underline text-sm"
                          >
                            {company.email2}
                            <span className="text-gray-400 text-xs">(secondary)</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Phone numbers */}
                  {(company.phone || company.phone2 || company.cell) && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <Phone className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1 space-y-2">
                        <p className="text-xs text-gray-500">Phone</p>
                        {company.phone && (
                          <a 
                            href={`tel:${company.phone}`}
                            className="flex items-center gap-2 text-violet-600 hover:text-violet-800 hover:underline font-medium"
                          >
                            {company.phone}
                            <span className="text-gray-400 text-xs">(main)</span>
                          </a>
                        )}
                        {company.phone2 && (
                          <a 
                            href={`tel:${company.phone2}`}
                            className="flex items-center gap-2 text-violet-600 hover:text-violet-800 hover:underline text-sm"
                          >
                            {company.phone2}
                            <span className="text-gray-400 text-xs">(secondary)</span>
                          </a>
                        )}
                        {company.cell && (
                          <a 
                            href={`tel:${company.cell}`}
                            className="flex items-center gap-2 text-violet-600 hover:text-violet-800 hover:underline text-sm"
                          >
                            {company.cell}
                            <span className="text-gray-400 text-xs">(mobile)</span>
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                  
                  {/* Address */}
                  {(company.address1 || company.city) && (
                    <div className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                      <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                      <div className="flex-1 space-y-1">
                        <p className="text-xs text-gray-500">Address</p>
                        {company.address1 && (
                          <p className="font-medium text-gray-900">{company.address1}</p>
                        )}
                        {company.address2 && (
                          <p className="text-gray-700">{company.address2}</p>
                        )}
                        <p className="text-gray-700">
                          {[company.city, company.province, company.zip].filter(Boolean).join(', ')}
                        </p>
                        {company.country && (
                          <p className="text-gray-600">{company.country}</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-violet-500" />
                  Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contactsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : contactsData?.contacts && contactsData.contacts.length > 0 ? (
                  <div className="space-y-3">
                    {contactsData.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <p className="font-medium text-gray-900 text-sm">{contact.name}</p>
                        {contact.function && (
                          <p className="text-xs text-gray-500 mt-0.5">{contact.function}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {contact.email && (
                            <div className="flex items-center gap-1">
                              <a
                                href={`mailto:${contact.email}`}
                                className="flex items-center gap-1 text-violet-600 hover:text-violet-700"
                              >
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </a>
                              {isShopifyEmail(contact.email) && (
                                <SiShopify 
                                  className="w-3.5 h-3.5 text-green-600" 
                                  title={`Shopify customer: ${contact.email}`} 
                                />
                              )}
                            </div>
                          )}
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="flex items-center gap-1 text-gray-600 hover:text-violet-600"
                            >
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No contacts found</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {company.note && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{company.note}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

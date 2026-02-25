import { useState, useEffect, useMemo } from "react";
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
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
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
  MessageSquare,
  PhoneCall,
  FileText,
  Activity,
  Calendar,
  UserCheck,
  StickyNote,
  Plus,
  UserPlus,
  GitMerge,
  Trash2,
  Truck,
  Star,
  Target,
  Eye,
  Trophy,
} from "lucide-react";
import { SiShopify } from "react-icons/si";
import { useEmailComposer } from "@/components/email-composer";
import { useLabelQueue } from "@/components/PrintLabelButton";
import { useAuth } from "@/hooks/useAuth";

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
  customerType: string | null;
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
  const [emailPreview, setEmailPreview] = useState<{ subject: string; body: string; recipientEmail: string; sentAt: string } | null>(null);
  const [duplicatePartners, setDuplicatePartners] = useState<Array<{ id: number; name: string; email: string; isCompany: boolean }>>([]);
  const [isDeleteConfirmOpen, setIsDeleteConfirmOpen] = useState(false);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');
  const [isNewContactOpen, setIsNewContactOpen] = useState(false);
  const [newContactForm, setNewContactForm] = useState({ name: '', email: '', phone: '', function: '' });
  const [isMergeContactsOpen, setIsMergeContactsOpen] = useState(false);
  const [selectedMergeContacts, setSelectedMergeContacts] = useState<number[]>([]);
  const [keepContactId, setKeepContactId] = useState<number | null>(null);
  const [currentMergeGroupIndex, setCurrentMergeGroupIndex] = useState(0);
  const labelQueue = useLabelQueue();
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
  const { user } = useAuth();
  const emailComposer = useEmailComposer();
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

  const { data: opportunityData } = useQuery<any>({
    queryKey: ['/api/opportunities/customer', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/opportunities/customer/${companyId}`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  const { data: winPathData } = useQuery<any>({
    queryKey: ['/api/customers', companyId, 'win-path'],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${companyId}/win-path`);
      if (!res.ok) return null;
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 120000,
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

  // Fetch available sales people from unified API
  const { data: salesPeopleOptions = [], isLoading: salesPeopleLoading } = useQuery<Array<{ id: string; name: string; email: string }>>({
    queryKey: ['/api/sales-reps'],
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

  // Fetch activity history for this customer
  interface ActivityEvent {
    id: number;
    customerId: string;
    eventType: string;
    title: string;
    description: string | null;
    sourceType: string | null;
    sourceTable: string | null;
    createdAt: string;
    userId: string | null;
    createdByName: string | null;
  }
  const { data: activityEvents = [], isLoading: activityLoading } = useQuery<ActivityEvent[]>({
    queryKey: ['/api/customer-activity/events', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/customer-activity/events?customerId=${companyId}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 30000,
  });

  // Machine profiles for this customer
  interface MachineProfile {
    id: number;
    machineFamily: string;
    confirmed: boolean;
    otherDetails?: string;
  }
  const { data: machineProfiles = [], refetch: refetchMachines } = useQuery<MachineProfile[]>({
    queryKey: ['/api/crm/machine-profiles', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/crm/machine-profiles/${companyId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!companyId,
  });

  // Machine types from admin taxonomy
  interface MachineType {
    id: number;
    code: string;
    label: string;
    icon: string;
  }
  const { data: machineTypes = [] } = useQuery<MachineType[]>({
    queryKey: ['/api/crm/machine-types'],
    staleTime: 5 * 60 * 1000,
  });

  // Toggle machine profile mutation
  const toggleMachineMutation = useMutation({
    mutationFn: async ({ machineFamily, currentlyEnabled }: { machineFamily: string; currentlyEnabled: boolean }) => {
      const res = await apiRequest('POST', '/api/crm/machine-profiles', {
        customerId: companyId,
        machineFamily,
        enabled: !currentlyEnabled,
      });
      return res.json();
    },
    onSuccess: () => {
      refetchMachines();
      toast({ title: "Machine profile updated" });
    },
    onError: () => {
      toast({ title: "Failed to update machine", variant: "destructive" });
    },
  });


  // Add note mutation
  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const res = await apiRequest('POST', '/api/customer-activity/events', {
        customerId: companyId,
        eventType: 'note',
        eventCategory: 'internal',
        title: 'Note Added',
        description: noteText,
      });
      if (!res.ok) throw new Error('Failed to add note');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Note added', description: 'Your note has been saved' });
      setNewNoteText('');
      setIsNewNoteOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customer-activity/events', companyId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add note', description: error.message, variant: 'destructive' });
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

  // Lightweight navigation - only fetches prev/next IDs, not all 3600+ customers
  const { data: navigation } = useQuery<{
    prevId: string | null;
    prevName: string | null;
    nextId: string | null;
    nextName: string | null;
  }>({
    queryKey: [`/api/customers/${companyId}/navigation`],
    staleTime: 60000,
    enabled: !!companyId,
  });

  const navigateToPrev = () => {
    if (navigation?.prevId) setLocation(`/odoo-contacts/${navigation.prevId}`);
  };
  const navigateToNext = () => {
    if (navigation?.nextId) setLocation(`/odoo-contacts/${navigation.nextId}`);
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

  // Mutation to create a new contact
  const createContactMutation = useMutation({
    mutationFn: async (data: { name: string; email: string; phone: string; function: string }) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/contacts`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to create contact');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Contact Created",
        description: data.message || "Contact successfully created in Odoo",
      });
      setIsNewContactOpen(false);
      setNewContactForm({ name: '', email: '', phone: '', function: '' });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'contacts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Create Contact",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to merge contacts
  const mergeContactsMutation = useMutation({
    mutationFn: async (data: { keepContactId: number; deleteContactIds: number[] }) => {
      const res = await apiRequest('POST', `/api/odoo/customer/${companyId}/contacts/merge`, data);
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to merge contacts');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Contacts Merged",
        description: data.message,
      });
      setIsMergeContactsOpen(false);
      setSelectedMergeContacts([]);
      setKeepContactId(null);
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer', companyId, 'contacts'] });
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Merge Contacts",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to delete customer
  const deleteCustomerMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('DELETE', `/api/customers/${companyId}`);
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404) {
          // Customer already deleted - treat as success
          return { alreadyDeleted: true };
        }
        throw new Error(err.error || 'Failed to delete customer');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: data?.alreadyDeleted ? "Customer Already Deleted" : "Customer Deleted",
        description: data?.alreadyDeleted 
          ? "This customer was already removed from the system." 
          : "The customer has been permanently deleted.",
      });
      setIsDeleteConfirmOpen(false);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      navigate('/odoo-contacts');
    },
    onError: (error: Error) => {
      toast({
        title: "Failed to Delete Customer",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Mutation to update customer type (printer/reseller)
  const updateCustomerTypeMutation = useMutation({
    mutationFn: async (customerType: 'printer' | 'reseller') => {
      const res = await apiRequest('PUT', `/api/customers/${companyId}`, { customerType });
      if (!res.ok) {
        throw new Error('Failed to update customer type');
      }
      return res.json();
    },
    onSuccess: (_, customerType) => {
      toast({
        title: customerType === 'printer' ? 'Marked as Printing Company' : 'Marked as Reseller',
        description: 'Customer type has been updated',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customers', companyId] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Failed to Update Customer Type',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Find contacts with duplicate emails for merge functionality
  const duplicateEmailContacts = useMemo(() => {
    if (!contactsData?.contacts) return [];
    const emailCounts: Record<string, OdooContact[]> = {};
    contactsData.contacts.forEach(contact => {
      if (contact.email) {
        const normalizedEmail = contact.email.toLowerCase().trim();
        if (!emailCounts[normalizedEmail]) {
          emailCounts[normalizedEmail] = [];
        }
        emailCounts[normalizedEmail].push(contact);
      }
    });
    return Object.entries(emailCounts)
      .filter(([_, contacts]) => contacts.length >= 2)
      .map(([email, contacts]) => ({ email, contacts }));
  }, [contactsData?.contacts]);

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
                <div className="flex flex-col gap-1 mt-2 text-sm text-gray-600">
                  {company.email && (
                    <button 
                      onClick={() => emailComposer.open({
                        to: company.email || '',
                        customerId: company.id,
                        customerName: displayName,
                        usageType: 'client_email',
                        variables: {
                          'client.firstName': company.firstName || '',
                          'client.lastName': company.lastName || '',
                          'client.name': displayName,
                          'client.company': company.company || '',
                          'client.email': company.email || '',
                        },
                      })}
                      className="flex items-center gap-2 hover:text-green-600 text-sm text-gray-600 transition-colors"
                      title="Compose email"
                    >
                      <Mail className="w-4 h-4 text-gray-400" />
                      <span>{company.email}</span>
                    </button>
                  )}
                  {company.phone && (
                    <a href={`tel:${company.phone}`} className="flex items-center gap-2 hover:text-violet-600">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span>{company.phone}</span>
                    </a>
                  )}
                  {(company.address1 || company.city) && (
                    <span className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-gray-400" />
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
                  {opportunityData?.score > 0 && (
                    <Badge className={`flex items-center gap-1 ${
                      opportunityData.score >= 70
                        ? 'bg-green-100 text-green-800 border-green-300'
                        : opportunityData.score >= 50
                        ? 'bg-amber-100 text-amber-800 border-amber-300'
                        : 'bg-blue-100 text-blue-800 border-blue-300'
                    }`}>
                      <Star className="w-3 h-3" />
                      Score: {opportunityData.score}
                    </Badge>
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
              
              {company.email && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => emailComposer.open({
                    to: company.email || '',
                    customerId: company.id,
                    customerName: displayName,
                    usageType: 'client_email',
                    variables: {
                      'client.firstName': company.firstName || '',
                      'client.lastName': company.lastName || '',
                      'client.name': displayName,
                      'client.company': company.company || '',
                      'client.email': company.email || '',
                    },
                  })}
                  className="border-green-200 text-green-600 hover:bg-green-50"
                  title="Send email"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Compose Email
                </Button>
              )}
              
              {company && (company.address1 || company.city) && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const inQueue = labelQueue.isInQueue(String(companyId));
                    if (inQueue) {
                      labelQueue.removeFromQueue(String(companyId));
                      toast({ title: 'Removed from label queue' });
                    } else {
                      labelQueue.addToQueue({
                        id: String(companyId),
                        company: company.company,
                        firstName: company.firstName,
                        lastName: company.lastName,
                        address1: company.address1,
                        address2: company.address2,
                        city: company.city,
                        province: company.province,
                        zip: company.zip,
                        country: company.country,
                      });
                      toast({ title: 'Added to label queue', description: 'Click the labels button to print when ready.' });
                    }
                  }}
                  className={labelQueue.isInQueue(String(companyId)) 
                    ? "bg-blue-100 border-blue-300 text-blue-700 hover:bg-blue-200" 
                    : "border-blue-200 text-blue-600 hover:bg-blue-50"}
                  title={labelQueue.isInQueue(String(companyId)) ? "Remove from queue" : "Add to Queue"}
                >
                  <Printer className="w-4 h-4 mr-2" />
                  {labelQueue.isInQueue(String(companyId)) ? 'In Queue' : 'Add to Queue'}
                </Button>
              )}
              
              {user?.role === 'admin' && (
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => setIsDeleteConfirmOpen(true)}
                  className="border-red-200 text-red-600 hover:bg-red-50"
                  title="Delete customer"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}
              
              {/* Customer Type Toggle */}
              <div className="flex items-center gap-1 border rounded-lg p-1 bg-slate-50">
                <Button
                  variant={company.customerType === 'printer' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => updateCustomerTypeMutation.mutate('printer')}
                  disabled={updateCustomerTypeMutation.isPending}
                  className={company.customerType === 'printer' 
                    ? 'bg-blue-600 hover:bg-blue-700 text-white' 
                    : 'text-slate-600 hover:bg-slate-100'}
                  title="Mark as Printing Company"
                >
                  <Printer className="w-4 h-4 mr-1" />
                  Printer
                </Button>
                <Button
                  variant={company.customerType === 'reseller' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => updateCustomerTypeMutation.mutate('reseller')}
                  disabled={updateCustomerTypeMutation.isPending}
                  className={company.customerType === 'reseller' 
                    ? 'bg-amber-600 hover:bg-amber-700 text-white' 
                    : 'text-slate-600 hover:bg-slate-100'}
                  title="Mark as Reseller/Distributor"
                >
                  <Truck className="w-4 h-4 mr-1" />
                  Reseller
                </Button>
              </div>
              
              <div className="flex items-center gap-1 border-l pl-2 ml-1">
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={navigateToPrev}
                  disabled={!navigation?.prevId}
                  className="px-2"
                  title={navigation?.prevName ? `Previous: ${navigation.prevName}` : 'No previous company'}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={navigateToNext}
                  disabled={!navigation?.nextId}
                  className="px-2"
                  title={navigation?.nextName ? `Next: ${navigation.nextName}` : 'No next company'}
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


      {/* Delete Confirmation Dialog */}
      <Dialog open={isDeleteConfirmOpen} onOpenChange={setIsDeleteConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete Customer
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to permanently delete <strong>{company?.company || `${company?.firstName} ${company?.lastName}`}</strong>? This action cannot be undone and will remove all associated quotes, notes, and activity history.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setIsDeleteConfirmOpen(false)}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deleteCustomerMutation.mutate()}
              disabled={deleteCustomerMutation.isPending}
            >
              {deleteCustomerMutation.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4 mr-2" />
                  Delete Permanently
                </>
              )}
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

            {opportunityData?.score > 0 && opportunityData?.signals?.length > 0 && (
              <Card className="border-amber-200 bg-amber-50/30">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Target className="w-5 h-5 text-amber-500" />
                    Opportunity Signals
                    <Badge className={`ml-auto ${
                      opportunityData.score >= 70
                        ? 'bg-green-100 text-green-800'
                        : opportunityData.score >= 50
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      Score: {opportunityData.score}/100
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {opportunityData.signals.map((signal: any, i: number) => (
                      <div key={i} className="flex items-start gap-2 text-sm p-2 bg-white rounded-lg border border-amber-100">
                        <span className="text-green-600 font-semibold shrink-0">+{signal.points}</span>
                        <span className="text-gray-700">{signal.detail}</span>
                      </div>
                    ))}
                  </div>
                  {opportunityData.opportunityType && (
                    <div className="mt-3 text-xs text-gray-500">
                      Type: <span className="capitalize font-medium">{opportunityData.opportunityType.replace(/_/g, ' ')}</span>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}

            {winPathData?.hasWins && winPathData.paths.length > 0 && (
              <Card className="border-emerald-200 bg-gradient-to-br from-emerald-50/50 to-green-50/30">
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Trophy className="w-5 h-5 text-emerald-600" />
                    Win Path
                    <Badge className="ml-auto bg-emerald-100 text-emerald-800 font-semibold">
                      {winPathData.paths.length} {winPathData.paths.length === 1 ? 'Win' : 'Wins'}
                    </Badge>
                  </CardTitle>
                  <p className="text-xs text-gray-500 mt-1">The steps that led to each order — learn what works and repeat it</p>
                </CardHeader>
                <CardContent className="space-y-4">
                  {winPathData.paths.map((path: any, pathIdx: number) => (
                    <div key={path.orderId} className={pathIdx > 0 ? 'pt-4 border-t border-emerald-100' : ''}>
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <SiShopify className="w-4 h-4 text-green-600" />
                          <span className="text-sm font-semibold text-gray-800">
                            Order {path.orderNumber}
                          </span>
                          <span className="text-sm font-bold text-emerald-700">
                            ${path.orderTotal.toFixed(2)}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {path.daysToWin} {path.daysToWin === 1 ? 'day' : 'days'} from first touch
                        </span>
                      </div>

                      <div className="relative pl-6">
                        <div className="absolute left-[11px] top-2 bottom-2 w-[2px] bg-emerald-200" />
                        {path.steps.map((step: any, stepIdx: number) => {
                          const isLast = stepIdx === path.steps.length - 1;
                          const stepDate = new Date(step.date);
                          const dateStr = stepDate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

                          const iconMap: Record<string, { bg: string; icon: string }> = {
                            email: { bg: 'bg-blue-100', icon: '✉️' },
                            swatch_book: { bg: 'bg-purple-100', icon: '📚' },
                            press_test_kit: { bg: 'bg-indigo-100', icon: '🧪' },
                            mailer: { bg: 'bg-orange-100', icon: '📬' },
                            letter: { bg: 'bg-gray-100', icon: '✉️' },
                            call_made: { bg: 'bg-green-100', icon: '📞' },
                            quote_sent: { bg: 'bg-violet-100', icon: '📄' },
                            quote_accepted: { bg: 'bg-emerald-100', icon: '✅' },
                            sample_shipped: { bg: 'bg-cyan-100', icon: '📦' },
                            sample_delivered: { bg: 'bg-teal-100', icon: '📬' },
                            sample_feedback: { bg: 'bg-amber-100', icon: '💬' },
                            meeting_completed: { bg: 'bg-pink-100', icon: '🤝' },
                            order: { bg: 'bg-emerald-200', icon: '🏆' },
                          };
                          const stepStyle = iconMap[step.type] || { bg: 'bg-gray-100', icon: '•' };

                          return (
                            <div key={stepIdx} className="relative flex items-start gap-3 mb-2 last:mb-0">
                              <div className={`relative z-10 w-6 h-6 rounded-full ${stepStyle.bg} flex items-center justify-center text-xs flex-shrink-0 ${isLast ? 'ring-2 ring-emerald-400' : ''}`}>
                                {stepStyle.icon}
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className={`text-sm ${isLast ? 'font-bold text-emerald-700' : 'font-medium text-gray-800'}`}>
                                    {step.label}
                                  </span>
                                  <span className="text-xs text-gray-400">{dateStr}</span>
                                </div>
                                <p className="text-xs text-gray-500 truncate">{step.detail}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {path.steps.length > 1 && (
                        <div className="mt-3 flex flex-wrap gap-2">
                          {(() => {
                            const counts: Record<string, number> = {};
                            path.steps.filter((s: any) => s.type !== 'order').forEach((s: any) => {
                              const key = s.type === 'email' ? 'Emails'
                                : s.type === 'swatch_book' ? 'Swatch Books'
                                : s.type === 'press_test_kit' ? 'Press Test Kits'
                                : s.type === 'mailer' ? 'Mailers'
                                : s.type === 'call_made' ? 'Calls'
                                : s.type === 'quote_sent' ? 'Quotes'
                                : s.type === 'sample_shipped' ? 'Samples'
                                : s.type === 'meeting_completed' ? 'Meetings'
                                : 'Other';
                              counts[key] = (counts[key] || 0) + 1;
                            });
                            return Object.entries(counts).map(([label, count]) => (
                              <span key={label} className="inline-flex items-center text-xs px-2 py-0.5 rounded-full bg-white border border-emerald-200 text-gray-600">
                                {count} {label}
                              </span>
                            ));
                          })()}
                        </div>
                      )}
                    </div>
                  ))}
                </CardContent>
              </Card>
            )}

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

            {/* Notes Section */}
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <StickyNote className="w-5 h-5 text-amber-500" />
                    Notes
                  </CardTitle>
                  <Dialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="gap-1 h-8">
                        <Plus className="w-4 h-4" />
                        New Note
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Add Note</DialogTitle>
                        <DialogDescription>
                          Add a note about this customer. Notes are visible to all team members.
                        </DialogDescription>
                      </DialogHeader>
                      <div className="py-4">
                        <Textarea
                          placeholder="Write your note here..."
                          value={newNoteText}
                          onChange={(e) => setNewNoteText(e.target.value)}
                          className="min-h-[120px]"
                        />
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => setIsNewNoteOpen(false)}>
                          Cancel
                        </Button>
                        <Button 
                          type="button"
                          onClick={() => addNoteMutation.mutate(newNoteText)}
                          disabled={!newNoteText.trim() || addNoteMutation.isPending}
                        >
                          {addNoteMutation.isPending ? (
                            <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          ) : null}
                          Save Note
                        </Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </div>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="space-y-2">
                    {[1, 2].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : (() => {
                  const notes = activityEvents.filter(e => e.eventType === 'note' || e.eventType === 'note_added');
                  return notes.length > 0 ? (
                    <div className="space-y-3 max-h-64 overflow-y-auto">
                      {notes.map((note) => (
                        <div
                          key={note.id}
                          className="p-3 bg-amber-50 rounded-lg border border-amber-100"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-gray-800 line-clamp-2">{note.description || note.title || 'No content'}</p>
                              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                                <Calendar className="w-3 h-3" />
                                {note.createdAt ? new Date(note.createdAt).toLocaleDateString('en-US', {
                                  month: 'short',
                                  day: 'numeric',
                                  year: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit'
                                }) : 'Unknown date'}
                                {note.createdByName && (
                                  <>
                                    <span>•</span>
                                    <span>{note.createdByName}</span>
                                  </>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-7 w-7 p-0 text-red-500 hover:text-red-700 hover:bg-red-50 flex-shrink-0"
                              onClick={async () => {
                                if (confirm('Delete this note?')) {
                                  try {
                                    await apiRequest('DELETE', `/api/customer-activity/events/${note.id}`);
                                    queryClient.invalidateQueries({ queryKey: ['/api/customer-activity/events', companyId] });
                                    toast({ title: 'Note deleted' });
                                  } catch (e) {
                                    toast({ title: 'Failed to delete note', variant: 'destructive' });
                                  }
                                }
                              }}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500">
                      <StickyNote className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p className="text-sm">No notes yet</p>
                      <p className="text-xs mt-1">Add notes from SPOTLIGHT or click "+ New Note"</p>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>

            {/* Activity History Card */}
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Activity className="w-5 h-5 text-blue-500" />
                  Activity History
                </CardTitle>
              </CardHeader>
              <CardContent>
                {activityLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : activityEvents.length > 0 ? (
                  <div className="space-y-3 max-h-96 overflow-y-auto">
                    {activityEvents.slice(0, 20).map((event) => {
                      const getEventIcon = (type: string) => {
                        switch (type) {
                          case 'call': return <PhoneCall className="w-4 h-4 text-green-500" />;
                          case 'email': return <Mail className="w-4 h-4 text-blue-500" />;
                          case 'quote': return <FileText className="w-4 h-4 text-purple-500" />;
                          case 'spotlight_action': return <UserCheck className="w-4 h-4 text-orange-500" />;
                          case 'follow_up_completed': return <CheckCircle2 className="w-4 h-4 text-green-500" />;
                          case 'press_kit_shipped': return <Package className="w-4 h-4 text-indigo-500" />;
                          case 'outreach': return <MessageSquare className="w-4 h-4 text-cyan-500" />;
                          case 'data_update': return <Pencil className="w-4 h-4 text-amber-500" />;
                          case 'enablement': return <FileText className="w-4 h-4 text-teal-500" />;
                          default: return <MessageSquare className="w-4 h-4 text-gray-500" />;
                        }
                      };

                      const getEventBadgeColor = (type: string) => {
                        switch (type) {
                          case 'call': return 'bg-green-100 text-green-700';
                          case 'email': return 'bg-blue-100 text-blue-700';
                          case 'quote': return 'bg-purple-100 text-purple-700';
                          case 'spotlight_action': return 'bg-orange-100 text-orange-700';
                          case 'follow_up_completed': return 'bg-green-100 text-green-700';
                          case 'press_kit_shipped': return 'bg-indigo-100 text-indigo-700';
                          case 'outreach': return 'bg-cyan-100 text-cyan-700';
                          case 'data_update': return 'bg-amber-100 text-amber-700';
                          case 'enablement': return 'bg-teal-100 text-teal-700';
                          default: return 'bg-gray-100 text-gray-700';
                        }
                      };

                      const formatEventType = (type: string) => {
                        return type.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                      };

                      const isEmailEvent = event.description?.includes('email_sent') || event.description?.includes('Email sent');

                      return (
                        <div
                          key={event.id}
                          className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg border border-gray-100"
                        >
                          <div className="mt-1">
                            {getEventIcon(event.eventType)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <p className="font-medium text-gray-900 text-sm">{event.title}</p>
                              <Badge variant="secondary" className={`text-xs ${getEventBadgeColor(event.eventType)}`}>
                                {formatEventType(event.eventType)}
                              </Badge>
                              {isEmailEvent && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-6 px-2 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                                  onClick={async () => {
                                    try {
                                      const res = await fetch(`/api/email/sends?customerId=${companyId}`, { credentials: 'include' });
                                      if (res.ok) {
                                        const sends = await res.json();
                                        const eventDate = event.createdAt ? new Date(event.createdAt) : null;
                                        let matchedEmail = null;
                                        if (eventDate && sends.length > 0) {
                                          matchedEmail = sends.reduce((closest: any, send: any) => {
                                            const sendDate = new Date(send.sentAt);
                                            const diff = Math.abs(sendDate.getTime() - eventDate.getTime());
                                            const closestDiff = closest ? Math.abs(new Date(closest.sentAt).getTime() - eventDate.getTime()) : Infinity;
                                            return diff < closestDiff ? send : closest;
                                          }, null);
                                        }
                                        if (matchedEmail) {
                                          setEmailPreview({
                                            subject: matchedEmail.subject || 'No subject',
                                            body: matchedEmail.body || '',
                                            recipientEmail: matchedEmail.recipientEmail || '',
                                            sentAt: matchedEmail.sentAt || '',
                                          });
                                        }
                                      }
                                    } catch (err) {
                                      console.error('Failed to fetch email preview:', err);
                                    }
                                  }}
                                >
                                  <Eye className="w-3 h-3 mr-1" />
                                  Preview
                                </Button>
                              )}
                            </div>
                            {event.description && (
                              <p className="text-xs text-gray-600 line-clamp-2">{event.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1 text-xs text-gray-400">
                              <Calendar className="w-3 h-3" />
                              {event.createdAt ? new Date(event.createdAt).toLocaleDateString('en-US', {
                                month: 'short',
                                day: 'numeric',
                                year: 'numeric',
                                hour: 'numeric',
                                minute: '2-digit'
                              }) : 'Unknown date'}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {activityEvents.length > 20 && (
                      <p className="text-xs text-gray-500 text-center pt-2">
                        Showing 20 of {activityEvents.length} activities
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <Activity className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                    <p>No activity recorded yet</p>
                    <p className="text-xs mt-1">Interactions from SPOTLIGHT will appear here</p>
                  </div>
                )}
              </CardContent>
            </Card>

            <Dialog open={!!emailPreview} onOpenChange={(open) => { if (!open) setEmailPreview(null); }}>
              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <Mail className="w-5 h-5 text-blue-500" />
                    Email Preview
                  </DialogTitle>
                  <DialogDescription>
                    Sent to {emailPreview?.recipientEmail} on {emailPreview?.sentAt ? new Date(emailPreview.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}
                  </DialogDescription>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="flex items-center gap-2 p-3 bg-gray-50 rounded-lg">
                    <span className="text-sm font-medium text-gray-500">Subject:</span>
                    <span className="text-sm font-semibold text-gray-900">{emailPreview?.subject}</span>
                  </div>
                  <div className="border rounded-lg p-4 bg-white">
                    <div
                      className="prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: emailPreview?.body || '' }}
                    />
                  </div>
                </div>
              </DialogContent>
            </Dialog>
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
                        value={salesPeopleOptions.find(sp => sp.name === (metrics?.salesPerson || company.salesRepName))?.id || ''}
                        onValueChange={(value) => {
                          if (value === 'unassign') {
                            updateSalesPersonMutation.mutate({ salesPersonId: null, salesPersonName: '' });
                          } else {
                            const person = salesPeopleOptions.find(sp => sp.id === value);
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
                            <SelectItem key={person.id} value={person.id}>
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
                          <button 
                            onClick={() => emailComposer.open({
                              to: company.email || '',
                              customerId: company.id,
                              customerName: displayName,
                              usageType: 'client_email',
                              variables: {
                                'client.firstName': company.firstName || '',
                                'client.lastName': company.lastName || '',
                                'client.name': displayName,
                                'client.company': company.company || '',
                                'client.email': company.email || '',
                              },
                            })}
                            className="flex items-center gap-1 text-violet-600 hover:text-green-600 hover:underline font-medium transition-colors"
                            title="Compose email"
                          >
                            {company.email}
                            {isShopifyEmail(company.email) && (
                              <SiShopify 
                                className="w-4 h-4 ml-1 text-green-600" 
                                title="Shopify customer"
                              />
                            )}
                          </button>
                        )}
                        {company.email2 && (
                          <button 
                            onClick={() => emailComposer.open({
                              to: company.email2 || '',
                              customerId: company.id,
                              customerName: displayName,
                              usageType: 'client_email',
                              variables: {
                                'client.firstName': company.firstName || '',
                                'client.lastName': company.lastName || '',
                                'client.name': displayName,
                                'client.company': company.company || '',
                                'client.email': company.email2 || '',
                              },
                            })}
                            className="flex items-center gap-1 text-violet-600 hover:text-green-600 hover:underline text-sm transition-colors"
                            title="Compose email to secondary address"
                          >
                            {company.email2}
                            <span className="text-gray-400 text-xs">(secondary)</span>
                          </button>
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

                {/* Machines Section */}
                <Separator />
                <div className="space-y-4">
                  <p className="text-sm font-medium text-gray-700">Machines Owned</p>
                  <div className="flex flex-wrap gap-2">
                    {machineTypes.length > 0 ? (
                      machineTypes.map((mt) => {
                        const isEnabled = machineProfiles.some(p => p.machineFamily === mt.code);
                        return (
                          <Button
                            key={mt.code}
                            variant={isEnabled ? "default" : "outline"}
                            size="sm"
                            className={`rounded-full ${isEnabled ? 'bg-violet-600 hover:bg-violet-700' : 'hover:bg-violet-50'}`}
                            onClick={() => toggleMachineMutation.mutate({ machineFamily: mt.code, currentlyEnabled: isEnabled })}
                            disabled={toggleMachineMutation.isPending}
                          >
                            {mt.label}
                          </Button>
                        );
                      })
                    ) : (
                      <>
                        {['Offset', 'Digital Toner', 'Digital Inkjet', 'Wide Format', 'Screen Printing', 'Distributor'].map((label) => {
                          const code = label.toLowerCase().replace(/ /g, '_');
                          const isEnabled = machineProfiles.some(p => p.machineFamily === code);
                          return (
                            <Button
                              key={code}
                              variant={isEnabled ? "default" : "outline"}
                              size="sm"
                              className={`rounded-full ${isEnabled ? 'bg-violet-600 hover:bg-violet-700' : 'hover:bg-violet-50'}`}
                              onClick={() => toggleMachineMutation.mutate({ machineFamily: code, currentlyEnabled: isEnabled })}
                              disabled={toggleMachineMutation.isPending}
                            >
                              {label}
                            </Button>
                          );
                        })}
                      </>
                    )}
                  </div>
                  {machineProfiles.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {machineProfiles.map((mp) => (
                        <Badge key={mp.id} variant="secondary" className="bg-violet-100 text-violet-700">
                          {mp.machineFamily.replace(/_/g, ' ')}
                          {mp.otherDetails && <span className="ml-1 text-violet-500">({mp.otherDetails})</span>}
                        </Badge>
                      ))}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <User className="w-5 h-5 text-violet-500" />
                    Contacts
                  </CardTitle>
                  <div className="flex items-center gap-2">
                    {duplicateEmailContacts.length > 0 && (
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="gap-1 text-amber-600 border-amber-300 hover:bg-amber-50"
                        onClick={() => {
                          setCurrentMergeGroupIndex(0);
                          setSelectedMergeContacts([]);
                          setKeepContactId(null);
                          setIsMergeContactsOpen(true);
                        }}
                      >
                        <GitMerge className="w-4 h-4" />
                        Merge ({duplicateEmailContacts.length})
                      </Button>
                    )}
                    {company.odooPartnerId && (
                      <Dialog open={isNewContactOpen} onOpenChange={setIsNewContactOpen}>
                        <DialogTrigger asChild>
                          <Button size="sm" variant="outline" className="gap-1">
                            <Plus className="w-4 h-4" />
                          </Button>
                        </DialogTrigger>
                        <DialogContent>
                          <DialogHeader>
                            <DialogTitle>Add New Contact</DialogTitle>
                            <DialogDescription>
                              Add a contact person for this company. This will be created in Odoo.
                            </DialogDescription>
                          </DialogHeader>
                          <div className="space-y-4 py-4">
                            <div className="space-y-2">
                              <Label>Name *</Label>
                              <Input
                                placeholder="John Doe"
                                value={newContactForm.name}
                                onChange={(e) => setNewContactForm(prev => ({ ...prev, name: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Job Title / Function</Label>
                              <Input
                                placeholder="Sales Manager"
                                value={newContactForm.function}
                                onChange={(e) => setNewContactForm(prev => ({ ...prev, function: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Email</Label>
                              <Input
                                type="email"
                                placeholder="john@example.com"
                                value={newContactForm.email}
                                onChange={(e) => setNewContactForm(prev => ({ ...prev, email: e.target.value }))}
                              />
                            </div>
                            <div className="space-y-2">
                              <Label>Phone</Label>
                              <Input
                                placeholder="+1 555-123-4567"
                                value={newContactForm.phone}
                                onChange={(e) => setNewContactForm(prev => ({ ...prev, phone: e.target.value }))}
                              />
                            </div>
                          </div>
                          <DialogFooter>
                            <Button variant="outline" onClick={() => setIsNewContactOpen(false)}>
                              Cancel
                            </Button>
                            <Button
                              type="button"
                              onClick={() => createContactMutation.mutate(newContactForm)}
                              disabled={!newContactForm.name.trim() || createContactMutation.isPending}
                            >
                              {createContactMutation.isPending ? (
                                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              ) : (
                                <UserPlus className="w-4 h-4 mr-2" />
                              )}
                              Add Contact
                            </Button>
                          </DialogFooter>
                        </DialogContent>
                      </Dialog>
                    )}
                  </div>
                </div>
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
                              <button
                                onClick={() => emailComposer.open({
                                  to: contact.email,
                                  customerId: company?.id,
                                  customerName: contact.name,
                                  usageType: 'client_email',
                                  variables: {
                                    'client.firstName': contact.name?.split(' ')[0] || '',
                                    'client.lastName': contact.name?.split(' ').slice(1).join(' ') || '',
                                    'client.name': contact.name || '',
                                    'client.company': company?.company || '',
                                    'client.email': contact.email || '',
                                  },
                                })}
                                className="flex items-center gap-1 text-violet-600 hover:text-green-600 transition-colors"
                                title="Compose email"
                              >
                                <Mail className="w-3 h-3" />
                                {contact.email}
                              </button>
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

            <Dialog open={isMergeContactsOpen} onOpenChange={setIsMergeContactsOpen}>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Merge Duplicate Contacts</DialogTitle>
                  <DialogDescription>
                    {duplicateEmailContacts.length > 1 
                      ? `Group ${currentMergeGroupIndex + 1} of ${duplicateEmailContacts.length}: Select which contact to keep.`
                      : 'Select which contact to keep. Others will be removed.'}
                  </DialogDescription>
                </DialogHeader>
                {duplicateEmailContacts[currentMergeGroupIndex] && (
                  <div className="space-y-4 py-4">
                    <div className="border rounded-lg p-3 bg-amber-50/50">
                      <p className="text-sm font-medium text-amber-700 mb-3">
                        <Mail className="w-4 h-4 inline-block mr-1" />
                        Email: {duplicateEmailContacts[currentMergeGroupIndex].email}
                      </p>
                      <RadioGroup
                        value={keepContactId?.toString() || ''}
                        onValueChange={(value) => {
                          const id = parseInt(value);
                          const currentGroup = duplicateEmailContacts[currentMergeGroupIndex];
                          setKeepContactId(id);
                          setSelectedMergeContacts(currentGroup.contacts.filter(c => c.id !== id).map(c => c.id));
                        }}
                      >
                        {duplicateEmailContacts[currentMergeGroupIndex].contacts.map((contact) => (
                          <div key={contact.id} className="flex items-center gap-2 p-2 rounded hover:bg-white bg-white/50">
                            <RadioGroupItem value={contact.id.toString()} id={`contact-${contact.id}`} />
                            <Label htmlFor={`contact-${contact.id}`} className="flex-1 cursor-pointer">
                              <span className="font-medium">{contact.name}</span>
                              {contact.function && (
                                <span className="text-xs text-gray-500 ml-2">({contact.function})</span>
                              )}
                              {contact.phone && (
                                <span className="text-xs text-gray-400 ml-2">{contact.phone}</span>
                              )}
                            </Label>
                          </div>
                        ))}
                      </RadioGroup>
                    </div>
                  </div>
                )}
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <AlertCircle className="w-4 h-4 inline-block mr-1 text-amber-600" />
                  <strong>Important:</strong> After merging, please also update this in Odoo and Shopify manually if needed.
                </div>
                <DialogFooter className="flex-col gap-2 sm:flex-row">
                  {duplicateEmailContacts.length > 1 && (
                    <div className="flex gap-2 mr-auto">
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={currentMergeGroupIndex === 0}
                        onClick={() => {
                          setCurrentMergeGroupIndex(prev => prev - 1);
                          setKeepContactId(null);
                          setSelectedMergeContacts([]);
                        }}
                      >
                        <ChevronLeft className="w-4 h-4" /> Prev
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        disabled={currentMergeGroupIndex >= duplicateEmailContacts.length - 1}
                        onClick={() => {
                          setCurrentMergeGroupIndex(prev => prev + 1);
                          setKeepContactId(null);
                          setSelectedMergeContacts([]);
                        }}
                      >
                        Next <ChevronRight className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                  <Button variant="outline" onClick={() => setIsMergeContactsOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (keepContactId && selectedMergeContacts.length > 0) {
                        mergeContactsMutation.mutate({
                          keepContactId,
                          deleteContactIds: selectedMergeContacts
                        });
                      }
                    }}
                    disabled={!keepContactId || selectedMergeContacts.length === 0 || mergeContactsMutation.isPending}
                    className="bg-amber-600 hover:bg-amber-700"
                  >
                    {mergeContactsMutation.isPending ? (
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    ) : (
                      <GitMerge className="w-4 h-4 mr-2" />
                    )}
                    Merge This Group
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

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

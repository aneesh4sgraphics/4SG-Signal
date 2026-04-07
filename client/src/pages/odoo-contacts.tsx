import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { PRICING_TIERS } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { motion, AnimatePresence } from "framer-motion";
import { debounce } from "lodash";
import {
  Search,
  LayoutGrid,
  List,
  Filter,
  ChevronDown,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  Globe,
  MoreHorizontal,
  Edit3,
  Trash2,
  ExternalLink,
  Plus,
  RefreshCw,
  X,
  Check,
  ArrowUpDown,
  Users,
  Sparkles,
  Tag,
  Calendar,
  DollarSign,
  Flame,
  ChevronRight,
  Copy,
  ArrowLeft,
  Loader2,
  CreditCard,
  UserCheck,
  SlidersHorizontal,
  Printer,
  HeartPulse,
  Clock,
  TrendingUp,
  Camera,
} from "lucide-react";
import { SiShopify, SiOdoo } from "react-icons/si";
import { PrintLabelButton, useLabelQueue, CustomerAddress } from "@/components/PrintLabelButton";
import { useEmailComposer } from "@/components/email-composer";
import ScreenshotImportModal from "@/components/ScreenshotImportModal";

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
  totalOrders: number;
  totalSpent: string;
  createdAt: string;
  updatedAt: string;
  // Company parity fields
  companyDomain: string | null;
  jobTitle: string | null;
  companyId: number | null;
  odooCompanyId: number | null;
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

type ViewMode = 'table' | 'cards' | 'byCompany';
type SortField = 'company' | 'email' | 'updatedAt' | 'createdAt' | 'totalSpent' | 'province';
type SortOrder = 'asc' | 'desc';

export default function OdooContacts() {
  const { toast } = useToast();
  const emailComposer = useEmailComposer();
  const queryClient = useQueryClient();
  const [, navigate] = useLocation();
  
  // View state - Default to cards view
  const CONTACTS_SESSION_KEY = 'contacts_view_state';

  const getSessionState = () => {
    try {
      const raw = sessionStorage.getItem(CONTACTS_SESSION_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const ss = getSessionState();

  const [viewMode, setViewMode] = useState<ViewMode>(() => ss?.viewMode ?? 'cards');
  const [searchQuery, setSearchQuery] = useState<string>(() => ss?.searchQuery ?? '');
  const [debouncedSearch, setDebouncedSearch] = useState(ss?.searchQuery ?? '');
  const [sortField, setSortField] = useState<SortField>(() => ss?.sortField ?? 'updatedAt');
  const [sortOrder, setSortOrder] = useState<SortOrder>(() => ss?.sortOrder ?? 'desc');
  const [selectedContacts, setSelectedContacts] = useState<Set<string>>(new Set());
  const [detailContact, setDetailContact] = useState<Contact | null>(null);
  const [editingField, setEditingField] = useState<{ id: string; field: string } | null>(null);
  const [editValue, setEditValue] = useState('');
  
  // Filters - Contacts page always shows people only; isCompany is locked to false
  const [filters, setFilters] = useState(() => {
    const saved = ss?.filters;
    return {
      isCompany: false as boolean | null,
      pricingTier: saved?.pricingTier ?? (null as string | null),
      hasEmail: saved?.hasEmail ?? (null as boolean | null),
      hasWebsite: saved?.hasWebsite ?? (null as boolean | null),
      hasPhone: saved?.hasPhone ?? (null as boolean | null),
      hasAddress: saved?.hasAddress ?? (null as boolean | null),
      hasPricingTier: saved?.hasPricingTier ?? (null as boolean | null),
      isHotProspect: saved?.isHotProspect ?? (null as boolean | null),
      state: saved?.state ?? (null as string | null),
      tag: saved?.tag ?? (null as string | null),
    };
  });
  const [showFilters, setShowFilters] = useState<boolean>(() => ss?.showFilters ?? false);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState<number>(() => ss?.currentPage ?? 1);
  const [pageSize] = useState(50);
  
  // Bulk edit state
  const [bulkEditOpen, setBulkEditOpen] = useState<'tags' | 'salesRep' | 'paymentTerms' | 'pricingTier' | null>(null);
  const [bulkEditLoading, setBulkEditLoading] = useState(false);

  let labelQueue: ReturnType<typeof useLabelQueue> | null = null;
  try { labelQueue = useLabelQueue(); } catch { labelQueue = null; }

  const [searchActiveFilterSnapshot, setSearchActiveFilterSnapshot] = useState<typeof filters | null>(null);

  // Customer health review
  // Show the health check button only on Monday (1) and Thursday (4)
  const isReviewDay = [1, 4].includes(new Date().getDay());
  const [showCustomerReview, setShowCustomerReview] = useState(false);
  const [showScreenshotImport, setShowScreenshotImport] = useState(false);
  const { data: reviewData, isLoading: isLoadingReview } = useQuery<{
    customers: Array<{
      id: string;
      firstName: string | null;
      lastName: string | null;
      company: string | null;
      email: string | null;
      phone: string | null;
      pricingTier: string | null;
      salesRepName: string | null;
      totalSpent: string | null;
      totalOrders: number | null;
      isHotProspect: boolean | null;
      lastOutboundEmailAt: string | null;
      swatchbookSentAt: string | null;
      updatedAt: string | null;
      province: string | null;
      country: string | null;
    }>;
    count: number;
  }>({
    queryKey: ['/api/customers/needs-review'],
    enabled: showCustomerReview,
    staleTime: 2 * 60 * 1000,
  });

  const CONTACT_COLUMNS = [
    { key: 'name', label: 'Name', alwaysVisible: true },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'location', label: 'Location' },
    { key: 'tier', label: 'Tier' },
    { key: 'salesRep', label: 'Sales Rep' },
    { key: 'website', label: 'Website' },
    { key: 'totalOrders', label: 'Orders' },
    { key: 'totalSpent', label: 'Total Spent' },
    { key: 'tags', label: 'Tags' },
    { key: 'createdAt', label: 'Created' },
    { key: 'updatedAt', label: 'Updated' },
  ] as const;

  const [visibleColumns, setVisibleColumns] = useState<Record<string, boolean>>(() => {
    const saved = localStorage.getItem('contacts-visible-columns');
    if (saved) {
      try { return JSON.parse(saved); } catch {}
    }
    return { name: true, email: true, phone: true, location: true, tier: true };
  });

  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const next = { ...prev, [key]: !prev[key] };
      localStorage.setItem('contacts-visible-columns', JSON.stringify(next));
      return next;
    });
  };

  // Debounced search
  // Persist view state to sessionStorage so it survives navigation
  useEffect(() => {
    try {
      sessionStorage.setItem(CONTACTS_SESSION_KEY, JSON.stringify({
        viewMode,
        searchQuery,
        sortField,
        sortOrder,
        filters,
        showFilters,
        currentPage,
      }));
    } catch { /* ignore quota errors */ }
  }, [viewMode, searchQuery, sortField, sortOrder, filters, showFilters, currentPage]);

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300),
    []
  );

  useEffect(() => {
    debouncedSetSearch(searchQuery);
  }, [searchQuery, debouncedSetSearch]);

  useEffect(() => {
    if (searchQuery && !searchActiveFilterSnapshot) {
      setSearchActiveFilterSnapshot({ ...filters });
      setFilters({
        isCompany: false,
        pricingTier: null,
        hasEmail: null,
        hasWebsite: null,
        hasPhone: null,
        hasAddress: null,
        hasPricingTier: null,
        isHotProspect: null,
        state: null,
      });
    } else if (!searchQuery && searchActiveFilterSnapshot) {
      setFilters(searchActiveFilterSnapshot);
      setSearchActiveFilterSnapshot(null);
    }
  }, [searchQuery]);

  // Build query params for paginated endpoint
  const queryParams = new URLSearchParams({
    paginated: 'true',
    page: currentPage.toString(),
    limit: pageSize.toString(),
  });
  if (debouncedSearch) queryParams.set('search', debouncedSearch);
  queryParams.set('isCompany', 'false'); // Contacts page always shows people only
  if (filters.isHotProspect === true) queryParams.set('isHotProspect', 'true');

  // Fetch contacts with server-side pagination
  const { data: paginatedData, isLoading, refetch } = useQuery<{ 
    data: Contact[]; 
    total: number; 
    page: number; 
    totalPages: number; 
  }>({
    queryKey: ['/api/customers', currentPage, pageSize, debouncedSearch, filters.isCompany, filters.isHotProspect],
    queryFn: async () => {
      const res = await fetch(`/api/customers?${queryParams.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      return res.json();
    },
    staleTime: 30000,
  });
  
  const contacts = paginatedData?.data || [];
  const totalContacts = paginatedData?.total || 0;
  const totalPages = paginatedData?.totalPages || 1;

  // Fetch available partner categories (tags) from Odoo for filter dropdown
  const { data: partnerCategories = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/odoo/partner-categories'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/partner-categories');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000, // Cache for 5 minutes
  });

  // Fetch partner IDs for the selected Odoo tag filter (only when a tag is selected)
  const { data: tagFilterPartnerIds } = useQuery<number[]>({
    queryKey: ['/api/odoo/partners-by-category', filters.pricingTier],
    queryFn: async () => {
      if (!filters.pricingTier) return [];
      const res = await fetch(`/api/odoo/partners-by-category/${encodeURIComponent(filters.pricingTier)}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!filters.pricingTier && filters.pricingTier !== 'no_tier',
    staleTime: 60000, // Cache for 1 minute
  });

  // Fetch Shopify customer mappings to show Shopify indicator on contacts
  const { data: shopifyMappings = [] } = useQuery<ShopifyCustomerMapping[]>({
    queryKey: ['/api/shopify/customer-mappings'],
    staleTime: 60000, // Cache for 1 minute
  });

  // Create a Set of lowercase Shopify emails for quick lookup
  const shopifyEmails = new Set(
    shopifyMappings
      .filter(m => m.shopifyEmail)
      .map(m => m.shopifyEmail!.toLowerCase())
  );

  // Helper to check if contact email exists in Shopify
  const isShopifyCustomer = (contact: Contact): boolean => {
    if (!contact.email) return false;
    return shopifyEmails.has(contact.email.toLowerCase());
  };

  // Fetch payment terms from Odoo for bulk edit
  const { data: paymentTerms = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/odoo/payment-terms'],
    staleTime: 300000,
  });

  // Fetch sales people from Odoo for bulk edit
  const { data: salesPeople = [] } = useQuery<Array<{ id: number; name: string; email: string }>>({
    queryKey: ['/api/odoo/sales-people'],
    staleTime: 300000,
  });

  // Bulk update handlers
  const handleBulkUpdateTags = async (categoryId: number, categoryName: string) => {
    setBulkEditLoading(true);
    try {
      const res = await apiRequest('POST', '/api/odoo/customers/bulk/category', {
        customerIds: Array.from(selectedContacts),
        categoryId,
        categoryName
      });
      const result = await res.json();
      toast({
        title: result.success ? "Bulk Update Complete" : "Bulk Update Failed",
        description: result.message,
        variant: result.failed > 0 ? "destructive" : "default"
      });
      // Invalidate both local customer cache and Odoo business metrics for updated companies
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer'] });
      if (result.success) {
        setSelectedContacts(new Set());
      }
      setBulkEditOpen(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Bulk update failed", variant: "destructive" });
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleBulkUpdateSalesRep = async (salesPersonId: number | null, salesPersonName: string | null) => {
    setBulkEditLoading(true);
    try {
      const res = await apiRequest('POST', '/api/odoo/customers/bulk/sales-person', {
        customerIds: Array.from(selectedContacts),
        salesPersonId,
        salesPersonName
      });
      const result = await res.json();
      toast({
        title: result.success ? "Bulk Update Complete" : "Bulk Update Failed",
        description: result.message,
        variant: result.failed > 0 ? "destructive" : "default"
      });
      // Invalidate both local customer cache and Odoo business metrics for updated companies
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer'] });
      if (result.success) {
        setSelectedContacts(new Set());
      }
      setBulkEditOpen(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Bulk update failed", variant: "destructive" });
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleBulkUpdatePaymentTerms = async (paymentTermId: number, paymentTermName: string) => {
    setBulkEditLoading(true);
    try {
      const res = await apiRequest('POST', '/api/odoo/customers/bulk/payment-terms', {
        customerIds: Array.from(selectedContacts),
        paymentTermId,
        paymentTermName
      });
      const result = await res.json();
      toast({
        title: result.success ? "Bulk Update Complete" : "Bulk Update Failed",
        description: result.message,
        variant: result.failed > 0 ? "destructive" : "default"
      });
      // Invalidate both local customer cache and Odoo business metrics for updated companies
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/customer'] });
      if (result.success) {
        setSelectedContacts(new Set());
      }
      setBulkEditOpen(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Bulk update failed", variant: "destructive" });
    } finally {
      setBulkEditLoading(false);
    }
  };

  const handleBulkUpdatePricingTier = async (tier: string) => {
    setBulkEditLoading(true);
    try {
      const res = await apiRequest('POST', '/api/customers/bulk-update', {
        customerIds: Array.from(selectedContacts),
        pricingTier: tier,
      });
      const result = await res.json();
      toast({
        title: result.updatedCount > 0 ? "Pricing Tier Updated" : "No Updates Made",
        description: `${result.updatedCount ?? 0} contact${result.updatedCount !== 1 ? 's' : ''} updated to ${tier}`,
        variant: result.updatedCount > 0 ? "default" : "destructive",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      if (result.updatedCount > 0) setSelectedContacts(new Set());
      setBulkEditOpen(null);
    } catch (error: any) {
      toast({ title: "Error", description: error.message || "Bulk update failed", variant: "destructive" });
    } finally {
      setBulkEditLoading(false);
    }
  };

  // Derive unique tags from loaded contacts
  const uniqueContactTags = Array.from(new Set(
    contacts.flatMap(c => c.tags ? c.tags.split(',').map((t: string) => t.trim()).filter(Boolean) : [])
  )).sort();

  // Filter contacts (mostly done server-side now, but keep tag filter client-side)
  const filteredContacts = contacts
    .filter(c => {
      // Tag filter: check if the contact's Odoo partner ID is in the list of partners with this tag
      if (filters.pricingTier === 'no_tier') {
        if (c.pricingTier) return false;
      } else if (filters.pricingTier && tagFilterPartnerIds) {
        if (!c.odooPartnerId || !tagFilterPartnerIds.includes(c.odooPartnerId)) return false;
      }
      if (filters.hasEmail === true && !c.email) return false;
      if (filters.hasEmail === false && c.email) return false;
      if (filters.hasWebsite === true && !c.website) return false;
      if (filters.hasWebsite === false && c.website) return false;
      if (filters.hasPhone === true && !c.phone && !c.phone2 && !c.cell) return false;
      if (filters.hasPhone === false && (c.phone || c.phone2 || c.cell)) return false;
      if (filters.hasAddress === true && !c.address1 && !c.city) return false;
      if (filters.hasAddress === false && (c.address1 || c.city)) return false;
      if (filters.hasPricingTier === true && !c.pricingTier) return false;
      if (filters.hasPricingTier === false && c.pricingTier) return false;
      if (filters.state && c.province !== filters.state) return false;
      if (filters.tag && !c.tags?.split(',').map((t: string) => t.trim()).includes(filters.tag)) return false;
      return true;
    })
    .sort((a, b) => {
      let aVal: any, bVal: any;
      switch (sortField) {
        case 'company':
          aVal = a.company || a.firstName || '';
          bVal = b.company || b.firstName || '';
          break;
        case 'email':
          aVal = a.email || '';
          bVal = b.email || '';
          break;
        case 'totalSpent':
          aVal = parseFloat(a.totalSpent || '0');
          bVal = parseFloat(b.totalSpent || '0');
          break;
        case 'province':
          aVal = (a.province || '').toLowerCase();
          bVal = (b.province || '').toLowerCase();
          break;
        case 'createdAt':
        case 'updatedAt':
          aVal = new Date(a[sortField] || 0).getTime();
          bVal = new Date(b[sortField] || 0).getTime();
          break;
        default:
          aVal = '';
          bVal = '';
      }
      if (sortOrder === 'asc') return aVal > bVal ? 1 : -1;
      return aVal < bVal ? 1 : -1;
    });

  // Update contact mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Record<string, any> }) => {
      const res = await apiRequest('PUT', `/api/customers/${id}`, updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setEditingField(null);
      toast({ title: "Updated", description: "Contact saved" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    },
  });

  // Inline edit handlers
  const startEdit = (id: string, field: string, currentValue: string) => {
    setEditingField({ id, field });
    setEditValue(currentValue || '');
  };

  const saveEdit = () => {
    if (!editingField) return;
    updateMutation.mutate({ 
      id: editingField.id, 
      updates: { [editingField.field]: editValue || null } 
    });
  };

  const cancelEdit = () => {
    setEditingField(null);
    setEditValue('');
  };

  // Handle keyboard in inline edit
  const handleEditKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveEdit();
    } else if (e.key === 'Escape') {
      cancelEdit();
    }
  };

  // Select all
  const toggleSelectAll = () => {
    if (selectedContacts.size === filteredContacts.length) {
      setSelectedContacts(new Set());
    } else {
      setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
    }
  };

  // Toggle single selection
  const toggleSelect = (id: string) => {
    const newSelected = new Set(selectedContacts);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedContacts(newSelected);
  };

  // Get display name
  const getDisplayName = (contact: Contact) => {
    if (contact.isCompany) {
      return contact.company || contact.firstName || 'Unnamed Company';
    }
    const personName = `${contact.firstName || ''} ${contact.lastName || ''}`.trim();
    if (personName) return personName;
    return contact.company || contact.email || 'Unnamed Contact';
  };

  // Get initials
  const getInitials = (contact: Contact) => {
    const name = getDisplayName(contact);
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied", description: text });
  };

  // Check if a contact has a valid pricing tier (case-insensitive match)
  const hasPricingTier = (contact: Contact): boolean => {
    if (!contact.pricingTier) return false;
    const tier = contact.pricingTier.toUpperCase();
    return PRICING_TIERS.some(pt => pt.toUpperCase() === tier);
  };

  // Country name to flag emoji mapping
  const countryToFlag = (country: string | null): string | null => {
    if (!country) return null;
    const countryUpper = country.toUpperCase().trim();
    const countryMap: Record<string, string> = {
      'UNITED STATES': '🇺🇸', 'USA': '🇺🇸', 'US': '🇺🇸', 'UNITED STATES OF AMERICA': '🇺🇸',
      'CANADA': '🇨🇦', 'CA': '🇨🇦',
      'MEXICO': '🇲🇽', 'MX': '🇲🇽',
      'UNITED KINGDOM': '🇬🇧', 'UK': '🇬🇧', 'GREAT BRITAIN': '🇬🇧', 'GB': '🇬🇧', 'ENGLAND': '🇬🇧',
      'AUSTRALIA': '🇦🇺', 'AU': '🇦🇺',
      'GERMANY': '🇩🇪', 'DE': '🇩🇪',
      'FRANCE': '🇫🇷', 'FR': '🇫🇷',
      'SPAIN': '🇪🇸', 'ES': '🇪🇸',
      'ITALY': '🇮🇹', 'IT': '🇮🇹',
      'BRAZIL': '🇧🇷', 'BR': '🇧🇷',
      'ARGENTINA': '🇦🇷', 'AR': '🇦🇷',
      'COLOMBIA': '🇨🇴', 'CO': '🇨🇴',
      'CHILE': '🇨🇱', 'CL': '🇨🇱',
      'PERU': '🇵🇪', 'PE': '🇵🇪',
      'VENEZUELA': '🇻🇪', 'VE': '🇻🇪',
      'ECUADOR': '🇪🇨', 'EC': '🇪🇨',
      'GUATEMALA': '🇬🇹', 'GT': '🇬🇹',
      'COSTA RICA': '🇨🇷', 'CR': '🇨🇷',
      'PANAMA': '🇵🇦', 'PA': '🇵🇦',
      'PUERTO RICO': '🇵🇷', 'PR': '🇵🇷',
      'DOMINICAN REPUBLIC': '🇩🇴', 'DO': '🇩🇴',
      'HONDURAS': '🇭🇳', 'HN': '🇭🇳',
      'EL SALVADOR': '🇸🇻', 'SV': '🇸🇻',
      'NICARAGUA': '🇳🇮', 'NI': '🇳🇮',
      'BOLIVIA': '🇧🇴', 'BO': '🇧🇴',
      'PARAGUAY': '🇵🇾', 'PY': '🇵🇾',
      'URUGUAY': '🇺🇾', 'UY': '🇺🇾',
      'CHINA': '🇨🇳', 'CN': '🇨🇳',
      'JAPAN': '🇯🇵', 'JP': '🇯🇵',
      'SOUTH KOREA': '🇰🇷', 'KR': '🇰🇷', 'KOREA': '🇰🇷',
      'INDIA': '🇮🇳', 'IN': '🇮🇳',
      'PHILIPPINES': '🇵🇭', 'PH': '🇵🇭',
      'VIETNAM': '🇻🇳', 'VN': '🇻🇳',
      'THAILAND': '🇹🇭', 'TH': '🇹🇭',
      'INDONESIA': '🇮🇩', 'ID': '🇮🇩',
      'MALAYSIA': '🇲🇾', 'MY': '🇲🇾',
      'SINGAPORE': '🇸🇬', 'SG': '🇸🇬',
      'NETHERLANDS': '🇳🇱', 'NL': '🇳🇱', 'HOLLAND': '🇳🇱',
      'BELGIUM': '🇧🇪', 'BE': '🇧🇪',
      'SWITZERLAND': '🇨🇭', 'CH': '🇨🇭',
      'AUSTRIA': '🇦🇹', 'AT': '🇦🇹',
      'POLAND': '🇵🇱', 'PL': '🇵🇱',
      'SWEDEN': '🇸🇪', 'SE': '🇸🇪',
      'NORWAY': '🇳🇴', 'NO': '🇳🇴',
      'DENMARK': '🇩🇰', 'DK': '🇩🇰',
      'FINLAND': '🇫🇮', 'FI': '🇫🇮',
      'IRELAND': '🇮🇪', 'IE': '🇮🇪',
      'PORTUGAL': '🇵🇹', 'PT': '🇵🇹',
      'NEW ZEALAND': '🇳🇿', 'NZ': '🇳🇿',
      'SOUTH AFRICA': '🇿🇦', 'ZA': '🇿🇦',
      'ISRAEL': '🇮🇱', 'IL': '🇮🇱',
      'UNITED ARAB EMIRATES': '🇦🇪', 'UAE': '🇦🇪', 'AE': '🇦🇪',
      'SAUDI ARABIA': '🇸🇦', 'SA': '🇸🇦',
      'EGYPT': '🇪🇬', 'EG': '🇪🇬',
      'TURKEY': '🇹🇷', 'TR': '🇹🇷',
      'RUSSIA': '🇷🇺', 'RU': '🇷🇺',
      'UKRAINE': '🇺🇦', 'UA': '🇺🇦',
      'GREECE': '🇬🇷', 'GR': '🇬🇷',
      'CZECH REPUBLIC': '🇨🇿', 'CZ': '🇨🇿', 'CZECHIA': '🇨🇿',
      'HUNGARY': '🇭🇺', 'HU': '🇭🇺',
      'ROMANIA': '🇷🇴', 'RO': '🇷🇴',
      'JAMAICA': '🇯🇲', 'JM': '🇯🇲',
      'TRINIDAD AND TOBAGO': '🇹🇹', 'TT': '🇹🇹',
      'BAHAMAS': '🇧🇸', 'BS': '🇧🇸',
      'BARBADOS': '🇧🇧', 'BB': '🇧🇧',
      'CUBA': '🇨🇺', 'CU': '🇨🇺',
      'HAITI': '🇭🇹', 'HT': '🇭🇹',
    };
    return countryMap[countryUpper] || null;
  };

  // US State abbreviation to flag image (using state abbreviations as fallback)
  const stateToFlag = (province: string | null, country: string | null): string | null => {
    if (!province) return null;
    const countryUpper = country?.toUpperCase().trim() || '';
    const isUS = ['UNITED STATES', 'USA', 'US', 'UNITED STATES OF AMERICA'].includes(countryUpper);
    if (!isUS) return null;
    
    // Return state abbreviation for US states (state flags aren't emoji)
    const stateAbbrev = province.toUpperCase().trim();
    const stateNames: Record<string, string> = {
      'ALABAMA': 'AL', 'ALASKA': 'AK', 'ARIZONA': 'AZ', 'ARKANSAS': 'AR', 'CALIFORNIA': 'CA',
      'COLORADO': 'CO', 'CONNECTICUT': 'CT', 'DELAWARE': 'DE', 'FLORIDA': 'FL', 'GEORGIA': 'GA',
      'HAWAII': 'HI', 'IDAHO': 'ID', 'ILLINOIS': 'IL', 'INDIANA': 'IN', 'IOWA': 'IA',
      'KANSAS': 'KS', 'KENTUCKY': 'KY', 'LOUISIANA': 'LA', 'MAINE': 'ME', 'MARYLAND': 'MD',
      'MASSACHUSETTS': 'MA', 'MICHIGAN': 'MI', 'MINNESOTA': 'MN', 'MISSISSIPPI': 'MS', 'MISSOURI': 'MO',
      'MONTANA': 'MT', 'NEBRASKA': 'NE', 'NEVADA': 'NV', 'NEW HAMPSHIRE': 'NH', 'NEW JERSEY': 'NJ',
      'NEW MEXICO': 'NM', 'NEW YORK': 'NY', 'NORTH CAROLINA': 'NC', 'NORTH DAKOTA': 'ND', 'OHIO': 'OH',
      'OKLAHOMA': 'OK', 'OREGON': 'OR', 'PENNSYLVANIA': 'PA', 'RHODE ISLAND': 'RI', 'SOUTH CAROLINA': 'SC',
      'SOUTH DAKOTA': 'SD', 'TENNESSEE': 'TN', 'TEXAS': 'TX', 'UTAH': 'UT', 'VERMONT': 'VT',
      'VIRGINIA': 'VA', 'WASHINGTON': 'WA', 'WEST VIRGINIA': 'WV', 'WISCONSIN': 'WI', 'WYOMING': 'WY',
      'DISTRICT OF COLUMBIA': 'DC', 'PUERTO RICO': 'PR',
    };
    // If it's already an abbreviation, return it
    if (stateAbbrev.length === 2 && Object.values(stateNames).includes(stateAbbrev)) {
      return stateAbbrev;
    }
    // If it's a full name, return the abbreviation
    return stateNames[stateAbbrev] || null;
  };

  // Get flag or state badge for a contact
  const getLocationBadge = (contact: Contact): { type: 'flag' | 'state' | 'none'; value: string } => {
    const countryUpper = contact.country?.toUpperCase().trim() || '';
    const isUS = ['UNITED STATES', 'USA', 'US', 'UNITED STATES OF AMERICA'].includes(countryUpper);
    
    // For US customers, show state abbreviation
    if (isUS && contact.province) {
      const stateAbbrev = stateToFlag(contact.province, contact.country);
      if (stateAbbrev) {
        return { type: 'state', value: stateAbbrev };
      }
    }
    
    // For other countries, show flag emoji
    const flag = countryToFlag(contact.country);
    if (flag) {
      return { type: 'flag', value: flag };
    }
    
    return { type: 'none', value: '' };
  };

  const uniqueProvinces = Array.from(new Set(contacts.map(c => c.province).filter(Boolean) as string[])).sort();

  // Active filters count (isCompany is always false so not counted)
  const activeFiltersCount = [
    filters.pricingTier !== null ? 1 : 0,
    filters.hasEmail !== null ? 1 : 0,
    filters.hasWebsite !== null ? 1 : 0,
    filters.hasPhone !== null ? 1 : 0,
    filters.hasAddress !== null ? 1 : 0,
    filters.hasPricingTier !== null ? 1 : 0,
    filters.isHotProspect !== null ? 1 : 0,
    filters.state !== null ? 1 : 0,
    filters.tag !== null ? 1 : 0,
  ].reduce((a, b) => a + b, 0);

  const clearFilters = () => {
    setFilters({
      isCompany: false,
      pricingTier: null,
      hasEmail: null,
      hasWebsite: null,
      hasPhone: null,
      hasAddress: null,
      hasPricingTier: null,
      isHotProspect: null,
      state: null,
      tag: null,
    });
  };

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Notion-style Header */}
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-6 py-4">
          {/* Breadcrumb */}
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link href="/">
              <span className="hover:text-gray-900 cursor-pointer">Home</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium">Contacts</span>
          </div>
          
          {/* Title Row */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
                {debouncedSearch ? <Search className="w-5 h-5" /> : <Users className="w-5 h-5" />}
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">
                  {debouncedSearch ? 'Search Results' : 'Contacts'}
                </h1>
                <p className="text-sm text-gray-500">
                  {totalContacts.toLocaleString()} {debouncedSearch ? 'contacts found' : 'contacts'}
                  {totalPages > 1 && ` • Page ${currentPage} of ${totalPages}`}
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowScreenshotImport(true)}
                className="gap-2"
                title="Import contact from screenshot"
              >
                <Camera className="w-4 h-4" />
                From Screenshot
              </Button>
              {isReviewDay && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowCustomerReview(true)}
                  className="relative text-rose-500 hover:text-rose-600 hover:bg-rose-50"
                  title="Customer Health Review"
                >
                  <span className="relative flex items-center gap-2">
                    <span className="absolute -left-0.5 -top-0.5 w-5 h-5 rounded-full bg-rose-400 opacity-30 animate-ping" />
                    <HeartPulse className="w-4 h-4 relative" />
                    <span className="text-sm font-medium">Health Check</span>
                  </span>
                </Button>
              )}
              <Button 
                variant="ghost" 
                size="sm"
                onClick={() => refetch()}
                disabled={isLoading}
                className="text-gray-600 hover:text-gray-900"
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
                Sync
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Toolbar */}
      <div className="sticky top-[105px] z-30 bg-white border-b border-gray-100">
        <div className="max-w-[1600px] mx-auto px-6 py-3">
          <div className="flex items-center gap-3">
            {/* Search */}
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search contacts…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 bg-gray-50 border-gray-200 focus:bg-white focus:ring-2 focus:ring-violet-100 focus:border-violet-300 transition-all"
              />
              {searchQuery && (
                <button 
                  onClick={() => setSearchQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <Separator orientation="vertical" className="h-6" />

            {/* Filter Button */}
            <Button
              variant={showFilters ? "secondary" : "ghost"}
              size="sm"
              onClick={() => setShowFilters(!showFilters)}
              className="gap-2"
            >
              <Filter className="w-4 h-4" />
              Filter
              {activeFiltersCount > 0 && (
                <Badge variant="secondary" className="ml-1 bg-violet-100 text-violet-700">
                  {activeFiltersCount}
                </Badge>
              )}
            </Button>

            {/* Sort */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <ArrowUpDown className="w-4 h-4" />
                  Sort
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuItem onClick={() => { setSortField('updatedAt'); setSortOrder('desc'); }}>
                  Recently Updated
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('createdAt'); setSortOrder('desc'); }}>
                  Recently Created
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('company'); setSortOrder('asc'); }}>
                  Name A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('company'); setSortOrder('desc'); }}>
                  Name Z-A
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('totalSpent'); setSortOrder('desc'); }}>
                  Highest Value
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('province'); setSortOrder('asc'); }}>
                  State A-Z
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => { setSortField('province'); setSortOrder('desc'); }}>
                  State Z-A
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <div className="flex-1" />

            {viewMode === 'table' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" size="sm" className="gap-2">
                    <SlidersHorizontal className="w-4 h-4" />
                    Columns
                  </Button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-52 p-2">
                  <p className="text-xs font-medium text-gray-500 uppercase px-2 py-1.5">Toggle Columns</p>
                  {CONTACT_COLUMNS.map(col => (
                    <label
                      key={col.key}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm cursor-pointer hover:bg-gray-50 ${
                        'alwaysVisible' in col && col.alwaysVisible ? 'opacity-50 pointer-events-none' : ''
                      }`}
                    >
                      <Checkbox
                        checked={!!visibleColumns[col.key] || ('alwaysVisible' in col && !!col.alwaysVisible)}
                        onCheckedChange={() => !('alwaysVisible' in col && col.alwaysVisible) && toggleColumn(col.key)}
                        disabled={'alwaysVisible' in col && !!col.alwaysVisible}
                      />
                      {col.label}
                    </label>
                  ))}
                </PopoverContent>
              </Popover>
            )}

            {/* View Toggle */}
            <div className="flex items-center bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('table')}
                title="Table view"
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'table' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <List className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('cards')}
                title="Cards view"
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'cards' 
                    ? 'bg-white text-gray-900 shadow-sm' 
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                onClick={() => setViewMode('byCompany')}
                title="By Company view"
                className={`p-1.5 rounded-md transition-all ${
                  viewMode === 'byCompany'
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-500 hover:text-gray-700'
                }`}
              >
                <Building2 className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Filter Panel */}
          <AnimatePresence>
            {showFilters && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                className="overflow-hidden"
              >
                <div className="pt-4 flex flex-wrap items-center gap-3">
                  {/* Pricing Tier Filter */}
                  <Select
                    value={filters.pricingTier || 'all'}
                    onValueChange={(v) => setFilters(f => ({ ...f, pricingTier: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[160px] bg-white">
                      <SelectValue placeholder="Pricing Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Tiers</SelectItem>
                      <SelectItem value="no_tier">No Tier</SelectItem>
                      {PRICING_TIERS.map(tier => (
                        <SelectItem key={tier} value={tier}>{tier}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Has Email */}
                  <Select
                    value={filters.hasEmail === null ? 'all' : filters.hasEmail ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({ 
                      ...f, 
                      hasEmail: v === 'all' ? null : v === 'yes' 
                    }))}
                  >
                    <SelectTrigger className="w-[140px] bg-white">
                      <SelectValue placeholder="Email" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Email</SelectItem>
                      <SelectItem value="yes">Has Email</SelectItem>
                      <SelectItem value="no">No Email</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Website */}
                  <Select
                    value={filters.hasWebsite === null ? 'all' : filters.hasWebsite ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({
                      ...f,
                      hasWebsite: v === 'all' ? null : v === 'yes'
                    }))}
                  >
                    <SelectTrigger className="w-[150px] bg-white">
                      <SelectValue placeholder="Website" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Website</SelectItem>
                      <SelectItem value="yes">Has Website</SelectItem>
                      <SelectItem value="no">No Website</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Phone */}
                  <Select
                    value={filters.hasPhone === null ? 'all' : filters.hasPhone ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({
                      ...f,
                      hasPhone: v === 'all' ? null : v === 'yes'
                    }))}
                  >
                    <SelectTrigger className="w-[140px] bg-white">
                      <SelectValue placeholder="Phone" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Phone</SelectItem>
                      <SelectItem value="yes">Has Phone</SelectItem>
                      <SelectItem value="no">No Phone</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Address */}
                  <Select
                    value={filters.hasAddress === null ? 'all' : filters.hasAddress ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({
                      ...f,
                      hasAddress: v === 'all' ? null : v === 'yes'
                    }))}
                  >
                    <SelectTrigger className="w-[150px] bg-white">
                      <SelectValue placeholder="Address" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Address</SelectItem>
                      <SelectItem value="yes">Has Address</SelectItem>
                      <SelectItem value="no">No Address</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* Pricing Tier */}
                  <Select
                    value={filters.hasPricingTier === null ? 'all' : filters.hasPricingTier ? 'yes' : 'no'}
                    onValueChange={(v) => setFilters(f => ({
                      ...f,
                      hasPricingTier: v === 'all' ? null : v === 'yes'
                    }))}
                  >
                    <SelectTrigger className="w-[160px] bg-white">
                      <SelectValue placeholder="Pricing Tier" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Any Pricing Tier</SelectItem>
                      <SelectItem value="yes">Has Pricing Tier</SelectItem>
                      <SelectItem value="no">No Pricing Tier</SelectItem>
                    </SelectContent>
                  </Select>

                  {/* State Filter */}
                  <Select
                    value={filters.state || 'all'}
                    onValueChange={(v) => setFilters(f => ({ ...f, state: v === 'all' ? null : v }))}
                  >
                    <SelectTrigger className="w-[160px] bg-white">
                      <SelectValue placeholder="State" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All States</SelectItem>
                      {uniqueProvinces.map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>

                  {/* Tag Filter */}
                  {uniqueContactTags.length > 0 && (
                    <Select
                      value={filters.tag || 'all'}
                      onValueChange={(v) => setFilters(f => ({ ...f, tag: v === 'all' ? null : v }))}
                    >
                      <SelectTrigger className="w-[180px] bg-white">
                        <SelectValue placeholder="All Tags" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Tags</SelectItem>
                        {uniqueContactTags.map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}

                  {/* Hot Prospects */}
                  <Button
                    variant={filters.isHotProspect ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => setFilters(f => ({ 
                      ...f, 
                      isHotProspect: f.isHotProspect ? null : true 
                    }))}
                    className="gap-2"
                  >
                    <Flame className={`w-4 h-4 ${filters.isHotProspect ? 'text-orange-500' : ''}`} />
                    Hot Prospects
                  </Button>

                  {activeFiltersCount > 0 && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={clearFilters}
                      className="text-gray-500"
                    >
                      <X className="w-4 h-4 mr-1" />
                      Clear
                    </Button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Bulk Actions Bar */}
      <AnimatePresence>
        {selectedContacts.size > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-violet-50 border-b border-violet-200"
          >
            <div className="max-w-[1600px] mx-auto px-6 py-3">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2 text-sm font-medium text-violet-700">
                  <Check className="w-4 h-4" />
                  {selectedContacts.size} selected
                </div>
                
                <div className="h-4 w-px bg-violet-300" />
                
                {/* Bulk Edit Tags */}
                <DropdownMenu open={bulkEditOpen === 'tags'} onOpenChange={(open) => setBulkEditOpen(open ? 'tags' : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-white" disabled={bulkEditLoading}>
                      {bulkEditLoading && bulkEditOpen === 'tags' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Tag className="w-4 h-4" />
                      )}
                      Set Tags
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {partnerCategories.map(category => (
                      <DropdownMenuItem 
                        key={category.id} 
                        onClick={() => handleBulkUpdateTags(category.id, category.name)}
                        disabled={bulkEditLoading}
                      >
                        {category.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Bulk Edit Sales Rep */}
                <DropdownMenu open={bulkEditOpen === 'salesRep'} onOpenChange={(open) => setBulkEditOpen(open ? 'salesRep' : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-white" disabled={bulkEditLoading}>
                      {bulkEditLoading && bulkEditOpen === 'salesRep' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <UserCheck className="w-4 h-4" />
                      )}
                      Set Sales Rep
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    <DropdownMenuItem 
                      onClick={() => handleBulkUpdateSalesRep(null, null)}
                      disabled={bulkEditLoading}
                      className="text-gray-500"
                    >
                      Unassign Sales Rep
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    {salesPeople.map(person => (
                      <DropdownMenuItem 
                        key={person.id} 
                        onClick={() => handleBulkUpdateSalesRep(person.id, person.name)}
                        disabled={bulkEditLoading}
                      >
                        {person.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Bulk Edit Payment Terms */}
                <DropdownMenu open={bulkEditOpen === 'paymentTerms'} onOpenChange={(open) => setBulkEditOpen(open ? 'paymentTerms' : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-white" disabled={bulkEditLoading}>
                      {bulkEditLoading && bulkEditOpen === 'paymentTerms' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <CreditCard className="w-4 h-4" />
                      )}
                      Set Payment Terms
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {paymentTerms.map(term => (
                      <DropdownMenuItem 
                        key={term.id} 
                        onClick={() => handleBulkUpdatePaymentTerms(term.id, term.name)}
                        disabled={bulkEditLoading}
                      >
                        {term.name}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {/* Bulk Set Pricing Tier */}
                <DropdownMenu open={bulkEditOpen === 'pricingTier'} onOpenChange={(open) => setBulkEditOpen(open ? 'pricingTier' : null)}>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" size="sm" className="gap-2 bg-white" disabled={bulkEditLoading}>
                      {bulkEditLoading && bulkEditOpen === 'pricingTier' ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Tag className="w-4 h-4" />
                      )}
                      Set Pricing Tier
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start" className="max-h-64 overflow-y-auto">
                    {PRICING_TIERS.map(tier => (
                      <DropdownMenuItem
                        key={tier}
                        onClick={() => handleBulkUpdatePricingTier(tier)}
                        disabled={bulkEditLoading}
                      >
                        {tier}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>

                {labelQueue && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 bg-white"
                    onClick={() => {
                      const items = filteredContacts
                        .filter(c => selectedContacts.has(c.id))
                        .filter(c => c.address1 || c.city)
                        .map(c => ({
                          customer: {
                            id: c.id,
                            company: c.company,
                            firstName: c.firstName,
                            lastName: c.lastName,
                            address1: c.address1,
                            address2: null,
                            city: c.city,
                            province: c.province,
                            zip: c.zip,
                            country: c.country,
                          } as CustomerAddress,
                        }));
                      if (items.length === 0) {
                        toast({ title: 'No addresses available', description: 'None of the selected contacts have addresses on file.', variant: 'destructive' });
                        return;
                      }
                      labelQueue!.addBulkToQueueAndOpen(items);
                      toast({ title: `${items.length} address${items.length !== 1 ? 'es' : ''} added to label queue` });
                    }}
                  >
                    <Printer className="w-4 h-4" />
                    Print Address Labels
                  </Button>
                )}

                <div className="flex-1" />
                
                <Button 
                  variant="ghost" 
                  size="sm" 
                  onClick={() => setSelectedContacts(new Set())}
                  className="text-gray-500"
                >
                  <X className="w-4 h-4 mr-1" />
                  Clear Selection
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Content */}
      <div className="max-w-[1600px] mx-auto px-6 py-6">
        {isLoading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex items-center gap-3 text-gray-500">
              <RefreshCw className="w-5 h-5 animate-spin" />
              Loading contacts...
            </div>
          </div>
        ) : filteredContacts.length === 0 && viewMode !== 'byCompany' ? (
          <div className="flex flex-col items-center justify-center py-20">
            <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
              <Users className="w-8 h-8 text-gray-400" />
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-1">No contacts found</h3>
            <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
          </div>
        ) : viewMode === 'byCompany' ? (
          /* By Company View — contacts grouped by business domain */
          (() => {
            const domainGroups = new Map<string, { label: string; domain: string | null; contacts: Contact[] }>();
            for (const c of filteredContacts) {
              const key = c.companyDomain || '__standalone__';
              if (!domainGroups.has(key)) {
                domainGroups.set(key, {
                  label: key === '__standalone__' ? 'No Company' : (c.company || c.companyDomain || key),
                  domain: c.companyDomain || null,
                  contacts: [],
                });
              }
              domainGroups.get(key)!.contacts.push(c);
            }
            const groups = Array.from(domainGroups.values()).sort((a, b) => {
              if (a.domain === null) return 1;
              if (b.domain === null) return -1;
              return a.label.localeCompare(b.label);
            });
            if (groups.length === 0) {
              return (
                <div className="flex flex-col items-center justify-center py-20">
                  <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
                    <Building2 className="w-8 h-8 text-gray-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">No contacts found</h3>
                  <p className="text-gray-500 text-sm">Try adjusting your search or filters</p>
                </div>
              );
            }
            return (
              <div className="space-y-4">
                {groups.map((group) => (
                  <div key={group.domain ?? '__standalone__'} className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
                    {/* Company header */}
                    <div className="flex items-center gap-3 px-5 py-3 bg-gray-50 border-b border-gray-200">
                      <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center flex-shrink-0">
                        <Building2 className="w-4 h-4 text-violet-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="font-semibold text-gray-900">{group.label}</span>
                        {group.domain && (
                          <span className="ml-2 text-xs text-gray-400">{group.domain}</span>
                        )}
                      </div>
                      <span className="text-sm text-gray-500 flex-shrink-0">
                        {group.contacts.length} contact{group.contacts.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                    {/* Contact rows */}
                    <table className="w-full text-sm">
                      <tbody>
                        {group.contacts.map((contact, idx) => (
                          <tr
                            key={contact.id}
                            className={`hover:bg-violet-50 cursor-pointer transition-colors ${idx !== 0 ? 'border-t border-gray-100' : ''}`}
                            onClick={() => setDetailContact(contact)}
                          >
                            <td className="px-5 py-2.5 w-10">
                              <div className="w-7 h-7 rounded-full bg-violet-100 flex items-center justify-center text-xs font-semibold text-violet-700 flex-shrink-0">
                                {contact.isCompany ? <Building2 className="w-3.5 h-3.5" /> : getInitials(contact)}
                              </div>
                            </td>
                            <td className="px-3 py-2.5 font-medium text-gray-900 min-w-[180px]">
                              {getDisplayName(contact)}
                              {contact.jobTitle && (
                                <span className="ml-2 text-xs text-gray-400 font-normal">{contact.jobTitle}</span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-gray-500 hidden md:table-cell">{contact.email || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500 hidden lg:table-cell">{contact.phone || contact.cell || '—'}</td>
                            <td className="px-3 py-2.5 text-gray-500 hidden xl:table-cell">{[contact.city, contact.province].filter(Boolean).join(', ') || '—'}</td>
                            <td className="px-3 py-2.5 hidden xl:table-cell">
                              {contact.pricingTier && (
                                <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-50 text-blue-700">
                                  {contact.pricingTier}
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5 text-right">
                              {contact.odooPartnerId && (
                                <span title="In Odoo">
                                  <SiOdoo className="w-3.5 h-3.5 text-purple-400 inline" />
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            );
          })()
        ) : viewMode === 'table' ? (
          /* Table View */
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
            <table className="w-full">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="w-10 px-4 py-3">
                    <Checkbox
                      checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
                      onCheckedChange={toggleSelectAll}
                    />
                  </th>
                  {visibleColumns.name !== false && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>}
                  {visibleColumns.email && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Email</th>}
                  {visibleColumns.phone && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Phone</th>}
                  {visibleColumns.location && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Location</th>}
                  {visibleColumns.tier && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tier</th>}
                  {visibleColumns.salesRep && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Sales Rep</th>}
                  {visibleColumns.website && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Website</th>}
                  {visibleColumns.totalOrders && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Orders</th>}
                  {visibleColumns.totalSpent && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Total Spent</th>}
                  {visibleColumns.tags && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Tags</th>}
                  {visibleColumns.createdAt && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>}
                  {visibleColumns.updatedAt && <th className="text-left px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider">Updated</th>}
                  <th className="w-12"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                <AnimatePresence>
                  {filteredContacts.slice(0, 100).map((contact, index) => (
                    <motion.tr
                      key={contact.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: index * 0.02 }}
                      className="group hover:bg-violet-50/50 transition-colors cursor-pointer"
                      onClick={() => navigate(`/odoo-contacts/${contact.id}`)}
                    >
                      <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                        <Checkbox
                          checked={selectedContacts.has(contact.id)}
                          onCheckedChange={() => toggleSelect(contact.id)}
                        />
                      </td>
                      {visibleColumns.name !== false && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-medium ${
                            contact.isCompany 
                              ? 'bg-blue-100 text-blue-700' 
                              : 'bg-violet-100 text-violet-700'
                          }`}>
                            {contact.isCompany ? <Building2 className="w-4 h-4" /> : getInitials(contact)}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-gray-900">{getDisplayName(contact)}</span>
                              <div className="flex items-center gap-1">
                                {contact.odooPartnerId && (
                                  <SiOdoo className="w-4 h-4 text-purple-600" title="Odoo customer" />
                                )}
                                {isShopifyCustomer(contact) && (
                                  <SiShopify className="w-4 h-4 text-green-600" title={`Shopify customer: ${contact.email}`} />
                                )}
                              </div>
                              {contact.isHotProspect && <Flame className="w-4 h-4 text-orange-500" />}
                            </div>
                            {contact.isCompany && contact.firstName && (
                              <span className="text-xs text-gray-500">{contact.firstName} {contact.lastName}</span>
                            )}
                          </div>
                        </div>
                      </td>
                      )}
                      {visibleColumns.email && (
                      <td className="px-4 py-3">
                        {editingField?.id === contact.id && editingField?.field === 'email' ? (
                          <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                            <Input
                              value={editValue}
                              onChange={e => setEditValue(e.target.value)}
                              onKeyDown={handleEditKeyDown}
                              className="h-8 text-sm"
                              autoFocus
                            />
                            <Button size="sm" variant="ghost" onClick={saveEdit}><Check className="w-4 h-4" /></Button>
                            <Button size="sm" variant="ghost" onClick={cancelEdit}><X className="w-4 h-4" /></Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-2 group/email">
                            {contact.email ? (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  emailComposer.open({
                                    to: contact.email!,
                                    customerId: contact.id,
                                    customerName: getDisplayName(contact),
                                    usageType: 'client_email',
                                    variables: {
                                      'client.firstName': contact.firstName || '',
                                      'client.lastName': contact.lastName || '',
                                      'client.name': getDisplayName(contact),
                                      'client.company': contact.company || '',
                                      'client.email': contact.email || '',
                                    },
                                  });
                                }}
                                className="text-gray-400 hover:text-green-600 transition-colors"
                                title="Compose email"
                              >
                                <Mail className="w-4 h-4" />
                              </button>
                            ) : (
                              <Mail className="w-4 h-4 text-gray-400" />
                            )}
                            <span 
                              className="text-gray-700 group-hover/email:text-violet-600 cursor-pointer"
                              onClick={e => { e.stopPropagation(); startEdit(contact.id, 'email', contact.email || ''); }}
                            >
                              {contact.email || <span className="text-gray-400 italic">Add email...</span>}
                            </span>
                          </div>
                        )}
                      </td>
                      )}
                      {visibleColumns.phone && (
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-700">{contact.phone || '—'}</span>
                        </div>
                      </td>
                      )}
                      {visibleColumns.location && (
                      <td className="px-4 py-3">
                        {contact.city || contact.province || contact.address1 ? (
                          <div className="flex items-center gap-2">
                            <MapPin className="w-4 h-4 text-gray-400" />
                            <span className="text-gray-700 flex-1">
                              {[contact.city, contact.province].filter(Boolean).join(', ')}
                            </span>
                            <PrintLabelButton customer={contact} variant="icon" />
                          </div>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      )}
                      {visibleColumns.tier && (
                      <td className="px-4 py-3">
                        {contact.pricingTier ? (
                          <Badge variant="secondary" className="capitalize bg-gray-100 text-gray-700">
                            {contact.pricingTier}
                          </Badge>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>
                      )}
                      {visibleColumns.salesRep && (
                      <td className="px-4 py-3">
                        <span className="text-gray-700">{contact.salesRepName || '—'}</span>
                      </td>
                      )}
                      {visibleColumns.website && (
                      <td className="px-4 py-3">
                        {contact.website ? (
                          <a href={contact.website.startsWith('http') ? contact.website : `https://${contact.website}`} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()} className="text-blue-600 hover:underline text-sm truncate max-w-[200px] block">
                            {contact.website.replace(/^https?:\/\//, '')}
                          </a>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      )}
                      {visibleColumns.totalOrders && (
                      <td className="px-4 py-3 text-gray-700">{contact.totalOrders || 0}</td>
                      )}
                      {visibleColumns.totalSpent && (
                      <td className="px-4 py-3 text-gray-700">${Number(contact.totalSpent || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                      )}
                      {visibleColumns.tags && (
                      <td className="px-4 py-3">
                        {contact.tags ? (
                          <span className="text-xs text-gray-600 truncate max-w-[150px] block">{contact.tags}</span>
                        ) : <span className="text-gray-400">—</span>}
                      </td>
                      )}
                      {visibleColumns.createdAt && (
                      <td className="px-4 py-3 text-xs text-gray-500">{contact.createdAt ? new Date(contact.createdAt).toLocaleDateString() : '—'}</td>
                      )}
                      {visibleColumns.updatedAt && (
                      <td className="px-4 py-3 text-xs text-gray-500">{contact.updatedAt ? new Date(contact.updatedAt).toLocaleDateString() : '—'}</td>
                      )}
                      <td className="px-4 py-3">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              className="opacity-0 group-hover:opacity-100 transition-opacity"
                            >
                              <MoreHorizontal className="w-4 h-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => navigate(`/odoo-contacts/${contact.id}`)}>
                              <ExternalLink className="w-4 h-4 mr-2" />
                              View Details
                            </DropdownMenuItem>
                            {contact.email && (
                              <>
                                <DropdownMenuItem onClick={() => emailComposer.open({
                                  to: contact.email!,
                                  customerId: contact.id,
                                  customerName: getDisplayName(contact),
                                  usageType: 'client_email',
                                  variables: {
                                    'client.firstName': contact.firstName || '',
                                    'client.lastName': contact.lastName || '',
                                    'client.name': getDisplayName(contact),
                                    'client.company': contact.company || '',
                                    'client.email': contact.email || '',
                                  },
                                })}>
                                  <Mail className="w-4 h-4 mr-2" />
                                  Send Email
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => copyToClipboard(contact.email!)}>
                                  <Copy className="w-4 h-4 mr-2" />
                                  Copy Email
                                </DropdownMenuItem>
                              </>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </motion.tr>
                  ))}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        ) : (
          /* Cards View */
          <>
          <div className="flex items-center gap-3 mb-3">
            <Checkbox
              checked={selectedContacts.size === filteredContacts.length && filteredContacts.length > 0}
              onCheckedChange={() => {
                if (selectedContacts.size === filteredContacts.length) {
                  setSelectedContacts(new Set());
                } else {
                  setSelectedContacts(new Set(filteredContacts.map(c => c.id)));
                }
              }}
              className="border-gray-400"
            />
            <span className="text-sm text-gray-500">
              {selectedContacts.size > 0 ? `${selectedContacts.size} selected` : `Select all ${filteredContacts.length}`}
            </span>
            {selectedContacts.size > 0 && (
              <button className="text-xs text-gray-400 hover:text-gray-600 underline" onClick={() => setSelectedContacts(new Set())}>
                Clear
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <AnimatePresence>
              {filteredContacts.map((contact, index) => (
                <motion.div
                  key={contact.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: index * 0.02 }}
                >
                  <Card 
                    className={`group hover:shadow-lg transition-all duration-200 cursor-pointer relative ${
                      selectedContacts.has(contact.id)
                        ? 'ring-2 ring-violet-500 border-violet-300 bg-violet-50'
                        : !hasPricingTier(contact)
                        ? 'bg-red-50 border-red-200 hover:border-red-300' 
                        : 'bg-white hover:border-violet-200'
                    }`}
                    onClick={() => navigate(`/odoo-contacts/${contact.id}`)}
                  >
                  <div
                    className={`absolute top-2 left-2 z-10 transition-opacity ${selectedContacts.has(contact.id) ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    onClick={(e) => { e.stopPropagation(); toggleSelect(contact.id); }}
                  >
                    <Checkbox checked={selectedContacts.has(contact.id)} className="bg-white shadow-sm" />
                  </div>
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        {(() => {
                          const locationBadge = getLocationBadge(contact);
                          if (locationBadge.type === 'flag') {
                            return (
                              <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl bg-gradient-to-br from-gray-50 to-gray-100"
                                title={contact.country || ''}
                              >
                                {locationBadge.value}
                              </div>
                            );
                          } else if (locationBadge.type === 'state') {
                            return (
                              <div 
                                className="w-12 h-12 rounded-xl flex items-center justify-center bg-gradient-to-br from-blue-100 to-blue-200"
                                title={`${contact.province}, USA`}
                              >
                                <span className="text-xs font-bold text-blue-700">
                                  🇺🇸 {locationBadge.value}
                                </span>
                              </div>
                            );
                          } else {
                            return (
                              <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-lg font-semibold ${
                                contact.isCompany 
                                  ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700' 
                                  : 'bg-gradient-to-br from-violet-100 to-purple-200 text-violet-700'
                              }`}>
                                {contact.isCompany ? <Building2 className="w-6 h-6" /> : getInitials(contact)}
                              </div>
                            );
                          }
                        })()}
                        <div className="flex items-center gap-1">
                          {contact.odooPartnerId && (
                            <div 
                              className="w-7 h-7 rounded-lg bg-purple-100 flex items-center justify-center" 
                              title="Odoo customer"
                            >
                              <SiOdoo className="w-4 h-4 text-purple-600" />
                            </div>
                          )}
                          {isShopifyCustomer(contact) && (
                            <div 
                              className="w-7 h-7 rounded-lg bg-green-100 flex items-center justify-center" 
                              title={`Shopify customer: ${contact.email}`}
                            >
                              <SiShopify className="w-4 h-4 text-green-600" />
                            </div>
                          )}
                          {contact.isHotProspect && (
                            <div className="w-7 h-7 rounded-lg bg-orange-100 flex items-center justify-center">
                              <Flame className="w-4 h-4 text-orange-500" />
                            </div>
                          )}
                        </div>
                      </div>
                      
                      <h3 className="font-semibold text-gray-900 mb-1 truncate group-hover:text-violet-700 transition-colors">
                        {getDisplayName(contact)}
                      </h3>
                      
                      {contact.isCompany && contact.firstName && (
                        <p className="text-sm text-gray-500 mb-2 truncate">
                          {contact.firstName} {contact.lastName}
                        </p>
                      )}
                      
                      <div className="space-y-1.5 mt-3">
                        {contact.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <a 
                              href={`mailto:${contact.email}`}
                              className="truncate hover:text-primary hover:underline"
                              onClick={(e) => e.stopPropagation()}
                            >
                              {contact.email}
                            </a>
                          </div>
                        )}
                        {contact.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span>{contact.phone}</span>
                          </div>
                        )}
                        {(contact.city || contact.province || contact.address1) && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="w-3.5 h-3.5 text-gray-400 flex-shrink-0" />
                            <span className="truncate flex-1">{[contact.city, contact.province].filter(Boolean).join(', ')}</span>
                            <PrintLabelButton customer={contact} variant="icon" />
                          </div>
                        )}
                      </div>
                      
                      {/* Customer Tags from Shopify/Odoo */}
                      {contact.tags && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {contact.tags.split(',').slice(0, 3).map((tag, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-medium bg-violet-100 text-violet-700"
                            >
                              {tag.trim()}
                            </span>
                          ))}
                          {contact.tags.split(',').length > 3 && (
                            <span className="text-[10px] text-gray-400">+{contact.tags.split(',').length - 3}</span>
                          )}
                        </div>
                      )}

                      <div className="mt-3 flex items-center justify-between">
                        <div>
                          {hasPricingTier(contact) ? (
                            <Badge variant="secondary" className="capitalize text-xs">
                              {contact.pricingTier}
                            </Badge>
                          ) : contact.pricingTier ? (
                            <div className="flex items-center gap-1">
                              <Badge variant="outline" className="text-xs">
                                {contact.pricingTier}
                              </Badge>
                              <Badge variant="destructive" className="text-xs">
                                Need Pricing Tier
                              </Badge>
                            </div>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              No Pricing Tier
                            </Badge>
                          )}
                        </div>
                        {contact.email && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="opacity-0 group-hover:opacity-100 transition-opacity h-7 px-2 text-green-600 hover:text-green-700 hover:bg-green-50"
                            onClick={(e) => {
                              e.stopPropagation();
                              emailComposer.open({
                                to: contact.email!,
                                customerId: contact.id,
                                customerName: getDisplayName(contact),
                                usageType: 'client_email',
                                variables: {
                                  'client.firstName': contact.firstName || '',
                                  'client.lastName': contact.lastName || '',
                                  'client.name': getDisplayName(contact),
                                  'client.company': contact.company || '',
                                  'client.email': contact.email || '',
                                },
                              });
                            }}
                            title="Send email"
                          >
                            <Mail className="w-4 h-4 mr-1" />
                            Email
                          </Button>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
          </>
        )}
        
        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6 px-4 py-3 bg-white rounded-lg border">
            <div className="text-sm text-gray-600">
              Showing {((currentPage - 1) * pageSize) + 1} - {Math.min(currentPage * pageSize, totalContacts)} of {totalContacts.toLocaleString()}
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(1)}
                disabled={currentPage === 1 || isLoading}
              >
                First
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>
              <div className="flex items-center gap-1 px-3">
                <span className="text-sm font-medium">Page {currentPage}</span>
                <span className="text-sm text-gray-400">of {totalPages}</span>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(totalPages)}
                disabled={currentPage === totalPages || isLoading}
              >
                Last
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Sheet */}
      <Sheet open={!!detailContact} onOpenChange={() => setDetailContact(null)}>
        <SheetContent className="w-[500px] sm:max-w-[500px] overflow-y-auto">
          {detailContact && (
            <>
              <SheetHeader className="pb-4 border-b">
                <div className="flex items-start gap-4">
                  <div className={`w-14 h-14 rounded-xl flex items-center justify-center text-xl font-semibold ${
                    detailContact.isCompany 
                      ? 'bg-gradient-to-br from-blue-100 to-blue-200 text-blue-700' 
                      : 'bg-gradient-to-br from-violet-100 to-purple-200 text-violet-700'
                  }`}>
                    {detailContact.isCompany ? <Building2 className="w-7 h-7" /> : getInitials(detailContact)}
                  </div>
                  <div className="flex-1">
                    <SheetTitle className="text-xl flex items-center gap-2">
                      {getDisplayName(detailContact)}
                      <div className="flex items-center gap-1">
                        {detailContact.odooPartnerId && (
                          <SiOdoo className="w-5 h-5 text-purple-600" title="Odoo customer" />
                        )}
                        {isShopifyCustomer(detailContact) && (
                          <SiShopify className="w-5 h-5 text-green-600" title={`Shopify customer: ${detailContact.email}`} />
                        )}
                      </div>
                      {detailContact.isHotProspect && <Flame className="w-5 h-5 text-orange-500" />}
                    </SheetTitle>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="outline" className="capitalize">
                        {detailContact.isCompany ? 'Company' : 'Person'}
                      </Badge>
                      {detailContact.pricingTier && (
                        <Badge variant="secondary" className="capitalize">
                          {detailContact.pricingTier}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="py-6 space-y-6">
                {/* Contact Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Contact Information</h4>
                  <div className="space-y-3">
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                      <Mail className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Email</p>
                        <p className="text-gray-900">{detailContact.email || '—'}</p>
                      </div>
                      {detailContact.email && (
                        <Button size="sm" variant="ghost" onClick={() => copyToClipboard(detailContact.email!)}>
                          <Copy className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                      <Phone className="w-5 h-5 text-gray-400" />
                      <div className="flex-1">
                        <p className="text-xs text-gray-500">Phone</p>
                        <p className="text-gray-900">{detailContact.phone || '—'}</p>
                      </div>
                    </div>

                    {detailContact.cell && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <Phone className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Mobile</p>
                          <p className="text-gray-900">{detailContact.cell}</p>
                        </div>
                      </div>
                    )}

                    {detailContact.website && (
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gray-50">
                        <Globe className="w-5 h-5 text-gray-400" />
                        <div className="flex-1">
                          <p className="text-xs text-gray-500">Website</p>
                          <a href={detailContact.website} target="_blank" rel="noopener" className="text-violet-600 hover:underline">
                            {detailContact.website}
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Address */}
                {(detailContact.address1 || detailContact.city) && (
                  <div>
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="text-sm font-medium text-gray-500">Address</h4>
                      <PrintLabelButton customer={detailContact} variant="icon" />
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <div className="flex items-start gap-3">
                        <MapPin className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div>
                          {detailContact.address1 && <p className="text-gray-900">{detailContact.address1}</p>}
                          <p className="text-gray-700">
                            {[detailContact.city, detailContact.province, detailContact.zip].filter(Boolean).join(', ')}
                          </p>
                          {detailContact.country && <p className="text-gray-500">{detailContact.country}</p>}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Sales Info */}
                <div>
                  <h4 className="text-sm font-medium text-gray-500 mb-3">Sales Information</h4>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Sales Rep</p>
                      <p className="text-gray-900 font-medium">{detailContact.salesRepName || '—'}</p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Total Spent</p>
                      <p className="text-gray-900 font-medium">
                        ${parseFloat(detailContact.totalSpent || '0').toLocaleString()}
                      </p>
                    </div>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-xs text-gray-500">Total Orders</p>
                      <p className="text-gray-900 font-medium">{detailContact.totalOrders || 0}</p>
                    </div>
                    {detailContact.odooPartnerId && (
                      <div className="p-3 rounded-lg bg-gray-50">
                        <p className="text-xs text-gray-500">Odoo ID</p>
                        <p className="text-gray-900 font-medium">{detailContact.odooPartnerId}</p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Notes */}
                {detailContact.note && (
                  <div>
                    <h4 className="text-sm font-medium text-gray-500 mb-3">Notes</h4>
                    <div className="p-3 rounded-lg bg-gray-50">
                      <p className="text-gray-700 whitespace-pre-wrap">{detailContact.note}</p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="pt-4 border-t">
                  <Link href={`/odoo-contacts/${detailContact.id}`}>
                    <Button className="w-full bg-violet-600 hover:bg-violet-700">
                      <ExternalLink className="w-4 h-4 mr-2" />
                      Open Full Profile
                    </Button>
                  </Link>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Screenshot Import Modal */}
      <ScreenshotImportModal
        isOpen={showScreenshotImport}
        onClose={() => setShowScreenshotImport(false)}
        defaultSaveAs="contact"
      />

      {/* Customer Health Review Dialog */}
      <Dialog open={showCustomerReview} onOpenChange={setShowCustomerReview}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-rose-600">
              <HeartPulse className="w-5 h-5" />
              Customer Health Check
            </DialogTitle>
            <DialogDescription>
              {reviewData
                ? `${reviewData.count} companies haven't been contacted in 30+ days — sorted by most neglected first.`
                : 'Loading companies that need your attention…'}
            </DialogDescription>
          </DialogHeader>

          <div className="overflow-y-auto flex-1 -mx-6 px-6">
            {isLoadingReview ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-rose-400" />
              </div>
            ) : !reviewData || reviewData.customers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <HeartPulse className="w-10 h-10 text-green-400 mb-3" />
                <p className="font-medium text-gray-700">All caught up!</p>
                <p className="text-sm text-gray-500 mt-1">Every company has been contacted within the last 30 days.</p>
              </div>
            ) : (
              <div className="space-y-2 py-2">
                {reviewData.customers.map((c) => {
                  const name = [c.firstName, c.lastName].filter(Boolean).join(' ') || c.company || 'Unknown';
                  const daysSince = c.lastOutboundEmailAt
                    ? Math.floor((Date.now() - new Date(c.lastOutboundEmailAt).getTime()) / (1000 * 60 * 60 * 24))
                    : null;
                  const urgency = daysSince === null ? 'never'
                    : daysSince > 90 ? 'critical'
                    : daysSince > 60 ? 'high'
                    : 'moderate';
                  const urgencyColor = urgency === 'never' || urgency === 'critical'
                    ? 'text-red-600 bg-red-50 border-red-100'
                    : urgency === 'high'
                    ? 'text-amber-600 bg-amber-50 border-amber-100'
                    : 'text-blue-600 bg-blue-50 border-blue-100';

                  return (
                    <div key={c.id} className={`flex items-center gap-3 p-3 rounded-lg border ${urgencyColor}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-medium text-gray-900 truncate">{c.company || name}</span>
                          {c.isHotProspect && <Flame className="w-3.5 h-3.5 text-orange-500 flex-shrink-0" />}
                          {c.pricingTier && (
                            <Badge variant="outline" className="text-xs py-0">{c.pricingTier}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-gray-500 flex-wrap">
                          {c.salesRepName && <span>{c.salesRepName}</span>}
                          {(c.province || c.country) && (
                            <span className="flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" />
                              {[c.province, c.country].filter(Boolean).join(', ')}
                            </span>
                          )}
                          {c.totalOrders != null && c.totalOrders > 0 && (
                            <span className="flex items-center gap-0.5">
                              <TrendingUp className="w-3 h-3" />
                              {c.totalOrders} orders · ${parseFloat(c.totalSpent || '0').toLocaleString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="flex items-center gap-1 text-xs font-medium">
                          <Clock className="w-3.5 h-3.5" />
                          {daysSince === null ? 'Never contacted' : `${daysSince}d ago`}
                        </span>
                        <Link href={`/odoo-contacts/${c.id}`}>
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs"
                            onClick={() => setShowCustomerReview(false)}>
                            View
                          </Button>
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end pt-2 border-t mt-2">
            <Button variant="outline" onClick={() => setShowCustomerReview(false)}>Done</Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

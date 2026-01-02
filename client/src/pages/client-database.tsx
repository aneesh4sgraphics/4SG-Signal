import React, { useState, useEffect, useRef, useCallback } from "react";
import { DragDropContext, Droppable, Draggable, DropResult } from "react-beautiful-dnd";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCustomers } from "@/features/customers/useCustomers";
import { useAuth } from "@/hooks/useAuth";
import ClientDetailView from "@/components/ClientDetailView";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import {
  Users,
  Search,
  Edit,
  Save,
  X,
  Plus,
  Trash2,
  Filter,
  RefreshCw,
  Grid3X3,
  List,
  Upload,
  Download,
  CheckCircle,
  AlertCircle,
  Building2,
  Mail,
  Phone,
  MapPin,
  FileText,
  ChevronDown,
  ChevronRight,
  Package,
  MoreHorizontal,
  Clock,
  Eye,
  Send,
  TrendingUp,
  Calendar,
  AlertTriangle,
  GitMerge,
  Check,
  GripVertical,
  BookOpen,
  Printer,
  ExternalLink,
} from "lucide-react";
import { SiShopify, SiOdoo } from "react-icons/si";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import type { Customer } from '@shared/schema';
import { EmailLaunchIcon } from "@/components/email-composer";

// Fuzzy search function
const fuzzyMatch = (text: string, search: string): boolean => {
  if (!text || !search) return false;
  const textLower = text.toLowerCase();
  const searchLower = search.toLowerCase();
  
  // Direct substring match (most common case)
  if (textLower.includes(searchLower)) return true;
  
  // Word-by-word matching - all search words must appear in some text word
  // Only match words with at least 2 characters to avoid single-letter matches
  const textWords = textLower.split(/\s+/).filter(w => w.length > 1);
  const searchWords = searchLower.split(/\s+/).filter(w => w.length > 1);
  
  // If no significant search words, fall back to direct match only
  if (searchWords.length === 0) return false;
  
  // Each search word must be found as a substring in at least one text word
  return searchWords.every(sw => 
    textWords.some(tw => tw.includes(sw))
  );
};

export default function ClientDatabase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showOdooUploadDialog, setShowOdooUploadDialog] = useState(false);
  const [selectedOdooFile, setSelectedOdooFile] = useState<File | null>(null);
  const odooFileInputRef = useRef<HTMLInputElement>(null);
  const [filters, setFilters] = useState({
    city: "",
    province: "",
    country: "",
    taxExempt: "all",
    emailMarketing: "all",
    source: "all", // New: Shopify, Odoo, or All
    clientValue: "all", // New: high (5+), medium (1-4), low (0)
  });
  const [missingDataFilters, setMissingDataFilters] = useState({
    noEmail: false,
    noPhone: false,
    noTags: false,
    noCompany: false,
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards' | 'kanban'>('table');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Customer>>({});
  const [editingField, setEditingField] = useState<string | null>(null); // For inline editing
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCompanyContacts, setSelectedCompanyContacts] = useState<Customer[]>([]);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<Record<string, string>>({});
  const [bulkSelected, setBulkSelected] = useState<Set<string>>(new Set()); // For bulk actions
  const [showSamplesFilter, setShowSamplesFilter] = useState(false); // Filter for samples sent card
  const [showDataCleanupFilter, setShowDataCleanupFilter] = useState(false); // Filter for incomplete data
  const [kanbanCardOrder, setKanbanCardOrder] = useState<Record<string, string[]>>({}); // Custom card order per column
  const [recentSearches, setRecentSearches] = useState<string[]>(() => {
    const saved = localStorage.getItem('clientDatabaseRecentSearches');
    return saved ? JSON.parse(saved) : [];
  });
  const [showRecentSearches, setShowRecentSearches] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Alphabet for tabs
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
  const specialFilters = ['All', '#'];
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logPageView, logUserAction } = useActivityLogger();
  const { user } = useAuth();

  useEffect(() => {
    logPageView("Client Database");
  }, [logPageView]);

  const { data: customers = [], isLoading, error, refetch } = useCustomers();
  
  // Sync selectedCustomer with updated customer data from refetch
  useEffect(() => {
    if (selectedCustomer && customers.length > 0) {
      const updatedCustomer = customers.find(c => c.id === selectedCustomer.id);
      if (updatedCustomer && JSON.stringify(updatedCustomer) !== JSON.stringify(selectedCustomer)) {
        setSelectedCustomer(updatedCustomer);
      }
    }
  }, [customers, selectedCustomer]);
  
  // Fetch quote counts per customer (for individual customer badges)
  const { data: quoteCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/customers/quote-counts'],
  });

  // Fetch total sent quotes from the main sent-quotes endpoint (synced with QuickQuotes)
  const { data: sentQuotes = [] } = useQuery<any[]>({
    queryKey: ['/api/sent-quotes'],
  });
  
  // Fetch total samples sent count
  const { data: sampleRequests = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/sample-requests'],
  });
  
  // Calculate week-to-date counts (last 7 days)
  const getWeekStart = () => {
    const now = new Date();
    const dayOfWeek = now.getDay();
    const start = new Date(now);
    start.setDate(now.getDate() - dayOfWeek);
    start.setHours(0, 0, 0, 0);
    return start;
  };
  
  const weekStart = getWeekStart();
  
  const quotesThisWeek = sentQuotes.filter((q: any) => {
    const sentDate = new Date(q.sentAt || q.createdAt || 0);
    return sentDate >= weekStart;
  }).length;
  
  const samplesThisWeek = sampleRequests.filter((s: any) => {
    if (s.status !== 'shipped' && s.status !== 'completed') return false;
    const shippedDate = new Date(s.shippedAt || s.createdAt || 0);
    return shippedDate >= weekStart;
  }).length;
  
  // Lifetime totals for reference
  const totalQuotesSent = sentQuotes.length;
  const totalSamplesSent = sampleRequests.filter((s: any) => s.status === 'shipped' || s.status === 'completed').length;

  // Fetch swatch book shipments
  const { data: swatchBookShipments = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/swatch-shipments'],
  });

  // Fetch press kit shipments
  const { data: pressKitShipments = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/press-kit-shipments'],
  });

  // Fetch email sends for mailer count
  const { data: emailSends = [] } = useQuery<any[]>({
    queryKey: ['/api/email/sends'],
  });
  
  // Toggle card expansion
  const toggleCardExpansion = (customerId: string) => {
    setExpandedCards(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else {
        newSet.add(customerId);
      }
      return newSet;
    });
  };
  
  // Get quote count for a customer by email
  const getQuoteCount = (email: string | null | undefined): number => {
    if (!email) return 0;
    return quoteCounts[email.toLowerCase()] || 0;
  };
  
  // Get sample count for a customer by ID
  const getSampleCount = (customerId: string): number => {
    return sampleRequests.filter((s: any) => 
      s.customerId === parseInt(customerId) || s.customerId === customerId
    ).length;
  };

  // Check if customer has received a swatch book
  const hasSwatchBook = (customerId: string): boolean => {
    return swatchBookShipments.some((s: any) => 
      String(s.customerId) === customerId || s.customerId === customerId
    );
  };

  // Check if customer has received a press kit
  const hasPressKit = (customerId: string): boolean => {
    return pressKitShipments.some((s: any) => 
      String(s.customerId) === customerId || s.customerId === customerId
    );
  };

  // Get mailer/email send count for a customer
  const getMailerCount = (customerId: string): number => {
    return emailSends.filter((e: any) => 
      String(e.customerId) === customerId || e.customerId === customerId
    ).length;
  };
  
  // Check if customer has missing details
  const hasMissingDetails = (customer: Customer): boolean => {
    return !customer.email || !customer.phone || !customer.company || !customer.city;
  };
  
  // Check if email is incomplete or invalid (for data cleanup highlighting)
  const hasIncompleteEmail = (email: string | null | undefined): boolean => {
    if (!email) return true;
    const normalized = email.trim().toLowerCase();
    return normalized === '' || 
           normalized === 'n/a' || 
           normalized === 'na' ||
           normalized === 'none' ||
           normalized === '-' ||
           !normalized.includes('@');
  };

  // Check if customer has printable address
  const hasAddress = (customer: Customer): boolean => {
    return !!(customer.address1 || customer.city || customer.province || customer.zip);
  };

  // Format address for label printing
  const formatAddressLabel = (customer: Customer): string[] => {
    const lines: string[] = [];
    
    // Line 1: Person Name (if available)
    const personName = [customer.firstName, customer.lastName].filter(Boolean).join(' ').trim();
    if (personName) {
      lines.push(personName);
    }
    
    // Line 2: Company Name (if different from person name)
    if (customer.company && customer.company.trim() && customer.company.trim() !== personName) {
      lines.push(customer.company.trim());
    }
    
    // Line 3: Address Line 1
    if (customer.address1?.trim()) {
      lines.push(customer.address1.trim());
    }
    
    // Line 4: Address Line 2 (if available)
    if (customer.address2?.trim()) {
      lines.push(customer.address2.trim());
    }
    
    // Line 5: City, State ZIP
    const cityStateZip = [
      customer.city?.trim(),
      customer.province?.trim(),
      customer.zip?.trim()
    ].filter(Boolean).join(', ').replace(/, ([^,]+)$/, ' $1'); // Format as "City, State ZIP"
    if (cityStateZip) {
      lines.push(cityStateZip);
    }
    
    return lines;
  };

  // Print 4x2" address label
  const printAddressLabel = (customer: Customer) => {
    const lines = formatAddressLabel(customer);
    if (lines.length === 0) {
      toast({
        title: "No address available",
        description: "This contact doesn't have address information to print.",
        variant: "destructive",
      });
      return;
    }

    const printWindow = window.open('', '_blank', 'width=400,height=250');
    if (!printWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups to print labels.",
        variant: "destructive",
      });
      return;
    }

    // 4x2 inch label = 288pt x 144pt (at 72dpi)
    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Address Label</title>
        <style>
          @page {
            size: 4in 2in;
            margin: 0;
          }
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          body {
            width: 4in;
            height: 2in;
            padding: 0.15in 0.2in;
            font-family: Arial, Helvetica, sans-serif;
            display: flex;
            flex-direction: column;
            justify-content: center;
          }
          .label-line {
            font-size: 11pt;
            line-height: 1.4;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
          }
          .label-line.name {
            font-weight: bold;
            font-size: 12pt;
          }
          .label-line.company {
            font-weight: 600;
          }
        </style>
      </head>
      <body>
        ${lines.map((line, i) => 
          `<div class="label-line ${i === 0 ? 'name' : i === 1 && lines.length > 2 ? 'company' : ''}">${line}</div>`
        ).join('')}
      </body>
      </html>
    `);
    printWindow.document.close();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 250);

    logUserAction("PRINTED LABEL", `Address label for ${customer.company || customer.firstName || customer.email}`);
  };

  // Open Google Maps search for company address
  const searchCompanyAddress = (companyName: string, city?: string | null) => {
    const searchQuery = city 
      ? `${companyName} ${city}` 
      : companyName;
    const url = `https://www.google.com/maps/search/${encodeURIComponent(searchQuery)}`;
    window.open(url, '_blank');
    logUserAction("SEARCHED ADDRESS", `Google Maps search for: ${searchQuery}`);
  };
  
  // Get Kanban category for a customer
  const getKanbanCategory = (customer: Customer): string => {
    const quoteCount = getQuoteCount(customer.email);
    const sampleCount = getSampleCount(customer.id);
    
    if (quoteCount > 0 && sampleCount > 0) return 'both';
    if (quoteCount > 0) return 'quotes';
    if (sampleCount > 0) return 'samples';
    if (hasMissingDetails(customer)) return 'missing';
    return 'none';
  };

  // Get display name for a customer
  const getDisplayName = (customer: Customer) => {
    if (customer.firstName || customer.lastName) {
      return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    }
    return customer.email || customer.id;
  };
  
  // Get company display name (primary identifier)
  const getCompanyDisplayName = (customer: Customer): string => {
    if (customer.company && customer.company.trim()) {
      return customer.company.trim();
    }
    return getDisplayName(customer); // Fallback to contact name
  };
  
  // Get first letter of company name for alphabet filtering
  const getFirstLetter = (customer: Customer): string => {
    const name = getCompanyDisplayName(customer);
    const firstChar = name.charAt(0).toUpperCase();
    if (/[A-Z]/.test(firstChar)) {
      return firstChar;
    }
    return '#'; // For numbers or special characters
  };
  
  // Group customers by company name (normalized for comparison)
  const normalizeCompanyName = (name: string): string => {
    return name.toLowerCase().trim().replace(/\s+/g, ' ');
  };
  
  interface CompanyGroup {
    groupKey: string; // Unique key for React
    companyName: string;
    customers: Customer[];
    primaryCustomer: Customer; // The one with most data
  }
  
  const groupedByCompany: CompanyGroup[] = React.useMemo(() => {
    const groups: Record<string, Customer[]> = {};
    
    customers.forEach(customer => {
      const companyKey = customer.company?.trim() 
        ? normalizeCompanyName(customer.company)
        : `individual_${customer.id}`; // Individual contacts without company
      
      if (!groups[companyKey]) {
        groups[companyKey] = [];
      }
      groups[companyKey].push(customer);
    });
    
    return Object.entries(groups).map(([key, custs]) => {
      // Find the "primary" customer - one with most complete data
      const primary = custs.reduce((best, curr) => {
        const bestScore = (best.email ? 1 : 0) + (best.phone ? 1 : 0) + (best.city ? 1 : 0) + (Number(best.totalOrders) || 0);
        const currScore = (curr.email ? 1 : 0) + (curr.phone ? 1 : 0) + (curr.city ? 1 : 0) + (Number(curr.totalOrders) || 0);
        return currScore > bestScore ? curr : best;
      }, custs[0]);
      
      return {
        groupKey: key, // Unique normalized key for React key prop
        companyName: primary.company?.trim() || getDisplayName(primary),
        customers: custs,
        primaryCustomer: primary,
      };
    }).sort((a, b) => a.companyName.localeCompare(b.companyName));
  }, [customers]);
  
  // Track expanded companies by groupKey
  const [expandedCompanies, setExpandedCompanies] = useState<Set<string>>(new Set());
  
  const toggleCompanyExpansion = (groupKey: string) => {
    setExpandedCompanies(prev => {
      const next = new Set(prev);
      if (next.has(groupKey)) {
        next.delete(groupKey);
      } else {
        next.add(groupKey);
      }
      return next;
    });
  };
  
  // Count companies per letter for the tabs (instead of customers)
  const letterCounts = groupedByCompany.reduce((acc, group) => {
    const firstChar = group.companyName.charAt(0).toUpperCase();
    const letter = /[A-Z]/.test(firstChar) ? firstChar : '#';
    acc[letter] = (acc[letter] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const filteredCustomers = customers.filter((customer) => {
    // First apply alphabet filter
    if (selectedLetter && selectedLetter !== 'All') {
      const firstLetter = getFirstLetter(customer);
      if (selectedLetter === '#') {
        if (/[A-Z]/.test(firstLetter)) return false;
      } else if (firstLetter !== selectedLetter) {
        return false;
      }
    }
    const matchesSearch = !searchTerm || 
      customer.firstName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.lastName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.company?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      customer.id?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCity = !filters.city || customer.city?.toLowerCase().includes(filters.city.toLowerCase());
    const matchesProvince = !filters.province || customer.province?.toLowerCase().includes(filters.province.toLowerCase());
    const matchesCountry = !filters.country || customer.country?.toLowerCase().includes(filters.country.toLowerCase());
    const matchesTaxExempt = filters.taxExempt === "all" || 
      (filters.taxExempt === "yes" && customer.taxExempt) ||
      (filters.taxExempt === "no" && !customer.taxExempt);
    const matchesEmailMarketing = filters.emailMarketing === "all" ||
      (filters.emailMarketing === "yes" && customer.acceptsEmailMarketing) ||
      (filters.emailMarketing === "no" && !customer.acceptsEmailMarketing);

    // Missing data filters - show only customers missing the selected data
    const matchesMissingEmail = !missingDataFilters.noEmail || !customer.email || customer.email.trim() === '';
    const matchesMissingPhone = !missingDataFilters.noPhone || !customer.phone || customer.phone.trim() === '';
    const matchesMissingTags = !missingDataFilters.noTags || !customer.tags || customer.tags.trim() === '';
    const matchesMissingCompany = !missingDataFilters.noCompany || !customer.company || customer.company.trim() === '';

    return matchesSearch && matchesCity && matchesProvince && matchesCountry && matchesTaxExempt && matchesEmailMarketing && matchesMissingEmail && matchesMissingPhone && matchesMissingTags && matchesMissingCompany;
  }).sort((a, b) => {
    // Sort by company name (case-insensitive)
    const companyA = getCompanyDisplayName(a).toLowerCase();
    const companyB = getCompanyDisplayName(b).toLowerCase();
    return companyA.localeCompare(companyB);
  });

  // Get ordered customers for a Kanban column (respects drag-drop order)
  const getOrderedKanbanCustomers = (category: string): Customer[] => {
    const categoryCustomers = filteredCustomers.filter(c => getKanbanCategory(c) === category);
    const savedOrder = kanbanCardOrder[category];
    
    if (!savedOrder || savedOrder.length === 0) {
      return categoryCustomers;
    }
    
    // Sort by saved order, put unsaved items at the end
    return [...categoryCustomers].sort((a, b) => {
      const indexA = savedOrder.indexOf(a.id);
      const indexB = savedOrder.indexOf(b.id);
      if (indexA === -1 && indexB === -1) return 0;
      if (indexA === -1) return 1;
      if (indexB === -1) return -1;
      return indexA - indexB;
    });
  };

  // Handle drag end for Kanban view
  const handleKanbanDragEnd = (result: DropResult) => {
    const { destination, source } = result;
    
    if (!destination) return;
    if (destination.droppableId === source.droppableId && destination.index === source.index) return;
    
    const category = source.droppableId;
    const customers = getOrderedKanbanCustomers(category);
    const customerIds = customers.map(c => c.id);
    
    // Reorder within the same column
    if (destination.droppableId === source.droppableId) {
      const [removed] = customerIds.splice(source.index, 1);
      customerIds.splice(destination.index, 0, removed);
      
      setKanbanCardOrder(prev => ({
        ...prev,
        [category]: customerIds
      }));
    }
  };

  // Filter companies based on search and filters
  const filteredCompanies = React.useMemo(() => {
    return groupedByCompany.filter(group => {
      // Alphabet filter
      if (selectedLetter && selectedLetter !== 'All') {
        const firstChar = group.companyName.charAt(0).toUpperCase();
        if (selectedLetter === '#') {
          if (/[A-Z]/.test(firstChar)) return false;
        } else if (firstChar !== selectedLetter) {
          return false;
        }
      }
      
      // Fuzzy search filter - match against company name or any customer in the group
      if (searchTerm) {
        const matchesCompany = fuzzyMatch(group.companyName, searchTerm);
        const matchesAnyCustomer = group.customers.some(c => 
          fuzzyMatch(c.firstName || '', searchTerm) ||
          fuzzyMatch(c.lastName || '', searchTerm) ||
          fuzzyMatch(c.email || '', searchTerm) ||
          fuzzyMatch(c.company || '', searchTerm)
        );
        if (!matchesCompany && !matchesAnyCustomer) return false;
      }
      
      // Location filters - check if any customer in group matches
      if (filters.city && !group.customers.some(c => c.city?.toLowerCase().includes(filters.city.toLowerCase()))) return false;
      if (filters.province && !group.customers.some(c => c.province?.toLowerCase().includes(filters.province.toLowerCase()))) return false;
      if (filters.country && !group.customers.some(c => c.country?.toLowerCase().includes(filters.country.toLowerCase()))) return false;
      
      // Tax exempt filter
      if (filters.taxExempt !== "all") {
        const hasTaxExempt = group.customers.some(c => c.taxExempt);
        if (filters.taxExempt === "yes" && !hasTaxExempt) return false;
        if (filters.taxExempt === "no" && hasTaxExempt) return false;
      }
      
      // Email marketing filter
      if (filters.emailMarketing !== "all") {
        const acceptsMarketing = group.customers.some(c => c.acceptsEmailMarketing);
        if (filters.emailMarketing === "yes" && !acceptsMarketing) return false;
        if (filters.emailMarketing === "no" && acceptsMarketing) return false;
      }
      
      // Source filter (Shopify, Odoo, or All)
      if (filters.source !== "all") {
        const hasSource = group.customers.some(c => c.sources?.includes(filters.source));
        if (!hasSource) return false;
      }
      
      // Client Value filter (based on quote counts)
      if (filters.clientValue !== "all") {
        const totalQuotes = getCompanyQuoteCount(group);
        if (filters.clientValue === "high" && totalQuotes < 5) return false;
        if (filters.clientValue === "medium" && (totalQuotes < 1 || totalQuotes > 4)) return false;
        if (filters.clientValue === "low" && totalQuotes > 0) return false;
      }
      
      // Samples filter (from clickable card)
      if (showSamplesFilter) {
        const hasSamples = group.customers.some(c => getSampleCount(c.id) > 0);
        if (!hasSamples) return false;
      }
      
      // Missing data filters - show only companies where at least one contact is missing data
      if (missingDataFilters.noEmail && !group.customers.some(c => !c.email || c.email.trim() === '')) return false;
      if (missingDataFilters.noPhone && !group.customers.some(c => !c.phone || c.phone.trim() === '')) return false;
      if (missingDataFilters.noTags && !group.customers.some(c => !c.tags || c.tags.trim() === '')) return false;
      if (missingDataFilters.noCompany && !group.customers.some(c => !c.company || c.company.trim() === '')) return false;
      
      // Data cleanup filter (from clickable card) - show only companies with incomplete emails
      if (showDataCleanupFilter) {
        const hasIncompleteData = group.customers.some(c => hasIncompleteEmail(c.email));
        if (!hasIncompleteData) return false;
      }
      
      return true;
    });
  }, [groupedByCompany, selectedLetter, searchTerm, filters, missingDataFilters, showSamplesFilter, showDataCleanupFilter, quoteCounts, sampleRequests]);
  
  // Helper to get unique quote count for a company (dedupe by email)
  const getCompanyQuoteCount = (group: CompanyGroup): number => {
    const uniqueEmails = new Set(
      group.customers
        .filter(c => c.email)
        .map(c => c.email!.toLowerCase())
    );
    return Array.from(uniqueEmails).reduce((sum, email) => sum + (quoteCounts[email] || 0), 0);
  };

  const updateCustomerMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      return await apiRequest("PUT", `/api/customers/${customer.id}`, customer);
    },
    onSuccess: (_, customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      logUserAction("UPDATED CLIENT", `${customer.firstName} ${customer.lastName} (${customer.email})`);
      toast({
        title: "Client updated",
        description: "Client information has been updated successfully",
      });
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
      setEditingRowId(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating client",
        description: error.message || "Failed to update client",
        variant: "destructive",
      });
    },
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (customer: Omit<Customer, 'createdAt' | 'updatedAt'>) => {
      return await apiRequest("POST", "/api/customers", customer);
    },
    onSuccess: (_, customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      logUserAction("CREATED CLIENT", `${customer.firstName} ${customer.lastName} (${customer.email})`);
      toast({
        title: "Client created",
        description: "New client has been created successfully",
      });
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating client",
        description: error.message || "Failed to create client",
        variant: "destructive",
      });
    },
  });

  const mergeCustomersMutation = useMutation({
    mutationFn: async ({ targetId, sourceId, fieldSelections }: { targetId: string; sourceId: string; fieldSelections?: Record<string, string> }) => {
      return await apiRequest("POST", `/api/customers/merge`, { targetId, sourceId, fieldSelections });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      logUserAction("MERGED CLIENTS", `Merged two customers`);
      toast({
        title: "Clients merged",
        description: "The two clients have been merged successfully",
      });
      setShowMergeDialog(false);
      setSelectedForMerge(new Set());
      setMergeTarget(null);
      setMergeFieldSelections({});
      setBulkSelected(new Set());
    },
    onError: (error: any) => {
      toast({
        title: "Error merging clients",
        description: error.message || "Failed to merge clients",
        variant: "destructive",
      });
    },
  });

  const toggleMergeSelection = (customerId: string) => {
    setSelectedForMerge(prev => {
      const newSet = new Set(prev);
      if (newSet.has(customerId)) {
        newSet.delete(customerId);
      } else if (newSet.size < 2) {
        newSet.add(customerId);
      }
      return newSet;
    });
  };

  const getSelectedCustomers = (): Customer[] => {
    return customers.filter(c => selectedForMerge.has(c.id));
  };

  const handleMerge = () => {
    console.log('handleMerge called', { selectedForMerge: Array.from(selectedForMerge), mergeTarget, mergeFieldSelections });
    if (selectedForMerge.size === 2 && mergeTarget) {
      const ids = Array.from(selectedForMerge);
      const sourceId = ids.find(id => id !== mergeTarget);
      console.log('Merging customers', { targetId: mergeTarget, sourceId, fieldSelections: mergeFieldSelections });
      if (sourceId) {
        mergeCustomersMutation.mutate({ targetId: mergeTarget, sourceId, fieldSelections: mergeFieldSelections });
      }
    } else {
      console.log('Merge conditions not met', { size: selectedForMerge.size, mergeTarget });
    }
  };

  const mergeFields = [
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'company', label: 'Company' },
    { key: 'address1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'province', label: 'Province/State' },
    { key: 'country', label: 'Country' },
    { key: 'zip', label: 'Postal Code' },
    { key: 'tags', label: 'Tags' },
    { key: 'note', label: 'Notes' },
  ];

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onMutate: async (customerId: string) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customers"] });
      const previousCustomers = queryClient.getQueryData(["/api/customers"]);
      const customer = customers.find(c => c.id === customerId);
      queryClient.setQueryData(["/api/customers"], (old: Customer[] | undefined) => 
        old?.filter(c => c.id !== customerId) ?? []
      );
      return { previousCustomers, deletedCustomer: customer };
    },
    onSuccess: (_, customerId, context) => {
      const customer = context?.deletedCustomer;
      logUserAction("DELETED CLIENT", `${customer?.firstName} ${customer?.lastName} (${customer?.email})`);
      toast({
        title: "Client deleted",
        description: "Client has been deleted successfully",
      });
    },
    onError: (error: any, _, context) => {
      if (context?.previousCustomers) {
        queryClient.setQueryData(["/api/customers"], context.previousCustomers);
      }
      toast({
        title: "Error deleting client",
        description: error.message || "Failed to delete client",
        variant: "destructive",
      });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
  });

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file (.csv)",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(30);
      
      const response = await fetch('/api/admin/upload-customer-data', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setUploadProgress(70);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}`, details: errorText };
        }
        
        // More specific error messages
        let errorMessage = errorData.error || errorData.message || `Upload failed with status ${response.status}`;
        if (response.status === 401) {
          errorMessage = "Authentication failed. Please refresh the page and try again.";
        } else if (response.status === 403) {
          errorMessage = "Admin access required. Please contact your administrator.";
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setUploadProgress(100);
      
      const totalProcessed = result.stats?.totalCustomers || 0;
      const newCount = result.stats?.newCustomers || 0;
      const updatedCount = result.stats?.updatedCustomers || 0;
      
      setUploadResult({
        success: true,
        message: `Successfully processed ${totalProcessed} clients (${newCount} new, ${updatedCount} updated)`,
        count: totalProcessed
      });

      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

      toast({
        title: "Upload Successful",
        description: `Processed ${totalProcessed} clients from ${file.name}: ${newCount} new, ${updatedCount} updated`,
      });

    } catch (error) {
      console.error("Upload error:", error);
      
      let errorMessage = "Unknown error occurred";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setUploadResult({
        success: false,
        message: errorMessage
      });

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => {
        setUploadProgress(0);
        setUploadResult(null);
      }, 5000);
    }
  };

  const handleOdooFileUpload = async (file: File) => {
    if (!file.name.endsWith('.xlsx')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload an Excel file (.xlsx)",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(30);
      
      const response = await fetch('/api/admin/upload-odoo-contacts', {
        method: 'POST',
        body: formData,
        credentials: 'include',
      });

      setUploadProgress(70);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}`, details: errorText };
        }
        
        let errorMessage = errorData.error || errorData.message || `Upload failed with status ${response.status}`;
        if (response.status === 401) {
          errorMessage = "Authentication failed. Please refresh the page and try again.";
        } else if (response.status === 403) {
          errorMessage = "Admin access required. Please contact your administrator.";
        }
        
        throw new Error(errorMessage);
      }

      const result = await response.json();
      setUploadProgress(100);
      
      const totalProcessed = result.stats?.totalCustomers || 0;
      const newCount = result.stats?.newCustomers || 0;
      const updatedCount = result.stats?.updatedCustomers || 0;
      
      setUploadResult({
        success: true,
        message: `Successfully processed ${totalProcessed} clients (${newCount} new, ${updatedCount} updated)`,
        count: totalProcessed
      });

      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

      toast({
        title: "Upload Successful",
        description: `Processed ${totalProcessed} clients from ${file.name}: ${newCount} new, ${updatedCount} updated`,
      });

    } catch (error) {
      console.error("Upload error:", error);
      
      let errorMessage = "Unknown error occurred";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setUploadResult({
        success: false,
        message: errorMessage
      });

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      setSelectedOdooFile(null);
      if (odooFileInputRef.current) {
        odooFileInputRef.current.value = '';
      }
      setTimeout(() => {
        setUploadProgress(0);
        setUploadResult(null);
      }, 5000);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDownloadTemplate = () => {
    const headers = [
      "Customer ID", "First Name", "Last Name", "Email", "Accepts Email Marketing",
      "Default Address Company", "Default Address Address1", "Default Address Address2",
      "Default Address City", "Default Address Province Code", "Default Address Country Code",
      "Default Address Zip", "Default Address Phone", "Phone", "Accepts SMS Marketing",
      "Total Spent", "Total Orders", "Note", "Tax Exempt", "Tags"
    ];
    
    const sampleData = [
      "'595909214328", "Paul", "Hendrickson", "paul@printbasics.com", "yes",
      "Print Basics", "1061 SW 30th Ave", "", "Deerfield Beach", "FL", "US",
      "33442", "'(954) 354-0700", "'+19543540700", "no",
      "18005.88", "26", "Sample customer note", "yes", "#stage3-Printer"
    ];

    const csvContent = [
      headers.join(","),
      sampleData.join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "client-template.csv";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Client CSV template has been downloaded",
    });
  };

  const handleEditCustomer = (customer: Customer) => {
    setEditingCustomer({ ...customer });
    setIsEditDialogOpen(true);
  };

  const handleCreateCustomer = () => {
    setEditingCustomer({
      id: "",
      firstName: "",
      lastName: "",
      email: "",
      acceptsEmailMarketing: false,
      company: "",
      address1: "",
      address2: "",
      city: "",
      province: "",
      country: "",
      zip: "",
      phone: "",
      defaultAddressPhone: "",
      acceptsSmsMarketing: false,
      totalSpent: "0",
      totalOrders: 0,
      note: "",
      taxExempt: false,
      tags: "",
      sources: [],
      createdAt: null,
      updatedAt: null,
    });
    setIsCreateDialogOpen(true);
  };

  const handleDeleteCustomer = (id: string) => {
    if (window.confirm("Are you sure you want to delete this client?")) {
      deleteCustomerMutation.mutate(id);
    }
  };

  const clearFilters = () => {
    setSearchTerm("");
    setFilters({
      city: "",
      province: "",
      country: "",
      taxExempt: "all",
      emailMarketing: "all",
      source: "all",
      clientValue: "all",
    });
    setMissingDataFilters({
      noEmail: false,
      noPhone: false,
      noTags: false,
      noCompany: false,
    });
    setShowSamplesFilter(false);
    setShowDataCleanupFilter(false);
    setBulkSelected(new Set());
  };

  // Recent searches handling
  const addRecentSearch = (term: string) => {
    if (!term.trim()) return;
    const updated = [term, ...recentSearches.filter(s => s !== term)].slice(0, 5);
    setRecentSearches(updated);
    localStorage.setItem('clientDatabaseRecentSearches', JSON.stringify(updated));
  };

  const handleSearchSubmit = () => {
    if (searchTerm.trim()) {
      addRecentSearch(searchTerm.trim());
      setShowRecentSearches(false);
    }
  };

  const selectRecentSearch = (term: string) => {
    setSearchTerm(term);
    setShowRecentSearches(false);
  };

  // Bulk selection handlers
  const toggleBulkSelection = (id: string) => {
    setBulkSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const selectAllVisible = () => {
    const allIds = new Set(filteredCompanies.map(g => g.primaryCustomer.id));
    setBulkSelected(allIds);
  };

  const clearBulkSelection = () => {
    setBulkSelected(new Set());
  };

  // Bulk delete handler
  const handleBulkDelete = () => {
    if (bulkSelected.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${bulkSelected.size} clients? This cannot be undone.`)) {
      bulkSelected.forEach(id => {
        deleteCustomerMutation.mutate(id);
      });
      setBulkSelected(new Set());
    }
  };

  const startEdit = (customer: Customer) => {
    setEditingRowId(customer.id);
    setEditingData({ ...customer });
  };

  const saveEdit = () => {
    if (editingRowId && editingData) {
      const customer = customers.find(c => c.id === editingRowId);
      if (customer) {
        updateCustomerMutation.mutate({ ...customer, ...editingData });
      }
    }
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditingData({});
    setEditingField(null);
  };

  const updateEditingField = (field: keyof Customer, value: any) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
  };

  // Inline editing - start editing a specific field
  const startInlineEdit = (customer: Customer, field: string) => {
    setEditingRowId(customer.id);
    setEditingData({ ...customer });
    setEditingField(field);
  };

  const saveInlineEdit = () => {
    if (editingRowId && editingData) {
      const customer = customers.find(c => c.id === editingRowId);
      if (customer) {
        updateCustomerMutation.mutate({ ...customer, ...editingData });
      }
    }
    setEditingRowId(null);
    setEditingData({});
    setEditingField(null);
  };

  const isAdmin = (user as any)?.role === 'admin';

  if (selectedCustomer) {
    return (
      <>
        <ClientDetailView
          customer={selectedCustomer}
          companyContacts={selectedCompanyContacts}
          onBack={() => { setSelectedCustomer(null); setSelectedCompanyContacts([]); }}
          onEdit={(customer) => {
            handleEditCustomer(customer);
          }}
          onDelete={(customerId) => {
            deleteCustomerMutation.mutate(customerId);
            setSelectedCustomer(null);
            setSelectedCompanyContacts([]);
          }}
        />
        {/* Edit Dialog - needs to be here so it renders when in detail view */}
        <Dialog open={isEditDialogOpen} onOpenChange={() => {
          setIsEditDialogOpen(false);
          setEditingCustomer(null);
        }}>
          <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Client</DialogTitle>
              <DialogDescription>Update the client information below.</DialogDescription>
            </DialogHeader>
            
            {editingCustomer && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="editCustomerId">Client ID</Label>
                  <Input id="editCustomerId" value={editingCustomer.id} disabled />
                </div>
                <div>
                  <Label htmlFor="editFirstName">First Name</Label>
                  <Input
                    id="editFirstName"
                    value={editingCustomer.firstName || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, firstName: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editLastName">Last Name</Label>
                  <Input
                    id="editLastName"
                    value={editingCustomer.lastName || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, lastName: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editEmail">Email</Label>
                  <Input
                    id="editEmail"
                    type="email"
                    value={editingCustomer.email || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, email: e.target.value} : null)}
                  />
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="editCompany">Company</Label>
                  <Input
                    id="editCompany"
                    value={editingCustomer.company || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, company: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editPhone">Phone</Label>
                  <Input
                    id="editPhone"
                    value={editingCustomer.phone || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, phone: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editCity">City</Label>
                  <Input
                    id="editCity"
                    value={editingCustomer.city || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, city: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editProvince">Province/State</Label>
                  <Input
                    id="editProvince"
                    value={editingCustomer.province || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, province: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editCountry">Country</Label>
                  <Input
                    id="editCountry"
                    value={editingCustomer.country || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, country: e.target.value} : null)}
                  />
                </div>
                <div>
                  <Label htmlFor="editAddress1">Address</Label>
                  <Input
                    id="editAddress1"
                    value={editingCustomer.address1 || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, address1: e.target.value} : null)}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editTaxExempt"
                    checked={editingCustomer.taxExempt || false}
                    onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, taxExempt: !!checked} : null)}
                  />
                  <Label htmlFor="editTaxExempt">Tax Exempt</Label>
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="editEmailMarketing"
                    checked={editingCustomer.acceptsEmailMarketing || false}
                    onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, acceptsEmailMarketing: !!checked} : null)}
                  />
                  <Label htmlFor="editEmailMarketing">Accepts Email Marketing</Label>
                </div>
                <div className="md:col-span-2">
                  <Label htmlFor="editNote">Notes</Label>
                  <Textarea
                    id="editNote"
                    value={editingCustomer.note || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, note: e.target.value} : null)}
                    rows={3}
                  />
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => {
                setIsEditDialogOpen(false);
                setEditingCustomer(null);
              }}>
                Cancel
              </Button>
              <Button onClick={() => {
                if (editingCustomer) {
                  updateCustomerMutation.mutate(editingCustomer);
                  setIsEditDialogOpen(false);
                  // Update the selected customer view with new data
                  setSelectedCustomer(editingCustomer);
                }
              }}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="heading-lg text-gray-900 flex items-center gap-3">
            <Building2 className="h-8 w-8 text-primary" />
            Client Database
          </h1>
          <p className="body-base text-gray-600 mt-1">
            Manage your client information and contacts
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setViewMode(viewMode === 'cards' ? 'table' : 'cards')} variant="outline" data-testid="button-toggle-view">
            {viewMode === 'cards' ? <List className="h-4 w-4 mr-2" /> : <Grid3X3 className="h-4 w-4 mr-2" />}
            {viewMode === 'cards' ? 'Table View' : 'Card View'}
          </Button>
          {isAdmin && (
            <>
              <Button onClick={() => setShowUploadDialog(true)} variant="outline" data-testid="button-upload-shopify">
                <Upload className="h-4 w-4 mr-2" />
                Import from Shopify
              </Button>
              <Button onClick={() => setShowOdooUploadDialog(true)} variant="outline" data-testid="button-upload-odoo">
                <Upload className="h-4 w-4 mr-2" />
                Import from Odoo
              </Button>
            </>
          )}
          <Button 
            onClick={() => {
              if (selectedForMerge.size > 0) {
                setSelectedForMerge(new Set());
              } else {
                toast({
                  title: "Merge Mode",
                  description: "Select 2 clients from the list to merge them together",
                });
              }
            }} 
            variant={selectedForMerge.size > 0 ? "secondary" : "outline"}
            data-testid="button-merge-mode"
          >
            <GitMerge className="h-4 w-4 mr-2" />
            {selectedForMerge.size > 0 ? `Merging (${selectedForMerge.size}/2)` : 'Merge Clients'}
          </Button>
          <Button onClick={handleCreateCustomer} data-testid="button-create-client">
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Data Health Score & Coaching Section */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {/* Data Health Gauge */}
        <Card className="glass-card border-0 lg:col-span-1">
          <CardContent className="p-4">
            <div className="flex flex-col items-center">
              <p className="text-xs font-medium text-gray-500 mb-2">Database Health</p>
              <div className="relative w-24 h-24">
                <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 100 100">
                  <circle cx="50" cy="50" r="40" stroke="#e5e7eb" strokeWidth="12" fill="none" />
                  <circle 
                    cx="50" cy="50" r="40" 
                    stroke={(() => {
                      const cleanCount = groupedByCompany.filter(g => !g.customers.some(c => hasIncompleteEmail(c.email))).length;
                      const pct = groupedByCompany.length > 0 ? Math.round((cleanCount / groupedByCompany.length) * 100) : 100;
                      return pct >= 80 ? '#22c55e' : pct >= 50 ? '#f59e0b' : '#ef4444';
                    })()}
                    strokeWidth="12" 
                    fill="none"
                    strokeLinecap="round"
                    strokeDasharray={`${(() => {
                      const cleanCount = groupedByCompany.filter(g => !g.customers.some(c => hasIncompleteEmail(c.email))).length;
                      return groupedByCompany.length > 0 ? Math.round((cleanCount / groupedByCompany.length) * 251.2) : 251.2;
                    })()} 251.2`}
                  />
                </svg>
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="text-xl font-bold text-gray-900">
                    {groupedByCompany.length > 0 
                      ? Math.round((groupedByCompany.filter(g => !g.customers.some(c => hasIncompleteEmail(c.email))).length / groupedByCompany.length) * 100)
                      : 100}%
                  </span>
                </div>
              </div>
              <p className="text-[10px] text-gray-500 mt-1 text-center">Clean records improve sales</p>
            </div>
          </CardContent>
        </Card>

        {/* Stats Cards Grid */}
        <div className="lg:col-span-3 grid grid-cols-2 md:grid-cols-5 gap-3">
          {/* Total Clients */}
          <Card className="glass-card border-0">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium text-gray-500">Total Clients</p>
                  <p className="text-2xl font-bold text-gray-900">{customers.length}</p>
                </div>
                <div className="h-9 w-9 rounded-full bg-blue-50 flex items-center justify-center">
                  <Users className="h-4 w-4 text-blue-500" />
                </div>
              </div>
              <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100">
                <p className="text-xs font-medium text-gray-500">Florida</p>
                <p className="text-sm font-semibold text-blue-600" data-testid="florida-count">
                  {customers.filter(c => c.province?.toUpperCase() === 'FL' || c.province?.toLowerCase() === 'florida').length}
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Mailers & SwatchBooks Split Card */}
          <Card className="glass-card border-0">
            <CardContent className="p-0">
              {/* Mailers (Top) */}
              <div className="p-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">Mailers Sent</p>
                    <p className="text-xl font-bold text-orange-600">{pressKitShipments.length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-orange-50 flex items-center justify-center">
                    <Mail className="h-3.5 w-3.5 text-orange-500" />
                  </div>
                </div>
              </div>
              {/* SwatchBooks (Bottom) */}
              <div className="p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[10px] font-medium text-gray-400 uppercase tracking-wide">SwatchBooks</p>
                    <p className="text-xl font-bold text-purple-600">{swatchBookShipments.length}</p>
                  </div>
                  <div className="h-7 w-7 rounded-full bg-purple-50 flex items-center justify-center">
                    <BookOpen className="h-3.5 w-3.5 text-purple-500" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Samples Sent with Weekly Goal */}
          <Card 
            className={`glass-card border-0 cursor-pointer transition-all hover:shadow-md ${showSamplesFilter ? 'ring-2 ring-green-500' : ''}`}
            onClick={() => setShowSamplesFilter(!showSamplesFilter)}
            data-testid="card-samples-sent"
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-500">Samples This Week</p>
                <Package className="h-4 w-4 text-green-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">{samplesThisWeek}</span>
                <span className="text-sm text-gray-400">/ 10</span>
              </div>
              <Progress value={Math.min((samplesThisWeek / 10) * 100, 100)} className="h-1.5 mt-2" />
              {samplesThisWeek === 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[10px] text-green-600 mt-1 cursor-help underline decoration-dotted">Pro tip: Send samples</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Click any client, then use "Log Sample" to track samples sent. Samples help build trust!</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardContent>
          </Card>

          {/* Quotes Sent with Weekly Goal */}
          <Card className="glass-card border-0">
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-500">Quotes This Week</p>
                <FileText className="h-4 w-4 text-purple-500" />
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-2xl font-bold text-gray-900">{quotesThisWeek}</span>
                <span className="text-sm text-gray-400">/ 15</span>
              </div>
              <Progress value={Math.min((quotesThisWeek / 15) * 100, 100)} className="h-1.5 mt-2" />
              {quotesThisWeek === 0 && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <p className="text-[10px] text-purple-600 mt-1 cursor-help underline decoration-dotted">Pro tip: Send quotes</p>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      <p>Go to QuickQuotes to create and send professional quotes to customers.</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </CardContent>
          </Card>

          {/* Needs Cleanup with Fix Now Button */}
          <Card 
            className={`glass-card border-0 transition-all ${showDataCleanupFilter ? 'ring-2 ring-amber-500' : ''}`}
            data-testid="card-data-cleanup"
          >
            <CardContent className="p-3">
              <div className="flex items-center justify-between mb-1">
                <p className="text-xs font-medium text-gray-500">Needs Cleanup</p>
                <AlertTriangle className="h-4 w-4 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-amber-600">
                {groupedByCompany.filter(g => g.customers.some(c => hasIncompleteEmail(c.email))).length}
              </p>
              <Button 
                size="sm" 
                variant={showDataCleanupFilter ? "secondary" : "default"}
                className={`w-full mt-2 h-7 text-xs ${!showDataCleanupFilter ? 'bg-amber-500 hover:bg-amber-600' : ''}`}
                onClick={(e) => { e.stopPropagation(); setShowDataCleanupFilter(!showDataCleanupFilter); }}
                data-testid="button-fix-now"
              >
                {showDataCleanupFilter ? 'Show All' : 'Fix Now'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Filter Presets Row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-medium text-gray-500">Quick Filters:</span>
        <Button 
          size="sm" 
          variant={filters.source === 'shopify' ? 'default' : 'outline'} 
          className="h-7 text-xs gap-1.5"
          onClick={() => setFilters({...filters, source: filters.source === 'shopify' ? 'all' : 'shopify'})}
        >
          <SiShopify className="h-3.5 w-3.5" /> Shopify
        </Button>
        <Button 
          size="sm" 
          variant={filters.source === 'odoo' ? 'default' : 'outline'} 
          className="h-7 text-xs gap-1.5"
          onClick={() => setFilters({...filters, source: filters.source === 'odoo' ? 'all' : 'odoo'})}
        >
          <SiOdoo className="h-3.5 w-3.5" /> Odoo
        </Button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <Button 
          size="sm" 
          variant={showSamplesFilter ? 'default' : 'outline'} 
          className="h-7 text-xs"
          onClick={() => setShowSamplesFilter(!showSamplesFilter)}
        >
          Has Samples
        </Button>
        <Button 
          size="sm" 
          variant={missingDataFilters.noEmail ? 'default' : 'outline'} 
          className="h-7 text-xs"
          onClick={() => setMissingDataFilters({...missingDataFilters, noEmail: !missingDataFilters.noEmail})}
        >
          No Email
        </Button>
        <Button 
          size="sm" 
          variant={missingDataFilters.noPhone ? 'default' : 'outline'} 
          className="h-7 text-xs"
          onClick={() => setMissingDataFilters({...missingDataFilters, noPhone: !missingDataFilters.noPhone})}
        >
          No Phone
        </Button>
        <div className="w-px h-5 bg-gray-200 mx-1" />
        <Select value={filters.province || "all"} onValueChange={(val) => setFilters({...filters, province: val === "all" ? "" : val})}>
          <SelectTrigger className="h-7 w-[130px] text-xs" data-testid="select-state-filter">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {Array.from(new Set(customers.map(c => c.province).filter(Boolean))).sort().map(state => (
              <SelectItem key={state} value={state!}>{state}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        {(filters.source !== 'all' || showSamplesFilter || filters.province || Object.values(missingDataFilters).some(Boolean)) && (
          <Button 
            size="sm" 
            variant="ghost" 
            className="h-7 text-xs text-gray-500"
            onClick={() => { 
              setFilters({...filters, source: 'all', province: ''}); 
              setShowSamplesFilter(false); 
              setMissingDataFilters({noEmail: false, noPhone: false, noTags: false, noCompany: false}); 
            }}
          >
            <X className="h-3 w-3 mr-1" /> Clear
          </Button>
        )}
      </div>

      {/* Search Bar with Recent Searches */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          ref={searchInputRef}
          placeholder="Search clients by name, email, company... (fuzzy match enabled)"
          value={searchTerm}
          onChange={(e) => { 
            setSearchTerm(e.target.value);
            if (e.target.value && selectedLetter) {
              setSelectedLetter(null);
            }
          }}
          onFocus={() => recentSearches.length > 0 && setShowRecentSearches(true)}
          onBlur={() => setTimeout(() => setShowRecentSearches(false), 200)}
          onKeyDown={(e) => e.key === 'Enter' && handleSearchSubmit()}
          className="pl-12 pr-24 h-12 text-base bg-white/80 backdrop-blur-sm border border-gray-200 focus:border-primary/50 rounded-xl shadow-sm"
          data-testid="input-client-search"
        />
        {searchTerm ? (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => { setSearchTerm(""); addRecentSearch(searchTerm); }}
            className="absolute right-3 top-1/2 transform -translate-y-1/2 h-8 px-3 text-gray-500"
          >
            <X className="h-4 w-4 mr-1" /> Clear
          </Button>
        ) : (
          <div className="absolute right-3 top-1/2 transform -translate-y-1/2 flex gap-2">
            <Button onClick={() => setShowFilters(!showFilters)} variant="ghost" size="sm" className="h-8 px-2" data-testid="button-filters">
              <Filter className="h-4 w-4" />
            </Button>
            <Button onClick={() => refetch()} variant="ghost" size="sm" className="h-8 px-2" data-testid="button-refresh">
              <RefreshCw className="h-4 w-4" />
            </Button>
          </div>
        )}
        
        {/* Recent Searches Dropdown */}
        {showRecentSearches && recentSearches.length > 0 && (
          <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-lg shadow-lg z-50">
            <div className="p-2">
              <p className="text-xs text-gray-500 px-2 pb-2 flex items-center gap-1">
                <Clock className="h-3 w-3" /> Recent Searches
              </p>
              {recentSearches.map((term, i) => (
                <button
                  key={i}
                  onClick={() => selectRecentSearch(term)}
                  className="w-full text-left px-3 py-2 text-sm hover:bg-gray-100 rounded-md flex items-center gap-2"
                >
                  <Search className="h-3 w-3 text-gray-400" />
                  {term}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Filters Panel */}
      <Card className={`glass-card border-0 ${!showFilters ? 'hidden' : ''}`}>
        <CardContent className="py-4">

          {showFilters && (
            <div className="mt-4 space-y-4 p-4 bg-gray-50/50 rounded-lg">
              {/* Missing Data Filters - Preset Checkboxes */}
              <div className="pb-4 border-b border-gray-200">
                <Label className="text-sm font-semibold text-gray-700 mb-3 block">Find Customers Missing Data</Label>
                <div className="flex flex-wrap gap-4">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="no-email"
                      checked={missingDataFilters.noEmail}
                      onCheckedChange={(checked) => setMissingDataFilters({...missingDataFilters, noEmail: !!checked})}
                      data-testid="checkbox-no-email"
                    />
                    <label htmlFor="no-email" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1">
                      <Mail className="h-4 w-4 text-gray-400" />
                      No Email
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="no-phone"
                      checked={missingDataFilters.noPhone}
                      onCheckedChange={(checked) => setMissingDataFilters({...missingDataFilters, noPhone: !!checked})}
                      data-testid="checkbox-no-phone"
                    />
                    <label htmlFor="no-phone" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1">
                      <Phone className="h-4 w-4 text-gray-400" />
                      No Phone
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="no-tags"
                      checked={missingDataFilters.noTags}
                      onCheckedChange={(checked) => setMissingDataFilters({...missingDataFilters, noTags: !!checked})}
                      data-testid="checkbox-no-tags"
                    />
                    <label htmlFor="no-tags" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1">
                      <FileText className="h-4 w-4 text-gray-400" />
                      No Tags
                    </label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="no-company"
                      checked={missingDataFilters.noCompany}
                      onCheckedChange={(checked) => setMissingDataFilters({...missingDataFilters, noCompany: !!checked})}
                      data-testid="checkbox-no-company"
                    />
                    <label htmlFor="no-company" className="text-sm font-medium text-gray-700 cursor-pointer flex items-center gap-1">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      No Company
                    </label>
                  </div>
                </div>
              </div>

              {/* Advanced Filters Row */}
              <div className="pb-4 border-b border-gray-200">
                <Label className="text-sm font-semibold text-gray-700 mb-3 block">Advanced Filters</Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label className="text-xs text-gray-500">Source</Label>
                    <Select value={filters.source} onValueChange={(val) => setFilters({...filters, source: val})}>
                      <SelectTrigger data-testid="select-source">
                        <SelectValue placeholder="All Sources" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Sources</SelectItem>
                        <SelectItem value="shopify">
                          <span className="flex items-center gap-2"><SiShopify className="h-3 w-3 text-green-600" /> Shopify</span>
                        </SelectItem>
                        <SelectItem value="odoo">
                          <span className="flex items-center gap-2"><SiOdoo className="h-3 w-3 text-purple-600" /> Odoo</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-xs text-gray-500">Client Value (Quotes)</Label>
                    <Select value={filters.clientValue} onValueChange={(val) => setFilters({...filters, clientValue: val})}>
                      <SelectTrigger data-testid="select-client-value">
                        <SelectValue placeholder="All Values" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Values</SelectItem>
                        <SelectItem value="high">
                          <span className="flex items-center gap-2"><TrendingUp className="h-3 w-3 text-green-600" /> High (5+ quotes)</span>
                        </SelectItem>
                        <SelectItem value="medium">
                          <span className="flex items-center gap-2"><TrendingUp className="h-3 w-3 text-yellow-600" /> Medium (1-4 quotes)</span>
                        </SelectItem>
                        <SelectItem value="low">
                          <span className="flex items-center gap-2"><TrendingUp className="h-3 w-3 text-gray-400" /> Low (0 quotes)</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              {/* Location and Other Filters */}
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    placeholder="Filter by city"
                    value={filters.city}
                    onChange={(e) => setFilters({...filters, city: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Province</Label>
                  <Input
                    placeholder="Filter by province"
                    value={filters.province}
                    onChange={(e) => setFilters({...filters, province: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Input
                    placeholder="Filter by country"
                    value={filters.country}
                    onChange={(e) => setFilters({...filters, country: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Tax Exempt</Label>
                  <select
                    value={filters.taxExempt}
                    onChange={(e) => setFilters({...filters, taxExempt: e.target.value})}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                  >
                    <option value="all">All</option>
                    <option value="yes">Yes</option>
                    <option value="no">No</option>
                  </select>
                </div>
                <div>
                  <Label>Email Marketing</Label>
                  <select
                    value={filters.emailMarketing}
                    onChange={(e) => setFilters({...filters, emailMarketing: e.target.value})}
                    className="w-full h-10 px-3 rounded-md border border-gray-200"
                  >
                    <option value="all">All</option>
                    <option value="yes">Accepts</option>
                    <option value="no">Declines</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Alphabet Index - Muted */}
      <div className="flex items-center gap-0.5 flex-wrap justify-center py-2 px-4 bg-gray-50/50 rounded-lg">
        <button
          onClick={() => setSelectedLetter(null)}
          className={`h-7 px-3 text-xs font-medium rounded transition-colors ${
            selectedLetter === null || selectedLetter === 'All' 
              ? 'bg-gray-200 text-gray-700' 
              : 'text-gray-500 hover:bg-gray-100'
          }`}
          data-testid="button-letter-all"
        >
          All
        </button>
        
        {alphabet.map((letter) => {
          const count = letterCounts[letter] || 0;
          const hasClients = count > 0;
          const isSelected = selectedLetter === letter;
          
          return (
            <button
              key={letter}
              onClick={() => hasClients && setSelectedLetter(letter)}
              disabled={!hasClients}
              className={`h-7 w-7 text-xs font-medium rounded transition-colors ${
                isSelected 
                  ? 'bg-gray-200 text-gray-700' 
                  : hasClients 
                    ? 'text-gray-500 hover:bg-gray-100' 
                    : 'text-gray-300 cursor-not-allowed'
              }`}
              title={hasClients ? `${count} clients` : 'No clients'}
              data-testid={`button-letter-${letter}`}
            >
              {letter}
            </button>
          );
        })}
        
        <button
          onClick={() => (letterCounts['#'] || 0) > 0 && setSelectedLetter('#')}
          disabled={!(letterCounts['#'] || 0)}
          className={`h-7 w-7 text-xs font-medium rounded transition-colors ${
            selectedLetter === '#' 
              ? 'bg-gray-200 text-gray-700' 
              : (letterCounts['#'] || 0) > 0 
                ? 'text-gray-500 hover:bg-gray-100' 
                : 'text-gray-300 cursor-not-allowed'
          }`}
          title={`${letterCounts['#'] || 0} clients starting with numbers/symbols`}
          data-testid="button-letter-hash"
        >
          #
        </button>
        
        {selectedLetter && selectedLetter !== 'All' && (
          <button 
            onClick={() => setSelectedLetter(null)}
            className="ml-2 h-7 px-2 text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
          >
            <X className="h-3 w-3" /> Clear
          </button>
        )}
      </div>

      {/* Bulk Actions Toolbar */}
      {bulkSelected.size > 0 && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-blue-700">
              {bulkSelected.size} client{bulkSelected.size > 1 ? 's' : ''} selected
            </span>
            <Button onClick={clearBulkSelection} variant="ghost" size="sm" className="text-blue-600">
              <X className="h-3 w-3 mr-1" /> Clear
            </Button>
          </div>
          <div className="flex items-center gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" className="gap-1" data-testid="button-bulk-email">
                    <Mail className="h-3 w-3" /> Email
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Send email to selected clients</TooltipContent>
              </Tooltip>
            </TooltipProvider>
            {bulkSelected.size === 2 && isAdmin && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      size="sm" 
                      className="gap-1 bg-blue-600 hover:bg-blue-700 text-white"
                      onClick={() => {
                        setSelectedForMerge(new Set(bulkSelected));
                        setShowMergeDialog(true);
                      }}
                      data-testid="button-bulk-merge"
                    >
                      <GitMerge className="h-3 w-3" /> Merge
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Merge selected clients into one record</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
            {isAdmin && (
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      className="gap-1"
                      onClick={handleBulkDelete}
                      data-testid="button-bulk-delete"
                    >
                      <Trash2 className="h-3 w-3" /> Delete
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>Delete selected clients</TooltipContent>
                </Tooltip>
              </TooltipProvider>
            )}
          </div>
        </div>
      )}

      {/* Client List */}
      <Card className="glass-card border-0">
        <CardHeader className="sticky top-0 z-10 bg-white/95 backdrop-blur-sm border-b">
          <div className="flex items-center justify-between">
            <CardTitle className="heading-sm">
              {filteredCompanies.length} {filteredCompanies.length === 1 ? 'Company' : 'Companies'}
              <span className="text-gray-400 font-normal ml-2">({customers.length} contacts)</span>
              {selectedLetter && selectedLetter !== 'All' && (
                <span className="text-gray-500 font-normal ml-2">
                  starting with "{selectedLetter}"
                </span>
              )}
              {showSamplesFilter && (
                <Badge variant="secondary" className="ml-2 text-green-700 bg-green-100">
                  Samples Filter Active
                </Badge>
              )}
            </CardTitle>
            <div className="flex items-center gap-2">
              {/* View Toggle Buttons */}
              <div className="flex bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode('table')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'table' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid="button-view-table"
                >
                  <List className="h-3.5 w-3.5 inline mr-1" />
                  Table
                </button>
                <button
                  onClick={() => setViewMode('cards')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'cards' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid="button-view-cards"
                >
                  <Grid3X3 className="h-3.5 w-3.5 inline mr-1" />
                  Cards
                </button>
                <button
                  onClick={() => setViewMode('kanban')}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
                    viewMode === 'kanban' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500 hover:text-gray-700'
                  }`}
                  data-testid="button-view-kanban"
                >
                  <Users className="h-3.5 w-3.5 inline mr-1" />
                  Kanban
                </button>
              </div>
              {selectedForMerge.size > 0 && (
                <div className="flex items-center gap-2 bg-blue-50 px-3 py-1.5 rounded-lg">
                  <span className="text-xs text-blue-700">{selectedForMerge.size}/2 selected</span>
                  {selectedForMerge.size === 2 && (
                    <Button 
                      onClick={() => setShowMergeDialog(true)} 
                      size="sm" 
                      className="h-7 bg-blue-600 hover:bg-blue-700"
                      data-testid="button-merge-clients"
                    >
                      Merge
                    </Button>
                  )}
                  <Button 
                    onClick={() => setSelectedForMerge(new Set())} 
                    size="sm" 
                    variant="ghost" 
                    className="h-7 text-blue-600"
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              )}
              {(searchTerm || selectedLetter || showSamplesFilter || showDataCleanupFilter || Object.values(filters).some(f => f && f !== "all")) && (
                <Button onClick={() => { clearFilters(); setSelectedLetter(null); }} variant="outline" size="sm">
                  Clear All Filters
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading clients...</p>
            </div>
          ) : filteredCompanies.length === 0 ? (
            <div className="text-center py-12">
              <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600 mb-4">No clients found</p>
              {(searchTerm || Object.values(filters).some(f => f && f !== "all")) ? (
                <Button onClick={clearFilters} variant="outline">
                  Clear Filters
                </Button>
              ) : (
                <Button onClick={handleCreateCustomer}>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Client
                </Button>
              )}
            </div>
          ) : viewMode === 'table' ? (
            /* TABLE VIEW - Grouped by Company with Sticky Header */
            <div className="max-h-[600px] overflow-y-auto">
              {/* Sticky Table Header */}
              <div className="sticky top-0 z-10 bg-gray-100 border-b border-gray-200 px-2 py-2 flex items-center gap-2 text-xs font-medium text-gray-600">
                <Checkbox 
                  checked={bulkSelected.size === filteredCompanies.length && filteredCompanies.length > 0}
                  onCheckedChange={(checked) => checked ? selectAllVisible() : clearBulkSelection()}
                  className="h-4 w-4"
                  data-testid="checkbox-select-all"
                />
                <div className="w-5" />
                <span className="flex-1 min-w-[200px]">Company</span>
                <span className="w-28 text-left hidden md:block">Source</span>
                <span className="w-16 text-center hidden lg:block">Quotes</span>
                <span className="w-14 text-center hidden lg:block">Swatch</span>
                <span className="w-14 text-center hidden lg:block">Kit</span>
                <span className="w-14 text-center hidden lg:block">Mailer</span>
                <span className="w-44 hidden lg:block">Email</span>
                <span className="w-28 text-right">Quick Actions</span>
              </div>
              
              <div className="divide-y divide-gray-100">
                {filteredCompanies.map((group) => {
                  const isExpanded = expandedCompanies.has(group.groupKey);
                  const hasMultiplePeople = group.customers.length > 1;
                  const primary = group.primaryCustomer;
                  const totalQuotes = getCompanyQuoteCount(group);
                  const totalSamples = group.customers.reduce((sum, c) => sum + getSampleCount(c.id), 0);
                  const isBulkSelected = bulkSelected.has(primary.id);
                  const isInlineEditing = editingRowId === primary.id;
                  const needsDataCleanup = hasIncompleteEmail(primary.email);
                  
                  return (
                    <div key={group.groupKey} data-testid={`company-group-${primary.id}`}>
                      {/* Company Row with Hover Highlighting */}
                      <div 
                        className={`group flex items-center justify-between py-2.5 px-2 text-sm cursor-pointer transition-colors
                          ${isBulkSelected ? 'bg-blue-50 border-l-2 border-blue-400' : ''}
                          ${selectedForMerge.has(primary.id) ? 'bg-purple-50' : ''}
                          ${needsDataCleanup ? 'bg-amber-50/50 border-l-2 border-amber-400' : ''}
                          hover:bg-gray-50`}
                        onClick={() => hasMultiplePeople && toggleCompanyExpansion(group.groupKey)}
                      >
                        <div className="flex items-center gap-2 flex-1 min-w-0">
                          <Checkbox 
                            checked={isBulkSelected}
                            onCheckedChange={() => toggleBulkSelection(primary.id)}
                            onClick={(e) => e.stopPropagation()}
                            className="h-4 w-4"
                            data-testid={`checkbox-bulk-${primary.id}`}
                          />
                          {hasMultiplePeople ? (
                            <button className="p-0.5 hover:bg-gray-200 rounded">
                              {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                            </button>
                          ) : (
                            <div className="w-5" />
                          )}
                          <Building2 className="h-4 w-4 text-gray-400" />
                          <span 
                            className="font-medium text-gray-900 truncate min-w-[180px] hover:text-blue-600 hover:underline cursor-pointer"
                            onClick={(e) => { e.stopPropagation(); setSelectedCustomer(primary); setSelectedCompanyContacts(group.customers); }}
                            data-testid={`link-client-${primary.id}`}
                          >
                            {group.companyName}
                          </span>
                          {!hasAddress(primary) && primary.company && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-5 w-5 p-0 ml-1"
                                    onClick={(e) => { e.stopPropagation(); searchCompanyAddress(primary.company || group.companyName, primary.city); }}
                                    data-testid={`button-search-address-${primary.id}`}
                                  >
                                    <ExternalLink className="h-3 w-3 text-orange-500 hover:text-orange-700" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Search address on Google Maps</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          {hasMultiplePeople && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {group.customers.length} people
                            </Badge>
                          )}
                        </div>
                        
                        {/* Source badges - Left-aligned */}
                        <div className="w-28 flex items-center justify-start gap-1 hidden md:flex flex-wrap">
                          {primary.sources?.includes('shopify') && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-100 text-green-700 border border-green-200">
                              <SiShopify className="h-3 w-3" /> Shopify
                            </span>
                          )}
                          {primary.sources?.includes('odoo') && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-purple-100 text-purple-700 border border-purple-200">
                              <SiOdoo className="h-3 w-3" /> Odoo
                            </span>
                          )}
                          {!primary.sources?.length && (
                            <span className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-500">
                              Manual
                            </span>
                          )}
                        </div>
                        
                        {/* Quote/Sample counts - Improved Pills */}
                        <div className="w-16 flex items-center justify-center gap-1 hidden lg:flex">
                          {totalQuotes > 0 ? (
                            <span className="bg-blue-100 text-blue-700 text-[10px] font-semibold px-1.5 py-0.5 rounded-full border border-blue-200">{totalQuotes}</span>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </div>

                        {/* Swatch Book */}
                        <div className="w-14 flex items-center justify-center hidden lg:flex">
                          {hasSwatchBook(primary.id) ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-purple-100 text-purple-700 border border-purple-200">
                              <BookOpen className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </div>

                        {/* Press Kit */}
                        <div className="w-14 flex items-center justify-center hidden lg:flex">
                          {hasPressKit(primary.id) ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-orange-100 text-orange-700 border border-orange-200">
                              <Printer className="h-3 w-3" />
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </div>

                        {/* Mailer Sent */}
                        <div className="w-14 flex items-center justify-center hidden lg:flex">
                          {getMailerCount(primary.id) > 0 ? (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] bg-pink-100 text-pink-700 border border-pink-200 font-medium">
                              <Mail className="h-3 w-3" /> {getMailerCount(primary.id)}
                            </span>
                          ) : (
                            <span className="text-gray-300 text-[10px]">-</span>
                          )}
                        </div>
                        
                        {/* Inline editable email */}
                        <div className="w-48 hidden lg:block" onClick={(e) => e.stopPropagation()}>
                          {isInlineEditing && editingField === 'email' ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingData.email || ''}
                                onChange={(e) => updateEditingField('email', e.target.value)}
                                className="h-6 text-xs"
                                autoFocus
                                onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                              />
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={saveInlineEdit}>
                                <Save className="h-3 w-3 text-green-600" />
                              </Button>
                              <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={cancelEdit}>
                                <X className="h-3 w-3 text-red-500" />
                              </Button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1">
                              <span 
                                className="text-gray-400 text-xs truncate cursor-text hover:text-gray-600 flex-1"
                                onDoubleClick={() => startInlineEdit(primary, 'email')}
                                title="Double-click to edit"
                              >
                                {primary.email || <span className="italic text-gray-300">No email</span>}
                              </span>
                              {primary.email && (
                                <EmailLaunchIcon
                                  email={primary.email}
                                  customerId={primary.id}
                                  customerName={primary.company || `${primary.firstName || ''} ${primary.lastName || ''}`.trim() || primary.email}
                                  variables={{
                                    'client.firstName': primary.firstName || '',
                                    'client.lastName': primary.lastName || '',
                                    'client.company': primary.company || '',
                                  }}
                                />
                              )}
                            </div>
                          )}
                        </div>
                        
                        {/* Quick Actions (appear on hover) */}
                        <div className="w-28 flex items-center justify-end gap-0.5" onClick={(e) => e.stopPropagation()}>
                          {/* Quick Action Icons - visible on hover */}
                          <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 hover:bg-blue-50"
                                    onClick={() => { setSelectedCustomer(primary); setSelectedCompanyContacts(group.customers); }}
                                  >
                                    <Eye className="h-3.5 w-3.5 text-blue-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">View Details</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 hover:bg-purple-50"
                                    onClick={() => window.location.href = `/quick-quotes?customerId=${primary.id}`}
                                  >
                                    <FileText className="h-3.5 w-3.5 text-purple-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Send Quote</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            <TooltipProvider delayDuration={200}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    variant="ghost" 
                                    size="sm" 
                                    className="h-7 w-7 p-0 hover:bg-green-50"
                                    onClick={() => { setSelectedCustomer(primary); setSelectedCompanyContacts(group.customers); }}
                                  >
                                    <Package className="h-3.5 w-3.5 text-green-500" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent side="top">Log Sample</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                            {needsDataCleanup && (
                              <TooltipProvider delayDuration={200}>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button 
                                      variant="ghost" 
                                      size="sm" 
                                      className="h-7 w-7 p-0 hover:bg-amber-50"
                                      onClick={() => startInlineEdit(primary, 'email')}
                                    >
                                      <AlertTriangle className="h-3.5 w-3.5 text-amber-500" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent side="top">Fix Email</TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            )}
                          </div>
                          
                          {/* More Actions Dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => { setSelectedCustomer(primary); setSelectedCompanyContacts(group.customers); }}>
                                <Eye className="h-4 w-4 mr-2" /> View Details
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => handleEditCustomer(primary)}>
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => startInlineEdit(primary, 'email')}>
                                <Mail className="h-4 w-4 mr-2" /> Edit Email
                              </DropdownMenuItem>
                              {hasAddress(primary) && (
                                <DropdownMenuItem onClick={() => printAddressLabel(primary)}>
                                  <Printer className="h-4 w-4 mr-2" /> Print Address Label
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => toggleMergeSelection(primary.id)} disabled={selectedForMerge.size >= 2 && !selectedForMerge.has(primary.id)}>
                                <Users className="h-4 w-4 mr-2" /> Select for Merge
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem onClick={() => handleDeleteCustomer(primary.id)} className="text-red-600">
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                          {hasAddress(primary) && (
                            <TooltipProvider>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button 
                                    onClick={() => printAddressLabel(primary)}
                                    size="sm" 
                                    variant="ghost" 
                                    className="h-7 w-7 p-0"
                                    data-testid={`button-print-label-${primary.id}`}
                                  >
                                    <Printer className="h-3.5 w-3.5 text-blue-500 hover:text-blue-700" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Print Address Label (4x2")</TooltipContent>
                              </Tooltip>
                            </TooltipProvider>
                          )}
                          <Button 
                            onClick={() => { setSelectedCustomer(primary); setSelectedCompanyContacts(group.customers); }} 
                            size="sm" 
                            variant="ghost" 
                            className="h-7 px-2 text-xs"
                          >
                            View
                          </Button>
                        </div>
                      </div>
                      
                      {/* Expanded People List */}
                      {isExpanded && hasMultiplePeople && (
                        <div className="bg-gray-50/50 border-l-2 border-gray-200 ml-8 mb-2">
                          {group.customers.map((customer) => {
                            const isCustomerEditing = editingRowId === customer.id;
                            return (
                              <div 
                                key={customer.id}
                                className="group flex items-center justify-between py-2 px-3 hover:bg-gray-100/50 text-sm border-b border-gray-100 last:border-0"
                                data-testid={`person-row-${customer.id}`}
                              >
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                  <Checkbox 
                                    checked={bulkSelected.has(customer.id)}
                                    onCheckedChange={() => toggleBulkSelection(customer.id)}
                                    className="h-3 w-3"
                                  />
                                  <Users className="h-3.5 w-3.5 text-gray-400" />
                                  <span className="text-gray-700">
                                    {customer.firstName || customer.lastName 
                                      ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                                      : customer.email || 'Contact'}
                                  </span>
                                  {isCustomerEditing && editingField === 'email' ? (
                                    <div className="flex items-center gap-1">
                                      <Input
                                        value={editingData.email || ''}
                                        onChange={(e) => updateEditingField('email', e.target.value)}
                                        className="h-5 text-xs w-40"
                                        autoFocus
                                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                                      />
                                      <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={saveInlineEdit}>
                                        <Save className="h-2.5 w-2.5 text-green-600" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <span 
                                      className="text-gray-400 text-xs truncate cursor-text hover:text-gray-600"
                                      onDoubleClick={() => startInlineEdit(customer, 'email')}
                                      title="Double-click to edit"
                                    >
                                      {customer.email}
                                    </span>
                                  )}
                                  {customer.phone && (
                                    <span className="text-gray-400 text-xs hidden lg:block">• {customer.phone}</span>
                                  )}
                                </div>
                                <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                                  {hasAddress(customer) && (
                                    <TooltipProvider>
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <Button onClick={() => printAddressLabel(customer)} size="sm" variant="ghost" className="h-5 w-5 p-0">
                                            <Printer className="h-2.5 w-2.5 text-blue-500 hover:text-blue-700" />
                                          </Button>
                                        </TooltipTrigger>
                                        <TooltipContent>Print Address Label</TooltipContent>
                                      </Tooltip>
                                    </TooltipProvider>
                                  )}
                                  <Button onClick={() => { setSelectedCustomer(customer); setSelectedCompanyContacts([]); }} size="sm" variant="ghost" className="h-5 px-1.5 text-[10px] opacity-0 group-hover:opacity-100">View</Button>
                                  <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost" className="h-5 w-5 p-0 opacity-0 group-hover:opacity-100"><Edit className="h-2.5 w-2.5" /></Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ) : viewMode === 'cards' ? (
            /* CARDS VIEW - Comfortable */
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((customer) => {
                const quoteCount = getQuoteCount(customer.email);
                const sampleCount = getSampleCount(customer.id);
                const isSelected = selectedForMerge.has(customer.id);
                return (
                  <div 
                    key={customer.id}
                    className={`bg-white border rounded-lg p-4 hover:shadow-md transition-shadow ${isSelected ? 'border-blue-400 bg-blue-50' : 'border-gray-200'}`}
                    data-testid={`card-client-${customer.id}`}
                  >
                    <div className="flex items-start justify-between mb-3">
                      <div className="flex items-start gap-2 flex-1 min-w-0">
                        <Checkbox 
                          checked={isSelected}
                          onCheckedChange={() => toggleMergeSelection(customer.id)}
                          disabled={!isSelected && selectedForMerge.size >= 2}
                          className="h-4 w-4 mt-1"
                        />
                        <div className="flex-1 min-w-0">
                          <h3 
                            className="font-semibold text-gray-900 truncate hover:text-blue-600 hover:underline cursor-pointer"
                            onClick={() => setSelectedCustomer(customer)}
                            data-testid={`link-client-card-${customer.id}`}
                          >
                            {getCompanyDisplayName(customer)}
                          </h3>
                          {customer.company && (customer.firstName || customer.lastName) && (
                            <p className="text-sm text-gray-500">{getDisplayName(customer)}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        {customer.sources?.includes('shopify') && <SiShopify className="h-4 w-4 text-green-600" />}
                        {customer.sources?.includes('odoo') && <SiOdoo className="h-4 w-4 text-purple-600" />}
                      </div>
                    </div>
                    
                    <div className="space-y-2 text-sm text-gray-600 mb-3">
                      {customer.email && (
                        <div className="flex items-center gap-2">
                          <Mail className="h-3.5 w-3.5 text-gray-400" />
                          <span className="truncate">{customer.email}</span>
                        </div>
                      )}
                      {customer.phone && (
                        <div className="flex items-center gap-2">
                          <Phone className="h-3.5 w-3.5 text-gray-400" />
                          <span>{customer.phone}</span>
                        </div>
                      )}
                      {customer.city && (
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-gray-400" />
                          <span>{[customer.city, customer.province].filter(Boolean).join(', ')}</span>
                        </div>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-2 mb-3">
                      {quoteCount > 0 && (
                        <span className="bg-blue-100 text-blue-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <FileText className="h-3 w-3" /> {quoteCount} Quotes
                        </span>
                      )}
                      {sampleCount > 0 && (
                        <span className="bg-green-100 text-green-700 text-xs px-2 py-1 rounded-full flex items-center gap-1">
                          <Package className="h-3 w-3" /> {sampleCount} Samples
                        </span>
                      )}
                    </div>
                    
                    <div className="flex items-center gap-1 pt-2 border-t border-gray-100">
                      <Button onClick={() => setSelectedCustomer(customer)} size="sm" variant="default" className="flex-1 h-8">View</Button>
                      {hasAddress(customer) ? (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={() => printAddressLabel(customer)} size="sm" variant="outline" className="h-8 w-8 p-0 border-blue-200">
                                <Printer className="h-4 w-4 text-blue-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Print Address Label (4x2")</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      ) : customer.company && (
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Button onClick={() => searchCompanyAddress(customer.company || '', customer.city)} size="sm" variant="outline" className="h-8 w-8 p-0 border-orange-200">
                                <ExternalLink className="h-4 w-4 text-orange-500" />
                              </Button>
                            </TooltipTrigger>
                            <TooltipContent>Find address on Google Maps</TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost" className="h-8 w-8 p-0"><Edit className="h-4 w-4" /></Button>
                      <Button onClick={() => handleDeleteCustomer(customer.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* KANBAN VIEW with Drag & Drop */
            <DragDropContext onDragEnd={handleKanbanDragEnd}>
              <div className="flex gap-4 overflow-x-auto pb-4">
                {(['both', 'quotes', 'samples', 'none', 'missing'] as const).map((category) => {
                  const config = {
                    both: { title: 'Quote & Sample Sent', color: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
                    quotes: { title: 'Quotes Sent', color: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
                    samples: { title: 'Samples Sent', color: 'green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
                    none: { title: 'None', color: 'gray', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' },
                    missing: { title: 'Missing Details', color: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
                  }[category];
                  const orderedCustomers = getOrderedKanbanCustomers(category);
                  
                  return (
                    <div key={category} className="flex-shrink-0 w-72">
                      <div className={`${config.bg} ${config.border} border rounded-t-lg px-3 py-2`}>
                        <h3 className={`font-semibold text-sm ${config.text}`}>{config.title}</h3>
                        <span className="text-xs text-gray-500">{orderedCustomers.length} clients</span>
                      </div>
                      <Droppable droppableId={category}>
                        {(provided, snapshot) => (
                          <div 
                            ref={provided.innerRef}
                            {...provided.droppableProps}
                            className={`bg-gray-50/50 border-x border-b border-gray-200 rounded-b-lg p-2 space-y-2 max-h-[500px] overflow-y-auto min-h-[100px] transition-colors ${
                              snapshot.isDraggingOver ? 'bg-blue-50/50' : ''
                            }`}
                          >
                            {orderedCustomers.map((customer, index) => {
                              const quoteCount = getQuoteCount(customer.email);
                              const sampleCount = getSampleCount(customer.id);
                              return (
                                <Draggable key={customer.id} draggableId={customer.id} index={index}>
                                  {(provided, snapshot) => (
                                    <div 
                                      ref={provided.innerRef}
                                      {...provided.draggableProps}
                                      className={`bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm cursor-pointer transition-shadow ${
                                        snapshot.isDragging ? 'shadow-lg ring-2 ring-blue-300' : ''
                                      }`}
                                      onClick={() => setSelectedCustomer(customer)}
                                    >
                                      <div className="flex items-center gap-1 mb-1">
                                        <div {...provided.dragHandleProps} className="cursor-grab active:cursor-grabbing p-0.5 -ml-1 hover:bg-gray-100 rounded">
                                          <GripVertical className="h-3 w-3 text-gray-400" />
                                        </div>
                                        {customer.sources?.includes('shopify') && <SiShopify className="h-3 w-3 text-green-600" />}
                                        {customer.sources?.includes('odoo') && <SiOdoo className="h-3 w-3 text-purple-600" />}
                                        <span className="font-medium text-sm text-gray-900 truncate hover:text-blue-600 hover:underline">{getCompanyDisplayName(customer)}</span>
                                      </div>
                                      {customer.company && (customer.firstName || customer.lastName) && (
                                        <p className="text-xs text-gray-500 truncate mb-2">{getDisplayName(customer)}</p>
                                      )}
                                      <div className="flex items-center gap-1 flex-wrap">
                                        {quoteCount > 0 && <span className="bg-blue-100 text-blue-700 text-xs px-1.5 py-0.5 rounded">{quoteCount}Q</span>}
                                        {sampleCount > 0 && <span className="bg-green-100 text-green-700 text-xs px-1.5 py-0.5 rounded">{sampleCount}S</span>}
                                        {hasMissingDetails(customer) && category === 'missing' && (
                                          <span className="bg-orange-100 text-orange-700 text-xs px-1.5 py-0.5 rounded">Incomplete</span>
                                        )}
                                      </div>
                                    </div>
                                  )}
                                </Draggable>
                              );
                            })}
                            {provided.placeholder}
                            {orderedCustomers.length === 0 && (
                              <p className="text-xs text-gray-400 text-center py-4">No clients</p>
                            )}
                          </div>
                        )}
                      </Droppable>
                    </div>
                  );
                })}
              </div>
            </DragDropContext>
          )}
        </CardContent>
      </Card>

      {/* Side-by-Side Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={(open) => {
        setShowMergeDialog(open);
        if (!open) {
          setMergeTarget(null);
          setMergeFieldSelections({});
        }
      }}>
        <DialogContent className="max-w-4xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="h-5 w-5 text-blue-600" />
              Merge Clients
            </DialogTitle>
            <DialogDescription>
              Compare both clients and select which values to keep for each field. Click on a value to select it.
            </DialogDescription>
          </DialogHeader>
          
          {(() => {
            const selectedCustomers = getSelectedCustomers();
            if (selectedCustomers.length !== 2) {
              return <p className="text-center text-gray-500 py-4">Please select exactly 2 clients to merge.</p>;
            }
            const [clientA, clientB] = selectedCustomers;
            
            return (
              <div className="space-y-4 py-4">
                {/* Client Headers */}
                <div className="grid grid-cols-3 gap-4 pb-3 border-b">
                  <div className="font-medium text-gray-500 text-sm">Field</div>
                  <div className="text-center">
                    <div className={`p-3 rounded-lg border-2 transition-all ${mergeTarget === clientA.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <button
                        type="button"
                        onClick={() => setMergeTarget(clientA.id)}
                        className="w-full text-left"
                      >
                        <h4 className="font-semibold text-gray-900 truncate">{getCompanyDisplayName(clientA)}</h4>
                        <p className="text-xs text-gray-500">{clientA.email || 'No email'}</p>
                        {mergeTarget === clientA.id && (
                          <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Primary Record</span>
                        )}
                      </button>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className={`p-3 rounded-lg border-2 transition-all ${mergeTarget === clientB.id ? 'border-blue-500 bg-blue-50' : 'border-gray-200'}`}>
                      <button
                        type="button"
                        onClick={() => setMergeTarget(clientB.id)}
                        className="w-full text-left"
                      >
                        <h4 className="font-semibold text-gray-900 truncate">{getCompanyDisplayName(clientB)}</h4>
                        <p className="text-xs text-gray-500">{clientB.email || 'No email'}</p>
                        {mergeTarget === clientB.id && (
                          <span className="inline-block mt-1 text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">Primary Record</span>
                        )}
                      </button>
                    </div>
                  </div>
                </div>
                
                {/* Field Comparison Rows */}
                <div className="space-y-2">
                  {mergeFields.map(({ key, label }) => {
                    const valueA = (clientA as any)[key] || '';
                    const valueB = (clientB as any)[key] || '';
                    const selectedValue = mergeFieldSelections[key];
                    const isDifferent = valueA !== valueB;
                    
                    return (
                      <div 
                        key={key} 
                        className={`grid grid-cols-3 gap-4 py-2 px-2 rounded ${isDifferent ? 'bg-amber-50' : ''}`}
                      >
                        <div className="flex items-center">
                          <span className="text-sm font-medium text-gray-600">{label}</span>
                          {isDifferent && <span className="ml-2 text-xs text-amber-600">Different</span>}
                        </div>
                        <button
                          type="button"
                          onClick={() => setMergeFieldSelections(prev => ({ ...prev, [key]: clientA.id }))}
                          className={`p-2 text-left rounded border transition-all text-sm ${
                            selectedValue === clientA.id 
                              ? 'border-green-500 bg-green-50 ring-1 ring-green-500' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {valueA || <span className="text-gray-400 italic">Empty</span>}
                          {selectedValue === clientA.id && <Check className="inline ml-2 h-3 w-3 text-green-600" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => setMergeFieldSelections(prev => ({ ...prev, [key]: clientB.id }))}
                          className={`p-2 text-left rounded border transition-all text-sm ${
                            selectedValue === clientB.id 
                              ? 'border-green-500 bg-green-50 ring-1 ring-green-500' 
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          {valueB || <span className="text-gray-400 italic">Empty</span>}
                          {selectedValue === clientB.id && <Check className="inline ml-2 h-3 w-3 text-green-600" />}
                        </button>
                      </div>
                    );
                  })}
                </div>
                
                <div className="pt-3 border-t text-sm text-gray-500">
                  <p>The primary record will be kept. Fields you select will be used. Unselected fields will use the primary record's values.</p>
                </div>
              </div>
            );
          })()}
          
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMergeDialog(false); setMergeTarget(null); setMergeFieldSelections({}); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleMerge} 
              disabled={!mergeTarget || mergeCustomersMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
              data-testid="button-confirm-merge"
            >
              {mergeCustomersMutation.isPending ? 'Merging...' : 'Merge Clients'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog (Admin Only) */}
      {isAdmin && (
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import from Shopify</DialogTitle>
              <DialogDescription>
                Upload a CSV file exported from Shopify to bulk import or update client information
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary font-medium">Uploading...</span>
                    <span className="text-gray-500">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {uploadResult && (
                <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  {uploadResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                    {uploadResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Upload CSV File</Label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv"
                    onChange={handleFileChange}
                    disabled={isUploading}
                    className="block w-full text-sm text-gray-600
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-lg file:border-0
                             file:text-sm file:font-semibold
                             file:bg-primary file:text-white
                             hover:file:bg-primary/90
                             file:disabled:opacity-50"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Download Template</Label>
                  <Button
                    onClick={handleDownloadTemplate}
                    variant="outline"
                    className="w-full"
                  >
                    <Download className="h-4 w-4 mr-2" />
                    CSV Template
                  </Button>
                </div>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-2">How to Export from Shopify</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>1. In Shopify Admin, go to Customers</li>
                  <li>2. Click "Export" and select "All customers"</li>
                  <li>3. Choose "Plain CSV file" format</li>
                  <li>4. Upload the exported CSV file here</li>
                  <li>• New clients will be added, existing clients will be updated based on Customer ID or Email</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => setShowUploadDialog(false)} variant="outline">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Odoo Upload Dialog (Admin Only) */}
      {isAdmin && (
        <Dialog open={showOdooUploadDialog} onOpenChange={(open) => {
          setShowOdooUploadDialog(open);
          if (!open) {
            setSelectedOdooFile(null);
            if (odooFileInputRef.current) {
              odooFileInputRef.current.value = '';
            }
          }
        }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Import from Odoo</DialogTitle>
              <DialogDescription>
                Upload an Excel file (XLSX) exported from Odoo to bulk import or update client information
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              {isUploading && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-primary font-medium">Uploading...</span>
                    <span className="text-gray-500">{uploadProgress}%</span>
                  </div>
                  <Progress value={uploadProgress} className="h-2" />
                </div>
              )}

              {uploadResult && (
                <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                  {uploadResult.success ? (
                    <CheckCircle className="h-4 w-4 text-green-600" />
                  ) : (
                    <AlertCircle className="h-4 w-4 text-red-600" />
                  )}
                  <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                    {uploadResult.message}
                  </AlertDescription>
                </Alert>
              )}

              <div className="space-y-3">
                <Label>Upload Excel File (.xlsx)</Label>
                <div className="flex gap-3 items-center">
                  <input
                    ref={odooFileInputRef}
                    type="file"
                    accept=".xlsx"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) {
                        setSelectedOdooFile(file);
                      }
                    }}
                    disabled={isUploading}
                    className="block w-full text-sm text-gray-600
                             file:mr-4 file:py-2 file:px-4
                             file:rounded-lg file:border-0
                             file:text-sm file:font-semibold
                             file:bg-primary file:text-white
                             hover:file:bg-primary/90
                             file:disabled:opacity-50"
                    data-testid="input-odoo-file"
                  />
                </div>
                {selectedOdooFile && (
                  <div className="flex items-center gap-2 p-2 bg-green-50 rounded-lg border border-green-200">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <span className="text-sm text-green-800">Selected: {selectedOdooFile.name}</span>
                  </div>
                )}
                <Button 
                  onClick={() => {
                    if (selectedOdooFile) {
                      handleOdooFileUpload(selectedOdooFile);
                    } else {
                      toast({ title: "Please select a file first", variant: "destructive" });
                    }
                  }}
                  disabled={isUploading || !selectedOdooFile}
                  className="w-full"
                  data-testid="button-upload-odoo-file"
                >
                  <Upload className="h-4 w-4 mr-2" />
                  {isUploading ? "Uploading..." : "Upload and Import Contacts"}
                </Button>
              </div>

              <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
                <h3 className="font-semibold text-blue-900 mb-2">How to Export from Odoo</h3>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>1. In Odoo, go to Contacts</li>
                  <li>2. Select the contacts you want to export (or select all)</li>
                  <li>3. Click "Export" and choose Excel format</li>
                  <li>4. Ensure your export includes: Complete Name, Phone, Email, City, Country, Zip</li>
                  <li>5. Upload the exported Excel file here</li>
                  <li>• New clients will be added, existing clients will be updated based on Email or Phone</li>
                </ul>
              </div>
            </div>

            <DialogFooter>
              <Button onClick={() => {
                  setShowOdooUploadDialog(false);
                  setSelectedOdooFile(null);
                  if (odooFileInputRef.current) {
                    odooFileInputRef.current.value = '';
                  }
                }} variant="outline">
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* Edit/Create Dialog - Simplified for brevity */}
      <Dialog open={isEditDialogOpen || isCreateDialogOpen} onOpenChange={() => {
        setIsEditDialogOpen(false);
        setIsCreateDialogOpen(false);
        setEditingCustomer(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreateDialogOpen ? "Create New Client" : "Edit Client"}
            </DialogTitle>
            <DialogDescription>
              {isCreateDialogOpen ? 
                "Enter the client information below to create a new record." :
                "Update the client information below."}
            </DialogDescription>
          </DialogHeader>
          
          {editingCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="customerId">Client ID *</Label>
                <Input
                  id="customerId"
                  value={editingCustomer.id}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, id: e.target.value} : null)}
                  disabled={!isCreateDialogOpen}
                />
              </div>

              <div>
                <Label htmlFor="firstName">First Name</Label>
                <Input
                  id="firstName"
                  value={editingCustomer.firstName || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, firstName: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="lastName">Last Name</Label>
                <Input
                  id="lastName"
                  value={editingCustomer.lastName || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, lastName: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={editingCustomer.email || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, email: e.target.value} : null)}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="company">Company</Label>
                <Input
                  id="company"
                  value={editingCustomer.company || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, company: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="phone">Phone</Label>
                <Input
                  id="phone"
                  value={editingCustomer.phone || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, phone: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={editingCustomer.city || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, city: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="province">Province</Label>
                <Input
                  id="province"
                  value={editingCustomer.province || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, province: e.target.value} : null)}
                />
              </div>

              <div>
                <Label htmlFor="country">Country</Label>
                <Input
                  id="country"
                  value={editingCustomer.country || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, country: e.target.value} : null)}
                />
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="address1">Address Line 1</Label>
                <Input
                  id="address1"
                  value={editingCustomer.address1 || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, address1: e.target.value} : null)}
                />
              </div>

              <div className="md:col-span-2 flex items-center space-x-4">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="taxExempt"
                    checked={editingCustomer.taxExempt || false}
                    onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, taxExempt: !!checked} : null)}
                  />
                  <Label htmlFor="taxExempt" className="font-normal">Tax Exempt</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="acceptsEmailMarketing"
                    checked={editingCustomer.acceptsEmailMarketing || false}
                    onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, acceptsEmailMarketing: !!checked} : null)}
                  />
                  <Label htmlFor="acceptsEmailMarketing" className="font-normal">Email Marketing</Label>
                </div>
              </div>

              <div className="md:col-span-2">
                <Label htmlFor="note">Notes</Label>
                <Textarea
                  id="note"
                  value={editingCustomer.note || ""}
                  onChange={(e) => setEditingCustomer(prev => prev ? {...prev, note: e.target.value} : null)}
                  rows={3}
                />
              </div>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => {
              setIsEditDialogOpen(false);
              setIsCreateDialogOpen(false);
              setEditingCustomer(null);
            }} variant="outline">
              Cancel
            </Button>
            <Button onClick={() => {
              if (editingCustomer) {
                if (isCreateDialogOpen) {
                  createCustomerMutation.mutate(editingCustomer);
                } else {
                  updateCustomerMutation.mutate(editingCustomer as Customer);
                }
              }
            }}>
              {isCreateDialogOpen ? 'Create' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

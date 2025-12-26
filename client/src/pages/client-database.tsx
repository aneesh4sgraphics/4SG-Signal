import React, { useState, useEffect, useRef } from "react";
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
} from "lucide-react";
import { SiShopify, SiOdoo } from "react-icons/si";

import type { Customer } from '@shared/schema';

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
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedLetter, setSelectedLetter] = useState<string | null>(null);
  const [selectedForMerge, setSelectedForMerge] = useState<Set<string>>(new Set());
  const [showMergeDialog, setShowMergeDialog] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
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
  
  // Fetch quote counts per customer
  const { data: quoteCounts = {} } = useQuery<Record<string, number>>({
    queryKey: ['/api/customers/quote-counts'],
  });
  
  // Fetch total samples sent count
  const { data: sampleRequests = [] } = useQuery<any[]>({
    queryKey: ['/api/crm/sample-requests'],
  });
  const totalSamplesSent = sampleRequests.filter((s: any) => s.status === 'shipped' || s.status === 'completed').length;
  
  // Calculate total quotes sent
  const totalQuotesSent = Object.values(quoteCounts).reduce((sum, count) => sum + count, 0);
  
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
  
  // Check if customer has missing details
  const hasMissingDetails = (customer: Customer): boolean => {
    return !customer.email || !customer.phone || !customer.company || !customer.city;
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
      
      // Search filter - match against company name or any customer in the group
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchesCompany = group.companyName.toLowerCase().includes(term);
        const matchesAnyCustomer = group.customers.some(c => 
          c.firstName?.toLowerCase().includes(term) ||
          c.lastName?.toLowerCase().includes(term) ||
          c.email?.toLowerCase().includes(term)
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
      
      // Missing data filters - show only companies where at least one contact is missing data
      if (missingDataFilters.noEmail && !group.customers.some(c => !c.email || c.email.trim() === '')) return false;
      if (missingDataFilters.noPhone && !group.customers.some(c => !c.phone || c.phone.trim() === '')) return false;
      if (missingDataFilters.noTags && !group.customers.some(c => !c.tags || c.tags.trim() === '')) return false;
      if (missingDataFilters.noCompany && !group.customers.some(c => !c.company || c.company.trim() === '')) return false;
      
      return true;
    });
  }, [groupedByCompany, selectedLetter, searchTerm, filters, missingDataFilters]);
  
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
    mutationFn: async ({ targetId, sourceId }: { targetId: string; sourceId: string }) => {
      return await apiRequest("POST", `/api/customers/merge`, { targetId, sourceId });
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
    if (selectedForMerge.size === 2 && mergeTarget) {
      const ids = Array.from(selectedForMerge);
      const sourceId = ids.find(id => id !== mergeTarget);
      if (sourceId) {
        mergeCustomersMutation.mutate({ targetId: mergeTarget, sourceId });
      }
    }
  };

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
    });
    setMissingDataFilters({
      noEmail: false,
      noPhone: false,
      noTags: false,
      noCompany: false,
    });
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
  };

  const updateEditingField = (field: keyof Customer, value: any) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
  };

  const isAdmin = (user as any)?.role === 'admin';

  if (selectedCustomer) {
    return (
      <>
        <ClientDetailView
          customer={selectedCustomer}
          onBack={() => setSelectedCustomer(null)}
          onEdit={(customer) => {
            handleEditCustomer(customer);
          }}
          onDelete={(customerId) => {
            deleteCustomerMutation.mutate(customerId);
            setSelectedCustomer(null);
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
          <Button onClick={handleCreateCustomer} data-testid="button-create-client">
            <Plus className="h-4 w-4 mr-2" />
            Add Client
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Total Clients</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{customers.length}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-blue-50 flex items-center justify-center">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Samples Sent</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalSamplesSent}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-green-50 flex items-center justify-center">
                <Package className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="glass-card border-0">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-gray-500">Quotes Sent</p>
                <p className="text-3xl font-bold text-gray-900 mt-1">{totalQuotesSent}</p>
              </div>
              <div className="h-12 w-12 rounded-full bg-purple-50 flex items-center justify-center">
                <FileText className="h-6 w-6 text-purple-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Clean Search Bar */}
      <div className="relative">
        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-gray-400" />
        <Input
          placeholder="Search clients by name, email, company..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-12 pr-24 h-12 text-base bg-white/80 backdrop-blur-sm border border-gray-200 focus:border-primary/50 rounded-xl shadow-sm"
          data-testid="input-client-search"
        />
        {searchTerm ? (
          <Button 
            variant="ghost" 
            size="sm"
            onClick={() => setSearchTerm("")}
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

      {/* Client List */}
      <Card className="glass-card border-0">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="heading-sm">
              {filteredCompanies.length} {filteredCompanies.length === 1 ? 'Company' : 'Companies'}
              <span className="text-gray-400 font-normal ml-2">({customers.length} contacts)</span>
              {selectedLetter && selectedLetter !== 'All' && (
                <span className="text-gray-500 font-normal ml-2">
                  starting with "{selectedLetter}"
                </span>
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
              {(searchTerm || selectedLetter || Object.values(filters).some(f => f && f !== "all")) && (
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
            /* TABLE VIEW - Grouped by Company */
            <div className="divide-y divide-gray-100">
              {filteredCompanies.map((group) => {
                const isExpanded = expandedCompanies.has(group.groupKey);
                const hasMultiplePeople = group.customers.length > 1;
                const primary = group.primaryCustomer;
                const totalQuotes = getCompanyQuoteCount(group);
                const totalSamples = group.customers.reduce((sum, c) => sum + getSampleCount(c.id), 0);
                
                return (
                  <div key={group.groupKey} data-testid={`company-group-${primary.id}`}>
                    {/* Company Row */}
                    <div 
                      className="flex items-center justify-between py-2.5 px-1 hover:bg-gray-50/50 text-sm cursor-pointer"
                      onClick={() => hasMultiplePeople && toggleCompanyExpansion(group.groupKey)}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        {hasMultiplePeople ? (
                          <button className="p-0.5 hover:bg-gray-200 rounded">
                            {isExpanded ? <ChevronDown className="h-4 w-4 text-gray-500" /> : <ChevronRight className="h-4 w-4 text-gray-500" />}
                          </button>
                        ) : (
                          <div className="w-5" />
                        )}
                        <Building2 className="h-4 w-4 text-gray-400" />
                        <span className="font-medium text-gray-900 truncate min-w-[180px]">
                          {group.companyName}
                        </span>
                        {hasMultiplePeople && (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                            {group.customers.length} people
                          </Badge>
                        )}
                        {primary.sources?.includes('shopify') && <SiShopify className="h-3 w-3 text-green-600" />}
                        {primary.sources?.includes('odoo') && <SiOdoo className="h-3 w-3 text-purple-600" />}
                        {totalQuotes > 0 && (
                          <span className="bg-blue-100 text-blue-700 text-xs px-1 rounded">{totalQuotes}Q</span>
                        )}
                        {totalSamples > 0 && (
                          <span className="bg-green-100 text-green-700 text-xs px-1 rounded">{totalSamples}S</span>
                        )}
                        {!hasMultiplePeople && primary.email && (
                          <span className="text-gray-400 text-xs truncate hidden lg:block">{primary.email}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                        <Button onClick={() => setSelectedCustomer(primary)} size="sm" variant="ghost" className="h-6 px-2 text-xs">View</Button>
                        <Button onClick={() => handleEditCustomer(primary)} size="sm" variant="ghost" className="h-6 w-6 p-0"><Edit className="h-3 w-3" /></Button>
                        <Button onClick={() => handleDeleteCustomer(primary.id)} size="sm" variant="ghost" className="h-6 w-6 p-0 text-red-500"><Trash2 className="h-3 w-3" /></Button>
                      </div>
                    </div>
                    
                    {/* Expanded People List */}
                    {isExpanded && hasMultiplePeople && (
                      <div className="bg-gray-50/50 border-l-2 border-gray-200 ml-6 mb-2">
                        {group.customers.map((customer) => (
                          <div 
                            key={customer.id}
                            className="flex items-center justify-between py-2 px-3 hover:bg-gray-100/50 text-sm border-b border-gray-100 last:border-0"
                            data-testid={`person-row-${customer.id}`}
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <Users className="h-3.5 w-3.5 text-gray-400" />
                              <span className="text-gray-700">
                                {customer.firstName || customer.lastName 
                                  ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim()
                                  : customer.email || 'Contact'}
                              </span>
                              {customer.email && (
                                <span className="text-gray-400 text-xs truncate">{customer.email}</span>
                              )}
                              {customer.phone && (
                                <span className="text-gray-400 text-xs hidden lg:block">• {customer.phone}</span>
                              )}
                            </div>
                            <div className="flex items-center gap-0.5" onClick={(e) => e.stopPropagation()}>
                              <Button onClick={() => setSelectedCustomer(customer)} size="sm" variant="ghost" className="h-5 px-1.5 text-[10px]">View</Button>
                              <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost" className="h-5 w-5 p-0"><Edit className="h-2.5 w-2.5" /></Button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
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
                          <h3 className="font-semibold text-gray-900 truncate">{getCompanyDisplayName(customer)}</h3>
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
                      <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost" className="h-8 w-8 p-0"><Edit className="h-4 w-4" /></Button>
                      <Button onClick={() => handleDeleteCustomer(customer.id)} size="sm" variant="ghost" className="h-8 w-8 p-0 text-red-500"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            /* KANBAN VIEW */
            <div className="flex gap-4 overflow-x-auto pb-4">
              {(['both', 'quotes', 'samples', 'none', 'missing'] as const).map((category) => {
                const config = {
                  both: { title: 'Quote & Sample Sent', color: 'purple', bg: 'bg-purple-50', border: 'border-purple-200', text: 'text-purple-700' },
                  quotes: { title: 'Quotes Sent', color: 'blue', bg: 'bg-blue-50', border: 'border-blue-200', text: 'text-blue-700' },
                  samples: { title: 'Samples Sent', color: 'green', bg: 'bg-green-50', border: 'border-green-200', text: 'text-green-700' },
                  none: { title: 'None', color: 'gray', bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-700' },
                  missing: { title: 'Missing Details', color: 'orange', bg: 'bg-orange-50', border: 'border-orange-200', text: 'text-orange-700' },
                }[category];
                const customers = filteredCustomers.filter(c => getKanbanCategory(c) === category);
                
                return (
                  <div key={category} className="flex-shrink-0 w-72">
                    <div className={`${config.bg} ${config.border} border rounded-t-lg px-3 py-2`}>
                      <h3 className={`font-semibold text-sm ${config.text}`}>{config.title}</h3>
                      <span className="text-xs text-gray-500">{customers.length} clients</span>
                    </div>
                    <div className="bg-gray-50/50 border-x border-b border-gray-200 rounded-b-lg p-2 space-y-2 max-h-[500px] overflow-y-auto">
                      {customers.map((customer) => {
                        const quoteCount = getQuoteCount(customer.email);
                        const sampleCount = getSampleCount(customer.id);
                        return (
                          <div 
                            key={customer.id}
                            className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-sm cursor-pointer"
                            onClick={() => setSelectedCustomer(customer)}
                          >
                            <div className="flex items-center gap-1 mb-1">
                              {customer.sources?.includes('shopify') && <SiShopify className="h-3 w-3 text-green-600" />}
                              {customer.sources?.includes('odoo') && <SiOdoo className="h-3 w-3 text-purple-600" />}
                              <span className="font-medium text-sm text-gray-900 truncate">{getCompanyDisplayName(customer)}</span>
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
                        );
                      })}
                      {customers.length === 0 && (
                        <p className="text-xs text-gray-400 text-center py-4">No clients</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Merge Dialog */}
      <Dialog open={showMergeDialog} onOpenChange={setShowMergeDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Merge Clients</DialogTitle>
            <DialogDescription>
              Select which client to keep. The other client's data will be merged into it.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {getSelectedCustomers().map((customer) => {
              const isTarget = mergeTarget === customer.id;
              return (
                <div 
                  key={customer.id}
                  onClick={() => setMergeTarget(customer.id)}
                  className={`p-4 border rounded-lg cursor-pointer transition-colors ${
                    isTarget ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${
                      isTarget ? 'border-blue-500 bg-blue-500' : 'border-gray-300'
                    }`}>
                      {isTarget && <CheckCircle className="h-3 w-3 text-white" />}
                    </div>
                    <div className="flex-1">
                      <h4 className="font-medium text-gray-900">{getCompanyDisplayName(customer)}</h4>
                      <p className="text-sm text-gray-500">{customer.email}</p>
                      <p className="text-xs text-gray-400">
                        {customer.phone || 'No phone'} • {customer.city || 'No city'}
                      </p>
                    </div>
                    {isTarget && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Keep this one</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowMergeDialog(false); setMergeTarget(null); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleMerge} 
              disabled={!mergeTarget || mergeCustomersMutation.isPending}
              className="bg-blue-600 hover:bg-blue-700"
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

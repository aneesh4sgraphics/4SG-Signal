import React, { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCustomers } from "@/features/customers/useCustomers";
import { useAuth } from "@/hooks/useAuth";
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
} from "lucide-react";

import type { Customer } from '@shared/schema';

export default function ClientDatabase() {
  const [searchTerm, setSearchTerm] = useState("");
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [showOdooUploadDialog, setShowOdooUploadDialog] = useState(false);
  const [filters, setFilters] = useState({
    city: "",
    province: "",
    country: "",
    taxExempt: "all",
    emailMarketing: "all",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('cards');
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Customer>>({});
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logPageView, logUserAction } = useActivityLogger();
  const { user } = useAuth();

  useEffect(() => {
    logPageView("Client Database");
  }, [logPageView]);

  const { data: customers = [], isLoading, error, refetch } = useCustomers();

  const filteredCustomers = customers.filter((customer) => {
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

    return matchesSearch && matchesCity && matchesProvince && matchesCountry && matchesTaxExempt && matchesEmailMarketing;
  });

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

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onSuccess: async (_, customerId) => {
      const customer = customers.find(c => c.id === customerId);
      logUserAction("DELETED CLIENT", `${customer?.firstName} ${customer?.lastName} (${customer?.email})`);
      toast({
        title: "Client deleted",
        description: "Client has been deleted successfully",
      });
      
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting client",
        description: error.message || "Failed to delete client",
        variant: "destructive",
      });
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
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
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

  const getDisplayName = (customer: Customer) => {
    if (customer.firstName || customer.lastName) {
      return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    }
    return customer.email || customer.id;
  };

  const isAdmin = (user as any)?.role === 'admin';

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

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps text-gray-500">Total Clients</p>
                <p className="heading-md text-gray-900 mt-1">{customers.length}</p>
              </div>
              <Users className="h-8 w-8 text-primary opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps text-gray-500">Active</p>
                <p className="heading-md text-gray-900 mt-1">{customers.filter(c => (c.totalOrders || 0) > 0).length}</p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps text-gray-500">Email Marketing</p>
                <p className="heading-md text-gray-900 mt-1">{customers.filter(c => c.acceptsEmailMarketing).length}</p>
              </div>
              <Mail className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="label-caps text-gray-500">Tax Exempt</p>
                <p className="heading-md text-gray-900 mt-1">{customers.filter(c => c.taxExempt).length}</p>
              </div>
              <AlertCircle className="h-8 w-8 text-orange-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Search and Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search by name, email, company, or ID..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={() => setShowFilters(!showFilters)} variant="outline" data-testid="button-filters">
                <Filter className="h-4 w-4 mr-2" />
                Filters
              </Button>
              <Button onClick={() => refetch()} variant="outline" data-testid="button-refresh">
                <RefreshCw className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {showFilters && (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-5 gap-4 p-4 bg-gray-50 rounded-lg">
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
          )}
        </CardContent>
      </Card>

      {/* Client List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="heading-sm">
              {filteredCustomers.length} {filteredCustomers.length === 1 ? 'Client' : 'Clients'}
            </CardTitle>
            {(searchTerm || Object.values(filters).some(f => f && f !== "all")) && (
              <Button onClick={clearFilters} variant="outline" size="sm">
                Clear Filters
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto mb-4"></div>
              <p className="text-gray-600">Loading clients...</p>
            </div>
          ) : filteredCustomers.length === 0 ? (
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
          ) : viewMode === 'cards' ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredCustomers.map((customer) => (
                <Card key={customer.id} className="hover:shadow-lg transition-shadow border-gray-200" data-testid={`card-client-${customer.id}`}>
                  <CardContent className="p-4">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <h3 className="font-semibold text-base text-gray-900">
                            {getDisplayName(customer)}
                          </h3>
                          {customer.company && (
                            <p className="body-sm text-gray-600 flex items-center gap-1 mt-1">
                              <Building2 className="h-3 w-3" />
                              {customer.company}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost" data-testid={`button-edit-${customer.id}`}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            data-testid={`button-delete-${customer.id}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 body-sm">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Mail className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <Phone className="h-3 w-3 flex-shrink-0" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {(customer.city || customer.province || customer.country) && (
                          <div className="flex items-center gap-2 text-gray-600">
                            <MapPin className="h-3 w-3 flex-shrink-0" />
                            <span className="truncate">
                              {[customer.city, customer.province, customer.country]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t border-gray-100">
                        <div className="body-sm text-gray-600">
                          <span className="font-medium">{customer.totalOrders}</span> orders
                        </div>
                        <div className="body-sm font-semibold text-gray-900">
                          ${(parseFloat(String(customer.totalSpent)) || 0).toFixed(2)}
                        </div>
                      </div>
                      
                      {(customer.taxExempt || customer.acceptsEmailMarketing || customer.acceptsSmsMarketing) && (
                        <div className="flex gap-1 flex-wrap">
                          {customer.taxExempt && (
                            <Badge variant="secondary" className="text-xs">Tax Exempt</Badge>
                          )}
                          {customer.acceptsEmailMarketing && (
                            <Badge variant="outline" className="text-xs">Email</Badge>
                          )}
                          {customer.acceptsSmsMarketing && (
                            <Badge variant="outline" className="text-xs">SMS</Badge>
                          )}
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="body-sm">Name</TableHead>
                    <TableHead className="body-sm">Email</TableHead>
                    <TableHead className="body-sm">Company</TableHead>
                    <TableHead className="body-sm">Location</TableHead>
                    <TableHead className="body-sm">Phone</TableHead>
                    <TableHead className="body-sm text-right">Spent</TableHead>
                    <TableHead className="body-sm text-center">Orders</TableHead>
                    <TableHead className="body-sm">Status</TableHead>
                    <TableHead className="body-sm">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id} data-testid={`row-client-${customer.id}`}>
                      <TableCell className="body-sm font-medium">{getDisplayName(customer)}</TableCell>
                      <TableCell className="body-sm">{customer.email || '-'}</TableCell>
                      <TableCell className="body-sm">{customer.company || '-'}</TableCell>
                      <TableCell className="body-sm">
                        {[customer.city, customer.province].filter(Boolean).join(', ') || '-'}
                      </TableCell>
                      <TableCell className="body-sm">{customer.phone || '-'}</TableCell>
                      <TableCell className="body-sm text-right font-medium">
                        ${(parseFloat(String(customer.totalSpent)) || 0).toFixed(2)}
                      </TableCell>
                      <TableCell className="body-sm text-center">{customer.totalOrders}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {customer.taxExempt && (
                            <Badge variant="secondary" className="text-xs">Tax Exempt</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button onClick={() => handleEditCustomer(customer)} size="sm" variant="ghost">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

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
        <Dialog open={showOdooUploadDialog} onOpenChange={setShowOdooUploadDialog}>
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

              <div className="space-y-2">
                <Label>Upload Excel File (.xlsx)</Label>
                <input
                  type="file"
                  accept=".xlsx"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      handleOdooFileUpload(file);
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
                />
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
              <Button onClick={() => setShowOdooUploadDialog(false)} variant="outline">
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

import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useCustomers } from "@/features/customers/useCustomers";
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
  ArrowLeft,
  Plus,
  Trash2,
  Filter,
  RefreshCw,
  Grid3X3,
  List,
  Columns,
  Check,
  Eye,
  EyeOff,
} from "lucide-react";
import { Link } from "wouter";

import type { Customer } from '@shared/schema';

export default function CustomerTable() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [filters, setFilters] = useState({
    city: "",
    province: "",
    country: "",
    taxExempt: "all",
    emailMarketing: "all",
  });
  const [showFilters, setShowFilters] = useState(false);
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');
  const [showColumnFilter, setShowColumnFilter] = useState(false);
  const [editingRowId, setEditingRowId] = useState<string | null>(null);
  const [editingData, setEditingData] = useState<Partial<Customer>>({});
  const [visibleColumns, setVisibleColumns] = useState({
    firstName: true,
    lastName: true,
    email: true,
    company: true,
    city: true,
    province: true,
    country: true,
    phone: true,
    totalSpent: true,
    totalOrders: true,
    taxExempt: true,
    acceptsEmailMarketing: true,
    note: true,
    tags: true
  });
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logPageView, logUserAction } = useActivityLogger();

  // Log page view when component mounts
  useEffect(() => {
    logPageView("Customer Table View");
  }, [logPageView]);

  // Fetch customers
  const { data: customers = [], isLoading, error, refetch } = useCustomers();

  // Filter and search customers
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

  // Update customer mutation
  const updateCustomerMutation = useMutation({
    mutationFn: async (customer: Customer) => {
      return await apiRequest("PUT", `/api/customers/${customer.id}`, customer);
    },
    onSuccess: (_, customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      logUserAction("UPDATED CUSTOMER", `${customer.firstName} ${customer.lastName} (${customer.email})`);
      toast({
        title: "Customer updated",
        description: "Customer information has been updated successfully",
      });
      setIsEditDialogOpen(false);
      setEditingCustomer(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error updating customer",
        description: error.message || "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Create customer mutation
  const createCustomerMutation = useMutation({
    mutationFn: async (customer: Omit<Customer, 'createdAt' | 'updatedAt'>) => {
      return await apiRequest("POST", "/api/customers", customer);
    },
    onSuccess: (_, customer) => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      logUserAction("CREATED CUSTOMER", `${customer.firstName} ${customer.lastName} (${customer.email})`);
      toast({
        title: "Customer created",
        description: "New customer has been created successfully",
      });
      setIsCreateDialogOpen(false);
    },
    onError: (error: any) => {
      toast({
        title: "Error creating customer",
        description: error.message || "Failed to create customer",
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return await apiRequest("DELETE", `/api/customers/${customerId}`);
    },
    onSuccess: async (_, customerId) => {
      const customer = customers.find(c => c.id === customerId);
      logUserAction("DELETED CUSTOMER", `${customer?.firstName} ${customer?.lastName} (${customer?.email})`);
      toast({
        title: "Customer deleted",
        description: "Customer has been deleted successfully",
      });
      
      // Small delay before invalidating to ensure deletion is complete
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      }, 100);
    },
    onError: (error: any) => {
      toast({
        title: "Error deleting customer",
        description: error.message || "Failed to delete customer",
        variant: "destructive",
      });
    },
  });

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
      totalSpent: 0,
      totalOrders: 0,
      note: "",
      taxExempt: false,
      tags: "",
      createdAt: "",
      updatedAt: "",
    });
    setIsCreateDialogOpen(true);
  };

  const handleSaveCustomer = () => {
    if (!editingCustomer) return;
    
    if (isCreateDialogOpen) {
      if (!editingCustomer.id.trim()) {
        toast({
          title: "Validation Error",
          description: "Customer ID is required",
          variant: "destructive",
        });
        return;
      }
      createCustomerMutation.mutate(editingCustomer);
    } else {
      updateCustomerMutation.mutate(editingCustomer);
    }
  };

  const handleDeleteCustomer = (customerId: string) => {
    if (confirm("Are you sure you want to delete this customer? This action cannot be undone.")) {
      deleteCustomerMutation.mutate(customerId);
    }
  };

  const clearFilters = () => {
    setFilters({
      city: "",
      province: "",
      country: "",
      taxExempt: "all",
      emailMarketing: "all",
    });
    setSearchTerm("");
  };

  // Inline editing functions
  const startEdit = (customer: Customer) => {
    setEditingRowId(customer.id);
    setEditingData({ ...customer });
  };

  const cancelEdit = () => {
    setEditingRowId(null);
    setEditingData({});
  };

  const saveEdit = () => {
    if (editingRowId && editingData) {
      updateCustomerMutation.mutate(editingData as Customer);
      setEditingRowId(null);
      setEditingData({});
    }
  };

  const updateEditingField = (field: keyof Customer, value: any) => {
    setEditingData(prev => ({ ...prev, [field]: value }));
  };

  // Column visibility functions
  const toggleColumnVisibility = (column: keyof typeof visibleColumns) => {
    setVisibleColumns(prev => ({ ...prev, [column]: !prev[column] }));
  };

  const getDisplayName = (customer: Customer) => {
    const firstName = customer.firstName || '';
    const lastName = customer.lastName || '';
    if (firstName && lastName) return `${firstName} ${lastName}`;
    if (firstName) return firstName;
    if (lastName) return lastName;
    return customer.email || customer.id;
  };

  // Handle loading and error states after all hooks are declared
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p className="text-blue-700">Loading customers...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
        <div className="max-w-7xl mx-auto">
          <div className="text-center py-12">
            <div className="text-red-600 mb-4">
              <X className="h-8 w-8 mx-auto mb-2" />
              <p className="text-lg font-semibold">Error loading customers</p>
              <p className="text-sm">{error instanceof Error ? error.message : 'Unknown error occurred'}</p>
            </div>
            <Button onClick={() => refetch()} className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Try Again
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-900 mb-2 flex items-center justify-center gap-3">
            <Users className="h-10 w-10 text-blue-600" />
            Customer Database
          </h1>
          <p className="text-blue-700 text-lg">
            View and manage all customer information
          </p>
        </div>

        {/* Stats and Controls */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card className="bg-white shadow-lg border-0">
            <CardContent className="p-4">
              <div className="text-2xl font-bold text-blue-600">
                {filteredCustomers.length.toLocaleString()}
              </div>
              <div className="text-sm text-blue-700">
                {filteredCustomers.length === customers.length ? "Total Customers" : "Filtered Results"}
              </div>
            </CardContent>
          </Card>
          
          <div className="md:col-span-3 flex gap-2">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
                <Input
                  placeholder="Search customers by name, email, company, or ID..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>
            
            {/* View Mode Toggle */}
            <div className="flex border rounded-md">
              <Button
                onClick={() => setViewMode('table')}
                variant={viewMode === 'table' ? "default" : "ghost"}
                size="sm"
                className="rounded-r-none"
              >
                <List className="h-4 w-4" />
              </Button>
              <Button
                onClick={() => setViewMode('cards')}
                variant={viewMode === 'cards' ? "default" : "ghost"}
                size="sm"
                className="rounded-l-none"
              >
                <Grid3X3 className="h-4 w-4" />
              </Button>
            </div>
            
            <Button
              onClick={() => setShowColumnFilter(!showColumnFilter)}
              variant={showColumnFilter ? "default" : "outline"}
              className="gap-2"
            >
              <Columns className="h-4 w-4" />
              Columns
            </Button>
            <Button
              onClick={() => setShowFilters(!showFilters)}
              variant={showFilters ? "default" : "outline"}
              className="gap-2"
            >
              <Filter className="h-4 w-4" />
              Filters
            </Button>
            <Button onClick={handleCreateCustomer} className="gap-2">
              <Plus className="h-4 w-4" />
              Add Customer
            </Button>
            <Button onClick={() => refetch()} variant="outline" className="gap-2">
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </div>

        {/* Column Filter Panel */}
        {showColumnFilter && (
          <Card className="bg-white shadow-lg border-0">
            <CardHeader>
              <CardTitle className="text-lg">Visible Columns</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                {Object.entries(visibleColumns).map(([column, isVisible]) => (
                  <div key={column} className="flex items-center space-x-2">
                    <Checkbox
                      id={column}
                      checked={isVisible}
                      onCheckedChange={() => toggleColumnVisibility(column as keyof typeof visibleColumns)}
                      disabled={column === 'firstName' || column === 'email'} // Name and Email always visible
                    />
                    <Label htmlFor={column} className="text-sm">
                      {column === 'firstName' ? 'First Name' :
                       column === 'lastName' ? 'Last Name' :
                       column === 'acceptsEmailMarketing' ? 'Email Marketing' :
                       column === 'totalSpent' ? 'Total Spent' :
                       column === 'totalOrders' ? 'Total Orders' :
                       column === 'taxExempt' ? 'Tax Exempt' :
                       column.charAt(0).toUpperCase() + column.slice(1)}
                    </Label>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters Panel */}
        {showFilters && (
          <Card className="bg-white shadow-lg border-0">
            <CardHeader>
              <CardTitle className="text-lg">Advanced Filters</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                <div>
                  <Label htmlFor="city-filter">City</Label>
                  <Input
                    id="city-filter"
                    placeholder="Filter by city"
                    value={filters.city}
                    onChange={(e) => setFilters(prev => ({ ...prev, city: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="province-filter">Province/State</Label>
                  <Input
                    id="province-filter"
                    placeholder="Filter by province"
                    value={filters.province}
                    onChange={(e) => setFilters(prev => ({ ...prev, province: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="country-filter">Country</Label>
                  <Input
                    id="country-filter"
                    placeholder="Filter by country"
                    value={filters.country}
                    onChange={(e) => setFilters(prev => ({ ...prev, country: e.target.value }))}
                  />
                </div>
                <div>
                  <Label htmlFor="tax-exempt-filter">Tax Exempt</Label>
                  <select
                    id="tax-exempt-filter"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md"
                    value={filters.taxExempt}
                    onChange={(e) => setFilters(prev => ({ ...prev, taxExempt: e.target.value }))}
                  >
                    <option value="all">All</option>
                    <option value="yes">Tax Exempt</option>
                    <option value="no">Not Tax Exempt</option>
                  </select>
                </div>
                <div className="flex items-end">
                  <Button onClick={clearFilters} variant="outline" className="w-full">
                    Clear Filters
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Customer Data Display */}
        <Card className="bg-white shadow-lg border-0">
          <CardHeader>
            <CardTitle className="text-xl text-blue-900">Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            {viewMode === 'table' ? (
              /* Table View with Inline Editing */
              <div className="overflow-x-auto">
                <Table className="table-compact">
                  <TableHeader>
                    <TableRow className="h-8">
                      {visibleColumns.firstName && <TableHead className="py-1 px-2 text-xs">First Name</TableHead>}
                      {visibleColumns.lastName && <TableHead className="py-1 px-2 text-xs">Last Name</TableHead>}
                      {visibleColumns.email && <TableHead className="py-1 px-2 text-xs">Email</TableHead>}
                      {visibleColumns.company && <TableHead className="py-1 px-2 text-xs">Company</TableHead>}
                      {visibleColumns.city && <TableHead className="py-1 px-2 text-xs">City</TableHead>}
                      {visibleColumns.province && <TableHead className="py-1 px-2 text-xs">Province</TableHead>}
                      {visibleColumns.country && <TableHead className="py-1 px-2 text-xs">Country</TableHead>}
                      {visibleColumns.phone && <TableHead className="py-1 px-2 text-xs">Phone</TableHead>}
                      {visibleColumns.totalSpent && <TableHead className="py-1 px-2 text-xs">Total Spent</TableHead>}
                      {visibleColumns.totalOrders && <TableHead className="py-1 px-2 text-xs">Orders</TableHead>}
                      {visibleColumns.taxExempt && <TableHead className="py-1 px-2 text-xs">Tax Exempt</TableHead>}
                      {visibleColumns.acceptsEmailMarketing && <TableHead className="py-1 px-2 text-xs">Email Marketing</TableHead>}
                      {visibleColumns.note && <TableHead className="py-1 px-2 text-xs">Note</TableHead>}
                      {visibleColumns.tags && <TableHead className="py-1 px-2 text-xs">Tags</TableHead>}
                      <TableHead className="py-1 px-2 text-xs">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredCustomers.map((customer) => (
                      <TableRow key={customer.id} className="h-10">
                        {visibleColumns.firstName && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.firstName || ''}
                                onChange={(e) => updateEditingField('firstName', e.target.value)}
                                className="h-6 text-xs"
                                disabled // Names not editable
                              />
                            ) : (
                              <span className="text-xs">{customer.firstName || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.lastName && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.lastName || ''}
                                onChange={(e) => updateEditingField('lastName', e.target.value)}
                                className="h-6 text-xs"
                                disabled // Names not editable
                              />
                            ) : (
                              <span className="text-xs">{customer.lastName || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.email && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.email || ''}
                                onChange={(e) => updateEditingField('email', e.target.value)}
                                className="h-6 text-xs"
                                disabled // Email not editable
                              />
                            ) : (
                              <span className="text-xs truncate block max-w-32">{customer.email || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.company && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.company || ''}
                                onChange={(e) => updateEditingField('company', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs truncate block max-w-28">{customer.company || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.city && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.city || ''}
                                onChange={(e) => updateEditingField('city', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs">{customer.city || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.province && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.province || ''}
                                onChange={(e) => updateEditingField('province', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs">{customer.province || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.country && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.country || ''}
                                onChange={(e) => updateEditingField('country', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs">{customer.country || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.phone && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.phone || ''}
                                onChange={(e) => updateEditingField('phone', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs">{customer.phone || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.totalSpent && (
                          <TableCell className="py-1 px-2 text-right">
                            <span className="text-xs font-medium">${(parseFloat(String(customer.totalSpent)) || 0).toFixed(2)}</span>
                          </TableCell>
                        )}
                        {visibleColumns.totalOrders && (
                          <TableCell className="py-1 px-2 text-center">
                            <span className="text-xs">{customer.totalOrders}</span>
                          </TableCell>
                        )}
                        {visibleColumns.taxExempt && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Checkbox
                                checked={editingData.taxExempt || false}
                                onCheckedChange={(checked) => updateEditingField('taxExempt', checked)}
                                className="h-3 w-3"
                              />
                            ) : (
                              <Badge variant={customer.taxExempt ? "default" : "secondary"} className="text-xs py-0 px-1 h-4">
                                {customer.taxExempt ? "Yes" : "No"}
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.acceptsEmailMarketing && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Checkbox
                                checked={editingData.acceptsEmailMarketing || false}
                                onCheckedChange={(checked) => updateEditingField('acceptsEmailMarketing', checked)}
                                className="h-3 w-3"
                              />
                            ) : (
                              <Badge variant={customer.acceptsEmailMarketing ? "default" : "secondary"} className="text-xs py-0 px-1 h-4">
                                {customer.acceptsEmailMarketing ? "Yes" : "No"}
                              </Badge>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.note && (
                          <TableCell className="py-1 px-2 max-w-32">
                            {editingRowId === customer.id ? (
                              <Textarea
                                value={editingData.note || ''}
                                onChange={(e) => updateEditingField('note', e.target.value)}
                                className="h-16 text-xs"
                              />
                            ) : (
                              <span className="text-xs truncate block">{customer.note || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        {visibleColumns.tags && (
                          <TableCell className="py-1 px-2">
                            {editingRowId === customer.id ? (
                              <Input
                                value={editingData.tags || ''}
                                onChange={(e) => updateEditingField('tags', e.target.value)}
                                className="h-6 text-xs"
                              />
                            ) : (
                              <span className="text-xs">{customer.tags || '-'}</span>
                            )}
                          </TableCell>
                        )}
                        <TableCell className="py-1 px-2">
                          <div className="flex gap-1">
                            {editingRowId === customer.id ? (
                              <>
                                <Button onClick={saveEdit} size="sm" variant="default" className="h-6 w-6 p-0">
                                  <Save className="h-3 w-3" />
                                </Button>
                                <Button onClick={cancelEdit} size="sm" variant="outline" className="h-6 w-6 p-0">
                                  <X className="h-3 w-3" />
                                </Button>
                              </>
                            ) : (
                              <>
                                <Button onClick={() => startEdit(customer)} size="sm" variant="outline" className="h-6 w-6 p-0">
                                  <Edit className="h-3 w-3" />
                                </Button>
                                <Button
                                  onClick={() => handleDeleteCustomer(customer.id)}
                                  size="sm"
                                  variant="destructive"
                                  className="h-6 w-6 p-0"
                                >
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </>
                            )}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              /* Card View */
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCustomers.map((customer) => (
                  <Card key={customer.id} className="p-4 border border-gray-200 hover:shadow-md transition-shadow">
                    <div className="space-y-3">
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="font-semibold text-lg">
                            {getDisplayName(customer)}
                          </h3>
                          {customer.company && (
                            <p className="text-sm text-gray-600">{customer.company}</p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          <Button onClick={() => startEdit(customer)} size="sm" variant="outline">
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            size="sm"
                            variant="destructive"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2 text-sm">
                        {customer.email && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Email:</span>
                            <span>{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Phone:</span>
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {(customer.city || customer.province || customer.country) && (
                          <div className="flex items-center gap-2">
                            <span className="text-gray-500">Location:</span>
                            <span>
                              {[customer.city, customer.province, customer.country]
                                .filter(Boolean)
                                .join(', ')}
                            </span>
                          </div>
                        )}
                      </div>
                      
                      <div className="flex justify-between items-center pt-2 border-t">
                        <div className="text-sm">
                          <span className="text-gray-500">Orders:</span> {customer.totalOrders}
                        </div>
                        <div className="text-sm font-medium">
                          ${(parseFloat(String(customer.totalSpent)) || 0).toFixed(2)}
                        </div>
                      </div>
                      
                      <div className="flex gap-2 flex-wrap">
                        {customer.taxExempt && (
                          <Badge variant="secondary" className="text-xs">Tax Exempt</Badge>
                        )}
                        {customer.acceptsEmailMarketing && (
                          <Badge variant="outline" className="text-xs">Email Marketing</Badge>
                        )}
                        {customer.acceptsSmsMarketing && (
                          <Badge variant="outline" className="text-xs">SMS Marketing</Badge>
                        )}
                      </div>
                    </div>
                  </Card>
                ))}
              </div>
            )}
            
            {filteredCustomers.length === 0 && (
              <div className="text-center py-12">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-600">No customers found matching your criteria</p>
                {(searchTerm || Object.values(filters).some(f => f && f !== "all")) && (
                  <Button onClick={clearFilters} variant="outline" className="mt-4">
                    Clear Filters
                  </Button>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Back Button */}
        <div className="text-center">
          <Link href="/customer-management">
            <Button variant="outline" className="bg-white border-blue-300 text-blue-700 hover:bg-blue-50 gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Customer Management
            </Button>
          </Link>
        </div>
      </div>

      {/* Edit/Create Customer Dialog */}
      <Dialog open={isEditDialogOpen || isCreateDialogOpen} onOpenChange={() => {
        setIsEditDialogOpen(false);
        setIsCreateDialogOpen(false);
        setEditingCustomer(null);
      }}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {isCreateDialogOpen ? "Create New Customer" : "Edit Customer"}
            </DialogTitle>
            <DialogDescription>
              {isCreateDialogOpen ? 
                "Enter the customer information below to create a new customer record." :
                "Update the customer information below. All fields are optional except Customer ID."
              }
            </DialogDescription>
          </DialogHeader>
          
          {editingCustomer && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Basic Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Basic Information</h3>
                
                <div>
                  <Label htmlFor="customerId">Customer ID *</Label>
                  <Input
                    id="customerId"
                    value={editingCustomer.id}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, id: e.target.value} : null)}
                    disabled={!isCreateDialogOpen}
                    placeholder="Enter unique customer ID"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">First Name</Label>
                    <Input
                      id="firstName"
                      value={editingCustomer.firstName || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, firstName: e.target.value} : null)}
                      placeholder="First name"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Last Name</Label>
                    <Input
                      id="lastName"
                      value={editingCustomer.lastName || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, lastName: e.target.value} : null)}
                      placeholder="Last name"
                    />
                  </div>
                </div>

                <div>
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={editingCustomer.email || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, email: e.target.value} : null)}
                    placeholder="customer@example.com"
                  />
                </div>

                <div>
                  <Label htmlFor="company">Company</Label>
                  <Input
                    id="company"
                    value={editingCustomer.company || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, company: e.target.value} : null)}
                    placeholder="Company name"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="phone">Phone</Label>
                    <Input
                      id="phone"
                      value={editingCustomer.phone || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, phone: e.target.value} : null)}
                      placeholder="Phone number"
                    />
                  </div>
                  <div>
                    <Label htmlFor="defaultAddressPhone">Alt Phone</Label>
                    <Input
                      id="defaultAddressPhone"
                      value={editingCustomer.defaultAddressPhone || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, defaultAddressPhone: e.target.value} : null)}
                      placeholder="Alternative phone"
                    />
                  </div>
                </div>
              </div>

              {/* Address Information */}
              <div className="space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Address Information</h3>
                
                <div>
                  <Label htmlFor="address1">Address Line 1</Label>
                  <Input
                    id="address1"
                    value={editingCustomer.address1 || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, address1: e.target.value} : null)}
                    placeholder="Street address"
                  />
                </div>

                <div>
                  <Label htmlFor="address2">Address Line 2</Label>
                  <Input
                    id="address2"
                    value={editingCustomer.address2 || ""}
                    onChange={(e) => setEditingCustomer(prev => prev ? {...prev, address2: e.target.value} : null)}
                    placeholder="Apartment, suite, etc."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="city">City</Label>
                    <Input
                      id="city"
                      value={editingCustomer.city || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, city: e.target.value} : null)}
                      placeholder="City"
                    />
                  </div>
                  <div>
                    <Label htmlFor="province">Province/State</Label>
                    <Input
                      id="province"
                      value={editingCustomer.province || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, province: e.target.value} : null)}
                      placeholder="Province or State"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="country">Country</Label>
                    <Input
                      id="country"
                      value={editingCustomer.country || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, country: e.target.value} : null)}
                      placeholder="Country"
                    />
                  </div>
                  <div>
                    <Label htmlFor="zip">Postal Code</Label>
                    <Input
                      id="zip"
                      value={editingCustomer.zip || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, zip: e.target.value} : null)}
                      placeholder="Postal/ZIP code"
                    />
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="md:col-span-2 space-y-4">
                <h3 className="font-semibold text-lg border-b pb-2">Additional Information</h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="totalSpent">Total Spent</Label>
                        <Input
                          id="totalSpent"
                          type="number"
                          step="0.01"
                          value={editingCustomer.totalSpent}
                          onChange={(e) => setEditingCustomer(prev => prev ? {...prev, totalSpent: parseFloat(e.target.value) || 0} : null)}
                          placeholder="0.00"
                        />
                      </div>
                      <div>
                        <Label htmlFor="totalOrders">Total Orders</Label>
                        <Input
                          id="totalOrders"
                          type="number"
                          value={editingCustomer.totalOrders}
                          onChange={(e) => setEditingCustomer(prev => prev ? {...prev, totalOrders: parseInt(e.target.value) || 0} : null)}
                          placeholder="0"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="tags">Tags</Label>
                      <Input
                        id="tags"
                        value={editingCustomer.tags || ""}
                        onChange={(e) => setEditingCustomer(prev => prev ? {...prev, tags: e.target.value} : null)}
                        placeholder="customer, vip, wholesale (comma separated)"
                      />
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="acceptsEmailMarketing"
                          checked={editingCustomer.acceptsEmailMarketing}
                          onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, acceptsEmailMarketing: !!checked} : null)}
                        />
                        <Label htmlFor="acceptsEmailMarketing">Accepts Email Marketing</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="acceptsSmsMarketing"
                          checked={editingCustomer.acceptsSmsMarketing}
                          onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, acceptsSmsMarketing: !!checked} : null)}
                        />
                        <Label htmlFor="acceptsSmsMarketing">Accepts SMS Marketing</Label>
                      </div>

                      <div className="flex items-center space-x-2">
                        <Checkbox
                          id="taxExempt"
                          checked={editingCustomer.taxExempt}
                          onCheckedChange={(checked) => setEditingCustomer(prev => prev ? {...prev, taxExempt: !!checked} : null)}
                        />
                        <Label htmlFor="taxExempt">Tax Exempt</Label>
                      </div>
                    </div>
                  </div>

                  <div>
                    <Label htmlFor="note">Notes</Label>
                    <Textarea
                      id="note"
                      value={editingCustomer.note || ""}
                      onChange={(e) => setEditingCustomer(prev => prev ? {...prev, note: e.target.value} : null)}
                      placeholder="Additional notes about the customer..."
                      rows={6}
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setIsEditDialogOpen(false);
                setIsCreateDialogOpen(false);
                setEditingCustomer(null);
              }}
            >
              <X className="h-4 w-4 mr-2" />
              Cancel
            </Button>
            <Button
              onClick={handleSaveCustomer}
              disabled={updateCustomerMutation.isPending || createCustomerMutation.isPending}
              className="gap-2"
            >
              <Save className="h-4 w-4" />
              {isCreateDialogOpen ? "Create Customer" : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
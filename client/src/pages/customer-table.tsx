import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
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
} from "lucide-react";
import { Link } from "wouter";

interface Customer {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  acceptsEmailMarketing: boolean;
  company: string | null;
  address1: string | null;
  address2: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  phone: string | null;
  defaultAddressPhone: string | null;
  acceptsSmsMarketing: boolean;
  totalSpent: number;
  totalOrders: number;
  note: string | null;
  taxExempt: boolean;
  tags: string | null;
  createdAt: string;
  updatedAt: string;
}

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
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logPageView, logUserAction } = useActivityLogger();

  // Log page view when component mounts
  useEffect(() => {
    logPageView("Customer Table View");
  }, [logPageView]);

  // Fetch customers
  const { data: customers = [], isLoading, error, refetch } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    staleTime: 1 * 60 * 1000, // 1 minute
  });

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

        {/* Customer Table */}
        <Card className="bg-white shadow-lg border-0">
          <CardHeader>
            <CardTitle className="text-xl text-blue-900">Customer Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Customer ID</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Company</TableHead>
                    <TableHead>Phone</TableHead>
                    <TableHead>Location</TableHead>
                    <TableHead>Orders</TableHead>
                    <TableHead>Total Spent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredCustomers.map((customer) => (
                    <TableRow key={customer.id}>
                      <TableCell className="font-mono text-sm">{customer.id}</TableCell>
                      <TableCell>
                        <div className="font-medium">
                          {customer.firstName} {customer.lastName}
                        </div>
                      </TableCell>
                      <TableCell>{customer.email || "-"}</TableCell>
                      <TableCell>{customer.company || "-"}</TableCell>
                      <TableCell>{customer.phone || "-"}</TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {customer.city && customer.province ? 
                            `${customer.city}, ${customer.province}` : 
                            customer.city || customer.province || "-"
                          }
                        </div>
                      </TableCell>
                      <TableCell className="text-center">{customer.totalOrders}</TableCell>
                      <TableCell>${(parseFloat(customer.totalSpent) || 0).toFixed(2)}</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
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
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex gap-2 justify-end">
                          <Button
                            onClick={() => handleEditCustomer(customer)}
                            size="sm"
                            variant="outline"
                            className="gap-1"
                          >
                            <Edit className="h-3 w-3" />
                            Edit
                          </Button>
                          <Button
                            onClick={() => handleDeleteCustomer(customer.id)}
                            size="sm"
                            variant="destructive"
                            className="gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            Delete
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
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
            </div>
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
import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ArrowLeft, User, Users, Plus, Search, Edit, Trash2, Mail, Phone, MapPin, Building, Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  acceptsEmailMarketing: boolean;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  totalSpent: number;
  totalOrders: number;
  note: string;
  tags: string;
}

export default function CustomerManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    company: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    zip: "",
    firstName: "",
    lastName: "",
    phone: "",
    email: "",
    note: "",
    tags: ""
  });
  const { toast } = useToast();

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });

  const createCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      const response = await apiRequest("POST", "/api/customers", customerData);
      if (!response.ok) {
        throw new Error("Failed to create customer");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowNewCustomerDialog(false);
      resetForm();
      toast({
        title: "Success",
        description: "Customer created successfully",
      });
    },
    onError: (error) => {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateCustomerMutation = useMutation({
    mutationFn: async (customerData: any) => {
      const response = await apiRequest("PUT", `/api/customers/${customerData.id}`, customerData);
      if (!response.ok) {
        throw new Error("Failed to update customer");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowEditDialog(false);
      setSelectedCustomer(null);
      resetForm();
      toast({
        title: "Success",
        description: "Customer updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating customer:", error);
      toast({
        title: "Error",
        description: "Failed to update customer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteCustomerMutation = useMutation({
    mutationFn: async (customerId: string) => {
      const response = await apiRequest("DELETE", `/api/customers/${customerId}`);
      if (!response.ok) {
        throw new Error("Failed to delete customer");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Success",
        description: "Customer deleted successfully",
      });
    },
    onError: (error) => {
      console.error("Error deleting customer:", error);
      toast({
        title: "Error",
        description: "Failed to delete customer. Please try again.",
        variant: "destructive",
      });
    },
  });

  const resetForm = () => {
    setNewCustomer({
      company: "",
      address1: "",
      address2: "",
      city: "",
      province: "",
      zip: "",
      firstName: "",
      lastName: "",
      phone: "",
      email: "",
      note: "",
      tags: ""
    });
  };

  const handleCreateCustomer = async () => {
    if (!newCustomer.company || !newCustomer.firstName || !newCustomer.email) {
      toast({
        title: "Error",
        description: "Please fill in all required fields: Company Name, Contact Name, and Email",
        variant: "destructive",
      });
      return;
    }

    const customerId = `customer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const customerData = {
      id: customerId,
      company: newCustomer.company,
      address1: newCustomer.address1,
      address2: newCustomer.address2,
      city: newCustomer.city,
      province: newCustomer.province,
      zip: newCustomer.zip,
      firstName: newCustomer.firstName,
      lastName: newCustomer.lastName,
      phone: newCustomer.phone,
      email: newCustomer.email,
      acceptsEmailMarketing: false,
      country: "Canada",
      totalSpent: 0,
      totalOrders: 0,
      note: newCustomer.note,
      tags: newCustomer.tags,
    };

    createCustomerMutation.mutate(customerData);
  };

  const handleEditCustomer = (customer: Customer) => {
    setSelectedCustomer(customer);
    setNewCustomer({
      company: customer.company,
      address1: customer.address1,
      address2: customer.address2,
      city: customer.city,
      province: customer.province,
      zip: customer.zip,
      firstName: customer.firstName,
      lastName: customer.lastName,
      phone: customer.phone,
      email: customer.email,
      note: customer.note,
      tags: customer.tags,
    });
    setShowEditDialog(true);
  };

  const handleUpdateCustomer = async () => {
    if (!selectedCustomer) return;

    if (!newCustomer.company || !newCustomer.firstName || !newCustomer.email) {
      toast({
        title: "Error",
        description: "Please fill in all required fields: Company Name, Contact Name, and Email",
        variant: "destructive",
      });
      return;
    }

    const customerData = {
      ...selectedCustomer,
      company: newCustomer.company,
      address1: newCustomer.address1,
      address2: newCustomer.address2,
      city: newCustomer.city,
      province: newCustomer.province,
      zip: newCustomer.zip,
      firstName: newCustomer.firstName,
      lastName: newCustomer.lastName,
      phone: newCustomer.phone,
      email: newCustomer.email,
      note: newCustomer.note,
      tags: newCustomer.tags,
    };

    updateCustomerMutation.mutate(customerData);
  };

  const handleDeleteCustomer = async (customerId: string) => {
    if (window.confirm("Are you sure you want to delete this customer? This action cannot be undone.")) {
      deleteCustomerMutation.mutate(customerId);
    }
  };

  const filteredCustomers = customers.filter(customer => {
    const searchLower = searchTerm.toLowerCase();
    const fullName = `${customer.firstName} ${customer.lastName}`.toLowerCase();
    const company = customer.company?.toLowerCase() || "";
    const email = customer.email?.toLowerCase() || "";
    
    return fullName.includes(searchLower) || 
           company.includes(searchLower) || 
           email.includes(searchLower);
  });

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
              <Users className="h-8 w-8" />
              Customer Management
            </h1>
            <p className="text-gray-600">Manage all your customer information in one place</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Search and Add Customer */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Customer Search
              </span>
              <Dialog open={showNewCustomerDialog} onOpenChange={setShowNewCustomerDialog}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add New Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Create New Customer</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Company Name *</Label>
                        <Input
                          value={newCustomer.company}
                          onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                          placeholder="Company Name"
                        />
                      </div>
                      <div>
                        <Label>Contact Name *</Label>
                        <Input
                          value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                          placeholder="Contact Name"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Last Name</Label>
                        <Input
                          value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer({...newCustomer, lastName: e.target.value})}
                          placeholder="Last Name"
                        />
                      </div>
                      <div>
                        <Label>Email *</Label>
                        <Input
                          type="email"
                          value={newCustomer.email}
                          onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                          placeholder="Email Address"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Street Address</Label>
                      <Input
                        value={newCustomer.address1}
                        onChange={(e) => setNewCustomer({...newCustomer, address1: e.target.value})}
                        placeholder="Street Address"
                      />
                    </div>
                    <div>
                      <Label>Address Line 2</Label>
                      <Input
                        value={newCustomer.address2}
                        onChange={(e) => setNewCustomer({...newCustomer, address2: e.target.value})}
                        placeholder="Apartment, suite, etc."
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <Label>City</Label>
                        <Input
                          value={newCustomer.city}
                          onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                          placeholder="City"
                        />
                      </div>
                      <div>
                        <Label>Province</Label>
                        <Input
                          value={newCustomer.province}
                          onChange={(e) => setNewCustomer({...newCustomer, province: e.target.value})}
                          placeholder="Province"
                        />
                      </div>
                      <div>
                        <Label>Zip Code</Label>
                        <Input
                          value={newCustomer.zip}
                          onChange={(e) => setNewCustomer({...newCustomer, zip: e.target.value})}
                          placeholder="Zip Code"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label>Phone</Label>
                        <Input
                          value={newCustomer.phone}
                          onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                          placeholder="Phone Number"
                        />
                      </div>
                      <div>
                        <Label>Tags</Label>
                        <Input
                          value={newCustomer.tags}
                          onChange={(e) => setNewCustomer({...newCustomer, tags: e.target.value})}
                          placeholder="Tags (comma-separated)"
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Notes</Label>
                      <Input
                        value={newCustomer.note}
                        onChange={(e) => setNewCustomer({...newCustomer, note: e.target.value})}
                        placeholder="Additional notes"
                      />
                    </div>
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setShowNewCustomerDialog(false);
                          resetForm();
                        }}
                      >
                        Cancel
                      </Button>
                      <Button 
                        onClick={handleCreateCustomer}
                        disabled={createCustomerMutation.isPending}
                      >
                        {createCustomerMutation.isPending ? "Creating..." : "Create Customer"}
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search customers by name, company, or email..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
          </CardContent>
        </Card>

        {/* Customer List */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                All Customers ({filteredCustomers.length})
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading customers...</p>
              </div>
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8">
                <Users className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchTerm ? "No customers found matching your search." : "No customers yet. Create your first customer!"}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredCustomers.map((customer) => (
                  <Card key={customer.id} className="hover:shadow-md transition-shadow">
                    <CardContent className="p-4">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <User className="h-5 w-5 text-blue-600" />
                          <div>
                            <h3 className="font-semibold text-gray-900">
                              {customer.firstName} {customer.lastName}
                            </h3>
                            <p className="text-sm text-gray-500">{customer.company}</p>
                          </div>
                        </div>
                        <div className="flex gap-1">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleEditCustomer(customer)}
                          >
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => handleDeleteCustomer(customer.id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      
                      <div className="space-y-2">
                        {customer.email && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Mail className="h-4 w-4" />
                            <span>{customer.email}</span>
                          </div>
                        )}
                        {customer.phone && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <Phone className="h-4 w-4" />
                            <span>{customer.phone}</span>
                          </div>
                        )}
                        {(customer.address1 || customer.city || customer.province) && (
                          <div className="flex items-center gap-2 text-sm text-gray-600">
                            <MapPin className="h-4 w-4" />
                            <span>
                              {customer.address1}
                              {customer.city && `, ${customer.city}`}
                              {customer.province && `, ${customer.province}`}
                              {customer.zip && ` ${customer.zip}`}
                            </span>
                          </div>
                        )}
                        {customer.tags && (
                          <div className="flex items-center gap-2 text-sm">
                            <Tag className="h-4 w-4 text-gray-400" />
                            <Badge variant="outline">{customer.tags}</Badge>
                          </div>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Customer Dialog */}
        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Edit Customer</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Company Name *</Label>
                  <Input
                    value={newCustomer.company}
                    onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                    placeholder="Company Name"
                  />
                </div>
                <div>
                  <Label>Contact Name *</Label>
                  <Input
                    value={newCustomer.firstName}
                    onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                    placeholder="Contact Name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Last Name</Label>
                  <Input
                    value={newCustomer.lastName}
                    onChange={(e) => setNewCustomer({...newCustomer, lastName: e.target.value})}
                    placeholder="Last Name"
                  />
                </div>
                <div>
                  <Label>Email *</Label>
                  <Input
                    type="email"
                    value={newCustomer.email}
                    onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                    placeholder="Email Address"
                  />
                </div>
              </div>
              <div>
                <Label>Street Address</Label>
                <Input
                  value={newCustomer.address1}
                  onChange={(e) => setNewCustomer({...newCustomer, address1: e.target.value})}
                  placeholder="Street Address"
                />
              </div>
              <div>
                <Label>Address Line 2</Label>
                <Input
                  value={newCustomer.address2}
                  onChange={(e) => setNewCustomer({...newCustomer, address2: e.target.value})}
                  placeholder="Apartment, suite, etc."
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <Label>City</Label>
                  <Input
                    value={newCustomer.city}
                    onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                    placeholder="City"
                  />
                </div>
                <div>
                  <Label>Province</Label>
                  <Input
                    value={newCustomer.province}
                    onChange={(e) => setNewCustomer({...newCustomer, province: e.target.value})}
                    placeholder="Province"
                  />
                </div>
                <div>
                  <Label>Zip Code</Label>
                  <Input
                    value={newCustomer.zip}
                    onChange={(e) => setNewCustomer({...newCustomer, zip: e.target.value})}
                    placeholder="Zip Code"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Phone</Label>
                  <Input
                    value={newCustomer.phone}
                    onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                    placeholder="Phone Number"
                  />
                </div>
                <div>
                  <Label>Tags</Label>
                  <Input
                    value={newCustomer.tags}
                    onChange={(e) => setNewCustomer({...newCustomer, tags: e.target.value})}
                    placeholder="Tags (comma-separated)"
                  />
                </div>
              </div>
              <div>
                <Label>Notes</Label>
                <Input
                  value={newCustomer.note}
                  onChange={(e) => setNewCustomer({...newCustomer, note: e.target.value})}
                  placeholder="Additional notes"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setShowEditDialog(false);
                    setSelectedCustomer(null);
                    resetForm();
                  }}
                >
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateCustomer}
                  disabled={updateCustomerMutation.isPending}
                >
                  {updateCustomerMutation.isPending ? "Updating..." : "Update Customer"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { 
  ArrowLeft, 
  Users, 
  Search, 
  Plus, 
  Upload, 
  Download, 
  Edit2, 
  Trash2, 
  Mail, 
  Phone, 
  MapPin,
  Building,
  DollarSign,
  Package,
  Sheet
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/useDebounce";

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
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [filters, setFilters] = useState({
    city: '',
    province: '',
    emailMarketing: ''
  });
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    acceptsEmailMarketing: false,
    company: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    country: "Canada",
    zip: "",
    phone: "",
    note: "",
    tags: ""
  });

  const { toast } = useToast();

  // Fetch customers
  const { data: customers = [], isLoading: customersLoading, error: customersError } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    staleTime: 2 * 60 * 1000,
  });

  // CSV Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/admin/upload-customer-data', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      // Enhanced feedback with detailed statistics
      const details = [];
      if (data.stats?.newCustomers) details.push(`${data.stats.newCustomers} new customers added`);
      if (data.stats?.updatedCustomers) details.push(`${data.stats.updatedCustomers} customers updated`);
      if (data.stats?.errors) details.push(`${data.stats.errors} errors encountered`);
      
      toast({
        title: "Upload Completed",
        description: data.message || `Successfully processed customer data: ${details.join(', ')}`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Add customer mutation
  const addMutation = useMutation({
    mutationFn: async (customerData: any) => {
      return apiRequest("/api/customers", {
        method: "POST",
        body: JSON.stringify({
          ...customerData,
          id: `cust_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          totalSpent: 0,
          totalOrders: 0
        }),
      });
    },
    onSuccess: () => {
      toast({
        title: "Customer Added",
        description: "New customer has been added successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowAddDialog(false);
      resetNewCustomerForm();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update customer mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, customerData }: { id: string; customerData: any }) => {
      return apiRequest(`/api/customers/${id}`, {
        method: "PUT",
        body: JSON.stringify(customerData),
      });
    },
    onSuccess: () => {
      toast({
        title: "Customer Updated",
        description: "Customer information has been updated successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setEditingCustomer(null);
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Delete customer mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      return apiRequest(`/api/customers/${id}`, {
        method: "DELETE",
      });
    },
    onSuccess: () => {
      toast({
        title: "Customer Deleted",
        description: "Customer has been deleted successfully",
      });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const handleCsvUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith('.csv')) {
        toast({
          title: "Invalid File Type",
          description: "Please select a CSV file",
          variant: "destructive",
        });
        return;
      }
      uploadMutation.mutate(file);
    }
    event.target.value = '';
  };

  const resetNewCustomerForm = () => {
    setNewCustomer({
      firstName: "",
      lastName: "",
      email: "",
      acceptsEmailMarketing: false,
      company: "",
      address1: "",
      address2: "",
      city: "",
      province: "",
      country: "Canada",
      zip: "",
      phone: "",
      note: "",
      tags: ""
    });
  };

  const handleAddCustomer = () => {
    if (!newCustomer.firstName || !newCustomer.lastName || !newCustomer.email) {
      toast({
        title: "Required Fields Missing",
        description: "Please fill in first name, last name, and email",
        variant: "destructive",
      });
      return;
    }
    addMutation.mutate(newCustomer);
  };

  const handleUpdateCustomer = () => {
    if (!editingCustomer) return;
    updateMutation.mutate({ 
      id: editingCustomer.id, 
      customerData: editingCustomer 
    });
  };

  const handleDeleteCustomer = (id: string, customerName: string) => {
    if (confirm(`Are you sure you want to delete ${customerName}?`)) {
      deleteMutation.mutate(id);
    }
  };

  // Get unique values for filters
  const uniqueCities = useMemo(() => 
    Array.from(new Set(customers.map(c => c.city).filter(Boolean))).sort(), 
    [customers]
  );
  
  const uniqueProvinces = useMemo(() => 
    Array.from(new Set(customers.map(c => c.province).filter(Boolean))).sort(), 
    [customers]
  );

  // Filter and search customers
  const filteredCustomers = useMemo(() => {
    return customers.filter(customer => {
      const searchLower = debouncedSearchTerm.toLowerCase();
      const matchesSearch = !debouncedSearchTerm || 
        customer.firstName.toLowerCase().includes(searchLower) ||
        customer.lastName.toLowerCase().includes(searchLower) ||
        customer.email.toLowerCase().includes(searchLower) ||
        customer.company.toLowerCase().includes(searchLower) ||
        customer.phone.includes(searchLower);
      
      const matchesCity = !filters.city || customer.city === filters.city;
      const matchesProvince = !filters.province || customer.province === filters.province;
      const matchesEmailMarketing = !filters.emailMarketing || 
        (filters.emailMarketing === 'yes' && customer.acceptsEmailMarketing) ||
        (filters.emailMarketing === 'no' && !customer.acceptsEmailMarketing);
      
      return matchesSearch && matchesCity && matchesProvince && matchesEmailMarketing;
    });
  }, [customers, debouncedSearchTerm, filters]);

  // Export to CSV
  const handleExportCSV = () => {
    const csvHeaders = [
      'First Name', 'Last Name', 'Email', 'Company', 'Phone', 'Address', 'City', 
      'Province', 'Postal Code', 'Total Spent', 'Total Orders', 'Email Marketing', 'Notes', 'Tags'
    ];
    
    const csvData = filteredCustomers.map(customer => [
      customer.firstName,
      customer.lastName,
      customer.email,
      customer.company,
      customer.phone,
      `${customer.address1} ${customer.address2}`.trim(),
      customer.city,
      customer.province,
      customer.zip,
      customer.totalSpent,
      customer.totalOrders,
      customer.acceptsEmailMarketing ? 'Yes' : 'No',
      customer.note,
      customer.tags
    ]);
    
    const csvContent = [csvHeaders, ...csvData]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');
    
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `customers_export_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    toast({
      title: "Export Completed",
      description: `Exported ${filteredCustomers.length} customers to CSV`,
    });
  };

  if (customersError) {
    return (
      <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
        <div className="max-w-7xl mx-auto">
          <Card className="p-6">
            <div className="text-center text-red-600">
              <h2 className="text-lg font-semibold">Error Loading Customers</h2>
              <p className="mt-2">{customersError.message}</p>
            </div>
          </Card>
        </div>
      </div>
    );
  }

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
            <p className="text-gray-600">Manage customer data and upload CSV files to add new customers or update existing ones</p>
          </div>
          <div className="flex items-center gap-2">
            <label htmlFor="csv-upload-customers">
              <Button 
                variant="outline" 
                className="flex items-center gap-2 cursor-pointer"
                disabled={uploadMutation.isPending}
              >
                <Upload className="h-4 w-4" />
                {uploadMutation.isPending ? "Uploading..." : "Upload CSV"}
              </Button>
            </label>
            <input
              id="csv-upload-customers"
              type="file"
              accept=".csv"
              className="hidden"
              onChange={handleCsvUpload}
            />
            <Button
              onClick={handleExportCSV}
              className="flex items-center gap-2 btn-csv"
            >
              <Sheet className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </div>

        {/* CSV Upload Information */}
        <Card className="shadow-sm border-blue-200 bg-blue-50">
          <CardContent className="pt-6">
            <div className="flex items-start gap-3">
              <Upload className="h-5 w-5 text-blue-600 mt-0.5" />
              <div>
                <h3 className="font-medium text-blue-900 mb-1">CSV Upload Instructions</h3>
                <p className="text-sm text-blue-700 mb-2">
                  Upload CSV files to efficiently manage customer data. The system will:
                </p>
                <ul className="text-sm text-blue-700 space-y-1 list-disc list-inside">
                  <li><strong>Add new customers</strong> found in the CSV file</li>
                  <li><strong>Update existing customers</strong> with any new information provided</li>
                  <li><strong>Skip unchanged data</strong> to avoid unnecessary database operations</li>
                  <li><strong>Provide detailed feedback</strong> showing what was added, updated, or skipped</li>
                </ul>
                <p className="text-xs text-blue-600 mt-2">
                  Customers are matched by email address. Existing data is only updated when new information is provided.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Filters */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Search className="h-5 w-5" />
                Search & Filter Customers
              </div>
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button className="flex items-center gap-2">
                    <Plus className="h-4 w-4" />
                    Add Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-[500px]">
                  <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer({...newCustomer, lastName: e.target.value})}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="email">Email *</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="company">Company</Label>
                      <Input
                        id="company"
                        value={newCustomer.company}
                        onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={newCustomer.city}
                          onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="province">Province</Label>
                        <Input
                          id="province"
                          value={newCustomer.province}
                          onChange={(e) => setNewCustomer({...newCustomer, province: e.target.value})}
                        />
                      </div>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                      Cancel
                    </Button>
                    <Button 
                      onClick={handleAddCustomer}
                      disabled={addMutation.isPending}
                    >
                      {addMutation.isPending ? "Adding..." : "Add Customer"}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by name, email, company, or phone..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Filters */}
            <div className="flex flex-wrap gap-3 items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">City:</span>
                <Select 
                  value={filters.city || "all-cities"} 
                  onValueChange={(value) => setFilters({...filters, city: value === "all-cities" ? "" : value})}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-cities">All Cities</SelectItem>
                    {uniqueCities.map(city => (
                      <SelectItem key={city} value={city}>{city}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Province:</span>
                <Select 
                  value={filters.province || "all-provinces"} 
                  onValueChange={(value) => setFilters({...filters, province: value === "all-provinces" ? "" : value})}
                >
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-provinces">All Provinces</SelectItem>
                    {uniqueProvinces.map(province => (
                      <SelectItem key={province} value={province}>{province}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Email Marketing:</span>
                <Select 
                  value={filters.emailMarketing || "all-emails"} 
                  onValueChange={(value) => setFilters({...filters, emailMarketing: value === "all-emails" ? "" : value})}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all-emails">All</SelectItem>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Results Count */}
              <div className="text-sm text-gray-600 ml-auto">
                Showing {filteredCustomers.length} of {customers.length} customers
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Customers Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Customer Database
              <Badge variant="secondary" className="ml-2">
                {filteredCustomers.length} customers
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {customersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-600">Loading customers...</p>
              </div> 
            ) : filteredCustomers.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                {customers.length === 0 ? 
                  "No customers found. Upload a CSV file or add customers manually." :
                  "No customers match your search criteria."
                }
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Customer
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Company
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Contact Info
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Location
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Orders & Spend
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Marketing
                      </th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {filteredCustomers.map((customer) => (
                      <tr key={customer.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm font-medium text-gray-900">
                            {customer.firstName} {customer.lastName}
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {customer.email}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <Building className="h-3 w-3" />
                            {customer.company || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {customer.phone || "N/A"}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {customer.city}, {customer.province}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="text-sm text-gray-900 flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {customer.totalOrders} orders
                          </div>
                          <div className="text-sm text-gray-500 flex items-center gap-1">
                            <DollarSign className="h-3 w-3" />
                            ${customer.totalSpent.toFixed(2)}
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <Badge variant={customer.acceptsEmailMarketing ? "default" : "secondary"}>
                            {customer.acceptsEmailMarketing ? "Yes" : "No"}
                          </Badge>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                          <div className="flex items-center gap-2">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setEditingCustomer(customer)}
                            >
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleDeleteCustomer(customer.id, `${customer.firstName} ${customer.lastName}`)}
                              className="text-red-600 hover:text-red-700"
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Edit Customer Dialog */}
        {editingCustomer && (
          <Dialog open={true} onOpenChange={() => setEditingCustomer(null)}>
            <DialogContent className="sm:max-w-[600px]">
              <DialogHeader>
                <DialogTitle>Edit Customer</DialogTitle>
              </DialogHeader>
              <div className="grid gap-4 py-4 max-h-96 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input
                      value={editingCustomer.firstName}
                      onChange={(e) => setEditingCustomer({...editingCustomer, firstName: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input
                      value={editingCustomer.lastName}
                      onChange={(e) => setEditingCustomer({...editingCustomer, lastName: e.target.value})}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Email</Label>
                  <Input
                    type="email"
                    value={editingCustomer.email}
                    onChange={(e) => setEditingCustomer({...editingCustomer, email: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Company</Label>
                  <Input
                    value={editingCustomer.company}
                    onChange={(e) => setEditingCustomer({...editingCustomer, company: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <Label>Phone</Label>
                  <Input
                    value={editingCustomer.phone}
                    onChange={(e) => setEditingCustomer({...editingCustomer, phone: e.target.value})}
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input
                      value={editingCustomer.city}
                      onChange={(e) => setEditingCustomer({...editingCustomer, city: e.target.value})}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Province</Label>
                    <Input
                      value={editingCustomer.province}
                      onChange={(e) => setEditingCustomer({...editingCustomer, province: e.target.value})}
                    />
                  </div>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingCustomer(null)}>
                  Cancel
                </Button>
                <Button 
                  onClick={handleUpdateCustomer}
                  disabled={updateMutation.isPending}
                >
                  {updateMutation.isPending ? "Updating..." : "Update Customer"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>
    </div>
  );
}
import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Search, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useDebounce } from '@/hooks/useDebounce';

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  address1: string;
  address2: string;
  city: string;
  province: string;
  country: string;
  zip: string;
  phone: string;
  note: string;
  tags: string;
}

interface SearchableCustomerSelectProps {
  selectedCustomer: Customer | null;
  onCustomerSelect: (customer: Customer | null) => void;
  placeholder?: string;
  className?: string;
}

export default function SearchableCustomerSelect({
  selectedCustomer,
  onCustomerSelect,
  placeholder = "Search customers...",
  className = ""
}: SearchableCustomerSelectProps) {
  const [searchTerm, setSearchTerm] = useState("");
  const [showDropdown, setShowDropdown] = useState(false);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newCustomer, setNewCustomer] = useState({
    firstName: "",
    lastName: "",
    email: "",
    company: "",
    address1: "",
    address2: "",
    city: "",
    province: "",
    country: "US",
    zip: "",
    phone: "",
    note: "",
    tags: ""
  });

  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const { toast } = useToast();

  // Fetch customers
  const { data: customers = [], isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    staleTime: 2 * 60 * 1000,
  });

  // Filter customers based on search term - show all customers, search by company, name, or email
  const filteredCustomers = customers.filter(customer => {
    if (!debouncedSearchTerm) return true;
    
    const searchLower = debouncedSearchTerm.toLowerCase();
    const company = customer.company?.toLowerCase() || "";
    const fullName = `${customer.firstName || ''} ${customer.lastName || ''}`.toLowerCase().trim();
    const email = customer.email?.toLowerCase() || "";
    
    return company.includes(searchLower) || 
           fullName.includes(searchLower) || 
           email.includes(searchLower);
  }).slice(0, 15);

  // Set search term when customer is selected externally
  useEffect(() => {
    if (selectedCustomer) {
      setSearchTerm(selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`);
      setShowDropdown(false);
    }
  }, [selectedCustomer]);

  // Handle customer selection
  const handleCustomerSelect = (customer: Customer) => {
    onCustomerSelect(customer);
    setSearchTerm(customer.company || `${customer.firstName} ${customer.lastName}`);
    setShowDropdown(false);
  };

  // Handle input change
  const handleInputChange = (value: string) => {
    setSearchTerm(value);
    setShowDropdown(true);
    
    // Clear selection if input is cleared
    if (!value && selectedCustomer) {
      onCustomerSelect(null);
    }
  };

  // Handle creating new customer
  const handleCreateCustomer = async () => {
    try {
      if (!newCustomer.firstName || !newCustomer.lastName || !newCustomer.company) {
        toast({
          title: "Error",
          description: "First name, last name, and company are required",
          variant: "destructive"
        });
        return;
      }

      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: Date.now().toString(), // Simple ID generation
          ...newCustomer
        })
      });

      if (!response.ok) {
        throw new Error("Failed to create customer");
      }

      const createdCustomer = await response.json();
      
      // Select the newly created customer
      handleCustomerSelect(createdCustomer);
      
      // Reset form and close dialog
      setNewCustomer({
        firstName: "",
        lastName: "",
        email: "",
        company: "",
        address1: "",
        address2: "",
        city: "",
        province: "",
        country: "US",
        zip: "",
        phone: "",
        note: "",
        tags: ""
      });
      setShowAddDialog(false);

      toast({
        title: "Success",
        description: "Customer created successfully"
      });

    } catch (error) {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: "Failed to create customer",
        variant: "destructive"
      });
    }
  };

  return (
    <div className={`relative ${showDropdown ? 'z-50' : ''} ${className}`}>
      {/* Search Input */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
        <Input
          type="text"
          placeholder={placeholder}
          value={searchTerm}
          onChange={(e) => handleInputChange(e.target.value)}
          onFocus={() => setShowDropdown(true)}
          className="pl-10 pr-4 h-10 flex items-center"
        />
      </div>

      {/* Dropdown Results */}
      {showDropdown && (
        <Card className="absolute z-50 w-full mt-1 max-h-80 overflow-y-auto shadow-lg">
          <CardContent className="p-2">
            {isLoading ? (
              <div className="p-3 text-center text-sm text-gray-500">
                Loading customers...
              </div>
            ) : filteredCustomers.length > 0 ? (
              <div className="space-y-1">
                {filteredCustomers.map((customer) => {
                  const displayName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email || 'Unknown';
                  const subtitle = customer.company 
                    ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || customer.email
                    : customer.email;
                  return (
                    <div
                      key={customer.id}
                      onClick={() => handleCustomerSelect(customer)}
                      className="p-2 hover:bg-gray-50 cursor-pointer rounded-lg border border-transparent hover:border-blue-200 transition-colors"
                    >
                      <div className="flex items-center space-x-3">
                        <Building className="h-4 w-4 text-blue-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm text-gray-900 truncate">
                            {displayName}
                          </div>
                          {subtitle && subtitle !== displayName && (
                            <div className="text-xs text-gray-500 truncate">
                              {subtitle}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : debouncedSearchTerm ? (
              <div className="p-3 text-center text-sm text-gray-500">
                No customers found matching "{debouncedSearchTerm}"
              </div>
            ) : (
              <div className="p-3 text-center text-sm text-gray-500">
                Start typing to search customers
              </div>
            )}

            {/* Add New Customer Button */}
            <div className="border-t pt-2 mt-2">
              <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
                <DialogTrigger asChild>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="w-full justify-start"
                    onClick={() => setShowDropdown(false)}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Add New Customer
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Customer</DialogTitle>
                  </DialogHeader>
                  
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="firstName">First Name *</Label>
                        <Input
                          id="firstName"
                          value={newCustomer.firstName}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, firstName: e.target.value }))}
                          placeholder="John"
                        />
                      </div>
                      <div>
                        <Label htmlFor="lastName">Last Name *</Label>
                        <Input
                          id="lastName"
                          value={newCustomer.lastName}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, lastName: e.target.value }))}
                          placeholder="Doe"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="company">Company *</Label>
                      <Input
                        id="company"
                        value={newCustomer.company}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, company: e.target.value }))}
                        placeholder="Company Name"
                      />
                    </div>

                    <div>
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        value={newCustomer.email}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="john@company.com"
                      />
                    </div>

                    <div>
                      <Label htmlFor="phone">Phone</Label>
                      <Input
                        id="phone"
                        value={newCustomer.phone}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, phone: e.target.value }))}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div>
                      <Label htmlFor="address1">Address</Label>
                      <Input
                        id="address1"
                        value={newCustomer.address1}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, address1: e.target.value }))}
                        placeholder="123 Main Street"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="city">City</Label>
                        <Input
                          id="city"
                          value={newCustomer.city}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, city: e.target.value }))}
                          placeholder="New York"
                        />
                      </div>
                      <div>
                        <Label htmlFor="province">State/Province</Label>
                        <Input
                          id="province"
                          value={newCustomer.province}
                          onChange={(e) => setNewCustomer(prev => ({ ...prev, province: e.target.value }))}
                          placeholder="NY"
                        />
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="note">Notes</Label>
                      <Textarea
                        id="note"
                        value={newCustomer.note}
                        onChange={(e) => setNewCustomer(prev => ({ ...prev, note: e.target.value }))}
                        placeholder="Additional notes..."
                        rows={3}
                      />
                    </div>

                    <div className="flex justify-end space-x-2 pt-4">
                      <Button variant="outline" onClick={() => setShowAddDialog(false)}>
                        Cancel
                      </Button>
                      <Button onClick={handleCreateCustomer}>
                        Create Customer
                      </Button>
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Click outside to close dropdown */}
      {showDropdown && (
        <div 
          className="fixed inset-0 z-40" 
          onClick={() => setShowDropdown(false)}
        />
      )}
    </div>
  );
}
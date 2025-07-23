import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Download, DollarSign, Package, FileText, ChevronDown, FileDown, User, Sheet, Hash } from "lucide-react";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { filterTiersByRole, getUserRoleFromEmail } from "@/utils/roleBasedTiers";

// Utility function to apply brand-specific fonts to individual words
const applyBrandFonts = (text: string): JSX.Element => {
  const words = text.split(' ');
  
  return (
    <>
      {words.map((word, index) => {
        const lowerWord = word.toLowerCase();
        let className = '';
        
        if (lowerWord.includes('graffiti')) {
          className = 'font-graffiti';
        } else if (lowerWord.includes('solvit')) {
          className = 'font-solvit';
        } else if (lowerWord.includes('cliq')) {
          className = 'font-cliq';
        } else if (lowerWord.includes('rang')) {
          className = 'font-rang';
        } else if (lowerWord.includes('ele') || lowerWord.includes('eie')) {
          className = 'font-ele';
        } else if (lowerWord.includes('polyester') || lowerWord.includes('paper') || lowerWord.includes('blended') || lowerWord.includes('poly') || lowerWord.includes('stick')) {
          className = 'font-ele';
        }
        
        return (
          <span key={index} className={className}>
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </>
  );
};

// Utility function to round retail prices to .99 cents
const roundToNinetyNine = (price: number): number => {
  return Math.floor(price) + 0.99;
};

interface ProductCategory {
  id: number;
  name: string;
  description: string;
}

interface ProductType {
  id: number;
  categoryId: number;
  name: string;
  description: string;
}

interface ProductSize {
  id: number;
  typeId: number;
  name: string;
  width: string;
  height: string;
  widthUnit: string;
  heightUnit: string;
  squareMeters: string;
  itemCode: string;
  minOrderQty: string;
}

interface PricingTier {
  id: number;
  name: string;
  description: string;
  minSquareMeters: string;
  maxSquareMeters: string;
  pricePerSquareMeter: string;
}

interface ProductPricing {
  id: number;
  productTypeId: number;
  tierId: number;
  pricePerSquareMeter: string;
}

interface PriceListItem {
  size: ProductSize;
  type: ProductType;
  pricing: ProductPricing[];
}

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

export default function PriceList() {
  const { user } = useAuth();
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [showPriceList, setShowPriceList] = useState<boolean>(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [selectedCustomer, setSelectedCustomer] = useState<string>("");
  const [showDownloadDialog, setShowDownloadDialog] = useState<boolean>(false);
  const [showNewCustomerDialog, setShowNewCustomerDialog] = useState<boolean>(false);
  const [downloadType, setDownloadType] = useState<"pdf" | "csv">("pdf");
  const [currentQuoteNumber, setCurrentQuoteNumber] = useState<string>("");
  const [newCustomer, setNewCustomer] = useState({
    company: "",
    address1: "",
    city: "",
    province: "",
    zip: "",
    firstName: "",
    phone: "",
    email: ""
  });
  const { toast } = useToast();

  // Fetch all data
  const { data: categories = [], isLoading: categoriesLoading } = useQuery<ProductCategory[]>({
    queryKey: ["/api/product-categories"],
  });

  const { data: customers = [], isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
  });

  // Fetch category-specific data only when category is selected
  const { data: categoryTypes = [], isLoading: categoryTypesLoading } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types", selectedCategory],
    enabled: !!selectedCategory,
  });

  const { data: allSizes = [], isLoading: allSizesLoading } = useQuery<ProductSize[]>({
    queryKey: ["/api/product-sizes"],
    enabled: !!selectedCategory,
  });

  const { data: allPricing = [], isLoading: allPricingLoading } = useQuery<ProductPricing[]>({
    queryKey: ["/api/product-pricing"],
    enabled: !!selectedCategory,
  });

  const isLoading = categoriesLoading || tiersLoading || customersLoading ||
    (selectedCategory && (categoryTypesLoading || allSizesLoading || allPricingLoading));

  // Get filtered pricing tiers based on user role and hide zero-price tiers
  const getFilteredPricingTiers = () => {
    if (!tiers || !allPricing || !user) return [];
    
    const userRole = getUserRoleFromEmail((user as any).email);
    const roleFilteredTiers = filterTiersByRole(tiers, userRole);
    
    // If no category selected, return all role-filtered tiers
    if (!selectedCategory) return roleFilteredTiers;
    
    // Filter out tiers with zero pricing for any product in the selected category
    return roleFilteredTiers.filter(tier => {
      const hasNonZeroPricing = allPricing.some(p => 
        p.tierId === tier.id && parseFloat(p.pricePerSquareMeter) > 0
      );
      return hasNonZeroPricing;
    });
  };

  // Get selected category data
  const selectedCategoryData = categories.find((c: ProductCategory) => c.id === parseInt(selectedCategory));
  const selectedTierData = getFilteredPricingTiers().find(t => t.id === parseInt(selectedTier));
  const selectedCustomerData = customers.find((c: Customer) => c.id === selectedCustomer);

  // Create price list items for selected category
  const priceListItems: PriceListItem[] = selectedCategory && selectedTier ? 
    categoryTypes.flatMap((type: ProductType) => {
      const typeSizes = allSizes.filter((size: ProductSize) => size.typeId === type.id);
      const typePricing = allPricing.filter((p: ProductPricing) => p.productTypeId === type.id);
      
      return typeSizes.map((size: ProductSize) => ({
        size,
        type,
        pricing: typePricing
      }));
    }) : [];

  // Get price per square meter from CSV (original pricing data)
  const getPricePerSqm = (item: PriceListItem, tierId: number) => {
    const tierPricing = item.pricing.find((p: ProductPricing) => p.tierId === tierId);
    if (tierPricing) {
      return parseFloat(tierPricing.pricePerSquareMeter);
    }
    return 0;
  };

  // Get actual price per sheet (sq.m price × square meters per sheet)
  const getPricePerSheet = (item: PriceListItem, tierId: number) => {
    const pricePerSqm = getPricePerSqm(item, tierId);
    const squareMeters = parseFloat(item.size.squareMeters);
    return pricePerSqm * squareMeters;
  };

  // Get price per pack (price per sheet × min order quantity) with rounding for retail
  const getPricePerPack = (item: PriceListItem, tierId: number) => {
    const pricePerSheet = getPricePerSheet(item, tierId);
    const minOrderQty = Number(item.size.minOrderQty) || 50;
    const basePackPrice = pricePerSheet * minOrderQty;
    
    // Apply 99-cent rounding only to pack price for retail pricing tier
    const adjustedPackPrice = selectedTierData?.name?.toLowerCase().includes('retail') 
      ? roundToNinetyNine(basePackPrice) 
      : basePackPrice;
      
    return adjustedPackPrice;
  };

  // Generate price list function
  const generatePriceList = () => {
    if (!selectedCategory || !selectedTier || !selectedCustomer) {
      toast({
        title: "Missing Selection",
        description: "Please select a product category, pricing tier, and customer.",
        variant: "destructive",
      });
      return;
    }
    
    // Generate a quote number for this price list
    const quoteNumber = `4SG-${Date.now().toString().slice(-8)}-${Math.random().toString(36).substr(2, 3).toUpperCase()}`;
    setCurrentQuoteNumber(quoteNumber);
    setShowPriceList(true);
    setSelectedRows(new Set());
  };

  // Create new customer
  const createNewCustomer = async () => {
    if (!newCustomer.company || !newCustomer.firstName || !newCustomer.email) {
      toast({
        title: "Missing Information",
        description: "Please fill in company name, contact name, and email.",
        variant: "destructive",
      });
      return;
    }

    try {
      const customerId = `customer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const customerData = {
        id: customerId,
        company: newCustomer.company,
        address1: newCustomer.address1,
        city: newCustomer.city,
        province: newCustomer.province,
        zip: newCustomer.zip,
        firstName: newCustomer.firstName,
        lastName: "", // Not collected in this form
        phone: newCustomer.phone,
        email: newCustomer.email,
        acceptsEmailMarketing: false,
        address2: "",
        country: "Canada",
        totalSpent: 0,
        totalOrders: 0,
        note: "",
        tags: "",
      };

      const response = await apiRequest("POST", "/api/customers", customerData);
      
      if (response.ok) {
        const createdCustomer = await response.json();
        
        // Invalidate customers cache to refresh the list
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
        
        // Reset the form
        setNewCustomer({
          company: "",
          address1: "",
          city: "",
          province: "",
          zip: "",
          firstName: "",
          phone: "",
          email: ""
        });
        
        // Select the new customer
        setSelectedCustomer(createdCustomer.id);
        
        // Close the dialog
        setShowNewCustomerDialog(false);
        
        toast({
          title: "Customer Created",
          description: "New customer has been added successfully.",
        });
      } else {
        throw new Error("Failed to create customer");
      }
    } catch (error) {
      console.error("Error creating customer:", error);
      toast({
        title: "Error",
        description: "Failed to create customer. Please try again.",
        variant: "destructive",
      });
    }
  };

  // Row selection handlers
  const handleRowToggle = (rowId: string) => {
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(rowId)) {
      newSelectedRows.delete(rowId);
    } else {
      newSelectedRows.add(rowId);
    }
    setSelectedRows(newSelectedRows);
  };

  const handleSelectAllRows = () => {
    const allRowIds = priceListItems.map(item => `${item.size.id}-${item.type.id}`);
    setSelectedRows(new Set(allRowIds));
  };

  const handleDeselectAllRows = () => {
    setSelectedRows(new Set());
  };

  // Download functions
  const handleDownload = async (type: "pdf" | "csv") => {
    if (type === "pdf" && !selectedCustomer) {
      toast({
        title: "No Company Name Found",
        description: "Please select a customer before downloading PDF.",
        variant: "destructive",
      });
      return;
    }

    const selectedItems = selectedRows.size > 0 
      ? priceListItems.filter(item => selectedRows.has(`${item.size.id}-${item.type.id}`))
      : priceListItems;

    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one item to download.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (type === "pdf") {
        await downloadPDF(selectedItems);
      } else {
        await downloadCSV(selectedItems);
      }
      setShowDownloadDialog(false);
      
      // Show quote number in success message
      toast({
        title: "Download Complete",
        description: `Price list downloaded successfully. Quote: ${currentQuoteNumber}`,
        duration: 5000,
      });
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to generate download. Please try again.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = async (items: PriceListItem[]) => {
    const response = await fetch('/api/generate-price-list-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: selectedCustomerData?.company || null,
        categoryName: selectedCategoryData?.name,
        tierName: selectedTierData?.name,
        quoteNumber: currentQuoteNumber,
        items: items.map(item => ({
          size: item.size,
          type: item.type,
          pricing: item.pricing.find(p => p.tierId === parseInt(selectedTier))
        }))
      })
    });

    if (!response.ok) throw new Error('Failed to generate PDF');

    const data = await response.json();
    const { html, filename } = data;

    // Create blob-based download for true file save
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename || `price-list-${currentQuoteNumber || 'download'}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    
    // Clean up the URL object
    URL.revokeObjectURL(url);

    // Show success toast
    toast({
      title: "Price list downloaded",
      description: `Price list has been downloaded successfully as ${filename}`,
      duration: 5000,
    });
  };

  const downloadCSV = async (items: PriceListItem[]) => {
    const response = await fetch('/api/generate-price-list-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: selectedCustomerData?.company || null,
        categoryName: selectedCategoryData?.name,
        tierName: selectedTierData?.name,
        quoteNumber: currentQuoteNumber,
        items: items.map(item => ({
          size: item.size,
          type: item.type,
          pricing: item.pricing.find(p => p.tierId === parseInt(selectedTier))
        }))
      })
    });

    if (!response.ok) throw new Error('Failed to generate CSV');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCategoryData?.name}_${selectedCustomerData?.company ? selectedCustomerData.company.replace(/[^a-zA-Z0-9]/g, '_') : 'PriceList'}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="py-4 sm:py-8 px-3 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center sm:text-center flex-1">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
              <FileText className="h-6 w-6 sm:h-8 sm:w-8" />
              Price List
            </h1>
            <p className="text-gray-600">Generate comprehensive product pricing lists</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Configuration Section */}
        {!showPriceList && (
          <Card className="shadow-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-bold text-gray-900">Configure Standard Price List</CardTitle>
              <p className="text-gray-600">Select a product and pricing tier to generate the list.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Select Product */}
              <div className="space-y-3">
                <label className="block text-base font-medium text-gray-900">Select Product</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full h-12 text-base">
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category: ProductCategory) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {applyBrandFonts(category.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Select Pricing Tier */}
              <div className="space-y-3">
                <label className="block text-base font-medium text-gray-900">Select Pricing Tier</label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger className="w-full h-12 text-base">
                    <SelectValue placeholder="Choose a pricing tier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {getFilteredPricingTiers().map(tier => (
                      <SelectItem key={tier.id} value={tier.id.toString()}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Select Customer */}
              <div className="space-y-3">
                <label className="block text-base font-medium text-gray-900">Select Customer</label>
                <div className="flex gap-2">
                  <SearchableCustomerSelect
                    customers={customers}
                    selectedCustomer={selectedCustomer}
                    onCustomerSelect={setSelectedCustomer}
                    onNewCustomer={() => setShowNewCustomerDialog(true)}
                    placeholder="Search and select customer..."
                  />
                  <Dialog open={showNewCustomerDialog} onOpenChange={setShowNewCustomerDialog}>
                    <DialogTrigger asChild>
                      <Button variant="outline" className="h-12 px-6" style={{ display: 'none' }}>
                        <User className="h-4 w-4 mr-2" />
                        New Customer
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-md">
                      <DialogHeader>
                        <DialogTitle>Create New Customer</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Company Name *</label>
                            <Input
                              value={newCustomer.company}
                              onChange={(e) => setNewCustomer({...newCustomer, company: e.target.value})}
                              placeholder="Company Name"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Contact Name *</label>
                            <Input
                              value={newCustomer.firstName}
                              onChange={(e) => setNewCustomer({...newCustomer, firstName: e.target.value})}
                              placeholder="Contact Name"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="text-sm font-medium">Address</label>
                          <Input
                            value={newCustomer.address1}
                            onChange={(e) => setNewCustomer({...newCustomer, address1: e.target.value})}
                            placeholder="Street Address"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="text-sm font-medium">City</label>
                            <Input
                              value={newCustomer.city}
                              onChange={(e) => setNewCustomer({...newCustomer, city: e.target.value})}
                              placeholder="City"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">State</label>
                            <Input
                              value={newCustomer.province}
                              onChange={(e) => setNewCustomer({...newCustomer, province: e.target.value})}
                              placeholder="State"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Zip</label>
                            <Input
                              value={newCustomer.zip}
                              onChange={(e) => setNewCustomer({...newCustomer, zip: e.target.value})}
                              placeholder="Zip Code"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          <div>
                            <label className="text-sm font-medium">Phone</label>
                            <Input
                              value={newCustomer.phone}
                              onChange={(e) => setNewCustomer({...newCustomer, phone: e.target.value})}
                              placeholder="Phone Number"
                            />
                          </div>
                          <div>
                            <label className="text-sm font-medium">Email *</label>
                            <Input
                              value={newCustomer.email}
                              onChange={(e) => setNewCustomer({...newCustomer, email: e.target.value})}
                              placeholder="Email Address"
                            />
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowNewCustomerDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={createNewCustomer}>
                            Create Customer
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>

              {/* Generate Button */}
              <Button 
                onClick={generatePriceList} 
                className="w-full h-12 text-base bg-purple-600 hover:bg-purple-700" 
                disabled={!selectedCategory || !selectedTier || !selectedCustomer}
              >
                Generate Price List
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Price List Results */}
        {showPriceList && selectedCategoryData && selectedTierData && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5" />
                    Price List - {applyBrandFonts(selectedCategoryData.name)}
                  </CardTitle>
                  <div className="flex items-center gap-4 mt-1">
                    <p className="text-sm text-gray-600">
                      Pricing tier: <Badge variant="secondary">{selectedTierData.name}</Badge>
                    </p>
                    {currentQuoteNumber && (
                      <p className="text-sm text-gray-600">
                        <Hash className="h-4 w-4 inline mr-1" />
                        Quote: <Badge variant="outline" className="font-mono">{currentQuoteNumber}</Badge>
                      </p>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
                    <DialogTrigger asChild>
                      <Button className="btn-pdf flex items-center gap-2">
                        <FileDown className="h-4 w-4" />
                        Download PDF
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Download Price List</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Customer</label>
                          <div className="p-3 bg-gray-50 rounded-md">
                            <p className="font-medium">{selectedCustomerData?.company}</p>
                            <p className="text-sm text-gray-600">{selectedCustomerData?.firstName} {selectedCustomerData?.lastName}</p>
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Download Type</label>
                          <Select value={downloadType} onValueChange={(value: "pdf" | "csv") => setDownloadType(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pdf">PDF</SelectItem>
                              <SelectItem value="csv">CSV</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-sm text-gray-600">
                          {selectedRows.size > 0 ? (
                            <span>{selectedRows.size} rows selected</span>
                          ) : (
                            <span>All rows will be downloaded</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowDownloadDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            onClick={() => handleDownload(downloadType)}
                            className={downloadType === 'pdf' ? 'btn-pdf' : 'btn-csv'}
                          >
                            {downloadType === 'pdf' ? (
                              <>
                                <FileDown className="h-4 w-4 mr-2" />
                                Download PDF
                              </>
                            ) : (
                              <>
                                <Sheet className="h-4 w-4 mr-2" />
                                Export CSV
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    onClick={() => {
                      setDownloadType("csv");
                      setShowDownloadDialog(true);
                    }}
                    className="btn-csv flex items-center gap-2"
                  >
                    <Sheet className="h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {priceListItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No items found for this product category and pricing tier.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {priceListItems.length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSelectAllRows}
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleDeselectAllRows}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  
                  {/* Group items by product type */}
                  {categoryTypes.map((type: ProductType) => {
                    const typeItems = priceListItems.filter(item => item.type.id === type.id);
                    if (typeItems.length === 0) return null;
                    
                    return (
                      <div key={type.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b">
                          <h3 className="font-medium text-gray-900">{applyBrandFonts(type.name)}</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-medium text-gray-700 w-12">
                                  <Checkbox 
                                    checked={typeItems.every(item => selectedRows.has(`${item.size.id}-${item.type.id}`))}
                                    onCheckedChange={(checked) => {
                                      const typeRowIds = typeItems.map(item => `${item.size.id}-${item.type.id}`);
                                      const newSelectedRows = new Set(selectedRows);
                                      if (checked) {
                                        typeRowIds.forEach(id => newSelectedRows.add(id));
                                      } else {
                                        typeRowIds.forEach(id => newSelectedRows.delete(id));
                                      }
                                      setSelectedRows(newSelectedRows);
                                    }}
                                  />
                                </th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Size</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Item Code</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Min Qty</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-700">Price/Sq.M</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-700">Price/Sheet</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-700">Price Per Pack</th>
                              </tr>
                            </thead>
                            <tbody>
                              {typeItems.map((item, index) => {
                                const pricePerSqm = getPricePerSqm(item, parseInt(selectedTier));
                                const pricePerSheet = getPricePerSheet(item, parseInt(selectedTier));
                                const pricePerPack = getPricePerPack(item, parseInt(selectedTier));
                                
                                const rowId = `${item.size.id}-${item.type.id}`;
                                
                                return (
                                  <tr key={`${item.size.id}-${index}`} className={`border-b border-gray-100 hover:bg-gray-50 ${selectedRows.has(rowId) ? 'bg-blue-50' : ''}`}>
                                    <td className="py-3 px-4">
                                      <Checkbox
                                        checked={selectedRows.has(rowId)}
                                        onCheckedChange={() => handleRowToggle(rowId)}
                                      />
                                    </td>
                                    <td className="py-3 px-4 text-sm">{item.size.name}</td>
                                    <td className="py-3 px-4 text-sm">
                                      <Badge variant="secondary" className="text-xs">
                                        {item.size.itemCode}
                                      </Badge>
                                    </td>
                                    <td className="py-3 px-4 text-sm">{item.size.minOrderQty}</td>
                                    <td className="py-3 px-4 text-sm text-right font-medium">
                                      ${pricePerSqm.toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-right font-medium">
                                      ${pricePerSheet.toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-right font-bold text-green-600">
                                      ${pricePerPack.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, ArrowLeft, User, Mail, FileText } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { filterTiersByRole, getUserRoleFromEmail } from "@/utils/roleBasedTiers";
import { useQuoteNumber } from "@/hooks/useQuoteNumber";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";

// Type definitions
interface ProductCategory {
  id: number;
  name: string;
}

interface ProductType {
  id: number;
  categoryId: number;
  name: string;
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
  itemCode: string | null;
  minOrderQty: string | null;
}

interface PricingTier {
  id: number;
  name: string;
  description: string | null;
}

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

interface QuoteItem {
  id: string;
  productBrand: string;
  productType: string;
  productSize: string;
  squareMeters: number;
  pricePerSheet: number;
  quantity: number;
  total: number;
  tierId: number;
  tierName: string;
  minOrderQty: string;
  itemCode: string;
}

export default function QuoteCalculator() {
  const { user } = useAuth();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const { toast } = useToast();

  // Auto-fill customer information when a customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      setCustomerName(`${selectedCustomer.firstName} ${selectedCustomer.lastName}`);
      setCustomerEmail(selectedCustomer.email || "");
    } else {
      setCustomerName("");
      setCustomerEmail("");
      setSalesRep("");
    }
  }, [selectedCustomer]);

  // Data queries
  const { data: categories } = useQuery<ProductCategory[]>({
    queryKey: ["/api/product-categories"],
  });

  const { data: types } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types", selectedCategory],
    enabled: !!selectedCategory,
  });

  const { data: sizes } = useQuery<ProductSize[]>({
    queryKey: ["/api/product-sizes", selectedType],
    enabled: !!selectedType,
  });

  const { data: pricingTiers } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
  });

  // Filter pricing tiers based on user role
  const getFilteredPricingTiers = () => {
    if (!pricingTiers || !user) return [];
    const userRole = getUserRoleFromEmail((user as any).email);
    return filterTiersByRole(pricingTiers, userRole);
  };

  // Add item to quote
  const addToQuote = async () => {
    if (!selectedSize || !selectedTier || !quantity) {
      toast({
        title: "Missing Information",
        description: "Please select a product size, pricing tier, and quantity.",
        variant: "destructive"
      });
      return;
    }

    try {
      // Validate square meters
      const squareMeters = parseFloat(selectedSize.squareMeters);
      if (isNaN(squareMeters) || squareMeters <= 0) {
        throw new Error("Invalid product size dimensions. Please contact admin to fix product data.");
      }
      
      // Debug logging
      console.log("Fetching price for:", {
        squareMeters: squareMeters,
        typeId: selectedType,
        tierId: selectedTier,
        sizeId: selectedSize.id
      });
      
      // Calculate price
      const response = await fetch(`/api/price/${squareMeters}/${selectedType}/${selectedTier}?sizeId=${selectedSize.id}`);
      const priceData = await response.json();
      
      if (!response.ok) {
        throw new Error(priceData.error || "Failed to calculate price");
      }

      const categoryName = categories?.find(c => c.id.toString() === selectedCategory)?.name || "";
      const typeName = types?.find(t => t.id.toString() === selectedType)?.name || "";
      const tierName = pricingTiers?.find(t => t.id.toString() === selectedTier)?.name || "";
      
      const minOrderQty = parseInt(selectedSize.minOrderQty || "0") || 1;
      const actualQuantity = Math.max(quantity, minOrderQty);
      
      const newItem: QuoteItem = {
        id: Date.now().toString(),
        productBrand: categoryName,
        productType: typeName,
        productSize: selectedSize.name,
        squareMeters: parseFloat(selectedSize.squareMeters),
        pricePerSheet: priceData.pricePerSqm,
        quantity: actualQuantity,
        total: priceData.pricePerSqm * actualQuantity,
        tierId: parseInt(selectedTier),
        tierName: tierName,
        minOrderQty: selectedSize.minOrderQty || "1",
        itemCode: selectedSize.itemCode || ""
      };

      setQuoteItems([...quoteItems, newItem]);
      
      // Reset form
      setSelectedCategory("");
      setSelectedType("");
      setSelectedSize(null);
      setSelectedTier("");
      setQuantity(1);

      toast({
        title: "Success",
        description: "Item added to quote successfully"
      });

    } catch (error) {
      console.error("Error adding item to quote:", error);
      toast({
        title: "Error",
        description: "Failed to add item to quote",
        variant: "destructive"
      });
    }
  };

  const removeFromQuote = (itemId: string) => {
    setQuoteItems(quoteItems.filter(item => item.id !== itemId));
  };

  const getTotalAmount = () => {
    return quoteItems.reduce((sum, item) => sum + item.total, 0);
  };

  // Generate and download PDF
  const generateAndDownloadPDF = async () => {
    if (quoteItems.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the quote before generating PDF",
        variant: "destructive"
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: "No Customer Selected",
        description: "Please select a customer before generating PDF",
        variant: "destructive"
      });
      return;
    }

    try {
      const quoteNumber = `QC-${Date.now()}`;
      const quoteData = {
        quoteNumber,
        customerName: `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
        customerEmail: selectedCustomer.email,
        customerCompany: selectedCustomer.company,
        customerAddress: `${selectedCustomer.address1} ${selectedCustomer.city}, ${selectedCustomer.province} ${selectedCustomer.zip}`,
        items: quoteItems,
        totalAmount: getTotalAmount(),
        createdAt: new Date().toISOString(),
      };

      const response = await fetch('/api/generate-quote-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(quoteData),
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `Quote_${quoteNumber}.pdf`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      toast({
        title: "PDF Generated",
        description: "Quote PDF has been downloaded successfully"
      });

    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  };

  // Email quote
  const emailQuote = async () => {
    if (quoteItems.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to the quote before emailing",
        variant: "destructive"
      });
      return;
    }

    if (!selectedCustomer || !selectedCustomer.email) {
      toast({
        title: "No Customer Email",
        description: "Please select a customer with a valid email address",
        variant: "destructive"
      });
      return;
    }

    const quoteNumber = `QC-${Date.now()}`;
    const subject = `Quote ${quoteNumber} from 4S Graphics`;
    const body = `Dear ${selectedCustomer.firstName},\n\nPlease find attached your quote from 4S Graphics.\n\nQuote Details:\n${quoteItems.map(item => 
      `• ${item.productType} (${item.productSize}) - Qty: ${item.quantity} - $${item.total.toFixed(2)}`
    ).join('\n')}\n\nTotal: $${getTotalAmount().toFixed(2)}\n\nThank you for your business!\n\nBest regards,\n4S Graphics Team`;

    const mailtoLink = `mailto:${selectedCustomer.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailtoLink;

    toast({
      title: "Email Opened",
      description: "Email client opened with quote details"
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-purple-50 p-4 sm:p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <Link href="/dashboard">
            <Button variant="outline" size="sm" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center sm:text-center flex-1">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">QuickQuotes</h1>
            <p className="text-sm sm:text-base text-gray-600">Calculate accurate quotes for your products</p>
          </div>
          <div className="hidden sm:block w-32"></div>
        </div>
        
        {/* Customer Selection Section */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <User className="h-5 w-5" />
              Select Customer
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              Search for and select a customer to associate with this quote.
            </p>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <div className="space-y-2">
                <Label htmlFor="customer-search">Search Customer</Label>
                <SearchableCustomerSelect
                  selectedCustomer={selectedCustomer}
                  onCustomerSelect={setSelectedCustomer}
                  placeholder="Type customer name, company, or email..."
                  className="w-full"
                />
              </div>
              
              {/* Selected Customer Info */}
              {selectedCustomer && (
                <div className="space-y-2">
                  <Label>Selected Customer</Label>
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                    <div className="font-medium text-blue-900">
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </div>
                    <div className="text-blue-700">{selectedCustomer.company}</div>
                    {selectedCustomer.email && (
                      <div className="text-blue-600 text-sm">{selectedCustomer.email}</div>
                    )}
                    {selectedCustomer.phone && (
                      <div className="text-blue-600 text-sm">{selectedCustomer.phone}</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Product Selection */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Product Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Category Selection */}
              <div className="space-y-2">
                <Label>Product Category</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Selection */}
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType} disabled={!selectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {types?.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Size Selection */}
              <div className="space-y-2">
                <Label>Product Size</Label>
                <Select 
                  value={selectedSize?.id?.toString() || ""} 
                  onValueChange={(value) => {
                    const size = sizes?.find(s => s.id.toString() === value);
                    setSelectedSize(size || null);
                  }}
                  disabled={!selectedType}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes?.map((size) => (
                      <SelectItem key={size.id} value={size.id.toString()}>
                        {size.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Pricing Tier */}
              <div className="space-y-2">
                <Label>Pricing Tier</Label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {getFilteredPricingTiers().map((tier) => (
                      <SelectItem key={tier.id} value={tier.id.toString()}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Quantity and Add Button */}
            <div className="flex items-end gap-4">
              <div className="space-y-2">
                <Label>Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  className="w-24"
                />
              </div>
              <Button onClick={addToQuote} disabled={!selectedSize || !selectedTier}>
                Add to Quote
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Quote Items */}
        {quoteItems.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Quote Items</span>
                <div className="flex gap-2">
                  <Button onClick={emailQuote} className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </Button>
                  <Button onClick={generateAndDownloadPDF} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Download PDF
                  </Button>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {quoteItems.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex-1">
                      <div className="font-medium">{item.productType}</div>
                      <div className="text-sm text-gray-600">{item.productSize}</div>
                      <div className="text-sm text-gray-500">
                        Quantity: {item.quantity} | Tier: {item.tierName}
                        {item.itemCode && ` | Code: ${item.itemCode}`}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold">${item.total.toFixed(2)}</div>
                      <div className="text-sm text-gray-600">${item.pricePerSheet.toFixed(2)}/sheet</div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => removeFromQuote(item.id)}
                      className="ml-4"
                    >
                      Remove
                    </Button>
                  </div>
                ))}
                
                <div className="border-t pt-4">
                  <div className="flex justify-between items-center">
                    <span className="text-lg font-semibold">Total Amount:</span>
                    <span className="text-xl font-bold text-green-600">
                      ${getTotalAmount().toFixed(2)}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
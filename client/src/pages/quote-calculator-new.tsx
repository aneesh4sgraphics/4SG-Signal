import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Calculator, ArrowLeft, User, Mail, FileText, Plus, Trash2, Sparkles } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { useAuth } from "@/hooks/useAuth";
import { filterTiersByRole, getUserRoleFromEmail } from "@/utils/roleBasedTiers";

// Utility function to apply brand-specific fonts
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

interface TierPricing {
  tierId: number;
  tierName: string;
  pricePerSqm: number;
  pricePerSheet: number;
  minOrderPrice: number;
}

export default function QuoteCalculator() {
  const { user } = useAuth();
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [tierPricing, setTierPricing] = useState<TierPricing[]>([]);
  const { toast } = useToast();

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

  // Load tier pricing when size is selected
  useEffect(() => {
    if (selectedSize && selectedType) {
      loadTierPricing();
    }
  }, [selectedSize, selectedType]);

  const loadTierPricing = async () => {
    if (!selectedSize || !selectedType) return;

    const squareMeters = parseFloat(selectedSize.squareMeters);
    if (isNaN(squareMeters) || squareMeters <= 0) {
      setTierPricing([]);
      return;
    }

    const filteredTiers = getFilteredPricingTiers();
    const pricing: TierPricing[] = [];

    for (const tier of filteredTiers) {
      try {
        const response = await fetch(`/api/price/${squareMeters}/${selectedType}/${tier.id}?sizeId=${selectedSize.id}`);
        if (response.ok) {
          const priceData = await response.json();
          const minOrderQty = parseInt(selectedSize.minOrderQty || "1") || 1;
          const minOrderPrice = priceData.pricePerSqm * minOrderQty;
          
          pricing.push({
            tierId: tier.id,
            tierName: tier.name,
            pricePerSqm: priceData.pricePerSqm,
            pricePerSheet: priceData.pricePerSqm,
            minOrderPrice: minOrderPrice
          });
        }
      } catch (error) {
        console.error(`Error fetching price for tier ${tier.name}:`, error);
      }
    }

    setTierPricing(pricing);
  };

  // Add item to quote
  const addToQuote = (tierPricing: TierPricing) => {
    if (!selectedSize || !selectedType || !selectedCategory) {
      toast({
        title: "Missing Information",
        description: "Please select a product and size first.",
        variant: "destructive"
      });
      return;
    }

    const categoryName = categories?.find(c => c.id.toString() === selectedCategory)?.name || "";
    const typeName = types?.find(t => t.id.toString() === selectedType)?.name || "";
    
    const minOrderQty = parseInt(selectedSize.minOrderQty || "1") || 1;
    const actualQuantity = Math.max(quantity, minOrderQty);
    
    const newItem: QuoteItem = {
      id: Date.now().toString(),
      productBrand: categoryName,
      productType: typeName,
      productSize: selectedSize.name,
      squareMeters: parseFloat(selectedSize.squareMeters),
      pricePerSheet: tierPricing.pricePerSheet,
      quantity: actualQuantity,
      total: tierPricing.pricePerSheet * actualQuantity,
      tierId: tierPricing.tierId,
      tierName: tierPricing.tierName,
      minOrderQty: selectedSize.minOrderQty || "1",
      itemCode: selectedSize.itemCode || ""
    };

    setQuoteItems([...quoteItems, newItem]);
    
    toast({
      title: "Success",
      description: `Added ${typeName} with ${tierPricing.tierName} pricing to quote`
    });
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
    <div className="py-4 sm:py-8 px-3 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto">
        
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0 mb-6">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center sm:text-center flex-1">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
              <Calculator className="h-6 w-6 sm:h-8 sm:w-8" />
              QuickQuotes
            </h1>
            <p className="text-gray-600">Configure products and generate instant quotes</p>
          </div>
          <div className="w-32"></div>
        </div>

        {/* Customer Selection */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <User className="h-5 w-5" />
              Select Customer
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SearchableCustomerSelect
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              placeholder="Search and select customer..."
            />
            {selectedCustomer && (
              <div className="mt-3 p-3 bg-blue-50 rounded-lg">
                <p className="font-medium">{selectedCustomer.company}</p>
                <p className="text-sm text-gray-600">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                <p className="text-sm text-gray-600">{selectedCustomer.email}</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Two Panel Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          
          {/* Left Panel - Configure Product */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                Configure Product
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              
              {/* Product Selection */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Product</Label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select product category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories?.map((category) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {applyBrandFonts(category.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Product Type */}
              {selectedCategory && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Product Type</Label>
                  <Select value={selectedType} onValueChange={setSelectedType}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select product type..." />
                    </SelectTrigger>
                    <SelectContent>
                      {types?.map((type) => (
                        <SelectItem key={type.id} value={type.id.toString()}>
                          {applyBrandFonts(type.name)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Predefined Size */}
              {selectedType && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Predefined Size</Label>
                  <Select value={selectedSize?.id.toString() || ""} onValueChange={(value) => {
                    const size = sizes?.find(s => s.id.toString() === value);
                    setSelectedSize(size || null);
                  }}>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Select size..." />
                    </SelectTrigger>
                    <SelectContent>
                      {sizes?.map((size) => (
                        <SelectItem key={size.id} value={size.id.toString()}>
                          {size.name} ({parseFloat(size.squareMeters).toFixed(3)} sqm)
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity */}
              {selectedSize && (
                <div className="space-y-3">
                  <Label className="text-base font-medium">Quantity</Label>
                  <Input
                    type="number"
                    min="1"
                    value={quantity}
                    onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                    className="w-full"
                  />
                </div>
              )}

            </CardContent>
          </Card>

          {/* Right Panel - Quote Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg font-bold">QUOTE SUMMARY</CardTitle>
              <p className="text-sm text-gray-600">Using default pricing.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              
              {/* Product Info */}
              {selectedSize && (
                <div className="space-y-2 pb-4 border-b">
                  <div className="flex justify-between">
                    <span className="font-medium">Product Brand:</span>
                    <span>{applyBrandFonts(categories?.find(c => c.id.toString() === selectedCategory)?.name || "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Product Type:</span>
                    <span>{applyBrandFonts(types?.find(t => t.id.toString() === selectedType)?.name || "")}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Product Size:</span>
                    <span>{selectedSize.name}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Total Sqm:</span>
                    <span>{parseFloat(selectedSize.squareMeters).toFixed(3)} sqm</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Total Quantity:</span>
                    <span>{quantity}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium">Min. Order Qty:</span>
                    <span>{selectedSize.minOrderQty || "1"} Sheets</span>
                  </div>
                </div>
              )}

              {/* Pricing Table */}
              {tierPricing.length > 0 && (
                <div className="space-y-2">
                  <div className="grid grid-cols-4 gap-2 text-xs font-medium text-gray-600 pb-2 border-b">
                    <span>Pricing Tier</span>
                    <span>$/m²</span>
                    <span>Price/Sheet</span>
                    <span className="text-center">Add</span>
                  </div>
                  
                  {tierPricing.map((pricing) => (
                    <div key={pricing.tierId} className="grid grid-cols-4 gap-2 items-center py-2 hover:bg-gray-50 rounded">
                      <span className="text-sm font-medium">{pricing.tierName}</span>
                      <span className="text-sm">${pricing.pricePerSqm.toFixed(2)}</span>
                      <span className="text-sm">${pricing.pricePerSheet.toFixed(2)}</span>
                      <div className="flex justify-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => addToQuote(pricing)}
                          className="h-8 w-8 p-0"
                        >
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

            </CardContent>
          </Card>

        </div>

        {/* Added Items Section */}
        {quoteItems.length > 0 && (
          <Card className="mt-6">
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <FileText className="h-5 w-5" />
                  Added Items to Quote
                </span>
                <div className="flex gap-2">
                  <Button onClick={emailQuote} className="flex items-center gap-2">
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </Button>
                  <Button onClick={generateAndDownloadPDF} className="flex items-center gap-2">
                    <FileText className="h-4 w-4" />
                    Generate PDF of Full Quote
                  </Button>
                </div>
              </CardTitle>
              <p className="text-sm text-gray-600">Review your finalized items and overall pricing.</p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                
                {/* Sheet Products Header */}
                <div className="bg-purple-700 text-white p-3 rounded">
                  <h3 className="font-medium flex items-center gap-2">
                    <Calculator className="h-4 w-4" />
                    Sheet Products
                  </h3>
                </div>

                {/* Items Table */}
                <div className="grid grid-cols-6 gap-4 text-sm font-medium text-gray-600 pb-2 border-b">
                  <span>Product</span>
                  <span>Details</span>
                  <span>Qty</span>
                  <span>Price/Sheet</span>
                  <span>Total</span>
                  <span>Actions</span>
                </div>

                {quoteItems.map((item) => (
                  <div key={item.id} className="grid grid-cols-6 gap-4 items-center py-3 border-b">
                    <div>
                      <div className="font-medium">{applyBrandFonts(item.productBrand)}</div>
                    </div>
                    <div>
                      <div className="font-medium">{applyBrandFonts(item.productType)}</div>
                      <div className="text-sm text-gray-600">Size: {item.productSize}</div>
                      <div className="text-sm text-gray-600">Added as: {item.tierName}</div>
                    </div>
                    <div className="text-center">
                      {item.quantity}
                    </div>
                    <div>
                      ${item.pricePerSheet.toFixed(2)}
                    </div>
                    <div className="font-bold">
                      ${item.total.toFixed(2)}
                    </div>
                    <div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => removeFromQuote(item.id)}
                        className="text-red-600 hover:text-red-700"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
                
                {/* Total */}
                <div className="flex justify-end pt-4 border-t">
                  <div className="text-right">
                    <div className="text-2xl font-bold">
                      Total: ${getTotalAmount().toFixed(2)}
                    </div>
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
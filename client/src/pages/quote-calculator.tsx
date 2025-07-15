import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calculator, Box, Ruler, Layers, FileText, Save, Trash2, Mail, Download, User, MapPin, Tag, Settings, ArrowLeft, Home } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Link } from "wouter";

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
  typeId: number;
  tierId: number;
  pricePerSquareMeter: string;
}

interface CustomSizeCalculation {
  squareMeters: number;
  price: number;
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
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<ProductSize | null>(null);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [customWidth, setCustomWidth] = useState<string>("");
  const [customHeight, setCustomHeight] = useState<string>("");
  const [customWidthUnit, setCustomWidthUnit] = useState<string>("inch");
  const [customHeightUnit, setCustomHeightUnit] = useState<string>("inch");
  const [customCalculation, setCustomCalculation] = useState<CustomSizeCalculation | null>(null);
  const [isCustomSize, setIsCustomSize] = useState<boolean>(false);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [showPDFDialog, setShowPDFDialog] = useState(false);
  const [showEmailDialog, setShowEmailDialog] = useState(false);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [salesRep, setSalesRep] = useState("");
  const [isPDFGenerating, setIsPDFGenerating] = useState(false);
  const [isEmailSending, setIsEmailSending] = useState(false);
  const { toast } = useToast();

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    staleTime: 2 * 60 * 1000, // 2 minutes
    cacheTime: 5 * 60 * 1000, // 5 minutes
  });

  const { data: categories } = useQuery<ProductCategory[]>({
    queryKey: ["/api/product-categories"],
  });

  const { data: types } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types", selectedCategory],
    enabled: !!selectedCategory,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: sizes } = useQuery<ProductSize[]>({
    queryKey: ["/api/product-sizes", selectedType],
    enabled: !!selectedType,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const { data: pricingTiers } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
    staleTime: 10 * 60 * 1000, // 10 minutes
    cacheTime: 30 * 60 * 1000, // 30 minutes
  });

  const { data: productPricing } = useQuery<ProductPricing[]>({
    queryKey: ["/api/product-pricing", selectedType],
    enabled: !!selectedType,
    staleTime: 5 * 60 * 1000, // 5 minutes
    cacheTime: 10 * 60 * 1000, // 10 minutes
  });

  const calculateCustomSize = async () => {
    if (!customWidth || !customHeight || parseFloat(customWidth) <= 0 || parseFloat(customHeight) <= 0) {
      setCustomCalculation(null);
      return;
    }

    try {
      const response = await apiRequest("POST", "/api/calculate-square-meters", {
        width: parseFloat(customWidth),
        height: parseFloat(customHeight),
        widthUnit: customWidthUnit,
        heightUnit: customHeightUnit,
        typeId: selectedType ? parseInt(selectedType) : undefined,
        tierId: selectedTier ? parseInt(selectedTier) : undefined,
      });

      const data = await response.json();
      setCustomCalculation({
        squareMeters: data.squareMeters,
        price: data.pricePerSqm || 0
      });
    } catch (error) {
      console.error("Failed to calculate custom size:", error);
      setCustomCalculation(null);
    }
  };

  useEffect(() => {
    if (isCustomSize) {
      calculateCustomSize();
    }
  }, [customWidth, customHeight, customWidthUnit, customHeightUnit, isCustomSize, selectedType, selectedTier]);

  // Auto-fill customer information when a customer is selected
  useEffect(() => {
    if (selectedCustomer) {
      setCustomerName(`${selectedCustomer.firstName} ${selectedCustomer.lastName}`);
      setCustomerEmail(selectedCustomer.email);
    } else {
      // Reset when no customer is selected (but only if dialogs are not open)
      if (!showPDFDialog && !showEmailDialog) {
        setCustomerName("");
        setCustomerEmail("");
        setSalesRep("");
      }
    }
  }, [selectedCustomer, showPDFDialog, showEmailDialog]);

  const handleSizeSelect = (size: ProductSize) => {
    setSelectedSize(size);
    setIsCustomSize(false);
  };

  const handleCustomSizeSelect = () => {
    setSelectedSize(null);
    setIsCustomSize(true);
  };

  const getCurrentPrice = async () => {
    if (isCustomSize && customCalculation) {
      return customCalculation.price;
    }
    if (selectedSize && selectedType && selectedTier) {
      try {
        const response = await fetch(`/api/price/${selectedSize.squareMeters}/${selectedType}/${selectedTier}`);
        if (response.ok) {
          const data = await response.json();
          return data.pricePerSqm;
        }
      } catch (error) {
        console.error("Failed to fetch pricing:", error);
      }
    }
    return 0;
  };

  const getCurrentSquareMeters = () => {
    if (isCustomSize && customCalculation) {
      return customCalculation.squareMeters;
    }
    if (selectedSize) {
      return parseFloat(selectedSize.squareMeters);
    }
    return 0;
  };

  const getUnitPrice = () => {
    return getCurrentSquareMeters() * getCurrentPrice();
  };

  const getTotalPrice = () => {
    return getUnitPrice() * quantity;
  };

  const getSelectedProductName = () => {
    if (!selectedCategory || !selectedType) return "-";
    const category = categories?.find(c => c.id.toString() === selectedCategory);
    const type = types?.find(t => t.id.toString() === selectedType);
    return `${category?.name} - ${type?.name}`;
  };

  const getSelectedSizeName = () => {
    if (isCustomSize && customWidth && customHeight) {
      return `${customWidth}${customWidthUnit === 'inch' ? '"' : "'"} × ${customHeight}${customHeightUnit === 'inch' ? '"' : "'"}`;
    }
    return selectedSize?.name || "-";
  };

  const getSelectedCategoryName = () => {
    if (!selectedCategory || !categories) return '-';
    const category = categories.find(c => c.id.toString() === selectedCategory);
    return category ? category.name : '-';
  };

  const getSelectedTypeName = () => {
    if (!selectedType || !types) return '-';
    const type = types.find(t => t.id.toString() === selectedType);
    return type ? type.name : '-';
  };

  const getMinOrderQuantity = () => {
    if (!selectedSize?.minOrderQty) return 50;
    const match = selectedSize.minOrderQty.match(/\d+/);
    return match ? parseInt(match[0]) : 50;
  };

  const resetSelections = () => {
    setSelectedType("");
    setSelectedSize(null);
    setSelectedTier("");
    setIsCustomSize(false);
    setCustomWidth("");
    setCustomHeight("");
    setCustomWidthUnit("inch");
    setCustomHeightUnit("inch");
    setCustomCalculation(null);
  };

  const addToQuote = async (tierId?: number) => {
    if (!selectedCategory || !selectedType || (!selectedSize && !isCustomSize)) return;

    // Use the provided tierId or default to Retail tier
    const targetTier = tierId 
      ? pricingTiers?.find(tier => tier.id === tierId)
      : pricingTiers?.find(tier => tier.name === "Retail");
    
    if (!targetTier) return;

    const squareMeters = getCurrentSquareMeters();
    const pricePerSqm = await getPriceForTier(targetTier.id);
    const pricePerSheet = squareMeters * pricePerSqm;
    const minOrderQty = selectedSize?.minOrderQty || "50";
    const minOrderQtyNum = parseInt(minOrderQty) || 50;
    // Use the higher of user quantity or minimum order quantity for total calculation
    const effectiveQuantity = Math.max(quantity, minOrderQtyNum);
    const total = pricePerSheet * effectiveQuantity;

    const newItem: QuoteItem = {
      id: Date.now().toString(),
      productBrand: getSelectedCategoryName(),
      productType: getSelectedTypeName(),
      productSize: getSelectedSizeName(),
      squareMeters,
      pricePerSheet,
      quantity,
      total,
      tierId: targetTier.id,
      tierName: targetTier.name,
      minOrderQty,
      itemCode: selectedSize?.itemCode || "N/A"
    };

    setQuoteItems(prev => [...prev, newItem]);
  };

  const removeFromQuote = (itemId: string) => {
    setQuoteItems(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    setQuoteItems(prev => 
      prev.map(item => {
        if (item.id === itemId) {
          // Get minimum order quantity from the string
          const minOrderQty = parseInt(item.minOrderQty) || 50;
          // Use the higher of user quantity or minimum order quantity for total calculation
          const effectiveQuantity = Math.max(newQuantity, minOrderQty);
          return { 
            ...item, 
            quantity: newQuantity, 
            total: item.pricePerSheet * effectiveQuantity 
          };
        }
        return item;
      })
    );
  };

  const getPriceForTier = async (tierId: number): Promise<number> => {
    if (!selectedType) return 0;
    
    try {
      const squareMeters = getCurrentSquareMeters();
      const response = await fetch(`/api/price/${squareMeters}/${selectedType}/${tierId}`);
      if (response.ok) {
        const data = await response.json();
        return data.pricePerSqm;
      }
    } catch (error) {
      console.error("Failed to fetch pricing:", error);
    }
    return 0;
  };

  const getQuoteTotal = () => {
    return quoteItems.reduce((sum, item) => sum + item.total, 0);
  };

  const hasMinOrderQtyDisplay = () => {
    return quoteItems.some(item => {
      const minOrderQty = parseInt(item.minOrderQty) || 50;
      return item.quantity < minOrderQty;
    });
  };

  const handlePDFGeneration = async () => {
    if (!customerName.trim()) {
      toast({
        title: "Error",
        description: "Please enter a customer name",
        variant: "destructive",
      });
      return;
    }

    setIsPDFGenerating(true);
    try {
      const response = await fetch("/api/generate-pdf-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail || undefined,
          salesRep: salesRep || undefined,
          quoteItems,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate PDF");
      }

      const { html, filename } = await response.json();
      
      // Create a temporary window to generate PDF
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        throw new Error("Could not open print window");
      }

      printWindow.document.write(html);
      printWindow.document.close();
      
      // Wait for content to load then print
      printWindow.onload = () => {
        printWindow.print();
        printWindow.close();
      };

      toast({
        title: "Success",
        description: "PDF quote generated successfully",
      });

      setShowPDFDialog(false);
      setCustomerName("");
      setCustomerEmail("");
      setSalesRep("");
    } catch (error) {
      console.error("Error generating PDF:", error);
      toast({
        title: "Error",
        description: "Failed to generate PDF quote",
        variant: "destructive",
      });
    } finally {
      setIsPDFGenerating(false);
    }
  };

  const handleEmailQuote = async () => {
    if (!customerName.trim()) {
      toast({
        title: "Error",
        description: "Please enter customer name",
        variant: "destructive",
      });
      return;
    }

    setIsEmailSending(true);
    try {
      // Generate quote HTML for email
      const response = await fetch("/api/generate-pdf-quote", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          customerName,
          customerEmail: customerEmail || undefined,
          salesRep: salesRep || undefined,
          quoteItems,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to generate quote");
      }

      const { html } = await response.json();
      
      // Extract quote details for email
      const quoteNumber = `Q${Date.now().toString().slice(-6)}`;
      const totalAmount = getQuoteTotal();
      const quoteDate = new Date().toLocaleDateString();
      
      // Create email content
      const emailSubject = `Quote ${quoteNumber} - ${customerName}`;
      
      // Create detailed product sections
      const productSections = quoteItems.map(item => {
        const minOrderQty = parseInt(item.minOrderQty) || 50;
        const effectiveQuantity = Math.max(item.quantity, minOrderQty);
        const totalBasedOnMinOrder = item.pricePerSheet * effectiveQuantity;
        
        return `Items:
Product Name: ${item.productType}
Product Code: ${item.itemCode}
Size: ${item.productSize}
Qty Requested: ${item.quantity}
Price per sheet: $${item.pricePerSheet.toFixed(2)}
Minimum Order Quantity: ${minOrderQty} Sheets
Total (based on min order Qty): $${totalBasedOnMinOrder.toFixed(2)}`;
      }).join('\n\n----------------------------\n\n');
      
      const emailBody = `Dear ${customerName},

Please find your quote details below:

Quote Number: ${quoteNumber}

${productSections}

Look forward for your order!`;

      // Use mailto to open default email client
      const mailtoUrl = `mailto:${customerEmail || ''}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
      
      window.location.href = mailtoUrl;

      toast({
        title: "Success",
        description: "Email client opened with quote details",
      });

      setShowEmailDialog(false);
      setCustomerName("");
      setCustomerEmail("");
      setSalesRep("");
    } catch (error) {
      console.error("Error preparing email:", error);
      toast({
        title: "Error",
        description: "Failed to prepare email quote",
        variant: "destructive",
      });
    } finally {
      setIsEmailSending(false);
    }
  };

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Quote Calculator</h1>
            <p className="text-gray-600">Calculate accurate quotes for your products</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Customer Dropdown */}
              <div className="space-y-2">
                <Select value={selectedCustomer?.id || ""} onValueChange={(value) => {
                  const customer = customers?.find(c => c.id === value);
                  setSelectedCustomer(customer || null);
                }}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select customer..." />
                  </SelectTrigger>
                  <SelectContent>
                    {customers?.map((customer) => (
                      <SelectItem key={customer.id} value={customer.id}>
                        {customer.firstName} {customer.lastName} - {customer.company || customer.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Info Display */}
              {selectedCustomer && (
                <div className="bg-muted/50 p-4 rounded-lg space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Mail className="h-4 w-4" />
                    <span>{selectedCustomer.email}</span>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <MapPin className="h-4 w-4" />
                    <span>
                      {selectedCustomer.address1}
                      {selectedCustomer.address2 && `, ${selectedCustomer.address2}`}
                      {selectedCustomer.city && `, ${selectedCustomer.city}`}
                      {selectedCustomer.province && `, ${selectedCustomer.province}`}
                      {selectedCustomer.zip && ` ${selectedCustomer.zip}`}
                    </span>
                  </div>
                  {selectedCustomer.tags && (
                    <div className="flex items-center gap-2 text-sm">
                      <Tag className="h-4 w-4 text-muted-foreground" />
                      <Badge variant="outline">{selectedCustomer.tags}</Badge>
                    </div>
                  )}
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* Left Column - Configure Product */}
          <Card className="shadow-sm lg:col-span-2">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Settings className="h-5 w-5" />
                Configure Product
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Product */}
              <div className="space-y-2">
                <Label htmlFor="product">Product</Label>
                <Select value={selectedCategory} onValueChange={(value) => {
                  setSelectedCategory(value);
                  resetSelections();
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product..." />
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

              {/* Product Type */}
              <div className="space-y-2">
                <Label htmlFor="product-type">Product Type</Label>
                <Select value={selectedType} onValueChange={(value) => {
                  setSelectedType(value);
                  setSelectedSize(null);
                  setIsCustomSize(false);
                }} disabled={!selectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product type..." />
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

              {/* Predefined Size */}
              <div className="space-y-2">
                <Label htmlFor="size">Predefined Size</Label>
                <Select value={selectedSize?.id.toString() || (isCustomSize ? "custom" : "")} onValueChange={(value) => {
                  if (value === "custom") {
                    setIsCustomSize(true);
                    setSelectedSize(null);
                  } else {
                    setIsCustomSize(false);
                    const size = sizes?.find(s => s.id.toString() === value);
                    setSelectedSize(size || null);
                  }
                }} disabled={!selectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size..." />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes?.map((size) => (
                      <SelectItem key={size.id} value={size.id.toString()}>
                        {size.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="custom">Custom Size</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Custom Size Section */}
              {isCustomSize && (
                <div className="space-y-4 p-4 bg-muted/30 rounded-lg border-2 border-dashed">
                  <div className="flex items-center gap-2">
                    <Ruler className="h-4 w-4 text-primary" />
                    <span className="font-medium">Custom Size</span>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="width">Width</Label>
                      <div className="flex gap-2">
                        <Input
                          id="width"
                          type="number"
                          value={customWidth}
                          onChange={(e) => setCustomWidth(e.target.value)}
                          placeholder="Enter width"
                          className="flex-1"
                        />
                        <Select value={customWidthUnit} onValueChange={setCustomWidthUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">in</SelectItem>
                            <SelectItem value="feet">ft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="height">Height</Label>
                      <div className="flex gap-2">
                        <Input
                          id="height"
                          type="number"
                          value={customHeight}
                          onChange={(e) => setCustomHeight(e.target.value)}
                          placeholder="Enter height"
                          className="flex-1"
                        />
                        <Select value={customHeightUnit} onValueChange={setCustomHeightUnit}>
                          <SelectTrigger className="w-20">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="inch">in</SelectItem>
                            <SelectItem value="feet">ft</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                  <Button 
                    onClick={calculateCustomSize}
                    disabled={!customWidth || !customHeight}
                    className="w-full"
                  >
                    <Calculator className="h-4 w-4 mr-2" />
                    Calculate Size
                  </Button>
                  {customCalculation && (
                    <div className="text-sm text-center p-2 bg-background rounded">
                      <span className="font-medium">
                        {customCalculation.squareMeters.toFixed(4)} sqm
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  id="quantity"
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  min="1"
                  className="w-24"
                />
              </div>
            </CardContent>
          </Card>

          {/* Right Column - Quote Summary */}
          <Card className="shadow-sm lg:col-span-3">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">QUOTE SUMMARY</CardTitle>
              <p className="text-sm text-muted-foreground">Using default pricing.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Product Details */}
              <div className="space-y-3 text-sm">
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-700 flex-shrink-0">Product Brand:</span>
                  <span className="text-blue-600 font-medium text-right ml-2 break-words">{getSelectedCategoryName()}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-700 flex-shrink-0">Product Type:</span>
                  <span className="text-blue-600 font-medium text-right ml-2 break-words">{getSelectedTypeName()}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-700 flex-shrink-0">Product Size:</span>
                  <span className="text-right ml-2 break-words">{getSelectedSizeName()}</span>
                </div>
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-700 flex-shrink-0">Total Sqm:</span>
                  <span className="text-right ml-2">{getCurrentSquareMeters().toFixed(3)} sqm</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-medium text-gray-700 flex-shrink-0">Total Quantity:</span>
                  <div className="w-6 h-6 border-2 border-red-500 rounded text-center text-red-500 font-bold text-xs leading-5">
                    {quantity}
                  </div>
                </div>
                <div className="flex justify-between items-start">
                  <span className="font-medium text-gray-700 flex-shrink-0">Min. Order Qty:</span>
                  <span className="text-right ml-2">{selectedSize?.minOrderQty || "50 Sheets"}</span>
                </div>
              </div>

              {/* Pricing Table */}
              <div className="space-y-0 border rounded-lg overflow-hidden">
                <div className="grid grid-cols-5 gap-1 text-xs font-medium bg-muted/50 p-2 border-b">
                  <span className="text-left">Pricing Tier</span>
                  <span className="text-center">$/m²</span>
                  <span className="text-center">Price/Sheet</span>
                  <span className="text-center text-xs">Min. Order Qty Price</span>
                  <span className="text-center">Add</span>
                </div>
                
                {pricingTiers?.map((tier) => (
                  <PricingTierRow 
                    key={tier.id} 
                    tier={tier} 
                    selectedType={selectedType}
                    getCurrentSquareMeters={getCurrentSquareMeters}
                    getMinOrderQuantity={getMinOrderQuantity}
                    getPriceForTier={getPriceForTier}
                    selectedSize={selectedSize}
                    customCalculation={customCalculation}
                    addToQuote={addToQuote}
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Added Items to Quote Section */}
        {quoteItems.length > 0 && (
          <Card className="shadow-sm mt-6">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg font-bold">Added Items to Quote</CardTitle>
              <p className="text-sm text-muted-foreground">
                Review your selected items and finalize your quote.
              </p>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium text-gray-700">
                  <Box className="h-4 w-4" />
                  Sheet Products
                </div>
                
                {/* Quote Items Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-purple-800 text-white">
                    <div className={`grid gap-4 p-4 text-sm font-medium ${hasMinOrderQtyDisplay() ? 'grid-cols-8' : 'grid-cols-7'}`}>
                      <div>Product</div>
                      <div>Details</div>
                      <div className="text-center">Code</div>
                      <div className="text-center">Qty</div>
                      {hasMinOrderQtyDisplay() && <div className="text-center">Min Order Qty</div>}
                      <div className="text-center">Price/Sheet</div>
                      <div className="text-center">Total</div>
                      <div className="text-center">Actions</div>
                    </div>
                  </div>
                  
                  <div className="divide-y">
                    {quoteItems.map((item) => {
                      const minOrderQty = parseInt(item.minOrderQty) || 50;
                      const isMinOrderQtyActive = item.quantity < minOrderQty;
                      
                      return (
                        <div key={item.id} className={`grid gap-4 p-4 text-sm items-center ${hasMinOrderQtyDisplay() ? 'grid-cols-8' : 'grid-cols-7'}`}>
                          <div className="font-medium">
                            {item.productBrand}
                          </div>
                          <div className="text-muted-foreground">
                            <div>Type: {item.productType}</div>
                            <div>Size: {item.productSize}</div>
                            <div>Added as: {item.tierName}</div>
                          </div>
                          <div className="text-center font-medium text-blue-600">
                            {item.itemCode}
                          </div>
                          <div className="text-center">
                            <Input
                              type="number"
                              value={item.quantity}
                              onChange={(e) => updateQuantity(item.id, parseInt(e.target.value) || 1)}
                              className="w-16 text-center"
                              min="1"
                            />
                          </div>
                          {hasMinOrderQtyDisplay() && (
                            <div className="text-center font-medium">
                              {isMinOrderQtyActive ? (
                                <span className="text-orange-600 font-bold">{minOrderQty}</span>
                              ) : (
                                <span className="text-muted-foreground">-</span>
                              )}
                            </div>
                          )}
                          <div className="text-center font-medium">
                            ${item.pricePerSheet.toFixed(2)}
                          </div>
                          <div className="text-center font-medium">
                            ${item.total.toFixed(2)}
                          </div>
                          <div className="text-center">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => removeFromQuote(item.id)}
                              className="text-red-500 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Quote Total */}
                <div className="flex justify-end">
                  <div className="text-right">
                    <div className="text-lg font-medium">
                      Total: <span className="text-xl font-bold">${getQuoteTotal().toFixed(2)}</span>
                    </div>
                  </div>
                </div>
                
                {/* Action Buttons */}
                <div className="flex justify-end gap-3 pt-4">
                  <Dialog open={showEmailDialog} onOpenChange={setShowEmailDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        className="flex items-center gap-2"
                        disabled={quoteItems.length === 0}
                      >
                        <Mail className="h-4 w-4" />
                        Email Quote
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Email Quote</DialogTitle>
                        <DialogDescription>
                          This will open your default email client with a pre-composed quote message
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="customerName">Customer Name *</Label>
                          <Input
                            id="customerName"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Enter customer name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="customerEmail">Customer Email</Label>
                          <Input
                            id="customerEmail"
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            placeholder="Enter customer email (optional)"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setShowEmailDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            onClick={handleEmailQuote}
                            disabled={isEmailSending}
                          >
                            {isEmailSending ? "Preparing..." : "Open Email Client"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>

                  <Dialog open={showPDFDialog} onOpenChange={setShowPDFDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        className="flex items-center gap-2 bg-purple-800 hover:bg-purple-900"
                        disabled={quoteItems.length === 0}
                      >
                        <Download className="h-4 w-4" />
                        Generate PDF of Full Quote
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Generate PDF Quote</DialogTitle>
                        <DialogDescription>
                          Enter customer details to generate a PDF quote
                        </DialogDescription>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div>
                          <Label htmlFor="pdfCustomerName">Customer Name *</Label>
                          <Input
                            id="pdfCustomerName"
                            value={customerName}
                            onChange={(e) => setCustomerName(e.target.value)}
                            placeholder="Enter customer name"
                          />
                        </div>
                        <div>
                          <Label htmlFor="pdfCustomerEmail">Customer Email (Optional)</Label>
                          <Input
                            id="pdfCustomerEmail"
                            type="email"
                            value={customerEmail}
                            onChange={(e) => setCustomerEmail(e.target.value)}
                            placeholder="Enter customer email (optional)"
                          />
                        </div>
                        <div>
                          <Label htmlFor="pdfSalesRep">Sales Representative</Label>
                          <Input
                            id="pdfSalesRep"
                            value={salesRep}
                            onChange={(e) => setSalesRep(e.target.value)}
                            placeholder="Enter sales representative name"
                          />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button 
                            variant="outline" 
                            onClick={() => setShowPDFDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button 
                            onClick={handlePDFGeneration}
                            disabled={isPDFGenerating}
                          >
                            {isPDFGenerating ? "Generating..." : "Generate PDF"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );

}

function PricingTierRow({ tier, selectedType, getCurrentSquareMeters, getMinOrderQuantity, getPriceForTier, selectedSize, customCalculation, addToQuote }: { 
  tier: PricingTier; 
  selectedType: string;
  getCurrentSquareMeters: () => number;
  getMinOrderQuantity: () => number;
  getPriceForTier: (tierId: number) => Promise<number>;
  selectedSize: ProductSize | null;
  customCalculation: CustomSizeCalculation | null;
  addToQuote: (tierId?: number) => Promise<void>;
}) {
  const [price, setPrice] = useState<number>(0);
  const [pricePerSheet, setPricePerSheet] = useState<number>(0);
  const [minOrderPrice, setMinOrderPrice] = useState<number>(0);

  useEffect(() => {
    const fetchPrice = async () => {
      if (selectedType) {
        const fetchedPrice = await getPriceForTier(tier.id);
        setPrice(fetchedPrice);
        
        const sqm = getCurrentSquareMeters();
        setPricePerSheet(fetchedPrice * sqm);
        setMinOrderPrice(fetchedPrice * sqm * getMinOrderQuantity());
      }
    };
    
    fetchPrice();
  }, [tier.id, selectedType, selectedSize, customCalculation]);

  return (
    <div className="grid grid-cols-5 gap-1 text-sm p-2 border-b last:border-b-0 hover:bg-muted/30">
      <span className="font-medium text-gray-700 text-left truncate">{tier.name}</span>
      <span className="text-center">${price.toFixed(2)}</span>
      <span className="text-center">${pricePerSheet.toFixed(2)}</span>
      <span className="text-center font-medium">${minOrderPrice.toFixed(2)}</span>
      <div className="text-center">
        <button 
          className="w-6 h-6 border-2 border-gray-400 rounded-full flex items-center justify-center mx-auto hover:bg-gray-100 transition-colors"
          onClick={() => addToQuote(tier.id)}
          disabled={!selectedType || getCurrentSquareMeters() === 0}
        >
          <span className="text-gray-600 text-lg font-bold leading-none">+</span>
        </button>
      </div>
    </div>
  );
}

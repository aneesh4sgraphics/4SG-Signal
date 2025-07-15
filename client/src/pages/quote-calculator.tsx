import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calculator, Box, Ruler, Layers, FileText, Save, Trash2, Mail, Download, User, MapPin, Tag, Settings } from "lucide-react";
import { apiRequest } from "@/lib/queryClient";

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

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

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

  const { data: productPricing } = useQuery<ProductPricing[]>({
    queryKey: ["/api/product-pricing", selectedType],
    enabled: !!selectedType,
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

  const addToQuote = async () => {
    if (!selectedCategory || !selectedType || (!selectedSize && !isCustomSize)) return;

    // We'll add the item with the "Retail" tier pricing by default
    const retailTier = pricingTiers?.find(tier => tier.name === "Retail");
    if (!retailTier) return;

    const squareMeters = getCurrentSquareMeters();
    const pricePerSqm = await getPriceForTier(retailTier.id);
    const pricePerSheet = squareMeters * pricePerSqm;
    const total = pricePerSheet * quantity;

    const newItem: QuoteItem = {
      id: Date.now().toString(),
      productBrand: getSelectedCategoryName(),
      productType: getSelectedTypeName(),
      productSize: getSelectedSizeName(),
      squareMeters,
      pricePerSheet,
      quantity,
      total,
      tierId: retailTier.id,
      tierName: retailTier.name,
      minOrderQty: selectedSize?.minOrderQty || "50"
    };

    setQuoteItems(prev => [...prev, newItem]);
  };

  const removeFromQuote = (itemId: string) => {
    setQuoteItems(prev => prev.filter(item => item.id !== itemId));
  };

  const updateQuantity = (itemId: string, newQuantity: number) => {
    setQuoteItems(prev => 
      prev.map(item => 
        item.id === itemId 
          ? { ...item, quantity: newQuantity, total: item.pricePerSheet * newQuantity }
          : item
      )
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

  const handleEmailQuote = () => {
    const subject = "Price Quote from 4S Graphics";
    const body = generateEmailBody();
    
    const mailtoLink = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.open(mailtoLink);
  };

  const generateEmailBody = () => {
    let body = "Dear {{Client Name}},\n\n";
    body += "Here below is the quote you requested.\n\n";
    
    quoteItems.forEach((item, index) => {
      body += `${index + 1}. Quote Item:\n`;
      body += `* Product Brand: ${item.productBrand}\n`;
      body += `* Product Type: ${item.productType}\n`;
      body += `* Product Size: ${item.productSize}\n`;
      body += `* Total Quantity Requested: ${item.quantity}\n`;
      body += `* Pricing per sheet: $${item.pricePerSheet.toFixed(2)}\n\n`;
    });
    
    body += `Total Quote Amount: $${getQuoteTotal().toFixed(2)}\n\n`;
    body += "Thank you for your business.\n\n";
    body += "Best regards,\n";
    body += "4S Graphics Team";
    
    return body;
  };

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        
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
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left Column - Configure Product */}
          <Card className="shadow-sm">
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
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <CardTitle className="text-lg">QUOTE SUMMARY</CardTitle>
              <p className="text-sm text-muted-foreground">Using default pricing.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Product Details */}
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="font-medium">Product Brand:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-primary">Graffiti</span>
                    <sup className="text-xs">®</sup>
                    <span>Polyester Paper</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Product Type:</span>
                  <div className="flex items-center gap-1">
                    <span className="text-primary">Graffiti</span>
                    <sup className="text-xs">®</sup>
                    <span>Polyester Paper 5mil</span>
                  </div>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Product Size:</span>
                  <span>{getSelectedSizeName()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Total Sqm:</span>
                  <span>{getCurrentSquareMeters().toFixed(3)} sqm</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Total Quantity:</span>
                  <span className="text-red-600">{quantity}</span>
                </div>
                <div className="flex justify-between">
                  <span className="font-medium">Min. Order Qty:</span>
                  <span>50 Sheets</span>
                </div>
              </div>

              {/* Pricing Table */}
              <div className="space-y-2">
                <div className="grid grid-cols-4 gap-2 text-xs font-medium bg-muted/50 p-2 rounded">
                  <span>Pricing Tier</span>
                  <span>$/m²</span>
                  <span>Price/Sheet</span>
                  <span>Min. Order Qty Price</span>
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
                  />
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );

}

function PricingTierRow({ tier, selectedType, getCurrentSquareMeters, getMinOrderQuantity, getPriceForTier, selectedSize, customCalculation }: { 
  tier: PricingTier; 
  selectedType: string;
  getCurrentSquareMeters: () => number;
  getMinOrderQuantity: () => number;
  getPriceForTier: (tierId: number) => Promise<number>;
  selectedSize: ProductSize | null;
  customCalculation: CustomSizeCalculation | null;
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
    <div className="grid grid-cols-4 gap-2 text-xs p-2 hover:bg-muted/30 rounded">
      <span className="font-medium">{tier.name}</span>
      <span>${price.toFixed(2)}</span>
      <span>${pricePerSheet.toFixed(2)}</span>
      <span>${minOrderPrice.toFixed(2)}</span>
    </div>
  );
}

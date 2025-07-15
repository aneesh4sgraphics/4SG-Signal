import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calculator, Box, Ruler, Layers, FileText, Save, Trash2, Mail, Download } from "lucide-react";
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
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-secondary mb-2">Product Quote Calculator</h1>
          <p className="text-muted-foreground">Calculate pricing for your products with accurate square meter calculations</p>
        </div>

        {/* Main Calculator Container */}
        <Card className="shadow-lg">
          {/* Product Selection */}
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Box className="h-5 w-5 text-primary" />
              Product Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {/* Product Category */}
              <div className="space-y-2">
                <Label htmlFor="category">Product Category</Label>
                <Select value={selectedCategory} onValueChange={(value) => {
                  setSelectedCategory(value);
                  resetSelections();
                }}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Category" />
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
                <Label htmlFor="type">Product Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType} disabled={!selectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Type" />
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

              {/* Quantity */}
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(parseInt(e.target.value) || 1)}
                  placeholder="Enter quantity"
                />
              </div>

              {/* Product Size */}
              <div className="space-y-2">
                <Label htmlFor="size">Product Size</Label>
                <Select value={selectedSize?.id.toString() || ""} onValueChange={(value) => {
                  const size = sizes?.find(s => s.id.toString() === value);
                  if (size) {
                    handleSizeSelect(size);
                  }
                }} disabled={!selectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select Size" />
                  </SelectTrigger>
                  <SelectContent>
                    {sizes?.map((size) => (
                      <SelectItem key={size.id} value={size.id.toString()}>
                        <div className="flex items-center justify-between w-full">
                          <span>{size.name}</span>
                          <span className="text-muted-foreground text-sm ml-2">
                            {parseFloat(size.squareMeters).toFixed(3)} sq.m
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>

          {/* Custom Size Option */}
          {selectedType && (
            <>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <Ruler className="h-5 w-5 text-primary" />
                  Custom Size (Optional)
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <Card className="bg-muted/50">
                  <CardHeader>
                    <CardTitle className="text-lg">Custom Size</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="space-y-2">
                        <Label>Width</Label>
                        <div className="flex">
                          <Input
                            type="number"
                            value={customWidth}
                            onChange={(e) => setCustomWidth(e.target.value)}
                            placeholder="24"
                            className="rounded-r-none"
                            onFocus={handleCustomSizeSelect}
                          />
                          <Select value={customWidthUnit} onValueChange={setCustomWidthUnit}>
                            <SelectTrigger className="w-20 rounded-l-none">
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
                        <Label>Height</Label>
                        <div className="flex">
                          <Input
                            type="number"
                            value={customHeight}
                            onChange={(e) => setCustomHeight(e.target.value)}
                            placeholder="36"
                            className="rounded-r-none"
                            onFocus={handleCustomSizeSelect}
                          />
                          <Select value={customHeightUnit} onValueChange={setCustomHeightUnit}>
                            <SelectTrigger className="w-20 rounded-l-none">
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
                        <Label>Square Meters</Label>
                        <div className="px-3 py-2 bg-background border rounded-lg">
                          <span className="font-medium">
                            {isCustomSize && customCalculation ? `${customCalculation.squareMeters.toFixed(2)} sq.m` : '0.00 sq.m'}
                          </span>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CardContent>
            </>
          )}

          {/* Quote Summary */}
          {selectedSize && selectedType && selectedCategory && (
            <>
              <CardHeader className="border-b">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-primary" />
                  QUOTE SUMMARY
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="text-sm text-muted-foreground mb-6">
                  Using default pricing.
                </div>
                
                {/* Product Details */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="font-medium">Product Brand:</span>
                      <span className="text-muted-foreground">{getSelectedCategoryName()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Product Type:</span>
                      <span className="text-muted-foreground">{getSelectedTypeName()}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Product Size:</span>
                      <span className="text-muted-foreground">{getSelectedSizeName()}</span>
                    </div>
                  </div>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="font-medium">Total Sqm:</span>
                      <span className="text-muted-foreground">{getCurrentSquareMeters().toFixed(3)} sqm</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Total Quantity:</span>
                      <div className="flex items-center gap-2">
                        <span className="w-8 h-8 border border-red-500 rounded text-center text-red-500 font-bold text-sm leading-8">
                          {quantity}
                        </span>
                      </div>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-medium">Min. Order Qty:</span>
                      <span className="text-muted-foreground">{selectedSize?.minOrderQty || 'N/A'}</span>
                    </div>
                  </div>
                </div>

                {/* Pricing Table */}
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-muted/50 border-b">
                    <div className="grid grid-cols-5 gap-4 p-4 text-sm font-medium">
                      <div>Pricing Tier</div>
                      <div className="text-center">$/m²</div>
                      <div className="text-center">Price/Sheet</div>
                      <div className="text-center">Min. Order Qty Price</div>
                      <div className="text-center">Add</div>
                    </div>
                  </div>
                  <div className="divide-y">
                    {pricingTiers?.map((tier) => {
                      const pricing = productPricing?.find(p => p.tierId === tier.id);
                      const pricePerSqm = pricing ? parseFloat(pricing.pricePerSquareMeter) : 0;
                      const pricePerSheet = pricePerSqm * getCurrentSquareMeters();
                      const minOrderPrice = pricePerSheet * (getMinOrderQuantity() || 1);
                      
                      return (
                        <div key={tier.id} className="grid grid-cols-5 gap-4 p-4 text-sm items-center">
                          <div className="font-medium">{tier.name}</div>
                          <div className="text-center">${pricePerSqm.toFixed(2)}</div>
                          <div className="text-center">${pricePerSheet.toFixed(2)}</div>
                          <div className="text-center font-medium">${minOrderPrice.toFixed(2)}</div>
                          <div className="text-center">
                            <Button 
                              size="sm" 
                              className="w-8 h-8 rounded-full p-0"
                              onClick={() => addToQuote()}
                            >
                              <span className="text-lg font-bold">+</span>
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </CardContent>
            </>
          )}
        </Card>

        {/* Added Items to Quote */}
        {quoteItems.length > 0 && (
          <Card className="shadow-lg mt-6">
            <CardHeader className="border-b bg-muted/50">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Added Items to Quote
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Review your finalized items and overall pricing.
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Box className="h-4 w-4" />
                  Sheet Products
                </div>
                
                {/* Quote Items Table */}
                <div className="rounded-lg border overflow-hidden">
                  <div className="bg-purple-800 text-white">
                    <div className="grid grid-cols-6 gap-4 p-4 text-sm font-medium">
                      <div>Product</div>
                      <div>Details</div>
                      <div className="text-center">Qty</div>
                      <div className="text-center">Price/Sheet</div>
                      <div className="text-center">Total</div>
                      <div className="text-center">Actions</div>
                    </div>
                  </div>
                  
                  <div className="divide-y">
                    {quoteItems.map((item) => (
                      <div key={item.id} className="grid grid-cols-6 gap-4 p-4 text-sm items-center">
                        <div className="font-medium">
                          {item.productType}
                        </div>
                        <div className="text-muted-foreground">
                          <div>Size: {item.productSize}</div>
                          <div>Added as: {item.tierName}</div>
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
                    ))}
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
                  <Button 
                    variant="outline" 
                    className="flex items-center gap-2"
                    onClick={handleEmailQuote}
                  >
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </Button>
                  <Button className="flex items-center gap-2 bg-purple-800 hover:bg-purple-900">
                    <Download className="h-4 w-4" />
                    Generate PDF of Full Quote
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Footer */}
        <div className="text-center mt-8 text-muted-foreground">
          <p className="text-sm">
            Need help with your quote? <a href="#" className="text-primary hover:underline">Contact our sales team</a>
          </p>
        </div>
      </div>
    </div>
  );
}

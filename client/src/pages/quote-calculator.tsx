import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Calculator, Box, Ruler, Layers, FileText, Save } from "lucide-react";
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
  minSquareMeters: string;
  maxSquareMeters: string;
  pricePerSquareMeter: string;
}

interface CustomSizeCalculation {
  squareMeters: number;
  price: number;
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

  const resetSelections = () => {
    setSelectedType("");
    setSelectedSize(null);
    setSelectedTier("");
    setIsCustomSize(false);
    setCustomWidth("");
    setCustomHeight("");
    setCustomCalculation(null);
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

              {/* Pricing Tier */}
              <div className="space-y-2">
                <Label htmlFor="tier">Pricing Tier</Label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pricing tier" />
                  </SelectTrigger>
                  <SelectContent>
                    {pricingTiers?.map((tier) => (
                      <SelectItem key={tier.id} value={tier.id.toString()}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>

          {/* Size Selection */}
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Ruler className="h-5 w-5 text-primary" />
              Size Selection
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {selectedType && sizes ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
                {sizes.map((size) => (
                  <div
                    key={size.id}
                    className={`border rounded-lg p-4 cursor-pointer transition-all duration-200 hover:border-primary ${
                      selectedSize?.id === size.id && !isCustomSize ? 'border-primary bg-primary/5' : 'border-border'
                    }`}
                    onClick={() => handleSizeSelect(size)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">{size.name}</span>
                      <div className={`w-4 h-4 border-2 rounded-full ${
                        selectedSize?.id === size.id && !isCustomSize ? 'border-primary bg-primary' : 'border-muted-foreground'
                      }`} />
                    </div>
                    <div className="text-sm text-muted-foreground">
                      <span className="block">{parseFloat(size.squareMeters).toFixed(2)} sq.m</span>
                      <span className="block text-primary font-medium">
                        {selectedTier ? `Tier pricing applies` : 'Select pricing tier'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-8">
                Please select a product category and type to view available sizes
              </div>
            )}

            {/* Custom Size Option */}
            {selectedType && (
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
            )}
          </CardContent>

          {/* Pricing Tiers */}
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              Pricing Tiers
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {pricingTiers?.map((tier, index) => (
                <Card key={tier.id} className="bg-muted/50">
                  <CardContent className="p-4">
                    <div className="text-sm text-muted-foreground mb-1">Tier {index + 1}</div>
                    <div className="font-medium mb-1">
                      {parseFloat(tier.minSquareMeters).toFixed(2)} - {parseFloat(tier.maxSquareMeters) > 999 ? '∞' : parseFloat(tier.maxSquareMeters).toFixed(2)} sq.m
                    </div>
                    <div className="text-primary font-semibold">${tier.name}</div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </CardContent>

          {/* Price Calculation */}
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-primary" />
              Price Calculation
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 bg-muted/50">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Calculation Details */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Calculation Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Selected Product:</span>
                    <span className="font-medium">{getSelectedProductName()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Size:</span>
                    <span className="font-medium">{getSelectedSizeName()}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Square Meters:</span>
                    <span className="font-medium">
                      {getCurrentSquareMeters() > 0 ? `${getCurrentSquareMeters().toFixed(2)} sq.m` : '-'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Price per sq.m:</span>
                    <span className="font-medium text-primary">
                      {selectedTier ? `Tier-based pricing` : 'Select pricing tier'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Quantity:</span>
                    <span className="font-medium">{quantity}</span>
                  </div>
                  <Separator />
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Unit Price:</span>
                    <span className="font-medium">${getUnitPrice().toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Total Price */}
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Total Price</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-center">
                    <div className="text-4xl font-bold text-primary mb-2">
                      ${getTotalPrice().toFixed(2)}
                    </div>
                    <div className="text-muted-foreground mb-6">
                      Total for {quantity} item(s)
                    </div>
                    
                    <div className="space-y-3">
                      <Button className="w-full" size="lg">
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Quote
                      </Button>
                      <Button variant="outline" className="w-full" size="lg">
                        <Save className="mr-2 h-4 w-4" />
                        Save Calculation
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </CardContent>
        </Card>

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

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, Mail, Calculator, Building, Phone, MapPin, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";

interface ProductData {
  ItemCode: string;
  product_name: string;
  ProductType: string;
  size: string;
  total_sqm: number;
  min_quantity: number;
  Export: number;
  "M.Distributor": number;
  Dealer: number;
  Dealer2: number;
  ApprovalNeeded: number;
  TierStage25: number;
  TierStage2: number;
  TierStage15: number;
  TierStage1: number;
  Retail: number;
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
  productName: string;
  productType: string;
  size: string;
  itemCode: string;
  quantity: number;
  pricePerSqM: number;
  pricePerSheet: number;
  total: number;
  tier: string;
  squareMeters: number;
  minOrderQty: number;
}

const pricingTiers = [
  { key: 'Export', label: 'Export' },
  { key: 'M.Distributor', label: 'Master Distributor' },
  { key: 'Dealer', label: 'Dealer' },
  { key: 'Dealer2', label: 'Dealer 2' },
  { key: 'ApprovalNeeded', label: 'Approval Needed' },
  { key: 'TierStage25', label: 'Stage 2.5' },
  { key: 'TierStage2', label: 'Stage 2' },
  { key: 'TierStage15', label: 'Stage 1.5' },
  { key: 'TierStage1', label: 'Stage 1' },
  { key: 'Retail', label: 'Retail' }
];

export default function QuoteCalculator() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch product pricing data
  const { data: productData = [], isLoading } = useQuery<ProductData[]>({
    queryKey: ['/api/product-pricing-data'],
  });

  // Get unique categories
  const categories = [...new Set(productData.map(item => item.product_name))].sort();
  
  // Get product types for selected category
  const productTypes = selectedCategory
    ? [...new Set(productData.filter(item => item.product_name === selectedCategory).map(item => item.ProductType))].sort()
    : [];

  // Get sizes for selected type
  const availableSizes = selectedCategory && selectedType
    ? productData.filter(item => 
        item.product_name === selectedCategory && 
        item.ProductType === selectedType
      ).sort((a, b) => a.total_sqm - b.total_sqm)
    : [];

  // Get selected product details
  const selectedProduct = productData.find(item =>
    item.product_name === selectedCategory &&
    item.ProductType === selectedType &&
    item.size === selectedSize
  );

  const addToQuote = (tier: string) => {
    if (!selectedProduct) return;

    const tierPrice = selectedProduct[tier as keyof ProductData] as number;
    const pricePerSheet = tierPrice * selectedProduct.total_sqm;
    const useQuantity = Math.max(quantity, selectedProduct.min_quantity);
    const total = pricePerSheet * useQuantity;

    const quoteItem: QuoteItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: selectedProduct.product_name,
      productType: selectedProduct.ProductType,
      size: selectedProduct.size,
      itemCode: selectedProduct.ItemCode,
      quantity: useQuantity,
      pricePerSqM: tierPrice,
      pricePerSheet: pricePerSheet,
      total: total,
      tier: tier,
      squareMeters: selectedProduct.total_sqm,
      minOrderQty: selectedProduct.min_quantity
    };

    setQuoteItems(prev => [...prev, quoteItem]);
    toast({
      title: "Item Added",
      description: `Added ${selectedProduct.ProductType} to quote`,
    });
  };

  const removeFromQuote = (id: string) => {
    setQuoteItems(prev => prev.filter(item => item.id !== id));
  };

  const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);

  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      if (quoteItems.length === 0) {
        throw new Error('No items in quote to generate PDF');
      }

      const quoteNumber = `4SG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
      const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
      
      const response = await fetch('/api/generate-pdf-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : "Customer",
          quoteNumber,
          quoteItems,
          totalAmount
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate PDF');
      return response.json();
    },
    onSuccess: (data) => {
      // Create and download the PDF
      const html = data.html;
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        setTimeout(() => {
          printWindow.print();
          printWindow.close();
        }, 500);
      }
      toast({
        title: "PDF Generated",
        description: "Quote PDF has been generated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate PDF",
        variant: "destructive",
      });
    }
  });

  const handleEmailQuote = () => {
    if (quoteItems.length === 0) {
      toast({
        title: "No Items in Quote",
        description: "Please add items to your quote before sending email",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: "No Customer Selected",
        description: "Please select a customer before sending email",
        variant: "destructive",
      });
      return;
    }

    // Generate email content
    const quoteNumber = `4SG-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const emailSubject = `Quote ${quoteNumber} from 4S Graphics`;
    const emailBody = `Dear Mr. ${selectedCustomer.firstName} ${selectedCustomer.lastName}

Thank you for interest in our products, here is the quote you requested:

${quoteItems.map((item) => 
  `Product Name: ${item.productName}
Product Type: ${item.productType}
Size: ${item.size}
Item Code: ${item.itemCode}
Price/Sheet: $${item.pricePerSheet.toFixed(2)}
Minimum Order Quantity: ${item.minOrderQty}

—————————————`
).join('\n\n')}

We eagerly look forward for your business.

Yours truly
4S Graphics Team`;

    // Create mailto link
    const mailtoLink = `mailto:${selectedCustomer.email}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open default email client
    window.location.href = mailtoLink;
    
    // Show success message
    toast({
      title: "Email Client Opened",
      description: `Comprehensive quote email composed for ${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
    });
    
    setIsEmailDialogOpen(false);
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading product data...</div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">QuickQuotes</h1>
          <p className="text-gray-600 mt-2">
            Generate instant quotes for your products
          </p>
        </div>
      </div>

      {/* Customer Selection Section */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Customer Selection
          </CardTitle>
          <CardDescription>
            Select a customer to generate quotes for
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left Column - Customer Search */}
            <div className="space-y-4">
              <Label>Select Customer</Label>
              <SearchableCustomerSelect
                selectedCustomer={selectedCustomer}
                onCustomerSelect={setSelectedCustomer}
                placeholder="Search customers by name, company, or email..."
                className="w-full"
              />
            </div>

            {/* Right Column - Customer Details */}
            <div className="space-y-4">
              <Label>Customer Details</Label>
              {selectedCustomer ? (
                <div className="bg-gray-50 p-4 rounded-lg space-y-3">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600" />
                    <span className="font-medium">
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </span>
                  </div>
                  
                  {selectedCustomer.company && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">{selectedCustomer.company}</span>
                    </div>
                  )}
                  
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">{selectedCustomer.email}</span>
                    </div>
                  )}
                  
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">{selectedCustomer.phone}</span>
                    </div>
                  )}
                  
                  {(selectedCustomer.city || selectedCustomer.province) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-blue-600" />
                      <span className="text-sm">
                        {[selectedCustomer.city, selectedCustomer.province].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-gray-50 p-4 rounded-lg text-center text-gray-500">
                  <User className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                  <p className="text-sm">Select a customer to view details</p>
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Panel - Configure Product */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5" />
              Configure Product
            </CardTitle>
            <CardDescription>
              Select product specifications for your quote
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Product Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Product Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select product category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={category} value={category}>
                      {category}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Product Type */}
            {selectedCategory && (
              <div className="space-y-2">
                <Label htmlFor="type">Product Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select product type" />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypes.map(type => (
                      <SelectItem key={type} value={type}>
                        {type}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Size */}
            {selectedType && (
              <div className="space-y-2">
                <Label htmlFor="size">Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map(product => (
                      <SelectItem key={product.size} value={product.size}>
                        {product.size} ({product.total_sqm.toFixed(4)} m²)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            {selectedSize && (
              <div className="space-y-2">
                <Label htmlFor="quantity">Quantity</Label>
                <Input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  min={selectedProduct?.min_quantity || 1}
                />
                {selectedProduct && quantity < selectedProduct.min_quantity && (
                  <p className="text-sm text-amber-600">
                    Minimum order quantity: {selectedProduct.min_quantity}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Right Panel - Quote Summary */}
        <Card>
          <CardHeader>
            <CardTitle>Quote Summary</CardTitle>
            <CardDescription>
              Available pricing tiers and current selection
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProduct ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 gap-3">
                  {pricingTiers.map(tier => {
                    const price = selectedProduct[tier.key as keyof ProductData] as number;
                    const pricePerSheet = price * selectedProduct.total_sqm;
                    const useQuantity = Math.max(quantity, selectedProduct.min_quantity);
                    const total = pricePerSheet * useQuantity;

                    return (
                      <div key={tier.key} className="flex items-center justify-between p-3 border rounded-lg">
                        <div>
                          <div className="font-medium">{tier.label}</div>
                          <div className="text-sm text-gray-600">
                            ${price.toFixed(2)}/m² • ${pricePerSheet.toFixed(2)}/sheet
                          </div>
                          <div className="text-sm text-gray-500">
                            {useQuantity} sheets = ${total.toFixed(2)}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => addToQuote(tier.key)}
                          className="gap-1"
                        >
                          <Plus className="h-4 w-4" />
                          Add
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-gray-500">
                Select a product to see pricing options
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Quote Items */}
      {quoteItems.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Quote Items</CardTitle>
            <CardDescription>
              Items added to your current quote
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Product</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price/m²</TableHead>
                    <TableHead>Price/Sheet</TableHead>
                    <TableHead>Total</TableHead>
                    <TableHead></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {quoteItems.map(item => (
                    <TableRow key={item.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{item.productName}</div>
                          <div className="text-sm text-gray-600">{item.productType}</div>
                          <div className="text-xs text-gray-500">{item.itemCode}</div>
                        </div>
                      </TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{item.tier}</Badge>
                      </TableCell>
                      <TableCell>{item.quantity}</TableCell>
                      <TableCell>${item.pricePerSqM.toFixed(2)}</TableCell>
                      <TableCell>${item.pricePerSheet.toFixed(2)}</TableCell>
                      <TableCell className="font-medium">${item.total.toFixed(2)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => removeFromQuote(item.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              <div className="flex items-center justify-between pt-4 border-t">
                <div className="text-lg font-semibold">
                  Total: ${totalAmount.toFixed(2)}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => generatePDFMutation.mutate()}
                    disabled={generatePDFMutation.isPending || !selectedCustomer}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleEmailQuote}
                    disabled={!selectedCustomer}
                    className="gap-2"
                  >
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
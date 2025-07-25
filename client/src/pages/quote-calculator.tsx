import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, Mail, Calculator, Building, Phone, MapPin, User, FileText, Film, Palette, Layers, Paintbrush, Image, Printer, Frame, Monitor, Zap } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";

interface ProductData {
  id: number;
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  totalSqm: number;
  minQuantity: number;
  exportPrice: number;
  masterDistributorPrice: number;
  dealerPrice: number;
  dealer2Price: number;
  approvalNeededPrice: number;
  tierStage25Price: number;
  tierStage2Price: number;
  tierStage15Price: number;
  tierStage1Price: number;
  retailPrice: number;
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
  { key: 'exportPrice', label: 'Export' },
  { key: 'masterDistributorPrice', label: 'Master Distributor' },
  { key: 'dealerPrice', label: 'Dealer' },
  { key: 'dealer2Price', label: 'Dealer 2' },
  { key: 'approvalNeededPrice', label: 'Approval Needed' },
  { key: 'tierStage25Price', label: 'Stage 2.5' },
  { key: 'tierStage2Price', label: 'Stage 2' },
  { key: 'tierStage15Price', label: 'Stage 1.5' },
  { key: 'tierStage1Price', label: 'Stage 1' },
  { key: 'retailPrice', label: 'Retail' }
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

  // Product category icon mapping with colors
  const getProductIcon = (productName: string) => {
    if (productName.includes('CliQ')) return Monitor;
    if (productName.includes('DTF') || productName.includes('Film')) return Film;
    if (productName.includes('Graffiti Blended Poly')) return Palette;
    if (productName.includes('Graffiti Polyester Paper')) return FileText;
    if (productName.includes('Graffiti SOFT Poly')) return Layers;
    if (productName.includes('Graffiti STICK')) return Zap;
    if (productName.includes('Offset Printing Plates')) return Printer;
    if (productName.includes('Rang Print Canvas')) return Frame;
    if (productName.includes('Screen Printing Positives')) return Image;
    if (productName.includes('Solvit')) return Paintbrush;
    return FileText; // Default icon
  };

  // Product category color mapping
  const getProductIconColor = (productName: string) => {
    if (productName.includes('CliQ')) return 'text-blue-600';
    if (productName.includes('DTF') || productName.includes('Film')) return 'text-purple-600';
    if (productName.includes('Graffiti Blended Poly')) return 'text-pink-600';
    if (productName.includes('Graffiti Polyester Paper')) return 'text-green-600';
    if (productName.includes('Graffiti SOFT Poly')) return 'text-indigo-600';
    if (productName.includes('Graffiti STICK')) return 'text-yellow-600';
    if (productName.includes('Offset Printing Plates')) return 'text-gray-600';
    if (productName.includes('Rang Print Canvas')) return 'text-orange-600';
    if (productName.includes('Screen Printing Positives')) return 'text-red-600';
    if (productName.includes('Solvit')) return 'text-teal-600';
    return 'text-gray-600'; // Default color
  };

  // Fetch product pricing data from new database
  const { data: productData = [], isLoading } = useQuery<ProductData[]>({
    queryKey: ['/api/product-pricing-database'],
    queryFn: async () => {
      const response = await fetch('/api/product-pricing-database');
      if (!response.ok) {
        throw new Error('Failed to fetch pricing data');
      }
      const result = await response.json();
      return result.data || []; // Extract data from response wrapper
    },
  });

  // Get unique categories
  const categories = Array.from(new Set(productData.map(item => item.productName))).sort();
  
  // Get product types for selected category
  const productTypes = selectedCategory
    ? Array.from(new Set(productData.filter(item => item.productName === selectedCategory).map(item => item.productType))).sort()
    : [];

  // Get sizes for selected type
  const availableSizes = selectedCategory && selectedType
    ? productData.filter(item => 
        item.productName === selectedCategory && 
        item.productType === selectedType
      ).sort((a, b) => parseFloat(String(a.totalSqm || 0)) - parseFloat(String(b.totalSqm || 0)))
    : [];

  // Get selected product details
  const selectedProduct = productData.find(item =>
    item.productName === selectedCategory &&
    item.productType === selectedType &&
    item.size === selectedSize
  );

  const addToQuote = (tier: string) => {
    if (!selectedProduct) return;

    const tierPrice = selectedProduct[tier as keyof ProductData] as number;
    const pricePerSheet = tierPrice * parseFloat(String(selectedProduct.totalSqm || 0));
    const useQuantity = Math.max(quantity, selectedProduct.minQuantity);
    const total = pricePerSheet * useQuantity;

    const quoteItem: QuoteItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: selectedProduct.productName,
      productType: selectedProduct.productType,
      size: selectedProduct.size,
      itemCode: selectedProduct.itemCode,
      quantity: useQuantity,
      pricePerSqM: tierPrice,
      pricePerSheet: pricePerSheet,
      total: total,
      tier: tier,
      squareMeters: parseFloat(String(selectedProduct.totalSqm || 0)),
      minOrderQty: selectedProduct.minQuantity
    };

    setQuoteItems(prev => [...prev, quoteItem]);
    toast({
      title: "Item Added",
      description: `Added ${selectedProduct.productType} to quote`,
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

      const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
      
      const response = await fetch('/api/generate-pdf-quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName: selectedCustomer ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : "Customer",
          customerEmail: selectedCustomer?.email || null,
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

    // Generate email content
    const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
    
    // Generate quote number on server side to ensure uniqueness
    const quoteNumberResponse = await fetch('/api/generate-quote-number', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    
    const { quoteNumber } = await quoteNumberResponse.json();
    const currentDate = new Date().toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    
    const customerName = selectedCustomer ? 
      `${selectedCustomer.firstName} ${selectedCustomer.lastName}` : 
      'Customer';
    const customerEmail = selectedCustomer?.email || '';

    const emailSubject = `Quote ${quoteNumber} from 4S Graphics`;
    const emailBody = `Dear ${customerName},

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
    const mailtoLink = `mailto:${customerEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open default email client
    window.location.href = mailtoLink;
    
    // Show success message
    toast({
      title: "Email Client Opened",
      description: selectedCustomer ? 
        `Comprehensive quote email composed for ${customerName}` :
        "Quote email composed - please add recipient email address",
    });
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

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Panel - Configure Product */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Calculator className="h-5 w-5 text-purple-600" />
              Configure Product
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Product Category */}
            <div className="space-y-2">
              <Label className="text-base font-medium text-gray-900">Product</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="h-12 text-base border-2 border-purple-200 rounded-lg">
                  <SelectValue placeholder="Select product category">
                    {selectedCategory && (() => {
                      const IconComponent = getProductIcon(selectedCategory);
                      const iconColor = getProductIconColor(selectedCategory);
                      return (
                        <div className="flex items-center gap-2">
                          <IconComponent className={`h-5 w-5 ${iconColor}`} />
                          <span className="font-medium">
                            {selectedCategory.includes('Graffiti') ? (
                              <>
                                <span className="font-graffiti">Graffiti</span>
                                <sup className="text-xs">™</sup>
                                <span>{selectedCategory.replace('Graffiti', '').trim()}</span>
                              </>
                            ) : (
                              selectedCategory
                            )}
                          </span>
                        </div>
                      );
                    })()}
                  </SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => {
                    const IconComponent = getProductIcon(category);
                    const iconColor = getProductIconColor(category);
                    return (
                      <SelectItem key={category} value={category}>
                        <div className="flex items-center gap-2">
                          <IconComponent className={`h-4 w-4 ${iconColor}`} />
                          <span>
                            {category.includes('Graffiti') ? (
                              <>
                                <span className="font-graffiti">Graffiti</span>
                                <sup className="text-xs">™</sup>
                                <span>{category.replace('Graffiti', '').trim()}</span>
                              </>
                            ) : (
                              category
                            )}
                          </span>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {/* Product Type */}
            <div className="space-y-2">
              <Label className="text-base font-medium text-red-600">Product Type</Label>
              <Select 
                value={selectedType} 
                onValueChange={setSelectedType}
                disabled={!selectedCategory}
              >
                <SelectTrigger className="h-12 text-base border-2 border-gray-200 rounded-lg bg-gray-50">
                  <SelectValue placeholder="Select a type" />
                </SelectTrigger>
                <SelectContent>
                  {productTypes.map(type => (
                    <SelectItem key={type} value={type}>
                      {type}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && !selectedType && (
                <p className="text-sm text-red-600 font-medium">Product type is required</p>
              )}
            </div>

            {/* Size Selection */}
            {selectedType && (
              <div className="space-y-2">
                <Label className="text-base font-medium text-gray-900">Size</Label>
                <Select value={selectedSize} onValueChange={setSelectedSize}>
                  <SelectTrigger className="h-12 text-base border-2 border-gray-200 rounded-lg bg-gray-50">
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent>
                    {availableSizes.map(product => (
                      <SelectItem key={product.size} value={product.size}>
                        {product.size} ({parseFloat(String(product.totalSqm || 0)).toFixed(4)} m²)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* Quantity */}
            <div className="space-y-2">
              <Label className="text-base font-medium text-gray-900">Quantity</Label>
              <Input
                type="number"
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                min={selectedProduct?.minQuantity || 1}
                className="h-12 text-base border-2 border-gray-200 rounded-lg bg-gray-50"
                disabled={!selectedSize}
              />
              {selectedProduct && quantity < selectedProduct.minQuantity && (
                <p className="text-sm text-red-600 font-medium">
                  Minimum order quantity: {selectedProduct.minQuantity}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Right Panel - Quote Summary */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-2xl font-bold text-gray-900">QUOTE SUMMARY</CardTitle>
            <CardDescription className="text-gray-600">
              Using default pricing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {selectedProduct ? (
              <div className="space-y-4">
                {/* Product Details Summary */}
                <div className="space-y-2 pb-3 border-b border-gray-200">
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Product Brand:</span>
                    <span className="flex items-center gap-1">
                      {selectedCategory && (() => {
                        const IconComponent = getProductIcon(selectedCategory);
                        const iconColor = getProductIconColor(selectedCategory);
                        return <IconComponent className={`h-4 w-4 ${iconColor}`} />;
                      })()}
                      {!selectedCategory && <FileText className="h-4 w-4 text-gray-600" />}
                      <span>
                        {selectedCategory?.includes('Graffiti') ? (
                          <>
                            <span className="font-graffiti">Graffiti</span>
                            <sup className="text-xs">™</sup>
                            <span>{selectedCategory.replace('Graffiti', '').trim()}</span>
                          </>
                        ) : (
                          selectedCategory || 'Not Selected'
                        )}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Product Type:</span>
                    <span>
                      {selectedType ? (
                        selectedType.includes('Graffiti') ? (
                          <>
                            <span className="font-graffiti">Graffiti</span>
                            <sup className="text-xs">™</sup>
                            <span> {selectedType.replace('Graffiti', '').trim()}</span>
                          </>
                        ) : (
                          selectedType
                        )
                      ) : (
                        'Not Selected'
                      )}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Product Size:</span>
                    <span>{selectedSize || 'Not Selected'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Total Sqm:</span>
                    <span>
                      {selectedProduct ? 
                        `${parseFloat(String(selectedProduct.totalSqm || 0)).toFixed(4)} sqm` : 
                        'Not Calculated'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Total Quantity:</span>
                    <span className="flex items-center gap-2">
                      <span className="inline-flex items-center justify-center w-6 h-6 text-sm font-bold text-red-600 border border-red-600 rounded">
                        {selectedProduct ? Math.max(quantity, selectedProduct.minQuantity) : quantity}
                      </span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-medium text-gray-900">Min. Order Qty:</span>
                    <span>
                      {selectedProduct ? 
                        `${selectedProduct.minQuantity} Sheets` : 
                        'Not Available'
                      }
                    </span>
                  </div>
                </div>

                {/* Pricing Table */}
                <div className="space-y-1">
                  {/* Table Header */}
                  <div className="grid grid-cols-5 gap-2 text-xs font-light text-gray-600 pb-1 border-b border-gray-200">
                    <div className="pr-1">Pricing Tier</div>
                    <div className="text-center">$/m²</div>
                    <div className="text-center">Price/Sheet</div>
                    <div className="text-center">Min. Order Qty Price</div>
                    <div className="text-center">Add</div>
                  </div>

                  {/* Pricing Rows */}
                  {pricingTiers.map(tier => {
                    const price = selectedProduct[tier.key as keyof ProductData] as number;
                    const pricePerSheet = price * parseFloat(String(selectedProduct.totalSqm || 0));
                    const useQuantity = Math.max(quantity, selectedProduct.minQuantity);
                    const total = pricePerSheet * useQuantity;

                    return (
                      <div key={tier.key} className="grid grid-cols-5 gap-2 items-center py-1 border-b border-gray-100">
                        <div className="font-light text-gray-900 uppercase text-xs pr-1 truncate">
                          {tier.label.replace('Approval Needed', 'Approval (Retail)')}
                        </div>
                        <div className="text-center font-light text-xs">
                          ${price.toFixed(2)}
                        </div>
                        <div className="text-center font-light text-xs">
                          ${pricePerSheet.toFixed(2)}
                        </div>
                        <div className="text-center font-medium text-xs">
                          ${total.toFixed(2)}
                        </div>
                        <div className="text-center">
                          <Button
                            size="sm"
                            onClick={() => addToQuote(tier.key)}
                            className="h-5 w-5 rounded-full p-0 bg-gray-100 hover:bg-gray-200 border border-gray-300"
                            variant="outline"
                          >
                            <Plus className="h-2 w-2 text-gray-600" />
                          </Button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <Calculator className="h-16 w-16 mx-auto mb-4 text-gray-300" />
                <p className="text-lg">Select a product to see pricing options</p>
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
                    disabled={generatePDFMutation.isPending}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Download PDF
                  </Button>
                  <Button
                    variant="outline"
                    onClick={handleEmailQuote}
                    disabled={false}
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
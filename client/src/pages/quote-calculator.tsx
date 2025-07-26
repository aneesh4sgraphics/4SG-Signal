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
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import { AdaptiveTable } from "@/components/OdooTable";

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

const allPricingTiers = [
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
  const { user } = useAuth();
  
  // Get user role and filter pricing tiers accordingly
  const userRole = getUserRoleFromEmail((user as any)?.email || '');
  const pricingTiers = allPricingTiers.filter(tier => canAccessTier(tier.label, userRole));

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

  const handleEmailQuote = async () => {
    if (quoteItems.length === 0) {
      toast({
        title: "No Items in Quote",
        description: "Please add items to your quote before sending email",
        variant: "destructive",
      });
      return;
    }

    try {
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
    // Calculate total amount based on Min Order Qty × Price/Sheet
    const calculatedTotalAmount = quoteItems.reduce((sum, item) => {
      const orderQty = Math.max(item.minOrderQty || 0, item.quantity);
      const itemTotal = orderQty * item.pricePerSheet;
      return sum + itemTotal;
    }, 0);

    const emailBody = `Dear ${customerName},

Thank you for interest in our products, here is the quote you requested:

${quoteItems.map((item) => {
  const orderQty = Math.max(item.minOrderQty || 0, item.quantity);
  const itemTotal = orderQty * item.pricePerSheet;
  
  return `Product Name: ${item.productName}
Product Type: ${item.productType}
Size: ${item.size}
Item Code: ${item.itemCode}
Minimum Order Quantity: ${item.minOrderQty}
Price/Sheet: $${item.pricePerSheet.toFixed(2)}
Total: $${itemTotal.toFixed(2)}

—————————————`;
}).join('\n\n')}

Total Amount: $${calculatedTotalAmount.toFixed(2)}

Payment Instructions:
All payments should be made to 4S GRAPHICS, INC. only.
ACH Payments: Account# 0126734133 | Routing# 063104668 | SWIFT Code: UPNBUS44 / ABA: 062005690
Credit Cards: Visa, MasterCard, and American Express (4.5% processing fee applies)
Zelle Payments: Linked Phone Number for Payment: 260-580-0526
PayPal Payments: info@4sgraphics.com (4.5% PayPal fee applies)
Shipping Costs: At Actuals - Discuss with your Sales Rep to get accurate Shipping costs

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
    
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate quote number for email",
        variant: "destructive",
      });
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading product data...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-full mx-auto px-4 py-4 xl:px-8 xl:py-6">
        {/* Floating elements for visual enhancement */}
        <div className="mb-6 relative">
          <FloatingElements />
        </div>

      <div className="grid grid-cols-1 xl:grid-cols-5 lg:grid-cols-4 gap-6">
        {/* Left Panel - Configure Product */}
        <div className="xl:col-span-1 lg:col-span-1">
          <SimpleCardFrame className="p-6 mb-6">
            <h2 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
              <IconBadge icon={Calculator} label="Configure Product" className="px-0 py-0 bg-transparent border-none text-lg font-medium text-gray-800" />
            </h2>
            <p className="text-sm text-gray-500 mb-6">Select your product specifications</p>
            <SectionDivider />
            <div className="space-y-6">
              {/* Product Category */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Product</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
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
                <label className="block text-sm font-medium text-gray-800">Product Type</label>
                <Select 
                  value={selectedType} 
                  onValueChange={setSelectedType}
                  disabled={!selectedCategory}
                >
                  <SelectTrigger className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100">
                  <SelectValue placeholder="Select a type" className="truncate" />
                </SelectTrigger>
                <SelectContent className="max-w-none w-auto min-w-[250px]">
                  {productTypes.map(type => (
                    <SelectItem key={type} value={type} className="max-w-none whitespace-nowrap">
                      <span className="whitespace-nowrap">{type}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCategory && !selectedType && (
                <p className="text-sm text-red-500 font-light">Product type is required</p>
              )}
            </div>

              {/* Size Selection */}
              {selectedType && (
                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-800">Size</label>
                  <Select value={selectedSize} onValueChange={setSelectedSize}>
                    <SelectTrigger className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                      <SelectValue placeholder="Select size" className="truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-w-none w-auto min-w-[200px]">
                      {availableSizes.map(product => (
                        <SelectItem key={product.size} value={product.size} className="max-w-none whitespace-nowrap">
                          <span className="whitespace-nowrap">{product.size} ({parseFloat(String(product.totalSqm || 0)).toFixed(4)} m²)</span>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <label className="block text-sm font-medium text-gray-800">Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => e.target.select()}
                  min={selectedProduct?.minQuantity || 1}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100"
                  disabled={!selectedSize}
                />
                {selectedProduct && quantity < selectedProduct.minQuantity && (
                  <p className="text-sm text-red-500">
                    Minimum order quantity: {selectedProduct.minQuantity}
                  </p>
                )}
              </div>
            </div>
          </SimpleCardFrame>
        </div>

        {/* Right Panel - Quote Summary */}
        <div className="xl:col-span-4 lg:col-span-3">
          <div className="border border-gray-200 rounded-lg p-6 bg-white mb-6">
            <h2 className="text-lg font-medium text-gray-800 mb-2">Quote Summary</h2>
            <p className="text-sm text-gray-500 mb-6">Using default pricing</p>
            <div>
            {selectedProduct ? (
              <div className="space-y-4">
                {/* Product Details Summary */}
                <div className="space-y-2 pb-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Product Brand:</span>
                    <span className="flex items-center gap-1">
                      {selectedCategory && (() => {
                        const IconComponent = getProductIcon(selectedCategory);
                        const iconColor = getProductIconColor(selectedCategory);
                        return <IconComponent className={`h-4 w-4 ${iconColor}`} />;
                      })()}
                      {!selectedCategory && <FileText className="h-4 w-4 text-gray-600" />}
                      <span className="text-sm text-gray-800">
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
                    <span className="font-normal text-gray-600">Product Type:</span>
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
                    <span className="font-normal text-gray-600">Product Size:</span>
                    <span>{selectedSize || 'Not Selected'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal text-gray-600">Total Sqm:</span>
                    <span className="font-light">
                      {selectedProduct ? 
                        `${parseFloat(String(selectedProduct.totalSqm || 0)).toFixed(4)} sqm` : 
                        'Not Calculated'
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal text-gray-600">Total Quantity:</span>
                    <span className="flex items-center gap-2">
                      {(() => {
                        const currentQty = quantity;
                        const minOrderQty = selectedProduct?.minQuantity || 1;
                        
                        // Determine color and styling based on logic:
                        // 1. If quantity < min order qty -> RED and BOLD
                        // 2. If quantity >= min order qty AND divisible by min order qty -> BLACK and BOLD
                        // 3. If quantity >= min order qty BUT NOT divisible by min order qty -> RED and BOLD
                        
                        const isAboveMinimum = currentQty >= minOrderQty;
                        const isDivisibleByMin = currentQty % minOrderQty === 0;
                        
                        const shouldShowRed = !isAboveMinimum || (isAboveMinimum && !isDivisibleByMin);
                        const shouldShowBlack = isAboveMinimum && isDivisibleByMin;
                        
                        return (
                          <span className={`text-sm font-bold ${shouldShowRed ? 'text-red-600' : 'text-black'}`}>
                            {currentQty}
                          </span>
                        );
                      })()}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-normal text-gray-600">Min. Order Qty:</span>
                    <span className="font-light">
                      {selectedProduct ? 
                        `${selectedProduct.minQuantity} Sheets` : 
                        'Not Available'
                      }
                    </span>
                  </div>
                </div>

                {/* Pricing Table */}
                <div className="mt-6">
                  <h3 className="text-base font-medium text-gray-800 mb-4">Available Pricing Tiers</h3>
                  <AdaptiveTable
                    columns={[
                      { 
                        key: 'tier', 
                        title: 'Pricing Tier', 
                        weight: 2,
                        minWidth: 120,
                        align: 'left' 
                      },
                      // Only show $/m² column for admin users
                      ...(user?.role === 'admin' ? [{ 
                        key: 'pricePerSqM', 
                        title: '$/m²', 
                        weight: 1,
                        minWidth: 80,
                        align: 'center' as const
                      }] : []),
                      { 
                        key: 'pricePerSheet', 
                        title: 'Price/Sheet', 
                        weight: 1.2,
                        minWidth: 100,
                        align: 'center' 
                      },
                      { 
                        key: 'minOrderQtyPrice', 
                        title: 'Min Order Qty Price', 
                        weight: 1.5,
                        minWidth: 130,
                        align: 'center' 
                      },
                      { 
                        key: 'add', 
                        title: 'Add', 
                        weight: 0.5,
                        minWidth: 60,
                        maxWidth: 80,
                        align: 'center',
                        fixed: true 
                      }
                    ]}
                    data={pricingTiers.map(tier => {
                      const price = selectedProduct[tier.key as keyof ProductData] as number;
                      const pricePerSheet = price * parseFloat(String(selectedProduct.totalSqm || 0));
                      const useQuantity = Math.max(quantity, selectedProduct.minQuantity);
                      const total = pricePerSheet * useQuantity;
                      
                      return {
                        tier: tier,
                        price: price,
                        pricePerSheet: pricePerSheet,
                        total: total,
                        tierKey: tier.key
                      };
                    })}
                    renderCell={(item, column) => {
                      switch (column.key) {
                        case 'tier':
                          return (
                            <span className="text-sm text-gray-800 uppercase font-medium">
                              {item.tier.label.replace('Approval Needed', 'Approval (Retail)')}
                            </span>
                          );
                        case 'pricePerSqM':
                          // Only show for admin users (column is conditionally included)
                          return (
                            <span className="text-sm text-gray-600">
                              ${item.price.toFixed(2)}
                            </span>
                          );
                        case 'pricePerSheet':
                          return (
                            <span className="text-sm text-gray-600">
                              ${item.pricePerSheet.toFixed(2)}
                            </span>
                          );
                        case 'minOrderQtyPrice':
                          return (
                            <span className="text-sm text-gray-800 font-medium">
                              ${item.total.toFixed(2)}
                            </span>
                          );
                        case 'add':
                          return (
                            <button
                              onClick={() => addToQuote(item.tierKey)}
                              className="w-6 h-6 rounded-md border border-gray-300 bg-white hover:bg-gray-100 flex items-center justify-center transition-colors mx-auto"
                            >
                              <Plus className="h-3 w-3 text-gray-600" />
                            </button>
                          );
                        default:
                          return null;
                      }
                    }}
                    maxHeight="400px"
                  />
                </div>
              </div>
              ) : (
                <div className="text-center py-12">
                  <Calculator className="h-12 w-12 mx-auto mb-4 text-gray-400" />
                  <p className="text-sm text-gray-500">Select a product to see pricing options</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Customer Selection Section - Single Column */}
      <SimpleCardFrame className="p-6 mb-6 bg-white border border-gray-100">
        <h2 className="text-lg font-normal text-gray-800 mb-2 flex items-center gap-2">
          <IconBadge icon={User} label="Customer Selection" className="px-0 py-0 bg-transparent border-none text-lg font-normal text-gray-800" />
        </h2>
        <p className="text-sm text-gray-500 mb-6">Select a customer to generate quotes for</p>
        <SectionDivider />
        
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {/* Customer Search */}
          <div className="lg:col-span-1">
            <label className="block text-sm font-medium text-gray-800 mb-2">Select Customer</label>
            <SearchableCustomerSelect
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              placeholder="Search by name, company, or email"
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Customer Details */}
          <div className="xl:col-span-2 lg:col-span-1">
            <label className="block text-sm font-normal text-gray-800 mb-2">Customer Details</label>
            {selectedCustomer ? (
              <div className="rounded-md p-4 space-y-3 border border-gray-100 bg-gray-50">
                <div className="flex items-center gap-2">
                  <User className="h-4 w-4 text-gray-500" />
                  <span className="text-sm text-gray-800">
                    {selectedCustomer.firstName} {selectedCustomer.lastName}
                  </span>
                </div>
                
                {selectedCustomer.company && (
                  <div className="flex items-center gap-2">
                    <Building className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">{selectedCustomer.company}</span>
                  </div>
                )}
                
                {selectedCustomer.email && (
                  <div className="flex items-center gap-2">
                    <Mail className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">{selectedCustomer.email}</span>
                  </div>
                )}
                
                {selectedCustomer.phone && (
                  <div className="flex items-center gap-2">
                    <Phone className="h-4 w-4 text-gray-500" />
                    <span className="text-sm text-gray-500">{selectedCustomer.phone}</span>
                  </div>
                )}
                
                {(selectedCustomer.city || selectedCustomer.province) && (
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-gray-600" />
                    <span className="text-sm text-gray-500">
                      {[selectedCustomer.city, selectedCustomer.province].filter(Boolean).join(', ')}
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <div className="border border-gray-200 rounded-md p-4 bg-gray-50 text-center">
                <User className="h-6 w-6 mx-auto mb-2 text-gray-400" />
                <p className="text-sm text-gray-500">Select a customer to view details</p>
              </div>
            )}
          </div>
        </div>
      </SimpleCardFrame>

      {/* Quote Items */}
      {quoteItems.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-6 bg-white mb-6">
          <h2 className="text-lg font-medium text-gray-800 mb-2">Quote Items</h2>
          <p className="text-sm text-gray-500 mb-6">Items added to your current quote</p>
          <div>
            <AdaptiveTable
              columns={[
                { 
                  key: 'product', 
                  title: 'Product', 
                  weight: 4,
                  minWidth: 220,
                  align: 'left' 
                },
                { 
                  key: 'size', 
                  title: 'Size', 
                  weight: 1.2,
                  minWidth: 80,
                  align: 'left' 
                },
                { 
                  key: 'tier', 
                  title: 'Tier', 
                  weight: 1,
                  minWidth: 80,
                  align: 'center' 
                },
                { 
                  key: 'qty', 
                  title: 'Qty', 
                  weight: 0.8,
                  minWidth: 60,
                  align: 'center' 
                },
                { 
                  key: 'pricePerSqM', 
                  title: 'Price/m²', 
                  weight: 1,
                  minWidth: 80,
                  align: 'right' 
                },
                { 
                  key: 'pricePerSheet', 
                  title: 'Price/Sheet', 
                  weight: 1.2,
                  minWidth: 90,
                  align: 'right' 
                },
                { 
                  key: 'total', 
                  title: 'Total', 
                  weight: 1,
                  minWidth: 80,
                  align: 'right' 
                },
                { 
                  key: 'actions', 
                  title: '', 
                  weight: 0.5,
                  minWidth: 50,
                  maxWidth: 60,
                  align: 'center',
                  fixed: true 
                }
              ]}
              data={quoteItems}
              renderCell={(item, column) => {
                switch (column.key) {
                  case 'product':
                    return (
                      <div className="min-w-0">
                        <div className="text-sm text-gray-800 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={item.productName}>{item.productName}</div>
                        <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis" title={item.productType}>{item.productType}</div>
                        <div className="text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={item.itemCode}>{item.itemCode}</div>
                      </div>
                    );
                  case 'size':
                    return <span className="text-sm text-gray-600">{item.size}</span>;
                  case 'tier':
                    return (
                      <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-800 border border-gray-200">
                        {item.tier}
                      </span>
                    );
                  case 'qty':
                    return <span className="text-sm text-gray-600">{item.quantity}</span>;
                  case 'pricePerSqM':
                    return <span className="text-sm text-gray-600">${item.pricePerSqM.toFixed(2)}</span>;
                  case 'pricePerSheet':
                    return <span className="text-sm text-gray-600">${item.pricePerSheet.toFixed(2)}</span>;
                  case 'total':
                    return <span className="text-sm text-gray-800 font-medium">${item.total.toFixed(2)}</span>;
                  case 'actions':
                    return (
                      <button
                        onClick={() => removeFromQuote(item.id)}
                        className="w-6 h-6 rounded-md border border-gray-300 bg-white hover:bg-red-50 hover:border-red-300 flex items-center justify-center transition-colors mx-auto"
                      >
                        <Trash2 className="h-3 w-3 text-red-500" />
                      </button>
                    );
                  default:
                    return null;
                }
              }}
              maxHeight="300px"
            />

            <div className="flex items-center justify-between pt-6 border-t border-gray-200">
              <div className="text-base font-medium text-gray-800">
                Total: ${totalAmount.toFixed(2)}
              </div>
              <div className="flex gap-3">
                <button
                  onClick={() => generatePDFMutation.mutate()}
                  disabled={generatePDFMutation.isPending}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <Download className="h-4 w-4" />
                  Download PDF
                </button>
                <button
                  onClick={handleEmailQuote}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  <Mail className="h-4 w-4" />
                  Email Quote
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
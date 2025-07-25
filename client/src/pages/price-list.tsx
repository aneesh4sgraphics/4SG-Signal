import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Download, FileText, FileSpreadsheet } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";

interface ProductData {
  [key: string]: string | number;
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

interface PriceListItem {
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  minQty: number;
  pricePerSqM: number;
  pricePerSheet: number;
  pricePerPack: number;
  squareMeters: number;
}

interface Customer {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  company: string;
  companyName?: string;
  contactName?: string;
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

export default function PriceList() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("Export");
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  
  const { toast } = useToast();

  // Fetch product pricing data
  const { data: productData = [], isLoading } = useQuery<ProductData[]>({
    queryKey: ['/api/product-pricing-data'],
  });

  // Get unique categories
  const categories = Array.from(new Set(productData.map(item => item.product_name))).sort();

  // Generate price list when category or tier changes
  useEffect(() => {
    if (selectedCategory && selectedTier) {
      const filteredProducts = productData.filter(
        (item) => item.product_name === selectedCategory
      );

      console.log('Filtered products for category:', selectedCategory, filteredProducts.length);
      console.log('Selected tier:', selectedTier);
      console.log('Sample product data:', filteredProducts[0]);
      console.log('Available fields in product data:', filteredProducts[0] ? Object.keys(filteredProducts[0]) : 'No products found');

      const calculatedItems = filteredProducts.map((product) => {
        const pricePerSqM = Number(product[selectedTier]) || 0;
        const sqm = Number(product.total_sqm) || 0;
        const pricePerSheet = +(pricePerSqM * sqm).toFixed(2);
        const minQty = Number(product.min_quantity) || 1;
        const pricePerPack = +(pricePerSheet * minQty).toFixed(2);

        console.log('Processing product:', {
          rawProduct: product,
          productType: product.ProductType,
          size: product.size,
          itemCode: product.ItemCode,
          selectedTierValue: product[selectedTier],
          pricePerSqM,
          sqm,
          pricePerSheet,
          minQty,
          pricePerPack
        });

        return {
          productType: product.ProductType || 'Unknown',
          productName: product.product_name || selectedCategory,
          size: product.size || 'N/A',
          itemCode: product.ItemCode || '-',
          minQty,
          pricePerSqM,
          pricePerSheet,
          pricePerPack,
          squareMeters: sqm,
        };
      });

      setPriceListItems(
        calculatedItems.sort((a, b) => a.productType.localeCompare(b.productType))
      );
    } else {
      setPriceListItems([]);
    }
  }, [selectedCategory, selectedTier, productData]);

  const generatePDFMutation = useMutation({
    mutationFn: async () => {
      console.log('Enhanced PDF Generation Request:', {
        categoryName: selectedCategory,
        tierName: selectedTier,
        items: priceListItems.slice(0, 3), // Log first 3 items for debugging
        itemCount: priceListItems.length,
        customerName: selectedCustomer?.company || `${selectedCustomer?.firstName} ${selectedCustomer?.lastName}`
      });
      
      // Use the properly calculated items directly
      const calculatedItems = priceListItems.map(item => ({
        ...item,
        productCategory: selectedCategory
      }));
      
      console.log('Sending calculatedItems to PDF generator:', calculatedItems.slice(0, 2));
      
      const response = await fetch('/api/generate-price-list-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: selectedCategory,
          tierName: selectedTier,
          quoteNumber: `PL-${Date.now().toString().slice(-6)}`,
          items: calculatedItems,
          customerName: selectedCustomer?.company || `${selectedCustomer?.firstName} ${selectedCustomer?.lastName}` || null
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate PDF');
      return response.json();
    },
    onSuccess: (data) => {
      // Enhanced PDF generation with proper styling and download
      const html = data.html;
      const filename = data.filename || `PriceList-${selectedCategory}-${Date.now()}.pdf`;
      
      // Create blob for proper PDF download
      const printWindow = window.open('', '_blank');
      if (printWindow) {
        printWindow.document.write(html);
        printWindow.document.close();
        
        // Add print event listener for better UX
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
      }
      
      toast({
        title: "Professional PDF Generated",
        description: `Price list PDF created with enhanced 4S Graphics branding (${filename})`,
        duration: 4000,
      });
    },
    onError: (error) => {
      console.error('PDF Generation Error:', error);
      toast({
        title: "PDF Generation Failed",
        description: "Unable to generate price list PDF. Please try again.",
        variant: "destructive",
        duration: 4000,
      });
    }
  });

  const generateCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/generate-price-list-csv', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          categoryName: selectedCategory,
          tierName: selectedTier,
          quoteNumber: `PL${Date.now()}`,
          items: priceListItems
        })
      });
      
      if (!response.ok) throw new Error('Failed to generate CSV');
      return response.json();
    },
    onSuccess: (data) => {
      // Download CSV
      const blob = new Blob([data.csv], { type: 'text/csv' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = data.filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      toast({
        title: "CSV Downloaded",
        description: "Price list CSV has been downloaded successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate CSV",
        variant: "destructive",
      });
    }
  });

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
          <h1 className="text-3xl font-bold">Price List</h1>
          <p className="text-gray-600 mt-2">
            Generate comprehensive price lists for your products
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card>
        <CardHeader>
          <CardTitle>Price List Configuration</CardTitle>
          <CardDescription>
            Select product category and pricing tier to generate your price list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            {/* Pricing Tier */}
            <div className="space-y-2">
              <Label htmlFor="tier">Pricing Tier</Label>
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pricing tier" />
                </SelectTrigger>
                <SelectContent>
                  {pricingTiers.map(tier => (
                    <SelectItem key={tier.key} value={tier.key}>
                      {tier.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Customer Selection */}
            <div className="space-y-2">
              <Label htmlFor="customer">Customer (Optional)</Label>
              <SearchableCustomerSelect
                selectedCustomer={selectedCustomer}
                onCustomerSelect={setSelectedCustomer}
                placeholder="Search customers..."
              />
            </div>
          </div>

          {/* Download buttons */}
          {priceListItems.length > 0 && (
            <div className="flex gap-2 mt-4">
              <Button
                onClick={() => generatePDFMutation.mutate()}
                disabled={generatePDFMutation.isPending}
                className="gap-2"
                variant="default"
              >
                <FileText className="h-4 w-4" />
                Download PDF
              </Button>
              <Button
                onClick={() => generateCSVMutation.mutate()}
                disabled={generateCSVMutation.isPending}
                className="gap-2"
                variant="secondary"
              >
                <FileSpreadsheet className="h-4 w-4" />
                Export CSV
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Price List Table */}
      {priceListItems.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>
              Price List - {selectedCategory}
              <Badge variant="outline" className="ml-2">
                {pricingTiers.find(t => t.key === selectedTier)?.label}
              </Badge>
            </CardTitle>
            <CardDescription>
              {priceListItems.length} products found
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Item Code</TableHead>
                    <TableHead>Product Type</TableHead>
                    <TableHead>Size</TableHead>
                    <TableHead>Min Qty</TableHead>
                    <TableHead>Price/Sq.M</TableHead>
                    <TableHead>Price/Sheet</TableHead>
                    <TableHead>Price Per Pack</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {priceListItems.map((item, index) => (
                    <TableRow key={index}>
                      <TableCell className="font-mono text-sm">
                        {item.itemCode}
                      </TableCell>
                      <TableCell className="font-medium">
                        {item.productType}
                      </TableCell>
                      <TableCell>{item.size}</TableCell>
                      <TableCell>{item.minQty}</TableCell>
                      <TableCell>${item.pricePerSqM.toFixed(2)}</TableCell>
                      <TableCell>${item.pricePerSheet.toFixed(2)}</TableCell>
                      <TableCell className="font-semibold text-green-600">
                        ${item.pricePerPack.toFixed(2)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="text-center py-12">
            <div className="text-gray-500 mb-4">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg">No price list generated</p>
              <p className="text-sm">Select a product category to get started</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
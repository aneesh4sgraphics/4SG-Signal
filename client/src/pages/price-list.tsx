import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
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

const allPricingTiers = [
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
  const { user } = useAuth();
  
  // Get user role and filter pricing tiers accordingly
  const userRole = getUserRoleFromEmail(user?.claims?.email || '');
  const pricingTiers = allPricingTiers.filter(tier => canAccessTier(tier.label, userRole));

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

  // Generate price list when category or tier changes
  useEffect(() => {
    if (selectedCategory && selectedTier) {
      const filteredProducts = productData.filter(
        (item) => item.productName === selectedCategory
      );

      const calculatedItems = filteredProducts.map((product) => {
        // Map tier names to new database field names
        const tierMapping: Record<string, keyof ProductData> = {
          'Export': 'exportPrice',
          'M.Distributor': 'masterDistributorPrice', 
          'Dealer': 'dealerPrice',
          'Dealer2': 'dealer2Price',
          'ApprovalNeeded': 'approvalNeededPrice',
          'TierStage25': 'tierStage25Price',
          'TierStage2': 'tierStage2Price',
          'TierStage15': 'tierStage15Price',
          'TierStage1': 'tierStage1Price',
          'Retail': 'retailPrice'
        };
        
        const tierField = tierMapping[selectedTier];
        const pricePerSqM = Number(product[tierField]) || 0;
        const sqm = parseFloat(String(product.totalSqm || 0));
        const pricePerSheet = +(pricePerSqM * sqm).toFixed(2);
        const minQty = Number(product.minQuantity) || 1;
        const pricePerPack = +(pricePerSheet * minQty).toFixed(2);

        return {
          productType: String(product.productType || 'Unknown'),
          productName: String(product.productName || selectedCategory),
          size: String(product.size || 'N/A'),
          itemCode: String(product.itemCode || '-'),
          minQty,
          pricePerSqM,
          pricePerSheet,
          pricePerPack,
          squareMeters: sqm,
        };
      });

      setPriceListItems(
        calculatedItems.sort((a, b) => String(a.productType).localeCompare(String(b.productType)))
      );
    } else {
      setPriceListItems([]);
    }
  }, [selectedCategory, selectedTier, productData]);





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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="section-title text-4xl">Price List</h1>
          <p className="text-gray-500 font-light mt-3">
            Generate comprehensive price lists for your products
          </p>
        </div>
      </div>

      {/* Configuration */}
      <Card className="soft-card border-none">
        <CardHeader>
          <CardTitle className="section-title text-2xl">Price List Configuration</CardTitle>
          <CardDescription className="text-gray-500 font-light">
            Select product category and pricing tier to generate your price list
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Product Category */}
            <div className="space-y-3">
              <Label className="text-base font-normal text-gray-600">Product Category</Label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="ghost-dropdown">
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
            <div className="space-y-3">
              <Label className="text-base font-normal text-gray-600">Pricing Tier</Label>
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger className="ghost-dropdown">
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
            <div className="space-y-3">
              <Label className="text-base font-normal text-gray-600">Customer (Optional)</Label>
              <SearchableCustomerSelect
                selectedCustomer={selectedCustomer}
                onCustomerSelect={setSelectedCustomer}
                placeholder="Search customers..."
              />
            </div>
          </div>


        </CardContent>
      </Card>

      {/* Price List Table */}
      {priceListItems.length > 0 ? (
        <Card className="soft-card border-none">
          <CardHeader>
            <CardTitle className="section-title text-2xl">
              Price List - {selectedCategory}
              <Badge variant="secondary" className="ml-3 font-light">
                {pricingTiers.find(t => t.key === selectedTier)?.label}
              </Badge>
            </CardTitle>
            <CardDescription className="text-gray-500 font-light">
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
                      <TableCell className="font-mono text-sm text-gray-600">
                        {item.itemCode}
                      </TableCell>
                      <TableCell className="font-normal">
                        {item.productType}
                      </TableCell>
                      <TableCell className="font-light">{item.size}</TableCell>
                      <TableCell className="font-light">{item.minQty}</TableCell>
                      <TableCell className="font-light">${item.pricePerSqM.toFixed(2)}</TableCell>
                      <TableCell className="font-light">${item.pricePerSheet.toFixed(2)}</TableCell>
                      <TableCell className="font-normal text-green-600">
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
        <Card className="soft-card border-none">
          <CardContent className="text-center py-12">
            <div className="text-gray-500 mb-4">
              <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p className="text-lg font-light">No price list generated</p>
              <p className="text-sm font-light">Select a product category to get started</p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
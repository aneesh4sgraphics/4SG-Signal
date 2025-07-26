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
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { AdaptiveTable } from "@/components/OdooTable";

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
  const userRole = getUserRoleFromEmail((user as any)?.email || '');
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
    <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-screen-lg mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 relative">
          <FloatingElements />
          <h1 className="text-xl font-normal text-gray-800 mb-2">Price List</h1>
          <p className="text-sm text-gray-500">
            Generate comprehensive price lists for your products
          </p>
          <HeaderDivider />
        </div>

        {/* Configuration */}
        <SimpleCardFrame className="p-6 mb-6 bg-white border border-gray-100">
          <h2 className="text-lg font-normal text-gray-800 mb-2 flex items-center gap-2">
            <IconBadge icon={FileText} label="Configuration" className="px-0 py-0 bg-transparent border-none text-lg font-normal text-gray-800" />
          </h2>
          <p className="text-sm text-gray-500 mb-6">Select product category and pricing tier to generate your price list</p>
        <SectionDivider />
        <div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Product Category */}
            <div className="space-y-2">
              <label className="block text-sm font-normal text-gray-800">Product Category</label>
              <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                <SelectTrigger className="w-full rounded-md px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white" style={{ border: '1px solid #f3f4f6' }}>
                  <SelectValue placeholder="Select product category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(category => (
                    <SelectItem key={String(category)} value={String(category)}>
                      {String(category)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Pricing Tier */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-800">Pricing Tier</label>
              <Select value={selectedTier} onValueChange={setSelectedTier}>
                <SelectTrigger className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
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
              <label className="block text-sm font-medium text-gray-800">Customer (Optional)</label>
              <SearchableCustomerSelect
                selectedCustomer={selectedCustomer}
                onCustomerSelect={setSelectedCustomer}
                placeholder="Search customers..."
                className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white"
              />
            </div>
          </div>
        </div>
      </SimpleCardFrame>

      {/* Price List Table */}
      {priceListItems.length > 0 ? (
        <SimpleCardFrame className="p-6">
          <div className="flex items-center gap-3 mb-2">
            <h2 className="text-lg font-medium text-gray-800">Price List - {selectedCategory}</h2>
            <span className="inline-flex items-center px-2 py-1 rounded-md bg-gray-100 text-xs text-gray-800 border border-gray-200">
              {pricingTiers.find(t => t.key === selectedTier)?.label}
            </span>
          </div>
          <p className="text-sm text-gray-500 mb-6">{priceListItems.length} products found</p>
          <AdaptiveTable
            columns={[
              { 
                key: 'itemCode', 
                title: 'Item Code', 
                weight: 1.5,
                minWidth: 120,
                align: 'left' 
              },
              { 
                key: 'productType', 
                title: 'Product Type', 
                weight: 4,
                minWidth: 200,
                align: 'left' 
              },
              { 
                key: 'size', 
                title: 'Size', 
                weight: 1.2,
                minWidth: 80,
                align: 'center' 
              },
              { 
                key: 'minQty', 
                title: 'Min Qty', 
                weight: 0.8,
                minWidth: 70,
                align: 'center' 
              },
              // Only show Price/Sq.M column for admin users
              ...((user as any)?.role === 'admin' ? [{ 
                key: 'pricePerSqM', 
                title: 'Price/Sq.M', 
                weight: 1,
                minWidth: 90,
                align: 'right' as const
              }] : []),
              { 
                key: 'pricePerSheet', 
                title: 'Price/Sheet', 
                weight: 1.2,
                minWidth: 100,
                align: 'right' 
              },
              { 
                key: 'pricePerPack', 
                title: 'Price Per Pack', 
                weight: 1.3,
                minWidth: 110,
                align: 'right' 
              }
            ]}
            data={priceListItems}
            renderCell={(item, column) => {
              switch (column.key) {
                case 'itemCode':
                  return <span className="font-mono text-sm text-gray-600">{item.itemCode}</span>;
                case 'productType':
                  return <span className="text-sm text-gray-800 leading-tight">{item.productType}</span>;
                case 'size':
                  return <span className="text-sm text-gray-600">{item.size}</span>;
                case 'minQty':
                  return <span className="text-sm text-gray-600">{item.minQty}</span>;
                case 'pricePerSqM':
                  return <span className="text-sm text-gray-600">${item.pricePerSqM.toFixed(2)}</span>;
                case 'pricePerSheet':
                  return <span className="text-sm text-gray-600">${item.pricePerSheet.toFixed(2)}</span>;
                case 'pricePerPack':
                  return <span className="text-sm text-gray-800 font-medium text-green-600">${item.pricePerPack.toFixed(2)}</span>;
                default:
                  return null;
              }
            }}
            maxHeight="500px"
          />
        </SimpleCardFrame>
      ) : (
        <div className="border border-gray-200 rounded-lg p-6 bg-white text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-base font-medium text-gray-800 mb-2">No price list generated</p>
          <p className="text-sm text-gray-500">Select a product category to get started</p>
        </div>
      )}
      </div>
    </div>
  );
}
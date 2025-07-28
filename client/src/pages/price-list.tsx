import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileSpreadsheet, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { AdaptiveTable } from "@/components/OdooTable";
import { getPriceColumnHeader } from "@/utils/sizeUtils";
import ProductOrderingDialog from "@/components/ProductOrderingDialog";

interface ProductData {
  [key: string]: string | number | undefined;
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
  sortOrder?: number;
  // Legacy fields for backward compatibility
  product_name: string;
  ProductType: string;
  ItemCode: string;
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
  sortOrder?: number;
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

// Utility function for retail pricing rounding (99-cent rounding)
const applyRetailRounding = (price: number, isRetail: boolean): number => {
  if (!isRetail) return price;
  
  // Round to 99 cents: floor the dollar amount and add 0.99
  const floorPrice = Math.floor(price);
  return floorPrice + 0.99;
};

export default function PriceList() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderedItems, setOrderedItems] = useState<PriceListItem[]>([]);
  
  const { toast } = useToast();
  const { user } = useAuth();
  
  // Get user role and filter pricing tiers accordingly - memoize to prevent re-renders
  const pricingTiers = useMemo(() => {
    const userRole = getUserRoleFromEmail((user as any)?.email || '');
    return allPricingTiers.filter(tier => canAccessTier(tier.label, userRole));
  }, [(user as any)?.email]);

  // PDF Download Mutation
  const downloadPDFMutation = useMutation({
    mutationFn: async () => {
      const customerName = selectedCustomer 
        ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` 
        : 'Customer';

      const response = await fetch('/api/generate-price-list-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          selectedCategory,
          selectedTier,
          priceListItems: (orderedItems.length > 0 ? orderedItems : priceListItems).map(item => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            minOrderQty: item.minQty,
            pricePerSheet: item.pricePerSheet,
            total: item.pricePerPack,
            sortOrder: item.sortOrder
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PriceList_${selectedCategory}_${pricingTiers.find(t => t.key === selectedTier)?.label}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Price list PDF downloaded successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate PDF",
        variant: "destructive"
      });
    }
  });

  const handleDownloadPDF = () => {
    if (priceListItems.length === 0) {
      toast({
        title: "No Data",
        description: "Please select a category and tier to generate PDF",
        variant: "destructive"
      });
      return;
    }
    downloadPDFMutation.mutate();
  };

  // CSV Download Mutation (ODOO format - Item Code, Product Name, Price)
  const downloadCSVMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/generate-price-list-csv-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategory,
          selectedTier,
          priceListItems: (orderedItems.length > 0 ? orderedItems : priceListItems).map(item => ({
            itemCode: item.itemCode,
            productName: item.productName,
            price: item.pricePerSheet
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate CSV');
      }

      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PriceList_ODOO_${selectedCategory}_${pricingTiers.find(t => t.key === selectedTier)?.label}_${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "ODOO CSV downloaded successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate CSV",
        variant: "destructive"
      });
    }
  });

  // Excel Download Mutation (All visible columns)
  const downloadExcelMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch('/api/generate-price-list-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategory,
          selectedTier,
          priceListItems: (orderedItems.length > 0 ? orderedItems : priceListItems).map(item => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            minQty: item.minQty,
            pricePerSqM: item.pricePerSqM,
            pricePerSheet: item.pricePerSheet,
            pricePerPack: item.pricePerPack
          })),
          userRole: (user as any)?.role
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate Excel file');
      }

      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PriceList_Full_${selectedCategory}_${pricingTiers.find(t => t.key === selectedTier)?.label}_${new Date().toISOString().split('T')[0]}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Excel file downloaded successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate Excel file",
        variant: "destructive"
      });
    }
  });

  const handleDownloadCSV = () => {
    if (priceListItems.length === 0) {
      toast({
        title: "No Data",
        description: "Please select a category and tier to generate CSV",
        variant: "destructive"
      });
      return;
    }
    downloadCSVMutation.mutate();
  };

  const handleDownloadExcel = () => {
    if (priceListItems.length === 0) {
      toast({
        title: "No Data",
        description: "Please select a category and tier to generate Excel file",
        variant: "destructive"
      });
      return;
    }
    downloadExcelMutation.mutate();
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

  // Get unique categories - memoize to prevent re-renders and filter out empty values
  const categories = useMemo(() => {
    if (!productData || productData.length === 0) return [];
    // Try both productName and product_name fields (API uses productName, legacy uses product_name), filter out empty values
    const categoryNames = productData.map(item => item.productName || item.product_name || '').filter(Boolean);
    return Array.from(new Set(categoryNames)).sort();
  }, [productData]);

  // Handle product reordering
  const handleProductReorder = (reorderedItems: any[]) => {
    const updatedItems = reorderedItems.map(item => {
      // Find the original item to preserve all pricing data
      const originalItem = priceListItems.find(original => original.itemCode === item.itemCode);
      return originalItem || item;
    });
    setOrderedItems(updatedItems);
    toast({
      title: "Products Reordered",
      description: "Product order updated successfully for PDF generation"
    });
  };

  // Generate price list when category or tier changes
  useEffect(() => {
    if (!selectedCategory || !selectedTier || !productData.length) {
      setPriceListItems([]);
      setOrderedItems([]); // Reset ordered items when selections change
      return;
    }

    const filteredProducts = productData.filter(
      (item) => (item.productName || item.product_name)?.toLowerCase() === selectedCategory?.toLowerCase()
    );

    const calculatedItems = filteredProducts.map((product) => {
      // Map tier names to database field names - use the actual camelCase field names from API response
      const tierMapping: Record<string, string> = {
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
      const pricePerSqM = Number((product as any)[tierField]) || 0;
      const sqm = parseFloat(String(product.totalSqm || 0));
      const pricePerSheet = +(pricePerSqM * sqm).toFixed(2);
      const minQty = Number(product.minQuantity) || 1;
      
      // Apply retail rounding for RETAIL tier only to Price Per Pack
      const isRetailTier = selectedTier === 'Retail';
      const rawPricePerPack = pricePerSheet * minQty;
      const pricePerPack = +applyRetailRounding(rawPricePerPack, isRetailTier).toFixed(2);

      return {
        productType: String(product.productType || product.ProductType || 'Unknown'),
        productName: String(product.productName || product.product_name || selectedCategory),
        size: String(product.size || 'N/A'),
        itemCode: String(product.itemCode || product.ItemCode || '-'),
        minQty,
        pricePerSqM,
        pricePerSheet,
        pricePerPack,
        squareMeters: sqm,
        sortOrder: product.sortOrder,
      };
    });

    // Sort by sortOrder to preserve CSV file order, fallback to alphabetical
    const sortedItems = calculatedItems.sort((a, b) => {
      const aSortOrder = a.sortOrder || 999999;
      const bSortOrder = b.sortOrder || 999999;
      if (aSortOrder !== bSortOrder) {
        return aSortOrder - bSortOrder;
      }
      return String(a.productType).localeCompare(String(b.productType));
    });
    
    setPriceListItems(sortedItems);
  }, [selectedCategory, selectedTier, productData]);





  if (isLoading) {
    return (
      <div className="container mx-auto p-6">
        <div className="text-center">Loading product data...</div>
      </div>
    );
  }

  // Add debug information when no data is available
  if (!productData || productData.length === 0) {
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="mb-6 relative">
            <h1 className="text-xl font-normal text-gray-800 mb-2">Price List</h1>
            <p className="text-sm text-gray-500 mb-4">
              Generate comprehensive price lists for your products
            </p>
          </div>
          
          <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
            <div className="text-gray-600 mb-4">
              <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
              <h3 className="heading-tertiary mb-2">No Product Data Available</h3>
              <p className="body-small text-gray-500 mb-4">
                No product pricing data found in the database. Please upload product data through the ProductPricing Management app.
              </p>
              <div className="caption text-gray-400 bg-gray-50 p-2 rounded border">
                Debug: Found {productData?.length || 0} records in database
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
      <div className="max-w-7xl mx-auto px-6 py-6">
        {/* Header */}
        <div className="mb-6 relative">
          <FloatingElements />
          <h1 className="heading-primary text-gray-800 mb-2">Price List</h1>
          <p className="body-small text-gray-500">
            Generate comprehensive price lists for your products
          </p>
          <HeaderDivider />
        </div>

        {/* Configuration - Optimized Layout */}
        <SimpleCardFrame className="p-6 mb-6 bg-white border border-gray-100">
          <div className="max-w-6xl mx-auto">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Product Category */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Product Category</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full h-10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white border border-gray-300 hover:border-gray-400 transition-colors">
                    <SelectValue placeholder="Select product category" />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    {categories.length > 0 ? (
                      categories.map(category => (
                        <SelectItem key={String(category)} value={String(category)} className="text-sm">
                          {String(category)}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-categories" disabled className="text-sm text-gray-400">
                        No categories available
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Pricing Tier */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Pricing Tier</label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger className="w-full h-10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white border border-gray-300 hover:border-gray-400 transition-colors">
                    <SelectValue placeholder="Select pricing tier" />
                  </SelectTrigger>
                  <SelectContent className="w-full">
                    {pricingTiers.map(tier => (
                      <SelectItem key={tier.key} value={tier.key} className="text-sm">
                        {tier.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Customer Selection */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Customer (Optional)</label>
                <SearchableCustomerSelect
                  selectedCustomer={selectedCustomer}
                  onCustomerSelect={setSelectedCustomer}
                  placeholder="Search customers..."
                  className="w-full h-10 rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white border border-gray-300 hover:border-gray-400 transition-colors"
                />
              </div>
            </div>
          </div>
        </SimpleCardFrame>

      {/* Price List Table */}
      {priceListItems.length > 0 ? (
        <SimpleCardFrame className="p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <h2 className="heading-secondary text-gray-800">Price List - {selectedCategory}</h2>
              <span className="inline-flex items-center px-3 py-1 rounded-md bg-gray-100 label-small text-gray-800 border border-gray-200">
                {pricingTiers.find(t => t.key === selectedTier)?.label}
              </span>
            </div>
            <div className="flex gap-2">
              <ProductOrderingDialog
                items={priceListItems.map(item => ({
                  id: item.itemCode,
                  productType: item.productType,
                  size: item.size,
                  itemCode: item.itemCode,
                  pricePerSheet: item.pricePerSheet,
                  pricePerPack: item.pricePerPack,
                  minQty: item.minQty
                }))}
                onReorder={handleProductReorder}
                title="Reorder Price List Products"
                description="Change the order of products for PDF generation based on customer requests"
                trigger={
                  <Button
                    variant="outline"
                    className="px-4 py-2 rounded-md flex items-center gap-2 label-small border-gray-300 hover:border-gray-400"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                    Order Products
                  </Button>
                }
              />
              <Button
                onClick={handleDownloadCSV}
                disabled={downloadCSVMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2 label-small"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloadCSVMutation.isPending ? 'Generating...' : 'CSV Download - ODOO'}
              </Button>
              <Button
                onClick={handleDownloadExcel}
                disabled={downloadExcelMutation.isPending}
                className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-md flex items-center gap-2 label-small"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloadExcelMutation.isPending ? 'Generating...' : 'Excel Download'}
              </Button>
              <Button
                onClick={handleDownloadPDF}
                disabled={downloadPDFMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md flex items-center gap-2 label-small"
              >
                <Download className="h-4 w-4" />
                {downloadPDFMutation.isPending ? 'Generating...' : 'Download PDF'}
              </Button>
            </div>
          </div>
          <p className="body-small text-gray-500 mb-6">{priceListItems.length} products found</p>
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
                title: 'Price/Unit', 
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
                  const unitLabel = item.minQty === 1 ? 'roll' : 'sheet';
                  return (
                    <div className="text-right">
                      <span className="text-sm text-gray-600">${item.pricePerSheet.toFixed(2)}</span>
                      <div className="text-xs text-gray-400">/{unitLabel}</div>
                    </div>
                  );
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
          <p className="text-sm text-gray-500">Select a product category and pricing tier to get started</p>
        </div>
      )}
      </div>
    </div>
  );
}
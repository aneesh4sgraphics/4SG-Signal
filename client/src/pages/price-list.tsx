import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileSpreadsheet, ArrowUpDown, RefreshCw, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { AdaptiveTable } from "@/components/OdooTable";
import { getPriceColumnHeader } from "@/utils/sizeUtils";
import ProductOrderingDialog from "@/components/ProductOrderingDialog";
import { EmptyState, getErrorType, getErrorMessage, getErrorDetails } from "@/components/EmptyState";
import { ApiError, queryClient } from "@/lib/queryClient";

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
  { key: 'Landed', label: 'Landed Price' },
  { key: 'Export', label: 'Export Only' },
  { key: 'M.Distributor', label: 'Distributor' },
  { key: 'Dealer', label: 'Dealer-VIP' },
  { key: 'Dealer2', label: 'Dealer' },
  { key: 'ApprovalNeeded', label: 'Shopify Lowest' },
  { key: 'TierStage25', label: 'Shopify3' },
  { key: 'TierStage2', label: 'Shopify2' },
  { key: 'TierStage15', label: 'Shopify1' },
  { key: 'TierStage1', label: 'Shopify-Account' },
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
  const [filtersInitialized, setFiltersInitialized] = useState<boolean>(false);
  const [includeShipping, setIncludeShipping] = useState<boolean>(false);
  const [shippingCosts, setShippingCosts] = useState<Record<string, number>>({});
  const [shippingInputs, setShippingInputs] = useState<Record<string, string>>({});
  
  // Helper to update shipping cost input (string for intermediate typing)
  const updateShippingInput = (itemCode: string, value: string) => {
    setShippingInputs(prev => ({
      ...prev,
      [itemCode]: value
    }));
    // Also update the numeric value for calculations
    const numValue = parseFloat(value);
    if (!isNaN(numValue) && numValue >= 0) {
      setShippingCosts(prev => ({
        ...prev,
        [itemCode]: numValue
      }));
    } else if (value === '' || value === '0' || value === '0.') {
      setShippingCosts(prev => ({
        ...prev,
        [itemCode]: 0
      }));
    }
  };
  
  // Get display value for shipping input
  const getShippingInputValue = (itemCode: string): string => {
    if (shippingInputs[itemCode] !== undefined) {
      return shippingInputs[itemCode];
    }
    const cost = shippingCosts[itemCode];
    return cost ? cost.toString() : '';
  };

  // Calculate adjusted prices with shipping included
  const getAdjustedItems = (items: PriceListItem[]): PriceListItem[] => {
    if (!includeShipping) return items;
    return items.map(item => {
      const shippingCost = shippingCosts[item.itemCode] || 0;
      const adjustedPricePerSheet = item.pricePerSheet + shippingCost;
      const adjustedPricePerPack = adjustedPricePerSheet * item.minQty;
      return {
        ...item,
        pricePerSheet: adjustedPricePerSheet,
        pricePerPack: adjustedPricePerPack
      };
    });
  };
  
  const { toast } = useToast();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  
  // Get user role and filter pricing tiers accordingly - memoize to prevent re-renders
  const userEmail = (user as any)?.email || '';
  const pricingTiers = useMemo(() => {
    const userRole = getUserRoleFromEmail(userEmail);
    return allPricingTiers.filter(tier => canAccessTier(tier.label, userRole));
  }, [userEmail]);

  // Reset all filters
  const resetFilters = () => {
    setSelectedCategory("");
    setSelectedTier("");
    setPriceListItems([]);
    setOrderedItems([]);
    localStorage.removeItem("priceListFilters");
    toast({
      title: "Filters Reset",
      description: "All filters have been cleared",
    });
  };

  // PDF Download Mutation
  const downloadPDFMutation = useMutation({
    mutationFn: async () => {
      const customerName = selectedCustomer 
        ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}` 
        : 'Customer';

      // Use adjusted items with shipping costs applied
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      const adjustedItems = getAdjustedItems(itemsToUse);

      const response = await fetch('/api/generate-price-list-pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          selectedCategory,
          selectedTier,
          includeShipping,
          priceListItems: adjustedItems.map(item => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            minOrderQty: item.minQty,
            pricePerSheet: item.pricePerSheet,
            total: item.pricePerPack,
            sortOrder: item.sortOrder,
            shippingCost: includeShipping ? (shippingCosts[item.itemCode] || 0) : undefined
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate PDF');
      }

      return response.blob();
    },
    onSuccess: async (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PriceList_${selectedCategory}_${pricingTiers.find(t => t.key === selectedTier)?.label}_${new Date().toISOString().split('T')[0]}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      // If a customer is selected, log the event with items for future reference
      if (selectedCustomer?.id) {
        try {
          const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
          const adjustedItems = getAdjustedItems(itemsToUse);
          
          await fetch('/api/crm/price-list-events', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              customerId: selectedCustomer.id,
              eventType: 'download',
              priceTier: selectedTier,
              productTypes: [selectedCategory],
              userId: (user as any)?.id,
              userEmail: (user as any)?.email,
              items: adjustedItems.map(item => ({
                itemCode: item.itemCode,
                productType: item.productType,
                size: item.size,
                minQty: item.minQty,
                pricePerUnit: item.pricePerSheet.toString(),
                pricePerPack: item.pricePerPack.toString(),
                shippingCost: includeShipping ? (shippingCosts[item.itemCode] || 0).toString() : null,
                priceTier: selectedTier,
                category: selectedCategory
              }))
            })
          });
          queryClient.invalidateQueries({ queryKey: ['/api/crm/price-list-events'] });
          queryClient.invalidateQueries({ queryKey: ['/api/customers/price-list-counts'] });
        } catch (error) {
          console.error('Failed to log price list event:', error);
        }
      }
      
      toast({
        title: "Success",
        description: selectedCustomer ? "Price list PDF downloaded and tracked for customer" : "Price list PDF downloaded successfully"
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

  // ODOO Excel Download Mutation (ODOO import format)
  const downloadCSVMutation = useMutation({
    mutationFn: async () => {
      const tierLabel = pricingTiers.find(t => t.key === selectedTier)?.label || selectedTier;
      
      // Use adjusted items with shipping costs applied
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      const adjustedItems = getAdjustedItems(itemsToUse);
      
      const response = await fetch('/api/generate-price-list-csv-odoo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategory,
          selectedTier,
          tierLabel,
          includeShipping,
          priceListItems: adjustedItems.map(item => ({
            itemCode: item.itemCode,
            productName: item.productName,
            price: item.pricePerSheet,
            minQty: item.minQty
          }))
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate ODOO Excel');
      }

      return response.blob();
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PriceList_ODOO_${selectedCategory}_${pricingTiers.find(t => t.key === selectedTier)?.label}_${new Date().toISOString().split('T')[0]}.xls`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "ODOO Excel file downloaded successfully"
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to generate ODOO Excel file",
        variant: "destructive"
      });
    }
  });

  // Excel Download Mutation (All visible columns)
  const downloadExcelMutation = useMutation({
    mutationFn: async () => {
      // Use adjusted items with shipping costs applied
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      const adjustedItems = getAdjustedItems(itemsToUse);
      
      const response = await fetch('/api/generate-price-list-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCategory,
          selectedTier,
          includeShipping,
          priceListItems: adjustedItems.map(item => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            minQty: item.minQty,
            pricePerSqM: item.pricePerSqM,
            pricePerSheet: item.pricePerSheet,
            pricePerPack: item.pricePerPack,
            shippingCost: includeShipping ? (shippingCosts[item.itemCode] || 0) : undefined
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

  const handleDownloadODOO = () => {
    if (priceListItems.length === 0) {
      toast({
        title: "No Data",
        description: "Please select a category and tier to generate ODOO file",
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



  // Fetch product pricing data from new database - only fetch when authenticated
  const { data: productData = [], isLoading, error, refetch } = useQuery<ProductData[]>({
    queryKey: ['/api/product-pricing-database', (user as any)?.id],
    queryFn: async () => {
      const response = await fetch('/api/product-pricing-database', {
        credentials: 'include'
      });
      if (!response.ok) {
        throw new Error('Failed to fetch pricing data');
      }
      const result = await response.json();
      return result.data || []; // Extract data from response wrapper
    },
    enabled: !isAuthLoading && isAuthenticated,
    staleTime: 0, // Consider data stale immediately
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes (gcTime replaces cacheTime in React Query v5)
    refetchOnMount: true, // Always refetch when component mounts
    refetchOnWindowFocus: true, // Refetch when window regains focus
  });

  // Allowed Product Categories (curated list)
  const ALLOWED_CATEGORIES = [
    'Graffiti Polyester Paper',
    'Graffiti Blended Poly',
    'GraffitiSTICK',
    'Solvit Sign & Display Media',
    'CLiQ Aqueous Media',
    'Rang Print Canvas',
    'EiE Inkjet Film',
    'eLe Laser Films',
    'MXP Offset Plates',
    'Rollers & Chemicals',
  ];

  // Get unique categories - memoize to prevent re-renders and filter to allowed list
  const categories = useMemo(() => {
    if (!productData || productData.length === 0) return [];
    // Get all category names from data
    const categoryNames = productData
      .map(item => item.productName || item.product_name || '')
      .filter(name => name && name.trim().length > 0);
    const allCategories = Array.from(new Set(categoryNames));
    
    // Filter to only allowed categories
    return ALLOWED_CATEGORIES.filter(allowed => 
      allCategories.some(cat => 
        cat.toLowerCase().includes(allowed.toLowerCase()) || 
        allowed.toLowerCase().includes(cat.toLowerCase())
      )
    );
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

  // Serialize pricingTiers keys for stable dependency
  const pricingTierKeys = useMemo(() => pricingTiers.map(t => t.key).join(','), [pricingTiers]);
  
  // Load filters from localStorage on mount - only run once when data is available
  useEffect(() => {
    if (!productData.length || filtersInitialized) return;
    
    const storedFilters = localStorage.getItem("priceListFilters");
    if (storedFilters) {
      try {
        const filters = JSON.parse(storedFilters);
        
        // Validate category against current categories
        const categoryNames = productData
          .map(item => item.productName || item.product_name || '')
          .filter(name => name && name.trim().length > 0);
        const validCategories = Array.from(new Set(categoryNames));
        
        // Validate and set category
        if (filters.category && validCategories.includes(filters.category)) {
          setSelectedCategory(filters.category);
        } else {
          setSelectedCategory("");
          localStorage.removeItem("priceListFilters");
        }
        
        // Validate and set tier
        const tierKeys = pricingTierKeys.split(',');
        if (filters.tier && tierKeys.includes(filters.tier)) {
          setSelectedTier(filters.tier);
        } else {
          setSelectedTier("");
        }
      } catch (error) {
        console.error("Failed to load filters from storage:", error);
        localStorage.removeItem("priceListFilters");
      }
    }
    setFiltersInitialized(true);
  }, [productData.length, filtersInitialized, pricingTierKeys]);

  // Save filters to localStorage when they change
  useEffect(() => {
    if (!filtersInitialized) return;
    
    const filters = {
      category: selectedCategory,
      tier: selectedTier
    };
    
    if (selectedCategory || selectedTier) {
      localStorage.setItem("priceListFilters", JSON.stringify(filters));
    }
  }, [selectedCategory, selectedTier, filtersInitialized]);

  // Generate price list when category or tier changes
  useEffect(() => {
    if (!selectedCategory || !selectedTier || !productData.length) {
      // Use functional update to avoid stale closure issues
      setPriceListItems(prev => prev.length > 0 ? [] : prev);
      setOrderedItems(prev => prev.length > 0 ? [] : prev);
      return;
    }

    const filteredProducts = productData.filter(
      (item) => (item.productName || item.product_name)?.toLowerCase() === selectedCategory?.toLowerCase()
    );

    const calculatedItems = filteredProducts.map((product) => {
      // Map tier names to database field names - use the actual camelCase field names from API response
      const tierMapping: Record<string, string> = {
        'Landed': 'landedPrice',
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





  if (isLoading || isAuthLoading) {
    return (
      <div className="container mx-auto p-6">
        <EmptyState type="loading" />
      </div>
    );
  }

  // Handle errors with enhanced diagnostics
  if (error) {
    const errorType = getErrorType(error);
    const errorMessage = getErrorMessage(error);
    const errorDetails = getErrorDetails(error);
    
    // Log detailed error info in development
    if (process.env.NODE_ENV === 'development') {
      console.group('%c[Price List Error]', 'color: #ff6b6b; font-weight: bold');
      console.log('Error Type:', errorType);
      console.log('Error Object:', error);
      console.log('Details:', errorDetails);
      console.groupEnd();
    }
    
    return (
      <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="mb-6">
            <h1 className="text-xl font-normal text-gray-800 mb-2">Price List</h1>
            <p className="text-sm text-gray-500 mb-4">
              Generate comprehensive price lists for your products
            </p>
          </div>
          <EmptyState 
            type={errorType}
            message={errorMessage}
            details={errorDetails}
            onRetry={() => refetch()}
            actionLabel={errorType === 'auth' ? 'Login' : undefined}
            onAction={errorType === 'auth' ? () => window.location.href = '/login' : undefined}
          />
        </div>
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
          
          <EmptyState 
            type="no-data"
            title="No Product Data Available"
            message="No product pricing data found in the database. Please upload product data through the ProductPricing Management app."
            details={`Found ${productData?.length || 0} records in database`}
            onRetry={() => refetch()}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-full mx-auto">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">Price List</h1>
              <p className="text-gray-500">Generate comprehensive price lists for your products</p>
            </div>
            <button
              onClick={() => refetch()}
              className="contra-btn-primary"
              disabled={isLoading}
              data-testid="button-refresh"
            >
              <RefreshCw className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* No Results Banner */}
        {((selectedCategory && categories.length === 0) || 
          (selectedCategory && selectedTier && priceListItems.length === 0)) && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium text-amber-800">
                  {categories.length === 0 
                    ? "No categories available with current data" 
                    : "No results with your current filters"}
                </span>
              </div>
              <button
                onClick={resetFilters}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Reset Filters
              </button>
            </div>
            <p className="mt-2 text-sm text-amber-700">
              {categories.length === 0 
                ? "The data doesn't contain any valid categories. Please check your data source or reset filters."
                : "The selected combination of category and tier doesn't match any products. Try resetting the filters or selecting different options."}
            </p>
          </div>
        )}

        {/* Configuration - Optimized Layout */}
        <div className="glass-card mb-6 overflow-visible relative z-20">
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
                        <SelectItem 
                          key={String(category)} 
                          value={String(category)} 
                          className="text-sm"
                        >
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
                  className="w-full"
                />
              </div>
            </div>
            
            {/* Shipping Costs Toggle */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-gray-600" />
                  <div>
                    <label className="block label-medium text-gray-800">Add Shipping Costs</label>
                    <p className="text-xs text-gray-500">Enable to add per-unit shipping costs to prices</p>
                  </div>
                </div>
                <Switch
                  checked={includeShipping}
                  onCheckedChange={(checked) => {
                    setIncludeShipping(checked);
                    if (!checked) {
                      setShippingCosts({});
                      setShippingInputs({});
                    }
                  }}
                  data-testid="switch-include-shipping"
                />
              </div>
            </div>
          </div>
        </div>

      {/* Price List Table */}
      {priceListItems.length > 0 ? (
        <div className="glass-card">
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
                onClick={handleDownloadODOO}
                disabled={downloadCSVMutation.isPending}
                className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md flex items-center gap-2 label-small"
                data-testid="button-download-odoo"
              >
                <FileSpreadsheet className="h-4 w-4" />
                {downloadCSVMutation.isPending ? 'Generating...' : 'Download for ODOO'}
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
              // Show Shipping Cost column when enabled
              ...(includeShipping ? [{ 
                key: 'shippingCost', 
                title: 'Shipping/Unit', 
                weight: 1,
                minWidth: 100,
                align: 'center' as const
              }] : []),
              { 
                key: 'pricePerSheet', 
                title: includeShipping ? 'Price/Unit (incl. shipping)' : 'Price/Unit', 
                weight: 1.2,
                minWidth: includeShipping ? 140 : 100,
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
              const shippingCost = shippingCosts[item.itemCode] || 0;
              const adjustedPricePerSheet = includeShipping ? item.pricePerSheet + shippingCost : item.pricePerSheet;
              const adjustedPricePerPack = adjustedPricePerSheet * item.minQty;
              
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
                case 'shippingCost':
                  return (
                    <div className="flex items-center justify-center">
                      <span className="text-gray-500 mr-1">$</span>
                      <Input
                        type="text"
                        inputMode="decimal"
                        value={getShippingInputValue(item.itemCode)}
                        onChange={(e) => {
                          const val = e.target.value;
                          // Allow empty, numbers, and decimals
                          if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                            updateShippingInput(item.itemCode, val);
                          }
                        }}
                        onBlur={(e) => {
                          // Format on blur
                          const val = e.target.value;
                          const num = parseFloat(val);
                          if (!isNaN(num) && num > 0) {
                            updateShippingInput(item.itemCode, num.toFixed(2));
                          } else if (val === '' || val === '0' || val === '0.' || val === '0.0' || val === '0.00') {
                            setShippingInputs(prev => ({ ...prev, [item.itemCode]: '' }));
                            setShippingCosts(prev => ({ ...prev, [item.itemCode]: 0 }));
                          }
                        }}
                        className="w-20 h-8 text-sm text-center px-2"
                        placeholder="0.00"
                        data-testid={`input-shipping-${item.itemCode}`}
                      />
                    </div>
                  );
                case 'pricePerSheet':
                  const unitLabel = item.minQty === 1 ? 'roll' : 'sheet';
                  return (
                    <div className="text-right">
                      <span className={`text-sm ${includeShipping && shippingCost > 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
                        ${adjustedPricePerSheet.toFixed(2)}
                      </span>
                      <div className="text-xs text-gray-400">/{unitLabel}</div>
                      {includeShipping && shippingCost > 0 && (
                        <div className="text-xs text-gray-400">(+${shippingCost.toFixed(2)} ship)</div>
                      )}
                    </div>
                  );
                case 'pricePerPack':
                  return (
                    <span className={`text-sm font-medium ${includeShipping && shippingCost > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                      ${adjustedPricePerPack.toFixed(2)}
                    </span>
                  );
                default:
                  return null;
              }
            }}
            maxHeight="500px"
          />
        </div>
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
import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { FileText, Download, FileSpreadsheet, ArrowUpDown, RefreshCw, Truck, Check, X, ChevronDown, ChevronUp, GripVertical, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { AdaptiveTable } from "@/components/OdooTable";
import { getPriceColumnHeader } from "@/utils/sizeUtils";
import ProductOrderingDialog from "@/components/ProductOrderingDialog";
import { EmptyState, getErrorType, getErrorMessage, getErrorDetails } from "@/components/EmptyState";
import { ApiError, queryClient } from "@/lib/queryClient";
import { ALLOWED_CATEGORIES } from "@/lib/productCategories";

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
  rollSheet?: string;
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
  pricingTier?: string;
}

const allPricingTiers = [
  { key: 'Landed', label: 'Landed Price', allowedTierKey: 'landedPrice' },
  { key: 'Export', label: 'Export Only', allowedTierKey: 'exportPrice' },
  { key: 'M.Distributor', label: 'Distributor', allowedTierKey: 'masterDistributorPrice' },
  { key: 'Dealer', label: 'Dealer-VIP', allowedTierKey: 'dealerPrice' },
  { key: 'Dealer2', label: 'Dealer', allowedTierKey: 'dealer2Price' },
  { key: 'ApprovalNeeded', label: 'Shopify Lowest', allowedTierKey: 'approvalNeededPrice' },
  { key: 'TierStage25', label: 'Shopify3', allowedTierKey: 'tierStage25Price' },
  { key: 'TierStage2', label: 'Shopify2', allowedTierKey: 'tierStage2Price' },
  { key: 'TierStage15', label: 'Shopify1', allowedTierKey: 'tierStage15Price' },
  { key: 'TierStage1', label: 'Shopify-Account', allowedTierKey: 'tierStage1Price' },
  { key: 'Retail', label: 'Retail', allowedTierKey: 'retailPrice' }
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
  const [selectedTypes, setSelectedTypes] = useState<string[]>([]);
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [typePopoverOpen, setTypePopoverOpen] = useState(false);
  const [priceListItems, setPriceListItems] = useState<PriceListItem[]>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [orderedItems, setOrderedItems] = useState<PriceListItem[]>([]);
  const [filtersInitialized, setFiltersInitialized] = useState<boolean>(false);
  const [includeShipping, setIncludeShipping] = useState<boolean>(false);
  const [shippingMode, setShippingMode] = useState<'same' | 'individual'>('same');
  const [globalShippingCost, setGlobalShippingCost] = useState<number>(0);
  const [globalShippingInput, setGlobalShippingInput] = useState<string>('');
  const [shippingCosts, setShippingCosts] = useState<Record<string, number>>({});
  const [shippingInputs, setShippingInputs] = useState<Record<string, string>>({});
  const [productTypeOrder, setProductTypeOrder] = useState<string[]>([]);
  const [collapsedTypes, setCollapsedTypes] = useState<Set<string>>(new Set());
  const [showTypeOrderDialog, setShowTypeOrderDialog] = useState(false);
  const [selectedForPDF, setSelectedForPDF] = useState<Set<string>>(new Set());
  const [pdfProgress, setPdfProgress] = useState(0);
  const [showPdfProgress, setShowPdfProgress] = useState(false);
  const [hideZeroPrice, setHideZeroPrice] = useState(false);
  
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
      // Use global cost if "same" mode, otherwise use individual costs
      const shippingCost = shippingMode === 'same' 
        ? globalShippingCost 
        : (shippingCosts[item.itemCode] || 0);
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
  const userRole = (user as any)?.role || getUserRoleFromEmail(userEmail);
  const userAllowedTiers = (user as any)?.allowedTiers as string[] | null | undefined;
  const pricingTiers = useMemo(() => {
    const isAdmin = userRole === 'admin';
    
    return allPricingTiers.filter(tier => {
      // "Landed Price" is ONLY for Admin users - never show to non-admins
      if (tier.key === 'Landed' && !isAdmin) {
        return false;
      }
      
      // If user has specific allowed tiers set, use those (match on allowedTierKey)
      if (userAllowedTiers && userAllowedTiers.length > 0) {
        return userAllowedTiers.includes(tier.allowedTierKey);
      }
      
      // Otherwise use role-based tier access
      return canAccessTier(tier.label, userRole);
    });
  }, [userRole, userAllowedTiers]);

  // Reset all filters
  const resetFilters = () => {
    setSelectedCategory("");
    setSelectedTypes([]);
    setSelectedTier("");
    setPriceListItems([]);
    setOrderedItems([]);
    localStorage.removeItem("priceListFilters");
    toast({
      title: "Filters Reset",
      description: "All filters have been cleared",
    });
  };

  // PDF Download Mutation with progress tracking
  const downloadPDFMutation = useMutation({
    mutationFn: async () => {
      // Show progress dialog and start animation
      setShowPdfProgress(true);
      setPdfProgress(0);
      
      // Simulate progress while waiting for PDF generation
      const progressInterval = setInterval(() => {
        setPdfProgress(prev => {
          if (prev >= 90) return prev; // Cap at 90% until complete
          return prev + Math.random() * 15;
        });
      }, 300);

      const customerName = selectedCustomer 
        ? (selectedCustomer.company 
            ? `${selectedCustomer.company} (${selectedCustomer.firstName} ${selectedCustomer.lastName})`.trim()
            : `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim())
        : 'Customer';

      // Use adjusted items with shipping costs applied, sorted by productTypeOrder
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      
      // Filter only selected items for PDF
      const selectedItems = itemsToUse.filter(item => selectedForPDF.has(item.itemCode));
      
      // Sort items by productTypeOrder for PDF
      const sortedItems = [...selectedItems].sort((a, b) => {
        const aTypeIndex = productTypeOrder.indexOf(a.productType);
        const bTypeIndex = productTypeOrder.indexOf(b.productType);
        if (aTypeIndex === -1 && bTypeIndex === -1) return a.productType.localeCompare(b.productType);
        if (aTypeIndex === -1) return 1;
        if (bTypeIndex === -1) return -1;
        return aTypeIndex - bTypeIndex;
      });
      
      const adjustedItems = getAdjustedItems(sortedItems);

      try {
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
              pricePerThousand: item.rollSheet?.toLowerCase() !== 'roll' ? item.pricePerSheet * 1000 : null,
              total: item.pricePerPack,
              sortOrder: item.sortOrder,
              rollSheet: item.rollSheet,
              shippingCost: includeShipping ? (shippingMode === 'same' ? globalShippingCost : (shippingCosts[item.itemCode] || 0)) : undefined
            }))
          })
        });

        clearInterval(progressInterval);

        if (!response.ok) {
          throw new Error('Failed to generate PDF');
        }

        // Complete progress to 100%
        setPdfProgress(100);

        return response.blob();
      } catch (error) {
        clearInterval(progressInterval);
        throw error;
      }
    },
    onSuccess: async (blob) => {
      // Brief delay to show 100% before closing
      setTimeout(() => {
        setShowPdfProgress(false);
        setPdfProgress(0);
      }, 500);
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
                shippingCost: includeShipping ? (shippingMode === 'same' ? globalShippingCost : (shippingCosts[item.itemCode] || 0)).toString() : null,
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
      setShowPdfProgress(false);
      setPdfProgress(0);
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
    if (selectedForPDF.size === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one product to include in the PDF",
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
      
      // Use adjusted items with shipping costs applied, sorted by productTypeOrder
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      const sortedItems = [...itemsToUse].sort((a, b) => {
        const aTypeIndex = productTypeOrder.indexOf(a.productType);
        const bTypeIndex = productTypeOrder.indexOf(b.productType);
        if (aTypeIndex === -1 && bTypeIndex === -1) return a.productType.localeCompare(b.productType);
        if (aTypeIndex === -1) return 1;
        if (bTypeIndex === -1) return -1;
        return aTypeIndex - bTypeIndex;
      });
      const adjustedItems = getAdjustedItems(sortedItems);
      
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
      // Use adjusted items with shipping costs applied, sorted by productTypeOrder
      const itemsToUse = orderedItems.length > 0 ? orderedItems : priceListItems;
      const sortedItems = [...itemsToUse].sort((a, b) => {
        const aTypeIndex = productTypeOrder.indexOf(a.productType);
        const bTypeIndex = productTypeOrder.indexOf(b.productType);
        if (aTypeIndex === -1 && bTypeIndex === -1) return a.productType.localeCompare(b.productType);
        if (aTypeIndex === -1) return 1;
        if (bTypeIndex === -1) return -1;
        return aTypeIndex - bTypeIndex;
      });
      const adjustedItems = getAdjustedItems(sortedItems);
      
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

  // Use shared category constants (11 curated categories)
  const categories = [...ALLOWED_CATEGORIES];

  // Get available product types for selected category
  const availableTypes = useMemo(() => {
    if (!selectedCategory || !productData.length) return [];
    
    // Use categoryName field which is the actual category from product_categories table
    const typesForCategory = productData
      .filter(item => {
        const categoryName = (item as any).categoryName || item.productName || item.product_name;
        return categoryName?.toLowerCase() === selectedCategory.toLowerCase();
      })
      .map(item => item.productType || item.ProductType || '')
      .filter(type => type && type.trim().length > 0);
    
    return Array.from(new Set(typesForCategory)).sort();
  }, [selectedCategory, productData]);
  
  // Reset selected types when category changes
  useEffect(() => {
    if (selectedCategory) {
      setSelectedTypes([]);
    }
  }, [selectedCategory]);

  // Auto-select pricing tier based on customer's saved tier
  useEffect(() => {
    if (selectedCustomer?.pricingTier) {
      // Map customer's pricingTier to the tier key format used in the selector
      const tierMapping: Record<string, string> = {
        'LANDED PRICE': 'Landed',
        'EXPORT': 'Export',
        'MASTER DISTRIBUTOR': 'M.Distributor',
        'DEALER': 'Dealer',
        'DEALER 2': 'Dealer2',
        'APPROVAL NEEDED': 'ApprovalNeeded',
        'TIER STAGE 2.5': 'TierStage25',
        'TIER STAGE 2': 'TierStage2',
        'TIER STAGE 1.5': 'TierStage15',
        'TIER STAGE 1': 'TierStage1',
        'RETAIL': 'Retail',
      };
      
      const mappedTier = tierMapping[selectedCustomer.pricingTier.toUpperCase()];
      if (mappedTier) {
        // Only auto-select if user has access to this tier
        const tierExists = pricingTiers.find(t => t.key === mappedTier);
        if (tierExists) {
          setSelectedTier(mappedTier);
        }
      }
    }
  }, [selectedCustomer, pricingTiers]);

  // Handle product reordering (items within the list, not product types)
  const handleProductReorder = (reorderedItems: any[]) => {
    const updatedItems = reorderedItems
      .map(item => {
        // Find the original item to preserve all pricing data
        const originalItem = priceListItems.find(original => original.itemCode === item.itemCode);
        return originalItem || item;
      })
      .filter(item => item.itemCode); // Filter out any items without valid itemCode
    
    setOrderedItems(updatedItems);
    
    // Only persist item order, NOT product type order (those are separate concerns)
    // Item order is keyed by category+tier for context-specific ordering
    if (selectedCategory && selectedTier) {
      const itemOrderKey = `priceListItemOrder_${selectedCategory}_${selectedTier}`;
      const itemCodeOrder = updatedItems.map(item => item.itemCode).filter(Boolean);
      localStorage.setItem(itemOrderKey, JSON.stringify(itemCodeOrder));
    }
    
    toast({
      title: "Products Reordered",
      description: "Product order saved and will be remembered for future use"
    });
  };

  // Count items with $0 price per sheet
  const zeroPriceCount = useMemo(() => {
    const itemsToCheck = orderedItems.length > 0 ? orderedItems : priceListItems;
    return itemsToCheck.filter(item => item.pricePerSheet === 0).length;
  }, [priceListItems, orderedItems]);

  // Group items by product type
  const groupedByType = useMemo(() => {
    const itemsToGroup = (orderedItems.length > 0 ? orderedItems : priceListItems)
      .filter(item => hideZeroPrice ? item.pricePerSheet > 0 : true);
    const grouped: Record<string, PriceListItem[]> = {};
    
    itemsToGroup.forEach(item => {
      const type = item.productType || 'Unknown';
      if (!grouped[type]) grouped[type] = [];
      grouped[type].push(item);
    });
    
    return grouped;
  }, [priceListItems, orderedItems, hideZeroPrice]);

  // Get sorted product types based on user-defined order
  const sortedProductTypes = useMemo(() => {
    const types = Object.keys(groupedByType);
    if (productTypeOrder.length === 0) {
      return types.sort();
    }
    // Sort based on user-defined order, put unordered types at the end
    return types.sort((a, b) => {
      const aIndex = productTypeOrder.indexOf(a);
      const bIndex = productTypeOrder.indexOf(b);
      if (aIndex === -1 && bIndex === -1) return a.localeCompare(b);
      if (aIndex === -1) return 1;
      if (bIndex === -1) return -1;
      return aIndex - bIndex;
    });
  }, [groupedByType, productTypeOrder]);

  // Initialize productTypeOrder, orderedItems, and selectedForPDF when priceListItems changes
  useEffect(() => {
    if (priceListItems.length > 0 && selectedCategory) {
      // Normalize product types to match groupedByType logic (use 'Unknown' for falsy values)
      const types = Array.from(new Set(priceListItems.map(item => item.productType || 'Unknown'))).sort();
      
      // Default product type orders for specific categories (applied when no saved order exists)
      const defaultCategoryOrders: Record<string, string[]> = {
        'Graffiti Polyester Paper': [
          'Graffiti Polyester 5mil',
          'Graffiti Polyester 8mil',
          'Graffiti Polyester 10mil',
          'Graffiti Polyester 11mil',
          'Graffiti Polyester 11mil Blockout',
          'Graffiti Polyester 14mil'
        ]
      };
      
      // Try to load saved product type order from localStorage (scoped by category)
      const typeOrderKey = `priceListTypeOrder_${selectedCategory}`;
      const savedOrder = localStorage.getItem(typeOrderKey);
      if (savedOrder) {
        try {
          const parsedOrder = JSON.parse(savedOrder) as string[];
          // Merge saved order with current types: saved order first, then any new types
          const savedSet = new Set(parsedOrder);
          const newTypes = types.filter(t => !savedSet.has(t));
          // Filter saved order to only include types that exist in current data
          const validSavedOrder = parsedOrder.filter(t => types.includes(t));
          setProductTypeOrder([...validSavedOrder, ...newTypes]);
        } catch (e) {
          setProductTypeOrder(types);
        }
      } else {
        // Check if there's a default order for this category
        const defaultOrder = defaultCategoryOrders[selectedCategory];
        if (defaultOrder) {
          // Apply default order: default types first, then remaining types alphabetically
          const defaultSet = new Set(defaultOrder);
          const remainingTypes = types.filter(t => !defaultSet.has(t)).sort();
          const validDefaultOrder = defaultOrder.filter(t => types.includes(t));
          setProductTypeOrder([...validDefaultOrder, ...remainingTypes]);
        } else {
          setProductTypeOrder(types);
        }
      }
      
      // Try to restore saved item order for this category+tier combination
      if (selectedTier) {
        const itemOrderKey = `priceListItemOrder_${selectedCategory}_${selectedTier}`;
        const savedItemOrder = localStorage.getItem(itemOrderKey);
        if (savedItemOrder) {
          try {
            const itemCodeOrder = JSON.parse(savedItemOrder) as string[];
            // Filter out invalid/empty codes
            const validCodes = itemCodeOrder.filter(code => code && typeof code === 'string');
            if (validCodes.length > 0) {
              // Create a map for quick lookup of saved positions
              const orderMap = new Map(validCodes.map((code, index) => [code, index]));
              // Sort items based on saved order, new items go to end
              const restoredItems = [...priceListItems].sort((a, b) => {
                const aIndex = orderMap.has(a.itemCode) ? orderMap.get(a.itemCode)! : Infinity;
                const bIndex = orderMap.has(b.itemCode) ? orderMap.get(b.itemCode)! : Infinity;
                // If both are new items (not in saved order), maintain alphabetical order
                if (aIndex === Infinity && bIndex === Infinity) {
                  return (a.itemCode || '').localeCompare(b.itemCode || '');
                }
                return aIndex - bIndex;
              });
              setOrderedItems(restoredItems);
            }
            // If no valid codes, don't set orderedItems - keep default order
          } catch (e) {
            // On parse error, don't change orderedItems
            console.error('Failed to parse saved item order:', e);
          }
        }
        // If no saved order exists, don't reset orderedItems - keep current state or default
      }
      
      setCollapsedTypes(new Set());
      
      // Default all items selected for PDF, EXCEPT items containing "Samples" in their name/code
      const selectedItems = priceListItems
        .filter(item => {
          const itemCode = (item.itemCode || '').toLowerCase();
          const productType = (item.productType || '').toLowerCase();
          const size = (item.size || '').toLowerCase();
          // Check if any field contains "sample" or "samples"
          return !itemCode.includes('sample') && 
                 !productType.includes('sample') && 
                 !size.includes('sample');
        })
        .map(item => item.itemCode);
      setSelectedForPDF(new Set(selectedItems));
    }
  }, [priceListItems, selectedCategory, selectedTier]);

  // Toggle single item selection for PDF
  const toggleItemSelection = (itemCode: string) => {
    setSelectedForPDF(prev => {
      const newSet = new Set(prev);
      if (newSet.has(itemCode)) {
        newSet.delete(itemCode);
      } else {
        newSet.add(itemCode);
      }
      return newSet;
    });
  };

  // Toggle all items in a product type group
  const toggleTypeSelection = (productType: string, items: PriceListItem[]) => {
    const itemCodes = items.map(item => item.itemCode);
    const allSelected = itemCodes.every(code => selectedForPDF.has(code));
    
    setSelectedForPDF(prev => {
      const newSet = new Set(prev);
      if (allSelected) {
        itemCodes.forEach(code => newSet.delete(code));
      } else {
        itemCodes.forEach(code => newSet.add(code));
      }
      return newSet;
    });
  };

  // Select/deselect all items
  const toggleSelectAll = () => {
    const allItemCodes = priceListItems.map(item => item.itemCode);
    const allSelected = allItemCodes.every(code => selectedForPDF.has(code));
    
    if (allSelected) {
      setSelectedForPDF(new Set());
    } else {
      setSelectedForPDF(new Set(allItemCodes));
    }
  };

  // Toggle collapse state for a product type
  const toggleTypeCollapse = (type: string) => {
    setCollapsedTypes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(type)) {
        newSet.delete(type);
      } else {
        newSet.add(type);
      }
      return newSet;
    });
  };

  // Move product type up in order
  const moveTypeUp = (type: string) => {
    const index = productTypeOrder.indexOf(type);
    // Guard against invalid index (-1 means type not in order array)
    if (index <= 0) return;
    const newOrder = [...productTypeOrder];
    [newOrder[index - 1], newOrder[index]] = [newOrder[index], newOrder[index - 1]];
    setProductTypeOrder(newOrder);
    // Persist order to localStorage scoped by category
    if (selectedCategory) {
      localStorage.setItem(`priceListTypeOrder_${selectedCategory}`, JSON.stringify(newOrder));
    }
  };

  // Move product type down in order
  const moveTypeDown = (type: string) => {
    const index = productTypeOrder.indexOf(type);
    // Guard against invalid index (-1 means type not in order array)
    if (index < 0 || index >= productTypeOrder.length - 1) return;
    const newOrder = [...productTypeOrder];
    [newOrder[index], newOrder[index + 1]] = [newOrder[index + 1], newOrder[index]];
    setProductTypeOrder(newOrder);
    // Persist order to localStorage scoped by category
    if (selectedCategory) {
      localStorage.setItem(`priceListTypeOrder_${selectedCategory}`, JSON.stringify(newOrder));
    }
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

  // Generate price list when category, types, or tier changes
  useEffect(() => {
    if (!selectedCategory || selectedTypes.length === 0 || !selectedTier || !productData.length) {
      // Use functional update to avoid stale closure issues
      setPriceListItems(prev => prev.length > 0 ? [] : prev);
      setOrderedItems(prev => prev.length > 0 ? [] : prev);
      return;
    }

    const filteredProducts = productData.filter(
      (item) => {
        // Use categoryName from API which maps to product_categories table
        const categoryName = (item as any).categoryName || item.productName || item.product_name;
        const matchesCategory = categoryName?.toLowerCase() === selectedCategory?.toLowerCase();
        const itemType = (item.productType || item.ProductType || '').toLowerCase();
        const matchesType = selectedTypes.some(t => t.toLowerCase() === itemType);
        return matchesCategory && matchesType;
      }
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
      const totalSqm = parseFloat(String(product.totalSqm || 0));
      const minQty = Number(product.minQuantity) || 1;
      
      // totalSqm is for the entire pack, divide by minQty to get sqm per sheet
      // For rolls (minQty=1), sqmPerSheet equals totalSqm
      const sqmPerSheet = minQty > 1 ? totalSqm / minQty : totalSqm;
      const pricePerSheet = +(pricePerSqM * sqmPerSheet).toFixed(2);
      
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
        squareMeters: sqmPerSheet,
        sortOrder: product.sortOrder,
        rollSheet: (product as any).rollSheet || (product as any).roll_sheet || null,
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
  }, [selectedCategory, selectedTypes, selectedTier, productData]);





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
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {/* 1. Customer Selection - FIRST */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Customer</label>
                <SearchableCustomerSelect
                  selectedCustomer={selectedCustomer}
                  onCustomerSelect={setSelectedCustomer}
                  placeholder="Search customers..."
                  className="w-full"
                />
                {selectedCustomer?.pricingTier && (
                  <p className="text-xs text-green-600">Tier: {selectedCustomer.pricingTier}</p>
                )}
              </div>

              {/* 2. Pricing Tier - Auto-filled from customer if available */}
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

              {/* 3. Product Category */}
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

              {/* 4. Product Types (Multi-Select) */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Product Types</label>
                <Popover open={typePopoverOpen} onOpenChange={setTypePopoverOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      aria-expanded={typePopoverOpen}
                      disabled={!selectedCategory}
                      className="w-full h-10 justify-between bg-white border border-gray-300 hover:border-gray-400 text-sm font-normal disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <span className="truncate">
                        {!selectedCategory 
                          ? "Select category first" 
                          : selectedTypes.length === 0 
                            ? "Select product types" 
                            : selectedTypes.length === availableTypes.length 
                              ? "All types selected"
                              : `${selectedTypes.length} type${selectedTypes.length > 1 ? 's' : ''} selected`}
                      </span>
                      {selectedTypes.length > 0 && (
                        <Badge variant="secondary" className="ml-2 rounded-full px-1.5 py-0.5 text-xs">
                          {selectedTypes.length}
                        </Badge>
                      )}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-64 p-0" align="start">
                    <div className="p-2 border-b border-gray-200">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-gray-500">{availableTypes.length} types available</span>
                        <div className="flex gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setSelectedTypes([...availableTypes])}
                          >
                            Select All
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs"
                            onClick={() => setSelectedTypes([])}
                          >
                            Clear
                          </Button>
                        </div>
                      </div>
                    </div>
                    <div className="max-h-60 overflow-y-auto p-2">
                      {availableTypes.length > 0 ? (
                        availableTypes.map((type) => (
                          <div
                            key={type}
                            className="flex items-center space-x-2 p-2 hover:bg-gray-100 rounded cursor-pointer"
                            onClick={() => {
                              const isSelected = selectedTypes.includes(type);
                              if (isSelected) {
                                setSelectedTypes(selectedTypes.filter(t => t !== type));
                              } else {
                                setSelectedTypes([...selectedTypes, type]);
                              }
                            }}
                          >
                            <Checkbox
                              checked={selectedTypes.includes(type)}
                              className="pointer-events-none"
                            />
                            <span className="text-sm">{type}</span>
                          </div>
                        ))
                      ) : (
                        <div className="p-2 text-sm text-gray-400 text-center">
                          No types available
                        </div>
                      )}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            
            {/* Shipping Costs Toggle */}
            <div className="mt-4 pt-4 border-t border-gray-200">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Truck className="h-5 w-5 text-gray-600" />
                  <div>
                    <label className="block label-medium text-gray-800">Add Shipping Costs</label>
                    <p className="text-xs text-gray-500">Enable to add shipping costs to prices</p>
                  </div>
                </div>
                <Switch
                  checked={includeShipping}
                  onCheckedChange={(checked) => {
                    setIncludeShipping(checked);
                    if (!checked) {
                      setShippingCosts({});
                      setShippingInputs({});
                      setGlobalShippingCost(0);
                      setGlobalShippingInput('');
                    }
                  }}
                  data-testid="switch-include-shipping"
                />
              </div>
              
              {/* Shipping Mode Options - Only show when shipping is enabled */}
              {includeShipping && (
                <div className="mt-4 p-4 bg-blue-50/50 rounded-lg border border-blue-100">
                  <div className="flex items-center gap-6 mb-3">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shippingMode"
                        checked={shippingMode === 'same'}
                        onChange={() => setShippingMode('same')}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">Same price for all lines</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name="shippingMode"
                        checked={shippingMode === 'individual'}
                        onChange={() => setShippingMode('individual')}
                        className="w-4 h-4 text-blue-600"
                      />
                      <span className="text-sm text-gray-700">Individual line pricing</span>
                    </label>
                  </div>
                  
                  {/* Global shipping cost input - Only show when "same" mode is selected */}
                  {shippingMode === 'same' && (
                    <div className="flex items-center gap-3">
                      <label className="text-sm text-gray-600">Shipping cost per unit:</label>
                      <div className="flex items-center">
                        <span className="text-gray-500 mr-1">$</span>
                        <Input
                          type="text"
                          inputMode="decimal"
                          value={globalShippingInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                              setGlobalShippingInput(val);
                              const numValue = parseFloat(val);
                              if (!isNaN(numValue) && numValue >= 0) {
                                setGlobalShippingCost(numValue);
                              } else if (val === '' || val === '0' || val === '0.') {
                                setGlobalShippingCost(0);
                              }
                            }
                          }}
                          placeholder="0.00"
                          className="w-24 h-8 text-sm text-center"
                        />
                      </div>
                      {globalShippingCost > 0 && (
                        <span className="text-xs text-green-600">
                          Applied to all {priceListItems.length} items
                        </span>
                      )}
                    </div>
                  )}
                  
                  {shippingMode === 'individual' && (
                    <p className="text-xs text-gray-500">
                      Enter shipping costs for each item in the table below
                    </p>
                  )}
                </div>
              )}
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
                className="bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-md flex items-center gap-2 label-small"
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
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <p className="body-small text-gray-500">{priceListItems.length} products found across {sortedProductTypes.length} product types</p>
              {zeroPriceCount > 0 && (
                <button
                  onClick={() => setHideZeroPrice(prev => !prev)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${hideZeroPrice ? 'bg-amber-500 text-white border-amber-500' : 'bg-amber-50 text-amber-700 border-amber-300 hover:bg-amber-100'}`}
                >
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
                  {zeroPriceCount} $0 item{zeroPriceCount !== 1 ? 's' : ''} {hideZeroPrice ? '(hidden)' : '— click to hide'}
                </button>
              )}
            </div>
            <div className="flex items-center gap-4">
              <span className="text-sm text-gray-600">
                <span className="font-medium text-purple-700">{selectedForPDF.size}</span> of {priceListItems.length} selected for PDF
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={toggleSelectAll}
                className="text-xs"
              >
                {priceListItems.length > 0 && priceListItems.every(item => selectedForPDF.has(item.itemCode)) 
                  ? 'Deselect All' 
                  : 'Select All'}
              </Button>
            </div>
          </div>
          
          {/* Grouped by Product Type Display */}
          <div className="space-y-4">
            {sortedProductTypes.map((productType, typeIndex) => {
              const items = groupedByType[productType] || [];
              const isCollapsed = collapsedTypes.has(productType);
              
              return (
                <div key={productType} className="border border-gray-200 rounded-lg overflow-hidden">
                  {/* Product Type Header */}
                  <div 
                    className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-purple-50 to-white cursor-pointer hover:bg-purple-100/50 transition-colors"
                    onClick={() => toggleTypeCollapse(productType)}
                  >
                    <div className="flex items-center gap-3">
                      <Checkbox
                        checked={items.every(item => selectedForPDF.has(item.itemCode))}
                        onCheckedChange={() => toggleTypeSelection(productType, items)}
                        onClick={(e) => e.stopPropagation()}
                        className="h-4 w-4"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-6 p-0"
                        onClick={(e) => { e.stopPropagation(); toggleTypeCollapse(productType); }}
                      >
                        {isCollapsed ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
                      </Button>
                      <span className="font-semibold text-gray-800">{productType}</span>
                      <Badge variant="secondary" className="text-xs">
                        {items.filter(item => selectedForPDF.has(item.itemCode)).length}/{items.length} selected
                      </Badge>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); moveTypeUp(productType); }}
                        disabled={typeIndex === 0}
                      >
                        <ChevronUp className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        onClick={(e) => { e.stopPropagation(); moveTypeDown(productType); }}
                        disabled={typeIndex === sortedProductTypes.length - 1}
                      >
                        <ChevronDown className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                  
                  {/* Product Items Table */}
                  {!isCollapsed && (
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-gray-50">
                          <TableHead className="w-[50px] text-center">PDF</TableHead>
                          <TableHead className="w-[140px]">Item Code</TableHead>
                          <TableHead className="w-[100px] text-center">Size</TableHead>
                          <TableHead className="w-[80px] text-center">Min Qty</TableHead>
                          {(user as any)?.role === 'admin' && (
                            <TableHead className="w-[100px] text-right">Price/Sq.M</TableHead>
                          )}
                          {includeShipping && shippingMode === 'individual' && (
                            <TableHead className="w-[120px] text-center">Shipping/Unit</TableHead>
                          )}
                          <TableHead className="w-[120px] text-right">Price/Unit</TableHead>
                          <TableHead className="w-[120px] text-right">Price Per Pack</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {items.map((item, idx) => {
                          const shippingCost = shippingMode === 'same' ? globalShippingCost : (shippingCosts[item.itemCode] || 0);
                          const adjustedPricePerSheet = includeShipping ? item.pricePerSheet + shippingCost : item.pricePerSheet;
                          const adjustedPricePerPack = adjustedPricePerSheet * item.minQty;
                          const unitLabel = item.minQty === 1 ? 'roll' : 'sheet';
                          
                          return (
                            <TableRow key={item.itemCode} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                              <TableCell className="text-center">
                                <Checkbox
                                  checked={selectedForPDF.has(item.itemCode)}
                                  onCheckedChange={() => toggleItemSelection(item.itemCode)}
                                  className="h-4 w-4"
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm text-gray-600">{item.itemCode}</TableCell>
                              <TableCell className="text-center text-sm text-gray-600">{item.size}</TableCell>
                              <TableCell className="text-center text-sm text-gray-600">{item.minQty}</TableCell>
                              {(user as any)?.role === 'admin' && (
                                <TableCell className="text-right text-sm text-gray-600">${Number(item.pricePerSqM || 0).toFixed(2)}</TableCell>
                              )}
                              {includeShipping && shippingMode === 'individual' && (
                                <TableCell className="text-center">
                                  <div className="flex items-center justify-center">
                                    <span className="text-gray-500 mr-1">$</span>
                                    <Input
                                      type="text"
                                      inputMode="decimal"
                                      value={getShippingInputValue(item.itemCode)}
                                      onChange={(e) => {
                                        const val = e.target.value;
                                        if (val === '' || /^\d*\.?\d{0,2}$/.test(val)) {
                                          updateShippingInput(item.itemCode, val);
                                        }
                                      }}
                                      onBlur={(e) => {
                                        const val = e.target.value;
                                        const num = parseFloat(val);
                                        if (!isNaN(num) && num > 0) {
                                          updateShippingInput(item.itemCode, num.toFixed(2));
                                        } else if (val === '' || val === '0' || val === '0.' || val === '0.0' || val === '0.00') {
                                          setShippingInputs(prev => ({ ...prev, [item.itemCode]: '' }));
                                          setShippingCosts(prev => ({ ...prev, [item.itemCode]: 0 }));
                                        }
                                      }}
                                      className="w-16 h-7 text-sm text-center px-1"
                                      placeholder="0.00"
                                    />
                                  </div>
                                </TableCell>
                              )}
                              <TableCell className="text-right">
                                <div>
                                  <span className={`text-sm ${includeShipping && shippingCost > 0 ? 'text-blue-600 font-medium' : 'text-gray-600'}`}>
                                    ${Number(adjustedPricePerSheet || 0).toFixed(2)}
                                  </span>
                                  <div className="text-xs text-gray-400">/{unitLabel}</div>
                                </div>
                              </TableCell>
                              <TableCell className="text-right">
                                <span className={`text-sm font-medium ${includeShipping && shippingCost > 0 ? 'text-blue-600' : 'text-green-600'}`}>
                                  ${Number(adjustedPricePerPack || 0).toFixed(2)}
                                </span>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="border border-gray-200 rounded-lg p-6 bg-white text-center">
          <FileText className="h-12 w-12 mx-auto mb-4 text-gray-400" />
          <p className="text-base font-medium text-gray-800 mb-2">No price list generated</p>
          <p className="text-sm text-gray-500">Select a product category and pricing tier to get started</p>
        </div>
      )}
      </div>

      {/* PDF Generation Progress Dialog */}
      <Dialog open={showPdfProgress} onOpenChange={() => {}}>
        <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
          <div className="flex flex-col items-center py-6">
            <div className="mb-4 relative">
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                <Loader2 className="h-8 w-8 text-purple-600 animate-spin" />
              </div>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Generating PDF</h3>
            <p className="text-sm text-gray-500 mb-4 text-center">
              Please wait while we create your price list...
            </p>
            <div className="w-full px-4">
              <Progress value={pdfProgress} className="h-2" />
              <p className="text-xs text-gray-400 mt-2 text-center">{Math.round(pdfProgress)}% complete</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
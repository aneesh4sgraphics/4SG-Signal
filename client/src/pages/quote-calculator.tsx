import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, Mail, Calculator, Building, Phone, MapPin, User, FileText, Film, Palette, Layers, Paintbrush, Image, Printer, Frame, Monitor, Zap, ArrowUpDown, Check, AlertTriangle, Tag, ShoppingCart, Database, Eye, EyeOff, Sparkles, ChevronDown, ChevronRight, History, DollarSign, Truck, Send, Loader2, RefreshCw, Package, ExternalLink } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import { AdaptiveTable } from "@/components/OdooTable";
import { getPriceColumnHeader } from "@/utils/sizeUtils";
import ProductOrderingDialog from "@/components/ProductOrderingDialog";
import { EmptyState, getErrorType, getErrorMessage, getErrorDetails } from "@/components/EmptyState";
import { ApiError } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useEmailComposer } from "@/components/email-composer";
import { ALLOWED_CATEGORIES } from "@/lib/productCategories";

interface ProductData {
  id: number;
  itemCode: string;
  odooItemCode?: string; // Odoo code for display when available
  productName: string;
  productType: string;
  size: string;
  totalSqm: number;
  minQuantity: number;
  unitOfMeasure?: string | null; // 'sheets', 'rolls', 'packets', 'cartons', etc.
  rollSheet?: string | null; // 'Roll' or 'Sheets' from product mapping
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
  catalogCategoryId?: number | null;
  productTypeId?: number | null;
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
  odooItemCode?: string; // Odoo code for display
  quantity: number;
  pricePerSqM: number;
  pricePerSheet: number;
  total: number;
  tier: string;
  squareMeters: number;
  minOrderQty: number;
  sortOrder?: number;
}

interface AdditionalCharge {
  id: string;
  type: 'credit_card' | 'shipping' | 'other';
  label: string;
  odooProductCode: string;
  amount: number;
  enabled: boolean;
}

const allPricingTiers = [
  { key: 'landedPrice', label: 'Landed Price' },
  { key: 'exportPrice', label: 'Export Only' },
  { key: 'masterDistributorPrice', label: 'Distributor' },
  { key: 'dealerPrice', label: 'Dealer-VIP' },
  { key: 'dealer2Price', label: 'Dealer' },
  { key: 'approvalNeededPrice', label: 'Shopify Lowest' },
  { key: 'tierStage25Price', label: 'Shopify3' },
  { key: 'tierStage2Price', label: 'Shopify2' },
  { key: 'tierStage15Price', label: 'Shopify1' },
  { key: 'tierStage1Price', label: 'Shopify-Account' },
  { key: 'retailPrice', label: 'Retail' }
];

export default function QuoteCalculator() {
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedSize, setSelectedSize] = useState<string>("");
  const [quantity, setQuantity] = useState<number>(1);
  const [quoteItems, setQuoteItems] = useState<QuoteItem[]>([]);
  const [orderedQuoteItems, setOrderedQuoteItems] = useState<QuoteItem[]>([]);
  const [isCustomSize, setIsCustomSize] = useState<boolean>(false);
  const [customWidth, setCustomWidth] = useState<string>("");
  const [customHeight, setCustomHeight] = useState<string>("");
  const [filtersInitialized, setFiltersInitialized] = useState<boolean>(false);
  const [sizeSortOrder, setSizeSortOrder] = useState<'default' | 'asc' | 'desc'>('default');
  const [landedPriceRevealed, setLandedPriceRevealed] = useState<boolean>(false);
  const [sentPricesOpen, setSentPricesOpen] = useState<boolean>(false);
  const [isCreatingOdooOrder, setIsCreatingOdooOrder] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([
    { id: 'cc', type: 'credit_card', label: 'Credit Card Fee', odooProductCode: 'CC-FEE', amount: 0, enabled: false },
    { id: 'ship', type: 'shipping', label: 'Shipping Cost', odooProductCode: 'SHIPPING', amount: 0, enabled: false },
  ]);
  const [showAdditionalCharges, setShowAdditionalCharges] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { logPageView, logQuoteGeneration, logQuoteDownload, logUserAction } = useActivityLogger();
  const { open: openEmailComposer } = useEmailComposer();
  const [location] = useLocation();

  // Pre-fill customer from URL parameter if provided
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const customerId = urlParams.get('customerId');
    if (customerId && !selectedCustomer) {
      // Fetch customer by ID and set as selected
      fetch(`/api/customers/${customerId}`)
        .then(res => res.ok ? res.json() : null)
        .then(customer => {
          if (customer) {
            setSelectedCustomer(customer);
          }
        })
        .catch(() => {});
    }
  }, [location]);

  // Log page view on mount
  useEffect(() => {
    logPageView("Quote Calculator");
  }, [logPageView]);

  // Reset all selections
  const resetSelections = () => {
    setSelectedCategory("");
    setSelectedType("");
    setSelectedSize("");
    setQuantity(1);
    setIsCustomSize(false);
    setCustomWidth("");
    setCustomHeight("");
    // Clear stored filters
    localStorage.removeItem("quoteCalculatorFilters");
    toast({
      title: "Filters Reset",
      description: "All filters have been cleared",
    });
  };
  
  // Get user role and filter pricing tiers accordingly
  // Use role from user object directly, fallback to email-based detection
  const userRole = (user as any)?.role || getUserRoleFromEmail((user as any)?.email || '');
  const userAllowedTiers = (user as any)?.allowedTiers as string[] | null | undefined;
  
  // Filter tiers based on user's allowed tiers if set, otherwise use role-based access
  const pricingTiers = allPricingTiers.filter(tier => {
    // If user has specific allowed tiers set, use those
    if (userAllowedTiers && userAllowedTiers.length > 0) {
      return userAllowedTiers.includes(tier.key);
    }
    // Otherwise use role-based tier access
    return canAccessTier(tier.label, userRole);
  });

  // Check if customer has a pricing tier assigned or tags match a pricing tier label
  const getMatchingTierFromTags = (): string | null => {
    if (!selectedCustomer) return null;
    
    // First check the dedicated pricingTier field (highest priority)
    const customerPricingTier = (selectedCustomer as any).pricingTier;
    if (customerPricingTier) {
      // Find the tier that matches by label or key
      for (const tier of pricingTiers) {
        if (tier.label.toLowerCase() === customerPricingTier.toLowerCase() ||
            tier.key.toLowerCase() === customerPricingTier.toLowerCase()) {
          return tier.key;
        }
      }
    }
    
    // Fallback to checking tags
    if (!selectedCustomer?.tags) return null;
    const customerTags = selectedCustomer.tags.toLowerCase().split(',').map((t: string) => t.trim());
    
    for (const tier of pricingTiers) {
      const tierLabel = tier.label.toLowerCase();
      // Check for exact or partial match
      if (customerTags.some((tag: string) => 
        tag === tierLabel || 
        tierLabel.includes(tag) || 
        tag.includes(tierLabel) ||
        // Also check common variations
        (tag === 'dealer' && tierLabel.includes('dealer')) ||
        (tag === 'distributor' && tierLabel.includes('distributor')) ||
        (tag === 'vip' && tierLabel.includes('vip')) ||
        (tag === 'retail' && tierLabel === 'retail') ||
        (tag === 'export' && tierLabel.includes('export')) ||
        (tag === 'shopify' && tierLabel.includes('shopify'))
      )) {
        return tier.key;
      }
    }
    return null;
  };

  // Get suggested tier based on customer data (predictive pricing)
  const getSuggestedTier = (): string | null => {
    if (!selectedCustomer) return null;
    
    const totalSpent = parseFloat(String((selectedCustomer as any).totalSpent || 0));
    const totalOrders = (selectedCustomer as any).totalOrders || 0;
    
    // Predictive pricing based on customer history
    if (totalSpent >= 50000 || totalOrders >= 100) {
      return 'masterDistributorPrice'; // Distributor tier for high-value customers
    } else if (totalSpent >= 20000 || totalOrders >= 50) {
      return 'dealerPrice'; // Dealer-VIP for medium-high value
    } else if (totalSpent >= 10000 || totalOrders >= 25) {
      return 'dealer2Price'; // Dealer for medium value
    } else if (totalSpent >= 5000 || totalOrders >= 10) {
      return 'approvalNeededPrice'; // Shopify Lowest for returning customers
    } else if (totalOrders >= 3) {
      return 'tierStage25Price'; // Shopify3 for repeat customers
    }
    return 'retailPrice'; // Default to retail for new customers
  };

  // Get the tier to highlight (tag match takes priority, then prediction)
  const matchingTier = getMatchingTierFromTags();
  const suggestedTier = !matchingTier ? getSuggestedTier() : null;

  // Product category icon mapping with colors
  const getProductIcon = (productName: string | undefined | null) => {
    if (!productName) return FileText;
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
  const getProductIconColor = (productName: string | undefined | null) => {
    if (!productName) return 'text-gray-600';
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

  // Fetch product pricing data from new database - only fetch when authenticated
  const { data: productData = [], isLoading, error, refetch } = useQuery<ProductData[]>({
    queryKey: ['/api/product-pricing-database'],
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
  });

  // Fetch PDF sent prices for the selected customer
  const { data: sentPricesData } = useQuery<{
    event: { id: number; eventDate: string; priceTier: string } | null;
    items: Array<{
      id: number;
      itemCode: string;
      productType: string;
      size: string;
      minQty: number;
      pricePerUnit: string;
      pricePerPack: string;
      shippingCost: string | null;
      priceTier: string;
      category: string;
    }>;
  }>({
    queryKey: ['/api/crm/price-list-items', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return { event: null, items: [] };
      const response = await fetch(`/api/crm/price-list-items/${selectedCustomer.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch sent prices');
      return response.json();
    },
    enabled: !isAuthLoading && isAuthenticated && !!selectedCustomer?.id,
  });

  // Fetch active issues (objections) for the selected customer
  const { data: customerIssues } = useQuery<Array<{
    id: number;
    categoryName: string;
    objectionType: string;
    status: string;
    details: string | null;
    createdAt: string;
  }>>({
    queryKey: ['/api/crm/objections', selectedCustomer?.id],
    queryFn: async () => {
      if (!selectedCustomer?.id) return [];
      const response = await fetch(`/api/crm/objections?customerId=${selectedCustomer.id}`, {
        credentials: 'include'
      });
      if (!response.ok) throw new Error('Failed to fetch customer issues');
      return response.json();
    },
    enabled: !isAuthLoading && isAuthenticated && !!selectedCustomer?.id,
  });

  // Filter for active (open) price or compatibility issues
  const activeIssues = customerIssues?.filter(issue => 
    issue.status === 'open' && 
    (issue.objectionType === 'price' || issue.objectionType === 'compatibility')
  ) || [];

  // Fetch categories from database
  const { data: dbCategories = [] } = useQuery<Array<{ id: number; name: string }>>({
    queryKey: ['/api/product-categories'],
    enabled: !isAuthLoading && isAuthenticated,
  });

  // Build category ID to name lookup
  const categoryIdToName = new Map(dbCategories.map(c => [c.id, c.name]));
  const categoryNameToId = new Map(dbCategories.map(c => [c.name, c.id]));

  // Use categories from database, fallback to hardcoded list if empty
  const categories = dbCategories.length > 0 
    ? dbCategories.map(c => c.name).filter(name => ALLOWED_CATEGORIES.includes(name as typeof ALLOWED_CATEGORIES[number]))
    : [...ALLOWED_CATEGORIES];

  // Get product types for selected category using catalogCategoryId when available
  const productTypes = (() => {
    if (!selectedCategory) return [];
    
    const categoryId = categoryNameToId.get(selectedCategory);
    
    // Filter products by catalogCategoryId if available, otherwise use prefix matching
    const typesInCategory = productData
      .filter(item => {
        if (categoryId && item.catalogCategoryId) {
          return item.catalogCategoryId === categoryId;
        }
        // Fallback: prefix matching for unmapped products
        const categoryPrefix = selectedCategory.toLowerCase().split(' ')[0];
        return item.productType?.toLowerCase().includes(categoryPrefix);
      })
      .map(item => item.productType)
      .filter(Boolean);
    return Array.from(new Set(typesInCategory)).sort();
  })();

  // Get sizes for selected type with sorting (deduplicated by itemCode/SKU)
  const availableSizes = selectedCategory && selectedType
    ? (() => {
        const filtered = productData.filter(item => 
          item.productType === selectedType
        ).sort((a, b) => {
          const sqmA = parseFloat(String(a.totalSqm || 0));
          const sqmB = parseFloat(String(b.totalSqm || 0));
          if (sizeSortOrder === 'asc') return sqmA - sqmB;
          if (sizeSortOrder === 'desc') return sqmB - sqmA;
          return sqmA - sqmB; // default is ascending by size
        });
        // Deduplicate by itemCode (SKU) - keep first occurrence of each unique product
        const seen = new Set<string>();
        return filtered.filter(item => {
          const key = item.itemCode || item.size; // Use SKU as primary key, fallback to size
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
      })()
    : [];

  // Check if current filters produce no results
  const hasNoResults = (
    (selectedCategory && productTypes.length === 0) ||
    (selectedCategory && selectedType && availableSizes.length === 0)
  );

  // Check if category supports custom sizes
  const supportsCustomSize = (category: string): boolean => {
    return category === 'Graffiti Polyester Paper' || 
           category === 'Graffiti Blended Poly' || 
           category.includes('Graffiti STICK');
  };

  // Check if product size is in roll format (inch x feet)
  const isRollFormat = (size: string): boolean => {
    return size.includes("'") || size.toLowerCase().includes("feet") || /\d+x\d+\'/.test(size);
  };

  // Get selected product details (by itemCode or size depending on what was selected)
  const selectedProduct = productData.find(item =>
    item.productType === selectedType &&
    (item.itemCode === selectedSize || item.size === selectedSize)
  );

  // Fetch inventory from Odoo for selected product
  const { data: inventoryData, isLoading: inventoryLoading, refetch: refetchInventory } = useQuery<{
    itemCode: string;
    qtyAvailable: number;
    qtyReserved: number;
    qtyVirtual: number;
    productId: number | null;
    odooUrl: string | null;
    lastUpdated: string;
  }>({
    queryKey: ['/api/odoo/inventory', selectedProduct?.itemCode],
    enabled: !!selectedProduct?.itemCode && !isCustomSize,
    staleTime: 60000, // Cache for 1 minute
    refetchOnWindowFocus: false,
  });

  // Utility function for retail pricing rounding (99-cent rounding)
  const applyRetailRounding = (price: number, isRetail: boolean): number => {
    if (!isRetail) return price;
    
    // Round to 99 cents: floor the dollar amount and add 0.99
    const floorPrice = Math.floor(price);
    return floorPrice + 0.99;
  };

  // Check if a tier is already selected for the current product configuration
  const isTierAlreadySelected = (tier: string): boolean => {
    if (!selectedProduct) return false;
    
    return quoteItems.some(item => 
      item.productName === selectedProduct.productName &&
      item.productType === selectedProduct.productType &&
      item.size === selectedProduct.size &&
      item.tier === tier
    );
  };

  const addToQuote = (tier: string) => {
    if (!selectedProduct && !isCustomSize) return;
    if (!isCustomSize && !selectedProduct) return;

    // For custom sizes
    if (isCustomSize && customWidth && customHeight) {
      // Get reference product for pricing
      const referenceProduct = availableSizes[0];
      if (!referenceProduct) {
        toast({
          title: "Error",
          description: "No reference pricing available for this product",
          variant: "destructive",
        });
        return;
      }

      const tierPrice = (referenceProduct[tier as keyof ProductData] as number) || 0;
      const customSqm = parseFloat(customWidth) * parseFloat(customHeight) * 0.00064516;
      const pricePerSheet = tierPrice * customSqm;
      const useQuantity = quantity; // Custom sizes use entered quantity
      
      // Apply retail rounding for RETAIL tier only to total
      const isRetailTier = tier === 'retailPrice';
      const rawTotal = pricePerSheet * useQuantity;
      const total = applyRetailRounding(rawTotal, isRetailTier);

      const quoteItem: QuoteItem = {
        id: `${Date.now()}-${Math.random()}`,
        productName: referenceProduct.productName,
        productType: referenceProduct.productType,
        size: `${customWidth}" × ${customHeight}" (Custom)`,
        itemCode: `${referenceProduct.itemCode}-CUSTOM`,
        odooItemCode: referenceProduct.odooItemCode ? `${referenceProduct.odooItemCode}-CUSTOM` : undefined,
        quantity: useQuantity,
        pricePerSqM: tierPrice,
        pricePerSheet: pricePerSheet,
        total: total,
        tier: tier,
        squareMeters: customSqm,
        minOrderQty: 1,
        sortOrder: referenceProduct.sortOrder
      };

      setQuoteItems(prev => [...prev, quoteItem]);
      toast({
        title: "Item Added",
        description: `Added custom size ${customWidth}" × ${customHeight}" to quote`,
      });
      return;
    }

    // Check if this tier is already selected for this product configuration
    if (isTierAlreadySelected(tier)) {
      toast({
        title: "Tier Already Selected",
        description: "This pricing tier is already added to your quote for this product configuration",
        variant: "destructive",
      });
      return;
    }

    if (!selectedProduct) return; // Additional safety check

    const tierPrice = (selectedProduct[tier as keyof ProductData] as number) || 0;
    const totalSqm = parseFloat(String(selectedProduct.totalSqm || 0));
    const minQty = selectedProduct.minQuantity || 1;
    
    // For products sold in packs (minQuantity > 1), totalSqm represents the entire pack
    // We need to divide by minQuantity to get the per-unit price
    // For rolls (minQuantity = 1), this has no effect since we divide by 1
    const pricePerUnit = (tierPrice * totalSqm) / minQty;
    const pricePerSheet = pricePerUnit; // Per-sheet or per-roll price
    
    const useQuantity = Math.max(quantity, selectedProduct.minQuantity);
    
    // Apply retail rounding for RETAIL tier only to total
    const isRetailTier = tier === 'retailPrice';
    const rawTotal = pricePerSheet * useQuantity;
    const total = applyRetailRounding(rawTotal, isRetailTier);

    const quoteItem: QuoteItem = {
      id: `${Date.now()}-${Math.random()}`,
      productName: selectedProduct.productName,
      productType: selectedProduct.productType,
      size: selectedProduct.size,
      itemCode: selectedProduct.itemCode,
      odooItemCode: selectedProduct.odooItemCode,
      quantity: useQuantity,
      pricePerSqM: tierPrice,
      pricePerSheet: pricePerSheet,
      total: total,
      tier: tier,
      squareMeters: totalSqm / minQty, // Per-unit sqm (per-sheet or per-roll)
      minOrderQty: selectedProduct.minQuantity,
      sortOrder: selectedProduct.sortOrder
    };

    setQuoteItems(prev => [...prev, quoteItem]);
    toast({
      title: "Item Added",
      description: `Added ${selectedProduct.productType} to quote`,
    });
  };

  const removeFromQuote = (id: string) => {
    setQuoteItems(prev => prev.filter(item => item.id !== id));
    // Reset ordered items when items are removed
    setOrderedQuoteItems([]);
  };

  // Update quantity for a specific quote item
  const updateQuoteItemQuantity = (id: string, newQuantity: number) => {
    if (newQuantity < 1) return; // Prevent invalid quantities
    
    setQuoteItems(prev => prev.map(item => {
      if (item.id === id) {
        // Recalculate total based on new quantity
        const isRetailTier = item.tier === 'retailPrice';
        const rawTotal = item.pricePerSheet * newQuantity;
        const total = applyRetailRounding(rawTotal, isRetailTier);
        
        return {
          ...item,
          quantity: newQuantity,
          total: total
        };
      }
      return item;
    }));
    
    // Also update ordered items if they exist
    if (orderedQuoteItems.length > 0) {
      setOrderedQuoteItems(prev => prev.map(item => {
        if (item.id === id) {
          const isRetailTier = item.tier === 'retailPrice';
          const rawTotal = item.pricePerSheet * newQuantity;
          const total = applyRetailRounding(rawTotal, isRetailTier);
          
          return {
            ...item,
            quantity: newQuantity,
            total: total
          };
        }
        return item;
      }));
    }
  };

  // Handle quote item reordering
  const handleQuoteItemReorder = (reorderedItems: any[]) => {
    const updatedItems = reorderedItems.map(item => {
      // Find the original item to preserve all data
      const originalItem = quoteItems.find(original => original.id === item.id);
      return originalItem || item;
    });
    setOrderedQuoteItems(updatedItems);
    toast({
      title: "Quote Items Reordered",
      description: "Quote item order updated successfully for PDF generation"
    });
  };

  const quoteSubtotal = quoteItems.reduce((sum, item) => sum + item.total, 0);
  const additionalChargesTotal = additionalCharges
    .filter(c => c.enabled && c.amount > 0)
    .reduce((sum, c) => sum + c.amount, 0);
  const totalAmount = quoteSubtotal + additionalChargesTotal;

  const [isPDFGenerating, setIsPDFGenerating] = useState(false);
  
  const handleDownloadPDF = async () => {
    // Validate quote items first
    if (quoteItems.length === 0) {
      toast({
        title: "No Items",
        description: "Please add items to your quote first",
        variant: "destructive",
      });
      return;
    }

    // Validate customer selection
    if (!selectedCustomer) {
      toast({
        title: "No Client Selected",
        description: "Please select a client from the Client Database before downloading",
        variant: "destructive",
      });
      return;
    }

    // Prevent multiple concurrent requests
    if (isPDFGenerating) {
      return;
    }

    setIsPDFGenerating(true);
    
    const subtotal = quoteItems.reduce((sum, item) => sum + item.total, 0);
    const enabledCharges = additionalCharges.filter(c => c.enabled && c.amount > 0);
    const chargesTotal = enabledCharges.reduce((sum, c) => sum + c.amount, 0);
    const grandTotal = subtotal + chargesTotal;
    const itemsToUse = orderedQuoteItems.length > 0 ? orderedQuoteItems : quoteItems;
    const customerName = `${selectedCustomer.firstName} ${selectedCustomer.lastName}`;
    
    // Retry logic for network failures
    const maxRetries = 2;
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        if (attempt > 0) {
          // Wait before retry
          await new Promise(resolve => setTimeout(resolve, 1000));
          console.log(`PDF download retry attempt ${attempt}...`);
        }
        
        const response = await fetch('/api/generate-pdf-quote', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({
            customerName,
            customerEmail: selectedCustomer?.email || null,
            quoteItems: itemsToUse,
            totalAmount: grandTotal,
            additionalCharges: enabledCharges.map(c => ({
              label: c.label,
              amount: c.amount
            }))
          })
        });
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error('PDF Generation failed:', response.status, errorText);
          throw new Error(`Failed to generate PDF (Error ${response.status})`);
        }
        
        const blob = await response.blob();
        if (blob.size === 0) {
          throw new Error("Received empty PDF");
        }
        
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const safeName = customerName.replace(/[^a-zA-Z0-9]/g, '_');
        a.download = `QuickQuotes_4SGraphics_${new Date().toLocaleDateString().replace(/\//g, '-')}_for_${safeName}.pdf`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        
        logQuoteDownload(`${customerName}_${new Date().toLocaleDateString()}`, 'PDF');
        toast({
          title: "PDF Downloaded",
          description: "Quote PDF has been downloaded successfully",
        });
        
        setIsPDFGenerating(false);
        return; // Success - exit function
        
      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');
        const isNetworkError = lastError.message === 'Failed to fetch' || lastError.message.includes('NetworkError');
        
        // Only retry on network errors
        if (!isNetworkError || attempt === maxRetries) {
          console.error('PDF Generation Error:', error);
          toast({
            title: "PDF Download Failed",
            description: isNetworkError 
              ? "Network connection issue. Please check your internet and try again."
              : lastError.message,
            variant: "destructive",
          });
          setIsPDFGenerating(false);
          return;
        }
      }
    }
  };

  const handleCreateOdooOrder = async () => {
    if (quoteItems.length === 0) {
      toast({
        title: "No Items in Quote",
        description: "Please add items to your quote before creating a sales order",
        variant: "destructive",
      });
      return;
    }

    if (!selectedCustomer) {
      toast({
        title: "No Client Selected",
        description: "Please select a client first before creating an Odoo sales order",
        variant: "destructive",
      });
      return;
    }

    // Check if customer has odooPartnerId
    if (!(selectedCustomer as any).odooPartnerId) {
      toast({
        title: "Customer Not Synced to Odoo",
        description: "This customer needs to be synced to Odoo first. Go to the customer profile and click 'Sync to Odoo'.",
        variant: "destructive",
      });
      return;
    }

    setIsCreatingOdooOrder(true);

    try {
      // Build items array including additional charges
      const productItems = quoteItems.map(item => ({
        itemCode: item.itemCode,
        productName: item.productName,
        quantity: item.quantity,
        pricePerSheet: item.pricePerSheet,
      }));
      
      // Add enabled additional charges as items
      const chargeItems = additionalCharges
        .filter(c => c.enabled && c.amount > 0)
        .map(c => ({
          itemCode: c.odooProductCode,
          productName: c.label,
          quantity: 1,
          pricePerSheet: c.amount,
        }));
      
      const allItems = [...productItems, ...chargeItems];
      
      const response = await fetch('/api/odoo/create-sale-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          items: allItems,
          note: `Quote from QuickQuotes - ${new Date().toLocaleDateString()}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        // Build detailed error message
        let errorMsg = data.error || 'Failed to create sales order';
        if (data.unmappedItems && data.unmappedItems.length > 0) {
          errorMsg += `. Unmapped products: ${data.unmappedItems.slice(0, 5).join(', ')}`;
          if (data.unmappedItems.length > 5) {
            errorMsg += ` and ${data.unmappedItems.length - 5} more`;
          }
        }
        throw new Error(errorMsg);
      }

      toast({
        title: "Sales Order Created!",
        description: data.message || `Order #${data.orderId} created in Odoo`,
      });
      
      // Show warning if some items were skipped
      if (data.unmappedItems && data.unmappedItems.length > 0) {
        toast({
          title: "Some Items Skipped",
          description: `${data.unmappedItems.length} item(s) not mapped to Odoo: ${data.unmappedItems.slice(0, 3).join(', ')}`,
          variant: "destructive",
        });
      }

      // Log activity
      logUserAction('Created Odoo Sales Order', `Order #${data.orderId}`);
      
      // Open the created order in Odoo for user to review/edit
      if (data.orderId) {
        window.open(`https://4sgraphics.odoo.com/web#id=${data.orderId}&model=sale.order&view_type=form`, '_blank');
      }
    } catch (error: any) {
      console.error('Error creating Odoo order:', error);
      toast({
        title: "Failed to Create Order",
        description: error.message || "Could not create sales order in Odoo",
        variant: "destructive",
      });
    } finally {
      setIsCreatingOdooOrder(false);
    }
  };

  const handleEmailQuote = async () => {
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
        title: "No Client Selected",
        description: "Please select a client from the Client Database before emailing the quote",
        variant: "destructive",
      });
      return;
    }

    try {
      // Generate email content
      const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
      
      // Generate quote number - try server first, fallback to client-side
      let quoteNumber: string;
      try {
        const quoteNumberResponse = await fetch('/api/generate-quote-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({})
        });
        
        if (quoteNumberResponse.ok) {
          const data = await quoteNumberResponse.json();
          quoteNumber = data.quoteNumber;
        } else {
          // Fallback to client-side generation
          const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
          quoteNumber = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
        }
      } catch {
        // Fallback to client-side generation if server is unreachable
        const chars = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        quoteNumber = Array.from({ length: 7 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
      }
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
  
  const priceLabel = getPriceColumnHeader(item.size).replace('Price/', '').toLowerCase();
  return `Product Name: ${item.productName}
Product Type: ${item.productType}
Size: ${item.size}
Item Code: ${item.itemCode}
Minimum Order Quantity: ${item.minOrderQty}
Price per ${priceLabel}: $${Number(item.pricePerSheet || 0).toFixed(2)}
Total: $${Number(itemTotal || 0).toFixed(2)}

—————————————`;
}).join('\n\n')}

Total Amount: $${calculatedTotalAmount.toFixed(2)}

We eagerly look forward for your business.

Yours truly
${(user as any)?.email ? (user as any).email.split('@')[0].charAt(0).toUpperCase() + (user as any).email.split('@')[0].slice(1) : '4S Graphics Team'}`;

    // Open email composer popup with quote content
    openEmailComposer({
      to: customerEmail,
      subject: emailSubject,
      body: emailBody,
      customerId: selectedCustomer?.id,
      customerName: customerName,
      usageType: 'quick_quotes',
      variables: {
        'client.name': customerName,
        'client.company': selectedCustomer?.company || '',
        'quote.number': quoteNumber,
        'quote.total': `$${calculatedTotalAmount.toFixed(2)}`,
      }
    });
    
    // Log quote email activity
    logUserAction("Opened email composer for quote", `Quote ${quoteNumber} for ${customerName}`);
    
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to generate quote number for email",
        variant: "destructive",
      });
    }
  };

  // Load filters from localStorage on mount
  useEffect(() => {
    if (!productData.length || filtersInitialized) return;
    
    const storedFilters = localStorage.getItem("quoteCalculatorFilters");
    if (storedFilters) {
      try {
        const filters = JSON.parse(storedFilters);
        let validCategory = "";
        let validType = "";
        let validSize = "";
        
        // Validate and set category
        if (filters.category && categories.includes(filters.category)) {
          validCategory = filters.category;
          setSelectedCategory(filters.category);
        } else if (filters.category) {
          // Category no longer exists, reset all dependent filters
          console.log(`[Filter Validation] Category '${filters.category}' no longer exists, resetting filters`);
          setSelectedCategory("");
          setSelectedType("");
          setSelectedSize("");
          localStorage.removeItem("quoteCalculatorFilters");
        }
        
        // Validate and set type only if category is valid
        if (validCategory && filters.type) {
          const validTypes = productData
            .filter(item => item.productName === validCategory)
            .map(item => item.productType);
          if (validTypes.includes(filters.type)) {
            validType = filters.type;
            setSelectedType(filters.type);
          } else {
            // Type no longer exists for this category, reset
            console.log(`[Filter Validation] Type '${filters.type}' invalid for category, resetting`);
            setSelectedType("");
            setSelectedSize("");
          }
        }
        
        // Validate and set size only if category and type are valid
        if (validCategory && validType && filters.size) {
          const validSizes = productData
            .filter(item => 
              item.productName === validCategory && 
              item.productType === validType
            )
            .map(item => item.size);
          if (validSizes.includes(filters.size)) {
            validSize = filters.size;
            setSelectedSize(filters.size);
          } else {
            // Size no longer exists, reset
            console.log(`[Filter Validation] Size '${filters.size}' invalid, resetting`);
            setSelectedSize("");
          }
        }
        
        // Update stored filters with valid values only
        if (validCategory || validType || validSize) {
          const validFilters = {
            category: validCategory,
            type: validType,
            size: validSize
          };
          localStorage.setItem("quoteCalculatorFilters", JSON.stringify(validFilters));
        } else {
          // No valid filters, remove from storage
          localStorage.removeItem("quoteCalculatorFilters");
        }
      } catch (error) {
        console.error("Failed to load filters from storage:", error);
        localStorage.removeItem("quoteCalculatorFilters");
        setSelectedCategory("");
        setSelectedType("");
        setSelectedSize("");
      }
    }
    setFiltersInitialized(true);
  }, [productData, filtersInitialized]);

  // Save filters to localStorage when they change
  useEffect(() => {
    if (!filtersInitialized) return;
    
    const filters = {
      category: selectedCategory,
      type: selectedType,
      size: selectedSize
    };
    
    if (selectedCategory || selectedType || selectedSize) {
      localStorage.setItem("quoteCalculatorFilters", JSON.stringify(filters));
    }
  }, [selectedCategory, selectedType, selectedSize, filtersInitialized]);

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
      console.group('%c[Quote Calculator Error]', 'color: #ff6b6b; font-weight: bold');
      console.log('Error Type:', errorType);
      console.log('Error Object:', error);
      console.log('Details:', errorDetails);
      console.groupEnd();
    }
    
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quote Calculator</h1>
          <p className="text-gray-600">Configure products and generate quotes</p>
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
    );
  }

  // Handle empty data
  if (!productData || productData.length === 0) {
    return (
      <div className="container mx-auto p-6">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quote Calculator</h1>
          <p className="text-gray-600">Configure products and generate quotes</p>
        </div>
        <EmptyState 
          type="no-data"
          title="No Products Available"
          message="No product data is available. Please contact your administrator to upload product pricing data."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="max-w-full mx-auto">
        {/* Header Section */}
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-1">QuickQuotes</h1>
              <p className="text-gray-500">Configure products and generate professional quotes</p>
            </div>
            <div className="hidden sm:flex items-center gap-3">
              <div className="stat-icon-box">
                <Calculator className="h-5 w-5 stat-icon" />
              </div>
            </div>
          </div>
        </div>

        {/* No Results Banner */}
        {hasNoResults && (
          <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm font-medium text-amber-800">No results with your current filters</span>
              </div>
              <button
                onClick={resetSelections}
                className="px-3 py-1 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors"
              >
                Reset Filters
              </button>
            </div>
            <p className="mt-2 text-sm text-amber-700">
              The selected combination of filters doesn't match any products. Try resetting the filters or selecting different options.
            </p>
          </div>
        )}

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left Panel - Customer & Product Selection */}
        <div className="lg:col-span-1">
          {/* Customer Selection Card */}
          <div className="glass-card mb-6 overflow-visible relative z-30">
            <h3 className="text-sm font-semibold text-gray-800 mb-3 flex items-center gap-2">
              <User className="h-4 w-4 text-indigo-600" />
              Select Customer
            </h3>
            <SearchableCustomerSelect
              selectedCustomer={selectedCustomer}
              onCustomerSelect={setSelectedCustomer}
              placeholder="Search by name, company, or email"
              className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* PDF Sent Prices Reference Panel */}
          {selectedCustomer && sentPricesData?.items && sentPricesData.items.length > 0 && (
            <Collapsible open={sentPricesOpen} onOpenChange={setSentPricesOpen} className="mb-6">
              <div className="glass-card overflow-visible">
                <CollapsibleTrigger className="w-full flex items-center justify-between cursor-pointer group">
                  <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                    <History className="h-4 w-4 text-amber-600" />
                    <span>PDF Sent Prices</span>
                    <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-300 ml-2">
                      {sentPricesData.items.length} items
                    </Badge>
                  </h3>
                  <div className="flex items-center gap-2">
                    {sentPricesData.event && (
                      <span className="text-xs text-gray-500">
                        {new Date(sentPricesData.event.eventDate).toLocaleDateString()}
                      </span>
                    )}
                    {sentPricesOpen ? (
                      <ChevronDown className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                    ) : (
                      <ChevronRight className="h-4 w-4 text-gray-500 group-hover:text-gray-700 transition-colors" />
                    )}
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent className="mt-3">
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-xs text-amber-600 mb-2 flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      These prices were previously sent to this customer. Match them to avoid conflicts.
                    </p>
                    <div className="max-h-48 overflow-y-auto space-y-1.5">
                      {sentPricesData.items.map((item) => (
                        <div key={item.id} className="flex justify-between items-center text-xs py-1 px-2 bg-amber-50/50 rounded">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1">
                              <span className="font-medium text-gray-800 truncate">{item.itemCode}</span>
                              {item.shippingCost && parseFloat(item.shippingCost) > 0 && (
                                <span title="Shipping included">
                                  <Truck className="h-3 w-3 text-amber-600" />
                                </span>
                              )}
                            </div>
                            <span className="text-gray-500 text-[10px]">{item.size}</span>
                          </div>
                          <div className="text-right ml-2 flex items-center gap-1">
                            <DollarSign className="h-3 w-3 text-green-600" />
                            <span className="font-semibold text-green-700">
                              {parseFloat(item.pricePerUnit).toFixed(2)}/unit
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                    {sentPricesData.event?.priceTier && (
                      <div className="mt-2 pt-2 border-t border-gray-100">
                        <span className="text-xs text-gray-500">Tier: </span>
                        <Badge variant="secondary" className="text-[10px]">
                          {sentPricesData.event.priceTier}
                        </Badge>
                      </div>
                    )}
                  </div>
                </CollapsibleContent>
              </div>
            </Collapsible>
          )}

          {/* Product Selection Card */}
          <div className="glass-card mb-6 overflow-visible relative z-20">
            <div className="space-y-6">
              {/* Product Category */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Product Category</label>
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
                <label className="block label-medium text-gray-800">Product Type</label>
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
                  <div className="flex items-center justify-between">
                    <label className="block label-medium text-gray-800">Size</label>
                    <button
                      onClick={() => {
                        setSizeSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                      title={sizeSortOrder === 'desc' ? 'Sorted: Largest first' : 'Sorted: Smallest first'}
                      data-testid="button-sort-size"
                    >
                      <ArrowUpDown className="h-3 w-3" />
                      {sizeSortOrder === 'desc' ? 'Largest first' : 'Smallest first'}
                    </button>
                  </div>
                  <Select 
                    value={selectedSize} 
                    onValueChange={(value) => {
                      setSelectedSize(value);
                      setIsCustomSize(value === 'custom');
                      if (value !== 'custom') {
                        setCustomWidth('');
                        setCustomHeight('');
                      }
                    }}
                  >
                    <SelectTrigger className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white">
                      <SelectValue placeholder="Select size" className="truncate" />
                    </SelectTrigger>
                    <SelectContent className="max-w-none w-auto min-w-[200px]">
                      {availableSizes.map((product, index) => (
                        <SelectItem key={product.itemCode || `${product.size}-${index}`} value={product.itemCode || product.size} className="max-w-none whitespace-nowrap">
                          <span className="whitespace-nowrap">
                            {product.size} ({parseFloat(String(product.totalSqm || 0)).toFixed(4)} m²)
                            {product.itemCode?.includes('SAMPLE') && <span className="ml-1 text-purple-600 font-medium">[SAMPLE]</span>}
                          </span>
                        </SelectItem>
                      ))}
                      {supportsCustomSize(selectedCategory) && (
                        <SelectItem value="custom" className="max-w-none whitespace-nowrap">
                          <span className="whitespace-nowrap font-medium text-purple-600">Custom Size</span>
                        </SelectItem>
                      )}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Custom Size Input */}
              {isCustomSize && selectedType && (
                <div className="space-y-2">
                  <label className="block label-medium text-gray-800">Custom Dimensions (inches)</label>
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      value={customWidth}
                      onChange={(e) => setCustomWidth(e.target.value)}
                      placeholder="Width"
                      className="w-full"
                      min="1"
                      step="0.25"
                    />
                    <span className="text-gray-600">×</span>
                    <Input
                      type="number"
                      value={customHeight}
                      onChange={(e) => setCustomHeight(e.target.value)}
                      placeholder="Height"
                      className="w-full"
                      min="1"
                      step="0.25"
                    />
                  </div>
                  {customWidth && customHeight && (
                    <p className="text-sm text-gray-600">
                      Area: {(parseFloat(customWidth) * parseFloat(customHeight) / 144).toFixed(4)} sq ft
                      ({(parseFloat(customWidth) * parseFloat(customHeight) * 0.00064516).toFixed(4)} m²)
                    </p>
                  )}
                </div>
              )}

              {/* Quantity */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Quantity</label>
                <input
                  type="number"
                  value={quantity}
                  onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                  onFocus={(e) => e.target.select()}
                  onClick={(e) => (e.target as HTMLInputElement).select()}
                  min={isCustomSize ? 1 : (selectedProduct?.minQuantity || 1)}
                  className="w-full rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100"
                  disabled={!selectedSize && !isCustomSize}
                />
                {selectedProduct && quantity < selectedProduct.minQuantity && !isCustomSize && (
                  <p className="text-sm text-red-500">
                    Minimum order quantity: {selectedProduct.minQuantity}
                  </p>
                )}
              </div>

              {/* Reset Button - styled to prevent accidental clicks */}
              <div className="pt-4 mt-4 border-t border-gray-200">
                <button
                  onClick={() => {
                    if (window.confirm('Are you sure you want to reset all selections?')) {
                      resetSelections();
                    }
                  }}
                  className="w-full px-4 py-2 bg-gray-50 hover:bg-gray-100 text-gray-500 hover:text-gray-700 text-xs font-medium rounded-md border border-dashed border-gray-300 transition-colors"
                  type="button"
                >
                  Reset All Selections
                </button>
              </div>
              
              {/* No Results Banner */}
              {hasNoResults && (
                <div className="mt-4 p-4 bg-amber-50 border border-amber-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-amber-600 mt-0.5" />
                    <div className="flex-1">
                      <p className="text-sm font-medium text-amber-900">No results with current filters</p>
                      <p className="text-sm text-amber-700 mt-1">The selected filters don't match any available products.</p>
                      <button
                        onClick={resetSelections}
                        className="mt-2 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-sm font-medium rounded-md transition-colors"
                        type="button"
                      >
                        Reset Filters
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Customer Details & Quote Summary */}
        <div className="xl:col-span-3 lg:col-span-3">
          {/* Customer Details Card */}
          <div className="glass-card mb-6">
            <h2 className="text-lg font-medium text-gray-800 mb-3 flex items-center gap-2">
              <User className="h-5 w-5 text-indigo-600" />
              Customer Details
            </h2>
            {selectedCustomer ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium text-gray-800">
                      {selectedCustomer.firstName} {selectedCustomer.lastName}
                    </span>
                  </div>
                  {selectedCustomer.company && (
                    <div className="flex items-center gap-2">
                      <Building className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedCustomer.company}</span>
                    </div>
                  )}
                  {selectedCustomer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedCustomer.email}</span>
                    </div>
                  )}
                </div>
                <div className="space-y-2">
                  {selectedCustomer.phone && (
                    <div className="flex items-center gap-2">
                      <Phone className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">{selectedCustomer.phone}</span>
                    </div>
                  )}
                  {(selectedCustomer.address1 || selectedCustomer.city || selectedCustomer.province) && (
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-gray-500" />
                      <span className="text-sm text-gray-600">
                        {[selectedCustomer.address1, selectedCustomer.city, selectedCustomer.province].filter(Boolean).join(', ')}
                      </span>
                    </div>
                  )}
                  {selectedCustomer.tags && (
                    <div className="flex items-center gap-2">
                      <Tag className="h-4 w-4 text-indigo-600" />
                      <span className="px-3 py-1 bg-indigo-600 text-white text-sm font-semibold rounded-md shadow-sm">
                        {selectedCustomer.tags}
                      </span>
                    </div>
                  )}
                  {(selectedCustomer as any).sources && (selectedCustomer as any).sources.length > 0 && (
                    <div className="flex items-center gap-3">
                      {(selectedCustomer as any).sources.includes('odoo') && (
                        <span className="px-2 py-0.5 bg-purple-100 text-purple-700 text-xs rounded-full flex items-center gap-1">
                          <Database className="h-3 w-3" /> Odoo
                        </span>
                      )}
                      {(selectedCustomer as any).sources.includes('shopify') && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded-full flex items-center gap-1">
                          <ShoppingCart className="h-3 w-3" /> Shopify
                        </span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-4 text-gray-500">
                <User className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p className="text-sm">Select a customer to view details</p>
              </div>
            )}
          </div>

          {/* Active Issues Warning Bar */}
          {selectedCustomer && activeIssues.length > 0 && (
            <div className="mb-4 p-4 bg-red-50 border-2 border-red-500 rounded-lg" data-testid="issue-warning-bar">
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1">
                  <h3 className="font-semibold text-red-700 mb-1">Active Issues - Tread Carefully</h3>
                  <div className="space-y-1">
                    {activeIssues.map(issue => (
                      <div key={issue.id} className="flex items-center gap-2 text-sm text-red-600">
                        <span className="font-medium uppercase">ISSUE: {issue.objectionType}</span>
                        {issue.categoryName && (
                          <span className="text-red-500">({issue.categoryName})</span>
                        )}
                        {issue.details && (
                          <span className="text-red-400">- {issue.details}</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Quote Summary Card */}
          <div className="glass-card mb-6 relative overflow-hidden">
            {/* SAMPLE PACK Watermark - shows when Min Order Qty is 5 Sheets */}
            {selectedProduct && selectedProduct.minQuantity === 5 && !isRollFormat(selectedProduct.size) && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
                <div 
                  className="text-6xl font-bold text-red-500/20 transform -rotate-30 whitespace-nowrap select-none"
                  style={{ transform: 'rotate(-30deg)' }}
                >
                  SAMPLE PACK
                </div>
              </div>
            )}
            <h2 className="heading-secondary text-gray-800 mb-2">Quote Summary</h2>
            <p className="body-small text-gray-500 mb-6">Using default pricing</p>
            <div>
            {(selectedProduct || (isCustomSize && customWidth && customHeight)) ? (
              <div className="space-y-4">
                {/* Product Details Summary */}
                <div className="space-y-2 pb-4 border-b border-gray-200">
                  <div className="flex justify-between items-center">
                    <span className="body-small text-gray-600">Product Brand:</span>
                    <span className="flex items-center gap-1">
                      {selectedCategory && (() => {
                        const IconComponent = getProductIcon(selectedCategory);
                        const iconColor = getProductIconColor(selectedCategory);
                        return <IconComponent className={`h-4 w-4 ${iconColor}`} />;
                      })()}
                      {!selectedCategory && <FileText className="h-4 w-4 text-gray-600" />}
                      <span className="body-small text-gray-800">
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
                    <span className="body-small text-gray-600">Product Type:</span>
                    <span className="text-sm text-gray-800">
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
                    <span className="text-sm text-gray-600">Product Size:</span>
                    <span className="text-sm text-gray-800">
                      {isCustomSize ? `${customWidth}" × ${customHeight}"` : (selectedSize || 'Not Selected')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">SKU:</span>
                    <span className="text-sm text-gray-800 font-mono">
                      {isCustomSize ? 'CUSTOM' : (selectedProduct?.itemCode || 'Not Selected')}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Sqm:</span>
                    <span className="text-sm text-gray-800">
                      {isCustomSize && customWidth && customHeight ? 
                        `${(parseFloat(customWidth) * parseFloat(customHeight) * 0.00064516).toFixed(4)} sqm` :
                        (selectedProduct ? 
                          `${parseFloat(String(selectedProduct.totalSqm || 0)).toFixed(4)} sqm` : 
                          'Not Calculated'
                        )
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-sm text-gray-600">Total Quantity:</span>
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
                    <span className="text-sm text-gray-600">Min. Order Qty:</span>
                    <span className="text-sm text-gray-800">
                      {isCustomSize ? '1 Sheet' : 
                        (selectedProduct ? 
                          `${selectedProduct.minQuantity} ${selectedProduct.rollSheet === 'Roll' ? 'Roll' : 'Sheets'}` : 
                          'Not Available'
                        )
                      }
                    </span>
                  </div>
                  {/* Available Stock from Odoo - Larger/More Prominent */}
                  {selectedProduct && !isCustomSize && (
                    <div className="flex justify-between items-center pt-2 mt-2 border-t border-gray-100">
                      <span className="text-base font-medium text-gray-700 flex items-center gap-1.5">
                        <Package className="h-4 w-4" />
                        Available Stock:
                      </span>
                      <span className="flex items-center gap-2">
                        {inventoryLoading ? (
                          <span className="flex items-center gap-1 text-base text-gray-500">
                            <Loader2 className="h-4 w-4 animate-spin" />
                            Loading...
                          </span>
                        ) : inventoryData ? (
                          <span className={`text-lg font-bold ${
                            inventoryData.qtyAvailable > 0 ? 'text-green-600' : 'text-red-500'
                          }`}>
                            {Math.floor(inventoryData.qtyAvailable)}
                          </span>
                        ) : (
                          <span className="text-base text-gray-400">Unavailable</span>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 w-6 p-0"
                          onClick={() => refetchInventory()}
                          disabled={inventoryLoading}
                          title="Sync inventory from Odoo"
                        >
                          <RefreshCw className={`h-4 w-4 ${inventoryLoading ? 'animate-spin' : ''}`} />
                        </Button>
                        {inventoryData?.odooUrl && (
                          <a
                            href={inventoryData.odooUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-[#875A7B] hover:text-[#6B4563] transition-colors"
                            title="Open in Odoo"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        )}
                      </span>
                    </div>
                  )}
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
                      // Only show $/m² column for admin and manager users
                      ...(['admin', 'manager'].includes((user as any)?.role) ? [{ 
                        key: 'pricePerSqM', 
                        title: '$/m²', 
                        weight: 1,
                        minWidth: 80,
                        align: 'center' as const
                      }] : []),
                      { 
                        key: 'pricePerSheet', 
                        title: isCustomSize ? 'Price/Sheet' : (selectedProduct ? getPriceColumnHeader(selectedProduct.size) : 'Price/Sheet'), 
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
                      // For custom sizes, get a reference product to determine pricing per m²
                      let price: number;
                      let totalSqm: number;
                      let minQty: number;
                      
                      if (isCustomSize && customWidth && customHeight) {
                        // Get first available product from same category and type for pricing reference
                        const referenceProduct = availableSizes[0];
                        if (!referenceProduct) return null;
                        
                        const rawPrice = referenceProduct[tier.key as keyof ProductData] as number;
                        price = rawPrice || 0; // Default to 0 if no price data
                        totalSqm = parseFloat(customWidth) * parseFloat(customHeight) * 0.00064516;
                        minQty = 1; // Custom sizes have min quantity of 1
                      } else if (selectedProduct) {
                        const rawPrice = selectedProduct[tier.key as keyof ProductData] as number;
                        price = rawPrice || 0; // Default to 0 if no price data
                        totalSqm = parseFloat(String(selectedProduct.totalSqm || 0));
                        minQty = selectedProduct.minQuantity || 1;
                      } else {
                        return null;
                      }
                      
                      // For products sold in packs (minQty > 1), totalSqm represents the entire pack
                      // Divide by minQty to get the per-unit (per-sheet) price
                      const pricePerSheet = (price * totalSqm) / minQty;
                      const useQuantity = Math.max(quantity, minQty);
                      
                      // Apply retail rounding for RETAIL tier only to Min Order Qty Price (total)
                      const isRetailTier = tier.key === 'retailPrice';
                      const rawTotal = pricePerSheet * useQuantity;
                      const total = applyRetailRounding(rawTotal, isRetailTier);
                      
                      return {
                        tier: tier,
                        price: price,
                        pricePerSheet: pricePerSheet,
                        total: total,
                        tierKey: tier.key
                      };
                    }).filter(item => item !== null)}
                    renderCell={(item, column) => {
                      const isLandedPrice = item.tierKey === 'landedPrice';
                      const isAdmin = (user as any)?.role === 'admin';
                      const showLandedPrice = !isLandedPrice || (isAdmin && landedPriceRevealed);
                      
                      switch (column.key) {
                        case 'tier':
                          const isTagMatch = item.tierKey === matchingTier;
                          const isSuggested = item.tierKey === suggestedTier;
                          return (
                            <div className="flex items-center gap-2">
                              <span className="text-sm text-gray-800 uppercase font-medium">
                                {item.tier.label}
                              </span>
                              {isTagMatch && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-yellow-400 text-yellow-900 text-xs font-medium rounded">
                                  <Tag className="h-3 w-3" />
                                  Match
                                </span>
                              )}
                              {isSuggested && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-blue-100 text-blue-700 text-xs font-medium rounded">
                                  <Sparkles className="h-3 w-3" />
                                  Suggested
                                </span>
                              )}
                            </div>
                          );
                        case 'pricePerSqM':
                          // Only show for admin users (column is conditionally included)
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-600">
                              ${Number(item.price || 0).toFixed(2)}
                            </span>
                          );
                        case 'pricePerSheet':
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-600">
                              ${Number(item.pricePerSheet || 0).toFixed(2)}
                            </span>
                          );
                        case 'minOrderQtyPrice':
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-800 font-medium">
                              ${Number(item.total || 0).toFixed(2)}
                            </span>
                          );
                        case 'add':
                          // Show eye icon for Landed Price tier (admin only)
                          if (isLandedPrice && isAdmin) {
                            return (
                              <div className="flex items-center justify-center gap-2">
                                <button
                                  onClick={() => setLandedPriceRevealed(!landedPriceRevealed)}
                                  className="w-6 h-6 rounded-md border flex items-center justify-center transition-colors mx-auto border-purple-300 bg-purple-50 hover:bg-purple-100"
                                  title={landedPriceRevealed ? "Hide landed price" : "Reveal landed price"}
                                >
                                  {landedPriceRevealed ? (
                                    <EyeOff className="h-3 w-3 text-purple-600" />
                                  ) : (
                                    <Eye className="h-3 w-3 text-purple-600" />
                                  )}
                                </button>
                                {landedPriceRevealed && quoteItems.length > 0 && (() => {
                                  const selectedItem = quoteItems[quoteItems.length - 1];
                                  if (selectedItem && item.pricePerSheet > 0) {
                                    const margin = ((selectedItem.pricePerSheet - item.pricePerSheet) / selectedItem.pricePerSheet) * 100;
                                    return (
                                      <span className={`text-xs font-medium ${margin >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                        {margin >= 0 ? '+' : ''}{margin.toFixed(1)}%
                                      </span>
                                    );
                                  }
                                  return null;
                                })()}
                              </div>
                            );
                          }
                          // Non-admin Landed Price - show nothing
                          if (isLandedPrice) {
                            return null;
                          }
                          const isAlreadySelected = isTierAlreadySelected(item.tierKey);
                          return (
                            <button
                              onClick={() => addToQuote(item.tierKey)}
                              disabled={isAlreadySelected}
                              className={`w-6 h-6 rounded-md border flex items-center justify-center transition-colors mx-auto ${
                                isAlreadySelected 
                                  ? 'border-green-300 bg-green-50 cursor-not-allowed' 
                                  : 'border-gray-300 bg-white hover:bg-gray-100'
                              }`}
                            >
                              {isAlreadySelected ? (
                                <Check className="h-3 w-3 text-green-600" />
                              ) : (
                                <Plus className="h-3 w-3 text-gray-600" />
                              )}
                            </button>
                          );
                        default:
                          return null;
                      }
                    }}
                    getRowClassName={(item) => {
                      if (item.tierKey === matchingTier) {
                        return 'bg-yellow-200 hover:bg-yellow-300';
                      }
                      if (item.tierKey === suggestedTier) {
                        return 'bg-blue-50 hover:bg-blue-100 border-l-4 border-l-blue-400';
                      }
                      return '';
                    }}
                    maxHeight="600px"
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

      {/* Quote Items - Odoo Style */}
      {quoteItems.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg shadow-sm mb-6">
          {/* Odoo-style tab header */}
          <div className="border-b border-gray-200">
            <div className="flex items-center justify-between px-4">
              <div className="flex">
                <div className="px-4 py-3 border-b-2 border-teal-600 text-teal-700 text-sm font-medium">
                  Order Lines
                </div>
                <button
                  className="px-4 py-3 text-gray-500 hover:text-gray-700 text-sm font-medium transition-colors"
                  onClick={() => setShowAdditionalCharges(!showAdditionalCharges)}
                >
                  Other Info
                </button>
              </div>
              <ProductOrderingDialog
                items={quoteItems.map(item => ({
                  id: item.id,
                  productType: item.productType,
                  size: item.size,
                  itemCode: item.itemCode,
                  pricePerSheet: item.pricePerSheet,
                  total: item.total,
                  quantity: item.quantity
                }))}
                onReorder={handleQuoteItemReorder}
                title="Reorder Quote Items"
                description="Change the order of quote items for PDF generation based on customer requests"
                trigger={
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-gray-500 hover:text-gray-700"
                  >
                    <ArrowUpDown className="h-4 w-4" />
                  </Button>
                }
              />
            </div>
          </div>
          
          {/* Table content area with padding */}
          <div className="px-4 py-3">
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
                  title: 'Price/Unit', 
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
                    const displayCode = item.odooItemCode || item.itemCode;
                    return (
                      <div className="min-w-0">
                        <div className="text-sm text-gray-800 font-medium whitespace-nowrap overflow-hidden text-ellipsis" title={item.productName}>{item.productName}</div>
                        <div className="text-xs text-gray-500 whitespace-nowrap overflow-hidden text-ellipsis" title={item.productType}>{item.productType}</div>
                        <div className="text-xs text-gray-400 whitespace-nowrap overflow-hidden text-ellipsis" title={displayCode}>{displayCode}</div>
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
                    return (
                      <Input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => {
                          const newQuantity = parseInt(e.target.value) || 1;
                          updateQuoteItemQuantity(item.id, newQuantity);
                        }}
                        className="w-16 h-7 text-sm text-center border-gray-300 focus:border-blue-500 focus:ring-1 focus:ring-blue-500"
                      />
                    );
                  case 'pricePerSqM':
                    return <span className="text-sm text-gray-600">${Number(item.pricePerSqM || 0).toFixed(2)}</span>;
                  case 'pricePerSheet':
                    // Determine unit based on minimum order quantity
                    const unitLabel = item.minOrderQty === 1 ? 'roll' : 'sheet';
                    return (
                      <div className="text-right">
                        <span className="text-sm text-gray-600">${Number(item.pricePerSheet || 0).toFixed(2)}</span>
                        <div className="text-xs text-gray-400">/{unitLabel}</div>
                      </div>
                    );
                  case 'total':
                    return <span className="text-sm text-gray-800 font-medium">${Number(item.total || 0).toFixed(2)}</span>;
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

            {/* Additional Charges Section */}
            <div className="mt-4 border border-gray-200 rounded-lg overflow-hidden">
              <button
                onClick={() => setShowAdditionalCharges(!showAdditionalCharges)}
                className="w-full flex items-center justify-between px-4 py-3 bg-gray-50 hover:bg-gray-100 transition-colors"
                data-testid="btn-toggle-additional-charges"
              >
                <span className="text-sm font-medium text-gray-700 flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Additional Charges (CC Fee / Shipping)
                  {additionalChargesTotal > 0 && (
                    <span className="ml-2 px-2 py-0.5 bg-purple-100 text-purple-700 rounded text-xs">
                      +${additionalChargesTotal.toFixed(2)}
                    </span>
                  )}
                </span>
                <ChevronDown className={`h-4 w-4 text-gray-500 transition-transform ${showAdditionalCharges ? 'rotate-180' : ''}`} />
              </button>
              
              {showAdditionalCharges && (
                <div className="p-4 space-y-3 bg-white">
                  {additionalCharges.map((charge) => (
                    <div key={charge.id} className="flex items-center gap-4">
                      <input
                        type="checkbox"
                        checked={charge.enabled}
                        onChange={(e) => {
                          setAdditionalCharges(prev => prev.map(c => 
                            c.id === charge.id ? { ...c, enabled: e.target.checked } : c
                          ));
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                        data-testid={`checkbox-charge-${charge.id}`}
                      />
                      <div className="flex-1 grid grid-cols-3 gap-3">
                        <div>
                          <label className="text-xs text-gray-500">Label</label>
                          <Input
                            value={charge.label}
                            onChange={(e) => {
                              setAdditionalCharges(prev => prev.map(c => 
                                c.id === charge.id ? { ...c, label: e.target.value } : c
                              ));
                            }}
                            className="h-8 text-sm"
                            placeholder="Charge name"
                            data-testid={`input-charge-label-${charge.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Odoo Product Code</label>
                          <Input
                            value={charge.odooProductCode}
                            onChange={(e) => {
                              setAdditionalCharges(prev => prev.map(c => 
                                c.id === charge.id ? { ...c, odooProductCode: e.target.value } : c
                              ));
                            }}
                            className="h-8 text-sm font-mono"
                            placeholder="e.g. CC-FEE"
                            data-testid={`input-charge-code-${charge.id}`}
                          />
                        </div>
                        <div>
                          <label className="text-xs text-gray-500">Amount ($)</label>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={charge.amount || ''}
                            onChange={(e) => {
                              setAdditionalCharges(prev => prev.map(c => 
                                c.id === charge.id ? { ...c, amount: parseFloat(e.target.value) || 0 } : c
                              ));
                            }}
                            className="h-8 text-sm"
                            placeholder="0.00"
                            data-testid={`input-charge-amount-${charge.id}`}
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                  <p className="text-xs text-gray-500 mt-2">
                    These charges use Odoo product codes. Ensure the codes exist in Odoo for the sales order to include them.
                  </p>
                </div>
              )}
            </div>

            {/* Odoo-style footer section */}
            <div className="border-t border-gray-200 bg-gray-50/50">
              <div className="flex justify-between items-start px-6 py-4">
                {/* Left side - Action buttons row */}
                <div className="flex items-center gap-3">
                  <button
                    onClick={() => {
                      if (!selectedCustomer) {
                        toast({
                          title: "Please select a client first 😊",
                          description: "Choose a client from the Customer Selection section above before downloading the PDF.",
                        });
                        return;
                      }
                      handleDownloadPDF();
                    }}
                    disabled={isPDFGenerating || !selectedCustomer}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Download className="h-4 w-4" />
                    {isPDFGenerating ? 'Generating...' : 'Download PDF'}
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedCustomer) {
                        toast({
                          title: "Please select a client first 😊",
                          description: "Choose a client from the Customer Selection section above before sending an email.",
                        });
                        return;
                      }
                      handleEmailQuote();
                    }}
                    disabled={!selectedCustomer}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-gray-600 text-white text-sm font-medium hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </button>
                  <button
                    onClick={() => {
                      if (!selectedCustomer) {
                        toast({
                          title: "Please select a client first 😊",
                          description: "Choose a client from the Customer Selection section above before creating a sales order.",
                        });
                        return;
                      }
                      handleCreateOdooOrder();
                    }}
                    disabled={!selectedCustomer || isCreatingOdooOrder || quoteItems.length === 0}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded bg-purple-600 text-white text-sm font-medium hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    data-testid="btn-create-odoo-order"
                  >
                    {isCreatingOdooOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {isCreatingOdooOrder ? 'Creating...' : 'Sales Order'}
                  </button>
                </div>
                
                {/* Right side - Odoo-style totals */}
                <div className="text-right space-y-1">
                  {additionalChargesTotal > 0 && (
                    <>
                      <div className="flex justify-end items-center gap-4">
                        <span className="text-sm text-gray-600">Untaxed Amount:</span>
                        <span className="text-sm font-medium text-gray-900 w-24 text-right">${quoteSubtotal.toFixed(2)}</span>
                      </div>
                      <div className="flex justify-end items-center gap-4">
                        <span className="text-sm text-gray-600">+ Charges:</span>
                        <span className="text-sm font-medium text-gray-900 w-24 text-right">${additionalChargesTotal.toFixed(2)}</span>
                      </div>
                    </>
                  )}
                  <div className="flex justify-end items-center gap-4 pt-1 border-t border-gray-300">
                    <span className="text-sm font-medium text-gray-800">Total:</span>
                    <span className="text-lg font-bold text-gray-900 w-24 text-right">${totalAmount.toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
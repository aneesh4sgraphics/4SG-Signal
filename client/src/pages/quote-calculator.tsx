import { useState, useEffect, useMemo } from "react";
import { useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, Mail, Calculator, Building, Phone, MapPin, User, FileText, Film, Palette, Layers, Paintbrush, Image, Printer, Frame, Monitor, Zap, ArrowUpDown, Check, AlertTriangle, Tag, ShoppingCart, Database, Eye, EyeOff, Sparkles, ChevronDown, ChevronRight, History, DollarSign, Truck, Send, Loader2, RefreshCw, Package, ExternalLink, ChevronsUpDown, Info, HelpCircle, Save } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import SearchableCustomerSelect from "@/components/SearchableCustomerSelect";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { getUserRoleFromEmail, canAccessTier } from "@/utils/roleBasedTiers";
import { useAuth } from "@/hooks/useAuth";
import { AdaptiveTable } from "@/components/OdooTable";
import { getPriceColumnHeader } from "@/utils/sizeUtils";
import ProductOrderingDialog from "@/components/ProductOrderingDialog";
import { EmptyState, getErrorType, getErrorMessage, getErrorDetails } from "@/components/EmptyState";
import { ApiError, apiRequest, queryClient } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useEmailComposer } from "@/components/email-composer";
import { ALLOWED_CATEGORIES } from "@/lib/productCategories";
import { PRICING_TIERS } from "@shared/schema";
import { getSalesRepDisplayName } from "@/lib/utils";

function getGraffitiPolyesterGroup(t: string): number {
  const lc = t.toLowerCase();
  if (lc.includes('luster') || lc.includes('lustre')) return 5;
  if (lc.includes('frosted')) return 4;
  if (lc.includes('clear')) return 3;
  if (lc.includes('backlit')) return 2;
  if (lc.includes('metallic') || lc.includes('film - gold') || lc.includes('film - silver') || lc.includes('film - rose') || lc.includes('film - mirror') || lc.includes('dual metallic')) return 1;
  if (lc.includes('graffiti polyester') || lc.includes('polyester')) return 0;
  return 6;
}

function getMetallicColorOrder(t: string): number {
  const lc = t.toLowerCase();
  if (lc.includes('gold')) return 0;
  if (lc.includes('silver')) return 1;
  if (lc.includes('rose')) return 2;
  if (lc.includes('mirror')) return 3;
  if (lc.includes('dual')) return 4;
  return 5;
}

function getMilThickness(t: string): number {
  const m = t.match(/(\d+(?:\.\d+)?)\s*mil/i);
  return m ? parseFloat(m[1]) : 999;
}

function sortGraffitiPolyesterTypes(types: string[]): string[] {
  return [...types].sort((a, b) => {
    const groupA = getGraffitiPolyesterGroup(a);
    const groupB = getGraffitiPolyesterGroup(b);
    if (groupA !== groupB) return groupA - groupB;
    if (groupA === 1) {
      const colorA = getMetallicColorOrder(a);
      const colorB = getMetallicColorOrder(b);
      if (colorA !== colorB) return colorA - colorB;
    }
    const milA = getMilThickness(a);
    const milB = getMilThickness(b);
    if (milA !== milB) return milA - milB;
    return a.localeCompare(b);
  });
}

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
  email2?: string;
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
  pricingTier?: string | null;
  salesRepName?: string | null;
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
  percentage?: number; // For credit card fee percentage calculation
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
  const [landedPriceRevealed, setLandedPriceRevealed] = useState<boolean>(false);
  const [sentPricesOpen, setSentPricesOpen] = useState<boolean>(false);
  const [isCreatingOdooOrder, setIsCreatingOdooOrder] = useState(false);
  const [isCreatingShopifyDraft, setIsCreatingShopifyDraft] = useState(false);
  const [isSavingQuote, setIsSavingQuote] = useState(false);
  const [emailSelectDialogOpen, setEmailSelectDialogOpen] = useState(false);
  const [emailSelectAction, setEmailSelectAction] = useState<'set_primary' | 'fix_missing' | null>(null);
  const [selectedEmail, setSelectedEmail] = useState<string>('');
  const [skuValidationDialogOpen, setSkuValidationDialogOpen] = useState(false);
  const [unmappedSkus, setUnmappedSkus] = useState<{ sku: string; name: string }[]>([]);
  const [isValidatingSkus, setIsValidatingSkus] = useState(false);
  const [pendingCustomer, setPendingCustomer] = useState<Customer | null>(null);
  const [availableContactEmails, setAvailableContactEmails] = useState<{ email: string; source: string }[]>([]);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [emailDropdownOpen, setEmailDropdownOpen] = useState(false);
  const [additionalCharges, setAdditionalCharges] = useState<AdditionalCharge[]>([
    { id: 'cc', type: 'credit_card', label: 'Credit Card Fee (4.5%)', odooProductCode: 'CC-FEE', amount: 0, enabled: true, percentage: 4.5 },
    { id: 'ship', type: 'shipping', label: 'Shipping Cost', odooProductCode: 'SHIPPING', amount: 55, enabled: true },
  ]);
  const [showAdditionalCharges, setShowAdditionalCharges] = useState(false);
  const [showCustomerGateDialog, setShowCustomerGateDialog] = useState(false);
  const [gatePricingTier, setGatePricingTier] = useState("");
  const [gateSalesRep, setGateSalesRep] = useState("");
  const [gateCustomer, setGateCustomer] = useState<Customer | null>(null);
  const [showBestPriceHelpDialog, setShowBestPriceHelpDialog] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user, isLoading: isAuthLoading, isAuthenticated } = useAuth();
  const { logPageView, logQuoteGeneration, logQuoteDownload, logUserAction } = useActivityLogger();
  const { open: openEmailComposer } = useEmailComposer();
  const [location] = useLocation();

  // Fetch sales reps from unified endpoint for gate dialog
  const { data: salesRepsData, isLoading: isLoadingSalesReps } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ["/api/sales-reps"],
    staleTime: 5 * 60 * 1000,
    retry: 2,
  });

  // Sort sales reps by name for dropdown
  const sortedSalesReps = useMemo(() => {
    if (!salesRepsData) return [];
    return [...salesRepsData].sort((a, b) => a.name.localeCompare(b.name));
  }, [salesRepsData]);

  // Mutation to update customer's primary email
  const updatePrimaryEmailMutation = useMutation({
    mutationFn: async ({ customerId, email }: { customerId: string; email: string }) => {
      const res = await fetch(`/api/customers/${customerId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email }),
      });
      if (!res.ok) throw new Error('Failed to update email');
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      if (selectedCustomer) {
        setSelectedCustomer({ ...selectedCustomer, email: data.email });
      }
      setEmailDropdownOpen(false);
      toast({ title: "Success", description: "Primary email updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message || "Failed to update email", variant: "destructive" });
    },
  });

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
    setSelectedCustomer(null);
    setAvailableContactEmails([]);
    setQuoteItems([]);
    // Clear stored filters
    localStorage.removeItem("quoteCalculatorFilters");
    toast({
      title: "Selections Reset",
      description: "All filters and customer selection have been cleared",
    });
  };

  // Handle category change - reset dependent fields to avoid mismatched selections
  const handleCategoryChange = (newCategory: string) => {
    setSelectedCategory(newCategory);
    setSelectedType("");
    setSelectedSize("");
    setQuantity(1);
    setIsCustomSize(false);
    setCustomWidth("");
    setCustomHeight("");
  };
  
  // Get user role and filter pricing tiers accordingly
  // Use role from user object directly, fallback to email-based detection
  const userRole = (user as any)?.role || getUserRoleFromEmail((user as any)?.email || '');
  const userAllowedTiers = (user as any)?.allowedTiers as string[] | null | undefined;
  
  // Filter tiers based on user's allowed tiers if set, otherwise use role-based access
  const basePricingTiers = allPricingTiers.filter(tier => {
    if (userAllowedTiers && userAllowedTiers.length > 0) {
      return userAllowedTiers.includes(tier.key);
    }
    return canAccessTier(tier.label, userRole);
  });

  // Check if customer has a pricing tier assigned or tags match a pricing tier label
  // Uses allPricingTiers (not user-filtered) to ensure customer tiers are always recognized
  const getMatchingTierFromTags = (): string | null => {
    if (!selectedCustomer) return null;
    
    // First check the dedicated pricingTier field (highest priority)
    const customerPricingTier = (selectedCustomer as any).pricingTier;
    if (customerPricingTier) {
      // Find the tier that matches by label or key - use ALL tiers, not filtered
      for (const tier of allPricingTiers) {
        if (tier.label.toLowerCase() === customerPricingTier.toLowerCase() ||
            tier.key.toLowerCase() === customerPricingTier.toLowerCase()) {
          return tier.key;
        }
      }
    }
    
    // Fallback to checking tags - use ALL tiers to ensure recognition
    if (!selectedCustomer?.tags) return null;
    const customerTags = selectedCustomer.tags.toLowerCase().split(',').map((t: string) => t.trim());
    
    for (const tier of allPricingTiers) {
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

  const pricingTiers = useMemo(() => {
    if (!matchingTier) return basePricingTiers;
    const alreadyIncluded = basePricingTiers.some(t => t.key === matchingTier);
    if (alreadyIncluded) return basePricingTiers;
    const customerTierDef = allPricingTiers.find(t => t.key === matchingTier);
    if (!customerTierDef) return basePricingTiers;
    const insertIndex = allPricingTiers.indexOf(customerTierDef);
    const result = [...basePricingTiers];
    let pos = 0;
    for (let i = 0; i < result.length; i++) {
      const idx = allPricingTiers.findIndex(t => t.key === result[i].key);
      if (idx < insertIndex) pos = i + 1;
    }
    result.splice(pos, 0, customerTierDef);
    return result;
  }, [basePricingTiers, matchingTier]);

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
  const { data: _pricingRaw, isLoading, error, refetch } = useQuery<{ data: ProductData[] }>({
    queryKey: ['/api/product-pricing-database'],
    enabled: !isAuthLoading && isAuthenticated,
  });
  const productData: ProductData[] = _pricingRaw?.data ?? [];

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
    const unique = Array.from(new Set(typesInCategory)) as string[];
    if (selectedCategory === 'Graffiti Polyester Paper') {
      return sortGraffitiPolyesterTypes(unique);
    }
    return unique.sort();
  })();

  // Get sizes for selected type with sorting (deduplicated by physical size)
  const availableSizes = selectedCategory && selectedType
    ? (() => {
        const filtered = productData.filter(item => 
          item.productType === selectedType &&
          !item.itemCode?.toUpperCase().endsWith('-ARCH')
        ).sort((a, b) => {
          const sqmA = parseFloat(String(a.totalSqm || 0));
          const sqmB = parseFloat(String(b.totalSqm || 0));
          return sqmA - sqmB; // always ascending by square meters
        });
        // Deduplicate by physical size — keep the record that has pricing data
        const sizeMap = new Map<string, typeof filtered[0]>();
        for (const item of filtered) {
          // Normalize the size string as the key (e.g. "23x29", "23 x 29", "23X29" all → "23x29")
          const normalizedSize = (item.size || '').toLowerCase().replace(/\s+/g, '').replace(/x/g, 'x');
          const existing = sizeMap.get(normalizedSize);
          if (!existing) {
            sizeMap.set(normalizedSize, item);
          } else {
            // Prefer the record that has actual pricing data over $0 records
            const existingHasPrice = parseFloat(String(existing.dealerPrice || 0)) > 0 || parseFloat(String(existing.retailPrice || 0)) > 0;
            const itemHasPrice = parseFloat(String(item.dealerPrice || 0)) > 0 || parseFloat(String(item.retailPrice || 0)) > 0;
            if (!existingHasPrice && itemHasPrice) {
              sizeMap.set(normalizedSize, item);
            } else if (existingHasPrice && itemHasPrice) {
              // Both have pricing — prefer the larger sqm (main carton over sample pack)
              const existingSqm = parseFloat(String(existing.totalSqm || 0));
              const itemSqm = parseFloat(String(item.totalSqm || 0));
              if (itemSqm > existingSqm) {
                sizeMap.set(normalizedSize, item);
              }
            }
          }
        }
        return Array.from(sizeMap.values());
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

  // Fetch Best Price recommendation when customer and product are selected
  const { data: bestPriceData, isLoading: bestPriceLoading } = useQuery<{
    recommendedPrice: number;
    priceRange: { floor: number; ceiling: number };
    factors: Array<{ name: string; impact: string; adjustment: number; description: string }>;
    confidence: 'high' | 'medium' | 'low';
    rationale: string;
    unitType: 'sheet' | 'roll' | 'unit';
    productInfo: {
      productName: string;
      size: string;
      minOrderQty: number | null;
      itemCode: string;
    };
    tierComparison: {
      customerTier: string;
      tierPrice: number;
      savings: number;
      savingsPercent: number;
      recommendation: string;
    } | null;
  }>({
    queryKey: ['/api/best-price', selectedProduct?.id, selectedCustomer?.id, quantity],
    queryFn: async () => {
      if (!selectedProduct?.id) return null;
      const response = await fetch('/api/best-price', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          productId: selectedProduct.id,
          customerId: selectedCustomer?.id,
          quantity,
        }),
      });
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!selectedProduct?.id && !isCustomSize,
    staleTime: 30000,
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
  
  // Auto-calculate credit card fee based on percentage
  useEffect(() => {
    setAdditionalCharges(prev => prev.map(charge => {
      if (charge.type === 'credit_card' && charge.percentage) {
        const ccAmount = (quoteSubtotal + (prev.find(c => c.type === 'shipping' && c.enabled)?.amount || 0)) * (charge.percentage / 100);
        return { ...charge, amount: Math.round(ccAmount * 100) / 100 };
      }
      return charge;
    }));
  }, [quoteSubtotal]);
  
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
            customerCompany: selectedCustomer?.company || null,
            customerAddress: {
              address1: selectedCustomer?.address1 || '',
              address2: selectedCustomer?.address2 || '',
              city: selectedCustomer?.city || '',
              province: selectedCustomer?.province || '',
              country: selectedCustomer?.country || '',
              zip: selectedCustomer?.zip || '',
              phone: selectedCustomer?.phone || ''
            },
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

  // Helper to get all available emails for a customer
  const getCustomerEmails = (customer: Customer | null): string[] => {
    if (!customer) return [];
    const emails: string[] = [];
    if (customer.email) emails.push(customer.email);
    if (customer.email2) emails.push(customer.email2);
    return emails;
  };

  // Check if email is missing or invalid
  const isEmailMissing = (email: string | null | undefined): boolean => {
    if (!email) return true;
    const trimmed = email.trim().toLowerCase();
    return trimmed === '' || 
           trimmed === 'n/a' || 
           trimmed === 'na' || 
           trimmed === 'none' || 
           trimmed === '-' || 
           !email.includes('@');
  };

  // Fetch contact emails for a customer
  const fetchContactEmails = async (customerId: string): Promise<{ email: string; source: string }[]> => {
    const emails: { email: string; source: string }[] = [];
    
    try {
      // Fetch customer contacts
      const contactsRes = await fetch(`/api/crm/customer-contacts?customerId=${customerId}`, { credentials: 'include' });
      if (contactsRes.ok) {
        const contacts = await contactsRes.json();
        for (const c of contacts) {
          if (c.email && c.email.includes('@')) {
            emails.push({ email: c.email, source: c.name || 'Contact' });
          }
        }
      }
    } catch (err) {
      console.error('Error fetching contacts:', err);
    }
    
    // Deduplicate by email
    return emails.filter((e, i, arr) => 
      arr.findIndex(x => x.email.toLowerCase() === e.email.toLowerCase()) === i
    );
  };

  // Handle customer selection - check for multiple emails and prompt if needed
  const handleCustomerSelect = async (customer: Customer | null) => {
    if (!customer) {
      setSelectedCustomer(null);
      setAvailableContactEmails([]);
      return;
    }

    // Create an enriched customer that inherits from parent company if needed
    let enrichedCustomer = { ...customer };
    
    // If this is a contact (not a company) with a parent, inherit missing data from parent
    const parentCustomerId = (customer as any).parentCustomerId;
    if (parentCustomerId && (!customer.pricingTier || !customer.salesRepName)) {
      try {
        const parentRes = await fetch(`/api/customers/${parentCustomerId}`, { credentials: 'include' });
        if (parentRes.ok) {
          const parentCompany = await parentRes.json();
          // Inherit pricing tier from parent if contact doesn't have one
          if (!customer.pricingTier && parentCompany.pricingTier) {
            enrichedCustomer.pricingTier = parentCompany.pricingTier;
          }
          // Inherit sales rep from parent if contact doesn't have one
          if (!customer.salesRepName && parentCompany.salesRepName) {
            enrichedCustomer.salesRepName = parentCompany.salesRepName;
          }
        }
      } catch (err) {
        console.error('Error fetching parent company:', err);
      }
    }

    const emails = getCustomerEmails(enrichedCustomer);
    
    // Always fetch contact emails for the dropdown in Customer Details
    const contactEmails = await fetchContactEmails(enrichedCustomer.id);
    setAvailableContactEmails(contactEmails);
    
    // Check for multiple emails first (customer has both email and email2)
    if (emails.length > 1) {
      setPendingCustomer(enrichedCustomer);
      setSelectedEmail(enrichedCustomer.email || emails[0]);
      setEmailSelectAction('set_primary');
      setEmailSelectDialogOpen(true);
      return;
    }
    
    // Check for missing/invalid email
    if (isEmailMissing(enrichedCustomer.email)) {
      setPendingCustomer(enrichedCustomer);
      
      if (contactEmails.length > 0) {
        // Show dialog to pick from contact emails
        setSelectedEmail(contactEmails[0].email);
        setEmailSelectAction('fix_missing');
        setEmailSelectDialogOpen(true);
        return;
      }
      // No contact emails available - just proceed without email
    }
    
    // Try to extract pricing tier from tags if pricingTier field is empty
    if (!enrichedCustomer.pricingTier && enrichedCustomer.tags) {
      const customerTags = enrichedCustomer.tags.toLowerCase().split(',').map((t: string) => t.trim());
      
      // Check for "Tier: XXXX" format in tags
      for (const tag of customerTags) {
        const tierMatch = tag.match(/tier:\s*(\S+)/i);
        if (tierMatch) {
          const tierValue = tierMatch[1].toUpperCase();
          // Find matching tier from allPricingTiers
          const matchingTier = allPricingTiers.find(t => 
            t.label.toUpperCase() === tierValue || 
            t.key.toUpperCase().includes(tierValue.replace('-', ''))
          );
          if (matchingTier) {
            enrichedCustomer.pricingTier = matchingTier.label;
            break;
          }
        }
      }
      
      // Also check for direct tier name matches in tags
      if (!enrichedCustomer.pricingTier) {
        for (const tier of allPricingTiers) {
          const tierLabel = tier.label.toLowerCase();
          if (customerTags.some((tag: string) => 
            tag === tierLabel || 
            tag.includes(tierLabel) ||
            tierLabel.includes(tag)
          )) {
            enrichedCustomer.pricingTier = tier.label;
            break;
          }
        }
      }
    }
    
    // Check for missing pricing tier or sales rep - show gate dialog if needed
    const missingTier = !enrichedCustomer.pricingTier;
    const missingRep = !enrichedCustomer.salesRepName;
    if (missingTier || missingRep) {
      setGateCustomer(enrichedCustomer);
      setGatePricingTier(enrichedCustomer.pricingTier || "");
      setGateSalesRep(enrichedCustomer.salesRepName || "");
      setShowCustomerGateDialog(true);
      return;
    }
    
    // All good - select directly
    setSelectedCustomer(enrichedCustomer);
  };

  // Handle email selection confirmation - update customer's primary email in database
  const handleEmailSelectConfirm = async () => {
    setEmailSelectDialogOpen(false);
    
    if (emailSelectAction === 'fix_missing' && pendingCustomer && selectedEmail) {
      // Fix missing email - set selected contact email as primary
      try {
        const response = await fetch(`/api/customers/${pendingCustomer.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ email: selectedEmail }),
        });

        if (response.ok) {
          const updatedCustomer = await response.json();
          setSelectedCustomer(updatedCustomer);
          queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
          toast({
            title: "Email Added",
            description: `${selectedEmail} is now the primary email for this customer`,
          });
        } else {
          setSelectedCustomer(pendingCustomer);
          toast({
            title: "Note",
            description: "Could not update email, proceeding without primary email",
            variant: "destructive",
          });
        }
      } catch (error) {
        console.error('Error updating customer email:', error);
        setSelectedCustomer(pendingCustomer);
      }
      
      setPendingCustomer(null);
      setAvailableContactEmails([]);
    } else if (emailSelectAction === 'set_primary' && pendingCustomer) {
      const currentPrimary = pendingCustomer.email;
      const currentSecondary = pendingCustomer.email2;
      
      // If user selected a different email than current primary, swap them
      if (selectedEmail !== currentPrimary && selectedEmail === currentSecondary) {
        try {
          // Update customer in database - swap email and email2
          const response = await fetch(`/api/customers/${pendingCustomer.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
              email: currentSecondary,  // Make selected (secondary) the new primary
              email2: currentPrimary,   // Move old primary to secondary
            }),
          });

          if (response.ok) {
            const updatedCustomer = await response.json();
            setSelectedCustomer(updatedCustomer);
            queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
            toast({
              title: "Primary Email Updated",
              description: `${selectedEmail} is now the primary email for this customer`,
            });
          } else {
            // If update fails, still use customer but with original email order
            setSelectedCustomer(pendingCustomer);
            toast({
              title: "Note",
              description: "Could not update primary email, using original order",
              variant: "destructive",
            });
          }
        } catch (error) {
          console.error('Error updating customer email:', error);
          setSelectedCustomer(pendingCustomer);
        }
      } else {
        // User kept the current primary - just set the customer
        setSelectedCustomer(pendingCustomer);
      }
      
      setPendingCustomer(null);
    }
    
    setEmailSelectAction(null);
  };

  // Handle customer gate dialog save - update pricing tier and sales rep
  const handleCustomerGateSave = async () => {
    if (!gateCustomer) return;
    if (!gatePricingTier || !gateSalesRep) {
      toast({
        title: "Missing Fields",
        description: "Please select both a pricing tier and sales rep",
        variant: "destructive",
      });
      return;
    }
    
    try {
      const response = await fetch(`/api/customers/${gateCustomer.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ pricingTier: gatePricingTier, salesRepName: gateSalesRep }),
      });
      
      if (response.ok) {
        const updatedCustomer = await response.json();
        setSelectedCustomer(updatedCustomer);
        queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
        toast({
          title: "Customer Updated",
          description: "Pricing tier and sales rep have been assigned",
        });
      } else {
        toast({
          title: "Error",
          description: "Failed to update customer",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error('Error updating customer:', error);
      toast({
        title: "Error",
        description: "Failed to update customer",
        variant: "destructive",
      });
    }
    
    setShowCustomerGateDialog(false);
    setGateCustomer(null);
  };

  // Handle Shopify draft click - validates SKUs first and shows warning if any are unmapped
  const handleShopifyDraftClick = async () => {
    if (!selectedCustomer) {
      toast({
        title: "No Client Selected",
        description: "Please select a client first before creating a Shopify draft order",
        variant: "destructive",
      });
      return;
    }
    if (quoteItems.length === 0) {
      toast({
        title: "No Items in Quote",
        description: "Please add items to your quote before creating a draft order",
        variant: "destructive",
      });
      return;
    }

    // Validate SKUs before creating draft order
    setIsValidatingSkus(true);
    try {
      const skus = quoteItems.map(item => item.itemCode).filter(Boolean);
      const response = await fetch('/api/shopify/validate-skus', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ skus }),
      });
      
      const data = await response.json();
      
      if (data.unmappedSkus && data.unmappedSkus.length > 0) {
        // Build list with product names for user-friendly display
        const unmappedWithNames = data.unmappedSkus.map((sku: string) => {
          const item = quoteItems.find(q => q.itemCode === sku);
          return { sku, name: item?.productName || sku };
        });
        setUnmappedSkus(unmappedWithNames);
        setSkuValidationDialogOpen(true);
        return;
      }
      
      // All SKUs mapped - proceed directly
      handleCreateShopifyDraft(selectedCustomer.email);
    } catch (error: any) {
      console.error('SKU validation error:', error);
      // On error, proceed anyway but warn user
      toast({
        title: "Warning",
        description: "Could not validate SKU mappings. Proceeding anyway.",
      });
      handleCreateShopifyDraft(selectedCustomer.email);
    } finally {
      setIsValidatingSkus(false);
    }
  };

  const handleSaveQuote = async () => {
    if (!selectedCustomer || quoteItems.length === 0) {
      toast({
        title: "Cannot save quote",
        description: "Please select a client and add at least one product.",
        variant: "destructive",
      });
      return;
    }
    setIsSavingQuote(true);
    try {
      // Generate a quote number
      let quoteNumber: string;
      try {
        const qnRes = await fetch('/api/generate-quote-number', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ prefix: 'QQ' }),
        });
        if (qnRes.ok) {
          const qnData = await qnRes.json();
          quoteNumber = qnData.quoteNumber;
        } else {
          quoteNumber = `QQ-${Date.now()}`;
        }
      } catch {
        quoteNumber = `QQ-${Date.now()}`;
      }

      const customerName = `${selectedCustomer.firstName} ${selectedCustomer.lastName}`.trim() || selectedCustomer.company || 'Unknown';
      const customerEmail = selectedCustomer.email || '';

      const quoteItemsForSave = quoteItems.map(item => ({
        itemCode: item.itemCode,
        productType: item.productType,
        size: item.size,
        quantity: Math.max(item.minOrderQty || 0, item.quantity),
        pricePerSheet: item.pricePerSheet,
        total: Math.max(item.minOrderQty || 0, item.quantity) * item.pricePerSheet,
      }));

      await apiRequest('POST', '/api/sent-quotes', {
        quoteNumber,
        customerName,
        customerEmail,
        quoteItems: JSON.stringify(quoteItemsForSave),
        totalAmount: totalAmount.toFixed(2),
        sentVia: 'saved',
        customerId: selectedCustomer.id,
      });

      queryClient.invalidateQueries({ queryKey: ['/api/sent-quotes'] });
      queryClient.invalidateQueries({ queryKey: ['/api/quotes/pipeline'] });

      toast({
        title: "Quote Saved!",
        description: `${quoteNumber} for ${customerName} — $${totalAmount.toFixed(2)} saved to Quotes pipeline.`,
      });
    } catch (error) {
      console.error('Save quote error:', error);
      toast({
        title: "Failed to save quote",
        description: "An error occurred. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSavingQuote(false);
    }
  };

  const handleOdooOrderClick = () => {
    if (!selectedCustomer) {
      toast({
        title: "No Client Selected",
        description: "Please select a client first before creating an Odoo sales order",
        variant: "destructive",
      });
      return;
    }
    if (quoteItems.length === 0) {
      toast({
        title: "No Items in Quote",
        description: "Please add items to your quote before creating a sales order",
        variant: "destructive",
      });
      return;
    }
    if (!(selectedCustomer as any).odooPartnerId) {
      toast({
        title: "Customer Not Synced to Odoo",
        description: "This customer needs to be synced to Odoo first. Go to the customer profile and click 'Sync to Odoo'.",
        variant: "destructive",
      });
      return;
    }

    // Use the primary email directly (user already selected during customer selection)
    handleCreateOdooOrder();
  };

  const handleCreateOdooOrder = async () => {
    if (quoteItems.length === 0 || !selectedCustomer) return;

    // Check if customer has odooPartnerId
    if (!(selectedCustomer as any).odooPartnerId) {
      return;
    }

    setIsCreatingOdooOrder(true);

    try {
      // Build items array including additional charges
      // Use total/quantity to ensure correct line totals (respects retail rounding)
      const productItems = quoteItems.map(item => ({
        itemCode: item.itemCode,
        productName: item.productName,
        quantity: item.quantity,
        pricePerSheet: item.total / item.quantity, // Use calculated total price
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

  const handleCreateShopifyDraft = async (emailToUse?: string) => {
    if (quoteItems.length === 0 || !selectedCustomer) return;

    setIsCreatingShopifyDraft(true);

    try {
      // Build line items with SKU and the total line price (not per-unit price)
      // Note: Shipping and CC fees are not sent to Shopify draft - those are handled separately in Shopify
      const lineItems = quoteItems.map(item => ({
        itemCode: item.itemCode, // SKU for matching
        productName: item.productName,
        size: item.size,
        quantity: item.quantity,
        unitPrice: item.total / item.quantity, // Price that results in correct line total
        lineTotal: item.total, // The total from the quote
      }));

      const customerEmail = emailToUse || selectedCustomer.email;

      const response = await fetch('/api/shopify/draft-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          quoteNumber: `QQ-${Date.now()}`,
          customerEmail,
          customerId: String(selectedCustomer.id),
          customerName: selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
          lineItems,
          note: `QuickQuote for ${selectedCustomer.company || customerEmail}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || data.details || 'Failed to create draft order');
      }

      toast({
        title: "Draft Order Created!",
        description: `Shopify Draft ${data.shopifyDraftOrderNumber} - $${data.totalPrice}`,
      });

      // Show info about unmapped items if any
      if (data.unmappedItems && data.unmappedItems.length > 0) {
        toast({
          title: "Note: Some Items Not Mapped",
          description: `${data.unmappedItems.length} item(s) created as custom line items`,
        });
      }

      // Log activity
      logUserAction('Created Shopify Draft Order', `Draft ${data.shopifyDraftOrderNumber}`);

      // Open the draft order in Shopify admin
      if (data.adminUrl) {
        window.open(data.adminUrl, '_blank');
      }
    } catch (error: any) {
      console.error('Error creating Shopify draft order:', error);
      toast({
        title: "Failed to Create Draft Order",
        description: error.message || "Could not create draft order in Shopify",
        variant: "destructive",
      });
    } finally {
      setIsCreatingShopifyDraft(false);
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
        'client.firstName': selectedCustomer?.firstName || '',
        'client.lastName': selectedCustomer?.lastName || '',
        'client.company': selectedCustomer?.company || '',
        'client.email': customerEmail,
        'client.salesRep': selectedCustomer?.salesRepName || '',
        'quote.number': quoteNumber,
        'quote.total': `$${calculatedTotalAmount.toFixed(2)}`,
      },
      onSent: async () => {
        try {
          const quoteItemsForSave = quoteItems.map(item => ({
            itemCode: item.itemCode,
            productType: item.productType,
            size: item.size,
            quantity: Math.max(item.minOrderQty || 0, item.quantity),
            pricePerSheet: item.pricePerSheet,
            total: Math.max(item.minOrderQty || 0, item.quantity) * item.pricePerSheet
          }));
          
          await apiRequest('POST', '/api/send-email-quote', {
            customerName,
            customerEmail,
            quoteItems: quoteItemsForSave,
            customerId: selectedCustomer?.id,
            quoteNumber,
          });
          
          queryClient.invalidateQueries({ queryKey: ['/api/sent-quotes'] });
          logQuoteGeneration(quoteNumber, customerName);
        } catch (err) {
          console.error('Failed to save quote to database:', err);
        }
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

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: '16px', alignItems: 'start' }}>
        {/* Left Rail */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {/* Customer Card */}
          <div style={{ position: 'relative', marginTop: '8px' }}>
            <span style={{ position: 'absolute', top: '-9px', left: '14px', fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'white', padding: '0 6px', zIndex: 1 }}>Customer</span>
            <div style={{ background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '14px', padding: '16px 14px 14px' }}>
            {selectedCustomer ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => setSelectedCustomer(null)}>
                <div style={{ width: '38px', height: '38px', borderRadius: '50%', background: '#EEEDFE', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '13px', fontWeight: 500, color: '#534AB7', flexShrink: 0 }}>
                  {((selectedCustomer.firstName?.[0] || '') + (selectedCustomer.lastName?.[0] || selectedCustomer.company?.[0] || '')).toUpperCase() || 'C'}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
                  </div>
                  {selectedCustomer.firstName && selectedCustomer.company && (
                    <div style={{ fontSize: '13px', color: 'var(--color-text-secondary)' }}>{selectedCustomer.firstName} {selectedCustomer.lastName}</div>
                  )}
                </div>
              </div>
            ) : (
              <SearchableCustomerSelect
                selectedCustomer={selectedCustomer}
                onCustomerSelect={handleCustomerSelect}
                placeholder="Search by name or company"
                className="w-full"
              />
            )}
            {selectedCustomer && (
              <div style={{ marginTop: '8px', paddingTop: '8px', borderTop: '0.5px solid var(--color-border-tertiary)', display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                {matchingTier && (
                  <span style={{ fontSize: '11px', fontWeight: 500, background: '#EEEDFE', color: '#3C3489', borderRadius: '4px', padding: '3px 9px' }}>
                    {allPricingTiers.find(t => t.key === matchingTier)?.label || matchingTier}
                  </span>
                )}
                <span style={{ fontSize: '11px', fontWeight: 500, background: '#EAF3DE', color: '#27500A', borderRadius: '4px', padding: '3px 9px' }}>matched ✓</span>
              </div>
            )}
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
          </div>{/* closes customer wrapper */}

          {/* Product Selection Card */}
          <div style={{ position: 'relative', marginTop: '16px' }}>
            <span style={{ position: 'absolute', top: '-9px', left: '14px', fontSize: '10px', fontWeight: 600, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.07em', background: 'white', padding: '0 6px', zIndex: 1 }}>Product</span>
            <div style={{ background: 'white', border: '1.5px solid #E5E7EB', borderRadius: '14px', padding: '14px 14px 10px' }}>

              {/* Category */}
              <div style={{ marginBottom: '10px' }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Category</span>
                <Select value={selectedCategory} onValueChange={handleCategoryChange}>
                  <SelectTrigger style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--color-border-secondary)', background: '#FFFFFF', fontSize: '14px', fontWeight: 500, color: selectedCategory ? '#3C3489' : 'var(--color-text-tertiary)', height: '40px', paddingLeft: '12px' }}>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type */}
              <div style={{ marginBottom: '10px' }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Type</span>
                <Select value={selectedType} onValueChange={setSelectedType} disabled={!selectedCategory}>
                  <SelectTrigger style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--color-border-secondary)', background: '#FFFFFF', fontSize: '14px', fontWeight: 500, color: selectedType ? '#3C3489' : 'var(--color-text-tertiary)', height: '40px', paddingLeft: '12px' }}>
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    {productTypes.map(type => (
                      <SelectItem key={type} value={type}>{type}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Size */}
              <div style={{ marginBottom: '10px' }}>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Size</span>
                <Select value={selectedSize} onValueChange={(value) => { setSelectedSize(value); setIsCustomSize(value === 'custom'); if (value !== 'custom') { setCustomWidth(''); setCustomHeight(''); } }} disabled={!selectedType}>
                  <SelectTrigger style={{ width: '100%', borderRadius: '10px', border: '1px solid var(--color-border-secondary)', background: '#FFFFFF', fontSize: '14px', fontWeight: 500, color: selectedSize ? '#3C3489' : 'var(--color-text-tertiary)', height: '40px', paddingLeft: '12px' }}>
                    <SelectValue placeholder="Select size" />
                  </SelectTrigger>
                  <SelectContent className="max-w-none w-auto min-w-[200px]">
                    {availableSizes.map((product, index) => (
                      <SelectItem key={product.itemCode || `${product.size}-${index}`} value={product.itemCode || product.size}>
                        {product.size} ({parseFloat(String(product.totalSqm || 0)).toFixed(4)} m²)
                      </SelectItem>
                    ))}
                    {supportsCustomSize(selectedCategory) && (
                      <SelectItem value="custom">Custom Size</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>

              {/* Qty */}
              <div>
                <span style={{ display: 'block', fontSize: '10px', fontWeight: 600, color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px' }}>Qty</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <button onClick={() => setQuantity(Math.max(selectedProduct?.minQuantity || 1, quantity - (selectedProduct?.minQuantity || 1)))} style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>−</button>
                  <input type="number" value={quantity} onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))} onFocus={(e) => e.target.select()} style={{ flex: 1, textAlign: 'center', fontSize: '14px', fontWeight: 500, border: '1px solid var(--color-border-secondary)', borderRadius: '10px', padding: '0 8px', height: '40px', color: 'var(--color-text-primary)', background: 'var(--color-background-primary)' }} />
                  <button onClick={() => setQuantity(quantity + (selectedProduct?.minQuantity || 1))} style={{ flexShrink: 0, width: '40px', height: '40px', borderRadius: '10px', border: '1px solid var(--color-border-secondary)', background: 'var(--color-background-secondary)', fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--color-text-secondary)' }}>+</button>
                </div>
              </div>


          {/* Custom Size Input */}
          {isCustomSize && selectedType && (
            <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '10px 14px' }}>
              <div style={{ fontSize: '10px', fontWeight: 500, color: 'var(--color-text-tertiary)', marginBottom: '8px' }}>Custom dimensions (inches)</div>
              <div className="flex items-center gap-2">
                <Input type="number" value={customWidth} onChange={(e) => setCustomWidth(e.target.value)} placeholder="Width" className="w-full" min="1" step="0.25" />
                <span className="text-gray-600">×</span>
                <Input type="number" value={customHeight} onChange={(e) => setCustomHeight(e.target.value)} placeholder="Height" className="w-full" min="1" step="0.25" />
              </div>
              {customWidth && customHeight && (
                <p style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginTop: '6px' }}>
                  {(parseFloat(customWidth) * parseFloat(customHeight) * 0.00064516).toFixed(4)} m²
                </p>
              )}
            </div>
          )}

          {/* Product Info Card */}
          {selectedProduct && (
            <div style={{ background: 'var(--color-background-secondary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '14px 16px' }}>
              {[
                { label: 'SKU', value: selectedProduct.itemCode, mono: true },
                { label: 'Total sqm', value: `${parseFloat(String(selectedProduct.totalSqm || 0)).toFixed(4)} m²` },
                { label: 'Format', value: `${selectedProduct.minQuantity || 1} ${selectedProduct.unitOfMeasure || 'sheets'} / pack` },
                { label: 'Min qty', value: String(selectedProduct.minQuantity || 1) },
              ].map((row, i) => (
                <div key={row.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: i < 3 ? '8px' : 0 }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>{row.label}</span>
                  <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)', fontFamily: row.mono ? 'monospace' : 'inherit' }}>{row.value}</span>
                </div>
              ))}
              {inventoryData !== undefined && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '6px', paddingTop: '6px', borderTop: '0.5px solid var(--color-border-tertiary)' }}>
                  <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Stock</span>
                  <span style={{ fontSize: '14px', fontWeight: 500, color: inventoryData && Math.floor(inventoryData.qtyAvailable) > 0 ? '#27500A' : '#A32D2D' }}>
                    {inventoryLoading ? '...' : inventoryData ? `${Math.floor(inventoryData.qtyAvailable)} ✓` : '—'}
                  </span>
                </div>
              )}
            </div>
          )}

          {/* No Results Banner */}
          {hasNoResults && (
            <div style={{ padding: '10px 14px', background: '#FFFBEB', border: '0.5px solid #FCD34D', borderRadius: '10px', display: 'flex', gap: '8px', alignItems: 'flex-start' }}>
              <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
              <div style={{ flex: 1 }}>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#78350F' }}>No results</p>
                <button onClick={resetSelections} style={{ marginTop: '4px', fontSize: '11px', color: '#92400E', textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>Reset filters</button>
              </div>
            </div>
          )}

          {/* Reset button */}
          <button onClick={() => { if (window.confirm('Reset all selections?')) resetSelections(); }} style={{ width: '100%', marginTop: '8px', padding: '10px', fontSize: '13px', fontWeight: 600, color: '#fff', background: '#EA580C', border: 'none', borderRadius: '8px', cursor: 'pointer', letterSpacing: '0.02em' }}>
            Reset All
          </button>

            </div>{/* closes product inner card */}
          </div>{/* closes product outer wrapper */}
        </div>{/* end left rail */}

        {/* Right Panel */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>

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
          <div style={{ background: 'var(--color-background-primary)', border: '0.5px solid var(--color-border-tertiary)', borderRadius: '12px', padding: '16px', position: 'relative', overflow: 'hidden' }}>
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

                {/* Best Price Recommendation */}
                {selectedCustomer && selectedProduct && (
                  bestPriceLoading ? (
                    <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                        <span className="text-sm text-gray-500">Calculating best price...</span>
                      </div>
                    </div>
                  ) : !bestPriceData ? (
                    <div className="mt-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div className="flex items-center justify-center w-8 h-8 bg-gray-300 rounded-full">
                          <DollarSign className="h-4 w-4 text-gray-500" />
                        </div>
                        <div>
                          <p className="text-sm text-gray-600 font-medium">Best Price unavailable</p>
                          <p className="text-xs text-gray-500">Pricing data is incomplete for this product. Use the tier prices below.</p>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-6 p-4 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex items-center justify-center w-10 h-10 bg-green-500 rounded-full">
                            <DollarSign className="h-5 w-5 text-white" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-base font-semibold text-green-800">Best Price to Offer</h4>
                              <Badge variant={bestPriceData.confidence === 'high' ? 'default' : bestPriceData.confidence === 'medium' ? 'secondary' : 'outline'} className="text-xs">
                                {bestPriceData.confidence} confidence
                              </Badge>
                            </div>
                            <p className="text-sm text-green-700 mt-1">{bestPriceData.rationale}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          {/* Show breakdown: Tier Price - Discount = Best Price */}
                          {bestPriceData.tierComparison && bestPriceData.tierComparison.savings > 0 ? (
                            <>
                              <div className="flex items-center justify-end gap-2 text-sm">
                                <span className="text-gray-500 line-through">
                                  ${bestPriceData.tierComparison.tierPrice.toFixed(2)}
                                </span>
                                <span className="text-green-600 font-medium">
                                  -{bestPriceData.tierComparison.savingsPercent}%
                                </span>
                              </div>
                              <p className="text-2xl font-bold text-green-700">
                                ${bestPriceData.recommendedPrice.toFixed(2)}
                                <span className="text-sm font-normal text-green-600 ml-1">
                                  /{bestPriceData.unitType === 'roll' ? 'roll' : bestPriceData.unitType === 'sheet' ? 'sheet' : 'unit'}
                                </span>
                              </p>
                            </>
                          ) : (
                            <p className="text-2xl font-bold text-green-700">
                              ${bestPriceData.recommendedPrice.toFixed(2)}
                              <span className="text-sm font-normal text-green-600 ml-1">
                                /{bestPriceData.unitType === 'roll' ? 'roll' : bestPriceData.unitType === 'sheet' ? 'sheet' : 'unit'}
                              </span>
                            </p>
                          )}
                          <p className="text-xs text-green-600">
                            Range: ${bestPriceData.priceRange.floor.toFixed(2)} - ${bestPriceData.priceRange.ceiling.toFixed(2)}
                          </p>
                        </div>
                      </div>
                      
                      {/* Min Order Qty Alert */}
                      {bestPriceData.productInfo?.minOrderQty && bestPriceData.productInfo.minOrderQty > 1 && (
                        <div className="mt-3 p-2 bg-amber-50 border border-amber-200 rounded-md">
                          <div className="flex items-center gap-2">
                            <AlertTriangle className="h-4 w-4 text-amber-600" />
                            <span className="text-sm text-amber-800 font-medium">
                              Min Order: {bestPriceData.productInfo.minOrderQty} {bestPriceData.unitType === 'roll' ? 'rolls' : 'sheets'}
                            </span>
                            {quantity < bestPriceData.productInfo.minOrderQty && (
                              <span className="text-xs text-amber-600 ml-2">
                                (Current qty: {quantity} - below minimum)
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                      
                      {/* Tier Comparison & Recommendation */}
                      {bestPriceData.tierComparison && (
                        <div className="mt-3 p-3 bg-blue-50 border border-blue-200 rounded-md">
                          <div className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <div>
                              <p className="text-sm text-blue-800 font-medium">How to Quote</p>
                              <p className="text-sm text-blue-700 mt-1">{bestPriceData.tierComparison.recommendation}</p>
                              {bestPriceData.tierComparison.savings > 0 && (
                                <p className="text-xs text-blue-600 mt-1">
                                  Customer saves ${bestPriceData.tierComparison.savings.toFixed(2)} ({bestPriceData.tierComparison.savingsPercent}% off {bestPriceData.tierComparison.customerTier} tier)
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                      
                      {bestPriceData.factors.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-green-200">
                          <p className="text-xs text-green-700 font-medium mb-2">Pricing factors:</p>
                          <div className="flex flex-wrap gap-2">
                            {bestPriceData.factors.map((factor, idx) => (
                              <span key={idx} className={`inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full ${
                                factor.impact === 'positive' ? 'bg-green-100 text-green-700' :
                                factor.impact === 'negative' ? 'bg-red-100 text-red-700' :
                                'bg-gray-100 text-gray-700'
                              }`}>
                                {factor.impact === 'positive' && <Check className="h-3 w-3" />}
                                {factor.impact === 'negative' && <AlertTriangle className="h-3 w-3" />}
                                {factor.name}
                                {factor.adjustment !== 0 && (
                                  <span className="font-medium">
                                    {factor.adjustment > 0 ? '+' : ''}{factor.adjustment}%
                                  </span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Help icon for Aneesh only */}
                      {user?.email?.toLowerCase() === 'aneesh@4sgraphics.com' && (
                        <div className="flex justify-end mt-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 w-6 p-0 text-green-600 hover:text-green-800 hover:bg-green-100"
                            onClick={() => setShowBestPriceHelpDialog(true)}
                            title="How Best Price is Calculated"
                          >
                            <HelpCircle className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </div>
                  )
                )}

                {/* Pricing Table */}
                <div className="mt-6">
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                    <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--color-text-primary)' }}>Available pricing tiers</div>
                    {matchingTier && (
                      <span style={{ fontSize: '10px', fontWeight: 500, background: '#FAEEDA', color: '#633806', borderRadius: '4px', padding: '2px 8px' }}>
                        Customer tier: {allPricingTiers.find(t => t.key === matchingTier)?.label}
                      </span>
                    )}
                  </div>
                  <div style={{ border: '0.5px solid var(--color-border-tertiary)', borderRadius: '10px', overflow: 'hidden' }}>
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
                        title: isCustomSize ? 'Price/Sheet' : (selectedProduct ? (selectedProduct.rollSheet === 'Roll' ? 'Price/Roll' : getPriceColumnHeader(selectedProduct.size)) : 'Price/Sheet'), 
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
                  </div>{/* end AdaptiveTable border wrapper */}
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
                    style={{ background: '#EAF3DE', color: '#27500A', border: 'none', borderRadius: '8px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', opacity: (isPDFGenerating || !selectedCustomer) ? 0.5 : 1 }}
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
                    disabled={isPDFGenerating || !selectedCustomer || quoteItems.length === 0}
                    style={{ background: '#E6F1FB', color: '#0C447C', border: 'none', borderRadius: '8px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', opacity: (isPDFGenerating || !selectedCustomer || quoteItems.length === 0) ? 0.5 : 1 }}
                  >
                    <Mail className="h-4 w-4" />
                    Email Quote
                  </button>
                  <button
                    onClick={handleOdooOrderClick}
                    disabled={!selectedCustomer || isCreatingOdooOrder || quoteItems.length === 0}
                    style={{ background: '#EEEDFE', color: '#3C3489', border: 'none', borderRadius: '8px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', opacity: (!selectedCustomer || isCreatingOdooOrder || quoteItems.length === 0) ? 0.5 : 1 }}
                    data-testid="btn-create-odoo-order"
                  >
                    {isCreatingOdooOrder ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Send className="h-4 w-4" />
                    )}
                    {isCreatingOdooOrder ? 'Creating...' : 'Sales Order'}
                  </button>
                  <button
                    onClick={handleSaveQuote}
                    disabled={!selectedCustomer || isSavingQuote || quoteItems.length === 0}
                    style={{ background: '#1a1a1a', color: '#fff', border: 'none', borderRadius: '8px', padding: '7px 14px', display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 500, cursor: 'pointer', opacity: (!selectedCustomer || isSavingQuote || quoteItems.length === 0) ? 0.5 : 1 }}
                    data-testid="btn-save-quote"
                  >
                    {isSavingQuote ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="h-4 w-4" />
                    )}
                    {isSavingQuote ? 'Saving...' : 'Save Quote'}
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

      {/* SKU Validation Warning Dialog */}
      <Dialog open={skuValidationDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setSkuValidationDialogOpen(false);
          setUnmappedSkus([]);
        }
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Some Products Not Found in Shopify
            </DialogTitle>
            <DialogDescription>
              The following products don't have matching SKUs in Shopify. They will be created as custom line items.
              You may need to manually select the correct products in Shopify after the draft is created.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4 max-h-60 overflow-y-auto">
            <div className="space-y-2">
              {unmappedSkus.map((item, idx) => (
                <div key={idx} className="flex items-center gap-3 p-2 bg-amber-50 rounded border border-amber-200">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-gray-900">{item.name}</div>
                    <div className="text-xs text-gray-500">SKU: {item.sku}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setSkuValidationDialogOpen(false);
                setUnmappedSkus([]);
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={() => {
                setSkuValidationDialogOpen(false);
                setUnmappedSkus([]);
                if (selectedCustomer) {
                  handleCreateShopifyDraft(selectedCustomer.email);
                }
              }}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Proceed Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Selection Dialog */}
      <Dialog open={emailSelectDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setEmailSelectDialogOpen(false);
          setPendingCustomer(null);
          setAvailableContactEmails([]);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {emailSelectAction === 'fix_missing' ? 'Fix Missing Email' : 'Select Primary Email'}
            </DialogTitle>
            <DialogDescription>
              {emailSelectAction === 'fix_missing' 
                ? 'This customer is missing an email address. Select an email from their contacts to set as the primary email.'
                : 'This customer has multiple email addresses. Please select which email to use as the primary email for Shopify drafts and Odoo orders.'
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            {emailSelectAction === 'fix_missing' ? (
              availableContactEmails.map((emailInfo, index) => (
                <label
                  key={emailInfo.email}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedEmail === emailInfo.email 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="emailSelect"
                    value={emailInfo.email}
                    checked={selectedEmail === emailInfo.email}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    className="h-4 w-4 text-purple-600"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{emailInfo.email}</span>
                    <span className="ml-2 text-xs text-gray-500">({emailInfo.source})</span>
                  </div>
                </label>
              ))
            ) : (
              pendingCustomer && getCustomerEmails(pendingCustomer).map((email, index) => (
                <label
                  key={email}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    selectedEmail === email 
                      ? 'border-purple-500 bg-purple-50' 
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <input
                    type="radio"
                    name="emailSelect"
                    value={email}
                    checked={selectedEmail === email}
                    onChange={(e) => setSelectedEmail(e.target.value)}
                    className="h-4 w-4 text-purple-600"
                  />
                  <div className="flex-1">
                    <span className="font-medium text-gray-900">{email}</span>
                    {index === 0 && (
                      <span className="ml-2 text-xs text-gray-500">(Current Primary)</span>
                    )}
                    {index === 1 && (
                      <span className="ml-2 text-xs text-gray-500">(Secondary)</span>
                    )}
                  </div>
                </label>
              ))
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { 
              setEmailSelectDialogOpen(false); 
              setPendingCustomer(null); 
              setAvailableContactEmails([]);
              if (emailSelectAction === 'fix_missing' && pendingCustomer) {
                setSelectedCustomer(pendingCustomer);
              }
            }}>
              {emailSelectAction === 'fix_missing' ? 'Skip' : 'Cancel'}
            </Button>
            <Button onClick={handleEmailSelectConfirm} disabled={!selectedEmail}>
              {emailSelectAction === 'fix_missing' ? 'Set Email' : 'Set as Primary'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Customer Gate Dialog - collect missing pricing tier / sales rep */}
      <Dialog open={showCustomerGateDialog} onOpenChange={(open) => {
        if (!open) {
          setShowCustomerGateDialog(false);
          setGateCustomer(null);
        }
      }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <User className="h-5 w-5" />
              Complete Customer Setup
            </DialogTitle>
            <DialogDescription>
              Please assign a pricing tier and sales rep for this customer before creating a quote.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="gate-pricing-tier">Pricing Tier</Label>
              <Select value={gatePricingTier} onValueChange={setGatePricingTier}>
                <SelectTrigger>
                  <SelectValue placeholder="Select pricing tier" />
                </SelectTrigger>
                <SelectContent>
                  {PRICING_TIERS.map((tier) => (
                    <SelectItem key={tier} value={tier}>
                      {tier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="gate-sales-rep">Sales Rep</Label>
              <Select value={gateSalesRep} onValueChange={setGateSalesRep} disabled={isLoadingSalesReps}>
                <SelectTrigger>
                  <SelectValue placeholder={isLoadingSalesReps ? "Loading sales reps..." : "Select sales rep"} />
                </SelectTrigger>
                <SelectContent>
                  {isLoadingSalesReps ? (
                    <SelectItem value="_loading" disabled>Loading sales reps...</SelectItem>
                  ) : sortedSalesReps.length === 0 ? (
                    <SelectItem value="_no_users" disabled>No sales reps available</SelectItem>
                  ) : (
                    sortedSalesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.name}>
                        {rep.name}
                      </SelectItem>
                    ))
                  )}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowCustomerGateDialog(false);
              setGateCustomer(null);
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleCustomerGateSave}
              disabled={!gatePricingTier || !gateSalesRep}
            >
              Save & Continue
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Best Price Calculation Help Dialog - Aneesh only */}
      <Dialog open={showBestPriceHelpDialog} onOpenChange={setShowBestPriceHelpDialog}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calculator className="h-5 w-5 text-green-600" />
              How Best Price is Calculated
            </DialogTitle>
            <DialogDescription>
              Internal documentation for pricing strategy
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 text-sm">
            <div className="p-3 bg-green-50 rounded-lg border border-green-200">
              <h4 className="font-semibold text-green-800 mb-2">Overview</h4>
              <p className="text-green-700">
                The Best Price Engine calculates an optimal price recommendation that balances profit margins, 
                customer loyalty, inventory levels, and competitive positioning.
              </p>
            </div>
            
            <div className="space-y-3">
              <h4 className="font-semibold text-gray-800">The 5 Pricing Strategies</h4>
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-700">1. Base Tier + Margin Floor</h5>
                <ul className="mt-1 text-gray-600 list-disc list-inside space-y-1">
                  <li>Starts with the customer's assigned pricing tier (Dealer, Distributor, Retail, etc.)</li>
                  <li>Never goes below 15% profit margin above cost</li>
                  <li>If Odoo cost isn't available, estimates from tier prices</li>
                </ul>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-700">2. Loyalty Accelerator</h5>
                <ul className="mt-1 text-gray-600 list-disc list-inside space-y-1">
                  <li><strong>Bronze</strong> (3+ orders): No discount</li>
                  <li><strong>Silver</strong> (10+ orders): 3% off</li>
                  <li><strong>Gold</strong> (25+ orders): 5% off</li>
                  <li><strong>Platinum</strong> (50+ orders): 8% off</li>
                </ul>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-700">3. Inventory Velocity</h5>
                <ul className="mt-1 text-gray-600 list-disc list-inside space-y-1">
                  <li><strong>Overstock</strong> (200+ units): 5% discount to move inventory</li>
                  <li><strong>Healthy</strong> (50-200): No adjustment</li>
                  <li><strong>Low stock</strong> (under 20): 3% premium</li>
                  <li><strong>Critical</strong> (under 5): 5% premium</li>
                </ul>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-700">4. Volume Discount</h5>
                <ul className="mt-1 text-gray-600 list-disc list-inside space-y-1">
                  <li>2% discount per 100 units ordered</li>
                  <li>Maximum 10% discount for large orders</li>
                </ul>
              </div>
              
              <div className="p-3 bg-gray-50 rounded-lg">
                <h5 className="font-medium text-gray-700">5. Competitor Intelligence</h5>
                <ul className="mt-1 text-gray-600 list-disc list-inside space-y-1">
                  <li>Compares price against linked competitor pricing data</li>
                  <li>Adjusts if significantly above market average</li>
                  <li>Never drops below margin floor</li>
                </ul>
              </div>
            </div>
            
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
              <h4 className="font-semibold text-blue-800 mb-2">Confidence Levels</h4>
              <ul className="text-blue-700 list-disc list-inside space-y-1">
                <li><strong>High:</strong> Cost data from Odoo + tier prices + customer history</li>
                <li><strong>Medium:</strong> Estimated cost or missing some data</li>
                <li><strong>Low:</strong> Limited data, use tier prices as fallback</li>
              </ul>
            </div>
            
            <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
              <h4 className="font-semibold text-amber-800 mb-2">Special Products</h4>
              <p className="text-amber-700">
                Products like <strong>Graffiti BLENDED POLY</strong> may have different min order quantities 
                and pricing structures. The engine shows warnings when quantity is below minimum and 
                distinguishes between sheet and roll pricing.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowBestPriceHelpDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectTrigger, SelectValue, SelectItem } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Trash2, Plus, Download, Mail, Calculator, Building, Phone, MapPin, User, FileText, Film, Palette, Layers, Paintbrush, Image, Printer, Frame, Monitor, Zap, ArrowUpDown, Check, AlertTriangle, Tag, ShoppingCart, Database, Eye, EyeOff } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
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
  sortOrder?: number;
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
  sortOrder?: number;
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
  
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { logPageView, logQuoteGeneration, logQuoteDownload, logUserAction } = useActivityLogger();

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
  });

  // Get unique categories
  const categories = Array.from(new Set(productData.map(item => item.productName))).sort();
  
  // Get product types for selected category
  const productTypes = selectedCategory
    ? Array.from(new Set(productData.filter(item => item.productName === selectedCategory).map(item => item.productType))).sort()
    : [];

  // Get sizes for selected type with sorting
  const availableSizes = selectedCategory && selectedType
    ? productData.filter(item => 
        item.productName === selectedCategory && 
        item.productType === selectedType
      ).sort((a, b) => {
        const sqmA = parseFloat(String(a.totalSqm || 0));
        const sqmB = parseFloat(String(b.totalSqm || 0));
        if (sizeSortOrder === 'asc') return sqmA - sqmB;
        if (sizeSortOrder === 'desc') return sqmB - sqmA;
        return sqmA - sqmB; // default is ascending by size
      })
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

  // Get selected product details
  const selectedProduct = productData.find(item =>
    item.productName === selectedCategory &&
    item.productType === selectedType &&
    item.size === selectedSize
  );

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
    const pricePerSheet = tierPrice * parseFloat(String(selectedProduct.totalSqm || 0));
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
      quantity: useQuantity,
      pricePerSqM: tierPrice,
      pricePerSheet: pricePerSheet,
      total: total,
      tier: tier,
      squareMeters: parseFloat(String(selectedProduct.totalSqm || 0)),
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

  const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);

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
    
    const totalAmount = quoteItems.reduce((sum, item) => sum + item.total, 0);
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
            totalAmount
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
Price per ${priceLabel}: $${item.pricePerSheet.toFixed(2)}
Total: $${itemTotal.toFixed(2)}

—————————————`;
}).join('\n\n')}

Total Amount: $${calculatedTotalAmount.toFixed(2)}

We eagerly look forward for your business.

Yours truly
${(user as any)?.email ? (user as any).email.split('@')[0].charAt(0).toUpperCase() + (user as any).email.split('@')[0].slice(1) : '4S Graphics Team'}`;

    // Create mailto link
    const mailtoLink = `mailto:${customerEmail}?subject=${encodeURIComponent(emailSubject)}&body=${encodeURIComponent(emailBody)}`;
    
    // Open default email client
    window.location.href = mailtoLink;
    
    // Log quote email activity
    logUserAction("Composed email quote", `Quote ${quoteNumber} for ${customerName}`);
    
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

  if (isLoading) {
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

      <div className="grid grid-cols-1 xl:grid-cols-5 lg:grid-cols-4 gap-6">
        {/* Left Panel - Customer & Product Selection */}
        <div className="xl:col-span-2 lg:col-span-1">
          {/* Customer Selection Card */}
          <div className="contra-card mb-6">
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

          {/* Product Selection Card */}
          <div className="contra-card mb-6">
            <div className="space-y-6">
              {/* Product Category */}
              <div className="space-y-2">
                <label className="block label-medium text-gray-800">Product</label>
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
                      {availableSizes.map(product => (
                        <SelectItem key={product.size} value={product.size} className="max-w-none whitespace-nowrap">
                          <span className="whitespace-nowrap">{product.size} ({parseFloat(String(product.totalSqm || 0)).toFixed(4)} m²)</span>
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
                <div className="flex gap-2">
                  <input
                    type="number"
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                    onFocus={(e) => e.target.select()}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    min={isCustomSize ? 1 : (selectedProduct?.minQuantity || 1)}
                    className="flex-1 rounded-md border border-gray-300 px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white disabled:bg-gray-100"
                    disabled={!selectedSize && !isCustomSize}
                  />
                  <button
                    onClick={resetSelections}
                    className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md border border-gray-300 transition-colors"
                    type="button"
                  >
                    RESET
                  </button>
                </div>
                {selectedProduct && quantity < selectedProduct.minQuantity && !isCustomSize && (
                  <p className="text-sm text-red-500">
                    Minimum order quantity: {selectedProduct.minQuantity}
                  </p>
                )}
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
          <div className="bg-white/60 backdrop-blur-xl border border-white/50 shadow-xl shadow-indigo-500/10 rounded-2xl p-6 mb-6">
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
                    <div className="flex items-center gap-2 flex-wrap">
                      <Tag className="h-4 w-4 text-gray-500" />
                      {selectedCustomer.tags.split(',').map((tag: string, i: number) => (
                        <span key={i} className="px-2 py-0.5 bg-indigo-100 text-indigo-700 text-xs rounded-full">{tag.trim()}</span>
                      ))}
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

          {/* Quote Summary Card */}
          <div className="bg-white/60 backdrop-blur-xl border border-white/50 shadow-xl shadow-blue-500/10 rounded-2xl p-6 mb-6">
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
                          `${selectedProduct.minQuantity} ${isRollFormat(selectedProduct.size) ? 'Roll' : 'Sheets'}` : 
                          'Not Available'
                        )
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
                      ...((user as any)?.role === 'admin' ? [{ 
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
                        minQty = selectedProduct.minQuantity;
                      } else {
                        return null;
                      }
                      
                      const pricePerSheet = price * totalSqm;
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
                          return (
                            <span className="text-sm text-gray-800 uppercase font-medium">
                              {item.tier.label}
                            </span>
                          );
                        case 'pricePerSqM':
                          // Only show for admin users (column is conditionally included)
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-600">
                              ${item.price.toFixed(2)}
                            </span>
                          );
                        case 'pricePerSheet':
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-600">
                              ${item.pricePerSheet.toFixed(2)}
                            </span>
                          );
                        case 'minOrderQtyPrice':
                          if (isLandedPrice && !landedPriceRevealed) {
                            return <span className="text-sm text-gray-400">•••</span>;
                          }
                          return (
                            <span className="text-sm text-gray-800 font-medium">
                              ${item.total.toFixed(2)}
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

      {/* Quote Items */}
      {quoteItems.length > 0 && (
        <div className="bg-white/60 backdrop-blur-xl border border-white/50 shadow-xl shadow-green-500/10 rounded-2xl p-6 mb-6">
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-lg font-medium text-gray-800">Quote Items</h2>
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
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2 border-gray-300 hover:border-gray-400"
                >
                  <ArrowUpDown className="h-4 w-4" />
                  Order Items
                </Button>
              }
            />
          </div>
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
                    return <span className="text-sm text-gray-600">${item.pricePerSqM.toFixed(2)}</span>;
                  case 'pricePerSheet':
                    // Determine unit based on minimum order quantity
                    const unitLabel = item.minOrderQty === 1 ? 'roll' : 'sheet';
                    return (
                      <div className="text-right">
                        <span className="text-sm text-gray-600">${item.pricePerSheet.toFixed(2)}</span>
                        <div className="text-xs text-gray-400">/{unitLabel}</div>
                      </div>
                    );
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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-gray-300 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
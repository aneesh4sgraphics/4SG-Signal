import { useState, useMemo, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, Search, RefreshCw, Download, CheckCircle2, Check,
  Edit2, Package, Layers, Save, X, AlertCircle, Plus, Trash2, Ban, Merge,
  ChevronUp, ChevronDown, DollarSign, ExternalLink
} from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface Product {
  id: number;
  itemCode: string;
  odooItemCode: string | null;
  productName: string;
  productType: string;
  productTypeId: number | null;
  catalogCategoryId: number | null;
  size: string;
  totalSqm: string;
  rollSheet: string | null;
  unitOfMeasure: string | null;
  dealerPrice: string | null;
  retailPrice: string | null;
  updatedAt: string;
  uploadBatch: string | null;
  isQuickQuoteEligible: boolean;
}

interface Category {
  id: number;
  name: string;
}

interface ProductType {
  id: number;
  categoryId: number;
  name: string;
  description: string | null;
}

interface UnmappedResponse {
  success: boolean;
  products: Product[];
  excludedProducts: Product[];
  totalFiltered: number;
  counts: {
    all: number;
    unmapped: number;
    noSize: number;
    noSqm: number;
    incomplete: number;
    excluded: number;
    newInLast7Days: number;
  };
  categories: Category[];
  types: ProductType[];
}

interface StaleMapping {
  mappingId: number;
  itemCode: string;
  odooProductId: number;
  odooProductName: string | null;
  reason: 'archived' | 'not_found';
}

interface ValidationResult {
  stale: StaleMapping[];
  total: number;
}

interface DuplicateTypeEntry {
  id: number;
  code: string;
  label: string;
  skus: string[] | null;
}

interface DuplicateGroup {
  category_id: number;
  category_name: string;
  type_label: string;
  types: DuplicateTypeEntry[];
  type_count: number;
}

const ODOO_AUTO_CHECK_KEY = 'odoo_last_auto_check_ts';
const ODOO_AUTO_CHECK_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

export default function ProductMapping() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('unmapped');
  const [searchQuery, setSearchQuery] = useState('');
  const [excludedSearchQuery, setExcludedSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  
  // Mapping dialog state
  const [mappingProduct, setMappingProduct] = useState<Product | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string>('');
  const [selectedType, setSelectedType] = useState<string>('');
  const [selectedSize, setSelectedSize] = useState<string>('');
  const [selectedSqm, setSelectedSqm] = useState<string>('0');
  const [selectedPackingType, setSelectedPackingType] = useState<string>('');
  const [sheetsPerPack, setSheetsPerPack] = useState<string>('1');
  
  // Category/Type management
  const [showAddCategory, setShowAddCategory] = useState(false);
  const [showAddType, setShowAddType] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [newTypeName, setNewTypeName] = useState('');
  const [newTypeCategory, setNewTypeCategory] = useState<string>('');
  
  // Confirm dialogs
  const [showImportConfirm, setShowImportConfirm] = useState(false);
  
  // Type management dialogs
  const [typeToDelete, setTypeToDelete] = useState<ProductType | null>(null);
  const [typeToMerge, setTypeToMerge] = useState<ProductType | null>(null);
  const [mergeTargetId, setMergeTargetId] = useState<string>('');
  const [isMergingCatalogType, setIsMergingCatalogType] = useState(false);
  
  // Category/Type editing
  const [editingCategoryId, setEditingCategoryId] = useState<number | null>(null);
  const [editingTypeId, setEditingTypeId] = useState<number | null>(null);
  const [editCategoryName, setEditCategoryName] = useState('');
  const [editTypeName, setEditTypeName] = useState('');
  
  // Category selection for filtering types in Categories & Types tab
  const [selectedCategoryForTypes, setSelectedCategoryForTypes] = useState<number | null>(null);

  // Mapping validation state
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [deletingStaleIds, setDeletingStaleIds] = useState<Set<number>>(new Set());

  // Fetch unmapped products
  const { data: unmappedData, isLoading: loadingProducts, refetch: refetchProducts } = useQuery<UnmappedResponse>({
    queryKey: ['/api/products/unmapped'],
  });

  // Fetch categories
  const { data: categoriesData, refetch: refetchCategories } = useQuery<Category[]>({
    queryKey: ['/api/product-categories'],
  });

  // Fetch product types
  const { data: typesData, refetch: refetchTypes } = useQuery<ProductType[]>({
    queryKey: ['/api/product-types'],
  });

  // Fetch duplicate product types
  const { data: duplicatesData, isLoading: loadingDuplicates, refetch: refetchDuplicates } = useQuery<DuplicateGroup[]>({
    queryKey: ['/api/product-types/duplicates'],
    enabled: activeTab === 'duplicates',
  });

  const categories = categoriesData || [];
  const types = typesData || [];
  const products = unmappedData?.products || [];
  const excludedProducts = unmappedData?.excludedProducts || [];
  const counts = unmappedData?.counts || { all: 0, unmapped: 0, noSize: 0, noSqm: 0, incomplete: 0, excluded: 0, newInLast7Days: 0 };

  // Filter products based on tab and search
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by tab
    if (activeTab === 'unmapped') {
      filtered = filtered.filter(p => !p.catalogCategoryId || !p.productTypeId);
      // Sort newest first so recently imported products are at the top
      filtered = [...filtered].sort((a, b) =>
        new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
      );
    } else if (activeTab === 'mapped') {
      filtered = filtered.filter(p => p.catalogCategoryId && p.productTypeId);
    }
    
    // Filter by category
    if (selectedCategoryFilter !== 'all') {
      filtered = filtered.filter(p => p.catalogCategoryId?.toString() === selectedCategoryFilter);
    }
    
    // Filter by search
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(p => 
        p.itemCode.toLowerCase().includes(query) ||
        p.productName.toLowerCase().includes(query) ||
        p.productType.toLowerCase().includes(query)
      );
    }
    
    return filtered;
  }, [products, activeTab, selectedCategoryFilter, searchQuery]);

  // Filter excluded products by search
  const filteredExcludedProducts = useMemo(() => {
    if (!excludedSearchQuery) return excludedProducts;
    const query = excludedSearchQuery.toLowerCase();
    return excludedProducts.filter(p => 
      p.itemCode.toLowerCase().includes(query) ||
      p.productName.toLowerCase().includes(query) ||
      p.productType.toLowerCase().includes(query)
    );
  }, [excludedProducts, excludedSearchQuery]);

  // Check if a mapped product would be excluded from QuickQuotes due to missing pricing.
  // Uses the isQuickQuoteEligible field computed server-side, which applies the same
  // 10-field hasAnyPrice rule as routes-pricing-database.ts lines 653-658.
  const isUnpriced = (product: Product) => !product.isQuickQuoteEligible;

  // Count mapped products with no pricing
  const unpricedMappedCount = useMemo(() => {
    return products.filter(p => p.catalogCategoryId && p.productTypeId && isUnpriced(p)).length;
  }, [products]);

  // Get types for selected category (mapping dialog) - sorted alphabetically
  const filteredTypes = useMemo(() => {
    if (!selectedCategory) return [];
    return types
      .filter(t => t.categoryId.toString() === selectedCategory)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [types, selectedCategory]);

  // Get types filtered by selected category in Categories & Types tab - sorted alphabetically
  const typesForCategoryTab = useMemo(() => {
    const filtered = selectedCategoryForTypes === null 
      ? types 
      : types.filter(t => t.categoryId === selectedCategoryForTypes);
    return [...filtered].sort((a, b) => {
      const orderDiff = (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
      if (orderDiff !== 0) return orderDiff;
      return a.id - b.id;
    });
  }, [types, selectedCategoryForTypes]);

  // Import from Odoo mutation
  const importFromOdoo = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/products/import-all-from-odoo');
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: 'Import Complete',
        description: `Imported ${data.imported} products from Odoo. ${data.skipped} skipped.`,
      });
      refetchProducts();
      setShowImportConfirm(false);
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Import Failed',
        description: error.message,
      });
    },
  });

  // Pass { silent: true } for background auto-check (no toast); omit for manual button press
  const checkOdooNewProducts = useMutation({
    mutationFn: async ({ silent = false }: { silent?: boolean } = {}) => {
      const res = await apiRequest('POST', '/api/odoo/sync-new-products');
      return { ...(await res.json()), silent };
    },
    onSuccess: ({ silent }) => {
      if (silent) {
        localStorage.setItem(ODOO_AUTO_CHECK_KEY, String(Date.now()));
      } else {
        toast({
          title: 'Check Complete',
          description: 'Odoo checked for new products. Any new ones are now in the Unmapped tab.',
        });
      }
      refetchProducts();
    },
    onError: (error: Error) => {
      toast({
        variant: 'destructive',
        title: 'Check Failed',
        description: error.message,
      });
    },
  });

  // Auto-check runs silently on page load; track it separately so the status indicator
  // only shows during the background check, not during manual button presses
  const isAutoChecking = checkOdooNewProducts.isPending && checkOdooNewProducts.variables?.silent === true;

  useEffect(() => {
    const lastCheck = parseInt(localStorage.getItem(ODOO_AUTO_CHECK_KEY) || '0', 10);
    if (Date.now() - lastCheck >= ODOO_AUTO_CHECK_COOLDOWN_MS) {
      checkOdooNewProducts.mutate({ silent: true });
    }
  }, []);

  // Update product mapping mutation
  const updateMapping = useMutation({
    mutationFn: async (data: { productId: number; categoryId: number; typeId: number; size: string; totalSqm: string; rollSheet: string; minQuantity: number }) => {
      const res = await apiRequest('PATCH', `/api/products/${data.productId}/mapping`, {
        catalogCategoryId: data.categoryId,
        productTypeId: data.typeId,
        size: data.size,
        totalSqm: data.totalSqm,
        rollSheet: data.rollSheet,
        minQuantity: data.minQuantity,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Product mapped successfully' });
      refetchProducts();
      setMappingProduct(null);
      resetMappingForm();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to map product', description: error.message });
    },
  });

  // Add category mutation
  const addCategory = useMutation({
    mutationFn: async (name: string) => {
      const res = await apiRequest('POST', '/api/product-categories', { name });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Category added' });
      refetchCategories();
      setShowAddCategory(false);
      setNewCategoryName('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add category', description: error.message });
    },
  });

  // Add type mutation
  const addType = useMutation({
    mutationFn: async (data: { name: string; categoryId: number }) => {
      const res = await apiRequest('POST', '/api/product-types', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Type added' });
      refetchTypes();
      setShowAddType(false);
      setNewTypeName('');
      setNewTypeCategory('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to add type', description: error.message });
    },
  });

  const deleteType = useMutation({
    mutationFn: async (typeId: number) => {
      const res = await apiRequest('DELETE', `/api/product-types/${typeId}`);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Type deleted' });
      refetchTypes();
      refetchProducts();
      setTypeToDelete(null);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to delete type', description: error.message });
    },
  });

  const mergeTypes = useMutation({
    mutationFn: async (data: { sourceTypeId: number; targetTypeId: number }) => {
      const res = await apiRequest('POST', '/api/product-types/merge', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Types merged successfully' });
      refetchTypes();
      refetchProducts();
      refetchDuplicates();
      setTypeToMerge(null);
      setMergeTargetId('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to merge types', description: error.message });
    },
  });

  // Update category name
  const updateCategory = useMutation({
    mutationFn: async (data: { id: number; name: string }) => {
      const res = await apiRequest('PATCH', `/api/product-categories/${data.id}`, { name: data.name });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Category updated' });
      refetchCategories();
      setEditingCategoryId(null);
      setEditCategoryName('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update category', description: error.message });
    },
  });

  // Update type name
  const updateType = useMutation({
    mutationFn: async (data: { id: number; name: string }) => {
      const res = await apiRequest('PATCH', `/api/product-types/${data.id}`, { name: data.name });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Type updated' });
      refetchTypes();
      refetchDuplicates();
      setEditingTypeId(null);
      setEditTypeName('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to update type', description: error.message });
    },
  });

  const reorderCategories = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await apiRequest('PATCH', '/api/product-categories/reorder', { orderedIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-categories'] });
      refetchCategories();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to reorder categories', description: error.message });
    },
  });

  const reorderTypes = useMutation({
    mutationFn: async (orderedIds: number[]) => {
      const res = await apiRequest('PATCH', '/api/product-types/reorder', { orderedIds });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/product-types'] });
      refetchTypes();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to reorder types', description: error.message });
    },
  });

  const updateCatalogType = useMutation({
    mutationFn: async (data: { id: number; label: string }) => {
      const res = await apiRequest('PATCH', `/api/catalog-product-types/${data.id}`, { label: data.label });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Type renamed' });
      refetchDuplicates();
      setEditingTypeId(null);
      setEditTypeName('');
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to rename type', description: error.message });
    },
  });

  const mergeCatalogTypes = useMutation({
    mutationFn: async (data: { sourceTypeId: number; targetTypeId: number }) => {
      const res = await apiRequest('POST', '/api/catalog-product-types/merge', data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Types merged successfully' });
      refetchDuplicates();
      refetchProducts();
      setTypeToMerge(null);
      setMergeTargetId('');
      setIsMergingCatalogType(false);
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to merge types', description: error.message });
    },
  });

  // Do Not Map mutation - archives the product so it won't appear in QuickQuotes/Price List
  const doNotMap = useMutation({
    mutationFn: async (productId: number) => {
      const res = await apiRequest('PATCH', `/api/products/${productId}/mapping`, {
        isArchived: true,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Product excluded', description: 'Product will not appear in QuickQuotes or Price List' });
      refetchProducts();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to exclude product', description: error.message });
    },
  });

  // Restore mutation - unarchives the product so it can be mapped again
  const restoreProduct = useMutation({
    mutationFn: async (productId: number) => {
      const res = await apiRequest('PATCH', `/api/products/${productId}/mapping`, {
        isArchived: false,
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Product restored', description: 'Product is now available for mapping' });
      refetchProducts();
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Failed to restore product', description: error.message });
    },
  });

  const validateMappings = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/odoo/product-mappings/validate');
      if (!res.ok) throw new Error(await res.text());
      return res.json() as Promise<ValidationResult>;
    },
    onSuccess: (data) => {
      setValidationResult(data);
      setShowValidationDialog(true);
      if (data.stale.length === 0) {
        toast({ title: 'All mappings are healthy', description: `Checked ${data.total} mappings — none point to archived products.` });
      }
    },
    onError: (error: Error) => {
      toast({ variant: 'destructive', title: 'Validation failed', description: error.message });
    },
  });

  const deleteStaleMapping = async (mappingId: number) => {
    setDeletingStaleIds(prev => new Set(prev).add(mappingId));
    try {
      await apiRequest('DELETE', `/api/odoo/product-mappings/${mappingId}`);
      setValidationResult(prev => prev ? { ...prev, stale: prev.stale.filter(s => s.mappingId !== mappingId) } : prev);
      toast({ title: 'Stale mapping removed', description: 'The mapping to the archived Odoo product has been cleared.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Delete failed', description: err.message });
    } finally {
      setDeletingStaleIds(prev => { const s = new Set(prev); s.delete(mappingId); return s; });
    }
  };

  const deleteAllStaleMappings = async () => {
    if (!validationResult) return;
    const ids = validationResult.stale.map(s => s.mappingId);
    setDeletingStaleIds(new Set(ids));
    try {
      await Promise.all(ids.map(id => apiRequest('DELETE', `/api/odoo/product-mappings/${id}`)));
      setValidationResult(prev => prev ? { ...prev, stale: [] } : prev);
      toast({ title: `Cleared ${ids.length} stale mappings`, description: 'These products will need to be re-mapped to active Odoo products.' });
    } catch (err: any) {
      toast({ variant: 'destructive', title: 'Bulk delete failed', description: err.message });
    } finally {
      setDeletingStaleIds(new Set());
    }
  };

  const resetMappingForm = () => {
    setSelectedCategory('');
    setSelectedType('');
    setSelectedSize('');
    setSelectedSqm('0');
    setSelectedPackingType('');
    setSheetsPerPack('1');
  };

  const openMappingDialog = (product: Product) => {
    setMappingProduct(product);
    setSelectedCategory(product.catalogCategoryId?.toString() || '');
    setSelectedType(product.productTypeId?.toString() || '');
    setSelectedSize(product.size || '');
    setSelectedSqm(product.totalSqm || '0');
    setSelectedPackingType(product.rollSheet || '');
    setSheetsPerPack('1');
  };

  const handleSaveMapping = () => {
    if (!mappingProduct || !selectedCategory || !selectedType) {
      toast({ variant: 'destructive', title: 'Please select category and type' });
      return;
    }
    
    // For Packet/Carton, sheets per pack becomes min order quantity
    const minQuantity = (selectedPackingType === 'Packet' || selectedPackingType === 'Carton') 
      ? parseInt(sheetsPerPack) || 1 
      : 1;
    
    updateMapping.mutate({
      productId: mappingProduct.id,
      categoryId: parseInt(selectedCategory),
      typeId: parseInt(selectedType),
      size: selectedSize || 'Standard',
      totalSqm: selectedSqm || '0',
      rollSheet: selectedPackingType,
      minQuantity: minQuantity,
    });
  };

  // Parse size from product code
  // Handles formats like: "GOSF05-21x30", "GOSF08-13x19", "PP11-1319", "PP1117B"
  const parseSizeFromCode = (code: string): string => {
    // First try format with explicit "x" separator: "GOSF05-21x30" -> "21x30"
    const explicitMatch = code.match(/(\d+)x(\d+)/i);
    if (explicitMatch) {
      return `${explicitMatch[1]}x${explicitMatch[2]}`;
    }
    // Fallback: 4-digit pattern at end like "1319B" -> "13x19"
    const implicitMatch = code.match(/(\d{2})(\d{2})([A-Z]?)$/);
    if (implicitMatch) {
      return `${implicitMatch[1]}x${implicitMatch[2]}`;
    }
    return '';
  };

  // Calculate SqM from size based on packing type
  // Sheets/Packet/Carton/Unit: both dimensions in inches (e.g., 13x19 = 13in x 19in)
  // Roll: first dimension in inches, second in feet (e.g., 24x40 = 24in x 40ft)
  // For Sheets/Packet/Carton: multiply by number of sheets to get total SqM per pack
  const calculateSqm = (size: string, packingType: string, numSheets: number = 1): string => {
    const match = size.match(/(\d+\.?\d*)x(\d+\.?\d*)/i);
    if (match) {
      const dim1 = parseFloat(match[1]);
      const dim2 = parseFloat(match[2]);
      
      let squareInches: number;
      
      if (packingType === 'Roll') {
        // Roll: first is inches (width), second is feet (length)
        // Convert feet to inches: dim2 * 12
        squareInches = dim1 * (dim2 * 12);
      } else {
        // Sheets, Packet, Carton, Unit: both are inches
        squareInches = dim1 * dim2;
      }
      
      // Convert square inches to square meters: 1 sq inch = 0.00064516 sq meters
      let sqm = squareInches * 0.00064516;
      
      // For Sheets, Packet, Carton: multiply by number of sheets per pack
      if (packingType === 'Sheets' || packingType === 'Packet' || packingType === 'Carton') {
        sqm = sqm * numSheets;
      }
      
      return sqm.toFixed(4);
    }
    return '0';
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b bg-card">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/admin">
                <Button variant="ghost" size="sm" data-testid="link-back">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold">Product Mapping</h1>
                {isAutoChecking ? (
                  <p className="text-muted-foreground text-sm flex items-center gap-1.5">
                    <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Checking Odoo for new products…
                  </p>
                ) : (
                  <p className="text-muted-foreground text-sm">
                    Assign categories and types to products imported from Odoo
                  </p>
                )}
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => validateMappings.mutate()}
                disabled={validateMappings.isPending}
                data-testid="button-validate-mappings"
              >
                {validateMappings.isPending ? (
                  <><span className="mr-2 h-4 w-4 inline-block animate-spin rounded-full border-2 border-current border-t-transparent" />Checking…</>
                ) : (
                  <><CheckCircle2 className="h-4 w-4 mr-2" />Validate Odoo Mappings</>
                )}
              </Button>
              <Button 
                variant="outline" 
                onClick={() => refetchProducts()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button
                variant="outline"
                onClick={() => checkOdooNewProducts.mutate()}
                disabled={checkOdooNewProducts.isPending}
                data-testid="button-sync-new-odoo"
                title="Check Odoo for new products added since last import and add them to the Unmapped tab"
              >
                {checkOdooNewProducts.isPending ? (
                  <><span className="mr-2 h-4 w-4 inline-block animate-spin rounded-full border-2 border-current border-t-transparent" />Syncing…</>
                ) : (
                  <><RefreshCw className="h-4 w-4 mr-2" />Sync New from Odoo</>
                )}
              </Button>
              <Button 
                onClick={() => setShowImportConfirm(true)}
                disabled={importFromOdoo.isPending}
                data-testid="button-import-odoo"
              >
                <Download className="h-4 w-4 mr-2" />
                Import from Odoo
              </Button>
            </div>
          </div>
        </div>
      </div>

      {/* Stats */}
      <div className="container mx-auto px-4 py-4">
        <div className="grid grid-cols-5 gap-4 mb-6">
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{counts.all}</div>
              <div className="text-sm text-muted-foreground">Total Products</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-primary">{counts.unmapped}</div>
              <div className="text-sm text-muted-foreground">Unmapped</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold text-green-600">{counts.all - counts.unmapped}</div>
              <div className="text-sm text-muted-foreground">Mapped</div>
            </CardContent>
          </Card>
          <Card className={unpricedMappedCount > 0 ? 'border-amber-400' : ''}>
            <CardContent className="pt-4">
              <div className={`text-2xl font-bold ${unpricedMappedCount > 0 ? 'text-amber-600' : 'text-muted-foreground'}`}>
                {unpricedMappedCount}
              </div>
              <div className="text-sm text-muted-foreground">Needs Pricing</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4">
              <div className="text-2xl font-bold">{categories.length}</div>
              <div className="text-sm text-muted-foreground">Categories</div>
            </CardContent>
          </Card>
        </div>

        {/* Main Content with Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-4">
            <TabsTrigger value="unmapped" data-testid="tab-unmapped">
              <AlertCircle className="h-4 w-4 mr-2" />
              Unmapped ({counts.unmapped})
              {counts.newInLast7Days > 0 && (
                <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-700">
                  {counts.newInLast7Days} new
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="mapped" data-testid="tab-mapped">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mapped ({counts.all - counts.unmapped})
            </TabsTrigger>
            <TabsTrigger value="excluded" data-testid="tab-excluded">
              <Ban className="h-4 w-4 mr-2" />
              Excluded ({counts.excluded})
            </TabsTrigger>
            <TabsTrigger value="categories" data-testid="tab-categories">
              <Layers className="h-4 w-4 mr-2" />
              Categories & Types
            </TabsTrigger>
            <TabsTrigger value="duplicates" data-testid="tab-duplicates">
              <AlertCircle className="h-4 w-4 mr-2" />
              Duplicated
            </TabsTrigger>
          </TabsList>

          {/* Unmapped / Mapped Products Tab */}
          <TabsContent value="unmapped" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Unmapped Products</CardTitle>
                    {counts.newInLast7Days > 0 && (
                      <p className="text-sm text-blue-600 mt-1">
                        {counts.newInLast7Days} new from Odoo in the last 7 days — showing newest first
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => checkOdooNewProducts.mutate()}
                      disabled={checkOdooNewProducts.isPending}
                    >
                      <RefreshCw className={cn("h-4 w-4 mr-2", checkOdooNewProducts.isPending && "animate-spin")} />
                      {checkOdooNewProducts.isPending ? 'Checking...' : 'Check Odoo for New'}
                    </Button>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                        data-testid="input-search"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingProducts ? (
                  <div className="text-center py-8 text-muted-foreground">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {counts.unmapped === 0 ? 'All products are mapped!' : 'No products match your search'}
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {filteredProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                          data-testid={`product-row-${product.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-mono text-sm font-medium">{product.itemCode}</span>
                              <Badge variant="outline" className="text-amber-600 border-amber-600">
                                Unmapped
                              </Badge>
                              {product.uploadBatch && (
                                <span className="text-xs text-muted-foreground bg-slate-100 px-2 py-0.5 rounded">
                                  {product.uploadBatch.replace('odoo-auto-sync-', 'Auto-sync ').replace('odoo-import-', 'Imported ').replace('odoo-fresh-import-', 'Synced ')}
                                </span>
                              )}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {product.productName}
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              onClick={() => openMappingDialog(product)}
                              data-testid={`button-map-${product.id}`}
                            >
                              <Edit2 className="h-4 w-4 mr-2" />
                              Map
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => doNotMap.mutate(product.id)}
                              disabled={doNotMap.isPending}
                              className="text-gray-600 border-gray-200 hover:bg-gray-50"
                              data-testid={`button-exclude-${product.id}`}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Exclude
                            </Button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="mapped" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Mapped Products</CardTitle>
                  <div className="flex gap-2">
                    <Select value={selectedCategoryFilter} onValueChange={setSelectedCategoryFilter}>
                      <SelectTrigger className="w-48" data-testid="select-category-filter">
                        <SelectValue placeholder="Filter by category" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Categories</SelectItem>
                        {categories.map((cat) => (
                          <SelectItem key={cat.id} value={cat.id.toString()}>
                            {cat.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search products..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9 w-64"
                        data-testid="input-search-mapped"
                      />
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {loadingProducts ? (
                  <div className="text-center py-8 text-muted-foreground">Loading products...</div>
                ) : filteredProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">No mapped products found</div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {filteredProducts.map((product) => {
                        const category = categories.find(c => c.id === product.catalogCategoryId);
                        const type = types.find(t => t.id === product.productTypeId);
                        const unpriced = isUnpriced(product);
                        return (
                          <div
                            key={product.id}
                            className={`flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors ${unpriced ? 'border-amber-300 bg-amber-50/40 dark:bg-amber-950/20' : ''}`}
                            data-testid={`product-row-mapped-${product.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-mono text-sm font-medium">{product.itemCode}</span>
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  {category?.name || 'Unknown'}
                                </Badge>
                                <Badge variant="secondary">
                                  {type?.name || 'Unknown'}
                                </Badge>
                                {unpriced && (
                                  <Badge variant="outline" className="text-amber-600 border-amber-400 bg-amber-50 dark:bg-amber-950/40 gap-1">
                                    <DollarSign className="h-3 w-3" />
                                    No pricing — hidden from QuickQuotes
                                  </Badge>
                                )}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {product.productName} | Size: {product.size} | Total SqM per Pack: {product.totalSqm}
                              </div>
                            </div>
                            <div className="flex items-center gap-2">
                              {unpriced && (
                                <Link href="/product-pricing-management">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-amber-600 border-amber-400 hover:bg-amber-50"
                                    title="Set pricing so this product appears in QuickQuotes"
                                    data-testid={`button-set-pricing-${product.id}`}
                                  >
                                    <DollarSign className="h-4 w-4 mr-1" />
                                    Set Pricing
                                    <ExternalLink className="h-3 w-3 ml-1" />
                                  </Button>
                                </Link>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openMappingDialog(product)}
                                data-testid={`button-edit-${product.id}`}
                              >
                                <Edit2 className="h-4 w-4 mr-2" />
                                Edit
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Excluded Products Tab */}
          <TabsContent value="excluded" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Excluded Products</CardTitle>
                  <div className="text-sm text-muted-foreground">
                    Products excluded from QuickQuotes and Price List. Restore to map them later.
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                {/* Search Input */}
                <div className="flex items-center gap-4 mb-4">
                  <div className="relative flex-1 max-w-md">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search excluded products by SKU, name, or type..."
                      className="pl-10"
                      value={excludedSearchQuery}
                      onChange={(e) => setExcludedSearchQuery(e.target.value)}
                      data-testid="input-excluded-search"
                    />
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {filteredExcludedProducts.length} of {excludedProducts.length} products
                  </div>
                </div>
                {loadingProducts ? (
                  <div className="text-center py-8 text-muted-foreground">Loading products...</div>
                ) : filteredExcludedProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    {excludedSearchQuery ? 'No products match your search' : 'No excluded products'}
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-2">
                      {filteredExcludedProducts.map((product) => (
                        <div
                          key={product.id}
                          className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                          data-testid={`product-row-excluded-${product.id}`}
                        >
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{product.itemCode}</span>
                              <Badge variant="outline" className="text-gray-500 border-gray-400">
                                Excluded
                              </Badge>
                            </div>
                            <div className="text-sm text-muted-foreground mt-1">
                              {product.productName} | {product.productType}
                            </div>
                          </div>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => restoreProduct.mutate(product.id)}
                            disabled={restoreProduct.isPending}
                            className="text-green-600 border-green-200 hover:bg-green-50"
                            data-testid={`button-restore-${product.id}`}
                          >
                            <RefreshCw className="h-4 w-4 mr-2" />
                            Restore
                          </Button>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Categories & Types Tab */}
          <TabsContent value="categories" className="space-y-4">
            <div className="grid grid-cols-2 gap-6">
              {/* Categories */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>Categories</CardTitle>
                    <Button size="sm" onClick={() => setShowAddCategory(true)} data-testid="button-add-category">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Category
                    </Button>
                  </div>
                  <CardDescription>Click a category to filter types on the right</CardDescription>
                </CardHeader>
                <CardContent>
                  {/* Show All button */}
                  <Button
                    size="sm"
                    variant={selectedCategoryForTypes === null ? "default" : "outline"}
                    className="mb-3 w-full"
                    onClick={() => setSelectedCategoryForTypes(null)}
                  >
                    Show All Types ({types.length})
                  </Button>
                  <ScrollArea className="h-[360px]">
                    <div className="space-y-2">
                      {categories.map((cat) => {
                        const typeCount = types.filter(t => t.categoryId === cat.id).length;
                        const productCount = products.filter(p => p.catalogCategoryId === cat.id).length;
                        const isSelected = selectedCategoryForTypes === cat.id;
                        const isEditing = editingCategoryId === cat.id;
                        
                        return (
                          <div
                            key={cat.id}
                            className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-colors ${
                              isSelected ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                            }`}
                            onClick={() => !isEditing && setSelectedCategoryForTypes(cat.id)}
                            data-testid={`category-row-${cat.id}`}
                          >
                            <div className="flex-1">
                              {isEditing ? (
                                <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                                  <Input
                                    value={editCategoryName}
                                    onChange={(e) => setEditCategoryName(e.target.value)}
                                    className="h-8"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && editCategoryName.trim()) {
                                        updateCategory.mutate({ id: cat.id, name: editCategoryName });
                                      } else if (e.key === 'Escape') {
                                        setEditingCategoryId(null);
                                        setEditCategoryName('');
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      if (editCategoryName.trim()) {
                                        updateCategory.mutate({ id: cat.id, name: editCategoryName });
                                      }
                                    }}
                                    disabled={updateCategory.isPending}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingCategoryId(null);
                                      setEditCategoryName('');
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div className="font-medium">{cat.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {typeCount} types • {productCount} products
                                  </div>
                                </>
                              )}
                            </div>
                            {!isEditing && (
                              <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={categories.indexOf(cat) === 0 || reorderCategories.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const idx = categories.indexOf(cat);
                                    if (idx <= 0) return;
                                    const newOrder = [...categories];
                                    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                                    reorderCategories.mutate(newOrder.map(c => c.id));
                                  }}
                                  title="Move up"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={categories.indexOf(cat) === categories.length - 1 || reorderCategories.isPending}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    const idx = categories.indexOf(cat);
                                    if (idx >= categories.length - 1) return;
                                    const newOrder = [...categories];
                                    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                    reorderCategories.mutate(newOrder.map(c => c.id));
                                  }}
                                  title="Move down"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setEditingCategoryId(cat.id);
                                    setEditCategoryName(cat.name);
                                  }}
                                  title="Edit category name"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>

              {/* Product Types */}
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle>
                      Product Types
                      {selectedCategoryForTypes !== null && (
                        <span className="text-sm font-normal text-muted-foreground ml-2">
                          ({categories.find(c => c.id === selectedCategoryForTypes)?.name})
                        </span>
                      )}
                    </CardTitle>
                    <Button size="sm" onClick={() => setShowAddType(true)} data-testid="button-add-type">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Type
                    </Button>
                  </div>
                  <CardDescription>
                    {selectedCategoryForTypes !== null 
                      ? `Showing ${typesForCategoryTab.length} types for selected category`
                      : `Showing all ${types.length} product types`
                    }
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {typesForCategoryTab.map((type) => {
                        const category = categories.find(c => c.id === type.categoryId);
                        const productCount = products.filter(p => p.productTypeId === type.id).length;
                        const isEditing = editingTypeId === type.id;
                        
                        return (
                          <div
                            key={type.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`type-row-${type.id}`}
                          >
                            <div className="flex-1">
                              {isEditing ? (
                                <div className="flex gap-2">
                                  <Input
                                    value={editTypeName}
                                    onChange={(e) => setEditTypeName(e.target.value)}
                                    className="h-8"
                                    autoFocus
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter' && editTypeName.trim()) {
                                        updateType.mutate({ id: type.id, name: editTypeName });
                                      } else if (e.key === 'Escape') {
                                        setEditingTypeId(null);
                                        setEditTypeName('');
                                      }
                                    }}
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      if (editTypeName.trim()) {
                                        updateType.mutate({ id: type.id, name: editTypeName });
                                      }
                                    }}
                                    disabled={updateType.isPending}
                                  >
                                    <Check className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setEditingTypeId(null);
                                      setEditTypeName('');
                                    }}
                                  >
                                    <X className="h-4 w-4" />
                                  </Button>
                                </div>
                              ) : (
                                <>
                                  <div className="font-medium">{type.name}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {category?.name || 'Unknown'} • {productCount} products
                                  </div>
                                </>
                              )}
                            </div>
                            {!isEditing && (
                              <div className="flex gap-1">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={typesForCategoryTab.indexOf(type) === 0 || reorderTypes.isPending}
                                  onClick={() => {
                                    const idx = typesForCategoryTab.indexOf(type);
                                    if (idx <= 0) return;
                                    const newOrder = [...typesForCategoryTab];
                                    [newOrder[idx - 1], newOrder[idx]] = [newOrder[idx], newOrder[idx - 1]];
                                    reorderTypes.mutate(newOrder.map(t => t.id));
                                  }}
                                  title="Move up"
                                >
                                  <ChevronUp className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  disabled={typesForCategoryTab.indexOf(type) === typesForCategoryTab.length - 1 || reorderTypes.isPending}
                                  onClick={() => {
                                    const idx = typesForCategoryTab.indexOf(type);
                                    if (idx >= typesForCategoryTab.length - 1) return;
                                    const newOrder = [...typesForCategoryTab];
                                    [newOrder[idx], newOrder[idx + 1]] = [newOrder[idx + 1], newOrder[idx]];
                                    reorderTypes.mutate(newOrder.map(t => t.id));
                                  }}
                                  title="Move down"
                                >
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditingTypeId(type.id);
                                    setEditTypeName(type.name);
                                  }}
                                  title="Edit type name"
                                >
                                  <Edit2 className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setTypeToMerge(type)}
                                  title="Merge into another type"
                                  data-testid={`button-merge-type-${type.id}`}
                                >
                                  <Merge className="h-4 w-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => setTypeToDelete(type)}
                                  className="text-destructive hover:text-destructive"
                                  title="Delete type"
                                  data-testid={`button-delete-type-${type.id}`}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Duplicated Types Tab */}
          <TabsContent value="duplicates" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>Duplicate Product Types</CardTitle>
                    <p className="text-sm text-muted-foreground mt-1">
                      Product types sharing the same name within a category. Rename or merge them to differentiate variants.
                    </p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => refetchDuplicates()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                {loadingDuplicates ? (
                  <div className="text-center py-8 text-muted-foreground">Loading duplicates...</div>
                ) : !duplicatesData || duplicatesData.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle2 className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No duplicate type names found.
                  </div>
                ) : (
                  <div className="space-y-4">
                    {duplicatesData.map((group) => (
                      <div key={`${group.category_id}-${group.type_label}`} className="border rounded-lg overflow-hidden">
                        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2">
                          <div className="flex items-center gap-2">
                            <AlertCircle className="h-4 w-4 text-amber-600" />
                            <span className="font-medium text-amber-900">"{group.type_label}"</span>
                            <span className="text-sm text-amber-700">— {group.type_count} types in</span>
                            <Badge variant="outline" className="text-amber-700 border-amber-400">
                              {group.category_name}
                            </Badge>
                          </div>
                        </div>
                        <div className="divide-y">
                          {group.types.map((entry) => {
                            const isEditing = editingTypeId === entry.id;
                            return (
                              <div key={entry.id} className="px-4 py-3 flex items-start justify-between gap-4">
                                <div className="flex-1 min-w-0">
                                  {isEditing ? (
                                    <div className="flex items-center gap-2">
                                      <Input
                                        value={editTypeName}
                                        onChange={(e) => setEditTypeName(e.target.value)}
                                        className="h-8 text-sm w-64"
                                        autoFocus
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') updateCatalogType.mutate({ id: entry.id, label: editTypeName });
                                          if (e.key === 'Escape') { setEditingTypeId(null); setEditTypeName(''); }
                                        }}
                                      />
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => updateCatalogType.mutate({ id: entry.id, label: editTypeName })}
                                        disabled={updateCatalogType.isPending}
                                      >
                                        <Check className="h-4 w-4" />
                                      </Button>
                                      <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => { setEditingTypeId(null); setEditTypeName(''); }}
                                      >
                                        <X className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  ) : (
                                    <button
                                      className="font-medium text-sm text-left hover:underline hover:text-primary cursor-pointer"
                                      onClick={() => {
                                        setEditingTypeId(entry.id);
                                        setEditTypeName(entry.label);
                                      }}
                                      title="Click to rename"
                                    >
                                      {entry.label}
                                    </button>
                                  )}
                                  <div className="text-xs text-muted-foreground mt-1 font-mono">{entry.code}</div>
                                  {entry.skus && entry.skus.length > 0 ? (
                                    <div className="text-xs text-muted-foreground mt-1">
                                      <span className="font-medium">{entry.skus.length} SKU{entry.skus.length !== 1 ? 's' : ''}:</span>{' '}
                                      {entry.skus.join(', ')}
                                    </div>
                                  ) : (
                                    <div className="text-xs text-muted-foreground/60 mt-1 italic">No active SKUs</div>
                                  )}
                                </div>
                                {!isEditing && (
                                  <div className="flex gap-1 shrink-0">
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setEditingTypeId(entry.id);
                                        setEditTypeName(entry.label);
                                      }}
                                      title="Rename this type"
                                    >
                                      <Edit2 className="h-4 w-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      onClick={() => {
                                        setTypeToMerge({ id: entry.id, categoryId: group.category_id, name: entry.label, description: null });
                                        setIsMergingCatalogType(true);
                                      }}
                                      title="Merge into another type"
                                    >
                                      <Merge className="h-4 w-4" />
                                    </Button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Mapping Dialog */}
      <Dialog open={!!mappingProduct} onOpenChange={() => setMappingProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Product</DialogTitle>
            <DialogDescription>
              Assign category, type, size, and dimensions to this product
            </DialogDescription>
          </DialogHeader>
          
          {mappingProduct && (
            <div className="space-y-4">
              {/* Product Info */}
              <div className="p-3 bg-muted rounded-lg">
                <div className="font-mono text-sm font-medium">{mappingProduct.itemCode}</div>
                <div className="text-sm text-muted-foreground">{mappingProduct.productName}</div>
              </div>

              {/* Category Select */}
              <div className="space-y-2">
                <Label>Category</Label>
                <Select 
                  value={selectedCategory} 
                  onValueChange={(value) => {
                    setSelectedCategory(value);
                    setSelectedType(''); // Reset type when category changes
                  }}
                >
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Type Select */}
              <div className="space-y-2">
                <Label>Product Type</Label>
                <Select value={selectedType} onValueChange={setSelectedType} disabled={!selectedCategory}>
                  <SelectTrigger data-testid="select-type">
                    <SelectValue placeholder={selectedCategory ? "Select type" : "Select category first"} />
                  </SelectTrigger>
                  <SelectContent>
                    {filteredTypes.map((type) => (
                      <SelectItem key={type.id} value={type.id.toString()}>
                        {type.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Size */}
              <div className="space-y-2">
                <Label>Size</Label>
                <div className="flex gap-2">
                  <Input
                    value={selectedSize}
                    onChange={(e) => setSelectedSize(e.target.value)}
                    placeholder="e.g., 12x18 or Roll 54"
                    data-testid="input-size"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const parsed = parseSizeFromCode(mappingProduct.itemCode);
                      if (parsed) {
                        setSelectedSize(parsed);
                        const numSheets = parseInt(sheetsPerPack) || 1;
                        setSelectedSqm(calculateSqm(parsed, selectedPackingType, numSheets));
                      }
                    }}
                  >
                    Auto
                  </Button>
                </div>
              </div>

              {/* Packing Type */}
              <div className="space-y-2">
                <Label>Packing Type</Label>
                <Select value={selectedPackingType} onValueChange={setSelectedPackingType}>
                  <SelectTrigger data-testid="select-packing-type">
                    <SelectValue placeholder="Select packing type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Roll">Roll</SelectItem>
                    <SelectItem value="Sheets">Sheets</SelectItem>
                    <SelectItem value="Packet">Packet</SelectItem>
                    <SelectItem value="Carton">Carton</SelectItem>
                    <SelectItem value="Unit">Unit</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Sheets per Pack/Carton (conditional) */}
              {(selectedPackingType === 'Packet' || selectedPackingType === 'Carton') && (
                <div className="space-y-2">
                  <Label>Sheets per {selectedPackingType}</Label>
                  <Input
                    type="number"
                    min="1"
                    value={sheetsPerPack}
                    onChange={(e) => setSheetsPerPack(e.target.value)}
                    placeholder="Enter number of sheets"
                    data-testid="input-sheets-per-pack"
                  />
                  <p className="text-xs text-muted-foreground">
                    This becomes the minimum order quantity
                  </p>
                </div>
              )}

              {/* Square Meters per Pack */}
              <div className="space-y-2">
                <Label>Total SqM per Pack</Label>
                <div className="flex gap-2">
                  <Input
                    value={selectedSqm}
                    onChange={(e) => setSelectedSqm(e.target.value)}
                    placeholder="0.0000"
                    data-testid="input-sqm"
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (selectedSize) {
                        const numSheets = parseInt(sheetsPerPack) || 1;
                        setSelectedSqm(calculateSqm(selectedSize, selectedPackingType, numSheets));
                      }
                    }}
                  >
                    Calculate
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Total square meters for the entire pack/carton (not per sheet)
                </p>
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setMappingProduct(null)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSaveMapping}
              disabled={updateMapping.isPending || !selectedCategory || !selectedType}
              data-testid="button-save-mapping"
            >
              <Save className="h-4 w-4 mr-2" />
              Save Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Category Dialog */}
      <Dialog open={showAddCategory} onOpenChange={setShowAddCategory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Category</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category Name</Label>
              <Input
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="e.g., Graffiti Polyester Paper"
                data-testid="input-new-category"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddCategory(false)}>Cancel</Button>
            <Button
              onClick={() => addCategory.mutate(newCategoryName)}
              disabled={!newCategoryName || addCategory.isPending}
            >
              Add Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add Type Dialog */}
      <Dialog open={showAddType} onOpenChange={setShowAddType}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Product Type</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select value={newTypeCategory} onValueChange={setNewTypeCategory}>
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type Name</Label>
              <Input
                value={newTypeName}
                onChange={(e) => setNewTypeName(e.target.value)}
                placeholder="e.g., 8mil Matte"
                data-testid="input-new-type"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddType(false)}>Cancel</Button>
            <Button
              onClick={() => addType.mutate({ name: newTypeName, categoryId: parseInt(newTypeCategory) })}
              disabled={!newTypeName || !newTypeCategory || addType.isPending}
            >
              Add Type
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Import Confirmation */}
      <AlertDialog open={showImportConfirm} onOpenChange={setShowImportConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Import from Odoo?</AlertDialogTitle>
            <AlertDialogDescription>
              This will fetch all products from Odoo and add them as unmapped products. 
              Existing products will be skipped.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => importFromOdoo.mutate()}
              disabled={importFromOdoo.isPending}
            >
              {importFromOdoo.isPending ? 'Importing...' : 'Import Products'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Delete Type Confirmation */}
      <AlertDialog open={!!typeToDelete} onOpenChange={() => setTypeToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Product Type?</AlertDialogTitle>
            <AlertDialogDescription>
              {typeToDelete && (
                <>
                  Are you sure you want to delete "{typeToDelete.name}"? 
                  This can only be done if no products are assigned to this type.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => typeToDelete && deleteType.mutate(typeToDelete.id)}
              disabled={deleteType.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteType.isPending ? 'Deleting...' : 'Delete Type'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Merge Type Dialog */}
      <Dialog open={!!typeToMerge} onOpenChange={() => { setTypeToMerge(null); setMergeTargetId(''); setIsMergingCatalogType(false); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Merge Product Type</DialogTitle>
            <DialogDescription>
              {typeToMerge && (
                <>
                  Move all products from &quot;{typeToMerge.name}&quot; to another type within the same category (
                  {isMergingCatalogType
                    ? (duplicatesData?.find(g => g.types.some(t => t.id === typeToMerge.id))?.category_name ?? '')
                    : (categories.find(c => c.id === typeToMerge.categoryId)?.name ?? '')}
                  ), then archive the source type.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Merge into:</Label>
              <Select value={mergeTargetId} onValueChange={setMergeTargetId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select target type" />
                </SelectTrigger>
                <SelectContent>
                  {isMergingCatalogType
                    ? duplicatesData
                        ?.find(g => g.types.some(t => t.id === typeToMerge?.id))
                        ?.types
                        .filter(t => t.id !== typeToMerge?.id)
                        .map(t => (
                          <SelectItem key={t.id} value={t.id.toString()}>
                            {t.label}
                          </SelectItem>
                        ))
                    : types
                        .filter(t => t.id !== typeToMerge?.id && t.categoryId === typeToMerge?.categoryId)
                        .map((type) => (
                          <SelectItem key={type.id} value={type.id.toString()}>
                            {type.name}
                          </SelectItem>
                        ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setTypeToMerge(null); setMergeTargetId(''); setIsMergingCatalogType(false); }}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (!typeToMerge || !mergeTargetId) return;
                const targetId = parseInt(mergeTargetId);
                if (isMergingCatalogType) {
                  mergeCatalogTypes.mutate({ sourceTypeId: typeToMerge.id, targetTypeId: targetId });
                } else {
                  mergeTypes.mutate({ sourceTypeId: typeToMerge.id, targetTypeId: targetId });
                }
              }}
              disabled={!mergeTargetId || mergeTypes.isPending || mergeCatalogTypes.isPending}
            >
              {(mergeTypes.isPending || mergeCatalogTypes.isPending) ? 'Merging...' : 'Merge & Archive'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mapping Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {validationResult && validationResult.stale.length === 0 ? (
                <CheckCircle2 className="h-5 w-5 text-green-600" />
              ) : (
                <AlertCircle className="h-5 w-5 text-destructive" />
              )}
              Odoo Mapping Validation
            </DialogTitle>
            <DialogDescription>
              {validationResult
                ? validationResult.stale.length === 0
                  ? `All ${validationResult.total} mappings point to active Odoo products.`
                  : `Found ${validationResult.stale.length} stale mapping${validationResult.stale.length === 1 ? '' : 's'} out of ${validationResult.total} total. These point to archived or deleted Odoo products and will be skipped when creating sales orders.`
                : 'Loading...'}
            </DialogDescription>
          </DialogHeader>

          {validationResult && validationResult.stale.length > 0 && (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {validationResult.stale.map((stale) => (
                <div key={stale.mappingId} className="flex items-center justify-between p-3 border rounded-lg bg-muted/30">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-medium">{stale.itemCode}</span>
                      <Badge variant="destructive" className="text-xs">
                        {stale.reason === 'archived' ? 'Archived in Odoo' : 'Not Found in Odoo'}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                      Odoo: {stale.odooProductName || `ID ${stale.odooProductId}`}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive ml-2"
                    disabled={deletingStaleIds.has(stale.mappingId)}
                    onClick={() => deleteStaleMapping(stale.mappingId)}
                  >
                    {deletingStaleIds.has(stale.mappingId) ? (
                      <span className="h-4 w-4 inline-block animate-spin rounded-full border-2 border-current border-t-transparent" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </Button>
                </div>
              ))}
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowValidationDialog(false)}>
              Close
            </Button>
            {validationResult && validationResult.stale.length > 0 && (
              <Button
                variant="destructive"
                disabled={deletingStaleIds.size > 0}
                onClick={deleteAllStaleMappings}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear All {validationResult.stale.length} Stale Mappings
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

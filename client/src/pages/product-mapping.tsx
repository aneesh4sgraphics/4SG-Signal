import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { 
  ArrowLeft, Search, RefreshCw, AlertTriangle, CheckCircle2, 
  Edit2, Package, Layers, Ruler, Calculator, Save, X, Copy, Merge, Star
} from 'lucide-react';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
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
  totalFiltered: number;
  counts: {
    all: number;
    unmapped: number;
    noSize: number;
    noSqm: number;
    incomplete: number;
  };
  categories: Category[];
  types: ProductType[];
}

interface DuplicateGroup {
  normalizedCode: string;
  products: {
    id: number;
    itemCode: string;
    odooItemCode: string | null;
    productName: string;
    productType: string;
    size: string;
    totalSqm: string;
    dealerPrice: string | null;
    retailPrice: string | null;
  }[];
  hasOdooCode: boolean;
  conflictingPrices: boolean;
  conflictingSizes: boolean;
}

interface DuplicatesResponse {
  success: boolean;
  duplicateGroups: DuplicateGroup[];
  totalGroups: number;
  totalDuplicateProducts: number;
}

type FilterType = 'incomplete' | 'unmapped' | 'no-size' | 'no-sqm' | 'all';
type MainTab = 'mapping' | 'duplicates';

export default function ProductMapping() {
  const { toast } = useToast();
  const [mainTab, setMainTab] = useState<MainTab>('mapping');
  const [activeFilter, setActiveFilter] = useState<FilterType>('incomplete');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedProducts, setSelectedProducts] = useState<Set<number>>(new Set());
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [bulkEditOpen, setBulkEditOpen] = useState(false);
  const [selectedForMerge, setSelectedForMerge] = useState<Map<string, { primaryId: number; mergeIds: number[] }>>(new Map());
  
  const [editForm, setEditForm] = useState({
    categoryId: '',
    productTypeId: '',
    size: '',
    totalSqm: '',
    rollSheet: '',
    unitOfMeasure: '',
  });

  const { data, isLoading, refetch } = useQuery<UnmappedResponse>({
    queryKey: ['/api/products/unmapped', activeFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams({ filter: activeFilter });
      if (searchQuery) params.set('search', searchQuery);
      const res = await fetch(`/api/products/unmapped?${params}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ productId, updates }: { productId: number; updates: any }) => {
      const res = await apiRequest('PATCH', `/api/products/${productId}/mapping`, updates);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Product updated', description: 'Product mapping has been saved.' });
      queryClient.invalidateQueries({ queryKey: ['/api/products/unmapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing'] });
      setEditingProduct(null);
    },
    onError: (error: any) => {
      toast({ title: 'Update failed', description: error.message, variant: 'destructive' });
    },
  });

  const bulkUpdateMutation = useMutation({
    mutationFn: async ({ productIds, updates }: { productIds: number[]; updates: any }) => {
      const res = await apiRequest('POST', '/api/products/bulk-mapping', { productIds, updates });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Bulk update complete', description: `${data.updatedCount} products updated.` });
      queryClient.invalidateQueries({ queryKey: ['/api/products/unmapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing'] });
      setSelectedProducts(new Set());
      setBulkEditOpen(false);
    },
    onError: (error: any) => {
      toast({ title: 'Bulk update failed', description: error.message, variant: 'destructive' });
    },
  });

  const { data: duplicatesData, isLoading: duplicatesLoading, refetch: refetchDuplicates } = useQuery<DuplicatesResponse>({
    queryKey: ['/api/products/duplicates'],
    queryFn: async () => {
      const res = await fetch('/api/products/duplicates');
      if (!res.ok) throw new Error('Failed to fetch duplicates');
      return res.json();
    },
    enabled: mainTab === 'duplicates',
  });

  const mergeMutation = useMutation({
    mutationFn: async ({ primaryId, mergeIds }: { primaryId: number; mergeIds: number[] }) => {
      const res = await apiRequest('POST', '/api/products/merge', { primaryId, mergeIds });
      return res.json();
    },
    onSuccess: (data) => {
      toast({ title: 'Products merged', description: `${data.mergedCount} products merged into ${data.primaryProduct.itemCode}.` });
      queryClient.invalidateQueries({ queryKey: ['/api/products/duplicates'] });
      queryClient.invalidateQueries({ queryKey: ['/api/products/unmapped'] });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing'] });
      setSelectedForMerge(new Map());
    },
    onError: (error: any) => {
      toast({ title: 'Merge failed', description: error.message, variant: 'destructive' });
    },
  });

  const categories = data?.categories || [];
  const types = data?.types || [];
  const products = data?.products || [];
  const counts = data?.counts || { all: 0, unmapped: 0, noSize: 0, noSqm: 0, incomplete: 0 };

  const extractKeywords = (text: string): string[] => {
    const normalized = text
      .replace(/([a-z])([A-Z])/g, '$1 $2')
      .replace(/[_\-\/\\]/g, ' ')
      .toLowerCase()
      .trim();
    const words = normalized.split(/\s+/).filter(w => w.length > 2);
    const stopwords = ['the', 'and', 'for', 'with', 'paper', 'film'];
    return words.filter(w => !stopwords.includes(w));
  };

  const getTypesForCategoryKeywords = (categoryId: number): ProductType[] => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return types.filter(t => t.categoryId === categoryId);
    
    const keywords = extractKeywords(category.name);
    if (keywords.length === 0) return types.filter(t => t.categoryId === categoryId);
    
    const matchingTypes = types.filter(t => {
      const typeKeywords = extractKeywords(t.name);
      return keywords.every(kw => 
        typeKeywords.some(tk => tk.includes(kw) || kw.includes(tk))
      );
    });
    
    if (matchingTypes.length > 0) return matchingTypes;
    return types.filter(t => t.categoryId === categoryId);
  };

  const filteredTypesForEdit = useMemo(() => {
    if (!editForm.categoryId) return types;
    return getTypesForCategoryKeywords(parseInt(editForm.categoryId));
  }, [types, categories, editForm.categoryId]);

  const getTypesForCategory = (categoryId: number) => {
    return types.filter(t => t.categoryId === categoryId);
  };

  const getCategoryForType = (typeId: number) => {
    const type = types.find(t => t.id === typeId);
    return type ? categories.find(c => c.id === type.categoryId) : null;
  };

  const getProductStatus = (product: Product) => {
    const issues: string[] = [];
    if (!product.productTypeId) issues.push('No Type');
    if (!product.catalogCategoryId) issues.push('No Category');
    if (product.size === 'Standard' || !product.size) issues.push('Default Size');
    if (!product.totalSqm || parseFloat(product.totalSqm) === 0) issues.push('No SqM');
    return issues;
  };

  const resetEditForm = () => {
    setEditForm({
      categoryId: '',
      productTypeId: '',
      size: '',
      totalSqm: '',
      rollSheet: '',
      unitOfMeasure: '',
    });
  };

  const openEditDialog = (product: Product) => {
    setEditingProduct(product);
    const category = product.productTypeId ? getCategoryForType(product.productTypeId) : null;
    setEditForm({
      categoryId: category?.id.toString() || '',
      productTypeId: product.productTypeId?.toString() || '',
      size: product.size || '',
      totalSqm: product.totalSqm || '',
      rollSheet: product.rollSheet || '',
      unitOfMeasure: product.unitOfMeasure || '',
    });
  };

  const handleCategoryChange = (categoryId: string) => {
    const matchingTypes = getTypesForCategoryKeywords(parseInt(categoryId));
    const autoSelectType = matchingTypes.length === 1 ? matchingTypes[0].id.toString() : '';
    setEditForm(prev => ({ 
      ...prev, 
      categoryId, 
      productTypeId: autoSelectType 
    }));
  };

  const openBulkEditDialog = () => {
    resetEditForm();
    setBulkEditOpen(true);
  };

  const handleSaveEdit = () => {
    if (!editingProduct) return;
    
    const updates: any = {};
    if (editForm.productTypeId) updates.productTypeId = parseInt(editForm.productTypeId);
    if (editForm.size) updates.size = editForm.size;
    if (editForm.totalSqm) updates.totalSqm = editForm.totalSqm;
    if (editForm.rollSheet) updates.rollSheet = editForm.rollSheet;
    if (editForm.unitOfMeasure) updates.unitOfMeasure = editForm.unitOfMeasure;
    
    updateMutation.mutate({ productId: editingProduct.id, updates });
  };

  const handleBulkSave = () => {
    const updates: any = {};
    if (editForm.productTypeId) updates.productTypeId = parseInt(editForm.productTypeId);
    if (editForm.size && editForm.size !== '__keep__') updates.size = editForm.size;
    if (editForm.totalSqm) updates.totalSqm = editForm.totalSqm;
    if (editForm.rollSheet && editForm.rollSheet !== '__keep__') updates.rollSheet = editForm.rollSheet;
    if (editForm.unitOfMeasure && editForm.unitOfMeasure !== '__keep__') updates.unitOfMeasure = editForm.unitOfMeasure;
    
    if (Object.keys(updates).length === 0) {
      toast({ title: 'No changes', description: 'Please select at least one field to update.', variant: 'destructive' });
      return;
    }
    
    bulkUpdateMutation.mutate({ productIds: Array.from(selectedProducts), updates });
  };

  const toggleSelectAll = () => {
    if (selectedProducts.size === products.length) {
      setSelectedProducts(new Set());
    } else {
      setSelectedProducts(new Set(products.map(p => p.id)));
    }
  };

  const calculateSqm = (sizeString: string) => {
    const match = sizeString.match(/(\d+(?:\.\d+)?)\s*[xX×]\s*(\d+(?:\.\d+)?)/);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      const sqm = (w * 0.0254) * (h * 0.0254);
      return sqm.toFixed(4);
    }
    return '';
  };

  const duplicateGroups = duplicatesData?.duplicateGroups || [];

  const selectPrimaryForMerge = (groupCode: string, productId: number, allProductIds: number[]) => {
    const newMap = new Map(selectedForMerge);
    newMap.set(groupCode, {
      primaryId: productId,
      mergeIds: allProductIds.filter(id => id !== productId),
    });
    setSelectedForMerge(newMap);
  };

  const handleMergeGroup = (groupCode: string) => {
    const selection = selectedForMerge.get(groupCode);
    if (!selection || selection.mergeIds.length === 0) {
      toast({ title: 'Select a primary product first', variant: 'destructive' });
      return;
    }
    mergeMutation.mutate(selection);
  };

  const handleSizeChange = (size: string) => {
    setEditForm(prev => {
      const newSqm = calculateSqm(size);
      return { ...prev, size, totalSqm: newSqm || prev.totalSqm };
    });
  };

  return (
    <div className="container mx-auto py-6 px-4 max-w-7xl">
      <div className="flex items-center gap-4 mb-6">
        <Link href="/product-pricing-management">
          <Button variant="ghost" size="icon" data-testid="btn-back">
            <ArrowLeft className="h-5 w-5" />
          </Button>
        </Link>
        <div className="flex-1">
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Layers className="h-6 w-6" />
            Product Mapping
          </h1>
          <p className="text-muted-foreground">
            Fix product categories, types, sizes, and SqM values for QuickQuotes and Price List
          </p>
        </div>
        <Button 
          variant="outline" 
          onClick={() => refetch()}
          disabled={isLoading}
          data-testid="btn-refresh"
        >
          <RefreshCw className={cn("h-4 w-4 mr-2", isLoading && "animate-spin")} />
          Refresh
        </Button>
      </div>

      <Tabs value={mainTab} onValueChange={(v) => setMainTab(v as MainTab)} className="mb-6">
        <TabsList className="grid w-full max-w-md grid-cols-2">
          <TabsTrigger value="mapping" className="flex items-center gap-2" data-testid="main-tab-mapping">
            <Layers className="h-4 w-4" />
            Product Mapping
          </TabsTrigger>
          <TabsTrigger value="duplicates" className="flex items-center gap-2" data-testid="main-tab-duplicates">
            <Copy className="h-4 w-4" />
            Duplicates ({duplicatesData?.totalGroups || 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mainTab === 'mapping' && (
        <>
          <Card className="mb-6" data-testid="card-stats">
            <CardContent className="py-4">
              <div className="grid grid-cols-5 gap-4 text-center">
                <div className="p-3 rounded-lg bg-gray-50 dark:bg-gray-900">
                  <div className="text-2xl font-bold">{counts.all}</div>
                  <div className="text-xs text-muted-foreground">Total Products</div>
                </div>
                <div className={cn("p-3 rounded-lg", counts.incomplete > 0 ? "bg-yellow-50 dark:bg-yellow-900/30" : "bg-green-50")}>
                  <div className={cn("text-2xl font-bold", counts.incomplete > 0 ? "text-yellow-600" : "text-green-600")}>
                    {counts.incomplete}
                  </div>
                  <div className="text-xs text-muted-foreground">Need Attention</div>
                </div>
                <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/30">
                  <div className="text-2xl font-bold text-red-600">{counts.unmapped}</div>
                  <div className="text-xs text-muted-foreground">No Category/Type</div>
                </div>
                <div className="p-3 rounded-lg bg-orange-50 dark:bg-orange-900/30">
                  <div className="text-2xl font-bold text-orange-600">{counts.noSize}</div>
                  <div className="text-xs text-muted-foreground">Default Size</div>
                </div>
                <div className="p-3 rounded-lg bg-purple-50 dark:bg-purple-900/30">
                  <div className="text-2xl font-bold text-purple-600">{counts.noSqm}</div>
                  <div className="text-xs text-muted-foreground">Missing SqM</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
        <CardHeader className="pb-4">
          <div className="flex items-center justify-between gap-4">
            <Tabs value={activeFilter} onValueChange={(v) => setActiveFilter(v as FilterType)}>
              <TabsList>
                <TabsTrigger value="incomplete" data-testid="tab-incomplete">
                  Need Attention ({counts.incomplete})
                </TabsTrigger>
                <TabsTrigger value="unmapped" data-testid="tab-unmapped">
                  No Category/Type ({counts.unmapped})
                </TabsTrigger>
                <TabsTrigger value="no-size" data-testid="tab-no-size">
                  Default Size ({counts.noSize})
                </TabsTrigger>
                <TabsTrigger value="no-sqm" data-testid="tab-no-sqm">
                  No SqM ({counts.noSqm})
                </TabsTrigger>
                <TabsTrigger value="all" data-testid="tab-all">
                  All ({counts.all})
                </TabsTrigger>
              </TabsList>
            </Tabs>
            <div className="relative w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search products..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10"
                data-testid="input-search"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {selectedProducts.size > 0 && (
            <div className="flex items-center gap-4 mb-4 p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg">
              <span className="text-sm font-medium">{selectedProducts.size} selected</span>
              <Button size="sm" onClick={openBulkEditDialog} data-testid="btn-bulk-edit">
                <Edit2 className="h-4 w-4 mr-1" />
                Bulk Edit
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelectedProducts(new Set())} data-testid="btn-clear-selection">
                Clear Selection
              </Button>
            </div>
          )}

          {isLoading ? (
            <div className="text-center py-12">
              <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
              <p className="mt-2 text-muted-foreground">Loading products...</p>
            </div>
          ) : products.length === 0 ? (
            <div className="text-center py-12">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
              <p className="text-lg font-medium">All products are properly mapped!</p>
              <p className="text-muted-foreground">No products need attention in this category.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-3 w-10">
                      <Checkbox
                        checked={selectedProducts.size === products.length && products.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </th>
                    <th className="text-left p-3">Product</th>
                    <th className="text-left p-3">Category / Type</th>
                    <th className="text-left p-3">Size</th>
                    <th className="text-left p-3">SqM</th>
                    <th className="text-left p-3">Status</th>
                    <th className="text-left p-3 w-20">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {products.map((product) => {
                    const issues = getProductStatus(product);
                    const category = product.productTypeId ? getCategoryForType(product.productTypeId) : null;
                    const type = product.productTypeId ? types.find(t => t.id === product.productTypeId) : null;
                    
                    return (
                      <tr key={product.id} className="border-b hover:bg-gray-50 dark:hover:bg-gray-900">
                        <td className="p-3">
                          <Checkbox
                            checked={selectedProducts.has(product.id)}
                            onCheckedChange={(checked) => {
                              const newSelected = new Set(selectedProducts);
                              if (checked) {
                                newSelected.add(product.id);
                              } else {
                                newSelected.delete(product.id);
                              }
                              setSelectedProducts(newSelected);
                            }}
                            data-testid={`checkbox-product-${product.id}`}
                          />
                        </td>
                        <td className="p-3">
                          <div className="font-medium">{product.productName}</div>
                          <div className="text-xs text-muted-foreground">{product.itemCode}</div>
                        </td>
                        <td className="p-3">
                          {category && type ? (
                            <div>
                              <div className="font-medium">{category.name}</div>
                              <div className="text-xs text-muted-foreground">{type.name}</div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic">Not assigned</span>
                          )}
                        </td>
                        <td className="p-3">
                          {product.size === 'Standard' || !product.size ? (
                            <span className="text-orange-600 italic">Standard</span>
                          ) : (
                            product.size
                          )}
                        </td>
                        <td className="p-3">
                          {!product.totalSqm || parseFloat(product.totalSqm) === 0 ? (
                            <span className="text-purple-600 italic">0</span>
                          ) : (
                            parseFloat(product.totalSqm).toFixed(4)
                          )}
                        </td>
                        <td className="p-3">
                          {issues.length === 0 ? (
                            <Badge className="bg-green-600">Complete</Badge>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {issues.map((issue, idx) => (
                                <Badge key={idx} variant="secondary" className="text-xs bg-yellow-100 text-yellow-800">
                                  {issue}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="p-3">
                          <Button 
                            size="sm" 
                            variant="outline" 
                            onClick={() => openEditDialog(product)}
                            data-testid={`btn-edit-${product.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
          </Card>
        </>
      )}

      {mainTab === 'duplicates' && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Copy className="h-5 w-5" />
              Duplicate Products
            </CardTitle>
            <CardDescription>
              Products with similar item codes that may be duplicates. Select the primary product (with Odoo code preferred) and merge others into it.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {duplicatesLoading ? (
              <div className="text-center py-12">
                <RefreshCw className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
                <p className="mt-2 text-muted-foreground">Analyzing products for duplicates...</p>
              </div>
            ) : duplicateGroups.length === 0 ? (
              <div className="text-center py-12">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <p className="text-lg font-medium">No duplicates found!</p>
                <p className="text-muted-foreground">All products have unique item codes.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                  <div>
                    <span className="font-medium">{duplicatesData?.totalGroups} groups</span>
                    <span className="text-muted-foreground"> containing </span>
                    <span className="font-medium">{duplicatesData?.totalDuplicateProducts} products</span>
                  </div>
                  <Button variant="outline" onClick={() => refetchDuplicates()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>
                
                <Accordion type="multiple" className="space-y-2">
                  {duplicateGroups.map((group) => {
                    const selection = selectedForMerge.get(group.normalizedCode);
                    return (
                      <AccordionItem key={group.normalizedCode} value={group.normalizedCode} className="border rounded-lg">
                        <AccordionTrigger className="px-4 hover:no-underline">
                          <div className="flex items-center gap-4 w-full">
                            <span className="font-mono text-sm">{group.normalizedCode}</span>
                            <Badge variant="secondary">{group.products.length} products</Badge>
                            {group.hasOdooCode && (
                              <Badge className="bg-green-600">Has Odoo Code</Badge>
                            )}
                            {group.conflictingPrices && (
                              <Badge variant="destructive">Price Conflict</Badge>
                            )}
                            {group.conflictingSizes && (
                              <Badge variant="outline" className="border-orange-500 text-orange-600">Size Conflict</Badge>
                            )}
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-4 pb-4">
                          <div className="space-y-3">
                            <p className="text-sm text-muted-foreground mb-4">
                              Click the star to select as primary product. Others will be merged into it.
                            </p>
                            {group.products.map((product) => (
                              <div 
                                key={product.id}
                                className={cn(
                                  "flex items-center gap-4 p-3 rounded-lg border",
                                  selection?.primaryId === product.id 
                                    ? "bg-blue-50 border-blue-300 dark:bg-blue-900/30" 
                                    : "bg-gray-50 dark:bg-gray-900"
                                )}
                              >
                                <Button
                                  size="sm"
                                  variant={selection?.primaryId === product.id ? "default" : "ghost"}
                                  onClick={() => selectPrimaryForMerge(
                                    group.normalizedCode, 
                                    product.id, 
                                    group.products.map(p => p.id)
                                  )}
                                  data-testid={`btn-primary-${product.id}`}
                                >
                                  <Star className={cn("h-4 w-4", selection?.primaryId === product.id && "fill-current")} />
                                </Button>
                                <div className="flex-1">
                                  <div className="flex items-center gap-2">
                                    <span className="font-mono text-sm">{product.itemCode}</span>
                                    {product.odooItemCode && (
                                      <Badge className="bg-green-600 text-xs">Odoo: {product.odooItemCode}</Badge>
                                    )}
                                  </div>
                                  <div className="text-sm text-muted-foreground">{product.productName}</div>
                                </div>
                                <div className="text-right text-sm">
                                  <div>{product.size}</div>
                                  <div className="text-muted-foreground">${product.dealerPrice}</div>
                                </div>
                              </div>
                            ))}
                            <div className="flex justify-end mt-4">
                              <Button
                                onClick={() => handleMergeGroup(group.normalizedCode)}
                                disabled={!selection || mergeMutation.isPending}
                                data-testid={`btn-merge-${group.normalizedCode}`}
                              >
                                <Merge className="h-4 w-4 mr-2" />
                                {mergeMutation.isPending ? 'Merging...' : 'Merge Selected'}
                              </Button>
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!editingProduct} onOpenChange={(open) => !open && setEditingProduct(null)}>
        <DialogContent className="max-w-lg" data-testid="dialog-edit-product">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Edit Product Mapping
            </DialogTitle>
            <DialogDescription>
              {editingProduct?.productName} ({editingProduct?.itemCode})
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={editForm.categoryId}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger data-testid="select-category">
                  <SelectValue placeholder="Select category..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Product Type
                {editForm.categoryId && filteredTypesForEdit.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({filteredTypesForEdit.length} matching types)
                  </span>
                )}
              </Label>
              <Select
                value={editForm.productTypeId}
                onValueChange={(val) => setEditForm(prev => ({ ...prev, productTypeId: val }))}
              >
                <SelectTrigger data-testid="select-type">
                  <SelectValue placeholder="Select type..." />
                </SelectTrigger>
                <SelectContent>
                  {filteredTypesForEdit.map(type => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {type.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {editForm.categoryId && filteredTypesForEdit.length === 0 && (
                <p className="text-xs text-orange-600">
                  No matching types found. Showing all types for this category.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Roll/Sheet</Label>
                <Select
                  value={editForm.rollSheet}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, rollSheet: val }))}
                >
                  <SelectTrigger data-testid="select-roll-sheet">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheet">Sheet</SelectItem>
                    <SelectItem value="roll">Roll</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Select
                  value={editForm.unitOfMeasure}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, unitOfMeasure: val }))}
                >
                  <SelectTrigger data-testid="select-uom">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheets">Sheets</SelectItem>
                    <SelectItem value="rolls">Rolls</SelectItem>
                    <SelectItem value="packets">Packets</SelectItem>
                    <SelectItem value="cartons">Cartons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Ruler className="h-4 w-4" />
                Size (e.g., "13x19", "12x18")
              </Label>
              <Input
                value={editForm.size}
                onChange={(e) => handleSizeChange(e.target.value)}
                placeholder="e.g., 13x19"
                data-testid="input-size"
              />
            </div>

            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Calculator className="h-4 w-4" />
                Square Meters (per unit)
              </Label>
              <Input
                value={editForm.totalSqm}
                onChange={(e) => setEditForm(prev => ({ ...prev, totalSqm: e.target.value }))}
                placeholder="e.g., 0.1544"
                data-testid="input-sqm"
              />
              <p className="text-xs text-muted-foreground">
                Auto-calculated from size when you enter dimensions like "13x19"
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingProduct(null)} data-testid="btn-cancel-edit">
              <X className="h-4 w-4 mr-1" />
              Cancel
            </Button>
            <Button onClick={handleSaveEdit} disabled={updateMutation.isPending} data-testid="btn-save-edit">
              <Save className="h-4 w-4 mr-1" />
              {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={bulkEditOpen} onOpenChange={setBulkEditOpen}>
        <DialogContent className="max-w-lg" data-testid="dialog-bulk-edit">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5" />
              Bulk Edit {selectedProducts.size} Products
            </DialogTitle>
            <DialogDescription>
              Only fields you fill in will be updated. Leave empty to keep current values.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Category (filters product types)</Label>
              <Select
                value={editForm.categoryId}
                onValueChange={handleCategoryChange}
              >
                <SelectTrigger data-testid="bulk-select-category">
                  <SelectValue placeholder="Keep current values..." />
                </SelectTrigger>
                <SelectContent>
                  {categories.map(cat => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>{cat.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>
                Product Type
                {editForm.categoryId && filteredTypesForEdit.length > 0 && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({filteredTypesForEdit.length} matching)
                  </span>
                )}
              </Label>
              <Select
                value={editForm.productTypeId}
                onValueChange={(val) => setEditForm(prev => ({ ...prev, productTypeId: val }))}
              >
                <SelectTrigger data-testid="bulk-select-type">
                  <SelectValue placeholder="Keep current values..." />
                </SelectTrigger>
                <SelectContent>
                  {(editForm.categoryId ? filteredTypesForEdit : types).map(type => (
                    <SelectItem key={type.id} value={type.id.toString()}>
                      {editForm.categoryId ? type.name : `${categories.find(c => c.id === type.categoryId)?.name} → ${type.name}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Roll/Sheet</Label>
                <Select
                  value={editForm.rollSheet}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, rollSheet: val }))}
                >
                  <SelectTrigger data-testid="bulk-select-roll-sheet">
                    <SelectValue placeholder="Keep current..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheet">Sheet</SelectItem>
                    <SelectItem value="roll">Roll</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Unit of Measure</Label>
                <Select
                  value={editForm.unitOfMeasure}
                  onValueChange={(val) => setEditForm(prev => ({ ...prev, unitOfMeasure: val }))}
                >
                  <SelectTrigger data-testid="bulk-select-uom">
                    <SelectValue placeholder="Keep current..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheets">Sheets</SelectItem>
                    <SelectItem value="rolls">Rolls</SelectItem>
                    <SelectItem value="packets">Packets</SelectItem>
                    <SelectItem value="cartons">Cartons</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Size</Label>
              <Input
                value={editForm.size}
                onChange={(e) => handleSizeChange(e.target.value)}
                placeholder="Keep current values..."
                data-testid="bulk-input-size"
              />
            </div>

            <div className="space-y-2">
              <Label>Square Meters</Label>
              <Input
                value={editForm.totalSqm}
                onChange={(e) => setEditForm(prev => ({ ...prev, totalSqm: e.target.value }))}
                placeholder="Keep current values..."
                data-testid="bulk-input-sqm"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkEditOpen(false)} data-testid="btn-cancel-bulk">
              Cancel
            </Button>
            <Button onClick={handleBulkSave} disabled={bulkUpdateMutation.isPending} data-testid="btn-save-bulk">
              <Save className="h-4 w-4 mr-1" />
              {bulkUpdateMutation.isPending ? 'Updating...' : `Update ${selectedProducts.size} Products`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

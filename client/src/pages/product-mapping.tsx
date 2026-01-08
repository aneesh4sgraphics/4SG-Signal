import { useState, useMemo } from 'react';
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
  ArrowLeft, Search, RefreshCw, Download, CheckCircle2, 
  Edit2, Package, Layers, Save, X, AlertCircle, Plus, Trash2, Ban
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

export default function ProductMapping() {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('unmapped');
  const [searchQuery, setSearchQuery] = useState('');
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

  const categories = categoriesData || [];
  const types = typesData || [];
  const products = unmappedData?.products || [];
  const counts = unmappedData?.counts || { all: 0, unmapped: 0, noSize: 0, noSqm: 0, incomplete: 0 };

  // Filter products based on tab and search
  const filteredProducts = useMemo(() => {
    let filtered = products;
    
    // Filter by tab
    if (activeTab === 'unmapped') {
      filtered = filtered.filter(p => !p.catalogCategoryId || !p.productTypeId);
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

  // Get types for selected category
  const filteredTypes = useMemo(() => {
    if (!selectedCategory) return [];
    return types.filter(t => t.categoryId.toString() === selectedCategory);
  }, [types, selectedCategory]);

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

  // Parse size from product code (e.g., "1218B" -> "12x18")
  const parseSizeFromCode = (code: string): string => {
    const sizeMatch = code.match(/(\d{2})(\d{2})([A-Z]?)$/);
    if (sizeMatch) {
      return `${sizeMatch[1]}x${sizeMatch[2]}`;
    }
    return '';
  };

  // Calculate SqM from size
  const calculateSqm = (size: string): string => {
    const match = size.match(/(\d+)x(\d+)/);
    if (match) {
      const width = parseInt(match[1]);
      const height = parseInt(match[2]);
      const sqm = ((width * height) / 144) * 0.0929; // Convert square inches to sqm
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
                <p className="text-muted-foreground text-sm">
                  Assign categories and types to products imported from Odoo
                </p>
              </div>
            </div>
            
            <div className="flex items-center gap-2">
              <Button 
                variant="outline" 
                onClick={() => refetchProducts()}
                data-testid="button-refresh"
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
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
        <div className="grid grid-cols-4 gap-4 mb-6">
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
            </TabsTrigger>
            <TabsTrigger value="mapped" data-testid="tab-mapped">
              <CheckCircle2 className="h-4 w-4 mr-2" />
              Mapped ({counts.all - counts.unmapped})
            </TabsTrigger>
            <TabsTrigger value="categories" data-testid="tab-categories">
              <Layers className="h-4 w-4 mr-2" />
              Categories & Types
            </TabsTrigger>
          </TabsList>

          {/* Unmapped / Mapped Products Tab */}
          <TabsContent value="unmapped" className="space-y-4">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle>Unmapped Products</CardTitle>
                  <div className="flex gap-2">
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
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-sm font-medium">{product.itemCode}</span>
                              <Badge variant="outline" className="text-amber-600 border-amber-600">
                                Unmapped
                              </Badge>
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
                        return (
                          <div
                            key={product.id}
                            className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                            data-testid={`product-row-mapped-${product.id}`}
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-sm font-medium">{product.itemCode}</span>
                                <Badge variant="outline" className="text-green-600 border-green-600">
                                  {category?.name || 'Unknown'}
                                </Badge>
                                <Badge variant="secondary">
                                  {type?.name || 'Unknown'}
                                </Badge>
                              </div>
                              <div className="text-sm text-muted-foreground mt-1">
                                {product.productName} | Size: {product.size} | SqM: {product.totalSqm}
                              </div>
                            </div>
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
                        );
                      })}
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
                  <CardDescription>Product categories for organizing your catalog</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {categories.map((cat) => {
                        const typeCount = types.filter(t => t.categoryId === cat.id).length;
                        const productCount = products.filter(p => p.catalogCategoryId === cat.id).length;
                        return (
                          <div
                            key={cat.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`category-row-${cat.id}`}
                          >
                            <div>
                              <div className="font-medium">{cat.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {typeCount} types • {productCount} products
                              </div>
                            </div>
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
                    <CardTitle>Product Types</CardTitle>
                    <Button size="sm" onClick={() => setShowAddType(true)} data-testid="button-add-type">
                      <Plus className="h-4 w-4 mr-2" />
                      Add Type
                    </Button>
                  </div>
                  <CardDescription>Product types within each category</CardDescription>
                </CardHeader>
                <CardContent>
                  <ScrollArea className="h-[400px]">
                    <div className="space-y-2">
                      {types.map((type) => {
                        const category = categories.find(c => c.id === type.categoryId);
                        const productCount = products.filter(p => p.productTypeId === type.id).length;
                        return (
                          <div
                            key={type.id}
                            className="flex items-center justify-between p-3 border rounded-lg"
                            data-testid={`type-row-${type.id}`}
                          >
                            <div>
                              <div className="font-medium">{type.name}</div>
                              <div className="text-sm text-muted-foreground">
                                {category?.name || 'Unknown'} • {productCount} products
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                </CardContent>
              </Card>
            </div>
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
                        setSelectedSqm(calculateSqm(parsed));
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

              {/* Square Meters */}
              <div className="space-y-2">
                <Label>Total SqM</Label>
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
                        setSelectedSqm(calculateSqm(selectedSize));
                      }
                    }}
                  >
                    Calculate
                  </Button>
                </div>
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
    </div>
  );
}

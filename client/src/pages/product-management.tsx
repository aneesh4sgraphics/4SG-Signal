import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Package, Edit, Save, X, Plus, Trash2, Upload } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";

// Utility function to apply brand-specific fonts to individual words
const applyBrandFonts = (text: string): JSX.Element => {
  const words = text.split(' ');
  
  return (
    <>
      {words.map((word, index) => {
        const lowerWord = word.toLowerCase();
        let className = '';
        
        if (lowerWord.includes('graffiti')) {
          className = 'font-graffiti';
        } else if (lowerWord.includes('solvit')) {
          className = 'font-solvit';
        } else if (lowerWord.includes('cliq')) {
          className = 'font-cliq';
        } else if (lowerWord.includes('rang')) {
          className = 'font-rang';
        } else if (lowerWord.includes('ele') || lowerWord.includes('eie')) {
          className = 'font-ele';
        } else if (lowerWord.includes('polyester') || lowerWord.includes('paper') || lowerWord.includes('blended') || lowerWord.includes('poly') || lowerWord.includes('stick')) {
          className = 'font-ele';
        }
        
        return (
          <span key={index} className={className}>
            {word}
            {index < words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </>
  );
};

interface ProductCategory {
  id: number;
  name: string;
  description: string;
}

interface ProductType {
  id: number;
  categoryId: number;
  name: string;
  description: string;
}

interface ProductSize {
  id: number;
  typeId: number;
  name: string;
  width: string;
  height: string;
  widthUnit: string;
  heightUnit: string;
  squareMeters: string;
  itemCode: string;
  minOrderQty: string;
}

interface PricingTier {
  id: number;
  name: string;
  description: string;
  minSquareMeters: string;
  maxSquareMeters: string;
  pricePerSquareMeter: string;
}

interface ProductPricing {
  id: number;
  productTypeId: number;
  tierId: number;
  pricePerSquareMeter: string;
}

interface EditingCell {
  rowId: string;
  field: string;
  value: string;
}

export default function ProductManagement() {
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [editingCell, setEditingCell] = useState<EditingCell | null>(null);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();

  const isAdmin = user?.role === "admin";

  // Fetch all data
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/product-categories"],
  });

  const { data: types = [], isLoading: typesLoading } = useQuery({
    queryKey: ["/api/product-types"],
  });

  const { data: sizes = [], isLoading: sizesLoading } = useQuery({
    queryKey: ["/api/product-sizes"],
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["/api/pricing-tiers"],
  });

  const { data: pricing = [], isLoading: pricingLoading } = useQuery({
    queryKey: ["/api/product-pricing"],
  });

  const isLoading = categoriesLoading || typesLoading || sizesLoading || tiersLoading || pricingLoading;

  // Get filtered data based on selected category
  const categoryTypes = selectedCategory && selectedCategory !== "all"
    ? types.filter((type: ProductType) => type.categoryId === parseInt(selectedCategory))
    : types;

  const categoryTypeIds = categoryTypes.map((type: ProductType) => type.id);
  const categorySizes = sizes.filter((size: ProductSize) => 
    categoryTypeIds.includes(size.typeId)
  );

  const selectedCategoryData = selectedCategory && selectedCategory !== "all" 
    ? categories.find((c: ProductCategory) => c.id === parseInt(selectedCategory))
    : null;

  // Build product data for table display
  const productData = categorySizes.map((size: ProductSize) => {
    const type = types.find((t: ProductType) => t.id === size.typeId);
    const category = categories.find((c: ProductCategory) => c.id === type?.categoryId);
    const sizePricing = pricing.filter((p: ProductPricing) => p.productTypeId === size.typeId);
    
    return {
      id: `${size.id}`,
      category: category?.name || "",
      type: type?.name || "",
      size: size.name,
      width: size.width,
      height: size.height,
      widthUnit: size.widthUnit,
      heightUnit: size.heightUnit,
      squareMeters: size.squareMeters,
      itemCode: size.itemCode || "",
      minOrderQty: size.minOrderQty || "",
      pricing: sizePricing
    };
  });

  // Handle cell editing
  const handleCellClick = (rowId: string, field: string, value: string) => {
    if (!isAdmin) return;
    setEditingCell({ rowId, field, value });
  };

  const handleCellSave = async () => {
    if (!editingCell || !isAdmin) return;

    try {
      const sizeId = parseInt(editingCell.rowId);
      const updateData = {
        [editingCell.field]: editingCell.value
      };

      await apiRequest("PUT", `/api/product-sizes/${sizeId}`, updateData);

      // Invalidate related caches
      queryClient.invalidateQueries({ queryKey: ["/api/product-sizes"] });
      
      toast({
        title: "Product Updated",
        description: "Product information has been saved successfully.",
      });
      
      setEditingCell(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update product. Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCellCancel = () => {
    setEditingCell(null);
  };

  const handleUpload = () => {
    setShowUploadDialog(true);
  };

  const getPriceForTier = (productPricing: ProductPricing[], tierId: number) => {
    const tierPrice = productPricing.find(p => p.tierId === tierId);
    return tierPrice ? `$${parseFloat(tierPrice.pricePerSquareMeter).toFixed(2)}` : "-";
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link href="/">
                <Button variant="outline" className="flex items-center gap-2">
                  <ArrowLeft className="h-4 w-4" />
                  Back to Dashboard
                </Button>
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Product Management</h1>
                <p className="text-gray-600">View and manage product catalog</p>
              </div>
            </div>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Button onClick={handleUpload} className="flex items-center gap-2">
                  <Upload className="h-4 w-4" />
                  Upload Data
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Category Filter */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Package className="h-5 w-5" />
              Product Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Category</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select category (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Categories</SelectItem>
                    {categories.map((category: ProductCategory) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {applyBrandFonts(category.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Filter Info</label>
                <div className="p-2 bg-gray-100 rounded-md text-sm">
                  {selectedCategory && selectedCategory !== "all" ? (
                    <span>Showing products for: <Badge variant="secondary">{applyBrandFonts(selectedCategoryData?.name || '')}</Badge></span>
                  ) : (
                    <span>Showing all products</span>
                  )}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Product Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Product Catalog
              </CardTitle>
              <div className="text-sm text-gray-600">
                {productData.length} products found
                {!isAdmin && (
                  <Badge variant="outline" className="ml-2">View Only</Badge>
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="border rounded-md overflow-hidden">
              <div className="overflow-x-auto max-h-96">
                <Table>
                  <TableHeader className="bg-gray-50 sticky top-0">
                    <TableRow>
                      <TableHead className="w-32">Category</TableHead>
                      <TableHead className="w-40">Type</TableHead>
                      <TableHead className="w-32">Size</TableHead>
                      <TableHead className="w-20">Width</TableHead>
                      <TableHead className="w-20">Height</TableHead>
                      <TableHead className="w-20">W Unit</TableHead>
                      <TableHead className="w-20">H Unit</TableHead>
                      <TableHead className="w-24">Sq Meters</TableHead>
                      <TableHead className="w-24">Item Code</TableHead>
                      <TableHead className="w-24">Min Qty</TableHead>
                      {tiers.map((tier: PricingTier) => (
                        <TableHead key={tier.id} className="w-24">
                          {tier.name}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productData.map((product) => (
                      <TableRow key={product.id}>
                        <TableCell className="font-medium">{applyBrandFonts(product.category)}</TableCell>
                        <TableCell>{applyBrandFonts(product.type)}</TableCell>
                        <TableCell>{product.size}</TableCell>
                        <TableCell 
                          className={isAdmin ? "cursor-pointer hover:bg-gray-50" : ""}
                          onClick={() => handleCellClick(product.id, "width", product.width)}
                        >
                          {editingCell?.rowId === product.id && editingCell?.field === "width" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                                className="w-16 h-6 text-xs"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={handleCellSave}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCellCancel}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            product.width
                          )}
                        </TableCell>
                        <TableCell 
                          className={isAdmin ? "cursor-pointer hover:bg-gray-50" : ""}
                          onClick={() => handleCellClick(product.id, "height", product.height)}
                        >
                          {editingCell?.rowId === product.id && editingCell?.field === "height" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                                className="w-16 h-6 text-xs"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={handleCellSave}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCellCancel}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            product.height
                          )}
                        </TableCell>
                        <TableCell>{product.widthUnit}</TableCell>
                        <TableCell>{product.heightUnit}</TableCell>
                        <TableCell>{product.squareMeters}</TableCell>
                        <TableCell 
                          className={isAdmin ? "cursor-pointer hover:bg-gray-50" : ""}
                          onClick={() => handleCellClick(product.id, "itemCode", product.itemCode)}
                        >
                          {editingCell?.rowId === product.id && editingCell?.field === "itemCode" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                                className="w-20 h-6 text-xs"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={handleCellSave}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCellCancel}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            product.itemCode
                          )}
                        </TableCell>
                        <TableCell 
                          className={isAdmin ? "cursor-pointer hover:bg-gray-50" : ""}
                          onClick={() => handleCellClick(product.id, "minOrderQty", product.minOrderQty)}
                        >
                          {editingCell?.rowId === product.id && editingCell?.field === "minOrderQty" ? (
                            <div className="flex items-center gap-1">
                              <Input
                                value={editingCell.value}
                                onChange={(e) => setEditingCell({...editingCell, value: e.target.value})}
                                className="w-20 h-6 text-xs"
                                autoFocus
                              />
                              <Button size="sm" variant="ghost" onClick={handleCellSave}>
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button size="sm" variant="ghost" onClick={handleCellCancel}>
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            product.minOrderQty
                          )}
                        </TableCell>
                        {tiers.map((tier: PricingTier) => (
                          <TableCell key={tier.id} className="text-center">
                            {getPriceForTier(product.pricing, tier.id)}
                          </TableCell>
                        ))}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload Dialog */}
        <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Upload Product Data</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="text-sm text-gray-600">
                <p>Upload a CSV file to update the product catalog.</p>
                <p className="mt-2">The file should contain columns for product information including categories, types, sizes, and pricing.</p>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => setShowUploadDialog(false)}
                >
                  Cancel
                </Button>
                <Button onClick={() => {
                  toast({
                    title: "Feature Coming Soon",
                    description: "File upload functionality will be implemented soon.",
                  });
                  setShowUploadDialog(false);
                }}>
                  Upload File
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
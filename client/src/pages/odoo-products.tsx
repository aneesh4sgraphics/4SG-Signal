import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { debounce } from "lodash";
import { useAuth } from "@/hooks/useAuth";
import {
  Search,
  LayoutGrid,
  List,
  Package,
  DollarSign,
  Tag,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
  ArrowLeft,
  Loader2,
  Filter,
  Box,
  Layers,
  Eye,
  EyeOff,
} from "lucide-react";

interface OdooProduct {
  id: number;
  name: string;
  default_code?: string;
  list_price: number;
  standard_price?: number;
  categ_id?: [number, string];
  type: string;
  description?: string;
  description_sale?: string;
  uom_id?: [number, string];
  active: boolean;
}

interface OdooCategory {
  id: number;
  name: string;
}

export default function OdooProducts() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [costRevealed, setCostRevealed] = useState(false);
  const pageSize = 50;
  
  const { user } = useAuth();
  const isAdmin = (user as any)?.role === 'admin';

  const debouncedSetSearch = useCallback(
    debounce((value: string) => {
      setDebouncedSearch(value);
      setCurrentPage(1);
    }, 300),
    []
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(e.target.value);
    debouncedSetSearch(e.target.value);
  };

  const { data: products = [], isLoading: productsLoading } = useQuery<OdooProduct[]>({
    queryKey: ['/api/odoo/products', currentPage, pageSize, debouncedSearch],
    queryFn: async () => {
      const offset = (currentPage - 1) * pageSize;
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: offset.toString(),
      });
      if (debouncedSearch) {
        params.set('search', debouncedSearch);
      }
      const res = await fetch(`/api/odoo/products?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch products');
      return res.json();
    },
    staleTime: 60000,
  });

  const { data: categories = [] } = useQuery<OdooCategory[]>({
    queryKey: ['/api/odoo/product-categories'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/product-categories');
      if (!res.ok) return [];
      return res.json();
    },
    staleTime: 300000,
  });

  // Search is now done server-side, so only filter by category client-side
  const filteredProducts = products.filter(product => {
    const matchesCategory = selectedCategory === "all" || 
      (product.categ_id && product.categ_id[0].toString() === selectedCategory);
    
    return matchesCategory;
  });

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(price);
  };

  const getProductTypeColor = (type: string) => {
    switch (type) {
      case 'consu': return 'bg-blue-100 text-blue-700';
      case 'service': return 'bg-purple-100 text-purple-700';
      case 'product': return 'bg-green-100 text-green-700';
      default: return 'bg-gray-100 text-gray-700';
    }
  };

  const getProductTypeLabel = (type: string) => {
    switch (type) {
      case 'consu': return 'Consumable';
      case 'service': return 'Service';
      case 'product': return 'Storable';
      default: return type;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-violet-50">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur-sm border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
              <div className="flex items-center gap-2">
                <div className="p-2 bg-violet-100 rounded-lg">
                  <Package className="w-5 h-5 text-violet-600" />
                </div>
                <div>
                  <h1 className="text-xl font-semibold text-gray-900">Odoo Products</h1>
                  <p className="text-sm text-gray-500">
                    {filteredProducts.length} products {debouncedSearch && `matching "${debouncedSearch}"`}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {isAdmin && (
                <Button
                  variant={costRevealed ? "default" : "outline"}
                  size="sm"
                  onClick={() => setCostRevealed(!costRevealed)}
                  className={costRevealed ? "bg-green-600 hover:bg-green-700" : ""}
                  title={costRevealed ? "Hide cost prices" : "Show cost prices"}
                >
                  {costRevealed ? <EyeOff className="w-4 h-4 mr-1" /> : <Eye className="w-4 h-4 mr-1" />}
                  Cost
                </Button>
              )}
              <Button
                variant={viewMode === "grid" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("grid")}
                className={viewMode === "grid" ? "bg-violet-600 hover:bg-violet-700" : ""}
              >
                <LayoutGrid className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "outline"}
                size="sm"
                onClick={() => setViewMode("list")}
                className={viewMode === "list" ? "bg-violet-600 hover:bg-violet-700" : ""}
              >
                <List className="w-4 h-4" />
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                placeholder="Search by name or SKU..."
                value={searchTerm}
                onChange={handleSearchChange}
                className="pl-10 bg-white"
              />
            </div>

            <Select value={selectedCategory} onValueChange={(v) => { setSelectedCategory(v); setCurrentPage(1); }}>
              <SelectTrigger className="w-[200px] bg-white">
                <Filter className="w-4 h-4 mr-2 text-gray-400" />
                <SelectValue placeholder="All Categories" />
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

            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1 || productsLoading}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <span className="text-sm text-gray-600 min-w-[80px] text-center">
                Page {currentPage}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => p + 1)}
                disabled={products.length < pageSize || productsLoading}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {productsLoading ? (
          <div className={viewMode === "grid" 
            ? "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
            : "space-y-3"
          }>
            {Array.from({ length: 8 }).map((_, i) => (
              <Card key={i} className="overflow-hidden">
                <CardContent className="p-4">
                  <Skeleton className="h-6 w-3/4 mb-2" />
                  <Skeleton className="h-4 w-1/2 mb-4" />
                  <Skeleton className="h-8 w-1/3" />
                </CardContent>
              </Card>
            ))}
          </div>
        ) : filteredProducts.length === 0 ? (
          <div className="text-center py-12">
            <Package className="w-12 h-12 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600 mb-2">No products found</h3>
            <p className="text-gray-500">
              {debouncedSearch 
                ? `No products match "${debouncedSearch}"`
                : "No products available from Odoo"
              }
            </p>
          </div>
        ) : viewMode === "grid" ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredProducts.map((product) => (
              <Link key={product.id} href={`/odoo-products/${product.id}`}>
                <Card 
                  className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer group"
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-medium text-gray-900 truncate group-hover:text-violet-600 transition-colors">
                          {product.name}
                        </h3>
                        {product.default_code && (
                          <p className="text-sm text-gray-500 font-mono">
                            {product.default_code}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          window.open(`https://4sgraphics.odoo.com/web#id=${product.id}&model=product.template&view_type=form`, '_blank');
                        }}
                        className="p-1.5 rounded-md hover:bg-gray-100 text-gray-400 hover:text-violet-600 transition-colors"
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="flex flex-wrap gap-1.5 mb-3">
                      <Badge variant="secondary" className={getProductTypeColor(product.type)}>
                        <Box className="w-3 h-3 mr-1" />
                        {getProductTypeLabel(product.type)}
                      </Badge>
                      {product.categ_id && (
                        <Badge variant="outline" className="text-xs">
                          <Layers className="w-3 h-3 mr-1" />
                          {product.categ_id[1]}
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-gray-100">
                      <div>
                        <p className="text-xs text-gray-500">List Price</p>
                        <p className="text-lg font-semibold text-gray-900">
                          {formatPrice(product.list_price)}
                        </p>
                      </div>
                      {isAdmin && costRevealed && product.standard_price !== undefined && product.standard_price > 0 && (
                        <div className="text-right">
                          <p className="text-xs text-gray-500">Cost</p>
                          <p className="text-sm text-gray-600">
                            {formatPrice(product.standard_price)}
                          </p>
                        </div>
                      )}
                    </div>

                    {product.uom_id && (
                      <p className="text-xs text-gray-400 mt-2">
                        Unit: {product.uom_id[1]}
                      </p>
                    )}
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        ) : (
          <div className="space-y-2">
            <div className="grid grid-cols-12 gap-4 px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
              <div className="col-span-4">Product</div>
              <div className="col-span-2">SKU</div>
              <div className="col-span-2">Category</div>
              <div className="col-span-1">Type</div>
              <div className="col-span-1 text-right">List Price</div>
              <div className="col-span-1 text-right">{isAdmin && costRevealed ? 'Cost' : ''}</div>
              <div className="col-span-1"></div>
            </div>
            {filteredProducts.map((product) => (
              <Link key={product.id} href={`/odoo-products/${product.id}`}>
                <Card className="overflow-hidden hover:shadow-md transition-shadow cursor-pointer group">
                  <CardContent className="p-0">
                    <div className="grid grid-cols-12 gap-4 px-4 py-3 items-center">
                      <div className="col-span-4">
                        <p className="font-medium text-gray-900 truncate group-hover:text-violet-600 transition-colors">{product.name}</p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600 font-mono">
                          {product.default_code || '-'}
                        </p>
                      </div>
                      <div className="col-span-2">
                        <p className="text-sm text-gray-600 truncate">
                          {product.categ_id ? product.categ_id[1] : '-'}
                        </p>
                      </div>
                      <div className="col-span-1">
                        <Badge variant="secondary" className={`text-xs ${getProductTypeColor(product.type)}`}>
                          {getProductTypeLabel(product.type)}
                        </Badge>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="font-medium text-gray-900">
                          {formatPrice(product.list_price)}
                        </p>
                      </div>
                      <div className="col-span-1 text-right">
                        <p className="text-sm text-gray-600">
                          {isAdmin && costRevealed && product.standard_price ? formatPrice(product.standard_price) : ''}
                        </p>
                      </div>
                      <div className="col-span-1 text-right">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            window.open(`https://4sgraphics.odoo.com/web#id=${product.id}&model=product.template&view_type=form`, '_blank');
                          }}
                          className="inline-flex items-center text-sm text-violet-600 hover:text-violet-700"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

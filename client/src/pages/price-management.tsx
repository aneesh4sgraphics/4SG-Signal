import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, DollarSign, Search, Edit, Save, X, Filter, ArrowUp, ArrowDown } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface PricingEntry {
  id: number;
  productTypeId: number;
  tierId: number;
  pricePerSquareMeter: string;
  categoryName?: string;
  productTypeName?: string;
  tierName?: string;
}

interface ProductType {
  id: number;
  name: string;
  categoryName: string;
}

interface PricingTier {
  id: number;
  name: string;
}

type SortField = 'categoryName' | 'productTypeName' | 'tierName' | 'pricePerSquareMeter';
type SortDirection = 'asc' | 'desc';

export default function PriceManagement() {
  console.log("PriceManagement component rendering...");
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValue, setEditValue] = useState("");
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('categoryName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Filtering state
  const [filters, setFilters] = useState({
    category: '',
    tier: ''
  });
  
  const { toast } = useToast();

  // Fetch pricing data with joins
  const { data: pricingData = [], isLoading: pricingLoading, error: pricingError } = useQuery<PricingEntry[]>({
    queryKey: ["/api/pricing-data"],
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  // Fetch product types for filtering  
  const { data: productTypes = [], error: typesError } = useQuery<ProductType[]>({
    queryKey: ["/api/product-types-all"],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch pricing tiers for filtering
  const { data: pricingTiers = [], error: tiersError } = useQuery<PricingTier[]>({
    queryKey: ["/api/pricing-tiers"],
    staleTime: 5 * 60 * 1000,
  });

  // Debug console logs
  console.log("Price Management Debug:", {
    pricingData,
    pricingLoading,
    pricingError,
    productTypes,
    pricingTiers,
    typesError,
    tiersError
  });

  const updatePriceMutation = useMutation({
    mutationFn: async ({ id, price }: { id: number; price: string }) => {
      const response = await apiRequest("PUT", `/api/pricing/${id}`, { 
        pricePerSquareMeter: price 
      });
      if (!response.ok) {
        throw new Error("Failed to update price");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-data"] });
      setEditingId(null);
      setEditValue("");
      toast({
        title: "Success",
        description: "Price updated successfully",
      });
    },
    onError: (error) => {
      console.error("Error updating price:", error);
      toast({
        title: "Error",
        description: "Failed to update price. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleEditStart = (id: number, currentPrice: string) => {
    setEditingId(id);
    setEditValue(currentPrice);
  };

  const handleEditSave = () => {
    if (editingId && editValue) {
      const numericValue = parseFloat(editValue);
      if (isNaN(numericValue) || numericValue < 0) {
        toast({
          title: "Error",
          description: "Please enter a valid positive price",
          variant: "destructive",
        });
        return;
      }
      updatePriceMutation.mutate({ id: editingId, price: editValue });
    }
  };

  const handleEditCancel = () => {
    setEditingId(null);
    setEditValue("");
  };

  // Handle sorting
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Get unique categories for filtering  
  const uniqueCategories = Array.from(new Set(pricingData.map(item => item.categoryName).filter(Boolean))).sort();
  
  console.log("uniqueCategories:", uniqueCategories);

  // Filter and sort pricing data
  const filteredAndSortedData = pricingData
    .filter(item => {
      const searchLower = searchTerm.toLowerCase();
      const categoryMatch = (item.categoryName?.toLowerCase() || '').includes(searchLower) ||
                           (item.productTypeName?.toLowerCase() || '').includes(searchLower) ||
                           (item.tierName?.toLowerCase() || '').includes(searchLower);
      
      const categoryFilter = !filters.category || item.categoryName === filters.category;
      const tierFilter = !filters.tier || item.tierName === filters.tier;
      
      return categoryMatch && categoryFilter && tierFilter;
    })
    .sort((a, b) => {
      let aValue = '';
      let bValue = '';
      
      switch (sortField) {
        case 'categoryName':
          aValue = a.categoryName || '';
          bValue = b.categoryName || '';
          break;
        case 'productTypeName':
          aValue = a.productTypeName || '';
          bValue = b.productTypeName || '';
          break;
        case 'tierName':
          aValue = a.tierName || '';
          bValue = b.tierName || '';
          break;
        case 'pricePerSquareMeter':
          const aPrice = parseFloat(a.pricePerSquareMeter) || 0;
          const bPrice = parseFloat(b.pricePerSquareMeter) || 0;
          return sortDirection === 'asc' ? aPrice - bPrice : bPrice - aPrice;
      }
      
      aValue = aValue.toLowerCase();
      bValue = bValue.toLowerCase();
      
      if (sortDirection === 'asc') {
        return aValue.localeCompare(bValue);
      } else {
        return bValue.localeCompare(aValue);
      }
    });

  // Check if any filters are active
  const hasActiveFilters = filters.category || filters.tier;

  // Clear all filters
  const clearFilters = () => {
    setFilters({ category: '', tier: '' });
    setSearchTerm('');
  };

  console.log("About to render PriceManagement component with data:", { 
    pricingDataCount: pricingData.length, 
    uniqueCategoriesCount: uniqueCategories.length,
    pricingLoading,
    pricingError: pricingError?.message
  });

  if (pricingError) {
    console.error("Pricing error details:", pricingError);
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
              <DollarSign className="h-8 w-8" />
              Price Management
            </h1>
            <p className="text-gray-600">Edit and manage product pricing across all tiers</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Search and Filters */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5" />
              Search & Filter Pricing
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Search Bar */}
            <div className="relative">
              <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search by category, product type, or tier..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>

            {/* Sorting and Filtering Controls */}
            <div className="flex flex-wrap gap-3 items-center">
              {/* Sort Dropdown */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Sort by:</span>
                <Select value={sortField} onValueChange={(value: SortField) => setSortField(value)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="categoryName">Category</SelectItem>
                    <SelectItem value="productTypeName">Product Type</SelectItem>
                    <SelectItem value="tierName">Tier</SelectItem>
                    <SelectItem value="pricePerSquareMeter">Price</SelectItem>
                  </SelectContent>
                </Select>
                
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc')}
                >
                  {sortDirection === 'asc' ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}
                </Button>
              </div>

              {/* Category Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Category:</span>
                <Select value={filters.category || "ALL_CATEGORIES"} onValueChange={(value) => setFilters({...filters, category: value === "ALL_CATEGORIES" ? "" : value})}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Categories" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_CATEGORIES">All Categories</SelectItem>
                    {uniqueCategories.map(category => (
                      <SelectItem key={category} value={category}>{category}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Tier Filter */}
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-gray-700">Tier:</span>
                <Select value={filters.tier || "ALL_TIERS"} onValueChange={(value) => setFilters({...filters, tier: value === "ALL_TIERS" ? "" : value})}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="All Tiers" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL_TIERS">All Tiers</SelectItem>
                    {pricingTiers.map(tier => (
                      <SelectItem key={tier.id} value={tier.name}>{tier.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Clear Filters */}
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" onClick={clearFilters}>
                  <X className="h-4 w-4 mr-1" />
                  Clear Filters
                </Button>
              )}

              {/* Results Count */}
              <div className="text-sm text-gray-600 ml-auto">
                Showing {filteredAndSortedData.length} of {pricingData.length} entries
              </div>
            </div>

            {/* Active Filters Display */}
            {hasActiveFilters && (
              <div className="flex flex-wrap gap-2">
                <span className="text-sm text-gray-600">Active filters:</span>
                {filters.category && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Category: {filters.category}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters({...filters, category: ''})} />
                  </Badge>
                )}
                {filters.tier && (
                  <Badge variant="secondary" className="flex items-center gap-1">
                    Tier: {filters.tier}
                    <X className="h-3 w-3 cursor-pointer" onClick={() => setFilters({...filters, tier: ''})} />
                  </Badge>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Pricing Table */}
        <Card className="shadow-sm">
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <DollarSign className="h-5 w-5" />
                Pricing Database ({filteredAndSortedData.length} entries)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {pricingLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
                <p className="mt-2 text-gray-500">Loading pricing data...</p>
              </div>
            ) : pricingError ? (
              <div className="text-center py-8">
                <div className="text-red-600 mb-2">Error loading pricing data</div>
                <p className="text-gray-500 text-sm">{pricingError.message}</p>
              </div>
            ) : filteredAndSortedData.length === 0 ? (
              <div className="text-center py-8">
                <DollarSign className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">
                  {searchTerm || hasActiveFilters ? "No pricing entries found matching your criteria." : "No pricing data available."}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse border border-gray-200">
                  <thead>
                    <tr className="bg-gray-50">
                      <th 
                        className="border border-gray-200 px-4 py-2 text-left cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('categoryName')}
                      >
                        <div className="flex items-center gap-1">
                          Category
                          {sortField === 'categoryName' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="border border-gray-200 px-4 py-2 text-left cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('productTypeName')}
                      >
                        <div className="flex items-center gap-1">
                          Product Type
                          {sortField === 'productTypeName' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="border border-gray-200 px-4 py-2 text-left cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('tierName')}
                      >
                        <div className="flex items-center gap-1">
                          Pricing Tier
                          {sortField === 'tierName' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th 
                        className="border border-gray-200 px-4 py-2 text-left cursor-pointer hover:bg-gray-100"
                        onClick={() => handleSort('pricePerSquareMeter')}
                      >
                        <div className="flex items-center gap-1">
                          Price per Sq.M
                          {sortField === 'pricePerSquareMeter' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </div>
                      </th>
                      <th className="border border-gray-200 px-4 py-2 text-left w-24">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredAndSortedData.map((item) => (
                      <tr key={item.id} className="hover:bg-gray-50">
                        <td className="border border-gray-200 px-4 py-2">{item.categoryName}</td>
                        <td className="border border-gray-200 px-4 py-2">{item.productTypeName}</td>
                        <td className="border border-gray-200 px-4 py-2">
                          <Badge variant="outline">{item.tierName}</Badge>
                        </td>
                        <td className="border border-gray-200 px-4 py-2">
                          {editingId === item.id ? (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                step="0.01"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                className="w-24"
                                autoFocus
                              />
                              <Button
                                size="sm"
                                onClick={handleEditSave}
                                disabled={updatePriceMutation.isPending}
                              >
                                <Save className="h-3 w-3" />
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={handleEditCancel}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          ) : (
                            <span className="font-mono">${parseFloat(item.pricePerSquareMeter).toFixed(2)}</span>
                          )}
                        </td>
                        <td className="border border-gray-200 px-4 py-2">
                          {editingId !== item.id && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditStart(item.id, item.pricePerSquareMeter)}
                            >
                              <Edit className="h-3 w-3" />
                            </Button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
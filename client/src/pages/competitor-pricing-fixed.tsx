import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Filter, Plus, RotateCcw, Sheet, Trash2, Upload, FileText, Search } from "lucide-react";
import { RippleButton } from "@/components/ui/micro-interactions";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { toast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

interface CompetitorData {
  id: number;
  timestamp: Date | string;
  type: string;
  dimensions: string;
  width?: number | string;
  length?: number | string;
  unit?: string;
  packQty: number | string;
  inputPrice: number | string;
  thickness: string;
  productKind: string;
  surfaceFinish: string;
  supplierInfo: string;
  infoReceivedFrom: string;
  pricePerSqIn: number | string;
  pricePerSqFt: number | string;
  pricePerSqMeter: number | string;
  notes: string;
  source: string;
  addedBy: string;
  createdAt: Date | string;
}

export default function CompetitorPricing() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const queryClient = useQueryClient();
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Filter states
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [thicknessFilter, setThicknessFilter] = useState("all");
  const [productKindFilter, setProductKindFilter] = useState("all");
  const [surfaceFinishFilter, setSurfaceFinishFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<number[][]>([]);

  // Show authentication check first
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <TrendingUp className="h-16 w-16 text-orange-500 mx-auto mb-4" />
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Authentication Required</h1>
          <p className="text-gray-600 mb-4">You need to be logged in to access Competitor Pricing Intelligence.</p>
          <Button onClick={() => window.location.href = '/api/login'} className="bg-blue-600 hover:bg-blue-700">
            Login to Continue
          </Button>
        </div>
      </div>
    );
  }

  // Fetch competitor pricing data
  const { data: competitorData = [], isLoading, error } = useQuery({
    queryKey: ["/api/competitor-pricing"],
    retry: false,
    enabled: isAuthenticated
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/competitor-pricing/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing"] });
      toast({
        title: "Success",
        description: "Entry deleted successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete entry",
        variant: "destructive",
      });
    },
  });

  // File upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-competitor-pricing', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Upload failed' }));
        throw new Error(errorData.error || 'Upload failed');
      }
      
      return response.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing"] });
      setUploadFile(null);
      toast({
        title: "Success",
        description: data.message || "Data uploaded successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message || "Failed to upload data",
        variant: "destructive",
      });
    },
  });

  // Handle file upload
  const handleFileUpload = () => {
    if (!uploadFile) return;
    uploadMutation.mutate(uploadFile);
  };

  // Handle delete
  const handleDeleteEntry = (id: number) => {
    if (window.confirm("Are you sure you want to delete this entry?")) {
      deleteMutation.mutate(id);
    }
  };

  // Get filter options using useMemo to prevent recalculation
  const { suppliers, thicknesses, productKinds, surfaceFinishes } = useMemo(() => {
    if (!competitorData || !Array.isArray(competitorData)) {
      return { suppliers: [], thicknesses: [], productKinds: [], surfaceFinishes: [] };
    }

    return {
      suppliers: [...new Set(competitorData.map(item => item.supplierInfo).filter(Boolean))],
      thicknesses: [...new Set(competitorData.map(item => item.thickness).filter(Boolean))],
      productKinds: [...new Set(competitorData.map(item => item.productKind).filter(Boolean))],
      surfaceFinishes: [...new Set(competitorData.map(item => item.surfaceFinish).filter(Boolean))],
    };
  }, [competitorData]);

  // Filter data using useMemo
  const filteredData = useMemo(() => {
    if (!competitorData || !Array.isArray(competitorData)) {
      return [];
    }
    
    let filtered = [...competitorData];
    
    if (supplierFilter && supplierFilter !== "all") {
      filtered = filtered.filter(item => item.supplierInfo === supplierFilter);
    }
    
    if (thicknessFilter && thicknessFilter !== "all") {
      filtered = filtered.filter(item => item.thickness === thicknessFilter);
    }
    
    if (productKindFilter && productKindFilter !== "all") {
      filtered = filtered.filter(item => item.productKind === productKindFilter);
    }
    
    if (surfaceFinishFilter && surfaceFinishFilter !== "all") {
      filtered = filtered.filter(item => item.surfaceFinish === surfaceFinishFilter);
    }
    
    if (minPrice) {
      const min = parseFloat(minPrice);
      if (!isNaN(min)) {
        filtered = filtered.filter(item => {
          const price = parseFloat(item.pricePerSqMeter);
          return !isNaN(price) && price >= min;
        });
      }
    }
    
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      if (!isNaN(max)) {
        filtered = filtered.filter(item => {
          const price = parseFloat(item.pricePerSqMeter);
          return !isNaN(price) && price <= max;
        });
      }
    }
    
    return filtered;
  }, [competitorData, supplierFilter, thicknessFilter, productKindFilter, surfaceFinishFilter, minPrice, maxPrice]);

  // Reset filters
  const resetFilters = () => {
    setSupplierFilter("all");
    setThicknessFilter("all");
    setProductKindFilter("all");
    setSurfaceFinishFilter("all");
    setMinPrice("");
    setMaxPrice("");
  };

  // Find duplicates function
  const findDuplicates = () => {
    const groups: number[][] = [];
    const processed = new Set<number>();
    
    filteredData.forEach((item1, index1) => {
      if (processed.has(index1)) return;
      
      const duplicates = [index1];
      
      filteredData.forEach((item2, index2) => {
        if (index1 !== index2 && !processed.has(index2)) {
          // Check if all relevant columns match exactly
          const matches = 
            item1.type === item2.type &&
            item1.dimensions === item2.dimensions &&
            parseFloat(item1.packQty).toFixed(2) === parseFloat(item2.packQty).toFixed(2) &&
            parseFloat(item1.inputPrice).toFixed(2) === parseFloat(item2.inputPrice).toFixed(2) &&
            item1.thickness === item2.thickness &&
            item1.productKind === item2.productKind &&
            item1.surfaceFinish === item2.surfaceFinish &&
            item1.supplierInfo === item2.supplierInfo &&
            item1.infoReceivedFrom === item2.infoReceivedFrom &&
            parseFloat(item1.pricePerSqMeter).toFixed(4) === parseFloat(item2.pricePerSqMeter).toFixed(4) &&
            item1.notes === item2.notes;
            
          if (matches) {
            duplicates.push(index2);
          }
        }
      });
      
      if (duplicates.length > 1) {
        groups.push(duplicates);
        duplicates.forEach(idx => processed.add(idx));
      }
    });
    
    setDuplicateGroups(groups);
    setShowDuplicates(true);
    
    if (groups.length === 0) {
      toast({
        title: "No Duplicates Found",
        description: "No exact duplicate entries were found in the current filtered data.",
      });
    } else {
      const totalDuplicates = groups.reduce((sum, group) => sum + group.length, 0);
      toast({
        title: "Duplicates Found",
        description: `Found ${groups.length} duplicate groups with ${totalDuplicates} total entries.`,
      });
    }
  };

  // Get row color based on duplicate status
  const getRowColor = (index: number) => {
    if (!showDuplicates) return "";
    
    const groupIndex = duplicateGroups.findIndex(group => group.includes(index));
    if (groupIndex === -1) return "";
    
    // Alternate colors for different duplicate groups
    const colors = [
      "bg-red-50 border-l-4 border-red-400",
      "bg-blue-50 border-l-4 border-blue-400", 
      "bg-green-50 border-l-4 border-green-400",
      "bg-yellow-50 border-l-4 border-yellow-400",
      "bg-purple-50 border-l-4 border-purple-400",
      "bg-pink-50 border-l-4 border-pink-400",
      "bg-indigo-50 border-l-4 border-indigo-400",
      "bg-orange-50 border-l-4 border-orange-400"
    ];
    
    return colors[groupIndex % colors.length];
  };

  // Export to CSV
  const exportToCSV = () => {
    if (filteredData.length === 0) return;

    const headers = ["Source", "Type", "Dimensions", "Pack Qty", "Price/Pack", "Price/Sheet", "Thickness", "Product Kind", "Surface Finish", "Supplier", "Info From", "Price/m²", "Notes", "Date"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map(item => {
        const pricePerSheet = item.pricePerSheet && parseFloat(item.pricePerSheet) > 0 
          ? parseFloat(item.pricePerSheet) 
          : (parseFloat(item.inputPrice) / (parseInt(item.packQty) || 1));
        return [
          item.source,
          item.type,
          item.dimensions,
          item.packQty,
          `$${parseFloat(item.inputPrice).toFixed(2)}`,
          `$${pricePerSheet.toFixed(2)}`,
          `"${item.thickness}"`,
          `"${item.productKind}"`,
          `"${item.surfaceFinish}"`,
          `"${item.supplierInfo}"`,
          `"${item.infoReceivedFrom}"`,
          `$${parseFloat(item.pricePerSqMeter).toFixed(4)}`,
          `"${item.notes}"`,
          new Date(item.timestamp || item.createdAt).toLocaleDateString()
        ].join(",");
      })
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `competitor-pricing-data-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Show loading state
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading competitor pricing data...</p>
        </div>
      </div>
    );
  }

  // Show error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="text-red-500 text-lg mb-4">Error Loading Data</div>
          <p className="text-gray-600 mb-4">Unable to load competitor pricing data.</p>
          <Button onClick={() => window.location.reload()} className="bg-blue-600 hover:bg-blue-700">
            Try Again
          </Button>
        </div>
      </div>
    );
  }

  const isAdmin = user?.role === 'admin' || user?.email === 'aneesh@4sgraphics.com' || user?.email === 'oscar@4sgraphics.com';

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-lg mr-4">
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
            <div>
              <h1 className="text-3xl font-bold text-gray-900">Market Prices</h1>
              <p className="text-gray-600">Track, analyze, and contribute competitor pricing information</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link href="/area-pricer">
              <Button className="bg-purple-600 hover:bg-purple-700 text-white">
                <Plus className="w-4 h-4 mr-2" />
                Add New Entry
              </Button>
            </Link>
          </div>
        </div>
      </div>

      {/* Filters */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filter Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All suppliers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Suppliers</SelectItem>
                  {suppliers.map(supplier => (
                    <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="thickness">Thickness</Label>
              <Select value={thicknessFilter} onValueChange={setThicknessFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All thicknesses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Thicknesses</SelectItem>
                  {thicknesses.map(thickness => (
                    <SelectItem key={thickness} value={thickness}>{thickness}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="productKind">Product Kind</Label>
              <Select value={productKindFilter} onValueChange={setProductKindFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All product kinds" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Product Kinds</SelectItem>
                  {productKinds.map(kind => (
                    <SelectItem key={kind} value={kind}>{kind}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="surfaceFinish">Surface Finish</Label>
              <Select value={surfaceFinishFilter} onValueChange={setSurfaceFinishFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="All finishes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Surface Finishes</SelectItem>
                  {surfaceFinishes.map(finish => (
                    <SelectItem key={finish} value={finish}>{finish}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <Label htmlFor="minPrice">Min Price ($/m²)</Label>
              <Input
                id="minPrice"
                type="number"
                step="0.01"
                placeholder="0.00"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
              />
            </div>
            
            <div>
              <Label htmlFor="maxPrice">Max Price ($/m²)</Label>
              <Input
                id="maxPrice"
                type="number"
                step="0.01"
                placeholder="999.99"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
              />
            </div>
            
            <div className="flex items-end">
              <Button 
                onClick={resetFilters} 
                variant="outline" 
                className="w-full"
              >
                <RotateCcw className="w-4 h-4 mr-2" />
                Reset Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <Button
            onClick={exportToCSV}
            disabled={filteredData.length === 0}
            className="bg-green-600 hover:bg-green-700"
          >
            <Sheet className="w-4 h-4 mr-2" />
            Export CSV ({filteredData.length} entries)
          </Button>
          <Button
            onClick={findDuplicates}
            disabled={filteredData.length === 0}
            variant={showDuplicates ? "default" : "outline"}
            className={showDuplicates ? "bg-orange-600 hover:bg-orange-700" : ""}
          >
            <Search className="w-4 h-4 mr-2" />
            {showDuplicates ? "Hide Duplicates" : "Find Duplicates"}
          </Button>
          {showDuplicates && (
            <Button
              onClick={() => {
                setShowDuplicates(false);
                setDuplicateGroups([]);
              }}
              variant="ghost"
              className="text-gray-600"
            >
              Clear Highlighting
            </Button>
          )}
        </div>
        
        {isAdmin && (
          <div className="flex gap-2 items-center">
            <input
              type="file"
              accept=".csv"
              onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              className="hidden"
              id="csv-upload"
            />
            <label htmlFor="csv-upload">
              <Button variant="outline" className="cursor-pointer" asChild>
                <span>
                  <Upload className="w-4 h-4 mr-2" />
                  Choose CSV File
                </span>
              </Button>
            </label>
            {uploadFile && (
              <Button
                onClick={handleFileUpload}
                disabled={uploadMutation.isPending}
                className="bg-blue-600 hover:bg-blue-700"
              >
                {uploadMutation.isPending ? "Uploading..." : "Upload"}
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center">
              <FileText className="w-5 h-5 mr-2" />
              Competitor Pricing Data ({filteredData.length} entries)
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto max-w-full">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  <TableHead className="whitespace-nowrap">Source</TableHead>
                  <TableHead className="whitespace-nowrap">Type</TableHead>
                  <TableHead className="whitespace-nowrap">Dimensions</TableHead>
                  <TableHead className="whitespace-nowrap">Pack Qty</TableHead>
                  <TableHead className="whitespace-nowrap">Price/Pack</TableHead>
                  <TableHead className="whitespace-nowrap">Price/Sheet</TableHead>
                  <TableHead className="whitespace-nowrap">Thickness</TableHead>
                  <TableHead className="whitespace-nowrap">Product Kind</TableHead>
                  <TableHead className="whitespace-nowrap">Surface Finish</TableHead>
                  <TableHead className="whitespace-nowrap">Supplier</TableHead>
                  <TableHead className="whitespace-nowrap">Info From</TableHead>
                  <TableHead className="whitespace-nowrap">Price/m²</TableHead>
                  <TableHead className="whitespace-nowrap">Notes</TableHead>
                  <TableHead className="whitespace-nowrap">Date</TableHead>
                  {isAdmin && <TableHead className="w-20 sticky right-0 bg-white shadow-md whitespace-nowrap">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item, index) => (
                  <TableRow key={item.id} className={getRowColor(index)}>
                    <TableCell className="whitespace-nowrap">{item.source}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.type}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.dimensions}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.packQty}</TableCell>
                    <TableCell className="whitespace-nowrap">${parseFloat(item.inputPrice).toFixed(2)}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      ${(item.pricePerSheet && parseFloat(item.pricePerSheet) > 0 
                        ? parseFloat(item.pricePerSheet) 
                        : (parseFloat(item.inputPrice) / (parseInt(item.packQty) || 1))
                      ).toFixed(2)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{item.thickness}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.productKind}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.surfaceFinish}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.supplierInfo}</TableCell>
                    <TableCell className="whitespace-nowrap">{item.infoReceivedFrom}</TableCell>
                    <TableCell className="whitespace-nowrap">${parseFloat(item.pricePerSqMeter).toFixed(4)}</TableCell>
                    <TableCell className="max-w-32 truncate" title={item.notes}>{item.notes}</TableCell>
                    <TableCell className="whitespace-nowrap">
                      {new Date(item.timestamp || item.createdAt).toLocaleDateString()}
                    </TableCell>
                    {isAdmin && (
                      <TableCell className="w-20 sticky right-0 bg-white shadow-md">
                        <RippleButton
                          variant="ghost"
                          size="sm"
                          onClick={() => handleDeleteEntry(item.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="w-4 h-4" />
                        </RippleButton>
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {filteredData.length === 0 && (
              <div className="text-center py-8 text-gray-500">
                No data matches your current filters. Try adjusting the filters or{" "}
                <Link href="/area-pricer" className="text-blue-600 hover:underline">
                  add new entries
                </Link>
                .
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
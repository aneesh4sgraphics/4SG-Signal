import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Filter, Plus, RotateCcw, Sheet, Trash2, Upload, FileText } from "lucide-react";
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
  const [filteredData, setFilteredData] = useState<CompetitorData[]>([]);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  

  
  // Filter states
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [thicknessFilter, setThicknessFilter] = useState("all");
  const [productKindFilter, setProductKindFilter] = useState("all");
  const [surfaceFinishFilter, setSurfaceFinishFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  
  // Filter dropdown options
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [thicknesses, setThicknesses] = useState<string[]>([]);
  const [productKinds, setProductKinds] = useState<string[]>([]);
  const [surfaceFinishes, setSurfaceFinishes] = useState<string[]>([]);

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
    select: (data) => data.map((item: any) => ({
      ...item,
      timestamp: new Date(item.timestamp || item.createdAt),
      createdAt: new Date(item.createdAt)
    })),
    retry: false,
    enabled: isAuthenticated
  });

  // Delete mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest(`/api/competitor-pricing/${id}`, {
        method: "DELETE",
      });
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

  // Update filter options when data changes
  useEffect(() => {
    if (competitorData.length > 0) {
      const uniqueSuppliers = [...new Set(competitorData.map(item => item.supplierInfo).filter(Boolean))];
      const uniqueThicknesses = [...new Set(competitorData.map(item => item.thickness).filter(Boolean))];
      const uniqueProductKinds = [...new Set(competitorData.map(item => item.productKind).filter(Boolean))];
      const uniqueSurfaceFinishes = [...new Set(competitorData.map(item => item.surfaceFinish).filter(Boolean))];
      
      setSuppliers(uniqueSuppliers);
      setThicknesses(uniqueThicknesses);
      setProductKinds(uniqueProductKinds);
      setSurfaceFinishes(uniqueSurfaceFinishes);
    }
  }, [competitorData]);

  // Filter data based on selected filters
  useEffect(() => {
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
      filtered = filtered.filter(item => parseFloat(item.pricePerSqMeter) >= min);
    }
    
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter(item => parseFloat(item.pricePerSqMeter) <= max);
    }
    
    setFilteredData(filtered);
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

  // Export to CSV
  const exportToCSV = () => {
    if (filteredData.length === 0) return;

    const headers = ["Source", "Type", "Dimensions", "Pack Qty", "Input Price", "Thickness", "Product Kind", "Surface Finish", "Supplier", "Info From", "Price/in²", "Price/ft²", "Price/m²", "Notes", "Date"];
    const csvContent = [
      headers.join(","),
      ...filteredData.map(item => [
        item.source,
        item.type,
        item.dimensions,
        item.packQty,
        `$${parseFloat(item.inputPrice).toFixed(2)}`,
        `"${item.thickness}"`,
        `"${item.productKind}"`,
        `"${item.surfaceFinish}"`,
        `"${item.supplierInfo}"`,
        `"${item.infoReceivedFrom}"`,
        `$${parseFloat(item.pricePerSqIn).toFixed(4)}`,
        `$${parseFloat(item.pricePerSqFt).toFixed(4)}`,
        `$${parseFloat(item.pricePerSqMeter).toFixed(4)}`,
        `"${item.notes}"`,
        new Date(item.timestamp).toLocaleDateString()
      ].join(","))
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
              <h1 className="text-3xl font-bold text-gray-900">Competitor Pricing Intelligence</h1>
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
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <Label htmlFor="minPrice">Min Price ($/m²)</Label>
              <Input
                id="minPrice"
                type="number"
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="e.g., 10.00"
              />
            </div>
            <div>
              <Label htmlFor="maxPrice">Max Price ($/m²)</Label>
              <Input
                id="maxPrice"
                type="number"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="e.g., 50.00"
              />
            </div>
          </div>
          
          <div className="flex justify-end">
            <Button onClick={resetFilters} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Pricing Data ({filteredData.length} entries)</CardTitle>
            <div className="flex gap-2">
              {isAdmin && (
                <div className="flex items-center gap-2">
                  <input
                    type="file"
                    accept=".csv"
                    onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                    className="hidden"
                    id="upload-file"
                  />
                  <label htmlFor="upload-file">
                    <Button variant="outline" className="cursor-pointer" asChild>
                      <span>
                        <FileText className="w-4 h-4 mr-2" />
                        Choose File
                      </span>
                    </Button>
                  </label>
                  {uploadFile && (
                    <Button
                      onClick={handleFileUpload}
                      disabled={uploadMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700 text-white"
                    >
                      {uploadMutation.isPending ? (
                        <>
                          <Upload className="w-4 h-4 mr-2 animate-spin" />
                          Uploading...
                        </>
                      ) : (
                        <>
                          <Upload className="w-4 h-4 mr-2" />
                          Upload Data
                        </>
                      )}
                    </Button>
                  )}
                </div>
              )}
              <Button onClick={exportToCSV} className="bg-green-600 hover:bg-green-700 text-white">
                <Sheet className="w-4 h-4 mr-2" />
                Export Excel
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No competitor pricing data available.</p>
              <p className="text-sm text-gray-400">Add data from the Area Pricer or upload a CSV file.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Pack Qty</TableHead>
                    <TableHead>Input Price</TableHead>
                    <TableHead>Thickness</TableHead>
                    <TableHead>Product Kind</TableHead>
                    <TableHead>Surface Finish</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Info From</TableHead>
                    <TableHead>Price/in²</TableHead>
                    <TableHead>Price/ft²</TableHead>
                    <TableHead>Price/m²</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Date</TableHead>
                    {isAdmin && <TableHead>Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell>{item.source}</TableCell>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>{item.dimensions}</TableCell>
                      <TableCell>{item.packQty}</TableCell>
                      <TableCell>${parseFloat(item.inputPrice).toFixed(2)}</TableCell>
                      <TableCell>{item.thickness}</TableCell>
                      <TableCell>{item.productKind}</TableCell>
                      <TableCell>{item.surfaceFinish}</TableCell>
                      <TableCell>{item.supplierInfo}</TableCell>
                      <TableCell>{item.infoReceivedFrom}</TableCell>
                      <TableCell>${parseFloat(item.pricePerSqIn).toFixed(4)}</TableCell>
                      <TableCell>${parseFloat(item.pricePerSqFt).toFixed(4)}</TableCell>
                      <TableCell>${parseFloat(item.pricePerSqMeter).toFixed(4)}</TableCell>
                      <TableCell className="max-w-xs truncate">{item.notes}</TableCell>
                      <TableCell>{new Date(item.timestamp).toLocaleDateString()}</TableCell>
                      {isAdmin && (
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDeleteEntry(item.id)}
                            className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
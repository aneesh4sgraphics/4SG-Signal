import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Filter, Plus, RotateCcw, Sheet, Trash2, Upload, FileText, Search, Download, Settings2, Edit } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
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
  pricePerSheet?: number | string;
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
  const [sizeFilter, setSizeFilter] = useState("all");
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [duplicateGroups, setDuplicateGroups] = useState<number[][]>([]);
  
  // Bulk selection state
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  
  // Bulk edit state
  const [showBulkEditModal, setShowBulkEditModal] = useState(false);
  const [bulkEditField, setBulkEditField] = useState("");
  const [bulkEditValue, setBulkEditValue] = useState("");
  
  // Column visibility state
  const allColumns = [
    { key: 'source', label: 'Source' },
    { key: 'type', label: 'Type' },
    { key: 'dimensions', label: 'Dimensions' },
    { key: 'packQty', label: 'Pack Qty' },
    { key: 'pricePack', label: 'Price/Pack' },
    { key: 'priceSheet', label: 'Price/Sheet' },
    { key: 'thickness', label: 'Thickness' },
    { key: 'productKind', label: 'Product Kind' },
    { key: 'surfaceFinish', label: 'Surface Finish' },
    { key: 'supplier', label: 'Supplier' },
    { key: 'infoFrom', label: 'Info From' },
    { key: 'priceM2', label: 'Price/m²' },
    { key: 'notes', label: 'Notes' },
    { key: 'date', label: 'Date' },
  ];
  // Default visible columns: Product Kind, Dimensions, Thickness, Price/Sheet, Price/m², Notes
  const [visibleColumns, setVisibleColumns] = useState<Set<string>>(
    new Set(['productKind', 'dimensions', 'thickness', 'priceSheet', 'priceM2', 'notes'])
  );
  
  const toggleColumn = (key: string) => {
    setVisibleColumns(prev => {
      const newSet = new Set(prev);
      if (newSet.has(key)) {
        newSet.delete(key);
      } else {
        newSet.add(key);
      }
      return newSet;
    });
  };
  
  // Calculate Price/m² from dimensions and price/sheet
  const calculatePricePerM2 = (item: CompetitorData) => {
    // If pricePerSqMeter exists and is not zero, use it
    const existingPrice = parseFloat(String(item.pricePerSqMeter || 0));
    if (existingPrice > 0) return existingPrice;
    
    // Calculate from dimensions
    let widthIn = 0;
    let lengthIn = 0;
    
    // Try to get width and length from item properties
    if (item.width && item.length) {
      widthIn = parseFloat(String(item.width)) || 0;
      lengthIn = parseFloat(String(item.length)) || 0;
      
      // Convert if unit is not inches
      const unit = (item.unit || 'in').toLowerCase();
      if (unit === 'mm') {
        widthIn = widthIn / 25.4;
        lengthIn = lengthIn / 25.4;
      } else if (unit === 'cm') {
        widthIn = widthIn / 2.54;
        lengthIn = lengthIn / 2.54;
      } else if (unit === 'm') {
        widthIn = widthIn * 39.3701;
        lengthIn = lengthIn * 39.3701;
      } else if (unit === 'ft') {
        widthIn = widthIn * 12;
        lengthIn = lengthIn * 12;
      }
    } else if (item.dimensions) {
      // Parse dimensions string like "48 x 96" or "48x96"
      const match = item.dimensions.match(/(\d+\.?\d*)\s*[xX×]\s*(\d+\.?\d*)/);
      if (match) {
        widthIn = parseFloat(match[1]) || 0;
        lengthIn = parseFloat(match[2]) || 0;
      }
    }
    
    if (widthIn <= 0 || lengthIn <= 0) return 0;
    
    // Calculate area in m² (1 sq inch = 0.00064516 m²)
    const areaM2 = widthIn * lengthIn * 0.00064516;
    
    // Calculate price per sheet
    const pricePerSheet = item.pricePerSheet && parseFloat(String(item.pricePerSheet)) > 0 
      ? parseFloat(String(item.pricePerSheet)) 
      : (parseFloat(String(item.inputPrice)) / (parseInt(String(item.packQty)) || 1));
    
    if (areaM2 <= 0 || pricePerSheet <= 0) return 0;
    
    return pricePerSheet / areaM2;
  };

  // Download CSV template
  const downloadTemplate = () => {
    const headers = ["Source", "Type", "Width", "Length", "Unit", "Pack Qty", "Price/Pack", "Price/Sheet", "Thickness", "Product Kind", "Surface Finish", "Supplier", "Info From", "Notes"];
    const exampleRow = ["Website", "sheet", "48", "96", "in", "25", "139.99", "5.60", "3mm", "Aluminum Composite Panel", "Gloss White", "Competitor Name", "John Doe", "Optional notes"];
    
    const csvContent = [
      headers.join(","),
      exampleRow.join(",")
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "market-prices-template.csv";
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Template Downloaded",
      description: "Fill in your data and upload using the CSV Upload button",
    });
  };

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

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      for (const id of ids) {
        await apiRequest("DELETE", `/api/competitor-pricing/${id}`);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing"] });
      setSelectedIds(new Set());
      toast({
        title: "Success",
        description: `${selectedIds.size} entries deleted successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete some entries",
        variant: "destructive",
      });
    },
  });

  // Bulk selection helpers
  const toggleRowSelection = (id: number) => {
    setSelectedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredData.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredData.map((item: any) => item.id)));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (window.confirm(`Are you sure you want to delete ${selectedIds.size} entries?`)) {
      bulkDeleteMutation.mutate(Array.from(selectedIds));
    }
  };

  // Bulk edit mutation
  const bulkEditMutation = useMutation({
    mutationFn: async ({ ids, field, value }: { ids: number[]; field: string; value: string }) => {
      await apiRequest("PATCH", "/api/competitor-pricing/bulk-update", { ids, field, value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/competitor-pricing"] });
      setSelectedIds(new Set());
      setShowBulkEditModal(false);
      setBulkEditField("");
      setBulkEditValue("");
      toast({
        title: "Success",
        description: `${selectedIds.size} entries updated successfully`,
      });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update entries",
        variant: "destructive",
      });
    },
  });

  const handleBulkEdit = () => {
    if (selectedIds.size === 0 || !bulkEditField) return;
    bulkEditMutation.mutate({
      ids: Array.from(selectedIds),
      field: bulkEditField,
      value: bulkEditValue
    });
  };

  // Editable fields for bulk edit
  const editableFields = [
    { key: 'type', label: 'Type' },
    { key: 'thickness', label: 'Thickness' },
    { key: 'productKind', label: 'Product Kind' },
    { key: 'surfaceFinish', label: 'Surface Finish' },
    { key: 'supplierInfo', label: 'Supplier' },
    { key: 'infoReceivedFrom', label: 'Info From' },
    { key: 'notes', label: 'Notes' },
    { key: 'source', label: 'Source' },
  ];

  // Get filter options using useMemo to prevent recalculation
  const { suppliers, thicknesses, productKinds, surfaceFinishes, sizes } = useMemo(() => {
    if (!competitorData || !Array.isArray(competitorData)) {
      return { suppliers: [], thicknesses: [], productKinds: [], surfaceFinishes: [], sizes: [] };
    }

    return {
      suppliers: [...new Set(competitorData.map(item => item.supplierInfo).filter(Boolean))].sort(),
      thicknesses: [...new Set(competitorData.map(item => item.thickness).filter(Boolean))].sort(),
      productKinds: [...new Set(competitorData.map(item => item.productKind).filter(Boolean))].sort(),
      surfaceFinishes: [...new Set(competitorData.map(item => item.surfaceFinish).filter(Boolean))].sort(),
      sizes: [...new Set(competitorData.map(item => item.dimensions).filter(Boolean))].sort(),
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
    
    if (sizeFilter && sizeFilter !== "all") {
      filtered = filtered.filter(item => item.dimensions === sizeFilter);
    }
    
    return filtered;
  }, [competitorData, supplierFilter, thicknessFilter, productKindFilter, surfaceFinishFilter, sizeFilter]);

  // Reset filters
  const resetFilters = () => {
    setSupplierFilter("all");
    setThicknessFilter("all");
    setProductKindFilter("all");
    setSurfaceFinishFilter("all");
    setSizeFilter("all");
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
          `$${calculatePricePerM2(item).toFixed(4)}`,
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
    <div className="glass-container p-6">
      <div className="max-w-7xl mx-auto relative z-10">
        {/* Header */}
        <div className="glass-card-solid p-6 mb-8 bg-gradient-to-r from-orange-50 to-amber-50 border border-orange-100">
          <div className="flex justify-between items-center">
            <div className="flex items-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-orange-400 to-orange-600 flex items-center justify-center shadow-lg mr-4">
                <TrendingUp className="h-7 w-7 text-white" />
              </div>
              <div>
                <h1 className="text-3xl font-bold text-gray-900">Market Prices</h1>
                <p className="text-gray-600">Track, analyze, and contribute competitor pricing information</p>
              </div>
            </div>
            <div className="flex gap-2">
              <Link href="/area-pricer">
                <Button className="glass-button bg-gradient-to-r from-purple-500 to-purple-600 text-white hover:from-purple-600 hover:to-purple-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Add New Entry
                </Button>
              </Link>
            </div>
          </div>
        </div>

        {/* Filters - Compact inline design */}
        <div className="glass-card-solid mb-6 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px] max-w-[200px]">
            <Label htmlFor="supplier" className="text-xs text-gray-500 mb-1 block">Supplier</Label>
            <Select value={supplierFilter} onValueChange={setSupplierFilter}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Suppliers</SelectItem>
                {suppliers.map(supplier => (
                  <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <Label htmlFor="thickness" className="text-xs text-gray-500 mb-1 block">Thickness</Label>
            <Select value={thicknessFilter} onValueChange={setThicknessFilter}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Thicknesses</SelectItem>
                {thicknesses.map(thickness => (
                  <SelectItem key={thickness} value={thickness}>{thickness}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[160px] max-w-[200px]">
            <Label htmlFor="productKind" className="text-xs text-gray-500 mb-1 block">Product Kind</Label>
            <Select value={productKindFilter} onValueChange={setProductKindFilter}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Product Kinds</SelectItem>
                {productKinds.map(kind => (
                  <SelectItem key={kind} value={kind}>{kind}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[160px] max-w-[200px]">
            <Label htmlFor="surfaceFinish" className="text-xs text-gray-500 mb-1 block">Surface Finish</Label>
            <Select value={surfaceFinishFilter} onValueChange={setSurfaceFinishFilter}>
              <SelectTrigger className="h-9 bg-white">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Surface Finishes</SelectItem>
                {surfaceFinishes.map(finish => (
                  <SelectItem key={finish} value={finish}>{finish}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div className="flex-1 min-w-[140px] max-w-[180px]">
            <Label htmlFor="size" className="text-xs text-gray-500 mb-1 block">Size</Label>
            <Select value={sizeFilter} onValueChange={setSizeFilter}>
              <SelectTrigger className="h-9 bg-white" data-testid="select-size-filter">
                <SelectValue placeholder="All" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Sizes</SelectItem>
                {sizes.map(size => (
                  <SelectItem key={size} value={size}>{size}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <Button 
            onClick={resetFilters} 
            variant="ghost"
            size="sm"
            className="h-9 px-3 text-gray-500 hover:text-gray-700"
          >
            <RotateCcw className="w-3.5 h-3.5 mr-1" />
            Reset
          </Button>
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-between items-center mb-6">
        <div className="flex gap-2">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={exportToCSV}
                  disabled={filteredData.length === 0}
                  className="bg-green-600 hover:bg-green-700"
                  size="icon"
                >
                  <Sheet className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Export CSV ({filteredData.length} entries)</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={findDuplicates}
                  disabled={filteredData.length === 0}
                  variant={showDuplicates ? "default" : "outline"}
                  className={showDuplicates ? "bg-orange-600 hover:bg-orange-700" : ""}
                  size="icon"
                >
                  <Search className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>{showDuplicates ? "Hide Duplicates" : "Find Duplicates"}</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {showDuplicates && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    onClick={() => {
                      setShowDuplicates(false);
                      setDuplicateGroups([]);
                    }}
                    variant="ghost"
                    className="text-gray-600"
                    size="icon"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>Clear Highlighting</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          {isAdmin && selectedIds.size > 0 && (
            <>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={() => setShowBulkEditModal(true)}
                      disabled={bulkEditMutation.isPending}
                      className="bg-blue-600 hover:bg-blue-700"
                      data-testid="button-bulk-edit"
                      size="icon"
                    >
                      <Edit className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{bulkEditMutation.isPending ? "Updating..." : `Edit Selected (${selectedIds.size})`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      onClick={handleBulkDelete}
                      disabled={bulkDeleteMutation.isPending}
                      className="bg-red-600 hover:bg-red-700"
                      data-testid="button-bulk-delete"
                      size="icon"
                    >
                      <Trash2 className="w-5 h-5" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{bulkDeleteMutation.isPending ? "Deleting..." : `Delete Selected (${selectedIds.size})`}</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" title="Columns">
                <Settings2 className="w-5 h-5" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-56" align="start">
              <div className="space-y-2">
                <h4 className="font-medium text-sm mb-3">Visible Columns</h4>
                {allColumns.map(col => (
                  <div key={col.key} className="flex items-center space-x-2">
                    <Checkbox 
                      id={`col-${col.key}`}
                      checked={visibleColumns.has(col.key)}
                      onCheckedChange={() => toggleColumn(col.key)}
                    />
                    <label htmlFor={`col-${col.key}`} className="text-sm cursor-pointer">
                      {col.label}
                    </label>
                  </div>
                ))}
              </div>
            </PopoverContent>
          </Popover>
        </div>
        
        <div className="flex gap-2 items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  onClick={downloadTemplate}
                  variant="outline"
                  size="icon"
                >
                  <Download className="w-5 h-5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>Download CSV Template</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
          {isAdmin && (
            <>
              <input
                type="file"
                accept=".csv"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                className="hidden"
                id="csv-upload"
              />
              <label htmlFor="csv-upload" title="Choose CSV File">
                <Button variant="outline" className="cursor-pointer" size="icon" asChild>
                  <span>
                    <Upload className="w-5 h-5" />
                  </span>
                </Button>
              </label>
              {uploadFile && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        onClick={handleFileUpload}
                        disabled={uploadMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-700"
                        size="icon"
                      >
                        <FileText className="w-5 h-5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>
                      <p>{uploadMutation.isPending ? "Uploading..." : `Upload ${uploadFile.name}`}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </>
          )}
        </div>
      </div>
      </div>

      {/* Data Table */}
      <div className="glass-card p-6">
        <div className="flex items-center justify-between mb-4">
          <span className="flex items-center text-lg font-semibold text-gray-900">
            <FileText className="w-5 h-5 mr-2" />
            Competitor Pricing Data ({filteredData.length} entries)
          </span>
        </div>
        <div>
          <div className="overflow-x-auto max-w-full">
            <Table className="min-w-full">
              <TableHeader>
                <TableRow>
                  {isAdmin && (
                    <TableHead className="w-10">
                      <Checkbox
                        checked={selectedIds.size === filteredData.length && filteredData.length > 0}
                        onCheckedChange={toggleSelectAll}
                        data-testid="checkbox-select-all"
                      />
                    </TableHead>
                  )}
                  {visibleColumns.has('source') && <TableHead className="whitespace-nowrap">Source</TableHead>}
                  {visibleColumns.has('type') && <TableHead className="whitespace-nowrap">Type</TableHead>}
                  {visibleColumns.has('dimensions') && <TableHead className="whitespace-nowrap">Dimensions</TableHead>}
                  {visibleColumns.has('packQty') && <TableHead className="whitespace-nowrap">Pack Qty</TableHead>}
                  {visibleColumns.has('pricePack') && <TableHead className="whitespace-nowrap">Price/Pack</TableHead>}
                  {visibleColumns.has('priceSheet') && <TableHead className="whitespace-nowrap">Price/Sheet</TableHead>}
                  {visibleColumns.has('thickness') && <TableHead className="whitespace-nowrap">Thickness</TableHead>}
                  {visibleColumns.has('productKind') && <TableHead className="whitespace-nowrap">Product Kind</TableHead>}
                  {visibleColumns.has('surfaceFinish') && <TableHead className="whitespace-nowrap">Surface Finish</TableHead>}
                  {visibleColumns.has('supplier') && <TableHead className="whitespace-nowrap">Supplier</TableHead>}
                  {visibleColumns.has('infoFrom') && <TableHead className="whitespace-nowrap">Info From</TableHead>}
                  {visibleColumns.has('priceM2') && <TableHead className="whitespace-nowrap">Price/m²</TableHead>}
                  {visibleColumns.has('notes') && <TableHead className="whitespace-nowrap">Notes</TableHead>}
                  {visibleColumns.has('date') && <TableHead className="whitespace-nowrap">Date</TableHead>}
                  {isAdmin && <TableHead className="w-20 sticky right-0 bg-white shadow-md whitespace-nowrap">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredData.map((item, index) => (
                  <TableRow key={item.id} className={getRowColor(index)}>
                    {isAdmin && (
                      <TableCell className="w-10">
                        <Checkbox
                          checked={selectedIds.has(item.id)}
                          onCheckedChange={() => toggleRowSelection(item.id)}
                          data-testid={`checkbox-row-${item.id}`}
                        />
                      </TableCell>
                    )}
                    {visibleColumns.has('source') && <TableCell className="whitespace-nowrap">{item.source}</TableCell>}
                    {visibleColumns.has('type') && <TableCell className="whitespace-nowrap">{item.type}</TableCell>}
                    {visibleColumns.has('dimensions') && <TableCell className="whitespace-nowrap">{item.dimensions}</TableCell>}
                    {visibleColumns.has('packQty') && <TableCell className="whitespace-nowrap">{item.packQty}</TableCell>}
                    {visibleColumns.has('pricePack') && <TableCell className="whitespace-nowrap">${parseFloat(item.inputPrice).toFixed(2)}</TableCell>}
                    {visibleColumns.has('priceSheet') && (
                      <TableCell className="whitespace-nowrap">
                        ${(item.pricePerSheet && parseFloat(item.pricePerSheet) > 0 
                          ? parseFloat(item.pricePerSheet) 
                          : (parseFloat(item.inputPrice) / (parseInt(item.packQty) || 1))
                        ).toFixed(2)}
                      </TableCell>
                    )}
                    {visibleColumns.has('thickness') && <TableCell className="whitespace-nowrap">{item.thickness}</TableCell>}
                    {visibleColumns.has('productKind') && <TableCell className="whitespace-nowrap">{item.productKind}</TableCell>}
                    {visibleColumns.has('surfaceFinish') && <TableCell className="whitespace-nowrap">{item.surfaceFinish}</TableCell>}
                    {visibleColumns.has('supplier') && <TableCell className="whitespace-nowrap">{item.supplierInfo}</TableCell>}
                    {visibleColumns.has('infoFrom') && <TableCell className="whitespace-nowrap">{item.infoReceivedFrom}</TableCell>}
                    {visibleColumns.has('priceM2') && <TableCell className="whitespace-nowrap">${calculatePricePerM2(item).toFixed(4)}</TableCell>}
                    {visibleColumns.has('notes') && (
                      <TableCell className="max-w-32">
                        <TooltipProvider>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <span className="block truncate cursor-pointer">{item.notes || '-'}</span>
                            </TooltipTrigger>
                            <TooltipContent side="top" className="max-w-xs bg-gray-900 text-white p-3 rounded-lg shadow-lg">
                              <p className="text-sm whitespace-pre-wrap">{item.notes || 'No notes'}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      </TableCell>
                    )}
                    {visibleColumns.has('date') && (
                      <TableCell className="whitespace-nowrap">
                        {new Date(item.timestamp || item.createdAt).toLocaleDateString()}
                      </TableCell>
                    )}
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
        </div>
      </div>

      {/* Bulk Edit Modal */}
      <Dialog open={showBulkEditModal} onOpenChange={setShowBulkEditModal}>
        <DialogContent className="glass-card-solid sm:max-w-md border-0">
          <DialogHeader>
            <DialogTitle className="text-gray-900">Bulk Edit {selectedIds.size} Entries</DialogTitle>
            <DialogDescription className="text-gray-600">
              Select a field and enter the new value. This will update all selected entries.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="bulk-edit-field">Field to Update</Label>
              <Select value={bulkEditField} onValueChange={setBulkEditField}>
                <SelectTrigger id="bulk-edit-field">
                  <SelectValue placeholder="Select field..." />
                </SelectTrigger>
                <SelectContent>
                  {editableFields.map(field => (
                    <SelectItem key={field.key} value={field.key}>
                      {field.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="bulk-edit-value">New Value</Label>
              <Input
                id="bulk-edit-value"
                value={bulkEditValue}
                onChange={(e) => setBulkEditValue(e.target.value)}
                placeholder="Enter new value..."
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setShowBulkEditModal(false);
                setBulkEditField("");
                setBulkEditValue("");
              }}
              className="glass-button-outline"
            >
              Cancel
            </Button>
            <Button
              onClick={handleBulkEdit}
              disabled={!bulkEditField || bulkEditMutation.isPending}
              className="glass-button bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700"
            >
              {bulkEditMutation.isPending ? "Updating..." : "Update All"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
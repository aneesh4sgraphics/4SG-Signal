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
import { ArrowLeft, DollarSign, Search, Edit, Save, X, Filter, ArrowUp, ArrowDown, Upload, Download, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useDebounce } from "@/hooks/useDebounce";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface PricingDataEntry {
  id: number;
  productId: string;
  productType: string;
  exportPrice: string | null;
  masterDistributorPrice: string | null;  
  dealerPrice: string | null;
  dealer2Price: string | null;
  approvalRetailPrice: string | null;
  stage25Price: string | null;
  stage2Price: string | null;
  stage15Price: string | null;
  stage1Price: string | null;
  retailPrice: string | null;
  createdAt: string;
  updatedAt: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  newRecords: number;
  updatedRecords: number;
  totalProcessed: number;
}

type SortField = 'productId' | 'productType' | 'exportPrice' | 'retailPrice';
type SortDirection = 'asc' | 'desc';

export default function PriceManagement() {
  const [searchTerm, setSearchTerm] = useState("");
  const debouncedSearchTerm = useDebounce(searchTerm, 300);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editField, setEditField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");
  const [isUploadOpen, setIsUploadOpen] = useState(false);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  
  // Sorting state
  const [sortField, setSortField] = useState<SortField>('productId');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  
  // Filtering state
  const [filters, setFilters] = useState({
    productType: '',
    priceRange: ''
  });
  
  const { toast } = useToast();

  // Fetch pricing data
  const { data: pricingData, isLoading, error } = useQuery<PricingDataEntry[]>({
    queryKey: ["/api/pricing-data"],
    queryFn: async () => {
      const response = await fetch('/api/pricing-data');
      if (!response.ok) {
        throw new Error('Failed to fetch pricing data');
      }
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // 2 minutes
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  // CSV Upload mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      
      const response = await fetch('/api/upload-pricing-csv', {
        method: 'POST',
        body: formData,
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || 'Upload failed');
      }
      
      return response.json() as Promise<UploadResult>;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-data"] });
      toast({
        title: "Upload Successful",
        description: `Processed ${result.totalProcessed} records: ${result.newRecords} new, ${result.updatedRecords} updated`,
      });
      setIsUploadOpen(false);
      setUploadFile(null);
    },
    onError: (error) => {
      toast({
        title: "Upload Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Edit price mutation
  const editPriceMutation = useMutation({
    mutationFn: async ({ id, field, value }: { id: number; field: string; value: string }) => {
      return await apiRequest(`/api/pricing-data/${id}`, "PATCH", { [field]: value });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-data"] });
      setEditingId(null);
      setEditField(null);
      toast({
        title: "Price Updated",
        description: "Price has been updated successfully",
      });
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Handle file upload
  const handleUpload = () => {
    if (!uploadFile) {
      toast({
        title: "No File Selected",
        description: "Please select a CSV file to upload",
        variant: "destructive",
      });
      return;
    }
    uploadMutation.mutate(uploadFile);
  };

  // Handle edit start
  const startEdit = (id: number, field: string, currentValue: string | null) => {
    setEditingId(id);
    setEditField(field);
    setEditValue(currentValue || '0.00');
  };

  // Handle edit save
  const saveEdit = () => {
    if (editingId && editField) {
      const numericValue = parseFloat(editValue);
      if (isNaN(numericValue) || numericValue < 0) {
        toast({
          title: "Invalid Price",
          description: "Please enter a valid price (number >= 0)",
          variant: "destructive",
        });
        return;
      }
      editPriceMutation.mutate({ 
        id: editingId, 
        field: editField, 
        value: numericValue.toFixed(2) 
      });
    }
  };

  // Handle edit cancel
  const cancelEdit = () => {
    setEditingId(null);
    setEditField(null);
    setEditValue("");
  };

  // Handle sort
  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  // Debug logging
  if (import.meta.env.DEV) {
    console.log('Price Management Debug:', {
      pricingData: pricingData?.length,
      isLoading,
      error: error?.message
    });
  }

  // Filter and sort data
  const filteredAndSortedData = (pricingData || [])
    .filter(item => {
      const matchesSearch = !debouncedSearchTerm || 
        item.productId.toLowerCase().includes(debouncedSearchTerm.toLowerCase()) ||
        item.productType.toLowerCase().includes(debouncedSearchTerm.toLowerCase());
      
      const matchesProductType = !filters.productType || 
        item.productType.toLowerCase().includes(filters.productType.toLowerCase());
      
      return matchesSearch && matchesProductType;
    })
    .sort((a, b) => {
      let aValue: string | number = '';
      let bValue: string | number = '';
      
      switch (sortField) {
        case 'productId':
          aValue = a.productId;
          bValue = b.productId;
          break;
        case 'productType':
          aValue = a.productType;
          bValue = b.productType;
          break;
        case 'exportPrice':
          aValue = parseFloat(a.exportPrice || '0');
          bValue = parseFloat(b.exportPrice || '0');
          break;
        case 'retailPrice':
          aValue = parseFloat(a.retailPrice || '0');
          bValue = parseFloat(b.retailPrice || '0');
          break;
      }
      
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' 
          ? aValue.localeCompare(bValue)
          : bValue.localeCompare(aValue);
      } else {
        return sortDirection === 'asc' 
          ? (aValue as number) - (bValue as number)
          : (bValue as number) - (aValue as number);
      }
    });

  // Price tiers for display
  const priceTiers = [
    { key: 'exportPrice', label: 'Export' },
    { key: 'masterDistributorPrice', label: 'Master Dist.' },
    { key: 'dealerPrice', label: 'Dealer' },
    { key: 'dealer2Price', label: 'Dealer 2' },
    { key: 'approvalRetailPrice', label: 'Approval' },
    { key: 'stage25Price', label: 'Stage 25' },
    { key: 'stage2Price', label: 'Stage 2' },
    { key: 'stage15Price', label: 'Stage 15' },
    { key: 'stage1Price', label: 'Stage 1' },
    { key: 'retailPrice', label: 'Retail' },
  ];

  // Format price for display
  const formatPrice = (price: string | null) => {
    if (!price || price === '0' || price === '0.00') return '-';
    const numPrice = parseFloat(price);
    return numPrice > 0 ? `$${numPrice.toFixed(2)}` : '-';
  };

  // Download CSV export
  const handleExportCSV = () => {
    if (!pricingData || pricingData.length === 0) {
      toast({
        title: "No Data",
        description: "No pricing data available to export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      'productId',
      'productType',
      'EXPORT_pricePerSqm',
      'MASTER_DISTRIBUTOR_pricePerSqm',
      'DEALER_pricePerSqm',
      'DEALER_2_pricePerSqm',
      'Approval_Retail__pricePerSqm',
      'Stage25_pricePerSqm',
      'Stage2_pricePerSqm',
      'Stage15_pricePerSqm',
      'Stage1_pricePerSqm',
      'Retail_pricePerSqm'
    ];

    const csvContent = [
      headers.join(','),
      ...filteredAndSortedData.map(item => [
        item.productId,
        item.productType,
        item.exportPrice || '',
        item.masterDistributorPrice || '',
        item.dealerPrice || '',
        item.dealer2Price || '',
        item.approvalRetailPrice || '',
        item.stage25Price || '',
        item.stage2Price || '', 
        item.stage15Price || '',
        item.stage1Price || '',
        item.retailPrice || ''
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pricing-data-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast({
      title: "Export Successful",
      description: `Downloaded ${filteredAndSortedData.length} pricing records`,
    });
  };

  if (error) {
    return (
      <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-background">
        <div className="max-w-7xl mx-auto">
          <Alert className="border-red-200 bg-red-50">
            <AlertCircle className="h-4 w-4 text-red-600" />
            <AlertDescription className="text-red-800">
              Failed to load pricing data. Please try again later.
            </AlertDescription>
          </Alert>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-secondary mb-2 flex items-center justify-center gap-2">
              <DollarSign className="h-8 w-8" />
              Price Management
            </h1>
            <p className="text-muted-foreground">
              Manage product pricing across all tiers
            </p>
          </div>
          <div className="w-32"></div>
        </div>

        {/* Upload Section */}
        <Card className="shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Upload className="h-5 w-5 text-primary" />
              Upload Pricing Data
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="text-sm text-muted-foreground mb-2">
                  Upload CSV file with pricing data. New records will be added, existing records will be updated.
                </div>
                <Alert className="mb-4">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>
                    Expected CSV format: productId, productType, EXPORT_pricePerSqm, MASTER_DISTRIBUTOR_pricePerSqm, etc.
                  </AlertDescription>
                </Alert>
              </div>
              <div className="flex gap-2">
                <Dialog open={isUploadOpen} onOpenChange={setIsUploadOpen}>
                  <DialogTrigger asChild>
                    <Button className="flex items-center gap-2">
                      <Upload className="h-4 w-4" />
                      Upload CSV
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Upload Pricing CSV</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="csv-file">Select CSV File</Label>
                        <Input
                          id="csv-file"
                          type="file"
                          accept=".csv"
                          onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                        />
                      </div>
                      {uploadFile && (
                        <div className="text-sm text-muted-foreground">
                          Selected: {uploadFile.name} ({(uploadFile.size / 1024).toFixed(1)}KB)
                        </div>
                      )}
                      <div className="flex gap-2">
                        <Button 
                          onClick={handleUpload} 
                          disabled={!uploadFile || uploadMutation.isPending}
                          className="flex-1"
                        >
                          {uploadMutation.isPending ? "Uploading..." : "Upload"}
                        </Button>
                        <Button 
                          variant="outline" 
                          onClick={() => setIsUploadOpen(false)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  </DialogContent>
                </Dialog>
                <Button variant="outline" onClick={handleExportCSV}>
                  <Download className="h-4 w-4 mr-2" />
                  Export CSV
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Search and Filters */}
        <Card className="shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Search className="h-5 w-5 text-primary" />
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label htmlFor="search">Search Products</Label>
                <Input
                  id="search"
                  placeholder="Search by product ID or type..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="product-type-filter">Product Type</Label>
                <Input
                  id="product-type-filter"
                  placeholder="Filter by product type..."
                  value={filters.productType}
                  onChange={(e) => setFilters({ ...filters, productType: e.target.value })}
                />
              </div>
              <div className="flex items-end">
                <Button 
                  variant="outline" 
                  onClick={() => {
                    setSearchTerm("");
                    setFilters({ productType: '', priceRange: '' });
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Pricing Data Table */}
        <Card className="shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-primary" />
                Pricing Data
              </div>
              <Badge variant="secondary">
                {filteredAndSortedData.length} items
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading pricing data...</p>
              </div>
            ) : (pricingData && pricingData.length === 0) ? (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">No pricing data found</p>
                <p className="text-sm text-muted-foreground">Upload a CSV file to get started</p>
              </div>
            ) : filteredAndSortedData.length === 0 ? (
              <div className="text-center py-12">
                <DollarSign className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-lg font-medium text-muted-foreground mb-2">No items match your filters</p>
                <p className="text-sm text-muted-foreground">Try adjusting your search criteria</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="sticky left-0 bg-background z-10 border-r">
                        <Button 
                          variant="ghost" 
                          onClick={() => handleSort('productId')}
                          className="flex items-center gap-1 h-auto p-0 font-medium"
                        >
                          Product ID
                          {sortField === 'productId' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </Button>
                      </TableHead>
                      <TableHead className="sticky left-32 bg-background z-10 border-r min-w-48">
                        <Button 
                          variant="ghost" 
                          onClick={() => handleSort('productType')}
                          className="flex items-center gap-1 h-auto p-0 font-medium"
                        >
                          Product Type
                          {sortField === 'productType' && (
                            sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                          )}
                        </Button>
                      </TableHead>
                      {priceTiers.map(tier => (
                        <TableHead key={tier.key} className="text-center min-w-24">
                          {tier.label}
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredAndSortedData.map((item) => (
                      <TableRow key={item.id}>
                        <TableCell className="sticky left-0 bg-background z-10 border-r font-medium">
                          {item.productId}
                        </TableCell>
                        <TableCell className="sticky left-32 bg-background z-10 border-r">
                          {item.productType}
                        </TableCell>
                        {priceTiers.map(tier => {
                          const value = item[tier.key as keyof PricingDataEntry] as string | null;
                          const isEditing = editingId === item.id && editField === tier.key;
                          
                          return (
                            <TableCell key={tier.key} className="text-center">
                              {isEditing ? (
                                <div className="flex items-center gap-1">
                                  <Input
                                    value={editValue}
                                    onChange={(e) => setEditValue(e.target.value)}
                                    className="w-20 h-8 text-center"
                                    type="number"
                                    step="0.01"
                                    min="0"
                                  />
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={saveEdit}
                                    disabled={editPriceMutation.isPending}
                                  >
                                    <Save className="h-3 w-3 text-green-600" />
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={cancelEdit}
                                  >
                                    <X className="h-3 w-3 text-red-600" />
                                  </Button>
                                </div>
                              ) : (
                                <div 
                                  className="cursor-pointer hover:bg-muted p-1 rounded flex items-center justify-center gap-1"
                                  onClick={() => startEdit(item.id, tier.key, value)}
                                >
                                  {formatPrice(value)}
                                  <Edit className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity" />
                                </div>
                              )}
                            </TableCell>
                          );
                        })}
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
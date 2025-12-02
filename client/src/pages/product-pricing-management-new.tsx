import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Database, Upload, Download, RefreshCw, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle, Trash2, History, RotateCcw, Clock, Package, Edit2, Save, X, Search } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";
import { apiRequest } from "@/lib/queryClient";

interface ProductPricingMaster {
  id: number;
  itemCode: string;
  productName: string;
  productType: string;
  size: string;
  totalSqm: number;
  minQuantity: number;
  exportPrice: number;
  masterDistributorPrice: number;
  dealerPrice: number;
  dealer2Price: number;
  approvalNeededPrice: number;
  tierStage25Price: number;
  tierStage2Price: number;
  tierStage15Price: number;
  tierStage1Price: number;
  retailPrice: number;
  uploadBatch: string;
  createdAt: string;
  updatedAt: string;
}

interface UploadResult {
  success: boolean;
  message: string;
  recordsProcessed: number;
  totalRecords: number;
  addedRecordsCount: number;
  updatedRecordsCount: number;
  removedRecordsCount: number;
  clearDatabase: boolean;
  batchId: string;
  uploadBatch: string;
  changeLog: {
    added: number;
    updated: number;
    deleted: number;
  };
  timestamp: string;
}

interface UploadBatch {
  id: number;
  batchId: string;
  filename: string;
  uploadDate: string;
  recordsProcessed: number;
  recordsAdded: number;
  recordsUpdated: number;
  recordsDeleted: number;
  clearDatabase: boolean;
  changeLog: {
    added: Array<{ itemCode: string; productName: string; productType: string }>;
    updated: Array<{ itemCode: string; productName: string; changes: Record<string, { old: any; new: any }> }>;
    deleted: Array<{ itemCode: string; productName: string; productType: string }>;
  };
  isActive: boolean;
  createdAt: string;
}

// Pricing tier labels for display
const TIER_LABELS: Record<string, string> = {
  exportPrice: 'Export Only',
  masterDistributorPrice: 'Distributor',
  dealerPrice: 'Dealer-VIP',
  dealer2Price: 'Dealer',
  approvalNeededPrice: 'Shopify Lowest',
  tierStage25Price: 'Shopify3',
  tierStage2Price: 'Shopify2',
  tierStage15Price: 'Shopify1',
  tierStage1Price: 'Shopify-Account',
  retailPrice: 'Retail',
};

// Compact Product Pricing Card Component
function ProductPricingCard({
  item,
  isEditing,
  editValues,
  onEdit,
  onSave,
  onCancel,
  onValueChange,
  isSaving
}: {
  item: ProductPricingMaster;
  isEditing: boolean;
  editValues: Record<string, string>;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onValueChange: (field: string, value: string) => void;
  isSaving: boolean;
}) {
  const priceFields = [
    { key: 'exportPrice', value: item.exportPrice },
    { key: 'masterDistributorPrice', value: item.masterDistributorPrice },
    { key: 'dealerPrice', value: item.dealerPrice },
    { key: 'dealer2Price', value: item.dealer2Price },
    { key: 'approvalNeededPrice', value: item.approvalNeededPrice },
    { key: 'tierStage25Price', value: item.tierStage25Price },
    { key: 'tierStage2Price', value: item.tierStage2Price },
    { key: 'tierStage15Price', value: item.tierStage15Price },
    { key: 'tierStage1Price', value: item.tierStage1Price },
    { key: 'retailPrice', value: item.retailPrice },
  ];

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-3 hover:shadow-md transition-shadow" data-testid={`card-product-${item.id}`}>
      {/* Header */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-purple-600 bg-purple-50 px-1.5 py-0.5 rounded">{item.itemCode}</span>
            <Badge variant="outline" className="text-[10px] px-1 py-0">{item.size}</Badge>
          </div>
          <h3 className="text-sm font-medium text-gray-800 truncate mt-1" title={item.productName}>
            {item.productName}
          </h3>
          <p className="text-[10px] text-gray-500">{item.productType}</p>
        </div>
        {!isEditing ? (
          <button
            onClick={onEdit}
            className="p-1 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded transition-colors"
            title="Edit pricing"
            data-testid={`button-edit-${item.id}`}
          >
            <Edit2 className="h-3.5 w-3.5" />
          </button>
        ) : (
          <div className="flex gap-1">
            <button
              onClick={onSave}
              disabled={isSaving}
              className="p-1 text-green-600 hover:bg-green-50 rounded transition-colors disabled:opacity-50"
              title="Save changes"
              data-testid={`button-save-${item.id}`}
            >
              <Save className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onCancel}
              disabled={isSaving}
              className="p-1 text-red-500 hover:bg-red-50 rounded transition-colors disabled:opacity-50"
              title="Cancel"
              data-testid={`button-cancel-${item.id}`}
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Price Grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 pt-2 border-t border-gray-100">
        {priceFields.map(({ key, value }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-[10px] text-gray-500 truncate">{TIER_LABELS[key]}</span>
            {isEditing ? (
              <input
                type="number"
                step="0.01"
                min="0"
                value={editValues[key] || ''}
                onChange={(e) => onValueChange(key, e.target.value)}
                className="w-16 text-right text-xs px-1 py-0.5 border border-gray-300 rounded focus:border-purple-500 focus:ring-1 focus:ring-purple-200"
                data-testid={`input-${key}-${item.id}`}
              />
            ) : (
              <span className="text-xs font-medium text-gray-700">${Number(value).toFixed(2)}</span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function ProductPricingManagementNew() {
  const [isUploading, setIsUploading] = useState(false);
  const [clearDatabase, setClearDatabase] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<UploadBatch | null>(null);
  const [showBatchDetails, setShowBatchDetails] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  // Fetch current product pricing data from database
  const { data: pricingData = [], isLoading, error } = useQuery<ProductPricingMaster[]>({
    queryKey: ['/api/product-pricing-database', (user as any)?.id],
    queryFn: async () => {
      const response = await fetch('/api/product-pricing-database');
      if (!response.ok) {
        throw new Error('Failed to fetch pricing data');
      }
      const result = await response.json();
      return result.data || []; // Extract data from response wrapper
    },
  });

  // Fetch upload batch history
  const { data: batchHistory = [], isLoading: batchHistoryLoading } = useQuery<{ batches: UploadBatch[] }>({
    queryKey: ['/api/upload-batches', (user as any)?.id],
    queryFn: async () => {
      const response = await fetch('/api/upload-batches');
      if (!response.ok) {
        throw new Error('Failed to fetch batch history');
      }
      return response.json();
    },
    enabled: showBatchHistory,
  });

  // Rollback mutation
  const rollbackMutation = useMutation({
    mutationFn: async (batchId: string) => {
      const response = await fetch(`/api/rollback-batch/${batchId}`, {
        method: 'POST',
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to rollback');
      }
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Rollback Successful",
        description: data.message,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database', (user as any)?.id] });
      setShowBatchHistory(false);
    },
    onError: (error) => {
      toast({
        title: "Rollback Failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  // Update pricing mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, updates }: { id: number; updates: Record<string, string> }) => {
      return await apiRequest('PATCH', `/api/product-pricing/${id}`, updates);
    },
    onSuccess: () => {
      toast({
        title: "Price Updated",
        description: "Product pricing has been saved successfully.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database', (user as any)?.id] });
      setEditingId(null);
      setEditValues({});
    },
    onError: (error: any) => {
      toast({
        title: "Update Failed",
        description: error.message || "Failed to update pricing",
        variant: "destructive",
      });
    },
  });

  // Filter products by search term
  const filteredPricingData = pricingData.filter(item => 
    searchTerm === "" ||
    item.itemCode.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.productName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.productType.toLowerCase().includes(searchTerm.toLowerCase()) ||
    item.size.toLowerCase().includes(searchTerm.toLowerCase())
  );

  // Editing functions
  const startEditing = (item: ProductPricingMaster) => {
    setEditingId(item.id);
    setEditValues({
      exportPrice: item.exportPrice.toString(),
      masterDistributorPrice: item.masterDistributorPrice.toString(),
      dealerPrice: item.dealerPrice.toString(),
      dealer2Price: item.dealer2Price.toString(),
      approvalNeededPrice: item.approvalNeededPrice.toString(),
      tierStage25Price: item.tierStage25Price.toString(),
      tierStage2Price: item.tierStage2Price.toString(),
      tierStage15Price: item.tierStage15Price.toString(),
      tierStage1Price: item.tierStage1Price.toString(),
      retailPrice: item.retailPrice.toString(),
    });
  };

  const cancelEditing = () => {
    setEditingId(null);
    setEditValues({});
  };

  const saveChanges = (id: number) => {
    // Find the original item to compare changes
    const originalItem = pricingData.find(p => p.id === id);
    if (!originalItem) return;
    
    // Validate all price fields and only include changed ones
    const invalidFields: string[] = [];
    const changedUpdates: Record<string, string> = {};
    
    const priceFields = [
      'exportPrice', 'masterDistributorPrice', 'dealerPrice', 'dealer2Price',
      'approvalNeededPrice', 'tierStage25Price', 'tierStage2Price',
      'tierStage15Price', 'tierStage1Price', 'retailPrice'
    ];
    
    for (const key of priceFields) {
      const newValue = editValues[key];
      const originalValue = (originalItem as any)[key];
      
      // Skip if value is empty string
      if (newValue === '' || newValue === undefined) {
        invalidFields.push(TIER_LABELS[key] || key);
        continue;
      }
      
      const numValue = parseFloat(newValue);
      if (isNaN(numValue) || numValue < 0) {
        invalidFields.push(TIER_LABELS[key] || key);
      } else {
        // Only include if value has actually changed
        const originalNum = parseFloat(String(originalValue || 0));
        if (Math.abs(numValue - originalNum) > 0.001) {
          changedUpdates[key] = numValue.toFixed(2);
        }
      }
    }
    
    if (invalidFields.length > 0) {
      toast({
        title: "Invalid Prices",
        description: `Please enter valid prices for: ${invalidFields.join(', ')}`,
        variant: "destructive",
      });
      return;
    }
    
    if (Object.keys(changedUpdates).length === 0) {
      toast({
        title: "No Changes",
        description: "No prices were modified.",
      });
      cancelEditing();
      return;
    }
    
    updateMutation.mutate({ id, updates: changedUpdates });
  };

  const stats = {
    totalProducts: pricingData.length,
    uniqueCategories: Array.from(new Set(pricingData.map(item => item.productName))).length,
    uniqueTypes: Array.from(new Set(pricingData.map(item => item.productType))).length,
    lastUpdated: pricingData.length > 0 
      ? new Date(Math.max(...pricingData.map(item => new Date(item.updatedAt).getTime()))).toLocaleString()
      : 'No data available'
  };

  const handleFileSelection = (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file (.csv)",
        variant: "destructive",
      });
      return;
    }

    setPendingFile(file);
    setShowConfirmDialog(true);
  };

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('clearDatabase', clearDatabase.toString());

      const response = await fetch('/api/upload-pricing-database', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json();
        // Create a comprehensive error message
        let errorMessage = errorData.error || 'Upload failed';
        if (errorData.details && errorData.details !== errorMessage) {
          errorMessage += `: ${errorData.details}`;
        }
        if (errorData.suggestion) {
          errorMessage += `\n\nSuggestion: ${errorData.suggestion}`;
        }
        throw new Error(errorMessage);
      }

      return response.json();
    },
    onSuccess: (data: UploadResult) => {
      setUploadResult(data);
      setIsUploading(false);
      setShowConfirmDialog(false);
      setPendingFile(null);
      
      // Invalidate and refetch pricing data
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database', (user as any)?.id] });
      
      toast({
        title: "Upload Successful",
        description: data.message,
        variant: "default",
      });
    },
    onError: (error: Error) => {
      setIsUploading(false);
      setUploadResult({
        success: false,
        message: error.message,
        recordsProcessed: 0,
        totalRecords: 0,
        addedRecordsCount: 0,
        updatedRecordsCount: 0,
        removedRecordsCount: 0,
        clearDatabase: false,
        batchId: '',
        uploadBatch: '',
        changeLog: {
          added: 0,
          updated: 0,
          deleted: 0
        },
        timestamp: new Date().toISOString()
      });
      
      // Split error message to show title and description separately
      const errorLines = error.message.split('\n\n');
      const title = errorLines[0] || "Upload Failed";
      const description = errorLines.slice(1).join('\n') || undefined;
      
      toast({
        title: title,
        description: description,
        variant: "destructive",
      });
    }
  });

  const handleUploadConfirm = () => {
    if (!pendingFile) return;
    
    setIsUploading(true);
    uploadMutation.mutate(pendingFile);
  };

  const downloadTemplate = () => {
    window.open('/api/download-pricing-database', '_blank');
  };

  return (
    <div className="max-w-screen-lg mx-auto px-6 py-6">
      <div className="flex items-center justify-between mb-6 relative">
        <FloatingElements />
        <div>
          <h1 className="text-xl font-medium text-gray-800 mb-2">
            ProductPricing Management
          </h1>
          <p className="text-sm text-gray-500">Database-backed pricing data management with synchronization</p>
        </div>
        <IconBadge icon={Database} label="Database Mode" className="bg-green-100 text-green-800 border-green-200" />
      </div>
      <HeaderDivider />

      {/* Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <SimpleCardFrame className="p-4">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="h-4 w-4 text-blue-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Total Products</p>
              <p className="text-lg font-medium text-blue-600">{stats.totalProducts}</p>
            </div>
          </div>
        </SimpleCardFrame>

        <SimpleCardFrame className="p-4">
          <div className="flex items-center space-x-2">
            <Database className="h-4 w-4 text-green-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Categories</p>
              <p className="text-lg font-medium text-green-600">{stats.uniqueCategories}</p>
            </div>
          </div>
        </SimpleCardFrame>

        <SimpleCardFrame className="p-4">
          <div className="flex items-center space-x-2">
            <RefreshCw className="h-4 w-4 text-purple-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Product Types</p>
              <p className="text-lg font-medium text-purple-600">{stats.uniqueTypes}</p>
            </div>
          </div>
        </SimpleCardFrame>

        <SimpleCardFrame className="p-4">
          <div className="flex items-center space-x-2">
            <CheckCircle className="h-4 w-4 text-orange-500" />
            <div>
              <p className="text-sm font-medium text-gray-800">Last Updated</p>
              <p className="text-xs font-medium text-orange-600">{stats.lastUpdated}</p>
            </div>
          </div>
        </SimpleCardFrame>
      </div>

      {/* Upload Section */}
      <SimpleCardFrame className="p-6 mb-6">
        <h2 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
          <IconBadge icon={Upload} label="Upload Pricing Data" className="px-0 py-0 bg-transparent border-none text-lg font-medium text-gray-800" />
        </h2>
        <p className="text-sm text-gray-500 mb-6">
          Upload CSV file to update product pricing database with smart synchronization
        </p>
        <SectionDivider />
        <div className="space-y-4">
          {/* Clear Database Toggle */}
          <div className="flex items-center space-x-2 p-4 border rounded-lg bg-amber-50 border-amber-200">
            <Trash2 className="h-4 w-4 text-amber-600" />
            <div className="flex-1">
              <label htmlFor="clear-database" className="text-sm font-medium text-amber-800">
                Clear and Replace Database
              </label>
              <p className="text-xs text-amber-600 mt-1">
                When enabled, completely replaces all existing data. When disabled, performs smart synchronization.
              </p>
            </div>
            <Switch
              id="clear-database"
              checked={clearDatabase}
              onCheckedChange={setClearDatabase}
            />
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isUploading}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Upload className="h-4 w-4" />
              {isUploading ? 'Uploading...' : 'Upload CSV File'}
            </button>
            
            <button
              onClick={downloadTemplate}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-md border border-green-300 bg-white text-sm font-medium text-green-700 hover:bg-green-50 transition-colors"
            >
              <Download className="h-4 w-4" />
              Download Current Data
            </button>
          </div>

          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) {
                handleFileSelection(file);
              }
            }}
            className="hidden"
          />

          {/* Upload Progress */}
          {isUploading && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Processing CSV data...</span>
                <span>Please wait</span>
              </div>
              <Progress value={75} className="h-2" />
            </div>
          )}

          {/* Upload Results */}
          {uploadResult && (
            <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
              <div className="flex items-start space-x-2">
                {uploadResult.success ? (
                  <CheckCircle className="h-5 w-5 text-green-600 mt-0.5" />
                ) : (
                  <AlertCircle className="h-5 w-5 text-red-600 mt-0.5" />
                )}
                <div className="flex-1">
                  <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                    <div className="font-medium mb-2">
                      {uploadResult.message.split(':')[0]}
                    </div>
                    {!uploadResult.success && uploadResult.message.includes(':') && (
                      <div className="text-sm space-y-2 mt-2">
                        <div className="font-normal">
                          {uploadResult.message.split(':').slice(1).join(':').split('\n\n')[0]}
                        </div>
                        {uploadResult.message.includes('Suggestion:') && (
                          <div className="mt-3 p-2 bg-amber-100 border border-amber-200 rounded text-amber-800 text-xs">
                            {uploadResult.message.split('Suggestion:')[1].trim()}
                          </div>
                        )}
                      </div>
                    )}
                    {uploadResult.success && (
                      <div className="text-sm space-y-1">
                        <div>Records processed: {uploadResult.recordsProcessed}</div>
                        <div>Total records in database: {uploadResult.totalRecords}</div>
                        {!uploadResult.clearDatabase && (
                          <div className="mt-2 text-xs">
                            <div>Added: {uploadResult.addedRecordsCount}</div>
                            <div>Updated: {uploadResult.updatedRecordsCount}</div>
                            <div>Removed: {uploadResult.removedRecordsCount}</div>
                          </div>
                        )}
                      </div>
                    )}
                  </AlertDescription>
                </div>
              </div>
            </Alert>
          )}
        </div>
      </SimpleCardFrame>

      {/* Data Preview - Compact Cards */}
      {pricingData.length > 0 && (
        <SimpleCardFrame className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div>
              <h2 className="text-base font-medium text-gray-800 flex items-center gap-2">
                <IconBadge icon={Database} label="Product Pricing" className="px-0 py-0 bg-transparent border-none text-base font-medium text-gray-800" />
              </h2>
              <p className="text-xs text-gray-500">{pricingData.length} products in database</p>
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-3 w-3 text-gray-400" />
                <Input
                  type="text"
                  placeholder="Search products..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-7 h-8 text-xs w-48"
                  data-testid="input-search-products"
                />
              </div>
            </div>
          </div>
          <SectionDivider />
          
          {/* Compact Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 mt-3 max-h-[600px] overflow-y-auto">
            {filteredPricingData.map((item) => (
              <ProductPricingCard
                key={item.id}
                item={item}
                isEditing={editingId === item.id}
                editValues={editValues}
                onEdit={() => startEditing(item)}
                onSave={() => saveChanges(item.id)}
                onCancel={cancelEditing}
                onValueChange={(field, value) => setEditValues(prev => ({ ...prev, [field]: value }))}
                isSaving={updateMutation.isPending}
              />
            ))}
          </div>
          
          {filteredPricingData.length === 0 && searchTerm && (
            <div className="text-center py-8 text-gray-500">
              <Search className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No products found matching "{searchTerm}"</p>
            </div>
          )}
        </SimpleCardFrame>
      )}

      {/* Confirmation Dialog */}
      <Dialog open={showConfirmDialog} onOpenChange={setShowConfirmDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              Confirm Database Operation
            </DialogTitle>
            <DialogDescription className="space-y-3">
              <div>
                <strong>File:</strong> {pendingFile?.name}
              </div>
              <div>
                <strong>Operation:</strong> {clearDatabase ? "Complete Database Replacement" : "Smart Synchronization"}
              </div>
              {clearDatabase ? (
                <div className="bg-red-50 border border-red-200 rounded p-3">
                  <p className="text-red-800 text-sm">
                    <strong>Warning:</strong> This will completely replace all existing product and pricing data. 
                    All current records will be deleted and replaced with data from the uploaded CSV file.
                  </p>
                </div>
              ) : (
                <div className="bg-blue-50 border border-blue-200 rounded p-3">
                  <p className="text-blue-800 text-sm">
                    This will synchronize the database with the uploaded CSV file:
                    • Add new products from CSV
                    • Update existing products when data differs
                    • Remove products no longer in CSV
                  </p>
                </div>
              )}
              <p className="text-sm text-gray-600">Do you want to continue?</p>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowConfirmDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUploadConfirm} disabled={isUploading}>
              {clearDatabase ? "Replace Database" : "Sync Database"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {isLoading && (
        <Card>
          <CardContent className="p-6 text-center">
            <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-4 text-blue-600" />
            <p>Loading pricing data from database...</p>
          </CardContent>
        </Card>
      )}

      {error && (
        <Alert className="border-red-200 bg-red-50">
          <AlertCircle className="h-4 w-4 text-red-600" />
          <AlertDescription className="text-red-800">
            Failed to load pricing data: {error instanceof Error ? error.message : 'Unknown error'}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
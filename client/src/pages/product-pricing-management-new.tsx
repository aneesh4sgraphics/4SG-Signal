import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Database, Upload, Download, RefreshCw, FileSpreadsheet, CheckCircle, AlertCircle, AlertTriangle, Trash2, History, RotateCcw, Clock, Package } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { HeaderDivider, SimpleCardFrame, FloatingElements, IconBadge, SectionDivider } from "@/components/NotionLineArt";

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

export default function ProductPricingManagementNew() {
  const [isUploading, setIsUploading] = useState(false);
  const [clearDatabase, setClearDatabase] = useState(false);
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [uploadResult, setUploadResult] = useState<UploadResult | null>(null);
  const [showBatchHistory, setShowBatchHistory] = useState(false);
  const [selectedBatch, setSelectedBatch] = useState<UploadBatch | null>(null);
  const [showBatchDetails, setShowBatchDetails] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current product pricing data from database
  const { data: pricingData = [], isLoading, error } = useQuery<ProductPricingMaster[]>({
    queryKey: ['/api/product-pricing-database'],
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
    queryKey: ['/api/upload-batches'],
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
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
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
        throw new Error(errorData.error || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (data: UploadResult) => {
      setUploadResult(data);
      setIsUploading(false);
      setShowConfirmDialog(false);
      setPendingFile(null);
      
      // Invalidate and refetch pricing data
      queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
      
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
      
      toast({
        title: "Upload Failed",
        description: error.message,
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
                    <div className="font-medium mb-2">{uploadResult.message}</div>
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

      {/* Data Preview */}
      {pricingData.length > 0 && (
        <SimpleCardFrame className="p-6">
          <h2 className="text-lg font-medium text-gray-800 mb-2 flex items-center gap-2">
            <IconBadge icon={Database} label="Data Preview" className="px-0 py-0 bg-transparent border-none text-lg font-medium text-gray-800" />
          </h2>
          <p className="text-sm text-gray-500 mb-6">Current pricing data in database (showing first 5 records)</p>
          <SectionDivider />
          <div>
            <div className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 border-b border-gray-200 grid grid-cols-6 gap-2 p-3">
                <div className="text-sm font-medium text-gray-800">Item Code</div>
                <div className="text-sm font-medium text-gray-800">Product Name</div>
                <div className="text-sm font-medium text-gray-800">Size</div>
                <div className="text-sm font-medium text-gray-800">Export</div>
                <div className="text-sm font-medium text-gray-800">Dealer</div>
                <div className="text-sm font-medium text-gray-800">Retail</div>
              </div>
              <div>
                {pricingData.slice(0, 5).map((item, index) => (
                  <div key={item.id} className="grid grid-cols-6 gap-2 items-center p-3 border-b border-gray-100 hover:bg-gray-50">
                    <div className="font-mono text-sm text-gray-600">{item.itemCode}</div>
                    <div className="text-sm text-gray-800">{item.productName}</div>
                    <div className="text-sm text-gray-600">{item.size}</div>
                    <div className="text-sm text-gray-600">${item.exportPrice}</div>
                    <div className="text-sm text-gray-600">${item.dealerPrice}</div>
                    <div className="text-sm text-gray-600">${item.retailPrice}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
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
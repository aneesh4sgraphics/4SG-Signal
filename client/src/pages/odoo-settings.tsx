import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { 
  Link2, 
  CheckCircle, 
  XCircle,
  RefreshCw,
  Users,
  Package,
  FileText,
  Download,
  Search,
  Building2,
  Eye,
  ArrowRightLeft,
  Plus,
  Trash2,
  Clock,
  Check,
  X,
  AlertCircle,
  Upload
} from "lucide-react";
import { 
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";
import type { ProductOdooMapping, OdooPriceSyncQueue } from "@shared/schema";

export default function OdooSettingsPage() {
  const { toast } = useToast();
  const [partnerSearchTerm, setPartnerSearchTerm] = useState("");

  const { data: connectionTest, refetch: testConnection, isFetching: testingConnection } = useQuery<{
    success: boolean;
    message: string;
    uid?: number;
  }>({
    queryKey: ['/api/odoo/test-connection'],
    enabled: false,
    retry: false,
  });

  const { data: odooStatus } = useQuery<{
    connected: boolean;
    error: string | null;
  }>({
    queryKey: ['/api/odoo/status'],
  });

  const { data: odooPartners = [], isLoading: partnersLoading, refetch: refetchPartners } = useQuery<any[]>({
    queryKey: ['/api/odoo/partners'],
    enabled: !!connectionTest?.success,
  });

  const { data: odooProducts = [], isLoading: productsLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/products'],
    enabled: !!connectionTest?.success,
  });

  const { data: odooPricelists = [] } = useQuery<any[]>({
    queryKey: ['/api/odoo/pricelists'],
    enabled: !!connectionTest?.success,
  });

  const { data: odooOrders = [], isLoading: ordersLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/orders'],
    enabled: !!connectionTest?.success,
  });

  const { data: odooUsers = [] } = useQuery<any[]>({
    queryKey: ['/api/odoo/users'],
    enabled: !!connectionTest?.success,
  });

  const importFromOdooMutation = useMutation({
    mutationFn: async (deleteExisting: boolean) => {
      const res = await apiRequest('POST', '/api/odoo/import/partners', { deleteExisting });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/partners'] });
      setImportResult({
        imported: data.imported,
        skipped: data.skipped,
        failed: data.failed,
        errors: data.errors || [],
        skippedPartners: data.skippedPartners || []
      });
      toast({ 
        title: "Import complete",
        description: `Imported: ${data.imported}, Skipped: ${data.skipped}, Failed: ${data.failed}`
      });
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    failed: number;
    errors: string[];
    skippedPartners?: string[];
  } | null>(null);

  // Product Mapping state
  const [mappingSearchTerm, setMappingSearchTerm] = useState("");
  const [mappingFilter, setMappingFilter] = useState<"all" | "mapped" | "unmapped">("all");
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  const [selectedOdooProduct, setSelectedOdooProduct] = useState<string>("");
  const [odooProductSearch, setOdooProductSearch] = useState("");
  const [autoMapResult, setAutoMapResult] = useState<{
    success: boolean;
    totalProducts: number;
    totalOdooProducts: number;
    matched: number;
    created: number;
    skipped: number;
    noMatchCount: number;
    conflictCount: number;
    noMatch: string[];
    conflicts: string[];
  } | null>(null);

  // Preview modal state
  const [showPreviewModal, setShowPreviewModal] = useState(false);
  const [previewData, setPreviewData] = useState<{
    totalProducts: number;
    totalOdooProducts: number;
    alreadyMapped: number;
    proposedMappings: any[];
  } | null>(null);
  const [proposedMappings, setProposedMappings] = useState<any[]>([]);
  const [previewSearchTerm, setPreviewSearchTerm] = useState("");
  const [editingMapping, setEditingMapping] = useState<any>(null);
  const [editOdooSearch, setEditOdooSearch] = useState("");

  // Import Products state
  const [importProductSearch, setImportProductSearch] = useState("");
  const [selectedImportProducts, setSelectedImportProducts] = useState<Set<number>>(new Set());
  
  // Guided Product Creation Wizard state
  const [wizardOpen, setWizardOpen] = useState(false);
  const [wizardProduct, setWizardProduct] = useState<any>(null);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardData, setWizardData] = useState({
    rollSheet: '' as '' | 'roll' | 'sheet',
    unitOfMeasure: '' as '' | 'sheets' | 'rolls' | 'packets' | 'cartons',
    size: '',
    totalSqm: '',
    productCategory: '',
    productType: '',
    minQuantity: '1',
    dealerPrice: '',
    retailPrice: '',
  });
  
  // Fetch product categories and types for wizard dropdown
  const { data: productCategories = [] } = useQuery<{id: number; name: string}[]>({
    queryKey: ['/api/product-categories'],
  });
  
  const { data: productTypes = [] } = useQuery<{id: number; name: string; categoryId: number}[]>({
    queryKey: ['/api/product-types'],
  });
  
  // Helper to extract size from product name/code
  const extractSizeFromProduct = (product: any): string => {
    const code = product.default_code || '';
    const name = product.name || '';
    const combined = `${code} ${name}`.toLowerCase();
    
    // Common size patterns: 13x19, 12x18, A4, A3, etc
    const sizeMatch = combined.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (sizeMatch) {
      return `${sizeMatch[1]} x ${sizeMatch[2]}`;
    }
    
    // A-series paper sizes
    const aMatch = combined.match(/\ba(\d)\b/i);
    if (aMatch) {
      return `A${aMatch[1]}`;
    }
    
    return 'Standard';
  };
  
  // Helper to calculate sqm from size string
  const calculateSqmFromSize = (sizeStr: string): string => {
    const match = sizeStr.match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
    if (match) {
      const w = parseFloat(match[1]);
      const h = parseFloat(match[2]);
      // Assume inches, convert to meters (1 inch = 0.0254m)
      const sqm = (w * 0.0254) * (h * 0.0254);
      return sqm.toFixed(6);
    }
    return '0';
  };
  
  // Open wizard for a product
  const openWizard = (product: any) => {
    const extractedSize = extractSizeFromProduct(product);
    setWizardProduct(product);
    setWizardStep(1);
    setWizardData({
      rollSheet: '',
      unitOfMeasure: '',
      size: extractedSize,
      totalSqm: calculateSqmFromSize(extractedSize),
      productCategory: '',
      productType: '',
      minQuantity: '1',
      dealerPrice: product.list_price?.toFixed(2) || '',
      retailPrice: '',
    });
    setWizardOpen(true);
  };
  
  // Complete wizard and import product
  const completeWizard = () => {
    if (!wizardProduct) return;
    
    const enrichedProduct = {
      ...wizardProduct,
      rollSheet: wizardData.rollSheet || null,
      unitOfMeasure: wizardData.unitOfMeasure || null,
      size: wizardData.size || 'Standard',
      totalSqm: wizardData.totalSqm || '0',
      productType: wizardData.productType || wizardProduct.categ_name || 'Imported from Odoo',
      catalogCategoryId: wizardData.productCategory ? parseInt(wizardData.productCategory) : null,
      minQuantity: parseInt(wizardData.minQuantity) || 1,
      dealerPrice: wizardData.dealerPrice ? parseFloat(wizardData.dealerPrice) : null,
      retailPrice: wizardData.retailPrice ? parseFloat(wizardData.retailPrice) : null,
    };
    
    importProductsMutation.mutate([enrichedProduct]);
    setWizardOpen(false);
    setWizardProduct(null);
  };

  // Query for missing Odoo products (not in local app)
  // Note: Search filtering is done client-side to avoid losing data when typing
  const { data: missingProductsData, isLoading: missingProductsLoading, refetch: refetchMissingProducts } = useQuery<{
    success: boolean;
    totalOdooProducts: number;
    totalLocalProducts: number;
    missingCount: number;
    missingProducts: any[];
  }>({
    queryKey: ['/api/odoo/missing-products'],
    queryFn: async () => {
      const res = await fetch('/api/odoo/missing-products');
      return res.json();
    },
    enabled: false, // Only fetch when button is clicked
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Import products mutation
  const importProductsMutation = useMutation({
    mutationFn: async (products: any[]) => {
      const res = await apiRequest('POST', '/api/odoo/import-products', { products });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/products-for-mapping'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/missing-products'] });
      setSelectedImportProducts(new Set());
      toast({ 
        title: "Products imported",
        description: `${data.imported} products added successfully`
      });
      refetchMissingProducts();
    },
    onError: (error: any) => {
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  // Query for QuickQuotes products with mapping status
  const { data: productsForMapping = [], isLoading: mappingProductsLoading, refetch: refetchMappingProducts } = useQuery<any[]>({
    queryKey: ['/api/odoo/products-for-mapping', mappingFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (mappingFilter === 'mapped') params.set('mappedOnly', 'true');
      if (mappingFilter === 'unmapped') params.set('unmappedOnly', 'true');
      const res = await fetch(`/api/odoo/products-for-mapping?${params.toString()}`);
      return res.json();
    },
  });

  // Query for all Odoo products (for mapping selection) - load once, filter client-side
  const { data: allOdooProductsRaw = [], isLoading: allOdooProductsLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/all-products'],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('limit', '1000'); // Load all products for instant client-side filtering
      const res = await fetch(`/api/odoo/all-products?${params.toString()}`);
      return res.json();
    },
    enabled: !!selectedProduct,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
  
  // Client-side filtering for instant search as you type
  const allOdooProducts = allOdooProductsRaw.filter((p: any) => {
    if (!odooProductSearch) return true;
    const searchLower = odooProductSearch.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(searchLower) ||
      (p.default_code || '').toLowerCase().includes(searchLower)
    );
  }).slice(0, 100); // Show max 100 results

  // Query for price sync queue
  const { data: priceSyncQueue = [], isLoading: queueLoading, refetch: refetchQueue } = useQuery<OdooPriceSyncQueue[]>({
    queryKey: ['/api/odoo/price-sync-queue'],
  });

  // Create mapping mutation
  const createMappingMutation = useMutation({
    mutationFn: async (data: { itemCode: string; odooProductId: number; odooDefaultCode?: string; odooProductName?: string }) => {
      const res = await apiRequest('POST', '/api/odoo/product-mappings', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/products-for-mapping'] });
      setSelectedProduct(null);
      setSelectedOdooProduct("");
      toast({ title: "Mapping created", description: "Product has been linked to Odoo" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to create mapping", description: error.message, variant: "destructive" });
    },
  });

  // Delete mapping mutation
  const deleteMappingMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('DELETE', `/api/odoo/product-mappings/${id}`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/products-for-mapping'] });
      toast({ title: "Mapping removed" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to remove mapping", description: error.message, variant: "destructive" });
    },
  });

  // Approve price sync mutation
  const approveSyncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/odoo/price-sync-queue/${id}/approve`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/price-sync-queue'] });
      toast({ title: "Price synced to Odoo", description: "The price has been updated in Odoo" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to sync price", description: error.message, variant: "destructive" });
    },
  });

  // Reject price sync mutation
  const rejectSyncMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await apiRequest('POST', `/api/odoo/price-sync-queue/${id}/reject`);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/price-sync-queue'] });
      toast({ title: "Price sync rejected" });
    },
    onError: (error: any) => {
      toast({ title: "Failed to reject", description: error.message, variant: "destructive" });
    },
  });

  // Preview auto-mapping mutation
  const previewMappingMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/odoo/product-mappings/auto/preview', {});
      return res.json();
    },
    onSuccess: (data) => {
      setPreviewData(data);
      setProposedMappings(data.proposedMappings || []);
      setShowPreviewModal(true);
    },
    onError: (error: any) => {
      toast({ title: "Failed to load preview", description: error.message, variant: "destructive" });
    },
  });

  // Apply confirmed mappings mutation
  const applyMappingsMutation = useMutation({
    mutationFn: async (mappings: any[]) => {
      const res = await apiRequest('POST', '/api/odoo/product-mappings/auto/apply', { mappings });
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/products-for-mapping'] });
      setShowPreviewModal(false);
      setPreviewData(null);
      setProposedMappings([]);
      toast({ 
        title: "Mappings applied",
        description: `${data.created} products mapped successfully`
      });
    },
    onError: (error: any) => {
      toast({ title: "Failed to apply mappings", description: error.message, variant: "destructive" });
    },
  });

  // Query for Odoo products when editing a mapping
  const { data: editOdooProducts = [], isLoading: editOdooProductsLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/all-products', editOdooSearch, 'edit'],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (editOdooSearch) params.set('search', editOdooSearch);
      params.set('limit', '100');
      const res = await fetch(`/api/odoo/all-products?${params.toString()}`);
      return res.json();
    },
    enabled: !!editingMapping,
  });

  // Helper functions for preview modal
  const toggleMappingAccepted = (itemCode: string) => {
    setProposedMappings(prev => prev.map(m => 
      m.itemCode === itemCode ? { ...m, accepted: !m.accepted } : m
    ));
  };

  const updateMappingOdooProduct = (itemCode: string, odooProduct: any) => {
    setProposedMappings(prev => prev.map(m => 
      m.itemCode === itemCode ? { 
        ...m, 
        suggestedOdooProduct: odooProduct,
        matchType: 'manual',
        accepted: true,
      } : m
    ));
    setEditingMapping(null);
    setEditOdooSearch("");
  };

  const getAcceptedMappingsForApply = () => {
    return proposedMappings
      .filter(m => m.accepted && m.suggestedOdooProduct)
      .map(m => ({
        itemCode: m.itemCode,
        odooProductId: m.suggestedOdooProduct.id,
        odooDefaultCode: m.suggestedOdooProduct.default_code,
        odooProductName: m.suggestedOdooProduct.name,
      }));
  };

  const filteredPreviewMappings = proposedMappings.filter(m => {
    if (!previewSearchTerm) return true;
    const searchLower = previewSearchTerm.toLowerCase();
    return (
      (m.itemCode || '').toLowerCase().includes(searchLower) ||
      (m.productName || '').toLowerCase().includes(searchLower) ||
      (m.suggestedOdooProduct?.name || '').toLowerCase().includes(searchLower)
    );
  });

  // Filtered products for mapping based on search
  const filteredMappingProducts = productsForMapping.filter((p: any) => {
    if (!mappingSearchTerm) return true;
    const searchLower = mappingSearchTerm.toLowerCase();
    return (
      (p.itemCode || '').toLowerCase().includes(searchLower) ||
      (p.productName || '').toLowerCase().includes(searchLower) ||
      (p.productType || '').toLowerCase().includes(searchLower)
    );
  });

  const filteredPartners = odooPartners.filter((p: any) => {
    if (!partnerSearchTerm) return true;
    const searchLower = partnerSearchTerm.toLowerCase();
    return (
      (p.name || '').toLowerCase().includes(searchLower) ||
      (p.email || '').toLowerCase().includes(searchLower)
    );
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Building2 className="h-8 w-8" />
            Odoo Integration
          </h1>
          <p className="text-muted-foreground mt-1">
            View and import data from Odoo V19 Enterprise (Read-Only)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-blue-100 text-blue-700 gap-1">
            <Eye className="h-3 w-3" />
            Read-Only
          </Badge>
          {connectionTest?.success ? (
            <Badge className="bg-green-100 text-green-700 gap-1">
              <CheckCircle className="h-3 w-3" />
              Connected
            </Badge>
          ) : odooStatus?.error ? (
            <Badge variant="destructive" className="gap-1">
              <XCircle className="h-3 w-3" />
              Disconnected
            </Badge>
          ) : (
            <Badge variant="secondary">Not tested</Badge>
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Connection Status
          </CardTitle>
          <CardDescription>
            Test your Odoo connection and view system information
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Button 
              onClick={() => testConnection()}
              disabled={testingConnection}
              data-testid="btn-test-odoo-connection"
            >
              {testingConnection && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
              Test Connection
            </Button>
            
            {connectionTest && (
              <div className="flex items-center gap-2">
                {connectionTest.success ? (
                  <>
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    <span className="text-green-700">{connectionTest.message}</span>
                  </>
                ) : (
                  <>
                    <XCircle className="h-5 w-5 text-red-600" />
                    <span className="text-red-700">{connectionTest.message}</span>
                  </>
                )}
              </div>
            )}
          </div>

          {connectionTest?.success && (
            <div className="mt-4 grid grid-cols-4 gap-4">
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{odooPartners.length}</div>
                  <div className="text-sm text-muted-foreground">Odoo Partners</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{odooProducts.length}</div>
                  <div className="text-sm text-muted-foreground">Products</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{odooPricelists.length}</div>
                  <div className="text-sm text-muted-foreground">Pricelists</div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-4">
                  <div className="text-2xl font-bold">{odooUsers.length}</div>
                  <div className="text-sm text-muted-foreground">Users</div>
                </CardContent>
              </Card>
            </div>
          )}
        </CardContent>
      </Card>

      <Tabs defaultValue="import" className="space-y-4">
        <TabsList>
          <TabsTrigger value="import" data-testid="tab-import">
            <Download className="h-4 w-4 mr-2" />
            Import from Odoo
          </TabsTrigger>
          <TabsTrigger value="partners" data-testid="tab-partners">
            <Users className="h-4 w-4 mr-2" />
            Odoo Partners
          </TabsTrigger>
          <TabsTrigger value="products" data-testid="tab-products">
            <Package className="h-4 w-4 mr-2" />
            Products
          </TabsTrigger>
          <TabsTrigger value="orders" data-testid="tab-orders">
            <FileText className="h-4 w-4 mr-2" />
            Orders
          </TabsTrigger>
          <TabsTrigger value="product-mapping" data-testid="tab-product-mapping">
            <ArrowRightLeft className="h-4 w-4 mr-2" />
            Product Mapping
          </TabsTrigger>
          <TabsTrigger value="price-sync" data-testid="tab-price-sync">
            <Upload className="h-4 w-4 mr-2" />
            Price Sync Queue
            {priceSyncQueue.length > 0 && (
              <Badge variant="destructive" className="ml-2 h-5 w-5 p-0 flex items-center justify-center text-xs">
                {priceSyncQueue.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="import-products" data-testid="tab-import-products">
            <Plus className="h-4 w-4 mr-2" />
            Import Products
          </TabsTrigger>
        </TabsList>

        <TabsContent value="import">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Import Partners from Odoo
              </CardTitle>
              <CardDescription>
                Import all partners from Odoo into your local CRM as customers. 
                This will replace all existing customer data.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                  <h4 className="font-semibold text-amber-800 dark:text-amber-200 mb-2">
                    Warning: This action will delete all existing customers
                  </h4>
                  <p className="text-sm text-amber-700 dark:text-amber-300">
                    All current customer records in this app will be permanently deleted and replaced 
                    with partners imported from Odoo. This cannot be undone.
                  </p>
                </div>

                {connectionTest?.success ? (
                  <div className="space-y-4">
                    <div className="flex items-center gap-4">
                      <div className="flex-1">
                        <div className="text-lg font-medium">Ready to Import</div>
                        <div className="text-sm text-muted-foreground">
                          Found {odooPartners.length} partners in Odoo
                        </div>
                      </div>
                      
                      {!showImportConfirm ? (
                        <Button 
                          variant="destructive"
                          onClick={() => setShowImportConfirm(true)}
                          data-testid="btn-start-import"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          Import All from Odoo
                        </Button>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Button 
                            variant="outline"
                            onClick={() => setShowImportConfirm(false)}
                            data-testid="btn-cancel-import"
                          >
                            Cancel
                          </Button>
                          <Button 
                            variant="destructive"
                            onClick={() => {
                              importFromOdooMutation.mutate(true);
                              setShowImportConfirm(false);
                            }}
                            disabled={importFromOdooMutation.isPending}
                            data-testid="btn-confirm-import"
                          >
                            {importFromOdooMutation.isPending && (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            Yes, Delete All & Import
                          </Button>
                        </div>
                      )}
                    </div>

                    {importResult && (
                      <div className="space-y-3">
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="font-semibold text-green-800 dark:text-green-200">
                            Import Completed
                          </div>
                          <div className="text-sm text-green-700 dark:text-green-300 mt-2 grid grid-cols-3 gap-4">
                            <div className="text-center p-2 bg-green-100 rounded">
                              <div className="text-2xl font-bold text-green-700">{importResult.imported}</div>
                              <div className="text-xs">Imported</div>
                            </div>
                            <div className="text-center p-2 bg-yellow-100 rounded">
                              <div className="text-2xl font-bold text-yellow-700">{importResult.skipped}</div>
                              <div className="text-xs">Skipped</div>
                            </div>
                            <div className="text-center p-2 bg-red-100 rounded">
                              <div className="text-2xl font-bold text-red-700">{importResult.failed}</div>
                              <div className="text-xs">Failed</div>
                            </div>
                          </div>
                        </div>
                        
                        {(importResult.skippedPartners && importResult.skippedPartners.length > 0) && (
                          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                            <div className="font-semibold text-yellow-800 mb-2">
                              Skipped Partners (No Name)
                            </div>
                            <div className="text-sm text-yellow-700 max-h-32 overflow-y-auto">
                              {importResult.skippedPartners.map((p, i) => (
                                <div key={i} className="py-1 border-b border-yellow-100 last:border-0">{p}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        
                        {(importResult.errors && importResult.errors.length > 0) && (
                          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                            <div className="font-semibold text-red-800 mb-2">
                              Failed Imports
                            </div>
                            <div className="text-sm text-red-700 max-h-48 overflow-y-auto font-mono">
                              {importResult.errors.map((err, i) => (
                                <div key={i} className="py-1 border-b border-red-100 last:border-0">{err}</div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="text-center py-8 text-muted-foreground">
                    <Link2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Please test your Odoo connection first</p>
                    <Button 
                      variant="outline" 
                      className="mt-4"
                      onClick={() => testConnection()}
                      disabled={testingConnection}
                    >
                      {testingConnection && <RefreshCw className="h-4 w-4 mr-2 animate-spin" />}
                      Test Connection
                    </Button>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="partners">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Odoo Partners</CardTitle>
                  <CardDescription>
                    View partners (customers/companies) in your Odoo system
                  </CardDescription>
                </div>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => refetchPartners()}
                  disabled={partnersLoading}
                  data-testid="btn-refresh-partners"
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${partnersLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="relative max-w-md">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search partners..."
                    value={partnerSearchTerm}
                    onChange={(e) => setPartnerSearchTerm(e.target.value)}
                    className="pl-10"
                    data-testid="input-partner-search"
                  />
                </div>

                <div className="border rounded-lg max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>City</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {partnersLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                            Loading partners...
                          </TableCell>
                        </TableRow>
                      ) : filteredPartners.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No partners found. Test your connection first.
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredPartners.slice(0, 100).map((partner: any) => (
                          <TableRow key={partner.id} data-testid={`row-partner-${partner.id}`}>
                            <TableCell className="font-mono text-sm">{partner.id}</TableCell>
                            <TableCell className="font-medium">{partner.name}</TableCell>
                            <TableCell>{partner.email || '-'}</TableCell>
                            <TableCell>{partner.phone || partner.mobile || '-'}</TableCell>
                            <TableCell>
                              <Badge variant={partner.is_company ? 'default' : 'secondary'}>
                                {partner.is_company ? 'Company' : 'Contact'}
                              </Badge>
                            </TableCell>
                            <TableCell>{partner.city || '-'}</TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="products">
          <Card>
            <CardHeader>
              <CardTitle>Odoo Products</CardTitle>
              <CardDescription>
                View products from your Odoo system
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Price</TableHead>
                      <TableHead>Category</TableHead>
                      <TableHead>Type</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productsLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading products...
                        </TableCell>
                      </TableRow>
                    ) : odooProducts.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No products found. Test your connection first.
                        </TableCell>
                      </TableRow>
                    ) : (
                      odooProducts.slice(0, 100).map((product: any) => (
                        <TableRow key={product.id} data-testid={`row-product-${product.id}`}>
                          <TableCell className="font-mono text-sm">{product.id}</TableCell>
                          <TableCell className="font-medium">{product.name}</TableCell>
                          <TableCell>{product.default_code || '-'}</TableCell>
                          <TableCell>${product.list_price?.toFixed(2) || '0.00'}</TableCell>
                          <TableCell>
                            {product.categ_id ? product.categ_id[1] : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{product.type}</Badge>
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="orders">
          <Card>
            <CardHeader>
              <CardTitle>Odoo Sale Orders</CardTitle>
              <CardDescription>
                View recent sale orders and quotations from Odoo
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded-lg max-h-[500px] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Order #</TableHead>
                      <TableHead>Customer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Total</TableHead>
                      <TableHead>Sales Rep</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ordersLoading ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                          Loading orders...
                        </TableCell>
                      </TableRow>
                    ) : odooOrders.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                          No orders found. Test your connection first.
                        </TableCell>
                      </TableRow>
                    ) : (
                      odooOrders.slice(0, 100).map((order: any) => (
                        <TableRow key={order.id} data-testid={`row-order-${order.id}`}>
                          <TableCell className="font-mono font-medium">{order.name}</TableCell>
                          <TableCell>{order.partner_id?.[1] || '-'}</TableCell>
                          <TableCell>
                            {order.date_order ? format(new Date(order.date_order), 'MMM d, yyyy') : '-'}
                          </TableCell>
                          <TableCell>
                            <Badge variant={
                              order.state === 'sale' ? 'default' :
                              order.state === 'done' ? 'secondary' :
                              order.state === 'cancel' ? 'destructive' :
                              'outline'
                            }>
                              {order.state === 'draft' ? 'Quotation' :
                               order.state === 'sent' ? 'Sent' :
                               order.state === 'sale' ? 'Sales Order' :
                               order.state === 'done' ? 'Done' :
                               order.state === 'cancel' ? 'Cancelled' :
                               order.state}
                            </Badge>
                          </TableCell>
                          <TableCell className="font-medium">
                            ${order.amount_total?.toFixed(2) || '0.00'}
                          </TableCell>
                          <TableCell>{order.user_id?.[1] || '-'}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Product Mapping Tab */}
        <TabsContent value="product-mapping">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5" />
                Map QuickQuotes Products to Odoo
              </CardTitle>
              <CardDescription>
                Link your QuickQuotes products to their corresponding Odoo products to enable price syncing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Auto-Map Banner */}
                <div className="bg-purple-50 dark:bg-purple-950 border border-purple-200 dark:border-purple-800 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="font-medium text-purple-900 dark:text-purple-100">Auto-Map by Item Code</h4>
                      <p className="text-sm text-purple-700 dark:text-purple-300 mt-1">
                        Preview and confirm product matches before applying them
                      </p>
                    </div>
                    <Button 
                      onClick={() => previewMappingMutation.mutate()}
                      disabled={previewMappingMutation.isPending}
                      className="bg-purple-600 hover:bg-purple-700"
                      data-testid="btn-auto-map"
                    >
                      {previewMappingMutation.isPending ? (
                        <>
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                          Loading Preview...
                        </>
                      ) : (
                        <>
                          <ArrowRightLeft className="h-4 w-4 mr-2" />
                          Preview Mappings
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search by item code, name, or type..."
                      value={mappingSearchTerm}
                      onChange={(e) => setMappingSearchTerm(e.target.value)}
                      className="pl-10"
                      data-testid="input-mapping-search"
                    />
                  </div>
                  <Select value={mappingFilter} onValueChange={(v: any) => setMappingFilter(v)}>
                    <SelectTrigger className="w-40" data-testid="select-mapping-filter">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Products</SelectItem>
                      <SelectItem value="mapped">Mapped Only</SelectItem>
                      <SelectItem value="unmapped">Unmapped Only</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button variant="outline" onClick={() => refetchMappingProducts()}>
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>

                <div className="text-sm text-muted-foreground">
                  {filteredMappingProducts.filter((p: any) => p.isMapped).length} of {filteredMappingProducts.length} products mapped
                </div>

                <div className="border rounded-lg max-h-[500px] overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item Code</TableHead>
                        <TableHead>QuickQuotes Product</TableHead>
                        <TableHead>Product Type</TableHead>
                        <TableHead>Odoo Product</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[100px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {mappingProductsLoading ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8">
                            <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                            Loading products...
                          </TableCell>
                        </TableRow>
                      ) : filteredMappingProducts.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                            No products found
                          </TableCell>
                        </TableRow>
                      ) : (
                        filteredMappingProducts.slice(0, 100).map((product: any) => (
                          <TableRow key={product.id} data-testid={`row-mapping-${product.itemCode}`}>
                            <TableCell className="font-mono text-sm">{product.itemCode}</TableCell>
                            <TableCell>{product.productName}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{product.productType}</TableCell>
                            <TableCell>
                              {product.mapping ? (
                                <div className="text-sm">
                                  <div className="font-medium">{product.mapping.odooProductName}</div>
                                  <div className="text-muted-foreground font-mono">
                                    {product.mapping.odooDefaultCode || `ID: ${product.mapping.odooProductId}`}
                                  </div>
                                </div>
                              ) : (
                                <span className="text-muted-foreground italic">Not mapped</span>
                              )}
                            </TableCell>
                            <TableCell>
                              {product.mapping ? (
                                <Badge variant={
                                  product.mapping.syncStatus === 'synced' ? 'default' :
                                  product.mapping.syncStatus === 'error' ? 'destructive' :
                                  'secondary'
                                }>
                                  {product.mapping.syncStatus}
                                </Badge>
                              ) : (
                                <Badge variant="outline">Unmapped</Badge>
                              )}
                            </TableCell>
                            <TableCell>
                              {product.mapping ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => deleteMappingMutation.mutate(product.mapping.id)}
                                  disabled={deleteMappingMutation.isPending}
                                  data-testid={`btn-unmap-${product.itemCode}`}
                                >
                                  <Trash2 className="h-4 w-4 text-red-500" />
                                </Button>
                              ) : (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedProduct(product)}
                                  data-testid={`btn-map-${product.itemCode}`}
                                >
                                  <Plus className="h-4 w-4" />
                                </Button>
                              )}
                            </TableCell>
                          </TableRow>
                        ))
                      )}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Price Sync Queue Tab */}
        <TabsContent value="price-sync">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Price Sync Queue
              </CardTitle>
              <CardDescription>
                Review and approve price updates before they are pushed to Odoo.
                All price changes require admin approval before syncing.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {priceSyncQueue.length} pending price updates
                  </div>
                  <Button variant="outline" size="sm" onClick={() => refetchQueue()}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh
                  </Button>
                </div>

                {queueLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-6 w-6 animate-spin mx-auto mb-2" />
                    Loading queue...
                  </div>
                ) : priceSyncQueue.length === 0 ? (
                  <div className="text-center py-12 border rounded-lg">
                    <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-4" />
                    <h4 className="font-medium">No pending price updates</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      All price changes have been processed
                    </p>
                  </div>
                ) : (
                  <div className="border rounded-lg">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Item Code</TableHead>
                          <TableHead>Price Tier</TableHead>
                          <TableHead>Current Odoo Price</TableHead>
                          <TableHead>New Price</TableHead>
                          <TableHead>Requested By</TableHead>
                          <TableHead>Date</TableHead>
                          <TableHead className="w-[140px]">Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {priceSyncQueue.map((item: OdooPriceSyncQueue) => (
                          <TableRow key={item.id} data-testid={`row-sync-${item.id}`}>
                            <TableCell className="font-mono text-sm">{item.itemCode}</TableCell>
                            <TableCell>{item.priceTier}</TableCell>
                            <TableCell className="text-muted-foreground">
                              ${parseFloat(item.currentOdooPrice || '0').toFixed(2)}
                            </TableCell>
                            <TableCell className="font-medium text-green-600">
                              ${parseFloat(item.newPrice).toFixed(2)}
                            </TableCell>
                            <TableCell className="text-sm">{item.requestedBy}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">
                              {item.requestedAt ? format(new Date(item.requestedAt), 'MMM d, HH:mm') : '-'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => approveSyncMutation.mutate(item.id)}
                                  disabled={approveSyncMutation.isPending}
                                  className="text-green-600 hover:text-green-700 hover:bg-green-50"
                                  data-testid={`btn-approve-${item.id}`}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => rejectSyncMutation.mutate(item.id)}
                                  disabled={rejectSyncMutation.isPending}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                  data-testid={`btn-reject-${item.id}`}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="import-products">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Plus className="h-5 w-5" />
                    Import Products from Odoo
                  </CardTitle>
                  <CardDescription>
                    Add Odoo products that are missing from your local Price List & QuickQuotes
                  </CardDescription>
                </div>
                <Button
                  onClick={() => refetchMissingProducts()}
                  disabled={missingProductsLoading}
                  variant="outline"
                  data-testid="btn-load-missing-products"
                >
                  {missingProductsLoading ? (
                    <>
                      <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    <>
                      <Download className="h-4 w-4 mr-2" />
                      Load Missing Products
                    </>
                  )}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {!missingProductsData ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Click "Load Missing Products" to find Odoo products not in your local app</p>
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold">{missingProductsData.totalLocalProducts}</div>
                        <div className="text-xs text-muted-foreground">Local Products</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold">{missingProductsData.totalOdooProducts}</div>
                        <div className="text-xs text-muted-foreground">Odoo Products</div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-yellow-600">{missingProductsData.missingCount}</div>
                        <div className="text-xs text-muted-foreground">Missing from Local</div>
                      </div>
                    </div>

                    {/* Search and Actions */}
                    <div className="flex items-center gap-4">
                      <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                        <Input
                          placeholder="Search by item code or name..."
                          value={importProductSearch}
                          onChange={(e) => setImportProductSearch(e.target.value)}
                          className="pl-10"
                          data-testid="input-import-product-search"
                        />
                      </div>
                      <Button
                        onClick={() => {
                          const productsToImport = missingProductsData.missingProducts.filter(p => selectedImportProducts.has(p.id));
                          if (productsToImport.length > 0) {
                            importProductsMutation.mutate(productsToImport);
                          }
                        }}
                        disabled={importProductsMutation.isPending || selectedImportProducts.size === 0}
                        className="bg-green-600 hover:bg-green-700"
                        data-testid="btn-import-selected"
                      >
                        {importProductsMutation.isPending ? (
                          <>
                            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            Importing...
                          </>
                        ) : (
                          <>
                            <Plus className="h-4 w-4 mr-2" />
                            Import Selected ({selectedImportProducts.size})
                          </>
                        )}
                      </Button>
                    </div>

                    {/* Products Table */}
                    <div className="border rounded-lg max-h-[400px] overflow-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-background">
                          <TableRow>
                            <TableHead className="w-12">
                              <input
                                type="checkbox"
                                checked={
                                  missingProductsData.missingProducts.length > 0 &&
                                  missingProductsData.missingProducts.every(p => selectedImportProducts.has(p.id))
                                }
                                onChange={(e) => {
                                  if (e.target.checked) {
                                    setSelectedImportProducts(new Set(missingProductsData.missingProducts.map(p => p.id)));
                                  } else {
                                    setSelectedImportProducts(new Set());
                                  }
                                }}
                                className="rounded"
                                data-testid="checkbox-select-all-import"
                              />
                            </TableHead>
                            <TableHead>Item Code</TableHead>
                            <TableHead>Product Name</TableHead>
                            <TableHead>Price</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead className="w-20">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {missingProductsData.missingProducts
                            .filter(p => {
                              if (!importProductSearch) return true;
                              const search = importProductSearch.toLowerCase();
                              return (
                                (p.default_code || '').toLowerCase().includes(search) ||
                                (p.name || '').toLowerCase().includes(search)
                              );
                            })
                            .map((product: any) => (
                            <TableRow 
                              key={product.id}
                              className={selectedImportProducts.has(product.id) ? 'bg-green-50/50 dark:bg-green-950/20' : ''}
                              data-testid={`import-row-${product.id}`}
                            >
                              <TableCell>
                                <input
                                  type="checkbox"
                                  checked={selectedImportProducts.has(product.id)}
                                  onChange={(e) => {
                                    const newSet = new Set(selectedImportProducts);
                                    if (e.target.checked) {
                                      newSet.add(product.id);
                                    } else {
                                      newSet.delete(product.id);
                                    }
                                    setSelectedImportProducts(newSet);
                                  }}
                                  className="rounded"
                                  data-testid={`checkbox-import-${product.id}`}
                                />
                              </TableCell>
                              <TableCell className="font-mono text-sm">{product.default_code}</TableCell>
                              <TableCell>{product.name}</TableCell>
                              <TableCell>${product.list_price?.toFixed(2) || '0.00'}</TableCell>
                              <TableCell>
                                <Badge variant={product.is_variant ? 'secondary' : 'outline'}>
                                  {product.is_variant ? 'Variant' : 'Template'}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => openWizard(product)}
                                  className="h-7 px-2"
                                  data-testid={`btn-add-product-${product.id}`}
                                >
                                  <Plus className="h-3 w-3 mr-1" />
                                  Add
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      {missingProductsData.missingProducts.length === 0 && (
                        <div className="text-center py-8 text-muted-foreground">
                          All Odoo products are already in your local app!
                        </div>
                      )}
                    </div>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Product Mapping Dialog */}
      <Dialog open={!!selectedProduct} onOpenChange={(open) => !open && setSelectedProduct(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Map Product to Odoo</DialogTitle>
            <DialogDescription>
              Select the corresponding Odoo product for this QuickQuotes item.
            </DialogDescription>
          </DialogHeader>
          
          {selectedProduct && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">QuickQuotes Product</div>
                <div className="font-medium">{selectedProduct.productName}</div>
                <div className="text-sm text-muted-foreground mt-1">
                  Item Code: <span className="font-mono">{selectedProduct.itemCode}</span>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Search Odoo Products</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Type product code or name to filter instantly..."
                    value={odooProductSearch}
                    onChange={(e) => setOdooProductSearch(e.target.value)}
                    className="pl-10"
                    autoFocus
                    data-testid="input-odoo-product-search"
                  />
                </div>
                {odooProductSearch && (
                  <div className="text-xs text-muted-foreground">
                    {allOdooProducts.length} products match "{odooProductSearch}"
                    {allOdooProducts.length === 100 && " (showing first 100)"}
                  </div>
                )}
              </div>

              <div className="border rounded-lg max-h-[250px] overflow-auto">
                {allOdooProductsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Loading Odoo products...
                  </div>
                ) : allOdooProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No Odoo products found
                  </div>
                ) : (
                  <div className="divide-y">
                    {allOdooProducts.map((odooProduct: any) => (
                      <div
                        key={odooProduct.id}
                        className={`p-3 cursor-pointer hover:bg-muted transition-colors ${
                          selectedOdooProduct === String(odooProduct.id) ? 'bg-purple-50 border-l-4 border-purple-500' : ''
                        }`}
                        onClick={() => setSelectedOdooProduct(String(odooProduct.id))}
                        data-testid={`odoo-product-${odooProduct.id}`}
                      >
                        <div className="font-medium">{odooProduct.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {odooProduct.default_code && (
                            <span className="font-mono">{odooProduct.default_code}</span>
                          )}
                          <span>• ${odooProduct.list_price?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setSelectedProduct(null)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                if (selectedProduct && selectedOdooProduct) {
                  const odooProduct = allOdooProducts.find((p: any) => String(p.id) === selectedOdooProduct);
                  createMappingMutation.mutate({
                    itemCode: selectedProduct.itemCode,
                    odooProductId: parseInt(selectedOdooProduct),
                    odooDefaultCode: odooProduct?.default_code,
                    odooProductName: odooProduct?.name,
                  });
                }
              }}
              disabled={!selectedOdooProduct || createMappingMutation.isPending}
              data-testid="btn-save-mapping"
            >
              {createMappingMutation.isPending ? (
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-4 w-4 mr-2" />
              )}
              Create Mapping
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Auto-Map Results Dialog */}
      <Dialog open={!!autoMapResult} onOpenChange={(open) => !open && setAutoMapResult(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Auto-Mapping Complete
            </DialogTitle>
            <DialogDescription>
              Products have been matched by Item Code to Odoo's Internal Reference.
            </DialogDescription>
          </DialogHeader>
          
          {autoMapResult && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="bg-green-50 dark:bg-green-950 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-green-600">{autoMapResult.created}</div>
                  <div className="text-sm text-green-700 dark:text-green-300">Products Mapped</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-950 rounded-lg p-4 text-center">
                  <div className="text-3xl font-bold text-gray-600">{autoMapResult.skipped}</div>
                  <div className="text-sm text-gray-700 dark:text-gray-300">Already Mapped</div>
                </div>
              </div>

              <div className="text-sm space-y-2">
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Total QuickQuotes Products</span>
                  <span className="font-medium">{autoMapResult.totalProducts}</span>
                </div>
                <div className="flex items-center justify-between py-2 border-b">
                  <span className="text-muted-foreground">Total Odoo Products</span>
                  <span className="font-medium">{autoMapResult.totalOdooProducts}</span>
                </div>
                {autoMapResult.noMatchCount > 0 && (
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <AlertCircle className="h-4 w-4 text-yellow-500" />
                      No Odoo Match Found
                    </span>
                    <span className="font-medium text-yellow-600">{autoMapResult.noMatchCount}</span>
                  </div>
                )}
                {autoMapResult.conflictCount > 0 && (
                  <div className="flex items-center justify-between py-2 border-b">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <XCircle className="h-4 w-4 text-red-500" />
                      Conflicts (Duplicate Codes)
                    </span>
                    <span className="font-medium text-red-600">{autoMapResult.conflictCount}</span>
                  </div>
                )}
              </div>

              {autoMapResult.noMatch.length > 0 && (
                <div className="border rounded-lg p-3">
                  <div className="text-sm font-medium mb-2">Sample unmatched Item Codes:</div>
                  <div className="text-xs text-muted-foreground font-mono space-y-1 max-h-24 overflow-auto">
                    {autoMapResult.noMatch.slice(0, 10).map((code, i) => (
                      <div key={i}>{code}</div>
                    ))}
                    {autoMapResult.noMatch.length > 10 && (
                      <div className="text-muted-foreground">...and {autoMapResult.noMatch.length - 10} more</div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setAutoMapResult(null)} data-testid="btn-close-automap-results">
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Preview Mappings Modal */}
      <Dialog open={showPreviewModal} onOpenChange={(open) => !open && setShowPreviewModal(false)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-5 w-5" />
              Review Product Mappings
            </DialogTitle>
            <DialogDescription>
              Review the suggested matches below. Accept, modify, or skip each mapping before applying.
            </DialogDescription>
          </DialogHeader>
          
          {previewData && (
            <div className="flex-1 overflow-hidden flex flex-col space-y-4">
              {/* Stats */}
              <div className="grid grid-cols-4 gap-3">
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{previewData.totalProducts}</div>
                  <div className="text-xs text-muted-foreground">Total Products</div>
                </div>
                <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold">{previewData.alreadyMapped}</div>
                  <div className="text-xs text-muted-foreground">Already Mapped</div>
                </div>
                <div className="bg-green-50 dark:bg-green-900 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-green-600">
                    {proposedMappings.filter(m => m.accepted && m.suggestedOdooProduct).length}
                  </div>
                  <div className="text-xs text-muted-foreground">To Map</div>
                </div>
                <div className="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-3 text-center">
                  <div className="text-xl font-bold text-yellow-600">
                    {proposedMappings.filter(m => !m.suggestedOdooProduct).length}
                  </div>
                  <div className="text-xs text-muted-foreground">No Match</div>
                </div>
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by item code or product name..."
                  value={previewSearchTerm}
                  onChange={(e) => setPreviewSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-preview-search"
                />
              </div>

              {/* Mappings Table */}
              <div className="flex-1 border rounded-lg overflow-auto">
                <Table>
                  <TableHeader className="sticky top-0 bg-background">
                    <TableRow>
                      <TableHead className="w-12">
                        <input
                          type="checkbox"
                          checked={filteredPreviewMappings.filter(m => m.suggestedOdooProduct).every(m => m.accepted)}
                          onChange={(e) => {
                            const newValue = e.target.checked;
                            setProposedMappings(prev => prev.map(m => 
                              m.suggestedOdooProduct ? { ...m, accepted: newValue } : m
                            ));
                          }}
                          className="rounded"
                          data-testid="checkbox-select-all"
                        />
                      </TableHead>
                      <TableHead>Item Code</TableHead>
                      <TableHead>QuickQuotes Product</TableHead>
                      <TableHead>Suggested Odoo Product</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="w-20">Change</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredPreviewMappings.slice(0, 100).map((mapping: any) => (
                      <TableRow 
                        key={mapping.itemCode} 
                        className={mapping.accepted ? 'bg-green-50/50 dark:bg-green-950/20' : ''}
                        data-testid={`preview-row-${mapping.itemCode}`}
                      >
                        <TableCell>
                          <input
                            type="checkbox"
                            checked={mapping.accepted}
                            disabled={!mapping.suggestedOdooProduct}
                            onChange={() => toggleMappingAccepted(mapping.itemCode)}
                            className="rounded"
                            data-testid={`checkbox-${mapping.itemCode}`}
                          />
                        </TableCell>
                        <TableCell className="font-mono text-sm">{mapping.itemCode}</TableCell>
                        <TableCell>
                          <div className="text-sm">{mapping.productName}</div>
                          <div className="text-xs text-muted-foreground">{mapping.productType}</div>
                        </TableCell>
                        <TableCell>
                          {mapping.suggestedOdooProduct ? (
                            <div>
                              <div className="text-sm font-medium">{mapping.suggestedOdooProduct.name}</div>
                              <div className="text-xs text-muted-foreground font-mono">
                                {mapping.suggestedOdooProduct.default_code}
                              </div>
                            </div>
                          ) : (
                            <span className="text-muted-foreground italic text-sm">No match found</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-1">
                            <Badge variant={
                              mapping.matchType === 'exact' ? 'default' :
                              mapping.matchType === 'case_insensitive' ? 'secondary' :
                              mapping.matchType === 'normalized' ? 'secondary' :
                              mapping.matchType === 'fuzzy_prefix' ? 'outline' :
                              mapping.matchType === 'manual' ? 'outline' :
                              'destructive'
                            } className="text-xs w-fit">
                              {mapping.matchType === 'exact' ? 'Exact' :
                               mapping.matchType === 'case_insensitive' ? 'Case Match' :
                               mapping.matchType === 'normalized' ? 'Normalized' :
                               mapping.matchType === 'fuzzy_prefix' ? 'Fuzzy Match' :
                               mapping.matchType === 'manual' ? 'Manual' :
                               'No Match'}
                            </Badge>
                            {mapping.matchConfidence && mapping.matchConfidence < 100 && (
                              <span className={`text-xs ${mapping.matchConfidence >= 80 ? 'text-green-600' : mapping.matchConfidence >= 60 ? 'text-yellow-600' : 'text-red-600'}`}>
                                {mapping.matchConfidence}% confidence
                              </span>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setEditingMapping(mapping);
                              setEditOdooSearch(mapping.itemCode);
                            }}
                            data-testid={`btn-change-${mapping.itemCode}`}
                          >
                            <Search className="h-4 w-4" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {filteredPreviewMappings.length > 100 && (
                  <div className="text-center py-2 text-sm text-muted-foreground border-t">
                    Showing first 100 of {filteredPreviewMappings.length} mappings
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowPreviewModal(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => {
                const mappingsToApply = getAcceptedMappingsForApply();
                if (mappingsToApply.length > 0) {
                  applyMappingsMutation.mutate(mappingsToApply);
                } else {
                  toast({ title: "No mappings selected", description: "Please select at least one mapping to apply", variant: "destructive" });
                }
              }}
              disabled={applyMappingsMutation.isPending || proposedMappings.filter(m => m.accepted && m.suggestedOdooProduct).length === 0}
              className="bg-green-600 hover:bg-green-700"
              data-testid="btn-apply-mappings"
            >
              {applyMappingsMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Applying...
                </>
              ) : (
                <>
                  <Check className="h-4 w-4 mr-2" />
                  Apply {proposedMappings.filter(m => m.accepted && m.suggestedOdooProduct).length} Mappings
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Mapping Dialog */}
      <Dialog open={!!editingMapping} onOpenChange={(open) => !open && setEditingMapping(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Change Odoo Product</DialogTitle>
            <DialogDescription>
              Search and select a different Odoo product for this mapping.
            </DialogDescription>
          </DialogHeader>
          
          {editingMapping && (
            <div className="space-y-4">
              <div className="p-3 bg-muted rounded-lg">
                <div className="text-sm text-muted-foreground">QuickQuotes Product</div>
                <div className="font-medium">{editingMapping.productName}</div>
                <div className="text-sm text-muted-foreground font-mono">{editingMapping.itemCode}</div>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Search Odoo Products</label>
                <Input
                  placeholder="Type to search..."
                  value={editOdooSearch}
                  onChange={(e) => setEditOdooSearch(e.target.value)}
                  data-testid="input-edit-odoo-search"
                />
              </div>

              <div className="border rounded-lg max-h-[250px] overflow-auto">
                {editOdooProductsLoading ? (
                  <div className="text-center py-8">
                    <RefreshCw className="h-4 w-4 animate-spin mx-auto mb-2" />
                    Searching...
                  </div>
                ) : editOdooProducts.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    No products found
                  </div>
                ) : (
                  <div className="divide-y">
                    {editOdooProducts.slice(0, 50).map((odooProduct: any) => (
                      <div
                        key={odooProduct.id}
                        className="p-3 cursor-pointer hover:bg-muted transition-colors"
                        onClick={() => updateMappingOdooProduct(editingMapping.itemCode, {
                          id: odooProduct.id,
                          name: odooProduct.name,
                          default_code: odooProduct.default_code,
                          list_price: odooProduct.list_price,
                        })}
                        data-testid={`edit-odoo-product-${odooProduct.id}`}
                      >
                        <div className="font-medium">{odooProduct.name}</div>
                        <div className="text-sm text-muted-foreground flex items-center gap-2">
                          {odooProduct.default_code && (
                            <span className="font-mono">{odooProduct.default_code}</span>
                          )}
                          <span>• ${odooProduct.list_price?.toFixed(2) || '0.00'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMapping(null)}>
              Cancel
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Guided Product Creation Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Product from Odoo
            </DialogTitle>
            <DialogDescription>
              Configure how this Odoo product should be set up in QuickQuotes
            </DialogDescription>
          </DialogHeader>

          {wizardProduct && (
            <div className="space-y-4">
              {/* Product Info Header */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="font-medium text-lg">{wizardProduct.name}</div>
                <div className="text-sm text-muted-foreground mt-1 flex items-center gap-3">
                  <span className="font-mono bg-blue-100 dark:bg-blue-900 px-2 py-0.5 rounded">{wizardProduct.default_code}</span>
                  <span>${wizardProduct.list_price?.toFixed(2) || '0.00'}</span>
                </div>
              </div>

              {/* Step 1: Roll or Sheet */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Is this a Roll or Sheet product?</label>
                <Select
                  value={wizardData.rollSheet}
                  onValueChange={(value: 'roll' | 'sheet') => setWizardData({ ...wizardData, rollSheet: value })}
                >
                  <SelectTrigger data-testid="select-roll-sheet">
                    <SelectValue placeholder="Select type..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheet">Sheet</SelectItem>
                    <SelectItem value="roll">Roll</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Step 2: Unit of Measure */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Unit of Measure</label>
                <Select
                  value={wizardData.unitOfMeasure}
                  onValueChange={(value: 'sheets' | 'rolls' | 'packets' | 'cartons') => setWizardData({ ...wizardData, unitOfMeasure: value })}
                >
                  <SelectTrigger data-testid="select-uom">
                    <SelectValue placeholder="Select unit..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sheets">Sheets</SelectItem>
                    <SelectItem value="rolls">Rolls</SelectItem>
                    <SelectItem value="packets">Packets</SelectItem>
                    <SelectItem value="cartons">Cartons</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Step 3: Size (Prefilled) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Size</label>
                <Input
                  value={wizardData.size}
                  onChange={(e) => {
                    const newSize = e.target.value;
                    setWizardData({
                      ...wizardData,
                      size: newSize,
                      totalSqm: calculateSqmFromSize(newSize),
                    });
                  }}
                  placeholder="e.g., 13 x 19"
                  data-testid="input-wizard-size"
                />
                <p className="text-xs text-muted-foreground">Auto-detected from product code/name</p>
              </div>

              {/* Step 4: Sq. Meters (Prefilled) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Sq. Meters</label>
                <Input
                  value={wizardData.totalSqm}
                  onChange={(e) => setWizardData({ ...wizardData, totalSqm: e.target.value })}
                  placeholder="0.000000"
                  data-testid="input-wizard-sqm"
                />
                <p className="text-xs text-muted-foreground">Calculated from size (editable)</p>
              </div>

              {/* Step 5: Product Category */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Category</label>
                <Select
                  value={wizardData.productCategory}
                  onValueChange={(value) => setWizardData({ ...wizardData, productCategory: value })}
                >
                  <SelectTrigger data-testid="select-category">
                    <SelectValue placeholder="Select category..." />
                  </SelectTrigger>
                  <SelectContent>
                    {productCategories.map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Step 6: Product Type */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Product Type</label>
                <Input
                  value={wizardData.productType}
                  onChange={(e) => setWizardData({ ...wizardData, productType: e.target.value })}
                  placeholder="Enter product type (e.g., Thickness: 8mil)"
                  data-testid="input-product-type"
                />
                <p className="text-xs text-muted-foreground">This will appear in QuickQuotes, Price List, and everywhere else</p>
              </div>

              {/* Step 7: Min Order Quantity */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Minimum Order Quantity</label>
                <Input
                  type="number"
                  min="1"
                  value={wizardData.minQuantity}
                  onChange={(e) => setWizardData({ ...wizardData, minQuantity: e.target.value })}
                  placeholder="1"
                  data-testid="input-min-qty"
                />
                <p className="text-xs text-muted-foreground">Minimum quantity per order (used in QuickQuotes)</p>
              </div>

              {/* Step 8: Pricing */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Pricing (Optional)</label>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="text-xs text-muted-foreground">Dealer Price ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={wizardData.dealerPrice}
                      onChange={(e) => setWizardData({ ...wizardData, dealerPrice: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-dealer-price"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-muted-foreground">Retail Price ($)</label>
                    <Input
                      type="number"
                      step="0.01"
                      min="0"
                      value={wizardData.retailPrice}
                      onChange={(e) => setWizardData({ ...wizardData, retailPrice: e.target.value })}
                      placeholder="0.00"
                      data-testid="input-retail-price"
                    />
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Pre-fill from Odoo price or enter manually</p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setWizardOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={completeWizard}
              disabled={importProductsMutation.isPending}
              className="bg-green-600 hover:bg-green-700"
              data-testid="btn-wizard-complete"
            >
              {importProductsMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Adding...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Add Product
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

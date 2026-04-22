import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
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
  Plus,
  Trash2,
  Clock,
  Check,
  X,
  AlertCircle,
  Upload,
  Target,
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
  
  // Import progress tracking
  const [importProgress, setImportProgress] = useState(0);
  const [importStage, setImportStage] = useState<string>("");
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);

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

  // Get Odoo sync status to determine if this is first import or incremental
  const { data: syncStatus } = useQuery<{
    hasPreviousSync: boolean;
    syncedCustomerCount: number;
    totalCustomerCount: number;
    lastSyncAt: string | null;
  }>({
    queryKey: ['/api/odoo/sync-status'],
  });

  // Start animated progress for import
  const startImportProgress = (mode: 'add_new' | 'full_reset' | 'sync_with_deletions') => {
    setImportProgress(0);
    setImportStage(mode === 'full_reset' ? "Preparing full reset..." : mode === 'sync_with_deletions' ? "Starting full sync..." : "Connecting to Odoo...");
    
    // Simulate progress stages
    const stages = mode === 'full_reset' 
      ? [
          { progress: 10, stage: "Clearing existing customers..." },
          { progress: 25, stage: "Fetching partners from Odoo..." },
          { progress: 50, stage: "Processing customer data..." },
          { progress: 75, stage: "Saving to database..." },
          { progress: 90, stage: "Finalizing import..." },
        ]
      : mode === 'sync_with_deletions'
      ? [
          { progress: 10, stage: "Checking existing customers..." },
          { progress: 25, stage: "Fetching partners from Odoo..." },
          { progress: 45, stage: "Identifying new customers..." },
          { progress: 60, stage: "Importing new customers..." },
          { progress: 75, stage: "Detecting deleted partners..." },
          { progress: 90, stage: "Removing deleted customers..." },
        ]
      : [
          { progress: 15, stage: "Checking existing customers..." },
          { progress: 30, stage: "Fetching partners from Odoo..." },
          { progress: 55, stage: "Identifying new customers..." },
          { progress: 75, stage: "Importing new customers..." },
          { progress: 90, stage: "Finalizing import..." },
        ];
    
    let stageIndex = 0;
    progressIntervalRef.current = setInterval(() => {
      if (stageIndex < stages.length) {
        setImportProgress(stages[stageIndex].progress);
        setImportStage(stages[stageIndex].stage);
        stageIndex++;
      }
    }, 2000);
  };

  const stopImportProgress = (success: boolean) => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (success) {
      setImportProgress(100);
      setImportStage("Import complete!");
    } else {
      setImportStage("Import failed");
    }
    // Reset after a delay
    setTimeout(() => {
      setImportProgress(0);
      setImportStage("");
    }, 3000);
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current);
      }
    };
  }, []);

  const importFromOdooMutation = useMutation({
    mutationFn: async (params: { importMode: 'add_new' | 'full_reset' | 'sync_with_deletions' }) => {
      startImportProgress(params.importMode);
      const res = await apiRequest('POST', '/api/odoo/import/partners', { 
        importMode: params.importMode,
        deleteExisting: params.importMode === 'full_reset'
      });
      return res.json();
    },
    onSuccess: (data: any) => {
      stopImportProgress(true);
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers/count'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/partners'] });
      queryClient.invalidateQueries({ queryKey: ['/api/odoo/sync-status'] });
      setImportResult({
        imported: data.imported,
        skipped: data.skipped,
        alreadyExists: data.alreadyExists || 0,
        deleted: data.deleted || 0,
        failed: data.failed,
        errors: data.errors || [],
        skippedPartners: data.skippedPartners || [],
        deletedCustomers: data.deletedCustomers || [],
        mode: data.mode || 'add_new',
        skipDetails: data.skipDetails,
      });
      const modeText = data.mode === 'full_reset' ? 'Full import' : data.mode === 'sync_with_deletions' ? 'Full sync' : 'Incremental import';
      const deletedText = data.deleted > 0 ? `, Deleted: ${data.deleted}` : '';
      toast({ 
        title: `${modeText} complete`,
        description: `New: ${data.imported}, Already existed: ${data.alreadyExists || 0}, Skipped: ${data.skipped}${deletedText}, Failed: ${data.failed}`
      });
    },
    onError: (error: any) => {
      stopImportProgress(false);
      toast({ title: "Import failed", description: error.message, variant: "destructive" });
    },
  });

  const [leadSyncResult, setLeadSyncResult] = useState<{
    imported: number;
    updated: number;
    deleted: number;
    skippedExistingCustomer: number;
  } | null>(null);

  const syncLeadsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/leads/import-from-odoo');
      if (!res.ok) { const err = await res.json().catch(() => ({})); throw new Error(err.error || 'Failed'); }
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads/stats'] });
      setLeadSyncResult({
        imported: data.imported,
        updated: data.updated,
        deleted: data.deleted,
        skippedExistingCustomer: data.skippedExistingCustomer,
      });
      const parts = [`${data.imported} new leads imported`, `${data.updated} updated`];
      if (data.deleted > 0) parts.push(`${data.deleted} removed (deleted in Odoo)`);
      if (data.skippedExistingCustomer > 0) parts.push(`${data.skippedExistingCustomer} skipped (already in Contacts)`);
      toast({ title: 'CRM Leads sync complete', description: parts.join(', ') });
    },
    onError: (error: any) => {
      toast({ title: 'Lead sync failed', description: error.message, variant: 'destructive' });
    },
  });

  const [salesRepSyncResult, setSalesRepSyncResult] = useState<{
    updated: number;
    alreadySet: number;
    skipped: number;
    totalProcessed: number;
  } | null>(null);

  const syncSalesRepsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/odoo/sync-sales-reps');
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setSalesRepSyncResult({
        updated: data.updated,
        alreadySet: data.alreadySet,
        skipped: data.skipped,
        totalProcessed: data.totalProcessed,
      });
      toast({ 
        title: "Sales rep sync complete",
        description: `Updated ${data.updated} customers, ${data.alreadySet} already had reps, ${data.skipped} skipped (no rep in Odoo)`
      });
    },
    onError: (error: any) => {
      toast({ title: "Sync failed", description: error.message, variant: "destructive" });
    },
  });

  const [vendorRemovalResult, setVendorRemovalResult] = useState<{
    removed: number;
    vendorNames: string[];
    totalFound: number;
  } | null>(null);

  const removeVendorsMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/odoo/remove-vendors');
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      setVendorRemovalResult({
        removed: data.removed,
        vendorNames: data.vendorNames || [],
        totalFound: data.totalFound || 0,
      });
      toast({ 
        title: "Vendor removal complete",
        description: `Removed ${data.removed} vendor contacts from the database`
      });
    },
    onError: (error: any) => {
      toast({ title: "Removal failed", description: error.message, variant: "destructive" });
    },
  });

  const [showImportConfirm, setShowImportConfirm] = useState(false);
  const [showFullResetConfirm, setShowFullResetConfirm] = useState(false);
  const [showSyncWithDeletionsConfirm, setShowSyncWithDeletionsConfirm] = useState(false);
  const [importResult, setImportResult] = useState<{
    imported: number;
    skipped: number;
    alreadyExists: number;
    deleted: number;
    failed: number;
    errors: string[];
    skippedPartners?: string[];
    deletedCustomers?: string[];
    mode?: string;
    skipDetails?: {
      noEmail: string[];
      vendor: string[];
      accountTeam: string[];
      blocked: string[];
      excluded: string[];
    };
  } | null>(null);
  const [showSkipReport, setShowSkipReport] = useState(false);


  // Import Products state
  const [importProductSearch, setImportProductSearch] = useState("");
  const [selectedImportProducts, setSelectedImportProducts] = useState<Set<number>>(new Set());
  const [recentlyImportedIds, setRecentlyImportedIds] = useState<Set<number>>(new Set()); // Track imported products to hide immediately
  
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
    // All pricing tiers ($/m²) - can be left at 0 and updated in Product Pricing Management
    landedPrice: '',
    exportPrice: '',
    masterDistributorPrice: '',
    dealerPrice: '',
    dealer2Price: '',
    tierStage25Price: '',
    tierStage2Price: '',
    tierStage15Price: '',
    tierStage1Price: '',
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
      // All pricing tiers start empty - user can update later in Product Pricing Management
      landedPrice: '',
      exportPrice: '',
      masterDistributorPrice: '',
      dealerPrice: '',
      dealer2Price: '',
      tierStage25Price: '',
      tierStage2Price: '',
      tierStage15Price: '',
      tierStage1Price: '',
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
      // All pricing tiers
      landedPrice: wizardData.landedPrice ? parseFloat(wizardData.landedPrice) : null,
      exportPrice: wizardData.exportPrice ? parseFloat(wizardData.exportPrice) : null,
      masterDistributorPrice: wizardData.masterDistributorPrice ? parseFloat(wizardData.masterDistributorPrice) : null,
      dealerPrice: wizardData.dealerPrice ? parseFloat(wizardData.dealerPrice) : null,
      dealer2Price: wizardData.dealer2Price ? parseFloat(wizardData.dealer2Price) : null,
      tierStage25Price: wizardData.tierStage25Price ? parseFloat(wizardData.tierStage25Price) : null,
      tierStage2Price: wizardData.tierStage2Price ? parseFloat(wizardData.tierStage2Price) : null,
      tierStage15Price: wizardData.tierStage15Price ? parseFloat(wizardData.tierStage15Price) : null,
      tierStage1Price: wizardData.tierStage1Price ? parseFloat(wizardData.tierStage1Price) : null,
      retailPrice: wizardData.retailPrice ? parseFloat(wizardData.retailPrice) : null,
    };
    
    // Add to recently imported to hide immediately from list
    if (wizardProduct?.id) {
      setRecentlyImportedIds(prev => new Set([...prev, wizardProduct.id]));
    }
    importProductsMutation.mutate([enrichedProduct]);
    setWizardOpen(false);
    setWizardProduct(null);
  };

  // Query for missing Odoo products (not in local app)
  // Note: Search filtering is done client-side to avoid losing data when typing
  const { data: missingProductsData, isLoading: missingProductsLoading, error: missingProductsError, refetch: refetchMissingProducts } = useQuery<{
    success: boolean;
    totalOdooProducts: number;
    totalLocalProducts: number;
    missingCount: number;
    missingProducts: any[];
  }>({
    queryKey: ['/api/odoo/missing-products'],
    queryFn: async () => {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
      
      try {
        const res = await fetch('/api/odoo/missing-products', { signal: controller.signal });
        clearTimeout(timeoutId);
        
        if (!res.ok) {
          const errorData = await res.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to load (${res.status})`);
        }
        return res.json();
      } catch (err: any) {
        clearTimeout(timeoutId);
        if (err.name === 'AbortError') {
          throw new Error('Request timed out. Please check your Odoo connection.');
        }
        throw err;
      }
    },
    enabled: false, // Only fetch when button is clicked
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: false, // Don't retry on failure
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
      setRecentlyImportedIds(new Set()); // Clear after server data refreshes
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


  // Query for price sync queue
  const { data: priceSyncQueue = [], isLoading: queueLoading, refetch: refetchQueue } = useQuery<OdooPriceSyncQueue[]>({
    queryKey: ['/api/odoo/price-sync-queue'],
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

      {/* Weekly Sync Reminder Banner */}
      <div className="bg-amber-50 dark:bg-amber-950 border border-amber-200 dark:border-amber-800 rounded-lg p-4 flex items-center gap-3">
        <Clock className="h-5 w-5 text-amber-600 flex-shrink-0" />
        <div>
          <p className="font-medium text-amber-800 dark:text-amber-200">
            Reminder: Sync with Odoo Weekly
          </p>
          <p className="text-sm text-amber-700 dark:text-amber-300">
            To keep customer data current, import partners from Odoo at least once a week. This ensures addresses, contacts, and other information stay up-to-date with Odoo.
          </p>
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
                {syncStatus?.hasPreviousSync 
                  ? "Import new customers from Odoo. Previously synced customers will be skipped."
                  : "Import all partners from Odoo into your local CRM as customers."}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-6">
                {/* Show sync status summary */}
                {syncStatus?.hasPreviousSync && (
                  <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                      <span className="font-semibold text-blue-800 dark:text-blue-200">Previous Import Found</span>
                    </div>
                    <p className="text-sm text-blue-700 dark:text-blue-300">
                      {syncStatus.syncedCustomerCount} customers already synced from Odoo. 
                      Only new customers will be added.
                      {syncStatus.lastSyncAt && (
                        <span className="block mt-1 text-blue-600">
                          Last sync: {format(new Date(syncStatus.lastSyncAt), 'PPP')}
                        </span>
                      )}
                    </p>
                  </div>
                )}

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
                          onClick={() => setShowImportConfirm(true)}
                          data-testid="btn-start-import"
                        >
                          <Download className="h-4 w-4 mr-2" />
                          {syncStatus?.hasPreviousSync ? "Import New Customers" : "Import All from Odoo"}
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
                            onClick={() => {
                              importFromOdooMutation.mutate({ importMode: 'add_new' });
                              setShowImportConfirm(false);
                            }}
                            disabled={importFromOdooMutation.isPending}
                            data-testid="btn-confirm-import"
                          >
                            {importFromOdooMutation.isPending && (
                              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                            )}
                            {syncStatus?.hasPreviousSync ? "Yes, Import New Customers" : "Yes, Import All"}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Import Progress Bar */}
                    {importFromOdooMutation.isPending && (
                      <div className="space-y-2 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                        <div className="flex items-center justify-between text-sm">
                          <span className="font-medium text-blue-700 dark:text-blue-300 flex items-center gap-2">
                            <RefreshCw className="h-4 w-4 animate-spin" />
                            {importStage || "Importing..."}
                          </span>
                          <span className="text-blue-600 dark:text-blue-400">{importProgress}%</span>
                        </div>
                        <Progress value={importProgress} className="h-2" />
                        <p className="text-xs text-blue-600 dark:text-blue-400">
                          Importing {odooPartners.length} partners from Odoo. This may take a few minutes...
                        </p>
                      </div>
                    )}

                    {/* Full Sync with Deletions Option (Recommended for updates) */}
                    {syncStatus?.hasPreviousSync && (
                      <div className="border border-blue-200 dark:border-blue-800 rounded-lg p-3 bg-blue-50 dark:bg-blue-900/20">
                        <div className="flex items-center justify-between">
                          <div>
                            <div className="font-medium text-blue-800 dark:text-blue-200">Full Sync (Recommended)</div>
                            <p className="text-sm text-blue-700 dark:text-blue-300">
                              Import new partners AND remove customers deleted from Odoo
                            </p>
                          </div>
                          {!showSyncWithDeletionsConfirm ? (
                            <Button 
                              variant="outline"
                              className="border-blue-300 text-blue-700 hover:bg-blue-100"
                              onClick={() => setShowSyncWithDeletionsConfirm(true)}
                            >
                              <RefreshCw className="h-4 w-4 mr-2" />
                              Full Sync
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => setShowSyncWithDeletionsConfirm(false)}
                              >
                                Cancel
                              </Button>
                              <Button 
                                size="sm"
                                onClick={() => {
                                  importFromOdooMutation.mutate({ importMode: 'sync_with_deletions' });
                                  setShowSyncWithDeletionsConfirm(false);
                                }}
                                disabled={importFromOdooMutation.isPending}
                              >
                                {importFromOdooMutation.isPending && (
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Yes, Sync Now
                              </Button>
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Advanced: Full Reset Option (hidden by default for incremental users) */}
                    {syncStatus?.hasPreviousSync && (
                      <details className="border rounded-lg p-3">
                        <summary className="cursor-pointer text-sm text-muted-foreground hover:text-foreground">
                          Advanced: Full Reset (Replace All Customers)
                        </summary>
                        <div className="mt-3 space-y-3">
                          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
                            <p className="text-sm text-amber-700 dark:text-amber-300">
                              This will delete ALL existing customers and re-import everything from Odoo. 
                              Any local edits (notes, pricing tiers, etc.) will be lost.
                            </p>
                          </div>
                          {!showFullResetConfirm ? (
                            <Button 
                              variant="destructive"
                              size="sm"
                              onClick={() => setShowFullResetConfirm(true)}
                            >
                              Replace Everything
                            </Button>
                          ) : (
                            <div className="flex items-center gap-2">
                              <Button 
                                variant="outline"
                                size="sm"
                                onClick={() => setShowFullResetConfirm(false)}
                              >
                                Cancel
                              </Button>
                              <Button 
                                variant="destructive"
                                size="sm"
                                onClick={() => {
                                  importFromOdooMutation.mutate({ importMode: 'full_reset' });
                                  setShowFullResetConfirm(false);
                                }}
                                disabled={importFromOdooMutation.isPending}
                              >
                                {importFromOdooMutation.isPending && (
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                )}
                                Yes, Delete All & Re-Import
                              </Button>
                            </div>
                          )}
                        </div>
                      </details>
                    )}

                    {importResult && (
                      <div className="space-y-3">
                        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="font-semibold text-green-800 dark:text-green-200">
                            {importResult.mode === 'full_reset' ? 'Full Import Completed' : importResult.mode === 'sync_with_deletions' ? 'Full Sync Completed' : 'Incremental Import Completed'}
                          </div>
                          <div className={`text-sm text-green-700 dark:text-green-300 mt-2 grid gap-4 ${importResult.deleted > 0 ? 'grid-cols-5' : 'grid-cols-4'}`}>
                            <div className="text-center p-2 bg-green-100 rounded">
                              <div className="text-2xl font-bold text-green-700">{importResult.imported}</div>
                              <div className="text-xs">New</div>
                            </div>
                            <div className="text-center p-2 bg-blue-100 rounded">
                              <div className="text-2xl font-bold text-blue-700">{importResult.alreadyExists}</div>
                              <div className="text-xs">Existed</div>
                            </div>
                            <div className="text-center p-2 bg-yellow-100 rounded">
                              <div className="text-2xl font-bold text-yellow-700">{importResult.skipped}</div>
                              <div className="text-xs">Skipped</div>
                            </div>
                            {importResult.deleted > 0 && (
                              <div className="text-center p-2 bg-orange-100 rounded">
                                <div className="text-2xl font-bold text-orange-700">{importResult.deleted}</div>
                                <div className="text-xs">Removed</div>
                              </div>
                            )}
                            <div className="text-center p-2 bg-red-100 rounded">
                              <div className="text-2xl font-bold text-red-700">{importResult.failed}</div>
                              <div className="text-xs">Failed</div>
                            </div>
                          </div>
                        </div>
                        
                        {/* Deleted Customers List */}
                        {(importResult.deletedCustomers && importResult.deletedCustomers.length > 0) && (
                          <div className="bg-orange-50 border border-orange-200 rounded-lg p-4">
                            <div className="font-semibold text-orange-800 mb-2">
                              Removed Customers (Deleted from Odoo)
                            </div>
                            <div className="text-sm text-orange-700 max-h-32 overflow-y-auto">
                              {importResult.deletedCustomers.map((c, i) => (
                                <div key={i} className="py-1 border-b border-orange-100 last:border-0">{c}</div>
                              ))}
                            </div>
                          </div>
                        )}
                        
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

                        {/* Skip report link */}
                        {importResult.skipDetails && (
                          (importResult.skipDetails.noEmail.length > 0 || importResult.skipDetails.vendor.length > 0 || importResult.skipDetails.accountTeam.length > 0 || importResult.skipDetails.blocked.length > 0 || importResult.skipDetails.excluded.length > 0)
                        ) && (
                          <div className="text-center">
                            <button
                              onClick={() => setShowSkipReport(true)}
                              className="text-sm text-amber-700 underline hover:text-amber-900"
                            >
                              {importResult.skipped} contacts skipped — View Details
                            </button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* CRM Leads Sync Section */}
                    <div className="border-t pt-6 mt-6">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                            <Target className="h-4 w-4 text-purple-500" />
                            Sync CRM Leads
                          </div>
                          <p className="text-sm text-muted-foreground mt-0.5">
                            Import leads from the Odoo CRM pipeline. New leads are added, leads deleted in Odoo are removed here.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => syncLeadsMutation.mutate()}
                          disabled={syncLeadsMutation.isPending}
                          className="border-purple-200 text-purple-700 hover:bg-purple-50 gap-2 flex-shrink-0"
                        >
                          {syncLeadsMutation.isPending
                            ? <RefreshCw className="h-4 w-4 animate-spin" />
                            : <RefreshCw className="h-4 w-4" />
                          }
                          {syncLeadsMutation.isPending ? 'Syncing Leads...' : 'Sync Leads Now'}
                        </Button>
                      </div>

                      {leadSyncResult && (
                        <div className="bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 rounded-lg p-3 mt-3">
                          <div className="font-medium text-purple-800 dark:text-purple-200 text-sm mb-2">CRM Lead Sync Complete</div>
                          <div className="grid grid-cols-4 gap-2 text-center">
                            <div className="p-2 bg-green-100 rounded">
                              <div className="text-xl font-bold text-green-700">{leadSyncResult.imported}</div>
                              <div className="text-xs text-green-600">New</div>
                            </div>
                            <div className="p-2 bg-blue-100 rounded">
                              <div className="text-xl font-bold text-blue-700">{leadSyncResult.updated}</div>
                              <div className="text-xs text-blue-600">Updated</div>
                            </div>
                            <div className="p-2 bg-orange-100 rounded">
                              <div className="text-xl font-bold text-orange-700">{leadSyncResult.deleted}</div>
                              <div className="text-xs text-orange-600">Removed</div>
                            </div>
                            <div className="p-2 bg-slate-100 rounded">
                              <div className="text-xl font-bold text-slate-700">{leadSyncResult.skippedExistingCustomer}</div>
                              <div className="text-xs text-slate-600">Skipped</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Sales Rep Sync Section */}
                    <div className="border-t pt-6 mt-6">
                      <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                        <Users className="h-5 w-5" />
                        Sync Sales Reps from Odoo
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Update customers with their assigned sales person from Odoo. This will assign sales reps to customers who currently don't have one.
                      </p>
                      
                      <Button
                        onClick={() => syncSalesRepsMutation.mutate()}
                        disabled={syncSalesRepsMutation.isPending}
                        className="bg-[#875A7B] hover:bg-[#714b67] text-white"
                      >
                        {syncSalesRepsMutation.isPending && (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        <Users className="h-4 w-4 mr-2" />
                        Sync Sales Reps Now
                      </Button>

                      {salesRepSyncResult && (
                        <div className="mt-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                          <div className="font-semibold text-green-800 dark:text-green-200">
                            Sales Rep Sync Complete
                          </div>
                          <div className="text-sm text-green-700 dark:text-green-300 mt-2 grid grid-cols-4 gap-4">
                            <div className="text-center p-2 bg-green-100 rounded">
                              <div className="text-2xl font-bold text-green-700">{salesRepSyncResult.updated}</div>
                              <div className="text-xs">Updated</div>
                            </div>
                            <div className="text-center p-2 bg-blue-100 rounded">
                              <div className="text-2xl font-bold text-blue-700">{salesRepSyncResult.alreadySet}</div>
                              <div className="text-xs">Already Set</div>
                            </div>
                            <div className="text-center p-2 bg-yellow-100 rounded">
                              <div className="text-2xl font-bold text-yellow-700">{salesRepSyncResult.skipped}</div>
                              <div className="text-xs">Skipped</div>
                            </div>
                            <div className="text-center p-2 bg-gray-100 rounded">
                              <div className="text-2xl font-bold text-gray-700">{salesRepSyncResult.totalProcessed}</div>
                              <div className="text-xs">Total</div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Vendor Removal Section */}
                    <div className="border-t pt-6 mt-6">
                      <h4 className="font-semibold text-base mb-2 flex items-center gap-2">
                        <Trash2 className="h-5 w-5 text-red-500" />
                        Remove Vendor Contacts
                      </h4>
                      <p className="text-sm text-muted-foreground mb-4">
                        Remove contacts that have the "Vendor" tag in Odoo. These are suppliers, not customers. Future imports will also skip Vendor-tagged contacts.
                      </p>
                      
                      <Button
                        onClick={() => removeVendorsMutation.mutate()}
                        disabled={removeVendorsMutation.isPending}
                        variant="destructive"
                      >
                        {removeVendorsMutation.isPending && (
                          <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        )}
                        <Trash2 className="h-4 w-4 mr-2" />
                        Remove Vendor Contacts
                      </Button>

                      {vendorRemovalResult && (
                        <div className="mt-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
                          <div className="font-semibold text-red-800 dark:text-red-200">
                            Vendor Removal Complete
                          </div>
                          <div className="text-sm text-red-700 dark:text-red-300 mt-2">
                            <div className="text-2xl font-bold">{vendorRemovalResult.removed} vendors removed</div>
                            {vendorRemovalResult.vendorNames.length > 0 && (
                              <div className="mt-2 max-h-32 overflow-y-auto">
                                <div className="font-medium mb-1">Removed contacts:</div>
                                {vendorRemovalResult.vendorNames.map((name, i) => (
                                  <div key={i} className="py-0.5 text-xs">{name}</div>
                                ))}
                                {vendorRemovalResult.totalFound > 50 && (
                                  <div className="text-xs italic mt-1">...and {vendorRemovalResult.totalFound - 50} more</div>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
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
                {missingProductsError ? (
                  <div className="text-center py-12">
                    <Package className="h-12 w-12 mx-auto mb-4 text-red-400" />
                    <p className="text-red-600 font-medium mb-2">Failed to load Odoo products</p>
                    <p className="text-sm text-muted-foreground mb-4">{(missingProductsError as any)?.message || 'Unknown error'}</p>
                    <Button variant="outline" onClick={() => refetchMissingProducts()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Try Again
                    </Button>
                  </div>
                ) : !missingProductsData ? (
                  <div className="text-center py-12 text-muted-foreground">
                    <Package className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>Click "Load Missing Products" to find Odoo products not in your local app</p>
                  </div>
                ) : (
                  <>
                    {/* Stats */}
                    <div className="grid grid-cols-3 gap-4">
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold">
                          {missingProductsData.totalLocalProducts + recentlyImportedIds.size}
                        </div>
                        <div className="text-xs text-muted-foreground">Local Products</div>
                      </div>
                      <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold">{missingProductsData.totalOdooProducts}</div>
                        <div className="text-xs text-muted-foreground">Odoo Products</div>
                      </div>
                      <div className="bg-yellow-50 dark:bg-yellow-900 rounded-lg p-3 text-center">
                        <div className="text-xl font-bold text-yellow-600">
                          {missingProductsData.missingCount - recentlyImportedIds.size}
                        </div>
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
                              // Hide recently imported products immediately
                              if (recentlyImportedIds.has(p.id)) return false;
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


      {/* Guided Product Creation Wizard */}
      <Dialog open={wizardOpen} onOpenChange={setWizardOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] flex flex-col">
          <DialogHeader className="flex-shrink-0">
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Product from Odoo
            </DialogTitle>
            <DialogDescription>
              Configure how this Odoo product should be set up in QuickQuotes
            </DialogDescription>
          </DialogHeader>

          {wizardProduct && (
            <div className="space-y-4 overflow-y-auto flex-1 pr-2">
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
                <label className="text-sm font-medium">Size (Width x Height in inches)</label>
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
                  className={wizardData.size === 'Standard' ? 'border-orange-400' : ''}
                />
                {wizardData.size === 'Standard' && (
                  <div className="p-2 bg-orange-50 border border-orange-200 rounded text-xs text-orange-700">
                    <strong>Warning:</strong> Size not detected. Enter dimensions (e.g., "13 x 19") to calculate correct pricing.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">Format: Width x Height (e.g., 13 x 19 for sheets, 36 x 100' for rolls)</p>
              </div>

              {/* Step 4: Sq. Meters (Prefilled) */}
              <div className="space-y-2">
                <label className="text-sm font-medium">Total Sq. Meters (m²)</label>
                <Input
                  value={wizardData.totalSqm}
                  onChange={(e) => setWizardData({ ...wizardData, totalSqm: e.target.value })}
                  placeholder="0.000000"
                  data-testid="input-wizard-sqm"
                  className={parseFloat(wizardData.totalSqm || '0') === 0 ? 'border-red-400' : ''}
                />
                {parseFloat(wizardData.totalSqm || '0') === 0 && (
                  <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                    <strong>Required:</strong> Total sq. meters must be greater than 0 for pricing to work correctly.
                  </div>
                )}
                <p className="text-xs text-muted-foreground">This is the area per unit used to calculate sheet/roll price</p>
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

              {/* Step 8: Pricing (per square meter) - All Tiers */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-sm font-medium">Pricing per Square Meter ($/m²)</label>
                  <span className="text-xs text-muted-foreground">Optional - can be set later in Product Pricing Management</span>
                </div>
                
                {/* Pricing Tiers Grid */}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'landedPrice', label: 'Landed' },
                    { key: 'exportPrice', label: 'Export' },
                    { key: 'masterDistributorPrice', label: 'Master Dist.' },
                    { key: 'dealerPrice', label: 'Dealer' },
                    { key: 'dealer2Price', label: 'Dealer 2' },
                    { key: 'tierStage25Price', label: 'Stage 2.5' },
                    { key: 'tierStage2Price', label: 'Stage 2' },
                    { key: 'tierStage15Price', label: 'Stage 1.5' },
                    { key: 'tierStage1Price', label: 'Stage 1' },
                    { key: 'retailPrice', label: 'Retail' },
                  ].map(tier => (
                    <div key={tier.key} className="flex items-center gap-2">
                      <label className="text-muted-foreground w-20 text-right">{tier.label}</label>
                      <Input
                        type="number"
                        step="0.01"
                        min="0"
                        value={(wizardData as any)[tier.key] || ''}
                        onChange={(e) => setWizardData({ ...wizardData, [tier.key]: e.target.value })}
                        placeholder="0.00"
                        className="h-7 text-xs"
                        data-testid={`input-${tier.key}`}
                      />
                    </div>
                  ))}
                </div>
                
                <p className="text-xs text-muted-foreground bg-gray-50 p-2 rounded">
                  All prices are optional. You can leave them at 0 and update later in the <strong>Product Pricing Management</strong> section.
                </p>
              </div>
            </div>
          )}

          <DialogFooter className="gap-2 flex-shrink-0 border-t pt-4 mt-4">
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

      {/* Skip Report Dialog */}
      <Dialog open={showSkipReport} onOpenChange={setShowSkipReport}>
        <DialogContent className="max-w-2xl max-h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>Contacts Skipped During Import</DialogTitle>
            <DialogDescription>
              These contacts were not imported. Review each group and take action where needed.
            </DialogDescription>
          </DialogHeader>
          <div className="overflow-y-auto flex-1 space-y-4 pr-1">
            {importResult?.skipDetails?.noEmail && importResult.skipDetails.noEmail.length > 0 && (
              <div className="border border-amber-200 rounded-lg p-4 bg-amber-50">
                <div className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-amber-200 text-amber-900 text-xs font-bold">{importResult.skipDetails.noEmail.length}</span>
                  No Email (person contacts only)
                </div>
                <div className="text-sm text-amber-700 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.skipDetails.noEmail.map((name, i) => (
                    <div key={i} className="py-0.5 border-b border-amber-100 last:border-0">{name}</div>
                  ))}
                </div>
              </div>
            )}
            {importResult?.skipDetails?.vendor && importResult.skipDetails.vendor.length > 0 && (
              <div className="border border-slate-200 rounded-lg p-4 bg-slate-50">
                <div className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-slate-200 text-slate-900 text-xs font-bold">{importResult.skipDetails.vendor.length}</span>
                  Vendor Tag (shipping/logistics contacts)
                </div>
                <div className="text-sm text-slate-600 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.skipDetails.vendor.map((name, i) => (
                    <div key={i} className="py-0.5 border-b border-slate-100 last:border-0">{name}</div>
                  ))}
                </div>
              </div>
            )}
            {importResult?.skipDetails?.accountTeam && importResult.skipDetails.accountTeam.length > 0 && (
              <div className="border border-blue-200 rounded-lg p-4 bg-blue-50">
                <div className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-blue-200 text-blue-900 text-xs font-bold">{importResult.skipDetails.accountTeam.length}</span>
                  Account Team (internal staff)
                </div>
                <div className="text-sm text-blue-700 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.skipDetails.accountTeam.map((name, i) => (
                    <div key={i} className="py-0.5 border-b border-blue-100 last:border-0">{name}</div>
                  ))}
                </div>
              </div>
            )}
            {importResult?.skipDetails?.blocked && importResult.skipDetails.blocked.length > 0 && (
              <div className="border border-orange-200 rounded-lg p-4 bg-orange-50">
                <div className="font-semibold text-orange-800 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-orange-200 text-orange-900 text-xs font-bold">{importResult.skipDetails.blocked.length}</span>
                  Blocked Keywords (freight/cargo companies)
                </div>
                <div className="text-sm text-orange-700 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.skipDetails.blocked.map((name, i) => (
                    <div key={i} className="py-0.5 border-b border-orange-100 last:border-0">{name}</div>
                  ))}
                </div>
              </div>
            )}
            {importResult?.skipDetails?.excluded && importResult.skipDetails.excluded.length > 0 && (
              <div className="border border-red-200 rounded-lg p-4 bg-red-50">
                <div className="font-semibold text-red-800 mb-2 flex items-center gap-2">
                  <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-200 text-red-900 text-xs font-bold">{importResult.skipDetails.excluded.length}</span>
                  Previously Deleted (on exclusion list)
                </div>
                <div className="text-sm text-red-700 space-y-1 max-h-40 overflow-y-auto">
                  {importResult.skipDetails.excluded.map((name, i) => (
                    <div key={i} className="py-0.5 border-b border-red-100 last:border-0">{name}</div>
                  ))}
                </div>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipReport(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

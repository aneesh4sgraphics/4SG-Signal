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

  // Query for all Odoo products (for mapping selection)
  const { data: allOdooProducts = [], isLoading: allOdooProductsLoading } = useQuery<any[]>({
    queryKey: ['/api/odoo/all-products', odooProductSearch],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (odooProductSearch) params.set('search', odooProductSearch);
      params.set('limit', '200');
      const res = await fetch(`/api/odoo/all-products?${params.toString()}`);
      return res.json();
    },
    enabled: !!selectedProduct,
  });

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
                <Input
                  placeholder="Type to search Odoo products..."
                  value={odooProductSearch}
                  onChange={(e) => setOdooProductSearch(e.target.value)}
                  data-testid="input-odoo-product-search"
                />
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
    </div>
  );
}

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
  Eye
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { format } from "date-fns";

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
      </Tabs>
    </div>
  );
}

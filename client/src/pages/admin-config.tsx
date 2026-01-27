import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { ArrowLeft, Plus, Pencil, Trash2, Save, Settings, Layers, Clock, Bell, MessageSquare, History, RefreshCw, Database, AlertCircle, CheckCircle, CheckCircle2, Printer, Zap, Sparkles, Droplet, Maximize, Info, AlertTriangle, Check, Home, User, PlayCircle, GripVertical, ChevronRight, RotateCcw, Eye, Package, X, Search, Tag, MapPin } from "lucide-react";
import { PRICING_TIERS } from "@shared/schema";
import { Link } from "wouter";

type AdminMachineType = {
  id: number;
  code: string;
  label: string;
  icon: string | null;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

type AdminCategoryGroup = {
  id: number;
  code: string;
  label: string;
  color: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

type AdminCategory = {
  id: number;
  code: string;
  label: string;
  groupId: number | null;
  compatibleMachineTypes: string[] | null;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

type AdminSkuMapping = {
  id: number;
  ruleType: string;
  pattern: string;
  categoryId: number | null;
  categoryCode: string | null;
  priority: number | null;
  description: string | null;
  isActive: boolean | null;
};

type AdminCoachingTimer = {
  id: number;
  timerKey: string;
  label: string;
  category: string;
  valueDays: number;
  description: string | null;
  isActive: boolean | null;
};

type AdminNudgeSetting = {
  id: number;
  nudgeKey: string;
  label: string;
  priority: number;
  severity: string;
  isEnabled: boolean | null;
  description: string | null;
};

type AdminConversationScript = {
  id: number;
  scriptKey: string;
  title: string;
  stage: string;
  persona: string;
  situation: string | null;
  scriptContent: string;
  talkingPoints: string[] | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

type AdminAuditLog = {
  id: number;
  configType: string;
  action: string;
  entityId: string | null;
  entityName: string | null;
  beforeData: any;
  afterData: any;
  userId: string;
  userEmail: string | null;
  createdAt: string;
};

// Product Catalog Tab - Shows categories synced from pricing database
type CatalogProductType = {
  id: number;
  categoryId: number | null;
  code: string;
  label: string;
  subfamily: string | null;
  description: string | null;
  sortOrder: number | null;
  isActive: boolean | null;
};

type CatalogCategory = {
  id: number;
  code: string;
  label: string;
  productTypes: CatalogProductType[];
};

type CatalogImportLog = {
  id: number;
  fileName: string;
  importedBy: string | null;
  importedByEmail: string | null;
  categoriesCreated: number | null;
  categoriesUpdated: number | null;
  productTypesCreated: number | null;
  productTypesUpdated: number | null;
  variantsCreated: number | null;
  variantsUpdated: number | null;
  errors: any;
  status: string;
  completedAt: string | null;
  createdAt: string;
};

function ProductCatalogTab({ categories }: { categories: AdminCategory[] }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [expandedCategories, setExpandedCategories] = useState<Set<number>>(new Set());

  const { data: catalogCategories = [], isLoading: catalogLoading, refetch: refetchCatalog } = useQuery<CatalogCategory[]>({
    queryKey: ["/api/pricing-database/catalog-categories"],
  });

  const { data: importLogs = [], isLoading: logsLoading } = useQuery<CatalogImportLog[]>({
    queryKey: ["/api/pricing-database/catalog-import-logs"],
  });

  const syncCatalogMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/pricing-database/sync-catalog-from-pricing");
      return response;
    },
    onSuccess: (data: any) => {
      toast({
        title: "Catalog Synced",
        description: `Created ${data.stats?.categoriesCreated || 0} categories, ${data.stats?.productTypesCreated || 0} product types. Linked ${data.stats?.variantsLinked || 0} pricing variants.`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-database/catalog-categories"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pricing-database/catalog-import-logs"] });
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/categories"] });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync catalog from pricing database",
        variant: "destructive",
      });
    },
  });

  const toggleCategory = (categoryId: number) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  const totalProductTypes = catalogCategories.reduce((sum, cat) => sum + (cat.productTypes?.length || 0), 0);
  const lastSync = importLogs[0];

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Package className="h-5 w-5" />
                Product Catalog
              </CardTitle>
              <CardDescription>
                Categories and product types derived from your pricing database (CSV)
              </CardDescription>
            </div>
            <Button 
              onClick={() => syncCatalogMutation.mutate()} 
              disabled={syncCatalogMutation.isPending}
              data-testid="sync-catalog-button"
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${syncCatalogMutation.isPending ? 'animate-spin' : ''}`} />
              {syncCatalogMutation.isPending ? "Syncing..." : "Sync from Pricing DB"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-blue-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-blue-700">{catalogCategories.length}</div>
              <div className="text-sm text-blue-600">Categories</div>
            </div>
            <div className="bg-purple-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-purple-700">{totalProductTypes}</div>
              <div className="text-sm text-purple-600">Product Types</div>
            </div>
            <div className="bg-green-50 p-4 rounded-lg text-center">
              <div className="text-2xl font-bold text-green-700">
                {lastSync ? (
                  <span className="flex items-center justify-center gap-1">
                    <CheckCircle className="h-5 w-5" />
                    Synced
                  </span>
                ) : (
                  <span className="text-gray-500">Never</span>
                )}
              </div>
              <div className="text-sm text-green-600">
                {lastSync ? new Date(lastSync.createdAt).toLocaleDateString() : "Not synced yet"}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Category Browser */}
      <Card>
        <CardHeader>
          <CardTitle>Category Browser</CardTitle>
          <CardDescription>
            Click a category to expand and see its product types
          </CardDescription>
        </CardHeader>
        <CardContent>
          {catalogLoading ? (
            <div className="text-center py-8 text-gray-500">Loading catalog...</div>
          ) : catalogCategories.length === 0 ? (
            <div className="text-center py-8 border rounded-lg bg-gray-50">
              <Package className="h-12 w-12 mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 font-medium">No catalog data yet</p>
              <p className="text-sm text-gray-500 mt-1">
                Upload a pricing CSV, then click "Sync from Pricing DB" to populate the catalog
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {catalogCategories.map((category) => (
                <div key={category.id} className="border rounded-lg overflow-hidden">
                  <button
                    onClick={() => toggleCategory(category.id)}
                    className="w-full flex items-center justify-between p-3 bg-gray-50 hover:bg-gray-100 transition-colors text-left"
                    data-testid={`category-toggle-${category.id}`}
                  >
                    <div className="flex items-center gap-2">
                      <ChevronRight className={`h-4 w-4 transition-transform ${expandedCategories.has(category.id) ? 'rotate-90' : ''}`} />
                      <span className="font-medium">{category.label}</span>
                      <Badge variant="secondary" className="ml-2">
                        {category.productTypes?.length || 0} types
                      </Badge>
                    </div>
                    <code className="text-xs text-gray-500 bg-gray-200 px-2 py-1 rounded">
                      {category.code}
                    </code>
                  </button>
                  {expandedCategories.has(category.id) && category.productTypes && (
                    <div className="p-3 bg-white border-t">
                      {category.productTypes.length === 0 ? (
                        <p className="text-sm text-gray-500 italic">No product types</p>
                      ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                          {category.productTypes.map((pt) => (
                            <div 
                              key={pt.id} 
                              className="flex items-center gap-2 p-2 bg-gray-50 rounded text-sm"
                            >
                              <span className="flex-1">{pt.label}</span>
                              {pt.subfamily && (
                                <Badge variant="outline" className="text-xs">
                                  {pt.subfamily}
                                </Badge>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Import History */}
      <Card>
        <CardHeader>
          <CardTitle>Sync History</CardTitle>
          <CardDescription>Recent catalog sync operations</CardDescription>
        </CardHeader>
        <CardContent>
          {logsLoading ? (
            <div className="text-center py-4 text-gray-500">Loading...</div>
          ) : importLogs.length === 0 ? (
            <div className="text-center py-4 text-gray-500 border rounded-lg">
              No sync history yet
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Categories</TableHead>
                  <TableHead>Product Types</TableHead>
                  <TableHead>Variants Linked</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {importLogs.slice(0, 5).map((log) => (
                  <TableRow key={log.id}>
                    <TableCell className="text-sm">
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Badge variant={log.status === 'completed' ? 'default' : log.status === 'failed' ? 'destructive' : 'secondary'}>
                        {log.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      +{log.categoriesCreated || 0} / {log.categoriesUpdated || 0} existing
                    </TableCell>
                    <TableCell>
                      +{log.productTypesCreated || 0} / {log.productTypesUpdated || 0} existing
                    </TableCell>
                    <TableCell>
                      {log.variantsUpdated || 0}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">How the Catalog Works</p>
              <p className="text-sm text-blue-700 mt-1">
                The catalog is derived from your pricing CSV file. Each unique <code className="bg-blue-100 px-1 rounded">product_name</code> becomes a Category, 
                and each unique <code className="bg-blue-100 px-1 rounded">ProductType</code> becomes a Product Type within that category.
                This links your pricing data to the CRM trust system for automatic category advancement.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

const ICON_MAP: Record<string, any> = {
  Printer: Printer,
  Zap: Zap,
  Sparkles: Sparkles,
  Droplet: Droplet,
  Layers: Layers,
  Maximize: Maximize,
};

interface MappingAuditData {
  summary: {
    totalPricingItems: number;
    totalUniqueItemCodes: number;
    totalSkuMappings: number;
    totalUnmappedShopifyItems: number;
    totalResolvedItems: number;
  };
  categories: Array<{
    id: number;
    code: string;
    label: string;
    itemCount: number;
    mappingRules: number;
  }>;
  unmappedItems: Array<{
    id: number;
    sku: string;
    productTitle: string;
    variantTitle: string;
    orderId: string;
    createdAt: string;
    suggestedMatches: Array<{
      itemCode: string;
      productName: string;
      similarity: number;
    }>;
  }>;
  mappingRules: Array<{
    id: number;
    ruleType: string;
    pattern: string;
    categoryId: number;
    categoryCode: string;
    categoryLabel: string;
    priority: number;
  }>;
}

interface TestSkuResult {
  sku: string;
  resolved: boolean;
  matchType: string;
  matchedPattern?: string;
  category: { id: number; code: string; label: string; groupId: number | null } | null;
  machineCompatibility: { code: string; label: string; icon?: string }[];
  pricingMatch: { itemCode: string; productName: string; productType: string; size: string; dealerPrice: string; retailPrice: string } | null;
}

interface PreviewImpactResult {
  pattern: string;
  ruleType: string;
  targetCategory: { id: number; code: string; label: string } | null;
  machineCompatibility: { code: string; label: string }[];
  stats: {
    matchingPricingItems: number;
    matchingUnmappedItems: number;
    customersWithTrustInCategory: number;
    totalTrustRecordsInCategory: number;
  };
  sampleMatches: {
    pricingItems: { itemCode: string; productName: string; productType: string }[];
    unmappedItems: { sku: string; productTitle: string }[];
  };
}

function TagsManagementTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  const { data: tagsData, isLoading } = useQuery<{ pricingTiers: string[]; customTags: { tag: string; usageCount: number }[] }>({
    queryKey: ['/api/admin/tags'],
  });

  const deleteTagMutation = useMutation({
    mutationFn: async (tag: string) => {
      return apiRequest('DELETE', `/api/admin/tags/${encodeURIComponent(tag)}`);
    },
    onSuccess: () => {
      toast({ title: 'Tag deleted successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    },
    onError: () => {
      toast({ title: 'Failed to delete tag', variant: 'destructive' });
    },
  });

  const renameTagMutation = useMutation({
    mutationFn: async ({ oldTag, newTag }: { oldTag: string; newTag: string }) => {
      return apiRequest('PATCH', `/api/admin/tags/${encodeURIComponent(oldTag)}`, { newTag });
    },
    onSuccess: () => {
      toast({ title: 'Tag renamed successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/tags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
    },
    onError: () => {
      toast({ title: 'Failed to rename tag', variant: 'destructive' });
    },
  });

  const [editingTag, setEditingTag] = useState<string | null>(null);
  const [newTagName, setNewTagName] = useState('');

  if (isLoading) return <div className="text-center py-8">Loading tags...</div>;

  const pricingTiers = tagsData?.pricingTiers || PRICING_TIERS;
  const customTags = tagsData?.customTags || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Tags Management</h2>
          <p className="text-sm text-muted-foreground">Manage pricing tiers and custom tags used across customers</p>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="outline" className="border-purple-300 text-purple-700">System</Badge>
            Pricing Tiers
          </CardTitle>
          <CardDescription>
            These pricing tiers are predefined and cannot be modified. They determine customer pricing levels.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2">
            {pricingTiers.map((tier) => (
              <Badge key={tier} variant="outline" className="border-purple-300 text-purple-700 bg-purple-50">
                {tier}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Badge variant="secondary">Custom</Badge>
            Custom Tags ({customTags.length})
          </CardTitle>
          <CardDescription>
            These tags are created by users and can be edited or deleted.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {customTags.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No custom tags found</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tag Name</TableHead>
                  <TableHead className="text-right">Usage Count</TableHead>
                  <TableHead className="w-32">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {customTags.map((item) => (
                  <TableRow key={item.tag}>
                    <TableCell>
                      {editingTag === item.tag ? (
                        <div className="flex items-center gap-2">
                          <Input
                            value={newTagName}
                            onChange={(e) => setNewTagName(e.target.value)}
                            className="h-8 w-48"
                            autoFocus
                          />
                          <Button
                            size="sm"
                            onClick={() => {
                              if (newTagName.trim() && newTagName !== item.tag) {
                                renameTagMutation.mutate({ oldTag: item.tag, newTag: newTagName.trim() });
                              }
                              setEditingTag(null);
                            }}
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => setEditingTag(null)}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Badge variant="secondary">{item.tag}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline">{item.usageCount} customers</Badge>
                    </TableCell>
                    <TableCell>
                      {editingTag !== item.tag && (
                        <div className="flex items-center gap-1">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingTag(item.tag);
                              setNewTagName(item.tag);
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-red-600 hover:text-red-700"
                            onClick={() => {
                              if (confirm(`Delete tag "${item.tag}"? This will remove it from ${item.usageCount} customers.`)) {
                                deleteTagMutation.mutate(item.tag);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function MappingAuditTab({ categories }: { categories: AdminCategory[] }) {
  const [createMappingOpen, setCreateMappingOpen] = useState(false);
  const [selectedUnmappedItem, setSelectedUnmappedItem] = useState<MappingAuditData['unmappedItems'][0] | null>(null);
  const [newMappingPattern, setNewMappingPattern] = useState('');
  const [newMappingCategoryId, setNewMappingCategoryId] = useState<number | null>(null);
  const [newMappingRuleType, setNewMappingRuleType] = useState<'exact' | 'prefix' | 'regex'>('exact');
  
  const [testSku, setTestSku] = useState('');
  const [testSkuResult, setTestSkuResult] = useState<TestSkuResult | null>(null);
  const [previewPattern, setPreviewPattern] = useState('');
  const [previewRuleType, setPreviewRuleType] = useState<'exact' | 'prefix' | 'regex'>('exact');
  const [previewCategoryId, setPreviewCategoryId] = useState<number | null>(null);
  const [previewResult, setPreviewResult] = useState<PreviewImpactResult | null>(null);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: auditData, isLoading, refetch } = useQuery<MappingAuditData>({
    queryKey: ['/api/pricing-database/mapping-audit'],
  });
  
  const testSkuMutation = useMutation({
    mutationFn: async (sku: string) => {
      const response = await apiRequest('/api/pricing-database/test-sku', {
        method: 'POST',
        body: JSON.stringify({ sku }),
        headers: { 'Content-Type': 'application/json' },
      });
      return response as TestSkuResult;
    },
    onSuccess: (data) => {
      setTestSkuResult(data);
    },
    onError: () => {
      toast({ title: 'Failed to test SKU', variant: 'destructive' });
    },
  });
  
  const previewImpactMutation = useMutation({
    mutationFn: async (data: { pattern: string; ruleType: string; newCategoryId: number | null }) => {
      const response = await apiRequest('/api/pricing-database/preview-impact', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return response as PreviewImpactResult;
    },
    onSuccess: (data) => {
      setPreviewResult(data);
    },
    onError: () => {
      toast({ title: 'Failed to preview impact', variant: 'destructive' });
    },
  });
  
  const seedCategoriesMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('/api/pricing-database/seed-categories-from-pricing', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      return response as { success: boolean; created: number; skipped: number; message: string };
    },
    onSuccess: (data) => {
      toast({ title: data.message });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/config/categories'] });
      refetch();
    },
    onError: () => {
      toast({ title: 'Failed to seed categories', variant: 'destructive' });
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: async (data: { pattern: string; ruleType: string; categoryId: number }) => {
      const response = await apiRequest('/api/pricing-database/mapping-audit/create-rule', {
        method: 'POST',
        body: JSON.stringify(data),
        headers: { 'Content-Type': 'application/json' },
      });
      return response;
    },
    onSuccess: () => {
      toast({ title: 'Mapping rule created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/pricing-database/mapping-audit'] });
      queryClient.invalidateQueries({ queryKey: ['/api/admin/sku-mappings'] });
      setCreateMappingOpen(false);
      setSelectedUnmappedItem(null);
      setNewMappingPattern('');
      setNewMappingCategoryId(null);
    },
    onError: () => {
      toast({ title: 'Failed to create mapping rule', variant: 'destructive' });
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading mapping audit data...</div>;

  const summary = auditData?.summary || {
    totalPricingItems: 0,
    totalUniqueItemCodes: 0,
    totalSkuMappings: 0,
    totalUnmappedShopifyItems: 0,
    totalResolvedItems: 0,
  };

  const mappingRate = summary.totalUnmappedShopifyItems + summary.totalResolvedItems > 0
    ? Math.round((summary.totalResolvedItems / (summary.totalUnmappedShopifyItems + summary.totalResolvedItems)) * 100)
    : 100;

  const openCreateMapping = (item: MappingAuditData['unmappedItems'][0]) => {
    setSelectedUnmappedItem(item);
    setNewMappingPattern(item.sku || '');
    setNewMappingCategoryId(null);
    setNewMappingRuleType('exact');
    setCreateMappingOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold">Mapping Audit</h2>
          <p className="text-sm text-gray-500">Track coverage of Shopify SKUs mapped to product categories</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => refetch()} variant="outline" size="sm" data-testid="refresh-audit">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>
      
      {categories.length === 0 && (
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              <div>
                <div className="font-medium text-yellow-800">No Categories Found</div>
                <div className="text-sm text-yellow-600">
                  Seed categories from your pricing database to enable SKU mapping.
                </div>
              </div>
            </div>
            <Button 
              onClick={() => seedCategoriesMutation.mutate()}
              disabled={seedCategoriesMutation.isPending}
              data-testid="seed-categories-btn"
            >
              <Database className="h-4 w-4 mr-2" />
              {seedCategoriesMutation.isPending ? 'Seeding...' : 'Seed Categories from Pricing'}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-5 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-blue-600">{summary.totalPricingItems.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Pricing Items</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-purple-600">{summary.totalUniqueItemCodes.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Unique Item Codes</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-green-600">{summary.totalSkuMappings}</div>
            <div className="text-sm text-gray-500">SKU Mapping Rules</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-3xl font-bold text-orange-600">{summary.totalUnmappedShopifyItems}</div>
            <div className="text-sm text-gray-500">Unmapped Shopify Items</div>
          </CardContent>
        </Card>
        <Card className={mappingRate >= 80 ? 'bg-green-50' : mappingRate >= 50 ? 'bg-yellow-50' : 'bg-red-50'}>
          <CardContent className="p-4 text-center">
            <div className={`text-3xl font-bold ${mappingRate >= 80 ? 'text-green-600' : mappingRate >= 50 ? 'text-yellow-600' : 'text-red-600'}`}>
              {mappingRate}%
            </div>
            <div className="text-sm text-gray-500">Mapping Rate</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Search className="h-5 w-5 text-blue-500" />
              Test SKU
            </CardTitle>
            <CardDescription>
              Paste a Shopify SKU to see its resolved category and machine compatibility
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="flex gap-2 mb-4">
              <Input
                value={testSku}
                onChange={(e) => setTestSku(e.target.value)}
                placeholder="Enter SKU (e.g., GRAFFITI-12x18)"
                className="flex-1"
                data-testid="test-sku-input"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && testSku.trim()) {
                    testSkuMutation.mutate(testSku.trim());
                  }
                }}
              />
              <Button 
                onClick={() => testSku.trim() && testSkuMutation.mutate(testSku.trim())}
                disabled={!testSku.trim() || testSkuMutation.isPending}
                data-testid="test-sku-btn"
              >
                {testSkuMutation.isPending ? 'Testing...' : 'Test'}
              </Button>
            </div>
            
            {testSkuResult && (
              <div className={`p-4 rounded-lg border ${testSkuResult.resolved ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
                <div className="flex items-center gap-2 mb-3">
                  {testSkuResult.resolved ? (
                    <CheckCircle className="h-5 w-5 text-green-600" />
                  ) : (
                    <AlertCircle className="h-5 w-5 text-red-600" />
                  )}
                  <span className={`font-medium ${testSkuResult.resolved ? 'text-green-800' : 'text-red-800'}`}>
                    {testSkuResult.resolved ? 'SKU Resolved' : 'SKU Not Mapped'}
                  </span>
                  <Badge variant="outline" className="ml-auto">{testSkuResult.matchType}</Badge>
                </div>
                
                {testSkuResult.category && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-gray-600">Category:</span>
                      <span className="font-medium">{testSkuResult.category.label}</span>
                      <span className="text-xs font-mono text-gray-500">({testSkuResult.category.code})</span>
                    </div>
                    
                    {testSkuResult.machineCompatibility.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-gray-600">Machines:</span>
                        {testSkuResult.machineCompatibility.map((m, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">{m.label}</Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {testSkuResult.pricingMatch && (
                  <div className="mt-3 pt-3 border-t border-gray-200">
                    <div className="text-sm font-medium text-gray-700 mb-1">Pricing Database Match:</div>
                    <div className="text-sm">
                      <span className="font-mono bg-gray-100 px-1 rounded">{testSkuResult.pricingMatch.itemCode}</span>
                      <span className="mx-2">-</span>
                      <span>{testSkuResult.pricingMatch.productName}</span>
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      {testSkuResult.pricingMatch.productType} • {testSkuResult.pricingMatch.size} • 
                      Dealer: ${testSkuResult.pricingMatch.dealerPrice} • Retail: ${testSkuResult.pricingMatch.retailPrice}
                    </div>
                  </div>
                )}
                
                {!testSkuResult.resolved && !testSkuResult.pricingMatch && (
                  <p className="text-sm text-red-700">
                    No mapping rule or pricing entry found for this SKU. Create a mapping rule to resolve it.
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-lg">
              <Eye className="h-5 w-5 text-purple-500" />
              Preview Impact
            </CardTitle>
            <CardDescription>
              See how many customers/products would be affected by a mapping rule
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 mb-4">
              <div className="flex gap-2">
                <Input
                  value={previewPattern}
                  onChange={(e) => setPreviewPattern(e.target.value)}
                  placeholder="Pattern (e.g., GRAFFITI)"
                  className="flex-1"
                  data-testid="preview-pattern-input"
                />
                <Select value={previewRuleType} onValueChange={(v) => setPreviewRuleType(v as any)}>
                  <SelectTrigger className="w-28" data-testid="preview-rule-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact</SelectItem>
                    <SelectItem value="prefix">Prefix</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-2">
                <Select 
                  value={previewCategoryId?.toString() || ''} 
                  onValueChange={(v) => setPreviewCategoryId(parseInt(v))}
                >
                  <SelectTrigger className="flex-1" data-testid="preview-category">
                    <SelectValue placeholder="Select target category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.isActive).map((cat) => (
                      <SelectItem key={cat.id} value={cat.id.toString()}>
                        {cat.label} ({cat.code})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button 
                  onClick={() => previewPattern && previewImpactMutation.mutate({
                    pattern: previewPattern,
                    ruleType: previewRuleType,
                    newCategoryId: previewCategoryId
                  })}
                  disabled={!previewPattern || previewImpactMutation.isPending}
                  data-testid="preview-impact-btn"
                >
                  {previewImpactMutation.isPending ? 'Analyzing...' : 'Preview'}
                </Button>
              </div>
            </div>
            
            {previewResult && (
              <div className="p-4 rounded-lg border bg-purple-50 border-purple-200">
                <div className="grid grid-cols-2 gap-3 mb-3">
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-2xl font-bold text-blue-600">{previewResult.stats.matchingPricingItems}</div>
                    <div className="text-xs text-gray-500">Pricing Items Match</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-2xl font-bold text-orange-600">{previewResult.stats.matchingUnmappedItems}</div>
                    <div className="text-xs text-gray-500">Unmapped Would Resolve</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-2xl font-bold text-green-600">{previewResult.stats.customersWithTrustInCategory}</div>
                    <div className="text-xs text-gray-500">Customers Affected</div>
                  </div>
                  <div className="text-center p-2 bg-white rounded">
                    <div className="text-2xl font-bold text-purple-600">{previewResult.stats.totalTrustRecordsInCategory}</div>
                    <div className="text-xs text-gray-500">Trust Records</div>
                  </div>
                </div>
                
                {previewResult.targetCategory && (
                  <div className="text-sm mb-2">
                    <span className="text-gray-600">Target: </span>
                    <span className="font-medium">{previewResult.targetCategory.label}</span>
                    {previewResult.machineCompatibility.length > 0 && (
                      <span className="text-gray-500 ml-2">
                        ({previewResult.machineCompatibility.map(m => m.label).join(', ')})
                      </span>
                    )}
                  </div>
                )}
                
                {previewResult.sampleMatches.pricingItems.length > 0 && (
                  <div className="text-xs text-gray-600 mt-2">
                    <span className="font-medium">Sample matches: </span>
                    {previewResult.sampleMatches.pricingItems.map(p => p.itemCode).join(', ')}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {summary.totalUnmappedShopifyItems > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-orange-500" />
              Unmapped Shopify SKUs ({summary.totalUnmappedShopifyItems})
            </CardTitle>
            <CardDescription>
              These SKUs from Shopify orders couldn't be matched to product categories. Create mapping rules to resolve them.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {auditData?.unmappedItems?.map((item) => (
                <div key={item.id} className="border rounded-lg p-4 bg-white">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="font-mono text-sm bg-gray-100 px-2 py-1 rounded inline-block mb-2">
                        {item.sku || 'No SKU'}
                      </div>
                      <div className="text-sm font-medium">{item.productTitle}</div>
                      {item.variantTitle && (
                        <div className="text-xs text-gray-500">{item.variantTitle}</div>
                      )}
                      <div className="text-xs text-gray-400 mt-1">
                        Order: {item.orderId} • {new Date(item.createdAt).toLocaleDateString()}
                      </div>
                    </div>
                    <Button 
                      size="sm" 
                      onClick={() => openCreateMapping(item)}
                      data-testid={`create-mapping-${item.id}`}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      Create Mapping
                    </Button>
                  </div>
                  
                  {item.suggestedMatches && item.suggestedMatches.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <div className="text-xs font-medium text-gray-500 mb-2">Suggested Matches:</div>
                      <div className="flex flex-wrap gap-2">
                        {item.suggestedMatches.map((match, i) => (
                          <div 
                            key={i} 
                            className="text-xs bg-blue-50 text-blue-700 px-2 py-1 rounded flex items-center gap-1"
                          >
                            <span className="font-mono">{match.itemCode}</span>
                            <span className="text-blue-400">({match.similarity}%)</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Categories with Mapping Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-3">
            {auditData?.categories?.filter(c => c.itemCount > 0).map((cat) => (
              <div key={cat.id} className="border rounded-lg p-3 bg-white">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium text-sm">{cat.label}</div>
                    <div className="text-xs font-mono text-gray-500">{cat.code}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-lg font-semibold text-blue-600">{cat.itemCount}</div>
                    <div className="text-xs text-gray-500">{cat.mappingRules} rules</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Dialog open={createMappingOpen} onOpenChange={setCreateMappingOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create SKU Mapping Rule</DialogTitle>
            <DialogDescription>
              Map this SKU pattern to a product category for future orders.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            {selectedUnmappedItem && (
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm font-medium">{selectedUnmappedItem.productTitle}</div>
                <div className="text-xs text-gray-500">{selectedUnmappedItem.variantTitle}</div>
              </div>
            )}
            
            <div>
              <Label>Pattern</Label>
              <Input
                value={newMappingPattern}
                onChange={(e) => setNewMappingPattern(e.target.value)}
                placeholder="SKU pattern to match"
                data-testid="mapping-pattern-input"
              />
            </div>
            
            <div>
              <Label>Rule Type</Label>
              <Select 
                value={newMappingRuleType} 
                onValueChange={(v) => setNewMappingRuleType(v as 'exact' | 'prefix' | 'regex')}
              >
                <SelectTrigger data-testid="mapping-rule-type-select">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="exact">Exact Match</SelectItem>
                  <SelectItem value="prefix">Prefix Match</SelectItem>
                  <SelectItem value="regex">Regex Pattern</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-gray-500 mt-1">
                Exact: SKU must match exactly. Prefix: SKU starts with pattern. Regex: Custom pattern.
              </p>
            </div>
            
            <div>
              <Label>Category</Label>
              <Select 
                value={newMappingCategoryId?.toString() || ''} 
                onValueChange={(v) => setNewMappingCategoryId(parseInt(v))}
              >
                <SelectTrigger data-testid="mapping-category-select">
                  <SelectValue placeholder="Select a category" />
                </SelectTrigger>
                <SelectContent>
                  {categories.filter(c => c.isActive).map((cat) => (
                    <SelectItem key={cat.id} value={cat.id.toString()}>
                      {cat.label} ({cat.code})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateMappingOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                if (newMappingPattern && newMappingCategoryId) {
                  createMappingMutation.mutate({
                    pattern: newMappingPattern,
                    ruleType: newMappingRuleType,
                    categoryId: newMappingCategoryId,
                  });
                }
              }}
              disabled={!newMappingPattern || !newMappingCategoryId || createMappingMutation.isPending}
              data-testid="save-mapping-btn"
            >
              <Save className="h-4 w-4 mr-2" />
              {createMappingMutation.isPending ? 'Saving...' : 'Create Mapping'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function AdminConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("home");
  const [testCustomerOpen, setTestCustomerOpen] = useState(false);

  const { data: machineTypes = [], isLoading: machineTypesLoading } = useQuery<AdminMachineType[]>({
    queryKey: ["/api/admin/config/machine-types"],
  });

  const { data: categoryGroups = [], isLoading: categoryGroupsLoading } = useQuery<AdminCategoryGroup[]>({
    queryKey: ["/api/admin/config/category-groups"],
  });

  const { data: categories = [], isLoading: categoriesLoading } = useQuery<AdminCategory[]>({
    queryKey: ["/api/admin/config/categories"],
  });

  const { data: skuMappings = [], isLoading: skuMappingsLoading } = useQuery<AdminSkuMapping[]>({
    queryKey: ["/api/admin/config/sku-mappings"],
  });

  const { data: coachingTimers = [], isLoading: coachingTimersLoading } = useQuery<AdminCoachingTimer[]>({
    queryKey: ["/api/admin/config/coaching-timers"],
  });

  const { data: nudgeSettings = [], isLoading: nudgeSettingsLoading } = useQuery<AdminNudgeSetting[]>({
    queryKey: ["/api/admin/config/nudge-settings"],
  });

  const { data: conversationScripts = [], isLoading: conversationScriptsLoading } = useQuery<AdminConversationScript[]>({
    queryKey: ["/api/admin/config/conversation-scripts"],
  });

  const { data: auditLogs = [], isLoading: auditLogsLoading } = useQuery<AdminAuditLog[]>({
    queryKey: ["/api/admin/config/audit-log"],
  });

  const seedConfigMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest("POST", "/api/admin/config/seed");
    },
    onSuccess: (data: any) => {
      if (data.seeded) {
        toast({ title: "Config seeded", description: "Initial configuration data has been created" });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/machine-types"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/category-groups"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/categories"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/coaching-timers"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/nudge-settings"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/conversation-scripts"] });
        queryClient.invalidateQueries({ queryKey: ["/api/admin/config/audit-log"] });
      } else {
        toast({ title: "Already seeded", description: "Configuration data already exists" });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const isEmpty = machineTypes.length === 0 && coachingTimers.length === 0;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/admin">
              <Button variant="ghost" size="sm" data-testid="back-to-admin">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Back to Admin
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                <Settings className="h-6 w-6" />
                Rules & Config
              </h1>
              <p className="text-sm text-gray-500">Manage coaching logic, mappings, and scripts</p>
            </div>
          </div>
          {isEmpty && (
            <Button 
              onClick={() => seedConfigMutation.mutate()} 
              disabled={seedConfigMutation.isPending}
              data-testid="seed-config"
            >
              <Database className="h-4 w-4 mr-2" />
              {seedConfigMutation.isPending ? "Seeding..." : "Seed Initial Config"}
            </Button>
          )}
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-12 w-full max-w-7xl">
            <TabsTrigger value="home" className="flex items-center gap-1" data-testid="tab-home">
              <Home className="h-4 w-4" />
              <span className="hidden sm:inline">Home</span>
            </TabsTrigger>
            <TabsTrigger value="users" className="flex items-center gap-1" data-testid="tab-users">
              <User className="h-4 w-4" />
              <span className="hidden sm:inline">Users</span>
            </TabsTrigger>
            <TabsTrigger value="territory" className="flex items-center gap-1 relative" data-testid="tab-territory">
              <MapPin className="h-4 w-4" />
              <span className="hidden sm:inline">Territory</span>
            </TabsTrigger>
            <TabsTrigger value="catalog" className="flex items-center gap-1" data-testid="tab-catalog">
              <Package className="h-4 w-4" />
              <span className="hidden sm:inline">Catalog</span>
            </TabsTrigger>
            <TabsTrigger value="taxonomy" className="flex items-center gap-1" data-testid="tab-taxonomy">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Taxonomy</span>
            </TabsTrigger>
            <TabsTrigger value="sku-mapping" className="flex items-center gap-1" data-testid="tab-sku-mapping">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">SKU Map</span>
            </TabsTrigger>
            <TabsTrigger value="mapping-audit" className="flex items-center gap-1" data-testid="tab-mapping-audit">
              <CheckCircle className="h-4 w-4" />
              <span className="hidden sm:inline">Mapping Audit</span>
            </TabsTrigger>
            <TabsTrigger value="tags" className="flex items-center gap-1" data-testid="tab-tags">
              <Tag className="h-4 w-4" />
              <span className="hidden sm:inline">Tags</span>
            </TabsTrigger>
            <TabsTrigger value="timers" className="flex items-center gap-1" data-testid="tab-timers">
              <Clock className="h-4 w-4" />
              <span className="hidden sm:inline">Timers</span>
            </TabsTrigger>
            <TabsTrigger value="nudges" className="flex items-center gap-1" data-testid="tab-nudges">
              <Bell className="h-4 w-4" />
              <span className="hidden sm:inline">Nudges</span>
            </TabsTrigger>
            <TabsTrigger value="scripts" className="flex items-center gap-1" data-testid="tab-scripts">
              <MessageSquare className="h-4 w-4" />
              <span className="hidden sm:inline">Scripts</span>
            </TabsTrigger>
            <TabsTrigger value="audit" className="flex items-center gap-1" data-testid="tab-audit">
              <History className="h-4 w-4" />
              <span className="hidden sm:inline">Audit</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="home">
            <AdminHomeTab 
              machineTypes={machineTypes}
              categoryGroups={categoryGroups}
              categories={categories}
              skuMappings={skuMappings}
              coachingTimers={coachingTimers}
              nudgeSettings={nudgeSettings}
              conversationScripts={conversationScripts}
              onNavigate={setActiveTab}
              onOpenTestCustomer={() => setTestCustomerOpen(true)}
              onSeedConfig={() => seedConfigMutation.mutate()}
              isSeedPending={seedConfigMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="catalog">
            <ProductCatalogTab categories={categories} />
          </TabsContent>

          <TabsContent value="taxonomy">
            <ProductTaxonomyTab 
              machineTypes={machineTypes} 
              categoryGroups={categoryGroups} 
              categories={categories}
              isLoading={machineTypesLoading || categoryGroupsLoading || categoriesLoading}
            />
          </TabsContent>

          <TabsContent value="sku-mapping">
            <SkuMappingTab 
              mappings={skuMappings} 
              categories={categories}
              isLoading={skuMappingsLoading}
            />
          </TabsContent>

          <TabsContent value="mapping-audit">
            <MappingAuditTab categories={categories} />
          </TabsContent>

          <TabsContent value="tags">
            <TagsManagementTab />
          </TabsContent>

          <TabsContent value="timers">
            <CoachingTimersTab 
              timers={coachingTimers} 
              isLoading={coachingTimersLoading}
            />
          </TabsContent>

          <TabsContent value="nudges">
            <NudgeSettingsTab 
              settings={nudgeSettings} 
              isLoading={nudgeSettingsLoading}
            />
          </TabsContent>

          <TabsContent value="scripts">
            <ConversationScriptsTab 
              scripts={conversationScripts} 
              isLoading={conversationScriptsLoading}
            />
          </TabsContent>

          <TabsContent value="audit">
            <AuditLogTab 
              logs={auditLogs} 
              isLoading={auditLogsLoading}
            />
          </TabsContent>

          <TabsContent value="users">
            <UsersTab />
          </TabsContent>

          <TabsContent value="territory">
            <TerritorySkipFlagsTab />
          </TabsContent>
        </Tabs>
      </div>

      {/* Test Customer Simulator Dialog */}
      <TestCustomerDialog 
        open={testCustomerOpen}
        onOpenChange={setTestCustomerOpen}
        machineTypes={machineTypes}
        categories={categories}
        categoryGroups={categoryGroups}
        coachingTimers={coachingTimers}
        nudgeSettings={nudgeSettings}
      />
    </div>
  );
}

// Admin Home Tab with Setup Checklist
function AdminHomeTab({
  machineTypes,
  categoryGroups,
  categories,
  skuMappings,
  coachingTimers,
  nudgeSettings,
  conversationScripts,
  onNavigate,
  onOpenTestCustomer,
  onSeedConfig,
  isSeedPending,
}: {
  machineTypes: AdminMachineType[];
  categoryGroups: AdminCategoryGroup[];
  categories: AdminCategory[];
  skuMappings: AdminSkuMapping[];
  coachingTimers: AdminCoachingTimer[];
  nudgeSettings: AdminNudgeSetting[];
  conversationScripts: AdminConversationScript[];
  onNavigate: (tab: string) => void;
  onOpenTestCustomer: () => void;
  onSeedConfig: () => void;
  isSeedPending: boolean;
}) {
  const EXPECTED_MACHINE_TYPES = ["offset", "digital_dry_toner", "hp_indigo", "digital_inkjet_uv", "wide_format_flatbed", "wide_format_roll", "aqueous_photo", "screen_printing"];
  
  const checklistItems = [
    {
      key: "machines",
      label: "Machine Types",
      description: "Define printing machine families (Offset, Digital, etc.)",
      tab: "taxonomy",
      isComplete: machineTypes.length >= 6,
      count: machineTypes.length,
      expected: "8 recommended",
      icon: Printer,
    },
    {
      key: "groups",
      label: "Product Groups",
      description: "Organize categories into groups (Labels, Films, Papers)",
      tab: "taxonomy",
      isComplete: categoryGroups.length >= 3,
      count: categoryGroups.length,
      expected: "3+ recommended",
      icon: Layers,
    },
    {
      key: "categories",
      label: "Product Categories",
      description: "Define product types with machine compatibility",
      tab: "taxonomy",
      isComplete: categories.length >= 5,
      count: categories.length,
      expected: "5+ recommended",
      icon: Database,
    },
    {
      key: "sku",
      label: "SKU Mappings",
      description: "Map Shopify SKUs to internal categories",
      tab: "sku-mapping",
      isComplete: skuMappings.length >= 1,
      count: skuMappings.length,
      expected: "At least 1",
      icon: Database,
    },
    {
      key: "timers",
      label: "Coaching Timers",
      description: "Configure follow-up timing (quote stale, sample grace)",
      tab: "timers",
      isComplete: coachingTimers.length >= 5,
      count: coachingTimers.length,
      expected: "5+ recommended",
      icon: Clock,
    },
    {
      key: "nudges",
      label: "Nudge Settings",
      description: "Configure Next Best Move priority and rules",
      tab: "nudges",
      isComplete: nudgeSettings.length >= 3,
      count: nudgeSettings.length,
      expected: "3+ recommended",
      icon: Bell,
    },
    {
      key: "scripts",
      label: "Conversation Scripts",
      description: "Sales scripts by stage, persona, and scenario",
      tab: "scripts",
      isComplete: conversationScripts.length >= 1,
      count: conversationScripts.length,
      expected: "At least 1",
      icon: MessageSquare,
    },
  ];

  const completedCount = checklistItems.filter(item => item.isComplete).length;
  const completionPercent = Math.round((completedCount / checklistItems.length) * 100);
  const isEmpty = machineTypes.length === 0 && coachingTimers.length === 0;

  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <Card className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white border-0">
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-2xl font-bold mb-2">Admin Configuration Center</h2>
              <p className="text-purple-100">Configure coaching logic, product taxonomy, and sales scripts without touching code.</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="text-center">
                <div className="text-4xl font-bold">{completionPercent}%</div>
                <div className="text-purple-200 text-sm">Setup Complete</div>
              </div>
              <Link href="/admin/setup">
                <Button 
                  variant="secondary" 
                  className="bg-white text-purple-700 hover:bg-purple-50 mr-2"
                >
                  <Sparkles className="h-4 w-4 mr-2" />
                  Setup Wizard
                </Button>
              </Link>
              <Button 
                variant="secondary" 
                onClick={onOpenTestCustomer}
                className="bg-white text-purple-700 hover:bg-purple-50"
              >
                <PlayCircle className="h-4 w-4 mr-2" />
                Test Customer Simulator
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Quick Seed Option */}
      {isEmpty && (
        <Card className="border-amber-200 bg-amber-50">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <div>
                  <p className="font-medium text-amber-800">No configuration data found</p>
                  <p className="text-sm text-amber-600">Start with recommended defaults to get up and running quickly.</p>
                </div>
              </div>
              <Button onClick={onSeedConfig} disabled={isSeedPending}>
                <Database className="h-4 w-4 mr-2" />
                {isSeedPending ? "Seeding..." : "Seed Default Config"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* How This Works - Mental Model */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2 text-blue-800">
            <Info className="h-4 w-4" />
            How This Works
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">
          <ul className="text-sm text-blue-700 space-y-1.5">
            <li className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>Machine types unlock categories</strong> — each product category is tagged with compatible machines</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>SKU map makes Shopify orders affect category trust</strong> — orders auto-advance trust when SKUs match</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>Timers drive coaching nudges</strong> — how long until "soft reminder," "at risk," or "expired"</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>Nudges are prioritized; only one shows</strong> — the highest-priority actionable nudge wins</span>
            </li>
            <li className="flex items-start gap-2">
              <ChevronRight className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span><strong>Scripts appear when stalled</strong> — conversation starters for stuck sales situations</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Setup Checklist */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-green-600" />
            Setup Checklist
          </CardTitle>
          <CardDescription>
            Complete these steps to fully configure the coaching system. {completedCount} of {checklistItems.length} complete.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {checklistItems.map((item) => {
              const Icon = item.icon;
              return (
                <div 
                  key={item.key}
                  className={`flex items-center justify-between p-3 rounded-lg border transition-colors ${
                    item.isComplete 
                      ? 'bg-green-50 border-green-200' 
                      : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center ${
                      item.isComplete ? 'bg-green-500' : 'bg-gray-300'
                    }`}>
                      {item.isComplete ? (
                        <Check className="h-4 w-4 text-white" />
                      ) : (
                        <Icon className="h-4 w-4 text-white" />
                      )}
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{item.label}</p>
                      <p className="text-sm text-gray-500">{item.description}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <p className={`text-sm font-medium ${item.isComplete ? 'text-green-600' : 'text-gray-600'}`}>
                        {item.count} configured
                      </p>
                      <p className="text-xs text-gray-400">{item.expected}</p>
                    </div>
                    <Button 
                      variant={item.isComplete ? "outline" : "default"}
                      size="sm"
                      onClick={() => onNavigate(item.tab)}
                    >
                      {item.isComplete ? 'View' : 'Fix Now'}
                      <ChevronRight className="h-4 w-4 ml-1" />
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* Quick Info Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <Info className="h-5 w-5 text-blue-500 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">How it works</p>
                <p className="text-sm text-gray-500 mt-1">
                  1. Define machine types your customers use<br/>
                  2. Create product groups and categories<br/>
                  3. Map Shopify SKUs to categories<br/>
                  4. Set up timing rules and nudges
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <PlayCircle className="h-5 w-5 text-purple-500 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Test Before Deploy</p>
                <p className="text-sm text-gray-500 mt-1">
                  Use the Test Customer Simulator to see how rules apply to a sample customer. See Next Best Move and trust states.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <History className="h-5 w-5 text-amber-500 mt-0.5" />
              <div>
                <p className="font-medium text-gray-900">Audit Trail</p>
                <p className="text-sm text-gray-500 mt-1">
                  All changes are logged with before/after diffs. You can rollback to any previous configuration version.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

// Test Customer Simulator Dialog
function TestCustomerDialog({
  open,
  onOpenChange,
  machineTypes,
  categories,
  categoryGroups,
  coachingTimers,
  nudgeSettings,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineTypes: AdminMachineType[];
  categories: AdminCategory[];
  categoryGroups: AdminCategoryGroup[];
  coachingTimers: AdminCoachingTimer[];
  nudgeSettings: AdminNudgeSetting[];
}) {
  const [selectedMachines, setSelectedMachines] = useState<string[]>([]);
  const [accountState, setAccountState] = useState("prospect");
  const [dayssinceQuote, setDaysSinceQuote] = useState(0);
  const [daysSinceSample, setDaysSinceSample] = useState(0);
  const [hasPendingQuote, setHasPendingQuote] = useState(false);
  const [hasPendingSample, setHasPendingSample] = useState(false);

  const compatibleCategories = categories.filter(cat => 
    cat.compatibleMachineTypes?.some(m => selectedMachines.includes(m))
  );

  const getTimerValue = (key: string) => {
    const timer = coachingTimers.find(t => t.timerKey === key);
    return timer?.valueDays || 0;
  };

  const quoteStaleTimer = getTimerValue("quote_followup_expire");
  const sampleGraceTimer = getTimerValue("press_test_delivery_grace");

  const isQuoteOverdue = hasPendingQuote && dayssinceQuote > quoteStaleTimer;
  const isSampleOverdue = hasPendingSample && daysSinceSample > sampleGraceTimer;

  const nextBestMove = (() => {
    if (isQuoteOverdue) return { action: "Follow up on stale quote", reason: `Quote is ${dayssinceQuote} days old, exceeds ${quoteStaleTimer}-day threshold`, severity: "high" };
    if (isSampleOverdue) return { action: "Check in on sample", reason: `Sample sent ${daysSinceSample} days ago, exceeds ${sampleGraceTimer}-day grace period`, severity: "medium" };
    if (accountState === "prospect") return { action: "Send introduction materials", reason: "New prospect needs initial touchpoint", severity: "low" };
    if (selectedMachines.length === 0) return { action: "Identify customer's machines", reason: "No machine profile set - cannot recommend compatible products", severity: "medium" };
    return { action: "Explore expansion opportunities", reason: "Customer is established, look for new category opportunities", severity: "low" };
  })();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <User className="h-5 w-5" />
            Test Customer Simulator
          </DialogTitle>
          <DialogDescription>
            Configure a test customer profile to see how the coaching rules apply. This helps you understand the impact of your configuration.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-6">
          {/* Input Panel */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 border-b pb-2">Customer Profile</h3>
            
            <div>
              <Label className="text-sm font-medium">Account State</Label>
              <Select value={accountState} onValueChange={setAccountState}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prospect">Prospect</SelectItem>
                  <SelectItem value="first_trust">First Trust</SelectItem>
                  <SelectItem value="expansion_possible">Expansion Possible</SelectItem>
                  <SelectItem value="expansion_in_progress">Expansion In Progress</SelectItem>
                  <SelectItem value="multi_category">Multi Category</SelectItem>
                  <SelectItem value="embedded">Embedded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-sm font-medium">Customer's Machines</Label>
              <p className="text-xs text-gray-500 mb-2">Select machines the customer uses</p>
              <div className="flex flex-wrap gap-2">
                {machineTypes.filter(m => m.isActive !== false).map(mt => (
                  <Button
                    key={mt.code}
                    type="button"
                    variant={selectedMachines.includes(mt.code) ? "default" : "outline"}
                    size="sm"
                    onClick={() => setSelectedMachines(prev => 
                      prev.includes(mt.code) 
                        ? prev.filter(m => m !== mt.code)
                        : [...prev, mt.code]
                    )}
                    className={selectedMachines.includes(mt.code) ? "bg-purple-600" : ""}
                  >
                    {mt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch checked={hasPendingQuote} onCheckedChange={setHasPendingQuote} />
                  <Label className="text-sm">Has pending quote</Label>
                </div>
                {hasPendingQuote && (
                  <div>
                    <Label className="text-xs">Days since sent</Label>
                    <Input 
                      type="number" 
                      value={dayssinceQuote} 
                      onChange={(e) => setDaysSinceQuote(parseInt(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <Switch checked={hasPendingSample} onCheckedChange={setHasPendingSample} />
                  <Label className="text-sm">Has pending sample</Label>
                </div>
                {hasPendingSample && (
                  <div>
                    <Label className="text-xs">Days since sent</Label>
                    <Input 
                      type="number" 
                      value={daysSinceSample} 
                      onChange={(e) => setDaysSinceSample(parseInt(e.target.value) || 0)}
                      className="mt-1"
                    />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Output Panel */}
          <div className="space-y-4">
            <h3 className="font-medium text-gray-900 border-b pb-2">Simulation Results</h3>

            {/* Next Best Move */}
            <div className={`p-4 rounded-lg border-2 ${
              nextBestMove.severity === 'high' ? 'border-red-300 bg-red-50' :
              nextBestMove.severity === 'medium' ? 'border-amber-300 bg-amber-50' :
              'border-green-300 bg-green-50'
            }`}>
              <div className="flex items-start gap-2">
                <Bell className={`h-5 w-5 mt-0.5 ${
                  nextBestMove.severity === 'high' ? 'text-red-600' :
                  nextBestMove.severity === 'medium' ? 'text-amber-600' :
                  'text-green-600'
                }`} />
                <div>
                  <p className="font-medium text-gray-900">Next Best Move</p>
                  <p className="text-sm font-semibold mt-1">{nextBestMove.action}</p>
                  <p className="text-xs text-gray-600 mt-1">{nextBestMove.reason}</p>
                </div>
              </div>
            </div>

            {/* Compatible Categories */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">
                Compatible Categories ({compatibleCategories.length})
              </p>
              {selectedMachines.length === 0 ? (
                <p className="text-sm text-gray-400 italic">Select machines to see compatible categories</p>
              ) : compatibleCategories.length === 0 ? (
                <p className="text-sm text-amber-600">No categories match selected machines</p>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {compatibleCategories.map(cat => (
                    <Badge key={cat.id} variant="secondary" className="text-xs">
                      {cat.label}
                    </Badge>
                  ))}
                </div>
              )}
            </div>

            {/* Active Timers */}
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Active Timer Thresholds</p>
              <div className="space-y-1 text-xs">
                <div className="flex justify-between">
                  <span className="text-gray-500">Quote expires after:</span>
                  <span className={hasPendingQuote && dayssinceQuote > quoteStaleTimer ? 'text-red-600 font-medium' : ''}>
                    {quoteStaleTimer} days
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Press test grace period:</span>
                  <span className={hasPendingSample && daysSinceSample > sampleGraceTimer ? 'text-red-600 font-medium' : ''}>
                    {sampleGraceTimer} days
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ProductTaxonomyTab({ 
  machineTypes, 
  categoryGroups, 
  categories,
  isLoading 
}: { 
  machineTypes: AdminMachineType[];
  categoryGroups: AdminCategoryGroup[];
  categories: AdminCategory[];
  isLoading: boolean;
}) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingMachineType, setEditingMachineType] = useState<AdminMachineType | null>(null);
  const [newMachineType, setNewMachineType] = useState(false);
  const [editingCategoryGroup, setEditingCategoryGroup] = useState<AdminCategoryGroup | null>(null);
  const [newCategoryGroup, setNewCategoryGroup] = useState(false);
  const [editingCategory, setEditingCategory] = useState<AdminCategory | null>(null);
  const [newCategory, setNewCategory] = useState(false);

  const saveMachineTypeMutation = useMutation({
    mutationFn: async (data: Partial<AdminMachineType>) => {
      if (data.id) {
        return await apiRequest("PUT", `/api/admin/config/machine-types/${data.id}`, data);
      }
      return await apiRequest("POST", "/api/admin/config/machine-types", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/machine-types"] });
      setEditingMachineType(null);
      setNewMachineType(false);
      toast({ title: "Saved", description: "Machine type saved successfully" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMachineTypeMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/config/machine-types/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/machine-types"] });
      toast({ title: "Deleted", description: "Machine type deleted" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const saveCategoryGroupMutation = useMutation({
    mutationFn: async (data: Partial<AdminCategoryGroup>) => {
      if (data.id) {
        return await apiRequest("PUT", `/api/admin/config/category-groups/${data.id}`, data);
      }
      return await apiRequest("POST", "/api/admin/config/category-groups", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/category-groups"] });
      setEditingCategoryGroup(null);
      setNewCategoryGroup(false);
      toast({ title: "Saved", description: "Category group saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCategoryGroupMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/config/category-groups/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/category-groups"] });
      toast({ title: "Deleted" });
    },
  });

  const saveCategoryMutation = useMutation({
    mutationFn: async (data: Partial<AdminCategory>) => {
      if (data.id) {
        return await apiRequest("PUT", `/api/admin/config/categories/${data.id}`, data);
      }
      return await apiRequest("POST", "/api/admin/config/categories", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/categories"] });
      setEditingCategory(null);
      setNewCategory(false);
      toast({ title: "Saved", description: "Category saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteCategoryMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/config/categories/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/categories"] });
      toast({ title: "Deleted" });
    },
  });

  if (isLoading) {
    return <div className="text-center py-8">Loading taxonomy...</div>;
  }

  return (
    <div className="grid gap-6">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Machine Types</CardTitle>
            <CardDescription>Define the machine families that determine category compatibility</CardDescription>
          </div>
          <Button size="sm" onClick={() => setNewMachineType(true)} data-testid="add-machine-type">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Icon</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {machineTypes.map((mt) => {
                const IconComponent = mt.icon ? ICON_MAP[mt.icon] : null;
                return (
                  <TableRow key={mt.id}>
                    <TableCell className="font-mono text-sm">{mt.code}</TableCell>
                    <TableCell>{mt.label}</TableCell>
                    <TableCell>
                      {IconComponent && <IconComponent className="h-4 w-4" />}
                    </TableCell>
                    <TableCell>{mt.sortOrder}</TableCell>
                    <TableCell>
                      <Badge variant={mt.isActive ? "default" : "secondary"}>
                        {mt.isActive ? "Active" : "Inactive"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setEditingMachineType(mt)}
                        data-testid={`edit-machine-${mt.code}`}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button 
                        variant="ghost" 
                        size="sm"
                        onClick={() => {
                          if (confirm(`Delete ${mt.label}?`)) {
                            deleteMachineTypeMutation.mutate(mt.id);
                          }
                        }}
                        data-testid={`delete-machine-${mt.code}`}
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
              {machineTypes.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No machine types configured. Click "Seed Initial Config" to get started.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Category Groups</CardTitle>
            <CardDescription>Organize categories into logical groups</CardDescription>
          </div>
          <Button size="sm" onClick={() => setNewCategoryGroup(true)} data-testid="add-category-group">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Color</TableHead>
                <TableHead>Order</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryGroups.map((cg) => (
                <TableRow key={cg.id}>
                  <TableCell className="font-mono text-sm">{cg.code}</TableCell>
                  <TableCell>{cg.label}</TableCell>
                  <TableCell>
                    <Badge style={{ backgroundColor: cg.color || '#gray' }}>{cg.color}</Badge>
                  </TableCell>
                  <TableCell>{cg.sortOrder}</TableCell>
                  <TableCell>
                    <Badge variant={cg.isActive ? "default" : "secondary"}>
                      {cg.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCategoryGroup(cg)} data-testid={`edit-group-${cg.code}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm(`Delete ${cg.label}?`)) deleteCategoryGroupMutation.mutate(cg.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {categoryGroups.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No category groups configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">Categories ({categories.length})</CardTitle>
            <CardDescription>Product categories with machine compatibility settings</CardDescription>
          </div>
          <Button size="sm" onClick={() => setNewCategory(true)} data-testid="add-category">
            <Plus className="h-4 w-4 mr-1" />
            Add
          </Button>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Code</TableHead>
                <TableHead>Label</TableHead>
                <TableHead>Compatible Machines</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.slice(0, 15).map((cat) => (
                <TableRow key={cat.id}>
                  <TableCell className="font-mono text-sm">{cat.code}</TableCell>
                  <TableCell>{cat.label}</TableCell>
                  <TableCell>
                    <div className="flex flex-wrap gap-1">
                      {(cat.compatibleMachineTypes || []).map((m) => (
                        <Badge key={m} variant="outline" className="text-xs">{m}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell>
                    <Badge variant={cat.isActive ? "default" : "secondary"}>
                      {cat.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => setEditingCategory(cat)} data-testid={`edit-category-${cat.code}`}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm(`Delete ${cat.label}?`)) deleteCategoryMutation.mutate(cat.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {categories.length > 15 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500">
                    ... and {categories.length - 15} more categories
                  </TableCell>
                </TableRow>
              )}
              {categories.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                    No categories configured.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <MachineTypeDialog
        open={!!editingMachineType || newMachineType}
        onOpenChange={(open) => {
          if (!open) {
            setEditingMachineType(null);
            setNewMachineType(false);
          }
        }}
        machineType={editingMachineType}
        onSave={(data) => saveMachineTypeMutation.mutate(data)}
        isPending={saveMachineTypeMutation.isPending}
      />

      <CategoryGroupDialog
        open={!!editingCategoryGroup || newCategoryGroup}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategoryGroup(null);
            setNewCategoryGroup(false);
          }
        }}
        categoryGroup={editingCategoryGroup}
        onSave={(data) => saveCategoryGroupMutation.mutate(data)}
        isPending={saveCategoryGroupMutation.isPending}
      />

      <CategoryDialog
        open={!!editingCategory || newCategory}
        onOpenChange={(open) => {
          if (!open) {
            setEditingCategory(null);
            setNewCategory(false);
          }
        }}
        category={editingCategory}
        machineTypes={machineTypes}
        categoryGroups={categoryGroups}
        onSave={(data) => saveCategoryMutation.mutate(data)}
        isPending={saveCategoryMutation.isPending}
      />
    </div>
  );
}

function MachineTypeDialog({
  open,
  onOpenChange,
  machineType,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  machineType: AdminMachineType | null;
  onSave: (data: Partial<AdminMachineType>) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    icon: "",
    description: "",
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    if (machineType) {
      setFormData({
        code: machineType.code,
        label: machineType.label,
        icon: machineType.icon || "",
        description: machineType.description || "",
        sortOrder: machineType.sortOrder || 0,
        isActive: machineType.isActive ?? true,
      });
    } else {
      setFormData({
        code: "",
        label: "",
        icon: "",
        description: "",
        sortOrder: 0,
        isActive: true,
      });
    }
  }, [machineType, open]);

  const handleSave = () => {
    onSave({
      ...formData,
      id: machineType?.id,
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{machineType ? "Edit Machine Type" : "Add Machine Type"}</DialogTitle>
          <DialogDescription>Machine types represent the printing equipment your customers use (e.g., Offset presses, HP Indigo, Inkjet). Products are marked as compatible with specific machines.</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <Label htmlFor="code" className="text-sm font-medium">Internal ID (Code)</Label>
            <p className="text-xs text-gray-500 mb-1">A short, unique identifier used by the system (lowercase, no spaces)</p>
            <Input
              id="code"
              value={formData.code}
              onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s/g, '_') })}
              placeholder="offset, hp_indigo, inkjet"
              data-testid="machine-code-input"
            />
          </div>
          <div>
            <Label htmlFor="label" className="text-sm font-medium">Display Name</Label>
            <p className="text-xs text-gray-500 mb-1">The friendly name shown to users in the app</p>
            <Input
              id="label"
              value={formData.label}
              onChange={(e) => setFormData({ ...formData, label: e.target.value })}
              placeholder="Offset Press, HP Indigo, Inkjet"
              data-testid="machine-label-input"
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="icon" className="text-sm font-medium">Icon (Optional)</Label>
              <p className="text-xs text-gray-500 mb-1">Visual icon in the interface</p>
              <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Choose an icon" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Printer">Printer</SelectItem>
                  <SelectItem value="Zap">Zap (Digital)</SelectItem>
                  <SelectItem value="Sparkles">Sparkles (HP Indigo)</SelectItem>
                  <SelectItem value="Droplet">Droplet (Inkjet)</SelectItem>
                  <SelectItem value="Layers">Layers (Flexo)</SelectItem>
                  <SelectItem value="Maximize">Maximize (Wide Format)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sortOrder" className="text-sm font-medium">Display Order</Label>
              <p className="text-xs text-gray-500 mb-1">Lower numbers appear first</p>
              <Input
                id="sortOrder"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                placeholder="1, 2, 3..."
                data-testid="machine-sort-input"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="description" className="text-sm font-medium">Notes (Optional)</Label>
            <p className="text-xs text-gray-500 mb-1">Internal notes about this machine type</p>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="e.g., Traditional lithographic printing..."
              rows={2}
              data-testid="machine-description-input"
            />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-gray-500">Only active machine types appear in dropdowns</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isPending} data-testid="save-machine-type">
            <Save className="h-4 w-4 mr-2" />
            {isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryGroupDialog({
  open,
  onOpenChange,
  categoryGroup,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryGroup: AdminCategoryGroup | null;
  onSave: (data: Partial<AdminCategoryGroup>) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    color: "",
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    if (categoryGroup) {
      setFormData({
        code: categoryGroup.code,
        label: categoryGroup.label,
        color: categoryGroup.color || "",
        sortOrder: categoryGroup.sortOrder || 0,
        isActive: categoryGroup.isActive ?? true,
      });
    } else {
      setFormData({ code: "", label: "", color: "", sortOrder: 0, isActive: true });
    }
  }, [categoryGroup, open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{categoryGroup ? "Edit Category Group" : "Add Category Group"}</DialogTitle>
          <DialogDescription>Category groups organize products into logical sections (e.g., Labels, Tapes, Specialty Papers).</DialogDescription>
        </DialogHeader>
        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium">Internal ID (Code)</Label>
            <p className="text-xs text-gray-500 mb-1">A short, unique identifier (lowercase, no spaces)</p>
            <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s/g, '_') })} placeholder="labels, tapes, specialty" />
          </div>
          <div>
            <Label className="text-sm font-medium">Display Name</Label>
            <p className="text-xs text-gray-500 mb-1">The name shown to users</p>
            <Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="Labels, Tapes, Specialty Papers" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Color Tag (Optional)</Label>
              <p className="text-xs text-gray-500 mb-1">For visual distinction</p>
              <Select value={formData.color} onValueChange={(v) => setFormData({ ...formData, color: v })}>
                <SelectTrigger><SelectValue placeholder="Choose color" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blue">Blue</SelectItem>
                  <SelectItem value="green">Green</SelectItem>
                  <SelectItem value="purple">Purple</SelectItem>
                  <SelectItem value="orange">Orange</SelectItem>
                  <SelectItem value="red">Red</SelectItem>
                  <SelectItem value="gray">Gray</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-sm font-medium">Display Order</Label>
              <p className="text-xs text-gray-500 mb-1">Lower numbers first</p>
              <Input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} placeholder="1, 2, 3..." />
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-gray-500">Inactive groups are hidden from views</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ ...formData, id: categoryGroup?.id })} disabled={isPending}>
            <Save className="h-4 w-4 mr-2" />{isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDialog({
  open,
  onOpenChange,
  category,
  machineTypes,
  categoryGroups,
  onSave,
  isPending
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category: AdminCategory | null;
  machineTypes: AdminMachineType[];
  categoryGroups: AdminCategoryGroup[];
  onSave: (data: Partial<AdminCategory>) => void;
  isPending: boolean;
}) {
  const [formData, setFormData] = useState({
    code: "",
    label: "",
    groupId: null as number | null,
    compatibleMachineTypes: [] as string[],
    description: "",
    sortOrder: 0,
    isActive: true,
  });

  useEffect(() => {
    if (category) {
      setFormData({
        code: category.code,
        label: category.label,
        groupId: category.groupId,
        compatibleMachineTypes: category.compatibleMachineTypes || [],
        description: category.description || "",
        sortOrder: category.sortOrder || 0,
        isActive: category.isActive ?? true,
      });
    } else {
      setFormData({ code: "", label: "", groupId: null, compatibleMachineTypes: [], description: "", sortOrder: 0, isActive: true });
    }
  }, [category, open]);

  const toggleMachine = (code: string) => {
    setFormData(prev => ({
      ...prev,
      compatibleMachineTypes: prev.compatibleMachineTypes.includes(code)
        ? prev.compatibleMachineTypes.filter(m => m !== code)
        : [...prev.compatibleMachineTypes, code]
    }));
  };

  const activeGroups = categoryGroups.filter(g => g.isActive !== false);
  const activeMachines = machineTypes.filter(m => m.isActive !== false);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{category ? "Edit Product Category" : "Add Product Category"}</DialogTitle>
          <DialogDescription>Product categories are specific product types (e.g., GraffitiStick, PermaTack, ChromaLabel). Each category can be marked as compatible with certain machine types.</DialogDescription>
        </DialogHeader>
        
        {/* Workflow Guide */}
        {!category && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <div className="flex items-start gap-2">
              <Info className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-blue-800 mb-1">Quick Setup Guide</p>
                <ol className="text-blue-700 text-xs space-y-0.5 list-decimal list-inside">
                  <li>First, create <strong>Machine Types</strong> (Offset, Digital, etc.)</li>
                  <li>Then, create <strong>Product Groups</strong> (Labels, Films, etc.)</li>
                  <li>Finally, add <strong>Categories</strong> here and assign them to groups</li>
                </ol>
              </div>
            </div>
          </div>
        )}

        <div className="space-y-5">
          <div>
            <Label className="text-sm font-medium">Internal ID (Code)</Label>
            <p className="text-xs text-gray-500 mb-1">A short, unique identifier (lowercase, no spaces)</p>
            <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value.toLowerCase().replace(/\s/g, '_') })} placeholder="graffitistick, permatack, chromalabel" />
          </div>
          <div>
            <Label className="text-sm font-medium">Product Name</Label>
            <p className="text-xs text-gray-500 mb-1">The display name customers will see</p>
            <Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="GraffitiStick, PermaTack, ChromaLabel" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-medium">Product Group</Label>
              <p className="text-xs text-gray-500 mb-1">Which group does this belong to?</p>
              {activeGroups.length === 0 ? (
                <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-700">
                  <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                  No groups available. Create a Product Group first in the "Product Groups" section above.
                </div>
              ) : (
                <Select value={formData.groupId?.toString() || ""} onValueChange={(v) => setFormData({ ...formData, groupId: v ? parseInt(v) : null })}>
                  <SelectTrigger className={!formData.groupId ? "border-amber-300" : ""}>
                    <SelectValue placeholder={`Select from ${activeGroups.length} group${activeGroups.length !== 1 ? 's' : ''}`} />
                  </SelectTrigger>
                  <SelectContent>
                    {activeGroups.map(g => (
                      <SelectItem key={g.id} value={g.id.toString()}>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{g.label}</span>
                          <span className="text-xs text-gray-400">({g.code})</span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label className="text-sm font-medium">Display Order</Label>
              <p className="text-xs text-gray-500 mb-1">Lower numbers appear first</p>
              <Input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} placeholder="0" />
            </div>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <Label className="text-sm font-medium">Works With These Machines</Label>
              {formData.compatibleMachineTypes.length > 0 && (
                <span className="text-xs text-green-600 font-medium">{formData.compatibleMachineTypes.length} selected</span>
              )}
            </div>
            <p className="text-xs text-gray-500 mb-2">Click to toggle which printing machines this product works with</p>
            {activeMachines.length === 0 ? (
              <div className="bg-amber-50 border border-amber-200 rounded-md p-3 text-xs text-amber-700">
                <AlertTriangle className="h-3.5 w-3.5 inline mr-1" />
                No machine types available. Create Machine Types first in the "Machine Types" section above.
              </div>
            ) : (
              <div className="space-y-2">
                {/* Quick Selection Buttons */}
                <div className="flex flex-wrap gap-2 pb-2 border-b">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setFormData({ ...formData, compatibleMachineTypes: activeMachines.map(m => m.code) })}
                  >
                    Select All
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setFormData({ ...formData, compatibleMachineTypes: [] })}
                  >
                    Clear All
                  </Button>
                  <div className="h-6 border-l mx-1" />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setFormData({ ...formData, compatibleMachineTypes: ['offset', 'digital_dry_toner', 'hp_indigo'].filter(c => activeMachines.some(m => m.code === c)) })}
                    title="Offset + Digital Dry Toner + HP Indigo"
                  >
                    🏷️ Label Print
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => setFormData({ ...formData, compatibleMachineTypes: ['wide_format_flatbed', 'wide_format_roll', 'digital_inkjet_uv'].filter(c => activeMachines.some(m => m.code === c)) })}
                    title="Wide Format + UV Inkjet"
                  >
                    🖼️ Wide Format
                  </Button>
                </div>
                {/* Machine Type Toggles */}
                <div className="flex flex-wrap gap-2">
                  {activeMachines.map(mt => {
                    const isSelected = formData.compatibleMachineTypes.includes(mt.code);
                    return (
                      <Button
                        key={mt.code}
                        type="button"
                        variant={isSelected ? "default" : "outline"}
                        size="sm"
                        onClick={() => toggleMachine(mt.code)}
                        className={isSelected ? "bg-green-600 hover:bg-green-700" : ""}
                      >
                        {isSelected && <Check className="h-3 w-3 mr-1" />}
                        {mt.label}
                      </Button>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div>
            <Label className="text-sm font-medium">Notes (Optional)</Label>
            <p className="text-xs text-gray-500 mb-1">Internal notes about this product category</p>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="e.g., Best for outdoor signage..." rows={2} />
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
            <div>
              <Label className="text-sm font-medium">Active</Label>
              <p className="text-xs text-gray-500">Inactive categories are hidden from views</p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button 
            onClick={() => onSave({ ...formData, id: category?.id })} 
            disabled={isPending || !formData.code || !formData.label}
          >
            <Save className="h-4 w-4 mr-2" />{isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SkuMappingTab({ mappings, categories, isLoading }: { mappings: AdminSkuMapping[]; categories: AdminCategory[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newMapping, setNewMapping] = useState(false);
  const [formData, setFormData] = useState({ ruleType: "prefix", pattern: "", categoryCode: "", priority: 0, description: "" });
  const [showUnmapped, setShowUnmapped] = useState(false);
  const [quickMapSku, setQuickMapSku] = useState<string | null>(null);
  const [quickMapCategory, setQuickMapCategory] = useState("");

  // Fetch unique SKUs from Shopify orders
  const { data: shopifySkus = [], isLoading: skusLoading } = useQuery<string[]>({
    queryKey: ["/api/admin/config/shopify-skus"],
    enabled: showUnmapped,
  });

  const saveMappingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/config/sku-mappings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/sku-mappings"] });
      setNewMapping(false);
      setQuickMapSku(null);
      setQuickMapCategory("");
      setFormData({ ruleType: "prefix", pattern: "", categoryCode: "", priority: 0, description: "" });
      toast({ title: "Saved", description: "SKU mapping saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/config/sku-mappings/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/sku-mappings"] });
      toast({ title: "Deleted" });
    },
  });

  // Find unmapped SKUs by checking which ones don't match any rule
  const getUnmappedSkus = () => {
    if (!shopifySkus.length || !mappings.length) return shopifySkus;
    return shopifySkus.filter(sku => {
      for (const m of mappings) {
        if (!m.isActive) continue;
        if (m.ruleType === "exact" && sku === m.pattern) return false;
        if (m.ruleType === "prefix" && sku.startsWith(m.pattern)) return false;
        if (m.ruleType === "regex") {
          try {
            if (new RegExp(m.pattern).test(sku)) return false;
          } catch {}
        }
      }
      return true;
    });
  };

  const unmappedSkus = getUnmappedSkus();

  if (isLoading) return <div className="text-center py-8">Loading SKU mappings...</div>;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-lg">SKU → Category Mappings</CardTitle>
            <CardDescription>Map Shopify SKUs/products to internal categories using exact, prefix, or regex rules</CardDescription>
          </div>
          <div className="flex gap-2">
            <Button 
              size="sm" 
              variant={showUnmapped ? "default" : "outline"} 
              onClick={() => setShowUnmapped(!showUnmapped)}
              data-testid="toggle-unmapped"
            >
              <AlertTriangle className="h-4 w-4 mr-1" />
              {showUnmapped ? "Hide" : "Show"} Unmapped
            </Button>
            <Button size="sm" onClick={() => setNewMapping(true)} data-testid="add-sku-mapping">
              <Plus className="h-4 w-4 mr-1" />
              Add Rule
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {newMapping && (
            <div className="mb-4 p-4 border rounded-lg bg-gray-50 space-y-3">
              <div className="grid grid-cols-4 gap-3">
                <Select value={formData.ruleType} onValueChange={(v) => setFormData({ ...formData, ruleType: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exact">Exact</SelectItem>
                    <SelectItem value="prefix">Prefix</SelectItem>
                    <SelectItem value="regex">Regex</SelectItem>
                  </SelectContent>
                </Select>
                <Input 
                  placeholder="Pattern (e.g., Solvit*)" 
                  value={formData.pattern}
                  onChange={(e) => setFormData({ ...formData, pattern: e.target.value })}
                />
                <Select value={formData.categoryCode} onValueChange={(v) => setFormData({ ...formData, categoryCode: v })}>
                  <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                  <SelectContent>
                    {categories.filter(c => c.isActive !== false).map(c => (
                      <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input 
                  type="number"
                  placeholder="Priority" 
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) || 0 })}
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={() => saveMappingMutation.mutate(formData)} disabled={saveMappingMutation.isPending}>
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button size="sm" variant="outline" onClick={() => setNewMapping(false)}>Cancel</Button>
              </div>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Type</TableHead>
                <TableHead>Pattern</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Priority</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {mappings.map((m) => (
                <TableRow key={m.id}>
                  <TableCell><Badge variant="outline">{m.ruleType}</Badge></TableCell>
                  <TableCell className="font-mono text-sm">{m.pattern}</TableCell>
                  <TableCell>{categories.find(c => c.code === m.categoryCode)?.label || m.categoryCode}</TableCell>
                  <TableCell>{m.priority}</TableCell>
                  <TableCell>
                    <Badge variant={m.isActive ? "default" : "secondary"}>
                      {m.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button variant="ghost" size="sm" onClick={() => {
                      if (confirm("Delete this mapping?")) deleteMappingMutation.mutate(m.id);
                    }}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {mappings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                    No SKU mappings configured. Add rules to map Shopify products to categories.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Unmapped Shopify Products Panel */}
      {showUnmapped && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <AlertTriangle className="h-5 w-5 text-amber-600" />
                  Unmapped Shopify Products
                </CardTitle>
                <CardDescription>
                  These SKUs from Shopify orders don't match any mapping rules. Click to create a mapping.
                </CardDescription>
              </div>
              {!skusLoading && (
                <Badge variant={unmappedSkus.length > 0 ? "destructive" : "secondary"} className="text-lg px-3 py-1">
                  {unmappedSkus.length} unmapped
                </Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {skusLoading ? (
              <div className="text-center py-4 text-gray-500">Loading Shopify SKUs...</div>
            ) : shopifySkus.length === 0 ? (
              <div className="text-center py-4 text-gray-500">
                <Package className="h-8 w-8 mx-auto mb-2 opacity-50" />
                No Shopify order data found. SKUs will appear here once orders sync.
              </div>
            ) : unmappedSkus.length === 0 ? (
              <div className="text-center py-4 text-green-600">
                <CheckCircle2 className="h-8 w-8 mx-auto mb-2" />
                All {shopifySkus.length} SKUs are mapped!
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {unmappedSkus.map((sku) => (
                  <div key={sku} className="flex items-center justify-between p-2 bg-white rounded border">
                    <span className="font-mono text-sm">{sku}</span>
                    {quickMapSku === sku ? (
                      <div className="flex items-center gap-2">
                        <Select value={quickMapCategory} onValueChange={setQuickMapCategory}>
                          <SelectTrigger className="w-40 h-8">
                            <SelectValue placeholder="Category" />
                          </SelectTrigger>
                          <SelectContent>
                            {categories.filter(c => c.isActive !== false).map(c => (
                              <SelectItem key={c.code} value={c.code}>{c.label}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button 
                          size="sm" 
                          className="h-8"
                          disabled={!quickMapCategory || saveMappingMutation.isPending}
                          onClick={() => saveMappingMutation.mutate({ 
                            ruleType: "exact", 
                            pattern: sku, 
                            categoryCode: quickMapCategory, 
                            priority: 100 
                          })}
                        >
                          <Save className="h-3 w-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="h-8" onClick={() => { setQuickMapSku(null); setQuickMapCategory(""); }}>
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" variant="outline" onClick={() => setQuickMapSku(sku)}>
                        <Plus className="h-3 w-3 mr-1" />
                        Map
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function CoachingTimersTab({ timers, isLoading }: { timers: AdminCoachingTimer[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTimer, setEditingTimer] = useState<AdminCoachingTimer | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);

  const saveTimerMutation = useMutation({
    mutationFn: async (data: { id: number; valueDays: number }) => {
      return await apiRequest("PUT", `/api/admin/config/coaching-timers/${data.id}`, { valueDays: data.valueDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/coaching-timers"] });
      setEditingTimer(null);
      setValidationError(null);
      toast({ title: "Saved", description: "Timer updated" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading timers...</div>;

  const groupedTimers = timers.reduce((acc, t) => {
    if (!acc[t.category]) acc[t.category] = [];
    acc[t.category].push(t);
    return acc;
  }, {} as Record<string, AdminCoachingTimer[]>);

  const getQuoteFollowupTimers = () => {
    const soft = timers.find(t => t.timerKey === 'quote_followup_soft');
    const risk = timers.find(t => t.timerKey === 'quote_followup_risk');
    const expire = timers.find(t => t.timerKey === 'quote_followup_expire');
    return { soft, risk, expire };
  };

  const validateTimer = (timer: AdminCoachingTimer, newValue: number): string | null => {
    const { soft, risk, expire } = getQuoteFollowupTimers();
    
    if (timer.timerKey === 'quote_followup_soft') {
      if (risk && newValue >= risk.valueDays) {
        return `Soft (${newValue}) must be less than Risk (${risk.valueDays})`;
      }
    }
    if (timer.timerKey === 'quote_followup_risk') {
      if (soft && newValue <= soft.valueDays) {
        return `Risk (${newValue}) must be greater than Soft (${soft.valueDays})`;
      }
      if (expire && newValue >= expire.valueDays) {
        return `Risk (${newValue}) must be less than Expired (${expire.valueDays})`;
      }
    }
    if (timer.timerKey === 'quote_followup_expire') {
      if (risk && newValue <= risk.valueDays) {
        return `Expired (${newValue}) must be greater than Risk (${risk.valueDays})`;
      }
    }
    if (newValue < 1) {
      return "Timer must be at least 1 day";
    }
    if (newValue > 365) {
      return "Timer cannot exceed 365 days";
    }
    return null;
  };

  const handleSave = (timer: AdminCoachingTimer) => {
    const error = validateTimer(timer, editingTimer?.valueDays || 0);
    if (error) {
      setValidationError(error);
      toast({ title: "Validation Error", description: error, variant: "destructive" });
      return;
    }
    saveTimerMutation.mutate({ id: timer.id, valueDays: editingTimer!.valueDays });
  };

  const getCategoryInfo = (category: string) => {
    switch (category) {
      case 'quote_followup':
        return {
          title: 'Quote Follow-up Timeline',
          icon: '📊',
          description: 'These timers control when quotes become stale. Order must be: Soft < At Risk < Expired.',
          example: 'Example: If Soft=4, Risk=7, Expired=14: After 4 days you get a reminder, at 7 days it turns yellow, at 14 days it turns red.'
        };
      case 'press_test':
        return {
          title: 'Press Test Timeline',
          icon: '🖨️',
          description: 'Grace period after sample delivery before follow-up nudges appear.',
          example: 'Example: Grace=5 means you wait 5 days after delivery before asking for test results.'
        };
      case 'habitual':
        return {
          title: 'Habitual Customer Definition',
          icon: '🔄',
          description: 'When does a customer become "habitual" (repeat buyer)?',
          example: 'Example: 90 days means 2 purchases within 90 days = habitual customer.'
        };
      case 'stale_account':
        return {
          title: 'Stale Account Detection',
          icon: '⏰',
          description: 'How long without contact before an account is considered stale?',
          example: 'Example: 60 days means no activity for 60 days triggers a "check in" nudge.'
        };
      default:
        return {
          title: category.replace(/_/g, ' '),
          icon: '⚙️',
          description: '',
          example: ''
        };
    }
  };

  const { soft, risk, expire } = getQuoteFollowupTimers();

  return (
    <div className="space-y-6">
      {/* Quote Timeline Visualization */}
      {soft && risk && expire && (
        <Card className="bg-gradient-to-r from-green-50 via-yellow-50 to-red-50 border-0">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <Clock className="h-5 w-5" />
              Quote Follow-up Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="relative h-20 mb-2">
              <div className="absolute inset-x-0 top-8 h-3 bg-gray-200 rounded-full overflow-hidden">
                <div 
                  className="absolute left-0 h-full bg-green-400"
                  style={{ width: `${(soft.valueDays / expire.valueDays) * 100}%` }}
                />
                <div 
                  className="absolute h-full bg-yellow-400"
                  style={{ 
                    left: `${(soft.valueDays / expire.valueDays) * 100}%`,
                    width: `${((risk.valueDays - soft.valueDays) / expire.valueDays) * 100}%`
                  }}
                />
                <div 
                  className="absolute h-full bg-red-400"
                  style={{ 
                    left: `${(risk.valueDays / expire.valueDays) * 100}%`,
                    width: `${((expire.valueDays - risk.valueDays) / expire.valueDays) * 100}%`
                  }}
                />
              </div>
              <div className="absolute top-0 left-0 text-xs text-center" style={{ width: `${(soft.valueDays / expire.valueDays) * 100}%` }}>
                <div className="text-gray-600">Day 0</div>
                <div className="text-green-600 font-medium">Fresh</div>
              </div>
              <div className="absolute top-0 text-xs text-center" style={{ left: `${(soft.valueDays / expire.valueDays) * 100}%`, width: `${((risk.valueDays - soft.valueDays) / expire.valueDays) * 100}%` }}>
                <div className="text-gray-600">Day {soft.valueDays}</div>
                <div className="text-yellow-600 font-medium">Soft</div>
              </div>
              <div className="absolute top-0 text-xs text-center" style={{ left: `${(risk.valueDays / expire.valueDays) * 100}%`, width: `${((expire.valueDays - risk.valueDays) / expire.valueDays) * 100}%` }}>
                <div className="text-gray-600">Day {risk.valueDays}</div>
                <div className="text-orange-600 font-medium">At Risk</div>
              </div>
              <div className="absolute top-0 right-0 text-xs text-right">
                <div className="text-gray-600">Day {expire.valueDays}</div>
                <div className="text-red-600 font-medium">Expired</div>
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              Drag the values below to adjust the timeline. Rule: Soft &lt; At Risk &lt; Expired
            </p>
          </CardContent>
        </Card>
      )}

      {/* Timer Groups */}
      <div className="grid gap-4">
        {Object.entries(groupedTimers).map(([category, categoryTimers]) => {
          const info = getCategoryInfo(category);
          return (
            <Card key={category}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <span>{info.icon}</span>
                  {info.title}
                </CardTitle>
                {info.description && (
                  <CardDescription>{info.description}</CardDescription>
                )}
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {categoryTimers.map((timer) => (
                    <div key={timer.id} className="flex items-center justify-between p-3 border rounded-lg bg-white">
                      <div className="flex-1">
                        <div className="font-medium">{timer.label}</div>
                        <div className="text-sm text-gray-500">{timer.description}</div>
                      </div>
                      <div className="flex items-center gap-3">
                        {editingTimer?.id === timer.id ? (
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                className={`w-20 ${validationError ? 'border-red-500' : ''}`}
                                value={editingTimer.valueDays}
                                min={1}
                                max={365}
                                onChange={(e) => {
                                  const val = parseInt(e.target.value) || 0;
                                  setEditingTimer({ ...editingTimer, valueDays: val });
                                  setValidationError(validateTimer(timer, val));
                                }}
                              />
                              <span className="text-sm text-gray-500">days</span>
                              <Button 
                                size="sm" 
                                onClick={() => handleSave(timer)} 
                                disabled={saveTimerMutation.isPending || !!validationError}
                              >
                                <Save className="h-4 w-4" />
                              </Button>
                              <Button size="sm" variant="outline" onClick={() => {
                                setEditingTimer(null);
                                setValidationError(null);
                              }}>Cancel</Button>
                            </div>
                            {validationError && (
                              <p className="text-xs text-red-500 flex items-center gap-1">
                                <AlertTriangle className="h-3 w-3" />
                                {validationError}
                              </p>
                            )}
                          </div>
                        ) : (
                          <>
                            <Badge variant="outline" className="text-lg px-3 py-1">{timer.valueDays} days</Badge>
                            <Button variant="ghost" size="sm" onClick={() => setEditingTimer(timer)} data-testid={`edit-timer-${timer.timerKey}`}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {info.example && (
                  <div className="mt-4 p-3 bg-blue-50 rounded-lg border border-blue-100">
                    <p className="text-xs text-blue-700 flex items-start gap-2">
                      <Info className="h-4 w-4 shrink-0 mt-0.5" />
                      {info.example}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
        {timers.length === 0 && (
          <Card>
            <CardContent className="text-center py-8 text-gray-500">
              No coaching timers configured. Click "Seed Initial Config" on the Home tab to get started.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function NudgeSettingsTab({ settings, isLoading }: { settings: AdminNudgeSetting[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [orderedSettings, setOrderedSettings] = useState<AdminNudgeSetting[]>([]);

  useEffect(() => {
    setOrderedSettings([...settings].sort((a, b) => a.priority - b.priority));
  }, [settings]);

  const toggleNudgeMutation = useMutation({
    mutationFn: async ({ id, isEnabled }: { id: number; isEnabled: boolean }) => {
      return await apiRequest("PUT", `/api/admin/config/nudge-settings/${id}`, { isEnabled });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/nudge-settings"] });
      toast({ title: "Saved" });
    },
  });

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ id, priority }: { id: number; priority: number }) => {
      return await apiRequest("PUT", `/api/admin/config/nudge-settings/${id}`, { priority });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/nudge-settings"] });
    },
  });

  const moveNudge = async (index: number, direction: 'up' | 'down') => {
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === orderedSettings.length - 1) return;
    
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    const newOrder = [...orderedSettings];
    const [moved] = newOrder.splice(index, 1);
    newOrder.splice(newIndex, 0, moved);
    
    setOrderedSettings(newOrder);
    
    for (let i = 0; i < newOrder.length; i++) {
      const newPriority = (i + 1) * 10;
      if (newOrder[i].priority !== newPriority) {
        await updatePriorityMutation.mutateAsync({ id: newOrder[i].id, priority: newPriority });
      }
    }
    toast({ title: "Priority updated" });
  };

  if (isLoading) return <div className="text-center py-8">Loading nudge settings...</div>;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'medium': return 'bg-yellow-400 text-yellow-900';
      case 'low': return 'bg-gray-200 text-gray-700';
      default: return 'bg-gray-200 text-gray-700';
    }
  };

  const getSeverityIcon = (severity: string) => {
    switch (severity) {
      case 'critical': return '🔴';
      case 'high': return '🟠';
      case 'medium': return '🟡';
      case 'low': return '⚪';
      default: return '⚪';
    }
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Nudge Engine Settings
          </CardTitle>
          <CardDescription>
            Configure which nudges appear and their priority. Drag items to reorder - top = highest priority (shown first in "Next Best Move").
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {orderedSettings.map((s, index) => (
              <div 
                key={s.id} 
                className={`flex items-center gap-3 p-3 border rounded-lg transition-all ${
                  !s.isEnabled ? 'opacity-50 bg-gray-50' : 'bg-white hover:bg-gray-50'
                }`}
              >
                <div className="flex flex-col gap-1">
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => moveNudge(index, 'up')}
                    disabled={index === 0}
                  >
                    ▲
                  </Button>
                  <Button 
                    variant="ghost" 
                    size="sm" 
                    className="h-6 w-6 p-0"
                    onClick={() => moveNudge(index, 'down')}
                    disabled={index === orderedSettings.length - 1}
                  >
                    ▼
                  </Button>
                </div>
                <div className="flex items-center justify-center w-8 h-8 bg-purple-100 text-purple-700 rounded-full font-bold text-sm">
                  {index + 1}
                </div>
                <GripVertical className="h-5 w-5 text-gray-400 cursor-grab" />
                <Switch
                  checked={s.isEnabled ?? true}
                  onCheckedChange={(checked) => toggleNudgeMutation.mutate({ id: s.id, isEnabled: checked })}
                />
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{s.label}</span>
                    <span title={s.severity}>{getSeverityIcon(s.severity)}</span>
                  </div>
                  <p className="text-sm text-gray-500">{s.description}</p>
                </div>
                <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
              </div>
            ))}
            {orderedSettings.length === 0 && (
              <div className="text-center text-gray-500 py-8 border rounded-lg">
                No nudge settings configured. Click "Seed Initial Config" on the Home tab to get started.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* How Nudges Work Explainer */}
      <Card className="bg-blue-50 border-blue-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <Info className="h-5 w-5 text-blue-600 mt-0.5" />
            <div>
              <p className="font-medium text-blue-900">How the Nudge Engine Works</p>
              <p className="text-sm text-blue-700 mt-1">
                When a customer is viewed, the system checks all enabled nudges in priority order (top to bottom). 
                The first matching nudge becomes the "Next Best Move" shown in the Coach Panel. 
                Use severity to indicate urgency (critical items get red styling).
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ConversationScriptsTab({ scripts, isLoading }: { scripts: AdminConversationScript[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [newScript, setNewScript] = useState(false);
  const [editingScript, setEditingScript] = useState<AdminConversationScript | null>(null);
  const [formData, setFormData] = useState({
    scriptKey: "",
    title: "",
    stage: "prospect",
    persona: "all",
    situation: "",
    scriptContent: "",
  });

  const saveScriptMutation = useMutation({
    mutationFn: async (data: any) => {
      if (data.id) {
        return await apiRequest("PUT", `/api/admin/config/conversation-scripts/${data.id}`, data);
      }
      return await apiRequest("POST", "/api/admin/config/conversation-scripts", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/conversation-scripts"] });
      setNewScript(false);
      setEditingScript(null);
      toast({ title: "Saved" });
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const deleteScriptMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/admin/config/conversation-scripts/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/conversation-scripts"] });
      toast({ title: "Deleted" });
    },
  });

  useEffect(() => {
    if (editingScript) {
      setFormData({
        scriptKey: editingScript.scriptKey,
        title: editingScript.title,
        stage: editingScript.stage,
        persona: editingScript.persona,
        situation: editingScript.situation || "",
        scriptContent: editingScript.scriptContent,
      });
    }
  }, [editingScript]);

  if (isLoading) return <div className="text-center py-8">Loading scripts...</div>;

  const groupedScripts = scripts.reduce((acc, s) => {
    if (!acc[s.stage]) acc[s.stage] = [];
    acc[s.stage].push(s);
    return acc;
  }, {} as Record<string, AdminConversationScript[]>);

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setNewScript(true)} data-testid="add-script">
          <Plus className="h-4 w-4 mr-2" />
          Add Script
        </Button>
      </div>

      {Object.entries(groupedScripts).map(([stage, stageScripts]) => (
        <Card key={stage}>
          <CardHeader>
            <CardTitle className="text-lg capitalize">{stage} Stage</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {stageScripts.map((script) => (
                <div key={script.id} className="p-3 border rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{script.title}</span>
                      <Badge variant="outline">{script.persona}</Badge>
                      {script.situation && <Badge variant="secondary">{script.situation}</Badge>}
                    </div>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditingScript(script)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => {
                        if (confirm("Delete this script?")) deleteScriptMutation.mutate(script.id);
                      }}>
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  </div>
                  <p className="text-sm text-gray-600 line-clamp-2">{script.scriptContent}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      ))}

      {scripts.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-gray-500">
            No conversation scripts configured yet. Add scripts for different customer stages and personas.
          </CardContent>
        </Card>
      )}

      <Dialog open={newScript || !!editingScript} onOpenChange={(open) => {
        if (!open) {
          setNewScript(false);
          setEditingScript(null);
        }
      }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingScript ? "Edit Script" : "Add Conversation Script"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>Script Key</Label>
                <Input
                  value={formData.scriptKey}
                  onChange={(e) => setFormData({ ...formData, scriptKey: e.target.value })}
                  placeholder="e.g., prospect_intro"
                />
              </div>
              <div>
                <Label>Title</Label>
                <Input
                  value={formData.title}
                  onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  placeholder="e.g., Introduction Call"
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>Stage</Label>
                <Select value={formData.stage} onValueChange={(v) => setFormData({ ...formData, stage: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="prospect">Prospect</SelectItem>
                    <SelectItem value="expansion">Expansion</SelectItem>
                    <SelectItem value="retention">Retention</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Persona</Label>
                <Select value={formData.persona} onValueChange={(v) => setFormData({ ...formData, persona: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="distributor">Distributor</SelectItem>
                    <SelectItem value="end_customer">End Customer</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Situation</Label>
                <Input
                  value={formData.situation}
                  onChange={(e) => setFormData({ ...formData, situation: e.target.value })}
                  placeholder="e.g., cold_call"
                />
              </div>
            </div>
            <div>
              <Label>Script Content</Label>
              <Textarea
                value={formData.scriptContent}
                onChange={(e) => setFormData({ ...formData, scriptContent: e.target.value })}
                placeholder="Write your conversation script here..."
                rows={8}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setNewScript(false); setEditingScript(null); }}>Cancel</Button>
            <Button onClick={() => saveScriptMutation.mutate({ ...formData, id: editingScript?.id })} disabled={saveScriptMutation.isPending}>
              <Save className="h-4 w-4 mr-2" />
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AuditLogTab({ logs, isLoading }: { logs: AdminAuditLog[]; isLoading: boolean }) {
  const [expandedLog, setExpandedLog] = useState<number | null>(null);
  const [diffView, setDiffView] = useState<'before' | 'after' | 'diff'>('diff');

  if (isLoading) return <div className="text-center py-8">Loading audit logs...</div>;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'publish': return 'bg-purple-100 text-purple-800';
      case 'rollback': return 'bg-orange-100 text-orange-800';
      case 'seed': return 'bg-indigo-100 text-indigo-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const formatJson = (data: any): string => {
    if (!data) return 'null';
    return JSON.stringify(data, null, 2);
  };

  const getDiff = (before: any, after: any): { added: string[]; removed: string[]; changed: string[] } => {
    const added: string[] = [];
    const removed: string[] = [];
    const changed: string[] = [];

    const beforeKeys = before ? Object.keys(before) : [];
    const afterKeys = after ? Object.keys(after) : [];

    for (const key of afterKeys) {
      if (!beforeKeys.includes(key)) {
        added.push(`+ ${key}: ${JSON.stringify(after[key])}`);
      } else if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) {
        changed.push(`~ ${key}: ${JSON.stringify(before[key])} → ${JSON.stringify(after[key])}`);
      }
    }

    for (const key of beforeKeys) {
      if (!afterKeys.includes(key)) {
        removed.push(`- ${key}: ${JSON.stringify(before[key])}`);
      }
    }

    return { added, removed, changed };
  };

  const getTimeAgo = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <History className="h-5 w-5" />
            Audit Log
          </CardTitle>
          <CardDescription>
            Track all configuration changes with before/after states. Click any row to view details and diff.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {logs.map((log) => {
              const isExpanded = expandedLog === log.id;
              const diff = getDiff(log.beforeData, log.afterData);
              const hasChanges = diff.added.length > 0 || diff.removed.length > 0 || diff.changed.length > 0;

              return (
                <div key={log.id} className="border rounded-lg overflow-hidden">
                  <div 
                    className="flex items-center gap-3 p-3 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => setExpandedLog(isExpanded ? null : log.id)}
                  >
                    <div className={`transition-transform ${isExpanded ? 'rotate-90' : ''}`}>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={getActionColor(log.action)}>{log.action}</Badge>
                        <Badge variant="outline">{log.configType}</Badge>
                        {log.entityName && <span className="text-sm font-medium">{log.entityName}</span>}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                        <span>{log.userEmail || log.userId}</span>
                        <span>•</span>
                        <span title={new Date(log.createdAt).toLocaleString()}>{getTimeAgo(log.createdAt)}</span>
                      </div>
                    </div>
                    {hasChanges && (
                      <div className="flex items-center gap-1 text-xs">
                        {diff.added.length > 0 && <span className="text-green-600">+{diff.added.length}</span>}
                        {diff.changed.length > 0 && <span className="text-blue-600">~{diff.changed.length}</span>}
                        {diff.removed.length > 0 && <span className="text-red-600">-{diff.removed.length}</span>}
                      </div>
                    )}
                  </div>

                  {isExpanded && (
                    <div className="border-t bg-gray-50 p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <Button 
                          variant={diffView === 'diff' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setDiffView('diff')}
                        >
                          Diff
                        </Button>
                        <Button 
                          variant={diffView === 'before' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setDiffView('before')}
                        >
                          Before
                        </Button>
                        <Button 
                          variant={diffView === 'after' ? 'default' : 'outline'} 
                          size="sm"
                          onClick={() => setDiffView('after')}
                        >
                          After
                        </Button>
                      </div>

                      {diffView === 'diff' && (
                        <div className="space-y-2 font-mono text-xs">
                          {diff.added.map((line, i) => (
                            <div key={`add-${i}`} className="bg-green-100 text-green-800 p-1 rounded">{line}</div>
                          ))}
                          {diff.changed.map((line, i) => (
                            <div key={`change-${i}`} className="bg-blue-100 text-blue-800 p-1 rounded">{line}</div>
                          ))}
                          {diff.removed.map((line, i) => (
                            <div key={`rem-${i}`} className="bg-red-100 text-red-800 p-1 rounded">{line}</div>
                          ))}
                          {!hasChanges && (
                            <div className="text-gray-500 italic">No field-level changes detected</div>
                          )}
                        </div>
                      )}

                      {diffView === 'before' && (
                        <pre className="bg-white p-3 rounded border text-xs overflow-x-auto max-h-48">
                          {formatJson(log.beforeData)}
                        </pre>
                      )}

                      {diffView === 'after' && (
                        <pre className="bg-white p-3 rounded border text-xs overflow-x-auto max-h-48">
                          {formatJson(log.afterData)}
                        </pre>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {logs.length === 0 && (
              <div className="text-center text-gray-500 py-8 border rounded-lg">
                No audit logs yet. Changes will be tracked automatically when you modify configuration.
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Info Card */}
      <Card className="bg-amber-50 border-amber-200">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <RotateCcw className="h-5 w-5 text-amber-600 mt-0.5" />
            <div>
              <p className="font-medium text-amber-900">About Rollbacks</p>
              <p className="text-sm text-amber-700 mt-1">
                Each change is logged with before/after states. To rollback a change, view the "Before" state and manually recreate it. 
                Full automatic rollback for complex multi-item changes is coming soon.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// Territory Skip Flags Tab - Shows customers that all reps marked as "not my territory"
function TerritorySkipFlagsTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  type TerritoryFlag = {
    id: number;
    customerId: string;
    skippedByUsers: string[];
    totalActiveUsers: number;
    flaggedForAdminReview: boolean;
    adminReviewedAt: string | null;
    adminReviewedBy: string | null;
    adminDecision: string | null;
    createdAt: string;
    customerCompany: string | null;
    customerEmail: string | null;
    customerCity: string | null;
    customerProvince: string | null;
    customerCountry: string | null;
  };

  const { data: flags = [], isLoading } = useQuery<TerritoryFlag[]>({
    queryKey: ['/api/admin/territory-skip-flags'],
  });

  const decisionMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: number; decision: string }) => {
      const res = await apiRequest('POST', `/api/admin/territory-skip-flags/${id}/decision`, { decision });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to process decision');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/territory-skip-flags'] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      toast({ 
        title: "Decision Recorded", 
        description: data.message 
      });
    },
    onError: (error: Error) => {
      toast({ 
        title: "Error", 
        description: error.message, 
        variant: "destructive" 
      });
    }
  });

  if (isLoading) {
    return (
      <Card className="bg-white/60 backdrop-blur-sm border-white/20 shadow-sm">
        <CardContent className="flex items-center justify-center py-8">
          <RefreshCw className="h-6 w-6 animate-spin text-purple-600" />
          <span className="ml-2">Loading territory flags...</span>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card className="bg-white/60 backdrop-blur-sm border-white/20 shadow-sm">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-amber-600" />
            Territory Review Queue
          </CardTitle>
          <CardDescription>
            Customers that all sales reps have marked as "Not My Territory". 
            Review and decide whether to keep, delete, or reassign these records.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {flags.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <MapPin className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <p>No customers pending territory review</p>
              <p className="text-sm">When all sales reps skip a customer as "Not My Territory", it will appear here.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Skipped By</TableHead>
                  <TableHead>Flagged</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {flags.map((flag) => (
                  <TableRow key={flag.id}>
                    <TableCell className="font-medium">
                      <Link href={`/odoo-company/${flag.customerId}`} className="text-purple-600 hover:underline">
                        {flag.customerCompany || 'Unknown'}
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm text-gray-600">
                      {flag.customerEmail || '-'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {[flag.customerCity, flag.customerProvince, flag.customerCountry]
                        .filter(Boolean)
                        .join(', ') || '-'}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {flag.skippedByUsers?.length || 0} / {flag.totalActiveUsers} reps
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">
                      {flag.createdAt ? new Date(flag.createdAt).toLocaleDateString() : '-'}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex gap-2 justify-end">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-green-600 border-green-200 hover:bg-green-50"
                          onClick={() => decisionMutation.mutate({ id: flag.id, decision: 'keep' })}
                          disabled={decisionMutation.isPending}
                        >
                          <Check className="h-3 w-3 mr-1" />
                          Keep
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-red-600 border-red-200 hover:bg-red-50"
                          onClick={() => decisionMutation.mutate({ id: flag.id, decision: 'delete' })}
                          disabled={decisionMutation.isPending}
                        >
                          <Trash2 className="h-3 w-3 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// Users Management Tab
function UsersTab() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading } = useQuery<any[]>({
    queryKey: ['/api/admin/users'],
  });

  const approveMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/users/${userId}/approve`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User approved", description: "User can now access the application" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to approve user", variant: "destructive" });
    }
  });

  const rejectMutation = useMutation({
    mutationFn: async (userId: string) => {
      return apiRequest(`/api/admin/users/${userId}/reject`, { method: 'POST' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "User rejected", description: "User access has been rejected" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to reject user", variant: "destructive" });
    }
  });

  const roleMutation = useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: string }) => {
      return apiRequest(`/api/admin/users/${userId}/role`, { 
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
      toast({ title: "Role updated", description: "User role has been changed" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update role", variant: "destructive" });
    }
  });

  const pendingUsers = users.filter(u => u.status === 'pending');
  const approvedUsers = users.filter(u => u.status === 'approved');
  const rejectedUsers = users.filter(u => u.status === 'rejected');

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-center py-8">
            <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Pending Approvals */}
      {pendingUsers.length > 0 && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-800">
              <AlertCircle className="h-5 w-5" />
              Pending Approvals ({pendingUsers.length})
            </CardTitle>
            <CardDescription className="text-amber-700">
              These users are waiting for approval to access the application
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Requested</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {pendingUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium">{user.email}</TableCell>
                    <TableCell className="text-gray-500">
                      {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'Unknown'}
                    </TableCell>
                    <TableCell className="text-right space-x-2">
                      <Button
                        size="sm"
                        onClick={() => approveMutation.mutate(user.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => rejectMutation.mutate(user.id)}
                        disabled={rejectMutation.isPending}
                      >
                        <X className="h-4 w-4 mr-1" />
                        Reject
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Approved Users */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-green-600" />
            Active Users ({approvedUsers.length})
          </CardTitle>
          <CardDescription>
            Users with access to the application
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {approvedUsers.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.email}</TableCell>
                  <TableCell>
                    <Select
                      value={user.role}
                      onValueChange={(role) => roleMutation.mutate({ userId: user.id, role })}
                    >
                      <SelectTrigger className="w-32">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="user">User</SelectItem>
                        <SelectItem value="admin">Admin</SelectItem>
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                      Active
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => rejectMutation.mutate(user.id)}
                      disabled={rejectMutation.isPending}
                    >
                      <X className="h-4 w-4 mr-1" />
                      Revoke
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {approvedUsers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-gray-500 py-8">
                    No active users
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Rejected Users */}
      {rejectedUsers.length > 0 && (
        <Card className="border-gray-200">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-gray-600">
              <X className="h-5 w-5" />
              Rejected Users ({rejectedUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rejectedUsers.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell className="font-medium text-gray-500">{user.email}</TableCell>
                    <TableCell className="text-right">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => approveMutation.mutate(user.id)}
                        disabled={approveMutation.isPending}
                      >
                        <CheckCircle2 className="h-4 w-4 mr-1" />
                        Approve
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

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
import { ArrowLeft, Plus, Pencil, Trash2, Save, Settings, Layers, Clock, Bell, MessageSquare, History, RefreshCw, Database, AlertCircle, CheckCircle, Printer, Zap, Sparkles, Droplet, Maximize } from "lucide-react";
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

const ICON_MAP: Record<string, any> = {
  Printer: Printer,
  Zap: Zap,
  Sparkles: Sparkles,
  Droplet: Droplet,
  Layers: Layers,
  Maximize: Maximize,
};

export default function AdminConfig() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("taxonomy");

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
          <TabsList className="grid grid-cols-6 w-full max-w-4xl">
            <TabsTrigger value="taxonomy" className="flex items-center gap-1" data-testid="tab-taxonomy">
              <Layers className="h-4 w-4" />
              <span className="hidden sm:inline">Taxonomy</span>
            </TabsTrigger>
            <TabsTrigger value="sku-mapping" className="flex items-center gap-1" data-testid="tab-sku-mapping">
              <Database className="h-4 w-4" />
              <span className="hidden sm:inline">SKU Map</span>
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
        </Tabs>
      </div>
    </div>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{machineType ? "Edit Machine Type" : "Add Machine Type"}</DialogTitle>
          <DialogDescription>Configure a machine type for category compatibility</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="code">Code</Label>
              <Input
                id="code"
                value={formData.code}
                onChange={(e) => setFormData({ ...formData, code: e.target.value })}
                placeholder="e.g., offset"
                data-testid="machine-code-input"
              />
            </div>
            <div>
              <Label htmlFor="label">Label</Label>
              <Input
                id="label"
                value={formData.label}
                onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                placeholder="e.g., Offset"
                data-testid="machine-label-input"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label htmlFor="icon">Icon</Label>
              <Select value={formData.icon} onValueChange={(v) => setFormData({ ...formData, icon: v })}>
                <SelectTrigger>
                  <SelectValue placeholder="Select icon" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Printer">Printer</SelectItem>
                  <SelectItem value="Zap">Zap</SelectItem>
                  <SelectItem value="Sparkles">Sparkles</SelectItem>
                  <SelectItem value="Droplet">Droplet</SelectItem>
                  <SelectItem value="Layers">Layers</SelectItem>
                  <SelectItem value="Maximize">Maximize</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={formData.sortOrder}
                onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })}
                data-testid="machine-sort-input"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="description">Description</Label>
            <Textarea
              id="description"
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              placeholder="Optional description..."
              data-testid="machine-description-input"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={formData.isActive}
              onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })}
            />
            <Label>Active</Label>
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{categoryGroup ? "Edit Category Group" : "Add Category Group"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Code</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g., labels" />
            </div>
            <div>
              <Label>Label</Label>
              <Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="e.g., Labels" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Color</Label>
              <Input value={formData.color} onChange={(e) => setFormData({ ...formData, color: e.target.value })} placeholder="e.g., blue" />
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
            <Label>Active</Label>
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Edit Category" : "Add Category"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Code</Label>
              <Input value={formData.code} onChange={(e) => setFormData({ ...formData, code: e.target.value })} placeholder="e.g., graffitistick" />
            </div>
            <div>
              <Label>Label</Label>
              <Input value={formData.label} onChange={(e) => setFormData({ ...formData, label: e.target.value })} placeholder="e.g., GraffitiStick" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Group</Label>
              <Select value={formData.groupId?.toString() || ""} onValueChange={(v) => setFormData({ ...formData, groupId: v ? parseInt(v) : null })}>
                <SelectTrigger><SelectValue placeholder="Select group" /></SelectTrigger>
                <SelectContent>
                  {categoryGroups.map(g => (
                    <SelectItem key={g.id} value={g.id.toString()}>{g.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Sort Order</Label>
              <Input type="number" value={formData.sortOrder} onChange={(e) => setFormData({ ...formData, sortOrder: parseInt(e.target.value) || 0 })} />
            </div>
          </div>
          <div>
            <Label>Compatible Machine Types</Label>
            <div className="flex flex-wrap gap-2 mt-2">
              {machineTypes.map(mt => (
                <Button
                  key={mt.code}
                  type="button"
                  variant={formData.compatibleMachineTypes.includes(mt.code) ? "default" : "outline"}
                  size="sm"
                  onClick={() => toggleMachine(mt.code)}
                >
                  {mt.label}
                </Button>
              ))}
            </div>
          </div>
          <div>
            <Label>Description</Label>
            <Textarea value={formData.description} onChange={(e) => setFormData({ ...formData, description: e.target.value })} placeholder="Optional..." />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={formData.isActive} onCheckedChange={(checked) => setFormData({ ...formData, isActive: checked })} />
            <Label>Active</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => onSave({ ...formData, id: category?.id })} disabled={isPending}>
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

  const saveMappingMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/admin/config/sku-mappings", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/sku-mappings"] });
      setNewMapping(false);
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

  if (isLoading) return <div className="text-center py-8">Loading SKU mappings...</div>;

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-lg">SKU → Category Mappings</CardTitle>
          <CardDescription>Map Shopify SKUs/products to internal categories using exact, prefix, or regex rules</CardDescription>
        </div>
        <Button size="sm" onClick={() => setNewMapping(true)} data-testid="add-sku-mapping">
          <Plus className="h-4 w-4 mr-1" />
          Add Rule
        </Button>
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
              <Input 
                placeholder="Category code" 
                value={formData.categoryCode}
                onChange={(e) => setFormData({ ...formData, categoryCode: e.target.value })}
              />
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
                <TableCell>{m.categoryCode}</TableCell>
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
  );
}

function CoachingTimersTab({ timers, isLoading }: { timers: AdminCoachingTimer[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [editingTimer, setEditingTimer] = useState<AdminCoachingTimer | null>(null);

  const saveTimerMutation = useMutation({
    mutationFn: async (data: { id: number; valueDays: number }) => {
      return await apiRequest("PUT", `/api/admin/config/coaching-timers/${data.id}`, { valueDays: data.valueDays });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/config/coaching-timers"] });
      setEditingTimer(null);
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

  return (
    <div className="grid gap-4">
      {Object.entries(groupedTimers).map(([category, categoryTimers]) => (
        <Card key={category}>
          <CardHeader>
            <CardTitle className="text-lg capitalize">{category.replace(/_/g, ' ')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {categoryTimers.map((timer) => (
                <div key={timer.id} className="flex items-center justify-between p-3 border rounded-lg">
                  <div>
                    <div className="font-medium">{timer.label}</div>
                    <div className="text-sm text-gray-500">{timer.description}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    {editingTimer?.id === timer.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          className="w-20"
                          value={editingTimer.valueDays}
                          onChange={(e) => setEditingTimer({ ...editingTimer, valueDays: parseInt(e.target.value) || 0 })}
                        />
                        <span className="text-sm text-gray-500">days</span>
                        <Button size="sm" onClick={() => saveTimerMutation.mutate({ id: timer.id, valueDays: editingTimer.valueDays })} disabled={saveTimerMutation.isPending}>
                          <Save className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => setEditingTimer(null)}>Cancel</Button>
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
          </CardContent>
        </Card>
      ))}
      {timers.length === 0 && (
        <Card>
          <CardContent className="text-center py-8 text-gray-500">
            No coaching timers configured. Click "Seed Initial Config" to get started.
          </CardContent>
        </Card>
      )}
    </div>
  );
}

function NudgeSettingsTab({ settings, isLoading }: { settings: AdminNudgeSetting[]; isLoading: boolean }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();

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
      toast({ title: "Priority updated" });
    },
  });

  if (isLoading) return <div className="text-center py-8">Loading nudge settings...</div>;

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'critical': return 'bg-red-100 text-red-800';
      case 'high': return 'bg-orange-100 text-orange-800';
      case 'medium': return 'bg-yellow-100 text-yellow-800';
      case 'low': return 'bg-gray-100 text-gray-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Nudge Engine Settings</CardTitle>
        <CardDescription>Configure which nudges appear and their priority order (lower = higher priority)</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Enabled</TableHead>
              <TableHead>Nudge</TableHead>
              <TableHead>Priority</TableHead>
              <TableHead>Severity</TableHead>
              <TableHead>Description</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {settings.map((s) => (
              <TableRow key={s.id} className={!s.isEnabled ? "opacity-50" : ""}>
                <TableCell>
                  <Switch
                    checked={s.isEnabled ?? true}
                    onCheckedChange={(checked) => toggleNudgeMutation.mutate({ id: s.id, isEnabled: checked })}
                  />
                </TableCell>
                <TableCell className="font-medium">{s.label}</TableCell>
                <TableCell>
                  <Input
                    type="number"
                    className="w-16"
                    value={s.priority}
                    onChange={(e) => updatePriorityMutation.mutate({ id: s.id, priority: parseInt(e.target.value) || 0 })}
                  />
                </TableCell>
                <TableCell>
                  <Badge className={getSeverityColor(s.severity)}>{s.severity}</Badge>
                </TableCell>
                <TableCell className="text-sm text-gray-500">{s.description}</TableCell>
              </TableRow>
            ))}
            {settings.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                  No nudge settings configured. Click "Seed Initial Config" to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
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
  if (isLoading) return <div className="text-center py-8">Loading audit logs...</div>;

  const getActionColor = (action: string) => {
    switch (action) {
      case 'create': return 'bg-green-100 text-green-800';
      case 'update': return 'bg-blue-100 text-blue-800';
      case 'delete': return 'bg-red-100 text-red-800';
      case 'publish': return 'bg-purple-100 text-purple-800';
      case 'rollback': return 'bg-orange-100 text-orange-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <History className="h-5 w-5" />
          Audit Log
        </CardTitle>
        <CardDescription>Track all configuration changes with before/after states</CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>User</TableHead>
              <TableHead>Config Type</TableHead>
              <TableHead>Action</TableHead>
              <TableHead>Entity</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {logs.map((log) => (
              <TableRow key={log.id}>
                <TableCell className="text-sm text-gray-500">
                  {new Date(log.createdAt).toLocaleString()}
                </TableCell>
                <TableCell className="text-sm">{log.userEmail || log.userId}</TableCell>
                <TableCell>
                  <Badge variant="outline">{log.configType}</Badge>
                </TableCell>
                <TableCell>
                  <Badge className={getActionColor(log.action)}>{log.action}</Badge>
                </TableCell>
                <TableCell className="text-sm">{log.entityName || log.entityId || '-'}</TableCell>
              </TableRow>
            ))}
            {logs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-gray-500 py-8">
                  No audit logs yet. Changes will be tracked automatically.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

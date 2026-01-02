import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { 
  Mail, Plus, Edit2, Trash2, Send, Eye, Copy, Search, Users, 
  FileText, Variable, ChevronRight, CheckCircle, AlertCircle, Clock, Zap
} from "lucide-react";
import type { EmailTemplate, Customer, ProductPricingMaster } from "@shared/schema";
import { EMAIL_TEMPLATE_VARIABLES } from "@shared/schema";

type VariableKey = keyof typeof EMAIL_TEMPLATE_VARIABLES;

const TEMPLATE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "quote", label: "Quote Follow-up" },
  { value: "sample", label: "Sample Request" },
  { value: "follow_up", label: "Follow-up" },
  { value: "product_info", label: "Product Information" },
];

export default function EmailApp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = (user as any)?.role === "admin";
  
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductPricingMaster | null>(null);
  const [selectedPriceTier, setSelectedPriceTier] = useState<string>("dealer");
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    subject: "",
    body: "",
    category: "general",
    variables: [] as string[],
  });

  const { data: templates = [], isLoading: templatesLoading } = useQuery<EmailTemplate[]>({
    queryKey: ["/api/email/templates"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: products = [] } = useQuery<ProductPricingMaster[]>({
    queryKey: ["/api/product-pricing-master"],
  });

  const createTemplateMutation = useMutation({
    mutationFn: async (data: typeof templateForm) => {
      return await apiRequest("POST", "/api/email/templates", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      setShowTemplateEditor(false);
      resetTemplateForm();
      toast({ title: "Template created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create template", variant: "destructive" });
    },
  });

  const updateTemplateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: typeof templateForm }) => {
      return await apiRequest("PATCH", `/api/email/templates/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      setShowTemplateEditor(false);
      setEditingTemplate(null);
      resetTemplateForm();
      toast({ title: "Template updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update template", variant: "destructive" });
    },
  });

  const deleteTemplateMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/email/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      toast({ title: "Template deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete template", variant: "destructive" });
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async (data: any) => {
      return await apiRequest("POST", "/api/email/send", data);
    },
    onSuccess: () => {
      toast({ title: "Email logged successfully", description: "The email has been recorded in the system." });
      setSelectedTemplate(null);
      setSelectedCustomer(null);
      setCustomVariables({});
    },
    onError: () => {
      toast({ title: "Failed to send email", variant: "destructive" });
    },
  });

  const resetTemplateForm = () => {
    setTemplateForm({
      name: "",
      description: "",
      subject: "",
      body: "",
      category: "general",
      variables: [],
    });
  };

  const openEditTemplate = (template: EmailTemplate) => {
    setEditingTemplate(template);
    setTemplateForm({
      name: template.name,
      description: template.description || "",
      subject: template.subject,
      body: template.body,
      category: template.category || "general",
      variables: (template.variables as string[]) || [],
    });
    setShowTemplateEditor(true);
  };

  const insertVariable = (variable: string) => {
    setTemplateForm(prev => ({
      ...prev,
      body: prev.body + `{{${variable}}}`,
      variables: prev.variables.includes(variable) ? prev.variables : [...prev.variables, variable],
    }));
  };

  const getVariableValue = (key: VariableKey): string => {
    if (customVariables[key]) return customVariables[key];
    
    const variable = EMAIL_TEMPLATE_VARIABLES[key];
    
    if (variable.source === 'customer' && selectedCustomer) {
      switch (key) {
        case 'client.name':
          return selectedCustomer.company || `${selectedCustomer.firstName || ''} ${selectedCustomer.lastName || ''}`.trim() || '';
        case 'client.firstName':
          return selectedCustomer.firstName || '';
        case 'client.lastName':
          return selectedCustomer.lastName || '';
        case 'client.company':
          return selectedCustomer.company || '';
        case 'client.email':
          return selectedCustomer.email || '';
      }
    }
    
    if (variable.source === 'product' && selectedProduct) {
      switch (key) {
        case 'product.name':
          return selectedProduct.productName || '';
        case 'product.type':
          return selectedProduct.productType || '';
        case 'product.size':
          return selectedProduct.size || '';
        case 'product.itemCode':
          return selectedProduct.itemCode || '';
      }
    }
    
    if (variable.source === 'pricing' && selectedProduct) {
      const priceMap: Record<string, string | null> = {
        'price.dealer': selectedProduct.dealerPrice,
        'price.retail': selectedProduct.retailPrice,
        'price.export': selectedProduct.exportPrice,
        'price.masterDistributor': selectedProduct.masterDistributorPrice,
      };
      const price = priceMap[key];
      return price ? `$${parseFloat(price).toFixed(2)}` : '';
    }
    
    if (variable.source === 'user') {
      switch (key) {
        case 'user.name':
          const fullName = `${(user as any)?.firstName || ''} ${(user as any)?.lastName || ''}`.trim();
          return fullName || (user as any)?.email?.split('@')[0] || '';
        case 'user.email':
          return (user as any)?.email || '';
      }
    }
    
    return '';
  };

  const renderTemplate = (template: EmailTemplate) => {
    let subject = template.subject;
    let body = template.body;
    
    const vars = (template.variables as string[]) || [];
    for (const v of vars) {
      const value = getVariableValue(v as VariableKey);
      const pattern = new RegExp(`{{${v}}}`, 'g');
      subject = subject.replace(pattern, value || `[${v}]`);
      body = body.replace(pattern, value || `[${v}]`);
    }
    
    return { subject, body };
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied to clipboard" });
  };

  const handleSendEmail = () => {
    if (!selectedTemplate || !selectedCustomer) {
      toast({ title: "Please select a template and recipient", variant: "destructive" });
      return;
    }
    
    const { subject, body } = renderTemplate(selectedTemplate);
    
    sendEmailMutation.mutate({
      templateId: selectedTemplate.id,
      recipientEmail: selectedCustomer.email,
      recipientName: selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
      customerId: selectedCustomer.id,
      subject,
      body,
      variableData: customVariables,
    });
  };

  const filteredCustomers = customers.filter(c => {
    if (!customerSearch) return true;
    const search = customerSearch.toLowerCase();
    return (
      c.company?.toLowerCase().includes(search) ||
      c.firstName?.toLowerCase().includes(search) ||
      c.lastName?.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  }).slice(0, 20);

  const filteredProducts = products.filter(p => {
    if (!productSearch) return true;
    const search = productSearch.toLowerCase();
    return (
      p.productName?.toLowerCase().includes(search) ||
      p.productType?.toLowerCase().includes(search) ||
      p.itemCode?.toLowerCase().includes(search)
    );
  }).slice(0, 20);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Mail className="h-6 w-6 text-purple-600" />
            Email Studio
          </h1>
          <p className="text-gray-500 mt-1">Create and send pre-composed emails with dynamic variables</p>
        </div>
        {isAdmin && (
          <Button 
            onClick={() => { setEditingTemplate(null); resetTemplateForm(); setShowTemplateEditor(true); }}
            className="bg-purple-600 hover:bg-purple-700"
            data-testid="button-create-template"
          >
            <Plus className="h-4 w-4 mr-2" />
            Create Template
          </Button>
        )}
      </div>

      <Tabs defaultValue="compose" className="space-y-4">
        <TabsList>
          <TabsTrigger value="compose" data-testid="tab-compose">
            <Send className="h-4 w-4 mr-2" />
            Compose Email
          </TabsTrigger>
          <TabsTrigger value="templates" data-testid="tab-templates">
            <FileText className="h-4 w-4 mr-2" />
            Templates
          </TabsTrigger>
          <TabsTrigger value="drip" data-testid="tab-drip">
            <Zap className="h-4 w-4 mr-2" />
            Drip Emails
          </TabsTrigger>
        </TabsList>

        <TabsContent value="compose" className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Template Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  1. Select Template
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 max-h-[400px] overflow-y-auto">
                {templatesLoading ? (
                  <p className="text-sm text-gray-500">Loading templates...</p>
                ) : templates.length === 0 ? (
                  <p className="text-sm text-gray-500">No templates available. {isAdmin ? "Create one to get started." : "Ask an admin to create templates."}</p>
                ) : (
                  templates.filter(t => t.isActive).map(template => (
                    <div
                      key={template.id}
                      onClick={() => setSelectedTemplate(template)}
                      className={`p-3 border rounded-lg cursor-pointer transition-all ${
                        selectedTemplate?.id === template.id 
                          ? 'border-purple-500 bg-purple-50' 
                          : 'border-gray-200 hover:border-purple-300'
                      }`}
                      data-testid={`template-select-${template.id}`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium text-sm">{template.name}</span>
                        {selectedTemplate?.id === template.id && (
                          <CheckCircle className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <Badge variant="secondary" className="text-xs">
                        {TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.label || template.category}
                      </Badge>
                      {template.description && (
                        <p className="text-xs text-gray-500 mt-1 line-clamp-2">{template.description}</p>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Context Selection */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Variable className="h-5 w-5 text-green-600" />
                  2. Fill Variables
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Customer Selection */}
                <div className="space-y-2">
                  <Label className="flex items-center gap-2">
                    <Users className="h-4 w-4" />
                    Recipient
                  </Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search clients..."
                      value={customerSearch}
                      onChange={(e) => setCustomerSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-customer-search"
                    />
                  </div>
                  {customerSearch && (
                    <div className="border rounded-lg max-h-32 overflow-y-auto">
                      {filteredCustomers.map(customer => (
                        <div
                          key={customer.id}
                          onClick={() => { setSelectedCustomer(customer); setCustomerSearch(""); }}
                          className="p-2 hover:bg-gray-50 cursor-pointer text-sm border-b last:border-b-0"
                          data-testid={`customer-option-${customer.id}`}
                        >
                          <span className="font-medium">{customer.company || `${customer.firstName} ${customer.lastName}`}</span>
                          {customer.email && <span className="text-gray-500 ml-2 text-xs">{customer.email}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedCustomer && (
                    <div className="flex items-center gap-2 p-2 bg-green-50 border border-green-200 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-green-600" />
                      <span className="text-sm font-medium">
                        {selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`}
                      </span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedCustomer(null)}
                        className="ml-auto h-6 px-2"
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>

                {/* Product Selection (optional) */}
                <div className="space-y-2">
                  <Label>Product (optional)</Label>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search products..."
                      value={productSearch}
                      onChange={(e) => setProductSearch(e.target.value)}
                      className="pl-9"
                      data-testid="input-product-search"
                    />
                  </div>
                  {productSearch && (
                    <div className="border rounded-lg max-h-32 overflow-y-auto">
                      {filteredProducts.map(product => (
                        <div
                          key={product.id}
                          onClick={() => { setSelectedProduct(product); setProductSearch(""); }}
                          className="p-2 hover:bg-gray-50 cursor-pointer text-sm border-b last:border-b-0"
                          data-testid={`product-option-${product.id}`}
                        >
                          <span className="font-medium">{product.productName}</span>
                          <span className="text-gray-500 ml-2 text-xs">{product.itemCode}</span>
                        </div>
                      ))}
                    </div>
                  )}
                  {selectedProduct && (
                    <div className="flex items-center gap-2 p-2 bg-blue-50 border border-blue-200 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-blue-600" />
                      <span className="text-sm font-medium">{selectedProduct.productName}</span>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setSelectedProduct(null)}
                        className="ml-auto h-6 px-2"
                      >
                        Change
                      </Button>
                    </div>
                  )}
                </div>

                {/* Price Tier */}
                {selectedProduct && (
                  <div className="space-y-2">
                    <Label>Price Tier</Label>
                    <Select value={selectedPriceTier} onValueChange={setSelectedPriceTier}>
                      <SelectTrigger data-testid="select-price-tier">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="dealer">Dealer Price</SelectItem>
                        <SelectItem value="retail">Retail Price</SelectItem>
                        <SelectItem value="export">Export Price</SelectItem>
                        <SelectItem value="masterDistributor">Master Distributor</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                )}

                {/* Custom Variables */}
                <div className="space-y-2">
                  <Label>Custom Text (optional)</Label>
                  <Input
                    placeholder="Custom text 1..."
                    value={customVariables['custom.text1'] || ''}
                    onChange={(e) => setCustomVariables(prev => ({ ...prev, 'custom.text1': e.target.value }))}
                    data-testid="input-custom-text1"
                  />
                  <Input
                    placeholder="Custom text 2..."
                    value={customVariables['custom.text2'] || ''}
                    onChange={(e) => setCustomVariables(prev => ({ ...prev, 'custom.text2': e.target.value }))}
                    data-testid="input-custom-text2"
                  />
                </div>
              </CardContent>
            </Card>

            {/* Preview */}
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg flex items-center gap-2">
                  <Eye className="h-5 w-5 text-orange-600" />
                  3. Preview & Send
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTemplate ? (
                  <>
                    {!selectedCustomer && (
                      <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-700">Select a recipient to continue</span>
                      </div>
                    )}
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">SUBJECT</Label>
                      <div className="p-2 bg-gray-50 rounded border text-sm">
                        {renderTemplate(selectedTemplate).subject}
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label className="text-xs text-gray-500">BODY</Label>
                      <div className="p-3 bg-gray-50 rounded border text-sm whitespace-pre-wrap max-h-48 overflow-y-auto">
                        {renderTemplate(selectedTemplate).body}
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => copyToClipboard(renderTemplate(selectedTemplate).body)}
                        data-testid="button-copy-body"
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy Body
                      </Button>
                      <Button
                        className="flex-1 bg-purple-600 hover:bg-purple-700"
                        onClick={handleSendEmail}
                        disabled={!selectedCustomer || sendEmailMutation.isPending}
                        data-testid="button-send-email"
                      >
                        <Send className="h-4 w-4 mr-2" />
                        {sendEmailMutation.isPending ? "Sending..." : "Log Email"}
                      </Button>
                    </div>
                    <p className="text-xs text-gray-500 text-center">
                      This logs the email for tracking. Copy and paste into your email client to send.
                    </p>
                  </>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">Select a template to preview</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="templates" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {templates.map(template => (
              <Card key={template.id} className="relative">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-base">{template.name}</CardTitle>
                      <CardDescription className="text-xs">
                        {TEMPLATE_CATEGORIES.find(c => c.value === template.category)?.label}
                      </CardDescription>
                    </div>
                    {isAdmin && (
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => openEditTemplate(template)}
                          data-testid={`button-edit-template-${template.id}`}
                        >
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteTemplateMutation.mutate(template.id)}
                          className="text-red-600 hover:text-red-700"
                          data-testid={`button-delete-template-${template.id}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-2">
                  {template.description && (
                    <p className="text-sm text-gray-600">{template.description}</p>
                  )}
                  <div className="bg-gray-50 p-2 rounded text-xs">
                    <strong>Subject:</strong> {template.subject}
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {((template.variables as string[]) || []).map(v => (
                      <Badge key={v} variant="outline" className="text-xs">
                        {`{{${v}}}`}
                      </Badge>
                    ))}
                  </div>
                  <Badge variant={template.isActive ? "default" : "secondary"}>
                    {template.isActive ? "Active" : "Inactive"}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="drip" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Zap className="h-5 w-5 text-yellow-600" />
                Drip Email Campaigns
              </CardTitle>
              <CardDescription>
                Automated email sequences that send over time to nurture leads and follow up with customers
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mb-4">
                  <Zap className="h-8 w-8 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Coming Soon</h3>
                <p className="text-gray-500 max-w-md mb-6">
                  Create automated drip campaigns to send a series of emails over time. 
                  Set up triggers, timing, and personalized content for each step.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full max-w-2xl">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Clock className="h-6 w-6 text-purple-600 mx-auto mb-2" />
                    <h4 className="font-medium text-sm">Scheduled Sends</h4>
                    <p className="text-xs text-gray-500 mt-1">Automated timing between emails</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Users className="h-6 w-6 text-blue-600 mx-auto mb-2" />
                    <h4 className="font-medium text-sm">Segment Targeting</h4>
                    <p className="text-xs text-gray-500 mt-1">Target specific customer groups</p>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <Variable className="h-6 w-6 text-green-600 mx-auto mb-2" />
                    <h4 className="font-medium text-sm">Dynamic Content</h4>
                    <p className="text-xs text-gray-500 mt-1">Personalized variables per email</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Template Editor Dialog */}
      <Dialog open={showTemplateEditor} onOpenChange={setShowTemplateEditor}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingTemplate ? "Edit Template" : "Create New Template"}</DialogTitle>
            <DialogDescription>
              Create email templates with dynamic variables that will be filled in when composing.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Template Name</Label>
                <Input
                  value={templateForm.name}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Sample Request Follow-up"
                  data-testid="input-template-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Category</Label>
                <Select 
                  value={templateForm.category} 
                  onValueChange={(v) => setTemplateForm(prev => ({ ...prev, category: v }))}
                >
                  <SelectTrigger data-testid="select-template-category">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TEMPLATE_CATEGORIES.map(cat => (
                      <SelectItem key={cat.value} value={cat.value}>{cat.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2">
              <Label>Description (optional)</Label>
              <Input
                value={templateForm.description}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of when to use this template"
                data-testid="input-template-description"
              />
            </div>

            <div className="space-y-2">
              <Label>Subject Line</Label>
              <Input
                value={templateForm.subject}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, subject: e.target.value }))}
                placeholder="e.g., Following up on your sample request"
                data-testid="input-template-subject"
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Email Body</Label>
                <span className="text-xs text-gray-500">Click a variable below to insert it</span>
              </div>
              <Textarea
                value={templateForm.body}
                onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                placeholder="Hello {{client.name}},

Did you know our price of {{product.type}} is {{price.dealer}}? Let me know if you would like to see some samples.

Best regards,
{{user.name}}"
                className="min-h-[200px] font-mono text-sm"
                data-testid="textarea-template-body"
              />
            </div>

            {/* Variable Chips */}
            <div className="space-y-2">
              <Label className="text-sm">Available Variables</Label>
              <div className="flex flex-wrap gap-2 p-3 bg-gray-50 rounded-lg border">
                {Object.entries(EMAIL_TEMPLATE_VARIABLES).map(([key, info]) => (
                  <Button
                    key={key}
                    variant="outline"
                    size="sm"
                    onClick={() => insertVariable(key)}
                    className="h-7 text-xs"
                    title={info.description}
                    data-testid={`variable-${key}`}
                  >
                    <Variable className="h-3 w-3 mr-1" />
                    {info.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4">
              <Button variant="outline" onClick={() => setShowTemplateEditor(false)}>
                Cancel
              </Button>
              <Button
                onClick={() => {
                  if (editingTemplate) {
                    updateTemplateMutation.mutate({ id: editingTemplate.id, data: templateForm });
                  } else {
                    createTemplateMutation.mutate(templateForm);
                  }
                }}
                disabled={!templateForm.name || !templateForm.subject || !templateForm.body}
                className="bg-purple-600 hover:bg-purple-700"
                data-testid="button-save-template"
              >
                {editingTemplate ? "Update Template" : "Create Template"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

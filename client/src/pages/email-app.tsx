import { useState, useRef, useEffect, useMemo } from "react";
import DOMPurify from 'dompurify';
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import { useLocation, Link } from "wouter";
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
  FileText, Variable, ChevronRight, CheckCircle, AlertCircle, Clock, Zap, PenTool, Save, Loader2,
  Smartphone, Monitor, Sun, Moon, ArrowLeft
} from "lucide-react";
import type { EmailTemplate, Customer, ProductPricingMaster, EmailSignature } from "@shared/schema";
import { EMAIL_TEMPLATE_VARIABLES } from "@shared/schema";
import DripCampaignBuilder from "@/components/DripCampaignBuilder";
import { EmailRichTextEditor, type EmailRichTextEditorRef } from "@/components/EmailRichTextEditor";

type VariableKey = keyof typeof EMAIL_TEMPLATE_VARIABLES;

const TEMPLATE_CATEGORIES = [
  { value: "general", label: "General" },
  { value: "marketing", label: "Marketing Email" },
  { value: "follow_up", label: "Follow Up Emails" },
  { value: "product_info", label: "Product Information" },
  { value: "account_payments", label: "Account/Payments" },
  { value: "other", label: "Other" },
];

const TEMPLATE_USAGE_TYPES = [
  { value: "quick_quotes", label: "QuickQuotes" },
  { value: "price_list", label: "Price List" },
  { value: "client_email", label: "Client Email" },
  { value: "marketing", label: "Marketing Emails" },
];

export default function EmailApp() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [location] = useLocation();
  const isAdmin = (user as any)?.role === "admin";
  
  // Parse URL query params for pre-filling recipient from Leads/Contacts pages
  const urlParams = useMemo(() => {
    const search = typeof window !== 'undefined' ? window.location.search : '';
    return new URLSearchParams(search);
  }, [location]);
  
  const prefilledRecipient = useMemo(() => {
    const to = urlParams.get('to');
    const recipientName = urlParams.get('recipientName');
    if (to) {
      return {
        email: to,
        name: recipientName || to,
        usageType: urlParams.get('usageType') || 'lead_email',
      };
    }
    return null;
  }, [urlParams]);
  
  const [selectedTemplate, setSelectedTemplate] = useState<EmailTemplate | null>(null);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [manualRecipient, setManualRecipient] = useState<{ email: string; name: string } | null>(null);
  const [selectedProduct, setSelectedProduct] = useState<ProductPricingMaster | null>(null);
  const [selectedPriceTier, setSelectedPriceTier] = useState<string>("dealer");
  const [customVariables, setCustomVariables] = useState<Record<string, string>>({});
  const [customerSearch, setCustomerSearch] = useState("");
  const [productSearch, setProductSearch] = useState("");
  const [showTemplateEditor, setShowTemplateEditor] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<EmailTemplate | null>(null);
  const [templateToDelete, setTemplateToDelete] = useState<EmailTemplate | null>(null);
  const [templateBodyMode, setTemplateBodyMode] = useState<'visual' | 'html'>('visual');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [templateToPreview, setTemplateToPreview] = useState<EmailTemplate | null>(null);
  const [templateForm, setTemplateForm] = useState({
    name: "",
    description: "",
    subject: "",
    body: "",
    category: "general",
    usageType: "client_email",
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

  const { data: userSignature } = useQuery<EmailSignature | null>({
    queryKey: ["/api/email/signature"],
  });

  const [signatureForm, setSignatureForm] = useState({
    name: "",
    title: "",
    phone: "",
    cellPhone: "",
    signatureHtml: "",
  });

  useEffect(() => {
    if (userSignature) {
      setSignatureForm({
        name: userSignature.name || "",
        title: userSignature.title || "",
        phone: userSignature.phone || "",
        cellPhone: (userSignature as any).cellPhone || "",
        signatureHtml: userSignature.signatureHtml || "",
      });
    }
  }, [userSignature]);

  // Build the 4S Graphics branded signature HTML
  function buildFourSSignatureHtml(name: string, cellPhone: string): string {
    const escapedName = (name || 'Your Name').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const escapedPhone = (cellPhone || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const cellLine = escapedPhone
      ? `\n  <div style="font-weight: bold; margin-bottom: 4px; color: #22963e;">C: ${escapedPhone}</div>`
      : '';
    return `<div style="font-family: Arial, sans-serif; font-size: 14px; color: #333; line-height: 1.5;">
  <img src="${window.location.origin}/4s-logo.png" alt="4S Graphics" style="width: 60px; height: auto; margin-bottom: 6px; display: block;" />
  <div style="font-weight: bold; margin-bottom: 10px; color: #333;">Synthetic &amp; Specialty Substrates Suppliers</div>
  <div style="margin-bottom: 6px; color: #333;">-</div>
  <div style="font-weight: bold; margin-bottom: 4px; color: #333;">${escapedName}</div>${cellLine}
  <div style="font-weight: bold; margin-bottom: 4px; color: #333;">T. (954) 493.6484 x 101</div>
  <div style="margin-bottom: 4px; color: #333;">764 NW 57th Court, Fort Lauderdale, FL - 33309</div>
  <div><a href="https://www.4sgraphics.com" style="color: #22963e; text-decoration: none;">www.4sgraphics.com</a></div>
</div>`;
  }
  
  // Set manual recipient from URL params (from Lead/Contact compose links)
  useEffect(() => {
    if (prefilledRecipient && !selectedCustomer && !manualRecipient) {
      setManualRecipient({
        email: prefilledRecipient.email,
        name: prefilledRecipient.name,
      });
    }
  }, [prefilledRecipient]);

  const saveSignatureMutation = useMutation({
    mutationFn: async (data: typeof signatureForm) => {
      return await apiRequest("POST", "/api/email/signature", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/signature"] });
      toast({ title: "Signature saved successfully" });
    },
    onError: () => {
      toast({ title: "Failed to save signature", variant: "destructive" });
    },
  });

  const editorRef = useRef<EmailRichTextEditorRef>(null);

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
      if (!id || isNaN(id)) throw new Error("Invalid template ID");
      return await apiRequest("DELETE", `/api/email/templates/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/templates"] });
      setTemplateToDelete(null);
      if (selectedTemplate && selectedTemplate.id === templateToDelete?.id) {
        setSelectedTemplate(null);
      }
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
      usageType: "client_email",
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
      usageType: (template as any).usageType || "client_email",
      variables: (template.variables as string[]) || [],
    });
    setShowTemplateEditor(true);
  };

  const insertVariable = (variable: string) => {
    if (editorRef.current) {
      editorRef.current.insertContent(`{{${variable}}}`);
    }
    setTemplateForm(prev => ({
      ...prev,
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
        case 'client.salesRep':
          return selectedCustomer.salesRepName || '';
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
        case 'user.signature':
          return userSignature?.signatureHtml || '';
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
    const recipient = selectedCustomer 
      ? { 
          email: selectedCustomer.email, 
          name: selectedCustomer.company || `${selectedCustomer.firstName} ${selectedCustomer.lastName}`,
          customerId: selectedCustomer.id,
        }
      : manualRecipient 
        ? { email: manualRecipient.email, name: manualRecipient.name, customerId: null }
        : null;
    
    if (!selectedTemplate || !recipient) {
      toast({ title: "Please select a template and recipient", variant: "destructive" });
      return;
    }
    
    const { subject, body } = renderTemplate(selectedTemplate);
    
    sendEmailMutation.mutate({
      templateId: selectedTemplate.id,
      recipientEmail: recipient.email,
      recipientName: recipient.name,
      customerId: recipient.customerId,
      subject,
      body,
      htmlBody: body,
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
      <div className="flex items-center gap-2 mb-4">
        <Link href="/">
          <Button variant="ghost" size="sm" className="gap-1 text-gray-500 hover:text-gray-700">
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </Button>
        </Link>
      </div>
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
          <TabsTrigger value="signature" data-testid="tab-signature">
            <PenTool className="h-4 w-4 mr-2" />
            Signature
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
                        <div className="flex items-center gap-1">
                          {(isAdmin || template.createdBy === user?.id) && (
                            <>
                              <button
                                onClick={(e) => { e.stopPropagation(); openEditTemplate(template); }}
                                className="p-1 rounded hover:bg-purple-100 text-gray-400 hover:text-purple-600 transition-colors"
                                title="Edit template"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setTemplateToDelete(template); }}
                                className="p-1 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                                title="Delete template"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                          {selectedTemplate?.id === template.id && (
                            <CheckCircle className="h-4 w-4 text-purple-600" />
                          )}
                        </div>
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
                  {!selectedCustomer && manualRecipient && (
                    <div className="flex items-center gap-2 p-2 bg-emerald-50 border border-emerald-200 rounded-lg">
                      <CheckCircle className="h-4 w-4 text-emerald-600" />
                      <div className="text-sm">
                        <span className="font-medium">{manualRecipient.name}</span>
                        <span className="text-emerald-600 ml-2 text-xs">{manualRecipient.email}</span>
                      </div>
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setManualRecipient(null)}
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
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Eye className="h-5 w-5 text-orange-600" />
                    3. Preview & Send
                  </CardTitle>
                  {selectedTemplate && (
                    <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                      <button
                        onClick={() => setPreviewDevice('mobile')}
                        className={`p-1.5 rounded-md transition-all ${previewDevice === 'mobile' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Mobile preview"
                      >
                        <Smartphone className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPreviewDevice('desktop')}
                        className={`p-1.5 rounded-md transition-all ${previewDevice === 'desktop' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Desktop preview"
                      >
                        <Monitor className="h-4 w-4" />
                      </button>
                      <div className="w-px h-5 bg-gray-300 mx-0.5" />
                      <button
                        onClick={() => setPreviewTheme('light')}
                        className={`p-1.5 rounded-md transition-all ${previewTheme === 'light' ? 'bg-white shadow-sm text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Light mode"
                      >
                        <Sun className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setPreviewTheme('dark')}
                        className={`p-1.5 rounded-md transition-all ${previewTheme === 'dark' ? 'bg-gray-700 shadow-sm text-blue-300' : 'text-gray-400 hover:text-gray-600'}`}
                        title="Dark mode"
                      >
                        <Moon className="h-4 w-4" />
                      </button>
                    </div>
                  )}
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedTemplate ? (
                  <>
                    {!selectedCustomer && !manualRecipient && (
                      <div className="flex items-center gap-2 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-yellow-600" />
                        <span className="text-sm text-yellow-700">Select a recipient to continue</span>
                      </div>
                    )}

                    <div className="flex justify-center">
                      <div
                        className={`relative transition-all duration-300 ${
                          previewDevice === 'mobile' ? 'w-[320px]' : 'w-full max-w-[600px]'
                        }`}
                      >
                        {previewDevice === 'mobile' && (
                          <div className={`rounded-[2.5rem] border-[6px] p-1 shadow-xl ${
                            previewTheme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-100'
                          }`}>
                            <div className={`w-12 h-1.5 rounded-full mx-auto mt-1 mb-2 ${
                              previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                            }`} />
                            <div className={`rounded-[1.8rem] overflow-hidden ${
                              previewTheme === 'dark' ? 'bg-gray-900' : 'bg-white'
                            }`}>
                              <div className={`px-4 py-2.5 border-b ${
                                previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                              }`}>
                                <div className="flex items-center gap-2 mb-1.5">
                                  <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                                    previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'
                                  }`}>
                                    {(user as any)?.email?.[0]?.toUpperCase() || 'Y'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className={`text-xs font-semibold truncate ${
                                      previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                                    }`}>
                                      {(user as any)?.email || 'You'}
                                    </p>
                                    <p className={`text-[10px] truncate ${
                                      previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                    }`}>
                                      to {selectedCustomer?.email || manualRecipient?.email || 'recipient'}
                                    </p>
                                  </div>
                                  <span className={`text-[10px] ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Now</span>
                                </div>
                                <p className={`text-sm font-semibold truncate ${
                                  previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                                }`}>
                                  {renderTemplate(selectedTemplate).subject}
                                </p>
                              </div>
                              <iframe
                                title="Email preview"
                                style={{ width: '100%', minHeight: '400px', border: 'none', background: '#ffffff' }}
                                sandbox="allow-same-origin"
                                srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0">${renderTemplate(selectedTemplate).body}</body></html>`}
                              />
                            </div>
                            <div className={`w-16 h-1.5 rounded-full mx-auto mt-2 mb-1 ${
                              previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                            }`} />
                          </div>
                        )}

                        {previewDevice === 'desktop' && (
                          <div className={`rounded-xl border shadow-lg overflow-hidden ${
                            previewTheme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
                          }`}>
                            <div className={`px-4 py-3 border-b ${
                              previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                            }`}>
                              <div className="flex items-center gap-2 mb-2">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                                  previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'
                                }`}>
                                  {(user as any)?.email?.[0]?.toUpperCase() || 'Y'}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <p className={`text-sm font-semibold ${
                                    previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                                  }`}>
                                    {(user as any)?.email || 'You'}
                                  </p>
                                  <p className={`text-xs ${
                                    previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                                  }`}>
                                    to {selectedCustomer?.email || manualRecipient?.email || 'recipient'}
                                  </p>
                                </div>
                                <span className={`text-xs ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Just now</span>
                              </div>
                              <p className={`text-base font-semibold ${
                                previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                              }`}>
                                {renderTemplate(selectedTemplate).subject}
                              </p>
                            </div>
                            <iframe
                              title="Email preview"
                              style={{ width: '100%', minHeight: '400px', border: 'none', background: '#ffffff' }}
                              sandbox="allow-same-origin"
                              srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0">${renderTemplate(selectedTemplate).body}</body></html>`}
                            />
                          </div>
                        )}
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
                        disabled={(!selectedCustomer && !manualRecipient) || sendEmailMutation.isPending}
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
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setTemplateToPreview(template)}
                        className="text-gray-500 hover:text-orange-600 hover:bg-orange-50"
                        title="Preview template"
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      {(isAdmin || template.createdBy === user?.id) && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditTemplate(template)}
                            className="text-gray-500 hover:text-purple-600 hover:bg-purple-50"
                            data-testid={`button-edit-template-${template.id}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setTemplateToDelete(template)}
                            className="text-gray-500 hover:text-red-600 hover:bg-red-50"
                            data-testid={`button-delete-template-${template.id}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
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
          <DripCampaignBuilder />
        </TabsContent>

        <TabsContent value="signature" className="space-y-4">
          <Card className="max-w-2xl">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <PenTool className="h-5 w-5 text-purple-600" />
                Email Signature
              </CardTitle>
              <CardDescription>
                Your signature is automatically appended to every email you send. Fill in your name and cell phone, then click "Generate Signature" to build a branded 4S Graphics signature.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {!userSignature && (
                <div className="flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="w-5 h-5 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5">
                    <span className="text-white text-xs font-bold">!</span>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-amber-800">Signature required before sending emails</p>
                    <p className="text-xs text-amber-700 mt-0.5">Set up your signature below so recipients know who you are. Every outgoing email will include it automatically.</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Your Name <span className="text-red-500">*</span></Label>
                  <Input
                    value={signatureForm.name}
                    onChange={(e) => setSignatureForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="Aneesh Prabhu"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Cell Phone <span className="text-gray-400 text-xs">(shown in green if set)</span></Label>
                  <Input
                    value={signatureForm.cellPhone}
                    onChange={(e) => setSignatureForm(prev => ({ ...prev, cellPhone: e.target.value }))}
                    placeholder="(260) 580.0526"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 border-green-300 text-green-700 hover:bg-green-50"
                  onClick={() => setSignatureForm(prev => ({
                    ...prev,
                    signatureHtml: buildFourSSignatureHtml(prev.name, prev.cellPhone),
                  }))}
                  disabled={!signatureForm.name}
                >
                  <Zap className="h-3.5 w-3.5" />
                  Generate 4S Graphics Signature
                </Button>
                <p className="text-xs text-gray-400">Auto-builds the branded signature with logo, office phone & address.</p>
              </div>
              <div className="space-y-2">
                <Label>Signature HTML <span className="text-gray-400 text-xs">(auto-generated or custom)</span></Label>
                <EmailRichTextEditor
                  content={signatureForm.signatureHtml}
                  onChange={(html) => setSignatureForm(prev => ({ ...prev, signatureHtml: html }))}
                  placeholder="Click 'Generate 4S Graphics Signature' above, or write your own…"
                />
              </div>
              <div className="flex items-center justify-between pt-4">
                <p className="text-sm text-gray-500">
                  Your signature is appended to every email you send.
                </p>
                <Button
                  onClick={() => saveSignatureMutation.mutate(signatureForm)}
                  disabled={saveSignatureMutation.isPending || !signatureForm.signatureHtml || !signatureForm.name}
                  className="bg-purple-600 hover:bg-purple-700"
                >
                  {saveSignatureMutation.isPending ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4 mr-2" />
                  )}
                  Save Signature
                </Button>
              </div>
              {signatureForm.signatureHtml && (
                <div className="pt-4 border-t">
                  <Label className="text-sm text-gray-500">Preview:</Label>
                  <div 
                    className="mt-2 p-4 bg-white rounded-lg border prose prose-sm max-w-none"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(signatureForm.signatureHtml || '') }}
                  />
                </div>
              )}
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
            <div className="space-y-2">
              <Label className="text-base font-semibold">Where do you want to use this template?</Label>
              <Select 
                value={templateForm.usageType} 
                onValueChange={(v) => setTemplateForm(prev => ({ ...prev, usageType: v }))}
              >
                <SelectTrigger data-testid="select-template-usage" className="w-full">
                  <SelectValue placeholder="Select where to use this template" />
                </SelectTrigger>
                <SelectContent>
                  {TEMPLATE_USAGE_TYPES.map(type => (
                    <SelectItem key={type.value} value={type.value}>{type.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

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
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px' }}>
                <Label>Email Body</Label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span className="text-xs text-gray-500">Use the toolbar to format text, or click a variable below to insert it</span>
                  <div style={{ display: 'flex', border: '0.5px solid var(--color-border-secondary)', borderRadius: '7px', overflow: 'hidden' }}>
                    <button
                      type="button"
                      onClick={() => setTemplateBodyMode('visual')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                        background: templateBodyMode === 'visual' ? '#1a1a1a' : 'transparent',
                        color: templateBodyMode === 'visual' ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      Visual
                    </button>
                    <button
                      type="button"
                      onClick={() => setTemplateBodyMode('html')}
                      style={{
                        padding: '4px 10px',
                        fontSize: '12px',
                        fontWeight: 500,
                        border: 'none',
                        cursor: 'pointer',
                        background: templateBodyMode === 'html' ? '#1a1a1a' : 'transparent',
                        color: templateBodyMode === 'html' ? '#fff' : 'var(--color-text-secondary)',
                      }}
                    >
                      {'</>'} HTML
                    </button>
                  </div>
                </div>
              </div>
              {templateBodyMode === 'visual' ? (
                <EmailRichTextEditor
                  content={templateForm.body}
                  onChange={(html) => setTemplateForm(prev => ({ ...prev, body: html }))}
                  placeholder="Hello {{client.name}},

Start typing your email content here. Use the toolbar above to format text, add links, or insert images."
                  ref={editorRef}
                />
              ) : (
                <textarea
                  value={templateForm.body}
                  onChange={(e) => setTemplateForm(prev => ({ ...prev, body: e.target.value }))}
                  placeholder="Paste your HTML email code here..."
                  style={{
                    width: '100%',
                    minHeight: '360px',
                    fontFamily: 'monospace',
                    fontSize: '12px',
                    lineHeight: '1.6',
                    padding: '12px',
                    border: '1px solid var(--color-border-secondary)',
                    borderRadius: '8px',
                    background: 'var(--color-background-secondary)',
                    color: 'var(--color-text-primary)',
                    resize: 'vertical',
                    outline: 'none',
                    boxSizing: 'border-box',
                  }}
                  spellCheck={false}
                />
              )}
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

      <Dialog open={!!templateToPreview} onOpenChange={(open) => { if (!open) setTemplateToPreview(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-orange-600" />
                {templateToPreview?.name}
              </DialogTitle>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 mr-6">
                <button
                  onClick={() => setPreviewDevice('mobile')}
                  className={`p-1.5 rounded-md transition-all ${previewDevice === 'mobile' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Mobile preview"
                >
                  <Smartphone className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewDevice('desktop')}
                  className={`p-1.5 rounded-md transition-all ${previewDevice === 'desktop' ? 'bg-white shadow-sm text-purple-600' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Desktop preview"
                >
                  <Monitor className="h-4 w-4" />
                </button>
                <div className="w-px h-5 bg-gray-300 mx-0.5" />
                <button
                  onClick={() => setPreviewTheme('light')}
                  className={`p-1.5 rounded-md transition-all ${previewTheme === 'light' ? 'bg-white shadow-sm text-amber-500' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Light mode"
                >
                  <Sun className="h-4 w-4" />
                </button>
                <button
                  onClick={() => setPreviewTheme('dark')}
                  className={`p-1.5 rounded-md transition-all ${previewTheme === 'dark' ? 'bg-gray-700 shadow-sm text-blue-300' : 'text-gray-400 hover:text-gray-600'}`}
                  title="Dark mode"
                >
                  <Moon className="h-4 w-4" />
                </button>
              </div>
            </div>
            <DialogDescription>
              {TEMPLATE_CATEGORIES.find(c => c.value === templateToPreview?.category)?.label || templateToPreview?.category}
            </DialogDescription>
          </DialogHeader>

          {templateToPreview && (
            <div className="flex justify-center py-2">
              <div className={`transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[320px]' : 'w-full'}`}>
                {previewDevice === 'mobile' ? (
                  <div className={`rounded-[2.5rem] border-[6px] p-1 shadow-xl ${
                    previewTheme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-100'
                  }`}>
                    <div className={`w-12 h-1.5 rounded-full mx-auto mt-1 mb-2 ${
                      previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`} />
                    <div className={`rounded-[1.8rem] overflow-hidden ${
                      previewTheme === 'dark' ? 'bg-gray-900' : 'bg-white'
                    }`}>
                      <div className={`px-4 py-2.5 border-b ${
                        previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                      }`}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${
                            previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'
                          }`}>
                            {(user as any)?.email?.[0]?.toUpperCase() || 'Y'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-xs font-semibold truncate ${
                              previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                            }`}>
                              {(user as any)?.email || 'You'}
                            </p>
                            <p className={`text-[10px] truncate ${
                              previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                            }`}>
                              to recipient@example.com
                            </p>
                          </div>
                          <span className={`text-[10px] ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Now</span>
                        </div>
                        <p className={`text-sm font-semibold truncate ${
                          previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                        }`}>
                          {templateToPreview.subject}
                        </p>
                      </div>
                      <iframe
                        title="Email preview"
                        style={{ width: '100%', minHeight: '500px', border: 'none', background: '#ffffff' }}
                        sandbox="allow-same-origin"
                        srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0">${templateToPreview.body || ''}</body></html>`}
                      />
                    </div>
                    <div className={`w-16 h-1.5 rounded-full mx-auto mt-2 mb-1 ${
                      previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'
                    }`} />
                  </div>
                ) : (
                  <div className={`rounded-xl border shadow-lg overflow-hidden ${
                    previewTheme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'
                  }`}>
                    <div className={`px-4 py-3 border-b ${
                      previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'
                    }`}>
                      <div className="flex items-center gap-2 mb-2">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${
                          previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'
                        }`}>
                          {(user as any)?.email?.[0]?.toUpperCase() || 'Y'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-semibold ${
                            previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                          }`}>
                            {(user as any)?.email || 'You'}
                          </p>
                          <p className={`text-xs ${
                            previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'
                          }`}>
                            to recipient@example.com
                          </p>
                        </div>
                        <span className={`text-xs ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Just now</span>
                      </div>
                      <p className={`text-base font-semibold ${
                        previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                      }`}>
                        {templateToPreview.subject}
                      </p>
                    </div>
                    <iframe
                      title="Email preview"
                      style={{ width: '100%', minHeight: '500px', border: 'none', background: '#ffffff' }}
                      sandbox="allow-same-origin"
                      srcDoc={`<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body style="margin:0;padding:0">${templateToPreview.body || ''}</body></html>`}
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-between items-center pt-2 border-t">
            <div className="flex gap-2">
              {(isAdmin || templateToPreview?.createdBy === user?.id) && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (templateToPreview) {
                        openEditTemplate(templateToPreview);
                        setTemplateToPreview(null);
                      }
                    }}
                    className="text-purple-600 hover:bg-purple-50"
                  >
                    <Edit2 className="h-4 w-4 mr-1.5" />
                    Edit
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (templateToPreview) {
                        setTemplateToDelete(templateToPreview);
                        setTemplateToPreview(null);
                      }
                    }}
                    className="text-red-600 hover:bg-red-50"
                  >
                    <Trash2 className="h-4 w-4 mr-1.5" />
                    Delete
                  </Button>
                </>
              )}
            </div>
            <Button variant="outline" onClick={() => setTemplateToPreview(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!templateToDelete} onOpenChange={(open) => { if (!open) setTemplateToDelete(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="h-5 w-5" />
              Delete Template
            </DialogTitle>
            <DialogDescription>
              Are you sure you want to delete "<strong>{templateToDelete?.name}</strong>"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-3 mt-4">
            <Button
              variant="outline"
              onClick={() => setTemplateToDelete(null)}
              disabled={deleteTemplateMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (templateToDelete?.id) {
                  deleteTemplateMutation.mutate(templateToDelete.id);
                }
              }}
              disabled={deleteTemplateMutation.isPending}
            >
              {deleteTemplateMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="h-4 w-4 mr-2" />Delete Template</>
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

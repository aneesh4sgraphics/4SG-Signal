import { useState, useCallback, useRef } from "react";
import DOMPurify from 'dompurify';

function isFullHtmlDoc(html: string): boolean {
  const t = (html || '').trim().toLowerCase();
  return t.startsWith('<!doctype') || t.startsWith('<html');
}

function buildSrcDoc(body: string, bg: string, fg: string, padding: string, fontSize: string): string {
  if (isFullHtmlDoc(body)) return body;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;padding:${padding};font-family:sans-serif;font-size:${fontSize};line-height:1.6;background:${bg};color:${fg}}img{max-width:100%}</style></head><body>${body || '<p style="color:#9ca3af;padding:8px 0">No content yet</p>'}</body></html>`;
}
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useAuth } from "@/hooks/useAuth";
import type { Editor } from '@tiptap/react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useToast } from "@/hooks/use-toast";
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Underline from '@tiptap/extension-underline';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import TextAlign from '@tiptap/extension-text-align';
import Placeholder from '@tiptap/extension-placeholder';
import { 
  Plus, Edit2, Trash2, ChevronRight, ChevronLeft, Clock, Users, 
  Zap, Play, Pause, GripVertical, Mail, ArrowRight, Eye, Variable,
  Bold, Italic, Underline as UnderlineIcon, List, ListOrdered, 
  AlignLeft, AlignCenter, AlignRight, Link as LinkIcon, Image as ImageIcon,
  X, Check, Search, UserPlus, Smartphone, Monitor, Sun, Moon
} from "lucide-react";
import type { DripCampaign, DripCampaignStep, Customer } from "@shared/schema";
import { EMAIL_TEMPLATE_VARIABLES } from "@shared/schema";

type ViewMode = "list" | "editor" | "assign";

interface CampaignWithSteps extends DripCampaign {
  steps?: DripCampaignStep[];
}

const DELAY_UNITS = [
  { value: "minutes", label: "Minutes" },
  { value: "hours", label: "Hours" },
  { value: "days", label: "Days" },
  { value: "weeks", label: "Weeks" },
];

const TRIGGER_TYPES = [
  { value: "manual", label: "Manual Assignment" },
  { value: "on_signup", label: "On Customer Signup" },
  { value: "on_purchase", label: "On Purchase" },
  { value: "on_quote", label: "On Quote Sent" },
];

export default function DripCampaignBuilder() {
  const { user } = useAuth();
  const { toast } = useToast();
  const isAdmin = (user as any)?.role === "admin";
  
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [selectedCampaign, setSelectedCampaign] = useState<CampaignWithSteps | null>(null);
  const [editingStep, setEditingStep] = useState<DripCampaignStep | null>(null);
  const [showStepEditor, setShowStepEditor] = useState(false);
  const [showCampaignDialog, setShowCampaignDialog] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [bodyEditorMode, setBodyEditorMode] = useState<'visual' | 'html'>('visual');
  const [previewDevice, setPreviewDevice] = useState<'mobile' | 'desktop'>('mobile');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [assignTarget, setAssignTarget] = useState<'customers' | 'leads'>('leads');
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [leadSearch, setLeadSearch] = useState("");
  const editorRef = useRef<Editor | null>(null);
  
  const [campaignForm, setCampaignForm] = useState({
    name: "",
    description: "",
    triggerType: "manual",
    isActive: false,
  });
  
  const [stepForm, setStepForm] = useState({
    name: "",
    subject: "",
    body: "",
    delayAmount: 0,
    delayUnit: "days",
    isActive: true,
  });

  const { data: campaigns = [], isLoading: campaignsLoading } = useQuery<DripCampaign[]>({
    queryKey: ["/api/drip-campaigns"],
  });

  const { data: assignmentCounts = [] } = useQuery<{ campaignId: number; count: number; leadCount?: number }[]>({
    queryKey: ["/api/drip-campaigns/assignment-counts"],
  });

  const getAssignmentCount = (campaignId: number) => {
    const found = assignmentCounts.find(a => a.campaignId === campaignId);
    return found?.count || 0;
  };

  const getLeadCount = (campaignId: number) => {
    const found = assignmentCounts.find(a => a.campaignId === campaignId);
    return found?.leadCount || 0;
  };

  const { data: campaignDetails } = useQuery<CampaignWithSteps>({
    queryKey: ["/api/drip-campaigns", selectedCampaign?.id],
    enabled: !!selectedCampaign?.id,
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: leads = [] } = useQuery<any[]>({
    queryKey: ['/api/leads'],
    enabled: viewMode === 'assign',
  });

  const createCampaignMutation = useMutation({
    mutationFn: async (data: typeof campaignForm) => {
      return await apiRequest("POST", "/api/drip-campaigns", data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      setShowCampaignDialog(false);
      setCampaignForm({ name: "", description: "", triggerType: "manual", isActive: false });
      toast({ title: "Campaign created successfully" });
    },
    onError: () => {
      toast({ title: "Failed to create campaign", variant: "destructive" });
    },
  });

  const updateCampaignMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<typeof campaignForm> }) => {
      return await apiRequest("PATCH", `/api/drip-campaigns/${id}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      toast({ title: "Campaign updated" });
    },
    onError: () => {
      toast({ title: "Failed to update campaign", variant: "destructive" });
    },
  });

  const deleteCampaignMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest("DELETE", `/api/drip-campaigns/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      setSelectedCampaign(null);
      setViewMode("list");
      toast({ title: "Campaign deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete campaign", variant: "destructive" });
    },
  });

  const createStepMutation = useMutation({
    mutationFn: async (data: typeof stepForm & { campaignId: number }) => {
      return await apiRequest("POST", `/api/drip-campaigns/${data.campaignId}/steps`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns", selectedCampaign?.id] });
      setShowStepEditor(false);
      resetStepForm();
      toast({ title: "Step added" });
    },
    onError: () => {
      toast({ title: "Failed to add step", variant: "destructive" });
    },
  });

  const updateStepMutation = useMutation({
    mutationFn: async ({ campaignId, stepId, data }: { campaignId: number; stepId: number; data: Partial<typeof stepForm> }) => {
      return await apiRequest("PATCH", `/api/drip-campaigns/${campaignId}/steps/${stepId}`, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns", selectedCampaign?.id] });
      setShowStepEditor(false);
      setEditingStep(null);
      resetStepForm();
      toast({ title: "Step updated" });
    },
    onError: () => {
      toast({ title: "Failed to update step", variant: "destructive" });
    },
  });

  const deleteStepMutation = useMutation({
    mutationFn: async ({ campaignId, stepId }: { campaignId: number; stepId: number }) => {
      return await apiRequest("DELETE", `/api/drip-campaigns/${campaignId}/steps/${stepId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns", selectedCampaign?.id] });
      toast({ title: "Step deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete step", variant: "destructive" });
    },
  });

  const assignCustomersMutation = useMutation({
    mutationFn: async ({ campaignId, customerIds, leadIds }: { campaignId: number; customerIds?: string[]; leadIds?: string[] }) => {
      const res = await apiRequest(
        "POST",
        `/api/drip-campaigns/${campaignId}/assignments`,
        leadIds ? { leadIds } : { customerIds }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enroll in campaign");
      return data;
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns"] });
      queryClient.invalidateQueries({ queryKey: ["/api/drip-campaigns/assignment-counts"] });
      setSelectedCustomerIds([]);
      setSelectedLeadIds([]);
      if (data.created === 0 && data.skipped > 0) {
        toast({ title: "Already enrolled", description: `${data.skipped} record(s) are already in this campaign` });
      } else {
        toast({ title: `${data.created} record(s) enrolled in campaign` });
      }
    },
    onError: () => {
      toast({ title: "Failed to assign to campaign", variant: "destructive" });
    },
  });

  const resetStepForm = () => {
    setStepForm({
      name: "",
      subject: "",
      body: "",
      delayAmount: 0,
      delayUnit: "days",
      isActive: true,
    });
  };

  const openCampaignEditor = (campaign: DripCampaign) => {
    setSelectedCampaign(campaign);
    setViewMode("editor");
  };

  const openStepEditor = (step?: DripCampaignStep) => {
    if (step) {
      setEditingStep(step);
      setStepForm({
        name: step.name,
        subject: step.subject,
        body: step.body,
        delayAmount: step.delayAmount,
        delayUnit: step.delayUnit || "days",
        isActive: step.isActive !== false,
      });
    } else {
      setEditingStep(null);
      resetStepForm();
    }
    setBodyEditorMode('visual');
    setShowStepEditor(true);
  };

  const handleSaveStep = () => {
    if (!selectedCampaign) return;
    
    if (editingStep) {
      updateStepMutation.mutate({
        campaignId: selectedCampaign.id,
        stepId: editingStep.id,
        data: stepForm,
      });
    } else {
      createStepMutation.mutate({
        ...stepForm,
        campaignId: selectedCampaign.id,
      });
    }
  };

  const insertVariable = (variable: string) => {
    if (editorRef.current) {
      editorRef.current.chain().focus().insertContent(`{{${variable}}}`).run();
    }
  };

  const PREVIEW_SAMPLE_VALUES: Record<string, string> = {
    'client.name': 'Jane Smith',
    'client.firstName': 'Jane',
    'client.lastName': 'Smith',
    'client.company': 'Acme Corporation',
    'client.email': 'jane@acme.com',
    'client.salesRep': 'Your Name',
    'product.name': 'Premium Banner',
    'product.type': 'Wide Format',
    'product.size': '4ft × 8ft',
    'product.itemCode': 'WF-4x8-001',
    'price.dealer': '$12.50',
    'price.retail': '$18.00',
    'price.export': '$10.00',
    'price.masterDistributor': '$9.00',
    'user.name': 'Your Name',
    'user.email': 'you@yourcompany.com',
    'user.signature': '<p style="color:#666;font-size:13px">Your Name | Sales Rep<br/>your@company.com | (555) 123-4567</p>',
    'custom.text1': '[Custom Text 1]',
    'custom.text2': '[Custom Text 2]',
  };

  const renderDripPreview = (subject: string, body: string) => {
    let previewSubject = subject;
    let previewBody = body;
    Object.entries(PREVIEW_SAMPLE_VALUES).forEach(([key, value]) => {
      const pattern = new RegExp(`\\{\\{${key.replace('.', '\\.')}\\}\\}`, 'g');
      previewSubject = previewSubject.replace(pattern, value);
      previewBody = previewBody.replace(pattern, value);
    });
    return { subject: previewSubject, body: previewBody };
  };

  const filteredCustomers = customers.filter(c => {
    const searchLower = customerSearch.toLowerCase();
    return (
      c.email?.toLowerCase().includes(searchLower) ||
      c.company?.toLowerCase().includes(searchLower) ||
      c.firstName?.toLowerCase().includes(searchLower) ||
      c.lastName?.toLowerCase().includes(searchLower)
    );
  });

  const toggleCustomerSelection = (customerId: string) => {
    setSelectedCustomerIds(prev => 
      prev.includes(customerId) 
        ? prev.filter(id => id !== customerId)
        : [...prev, customerId]
    );
  };

  const filteredLeads = leads.filter((l: any) => {
    const searchLower = leadSearch.toLowerCase();
    return (
      l.name?.toLowerCase().includes(searchLower) ||
      l.company?.toLowerCase().includes(searchLower)
    );
  });

  const toggleLeadSelection = (leadId: string) => {
    setSelectedLeadIds(prev =>
      prev.includes(leadId)
        ? prev.filter(id => id !== leadId)
        : [...prev, leadId]
    );
  };

  const steps = campaignDetails?.steps || [];

  if (viewMode === "list") {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Drip Campaigns</h3>
            <p className="text-sm text-gray-500">Create automated email sequences with time delays</p>
          </div>
          {isAdmin && (
            <Button onClick={() => setShowCampaignDialog(true)} data-testid="btn-create-campaign">
              <Plus className="h-4 w-4 mr-2" />
              New Campaign
            </Button>
          )}
        </div>

        {campaignsLoading ? (
          <div className="text-center py-8 text-gray-500">Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <div className="w-16 h-16 rounded-full bg-yellow-100 flex items-center justify-center mx-auto mb-4">
                <Zap className="h-8 w-8 text-yellow-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2">No Drip Campaigns Yet</h3>
              <p className="text-gray-500 mb-4">Create your first automated email sequence</p>
              {isAdmin && (
                <Button onClick={() => setShowCampaignDialog(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Campaign
                </Button>
              )}
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4">
            {campaigns.map(campaign => (
              <Card key={campaign.id} className="hover:border-purple-300 transition-colors cursor-pointer" onClick={() => openCampaignEditor(campaign)}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${campaign.isActive ? 'bg-green-100' : 'bg-gray-100'}`}>
                        <Zap className={`h-5 w-5 ${campaign.isActive ? 'text-green-600' : 'text-gray-400'}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium">{campaign.name}</h4>
                          <Badge variant="secondary" className="text-xs" data-testid={`campaign-count-${campaign.id}`}>
                            <Users className="h-3 w-3 mr-1" />
                            {getAssignmentCount(campaign.id)} customers
                          </Badge>
                          {getLeadCount(campaign.id) > 0 && (
                            <Badge variant="outline" className="text-xs text-purple-700 border-purple-200">
                              {getLeadCount(campaign.id)} leads
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-gray-500">{campaign.description || "No description"}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={campaign.isActive ? "default" : "secondary"}>
                        {campaign.isActive ? "Active" : "Draft"}
                      </Badge>
                      <Badge variant="outline" className="capitalize">
                        {campaign.triggerType || "manual"}
                      </Badge>
                      <ChevronRight className="h-5 w-5 text-gray-400" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        <Dialog open={showCampaignDialog} onOpenChange={setShowCampaignDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Create New Campaign</DialogTitle>
              <DialogDescription>Set up a new drip email campaign</DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Campaign Name</Label>
                <Input
                  value={campaignForm.name}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="e.g., Welcome Series"
                  data-testid="input-campaign-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Textarea
                  value={campaignForm.description}
                  onChange={(e) => setCampaignForm(prev => ({ ...prev, description: e.target.value }))}
                  placeholder="Describe the purpose of this campaign"
                  data-testid="input-campaign-description"
                />
              </div>
              <div className="space-y-2">
                <Label>Trigger</Label>
                <Select value={campaignForm.triggerType} onValueChange={(v) => setCampaignForm(prev => ({ ...prev, triggerType: v }))}>
                  <SelectTrigger data-testid="select-trigger-type">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TRIGGER_TYPES.map(t => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowCampaignDialog(false)}>Cancel</Button>
              <Button 
                onClick={() => createCampaignMutation.mutate(campaignForm)}
                disabled={!campaignForm.name || createCampaignMutation.isPending}
                data-testid="btn-save-campaign"
              >
                Create Campaign
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  if (viewMode === "assign" && selectedCampaign) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => setViewMode("editor")}>
            <ChevronLeft className="h-4 w-4 mr-1" />
            Back to Campaign
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-purple-600" />
              Assign to "{selectedCampaign.name}"
            </CardTitle>
            <CardDescription>
              Select leads or customers to enroll in this drip campaign
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Leads / Customers toggle */}
            <div className="flex gap-1 p-1 bg-[#F4F3F0] rounded-lg">
              <button
                onClick={() => setAssignTarget('leads')}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${assignTarget === 'leads' ? 'bg-white shadow-sm text-[#1A1A1A]' : 'text-[#8A8A8A]'}`}
              >
                Leads
              </button>
              <button
                onClick={() => setAssignTarget('customers')}
                className={`flex-1 text-sm py-1.5 rounded-md font-medium transition-colors ${assignTarget === 'customers' ? 'bg-white shadow-sm text-[#1A1A1A]' : 'text-[#8A8A8A]'}`}
              >
                Customers
              </button>
            </div>

            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                {assignTarget === 'leads' ? (
                  <Input
                    value={leadSearch}
                    onChange={(e) => setLeadSearch(e.target.value)}
                    placeholder="Search by name or company..."
                    className="pl-10"
                    data-testid="input-lead-search"
                  />
                ) : (
                  <Input
                    value={customerSearch}
                    onChange={(e) => setCustomerSearch(e.target.value)}
                    placeholder="Search by name, email, or company..."
                    className="pl-10"
                    data-testid="input-customer-search"
                  />
                )}
              </div>
              <Button
                onClick={() => {
                  if (assignTarget === 'leads') {
                    assignCustomersMutation.mutate({ campaignId: selectedCampaign.id, leadIds: selectedLeadIds });
                  } else {
                    assignCustomersMutation.mutate({ campaignId: selectedCampaign.id, customerIds: selectedCustomerIds });
                  }
                }}
                disabled={(assignTarget === 'leads' ? selectedLeadIds.length === 0 : selectedCustomerIds.length === 0) || assignCustomersMutation.isPending}
                data-testid="btn-assign-customers"
              >
                <Check className="h-4 w-4 mr-2" />
                Assign {assignTarget === 'leads'
                  ? (selectedLeadIds.length > 0 && `(${selectedLeadIds.length})`)
                  : (selectedCustomerIds.length > 0 && `(${selectedCustomerIds.length})`)}
              </Button>
            </div>

            {assignTarget === 'leads' ? (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {filteredLeads.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No leads found</div>
                ) : (
                  filteredLeads.slice(0, 50).map((lead: any) => (
                    <div
                      key={lead.id}
                      onClick={() => toggleLeadSelection(String(lead.id))}
                      className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 flex items-center gap-3 ${
                        selectedLeadIds.includes(String(lead.id)) ? 'bg-purple-50' : ''
                      }`}
                      data-testid={`lead-row-${lead.id}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedLeadIds.includes(String(lead.id)) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                      }`}>
                        {selectedLeadIds.includes(String(lead.id)) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{lead.name || 'Unknown Lead'}</p>
                        <p className="text-sm text-gray-500 truncate">{lead.company || 'No company'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            ) : (
              <div className="border rounded-lg max-h-[400px] overflow-y-auto">
                {filteredCustomers.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No customers found</div>
                ) : (
                  filteredCustomers.slice(0, 50).map(customer => (
                    <div
                      key={customer.id}
                      onClick={() => toggleCustomerSelection(customer.id)}
                      className={`p-3 border-b last:border-b-0 cursor-pointer hover:bg-gray-50 flex items-center gap-3 ${
                        selectedCustomerIds.includes(customer.id) ? 'bg-purple-50' : ''
                      }`}
                      data-testid={`customer-row-${customer.id}`}
                    >
                      <div className={`w-5 h-5 rounded border-2 flex items-center justify-center ${
                        selectedCustomerIds.includes(customer.id) ? 'bg-purple-600 border-purple-600' : 'border-gray-300'
                      }`}>
                        {selectedCustomerIds.includes(customer.id) && <Check className="h-3 w-3 text-white" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">
                          {customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown'}
                        </p>
                        <p className="text-sm text-gray-500 truncate">{customer.email || 'No email'}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  if (viewMode === "editor" && selectedCampaign) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => { setViewMode("list"); setSelectedCampaign(null); }}>
              <ChevronLeft className="h-4 w-4 mr-1" />
              Back
            </Button>
            <Separator orientation="vertical" className="h-6" />
            <h3 className="font-semibold">{selectedCampaign.name}</h3>
            <Badge variant={selectedCampaign.isActive ? "default" : "secondary"}>
              {selectedCampaign.isActive ? "Active" : "Draft"}
            </Badge>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => setViewMode("assign")} data-testid="btn-assign-mode">
              <UserPlus className="h-4 w-4 mr-2" />
              Assign Customers
            </Button>
            {isAdmin && (
              <>
                <Switch 
                  checked={selectedCampaign.isActive || false}
                  onCheckedChange={(checked) => {
                    setSelectedCampaign(prev => prev ? { ...prev, isActive: checked } : null);
                    updateCampaignMutation.mutate({ id: selectedCampaign.id, data: { isActive: checked } });
                  }}
                  data-testid="switch-campaign-active"
                />
                <span className="text-sm text-gray-500">Active</span>
              </>
            )}
          </div>
        </div>

        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Email Steps ({steps.length})</CardTitle>
              {isAdmin && (
                <Button size="sm" onClick={() => openStepEditor()} data-testid="btn-add-step">
                  <Plus className="h-4 w-4 mr-1" />
                  Add Step
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {steps.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Mail className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                <p>No steps yet. Add your first email.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {steps.map((step, index) => (
                  <div key={step.id} className="flex items-start gap-3">
                    <div className="flex flex-col items-center">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${step.isActive ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                        {index + 1}
                      </div>
                      {index < steps.length - 1 && (
                        <div className="w-px h-12 bg-gray-200 mt-2" />
                      )}
                    </div>
                    <Card className="flex-1">
                      <CardContent className="p-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium truncate">{step.name}</h4>
                              {!step.isActive && <Badge variant="secondary" className="text-xs">Disabled</Badge>}
                            </div>
                            <p className="text-sm text-gray-600 truncate">{step.subject}</p>
                            <div className="flex items-center gap-2 mt-2">
                              <Badge variant="outline" className="text-xs">
                                <Clock className="h-3 w-3 mr-1" />
                                {step.delayAmount === 0 ? "Send immediately" : `Wait ${step.delayAmount} ${step.delayUnit}`}
                              </Badge>
                            </div>
                          </div>
                          {isAdmin && (
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openStepEditor(step)} data-testid={`btn-edit-step-${step.id}`}>
                                <Edit2 className="h-4 w-4" />
                              </Button>
                              <Button 
                                variant="ghost" 
                                size="icon" 
                                className="h-7 w-7 text-red-500 hover:text-red-600"
                                onClick={() => deleteStepMutation.mutate({ campaignId: selectedCampaign.id, stepId: step.id })}
                                data-testid={`btn-delete-step-${step.id}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {isAdmin && (
          <div className="flex justify-end">
            <Button 
              variant="destructive" 
              size="sm"
              onClick={() => {
                if (confirm("Are you sure you want to delete this campaign?")) {
                  deleteCampaignMutation.mutate(selectedCampaign.id);
                }
              }}
              data-testid="btn-delete-campaign"
            >
              <Trash2 className="h-4 w-4 mr-2" />
              Delete Campaign
            </Button>
          </div>
        )}

        <Dialog open={showStepEditor} onOpenChange={setShowStepEditor}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingStep ? "Edit Email Step" : "Add Email Step"}</DialogTitle>
              <DialogDescription>
                Configure the email content and timing for this step
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Step Name</Label>
                  <Input
                    value={stepForm.name}
                    onChange={(e) => setStepForm(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Welcome Email"
                    data-testid="input-step-name"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Delay After Previous Step</Label>
                  <div className="flex gap-2">
                    <Input
                      type="number"
                      min="0"
                      value={stepForm.delayAmount}
                      onChange={(e) => setStepForm(prev => ({ ...prev, delayAmount: parseInt(e.target.value) || 0 }))}
                      className="w-20"
                      data-testid="input-delay-amount"
                    />
                    <Select value={stepForm.delayUnit} onValueChange={(v) => setStepForm(prev => ({ ...prev, delayUnit: v }))}>
                      <SelectTrigger className="flex-1" data-testid="select-delay-unit">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {DELAY_UNITS.map(u => (
                          <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Label>Subject Line</Label>
                <Input
                  value={stepForm.subject}
                  onChange={(e) => setStepForm(prev => ({ ...prev, subject: e.target.value }))}
                  placeholder="e.g., Welcome to {{client.company}}!"
                  data-testid="input-step-subject"
                />
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Email Body</Label>
                  <div className="flex items-center gap-2">
                    <div style={{ display: 'flex', border: '0.5px solid var(--color-border-secondary)', borderRadius: '7px', overflow: 'hidden' }}>
                      <button
                        type="button"
                        onClick={() => setBodyEditorMode('visual')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          border: 'none',
                          cursor: 'pointer',
                          background: bodyEditorMode === 'visual' ? '#1a1a1a' : 'transparent',
                          color: bodyEditorMode === 'visual' ? '#fff' : 'var(--color-text-secondary)',
                        }}
                      >
                        Visual
                      </button>
                      <button
                        type="button"
                        onClick={() => setBodyEditorMode('html')}
                        style={{
                          padding: '4px 10px',
                          fontSize: '12px',
                          fontWeight: 500,
                          border: 'none',
                          cursor: 'pointer',
                          background: bodyEditorMode === 'html' ? '#1a1a1a' : 'transparent',
                          color: bodyEditorMode === 'html' ? '#fff' : 'var(--color-text-secondary)',
                        }}
                      >
                        {'</>'} HTML
                      </button>
                    </div>
                    <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setShowPreview(true)}>
                      <Eye className="h-3 w-3 mr-1" />
                      Preview
                    </Button>
                  </div>
                </div>

                {bodyEditorMode === 'visual' ? (
                  <RichTextEditor
                    content={stepForm.body}
                    onChange={(html) => setStepForm(prev => ({ ...prev, body: html }))}
                    onEditorReady={(editor) => { editorRef.current = editor; }}
                  />
                ) : (
                  <div style={{ position: 'relative' }}>
                    <textarea
                      value={stepForm.body}
                      onChange={(e) => setStepForm(prev => ({ ...prev, body: e.target.value }))}
                      placeholder={`Paste your HTML email code here...\n\nExample:\n<!DOCTYPE html>\n<html>\n<body style="font-family: Arial, sans-serif;">\n  <h1>Hello {{client.firstName}}!</h1>\n  <p>Your message here.</p>\n</body>\n</html>`}
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
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '8px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', flex: 1 }}>
                        Paste HTML from Designmodo, Stripo, or any email builder. Variables like {'{{'+'client.firstName'+'}}'} work in HTML too.
                      </span>
                      <button
                        type="button"
                        onClick={() => setStepForm(prev => ({ ...prev, body: '' }))}
                        style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', flexShrink: 0 }}
                      >
                        Clear
                      </button>
                    </div>
                  </div>
                )}

                <div className="mt-2 p-3 bg-gray-50 rounded-lg">
                  <p className="text-xs font-medium text-gray-600 mb-2 flex items-center gap-1">
                    <Variable className="h-3 w-3" />
                    Insert Variable
                  </p>
                  <div className="flex flex-wrap gap-1">
                    {Object.keys(EMAIL_TEMPLATE_VARIABLES).slice(0, 10).map(key => (
                      <Button
                        key={key}
                        type="button"
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs"
                        onClick={() => insertVariable(key)}
                      >
                        {`{{${key}}}`}
                      </Button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={stepForm.isActive}
                  onCheckedChange={(checked) => setStepForm(prev => ({ ...prev, isActive: checked }))}
                  data-testid="switch-step-active"
                />
                <Label className="text-sm">Step is active</Label>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => { setShowStepEditor(false); setEditingStep(null); resetStepForm(); }}>
                Cancel
              </Button>
              <Button 
                onClick={handleSaveStep}
                disabled={!stepForm.name || !stepForm.subject || !stepForm.body || createStepMutation.isPending || updateStepMutation.isPending}
                data-testid="btn-save-step"
              >
                {editingStep ? "Save Changes" : "Add Step"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={showPreview} onOpenChange={setShowPreview}>
          <DialogContent className="max-w-3xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle className="flex items-center gap-2">
                  <Eye className="h-5 w-5 text-purple-600" />
                  Email Preview
                </DialogTitle>
                <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5 mr-8">
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
              <p className="text-xs text-gray-400 mt-1">Variables are shown with sample data so you can see how the email will look</p>
            </DialogHeader>

            <div className="flex justify-center py-2">
              <div className={`relative transition-all duration-300 ${previewDevice === 'mobile' ? 'w-[320px]' : 'w-full max-w-[600px]'}`}>
                {(() => {
                  const { subject, body } = renderDripPreview(stepForm.subject || '', stepForm.body || '');
                  const senderInitial = (user as any)?.email?.[0]?.toUpperCase() || 'Y';
                  const senderEmail = (user as any)?.email || 'you@yourcompany.com';

                  if (previewDevice === 'mobile') {
                    return (
                      <div className={`rounded-[2.5rem] border-[6px] p-1 shadow-xl ${previewTheme === 'dark' ? 'border-gray-700 bg-gray-800' : 'border-gray-300 bg-gray-100'}`}>
                        <div className={`w-12 h-1.5 rounded-full mx-auto mt-1 mb-2 ${previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                        <div className={`rounded-[1.8rem] overflow-hidden ${previewTheme === 'dark' ? 'bg-gray-900' : 'bg-white'}`}>
                          <div className={`px-4 py-2.5 border-b ${previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                            <div className="flex items-center gap-2 mb-1.5">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold ${previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'}`}>
                                {senderInitial}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className={`text-xs font-semibold truncate ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                                  {senderEmail}
                                </p>
                                <p className={`text-[10px] truncate ${previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                                  to jane@acme.com
                                </p>
                              </div>
                              <span className={`text-[10px] ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Now</span>
                            </div>
                            <p className={`text-sm font-semibold truncate ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                              {subject || '(No subject)'}
                            </p>
                          </div>
                          <iframe
                            title="Email preview mobile"
                            style={{ width: '100%', maxHeight: '380px', border: 'none', background: previewTheme === 'dark' ? '#111827' : '#ffffff', display: 'block', minHeight: '200px' }}
                            srcDoc={buildSrcDoc(body, previewTheme === 'dark' ? '#111827' : '#ffffff', previewTheme === 'dark' ? '#e5e7eb' : '#1f2937', '12px 16px', '13px')}
                            sandbox="allow-same-origin allow-scripts allow-popups"
                          />
                        </div>
                        <div className={`w-16 h-1.5 rounded-full mx-auto mt-2 mb-1 ${previewTheme === 'dark' ? 'bg-gray-600' : 'bg-gray-300'}`} />
                      </div>
                    );
                  }

                  return (
                    <div className={`rounded-xl border shadow-lg overflow-hidden ${previewTheme === 'dark' ? 'border-gray-700 bg-gray-900' : 'border-gray-200 bg-white'}`}>
                      <div className={`px-4 py-3 border-b ${previewTheme === 'dark' ? 'bg-gray-800 border-gray-700' : 'bg-gray-50 border-gray-200'}`}>
                        <div className="flex items-center gap-2 mb-2">
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold ${previewTheme === 'dark' ? 'bg-purple-800 text-purple-200' : 'bg-purple-100 text-purple-600'}`}>
                            {senderInitial}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className={`text-sm font-semibold ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                              {senderEmail}
                            </p>
                            <p className={`text-xs ${previewTheme === 'dark' ? 'text-gray-400' : 'text-gray-500'}`}>
                              to jane@acme.com
                            </p>
                          </div>
                          <span className={`text-xs ${previewTheme === 'dark' ? 'text-gray-500' : 'text-gray-400'}`}>Just now</span>
                        </div>
                        <p className={`text-base font-semibold ${previewTheme === 'dark' ? 'text-gray-100' : 'text-gray-900'}`}>
                          {subject || '(No subject)'}
                        </p>
                      </div>
                      <iframe
                        title="Email preview desktop"
                        style={{ width: '100%', maxHeight: '440px', border: 'none', background: previewTheme === 'dark' ? '#111827' : '#ffffff', display: 'block', minHeight: '200px' }}
                        srcDoc={buildSrcDoc(body, previewTheme === 'dark' ? '#111827' : '#ffffff', previewTheme === 'dark' ? '#e5e7eb' : '#1f2937', '20px 24px', '14px')}
                        sandbox="allow-same-origin allow-scripts allow-popups"
                      />
                    </div>
                  );
                })()}
              </div>
            </div>

            <div className={`flex items-center gap-2 p-3 rounded-lg text-xs ${previewTheme === 'dark' ? 'bg-gray-800 text-gray-400' : 'bg-gray-50 text-gray-500'}`}>
              <Variable className="h-3.5 w-3.5 flex-shrink-0" />
              <span>Preview uses sample data: <strong>Jane Smith</strong> at <strong>Acme Corporation</strong>. Real names and details will be filled in when the email sends.</span>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  return null;
}

interface RichTextEditorProps {
  content: string;
  onChange: (html: string) => void;
  onEditorReady?: (editor: any) => void;
}

function RichTextEditor({ content, onChange, onEditorReady }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      Link.configure({
        openOnClick: false,
      }),
      Image.configure({
        inline: true,
      }),
      TextAlign.configure({
        types: ['heading', 'paragraph'],
      }),
      Placeholder.configure({
        placeholder: 'Write your email content here...',
      }),
    ],
    content,
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    onCreate: ({ editor }) => {
      if (onEditorReady) {
        onEditorReady(editor);
      }
    },
  });

  const addImage = useCallback(() => {
    const url = window.prompt('Enter image URL:');
    if (url && editor) {
      editor.chain().focus().setImage({ src: url }).run();
    }
  }, [editor]);

  const setLink = useCallback(() => {
    const url = window.prompt('Enter URL:');
    if (url && editor) {
      editor.chain().focus().setLink({ href: url }).run();
    }
  }, [editor]);

  if (!editor) {
    return <div className="border rounded-lg p-4 min-h-[200px] bg-gray-50">Loading editor...</div>;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="flex items-center gap-1 p-2 border-b bg-gray-50 flex-wrap">
        <Button
          type="button"
          variant={editor.isActive('bold') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBold().run()}
          data-testid="btn-bold"
        >
          <Bold className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('italic') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleItalic().run()}
          data-testid="btn-italic"
        >
          <Italic className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('underline') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          data-testid="btn-underline"
        >
          <UnderlineIcon className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          type="button"
          variant={editor.isActive('bulletList') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          data-testid="btn-bullet-list"
        >
          <List className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive('orderedList') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          data-testid="btn-ordered-list"
        >
          <ListOrdered className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          type="button"
          variant={editor.isActive({ textAlign: 'left' }) ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().setTextAlign('left').run()}
          data-testid="btn-align-left"
        >
          <AlignLeft className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: 'center' }) ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().setTextAlign('center').run()}
          data-testid="btn-align-center"
        >
          <AlignCenter className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant={editor.isActive({ textAlign: 'right' }) ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={() => editor.chain().focus().setTextAlign('right').run()}
          data-testid="btn-align-right"
        >
          <AlignRight className="h-4 w-4" />
        </Button>
        <Separator orientation="vertical" className="h-6 mx-1" />
        <Button
          type="button"
          variant={editor.isActive('link') ? 'default' : 'ghost'}
          size="icon"
          className="h-8 w-8"
          onClick={setLink}
          data-testid="btn-link"
        >
          <LinkIcon className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={addImage}
          data-testid="btn-image"
        >
          <ImageIcon className="h-4 w-4" />
        </Button>
      </div>
      <EditorContent editor={editor} className="prose prose-sm max-w-none p-4 min-h-[200px] focus:outline-none [&_.ProseMirror]:min-h-[180px] [&_.ProseMirror]:outline-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:text-gray-400 [&_.ProseMirror_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] [&_.ProseMirror_p.is-editor-empty:first-child::before]:float-left [&_.ProseMirror_p.is-editor-empty:first-child::before]:pointer-events-none [&_.ProseMirror_p.is-editor-empty:first-child::before]:h-0" />
    </div>
  );
}

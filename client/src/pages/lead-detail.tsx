import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Link, useRoute, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  TrendingUp,
  Clock,
  Calendar,
  Target,
  Percent,
  Package,
  FileText,
  MessageSquare,
  PhoneCall,
  Send,
  Gift,
  Loader2,
  Plus,
  Edit,
  CheckCircle2,
  Star,
  Users,
  Globe,
  Briefcase,
  StickyNote,
} from "lucide-react";

// Helper function to strip HTML tags and extract plain text
function stripHtml(html: string | null | undefined): string {
  if (!html) return "";
  // Create a temporary div to parse HTML
  const temp = document.createElement("div");
  temp.innerHTML = html;
  // Get text content which automatically strips tags
  return temp.textContent || temp.innerText || "";
}

interface LeadActivity {
  id: number;
  leadId: number;
  activityType: string;
  summary: string;
  details: string | null;
  performedBy: string | null;
  performedByName: string | null;
  createdAt: string;
}

interface Lead {
  id: number;
  odooLeadId: number | null;
  sourceType: string;
  sourceCustomerId: string | null;
  name: string;
  email: string | null;
  emailNormalized: string | null;
  phone: string | null;
  mobile: string | null;
  company: string | null;
  jobTitle: string | null;
  website: string | null;
  street: string | null;
  street2: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  country: string | null;
  stage: string;
  priority: string | null;
  score: number;
  probability: number;
  expectedRevenue: string | null;
  swatchbookSentAt: string | null;
  sampleSentAt: string | null;
  priceListSentAt: string | null;
  catalogSentAt: string | null;
  firstContactAt: string | null;
  lastContactAt: string | null;
  totalTouchpoints: number;
  preferredContact: string | null;
  bestTimeToCall: string | null;
  description: string | null;
  internalNotes: string | null;
  assignedTo: string | null;
  assignedToName: string | null;
  tags: string | null;
  isCompany: boolean;
  primaryContactName: string | null;
  primaryContactEmail: string | null;
  createdAt: string;
  updatedAt: string;
  activities?: LeadActivity[];
}

const stageConfig: Record<string, { label: string; color: string }> = {
  new: { label: "New", color: "bg-blue-100 text-blue-700 border-blue-300" },
  contacted: { label: "Contacted", color: "bg-purple-100 text-purple-700 border-purple-300" },
  meeting_set: { label: "Meeting Set", color: "bg-indigo-100 text-indigo-700 border-indigo-300" },
  qualified: { label: "Qualified", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
  nurturing: { label: "Nurturing", color: "bg-amber-100 text-amber-700 border-amber-300" },
  proposal: { label: "Proposal Sent", color: "bg-orange-100 text-orange-700 border-orange-300" },
  negotiation: { label: "Negotiation", color: "bg-pink-100 text-pink-700 border-pink-300" },
  converted: { label: "Won", color: "bg-green-100 text-green-700 border-green-300" },
  lost: { label: "Lost", color: "bg-red-100 text-red-700 border-red-300" },
  contact_later: { label: "Contact Later", color: "bg-slate-100 text-slate-600 border-slate-300" },
  not_a_fit: { label: "Not a Fit", color: "bg-gray-100 text-gray-500 border-gray-300" },
};

const priorityConfig: Record<string, { label: string; color: string; icon: typeof Star }> = {
  low: { label: "Low", color: "text-slate-400", icon: Star },
  medium: { label: "Medium", color: "text-amber-500", icon: Star },
  high: { label: "High", color: "text-orange-500", icon: Star },
  urgent: { label: "Urgent", color: "text-red-500", icon: Star },
};

const activityTypeConfig: Record<string, { label: string; icon: typeof MessageSquare; color: string }> = {
  email_sent: { label: "Email Sent", icon: Send, color: "bg-blue-100 text-blue-600" },
  call_made: { label: "Call Made", icon: PhoneCall, color: "bg-green-100 text-green-600" },
  sample_sent: { label: "Sample Sent", icon: Gift, color: "bg-purple-100 text-purple-600" },
  meeting: { label: "Meeting", icon: Users, color: "bg-indigo-100 text-indigo-600" },
  note: { label: "Note", icon: FileText, color: "bg-amber-100 text-amber-600" },
  quote_sent: { label: "Quote Sent", icon: FileText, color: "bg-orange-100 text-orange-600" },
};

export default function LeadDetail() {
  const [, params] = useRoute("/leads/:id");
  const leadId = params?.id;
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClientInstance = useQueryClient();
  
  const [isAddActivityOpen, setIsAddActivityOpen] = useState(false);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isNewNoteOpen, setIsNewNoteOpen] = useState(false);
  const [newNoteText, setNewNoteText] = useState("");
  const [newActivity, setNewActivity] = useState({
    activityType: "note",
    summary: "",
    details: "",
  });
  const [editForm, setEditForm] = useState<Partial<Lead>>({});

  const { data: lead, isLoading } = useQuery<Lead>({
    queryKey: ['/api/leads', leadId],
    queryFn: async () => {
      const res = await fetch(`/api/leads/${leadId}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch lead');
      return res.json();
    },
    enabled: !!leadId,
  });

  const addActivityMutation = useMutation({
    mutationFn: async (data: { activityType: string; summary: string; details: string }) => {
      const res = await apiRequest('POST', `/api/leads/${leadId}/activities`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Activity added", description: "The activity has been recorded" });
      setIsAddActivityOpen(false);
      setNewActivity({ activityType: "note", summary: "", details: "" });
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads', leadId] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to add activity", variant: "destructive" });
    },
  });

  const updateLeadMutation = useMutation({
    mutationFn: async (data: Partial<Lead>) => {
      const res = await apiRequest('PUT', `/api/leads/${leadId}`, data);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Lead updated", description: "Changes have been saved" });
      setIsEditOpen(false);
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads', leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update lead", variant: "destructive" });
    },
  });

  const updateStageMutation = useMutation({
    mutationFn: async (stage: string) => {
      const res = await apiRequest('PUT', `/api/leads/${leadId}`, { stage });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Stage updated" });
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads', leadId] });
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads'] });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update stage", variant: "destructive" });
    },
  });

  const addNoteMutation = useMutation({
    mutationFn: async (noteText: string) => {
      const res = await apiRequest('POST', `/api/leads/${leadId}/activities`, {
        activityType: 'note',
        summary: noteText,
        details: '',
      });
      if (!res.ok) throw new Error('Failed to add note');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Note added', description: 'Your note has been saved' });
      setNewNoteText('');
      setIsNewNoteOpen(false);
      queryClientInstance.invalidateQueries({ queryKey: ['/api/leads', leadId] });
    },
    onError: (error: Error) => {
      toast({ title: 'Failed to add note', description: error.message, variant: 'destructive' });
    },
  });

  const getStageInfo = (stage: string) => stageConfig[stage] || { label: stage, color: "bg-gray-100 text-gray-600" };
  const getPriorityInfo = (priority: string | null) => priorityConfig[priority || "medium"] || priorityConfig.medium;
  const getActivityInfo = (type: string) => activityTypeConfig[type] || { label: type, icon: MessageSquare, color: "bg-gray-100 text-gray-600" };

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric' 
    });
  };

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return "—";
    return new Date(dateStr).toLocaleDateString('en-US', { 
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });
  };

  const handleEditClick = () => {
    if (lead) {
      setEditForm({
        name: lead.name,
        email: lead.email,
        phone: lead.phone,
        mobile: lead.mobile,
        company: lead.company,
        jobTitle: lead.jobTitle,
        website: lead.website,
        street: lead.street,
        city: lead.city,
        state: lead.state,
        zip: lead.zip,
        country: lead.country,
        description: lead.description,
        internalNotes: lead.internalNotes,
        expectedRevenue: lead.expectedRevenue,
        probability: lead.probability,
        priority: lead.priority,
        preferredContact: lead.preferredContact,
        bestTimeToCall: lead.bestTimeToCall,
      });
      setIsEditOpen(true);
    }
  };

  if (isLoading) {
    return (
      <div className="p-6 space-y-6">
        <div className="flex items-center gap-4">
          <Skeleton className="h-8 w-8" />
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-64" />
          </div>
          <div className="space-y-6">
            <Skeleton className="h-48" />
            <Skeleton className="h-32" />
          </div>
        </div>
      </div>
    );
  }

  if (!lead) {
    return (
      <div className="p-6">
        <div className="text-center py-12">
          <p className="text-slate-500">Lead not found</p>
          <Link href="/leads">
            <Button variant="outline" className="mt-4">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back to Leads
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const stageInfo = getStageInfo(lead.stage);
  const priorityInfo = getPriorityInfo(lead.priority);
  const activities = lead.activities || [];

  const address = [lead.street, lead.street2, lead.city, lead.state, lead.zip, lead.country]
    .filter(Boolean)
    .join(", ");

  return (
    <div className="p-6 space-y-6 bg-[#FDFBF7] min-h-screen">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/leads">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-2" /> Back
            </Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-full flex items-center justify-center ${lead.isCompany ? 'bg-blue-100' : 'bg-slate-100'}`}>
              {lead.isCompany ? <Building2 className="w-5 h-5 text-blue-600" /> : <User className="w-5 h-5 text-slate-600" />}
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-800">{lead.name}</h1>
              {lead.isCompany && lead.primaryContactName && (
                <p className="text-sm text-slate-500">Primary Contact: {lead.primaryContactName}</p>
              )}
              {lead.company && !lead.isCompany && (
                <p className="text-sm text-slate-500">{lead.company}</p>
              )}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Badge className={`${stageInfo.color} border`}>{stageInfo.label}</Badge>
          {lead.email && (
            <Link href={`/email-app?${new URLSearchParams({
              to: lead.email,
              recipientName: lead.name,
              usageType: 'lead_email',
              variables: JSON.stringify({
                'lead.name': lead.name || '',
                'lead.company': lead.company || '',
                'lead.email': lead.email || '',
                'lead.id': String(lead.id),
              }),
            })}`}>
              <Button 
                variant="outline"
                className="border-green-200 text-green-600 hover:bg-green-50"
                title="Send email to lead"
              >
                <Mail className="w-4 h-4 mr-2" />
                Compose Email
              </Button>
            </Link>
          )}
          <Button variant="outline" onClick={handleEditClick}>
            <Edit className="w-4 h-4 mr-2" /> Edit
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Lead Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  {lead.email && (
                    <div className="flex items-center gap-3">
                      <Mail className="w-4 h-4 text-slate-400" />
                      <a href={`mailto:${lead.email}`} className="text-blue-600 hover:underline">{lead.email}</a>
                    </div>
                  )}
                  {lead.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <a href={`tel:${lead.phone}`} className="text-slate-700">{lead.phone}</a>
                    </div>
                  )}
                  {lead.mobile && lead.mobile !== lead.phone && (
                    <div className="flex items-center gap-3">
                      <Phone className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">{lead.mobile} (mobile)</span>
                    </div>
                  )}
                  {lead.jobTitle && (
                    <div className="flex items-center gap-3">
                      <Briefcase className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">{lead.jobTitle}</span>
                    </div>
                  )}
                  {lead.website && (
                    <div className="flex items-center gap-3">
                      <Globe className="w-4 h-4 text-slate-400" />
                      <a href={lead.website.startsWith('http') ? lead.website : `https://${lead.website}`} 
                         target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline">
                        {lead.website}
                      </a>
                    </div>
                  )}
                </div>
                <div className="space-y-3">
                  {address && (
                    <div className="flex items-start gap-3">
                      <MapPin className="w-4 h-4 text-slate-400 mt-0.5" />
                      <span className="text-slate-700">{address}</span>
                    </div>
                  )}
                  {lead.preferredContact && (
                    <div className="flex items-center gap-3">
                      <MessageSquare className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">Prefers: {lead.preferredContact}</span>
                    </div>
                  )}
                  {lead.bestTimeToCall && (
                    <div className="flex items-center gap-3">
                      <Clock className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-700">Best time: {lead.bestTimeToCall}</span>
                    </div>
                  )}
                </div>
              </div>

              {lead.description && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 mb-2">Description</h4>
                    <p className="text-slate-700 whitespace-pre-wrap">{stripHtml(lead.description)}</p>
                  </div>
                </>
              )}

              {lead.internalNotes && (
                <>
                  <Separator />
                  <div>
                    <h4 className="text-sm font-medium text-slate-600 mb-2">Internal Notes</h4>
                    <p className="text-slate-700 whitespace-pre-wrap bg-amber-50 p-3 rounded-md border border-amber-100">{lead.internalNotes}</p>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg flex items-center gap-2">
                  <StickyNote className="w-5 h-5 text-amber-500" />
                  Notes
                </CardTitle>
                <Dialog open={isNewNoteOpen} onOpenChange={setIsNewNoteOpen}>
                  <DialogTrigger asChild>
                    <Button size="sm" variant="outline">
                      <Plus className="w-4 h-4 mr-1" /> New Note
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Add Note</DialogTitle>
                    </DialogHeader>
                    <div className="py-4">
                      <Textarea
                        placeholder="Enter your note..."
                        value={newNoteText}
                        onChange={(e) => setNewNoteText(e.target.value)}
                        rows={4}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setIsNewNoteOpen(false)}>
                        Cancel
                      </Button>
                      <Button 
                        type="button"
                        onClick={() => addNoteMutation.mutate(newNoteText)}
                        disabled={!newNoteText.trim() || addNoteMutation.isPending}
                      >
                        {addNoteMutation.isPending ? (
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        ) : null}
                        Save Note
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </CardHeader>
            <CardContent>
              {(() => {
                const notes = activities.filter(a => a.activityType === 'note');
                if (notes.length === 0) {
                  return (
                    <div className="text-center py-6 text-slate-500">
                      <StickyNote className="w-10 h-10 mx-auto mb-2 text-slate-300" />
                      <p className="text-sm">No notes yet</p>
                      <p className="text-xs text-slate-400">Add a note to track important information</p>
                    </div>
                  );
                }
                return (
                  <div className="space-y-3 max-h-64 overflow-y-auto">
                    {notes.map((note) => (
                      <div key={note.id} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-slate-700 whitespace-pre-wrap text-sm">{note.summary}</p>
                        {note.details && (
                          <p className="text-slate-500 text-xs mt-1">{note.details}</p>
                        )}
                        <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                          <span>{note.performedByName || 'Unknown'}</span>
                          <span>{new Date(note.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-lg">Activity Timeline</CardTitle>
              <Dialog open={isAddActivityOpen} onOpenChange={setIsAddActivityOpen}>
                <DialogTrigger asChild>
                  <Button size="sm">
                    <Plus className="w-4 h-4 mr-2" /> Add Activity
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Log Activity</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>Activity Type</Label>
                      <Select value={newActivity.activityType} onValueChange={(v) => setNewActivity(prev => ({ ...prev, activityType: v }))}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="note">Note</SelectItem>
                          <SelectItem value="email_sent">Email Sent</SelectItem>
                          <SelectItem value="call_made">Call Made</SelectItem>
                          <SelectItem value="meeting">Meeting</SelectItem>
                          <SelectItem value="sample_sent">Sample Sent</SelectItem>
                          <SelectItem value="quote_sent">Quote Sent</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-2">
                      <Label>Summary *</Label>
                      <Input 
                        placeholder="Brief summary of the activity"
                        value={newActivity.summary}
                        onChange={(e) => setNewActivity(prev => ({ ...prev, summary: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Details</Label>
                      <Textarea 
                        placeholder="Additional details..."
                        value={newActivity.details}
                        onChange={(e) => setNewActivity(prev => ({ ...prev, details: e.target.value }))}
                        rows={4}
                      />
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsAddActivityOpen(false)}>Cancel</Button>
                    <Button 
                      onClick={() => addActivityMutation.mutate(newActivity)}
                      disabled={!newActivity.summary.trim() || addActivityMutation.isPending}
                    >
                      {addActivityMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                      Log Activity
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {activities.length === 0 ? (
                <div className="text-center py-8 text-slate-500">
                  <MessageSquare className="w-12 h-12 mx-auto mb-3 text-slate-300" />
                  <p>No activities recorded yet</p>
                  <p className="text-sm">Log calls, emails, meetings, and notes to track your progress</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {activities.map((activity) => {
                    const activityInfo = getActivityInfo(activity.activityType);
                    const ActivityIcon = activityInfo.icon;
                    return (
                      <div key={activity.id} className="flex gap-4">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${activityInfo.color}`}>
                          <ActivityIcon className="w-5 h-5" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="font-medium text-slate-800">{activityInfo.label}</span>
                            <span className="text-xs text-slate-400">{formatDateTime(activity.createdAt)}</span>
                          </div>
                          <p className="text-slate-700">{activity.summary}</p>
                          {activity.details && (
                            <p className="text-sm text-slate-500 mt-1">{activity.details}</p>
                          )}
                          {activity.performedByName && (
                            <p className="text-xs text-slate-400 mt-1">by {activity.performedByName}</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Pipeline & Scoring</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label className="text-xs text-slate-500">Stage</Label>
                <Select value={lead.stage} onValueChange={(v) => updateStageMutation.mutate(v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(stageConfig).map(([key, config]) => (
                      <SelectItem key={key} value={key}>{config.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">Priority</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <priorityInfo.icon className={`w-4 h-4 ${priorityInfo.color}`} fill="currentColor" />
                    <span className="text-sm font-medium">{priorityInfo.label}</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Score</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Target className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{lead.score}/100</span>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">Probability</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <Percent className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">{lead.probability}%</span>
                  </div>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Expected Revenue</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <DollarSign className="w-4 h-4 text-slate-400" />
                    <span className="text-sm font-medium">
                      {lead.expectedRevenue ? `$${parseFloat(lead.expectedRevenue).toLocaleString()}` : "—"}
                    </span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Trust Building Progress</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Package className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">Swatchbook Sent</span>
                </div>
                {lead.swatchbookSentAt ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">{formatDate(lead.swatchbookSentAt)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not yet</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Gift className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">Sample Sent</span>
                </div>
                {lead.sampleSentAt ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">{formatDate(lead.sampleSentAt)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not yet</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">Price List Sent</span>
                </div>
                {lead.priceListSentAt ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">{formatDate(lead.priceListSentAt)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not yet</span>
                )}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-slate-400" />
                  <span className="text-sm">Catalog Sent</span>
                </div>
                {lead.catalogSentAt ? (
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-4 h-4" />
                    <span className="text-xs">{formatDate(lead.catalogSentAt)}</span>
                  </div>
                ) : (
                  <span className="text-xs text-slate-400">Not yet</span>
                )}
              </div>
            </CardContent>
          </Card>

          <Card className="bg-white/80 backdrop-blur-sm border-slate-200/50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Engagement Stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Total Touchpoints</span>
                <span className="font-medium">{lead.totalTouchpoints}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">First Contact</span>
                <span className="text-sm">{formatDate(lead.firstContactAt)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Last Contact</span>
                <span className="text-sm">{formatDate(lead.lastContactAt)}</span>
              </div>
              <Separator />
              <div className="flex items-center justify-between">
                <span className="text-sm text-slate-600">Created</span>
                <span className="text-sm">{formatDate(lead.createdAt)}</span>
              </div>
              {lead.assignedToName && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Assigned To</span>
                  <span className="text-sm font-medium">{lead.assignedToName}</span>
                </div>
              )}
              {lead.sourceType && (
                <div className="flex items-center justify-between">
                  <span className="text-sm text-slate-600">Source</span>
                  <Badge variant="outline" className="text-xs capitalize">{lead.sourceType.replace('_', ' ')}</Badge>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={isEditOpen} onOpenChange={setIsEditOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Lead</DialogTitle>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label>Name *</Label>
              <Input 
                value={editForm.name || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, name: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Company</Label>
              <Input 
                value={editForm.company || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, company: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                type="email"
                value={editForm.email || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, email: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input 
                value={editForm.phone || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, phone: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Mobile</Label>
              <Input 
                value={editForm.mobile || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, mobile: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Job Title</Label>
              <Input 
                value={editForm.jobTitle || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, jobTitle: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Website</Label>
              <Input 
                value={editForm.website || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, website: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Priority</Label>
              <Select value={editForm.priority || "medium"} onValueChange={(v) => setEditForm(prev => ({ ...prev, priority: v }))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="urgent">Urgent</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Street Address</Label>
              <Input 
                value={editForm.street || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, street: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>City</Label>
              <Input 
                value={editForm.city || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, city: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>State/Province</Label>
              <Input 
                value={editForm.state || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, state: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>ZIP/Postal Code</Label>
              <Input 
                value={editForm.zip || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, zip: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Country</Label>
              <Input 
                value={editForm.country || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, country: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Expected Revenue ($)</Label>
              <Input 
                type="number"
                value={editForm.expectedRevenue || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, expectedRevenue: e.target.value }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Probability (%)</Label>
              <Input 
                type="number"
                min={0}
                max={100}
                value={editForm.probability || 10}
                onChange={(e) => setEditForm(prev => ({ ...prev, probability: parseInt(e.target.value) || 10 }))}
              />
            </div>
            <div className="space-y-2">
              <Label>Preferred Contact Method</Label>
              <Select value={editForm.preferredContact || ""} onValueChange={(v) => setEditForm(prev => ({ ...prev, preferredContact: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="email">Email</SelectItem>
                  <SelectItem value="phone">Phone</SelectItem>
                  <SelectItem value="whatsapp">WhatsApp</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Best Time to Call</Label>
              <Input 
                placeholder="e.g., 9am-12pm PST"
                value={editForm.bestTimeToCall || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, bestTimeToCall: e.target.value }))}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Description</Label>
              <Textarea 
                value={editForm.description || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, description: e.target.value }))}
                rows={3}
              />
            </div>
            <div className="col-span-2 space-y-2">
              <Label>Internal Notes</Label>
              <Textarea 
                placeholder="Notes visible only to your team..."
                value={editForm.internalNotes || ""}
                onChange={(e) => setEditForm(prev => ({ ...prev, internalNotes: e.target.value }))}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEditOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => updateLeadMutation.mutate(editForm)}
              disabled={!editForm.name?.trim() || updateLeadMutation.isPending}
            >
              {updateLeadMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

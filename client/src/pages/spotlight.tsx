import { useState, useEffect, useRef } from "react";
import { Link } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  ArrowLeft,
  Mail,
  Phone,
  Building2,
  User,
  MapPin,
  Globe,
  DollarSign,
  UserCog,
  Check,
  X,
  Printer,
  FileText,
  Package,
  RefreshCw,
  Sparkles,
  AlertCircle,
  ExternalLink,
  MessageSquare,
  Send,
  PhoneCall,
  PhoneMissed,
  Voicemail,
  Clock,
  Calendar,
  HelpCircle,
  Truck,
  Tag,
  CheckCircle,
  Target,
  Ban,
  Pause,
  Play,
  Flame,
  Zap,
  Coffee,
  Settings,
  Users,
  AlertTriangle,
  ThumbsUp,
  ThumbsDown,
  GitMerge,
} from "lucide-react";

type TaskBucket = 'calls' | 'follow_ups' | 'outreach' | 'data_hygiene' | 'enablement';

interface TaskOutcome {
  id: string;
  label: string;
  icon?: string;
  nextAction?: {
    type: 'schedule_follow_up' | 'send_email' | 'mark_complete' | 'no_action';
    daysUntil?: number;
    taskType?: string;
  };
}

interface SpotlightTask {
  id: string;
  customerId: string;
  bucket: TaskBucket;
  taskSubtype: string;
  priority: number;
  whyNow: string;
  outcomes: TaskOutcome[];
  customer: {
    id: string;
    company: string | null;
    firstName: string | null;
    lastName: string | null;
    email: string | null;
    phone: string | null;
    address1: string | null;
    address2: string | null;
    city: string | null;
    province: string | null;
    zip: string | null;
    country: string | null;
    website: string | null;
    salesRepId: string | null;
    salesRepName: string | null;
    pricingTier: string | null;
    isHotProspect: boolean | null;
  };
  context?: {
    followUpId?: number;
    followUpTitle?: string;
    followUpDueDate?: string;
    lastContact?: string;
  };
}

interface BucketQuota {
  bucket: TaskBucket;
  target: number;
  completed: number;
  skipped: number;
}

interface SpotlightSession {
  totalCompleted: number;
  totalTarget: number;
  buckets: BucketQuota[];
  dayComplete: boolean;
  isPaused?: boolean;
  efficiencyScore?: number;
  currentStreak?: number;
  lastActivityAt?: string;
}

interface EfficiencyData {
  score: number;
  breakdown: Record<string, number>;
  streak: number;
}

interface SpotlightHint {
  type: 'bad_fit' | 'stale_contact' | 'duplicate' | 'missing_field' | 'already_handled' | 'quick_win';
  severity: 'high' | 'medium' | 'low';
  message: string;
  ctaLabel: string;
  ctaAction: string;
  metadata?: Record<string, any>;
}

const HINT_STYLES: Record<SpotlightHint['type'], { bg: string; border: string; icon: any; textColor: string }> = {
  bad_fit: { bg: 'bg-red-50 dark:bg-red-950/30', border: 'border-red-200 dark:border-red-800', icon: Ban, textColor: 'text-red-700 dark:text-red-300' },
  stale_contact: { bg: 'bg-amber-50 dark:bg-amber-950/30', border: 'border-amber-200 dark:border-amber-800', icon: Clock, textColor: 'text-amber-700 dark:text-amber-300' },
  duplicate: { bg: 'bg-purple-50 dark:bg-purple-950/30', border: 'border-purple-200 dark:border-purple-800', icon: AlertCircle, textColor: 'text-purple-700 dark:text-purple-300' },
  missing_field: { bg: 'bg-blue-50 dark:bg-blue-950/30', border: 'border-blue-200 dark:border-blue-800', icon: UserCog, textColor: 'text-blue-700 dark:text-blue-300' },
  already_handled: { bg: 'bg-gray-50 dark:bg-gray-800/50', border: 'border-gray-200 dark:border-gray-700', icon: CheckCircle, textColor: 'text-gray-700 dark:text-gray-300' },
  quick_win: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', icon: Flame, textColor: 'text-green-700 dark:text-green-300' },
};

const BUCKET_INFO: Record<TaskBucket, { label: string; icon: any; color: string }> = {
  calls: { label: 'Calls', icon: PhoneCall, color: '#A855F7' },
  follow_ups: { label: 'Follow-ups', icon: RefreshCw, color: '#22C55E' },
  outreach: { label: 'Outreach', icon: Send, color: '#F97316' },
  data_hygiene: { label: 'Data Hygiene', icon: UserCog, color: '#6366F1' },
  enablement: { label: 'Enablement', icon: Package, color: '#06B6D4' },
};

const OUTCOME_ICONS: Record<string, any> = {
  'check': Check,
  'user-check': CheckCircle,
  'user': User,
  'x': X,
  'tag': Tag,
  'building': Building2,
  'truck': Truck,
  'help-circle': HelpCircle,
  'mail': Mail,
  'clock': Clock,
  'phone': Phone,
  'voicemail': Voicemail,
  'phone-missed': PhoneMissed,
  'calendar': Calendar,
  'send': Send,
  'package': Package,
  'file-text': FileText,
  'ban': Ban,
};

const PRICING_FEEDBACK_OPTIONS = [
  { id: 'price', label: 'Price', icon: DollarSign, color: 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200', activeColor: 'bg-red-500 text-white' },
  { id: 'moq', label: 'MOQ', icon: Package, color: 'bg-yellow-100 text-yellow-700 border-yellow-200 hover:bg-yellow-200', activeColor: 'bg-yellow-500 text-white' },
  { id: 'lead_time', label: 'Lead Time', icon: Truck, color: 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200', activeColor: 'bg-blue-500 text-white' },
  { id: 'compatibility', label: 'Compatibility', icon: Settings, color: 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200', activeColor: 'bg-orange-500 text-white' },
  { id: 'has_supplier', label: 'Has Supplier', icon: Users, color: 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200', activeColor: 'bg-purple-500 text-white' },
  { id: 'positive', label: 'Good Feedback', icon: ThumbsUp, color: 'bg-green-100 text-green-700 border-green-200 hover:bg-green-200', activeColor: 'bg-green-500 text-white' },
];

const IDLE_TIMEOUT_MS = 3 * 60 * 60 * 1000; // 3 hours

export default function Spotlight() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [fieldValue, setFieldValue] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showFixDataModal, setShowFixDataModal] = useState(false);
  const [fixDataFields, setFixDataFields] = useState<{ email: string; pricingTier: string; salesRepId: string }>({ email: '', pricingTier: '', salesRepId: '' });
  const [missingFieldsToFix, setMissingFieldsToFix] = useState<string[]>([]);
  const [availableEmails, setAvailableEmails] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeData, setMergeData] = useState<{ sourceCustomer: any; targetCustomer: any; duplicateIds: string[] } | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<Record<string, string>>({});
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);

  const { data: currentTask, isLoading, refetch } = useQuery<{ task: SpotlightTask | null; session: SpotlightSession; allDone: boolean; isPaused?: boolean; hints?: SpotlightHint[] }>({
    queryKey: ['/api/spotlight/current'],
    refetchOnWindowFocus: false,
    staleTime: 30 * 1000,
  });

  const { data: efficiency } = useQuery<EfficiencyData>({
    queryKey: ['/api/spotlight/efficiency'],
    staleTime: 60 * 1000,
    enabled: !!currentTask,
  });

  useEffect(() => {
    const resetIdleTimer = () => {
      lastActivityRef.current = Date.now();
      if (idleTimerRef.current) {
        clearTimeout(idleTimerRef.current);
      }
      idleTimerRef.current = setTimeout(() => {
        if (!currentTask?.allDone && !currentTask?.isPaused && currentTask?.session) {
          const remaining = currentTask.session.totalTarget - currentTask.session.totalCompleted;
          if (remaining > 0) {
            setShowIdleModal(true);
          }
        }
      }, IDLE_TIMEOUT_MS);
    };

    resetIdleTimer();
    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => window.addEventListener(event, resetIdleTimer));

    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      events.forEach(event => window.removeEventListener(event, resetIdleTimer));
    };
  }, [currentTask]);

  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/spotlight/pause', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
      setShowIdleModal(false);
      toast({ title: "Session paused", description: "See you tomorrow!" });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/spotlight/resume', {});
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/efficiency'] });
      toast({ title: "Let's go!", description: "Session resumed" });
    },
  });

  const { data: rawSalesReps = [] } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string }[]>({
    queryKey: ['/api/admin/users'],
    staleTime: 5 * 60 * 1000,
  });

  // Helper to get display name from sales rep
  const getSalesRepDisplayName = (rep: { email: string; firstName?: string; lastName?: string }) => {
    if (rep.firstName && rep.lastName) {
      return `${rep.firstName} ${rep.lastName}`;
    }
    if (rep.firstName) {
      return rep.firstName;
    }
    // Derive from email: aneesh@4sgraphics.com -> Aneesh
    const emailPrefix = rep.email?.split('@')[0] || '';
    return emailPrefix.charAt(0).toUpperCase() + emailPrefix.slice(1).toLowerCase();
  };

  // Deduplicate sales reps by email (lowercase)
  const salesReps = rawSalesReps.filter((rep, index, arr) => {
    if (!rep.email) return false;
    const normalizedEmail = rep.email.toLowerCase();
    return arr.findIndex(r => r.email?.toLowerCase() === normalizedEmail) === index;
  });

  const { data: pricingTiers = [] } = useQuery<{ id: number; name: string }[]>({
    queryKey: ['/api/pricing-tiers'],
    staleTime: 5 * 60 * 1000,
  });

  const completeMutation = useMutation({
    mutationFn: async (data: { taskId: string; outcomeId: string; field?: string; value?: string; notes?: string }) => {
      const res = await apiRequest('POST', '/api/spotlight/complete', data);
      return res.json();
    },
    onSuccess: (result) => {
      setIsTransitioning(true);
      setShowSuccess(true);
      
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
        setFieldValue("");
        setNotes("");
        setShowNotes(false);
        
        setTimeout(() => {
          setIsTransitioning(false);
          setShowSuccess(false);
        }, 300);
      }, 400);
      
      if (result.nextFollowUp) {
        const date = new Date(result.nextFollowUp.date).toLocaleDateString();
        toast({ 
          title: "Done!",
          description: `Follow-up scheduled for ${date}` 
        });
      }
    },
    onError: (error: any) => {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (data: { taskId: string; reason: string }) => {
      const res = await apiRequest('POST', '/api/spotlight/skip', data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
      toast({ title: "Skipped", description: "Moving to next moment..." });
    },
  });

  const [selectedFeedback, setSelectedFeedback] = useState<string[]>([]);

  const feedbackMutation = useMutation({
    mutationFn: async (data: { customerId: string; objectionType: string; categoryName: string }) => {
      const res = await apiRequest('POST', '/api/crm/objections', data);
      return res.json();
    },
    onSuccess: (_, variables) => {
      const feedbackLabel = PRICING_FEEDBACK_OPTIONS.find(o => o.id === variables.objectionType)?.label || variables.objectionType;
      toast({ 
        title: "Feedback logged", 
        description: `"${feedbackLabel}" recorded for this quote` 
      });
    },
    onError: () => {
      toast({ title: "Error", description: "Could not log feedback", variant: "destructive" });
    },
  });

  const handleFeedbackClick = (feedbackId: string) => {
    if (!currentTask?.task) return;
    if (selectedFeedback.includes(feedbackId)) return;
    
    const customerId = currentTask.task.customerId;
    const categoryName = currentTask.task.context?.followUpTitle || 'Quote Follow-up';
    
    setSelectedFeedback(prev => [...prev, feedbackId]);
    feedbackMutation.mutate({ customerId, objectionType: feedbackId, categoryName });
  };

  const fixDataMutation = useMutation({
    mutationFn: async (data: { customerId: string; updates: Record<string, string> }) => {
      const res = await apiRequest('PUT', `/api/customers/${data.customerId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Data updated", description: "Customer information has been updated." });
      setShowFixDataModal(false);
      setFixDataFields({ email: '', pricingTier: '', salesRepId: '' });
      setAvailableEmails([]);
      refetch();
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update customer data", variant: "destructive" });
    },
  });

  const handleFixData = async (missingFields: string[]) => {
    setMissingFieldsToFix(missingFields);
    const customer = currentTask?.task?.customer;
    const customerId = currentTask?.task?.customerId;
    
    // Collect emails from customer
    const emails: string[] = [];
    if (customer?.email) emails.push(customer.email);
    
    // Fetch contacts to get additional emails
    if (customerId) {
      try {
        const res = await fetch(`/api/customers/${customerId}/contacts`);
        if (res.ok) {
          const contacts = await res.json();
          contacts.forEach((contact: any) => {
            if (contact.email && !emails.includes(contact.email)) {
              emails.push(contact.email);
            }
          });
        }
      } catch (e) {
        console.error('Failed to fetch contacts:', e);
      }
    }
    
    setAvailableEmails(emails);
    setFixDataFields({
      email: customer?.email || '',
      pricingTier: customer?.pricingTier || '',
      salesRepId: customer?.salesRepId || '',
    });
    setShowFixDataModal(true);
  };

  const submitFixData = () => {
    if (!currentTask?.task) return;
    const updates: Record<string, string> = {};
    if (missingFieldsToFix.includes('email') && fixDataFields.email.trim()) {
      updates.email = fixDataFields.email.trim();
    }
    if (missingFieldsToFix.includes('pricing tier') && fixDataFields.pricingTier) {
      updates.pricingTier = fixDataFields.pricingTier;
    }
    if (missingFieldsToFix.includes('sales rep') && fixDataFields.salesRepId) {
      updates.salesRepId = fixDataFields.salesRepId;
      // Also set salesRepName using the helper
      const rep = salesReps.find(r => r.id === fixDataFields.salesRepId);
      if (rep) {
        updates.salesRepName = getSalesRepDisplayName(rep);
      }
    }
    if (Object.keys(updates).length > 0) {
      fixDataMutation.mutate({ customerId: currentTask.task.customerId, updates });
    }
  };

  useEffect(() => {
    setSelectedFeedback([]);
  }, [currentTask?.task?.id]);

  // Merge customers mutation
  const mergeCustomersMutation = useMutation({
    mutationFn: async ({ targetId, sourceId, fieldSelections }: { targetId: string; sourceId: string; fieldSelections?: Record<string, string> }) => {
      return await apiRequest("POST", `/api/customers/merge`, { targetId, sourceId, fieldSelections });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({
        title: "Clients merged",
        description: "The two clients have been merged successfully",
      });
      setShowMergeModal(false);
      setMergeData(null);
      setMergeTarget(null);
      setMergeFieldSelections({});
      refetch();
    },
    onError: (error: any) => {
      toast({
        title: "Error merging clients",
        description: error.message || "Failed to merge clients",
        variant: "destructive",
      });
    },
  });

  const handleOpenMergeModal = async (duplicateIds: string[], currentCustomerId: string) => {
    try {
      // Fetch both customers' data
      const [currentRes, duplicateRes] = await Promise.all([
        fetch(`/api/customers/${currentCustomerId}`),
        fetch(`/api/customers/${duplicateIds[0]}`)
      ]);
      
      if (!currentRes.ok || !duplicateRes.ok) {
        throw new Error('Failed to fetch customer data');
      }
      
      const currentCustomer = await currentRes.json();
      const duplicateCustomer = await duplicateRes.json();
      
      setMergeData({
        sourceCustomer: currentCustomer,
        targetCustomer: duplicateCustomer,
        duplicateIds
      });
      setMergeTarget(duplicateIds[0]); // Default to keeping the duplicate as primary
      setMergeFieldSelections({});
      setShowMergeModal(true);
    } catch (error) {
      toast({
        title: "Error",
        description: "Could not load customer data for merge",
        variant: "destructive"
      });
    }
  };

  const handleMerge = () => {
    if (!mergeData || !mergeTarget) return;
    
    const sourceId = mergeTarget === mergeData.targetCustomer.id 
      ? mergeData.sourceCustomer.id 
      : mergeData.targetCustomer.id;
    
    mergeCustomersMutation.mutate({ 
      targetId: mergeTarget, 
      sourceId, 
      fieldSelections: mergeFieldSelections 
    });
  };

  const mergeFields = [
    { key: 'company', label: 'Company Name' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Primary Email' },
    { key: 'phone', label: 'Phone' },
    { key: 'address1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'province', label: 'Province' },
    { key: 'pricingTier', label: 'Pricing Tier' },
  ];

  const handleOutcome = (outcomeId: string, field?: string, value?: string) => {
    if (!currentTask?.task) return;
    completeMutation.mutate({ 
      taskId: currentTask.task.id, 
      outcomeId,
      field, 
      value,
      notes: notes.trim() || undefined,
    });
  };

  const handleSkip = () => {
    if (!currentTask?.task) return;
    skipMutation.mutate({ taskId: currentTask.task.id, reason: 'not_now' });
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-[#111111] mx-auto mb-4" />
          <p className="text-[#666666] text-sm font-medium">Loading Spotlight...</p>
        </div>
      </div>
    );
  }

  const session = currentTask?.session;
  const progress = session ? (session.totalCompleted / session.totalTarget) * 100 : 0;

  if (currentTask?.isPaused) {
    const remaining = (session?.totalTarget || 30) - (session?.totalCompleted || 0);
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 border-[#EAEAEA] bg-white">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center mx-auto mb-6">
            <Coffee className="w-12 h-12 text-indigo-500" />
          </div>
          <CardTitle className="text-2xl mb-2 text-[#111111]">Session Paused</CardTitle>
          <CardDescription className="text-[#666666] mb-6 text-base">
            You've paused for today with {remaining} moments remaining.
            <br />Take a break and come back refreshed!
          </CardDescription>
          
          {efficiency && (
            <div className="flex items-center justify-center gap-4 mb-6">
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-600">
                <Zap className="w-4 h-4" />
                <span className="font-medium">Score: {efficiency.score}</span>
              </div>
              {efficiency.streak > 0 && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-orange-50 text-orange-600">
                  <Flame className="w-4 h-4" />
                  <span className="font-medium">{efficiency.streak} day streak</span>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <Link href="/">
              <Button variant="outline" className="border-[#EAEAEA] text-[#111111] hover:bg-[#F2F2F2]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Button 
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="bg-[#111111] hover:bg-[#333333] text-white"
            >
              <Play className="w-4 h-4 mr-2" />
              Resume Session
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  if (currentTask?.allDone || currentTask?.session?.dayComplete) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 border-[#EAEAEA] bg-white">
          <div className="w-24 h-24 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 flex items-center justify-center mx-auto mb-6">
            <Sparkles className="w-12 h-12 text-emerald-500" />
          </div>
          <CardTitle className="text-2xl mb-2 text-[#111111]">Day Complete!</CardTitle>
          <CardDescription className="text-[#666666] mb-6 text-base">
            You've finished your {session?.totalTarget || 30} moments for today. 
            <br />Great work building momentum!
          </CardDescription>
          
          {session && (
            <div className="grid grid-cols-5 gap-2 mb-6">
              {session.buckets.map((bucket) => {
                const info = BUCKET_INFO[bucket.bucket];
                const BucketIcon = info.icon;
                return (
                  <div key={bucket.bucket} className="text-center">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center mx-auto mb-1"
                      style={{ backgroundColor: info.color + '20' }}
                    >
                      <BucketIcon className="w-5 h-5" style={{ color: info.color }} />
                    </div>
                    <p className="text-xs font-medium text-[#111111]">{bucket.completed}/{bucket.target}</p>
                    <p className="text-xs text-[#999999]">{info.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex gap-4 justify-center">
            <Link href="/">
              <Button variant="outline" className="border-[#EAEAEA] text-[#111111] hover:bg-[#F2F2F2]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Back to Dashboard
              </Button>
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  if (!currentTask?.task) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-4">
        <Card className="max-w-md w-full text-center p-8 border-[#EAEAEA] bg-white">
          <div className="w-20 h-20 rounded-full bg-[#F2F2F2] flex items-center justify-center mx-auto mb-6">
            <Target className="w-10 h-10 text-[#999999]" />
          </div>
          <CardTitle className="text-xl mb-2 text-[#111111]">No Tasks Available</CardTitle>
          <CardDescription className="text-[#666666] mb-6">
            Check back later or refresh to find new moments.
          </CardDescription>
          <div className="flex gap-4 justify-center">
            <Link href="/">
              <Button variant="outline" className="border-[#EAEAEA]">
                <ArrowLeft className="w-4 h-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <Button onClick={() => refetch()} className="bg-[#111111] hover:bg-[#333333] text-white">
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  const task = currentTask.task;
  const bucketInfo = BUCKET_INFO[task.bucket];
  const BucketIcon = bucketInfo.icon;
  const customer = task.customer;
  const customerName = customer.company || `${customer.firstName || ''} ${customer.lastName || ''}`.trim() || 'Unknown Client';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      {/* Header with Progress */}
      <div className="bg-white border-b border-[#EAEAEA] sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-3">
              <Link href="/">
                <Button variant="ghost" size="icon" className="text-[#666666] hover:text-[#111111] h-8 w-8">
                  <ArrowLeft className="w-5 h-5" />
                </Button>
              </Link>
              <div>
                <h1 className="text-base font-semibold text-[#111111]">Spotlight</h1>
                <p className="text-xs text-[#666666]">
                  {session?.totalCompleted || 0} of {session?.totalTarget || 30} moments
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {efficiency && (
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-amber-50 text-amber-600">
                    <Zap className="w-3 h-3" />
                    <span className="text-xs font-medium">{efficiency.score}</span>
                  </div>
                  {efficiency.streak > 0 && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-full bg-orange-50 text-orange-600">
                      <Flame className="w-3 h-3" />
                      <span className="text-xs font-medium">{efficiency.streak}d</span>
                    </div>
                  )}
                </div>
              )}
              <div className="flex items-center gap-1">
                {session?.buckets.map((bucket) => {
                  const info = BUCKET_INFO[bucket.bucket];
                  const BIcon = info.icon;
                  const isActive = bucket.bucket === task.bucket;
                  return (
                    <div 
                      key={bucket.bucket}
                      className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs ${isActive ? 'ring-2' : ''}`}
                      style={{ 
                        backgroundColor: info.color + '15',
                        color: info.color,
                        ringColor: info.color,
                      }}
                    >
                      <BIcon className="w-3 h-3" />
                      <span className="font-medium">{bucket.completed}/{bucket.target}</span>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
          <Progress value={progress} className="h-1.5" />
        </div>
      </div>

      <div className="max-w-2xl mx-auto p-4 pt-6 relative">
        {/* Success Overlay */}
        {showSuccess && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center animate-ping">
              <Check className="w-10 h-10 text-white" />
            </div>
          </div>
        )}

        {/* Task Card Container with Animation */}
        <div className={`transition-all duration-300 ease-out ${isTransitioning ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
          {/* Why Now Card */}
          <div 
            className="rounded-xl p-4 mb-4 flex items-start gap-3"
            style={{ backgroundColor: bucketInfo.color + '10', borderLeft: `4px solid ${bucketInfo.color}` }}
          >
            <BucketIcon className="w-5 h-5 mt-0.5" style={{ color: bucketInfo.color }} />
            <div>
              <p className="font-medium text-[#111111] text-sm">{bucketInfo.label}</p>
              <p className="text-[#666666] text-sm mt-0.5">{task.whyNow}</p>
            </div>
          </div>

          {/* Smart Hints */}
          {currentTask.hints && currentTask.hints.length > 0 && (
            <div className="space-y-2 mb-4">
              {currentTask.hints.map((hint, idx) => {
                const style = HINT_STYLES[hint.type];
                const HintIcon = style.icon;
                return (
                  <div 
                    key={idx}
                    className={`rounded-lg p-3 border ${style.bg} ${style.border} flex items-center justify-between gap-3`}
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <HintIcon className={`w-4 h-4 flex-shrink-0 ${style.textColor}`} />
                      <span className={`text-sm ${style.textColor}`}>{hint.message}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {hint.ctaAction === 'view_duplicate' && hint.metadata?.duplicateIds?.[0] && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs"
                          onClick={() => handleOpenMergeModal(hint.metadata?.duplicateIds || [], customer.id)}
                        >
                          {hint.ctaLabel}
                        </Button>
                      )}
                      {hint.ctaAction !== 'view_duplicate' && (
                        <Button
                          size="sm"
                          variant={hint.severity === 'high' ? 'default' : 'outline'}
                          className={hint.severity === 'high' ? 'bg-red-600 hover:bg-red-700 text-white' : 'text-xs'}
                          onClick={() => {
                            if (hint.ctaAction === 'bad_fit') {
                              completeMutation.mutate({ taskId: task.id, outcomeId: 'bad_fit', outcomeLabel: 'Bad Fit - Not Printing Related' });
                            } else if (hint.ctaAction === 'skip_recent') {
                              skipMutation.mutate({ taskId: task.id, reason: hint.type });
                            } else if (hint.ctaAction === 'reactivation_email') {
                              completeMutation.mutate({ taskId: task.id, outcomeId: 'send_email', outcomeLabel: 'Send Reactivation Email' });
                            } else if (hint.ctaAction === 'fix_data') {
                              handleFixData(hint.metadata?.missingFields || []);
                            }
                          }}
                          disabled={completeMutation.isPending || skipMutation.isPending}
                        >
                          {hint.ctaLabel}
                        </Button>
                      )}
                      {hint.ctaAction === 'view_duplicate' && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-xs text-gray-500"
                          onClick={() => skipMutation.mutate({ taskId: task.id, reason: 'duplicate' })}
                          disabled={skipMutation.isPending}
                        >
                          Skip
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Main Client Card */}
          <Card className="border-[#EAEAEA] bg-white mb-4 shadow-sm">
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <CardTitle className="text-xl text-[#111111] flex items-center gap-2">
                    {customerName}
                    {customer.isHotProspect && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-orange-100 text-orange-600 text-xs font-medium">
                        <Flame className="w-3 h-3" />
                        Hot
                      </span>
                    )}
                    <Link href={`/clients?id=${customer.id}&from=spotlight`}>
                      <Button variant="ghost" size="icon" className="h-6 w-6 text-[#999999] hover:text-[#111111]">
                        <ExternalLink className="w-4 h-4" />
                      </Button>
                    </Link>
                  </CardTitle>
                  <div className="flex items-center gap-3 mt-1.5 text-sm text-[#666666]">
                    {customer.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3.5 h-3.5" />
                        {customer.email}
                      </span>
                    )}
                    {customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {customer.phone}
                      </span>
                    )}
                  </div>
                </div>
                {!customer.isHotProspect && (
                  <Button
                    variant="outline"
                    size="sm"
                    className="flex items-center gap-1.5 text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
                    onClick={() => {
                      apiRequest('PATCH', `/api/customers/${customer.id}`, { isHotProspect: true })
                        .then(() => {
                          toast({ title: "Marked as Hot Prospect", description: "This customer will get more attention." });
                          refetch();
                        })
                        .catch(() => toast({ title: "Error", description: "Failed to mark as hot", variant: "destructive" }));
                    }}
                  >
                    <Flame className="w-4 h-4" />
                    Mark Hot
                  </Button>
                )}
              </div>
            </CardHeader>

            <Separator />

            <CardContent className="pt-4">
              {/* Follow-up context */}
              {task.context?.followUpTitle && (
                <div className="bg-[#F7F7F7] rounded-lg p-3 mb-4">
                  <p className="font-medium text-[#111111] text-sm">{task.context.followUpTitle}</p>
                  {task.context.followUpDueDate && (
                    <p className="text-xs text-[#666666] mt-1">
                      Due: {new Date(task.context.followUpDueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Data Hygiene: Sales Rep Assignment */}
              {task.taskSubtype === 'hygiene_sales_rep' && (
                <div className="space-y-3">
                  <Label className="text-sm text-[#666666]">Assign sales rep:</Label>
                  <Select onValueChange={(value) => handleOutcome('assigned', 'salesRepId', value)}>
                    <SelectTrigger className="border-[#EAEAEA]">
                      <SelectValue placeholder="Select sales rep..." />
                    </SelectTrigger>
                    <SelectContent>
                      {salesReps.map((rep) => (
                        <SelectItem key={rep.id} value={rep.id}>
                          {getSalesRepDisplayName(rep)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Data Hygiene: Pricing Tier */}
              {task.taskSubtype === 'hygiene_pricing_tier' && (
                <div className="grid grid-cols-2 gap-2">
                  {task.outcomes.filter(o => o.id !== 'skip').map((outcome) => (
                    <Button
                      key={outcome.id}
                      variant="outline"
                      className="border-[#EAEAEA] text-[#111111] hover:bg-[#F2F2F2] h-11 capitalize"
                      onClick={() => handleOutcome(outcome.id, 'pricingTier', outcome.id)}
                    >
                      {outcome.icon && OUTCOME_ICONS[outcome.icon] && (
                        (() => {
                          const Icon = OUTCOME_ICONS[outcome.icon];
                          return <Icon className="w-4 h-4 mr-2" />;
                        })()
                      )}
                      {outcome.label}
                    </Button>
                  ))}
                </div>
              )}

              {/* Data Hygiene: Email */}
              {task.taskSubtype === 'hygiene_email' && (
                <div className="space-y-3">
                  <Label className="text-sm text-[#666666]">Enter primary email:</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      placeholder="email@company.com"
                      className="border-[#EAEAEA]"
                      onKeyDown={(e) => e.key === 'Enter' && fieldValue.trim() && handleOutcome('found', 'email', fieldValue.trim())}
                    />
                    <Button 
                      onClick={() => handleOutcome('found', 'email', fieldValue.trim())}
                      className="bg-[#111111] hover:bg-[#333333] text-white"
                      disabled={!fieldValue.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {/* Data Hygiene: Name, Company, Phone */}
              {(task.taskSubtype === 'hygiene_name' || task.taskSubtype === 'hygiene_company' || task.taskSubtype === 'hygiene_phone') && (
                <div className="space-y-3">
                  <Label className="text-sm text-[#666666]">
                    {task.taskSubtype === 'hygiene_name' && 'Enter contact name:'}
                    {task.taskSubtype === 'hygiene_company' && 'Enter company name:'}
                    {task.taskSubtype === 'hygiene_phone' && 'Enter phone number:'}
                  </Label>
                  <div className="flex gap-2">
                    <Input
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      placeholder={
                        task.taskSubtype === 'hygiene_name' ? 'First Last' :
                        task.taskSubtype === 'hygiene_company' ? 'Company Name' : 
                        '(555) 555-5555'
                      }
                      className="border-[#EAEAEA]"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && fieldValue.trim()) {
                          const field = task.taskSubtype === 'hygiene_name' ? 'firstName' :
                                        task.taskSubtype === 'hygiene_company' ? 'company' : 'phone';
                          handleOutcome('found', field, fieldValue.trim());
                        }
                      }}
                    />
                    <Button 
                      onClick={() => {
                        const field = task.taskSubtype === 'hygiene_name' ? 'firstName' :
                                      task.taskSubtype === 'hygiene_company' ? 'company' : 'phone';
                        handleOutcome('found', field, fieldValue.trim());
                      }}
                      className="bg-[#111111] hover:bg-[#333333] text-white"
                      disabled={!fieldValue.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {/* Pricing Feedback Icons for Quote-Related Tasks */}
              {(task.taskSubtype === 'sales_quote_follow_up' || 
                (task.context?.followUpTitle && task.context.followUpTitle.toLowerCase().includes('quote'))) && (
                <div className="mb-4">
                  <div className="flex items-center gap-2 mb-2">
                    <DollarSign className="w-4 h-4 text-[#666666]" />
                    <span className="text-sm text-[#666666] font-medium">Quick Feedback</span>
                    <span className="text-xs text-[#999999]">(tap any that apply)</span>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {PRICING_FEEDBACK_OPTIONS.map((option) => {
                      const Icon = option.icon;
                      const isSelected = selectedFeedback.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          onClick={() => handleFeedbackClick(option.id)}
                          disabled={feedbackMutation.isPending}
                          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                            isSelected 
                              ? option.activeColor + ' border-transparent shadow-sm' 
                              : option.color
                          }`}
                        >
                          <Icon className="w-3.5 h-3.5" />
                          {option.label}
                          {isSelected && <Check className="w-3 h-3 ml-0.5" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Outcome Buttons for non-data-hygiene tasks */}
              {task.bucket !== 'data_hygiene' && task.outcomes.length > 0 && (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {task.outcomes.map((outcome) => {
                    const OutcomeIcon = outcome.icon ? OUTCOME_ICONS[outcome.icon] : Check;
                    const isPositive = ['connected', 'completed', 'sent', 'done', 'email_sent', 'called', 'already_has', 'already_engaged'].includes(outcome.id);
                    const isDNC = outcome.id === 'bad_fit' || outcome.nextAction?.type === 'mark_dnc';
                    const isNegative = ['bad_number', 'not_interested', 'lost'].includes(outcome.id);
                    
                    return (
                      <Button
                        key={outcome.id}
                        variant={isPositive ? 'default' : 'outline'}
                        className={`h-auto py-3 px-3 flex flex-col items-center justify-center gap-1 text-center ${
                          isPositive ? 'bg-emerald-600 hover:bg-emerald-700 text-white' :
                          isDNC ? 'border-red-300 text-red-700 hover:bg-red-100 bg-red-50' :
                          isNegative ? 'border-amber-200 text-amber-700 hover:bg-amber-50' :
                          'border-[#EAEAEA] text-[#111111] hover:bg-[#F2F2F2]'
                        }`}
                        onClick={() => handleOutcome(outcome.id)}
                      >
                        {OutcomeIcon && <OutcomeIcon className="w-5 h-5" />}
                        <span className="text-xs font-medium leading-tight">{outcome.label}</span>
                        {outcome.nextAction?.daysUntil && (
                          <span className="text-[10px] opacity-70">
                            +{outcome.nextAction.daysUntil}d
                          </span>
                        )}
                      </Button>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quick Notes (optional) */}
          <div className="mb-4">
            {!showNotes ? (
              <Button 
                variant="ghost" 
                size="sm"
                className="text-[#999999] hover:text-[#666666] w-full"
                onClick={() => setShowNotes(true)}
              >
                <MessageSquare className="w-4 h-4 mr-2" />
                Add a note (optional)
              </Button>
            ) : (
              <div className="space-y-2">
                <Textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Quick note about this interaction..."
                  className="border-[#EAEAEA] min-h-[80px] text-sm"
                />
                <div className="flex gap-2">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-[#999999]"
                    onClick={() => { setShowNotes(false); setNotes(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            )}
          </div>

          {/* Client Details Summary */}
          <Card className="border-[#EAEAEA] bg-white/50">
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <span className="text-[#999999] text-xs">Sales Rep</span>
                  <p className="font-medium text-[#111111]">{customer.salesRepName || '—'}</p>
                </div>
                <div>
                  <span className="text-[#999999] text-xs">Pricing Tier</span>
                  <p className="font-medium text-[#111111] capitalize">{customer.pricingTier || '—'}</p>
                </div>
                {customer.address1 && (
                  <div className="col-span-2">
                    <span className="text-[#999999] text-xs">Address</span>
                    <p className="font-medium text-[#111111]">
                      {customer.address1}{customer.city ? `, ${customer.city}` : ''}{customer.province ? `, ${customer.province}` : ''} {customer.zip || ''}
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Skip Button */}
          <div className="mt-6 flex justify-center pb-8">
            <Button 
              variant="ghost" 
              className="text-[#999999] hover:text-[#666666]"
              onClick={handleSkip}
              disabled={skipMutation.isPending}
            >
              <X className="w-4 h-4 mr-2" />
              Skip this one
            </Button>
          </div>
        </div>
      </div>

      {/* Idle Check-in Modal */}
      <Dialog open={showIdleModal} onOpenChange={setShowIdleModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-indigo-500" />
              Taking a break?
            </DialogTitle>
            <DialogDescription>
              You've been away for a while. Would you like to continue or pause for today?
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4">
            {efficiency && (
              <div className="flex items-center justify-center gap-4 mb-4">
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-50 text-amber-600">
                  <Zap className="w-4 h-4" />
                  <span className="font-medium">Score: {efficiency.score}</span>
                </div>
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 text-blue-600">
                  <Target className="w-4 h-4" />
                  <span className="font-medium">{(session?.totalTarget || 30) - (session?.totalCompleted || 0)} left</span>
                </div>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                pauseMutation.mutate();
              }}
              disabled={pauseMutation.isPending}
              className="flex-1"
            >
              <Pause className="w-4 h-4 mr-2" />
              Pause Until Tomorrow
            </Button>
            <Button
              onClick={() => {
                setShowIdleModal(false);
                lastActivityRef.current = Date.now();
              }}
              className="flex-1 bg-[#111111] hover:bg-[#333333]"
            >
              <Play className="w-4 h-4 mr-2" />
              Keep Going
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Fix Data Modal */}
      <Dialog open={showFixDataModal} onOpenChange={setShowFixDataModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <UserCog className="w-5 h-5 text-blue-500" />
              Update Missing Data
            </DialogTitle>
            <DialogDescription>
              Fill in the missing information to improve data quality.
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            {missingFieldsToFix.includes('email') && (
              <div className="space-y-2">
                <Label htmlFor="fix-email" className="text-sm font-medium">Email Address</Label>
                {availableEmails.length > 0 ? (
                  <div className="space-y-2">
                    <Select 
                      value={fixDataFields.email} 
                      onValueChange={(value) => setFixDataFields(prev => ({ ...prev, email: value === '__new__' ? '' : value }))}
                    >
                      <SelectTrigger className="border-[#EAEAEA]">
                        <SelectValue placeholder="Select an email..." />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEmails.map((email) => (
                          <SelectItem key={email} value={email}>
                            {email}
                          </SelectItem>
                        ))}
                        <SelectItem value="__new__">
                          <span className="text-blue-600">+ Enter new email</span>
                        </SelectItem>
                      </SelectContent>
                    </Select>
                    {fixDataFields.email === '' && (
                      <Input
                        type="email"
                        value={fixDataFields.email}
                        onChange={(e) => setFixDataFields(prev => ({ ...prev, email: e.target.value }))}
                        placeholder="Enter new email address..."
                        className="border-[#EAEAEA]"
                      />
                    )}
                  </div>
                ) : (
                  <Input
                    id="fix-email"
                    type="email"
                    value={fixDataFields.email}
                    onChange={(e) => setFixDataFields(prev => ({ ...prev, email: e.target.value }))}
                    placeholder="customer@example.com"
                    className="border-[#EAEAEA]"
                  />
                )}
              </div>
            )}
            {missingFieldsToFix.includes('pricing tier') && (
              <div className="space-y-2">
                <Label htmlFor="fix-pricing" className="text-sm font-medium">Pricing Tier</Label>
                <Select 
                  value={fixDataFields.pricingTier} 
                  onValueChange={(value) => setFixDataFields(prev => ({ ...prev, pricingTier: value }))}
                >
                  <SelectTrigger className="border-[#EAEAEA]">
                    <SelectValue placeholder="Select pricing tier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {pricingTiers.map((tier) => (
                      <SelectItem key={tier.id} value={tier.name}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {missingFieldsToFix.includes('sales rep') && (
              <div className="space-y-2">
                <Label htmlFor="fix-salesrep" className="text-sm font-medium">Sales Rep</Label>
                <Select 
                  value={fixDataFields.salesRepId} 
                  onValueChange={(value) => setFixDataFields(prev => ({ ...prev, salesRepId: value }))}
                >
                  <SelectTrigger className="border-[#EAEAEA]">
                    <SelectValue placeholder="Select sales rep..." />
                  </SelectTrigger>
                  <SelectContent>
                    {salesReps.map((rep) => (
                      <SelectItem key={rep.id} value={rep.id}>
                        {getSalesRepDisplayName(rep)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => setShowFixDataModal(false)}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={submitFixData}
              disabled={fixDataMutation.isPending}
              className="flex-1 bg-[#111111] hover:bg-[#333333]"
            >
              {fixDataMutation.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Merge Customers Modal */}
      <Dialog open={showMergeModal} onOpenChange={setShowMergeModal}>
        <DialogContent className="sm:max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitMerge className="w-5 h-5 text-purple-500" />
              Merge Duplicate Clients
            </DialogTitle>
            <DialogDescription>
              Select which client to keep as the primary record. Data from the other client will be merged in.
            </DialogDescription>
          </DialogHeader>
          
          {mergeData && (
            <div className="py-4 space-y-4">
              {/* Select Primary Client */}
              <div className="grid grid-cols-2 gap-4">
                <button
                  type="button"
                  onClick={() => setMergeTarget(mergeData.sourceCustomer.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    mergeTarget === mergeData.sourceCustomer.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-500 mb-1">Current Card</div>
                  <div className="font-semibold text-[#111111]">
                    {mergeData.sourceCustomer.company || `${mergeData.sourceCustomer.firstName || ''} ${mergeData.sourceCustomer.lastName || ''}`.trim() || 'Unknown'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{mergeData.sourceCustomer.email || 'No email'}</div>
                  {mergeTarget === mergeData.sourceCustomer.id && (
                    <Badge className="mt-2 bg-purple-500">Keep as Primary</Badge>
                  )}
                </button>
                
                <button
                  type="button"
                  onClick={() => setMergeTarget(mergeData.targetCustomer.id)}
                  className={`p-4 rounded-lg border-2 text-left transition-all ${
                    mergeTarget === mergeData.targetCustomer.id
                      ? 'border-purple-500 bg-purple-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium text-sm text-gray-500 mb-1">Duplicate Found</div>
                  <div className="font-semibold text-[#111111]">
                    {mergeData.targetCustomer.company || `${mergeData.targetCustomer.firstName || ''} ${mergeData.targetCustomer.lastName || ''}`.trim() || 'Unknown'}
                  </div>
                  <div className="text-sm text-gray-500 mt-1">{mergeData.targetCustomer.email || 'No email'}</div>
                  {mergeTarget === mergeData.targetCustomer.id && (
                    <Badge className="mt-2 bg-purple-500">Keep as Primary</Badge>
                  )}
                </button>
              </div>

              {/* Field Selection */}
              <div className="border-t pt-4">
                <h4 className="font-medium text-sm text-gray-700 mb-3">Choose which data to keep for each field:</h4>
                <div className="space-y-3">
                  {mergeFields.map(({ key, label }) => {
                    const valueA = mergeData.sourceCustomer[key] || '';
                    const valueB = mergeData.targetCustomer[key] || '';
                    const selectedValue = mergeFieldSelections[key];
                    
                    if (!valueA && !valueB && key !== 'pricingTier') return null;
                    if (valueA === valueB && key !== 'pricingTier') return null;
                    
                    // Special handling for Pricing Tier - show dropdown from app config
                    if (key === 'pricingTier') {
                      return (
                        <div key={key} className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
                          <Select 
                            value={selectedValue || valueA || valueB || ''} 
                            onValueChange={(value) => setMergeFieldSelections(prev => ({ ...prev, [key]: value }))}
                          >
                            <SelectTrigger className="border-gray-200 bg-white">
                              <SelectValue placeholder="Select pricing tier..." />
                            </SelectTrigger>
                            <SelectContent>
                              {pricingTiers.map((tier) => (
                                <SelectItem key={tier.id} value={tier.name}>
                                  {tier.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                          {(valueA || valueB) && (
                            <div className="mt-2 text-xs text-gray-500">
                              Current values: {valueA && <span className="font-medium">{valueA}</span>}
                              {valueA && valueB && ' / '}
                              {valueB && <span className="font-medium">{valueB}</span>}
                            </div>
                          )}
                        </div>
                      );
                    }
                    
                    return (
                      <div key={key} className="bg-gray-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-gray-500 mb-2">{label}</div>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => setMergeFieldSelections(prev => ({ ...prev, [key]: mergeData.sourceCustomer.id }))}
                            className={`p-2 text-left rounded border text-sm transition-all cursor-pointer hover:bg-gray-100 ${
                              selectedValue === mergeData.sourceCustomer.id
                                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500 font-medium'
                                : 'border-gray-200 hover:border-purple-300 bg-white'
                            }`}
                          >
                            {valueA || <span className="text-gray-400 italic">Empty</span>}
                          </button>
                          <button
                            type="button"
                            onClick={() => setMergeFieldSelections(prev => ({ ...prev, [key]: mergeData.targetCustomer.id }))}
                            className={`p-2 text-left rounded border text-sm transition-all cursor-pointer hover:bg-gray-100 ${
                              selectedValue === mergeData.targetCustomer.id
                                ? 'border-purple-500 bg-purple-50 ring-2 ring-purple-500 font-medium'
                                : 'border-gray-200 hover:border-purple-300 bg-white'
                            }`}
                          >
                            {valueB || <span className="text-gray-400 italic">Empty</span>}
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex gap-2 sm:gap-2">
            <Button
              variant="outline"
              onClick={() => {
                setShowMergeModal(false);
                setMergeData(null);
                setMergeTarget(null);
                setMergeFieldSelections({});
              }}
              className="flex-1"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={!mergeTarget || mergeCustomersMutation.isPending}
              className="flex-1 bg-purple-600 hover:bg-purple-700"
            >
              {mergeCustomersMutation.isPending ? 'Merging...' : 'Merge Clients'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

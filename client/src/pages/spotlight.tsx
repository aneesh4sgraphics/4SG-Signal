import { useState, useEffect, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { EmailRichTextEditor, type EmailRichTextEditorRef } from "@/components/EmailRichTextEditor";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { PRICING_TIERS } from "@shared/schema";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
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
  Trash2,
  Award,
  Battery,
  Lightbulb,
  BookOpen,
  Star,
  Trophy,
  Rocket,
  ChevronDown,
  ChevronRight,
  UserPlus,
  Search,
  Box,
  UserX,
  Linkedin,
  SkipForward,
  PhoneOff,
  XCircle,
  MoreHorizontal,
  ClipboardList,
  Pencil,
  Gift,
  MessageCircle,
  ShoppingCart,
} from "lucide-react";
import { SiShopify } from "react-icons/si";

// Progress Ring SVG Component for Pastel & Soft design
const ProgressRing = ({ progress, size = 120, strokeWidth = 8 }: { progress: number; size?: number; strokeWidth?: number }) => {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  
  return (
    <svg width={size} height={size} className="spotlight-progress-ring">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#E5E7EB"
        strokeWidth={strokeWidth}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="url(#progressGradient)"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
      />
      <defs>
        <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#60A5FA" />
        </linearGradient>
      </defs>
    </svg>
  );
};
import { PrintLabelButton } from "@/components/PrintLabelButton";

type TaskBucket = 'calls' | 'follow_ups' | 'outreach' | 'data_hygiene' | 'enablement';

interface TaskOutcome {
  id: string;
  label: string;
  icon?: string;
  nextAction?: {
    type: 'schedule_follow_up' | 'send_email' | 'mark_complete' | 'no_action' | 'mark_dnc' | 'custom_follow_up' | 'delete_record' | 'set_customer_type';
    daysUntil?: number;
    taskType?: string;
    customerType?: string;
  };
}

interface SpotlightTask {
  id: string;
  customerId: string;
  leadId?: number;
  isLeadTask?: boolean;
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
    customerType: string | null;
  };
  lead?: {
    id: number;
    name: string;
    company: string | null;
    email: string | null;
    phone: string | null;
    mobile: string | null;
    stage: string;
    priority: string | null;
    score: number | null;
    city: string | null;
    state: string | null;
    salesRepId: string | null;
    salesRepName: string | null;
    firstEmailSentAt: string | null;
    firstEmailReplyAt: string | null;
    lastContactAt: string | null;
    totalTouchpoints: number | null;
    customerType: string | null;
  };
  context?: {
    followUpId?: number;
    followUpTitle?: string;
    followUpDueDate?: string;
    lastContact?: string;
    machineTypes?: string[];
    machineLabels?: string[];
    suggestedProducts?: string[];
    machineContext?: string;
    sourceType?: string;
    // Email task context
    emailId?: number;
    gmailMessageId?: string;
    gmailThreadId?: string;
    originalSubject?: string;
    sentAt?: string;
    daysSinceEmail?: number;
    // Drip campaign context
    campaignName?: string;
    stepName?: string;
    emailsSent?: number;
    daysSinceLastEmail?: number;
    replySubject?: string;
    repliedAt?: string;
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
  currentEnergy?: number;
  warmupShown?: boolean;
}

interface GamificationState {
  comboCount: number;
  comboMultiplier: number;
  currentStreak: number;
  powerUpsAvailable: number;
  hardTasksCompleted: number;
  tasksSinceMicroCard: number;
}

interface MicroCoachingCard {
  id: number;
  cardType: 'product_quiz' | 'objection_practice' | 'customer_story' | 'competitor_intel' | 'machine_profile_check';
  title: string;
  content: string;
  question?: string;
  options?: string[];
  correctAnswer?: number;
  explanation?: string;
  objectionType?: string;
  suggestedResponses?: { id: string; text: string; isRecommended: boolean }[];
  difficulty: string;
}

interface CoachTip {
  id: number;
  tipType: string;
  content: string;
}

interface WarmupData {
  yesterdaySummary: { calls: number; tasksCompleted: number; pricingTiersAssigned: number };
  todayFocus: string;
  streak: number;
}

interface EfficiencyData {
  score: number;
  breakdown: Record<string, number>;
  streak: number;
}

interface SpotlightHint {
  type: 'bad_fit' | 'stale_contact' | 'duplicate' | 'missing_field' | 'quick_win';
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
  quick_win: { bg: 'bg-green-50 dark:bg-green-950/30', border: 'border-green-200 dark:border-green-800', icon: Flame, textColor: 'text-green-700 dark:text-green-300' },
};

const BUCKET_INFO: Record<TaskBucket, { label: string; icon: any; color: string }> = {
  calls: { label: 'Calls', icon: PhoneCall, color: '#A855F7' },
  follow_ups: { label: 'Follow-ups', icon: RefreshCw, color: '#22C55E' },
  outreach: { label: 'Emails', icon: Mail, color: '#F97316' },
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
  'box': Box,
  'linkedin': Linkedin,
  'star': Star,
  'user-x': UserX,
  'trash-2': Trash2,
  'printer': Printer,
  'trending-up': Rocket, // Use Rocket as fallback for trending-up
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
  const [, setLocation] = useLocation();
  const [fieldValue, setFieldValue] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [showVoicemailNote, setShowVoicemailNote] = useState(false);
  const [voicemailNote, setVoicemailNote] = useState("");
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [showCallCoachingModal, setShowCallCoachingModal] = useState(false);
  const [callCoachingDismissedToday, setCallCoachingDismissedToday] = useState(false);
  const [showFixDataModal, setShowFixDataModal] = useState(false);
  const [fixDataFields, setFixDataFields] = useState<{ email: string; pricingTier: string; salesRepId: string }>({ email: '', pricingTier: '', salesRepId: '' });
  const [missingFieldsToFix, setMissingFieldsToFix] = useState<string[]>([]);
  const [availableEmails, setAvailableEmails] = useState<string[]>([]);
  const [showMergeModal, setShowMergeModal] = useState(false);
  const [mergeData, setMergeData] = useState<{ sourceCustomer: any; targetCustomer: any; duplicateIds: string[] } | null>(null);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [mergeFieldSelections, setMergeFieldSelections] = useState<Record<string, string>>({});
  const [mergeEmailSelections, setMergeEmailSelections] = useState<{ primary: string; secondary: string }>({ primary: '', secondary: '' });
  const [showProfilePanel, setShowProfilePanel] = useState(false);
  const [profileEditMode, setProfileEditMode] = useState(false);
  const [editingWebsite, setEditingWebsite] = useState(false);
  const [websiteValue, setWebsiteValue] = useState('');
  const [profileEditData, setProfileEditData] = useState<{
    phone: string;
    address1: string;
    city: string;
    province: string;
    zip: string;
    website: string;
  }>({ phone: '', address1: '', city: '', province: '', zip: '', website: '' });
  const lastActivityRef = useRef(Date.now());
  const idleTimerRef = useRef<NodeJS.Timeout | null>(null);
  
  // Debug: allow forcing a specific bucket via URL param (e.g., ?forceBucket=data_hygiene)
  const urlParams = new URLSearchParams(window.location.search);
  const forceBucket = urlParams.get('forceBucket');
  const spotlightApiUrl = forceBucket 
    ? `/api/spotlight/current?forceBucket=${forceBucket}` 
    : '/api/spotlight/current';

  const { data: currentTask, isLoading, refetch } = useQuery<{ 
    task: SpotlightTask | null; 
    session: SpotlightSession; 
    allDone: boolean; 
    isPaused?: boolean; 
    hints?: SpotlightHint[];
    gamification?: GamificationState;
    microCard?: MicroCoachingCard | null;
    coachTip?: CoachTip | null;
  }>({
    queryKey: ['/api/spotlight/current', forceBucket],
    queryFn: async () => {
      const res = await fetch(spotlightApiUrl, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to fetch spotlight');
      return res.json();
    },
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000, // Increased from 30s to reduce refetches
    gcTime: 5 * 60 * 1000, // Keep in cache for 5 minutes
  });

  // Fetch "Later Today" scratch pad tasks
  const { data: remindTodayTasks = [], refetch: refetchRemindToday } = useQuery<Array<{
    taskId: string;
    customerId: string;
    bucket: string;
    subtype: string;
    remindedAt: string;
    displayName: string;
    isLead: boolean;
  }>>({
    queryKey: ['/api/spotlight/remind-today'],
    staleTime: 30 * 1000,
  });
  
  const [showWarmup, setShowWarmup] = useState(false);
  const [showMicroCard, setShowMicroCard] = useState(false);
  const [selectedQuizAnswer, setSelectedQuizAnswer] = useState<number | null>(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [showFollowUpDialog, setShowFollowUpDialog] = useState(false);
  const [followUpDays, setFollowUpDays] = useState(7);
  
  // V0 Redesign: Coaching tray states
  const [callScriptOpen, setCallScriptOpen] = useState(false);
  const [emailIdeasOpen, setEmailIdeasOpen] = useState(false);
  const [showAddMachine, setShowAddMachine] = useState(false);
  const [scratchPadOpen, setScratchPadOpen] = useState(false);
  
  // Email composer state
  const [showEmailComposer, setShowEmailComposer] = useState(false);
  const [showPrintLabel, setShowPrintLabel] = useState(false);
  
  // Remind Later dialog state
  const [showRemindLaterDialog, setShowRemindLaterDialog] = useState(false);
  const [remindLaterDays, setRemindLaterDays] = useState(1);
  const [labelType, setLabelType] = useState<'swatch_book' | 'press_test_kit' | 'mailer' | 'other'>('swatch_book');
  const [labelOtherDescription, setLabelOtherDescription] = useState('');
  const [labelQuantity, setLabelQuantity] = useState(1);
  const [labelNotes, setLabelNotes] = useState('');
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const emailEditorRef = useRef<EmailRichTextEditorRef>(null);
  
  // Optimistic states for immediate UI feedback
  const [optimisticCustomerType, setOptimisticCustomerType] = useState<string | null>(null);
  const [optimisticHotProspect, setOptimisticHotProspect] = useState<boolean | null>(null);
  
  // Reset optimistic states when task changes
  const currentTaskId = currentTask?.task?.id;
  useEffect(() => {
    setOptimisticCustomerType(null);
    setOptimisticHotProspect(null);
  }, [currentTaskId]);
  
  // Coaching content based on task type
  const callScriptIdeas = [
    "Open with a question about their recent order or last conversation",
    "Ask about their current printing needs and any upcoming projects",
    "Mention any new products or promotions that might be relevant",
    "Listen for pain points - pricing, lead time, quality concerns",
  ];
  
  const emailIdeas = [
    "Follow up on the conversation with a summary of discussed points",
    "Include relevant product catalogs or spec sheets",
    "Offer a special discount or promotion if appropriate",
    "Set a clear next step and timeline for follow-up",
  ];
  
  // Fetch user's email signature
  const { data: userSignature } = useQuery<{ signatureHtml: string; name: string; title: string; phone: string }>({
    queryKey: ['/api/email/signature'],
  });

  // Fetch warmup data on mount if not yet shown
  const { data: warmupData } = useQuery<WarmupData>({
    queryKey: ['/api/spotlight/warmup'],
    enabled: !currentTask?.session?.warmupShown,
  });
  
  // Show warmup modal on first visit today
  useEffect(() => {
    if (warmupData && !currentTask?.session?.warmupShown && currentTask?.session?.totalCompleted === 0) {
      setShowWarmup(true);
    }
  }, [warmupData, currentTask?.session?.warmupShown, currentTask?.session?.totalCompleted]);
  
  // Show micro-coaching card when returned from API
  useEffect(() => {
    if (currentTask?.microCard) {
      setShowMicroCard(true);
      setSelectedQuizAnswer(null);
      setQuizAnswered(false);
    }
  }, [currentTask?.microCard?.id]);

  const { data: efficiency } = useQuery<EfficiencyData>({
    queryKey: ['/api/spotlight/efficiency'],
    staleTime: 60 * 1000,
    enabled: !!currentTask,
  });

  // Fetch today's comprehensive progress for all 5 bars
  const { data: todayProgress } = useQuery<{
    swatchbooks: {
      count: number;
      goal: number;
      progress: number;
      goalMet: boolean;
      breakdown: {
        swatchBooks: number;
        pressTestKits: number;
        sampleFollowUps: number;
      };
    };
    calls: {
      count: number;
      goal: number;
      progress: number;
      goalMet: boolean;
    };
    emails: {
      count: number;
      goal: number;
      progress: number;
      goalMet: boolean;
    };
    dataHygiene: {
      count: number;
      goal: number;
      progress: number;
      goalMet: boolean;
    };
    quotesFollowedUp: {
      count: number;
      goal: number;
      progress: number;
      goalMet: boolean;
      highPriority: boolean;
    };
  }>({
    queryKey: ['/api/spotlight/today-progress'],
    staleTime: 30 * 1000, // Refresh every 30 seconds
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

  // Check if user is avoiding calls and show coaching popup
  useEffect(() => {
    const tasksCompleted = currentTask?.session?.totalCompleted || 0;
    const callsMade = todayProgress?.calls?.count || 0;
    
    // Show coaching popup if:
    // - User has completed 10+ tasks (about 1 full cycle)
    // - User has made 0 calls
    // - User hasn't dismissed the popup today
    // - Not already showing the popup
    if (tasksCompleted >= 10 && callsMade === 0 && !callCoachingDismissedToday && !showCallCoachingModal) {
      setShowCallCoachingModal(true);
    }
  }, [currentTask?.session?.totalCompleted, todayProgress?.calls?.count, callCoachingDismissedToday, showCallCoachingModal]);

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

  // Update customer profile from edit mode
  const updateProfileMutation = useMutation({
    mutationFn: async (data: { customerId: string; updates: Record<string, any> }) => {
      const res = await apiRequest('PUT', `/api/customers/${data.customerId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
      setProfileEditMode(false);
      toast({ title: "Saved!", description: "Contact information updated successfully" });
    },
    onError: (error: Error) => {
      toast({ title: "Error", description: error.message || "Failed to update contact", variant: "destructive" });
    },
  });

  // Mutation to continue working after completion
  const continueMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/spotlight/continue', {});
      return res.json();
    },
    onSuccess: () => {
      toast({
        title: "Let's keep going!",
        description: "You can continue working on more tasks.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/next'] });
      refetch();
    },
    onError: (error: Error) => {
      toast({
        title: "Error",
        description: error.message || "Failed to continue session",
        variant: "destructive",
      });
    },
  });

  const { data: salesReps = [] } = useQuery<{ id: string; name: string; email: string }[]>({
    queryKey: ['/api/sales-reps'],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch machine profiles for current customer (not for leads)
  const customerId = currentTask?.task?.customer?.id;
  const isLeadTask = currentTask?.task?.isLeadTask || customerId?.startsWith('lead-');
  const leadId = currentTask?.task?.leadId || (isLeadTask && customerId ? parseInt(customerId.replace('lead-', '')) : null);
  
  const { data: customerMachines = [] } = useQuery<{ id: number; machineFamily: string; confirmed: boolean }[]>({
    queryKey: ['/api/crm/machine-profiles', customerId],
    queryFn: async () => {
      // Skip machine profiles for lead tasks - leads don't have machine profiles
      if (!customerId || isLeadTask) return [];
      const res = await fetch(`/api/crm/machine-profiles/${customerId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId && !isLeadTask,
    staleTime: 60 * 1000,
  });

  // Fetch available machine types for inline add
  const { data: machineTypes = [] } = useQuery<{ id: number; code: string; label: string }[]>({
    queryKey: ['/api/crm/machine-types'],
    staleTime: 5 * 60 * 1000,
  });

  // Fetch customer trust metrics (calls, samples, orders, emails)
  const { data: trustMetrics } = useQuery<{
    calls: number;
    samples: number;
    emails: number;
    ordersValue: number;
    ordersCount: number;
  }>({
    queryKey: ['/api/customers', customerId, 'trust-metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${customerId}/trust-metrics`, { credentials: 'include' });
      if (!res.ok) return { calls: 0, samples: 0, emails: 0, ordersValue: 0, ordersCount: 0 };
      return res.json();
    },
    enabled: !!customerId && !isLeadTask,
    staleTime: 2 * 60 * 1000,
  });

  // Add machine mutation (not available for leads)
  const addMachineMutation = useMutation({
    mutationFn: async (machineFamily: string) => {
      if (!customerId) throw new Error('No customer selected');
      if (isLeadTask) throw new Error('Machine profiles are not available for leads. Convert to customer first.');
      return apiRequest('POST', '/api/crm/machine-profiles', { customerId, machineFamily, status: 'confirmed', source: 'spotlight' });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/crm/machine-profiles', customerId] });
      setShowAddMachine(false);
      toast({ title: 'Machine added', description: 'Customer machine profile updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error?.message || 'Failed to add machine', variant: 'destructive' });
    },
  });

  // Fetch email templates
  const { data: emailTemplates = [] } = useQuery<{ id: number; name: string; subject: string; body: string; category?: string }[]>({
    queryKey: ['/api/email/templates'],
    staleTime: 5 * 60 * 1000,
  });

  // Send email mutation - also marks task as complete for Follow-Up credit
  const sendEmailMutation = useMutation({
    mutationFn: async (data: { to: string; subject: string; body: string; customerId?: string; taskId?: string }) => {
      return apiRequest('POST', '/api/email/send', {
        ...data,
        htmlBody: data.body.replace(/\n/g, '<br>'),
      });
    },
    onSuccess: (_, variables) => {
      setShowEmailComposer(false);
      setEmailTo('');
      setEmailSubject('');
      setEmailBody('');
      setSelectedTemplateId(null);
      toast({ title: 'Email sent!', description: 'Your email was sent successfully via Gmail' });
      
      // Mark the current Spotlight task as complete (counts as Follow-Up)
      if (variables.taskId || currentTask?.task?.id) {
        const taskId = variables.taskId || currentTask?.task?.id;
        if (taskId) {
          completeMutation.mutate({ 
            taskId, 
            outcomeId: 'email_sent',
            notes: `Email sent to ${variables.to}: ${variables.subject?.substring(0, 50)}...`
          });
        }
      }
    },
    onError: (error: any) => {
      const errorMessage = error?.message || 'Could not send email';
      const isConnectionError = errorMessage.toLowerCase().includes('not connected') || 
                                 errorMessage.toLowerCase().includes('reconnect');
      toast({ 
        title: 'Failed to send', 
        description: isConnectionError 
          ? 'Gmail not connected. Please connect your Gmail in Settings to send emails.'
          : errorMessage, 
        variant: 'destructive' 
      });
    },
  });

  const printLabelMutation = useMutation({
    mutationFn: async (data: { labelType: string; otherDescription?: string; quantity: number; notes?: string }) => {
      // For leads, pass leadId instead of customerId
      const res = await apiRequest('POST', '/api/labels/print', {
        customerId: isLeadTask ? undefined : customerId,
        leadId: isLeadTask ? leadId : undefined,
        labelType: data.labelType,
        otherDescription: data.otherDescription,
        quantity: data.quantity,
        notes: data.notes,
      });
      // Parse the JSON response to get pdfUrl
      return res.json();
    },
    onSuccess: (data: any) => {
      // Open the PDF in a new tab
      if (data?.pdfUrl) {
        window.open(data.pdfUrl, '_blank');
        toast({ title: 'Label created!', description: `Opening ${labelQuantity} label(s) in new tab` });
      } else {
        toast({ title: 'Label created', description: 'Label was generated but no PDF URL returned', variant: 'destructive' });
      }
      setShowPrintLabel(false);
      setLabelType('swatch_book');
      setLabelOtherDescription('');
      setLabelQuantity(1);
      setLabelNotes('');
    },
    onError: (error: any) => {
      toast({ title: 'Failed to print label', description: error?.message || 'Could not generate label', variant: 'destructive' });
    },
  });

  // Fetch activity events for current customer
  const { data: customerNotes = [] } = useQuery<{ id: number; eventType: string; summary: string; occurredAt: string; metadata?: any }[]>({
    queryKey: ['/api/customer-activity/events', customerId],
    queryFn: async () => {
      if (!customerId) return [];
      const res = await fetch(`/api/customer-activity/events?customerId=${customerId}`, { credentials: 'include' });
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!customerId,
    staleTime: 60 * 1000,
  });

  // Derive email for email history query from current task
  const contactEmail = currentTask?.task?.isLeadTask 
    ? (currentTask.task.lead?.email || currentTask.task.customer?.email)
    : currentTask?.task?.customer?.email;
  const currentLeadId = currentTask?.task?.leadId;

  // Fetch email history for the contact/lead
  const { data: emailHistory = [] } = useQuery<{ id: number; direction: string; fromEmail: string; fromName: string; toEmail: string; subject: string; snippet: string; sentAt: string }[]>({
    queryKey: ['/api/customer-activity/emails', contactEmail || customerId || currentLeadId],
    queryFn: async () => {
      // Priority: contact email > customerId > leadId
      if (contactEmail) {
        const res = await fetch(`/api/customer-activity/emails?contactEmail=${encodeURIComponent(contactEmail)}&limit=10`, { credentials: 'include' });
        if (!res.ok) return [];
        return res.json();
      }
      if (currentLeadId) {
        const res = await fetch(`/api/customer-activity/emails?leadId=${currentLeadId}&limit=10`, { credentials: 'include' });
        if (!res.ok) return [];
        return res.json();
      }
      if (customerId) {
        const res = await fetch(`/api/customer-activity/emails?customerId=${customerId}&limit=10`, { credentials: 'include' });
        if (!res.ok) return [];
        return res.json();
      }
      return [];
    },
    enabled: !!(contactEmail || customerId || currentLeadId),
    staleTime: 60 * 1000,
  });

  // Helper to get display name from sales rep
  const getSalesRepDisplayName = (rep: { name?: string; email: string; firstName?: string; lastName?: string }) => {
    // Special handling for info@4sgraphics.com
    if (rep.email?.toLowerCase() === 'info@4sgraphics.com') {
      return '4SGraphics-Info';
    }
    // Use name directly if available (from unified API)
    if (rep.name) {
      return rep.name;
    }
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

  // Use PRICING_TIERS constant from shared/schema.ts - single source of truth

  const completeMutation = useMutation({
    mutationFn: async (data: { taskId: string; outcomeId: string; field?: string; value?: string; notes?: string; customFollowUpDays?: number }) => {
      const res = await apiRequest('POST', '/api/spotlight/complete', data);
      return res.json();
    },
    onMutate: () => {
      // INSTANT feedback - start transition immediately when button is clicked
      setIsTransitioning(true);
      setShowSuccess(true);
    },
    onSuccess: (result) => {
      // Immediately invalidate and fetch next task
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current', forceBucket] });
      setFieldValue("");
      setNotes("");
      setShowNotes(false);
      
      // End transition after a brief moment for smooth animation
      setTimeout(() => {
        setIsTransitioning(false);
        setShowSuccess(false);
      }, 100);
      
      if (result.nextFollowUp) {
        const date = new Date(result.nextFollowUp.date).toLocaleDateString();
        toast({ 
          title: "Done!",
          description: `Follow-up scheduled for ${date}` 
        });
      }
    },
    onError: (error: any) => {
      setIsTransitioning(false);
      setShowSuccess(false);
      toast({ title: "Error", description: error.message, variant: "destructive" });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async (data: { taskId: string; reason: string }) => {
      const res = await apiRequest('POST', '/api/spotlight/skip', data);
      return res.json();
    },
    onMutate: () => {
      // INSTANT feedback - start transition immediately
      setIsTransitioning(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current', forceBucket] });
      toast({ title: "Skipped", description: "Moving to next moment..." });
      setTimeout(() => setIsTransitioning(false), 100);
    },
    onError: () => {
      setIsTransitioning(false);
    },
  });

  const remindTodayMutation = useMutation({
    mutationFn: async (data: { taskId: string }) => {
      const res = await apiRequest('POST', '/api/spotlight/remind-today', data);
      return res.json();
    },
    onMutate: () => {
      // INSTANT feedback - start transition immediately
      setIsTransitioning(true);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current', forceBucket] });
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/remind-today'] });
      toast({ title: "Reminder set", description: "This will come up again at end of day" });
      setTimeout(() => setIsTransitioning(false), 100);
    },
    onError: () => {
      setIsTransitioning(false);
      toast({ title: "Error", description: "Failed to set reminder", variant: "destructive" });
    },
  });

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const deleteMutation = useMutation({
    mutationFn: async ({ customerId, isLead, leadId }: { customerId: string; isLead?: boolean; leadId?: number }) => {
      // For leads, delete from leads table
      if (isLead && leadId) {
        const res = await apiRequest('DELETE', `/api/leads/${leadId}`);
        if (!res.ok) {
          if (res.status === 404) {
            return { alreadyDeleted: true, isLead: true };
          }
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to delete lead');
        }
        return { ...await res.json(), isLead: true };
      }
      
      // For customers, delete from customers table
      const res = await apiRequest('DELETE', `/api/customers/${customerId}?reason=Deleted via Spotlight hygiene`);
      if (!res.ok) {
        if (res.status === 404) {
          // Customer already deleted - treat as success
          return { alreadyDeleted: true };
        }
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to delete customer');
      }
      return res.json();
    },
    onMutate: () => {
      // INSTANT feedback - start transition immediately
      setShowDeleteConfirm(false);
      setIsTransitioning(true);
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current', forceBucket] });
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
      queryClient.invalidateQueries({ queryKey: ['/api/leads'] });
      setTimeout(() => setIsTransitioning(false), 100);
      
      const entityType = result?.isLead ? 'Lead' : 'Customer';
      toast({ 
        title: result?.alreadyDeleted ? `${entityType} already deleted` : `${entityType} deleted`, 
        description: result?.alreadyDeleted 
          ? `This ${entityType.toLowerCase()} was already removed from the system`
          : result?.excluded 
            ? `${entityType} removed and blocked from re-import` 
            : `${entityType} removed from database`
      });
    },
    onError: (error: any) => {
      setIsTransitioning(false);
      toast({ title: "Error", description: error.message || "Failed to delete", variant: "destructive" });
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
    mutationFn: async (data: { customerId?: string; leadId?: number; updates: Record<string, string> }) => {
      // For lead tasks, update the lead record instead of customer
      if (data.leadId) {
        const res = await apiRequest('PUT', `/api/leads/${data.leadId}`, data.updates);
        return res.json();
      }
      // For regular customer tasks
      const res = await apiRequest('PUT', `/api/customers/${data.customerId}`, data.updates);
      return res.json();
    },
    onSuccess: () => {
      const isLead = currentTask?.task?.isLeadTask;
      toast({ title: "Data updated", description: `${isLead ? 'Lead' : 'Customer'} information has been updated.` });
      setShowFixDataModal(false);
      setFixDataFields({ email: '', pricingTier: '', salesRepId: '' });
      setAvailableEmails([]);
      
      // Mark the current task as complete so it counts toward the quota
      if (currentTask?.task) {
        completeMutation.mutate({ 
          taskId: currentTask.task.id, 
          outcomeId: 'fixed_data'
        });
      } else {
        refetch();
      }
    },
    onError: () => {
      const isLead = currentTask?.task?.isLeadTask;
      toast({ title: "Error", description: `Failed to update ${isLead ? 'lead' : 'customer'} data`, variant: "destructive" });
    },
  });

  const handleFixData = async (missingFields: string[]) => {
    setMissingFieldsToFix(missingFields);
    const customer = currentTask?.task?.customer;
    const lead = currentTask?.task?.lead;
    const customerId = currentTask?.task?.customerId;
    const isLeadTask = currentTask?.task?.isLeadTask || customerId?.startsWith('lead-');
    
    // Collect emails from customer or lead
    const emails: string[] = [];
    if (isLeadTask && lead?.email) {
      emails.push(lead.email);
    } else if (customer?.email) {
      emails.push(customer.email);
    }
    
    // Fetch contacts to get additional emails (only for customers, not leads)
    if (customerId && !isLeadTask) {
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
    // Use lead data for lead tasks, customer data for customer tasks
    if (isLeadTask && lead) {
      setFixDataFields({
        email: lead.email || '',
        pricingTier: lead.pricingTier || '',
        salesRepId: lead.salesRepId || '',
      });
    } else {
      setFixDataFields({
        email: customer?.email || '',
        pricingTier: customer?.pricingTier || '',
        salesRepId: customer?.salesRepId || '',
      });
    }
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
      // For lead tasks, update the lead instead of the customer
      const isLeadTask = currentTask.task.isLeadTask || currentTask.task.customerId?.startsWith('lead-');
      if (isLeadTask && currentTask.task.leadId) {
        fixDataMutation.mutate({ leadId: currentTask.task.leadId, updates });
      } else if (!isLeadTask && currentTask.task.customerId) {
        fixDataMutation.mutate({ customerId: currentTask.task.customerId, updates });
      }
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
      setMergeEmailSelections({ primary: '', secondary: '' });
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

  // Do Not Merge mutation - mark customers as separate entities and complete the task
  const doNotMergeMutation = useMutation({
    mutationFn: async ({ customerId1, customerId2, taskId }: { customerId1: string; customerId2: string; taskId?: string }) => {
      const result = await apiRequest("POST", `/api/customers/do-not-merge`, { customerId1, customerId2 });
      return { result, taskId };
    },
    onSuccess: ({ taskId }) => {
      toast({
        title: "Marked as separate",
        description: "These customers won't be suggested as duplicates again",
      });
      // Complete the task to move to the next card
      if (taskId) {
        completeMutation.mutate({ 
          taskId, 
          outcomeId: 'not_duplicate',
          notes: 'Marked as separate customers - not duplicates'
        });
      } else {
        refetch(); // Fallback: just refresh hints
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to mark as do not merge",
        variant: "destructive",
      });
    },
  });

  // Assign as Lead mutation - convert a customer to a lead
  const assignAsLeadMutation = useMutation({
    mutationFn: async ({ customerId, taskId }: { customerId: string; taskId?: string }) => {
      const result = await apiRequest("POST", `/api/leads/convert-from-contact`, { customerId });
      return { result, taskId };
    },
    onSuccess: ({ result, taskId }) => {
      toast({
        title: "Assigned as Lead",
        description: `${result.lead?.name || 'Contact'} is now a lead in your pipeline`,
      });
      // Complete the task to move to the next card
      if (taskId) {
        completeMutation.mutate({ 
          taskId, 
          outcomeId: 'converted_to_lead',
          notes: 'Converted to lead for trust-building workflow'
        });
      } else {
        refetch();
      }
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to assign as lead",
        variant: "destructive",
      });
    },
  });

  const handleOpenMergeModal = async (duplicateIds: string[], currentCustomerId: string) => {
    try {
      // Check if this is a lead task (customer ID starts with 'lead-')
      const isLeadTask = currentCustomerId.startsWith('lead-');
      
      if (isLeadTask) {
        // For leads, the current customer doesn't exist in customers table
        // Fetch only the duplicate customer, and use task.customer data for current
        const duplicateRes = await fetch(`/api/customers/${duplicateIds[0]}`);
        
        if (!duplicateRes.ok) {
          throw new Error('Failed to fetch customer data');
        }
        
        const duplicateCustomer = await duplicateRes.json();
        
        // Get current lead's customer data from current task
        const currentCustomer = currentTask?.task?.customer || {};
        
        // Collect all unique emails from both
        const allEmails: string[] = [];
        if (currentCustomer.email) allEmails.push(currentCustomer.email);
        if (duplicateCustomer.email) allEmails.push(duplicateCustomer.email);
        if (duplicateCustomer.email2) allEmails.push(duplicateCustomer.email2);
        const uniqueEmails = [...new Set(allEmails.filter((e: string) => e && e.trim()))];
        
        setMergeData({
          sourceCustomer: { ...currentCustomer, isLead: true },
          targetCustomer: duplicateCustomer,
          duplicateIds,
        });
        setMergeTarget(duplicateIds[0]); // Default to keeping the duplicate as primary
        setMergeFieldSelections({});
        setMergeEmailSelections({
          primary: uniqueEmails[0] || '',
          secondary: uniqueEmails[1] || ''
        });
        setShowMergeModal(true);
        return;
      }
      
      // Regular customer merge flow
      const [currentRes, duplicateRes] = await Promise.all([
        fetch(`/api/customers/${currentCustomerId}`),
        fetch(`/api/customers/${duplicateIds[0]}`)
      ]);
      
      if (!currentRes.ok || !duplicateRes.ok) {
        throw new Error('Failed to fetch customer data');
      }
      
      const currentCustomer = await currentRes.json();
      const duplicateCustomer = await duplicateRes.json();
      
      // Collect all unique emails from both customers
      const allEmails: string[] = [];
      if (currentCustomer.email) allEmails.push(currentCustomer.email);
      if (currentCustomer.email2) allEmails.push(currentCustomer.email2);
      if (duplicateCustomer.email) allEmails.push(duplicateCustomer.email);
      if (duplicateCustomer.email2) allEmails.push(duplicateCustomer.email2);
      const uniqueEmails = [...new Set(allEmails.filter(e => e && e.trim()))];
      
      setMergeData({
        sourceCustomer: currentCustomer,
        targetCustomer: duplicateCustomer,
        duplicateIds,
      });
      setMergeTarget(duplicateIds[0]); // Default to keeping the duplicate as primary
      setMergeFieldSelections({});
      // Pre-select first email as primary, second as secondary
      setMergeEmailSelections({
        primary: uniqueEmails[0] || '',
        secondary: uniqueEmails[1] || ''
      });
      setShowMergeModal(true);
    } catch (error) {
      console.error('[Merge] Error loading customer data:', error);
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
    
    // Build email-related field selections
    const allEmails = getMergeEmails();
    const emailFieldSelections: Record<string, string> = { ...mergeFieldSelections };
    
    // Set primary email
    if (mergeEmailSelections.primary) {
      emailFieldSelections['email'] = mergeEmailSelections.primary;
    }
    // Set secondary email
    if (mergeEmailSelections.secondary) {
      emailFieldSelections['email2'] = mergeEmailSelections.secondary;
    }
    // Any extra emails go to notes
    const extraEmails = allEmails.filter(e => e !== mergeEmailSelections.primary && e !== mergeEmailSelections.secondary);
    if (extraEmails.length > 0) {
      emailFieldSelections['extraEmailsForNotes'] = extraEmails.join(', ');
    }
    
    mergeCustomersMutation.mutate({ 
      targetId: mergeTarget, 
      sourceId, 
      fieldSelections: emailFieldSelections 
    });
  };

  const mergeFields = [
    { key: 'company', label: 'Company Name' },
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'phone', label: 'Phone' },
    { key: 'address1', label: 'Address' },
    { key: 'city', label: 'City' },
    { key: 'province', label: 'Province' },
    { key: 'pricingTier', label: 'Pricing Tier' },
  ];

  // Get all unique emails from both customers for merge modal
  const getMergeEmails = () => {
    if (!mergeData) return [];
    const allEmails: string[] = [];
    if (mergeData.sourceCustomer.email) allEmails.push(mergeData.sourceCustomer.email);
    if (mergeData.sourceCustomer.email2) allEmails.push(mergeData.sourceCustomer.email2);
    if (mergeData.targetCustomer.email) allEmails.push(mergeData.targetCustomer.email);
    if (mergeData.targetCustomer.email2) allEmails.push(mergeData.targetCustomer.email2);
    return [...new Set(allEmails.filter(e => e && e.trim()))];
  };

  const handleOutcome = (outcomeId: string, field?: string, value?: string, customNotes?: string) => {
    if (!currentTask?.task) return;
    
    // If custom follow-up is selected, show the dialog instead
    if (outcomeId === 'custom_followup') {
      setShowFollowUpDialog(true);
      return;
    }
    
    // Use custom notes if provided (e.g., from voicemail prompt), otherwise use the general notes field
    const finalNotes = customNotes?.trim() || notes.trim() || undefined;
    
    completeMutation.mutate({ 
      taskId: currentTask.task.id, 
      outcomeId,
      field, 
      value,
      notes: finalNotes,
    });
  };
  
  const handleCustomFollowUp = () => {
    if (!currentTask?.task) return;
    const validDays = Math.max(1, Math.min(90, followUpDays || 7));
    completeMutation.mutate({ 
      taskId: currentTask.task.id, 
      outcomeId: 'custom_followup',
      customFollowUpDays: validDays,
      notes: notes.trim() || undefined,
    }, {
      onSuccess: () => {
        setShowFollowUpDialog(false);
        setFollowUpDays(7);
      }
    });
  };

  const handleSkip = () => {
    if (!currentTask?.task) return;
    skipMutation.mutate({ taskId: currentTask.task.id, reason: 'not_now' });
  };

  // Open email composer with customer's or lead's email prefilled
  const handleOpenEmailComposer = () => {
    const customer = currentTask?.task?.customer;
    const lead = currentTask?.task?.lead;
    const isLeadTask = currentTask?.task?.isLeadTask;
    
    // Use lead email for lead tasks, otherwise customer email
    const emailAddress = isLeadTask ? (lead?.email || customer?.email) : customer?.email;
    if (emailAddress) {
      setEmailTo(emailAddress);
    }
    // Pre-fill subject with customer/company/lead name if available
    const customerName = isLeadTask 
      ? (lead?.name || lead?.company || customer?.company || '')
      : (customer?.company || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || '');
    if (customerName) {
      setEmailSubject(`Following up - ${customerName}`);
    }
    // Pre-fill body with signature if available (keep as HTML)
    const initialBody = userSignature?.signatureHtml 
      ? `<p></p><p></p>${userSignature.signatureHtml}` 
      : '<p></p>';
    setEmailBody(initialBody);
    setShowEmailComposer(true);
    // Set the editor content after dialog opens
    setTimeout(() => {
      emailEditorRef.current?.setContent(initialBody);
    }, 100);
  };

  // Helper to convert HTML to plain text with proper line breaks
  const htmlToPlainText = (html: string): string => {
    // First replace block-level elements with newlines
    let text = html
      .replace(/<\/p>/gi, '\n\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<\/div>/gi, '\n')
      .replace(/<\/li>/gi, '\n')
      .replace(/<\/h[1-6]>/gi, '\n\n')
      .replace(/<li>/gi, '• ')
      .replace(/<ul>|<\/ul>|<ol>|<\/ol>/gi, '\n');
    
    // Parse remaining HTML and get text content
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = text;
    text = tempDiv.textContent || tempDiv.innerText || '';
    
    // Clean up excessive whitespace while preserving intentional line breaks
    return text
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  };

  // Handle template selection - fill in subject and body
  const handleTemplateSelect = (templateId: string) => {
    const id = parseInt(templateId);
    setSelectedTemplateId(id);
    const template = emailTemplates.find(t => t.id === id);
    if (template) {
      const customer = currentTask?.task?.customer;
      // Replace basic variables in template
      let subject = template.subject;
      let body = template.body;
      const customerName = customer?.company || [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || '';
      const contactName = [customer?.firstName, customer?.lastName].filter(Boolean).join(' ') || '';
      if (customerName) {
        subject = subject.replace(/\{\{name\}\}/gi, customerName).replace(/\{\{customer_name\}\}/gi, customerName);
        body = body.replace(/\{\{name\}\}/gi, customerName).replace(/\{\{customer_name\}\}/gi, customerName);
      }
      if (contactName) {
        subject = subject.replace(/\{\{contact_name\}\}/gi, contactName);
        body = body.replace(/\{\{contact_name\}\}/gi, contactName);
      }
      if (customer?.firstName) {
        body = body.replace(/\{\{client\.firstName\}\}/gi, customer.firstName);
      }
      
      // Replace sales rep variable with current user's name from signature
      const salesRepName = userSignature?.name || 'Your Sales Rep';
      body = body.replace(/\{\{client\.salesRep\}\}/gi, salesRepName);
      body = body.replace(/\{\{salesRep\}\}/gi, salesRepName);
      body = body.replace(/\{\{user\.name\}\}/gi, salesRepName);
      body = body.replace(/\{\{sender\}\}/gi, salesRepName);
      
      // Replace {{user.signature}} variable with actual signature HTML
      // Track if template had the variable so we don't double-append
      const hadSignatureVariable = /\{\{user\.signature\}\}/gi.test(body);
      if (userSignature?.signatureHtml) {
        body = body.replace(/\{\{user\.signature\}\}/gi, userSignature.signatureHtml);
        subject = subject.replace(/\{\{user\.signature\}\}/gi, ''); // Remove from subject if present
      } else {
        // Remove the placeholder if no signature is configured
        body = body.replace(/\{\{user\.signature\}\}/gi, '');
        subject = subject.replace(/\{\{user\.signature\}\}/gi, '');
      }
      
      // Convert plain text with bullet points to HTML if needed
      if (!body.includes('<') || !body.includes('>')) {
        // Plain text - convert line breaks and bullets to HTML
        body = body
          .split('\n')
          .map(line => {
            const trimmed = line.trim();
            if (trimmed.startsWith('•') || trimmed.startsWith('-') || trimmed.startsWith('*')) {
              return `<li>${trimmed.substring(1).trim()}</li>`;
            }
            return trimmed ? `<p>${trimmed}</p>` : '<p><br></p>';
          })
          .join('');
        // Wrap consecutive list items in ul
        body = body.replace(/(<li>.*?<\/li>)+/g, '<ul>$&</ul>');
      }
      
      // Append signature if available (only if template didn't have {{user.signature}} variable)
      if (userSignature?.signatureHtml && !hadSignatureVariable) {
        body = body + `<br><br>${userSignature.signatureHtml}`;
      }
      
      setEmailSubject(subject);
      setEmailBody(body);
      // Update the rich text editor content
      setTimeout(() => {
        emailEditorRef.current?.setContent(body);
      }, 50);
    }
  };

  // Send email handler
  const handleSendEmail = () => {
    const htmlBody = emailEditorRef.current?.getHTML() || emailBody;
    if (!emailTo || !emailSubject || !htmlBody) {
      toast({ title: 'Missing fields', description: 'Please fill in recipient, subject, and message', variant: 'destructive' });
      return;
    }
    // For lead tasks, don't pass lead-prefixed customerId - it's not a valid customer ID
    const taskCustomerId = currentTask?.task?.customer?.id;
    const validCustomerId = taskCustomerId && !taskCustomerId.startsWith('lead-') ? taskCustomerId : undefined;
    sendEmailMutation.mutate({
      to: emailTo,
      subject: emailSubject,
      body: htmlBody,
      customerId: validCustomerId,
    });
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
            You've finished your {session?.totalTarget || 50} moments for today. 
            <br />Great work building momentum!
          </CardDescription>
          
          {session && (
            <div className="grid grid-cols-3 sm:grid-cols-5 gap-2 mb-6">
              {session.buckets.map((bucket) => {
                const info = BUCKET_INFO[bucket.bucket];
                const BucketIcon = info.icon;
                return (
                  <div key={bucket.bucket} className="text-center">
                    <div 
                      className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center mx-auto mb-1"
                      style={{ backgroundColor: info.color + '20' }}
                    >
                      <BucketIcon className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: info.color }} />
                    </div>
                    <p className="text-[10px] sm:text-xs font-medium text-[#111111]">{bucket.completed}/{bucket.target}</p>
                    <p className="text-[10px] sm:text-xs text-[#999999]">{info.label}</p>
                  </div>
                );
              })}
            </div>
          )}

          {/* Ask if user wants to continue */}
          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4 mb-6">
            <p className="text-sm text-purple-800 font-medium mb-2">Want to keep the momentum going?</p>
            <p className="text-xs text-purple-600 mb-3">You can continue working on more tasks if you'd like.</p>
            <Button 
              onClick={() => continueMutation.mutate()}
              disabled={continueMutation.isPending}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {continueMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Rocket className="w-4 h-4 mr-2" />
                  Continue Working
                </>
              )}
            </Button>
          </div>

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
  
  // For Lead tasks, use lead data for email/address; for customers use customer data
  const effectiveEmail = task.isLeadTask ? (task.lead?.email || customer.email) : customer.email;
  const effectiveAddress = task.isLeadTask ? (task.lead?.address || customer.address1) : customer.address1;
  
  // Calculate remaining for the day
  const remaining = (session?.totalTarget || 30) - (session?.totalCompleted || 0);
  const isPaused = currentTask?.isPaused;
  const isComplete = currentTask?.allDone || currentTask?.session?.dayComplete;

  return (
    <div className="spotlight-container min-h-screen p-6">
      {/* Two-Column Layout - Wider Cards */}
      <div className="flex flex-col lg:flex-row gap-6 max-w-6xl mx-auto">
        
        {/* Left Sidebar - Progress & Stats */}
        <div className="w-full lg:w-72 flex-shrink-0 order-2 lg:order-1">
          <div className="spotlight-sidebar p-6 sticky top-6">
            {/* Progress Card - V0 Style */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Progress</p>
              <div className="flex items-center gap-2 mb-4">
                <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: `${progress}%`,
                      background: 'linear-gradient(90deg, #F87171 0%, #A78BFA 50%, #3B82F6 100%)'
                    }}
                  />
                </div>
                <span className="text-sm font-bold text-foreground">{session?.totalCompleted || 0}/{session?.totalTarget || 30}</span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-green-500" />
                    <span className="text-xs text-muted-foreground">Efficiency</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{efficiency?.score || 0}%</span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Flame className="w-3 h-3 text-orange-500" />
                    <span className="text-xs text-muted-foreground">Streak</span>
                  </div>
                  <span className="text-sm font-bold text-foreground">{efficiency?.streak || 0}</span>
                </div>
              </div>
            </div>

            {/* Today's Progress Card - 5 Dedicated Bars */}
            <div className="bg-white rounded-xl shadow-sm p-4 mb-3">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Today's Progress</p>
              <div className="space-y-2.5">
                {/* Quotes Followed Up - HIGH PRIORITY (shown first) */}
                <div className="flex items-center gap-2" title="Quotes you've called or emailed about today">
                  <div className="flex-1 h-2 bg-purple-50 rounded-full overflow-hidden border border-purple-200">
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${todayProgress?.quotesFollowedUp?.progress || 0}%`, 
                        backgroundColor: todayProgress?.quotesFollowedUp?.goalMet ? '#22C55E' : '#9333EA' 
                      }}
                    />
                  </div>
                  <span className="text-xs text-purple-700 font-medium w-24">Quotes ⭐</span>
                  <span className={`text-xs font-semibold w-10 text-right ${todayProgress?.quotesFollowedUp?.goalMet ? 'text-green-600' : 'text-purple-600'}`}>
                    {todayProgress?.quotesFollowedUp?.count || 0}/{todayProgress?.quotesFollowedUp?.goal || 5}
                  </span>
                </div>
                
                {/* SwatchBooks - includes press test kits and sample follow-ups */}
                <div className="flex items-center gap-2" title={`Swatch Books: ${todayProgress?.swatchbooks?.breakdown?.swatchBooks || 0}, Press Kits: ${todayProgress?.swatchbooks?.breakdown?.pressTestKits || 0}, Sample Follow-ups: ${todayProgress?.swatchbooks?.breakdown?.sampleFollowUps || 0}`}>
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${todayProgress?.swatchbooks?.progress || 0}%`, 
                        backgroundColor: todayProgress?.swatchbooks?.goalMet ? '#22C55E' : '#EAB308' 
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-24">SwatchBooks</span>
                  <span className={`text-xs font-medium w-10 text-right ${todayProgress?.swatchbooks?.goalMet ? 'text-green-600' : 'text-amber-600'}`}>
                    {todayProgress?.swatchbooks?.count || 0}/{todayProgress?.swatchbooks?.goal || 3}
                  </span>
                </div>
                
                {/* Calls Made */}
                <div className="flex items-center gap-2" title="All calls made today">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${todayProgress?.calls?.progress || 0}%`, 
                        backgroundColor: todayProgress?.calls?.goalMet ? '#22C55E' : '#3B82F6' 
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-24">Calls</span>
                  <span className={`text-xs font-medium w-10 text-right ${todayProgress?.calls?.goalMet ? 'text-green-600' : 'text-blue-600'}`}>
                    {todayProgress?.calls?.count || 0}/{todayProgress?.calls?.goal || 10}
                  </span>
                </div>
                
                {/* Emails Sent */}
                <div className="flex items-center gap-2" title="All emails sent today">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${todayProgress?.emails?.progress || 0}%`, 
                        backgroundColor: todayProgress?.emails?.goalMet ? '#22C55E' : '#F97316' 
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-24">Emails</span>
                  <span className={`text-xs font-medium w-10 text-right ${todayProgress?.emails?.goalMet ? 'text-green-600' : 'text-orange-600'}`}>
                    {todayProgress?.emails?.count || 0}/{todayProgress?.emails?.goal || 15}
                  </span>
                </div>
                
                {/* Data Hygiene + Research */}
                <div className="flex items-center gap-2" title="Data hygiene and research tasks completed">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all duration-300" 
                      style={{ 
                        width: `${todayProgress?.dataHygiene?.progress || 0}%`, 
                        backgroundColor: todayProgress?.dataHygiene?.goalMet ? '#22C55E' : '#14B8A6' 
                      }}
                    />
                  </div>
                  <span className="text-xs text-muted-foreground w-24">Data Hygiene</span>
                  <span className={`text-xs font-medium w-10 text-right ${todayProgress?.dataHygiene?.goalMet ? 'text-green-600' : 'text-teal-600'}`}>
                    {todayProgress?.dataHygiene?.count || 0}/{todayProgress?.dataHygiene?.goal || 5}
                  </span>
                </div>
              </div>
            </div>

            {/* Kits To Go Card - V0 Style */}
            {(() => {
              const kitsRemaining = (session?.totalTarget || 30) - (session?.totalCompleted || 0);
              const kitsToShow = Math.min(kitsRemaining, 10);
              return (
                <div className="rounded-xl p-4 border-2 border-amber-200 bg-amber-50/30">
                  <div className="flex items-center gap-2 mb-2">
                    <Package className="w-5 h-5 text-amber-600" />
                    <span className="text-sm font-semibold text-amber-700">{kitsRemaining} kits to go</span>
                  </div>
                  <div className="flex gap-1.5">
                    {Array.from({ length: kitsToShow }).map((_, i) => (
                      <div key={i} className="w-2.5 h-2.5 rounded-full bg-gray-300" />
                    ))}
                  </div>
                </div>
              );
            })()}
          </div>
        </div>
        
        {/* Center - Main Task Card */}
        <div className="flex-1 min-w-0 order-1 lg:order-2">
          {/* Success Overlay */}
          {showSuccess && (
            <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
              <div className="w-20 h-20 rounded-full bg-emerald-500 flex items-center justify-center animate-ping">
                <Check className="w-10 h-10 text-white" />
              </div>
            </div>
          )}
          
          {/* Task Card Container with Animation */}
          <div className={`transition-all duration-300 ease-out ${isTransitioning ? 'opacity-0 scale-95 translate-y-4' : 'opacity-100 scale-100 translate-y-0'}`}>
            
            {/* Email-specific actions bar - Only for email tasks */}
            {(task.context?.sourceType === 'email_pricing_samples' || 
              task.context?.sourceType === 'unreplied_email' || 
              task.context?.sourceType === 'email_event') && (
              <div className="flex items-center justify-between gap-3 mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-xl">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-red-600" />
                  <span className="text-sm font-medium text-red-700">
                    {task.context?.originalSubject ? `"${task.context.originalSubject}"` : 'Email Follow-up'}
                  </span>
                  {task.context?.daysSinceEmail && (
                    <Badge className="bg-red-100 text-red-700 text-xs px-2 py-0">
                      {task.context.daysSinceEmail}d ago
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {task.context?.gmailMessageId && (
                    <a
                      href={`https://mail.google.com/mail/u/0/#inbox/${task.context.gmailMessageId}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-red-700 hover:bg-red-100 rounded-full transition-colors"
                    >
                      <ExternalLink className="w-3 h-3" />
                      Gmail
                    </a>
                  )}
                </div>
              </div>
            )}
            
            {/* Drip Reply urgent banner */}
            {task.context?.sourceType === 'drip_reply' && (
              <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-gradient-to-r from-amber-500 to-orange-500 rounded-xl shadow-sm ring-1 ring-amber-300">
                <Flame className="w-5 h-5 text-white" />
                <span className="text-white text-sm font-semibold flex-1">🔥 Customer Replied!</span>
                <Badge className="bg-white text-orange-600 text-xs font-bold px-2 py-0.5">Call Now!</Badge>
              </div>
            )}
            
            {/* Drip Stale banner */}
            {task.context?.sourceType === 'drip_stale' && (
              <div className="flex items-center gap-3 mb-4 px-4 py-3 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl shadow-sm">
                <Clock className="w-4 h-4 text-white" />
                <span className="text-white text-sm font-medium flex-1">Drip stalled - time for something creative!</span>
                <Badge className="bg-white/20 text-white text-xs px-2 py-0.5">{task.context?.campaignName || 'Drip'}</Badge>
              </div>
            )}
            
            {/* Lead badge */}
            {(task.context?.sourceType === 'lead' || task.isLeadTask) && (
              <div className="flex items-center gap-3 mb-4 px-4 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl">
                <UserPlus className="w-4 h-4 text-emerald-600" />
                <span className="text-sm font-medium text-emerald-700 flex-1">Lead Pipeline</span>
                {task.lead?.stage && (
                  <Badge className="bg-emerald-100 text-emerald-700 text-xs px-2 py-0.5 capitalize">{task.lead.stage}</Badge>
                )}
                {(task.lead?.priority === 'high' || task.lead?.priority === 'urgent') && (
                  <Badge className="bg-red-100 text-red-600 text-xs px-2 py-0.5">
                    <Flame className="w-3 h-3 mr-0.5" />
                    {task.lead.priority === 'urgent' ? 'Urgent' : 'Hot'}
                  </Badge>
                )}
              </div>
            )}
            
            {/* Smart Hints - excluding missing_field (in PRO TIP) and duplicate (in bar below contact details) */}
            {currentTask.hints && currentTask.hints.filter(h => h.type !== 'missing_field' && h.type !== 'duplicate').length > 0 && (
              <div className="space-y-2 mb-4">
                {currentTask.hints.filter(h => h.type !== 'missing_field' && h.type !== 'duplicate').map((hint, idx) => {
                  const style = HINT_STYLES[hint.type];
                  const HintIcon = style.icon;
                  return (
                    <div 
                      key={idx}
                      className={`spotlight-card p-3 border ${style.bg} ${style.border} flex items-center justify-between gap-3`}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <HintIcon className={`w-4 h-4 flex-shrink-0 ${style.textColor}`} />
                        <span className={`text-sm ${style.textColor}`}>{hint.message}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {hint.ctaAction === 'view_duplicate' && hint.metadata?.duplicateIds?.[0] && !task.isLeadTask && !customer.id?.startsWith('lead-') && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs rounded-full"
                            onClick={() => handleOpenMergeModal(hint.metadata?.duplicateIds || [], customer.id)}
                          >
                            {hint.ctaLabel}
                          </Button>
                        )}
                        {hint.ctaAction !== 'view_duplicate' && (
                          <Button
                            size="sm"
                            variant={hint.severity === 'high' ? 'default' : 'outline'}
                            className={`rounded-full ${hint.severity === 'high' ? 'bg-red-600 hover:bg-red-700 text-white' : 'text-xs'}`}
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
                        {hint.ctaAction === 'view_duplicate' && hint.metadata?.duplicateIds?.[0] && !task.isLeadTask && !customer.id?.startsWith('lead-') && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-purple-600 hover:text-purple-700 hover:bg-purple-50 rounded-full"
                            onClick={() => {
                              const duplicateId = hint.metadata?.duplicateIds?.[0];
                              if (duplicateId && customer.id) {
                                doNotMergeMutation.mutate({ 
                                  customerId1: customer.id, 
                                  customerId2: duplicateId,
                                  taskId: task.id
                                });
                              }
                            }}
                            disabled={doNotMergeMutation.isPending || completeMutation.isPending}
                          >
                            Not a Duplicate
                          </Button>
                        )}
                        {hint.ctaAction === 'view_duplicate' && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-xs text-gray-500 rounded-full"
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

            {/* Main Customer/Lead Card - REDESIGNED FIGMA LAYOUT with Vertical Tabs */}
            <div className="flex items-stretch mb-4">
              {/* LEFT TAB - Actions Panel */}
              <div className="w-16 bg-slate-50 border border-r-0 border-slate-200 rounded-l-xl flex flex-col items-center py-4 gap-2">
                <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wide mb-1">Actions</p>
                
                {/* Email */}
                <button
                  onClick={handleOpenEmailComposer}
                  disabled={!effectiveEmail}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${effectiveEmail ? 'bg-blue-100 text-blue-600 hover:bg-blue-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                  title={effectiveEmail ? "Compose Email" : "No email available"}
                >
                  <Mail className="w-4 h-4" />
                </button>
                
                {/* Print Label */}
                <button
                  onClick={() => setShowPrintLabel(true)}
                  disabled={!effectiveAddress}
                  className={`w-10 h-10 flex items-center justify-center rounded-lg transition-all ${effectiveAddress ? 'bg-amber-100 text-amber-600 hover:bg-amber-200' : 'bg-slate-100 text-slate-300 cursor-not-allowed'}`}
                  title={effectiveAddress ? "Print Label" : "No address available"}
                >
                  <Printer className="w-4 h-4" />
                </button>
                
                {/* Later */}
                <button
                  onClick={() => remindTodayMutation.mutate({ taskId: task.id })}
                  disabled={remindTodayMutation.isPending}
                  className="w-10 h-10 flex items-center justify-center rounded-lg transition-all bg-yellow-100 text-yellow-600 hover:bg-yellow-200"
                  title="Remind Me Later Today"
                >
                  <Clock className="w-4 h-4" />
                </button>
                
                {/* Skip */}
                <button
                  onClick={handleSkip}
                  disabled={skipMutation.isPending}
                  className="w-10 h-10 flex items-center justify-center rounded-lg transition-all bg-slate-200 text-slate-500 hover:bg-slate-300"
                  title="Skip This Task"
                >
                  <SkipForward className="w-4 h-4" />
                </button>
                
                {/* Bad Fit */}
                <button
                  onClick={() => completeMutation.mutate({ taskId: task.id, outcomeId: 'bad_fit', outcomeLabel: 'Bad Fit - Not Printing Related' })}
                  disabled={completeMutation.isPending}
                  className="w-10 h-10 flex items-center justify-center rounded-lg transition-all bg-red-100 text-red-500 hover:bg-red-200"
                  title="Bad Fit - Not Printing Related"
                >
                  <Ban className="w-4 h-4" />
                </button>
              </div>
              
              {/* Card Container */}
              <div className={`spotlight-card p-6 flex-1 relative ${task.isLeadTask ? 'ring-2 ring-emerald-500 bg-gradient-to-br from-emerald-50 via-white to-green-50 shadow-emerald-100' : 'bg-white'} rounded-l-none`}>
              
              {/* Lead/Hot Badge - Top Right Corner */}
              <div className="absolute top-4 right-4">
                {task.isLeadTask ? (
                  <div className="flex flex-col items-center gap-1">
                    <div className="w-12 h-12 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
                      <Star className="w-6 h-6 text-white fill-white" />
                    </div>
                    <span className="text-xs font-semibold text-emerald-600 uppercase">Lead</span>
                  </div>
                ) : (
                  (() => {
                    const isHot = optimisticHotProspect ?? customer.isHotProspect;
                    if (isHot) {
                      return (
                        <div className="flex flex-col items-center gap-1">
                          <div className="w-12 h-12 rounded-full bg-orange-500 flex items-center justify-center shadow-lg">
                            <Flame className="w-6 h-6 text-white" />
                          </div>
                          <span className="text-xs font-semibold text-orange-600 uppercase">Hot</span>
                        </div>
                      );
                    }
                    return (
                      <div className="flex flex-col items-center gap-1">
                        <div 
                          className="w-12 h-12 rounded-full bg-blue-400 flex items-center justify-center shadow-lg cursor-pointer hover:bg-orange-500 transition-colors group"
                          onClick={() => {
                            setOptimisticHotProspect(true);
                            apiRequest('PUT', `/api/customers/${customer.id}`, { isHotProspect: true })
                              .then(() => toast({ title: "Marked as Hot Prospect" }))
                              .catch(() => {
                                setOptimisticHotProspect(null);
                                toast({ title: "Error", variant: "destructive" });
                              });
                          }}
                          title="Click to mark as Hot Prospect"
                        >
                          <Building2 className="w-6 h-6 text-white group-hover:hidden" />
                          <Flame className="w-6 h-6 text-white hidden group-hover:block" />
                        </div>
                        <span className="text-xs font-semibold text-blue-600 uppercase group-hover:text-orange-600">Contact</span>
                      </div>
                    );
                  })()
                )}
              </div>

              {/* Header: Name & Company */}
              <div className="flex items-start gap-4 mb-4 pr-20">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h2 className={`text-2xl font-bold ${task.isLeadTask ? 'text-emerald-800' : 'text-slate-800'}`}>
                      {task.isLeadTask 
                        ? (task.lead?.name || customer.company || customerName)
                        : (customer.firstName && customer.lastName 
                            ? `${customer.firstName} ${customer.lastName}` 
                            : customer.company || customerName)}
                    </h2>
                    {/* Open Detail Page Button */}
                    {(task.isLeadTask && task.leadId) || customer.odooPartnerId ? (
                      <Link 
                        href={task.isLeadTask && task.leadId 
                          ? `/leads/${task.leadId}` 
                          : `/odoo-contacts/${customer.odooPartnerId}`}
                      >
                        <button 
                          className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all"
                          title={task.isLeadTask ? "Open lead detail page" : "Open customer detail page"}
                        >
                          <ExternalLink className="w-4 h-4" />
                        </button>
                      </Link>
                    ) : (
                      <button 
                        className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-500 hover:text-slate-700 transition-all"
                        title="View customer profile"
                        onClick={() => setShowProfilePanel(true)}
                      >
                        <ExternalLink className="w-4 h-4" />
                      </button>
                    )}
                    {/* Source Logos */}
                    {!task.isLeadTask && (
                      <div className="flex items-center gap-1.5 ml-1">
                        {(customer.sources?.includes('odoo') || customer.odooPartnerId) && (
                          <span 
                            className="flex items-center justify-center w-6 h-6 rounded bg-purple-100 text-purple-600"
                            title="Customer from Odoo"
                          >
                            <span className="text-[10px] font-bold">O</span>
                          </span>
                        )}
                        {(customer.sources?.includes('shopify') || customer.id?.startsWith('shopify_')) && (
                          <span 
                            className="flex items-center justify-center w-6 h-6 rounded bg-green-100 text-green-600"
                            title="Customer from Shopify"
                          >
                            <SiShopify className="w-3.5 h-3.5" />
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Company Name */}
                  <p className={`text-base font-medium ${(task.isLeadTask ? task.lead?.company : customer.company) ? 'text-slate-600' : 'text-slate-400 italic'}`}>
                    {task.isLeadTask 
                      ? (task.lead?.company || 'No Company')
                      : (customer.company || 'No Company')}
                  </p>
                  {task.isLeadTask && task.lead?.stage && (
                    <span className="inline-flex items-center mt-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                      {task.lead.stage.charAt(0).toUpperCase() + task.lead.stage.slice(1)}
                    </span>
                  )}
                </div>
              </div>

              {/* Two-Column Layout: Contact Info + Metadata */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-5">
                {/* Left Column: Contact Details */}
                <div className="space-y-2.5">
                  {/* Address - always show with placeholder */}
                  <div className="flex items-start gap-2.5 text-sm">
                    <MapPin className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                    {effectiveAddress ? (
                      <a 
                        href={task.isLeadTask && task.lead?.city
                          ? `https://maps.google.com/?q=${encodeURIComponent(`${task.lead.address || ''}, ${task.lead.city || ''} ${task.lead.state || ''} ${task.lead.zip || ''}`)}`
                          : `https://maps.google.com/?q=${encodeURIComponent(`${customer.address1 || ''}, ${customer.city || ''} ${customer.province || ''} ${customer.zip || ''}`)}`
                        }
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:text-blue-600"
                      >
                        {effectiveAddress}
                        {task.isLeadTask 
                          ? (task.lead?.city ? `, ${task.lead.city}` : '') + (task.lead?.state ? `, ${task.lead.state}` : '') + (task.lead?.zip ? ` ${task.lead.zip}` : '')
                          : (customer.city ? `, ${customer.city}` : '') + (customer.province ? `, ${customer.province}` : '') + (customer.zip ? ` ${customer.zip}` : '')}
                      </a>
                    ) : (
                      <>
                        <span className="text-slate-400 italic">No address available</span>
                        <button
                          onClick={() => setShowProfilePanel(true)}
                          className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"
                          title="Edit address"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Phone - always show with placeholder */}
                  <div className="flex items-center gap-2.5 text-sm">
                    <Phone className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {(customer.phone || task.lead?.phone) ? (
                      <a href={`tel:${customer.phone || task.lead?.phone}`} className="text-slate-700 hover:text-blue-600">
                        {customer.phone || task.lead?.phone}
                      </a>
                    ) : (
                      <>
                        <span className="text-slate-400 italic">No phone available</span>
                        <button
                          onClick={() => setShowProfilePanel(true)}
                          className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"
                          title="Edit phone"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Email - always show with placeholder */}
                  <div className="flex items-center gap-2.5 text-sm">
                    <Mail className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {(customer.email || task.lead?.email) ? (
                      <a href={`mailto:${customer.email || task.lead?.email}`} className="text-slate-700 hover:text-blue-600">
                        {customer.email || task.lead?.email}
                      </a>
                    ) : (
                      <>
                        <span className="text-slate-400 italic">No email available</span>
                        <button
                          onClick={() => setShowProfilePanel(true)}
                          className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"
                          title="Edit email"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Website - always show with placeholder and inline edit */}
                  <div className="flex items-center gap-2.5 text-sm">
                    <Globe className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {editingWebsite ? (
                      <div className="flex items-center gap-2 flex-1">
                        <input
                          type="text"
                          value={websiteValue}
                          onChange={(e) => setWebsiteValue(e.target.value)}
                          placeholder="www.example.com"
                          className="flex-1 px-2 py-1 text-sm border border-slate-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              apiRequest('PUT', `/api/customers/${customer.id}`, { website: websiteValue })
                                .then(() => {
                                  queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
                                  setEditingWebsite(false);
                                });
                            } else if (e.key === 'Escape') {
                              setEditingWebsite(false);
                            }
                          }}
                        />
                        <button
                          onClick={() => {
                            apiRequest('PUT', `/api/customers/${customer.id}`, { website: websiteValue })
                              .then(() => {
                                queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
                                setEditingWebsite(false);
                              });
                          }}
                          className="p-1 rounded bg-green-100 hover:bg-green-200 text-green-600"
                          title="Save"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setEditingWebsite(false)}
                          className="p-1 rounded bg-slate-100 hover:bg-slate-200 text-slate-500"
                          title="Cancel"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : customer.website ? (
                      <a 
                        href={customer.website.startsWith('http') ? customer.website : `https://${customer.website}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-slate-700 hover:text-blue-600"
                      >
                        {customer.website}
                      </a>
                    ) : (
                      <>
                        <span className="text-slate-400 italic">No website available</span>
                        <button
                          onClick={() => {
                            setWebsiteValue('');
                            setEditingWebsite(true);
                          }}
                          className="ml-1 p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-blue-600"
                          title="Add website"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      </>
                    )}
                  </div>
                  {/* Sales Rep */}
                  <div className="flex items-center gap-2.5 text-sm">
                    <User className="w-4 h-4 text-blue-500 flex-shrink-0" />
                    {customer.salesRepName ? (
                      <span className="text-slate-700">{customer.salesRepName}</span>
                    ) : (
                      <Select 
                        onValueChange={(value) => {
                          const rep = salesReps.find(r => r.id === value);
                          apiRequest('PUT', `/api/customers/${customer.id}`, { 
                            salesRepId: value,
                            salesRepName: rep ? getSalesRepDisplayName(rep) : null
                          })
                            .then(() => {
                              queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
                            });
                        }}
                      >
                        <SelectTrigger className="h-7 w-40 text-xs">
                          <SelectValue placeholder="Assign Sales Rep" />
                        </SelectTrigger>
                        <SelectContent>
                          {salesReps.map(rep => (
                            <SelectItem key={rep.id} value={rep.id}>
                              {getSalesRepDisplayName(rep)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>

                {/* Right Column: Type, Machines, Pricing */}
                <div className="space-y-3">
                  {/* Type Toggle */}
                  {(() => {
                    const serverType = task.isLeadTask ? task.lead?.customerType : customer.customerType;
                    const displayType = optimisticCustomerType || serverType;
                    return (
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-slate-500 w-20">Type:</span>
                        <div className="inline-flex items-center border rounded-lg p-0.5 bg-slate-50">
                          <button
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                              displayType === 'reseller' ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              setOptimisticCustomerType('reseller');
                              const endpoint = task.isLeadTask ? `/api/leads/${task.lead?.id}` : `/api/customers/${customer.id}`;
                              apiRequest('PUT', endpoint, { customerType: 'reseller' }).then(() => toast({ title: "Marked as Reseller" })).catch(() => setOptimisticCustomerType(null));
                            }}
                          >
                            Reseller
                          </button>
                          <button
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                              displayType === 'enduser' ? 'bg-slate-200 text-slate-700' : 'text-slate-500 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              setOptimisticCustomerType('enduser');
                              const endpoint = task.isLeadTask ? `/api/leads/${task.lead?.id}` : `/api/customers/${customer.id}`;
                              apiRequest('PUT', endpoint, { customerType: 'enduser' }).then(() => toast({ title: "Marked as End User" })).catch(() => setOptimisticCustomerType(null));
                            }}
                          >
                            Enduser
                          </button>
                          <button
                            className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors ${
                              displayType === 'printer' ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:bg-slate-100'
                            }`}
                            onClick={() => {
                              setOptimisticCustomerType('printer');
                              const endpoint = task.isLeadTask ? `/api/leads/${task.lead?.id}` : `/api/customers/${customer.id}`;
                              apiRequest('PUT', endpoint, { customerType: 'printer' }).then(() => toast({ title: "Marked as Printer" })).catch(() => setOptimisticCustomerType(null));
                            }}
                          >
                            Printer
                          </button>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Machines - Only show for printers */}
                  {(() => {
                    const customerType = customer?.customerType || task.lead?.customerType;
                    const hideMachines = customerType === 'reseller' || customerType === 'enduser';
                    if (hideMachines || task.isLeadTask) return null;
                    return (
                      <div className="flex items-start gap-2">
                        <span className="text-sm text-slate-500 w-20 pt-0.5">Machines:</span>
                        <div className="flex flex-wrap gap-1.5 flex-1">
                          {customerMachines.length > 0 ? (
                            customerMachines.map((m) => (
                              <Badge key={m.id} variant="outline" className="text-xs bg-blue-50 text-blue-700 border-blue-200">
                                {m.machineFamily}
                              </Badge>
                            ))
                          ) : (
                            <span className="text-xs text-slate-400 italic">None</span>
                          )}
                          {!showAddMachine ? (
                            <Badge 
                              variant="outline" 
                              className="text-xs bg-pink-50 text-pink-600 border-pink-200 cursor-pointer hover:bg-pink-100"
                              onClick={() => setShowAddMachine(true)}
                            >
                              + Add
                            </Badge>
                          ) : (
                            <Select onValueChange={(value) => addMachineMutation.mutate(value)} disabled={addMachineMutation.isPending}>
                              <SelectTrigger className="h-6 w-28 text-xs"><SelectValue placeholder="Select..." /></SelectTrigger>
                              <SelectContent>
                                {machineTypes.map((mt) => (<SelectItem key={mt.code} value={mt.code} className="text-xs">{mt.label}</SelectItem>))}
                              </SelectContent>
                            </Select>
                          )}
                        </div>
                      </div>
                    );
                  })()}

                  {/* Pricing Tier - Only show dropdown if not assigned */}
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-slate-500 w-20">Pricing:</span>
                    {customer.pricingTier ? (
                      <span className="text-sm font-medium text-slate-700">{customer.pricingTier}</span>
                    ) : (
                      <Select 
                        onValueChange={(value) => {
                          apiRequest('PUT', `/api/customers/${customer.id}`, { pricingTier: value })
                            .then(() => {
                              toast({ title: `Pricing set to ${value}` });
                              queryClient.invalidateQueries({ queryKey: ['/api/spotlight/current'] });
                            });
                        }}
                      >
                        <SelectTrigger className="h-7 w-32 text-xs border-amber-300 bg-amber-50 text-amber-700">
                          <SelectValue placeholder="Select tier..." />
                        </SelectTrigger>
                        <SelectContent>
                          {PRICING_TIERS.map((tier) => (
                            <SelectItem key={tier} value={tier} className="text-xs">{tier}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              </div>

              {/* Possible Duplicate Bar - Under contact details */}
              {currentTask.hints?.filter(h => h.type === 'duplicate').map((hint, idx) => (
                <div 
                  key={`dup-${idx}`}
                  className="flex items-center justify-between gap-3 mb-4 px-4 py-3 bg-purple-50 border border-purple-200 rounded-xl"
                >
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 text-purple-600" />
                    <span className="text-sm font-medium text-purple-700">{hint.message}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {hint.ctaAction === 'view_duplicate' && hint.metadata?.duplicateIds?.[0] && !task.isLeadTask && !customer.id?.startsWith('lead-') && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-xs rounded-full border-purple-300 text-purple-700 hover:bg-purple-100"
                        onClick={() => handleOpenMergeModal(hint.metadata?.duplicateIds || [], customer.id)}
                      >
                        Review & Merge
                      </Button>
                    )}
                    {hint.ctaAction === 'view_duplicate' && hint.metadata?.duplicateIds?.[0] && !task.isLeadTask && !customer.id?.startsWith('lead-') && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-xs rounded-full text-slate-500 hover:bg-slate-100"
                        onClick={async () => {
                          const duplicateId = hint.metadata?.duplicateIds?.[0];
                          if (duplicateId && customer.id) {
                            await apiRequest('POST', '/api/customers/not-duplicate', {
                              customerId1: customer.id,
                              customerId2: duplicateId,
                            });
                            toast({ title: "Marked as separate customers" });
                          }
                        }}
                      >
                        Not a Duplicate
                      </Button>
                    )}
                  </div>
                </div>
              ))}

              {/* Trust Level + Pro Tip Row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-5">
                {/* Trust Level Card - Real metrics from API */}
                {(() => {
                  const calls = trustMetrics?.calls || 0;
                  const samples = trustMetrics?.samples || 0;
                  const emails = trustMetrics?.emails || 0;
                  const ordersValue = trustMetrics?.ordersValue || 0;
                  const ordersCount = trustMetrics?.ordersCount || 0;
                  
                  // Calculate trust score based on engagement (max 100%)
                  const trustScore = Math.min(100, calls * 5 + samples * 15 + emails * 3 + (ordersCount > 0 ? 30 : 0) + (ordersValue > 1000 ? 20 : 0));
                  const trustLabel = ordersCount > 3 ? 'Loyal' : ordersCount > 0 ? 'Returning' : (calls + emails) > 3 ? 'Growing' : 'New';
                  
                  // Format orders value as currency
                  const formattedOrders = ordersValue >= 1000 
                    ? `$${(ordersValue / 1000).toFixed(1)}k` 
                    : ordersValue > 0 ? `$${ordersValue.toFixed(0)}` : '—';
                  
                  return (
                    <div className="bg-gradient-to-br from-slate-50 to-white border border-slate-200 rounded-2xl p-4">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-2">
                          <span className="text-pink-500">❤️</span>
                          <span className="text-sm font-semibold text-slate-700">TRUST Level</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Badge className={`text-xs ${
                            trustLabel === 'Loyal' ? 'bg-purple-100 text-purple-700 border-purple-200' :
                            trustLabel === 'Returning' ? 'bg-emerald-100 text-emerald-700 border-emerald-200' :
                            trustLabel === 'Growing' ? 'bg-blue-100 text-blue-700 border-blue-200' :
                            'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {trustLabel}
                          </Badge>
                          <span className="text-lg font-bold text-slate-800">{trustScore}%</span>
                        </div>
                      </div>
                      <Progress 
                        value={trustScore} 
                        className="h-2 mb-4"
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <div className="text-center">
                          <Phone className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-800">{calls}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Calls</p>
                        </div>
                        <div className="text-center">
                          <Package className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-800">{samples}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Samples</p>
                        </div>
                        <div className="text-center">
                          <DollarSign className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-800">{formattedOrders}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Orders</p>
                        </div>
                        <div className="text-center">
                          <Mail className="w-4 h-4 text-slate-400 mx-auto mb-1" />
                          <p className="text-lg font-bold text-slate-800">{emails}</p>
                          <p className="text-[10px] text-slate-500 uppercase">Emails</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Pro Tip Card - hidden for bounced email tasks (they have their own compact card) */}
                {task.taskSubtype !== 'hygiene_bounced_email' && (
                  <div className="bg-gradient-to-br from-amber-50 to-yellow-50 border-2 border-yellow-300 rounded-2xl p-4">
                    {/* Context-dependent action label */}
                    {task.whyNow && (
                      <div className="flex items-center gap-2 mb-3 pb-3 border-b border-amber-200">
                        <Target className="w-4 h-4 text-blue-600 flex-shrink-0" />
                        <span className="text-xs font-semibold text-blue-600 uppercase">
                          {task.bucket === 'calls' ? 'Call Reason:' :
                           task.bucket === 'follow_ups' ? 'Follow-up Reason:' :
                           task.bucket === 'outreach' ? 'Outreach Opportunity:' :
                           task.bucket === 'data_hygiene' ? 'Issue:' :
                           task.bucket === 'enablement' ? 'Materials Needed:' :
                           'Action Needed:'}
                        </span>
                        <span className="text-sm text-slate-700">{task.whyNow}</span>
                      </div>
                    )}
                    {/* Missing field hints displayed */}
                    {currentTask.hints?.filter(h => h.type === 'missing_field').map((hint, idx) => (
                      <div key={idx} className="flex items-center justify-between gap-3 mb-3 pb-3 border-b border-amber-200">
                        <div className="flex items-center gap-2 flex-1">
                          <UserCog className="w-4 h-4 text-amber-600 flex-shrink-0" />
                          <span className="text-sm text-amber-800">{hint.message}</span>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs rounded-full border-amber-400 text-amber-700 hover:bg-amber-100"
                          onClick={() => handleFixData(hint.metadata?.missingFields || [])}
                        >
                          {hint.ctaLabel}
                        </Button>
                      </div>
                    ))}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-amber-400 flex items-center justify-center flex-shrink-0">
                        <Lightbulb className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-red-600 mb-1">PRO Tip!!</p>
                        <p className="text-sm text-amber-800">
                          {currentTask?.coachTip?.content || "Follow up within 24 hours for best conversion rates. Consider sending a personalized quote or sample material based on their customer type."}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Follow-up context */}
              {task.context?.followUpTitle && (
                <div className="bg-slate-100 rounded-xl p-3 mb-4">
                  <p className="font-medium text-slate-800 text-sm">{task.context.followUpTitle}</p>
                  {task.context.followUpDueDate && (
                    <p className="text-xs text-slate-500 mt-1">
                      Due: {new Date(task.context.followUpDueDate).toLocaleDateString()}
                    </p>
                  )}
                </div>
              )}

              {/* Notes & Activity - Collapsible (hidden for bounced email tasks) */}
              {task.taskSubtype !== 'hygiene_bounced_email' && (
                <details className="border-t border-slate-100 pt-4">
                <summary className="flex items-center gap-2 cursor-pointer select-none">
                  <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Notes & Activity</span>
                  <Badge variant="outline" className="text-xs">{customerNotes.length + emailHistory.length}</Badge>
                  <ChevronDown className="w-4 h-4 text-slate-400 ml-auto" />
                </summary>
                <div className="space-y-3 mt-3">
                  {/* Email History - Show first */}
                  {emailHistory.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-[10px] font-bold text-red-500 uppercase tracking-wide flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        Recent Emails
                      </p>
                      {emailHistory.slice(0, 5).map((email) => (
                        <div key={email.id} className={`rounded-xl p-3 border ${email.direction === 'inbound' ? 'bg-blue-50 border-blue-100' : 'bg-green-50 border-green-100'}`}>
                          <div className="flex items-center gap-2 mb-1">
                            <span className={`text-[10px] font-bold uppercase ${email.direction === 'inbound' ? 'text-blue-600' : 'text-green-600'}`}>
                              {email.direction === 'inbound' ? '← Received' : '→ Sent'}
                            </span>
                            <span className="text-[10px] text-slate-400">
                              {email.sentAt ? new Date(email.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : ''}
                            </span>
                          </div>
                          <p className="text-xs font-medium text-slate-700 truncate">{email.subject || '(No subject)'}</p>
                          {email.snippet && (
                            <p className="text-xs text-slate-500 truncate mt-0.5">{email.snippet}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Activity Notes */}
                  {customerNotes.length > 0 && (
                    <div className="space-y-2">
                      {emailHistory.length > 0 && (
                        <p className="text-[10px] font-bold text-purple-500 uppercase tracking-wide flex items-center gap-1 mt-3">
                          <FileText className="w-3 h-3" />
                          Activity Log
                        </p>
                      )}
                      {customerNotes.slice(0, 5).map((note) => {
                        const getActivityStyle = (eventType: string) => {
                          if (eventType.includes('quote')) return { bg: 'bg-purple-50', border: 'border-purple-100', icon: FileText, iconColor: 'text-purple-600' };
                          if (eventType.includes('sample')) return { bg: 'bg-cyan-50', border: 'border-cyan-100', icon: Package, iconColor: 'text-cyan-600' };
                          if (eventType.includes('call')) return { bg: 'bg-green-50', border: 'border-green-100', icon: PhoneCall, iconColor: 'text-green-600' };
                          if (eventType.includes('email')) return { bg: 'bg-blue-50', border: 'border-blue-100', icon: Mail, iconColor: 'text-blue-600' };
                          if (eventType.includes('price_list')) return { bg: 'bg-amber-50', border: 'border-amber-100', icon: FileText, iconColor: 'text-amber-600' };
                          if (eventType.includes('order')) return { bg: 'bg-emerald-50', border: 'border-emerald-100', icon: ShoppingCart, iconColor: 'text-emerald-600' };
                          if (eventType.includes('meeting')) return { bg: 'bg-indigo-50', border: 'border-indigo-100', icon: Calendar, iconColor: 'text-indigo-600' };
                          return { bg: 'bg-slate-50', border: 'border-slate-100', icon: FileText, iconColor: 'text-slate-600' };
                        };
                        const style = getActivityStyle(note.eventType);
                        const ActivityIcon = style.icon;
                        return (
                          <div key={note.id} className={`${style.bg} border ${style.border} rounded-xl p-3`}>
                            <div className="flex items-center gap-2 mb-1">
                              <ActivityIcon className={`w-3 h-3 ${style.iconColor}`} />
                              <span className="text-xs text-slate-500">
                                {new Date(note.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                              </span>
                              {note.metadata?.createdByName && (
                                <span className="text-[10px] text-slate-400">by {note.metadata.createdByName}</span>
                              )}
                            </div>
                            <p className="text-sm text-slate-700">{note.summary}</p>
                            {note.metadata?.amount && (
                              <p className="text-xs text-slate-500 mt-1">Amount: ${Number(note.metadata.amount).toFixed(2)}</p>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Empty state */}
                  {customerNotes.length === 0 && emailHistory.length === 0 && (
                    <p className="text-sm text-slate-400 italic">No activity yet for this contact.</p>
                  )}
                </div>
              </details>
              )}


              {/* Data Hygiene: Pricing Tier */}
              {task.taskSubtype === 'hygiene_pricing_tier' && (
                <div className="space-y-3 mb-4">
                  <Label className="text-sm text-slate-600">Assign pricing tier:</Label>
                  <Select onValueChange={(value) => handleOutcome('assigned', 'pricingTier', value)}>
                    <SelectTrigger className="border-slate-200 rounded-xl">
                      <SelectValue placeholder="Select pricing tier..." />
                    </SelectTrigger>
                    <SelectContent>
                      {PRICING_TIERS.map((tier) => (
                        <SelectItem key={tier} value={tier}>
                          {tier}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {/* Data Hygiene: Email */}
              {task.taskSubtype === 'hygiene_email' && (
                <div className="space-y-3 mb-4">
                  <Label className="text-sm text-slate-600">Enter primary email:</Label>
                  <div className="flex gap-2">
                    <Input
                      type="email"
                      value={fieldValue}
                      onChange={(e) => setFieldValue(e.target.value)}
                      placeholder="email@company.com"
                      className="border-slate-200 rounded-xl"
                      onKeyDown={(e) => e.key === 'Enter' && fieldValue.trim() && handleOutcome('found', 'email', fieldValue.trim())}
                    />
                    <Button 
                      onClick={() => handleOutcome('found', 'email', fieldValue.trim())}
                      className="spotlight-btn-primary px-6"
                      disabled={!fieldValue.trim()}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {/* Data Hygiene: Bounced Email - Compact single card with issue + buttons */}
              {task.taskSubtype === 'hygiene_bounced_email' && (
                <div className="mb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-xs font-bold text-amber-700 uppercase">Issue:</span>
                          {(task as any).extraContext?.matchType === 'lead' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full">Lead</span>
                          )}
                          {((task as any).extraContext?.matchType === 'contact') && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full">Contact</span>
                          )}
                        </div>
                        <p className="text-sm text-amber-800 mb-3">
                          Email to <strong>{(task as any).extraContext?.bouncedEmail || task.customerEmail}</strong> bounced
                          {(task as any).extraContext?.bounceDate && (
                            <> on {new Date((task as any).extraContext.bounceDate).toLocaleDateString()}</>
                          )}.
                          {(task as any).extraContext?.bounceSubject && (
                            <> Subject: "{(task as any).extraContext.bounceSubject}".</>
                          )}
                          {' '}The contact may have left the company or the business closed.
                        </p>
                        {/* Primary Action Buttons - DELETE and DNC */}
                        <div className="flex gap-2 mb-2">
                          <button
                            onClick={() => setShowDeleteConfirm(true)}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all bg-red-500 hover:bg-red-600 text-white shadow-md hover:shadow-lg"
                          >
                            <Trash2 className="w-4 h-4" />
                            DELETE
                          </button>
                          <button
                            onClick={() => handleOutcome('mark_inactive')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-bold transition-all bg-slate-600 hover:bg-slate-700 text-white shadow-md hover:shadow-lg"
                          >
                            <UserX className="w-4 h-4" />
                            DNC
                          </button>
                        </div>
                        {/* Secondary Action Buttons - KEEP, LATER, RESEARCH */}
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleOutcome('keep')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-emerald-100 hover:bg-emerald-200 text-emerald-700 border border-emerald-300"
                          >
                            <Check className="w-4 h-4" />
                            KEEP
                          </button>
                          <button
                            onClick={() => handleOutcome('skip')}
                            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300"
                          >
                            <Clock className="w-4 h-4" />
                            LATER
                          </button>
                          {(task as any).extraContext?.bounceId && (
                            <button
                              onClick={() => setLocation(`/bounce-investigation/${(task as any).extraContext.bounceId}`)}
                              className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all bg-purple-100 hover:bg-purple-200 text-purple-700 border border-purple-300"
                            >
                              <Search className="w-4 h-4" />
                              RESEARCH
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Hygiene: Customer Type */}
              {task.taskSubtype === 'hygiene_customer_type' && (
                <div className="space-y-3 mb-4">
                  <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <HelpCircle className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2 w-full">
                        <p className="text-sm font-medium text-blue-800">What type of customer is this?</p>
                        <p className="text-sm text-blue-700">
                          This helps us know what information to collect.
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <button
                            onClick={() => handleOutcome('printer')}
                            className="flex flex-col items-center gap-2 p-4 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <span className="text-3xl">🖨️</span>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-blue-800">Printing Company</p>
                              <p className="text-xs text-blue-600 mt-1">Has printing equipment</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('reseller')}
                            className="flex flex-col items-center gap-2 p-4 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <span className="text-3xl">🚚</span>
                            <div className="text-center">
                              <p className="text-sm font-semibold text-blue-800">Reseller</p>
                              <p className="text-xs text-blue-600 mt-1">Buys to resell</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* DRIP Stale Followup - Creative Options */}
              {task.taskSubtype === 'drip_stale_followup' && (
                <div className="space-y-3 mb-4">
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Clock className="w-5 h-5 text-amber-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2 w-full">
                        <p className="text-sm font-medium text-amber-800">No response to your drip campaign</p>
                        <p className="text-sm text-amber-700">
                          {task.context?.emailsSent} emails sent, last one {task.context?.daysSinceLastEmail} days ago.
                          Time to try something different!
                        </p>
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                          <button
                            onClick={() => handleOutcome('send_drip')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-amber-200 rounded-xl hover:border-amber-400 hover:bg-amber-50 transition-all"
                          >
                            <Mail className="w-6 h-6 text-amber-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-amber-800">Send Email</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('send_swatchbook')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-purple-200 rounded-xl hover:border-purple-400 hover:bg-purple-50 transition-all"
                          >
                            <Package className="w-6 h-6 text-purple-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-purple-800">Swatch Book</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('send_press_test')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <Box className="w-6 h-6 text-blue-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-blue-800">Press Test Kit</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('call')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-green-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-all"
                          >
                            <Phone className="w-6 h-6 text-green-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-green-800">Call Them</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('linkedin')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-sky-200 rounded-xl hover:border-sky-400 hover:bg-sky-50 transition-all"
                          >
                            <Linkedin className="w-6 h-6 text-sky-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-sky-800">LinkedIn</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('lost')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-red-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all"
                          >
                            <X className="w-6 h-6 text-red-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-red-800">Mark Lost</p>
                            </div>
                          </button>
                        </div>
                        <button
                          onClick={() => handleOutcome('skip')}
                          className="w-full mt-2 py-2 text-sm text-amber-600 hover:text-amber-800 font-medium"
                        >
                          Give More Time
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Odoo Quotation Follow-up */}
              {task.taskSubtype === 'odoo_quote_followup' && (
                <div className="space-y-3 mb-4">
                  <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <FileText className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
                      <div className="space-y-2 w-full">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-purple-800">Pending Odoo Quotation</p>
                          <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                            {(task as any).extraContext?.odooQuoteName}
                          </span>
                        </div>
                        <div className="bg-purple-100 rounded-lg p-3 text-sm space-y-1">
                          <p className="text-purple-800">
                            <strong>Amount:</strong> ${Number((task as any).extraContext?.odooQuoteAmount || 0).toFixed(2)}
                          </p>
                          {(task as any).extraContext?.odooQuoteDate && (
                            <p className="text-purple-700">
                              <strong>Quote Date:</strong> {new Date((task as any).extraContext.odooQuoteDate).toLocaleDateString()}
                            </p>
                          )}
                          {(task as any).extraContext?.daysSinceQuote !== null && (
                            <p className="text-purple-700">
                              <strong>Days Since Quote:</strong> {(task as any).extraContext.daysSinceQuote} days
                            </p>
                          )}
                          {(task as any).extraContext?.odooQuoteValidityDate && (
                            <p className="text-purple-700">
                              <strong>Valid Until:</strong> {new Date((task as any).extraContext.odooQuoteValidityDate).toLocaleDateString()}
                            </p>
                          )}
                        </div>
                        <p className="text-sm text-purple-700">
                          This customer has a pending quotation that hasn't been converted to a sales order. Would you like to follow up?
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <button
                            onClick={() => handleOutcome('called')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-green-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-all"
                          >
                            <Phone className="w-6 h-6 text-green-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-green-800">Call Customer</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('email_sent')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <Mail className="w-6 h-6 text-blue-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-blue-800">Send Email</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('order_confirmed')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-emerald-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                          >
                            <Check className="w-6 h-6 text-emerald-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-emerald-800">Order Confirmed!</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('quote_expired')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-red-200 rounded-xl hover:border-red-400 hover:bg-red-50 transition-all"
                          >
                            <X className="w-6 h-6 text-red-600" />
                            <div className="text-center">
                              <p className="text-xs font-semibold text-red-800">Quote Expired/Lost</p>
                            </div>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Odoo Sample Order Follow-up - PROTIP Style */}
              {task.taskSubtype === 'odoo_sample_followup' && (
                <div className="space-y-3 mb-4">
                  <div className="bg-gradient-to-br from-emerald-50 to-teal-50 border border-emerald-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <div className="relative">
                        <Gift className="w-6 h-6 text-emerald-600" />
                        <span className="absolute -top-1 -right-1 text-xs">✨</span>
                      </div>
                      <div className="space-y-3 w-full">
                        <div className="flex items-center gap-2">
                          <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold uppercase tracking-wide">
                            Pro Tip
                          </span>
                          <span className="text-xs text-emerald-600 font-medium">
                            {(task as any).extraContext?.odooOrderName}
                          </span>
                        </div>
                        <p className="text-sm text-emerald-800 leading-relaxed">
                          {(task as any).extraContext?.proTipMessage || 
                           `You sent samples to this customer. Would you like to follow up to see how they liked them?`}
                        </p>
                        {(task as any).extraContext?.odooOrderDate && (
                          <p className="text-xs text-emerald-600">
                            Sent on: {new Date((task as any).extraContext.odooOrderDate).toLocaleDateString()}
                            {(task as any).extraContext?.daysSinceSample !== null && (
                              <span className="ml-2">({(task as any).extraContext.daysSinceSample} days ago)</span>
                            )}
                          </p>
                        )}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
                          <button
                            onClick={() => handleOutcome('called')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-green-200 rounded-xl hover:border-green-400 hover:bg-green-50 transition-all"
                          >
                            <Phone className="w-6 h-6 text-green-600" />
                            <p className="text-xs font-semibold text-green-800">Call Customer</p>
                          </button>
                          <button
                            onClick={() => handleOutcome('email_sent')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <Mail className="w-6 h-6 text-blue-600" />
                            <p className="text-xs font-semibold text-blue-800">Send Email</p>
                          </button>
                          <button
                            onClick={() => handleOutcome('order_placed')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-emerald-200 rounded-xl hover:border-emerald-400 hover:bg-emerald-50 transition-all"
                          >
                            <Check className="w-6 h-6 text-emerald-600" />
                            <p className="text-xs font-semibold text-emerald-800">They Ordered!</p>
                          </button>
                          <button
                            onClick={() => handleOutcome('not_interested')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-orange-200 rounded-xl hover:border-orange-400 hover:bg-orange-50 transition-all"
                          >
                            <X className="w-6 h-6 text-orange-600" />
                            <p className="text-xs font-semibold text-orange-800">Not Interested</p>
                          </button>
                          <button
                            onClick={() => handleOutcome('skip')}
                            className="flex flex-col items-center gap-2 p-3 bg-white border-2 border-gray-200 rounded-xl hover:border-gray-400 hover:bg-gray-50 transition-all col-span-2 md:col-span-1"
                          >
                            <Clock className="w-6 h-6 text-gray-500" />
                            <p className="text-xs font-semibold text-gray-600">Skip for Now</p>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* DRIP Reply Urgent - Call Now UI */}
              {task.taskSubtype === 'drip_reply_urgent' && (
                <div className="space-y-3 mb-4">
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                    <div className="flex items-start gap-3">
                      <Flame className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0 animate-pulse" />
                      <div className="space-y-2 w-full">
                        <p className="text-sm font-medium text-red-800">🔥 They replied to your drip campaign!</p>
                        <p className="text-sm text-red-700">
                          From campaign: "{task.context?.campaignName}"
                          {task.context?.replySubject && (
                            <span className="block mt-1 italic">Subject: "{task.context.replySubject}"</span>
                          )}
                        </p>
                        <div className="grid grid-cols-2 gap-3 mt-3">
                          <button
                            onClick={() => handleOutcome('called')}
                            className="flex flex-col items-center gap-2 p-4 bg-white border-2 border-green-300 rounded-xl hover:border-green-500 hover:bg-green-50 transition-all"
                          >
                            <Phone className="w-8 h-8 text-green-600" />
                            <div className="text-center">
                              <p className="text-sm font-bold text-green-800">Call Them Now!</p>
                            </div>
                          </button>
                          <button
                            onClick={() => handleOutcome('email_sent')}
                            className="flex flex-col items-center gap-2 p-4 bg-white border-2 border-blue-200 rounded-xl hover:border-blue-400 hover:bg-blue-50 transition-all"
                          >
                            <Mail className="w-8 h-8 text-blue-600" />
                            <div className="text-center">
                              <p className="text-sm font-semibold text-blue-800">Reply to Email</p>
                            </div>
                          </button>
                        </div>
                        <div className="flex gap-2 mt-3">
                          <button
                            onClick={() => handleOutcome('qualified')}
                            className="flex-1 py-2 px-3 text-sm bg-emerald-100 border border-emerald-300 rounded-lg text-emerald-700 hover:bg-emerald-200"
                          >
                            ⭐ Qualified!
                          </button>
                          <button
                            onClick={() => handleOutcome('not_interested')}
                            className="flex-1 py-2 px-3 text-sm bg-slate-100 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-200"
                          >
                            Not Interested
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Data Hygiene: Name, Company, Phone */}
              {(task.taskSubtype === 'hygiene_name' || task.taskSubtype === 'hygiene_company' || task.taskSubtype === 'hygiene_phone') && (
                <div className="space-y-3 mb-4">
                  <Label className="text-sm text-slate-600">
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
                      className="border-slate-200 rounded-xl"
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
                      className="spotlight-btn-primary px-6"
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
                    <DollarSign className="w-4 h-4 text-slate-500" />
                    <span className="text-sm text-slate-600 font-medium">Quick Feedback</span>
                    <span className="text-xs text-slate-400">(tap any that apply)</span>
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

              {/* Quick Notes */}
              {!showNotes ? (
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="text-slate-400 hover:text-slate-600 w-full mb-4"
                  onClick={() => setShowNotes(true)}
                >
                  <MessageSquare className="w-4 h-4 mr-2" />
                  Add a note (optional)
                </Button>
              ) : (
                <div className="space-y-2 mb-4">
                  <Textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Quick note about this interaction..."
                    className="border-slate-200 min-h-[80px] text-sm rounded-xl"
                  />
                  <Button 
                    variant="ghost" 
                    size="sm"
                    className="text-slate-400"
                    onClick={() => { setShowNotes(false); setNotes(""); }}
                  >
                    Cancel
                  </Button>
                </div>
              )}

              {/* Split Panel Action Buttons - Primary Focus + Icon-Only Quick Actions */}
              {task.bucket !== 'data_hygiene' && (
                <div className="bg-gradient-to-b from-white to-slate-50 rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
                  <div className="flex">
                    {/* LEFT PANEL - What Happened (Primary Actions) */}
                    <div className="flex-1 p-4 border-r border-slate-200">
                      <p className="text-xs font-bold text-slate-500 mb-3 uppercase tracking-wide">What Happened?</p>
                      
                      {/* CALLS - Hero button + secondary options */}
                      {task.bucket === 'calls' && (
                        <div className="space-y-3">
                          {/* Voicemail Note Prompt */}
                          {showVoicemailNote ? (
                            <div className="space-y-3">
                              <div className="flex items-center gap-2 text-amber-600">
                                <PhoneCall className="w-4 h-4" />
                                <span className="text-sm font-semibold">Left Voicemail</span>
                              </div>
                              <Textarea
                                value={voicemailNote}
                                onChange={(e) => setVoicemailNote(e.target.value)}
                                placeholder="Who did you leave the message for? Who was the receptionist? What did you say? Did you ask what machines they have?"
                                className="border-amber-200 bg-amber-50 min-h-[80px] text-sm rounded-xl placeholder:text-amber-700"
                                autoFocus
                              />
                              <div className="flex gap-2">
                                <button
                                  onClick={() => {
                                    handleOutcome('voicemail', undefined, undefined, voicemailNote);
                                    setShowVoicemailNote(false);
                                    setVoicemailNote("");
                                  }}
                                  disabled={completeMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-amber-500 to-amber-600 text-white shadow-md hover:shadow-lg"
                                >
                                  <Check className="w-4 h-4" />
                                  Save & Complete
                                </button>
                                <button
                                  onClick={() => { setShowVoicemailNote(false); setVoicemailNote(""); }}
                                  className="px-4 py-2.5 rounded-xl text-sm font-medium transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <>
                              <button
                                onClick={() => handleOutcome('connected')}
                                disabled={completeMutation.isPending}
                                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-emerald-500 to-emerald-600 text-white shadow-md hover:shadow-lg hover:from-emerald-600 hover:to-emerald-700"
                                title="You spoke with the contact directly"
                              >
                                <CheckCircle className="w-5 h-5" />
                                Connected!
                              </button>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setShowVoicemailNote(true)}
                                  disabled={completeMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-amber-50 text-amber-600 hover:bg-amber-100 border border-amber-200"
                                  title="You left a voicemail message"
                                >
                                  <PhoneCall className="w-3.5 h-3.5" />
                                  Voicemail
                                </button>
                                <button
                                  onClick={() => handleOutcome('no_answer')}
                                  disabled={completeMutation.isPending}
                                  className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                                  title="Phone rang but nobody answered"
                                >
                                  <PhoneMissed className="w-3.5 h-3.5" />
                                  No Answer
                                </button>
                                <button
                                  onClick={() => handleOutcome('bad_number')}
                                  disabled={completeMutation.isPending}
                                  className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-red-50 text-red-600 hover:bg-red-100"
                                  title="Phone number is incorrect or disconnected"
                                >
                                  <PhoneOff className="w-3.5 h-3.5" />
                                  Bad #
                                </button>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      {/* ENABLEMENT - Hero button + secondary options */}
                      {task.bucket === 'enablement' && (
                        <div className="space-y-3">
                          <button
                            onClick={() => handleOutcome('send_swatchbook')}
                            disabled={completeMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-cyan-500 to-cyan-600 text-white shadow-md hover:shadow-lg hover:from-cyan-600 hover:to-cyan-700"
                          >
                            <BookOpen className="w-5 h-5" />
                            Send Swatchbook
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleOutcome('send_press_test')}
                              disabled={completeMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              <Printer className="w-3.5 h-3.5" />
                              Press Test
                            </button>
                            <button
                              onClick={() => handleOutcome('send_pricelist')}
                              disabled={completeMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              <FileText className="w-3.5 h-3.5" />
                              Price List
                            </button>
                            <button
                              onClick={() => handleOutcome('already_has')}
                              disabled={completeMutation.isPending}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Has It
                            </button>
                          </div>
                        </div>
                      )}

                      {/* OUTREACH/FOLLOW-UPS - Hero button + secondary options */}
                      {(task.bucket === 'outreach' || task.bucket === 'follow_ups') && (
                        <div className="space-y-3">
                          <button
                            onClick={() => handleOutcome('email_sent')}
                            disabled={completeMutation.isPending}
                            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold transition-all bg-gradient-to-r from-blue-500 to-blue-600 text-white shadow-md hover:shadow-lg hover:from-blue-600 hover:to-blue-700"
                          >
                            <Send className="w-5 h-5" />
                            Email Sent!
                          </button>
                          <div className="flex gap-2">
                            <button
                              onClick={() => handleOutcome('called')}
                              disabled={completeMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-emerald-50 text-emerald-600 hover:bg-emerald-100"
                            >
                              <Phone className="w-3.5 h-3.5" />
                              Called
                            </button>
                            <button
                              onClick={() => handleOutcome('schedule_followup')}
                              disabled={completeMutation.isPending}
                              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-slate-100 text-slate-600 hover:bg-slate-200"
                            >
                              <Calendar className="w-3.5 h-3.5" />
                              Schedule
                            </button>
                            <button
                              onClick={() => handleOutcome('not_interested')}
                              disabled={completeMutation.isPending}
                              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all bg-amber-50 text-amber-600 hover:bg-amber-100"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Not Now
                            </button>
                          </div>
                        </div>
                      )}
                    </div>

                  </div>
                </div>
              )}


              </div>

              {/* Vertical Tabs - Right Side */}
              <div className="flex flex-col gap-2 flex-shrink-0">
                {/* Email Tab */}
                <button
                  onClick={() => {
                    setEmailIdeasOpen(!emailIdeasOpen);
                    if (!emailIdeasOpen) setCallScriptOpen(false);
                  }}
                  className={`w-12 py-6 rounded-r-xl flex flex-col items-center justify-center gap-2 transition-all shadow-md ${
                    emailIdeasOpen 
                      ? 'bg-blue-600 text-white shadow-blue-200' 
                      : 'bg-blue-500 text-white hover:bg-blue-600'
                  }`}
                >
                  <Mail className="w-5 h-5" />
                  <span 
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                  >
                    Email
                  </span>
                </button>
                
                {/* Calls Tab */}
                <button
                  onClick={() => {
                    setCallScriptOpen(!callScriptOpen);
                    if (!callScriptOpen) setEmailIdeasOpen(false);
                  }}
                  className={`w-12 py-6 rounded-r-xl flex flex-col items-center justify-center gap-2 transition-all shadow-md ${
                    callScriptOpen 
                      ? 'bg-green-600 text-white shadow-green-200' 
                      : 'bg-green-500 text-white hover:bg-green-600'
                  }`}
                >
                  <Phone className="w-5 h-5" />
                  <span 
                    className="text-xs font-bold tracking-wider uppercase"
                    style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
                  >
                    Calls
                  </span>
                </button>
              </div>
            </div>

            {/* Email Ideas Panel - Slides out from tab */}
            {emailIdeasOpen && (
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4 animate-in slide-in-from-right-2 duration-200">
                <div className="flex items-center gap-2 mb-3">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <span className="text-sm font-semibold text-blue-800">Email Ideas</span>
                </div>
                <div className="space-y-2">
                  {emailIdeas.map((idea, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-blue-700 leading-relaxed">{idea}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Call Script Panel - Slides out from tab */}
            {callScriptOpen && (
              <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-4 animate-in slide-in-from-right-2 duration-200">
                <div className="flex items-center gap-2 mb-3">
                  <Phone className="w-4 h-4 text-green-600" />
                  <span className="text-sm font-semibold text-green-800">Calling Script Ideas</span>
                </div>
                <div className="space-y-2">
                  {callScriptIdeas.map((idea, idx) => (
                    <div key={idx} className="flex items-start gap-2">
                      <div className="w-1.5 h-1.5 rounded-full bg-green-500 mt-1.5 flex-shrink-0" />
                      <p className="text-xs text-green-700 leading-relaxed">{idea}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
      
      {/* Full Profile Side Panel */}
      <Sheet open={showProfilePanel} onOpenChange={setShowProfilePanel}>
        <SheetContent className="w-[400px] sm:w-[540px] overflow-y-auto">
          <SheetHeader className="pb-4 border-b">
            <SheetTitle className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Building2 className="w-5 h-5 text-slate-600" />
                {customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || 'Customer Profile'}
              </div>
              {customer && !profileEditMode && (
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => {
                    setProfileEditData({
                      phone: customer.phone || '',
                      address1: customer.address1 || '',
                      city: customer.city || '',
                      province: customer.province || '',
                      zip: customer.zip || '',
                      website: customer.website || '',
                    });
                    setProfileEditMode(true);
                  }}
                >
                  <Pencil className="w-4 h-4 mr-1" />
                  Edit
                </Button>
              )}
            </SheetTitle>
            <SheetDescription>
              {profileEditMode ? 'Edit contact information' : 'Full customer details - no page navigation needed'}
            </SheetDescription>
          </SheetHeader>
          
          {customer && profileEditMode ? (
            <div className="py-6 space-y-4">
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="text-sm text-blue-700">
                  Edit the contact information below. Changes will be saved to the customer record.
                </p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-phone" className="text-sm font-medium">Phone Number</Label>
                  <Input
                    id="edit-phone"
                    value={profileEditData.phone}
                    onChange={(e) => setProfileEditData(prev => ({ ...prev, phone: e.target.value }))}
                    placeholder="Enter phone number"
                    className="border-slate-200"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-address" className="text-sm font-medium">Street Address</Label>
                  <Input
                    id="edit-address"
                    value={profileEditData.address1}
                    onChange={(e) => setProfileEditData(prev => ({ ...prev, address1: e.target.value }))}
                    placeholder="Enter street address"
                    className="border-slate-200"
                  />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="space-y-2">
                    <Label htmlFor="edit-city" className="text-sm font-medium">City</Label>
                    <Input
                      id="edit-city"
                      value={profileEditData.city}
                      onChange={(e) => setProfileEditData(prev => ({ ...prev, city: e.target.value }))}
                      placeholder="City"
                      className="border-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-province" className="text-sm font-medium">State</Label>
                    <Input
                      id="edit-province"
                      value={profileEditData.province}
                      onChange={(e) => setProfileEditData(prev => ({ ...prev, province: e.target.value }))}
                      placeholder="State"
                      className="border-slate-200"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="edit-zip" className="text-sm font-medium">ZIP</Label>
                    <Input
                      id="edit-zip"
                      value={profileEditData.zip}
                      onChange={(e) => setProfileEditData(prev => ({ ...prev, zip: e.target.value }))}
                      placeholder="ZIP"
                      className="border-slate-200"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="edit-website" className="text-sm font-medium">Website</Label>
                  <Input
                    id="edit-website"
                    value={profileEditData.website}
                    onChange={(e) => setProfileEditData(prev => ({ ...prev, website: e.target.value }))}
                    placeholder="https://example.com"
                    className="border-slate-200"
                  />
                </div>
              </div>

              <div className="flex gap-2 pt-4 border-t">
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => setProfileEditMode(false)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1 bg-blue-600 hover:bg-blue-700"
                  onClick={() => {
                    updateProfileMutation.mutate({
                      customerId: customer.id,
                      updates: profileEditData
                    });
                  }}
                  disabled={updateProfileMutation.isPending}
                >
                  {updateProfileMutation.isPending ? (
                    <>
                      <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4 mr-2" />
                      Save Changes
                    </>
                  )}
                </Button>
              </div>
            </div>
          ) : customer && (
            <div className="py-6 space-y-6">
              {/* Key Contact */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Key Contact</h4>
                <div className="bg-slate-50 rounded-xl p-4 space-y-2">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-slate-500" />
                    <span className="font-medium text-slate-800">
                      {customer.firstName || customer.lastName ? `${customer.firstName || ''} ${customer.lastName || ''}`.trim() : 'No name on file'}
                    </span>
                  </div>
                  {customer.email && (
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-500" />
                      <a href={`mailto:${customer.email}`} className="text-blue-600 hover:underline text-sm">
                        {customer.email}
                      </a>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <Phone className="w-4 h-4 text-slate-500" />
                    {customer.phone ? (
                      <a href={`tel:${customer.phone}`} className="text-blue-600 hover:underline text-sm">
                        {customer.phone}
                      </a>
                    ) : (
                      <span className="text-slate-400 italic text-sm">No phone on file</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Address */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Address</h4>
                <div className="bg-slate-50 rounded-xl p-4">
                  {customer.address1 ? (
                    <>
                      <div className="flex items-start gap-2">
                        <MapPin className="w-4 h-4 text-slate-500 mt-0.5" />
                        <div className="text-sm text-slate-700">
                          <p>{customer.address1}</p>
                          {customer.address2 && <p>{customer.address2}</p>}
                          <p>{customer.city}, {customer.province} {customer.zip}</p>
                          {customer.country && <p>{customer.country}</p>}
                        </div>
                      </div>
                      <a 
                        href={`https://maps.google.com/?q=${encodeURIComponent(`${customer.address1}, ${customer.city || ''} ${customer.province || ''} ${customer.zip || ''}`)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-3 text-sm text-blue-600 hover:underline"
                      >
                        <Globe className="w-3 h-3" />
                        Open in Maps
                      </a>
                    </>
                  ) : (
                    <div className="flex items-center gap-2">
                      <MapPin className="w-4 h-4 text-slate-400" />
                      <span className="text-slate-400 italic text-sm">No address on file</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Business Info */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Business Info</h4>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Pricing Tier</p>
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 capitalize">
                      {customer.pricingTier || 'Not set'}
                    </Badge>
                  </div>
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Sales Rep</p>
                    <p className="text-sm font-medium text-slate-800">{customer.salesRepName || 'Unassigned'}</p>
                  </div>
                </div>
                {customer.website && (
                  <div className="bg-slate-50 rounded-xl p-3">
                    <p className="text-xs text-slate-500 mb-1">Website</p>
                    <a 
                      href={customer.website.startsWith('http') ? customer.website : `https://${customer.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-sm text-blue-600 hover:underline flex items-center gap-1"
                    >
                      <Globe className="w-3 h-3" />
                      {customer.website}
                    </a>
                  </div>
                )}
              </div>

              {/* Machines - Hide for resellers and end users (only printers have machines) */}
              {customer?.customerType !== 'reseller' && customer?.customerType !== 'enduser' && (
                <div className="space-y-3">
                  <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Machines</h4>
                  <div className="bg-slate-50 rounded-xl p-4">
                    <div className="flex flex-wrap gap-2">
                      {customerMachines.length > 0 ? (
                        customerMachines.map((m) => (
                          <Badge key={m.id} variant="outline" className="text-xs bg-white">
                            {m.machineFamily}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-sm text-slate-400 italic">No machines on file</span>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {/* Recent Notes */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Recent Notes</h4>
                <div className="space-y-2">
                  {customerNotes.length > 0 ? (
                    customerNotes.slice(0, 5).map((note) => (
                      <div key={note.id} className="bg-slate-50 rounded-xl p-3">
                        <p className="text-xs text-blue-600 mb-1">
                          {new Date(note.occurredAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </p>
                        <p className="text-sm text-slate-700">{note.summary}</p>
                      </div>
                    ))
                  ) : (
                    <p className="text-sm text-slate-400 italic">No notes yet</p>
                  )}
                </div>
              </div>

              {/* Quick Actions */}
              <div className="pt-4 border-t space-y-3">
                <h4 className="text-sm font-semibold text-slate-500 uppercase tracking-wide">Quick Actions</h4>
                <div className="flex flex-wrap gap-2">
                  {customer.email && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => {
                        setShowProfilePanel(false);
                        handleOpenEmailComposer();
                      }}
                    >
                      <Mail className="w-4 h-4 mr-1" />
                      Send Email
                    </Button>
                  )}
                  {customer.phone && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      asChild
                    >
                      <a href={`tel:${customer.phone}`}>
                        <Phone className="w-4 h-4 mr-1" />
                        Call
                      </a>
                    </Button>
                  )}
                  <Link href={`/odoo-contacts/${customer.id}`}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="rounded-full"
                      onClick={() => setShowProfilePanel(false)}
                    >
                      <ExternalLink className="w-4 h-4 mr-1" />
                      Full Page
                    </Button>
                  </Link>
                </div>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-600">
              <Trash2 className="w-5 h-5" />
              Delete {task?.isLeadTask ? 'Lead' : 'Customer'}?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2">
                <span className="block">
                  <span className="font-medium text-gray-900">
                    {customer?.company || `${customer?.firstName || ''} ${customer?.lastName || ''}`.trim() || (task?.isLeadTask ? 'This lead' : 'This customer')}
                  </span>
                  {customer?.email && <span className="text-gray-500 ml-1">({customer.email})</span>}
                </span>
                <span className="block text-amber-600">
                  This action cannot be undone. The {task?.isLeadTask ? 'lead' : 'customer'} will be permanently removed{task?.isLeadTask ? '' : ' and blocked from future imports'}.
                </span>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteMutation.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (task?.isLeadTask && task?.leadId) {
                  deleteMutation.mutate({ customerId: customer?.id || '', isLead: true, leadId: task.leadId });
                } else if (customer?.id) {
                  deleteMutation.mutate({ customerId: customer.id });
                }
              }}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : `Delete ${task?.isLeadTask ? 'Lead' : 'Customer'}`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

      {/* Call Coaching Modal - Encourages users to make calls */}
      <Dialog open={showCallCoachingModal} onOpenChange={(open) => {
        setShowCallCoachingModal(open);
        if (!open) setCallCoachingDismissedToday(true);
      }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-blue-600">
              <Phone className="w-5 h-5" />
              Time to Pick Up the Phone!
            </DialogTitle>
            <DialogDescription className="text-base pt-2">
              You've completed {session?.totalCompleted || 0} tasks today but haven't made any calls yet. 
              Calls are the secret sauce that makes this whole system work!
            </DialogDescription>
          </DialogHeader>
          
          <div className="py-4 space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
              <h4 className="font-semibold text-blue-800 mb-2 flex items-center gap-2">
                <Sparkles className="w-4 h-4" />
                Why Calls Matter
              </h4>
              <p className="text-sm text-blue-700">
                Emails and data tasks are great, but <strong>calls create real connections</strong>. 
                A quick call builds more trust than 10 emails. It's how we turn contacts into customers!
              </p>
            </div>

            <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
              <h4 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
                <MessageCircle className="w-4 h-4" />
                Quick Tips for Calling
              </h4>
              <ul className="text-sm text-amber-700 space-y-1.5">
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Be genuine</strong> — Just say "I'm checking in to see how things are going"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>Ask about their machines</strong> — "What equipment are you running these days?"</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>It's OK to leave voicemail</strong> — Just be friendly and brief</span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-amber-500 mt-0.5">•</span>
                  <span><strong>No pressure!</strong> — You're not selling, you're connecting</span>
                </li>
              </ul>
            </div>

            <div className="bg-green-50 border border-green-200 rounded-xl p-4">
              <h4 className="font-semibold text-green-800 mb-2 flex items-center gap-2">
                <Target className="w-4 h-4" />
                Your Call Goal
              </h4>
              <p className="text-sm text-green-700">
                Try to make at least <strong>3-5 calls today</strong>. Even if you just leave voicemails, 
                you're building relationships and staying top of mind!
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              onClick={() => {
                setShowCallCoachingModal(false);
                setCallCoachingDismissedToday(true);
              }}
              className="w-full bg-blue-600 hover:bg-blue-700"
            >
              <Phone className="w-4 h-4 mr-2" />
              Got It — Let's Make Some Calls!
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
            <DialogDescription asChild>
              <div className="space-y-1">
                <span className="font-medium text-gray-900 block">
                  {customer?.company || customer?.firstName || 'Unknown'}
                </span>
                {customer?.email && (
                  <a 
                    href={`mailto:${customer.email}`}
                    className="text-sm text-primary hover:underline block"
                  >
                    {customer.email}
                  </a>
                )}
                <span className="text-gray-400 mt-1 block">Fill in the missing information to improve data quality.</span>
              </div>
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
                    {PRICING_TIERS.map((tier) => (
                      <SelectItem key={tier} value={tier}>
                        {tier}
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

              {/* Email Selection */}
              {(() => {
                const allEmails = getMergeEmails();
                if (allEmails.length === 0) return null;
                
                const extraEmails = allEmails.filter(e => e !== mergeEmailSelections.primary && e !== mergeEmailSelections.secondary);
                
                return (
                  <div className="border-t pt-4">
                    <h4 className="font-medium text-sm text-gray-700 mb-3">
                      <Mail className="w-4 h-4 inline mr-1" />
                      Email Addresses ({allEmails.length} found)
                    </h4>
                    <div className="space-y-3">
                      {/* Primary Email */}
                      <div className="bg-blue-50 rounded-lg p-3">
                        <div className="text-xs font-medium text-blue-700 mb-2">Primary Email</div>
                        <div className="flex flex-wrap gap-2">
                          {allEmails.map((email) => (
                            <button
                              key={`primary-${email}`}
                              type="button"
                              onClick={() => {
                                setMergeEmailSelections(prev => ({
                                  primary: email,
                                  secondary: prev.secondary === email ? '' : prev.secondary
                                }));
                              }}
                              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                                mergeEmailSelections.primary === email
                                  ? 'bg-blue-600 text-white border-blue-600'
                                  : 'bg-white border-gray-300 hover:border-blue-400 text-gray-700'
                              }`}
                            >
                              {email}
                            </button>
                          ))}
                        </div>
                      </div>
                      
                      {/* Secondary Email */}
                      {allEmails.length > 1 && (
                        <div className="bg-gray-50 rounded-lg p-3">
                          <div className="text-xs font-medium text-gray-600 mb-2">Secondary Email</div>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => setMergeEmailSelections(prev => ({ ...prev, secondary: '' }))}
                              className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                                !mergeEmailSelections.secondary
                                  ? 'bg-gray-600 text-white border-gray-600'
                                  : 'bg-white border-gray-300 hover:border-gray-400 text-gray-700'
                              }`}
                            >
                              None
                            </button>
                            {allEmails.filter(e => e !== mergeEmailSelections.primary).map((email) => (
                              <button
                                key={`secondary-${email}`}
                                type="button"
                                onClick={() => setMergeEmailSelections(prev => ({ ...prev, secondary: email }))}
                                className={`px-3 py-1.5 text-sm rounded-full border transition-all ${
                                  mergeEmailSelections.secondary === email
                                    ? 'bg-gray-600 text-white border-gray-600'
                                    : 'bg-white border-gray-300 hover:border-gray-400 text-gray-700'
                                }`}
                              >
                                {email}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      
                      {/* Extra Emails Warning */}
                      {extraEmails.length > 0 && (
                        <div className="bg-amber-50 rounded-lg p-3 border border-amber-200">
                          <div className="text-xs font-medium text-amber-700 mb-1">
                            Extra emails will be added to Notes:
                          </div>
                          <div className="text-sm text-amber-800">
                            {extraEmails.join(', ')}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

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
                              {PRICING_TIERS.map((tier) => (
                                <SelectItem key={tier} value={tier}>
                                  {tier}
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
                setMergeEmailSelections({ primary: '', secondary: '' });
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
      
      {/* Morning Warmup Modal */}
      <Dialog open={showWarmup} onOpenChange={setShowWarmup}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Coffee className="w-5 h-5 text-amber-500" />
              Good Morning!
            </DialogTitle>
          </DialogHeader>
          {warmupData && (
            <div className="space-y-4 py-4">
              {warmupData.streak > 0 && (
                <div className="flex items-center justify-center gap-2 p-3 bg-gradient-to-r from-orange-50 to-amber-50 rounded-lg border border-orange-200">
                  <Flame className="w-6 h-6 text-orange-500" />
                  <span className="text-lg font-semibold text-orange-700">{warmupData.streak} Day Streak!</span>
                </div>
              )}
              
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Yesterday you:</p>
                <div className="grid grid-cols-3 gap-3 text-center">
                  <div>
                    <div className="text-2xl font-bold text-purple-600">{warmupData.yesterdaySummary.calls}</div>
                    <div className="text-xs text-gray-500">Calls</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-green-600">{warmupData.yesterdaySummary.tasksCompleted}</div>
                    <div className="text-xs text-gray-500">Tasks</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-blue-600">{warmupData.yesterdaySummary.pricingTiersAssigned}</div>
                    <div className="text-xs text-gray-500">Tiers Set</div>
                  </div>
                </div>
              </div>
              
              <div className="text-center">
                <p className="text-sm text-gray-600">Today's focus:</p>
                <p className="text-base font-medium text-[#111111]">{warmupData.todayFocus}</p>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button 
              onClick={() => setShowWarmup(false)} 
              className="w-full bg-[#111111] hover:bg-[#333333]"
            >
              Let's Go!
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Micro-Coaching Card Modal */}
      <Dialog open={showMicroCard} onOpenChange={setShowMicroCard}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              {currentTask?.microCard?.cardType === 'product_quiz' && <BookOpen className="w-5 h-5 text-blue-500" />}
              {currentTask?.microCard?.cardType === 'objection_practice' && <MessageSquare className="w-5 h-5 text-orange-500" />}
              {currentTask?.microCard?.cardType === 'competitor_intel' && <Target className="w-5 h-5 text-red-500" />}
              {currentTask?.microCard?.cardType === 'customer_story' && <Star className="w-5 h-5 text-yellow-500" />}
              {currentTask?.microCard?.cardType === 'machine_profile_check' && <Settings className="w-5 h-5 text-purple-500" />}
              {currentTask?.microCard?.title}
            </DialogTitle>
            <Badge variant="outline" className="w-fit">
              {currentTask?.microCard?.difficulty === 'easy' ? 'Quick' : currentTask?.microCard?.difficulty === 'hard' ? 'Challenge' : 'Standard'}
            </Badge>
          </DialogHeader>
          
          {currentTask?.microCard && (
            <div className="space-y-4 py-4">
              <p className="text-sm text-gray-600">{currentTask.microCard.content}</p>
              
              {/* Quiz options */}
              {currentTask.microCard.cardType === 'product_quiz' && currentTask.microCard.options && (
                <div className="space-y-2">
                  <p className="font-medium text-sm">{currentTask.microCard.question}</p>
                  {currentTask.microCard.options.map((option, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        setSelectedQuizAnswer(idx);
                        setQuizAnswered(true);
                      }}
                      disabled={quizAnswered}
                      className={`w-full p-3 text-left rounded-lg border text-sm transition-all ${
                        quizAnswered && idx === currentTask.microCard?.correctAnswer
                          ? 'bg-green-100 border-green-500 text-green-800'
                          : quizAnswered && idx === selectedQuizAnswer
                          ? 'bg-red-100 border-red-500 text-red-800'
                          : selectedQuizAnswer === idx
                          ? 'bg-blue-50 border-blue-500'
                          : 'hover:bg-gray-50 border-gray-200'
                      }`}
                    >
                      {option}
                    </button>
                  ))}
                  
                  {quizAnswered && (
                    <div className={`p-3 rounded-lg text-sm ${
                      selectedQuizAnswer === currentTask.microCard.correctAnswer
                        ? 'bg-green-50 text-green-800'
                        : 'bg-amber-50 text-amber-800'
                    }`}>
                      {selectedQuizAnswer === currentTask.microCard.correctAnswer ? (
                        <span className="flex items-center gap-2">
                          <CheckCircle className="w-4 h-4" /> Correct!
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <AlertCircle className="w-4 h-4" /> Not quite.
                        </span>
                      )}
                      {currentTask.microCard.explanation && (
                        <p className="mt-2 text-xs">{currentTask.microCard.explanation}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
              
              {/* Objection practice */}
              {currentTask.microCard.cardType === 'objection_practice' && currentTask.microCard.suggestedResponses && (
                <div className="space-y-2">
                  <p className="font-medium text-sm">Suggested responses:</p>
                  {currentTask.microCard.suggestedResponses.map((response) => (
                    <div 
                      key={response.id} 
                      className={`p-3 rounded-lg border text-sm ${
                        response.isRecommended ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      {response.isRecommended && (
                        <Badge variant="secondary" className="mb-2 bg-green-100 text-green-700">
                          Recommended
                        </Badge>
                      )}
                      <p>{response.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button 
              onClick={() => setShowMicroCard(false)} 
              variant="outline"
              className="w-full"
            >
              {quizAnswered || currentTask?.microCard?.cardType !== 'product_quiz' ? 'Continue' : 'Skip'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Custom Follow-up Dialog */}
      <Dialog open={showFollowUpDialog} onOpenChange={setShowFollowUpDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-blue-600" />
              Schedule Follow-up
            </DialogTitle>
            <DialogDescription>
              When should you follow up with this customer?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[1, 3, 7, 14].map((days) => (
                <Button
                  key={days}
                  variant={followUpDays === days ? 'default' : 'outline'}
                  className={`${followUpDays === days ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
                  onClick={() => setFollowUpDays(days)}
                >
                  {days}d
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={90}
                value={followUpDays}
                onChange={(e) => setFollowUpDays(parseInt(e.target.value) || 7)}
                className="w-20"
              />
              <span className="text-sm text-gray-600">days from now</span>
            </div>
            
            <div className="text-sm text-gray-500">
              Follow-up date: {new Date(Date.now() + followUpDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowFollowUpDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCustomFollowUp}
              disabled={completeMutation.isPending || followUpDays < 1 || followUpDays > 90}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {completeMutation.isPending ? 'Scheduling...' : 'Schedule Follow-up'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Remind Later Dialog - For email/sample tasks */}
      <Dialog open={showRemindLaterDialog} onOpenChange={setShowRemindLaterDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-600" />
              Remind Me Later
            </DialogTitle>
            <DialogDescription>
              When should this email task come back to your queue?
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {[1, 2, 3, 7].map((days) => (
                <Button
                  key={days}
                  variant={remindLaterDays === days ? 'default' : 'outline'}
                  className={`${remindLaterDays === days ? 'bg-amber-600 hover:bg-amber-700' : ''}`}
                  onClick={() => setRemindLaterDays(days)}
                >
                  {days === 1 ? 'Tomorrow' : `${days}d`}
                </Button>
              ))}
            </div>
            
            <div className="flex items-center gap-2">
              <Input
                type="number"
                min={1}
                max={30}
                value={remindLaterDays}
                onChange={(e) => setRemindLaterDays(parseInt(e.target.value) || 1)}
                className="w-20"
              />
              <span className="text-sm text-gray-600">days from now</span>
            </div>
            
            <div className="text-sm text-gray-500">
              Will resurface: {new Date(Date.now() + remindLaterDays * 24 * 60 * 60 * 1000).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRemindLaterDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => {
                // Create a follow-up task for the specified number of days
                if (currentTask?.task) {
                  completeMutation.mutate({ 
                    taskId: currentTask.task.id, 
                    outcomeId: 'remind_later', 
                    customFollowUpDays: remindLaterDays 
                  });
                  setShowRemindLaterDialog(false);
                }
              }}
              disabled={completeMutation.isPending || remindLaterDays < 1 || remindLaterDays > 30}
              className="bg-amber-600 hover:bg-amber-700"
            >
              {completeMutation.isPending ? 'Setting reminder...' : 'Set Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Composer Dialog */}
      <Dialog open={showEmailComposer} onOpenChange={setShowEmailComposer}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-blue-600" />
              Compose Email
            </DialogTitle>
            <DialogDescription>
              Send an email to this customer via your Gmail account
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* Template Selector */}
            {emailTemplates.length > 0 && (
              <div className="space-y-2">
                <Label className="text-sm font-medium">Use Template</Label>
                <Select 
                  value={selectedTemplateId?.toString() || ''} 
                  onValueChange={handleTemplateSelect}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a template..." />
                  </SelectTrigger>
                  <SelectContent>
                    {emailTemplates.map((template) => (
                      <SelectItem key={template.id} value={template.id.toString()}>
                        {template.name} {template.category && `(${template.category})`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {/* To Field */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">To</Label>
              <Input
                type="email"
                value={emailTo}
                onChange={(e) => setEmailTo(e.target.value)}
                placeholder="recipient@example.com"
                className="w-full"
              />
            </div>

            {/* Subject Field */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Subject</Label>
              <Input
                type="text"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
                placeholder="Email subject..."
                className="w-full"
              />
            </div>

            {/* Body Field with rich text editor */}
            <div className="space-y-2">
              <Label className="text-sm font-medium">Message</Label>
              <EmailRichTextEditor
                ref={emailEditorRef}
                content={emailBody}
                onChange={(html) => setEmailBody(html)}
                placeholder="Type your message here..."
              />
            </div>
          </div>

          <DialogFooter className="flex gap-2">
            <Button 
              variant="outline" 
              onClick={() => {
                setShowEmailComposer(false);
                setEmailTo('');
                setEmailSubject('');
                setEmailBody('');
                setSelectedTemplateId(null);
                emailEditorRef.current?.setContent('');
              }}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSendEmail}
              disabled={sendEmailMutation.isPending || !emailTo || !emailSubject || !emailBody || emailBody === '<p></p>'}
              className="bg-blue-600 hover:bg-blue-700"
            >
              {sendEmailMutation.isPending ? (
                <>
                  <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  Sending...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4 mr-2" />
                  Send Email
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Label Dialog */}
      <Dialog open={showPrintLabel} onOpenChange={setShowPrintLabel}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Printer className="w-5 h-5 text-purple-600" />
              Print Address Label
            </DialogTitle>
            <DialogDescription>
              Generate a 4"x3" thermal label for shipping marketing materials.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>What are you sending?</Label>
              <Select value={labelType} onValueChange={(v: 'swatch_book' | 'press_test_kit' | 'mailer' | 'other') => setLabelType(v)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select label type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="swatch_book">Swatch Book</SelectItem>
                  <SelectItem value="press_test_kit">Press Test Kit</SelectItem>
                  <SelectItem value="mailer">Mailer</SelectItem>
                  <SelectItem value="other">Something Else</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {labelType === 'other' && (
              <div className="grid gap-2">
                <Label htmlFor="otherDescription">Description</Label>
                <Input
                  id="otherDescription"
                  value={labelOtherDescription}
                  onChange={(e) => setLabelOtherDescription(e.target.value)}
                  placeholder="What are you sending?"
                />
              </div>
            )}

            <div className="grid gap-2">
              <Label htmlFor="quantity">Quantity</Label>
              <Input
                id="quantity"
                type="number"
                min={1}
                value={labelQuantity}
                onChange={(e) => setLabelQuantity(parseInt(e.target.value) || 1)}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="notes">Notes (optional)</Label>
              <Textarea
                id="notes"
                value={labelNotes}
                onChange={(e) => setLabelNotes(e.target.value)}
                placeholder="Any special instructions..."
                rows={2}
              />
            </div>

            {/* Address Preview - Use lead data for lead tasks */}
            <div className="bg-gray-50 rounded-lg p-4 border">
              <p className="text-xs text-gray-500 mb-2">Shipping To:</p>
              {task?.isLeadTask && task?.lead ? (
                <>
                  <p className="font-semibold">{task.lead.company || task.lead.name || 'Lead'}</p>
                  {task.lead.address && <p className="text-sm text-gray-700">{task.lead.address}</p>}
                  {task.lead.city && (
                    <p className="text-sm text-gray-700">
                      {[task.lead.city, task.lead.state, task.lead.zip].filter(Boolean).join(', ')}
                    </p>
                  )}
                </>
              ) : (
                <>
                  <p className="font-semibold">{customer?.company || `${customer?.firstName} ${customer?.lastName}`.trim()}</p>
                  {customer?.address1 && <p className="text-sm text-gray-700">{customer.address1}</p>}
                  {customer?.address2 && <p className="text-sm text-gray-700">{customer.address2}</p>}
                  <p className="text-sm text-gray-700">
                    {[customer?.city, customer?.province, customer?.zip].filter(Boolean).join(', ')}
                  </p>
                  {customer?.country && !['US', 'USA', 'CA', 'CAN'].includes(customer.country) && (
                    <p className="text-sm text-gray-700">{customer.country}</p>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowPrintLabel(false)}>
              Cancel
            </Button>
            <Button 
              onClick={() => printLabelMutation.mutate({
                labelType,
                otherDescription: labelType === 'other' ? labelOtherDescription : undefined,
                quantity: labelQuantity,
                notes: labelNotes || undefined,
              })}
              disabled={printLabelMutation.isPending || (labelType === 'other' && !labelOtherDescription.trim())}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {printLabelMutation.isPending ? (
                <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
              ) : (
                <Printer className="w-4 h-4 mr-2" />
              )}
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Later Today Scratch Pad - Floating Panel */}
      {remindTodayTasks.length > 0 && (
        <div className="fixed bottom-6 right-6 z-50">
          {scratchPadOpen ? (
            <div className="bg-white rounded-xl shadow-2xl border border-gray-200 w-80 max-h-96 overflow-hidden animate-in slide-in-from-bottom-2 duration-200">
              <div className="flex items-center justify-between px-4 py-3 border-b bg-gradient-to-r from-amber-50 to-orange-50">
                <div className="flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-amber-600" />
                  <span className="font-semibold text-sm text-amber-900">Later Today</span>
                  <span className="px-1.5 py-0.5 text-xs font-medium bg-amber-200 text-amber-800 rounded-full">
                    {remindTodayTasks.length}
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6"
                  onClick={() => setScratchPadOpen(false)}
                >
                  <X className="w-4 h-4" />
                </Button>
              </div>
              <div className="overflow-y-auto max-h-72 p-2">
                {remindTodayTasks.map((t, idx) => (
                  <div
                    key={t.taskId}
                    className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors group"
                    onClick={() => {
                      // Navigate to this bucket via URL param
                      window.location.href = `/spotlight?forceBucket=${t.bucket}`;
                      setScratchPadOpen(false);
                    }}
                  >
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center">
                      <span className="text-xs font-medium text-amber-700">{idx + 1}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 truncate">{t.displayName}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {t.isLead && (
                          <span className="px-1.5 py-0.5 text-xs font-medium bg-emerald-100 text-emerald-700 rounded">LEAD</span>
                        )}
                        <span className="text-xs text-gray-500 capitalize">{t.bucket.replace('_', ' ')}</span>
                      </div>
                    </div>
                    <ChevronRight className="w-4 h-4 text-gray-400 group-hover:text-gray-600 flex-shrink-0" />
                  </div>
                ))}
              </div>
              <div className="px-4 py-2 border-t bg-gray-50">
                <p className="text-xs text-gray-500 text-center">
                  Tasks you deferred earlier today
                </p>
              </div>
            </div>
          ) : (
            <Button
              onClick={() => setScratchPadOpen(true)}
              className="h-12 w-12 rounded-full shadow-lg bg-gradient-to-br from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 relative"
            >
              <ClipboardList className="w-5 h-5 text-white" />
              <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">
                {remindTodayTasks.length}
              </span>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

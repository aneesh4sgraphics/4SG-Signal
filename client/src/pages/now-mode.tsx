import { useState, useEffect, useMemo, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PRICING_TIERS } from "@shared/schema";
import { getSalesRepDisplayName } from "@/lib/utils";
import { 
  Phone, 
  Mail, 
  PhoneMissed, 
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Building2,
  User,
  Zap,
  Trophy,
  SkipForward,
  AlertCircle,
  Send,
  BookOpen,
  FileText,
  Gauge,
  RefreshCw,
  Heart,
  Calendar,
  MessageCircle,
  Layers,
  Package,
  UserX,
  Voicemail,
  Check,
  Clock,
  Target,
  AlertTriangle,
  Coffee,
  Play,
  TrendingUp,
  TrendingDown,
  Minus,
  Settings,
  MapPin,
  Printer,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  ScrollText,
  LucideIcon,
  Flame,
  Palette
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useEmailComposer } from "@/components/email-composer";
import { Copy } from "lucide-react";

interface Customer {
  id: string;
  company: string | null;
  name: string | null;
  email: string | null;
  email2: string | null;
  phone: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  address1?: string | null;
  address2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  isHotProspect?: boolean;
  odooPartnerId?: number | null;
}

interface CustomerContact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  role: string | null;
  isPrimary: boolean;
}

interface OutcomeButton {
  outcome: string;
  label: string;
  icon: string;
  color: string;
  schedulesFollowUp?: boolean;
  followUpDays?: number;
  assistText?: string;
}

// Time estimates per bucket in minutes
const BUCKET_TIME_ESTIMATES: Record<string, number> = {
  calls: 4,
  follow_ups: 3,
  outreach: 2,
  data_hygiene: 1,
  enablement: 2,
};

interface NowModeCard {
  customerId: string;
  cardType: string;
  bucket: string;
  whyNow: string;
  isHardCard: boolean;
  outcomeButtons: OutcomeButton[];
  customer: Customer;
}

interface BucketProgress {
  bucket: string;
  completed: number;
  quota: number;
  remaining: number;
}

interface NowModeResponse {
  card: NowModeCard | null;
  completed: number;
  dailyTarget: number;
  remaining: number;
  allDone?: boolean;
  message?: string;
  efficiencyScore: number;
  bucketProgress: BucketProgress[];
  skipPenaltyApplied: boolean;
  totalSkips: number;
}

const BUCKET_LABELS: Record<string, { label: string; color: string }> = {
  calls: { label: "Calls", color: "#28A745" },
  follow_ups: { label: "Follow-ups", color: "#FD7E14" },
  outreach: { label: "Outreach", color: "#6F42C1" },
  data_hygiene: { label: "Data Hygiene", color: "#17A2B8" },
  enablement: { label: "Enablement", color: "#D63384" },
};

const CARD_TYPE_LABELS: Record<string, { label: string; Icon: LucideIcon }> = {
  set_pricing_tier: { label: "Set Pricing Tier", Icon: Target },
  set_sales_rep: { label: "Assign Sales Rep", Icon: User },
  set_primary_email: { label: "Add Primary Email", Icon: Mail },
  set_machine_profile: { label: "Set Machine Profile", Icon: Settings },
  set_mailing_address: { label: "Add Mailing Address", Icon: MapPin },
  daily_call: { label: "Daily Call", Icon: Phone },
  follow_up_call: { label: "Follow-up Call", Icon: Phone },
  send_swatchbook: { label: "Send Swatchbook", Icon: BookOpen },
  send_press_test: { label: "Send Press Test", Icon: Package },
  send_marketing_email: { label: "Send Marketing Email", Icon: Send },
  send_price_list: { label: "Send Price List", Icon: FileText },
  follow_up_quote: { label: "Follow Up on Quote", Icon: Phone },
  follow_up_sample: { label: "Follow Up on Sample", Icon: Package },
  follow_up_materials: { label: "Follow Up on Materials", Icon: MessageCircle },
  check_feedback: { label: "Check Feedback", Icon: MessageCircle },
  introduce_category: { label: "Introduce New Category", Icon: Layers },
  check_reorder: { label: "Check Reorder Status", Icon: RefreshCw },
  win_back: { label: "Win Back Customer", Icon: Heart },
};

const OUTCOME_ICONS: Record<string, LucideIcon> = {
  check: CheckCircle2,
  phone: Phone,
  voicemail: Voicemail,
  "phone-missed": PhoneMissed,
  mail: Mail,
  send: Send,
  "file-text": FileText,
  calendar: Calendar,
  "user-x": UserX,
};

const SKIP_REASONS = [
  { value: "customer_unavailable", label: "Customer unavailable" },
  { value: "wrong_timing", label: "Wrong timing" },
  { value: "already_contacted", label: "Already contacted recently" },
  { value: "missing_info", label: "Missing required info" },
  { value: "not_relevant", label: "Not relevant for this customer" },
  { value: "other", label: "Other reason" },
];

// Sales Scripts for Focus Mode
const CALL_SCRIPTS = {
  first_call: {
    title: "First Call Introduction",
    script: `Hi, this is [Your Name] from 4S Graphics. I'm reaching out because we specialize in high-quality vinyl and heat transfer products for businesses like yours.

Do you have a moment to chat about your current printing supplies?

[If yes] Great! I'd love to learn more about what types of materials you typically use...

[If busy] No problem! When would be a better time for a quick 5-minute call?`,
  },
  follow_up_call: {
    title: "Follow-up Call",
    script: `Hi, this is [Your Name] from 4S Graphics following up on our previous conversation.

I wanted to check if you had a chance to review the samples/quote we sent over?

[If yes] Wonderful! Do you have any questions about the materials or pricing?

[If no] No worries! Would you like me to resend the information?`,
  },
  quote_follow_up: {
    title: "Quote Follow-up",
    script: `Hi, this is [Your Name] from 4S Graphics. I'm calling about the quote we sent on [date].

Did you get a chance to look it over? I'd be happy to walk you through any of the line items or answer questions about our products.

Is there anything holding you back from moving forward?`,
  },
  voicemail: {
    title: "Voicemail Script",
    script: `Hi, this is [Your Name] from 4S Graphics calling for [Company Name].

I wanted to reach out about [reason]. Please give me a call back at [your number] when you have a moment.

Thanks, and I look forward to speaking with you!`,
  },
};

const EMAIL_SCRIPTS = {
  introduction: {
    title: "Introduction Email",
    script: `Subject: Quality Vinyl & Heat Transfer Products for [Company Name]

Hi [Name],

I'm [Your Name] from 4S Graphics. We specialize in high-quality vinyl and heat transfer materials for printing businesses.

I noticed you work with [type of products] and thought our materials might be a great fit for your projects.

Would you be interested in receiving some free samples to test out?

Best regards,
[Your Name]`,
  },
  sample_follow_up: {
    title: "Sample Follow-up",
    script: `Subject: How did the samples work out?

Hi [Name],

I wanted to follow up on the samples we sent over last week. Have you had a chance to test them out?

I'd love to hear your feedback and answer any questions about our full product line.

Let me know if you'd like pricing on any specific materials!

Best,
[Your Name]`,
  },
  quote_follow_up: {
    title: "Quote Follow-up Email",
    script: `Subject: Following up on your quote

Hi [Name],

I wanted to check in on the quote we sent for [products]. Do you have any questions about the pricing or specifications?

I'm happy to hop on a quick call to walk through everything if that would help.

Looking forward to hearing from you!

Best,
[Your Name]`,
  },
};

const QUICK_TIPS = [
  "Smile when you dial - it comes through in your voice!",
  "Ask open-ended questions to keep the conversation going",
  "Listen more than you talk - 70/30 rule",
  "Always confirm the next step before ending the call",
  "Take notes during the call for follow-up",
  "Mention a specific product that fits their needs",
  "If they're busy, ask for a specific callback time",
];

export default function NowMode() {
  const [notes, setNotes] = useState("");
  const [showSkipModal, setShowSkipModal] = useState(false);
  const [showSkipWarning, setShowSkipWarning] = useState(false);
  const [skipReason, setSkipReason] = useState("");
  const [skipNotes, setSkipNotes] = useState("");
  const [showSuccessAnimation, setShowSuccessAnimation] = useState(false);
  const [optimisticCompleted, setOptimisticCompleted] = useState<number | null>(null);
  const [optimisticEfficiency, setOptimisticEfficiency] = useState<number | null>(null);
  const [efficiencyDelta, setEfficiencyDelta] = useState<number | null>(null);
  const [showDormancyPopup, setShowDormancyPopup] = useState(false);
  const [dormancyDismissed, setDormancyDismissed] = useState(false);
  const [showProfileGateDialog, setShowProfileGateDialog] = useState(false);
  const [selectedPricingTier, setSelectedPricingTier] = useState("");
  const [selectedSalesRep, setSelectedSalesRep] = useState("");
  const [inlineEmail, setInlineEmail] = useState("");
  const [inlinePricingTier, setInlinePricingTier] = useState("");
  const [inlineSalesRep, setInlineSalesRep] = useState("");
  const [inlineAddress1, setInlineAddress1] = useState("");
  const [inlineCity, setInlineCity] = useState("");
  const [inlineState, setInlineState] = useState("");
  const [inlineZip, setInlineZip] = useState("");
  const [scriptsTrayOpen, setScriptsTrayOpen] = useState(() => {
    const saved = localStorage.getItem('nowModeScriptsTrayOpen');
    return saved !== null ? saved === 'true' : true;
  });
  const [awaitingNext, setAwaitingNext] = useState(false);
  // Print label dialog state
  const [isPrintDialogOpen, setIsPrintDialogOpen] = useState(false);
  const [printLabelType, setPrintLabelType] = useState<'swatchbook' | 'presskit' | 'mailer' | 'other' | null>(null);
  const [printLabelNotes, setPrintLabelNotes] = useState('');
  
  // Persist scripts tray preference
  useEffect(() => {
    localStorage.setItem('nowModeScriptsTrayOpen', String(scriptsTrayOpen));
  }, [scriptsTrayOpen]);
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const { open: openEmailComposer } = useEmailComposer();

  // Fetch users for sales rep dropdown
  const { data: usersData, isLoading: usersLoading } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string }[]>({
    queryKey: ["/api/users"],
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });

  // Sort users by display name for dropdown
  const sortedUsers = useMemo(() => {
    if (!usersData) return [];
    return [...usersData].sort((a, b) => {
      const nameA = getSalesRepDisplayName(a.email);
      const nameB = getSalesRepDisplayName(b.email);
      return nameA.localeCompare(nameB);
    });
  }, [usersData]);

  // Dormancy check with empathetic messaging
  const { data: dormancyData } = useQuery<{
    isDormant: boolean;
    isPaused: boolean;
    coachingMessage: string;
    todayCompleted: number;
    yesterdayCompleted?: number;
    aheadOfYesterday?: boolean;
    efficiencyScore: number;
  }>({
    queryKey: ["/api/now-mode/dormancy-check"],
    refetchInterval: 60000, // Check every minute
  });

  // Rolling 7-day efficiency with social proof
  const { data: rollingData } = useQuery<{
    rolling7DayScore: number;
    todayScore: number;
    percentile: number;
    socialProof: string;
    trend: string;
    trendMessage: string;
  }>({
    queryKey: ["/api/now-mode/rolling-efficiency"],
  });

  // Fetch main NOW MODE data first to get customer ID
  const { data, isLoading, isError, error, refetch } = useQuery<NowModeResponse>({
    queryKey: ["/api/now-mode/current"],
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });

  // Fetch customer contacts when set_primary_email card is shown
  const { data: customerContacts } = useQuery<CustomerContact[]>({
    queryKey: ["/api/crm/customer-contacts", { customerId: data?.card?.customerId }],
    enabled: !!data?.card?.customerId && data?.card?.cardType === "set_primary_email",
  });

  // Fetch Odoo base URL for external links
  const { data: odooBaseUrl } = useQuery<string>({
    queryKey: ['/api/odoo/base-url'],
    staleTime: 1000 * 60 * 30, // Cache for 30 minutes
  });

  // Helper to open customer in Odoo
  const handleOpenInOdoo = useCallback(() => {
    if (!data?.card?.customer) return;
    
    const customer = data.card.customer;
    
    if (customer.odooPartnerId && odooBaseUrl) {
      window.open(`${odooBaseUrl}/web#id=${customer.odooPartnerId}&model=res.partner&view_type=form`, '_blank');
      return;
    }
    
    toast({ 
      title: "Not linked to Odoo", 
      description: "This customer is not linked to Odoo.",
      variant: "destructive"
    });
  }, [data?.card?.customer, odooBaseUrl, toast]);

  // Build list of available emails for selection
  const availableEmails = useMemo(() => {
    if (!data?.card) return [];
    const emails: { email: string; source: string }[] = [];
    
    // Add existing customer emails
    if (data.card.customer.email) {
      emails.push({ email: data.card.customer.email, source: "Current primary" });
    }
    if (data.card.customer.email2) {
      emails.push({ email: data.card.customer.email2, source: "Secondary" });
    }
    
    // Add emails from contacts
    if (customerContacts) {
      customerContacts.forEach(contact => {
        if (contact.email && !emails.some(e => e.email === contact.email)) {
          emails.push({ 
            email: contact.email, 
            source: `Contact: ${contact.name}${contact.role ? ` (${contact.role})` : ''}`
          });
        }
      });
    }
    
    return emails;
  }, [data?.card, customerContacts]);

  // Show dormancy popup when user has been idle for 3+ hours (disabled in development)
  useEffect(() => {
    if (import.meta.env.DEV) return; // Skip dormancy popup in development mode
    if (dormancyData?.isDormant && !dormancyDismissed && !dormancyData?.isPaused) {
      setShowDormancyPopup(true);
    }
  }, [dormancyData?.isDormant, dormancyDismissed, dormancyData?.isPaused]);

  // Pause session mutation
  const pauseMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/now-mode/pause");
      return res.json();
    },
    onSuccess: () => {
      setShowDormancyPopup(false);
      toast({ title: "Session Paused", description: "Your efficiency is frozen. Resume anytime." });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/dormancy-check"] });
    },
  });

  // Resume session mutation
  const resumeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/now-mode/resume");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Welcome Back!", description: "Let's continue where you left off." });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/dormancy-check"] });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
    },
  });

  // Reset inline edit values when card changes
  useEffect(() => {
    if (data?.card) {
      setInlineEmail("");
      setInlinePricingTier("");
      setInlineSalesRep("");
      setInlineAddress1("");
      setInlineCity("");
      setInlineState("");
      setInlineZip("");
      setNotes("");
    }
  }, [data?.card?.customerId, data?.card?.cardType]);
  
  // Check if the error is a session/auth error (401 only)
  // Only show session expired for actual 401 status - not for other errors that might mention "session"
  // Be very strict about this check to avoid false positives
  const isSessionExpired = isError && error && 
    typeof error === 'object' && 
    'status' in (error as object) &&
    (error as any).status === 401 &&
    !(error as any).isNetworkError;

  // Day recap query - for end-of-day closure (must be after main data query)
  const { data: recapData } = useQuery<{
    isComplete: boolean;
    dayClosed: boolean;
    totalCompleted: number;
    dailyTarget: number;
    efficiencyScore: number;
    callsMade: number;
    followUpsScheduled: number;
    samplesQuotesSent: number;
    dataHygieneCompleted: number;
    outreachCompleted: number;
    enablementSent: number;
    timeSpent: string;
    motivationalMessage: string;
  }>({
    queryKey: ["/api/now-mode/day-recap"],
    enabled: !!data?.allDone, // Only fetch when all tasks are done
  });

  // End day mutation - formal closure
  const endDayMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/now-mode/end-day");
      return res.json();
    },
    onSuccess: (response) => {
      toast({ title: "Day Complete!", description: response.message });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/day-recap"] });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
    },
  });

  const completeMutation = useMutation({
    mutationFn: async ({ customerId, cardType, outcome, notes }: { customerId: string; cardType: string; outcome: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/now-mode/complete", { customerId, cardType, outcome, notes });
      return res.json();
    },
    onMutate: async () => {
      const currentCompleted = data?.completed || 0;
      const currentEfficiency = data?.efficiencyScore || 100;
      setOptimisticCompleted(currentCompleted + 1);
      setOptimisticEfficiency(Math.min(100, currentEfficiency + 3));
      setEfficiencyDelta(3);
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setEfficiencyDelta(null);
      }, 1500);
    },
    onSuccess: (response: any) => {
      setNotes("");
      setOptimisticCompleted(null);
      setOptimisticEfficiency(null);
      const resultMsg = response.nextFollowUpAt ? "Completed! Follow-up scheduled." : "Completed!";
      toast({ title: resultMsg, description: "Moving to next card..." });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/efficiency"] });
      refetch();
    },
    onError: (error) => {
      setOptimisticCompleted(null);
      setOptimisticEfficiency(null);
      setShowSuccessAnimation(false);
      setEfficiencyDelta(null);
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/efficiency"] });
      refetch();
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete card",
        variant: "destructive",
      });
    },
  });

  const skipMutation = useMutation({
    mutationFn: async ({ customerId, cardType, skipReason, notes }: { customerId: string; cardType: string; skipReason: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/now-mode/skip", { customerId, cardType, skipReason, notes });
      return res.json();
    },
    onSuccess: (response: any) => {
      setShowSkipModal(false);
      setShowSkipWarning(false);
      setSkipReason("");
      setSkipNotes("");
      if (response.penaltyApplied) {
        toast({
          title: "Skip Penalty Applied",
          description: "You've skipped 3+ times today. Fewer difficult cards will be shown.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Skipped", description: "Moving to next card..." });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/efficiency"] });
      refetch();
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to skip card",
        variant: "destructive",
      });
    },
  });

  // Mutation to update customer with missing pricing tier / sales rep
  const updateCustomerMutation = useMutation({
    mutationFn: async ({ customerId, pricingTier, salesRepName }: { customerId: string; pricingTier: string; salesRepName: string }) => {
      const res = await apiRequest("PUT", `/api/customers/${customerId}`, { pricingTier, salesRepName });
      const result = await res.json();
      return { ...result, customerId }; // Pass customerId through to onSuccess
    },
    onSuccess: (result) => {
      setShowProfileGateDialog(false);
      toast({ title: "Customer Updated", description: "Navigating to customer profile..." });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
      // Use customerId from mutation result, not from potentially stale data
      setLocation(`/clients/${result.customerId}?from=now-mode`);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Mutation to update customer inline (for data hygiene cards)
  const inlineUpdateMutation = useMutation({
    mutationFn: async ({ customerId, updates }: { customerId: string; updates: Record<string, string> }) => {
      const res = await apiRequest("PUT", `/api/customers/${customerId}`, updates);
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Updated!", description: "Customer data saved successfully." });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Mutation to mark customer as hot prospect
  const markHotMutation = useMutation({
    mutationFn: async ({ customerId, isHot }: { customerId: string; isHot: boolean }) => {
      const res = await apiRequest("PUT", `/api/customers/${customerId}`, { isHotProspect: isHot });
      return res.json();
    },
    onSuccess: (_, variables) => {
      toast({ 
        title: variables.isHot ? "🔥 Marked as Hot!" : "Unmarked", 
        description: variables.isHot ? "This customer is now a hot prospect." : "Removed hot prospect status." 
      });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update customer",
        variant: "destructive",
      });
    },
  });

  // Email completion mutation - completes task but stays on screen with "Next" button
  const emailCompleteMutation = useMutation({
    mutationFn: async ({ customerId, cardType, outcome, notes }: { customerId: string; cardType: string; outcome: string; notes?: string }) => {
      const res = await apiRequest("POST", "/api/now-mode/complete", { customerId, cardType, outcome, notes });
      return res.json();
    },
    onMutate: async () => {
      const currentCompleted = data?.completed || 0;
      const currentEfficiency = data?.efficiencyScore || 100;
      setOptimisticCompleted(currentCompleted + 1);
      setOptimisticEfficiency(Math.min(100, currentEfficiency + 3));
      setEfficiencyDelta(3);
      setShowSuccessAnimation(true);
      setTimeout(() => {
        setShowSuccessAnimation(false);
        setEfficiencyDelta(null);
      }, 1500);
    },
    onSuccess: () => {
      setNotes("");
      setOptimisticCompleted(null);
      setOptimisticEfficiency(null);
      setAwaitingNext(true); // Stay on screen, show Next button
      toast({ title: "Email Sent!", description: "Task completed. Click Next when ready to continue." });
      queryClient.invalidateQueries({ queryKey: ["/api/now-mode/efficiency"] });
      // Don't refetch current card - wait for user to click Next
    },
    onError: (error) => {
      setOptimisticCompleted(null);
      setOptimisticEfficiency(null);
      setShowSuccessAnimation(false);
      setEfficiencyDelta(null);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to complete card",
        variant: "destructive",
      });
    },
  });

  // Handler for when email is sent from composer
  const handleEmailSent = useCallback(() => {
    if (data?.card) {
      emailCompleteMutation.mutate({
        customerId: data.card.customerId,
        cardType: data.card.cardType,
        outcome: "email_sent",
        notes: notes || undefined,
      });
    }
  }, [data?.card, notes, emailCompleteMutation]);

  // Handler to proceed to next card after email completion
  const handleNextCard = useCallback(() => {
    setAwaitingNext(false);
    queryClient.invalidateQueries({ queryKey: ["/api/now-mode/current"] });
    refetch();
  }, [refetch]);

  // Mutation to create swatchbook shipment record
  const createSwatchShipmentMutation = useMutation({
    mutationFn: async ({ customerId, notes }: { customerId: string; notes: string }) => {
      const res = await apiRequest("POST", "/api/crm/swatchbook-shipments", { customerId, notes });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/crm/swatchbook-shipments"] });
    },
  });

  // Mutation to create sample request (for Press Kit)
  const createSampleMutation = useMutation({
    mutationFn: async (data: { customerId: string; productCategory: string; productName: string; quantity: string; notes: string }) => {
      const res = await apiRequest("POST", "/api/sample-requests", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sample-requests"] });
    },
  });

  // Handler for opening print label dialog
  const handleOpenPrintDialog = () => {
    if (!data?.card) return;
    setPrintLabelType(null);
    setPrintLabelNotes('');
    setIsPrintDialogOpen(true);
  };

  // Handler for confirming and printing the label
  const handleConfirmPrintLabel = () => {
    if (!data?.card || !printLabelType) return;
    
    const customer = data.card.customer;
    const companyName = customer.company || customer.name || "Unknown";
    
    // Record the shipment based on type
    if (printLabelType === 'swatchbook') {
      createSwatchShipmentMutation.mutate({ 
        customerId: data.card.customerId, 
        notes: `SwatchBook shipped via NOW MODE` 
      });
    } else if (printLabelType === 'presskit') {
      createSampleMutation.mutate({
        customerId: data.card.customerId,
        productCategory: 'press_kit',
        productName: 'Press Kit',
        quantity: '1',
        notes: `Press Kit shipped via NOW MODE`,
      });
    } else if (printLabelType === 'mailer') {
      createSwatchShipmentMutation.mutate({ 
        customerId: data.card.customerId, 
        notes: `Mailer: ${printLabelNotes || 'Promotional Mailer'}` 
      });
    } else {
      createSwatchShipmentMutation.mutate({ 
        customerId: data.card.customerId, 
        notes: printLabelNotes || 'Other shipment' 
      });
    }

    // Print the label
    printAddressLabel(customer, companyName);
    
    // Close dialog
    setIsPrintDialogOpen(false);
    
    toast({ 
      title: "Label Printed!", 
      description: `${printLabelType === 'swatchbook' ? 'SwatchBook' : printLabelType === 'presskit' ? 'Press Kit' : printLabelType === 'mailer' ? 'Mailer' : 'Shipment'} recorded for ${companyName}` 
    });
  };

  // Utility function to print address label
  const printAddressLabel = (customer: Customer, companyName: string) => {
    const address1 = customer.address1 || "";
    const address2 = customer.address2 || "";
    const city = customer.city || "";
    const state = customer.state || "";
    const zip = customer.zip || "";

    // Create a printable label window
    const printWindow = window.open("", "_blank", "width=400,height=300");
    if (!printWindow) {
      toast({ title: "Error", description: "Please allow popups to print labels", variant: "destructive" });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html>
        <head>
          <title>Address Label</title>
          <style>
            @page { size: 4in 2in; margin: 0.25in; }
            body { 
              font-family: Arial, sans-serif; 
              font-size: 14pt; 
              line-height: 1.4;
              padding: 0.25in;
            }
            .label {
              border: 1px dashed #ccc;
              padding: 0.5in;
              max-width: 3.5in;
            }
            .company { font-weight: bold; font-size: 16pt; }
            @media print {
              body { padding: 0; }
              .label { border: none; }
            }
          </style>
        </head>
        <body>
          <div class="label">
            <div class="company">${companyName}</div>
            <div>${address1}</div>
            ${address2 ? `<div>${address2}</div>` : ""}
            <div>${city}, ${state} ${zip}</div>
          </div>
          <script>
            window.onload = function() {
              window.print();
              setTimeout(function() { window.close(); }, 500);
            };
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  // Track which fields are missing for profile gate dialog
  const [profileGateMissingFields, setProfileGateMissingFields] = useState<{ tier: boolean; rep: boolean }>({ tier: false, rep: false });

  // Handler for View Full Customer Profile button
  const handleViewProfile = () => {
    if (!data?.card) return;
    
    const customer = data.card.customer;
    const missingTier = !customer.pricingTier;
    const missingRep = !customer.salesRepName;
    
    console.log('[NOW MODE] handleViewProfile:', { 
      customerId: data.card.customerId, 
      pricingTier: customer.pricingTier, 
      salesRepName: customer.salesRepName,
      missingTier,
      missingRep
    });
    
    if (missingTier || missingRep) {
      // Track which fields are missing
      setProfileGateMissingFields({ tier: missingTier, rep: missingRep });
      // Pre-fill with existing values if any
      setSelectedPricingTier(customer.pricingTier || "");
      setSelectedSalesRep(customer.salesRepName || "");
      setShowProfileGateDialog(true);
    } else {
      // Navigate directly if both are set
      const targetPath = `/clients/${data.card.customerId}?from=now-mode`;
      console.log('[NOW MODE] Navigating to:', targetPath);
      setLocation(targetPath);
    }
  };

  const handleProfileGateSave = () => {
    if (!data?.card) return;
    
    // Only require fields that were missing
    if (profileGateMissingFields.tier && !selectedPricingTier) {
      toast({
        title: "Missing Field",
        description: "Please select a pricing tier",
        variant: "destructive",
      });
      return;
    }
    if (profileGateMissingFields.rep && !selectedSalesRep) {
      toast({
        title: "Missing Field",
        description: "Please select a sales rep",
        variant: "destructive",
      });
      return;
    }
    
    // Build update payload with only changed/missing fields
    const updates: { pricingTier?: string; salesRepName?: string } = {};
    if (profileGateMissingFields.tier && selectedPricingTier) {
      updates.pricingTier = selectedPricingTier;
    }
    if (profileGateMissingFields.rep && selectedSalesRep) {
      updates.salesRepName = selectedSalesRep;
    }
    
    updateCustomerMutation.mutate({
      customerId: data.card.customerId,
      pricingTier: updates.pricingTier || data.card.customer.pricingTier || "",
      salesRepName: updates.salesRepName || data.card.customer.salesRepName || "",
    });
  };

  const handleOutcome = async (outcome: string) => {
    if (!data?.card) return;

    // For data hygiene cards, save inline edits first when "Updated" is clicked
    if (data.card.bucket === "data_hygiene" && outcome === "data_updated") {
      const updates: Record<string, string> = {};
      
      if (data.card.cardType === "set_pricing_tier" && inlinePricingTier) {
        updates.pricingTier = inlinePricingTier;
      }
      if (data.card.cardType === "set_sales_rep" && inlineSalesRep) {
        updates.salesRepName = inlineSalesRep;
      }
      if (data.card.cardType === "set_primary_email" && inlineEmail) {
        updates.email = inlineEmail;
      }
      
      // Require all address fields for mailing address card
      if (data.card.cardType === "set_mailing_address") {
        if (!inlineAddress1 || !inlineCity || !inlineState || !inlineZip) {
          toast({
            title: "Missing Address Fields",
            description: "Please fill in street address, city, state, and ZIP code",
            variant: "destructive",
          });
          return;
        }
        updates.address1 = inlineAddress1;
        updates.city = inlineCity;
        updates.state = inlineState;
        updates.zip = inlineZip;
      }

      // If user has entered inline values, save them first
      if (Object.keys(updates).length > 0) {
        try {
          await inlineUpdateMutation.mutateAsync({ 
            customerId: data.card.customerId, 
            updates 
          });
        } catch {
          return; // Don't proceed if inline update failed
        }
      }
    }

    completeMutation.mutate({
      customerId: data.card.customerId,
      cardType: data.card.cardType,
      outcome,
      notes: notes || undefined,
    });
  };

  const handleSkipClick = () => {
    setShowSkipWarning(true);
  };

  const handleSkipWarningConfirm = () => {
    setShowSkipWarning(false);
    setShowSkipModal(true);
  };

  const handleSkipConfirm = () => {
    if (!data?.card || !skipReason) return;
    skipMutation.mutate({
      customerId: data.card.customerId,
      cardType: data.card.cardType,
      skipReason,
      notes: skipNotes || undefined,
    });
  };

  const displayCompleted = optimisticCompleted ?? (data?.completed || 0);
  const displayEfficiency = optimisticEfficiency ?? (data?.efficiencyScore || 0);
  const progress = data ? (displayCompleted / data.dailyTarget) * 100 : 0;
  const efficiencyColor = displayEfficiency >= 80 ? "#28A745" : 
                          displayEfficiency >= 50 ? "#FD7E14" : 
                          displayEfficiency >= 20 ? "#FD7E14" : "#DC3545";
  const trendIcon = rollingData?.trend === "improving" ? TrendingUp : 
                    rollingData?.trend === "declining" ? TrendingDown : Minus;

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading NOW MODE...</p>
        </div>
      </div>
    );
  }

  // Session expired banner
  if (isSessionExpired) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 bg-amber-100 rounded-full w-fit">
              <AlertTriangle className="h-8 w-8 text-amber-600" />
            </div>
            <CardTitle className="text-xl text-gray-800">Session Expired</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4 text-center">
            <p className="text-gray-600">
              Your session has expired. Please log in again to continue using NOW MODE.
            </p>
            <div className="flex flex-col gap-2">
              <Button asChild className="w-full bg-purple-600 hover:bg-purple-700">
                <a href="/api/login">Log In Again</a>
              </Button>
              <Link href="/">
                <Button variant="outline" className="w-full">
                  <ArrowLeft className="h-4 w-4 mr-2" />
                  Back to Dashboard
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Script copy helper
  const copyScript = (text: string, title: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: "Copied!", description: `${title} copied to clipboard` });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
      <div className="flex gap-4 max-w-6xl mx-auto">
        {/* Scripts Tray - Left Sidebar (Collapsible) */}
        <div className="flex-shrink-0 relative">
          {/* Collapsed toggle button - always visible */}
          {!scriptsTrayOpen && (
            <div className="sticky top-4">
              <button
                onClick={() => setScriptsTrayOpen(true)}
                className="flex items-center justify-center w-10 h-10 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg transition-all duration-200 hover:scale-105"
                title="Open Scripts & Tips"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}
          
          {/* Expanded tray with slide animation */}
          <div 
            className={`transition-all duration-300 ease-in-out ${scriptsTrayOpen ? 'w-80 opacity-100 translate-x-0' : 'w-0 opacity-0 -translate-x-full absolute'}`}
            style={{ overflow: scriptsTrayOpen ? 'visible' : 'hidden' }}
          >
            <div className="sticky top-4">
              <div className="bg-white rounded-lg shadow-lg border overflow-hidden w-80">
                {/* Toggle Button */}
                <button
                  onClick={() => setScriptsTrayOpen(false)}
                  className="w-full flex items-center gap-2 p-3 bg-purple-100 hover:bg-purple-200 transition-colors"
                >
                  <ChevronLeft className="h-4 w-4 text-purple-700" />
                  <ScrollText className="h-4 w-4 text-purple-700" />
                  <span className="text-sm font-medium text-purple-700">Scripts & Tips</span>
                </button>

                {scriptsTrayOpen && (
                <div className="p-3 space-y-4 max-h-[calc(100vh-120px)] overflow-y-auto">
                  {/* Quick Tips */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Quick Tips</h4>
                    <div className="space-y-1">
                      {QUICK_TIPS.map((tip, i) => (
                        <div key={i} className="text-xs text-gray-600 p-2 bg-yellow-50 rounded border-l-2 border-yellow-400">
                          {tip}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Call Scripts */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Call Scripts
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(CALL_SCRIPTS).map(([key, { title, script }]) => (
                        <div key={key} className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => copyScript(script, title)}
                            className="w-full flex items-center justify-between p-2 bg-green-50 hover:bg-green-100 transition-colors text-left"
                          >
                            <span className="text-sm font-medium text-green-800">{title}</span>
                            <Copy className="h-3 w-3 text-green-600" />
                          </button>
                          <div className="p-2 text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50">
                            {script}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Email Scripts */}
                  <div>
                    <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2 flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email Templates
                    </h4>
                    <div className="space-y-2">
                      {Object.entries(EMAIL_SCRIPTS).map(([key, { title, script }]) => (
                        <div key={key} className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => copyScript(script, title)}
                            className="w-full flex items-center justify-between p-2 bg-blue-50 hover:bg-blue-100 transition-colors text-left"
                          >
                            <span className="text-sm font-medium text-blue-800">{title}</span>
                            <Copy className="h-3 w-3 text-blue-600" />
                          </button>
                          <div className="p-2 text-xs text-gray-600 whitespace-pre-wrap max-h-32 overflow-y-auto bg-gray-50">
                            {script}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Content */}
        <div className="flex-1 max-w-2xl">
          <div className="flex items-center justify-between mb-6">
            <Link href="/">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                Back
              </Button>
            </Link>
            <div className="flex items-center gap-4">
              <div className={`flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm transition-all duration-300 ${showSuccessAnimation ? 'ring-2 ring-green-400 scale-105' : ''}`}>
                <Gauge className={`h-4 w-4 transition-transform duration-300 ${showSuccessAnimation ? 'scale-125' : ''}`} style={{ color: efficiencyColor }} />
                <span className="font-semibold" style={{ color: efficiencyColor }}>
                  {displayEfficiency}
                </span>
                {efficiencyDelta !== null && (
                  <span className="text-xs font-bold text-green-500 animate-pulse">+{efficiencyDelta}</span>
                )}
                <span className="text-xs text-gray-500">Efficiency</span>
              </div>
              <div className={`flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg shadow-sm transition-all duration-300 ${showSuccessAnimation ? 'ring-2 ring-purple-400 scale-105' : ''}`}>
                <Trophy className={`h-4 w-4 text-purple-600 transition-transform duration-300 ${showSuccessAnimation ? 'scale-125' : ''}`} />
                <span className="font-semibold text-purple-600">
                  {displayCompleted}/{data?.dailyTarget || 10}
                </span>
                <span className="text-xs text-gray-500">Today</span>
              </div>
            </div>
          </div>

          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-600">Daily Progress</span>
              <span className="text-sm text-gray-500">
                {displayCompleted} done • {Math.max(0, (data?.dailyTarget || 10) - displayCompleted)} to go • ~{(() => {
                  const remaining = (data?.bucketProgress || []).reduce((total, bp) => {
                    const timePerTask = BUCKET_TIME_ESTIMATES[bp.bucket] || 2;
                    return total + (bp.remaining * timePerTask);
                  }, 0);
                  return remaining;
                })()} mins left
              </span>
            </div>
            <div className={`transition-all duration-500 ${showSuccessAnimation ? 'scale-[1.02]' : ''}`}>
              <Progress value={progress} className={`h-3 transition-all duration-500 ${showSuccessAnimation ? 'ring-2 ring-green-400' : ''}`} />
            </div>
          </div>

          {/* Rolling 7-Day Efficiency with Social Proof */}
          {rollingData && (
            <div className="mb-4 p-3 bg-white border rounded-lg shadow-sm">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-center">
                    <div className="text-xl font-bold" style={{ color: rollingData.rolling7DayScore >= 70 ? "#28A745" : rollingData.rolling7DayScore >= 40 ? "#FD7E14" : "#6B7280" }}>
                      {rollingData.rolling7DayScore}
                    </div>
                    <div className="text-xs text-gray-500">7-Day Score</div>
                  </div>
                  <div className="flex items-center gap-1 text-sm text-gray-600">
                    {trendIcon && (() => {
                      const TrendIconComponent = trendIcon;
                      const trendColor = rollingData.trend === "improving" ? "#28A745" : rollingData.trend === "declining" ? "#DC3545" : "#6B7280";
                      return <TrendIconComponent className="h-4 w-4" style={{ color: trendColor }} />;
                    })()}
                    <span>{rollingData.trendMessage}</span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-sm font-medium text-purple-700">{rollingData.socialProof}</div>
                  <div className="text-xs text-gray-500">Top {100 - rollingData.percentile}% this week</div>
                </div>
              </div>
            </div>
          )}

          {data?.skipPenaltyApplied && (
            <div className="mb-4 p-3 bg-orange-50 border border-orange-200 rounded-lg flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-orange-500" />
              <span className="text-sm text-orange-700">
                Skip penalty active ({data?.totalSkips || 0} skips today). Fewer difficult cards shown.
              </span>
            </div>
          )}

          <div className="grid grid-cols-5 gap-2 mb-6">
            {data?.bucketProgress?.map((bp) => {
              const bucketInfo = BUCKET_LABELS[bp.bucket] || { label: bp.bucket, color: "#6B7280" };
              const isComplete = bp.completed >= bp.quota;
              return (
                <div
                  key={bp.bucket}
                  className={`p-2 rounded-lg text-center ${isComplete ? "bg-green-100 border-green-300" : "bg-white"} border`}
                >
                  <div className="text-xs font-medium" style={{ color: bucketInfo.color }}>
                    {bucketInfo.label}
                  </div>
                  <div className="text-lg font-bold" style={{ color: isComplete ? "#28A745" : bucketInfo.color }}>
                    {bp.completed}/{bp.quota}
                  </div>
                </div>
              );
            })}
          </div>

          {data?.allDone || !data?.card ? (
          data?.allDone ? (
            // End-of-Day Closure Recap Card
            <Card className="shadow-xl border-2 border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
              <CardHeader className="text-center pb-2">
                <div className="mx-auto w-24 h-24 rounded-full bg-green-100 flex items-center justify-center mb-4 animate-pulse">
                  <Trophy className="h-12 w-12 text-green-600" />
                </div>
                <CardTitle className="text-2xl text-green-800">
                  {recapData?.dayClosed ? "Day Complete!" : "All Done for Today!"}
                </CardTitle>
                <p className="text-green-600 font-medium mt-2">
                  {recapData?.motivationalMessage || "Great work completing your tasks!"}
                </p>
              </CardHeader>
              <CardContent className="space-y-6">
                {/* Recap Stats Grid */}
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white rounded-lg p-4 text-center shadow-sm border">
                    <Phone className="h-6 w-6 mx-auto text-blue-600 mb-2" />
                    <div className="text-2xl font-bold text-gray-800">{recapData?.callsMade || 0}</div>
                    <div className="text-sm text-gray-500">Calls Made</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 text-center shadow-sm border">
                    <Calendar className="h-6 w-6 mx-auto text-purple-600 mb-2" />
                    <div className="text-2xl font-bold text-gray-800">{recapData?.followUpsScheduled || 0}</div>
                    <div className="text-sm text-gray-500">Follow-ups Scheduled</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 text-center shadow-sm border">
                    <Send className="h-6 w-6 mx-auto text-orange-600 mb-2" />
                    <div className="text-2xl font-bold text-gray-800">{recapData?.samplesQuotesSent || 0}</div>
                    <div className="text-sm text-gray-500">Samples/Quotes Sent</div>
                  </div>
                  <div className="bg-white rounded-lg p-4 text-center shadow-sm border">
                    <Gauge className="h-6 w-6 mx-auto text-green-600 mb-2" />
                    <div className="text-2xl font-bold text-gray-800">{recapData?.efficiencyScore || 0}</div>
                    <div className="text-sm text-gray-500">Efficiency Score</div>
                  </div>
                </div>

                {/* Additional Stats */}
                <div className="bg-white rounded-lg p-4 shadow-sm border">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-gray-600">Total Completed</span>
                    <span className="font-semibold">{recapData?.totalCompleted || 0}/{recapData?.dailyTarget || 10}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-600">Time Active</span>
                    <span className="font-semibold">{recapData?.timeSpent || "0 min"}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-600">Outreach</span>
                    <span className="font-semibold">{recapData?.outreachCompleted || 0}</span>
                  </div>
                  <div className="flex items-center justify-between text-sm mt-2">
                    <span className="text-gray-600">Data Hygiene</span>
                    <span className="font-semibold">{recapData?.dataHygieneCompleted || 0}</span>
                  </div>
                </div>

                {/* End Day Button */}
                {!recapData?.dayClosed ? (
                  <Button
                    onClick={() => endDayMutation.mutate()}
                    disabled={endDayMutation.isPending}
                    className="w-full bg-green-600 hover:bg-green-700 text-lg py-6"
                  >
                    <CheckCircle2 className="h-5 w-5 mr-2" />
                    {endDayMutation.isPending ? "Ending Day..." : "End Day"}
                  </Button>
                ) : (
                  <div className="text-center space-y-4">
                    <div className="p-4 bg-green-100 rounded-lg">
                      <p className="text-green-800 font-medium">Day officially closed. Rest up!</p>
                    </div>
                    <Link href="/">
                      <Button className="bg-purple-600 hover:bg-purple-700">
                        Return to Dashboard
                      </Button>
                    </Link>
                  </div>
                )}
              </CardContent>
            </Card>
          ) : (
            // No cards available
            <Card className="text-center py-12">
              <CardContent>
                <div className="flex flex-col items-center gap-4">
                  <div className="w-20 h-20 rounded-full bg-gray-100 flex items-center justify-center">
                    <Target className="h-10 w-10 text-gray-400" />
                  </div>
                  <h2 className="text-2xl font-bold text-gray-800">No Cards Available</h2>
                  <p className="text-gray-600 max-w-md">
                    {data?.message || "Check back later for more tasks."}
                  </p>
                  <Link href="/">
                    <Button className="mt-4 bg-purple-600 hover:bg-purple-700">
                      Return to Dashboard
                    </Button>
                  </Link>
                </div>
              </CardContent>
            </Card>
          )
        ) : (
          <Card className="shadow-lg">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <Badge 
                  variant="secondary"
                  style={{ 
                    backgroundColor: BUCKET_LABELS[data.card.bucket]?.color + "20",
                    color: BUCKET_LABELS[data.card.bucket]?.color,
                  }}
                >
                  {BUCKET_LABELS[data.card.bucket]?.label || data.card.bucket}
                </Badge>
                {data.card.isHardCard && (
                  <Badge variant="outline" className="text-orange-600 border-orange-300">
                    <Zap className="h-3 w-3 mr-1" />
                    High Value
                  </Badge>
                )}
              </div>
              <CardTitle className="flex items-center gap-2 mt-2">
                {(() => {
                  const cardInfo = CARD_TYPE_LABELS[data.card.cardType];
                  const Icon = cardInfo?.Icon || Target;
                  return (
                    <>
                      <Icon className="h-5 w-5 text-purple-600" />
                      <span>{cardInfo?.label || data.card.cardType}</span>
                    </>
                  );
                })()}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex gap-3">
                <div className="flex-1 p-4 bg-gray-50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <Building2 className="h-5 w-5 text-gray-400 mt-0.5" />
                    <div className="flex-1">
                      <h3 className="font-semibold text-gray-900">
                        {data.card.customer.company || data.card.customer.name || "Unknown"}
                      </h3>
                      <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1 text-sm text-gray-500">
                        {data.card.customer.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="h-3 w-3" />
                            {data.card.customer.email}
                          </span>
                        )}
                        {data.card.customer.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3 w-3" />
                            {data.card.customer.phone}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 mt-2">
                        {data.card.customer.pricingTier && (
                          <Badge variant="outline" className="text-xs">
                            {data.card.customer.pricingTier}
                          </Badge>
                        )}
                        {data.card.customer.salesRepName && (
                          <Badge variant="outline" className="text-xs">
                            Rep: {data.card.customer.salesRepName}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* View Quote button for follow_up_quote cards */}
                {data.card.cardType === "follow_up_quote" && (
                  <Link href={`/clients/${data.card.customerId}?tab=quotes`}>
                    <Button
                      variant="outline"
                      className="h-full px-4 border-purple-300 text-purple-700 hover:bg-purple-50 flex flex-col items-center justify-center gap-1"
                    >
                      <FileText className="h-5 w-5" />
                      <span className="text-xs">View</span>
                      <span className="text-xs">Quote</span>
                    </Button>
                  </Link>
                )}
              </div>

              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <p className="text-sm text-purple-800">
                  <span className="font-medium">Why now: </span>
                  {data.card.whyNow}
                </p>
              </div>

              {/* FOCUS MODE: Phone Action Panel for call tasks */}
              {data.card.bucket === "calls" && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-3">
                    <Phone className="h-4 w-4" />
                    Call This Customer
                  </div>
                  {data.card.customer.phone ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white rounded-lg p-3 border">
                        <span className="text-2xl font-bold text-gray-900 tracking-wide">
                          {data.card.customer.phone}
                        </span>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => {
                              navigator.clipboard.writeText(data.card!.customer.phone || "");
                              toast({ title: "Copied!", description: "Phone number copied to clipboard" });
                            }}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          <Button
                            size="sm"
                            className="bg-green-600 hover:bg-green-700"
                            onClick={() => {
                              window.location.href = `tel:${data.card!.customer.phone}`;
                            }}
                          >
                            <Phone className="h-4 w-4 mr-1" />
                            Dial
                          </Button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No phone number on file - mark as "No Answer" and add phone via customer profile
                    </div>
                  )}
                </div>
              )}

              {/* FOCUS MODE: Phone Action Panel for follow-up tasks */}
              {data.card.bucket === "follow_ups" && (
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 text-green-700 font-medium text-sm mb-3">
                    <Phone className="h-4 w-4" />
                    Call to Follow Up
                  </div>
                  {data.card.customer.phone ? (
                    <div className="flex items-center justify-between bg-white rounded-lg p-3 border">
                      <span className="text-2xl font-bold text-gray-900 tracking-wide">
                        {data.card.customer.phone}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            navigator.clipboard.writeText(data.card!.customer.phone || "");
                            toast({ title: "Copied!", description: "Phone number copied to clipboard" });
                          }}
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          className="bg-green-600 hover:bg-green-700"
                          onClick={() => {
                            window.location.href = `tel:${data.card!.customer.phone}`;
                          }}
                        >
                          <Phone className="h-4 w-4 mr-1" />
                          Dial
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No phone number on file - use email or add phone via customer profile
                    </div>
                  )}
                </div>
              )}

              {/* FOCUS MODE: Email Action Panel for email tasks */}
              {(data.card.cardType === "send_marketing_email" || 
                data.card.cardType === "send_price_list" ||
                data.card.cardType === "follow_up_quote" ||
                data.card.cardType === "follow_up_sample" ||
                data.card.cardType === "follow_up_materials") && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-sm mb-3">
                    <Mail className="h-4 w-4" />
                    Email This Customer
                  </div>
                  {data.card.customer.email ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between bg-white rounded-lg p-3 border">
                        <span className="text-lg text-gray-900">
                          {data.card.customer.email}
                        </span>
                        <Button
                          className="bg-blue-600 hover:bg-blue-700"
                          onClick={() => {
                            const cardType = data.card!.cardType;
                            let emailUsageType = "client_email";
                            if (cardType === "send_marketing_email") emailUsageType = "marketing";
                            else if (cardType === "send_price_list") emailUsageType = "price_list";
                            
                            openEmailComposer({
                              to: data.card!.customer.email || "",
                              customerId: data.card!.customerId,
                              customerName: data.card!.customer.company || data.card!.customer.name || "",
                              usageType: emailUsageType,
                              variables: {
                                'client.name': data.card!.customer.company || data.card!.customer.name || '',
                                'client.email': data.card!.customer.email || '',
                              },
                              onSent: handleEmailSent,
                            });
                          }}
                        >
                          <Mail className="h-4 w-4 mr-2" />
                          Compose Email
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500 italic">
                      No email address on file - skip this card and add email via customer profile
                    </div>
                  )}
                </div>
              )}

              {/* Inline editing for data hygiene cards */}
              {data.card.bucket === "data_hygiene" && (
                <div className="p-4 bg-blue-50 rounded-lg border border-blue-200 space-y-3">
                  <div className="flex items-center gap-2 text-blue-700 font-medium text-sm">
                    <Target className="h-4 w-4" />
                    Quick Fix - Update Now
                  </div>
                  
                  {data.card.cardType === "set_pricing_tier" && (
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-700">Select Pricing Tier</Label>
                      <Select value={inlinePricingTier} onValueChange={setInlinePricingTier}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder="Choose a tier..." />
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

                  {data.card.cardType === "set_sales_rep" && (
                    <div className="space-y-2">
                      <Label className="text-sm text-gray-700">Select Sales Rep</Label>
                      <Select value={inlineSalesRep} onValueChange={setInlineSalesRep}>
                        <SelectTrigger className="bg-white">
                          <SelectValue placeholder={usersLoading ? "Loading..." : "Choose a sales rep..."} />
                        </SelectTrigger>
                        <SelectContent>
                          {usersLoading ? (
                            <div className="px-2 py-1 text-sm text-gray-500">Loading sales reps...</div>
                          ) : sortedUsers.length === 0 ? (
                            <div className="px-2 py-1 text-sm text-gray-500">No sales reps available</div>
                          ) : (
                            sortedUsers.map((user) => (
                              <SelectItem key={user.id} value={getSalesRepDisplayName(user.email)}>
                                {getSalesRepDisplayName(user.email)}
                              </SelectItem>
                            ))
                          )}
                        </SelectContent>
                      </Select>
                    </div>
                  )}

                  {data.card.cardType === "set_primary_email" && (
                    <div className="space-y-3">
                      {availableEmails.length > 0 ? (
                        <>
                          <div className="space-y-2">
                            <Label className="text-sm text-gray-700">Select Primary Email</Label>
                            <Select value={inlineEmail} onValueChange={setInlineEmail}>
                              <SelectTrigger className="bg-white">
                                <SelectValue placeholder="Choose an email..." />
                              </SelectTrigger>
                              <SelectContent>
                                {availableEmails.map((emailOption, idx) => (
                                  <SelectItem key={idx} value={emailOption.email}>
                                    <div className="flex flex-col">
                                      <span>{emailOption.email}</span>
                                      <span className="text-xs text-gray-500">{emailOption.source}</span>
                                    </div>
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div className="text-xs text-gray-500">
                            Or enter a new email below:
                          </div>
                        </>
                      ) : (
                        <Label className="text-sm text-gray-700">Enter Email Address</Label>
                      )}
                      <input
                        type="email"
                        value={availableEmails.some(e => e.email === inlineEmail) ? "" : inlineEmail}
                        onChange={(e) => setInlineEmail(e.target.value)}
                        placeholder={availableEmails.length > 0 ? "Or enter new email..." : "customer@example.com"}
                        className="w-full px-3 py-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      />
                    </div>
                  )}

                  {data.card.cardType === "set_mailing_address" && (
                    <div className="space-y-3">
                      <div>
                        <Label className="text-sm text-gray-700">Street Address</Label>
                        <input
                          type="text"
                          value={inlineAddress1}
                          onChange={(e) => setInlineAddress1(e.target.value)}
                          placeholder="123 Main Street"
                          className="w-full px-3 py-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div className="col-span-1">
                          <Label className="text-sm text-gray-700">City</Label>
                          <input
                            type="text"
                            value={inlineCity}
                            onChange={(e) => setInlineCity(e.target.value)}
                            placeholder="City"
                            className="w-full px-3 py-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <Label className="text-sm text-gray-700">State</Label>
                          <input
                            type="text"
                            value={inlineState}
                            onChange={(e) => setInlineState(e.target.value.toUpperCase().slice(0, 2))}
                            placeholder="CA"
                            maxLength={2}
                            className="w-full px-3 py-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                        <div>
                          <Label className="text-sm text-gray-700">ZIP</Label>
                          <input
                            type="text"
                            value={inlineZip}
                            onChange={(e) => setInlineZip(e.target.value)}
                            placeholder="90210"
                            className="w-full px-3 py-2 border rounded-md bg-white focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {data.card.cardType === "set_machine_profile" && (
                    <div className="text-sm text-gray-600">
                      <p>Click "View Full Customer Profile" below to add machine details.</p>
                    </div>
                  )}
                </div>
              )}

              <div>
                <Textarea
                  placeholder="Add notes (optional)..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="min-h-[60px]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {data.card.outcomeButtons.map((btn) => {
                  const Icon = OUTCOME_ICONS[btn.icon] || Check;
                  const bgColor = btn.color === "green" ? "bg-green-600 hover:bg-green-700" :
                                  btn.color === "blue" ? "bg-blue-600 hover:bg-blue-700" :
                                  btn.color === "yellow" ? "bg-yellow-600 hover:bg-yellow-700" :
                                  btn.color === "orange" ? "bg-orange-600 hover:bg-orange-700" :
                                  btn.color === "red" ? "bg-red-600 hover:bg-red-700" :
                                  "bg-gray-600 hover:bg-gray-700";
                  return (
                    <div key={btn.outcome} className="flex flex-col">
                      <Button
                        onClick={() => handleOutcome(btn.outcome)}
                        disabled={completeMutation.isPending}
                        className={`${bgColor} text-white gap-2 py-6 w-full`}
                      >
                        <Icon className="h-4 w-4" />
                        <span className="text-sm">{btn.label}</span>
                        {btn.schedulesFollowUp && (
                          <Clock className="h-3 w-3 opacity-70" />
                        )}
                      </Button>
                      {btn.assistText && (
                        <p className="text-xs text-gray-500 italic mt-1 text-center px-1">
                          {btn.assistText}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Awaiting Next state - show after email sent */}
              {awaitingNext ? (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                    <div className="flex items-center gap-2 text-green-700 font-medium">
                      <CheckCircle2 className="h-5 w-5" />
                      Task Completed!
                    </div>
                    <p className="text-sm text-green-600 mt-1">
                      Email sent successfully. You can view the customer profile or click Next to continue.
                    </p>
                  </div>
                  <Button
                    onClick={handleNextCard}
                    className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3"
                    size="lg"
                  >
                    <ArrowRight className="h-5 w-5 mr-2" />
                    Next Customer
                  </Button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <Button
                    variant={data.card.customer.isHotProspect ? "default" : "outline"}
                    onClick={() => markHotMutation.mutate({ 
                      customerId: data.card!.customerId, 
                      isHot: !data.card!.customer.isHotProspect 
                    })}
                    disabled={markHotMutation.isPending}
                    className={data.card.customer.isHotProspect 
                      ? "flex-1 bg-orange-500 hover:bg-orange-600 text-white" 
                      : "flex-1 text-orange-500 border-orange-300 hover:bg-orange-50"
                    }
                  >
                    <Flame className="h-4 w-4 mr-2" />
                    {data.card.customer.isHotProspect ? "HOT 🔥" : "Mark as Hot"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={handleSkipClick}
                    disabled={skipMutation.isPending}
                    className="flex-1 text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                  >
                    <SkipForward className="h-4 w-4 mr-2" />
                    Skip
                  </Button>
                </div>
              )}

              <div className="flex justify-between items-center">
                <Button 
                  variant="link" 
                  className="text-purple-600"
                  onClick={handleViewProfile}
                >
                  View Full Customer Profile
                </Button>
                {data.card.customer.odooPartnerId && (
                  <Button 
                    variant="outline"
                    size="sm"
                    className="text-gray-600 border-gray-300 hover:bg-gray-50"
                    onClick={handleOpenInOdoo}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open in Odoo
                  </Button>
                )}
                {data.card.cardType === "send_swatchbook" && data.card.customer.address1 && (
                  <Button 
                    variant="outline"
                    size="sm"
                    className="text-blue-600 border-blue-300 hover:bg-blue-50"
                    onClick={handleOpenPrintDialog}
                  >
                    <Printer className="h-4 w-4 mr-2" />
                    Print Address Label
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>
        )}
        </div>

      {/* Profile Gate Dialog - collect ONLY missing pricing tier / sales rep before navigation */}
      <Dialog open={showProfileGateDialog} onOpenChange={setShowProfileGateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <User className="h-5 w-5" />
              Complete Customer Setup
            </DialogTitle>
            <DialogDescription>
              {profileGateMissingFields.tier && profileGateMissingFields.rep
                ? "Please assign a pricing tier and sales rep before viewing this customer's full profile."
                : profileGateMissingFields.tier
                  ? "Please assign a pricing tier before viewing this customer's full profile."
                  : "Please assign a sales rep before viewing this customer's full profile."
              }
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {profileGateMissingFields.tier && (
              <div className="space-y-2">
                <Label htmlFor="pricing-tier">Pricing Tier</Label>
                <Select value={selectedPricingTier} onValueChange={setSelectedPricingTier}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select pricing tier" />
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
            {profileGateMissingFields.rep && (
              <div className="space-y-2">
                <Label htmlFor="sales-rep">Sales Rep</Label>
                <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                  <SelectTrigger>
                    <SelectValue placeholder={usersLoading ? "Loading..." : "Select sales rep"} />
                  </SelectTrigger>
                  <SelectContent>
                    {usersLoading ? (
                      <div className="px-2 py-1 text-sm text-gray-500">Loading sales reps...</div>
                    ) : sortedUsers.length === 0 ? (
                      <div className="px-2 py-1 text-sm text-gray-500">No sales reps available</div>
                    ) : (
                      sortedUsers.map((user) => (
                        <SelectItem key={user.id} value={getSalesRepDisplayName(user.email)}>
                          {getSalesRepDisplayName(user.email)}
                        </SelectItem>
                      ))
                    )}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileGateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleProfileGateSave}
              disabled={updateCustomerMutation.isPending || 
                (profileGateMissingFields.tier && !selectedPricingTier) || 
                (profileGateMissingFields.rep && !selectedSalesRep)}
            >
              {updateCustomerMutation.isPending ? "Saving..." : "Save & View Profile"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Print Address Label Dialog */}
      <Dialog open={isPrintDialogOpen} onOpenChange={setIsPrintDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Print Address Label</DialogTitle>
            <DialogDescription>
              Label for: {data?.card?.customer.company || data?.card?.customer.name || 'Customer'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-4">
            <Button
              variant={printLabelType === 'swatchbook' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              onClick={() => setPrintLabelType('swatchbook')}
            >
              <Palette className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">SwatchBook</div>
                <div className="text-xs text-muted-foreground">Record shipment in customer's SwatchBook tab</div>
              </div>
            </Button>
            <Button
              variant={printLabelType === 'presskit' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              onClick={() => setPrintLabelType('presskit')}
            >
              <Package className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Press Kit</div>
                <div className="text-xs text-muted-foreground">Record shipment in customer's Press Kit tab</div>
              </div>
            </Button>
            <Button
              variant={printLabelType === 'mailer' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              onClick={() => setPrintLabelType('mailer')}
            >
              <Mail className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Mailer</div>
                <div className="text-xs text-muted-foreground">Promotional mailer or flyer</div>
              </div>
            </Button>
            <Button
              variant={printLabelType === 'other' ? 'default' : 'outline'}
              className="w-full justify-start h-auto py-3"
              onClick={() => setPrintLabelType('other')}
            >
              <FileText className="h-5 w-5 mr-3" />
              <div className="text-left">
                <div className="font-medium">Something Else</div>
                <div className="text-xs text-muted-foreground">Just print the label without recording</div>
              </div>
            </Button>
            
            {printLabelType === 'mailer' && (
              <div className="space-y-2 pt-2">
                <Label>Which mailer are you sending?</Label>
                <Input
                  placeholder="e.g., Spring 2025 Promo, New Product Announcement"
                  value={printLabelNotes}
                  onChange={(e) => setPrintLabelNotes(e.target.value)}
                />
              </div>
            )}
            
            {printLabelType === 'other' && (
              <div className="space-y-2 pt-2">
                <Label>Notes (optional)</Label>
                <Textarea
                  placeholder="What are you sending?"
                  value={printLabelNotes}
                  onChange={(e) => setPrintLabelNotes(e.target.value)}
                  rows={2}
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPrintDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmPrintLabel}
              disabled={!printLabelType || createSwatchShipmentMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Printer className="h-4 w-4 mr-2" />
              Print Label
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {showSuccessAnimation && (
        <div className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none">
          <div className="relative">
            <div className="absolute inset-0 bg-green-400 rounded-full animate-ping opacity-30" style={{ width: 120, height: 120 }} />
            <div className="w-24 h-24 bg-green-500 rounded-full flex items-center justify-center shadow-lg animate-bounce">
              <CheckCircle2 className="h-12 w-12 text-white" />
            </div>
          </div>
        </div>
      )}

      {/* Dormancy Popup - empathetic, not naggy */}
      <Dialog open={showDormancyPopup} onOpenChange={setShowDormancyPopup}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <Coffee className="h-5 w-5" />
              Taking a Break?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="pt-4 space-y-3">
                <p className="text-base text-gray-700">
                  {dormancyData?.coachingMessage || "Ready to continue?"}
                </p>
                {dormancyData?.aheadOfYesterday && (
                  <p className="text-sm text-green-600 flex items-center gap-1">
                    <TrendingUp className="h-4 w-4" />
                    You're ahead of yesterday's pace!
                  </p>
                )}
                <div className="flex items-center gap-4 pt-2">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-purple-600">{dormancyData?.todayCompleted || 0}</div>
                    <div className="text-xs text-gray-500">Done today</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-gray-400">{dormancyData?.yesterdayCompleted || 0}</div>
                    <div className="text-xs text-gray-500">Yesterday</div>
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{dormancyData?.efficiencyScore || 0}</div>
                    <div className="text-xs text-gray-500">Efficiency</div>
                  </div>
                </div>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button 
              onClick={() => {
                setShowDormancyPopup(false);
                setDormancyDismissed(true);
              }}
              className="w-full bg-purple-600 hover:bg-purple-700"
            >
              <Play className="h-4 w-4 mr-2" />
              Give me 2 easy tasks
            </Button>
            <Button 
              variant="outline"
              onClick={() => pauseMutation.mutate()}
              disabled={pauseMutation.isPending}
              className="w-full"
            >
              <Coffee className="h-4 w-4 mr-2" />
              Pause for today
            </Button>
            <span className="text-xs text-gray-400 text-center pt-1 block">
              Pausing freezes your efficiency — no penalty for taking a break.
            </span>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Paused state banner */}
      {dormancyData?.isPaused && (
        <div className="fixed bottom-4 right-4 z-40 bg-amber-50 border border-amber-200 rounded-lg p-4 shadow-lg max-w-sm">
          <div className="flex items-center gap-3">
            <Coffee className="h-8 w-8 text-amber-600" />
            <div>
              <p className="font-medium text-amber-800">Session Paused</p>
              <p className="text-sm text-amber-600">Efficiency frozen at {dormancyData.efficiencyScore}</p>
            </div>
            <Button
              size="sm"
              onClick={() => resumeMutation.mutate()}
              disabled={resumeMutation.isPending}
              className="bg-amber-600 hover:bg-amber-700"
            >
              Resume
            </Button>
          </div>
        </div>
      )}

      <Dialog open={showSkipWarning} onOpenChange={setShowSkipWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Are you sure?
            </DialogTitle>
            <DialogDescription asChild>
              <div className="pt-2">
                <span className="text-lg font-semibold text-gray-900">
                  Skipping reduces today's efficiency by 2 points.
                </span>
                <br />
                <span className="text-sm text-gray-500 mt-2 block">
                  Current efficiency: <span className="font-bold">{displayEfficiency}</span> → 
                  After skip: <span className="font-bold text-orange-600">{Math.max(0, displayEfficiency - 2)}</span>
                </span>
              </div>
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button 
              onClick={handleSkipWarningConfirm}
              variant="outline"
              className="border-orange-300 text-orange-600 hover:bg-orange-50"
            >
              Skip anyway
            </Button>
            <Button 
              onClick={() => setShowSkipWarning(false)}
              className="bg-purple-600 hover:bg-purple-700"
            >
              Do it now
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showSkipModal} onOpenChange={setShowSkipModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Why are you skipping?</DialogTitle>
            <DialogDescription>
              Select a reason so we can improve card selection.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <RadioGroup value={skipReason} onValueChange={setSkipReason}>
              {SKIP_REASONS.map((reason) => (
                <div key={reason.value} className="flex items-center space-x-2 py-2">
                  <RadioGroupItem value={reason.value} id={reason.value} />
                  <Label htmlFor={reason.value}>{reason.label}</Label>
                </div>
              ))}
            </RadioGroup>
            {skipReason === "other" && (
              <Textarea
                placeholder="Please explain..."
                value={skipNotes}
                onChange={(e) => setSkipNotes(e.target.value)}
                className="mt-3"
              />
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSkipModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSkipConfirm} 
              disabled={!skipReason || skipMutation.isPending}
              className="bg-orange-600 hover:bg-orange-700"
            >
              Skip Card
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </div>
    </div>
  );
}

import { useState, useEffect, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
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
  LucideIcon
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";

interface Customer {
  id: string;
  company: string | null;
  name: string | null;
  email: string | null;
  phone: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
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
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  // Fetch users for sales rep dropdown
  const { data: usersData } = useQuery<{ id: string; email: string; firstName?: string; lastName?: string }[]>({
    queryKey: ["/api/users"],
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

  // Show dormancy popup when user has been idle for 3+ hours
  useEffect(() => {
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

  const { data, isLoading, isError, error, refetch } = useQuery<NowModeResponse>({
    queryKey: ["/api/now-mode/current"],
    refetchOnWindowFocus: false,
    staleTime: 0,
    refetchOnMount: 'always',
  });
  
  // Check if the error is a session/auth error (401 only)
  // Only show session expired for actual 401 status - not for other errors that might mention "session"
  const isSessionExpired = isError && error && 
    typeof error === 'object' && (error as any)?.status === 401;

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
    if (!selectedPricingTier || !selectedSalesRep) {
      toast({
        title: "Missing Fields",
        description: "Please select both a pricing tier and sales rep",
        variant: "destructive",
      });
      return;
    }
    updateCustomerMutation.mutate({
      customerId: data.card.customerId,
      pricingTier: selectedPricingTier,
      salesRepName: selectedSalesRep,
    });
  };

  const handleOutcome = (outcome: string) => {
    if (!data?.card) return;
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-50 to-indigo-50 p-4">
      <div className="max-w-2xl mx-auto">
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
              <div className="p-4 bg-gray-50 rounded-lg">
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

              <div className="p-3 bg-purple-50 rounded-lg border border-purple-100">
                <p className="text-sm text-purple-800">
                  <span className="font-medium">Why now: </span>
                  {data.card.whyNow}
                </p>
              </div>

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

              <Button
                variant="ghost"
                onClick={handleSkipClick}
                disabled={skipMutation.isPending}
                className="w-full text-gray-500 hover:text-gray-700 hover:bg-gray-100"
              >
                <SkipForward className="h-4 w-4 mr-2" />
                Skip this card
              </Button>

              <div className="text-center">
                <Button 
                  variant="link" 
                  className="text-purple-600"
                  onClick={handleViewProfile}
                >
                  View Full Customer Profile
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Profile Gate Dialog - collect missing pricing tier / sales rep before navigation */}
      <Dialog open={showProfileGateDialog} onOpenChange={setShowProfileGateDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-purple-700">
              <User className="h-5 w-5" />
              Complete Customer Setup
            </DialogTitle>
            <DialogDescription>
              Please assign a pricing tier and sales rep before viewing this customer's full profile.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
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
            <div className="space-y-2">
              <Label htmlFor="sales-rep">Sales Rep</Label>
              <Select value={selectedSalesRep} onValueChange={setSelectedSalesRep}>
                <SelectTrigger>
                  <SelectValue placeholder="Select sales rep" />
                </SelectTrigger>
                <SelectContent>
                  {sortedUsers.map((user) => (
                    <SelectItem key={user.id} value={getSalesRepDisplayName(user.email)}>
                      {getSalesRepDisplayName(user.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowProfileGateDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleProfileGateSave}
              disabled={updateCustomerMutation.isPending || !selectedPricingTier || !selectedSalesRep}
            >
              {updateCustomerMutation.isPending ? "Saving..." : "Save & View Profile"}
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
  );
}

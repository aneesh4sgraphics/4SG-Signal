import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
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
  const { toast } = useToast();

  const { data, isLoading, refetch } = useQuery<NowModeResponse>({
    queryKey: ["/api/now-mode/current"],
    refetchOnWindowFocus: false,
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
  const displayEfficiency = optimisticEfficiency ?? (data?.efficiencyScore || 100);
  const progress = data ? (displayCompleted / data.dailyTarget) * 100 : 0;
  const efficiencyColor = displayEfficiency >= 80 ? "#28A745" : 
                          displayEfficiency >= 50 ? "#FD7E14" : "#DC3545";

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
          <Card className="text-center py-12">
            <CardContent>
              <div className="flex flex-col items-center gap-4">
                <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold text-gray-800">
                  {data?.allDone ? "All Done for Today!" : "No Cards Available"}
                </h2>
                <p className="text-gray-600 max-w-md">
                  {data?.allDone 
                    ? `Great work! You've completed ${data?.completed || 0} tasks today with an efficiency score of ${data?.efficiencyScore || 100}.`
                    : data?.message || "Check back later for more tasks."}
                </p>
                <Link href="/">
                  <Button className="mt-4 bg-purple-600 hover:bg-purple-700">
                    Return to Dashboard
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
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
                <Link href={`/customer/${data.card.customerId}`}>
                  <Button variant="link" className="text-purple-600">
                    View Full Customer Profile
                  </Button>
                </Link>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

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

      <Dialog open={showSkipWarning} onOpenChange={setShowSkipWarning}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-orange-600">
              <AlertTriangle className="h-5 w-5" />
              Are you sure?
            </DialogTitle>
            <DialogDescription className="pt-2">
              <span className="text-lg font-semibold text-gray-900">
                Skipping reduces today's efficiency by 2 points.
              </span>
              <br />
              <span className="text-sm text-gray-500 mt-2 block">
                Current efficiency: <span className="font-bold">{displayEfficiency}</span> → 
                After skip: <span className="font-bold text-orange-600">{Math.max(0, displayEfficiency - 2)}</span>
              </span>
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

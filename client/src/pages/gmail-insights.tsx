import { useState, useEffect, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow, isPast } from "date-fns";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Mail, 
  RefreshCw, 
  CheckCircle2, 
  Clock, 
  AlertTriangle,
  Target,
  MessageSquare,
  ListTodo,
  HelpCircle,
  Handshake,
  User,
  Building2,
  ChevronDown,
  ChevronUp,
  X,
  ExternalLink,
  PartyPopper,
  PlugZap,
  ArrowRight,
  DollarSign,
  Zap,
  Users,
  Calendar,
  TrendingUp,
  Repeat,
  Phone,
  ThumbsDown,
  UserPlus,
  Heart,
  FileText,
  Swords,
  Link2,
  Search,
  Database,
  Activity,
  Unlink,
  MailX,
  Settings,
  Play,
  MoreVertical,
  Edit2,
  Ban
} from "lucide-react";
import { useLocation } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface Insight {
  id: number;
  messageId: number;
  userId: string;
  customerId: string | null;
  insightType: string;
  summary: string;
  details: string | null;
  confidence: string | null;
  dueDate: string | null;
  priority: string;
  status: string;
  completedAt: string | null;
  dismissedAt: string | null;
  createdAt: string;
  email: {
    subject: string;
    from: string;
    to: string;
    date: string;
    direction: string;
  } | null;
  customer: {
    id: string;
    firstName: string;
    lastName: string;
    company: string;
    email: string;
  } | null;
}

interface SyncState {
  syncStatus: string;
  lastSyncedAt: string | null;
  messagesProcessed: number;
  insightsExtracted: number;
}

interface EmailSyncStatus {
  connection: { connected: boolean; email: string; scopes: string[] };
  lastSyncAt: string | null;
  accountEmail: string | null;
  queryUsed: string;
  lastError: string | null;
  counts: {
    fetched: number;
    stored: number;
    matched: number;
    unmatched: number;
    linked: number;
    ignored: number;
    pending: number;
    processed: number;
    events: number;
  };
  skipReasonBreakdown: Record<string, number>;
  tasksCreatedFromEvents: number;
}

interface UnmatchedEmail {
  id: number;
  email: string;
  domain: string | null;
  senderName: string | null;
  subject: string | null;
  messageDate: string | null;
  status: string;
}

interface EmailSalesEvent {
  id: number;
  eventType: string;
  confidence: string;
  triggerText: string | null;
  occurredAt: string;
  isProcessed: boolean;
  coachingTip: string | null;
  customerId: string | null;
  customerName: string | null;
}

interface CustomerSearchResult {
  id: string;
  company: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
}

interface InsightsSummary {
  totalPending: number;
  byType: Record<string, number>;
  urgent: number;
  overdue: number;
}

const insightTypeConfig: Record<string, { icon: any; label: string; color: string; category: string }> = {
  // Core Sales Actions
  sales_opportunity: { icon: Target, label: "Sales Opportunity", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200", category: "opportunity" },
  promise: { icon: Handshake, label: "Promise Made", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200", category: "commitment" },
  follow_up: { icon: Clock, label: "Follow-up Needed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200", category: "action" },
  task: { icon: ListTodo, label: "Task", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200", category: "action" },
  question: { icon: HelpCircle, label: "Unanswered Question", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200", category: "action" },
  
  // High-Priority Detections
  unanswered_quote: { icon: DollarSign, label: "Unanswered Quote Request", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", category: "urgent" },
  stale_negotiation: { icon: TrendingUp, label: "Stale Negotiation", color: "bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200", category: "urgent" },
  urgent_request: { icon: Zap, label: "Urgent Request", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", category: "urgent" },
  competitor_mention: { icon: Swords, label: "Competitor Mention", color: "bg-rose-100 text-rose-800 dark:bg-rose-900 dark:text-rose-200", category: "opportunity" },
  
  // Opportunity Signals
  budget_timing: { icon: Calendar, label: "Budget Timing Signal", color: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200", category: "opportunity" },
  decision_maker: { icon: Users, label: "Decision Maker Involved", color: "bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200", category: "opportunity" },
  repeat_inquiry: { icon: Repeat, label: "Repeat Inquiry", color: "bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200", category: "opportunity" },
  
  // Promise & Meeting Tracking
  meeting_followup: { icon: Phone, label: "Meeting Follow-up", color: "bg-sky-100 text-sky-800 dark:bg-sky-900 dark:text-sky-200", category: "commitment" },
  
  // Customer Health
  complaint: { icon: ThumbsDown, label: "Customer Complaint", color: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200", category: "urgent" },
  reengagement: { icon: UserPlus, label: "Re-engagement Opportunity", color: "bg-teal-100 text-teal-800 dark:bg-teal-900 dark:text-teal-200", category: "opportunity" },
  thank_you: { icon: Heart, label: "Positive Feedback", color: "bg-pink-100 text-pink-800 dark:bg-pink-900 dark:text-pink-200", category: "health" },
  
  // Attachment Tracking
  attachment_request: { icon: FileText, label: "Material Requested", color: "bg-slate-100 text-slate-800 dark:bg-slate-900 dark:text-slate-200", category: "action" },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500 text-white", label: "Urgent" },
  high: { color: "bg-orange-500 text-white", label: "High" },
  medium: { color: "bg-yellow-500 text-black", label: "Medium" },
  low: { color: "bg-gray-400 text-white", label: "Low" },
};

const salesEventTypeConfig: Record<string, { icon: any; label: string; color: string; description: string }> = {
  po: { icon: DollarSign, label: "Purchase Order", color: "bg-green-100 text-green-800", description: "Customer placing or confirming an order" },
  approval: { icon: CheckCircle2, label: "Approval", color: "bg-emerald-100 text-emerald-800", description: "Pricing or quote approval received" },
  samples: { icon: FileText, label: "Sample Request", color: "bg-blue-100 text-blue-800", description: "Customer requesting samples or swatches" },
  urgent: { icon: Zap, label: "Urgent Request", color: "bg-red-100 text-red-800", description: "Time-sensitive customer request" },
  opportunity: { icon: Target, label: "Opportunity", color: "bg-purple-100 text-purple-800", description: "New project or business interest" },
  commitment: { icon: Handshake, label: "Commitment", color: "bg-indigo-100 text-indigo-800", description: "Customer commitment or scheduled event" },
  action: { icon: ListTodo, label: "Action Needed", color: "bg-orange-100 text-orange-800", description: "Specific action requested by customer" },
  feedback: { icon: MessageSquare, label: "Feedback", color: "bg-pink-100 text-pink-800", description: "Customer feedback or review" },
  sales_win: { icon: PartyPopper, label: "Sales Win", color: "bg-yellow-100 text-yellow-800", description: "Order confirmed, deal closed!" },
  press_test_success: { icon: CheckCircle2, label: "Press Test Success", color: "bg-teal-100 text-teal-800", description: "Successful press test feedback" },
  swatch_received: { icon: Mail, label: "Swatch Received", color: "bg-cyan-100 text-cyan-800", description: "Customer confirmed receiving samples" },
  lead: { icon: UserPlus, label: "New Lead", color: "bg-violet-100 text-violet-800", description: "New potential customer inquiry" },
  price_sent: { icon: DollarSign, label: "Pricing Sent", color: "bg-amber-100 text-amber-800", description: "You sent pricing to a customer - follow up in 3 days" },
  pricelist_sent: { icon: FileText, label: "Price List Sent", color: "bg-orange-100 text-orange-800", description: "You sent a price list PDF - follow up in 5 days" },
  quote_sent: { icon: FileText, label: "Quote Sent", color: "bg-rose-100 text-rose-800", description: "Formal quote from Odoo - follow up in 2 days" },
};

interface DailyPerformance {
  date: string;
  purchaseOrdersReceived: number;
  pricingApprovalsReceived: number;
  quotesCreated: number;
  followUpsCompleted: number;
  emailsSent: number;
  coachingTip: string | null;
}

function isPurchaseOrderEmail(insight: Insight): boolean {
  const poKeywords = ['purchase order', 'po#', 'po number', 'p.o.', 'po:', 'purchase-order'];
  const textToCheck = [
    insight.summary?.toLowerCase() || '',
    insight.details?.toLowerCase() || '',
    insight.email?.subject?.toLowerCase() || ''
  ].join(' ');
  return poKeywords.some(keyword => textToCheck.includes(keyword));
}

function isPricingApprovalEmail(insight: Insight): boolean {
  const approvalKeywords = [
    'pricing approved', 'price approved', 'approve the pricing', 'approved pricing',
    'like the pricing', 'love the pricing', 'accept the price', 'price accepted',
    'pricing looks good', 'price looks good', 'agree to the price', 'agreed to pricing',
    'confirm the pricing', 'pricing confirmed', 'go ahead with the price'
  ];
  const textToCheck = [
    insight.summary?.toLowerCase() || '',
    insight.details?.toLowerCase() || '',
    insight.email?.subject?.toLowerCase() || ''
  ].join(' ');
  return approvalKeywords.some(keyword => textToCheck.includes(keyword));
}

function isSwatchbookOrPressTestEmail(insight: Insight): boolean {
  const swatchKeywords = [
    'swatchbook', 'swatch book', 'swatch-book', 'swatches received',
    'press test kit', 'press-test kit', 'press test sample', 'test kit received',
    'samples received', 'received the samples', 'got the samples', 'samples arrived',
    'received your samples', 'received the swatches', 'love the samples',
    'samples look great', 'samples are great', 'impressed with samples'
  ];
  const textToCheck = [
    insight.summary?.toLowerCase() || '',
    insight.details?.toLowerCase() || '',
    insight.email?.subject?.toLowerCase() || ''
  ].join(' ');
  return swatchKeywords.some(keyword => textToCheck.includes(keyword));
}

function ChampagneCelebration({ isVisible, onClose, customerName }: { isVisible: boolean; onClose: () => void; customerName?: string }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 6000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: 50 }}
            transition={{ type: "spring", damping: 15 }}
            className="relative bg-gradient-to-br from-amber-50 via-yellow-100 to-amber-200 dark:from-amber-900 dark:via-yellow-900 dark:to-amber-800 rounded-3xl p-8 shadow-2xl max-w-md mx-4 text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Confetti/bubbles background */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(20)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 300, x: Math.random() * 400 - 200, opacity: 0 }}
                  animate={{ 
                    y: -100, 
                    opacity: [0, 1, 1, 0],
                    rotate: Math.random() * 360
                  }}
                  transition={{ 
                    duration: 2 + Math.random() * 2,
                    delay: Math.random() * 0.5,
                    repeat: Infinity,
                    repeatDelay: Math.random() * 2
                  }}
                  className="absolute bottom-0"
                  style={{ left: `${Math.random() * 100}%` }}
                >
                  <span className="text-2xl">
                    {['🎉', '🥂', '✨', '🌟', '💫', '🎊'][Math.floor(Math.random() * 6)]}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Champagne bottle animation */}
            <motion.div
              initial={{ rotate: -20 }}
              animate={{ rotate: [-20, 20, -10, 10, 0] }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="text-8xl mb-4 relative z-10"
            >
              🍾
            </motion.div>

            {/* Cork pop effect */}
            <motion.div
              initial={{ y: 0, opacity: 1, scale: 1 }}
              animate={{ y: -100, opacity: 0, scale: 0.5 }}
              transition={{ duration: 0.8, delay: 0.4 }}
              className="absolute top-20 left-1/2 transform -translate-x-1/2 text-4xl"
            >
              🎊
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
              className="text-3xl font-bold text-amber-800 dark:text-amber-100 mb-2 relative z-10"
            >
              You've Got a Purchase Order!
            </motion.h2>

            {customerName && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
                className="text-lg text-amber-700 dark:text-amber-200 mb-4 relative z-10"
              >
                from <span className="font-semibold">{customerName}</span>
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="flex items-center justify-center gap-2 text-amber-600 dark:text-amber-300 relative z-10"
            >
              <PartyPopper className="h-5 w-5" />
              <span>Time to celebrate!</span>
              <PartyPopper className="h-5 w-5" />
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
              onClick={onClose}
              className="mt-6 px-6 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-full font-medium transition-colors relative z-10"
            >
              Awesome!
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function GoldChainCelebration({ isVisible, onClose, customerName }: { isVisible: boolean; onClose: () => void; customerName?: string }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 6000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.5, y: 50 }}
            transition={{ type: "spring", damping: 15 }}
            className="relative bg-gradient-to-br from-yellow-400 via-amber-500 to-yellow-600 rounded-3xl p-8 shadow-2xl max-w-md mx-4 text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sparkle effects */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(15)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ 
                    scale: [0, 1.5, 0],
                    opacity: [0, 1, 0],
                  }}
                  transition={{ 
                    duration: 1.5,
                    delay: Math.random() * 2,
                    repeat: Infinity,
                    repeatDelay: Math.random() * 3
                  }}
                  className="absolute text-2xl"
                  style={{ 
                    left: `${Math.random() * 100}%`, 
                    top: `${Math.random() * 100}%` 
                  }}
                >
                  ✨
                </motion.div>
              ))}
            </div>

            {/* Big S Gold Chain Guy */}
            <motion.div
              initial={{ scale: 0, rotate: -30 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: "spring", damping: 10, delay: 0.2 }}
              className="text-8xl mb-2 relative z-10"
            >
              🧔
            </motion.div>
            
            {/* Gold chain with dollar sign */}
            <motion.div
              initial={{ y: -50, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.4, type: "spring" }}
              className="text-6xl -mt-4 mb-4 relative z-10"
            >
              💰💲💰
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6 }}
              className="text-3xl font-bold text-white mb-2 relative z-10 drop-shadow-lg"
            >
              Pricing Approved! 
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.8 }}
              className="text-xl text-yellow-100 mb-2 relative z-10"
            >
              You're a Sales Superstar!
            </motion.p>

            {customerName && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1 }}
                className="text-lg text-yellow-200 mb-4 relative z-10"
              >
                <span className="font-semibold">{customerName}</span> loves your pricing!
              </motion.p>
            )}

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.2 }}
              onClick={onClose}
              className="mt-4 px-6 py-2 bg-white hover:bg-yellow-50 text-amber-700 rounded-full font-bold transition-colors relative z-10 shadow-lg"
            >
              That's How We Do It! 💪
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function SwatchbookCelebration({ isVisible, onClose, customerName }: { isVisible: boolean; onClose: () => void; customerName?: string }) {
  useEffect(() => {
    if (isVisible) {
      const timer = setTimeout(onClose, 7000);
      return () => clearTimeout(timer);
    }
  }, [isVisible, onClose]);

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.5, y: 50, rotate: -5 }}
            animate={{ scale: 1, y: 0, rotate: 0 }}
            exit={{ scale: 0.5, y: 50 }}
            transition={{ type: "spring", damping: 12 }}
            className="relative bg-gradient-to-br from-emerald-100 via-teal-100 to-cyan-100 dark:from-emerald-900 dark:via-teal-900 dark:to-cyan-900 rounded-3xl p-8 shadow-2xl max-w-md mx-4 text-center overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Floating package/sample icons */}
            <div className="absolute inset-0 overflow-hidden pointer-events-none">
              {[...Array(12)].map((_, i) => (
                <motion.div
                  key={i}
                  initial={{ y: 300, x: Math.random() * 300 - 150, opacity: 0, rotate: 0 }}
                  animate={{ 
                    y: -100, 
                    opacity: [0, 1, 1, 0],
                    rotate: Math.random() * 180 - 90
                  }}
                  transition={{ 
                    duration: 3 + Math.random() * 2,
                    delay: Math.random() * 1,
                    repeat: Infinity,
                    repeatDelay: Math.random() * 2
                  }}
                  className="absolute bottom-0"
                  style={{ left: `${Math.random() * 100}%` }}
                >
                  <span className="text-2xl">
                    {['📦', '🎁', '📬', '✨', '🌟', '💎'][Math.floor(Math.random() * 6)]}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Main icon - package opening */}
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: [0, 1.2, 1] }}
              transition={{ duration: 0.5, delay: 0.2 }}
              className="text-8xl mb-2 relative z-10"
            >
              📦
            </motion.div>
            
            {/* Revealing swatches */}
            <motion.div
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ delay: 0.5 }}
              className="text-5xl -mt-2 mb-4 relative z-10"
            >
              🎨✨📋
            </motion.div>

            <motion.h2
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.7 }}
              className="text-2xl font-bold text-emerald-800 dark:text-emerald-100 mb-2 relative z-10"
            >
              Samples Received!
            </motion.h2>

            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
              className="text-lg text-teal-700 dark:text-teal-200 mb-2 relative z-10"
            >
              🎯 Expect an order soon!
            </motion.p>

            {customerName && (
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.1 }}
                className="text-md text-emerald-600 dark:text-emerald-300 mb-4 relative z-10"
              >
                <span className="font-semibold">{customerName}</span> is reviewing your products!
              </motion.p>
            )}

            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.3 }}
              className="bg-white/60 dark:bg-gray-900/60 rounded-lg p-3 mb-4 relative z-10"
            >
              <p className="text-sm text-teal-800 dark:text-teal-200">
                💡 <strong>Pro tip:</strong> Follow up in 3-5 days to answer any questions and secure the order!
              </p>
            </motion.div>

            <motion.button
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.5 }}
              onClick={onClose}
              className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-full font-medium transition-colors relative z-10"
            >
              I'm Ready! 🚀
            </motion.button>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function DailyPerformanceCard({ todayPOs, todayApprovals, todaySwatchbooks, yesterdayPOs, yesterdayApprovals, coachingTip }: {
  todayPOs: number;
  todayApprovals: number;
  todaySwatchbooks: number;
  yesterdayPOs: number;
  yesterdayApprovals: number;
  coachingTip?: string;
}) {
  const hasAchievements = todayPOs > 0 || todayApprovals > 0 || todaySwatchbooks > 0;
  const hadAchievementsYesterday = yesterdayPOs > 0 || yesterdayApprovals > 0;
  
  return (
    <Card className="border-2 border-dashed border-amber-300 dark:border-amber-700 bg-gradient-to-br from-amber-50 to-yellow-50 dark:from-amber-950 dark:to-yellow-950">
      <CardHeader className="pb-2">
        <CardTitle className="text-lg flex items-center gap-2">
          <span className="text-2xl">🏆</span>
          Your Sales Wins
        </CardTitle>
        <CardDescription>Today's achievements & yesterday's recap</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Today's Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 text-center shadow-sm">
            <div className="text-2xl mb-1">{todayPOs > 0 ? '🍾' : '📦'}</div>
            <div className="text-xl font-bold text-amber-600">{todayPOs}</div>
            <div className="text-xs text-muted-foreground">POs</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 text-center shadow-sm">
            <div className="text-2xl mb-1">{todayApprovals > 0 ? '💰' : '📋'}</div>
            <div className="text-xl font-bold text-green-600">{todayApprovals}</div>
            <div className="text-xs text-muted-foreground">Approvals</div>
          </div>
          <div className="bg-white dark:bg-gray-900 rounded-lg p-2 text-center shadow-sm">
            <div className="text-2xl mb-1">{todaySwatchbooks > 0 ? '📦✨' : '🎨'}</div>
            <div className="text-xl font-bold text-emerald-600">{todaySwatchbooks}</div>
            <div className="text-xs text-muted-foreground">Samples</div>
          </div>
        </div>

        {/* Swatchbook Alert */}
        {todaySwatchbooks > 0 && (
          <div className="bg-emerald-50 dark:bg-emerald-950 rounded-lg p-3 border border-emerald-200 dark:border-emerald-800">
            <div className="text-sm font-medium flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              🎯 Hot Lead Alert!
            </div>
            <p className="text-xs text-emerald-600 dark:text-emerald-400">
              Customer received samples - expect an order soon! Follow-up task created.
            </p>
          </div>
        )}

        {/* Yesterday's Recap */}
        {hadAchievementsYesterday && (
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-1 flex items-center gap-1">
              <Clock className="h-3 w-3" /> Yesterday's Performance
            </div>
            <div className="text-xs text-muted-foreground">
              {yesterdayPOs > 0 && <span className="mr-2">🍾 {yesterdayPOs} POs</span>}
              {yesterdayApprovals > 0 && <span>💰 {yesterdayApprovals} Approvals</span>}
            </div>
          </div>
        )}

        {/* Coaching Tip */}
        {coachingTip ? (
          <div className="bg-blue-50 dark:bg-blue-950 rounded-lg p-3 border border-blue-200 dark:border-blue-800">
            <div className="text-sm font-medium mb-1 flex items-center gap-1 text-blue-700 dark:text-blue-300">
              💡 Coach's Tip
            </div>
            <p className="text-xs text-blue-600 dark:text-blue-400">{coachingTip}</p>
          </div>
        ) : (
          <div className="bg-muted/30 rounded-lg p-3 text-center">
            <p className="text-xs text-muted-foreground">
              {hasAchievements 
                ? "🔥 You're on fire! Keep up the great work!" 
                : "💪 Sync your emails to track your wins!"}
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function GmailNotConnectedDialog({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [, navigate] = useLocation();
  
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <PlugZap className="h-5 w-5 text-[#875A7B]" />
            Connect Gmail to Get Started
          </DialogTitle>
          <DialogDescription className="text-left">
            Email Intelligence needs access to your Gmail to analyze emails and find sales opportunities.
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="bg-muted/50 rounded-lg p-4 space-y-3">
            <h4 className="font-medium text-sm">How to connect Gmail:</h4>
            <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
              <li>Click the button below to go to Integrations</li>
              <li>Find the <strong>Gmail</strong> section</li>
              <li>Click <strong>"Connect Gmail"</strong> and sign in with your Google account</li>
              <li>Allow the app to read your emails</li>
              <li>Come back here and click "Sync Emails"</li>
            </ol>
          </div>
          
          <div className="flex items-center gap-2 p-3 bg-amber-50 dark:bg-amber-950 rounded-lg border border-amber-200 dark:border-amber-800">
            <Mail className="h-4 w-4 text-amber-600 dark:text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-700 dark:text-amber-300">
              We only read emails to find sales insights. We never store full email content or share your data.
            </p>
          </div>
        </div>
        
        <div className="flex gap-2 justify-end">
          <Button variant="outline" onClick={onClose}>
            Maybe Later
          </Button>
          <Button 
            onClick={() => {
              onClose();
              navigate('/integrations');
            }}
            className="bg-[#875A7B] hover:bg-[#6d4863]"
          >
            Go to Integrations
            <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function GmailInsightsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("unmatched");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [showPOCelebration, setShowPOCelebration] = useState(false);
  const [poCustomerName, setPOCustomerName] = useState<string | undefined>();
  const [showPricingCelebration, setShowPricingCelebration] = useState(false);
  const [pricingCustomerName, setPricingCustomerName] = useState<string | undefined>();
  const [showSwatchbookCelebration, setShowSwatchbookCelebration] = useState(false);
  const [swatchbookCustomerName, setSwatchbookCustomerName] = useState<string | undefined>();
  const [showGmailNotConnected, setShowGmailNotConnected] = useState(false);
  const [syncProgress, setSyncProgress] = useState(0);
  const [syncStatus, setSyncStatus] = useState("");
  const [showSyncDebug, setShowSyncDebug] = useState(false);
  const [selectedUnmatchedId, setSelectedUnmatchedId] = useState<number | null>(null);
  const [customerSearchQuery, setCustomerSearchQuery] = useState("");
  const celebratedPOsRef = useRef<Set<number>>(new Set());
  const celebratedApprovalsRef = useRef<Set<number>>(new Set());
  const celebratedSwatchbooksRef = useRef<Set<number>>(new Set());

  // Check Gmail connection status
  const { data: gmailConnection, isLoading: gmailConnectionLoading, refetch: refetchGmailConnection } = useQuery<{
    connected: boolean;
    email?: string;
    needsReconnect?: boolean;
    lastSyncAt?: string;
    lastError?: string;
  }>({
    queryKey: ["/api/gmail-oauth/status"],
  });

  const { data: syncState, isLoading: syncStateLoading } = useQuery<SyncState>({
    queryKey: ["/api/gmail-intelligence/sync-state"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<InsightsSummary>({
    queryKey: ["/api/gmail-intelligence/summary"],
  });

  // Email Sync Debug Status (V2)
  const { data: emailSyncStatus, isLoading: emailSyncStatusLoading, refetch: refetchSyncStatus } = useQuery<EmailSyncStatus>({
    queryKey: ["/api/email/sync/status"],
    refetchInterval: 30000,
  });

  // Unmatched emails for manual linking
  const { data: unmatchedEmails, isLoading: unmatchedLoading, refetch: refetchUnmatched } = useQuery<UnmatchedEmail[]>({
    queryKey: ["/api/email-intelligence/unmatched"],
  });

  // Customer search for manual linking
  const { data: customerSearchResults } = useQuery<CustomerSearchResult[]>({
    queryKey: ["/api/customers/search", customerSearchQuery],
    queryFn: async () => {
      if (!customerSearchQuery || customerSearchQuery.length < 2) return [];
      const res = await fetch(`/api/customers?q=${encodeURIComponent(customerSearchQuery)}&limit=10`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: customerSearchQuery.length >= 2,
  });

  // Email Sales Events with category tabs
  const [salesEventCategory, setSalesEventCategory] = useState<string>("all");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);
  
  const { data: salesEvents, isLoading: salesEventsLoading, refetch: refetchSalesEvents } = useQuery<{ 
    events: (EmailSalesEvent & { senderName?: string; senderEmail?: string; subject?: string; direction?: string })[];
    total: number;
    categoryCounts?: { category: string; count: string }[];
  }>({
    queryKey: ["/api/email-intelligence/events", salesEventCategory],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (salesEventCategory !== "all") {
        params.append("category", salesEventCategory);
      }
      params.append("limit", "100");
      const res = await fetch(`/api/email-intelligence/events?${params.toString()}`);
      if (!res.ok) return { events: [], total: 0, categoryCounts: [] };
      return res.json();
    },
  });

  // Update event type mutation
  const updateEventTypeMutation = useMutation({
    mutationFn: async ({ eventId, eventType }: { eventId: number; eventType: string }) => {
      const res = await fetch(`/api/email-intelligence/events/${eventId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventType }),
      });
      if (!res.ok) throw new Error('Failed to update event');
      return res.json();
    },
    onSuccess: () => {
      refetchSalesEvents();
      setEditingEventId(null);
      toast({ title: "Event type updated" });
    },
  });

  // Delete event mutation
  const deleteEventMutation = useMutation({
    mutationFn: async (eventId: number) => {
      const res = await fetch(`/api/email-intelligence/events/${eventId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete event');
      return res.json();
    },
    onSuccess: () => {
      refetchSalesEvents();
      toast({ title: "Event dismissed" });
    },
  });

  // Blacklist email mutation
  const addToBlacklistMutation = useMutation({
    mutationFn: async ({ pattern, reason }: { pattern: string; reason: string }) => {
      const res = await fetch('/api/email-intelligence/blacklist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pattern, patternType: 'email', reason }),
      });
      if (!res.ok) throw new Error('Failed to add to blacklist');
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Email added to blacklist", description: "This sender will be excluded from future detection." });
    },
  });

  // Get category count helper
  const getCategoryCount = (category: string) => {
    if (!salesEvents?.categoryCounts) return 0;
    const found = salesEvents.categoryCounts.find(c => c.category === category);
    return found ? parseInt(found.count) : 0;
  };

  const categoryToTypes: Record<string, string[]> = {
    urgent: ['unanswered_quote', 'stale_negotiation', 'urgent_request', 'complaint'],
    opportunity: ['sales_opportunity', 'competitor_mention', 'budget_timing', 'decision_maker', 'repeat_inquiry', 'reengagement'],
    commitment: ['promise', 'meeting_followup'],
    action: ['follow_up', 'task', 'question', 'attachment_request'],
    health: ['thank_you'],
  };

  const { data: insights, isLoading: insightsLoading } = useQuery<Insight[]>({
    queryKey: ["/api/gmail-intelligence/insights", { status: statusFilter, category: activeTab }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      const response = await fetch(`/api/gmail-intelligence/insights?${params}`);
      if (!response.ok) throw new Error("Failed to fetch insights");
      const data = await response.json();
      
      if (activeTab === "all") return data;
      
      const typesForCategory = categoryToTypes[activeTab];
      if (typesForCategory) {
        return data.filter((i: Insight) => typesForCategory.includes(i.insightType));
      }
      
      return data.filter((i: Insight) => i.insightType === activeTab);
    },
  });

  // Count today's achievements from insights
  const todayPOs = insights?.filter(i => isPurchaseOrderEmail(i) && i.status !== 'dismissed').length || 0;
  const todayApprovals = insights?.filter(i => isPricingApprovalEmail(i) && i.status !== 'dismissed').length || 0;
  const todaySwatchbooks = insights?.filter(i => isSwatchbookOrPressTestEmail(i) && i.status !== 'dismissed').length || 0;

  // Detect PO emails and pricing approvals, trigger celebrations
  useEffect(() => {
    if (!insights || insights.length === 0) return;
    
    // Check for new PO emails
    const poInsight = insights.find(insight => 
      insight.status === 'pending' && 
      isPurchaseOrderEmail(insight) && 
      !celebratedPOsRef.current.has(insight.id)
    );
    
    if (poInsight) {
      celebratedPOsRef.current.add(poInsight.id);
      const customerName = poInsight.customer 
        ? `${poInsight.customer.firstName} ${poInsight.customer.lastName}${poInsight.customer.company ? ` (${poInsight.customer.company})` : ''}`
        : poInsight.email?.from;
      setPOCustomerName(customerName);
      setShowPOCelebration(true);
      return; // Only show one celebration at a time
    }
    
    // Check for pricing approval emails
    const approvalInsight = insights.find(insight => 
      insight.status === 'pending' && 
      isPricingApprovalEmail(insight) && 
      !celebratedApprovalsRef.current.has(insight.id)
    );
    
    if (approvalInsight) {
      celebratedApprovalsRef.current.add(approvalInsight.id);
      const customerName = approvalInsight.customer 
        ? `${approvalInsight.customer.firstName} ${approvalInsight.customer.lastName}${approvalInsight.customer.company ? ` (${approvalInsight.customer.company})` : ''}`
        : approvalInsight.email?.from;
      setPricingCustomerName(customerName);
      setShowPricingCelebration(true);
      return;
    }

    // Check for swatchbook/press test kit emails
    const swatchbookInsight = insights.find(insight => 
      insight.status === 'pending' && 
      isSwatchbookOrPressTestEmail(insight) && 
      !celebratedSwatchbooksRef.current.has(insight.id)
    );
    
    if (swatchbookInsight) {
      celebratedSwatchbooksRef.current.add(swatchbookInsight.id);
      const customerName = swatchbookInsight.customer 
        ? `${swatchbookInsight.customer.firstName} ${swatchbookInsight.customer.lastName}${swatchbookInsight.customer.company ? ` (${swatchbookInsight.customer.company})` : ''}`
        : swatchbookInsight.email?.from;
      setSwatchbookCustomerName(customerName);
      setShowSwatchbookCelebration(true);
      
      // Create a follow-up task for this swatchbook receipt
      if (swatchbookInsight.customerId) {
        createSwatchbookFollowUp(swatchbookInsight);
      }
    }
  }, [insights]);

  // Create follow-up task when swatchbook is received
  const createSwatchbookFollowUp = async (insight: Insight) => {
    try {
      const followUpDate = new Date();
      followUpDate.setDate(followUpDate.getDate() + 4); // Follow up in 4 days
      
      await apiRequest("POST", "/api/gmail-intelligence/insights", {
        messageId: insight.messageId,
        insightType: "follow_up",
        summary: `Follow up on samples/swatchbook sent to ${insight.customer?.company || insight.email?.from}`,
        details: `Customer received samples. Time to check in and answer any questions. This is a hot lead - expect an order soon! Original email: ${insight.email?.subject}`,
        priority: "high",
        dueDate: followUpDate.toISOString(),
        customerId: insight.customerId,
      });
      
      // Refresh insights list
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence/insights"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence/summary"] });
    } catch (error) {
      console.error("Failed to create swatchbook follow-up:", error);
    }
  };

  // Connect Gmail mutation
  const connectGmailMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/gmail-oauth/connect");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to initiate connection");
      return data;
    },
    onSuccess: (data: { authUrl: string }) => {
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Could not start Gmail connection",
        variant: "destructive",
      });
    },
  });

  // Disconnect Gmail mutation
  const disconnectGmailMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("DELETE", "/api/gmail-oauth/disconnect");
      if (!res.ok) throw new Error("Failed to disconnect");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-oauth/status"] });
      toast({
        title: "Gmail Disconnected",
        description: "Your Gmail account has been disconnected",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to disconnect Gmail",
        variant: "destructive",
      });
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      setSyncProgress(0);
      setSyncStatus("Connecting to Gmail...");
      
      // Simulate progress stages
      const progressInterval = setInterval(() => {
        setSyncProgress(prev => {
          if (prev < 20) {
            setSyncStatus("Fetching emails from Gmail...");
            return prev + 2;
          } else if (prev < 50) {
            setSyncStatus("Processing email content...");
            return prev + 1;
          } else if (prev < 80) {
            setSyncStatus("AI analyzing for insights...");
            return prev + 0.5;
          } else if (prev < 95) {
            setSyncStatus("Extracting sales opportunities...");
            return prev + 0.3;
          }
          return prev;
        });
      }, 200);
      
      try {
        const res = await apiRequest("POST", "/api/gmail-intelligence/sync", { maxMessages: 100 });
        clearInterval(progressInterval);
        setSyncProgress(100);
        setSyncStatus("Complete!");
        return res.json();
      } catch (error) {
        clearInterval(progressInterval);
        setSyncProgress(0);
        setSyncStatus("");
        throw error;
      }
    },
    onSuccess: (data: any) => {
      setTimeout(() => {
        setSyncProgress(0);
        setSyncStatus("");
      }, 1500);
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence"] });
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-oauth/status"] });
      toast({
        title: "Email Sync Complete",
        description: `Processed ${data.sync?.processedCount || 0} messages, found ${data.analysis?.insights || 0} new insights`,
      });
    },
    onError: (error: any) => {
      const errorMessage = error.message?.toLowerCase() || '';
      const isGmailNotConnected = errorMessage.includes('gmail') || 
                                   errorMessage.includes('not connected') ||
                                   errorMessage.includes('token') ||
                                   errorMessage.includes('auth') ||
                                   errorMessage.includes('connect your gmail');
      const isPermissionError = errorMessage.includes('permission') || 
                                 errorMessage.includes('insufficient') ||
                                 errorMessage.includes('scope');
      
      if (isGmailNotConnected) {
        setShowGmailNotConnected(true);
      } else if (isPermissionError) {
        toast({
          title: "Limited Gmail Access",
          description: "Gmail Intelligence requires additional permissions. This feature works in the published app with full Gmail access.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Sync Failed",
          description: error.message || "Something went wrong. Please try again.",
          variant: "destructive",
        });
      }
    },
  });

  const analyzeMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gmail-intelligence/analyze", { limit: 50 });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence"] });
      toast({
        title: "Analysis Complete",
        description: `Analyzed ${data.analyzed || 0} emails, extracted ${data.insights || 0} insights`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze pending emails",
        variant: "destructive",
      });
    },
  });

  // Manual sync trigger (full pipeline)
  const manualSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/email/sync/run");
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/email/sync/status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      refetchSyncStatus();
      refetchUnmatched();
      toast({
        title: "Full Sync Complete",
        description: `Fetched: ${data.sync?.messagesStored || 0}, Events: ${data.eventsExtracted || 0}, Tasks: ${data.tasksCreated || 0}`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to run sync",
        variant: "destructive",
      });
    },
  });

  // Link unmatched email to customer
  const linkEmailMutation = useMutation({
    mutationFn: async ({ unmatchedId, customerId }: { unmatchedId: number; customerId: string }) => {
      const res = await apiRequest("POST", `/api/email-intelligence/unmatched/${unmatchedId}/link`, { customerId });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/sync/status"] });
      setSelectedUnmatchedId(null);
      setCustomerSearchQuery("");
      toast({
        title: "Email Linked",
        description: "Email has been linked to customer",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Link Failed",
        description: error.message || "Failed to link email",
        variant: "destructive",
      });
    },
  });

  // Ignore unmatched email
  const ignoreEmailMutation = useMutation({
    mutationFn: async ({ unmatchedId, reason }: { unmatchedId: number; reason: string }) => {
      const res = await apiRequest("POST", `/api/email-intelligence/unmatched/${unmatchedId}/ignore`, { reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email/sync/status"] });
      toast({
        title: "Email Ignored",
        description: "Email has been marked as ignored",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Ignore Failed",
        description: error.message || "Failed to ignore email",
        variant: "destructive",
      });
    },
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: number; status: string; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/gmail-intelligence/insights/${id}`, { status, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence"] });
      setSelectedInsight(null);
      setDismissReason("");
      toast({ title: "Updated", description: "Insight status updated" });
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update insight", variant: "destructive" });
    },
  });

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) {
        newSet.delete(id);
      } else {
        newSet.add(id);
      }
      return newSet;
    });
  };

  const renderInsightCard = (insight: Insight) => {
    const config = insightTypeConfig[insight.insightType] || insightTypeConfig.task;
    const Icon = config.icon;
    const isExpanded = expandedIds.has(insight.id);
    const isOverdue = insight.dueDate && isPast(new Date(insight.dueDate)) && insight.status === "pending";

    return (
      <Card 
        key={insight.id} 
        className={`mb-3 transition-all hover:shadow-md ${isOverdue ? 'border-red-400 dark:border-red-600' : ''}`}
      >
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <div className={`p-2 rounded-lg ${config.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="flex-1 min-w-0">
                <CardTitle className="text-sm font-medium line-clamp-2">
                  {insight.summary}
                </CardTitle>
                {insight.email && (
                  <CardDescription className="text-xs mt-1">
                    <Mail className="h-3 w-3 inline mr-1" />
                    {insight.email.subject}
                  </CardDescription>
                )}
              </div>
            </div>
            <div className="flex flex-col items-end gap-1">
              <Badge className={priorityConfig[insight.priority]?.color || priorityConfig.medium.color}>
                {priorityConfig[insight.priority]?.label || "Medium"}
              </Badge>
              {isOverdue && (
                <Badge variant="destructive" className="text-xs">
                  <AlertTriangle className="h-3 w-3 mr-1" />
                  Overdue
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="flex items-center gap-4 text-xs text-muted-foreground mb-2">
            {insight.customer && (
              <span className="flex items-center gap-1">
                <User className="h-3 w-3" />
                {insight.customer.firstName} {insight.customer.lastName}
                {insight.customer.company && (
                  <>
                    <Building2 className="h-3 w-3 ml-2" />
                    {insight.customer.company}
                  </>
                )}
              </span>
            )}
            {insight.dueDate && (
              <span className={`flex items-center gap-1 ${isOverdue ? 'text-red-500 font-medium' : ''}`}>
                <Clock className="h-3 w-3" />
                Due {formatDistanceToNow(new Date(insight.dueDate), { addSuffix: true })}
              </span>
            )}
            <span className="ml-auto">
              {formatDistanceToNow(new Date(insight.createdAt), { addSuffix: true })}
            </span>
          </div>

          {isExpanded && insight.details && (
            <div className="mt-3 p-3 bg-muted/50 rounded-lg text-sm">
              <p className="whitespace-pre-wrap">{insight.details}</p>
              {insight.email && (
                <div className="mt-2 pt-2 border-t text-xs text-muted-foreground">
                  <div>From: {insight.email.from}</div>
                  <div>To: {insight.email.to}</div>
                  <div>Date: {insight.email.date && format(new Date(insight.email.date), "PPp")}</div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => toggleExpand(insight.id)}
            >
              {isExpanded ? (
                <>
                  <ChevronUp className="h-4 w-4 mr-1" />
                  Less
                </>
              ) : (
                <>
                  <ChevronDown className="h-4 w-4 mr-1" />
                  More
                </>
              )}
            </Button>
            
            {insight.status === "pending" && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => updateStatusMutation.mutate({ id: insight.id, status: "completed" })}
                  disabled={updateStatusMutation.isPending}
                >
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Done
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setSelectedInsight(insight)}
                  disabled={updateStatusMutation.isPending}
                >
                  <X className="h-4 w-4 mr-1" />
                  Dismiss
                </Button>
              </>
            )}

            {insight.customer && (
              <Button
                variant="ghost"
                size="sm"
                asChild
                className="ml-auto"
              >
                <a href={`/odoo-contacts/${insight.customer.id}`}>
                  <ExternalLink className="h-4 w-4 mr-1" />
                  View Customer
                </a>
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <>
      <ChampagneCelebration 
        isVisible={showPOCelebration} 
        onClose={() => setShowPOCelebration(false)}
        customerName={poCustomerName}
      />
      <GoldChainCelebration 
        isVisible={showPricingCelebration} 
        onClose={() => setShowPricingCelebration(false)}
        customerName={pricingCustomerName}
      />
      <SwatchbookCelebration 
        isVisible={showSwatchbookCelebration} 
        onClose={() => setShowSwatchbookCelebration(false)}
        customerName={swatchbookCustomerName}
      />
      <GmailNotConnectedDialog 
        isOpen={showGmailNotConnected} 
        onClose={() => setShowGmailNotConnected(false)} 
      />
      <div className="container mx-auto py-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Mail className="h-6 w-6 text-[#875A7B]" />
            Email Intelligence
          </h1>
          <p className="text-muted-foreground">
            AI-powered insights from your email conversations
          </p>
        </div>
        <div className="flex gap-2 flex-wrap items-center">
          {/* Gmail Connection Status - compact */}
          {!gmailConnectionLoading && (
            gmailConnection?.connected ? (
              <div className="flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900 rounded-full">
                <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                <span className="text-sm text-green-700 dark:text-green-300">{gmailConnection.email}</span>
                <Button 
                  variant="ghost" 
                  size="sm"
                  className="h-6 px-2 text-xs text-green-600 hover:text-red-600 hover:bg-red-100"
                  onClick={() => disconnectGmailMutation.mutate()}
                  disabled={disconnectGmailMutation.isPending}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ) : (
              <Button 
                variant="outline"
                size="sm"
                onClick={() => connectGmailMutation.mutate()}
                disabled={connectGmailMutation.isPending}
                className="border-amber-300 text-amber-700 hover:bg-amber-50"
              >
                <PlugZap className="h-4 w-4 mr-2" />
                {connectGmailMutation.isPending ? "Connecting..." : "Connect Gmail"}
              </Button>
            )
          )}
          <Button
            onClick={() => syncMutation.mutate()}
            disabled={syncMutation.isPending || !gmailConnection?.connected}
            className="bg-[#875A7B] hover:bg-[#6d4863]"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
            {syncMutation.isPending ? "Syncing..." : "Sync Emails"}
          </Button>
          <Button
            onClick={() => analyzeMutation.mutate()}
            disabled={analyzeMutation.isPending}
            variant="outline"
            className="border-[#875A7B] text-[#875A7B] hover:bg-[#875A7B]/10"
          >
            <Zap className={`h-4 w-4 mr-2 ${analyzeMutation.isPending ? 'animate-pulse' : ''}`} />
            {analyzeMutation.isPending ? "Analyzing..." : "Analyze Pending"}
          </Button>
        </div>
      </div>

      {/* Daily Performance Card */}
      <div className="grid gap-4 md:grid-cols-3">
        <div className="md:col-span-2">
          <DailyPerformanceCard 
            todayPOs={todayPOs}
            todayApprovals={todayApprovals}
            todaySwatchbooks={todaySwatchbooks}
            yesterdayPOs={0}
            yesterdayApprovals={0}
            coachingTip={todaySwatchbooks > 0 
              ? "🎯 Hot lead! Customer received samples. Follow up in 3-5 days to close the deal!"
              : todayPOs === 0 && todayApprovals === 0 
                ? "Tip: Follow up on pending quotes to turn them into POs! Check your oldest pending quotes first."
                : todayPOs > 0 
                  ? "Great job closing that PO! Now follow up with similar customers who might be ready to buy."
                  : "Nice work getting that pricing approved! Strike while the iron is hot - send the quote today!"}
          />
        </div>
        <Card className={`md:col-span-1 ${syncMutation.isPending ? 'border-[#875A7B]/50 bg-gradient-to-br from-purple-50 to-pink-50 dark:from-purple-950 dark:to-pink-950' : ''}`}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <RefreshCw className={`h-4 w-4 ${syncMutation.isPending ? 'animate-spin text-[#875A7B]' : ''}`} />
              Sync Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {syncMutation.isPending ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[#875A7B]">{syncStatus}</span>
                  <span className="text-xs text-muted-foreground">{Math.round(syncProgress)}%</span>
                </div>
                <Progress value={syncProgress} className="h-2" />
                <p className="text-xs text-muted-foreground">
                  AI analyzing emails for insights...
                </p>
              </div>
            ) : syncStateLoading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <>
                <div className="text-sm">
                  <span className="text-muted-foreground">Last sync: </span>
                  {syncState?.lastSyncedAt ? (
                    formatDistanceToNow(new Date(syncState.lastSyncedAt), { addSuffix: true })
                  ) : (
                    <span className="text-orange-500">Never synced</span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Emails processed: </span>
                  <span className="font-medium">{syncState?.messagesProcessed || 0}</span>
                </div>
                <div className="text-sm">
                  <span className="text-muted-foreground">Insights found: </span>
                  <span className="font-medium">{syncState?.insightsExtracted || 0}</span>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Pending Actions</CardTitle>
            <ListTodo className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold">{summary?.totalPending || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Urgent</CardTitle>
            <AlertTriangle className="h-4 w-4 text-red-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-red-500">{summary?.urgent || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Overdue</CardTitle>
            <Clock className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            {summaryLoading ? (
              <Skeleton className="h-8 w-16" />
            ) : (
              <div className="text-2xl font-bold text-orange-500">{summary?.overdue || 0}</div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Last Sync</CardTitle>
            <RefreshCw className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {syncStateLoading ? (
              <Skeleton className="h-8 w-24" />
            ) : (
              <div className="text-sm">
                {syncState?.lastSyncedAt ? (
                  formatDistanceToNow(new Date(syncState.lastSyncedAt), { addSuffix: true })
                ) : (
                  <span className="text-muted-foreground">Never synced</span>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="flex gap-4 items-center">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Filter by status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="dismissed">Dismissed</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="flex-wrap h-auto gap-1 p-1">
          <TabsTrigger value="all" className="gap-1">
            All
            {summary && summary.totalPending > 0 && (
              <Badge variant="secondary" className="ml-1">{summary.totalPending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="urgent" className="gap-1 text-red-600">
            <Zap className="h-4 w-4" />
            Urgent
            {summary?.byType && (
              <Badge variant="destructive" className="ml-1">
                {(summary.byType.unanswered_quote || 0) + (summary.byType.urgent_request || 0) + (summary.byType.complaint || 0) + (summary.byType.stale_negotiation || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="opportunity" className="gap-1 text-green-600">
            <Target className="h-4 w-4" />
            Opportunities
            {summary?.byType && (
              <Badge variant="secondary" className="ml-1">
                {(summary.byType.sales_opportunity || 0) + (summary.byType.competitor_mention || 0) + (summary.byType.budget_timing || 0) + (summary.byType.decision_maker || 0) + (summary.byType.repeat_inquiry || 0) + (summary.byType.reengagement || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="commitment" className="gap-1 text-purple-600">
            <Handshake className="h-4 w-4" />
            Commitments
            {summary?.byType && (
              <Badge variant="secondary" className="ml-1">
                {(summary.byType.promise || 0) + (summary.byType.meeting_followup || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="action" className="gap-1 text-blue-600">
            <ListTodo className="h-4 w-4" />
            Actions
            {summary?.byType && (
              <Badge variant="secondary" className="ml-1">
                {(summary.byType.follow_up || 0) + (summary.byType.task || 0) + (summary.byType.question || 0) + (summary.byType.attachment_request || 0)}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="health" className="gap-1 text-pink-600">
            <Heart className="h-4 w-4" />
            Feedback
            {summary?.byType?.thank_you && (
              <Badge variant="secondary" className="ml-1">{summary.byType.thank_you}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unmatched" className="gap-1 text-amber-600">
            <MailX className="h-4 w-4" />
            Unmatched
            {emailSyncStatus?.counts?.unmatched && emailSyncStatus.counts.unmatched > 0 && (
              <Badge variant="outline" className="ml-1 border-amber-400 text-amber-600">
                {emailSyncStatus.counts.unmatched}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="debug" className="gap-1 text-gray-500">
            <Activity className="h-4 w-4" />
            Sync Debug
          </TabsTrigger>
          <TabsTrigger value="sales_events" className="gap-1 text-green-600">
            <DollarSign className="h-4 w-4" />
            Sales Events
            {emailSyncStatus?.counts?.events && emailSyncStatus.counts.events > 0 && (
              <Badge variant="secondary" className="ml-1 bg-green-100 text-green-800">
                {emailSyncStatus.counts.events}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        {/* Unmatched Emails Tab */}
        <TabsContent value="unmatched" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <MailX className="h-5 w-5 text-amber-500" />
                    Unmatched Emails
                  </CardTitle>
                  <CardDescription>
                    Emails that couldn't be matched to customers automatically. Link them manually to enable analysis.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  onClick={() => manualSyncMutation.mutate()}
                  disabled={manualSyncMutation.isPending}
                  className="bg-[#875A7B] hover:bg-[#6d4863]"
                >
                  <Play className={`h-4 w-4 mr-2 ${manualSyncMutation.isPending ? 'animate-pulse' : ''}`} />
                  {manualSyncMutation.isPending ? "Syncing..." : "Sync Now"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {unmatchedLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3].map(i => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : unmatchedEmails && unmatchedEmails.length > 0 ? (
                <ScrollArea className="h-[400px]">
                  <div className="space-y-2">
                    {unmatchedEmails.map((email) => (
                      <div
                        key={email.id}
                        className="p-3 border rounded-lg hover:bg-muted/50 transition-colors"
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <span className="font-medium truncate">{email.senderName || email.email}</span>
                              {email.domain && (
                                <Badge variant="outline" className="text-xs">@{email.domain}</Badge>
                              )}
                            </div>
                            <p className="text-sm text-muted-foreground truncate">{email.subject || "(No subject)"}</p>
                            <p className="text-xs text-muted-foreground mt-1">
                              {email.messageDate && format(new Date(email.messageDate), "MMM d, yyyy h:mm a")}
                            </p>
                          </div>
                          <div className="flex gap-2">
                            {selectedUnmatchedId === email.id ? (
                              <div className="flex flex-col gap-2 w-64">
                                <Input
                                  placeholder="Search customer..."
                                  value={customerSearchQuery}
                                  onChange={(e) => setCustomerSearchQuery(e.target.value)}
                                  className="h-8 text-sm"
                                />
                                {customerSearchResults && customerSearchResults.length > 0 && (
                                  <div className="border rounded-md bg-background max-h-40 overflow-y-auto">
                                    {customerSearchResults.map((customer) => (
                                      <button
                                        key={customer.id}
                                        onClick={() => linkEmailMutation.mutate({ 
                                          unmatchedId: email.id, 
                                          customerId: customer.id 
                                        })}
                                        className="w-full text-left px-3 py-2 text-sm hover:bg-muted border-b last:border-b-0"
                                        disabled={linkEmailMutation.isPending}
                                      >
                                        <div className="font-medium truncate">
                                          {customer.company || `${customer.firstName} ${customer.lastName}`}
                                        </div>
                                        {customer.email && (
                                          <div className="text-xs text-muted-foreground truncate">
                                            {customer.email}
                                          </div>
                                        )}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => {
                                    setSelectedUnmatchedId(null);
                                    setCustomerSearchQuery("");
                                  }}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setSelectedUnmatchedId(email.id)}
                                >
                                  <Link2 className="h-4 w-4 mr-1" />
                                  Link
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-muted-foreground hover:text-red-500"
                                  onClick={() => ignoreEmailMutation.mutate({ 
                                    unmatchedId: email.id, 
                                    reason: "Manually ignored" 
                                  })}
                                  disabled={ignoreEmailMutation.isPending}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              ) : (
                <div className="py-12 text-center">
                  <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">All emails matched!</h3>
                  <p className="text-muted-foreground">No unmatched emails pending</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sync Debug Tab */}
        <TabsContent value="debug" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-blue-500" />
                    Email Sync Debug Panel
                  </CardTitle>
                  <CardDescription>
                    Detailed sync status, pipeline counters, and diagnostics
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => refetchSyncStatus()}
                    disabled={emailSyncStatusLoading}
                  >
                    <RefreshCw className={`h-4 w-4 mr-2 ${emailSyncStatusLoading ? 'animate-spin' : ''}`} />
                    Refresh
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => manualSyncMutation.mutate()}
                    disabled={manualSyncMutation.isPending}
                    className="bg-[#875A7B] hover:bg-[#6d4863]"
                  >
                    <Play className={`h-4 w-4 mr-2 ${manualSyncMutation.isPending ? 'animate-pulse' : ''}`} />
                    {manualSyncMutation.isPending ? "Running..." : "Run Full Sync"}
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              {emailSyncStatusLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-24 w-full" />
                  <Skeleton className="h-24 w-full" />
                </div>
              ) : emailSyncStatus ? (
                <>
                  {/* Connection Info */}
                  <div className="grid gap-4 md:grid-cols-2">
                    <div className="p-4 border rounded-lg">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Database className="h-4 w-4" />
                        Connection
                      </h4>
                      <div className="space-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <Badge variant={emailSyncStatus.connection?.connected ? "default" : "destructive"}>
                            {emailSyncStatus.connection?.connected ? "Connected" : "Disconnected"}
                          </Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account:</span>
                          <span className="font-mono text-xs">{emailSyncStatus.accountEmail || "N/A"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Query:</span>
                          <span className="font-mono text-xs">{emailSyncStatus.queryUsed}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Last Sync:</span>
                          <span>
                            {emailSyncStatus.lastSyncAt 
                              ? formatDistanceToNow(new Date(emailSyncStatus.lastSyncAt), { addSuffix: true })
                              : "Never"}
                          </span>
                        </div>
                        {emailSyncStatus.lastError && (
                          <div className="mt-2 p-2 bg-red-50 dark:bg-red-950 rounded text-xs text-red-600 dark:text-red-400">
                            <strong>Last Error:</strong> {emailSyncStatus.lastError}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Pipeline Counters */}
                    <div className="p-4 border rounded-lg">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Activity className="h-4 w-4" />
                        Pipeline Counters
                      </h4>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="p-2 bg-muted rounded">
                          <div className="text-xs text-muted-foreground">Fetched</div>
                          <div className="text-lg font-bold">{emailSyncStatus.counts?.fetched || 0}</div>
                        </div>
                        <div className="p-2 bg-muted rounded">
                          <div className="text-xs text-muted-foreground">Stored</div>
                          <div className="text-lg font-bold">{emailSyncStatus.counts?.stored || 0}</div>
                        </div>
                        <div className="p-2 bg-green-50 dark:bg-green-950 rounded">
                          <div className="text-xs text-green-600">Matched</div>
                          <div className="text-lg font-bold text-green-600">{emailSyncStatus.counts?.matched || 0}</div>
                        </div>
                        <div className="p-2 bg-amber-50 dark:bg-amber-950 rounded">
                          <div className="text-xs text-amber-600">Unmatched</div>
                          <div className="text-lg font-bold text-amber-600">{emailSyncStatus.counts?.unmatched || 0}</div>
                        </div>
                        <div className="p-2 bg-blue-50 dark:bg-blue-950 rounded">
                          <div className="text-xs text-blue-600">Linked</div>
                          <div className="text-lg font-bold text-blue-600">{emailSyncStatus.counts?.linked || 0}</div>
                        </div>
                        <div className="p-2 bg-gray-50 dark:bg-gray-900 rounded">
                          <div className="text-xs text-gray-500">Ignored</div>
                          <div className="text-lg font-bold text-gray-500">{emailSyncStatus.counts?.ignored || 0}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Event Extraction Pipeline */}
                  <div className="p-4 border rounded-lg">
                    <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                      <Zap className="h-4 w-4 text-purple-500" />
                      Event Extraction Pipeline
                    </h4>
                    <div className="grid grid-cols-4 gap-4">
                      <div className="text-center">
                        <div className="text-2xl font-bold">{emailSyncStatus.counts?.pending || 0}</div>
                        <div className="text-xs text-muted-foreground">Pending Analysis</div>
                      </div>
                      <div className="flex items-center justify-center">
                        <ArrowRight className="h-6 w-6 text-muted-foreground" />
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-green-600">{emailSyncStatus.counts?.processed || 0}</div>
                        <div className="text-xs text-muted-foreground">Processed</div>
                      </div>
                      <div className="text-center">
                        <div className="text-2xl font-bold text-purple-600">{emailSyncStatus.counts?.events || 0}</div>
                        <div className="text-xs text-muted-foreground">Events Extracted</div>
                      </div>
                    </div>
                    <div className="mt-4 flex items-center gap-4">
                      <Progress 
                        value={emailSyncStatus.counts?.stored 
                          ? ((emailSyncStatus.counts.processed || 0) / emailSyncStatus.counts.stored) * 100 
                          : 0
                        } 
                        className="flex-1" 
                      />
                      <span className="text-sm text-muted-foreground">
                        {emailSyncStatus.counts?.stored 
                          ? Math.round(((emailSyncStatus.counts.processed || 0) / emailSyncStatus.counts.stored) * 100)
                          : 0}% analyzed
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-muted-foreground">
                      Tasks created from events: <span className="font-medium">{emailSyncStatus.tasksCreatedFromEvents || 0}</span>
                    </div>
                  </div>

                  {/* Skip Reasons */}
                  {emailSyncStatus.skipReasonBreakdown && Object.keys(emailSyncStatus.skipReasonBreakdown).length > 0 && (
                    <div className="p-4 border rounded-lg">
                      <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                        <Unlink className="h-4 w-4 text-gray-500" />
                        Skip Reasons (Ignored Emails)
                      </h4>
                      <div className="space-y-2">
                        {Object.entries(emailSyncStatus.skipReasonBreakdown).map(([reason, count]) => (
                          <div key={reason} className="flex justify-between items-center text-sm">
                            <span className="text-muted-foreground">{reason}</span>
                            <Badge variant="outline">{count}</Badge>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="py-12 text-center">
                  <AlertTriangle className="h-12 w-12 mx-auto text-amber-500 mb-4" />
                  <h3 className="text-lg font-medium mb-2">No sync data available</h3>
                  <p className="text-muted-foreground mb-4">Run a sync to see debug information</p>
                  <Button onClick={() => manualSyncMutation.mutate()} disabled={manualSyncMutation.isPending}>
                    <Play className="h-4 w-4 mr-2" />
                    Run Full Sync
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Sales Events Tab - Intelligence Collection */}
        <TabsContent value="sales_events" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-500" />
                    Email Intelligence
                  </CardTitle>
                  <CardDescription>
                    AI-detected sales signals organized for action. Click event type to change if misidentified.
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => refetchSalesEvents()}
                  disabled={salesEventsLoading}
                >
                  <RefreshCw className={`h-4 w-4 mr-2 ${salesEventsLoading ? 'animate-spin' : ''}`} />
                  Refresh
                </Button>
              </div>
              
              {/* Category Tabs */}
              <div className="flex gap-1 mt-4 flex-wrap">
                {[
                  { id: 'all', label: 'All', icon: Mail },
                  { id: 'urgent', label: 'Urgent', icon: Zap },
                  { id: 'opportunities', label: 'Opportunities', icon: Target },
                  { id: 'commitments', label: 'Commitments', icon: Handshake },
                  { id: 'actions', label: 'Actions', icon: ListTodo },
                  { id: 'feedback', label: 'Feedback', icon: MessageSquare },
                ].map(cat => {
                  const CatIcon = cat.icon;
                  const count = cat.id === 'all' ? salesEvents?.total : getCategoryCount(cat.id);
                  return (
                    <Button
                      key={cat.id}
                      size="sm"
                      variant={salesEventCategory === cat.id ? 'default' : 'outline'}
                      onClick={() => setSalesEventCategory(cat.id)}
                      className="gap-1"
                    >
                      <CatIcon className="h-3 w-3" />
                      {cat.label}
                      {count ? <Badge variant="secondary" className="ml-1 text-xs">{count}</Badge> : null}
                    </Button>
                  );
                })}
              </div>
            </CardHeader>
            <CardContent>
              {salesEventsLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : salesEvents?.events && salesEvents.events.length > 0 ? (
                <div className="space-y-2">
                  <div className="text-xs text-muted-foreground mb-3">
                    {salesEvents.events.length} of {salesEvents.total} events
                  </div>
                  {salesEvents.events.map((event) => {
                    const config = salesEventTypeConfig[event.eventType] || { icon: Zap, label: event.eventType, color: "bg-gray-100 text-gray-800", description: "" };
                    const IconComponent = config.icon;
                    const senderDisplay = event.senderName || event.senderEmail?.split('@')[0] || 'Unknown';
                    const isEditing = editingEventId === event.id;
                    
                    return (
                      <div key={event.id} className={`flex items-center gap-3 p-3 rounded-lg border ${event.isProcessed ? 'border-l-4 border-l-green-500' : 'border-l-4 border-l-amber-500'} hover:bg-muted/50 transition-colors`}>
                        {/* Icon */}
                        <div className={`p-2 rounded-lg shrink-0 ${config.color}`}>
                          <IconComponent className="h-4 w-4" />
                        </div>
                        
                        {/* Main content */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* Event type - clickable to edit */}
                            {isEditing ? (
                              <Select
                                defaultValue={event.eventType}
                                onValueChange={(value) => {
                                  updateEventTypeMutation.mutate({ eventId: event.id, eventType: value });
                                }}
                              >
                                <SelectTrigger className="w-[140px] h-7 text-xs">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="po">Purchase Order</SelectItem>
                                  <SelectItem value="approval">Approval</SelectItem>
                                  <SelectItem value="sales_win">Sales Win</SelectItem>
                                  <SelectItem value="lead">New Lead</SelectItem>
                                  <SelectItem value="samples">Sample Request</SelectItem>
                                  <SelectItem value="urgent">Urgent</SelectItem>
                                  <SelectItem value="opportunity">Opportunity</SelectItem>
                                  <SelectItem value="commitment">Commitment</SelectItem>
                                  <SelectItem value="action">Action Needed</SelectItem>
                                  <SelectItem value="feedback">Feedback</SelectItem>
                                  <SelectItem value="quote_sent">Quote Sent</SelectItem>
                                  <SelectItem value="price_sent">Pricing Sent</SelectItem>
                                  <SelectItem value="pricelist_sent">Price List Sent</SelectItem>
                                </SelectContent>
                              </Select>
                            ) : (
                              <Badge 
                                className={`${config.color} cursor-pointer hover:opacity-80`}
                                onClick={() => setEditingEventId(event.id)}
                                title="Click to change event type"
                              >
                                {config.label}
                              </Badge>
                            )}
                            
                            {/* Sender */}
                            <span className="text-sm font-medium truncate max-w-[200px]" title={event.senderEmail}>
                              {senderDisplay}
                            </span>
                            
                            {/* Customer if matched */}
                            {event.customerName && (
                              <span className="text-xs text-muted-foreground flex items-center gap-1">
                                <Building2 className="h-3 w-3" />
                                {event.customerName}
                              </span>
                            )}
                            
                            {/* Direction badge */}
                            {event.direction === 'outbound' && (
                              <Badge variant="outline" className="text-xs">Sent</Badge>
                            )}
                            
                            {/* Task created indicator */}
                            {event.isProcessed && (
                              <CheckCircle2 className="h-4 w-4 text-green-500" title="Task created" />
                            )}
                          </div>
                          
                          {/* Subject line if available */}
                          {event.subject && (
                            <p className="text-xs text-muted-foreground truncate mt-1" title={event.subject}>
                              {event.subject}
                            </p>
                          )}
                        </div>
                        
                        {/* Right side - date and actions */}
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(event.occurredAt), "MMM d")}
                          </span>
                          
                          {/* Actions dropdown */}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
                                <MoreVertical className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditingEventId(event.id)}>
                                <Edit2 className="h-4 w-4 mr-2" />
                                Change Type
                              </DropdownMenuItem>
                              {event.senderEmail && (
                                <DropdownMenuItem 
                                  onClick={() => addToBlacklistMutation.mutate({ 
                                    pattern: event.senderEmail!, 
                                    reason: 'Excluded from event detection' 
                                  })}
                                >
                                  <Ban className="h-4 w-4 mr-2" />
                                  Blacklist Sender
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem 
                                onClick={() => deleteEventMutation.mutate(event.id)}
                                className="text-red-600"
                              >
                                <X className="h-4 w-4 mr-2" />
                                Dismiss Event
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-12 text-center">
                  <DollarSign className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No events in this category</h3>
                  <p className="text-muted-foreground mb-4">
                    {salesEventCategory === 'all' 
                      ? "Run an email sync to detect sales signals."
                      : "No events match this category filter."}
                  </p>
                  {salesEventCategory === 'all' && (
                    <Button onClick={() => manualSyncMutation.mutate()} disabled={manualSyncMutation.isPending}>
                      <Play className="h-4 w-4 mr-2" />
                      Run Full Sync
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Regular Insight Tabs Content - each tab gets its own TabsContent */}
        {["all", "urgent", "opportunity", "commitment", "action", "health"].map((tabValue) => (
          <TabsContent key={tabValue} value={tabValue} className="mt-4">
            {insightsLoading ? (
              <div className="space-y-3">
                {[1, 2, 3].map(i => (
                  <Card key={i}>
                    <CardHeader>
                      <Skeleton className="h-5 w-3/4" />
                      <Skeleton className="h-4 w-1/2" />
                    </CardHeader>
                  </Card>
                ))}
              </div>
            ) : insights && insights.length > 0 ? (
              <div>
                {insights.map(renderInsightCard)}
              </div>
            ) : (
              <Card>
                <CardContent className="py-12 text-center">
                  <Mail className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                  <h3 className="text-lg font-medium mb-2">No insights found</h3>
                  <p className="text-muted-foreground mb-4">
                    {statusFilter === "pending" 
                      ? "Great job! You've handled all your email insights."
                      : `No ${statusFilter} insights to show.`}
                  </p>
                  <Button onClick={() => syncMutation.mutate()} disabled={syncMutation.isPending}>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Sync Latest Emails
                  </Button>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        ))}
      </Tabs>

      <Dialog open={!!selectedInsight} onOpenChange={() => setSelectedInsight(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Insight</DialogTitle>
            <DialogDescription>
              Why are you dismissing this insight? This helps improve future suggestions.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            placeholder="Optional: Add a reason for dismissing..."
            value={dismissReason}
            onChange={(e) => setDismissReason(e.target.value)}
            className="min-h-[100px]"
          />
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setSelectedInsight(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                if (selectedInsight) {
                  updateStatusMutation.mutate({
                    id: selectedInsight.id,
                    status: "dismissed",
                    reason: dismissReason,
                  });
                }
              }}
              disabled={updateStatusMutation.isPending}
            >
              Dismiss
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      </div>
    </>
  );
}

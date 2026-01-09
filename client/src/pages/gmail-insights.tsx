import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow, isPast } from "date-fns";
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
  ExternalLink
} from "lucide-react";
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

interface InsightsSummary {
  totalPending: number;
  byType: Record<string, number>;
  urgent: number;
  overdue: number;
}

const insightTypeConfig: Record<string, { icon: any; label: string; color: string }> = {
  sales_opportunity: { icon: Target, label: "Sales Opportunity", color: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200" },
  promise: { icon: Handshake, label: "Promise Made", color: "bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200" },
  follow_up: { icon: Clock, label: "Follow-up Needed", color: "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200" },
  task: { icon: ListTodo, label: "Task", color: "bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200" },
  question: { icon: HelpCircle, label: "Unanswered Question", color: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200" },
};

const priorityConfig: Record<string, { color: string; label: string }> = {
  urgent: { color: "bg-red-500 text-white", label: "Urgent" },
  high: { color: "bg-orange-500 text-white", label: "High" },
  medium: { color: "bg-yellow-500 text-black", label: "Medium" },
  low: { color: "bg-gray-400 text-white", label: "Low" },
};

export default function GmailInsightsPage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("all");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [selectedInsight, setSelectedInsight] = useState<Insight | null>(null);
  const [dismissReason, setDismissReason] = useState("");
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());

  const { data: syncState, isLoading: syncStateLoading } = useQuery<SyncState>({
    queryKey: ["/api/gmail-intelligence/sync-state"],
  });

  const { data: summary, isLoading: summaryLoading } = useQuery<InsightsSummary>({
    queryKey: ["/api/gmail-intelligence/summary"],
  });

  const { data: insights, isLoading: insightsLoading } = useQuery<Insight[]>({
    queryKey: ["/api/gmail-intelligence/insights", { status: statusFilter, type: activeTab === "all" ? undefined : activeTab }],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.append("status", statusFilter);
      if (activeTab !== "all") params.append("type", activeTab);
      const response = await fetch(`/api/gmail-intelligence/insights?${params}`);
      if (!response.ok) throw new Error("Failed to fetch insights");
      return response.json();
    },
  });

  const syncMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", "/api/gmail-intelligence/sync", { maxMessages: 100 });
      return res.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/gmail-intelligence"] });
      toast({
        title: "Email Sync Complete",
        description: `Processed ${data.sync?.processedCount || 0} messages, found ${data.analysis?.insights || 0} new insights`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Could not sync emails. Make sure Gmail is connected.",
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
                <a href={`/clients/${insight.customer.id}`}>
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
        <Button
          onClick={() => syncMutation.mutate()}
          disabled={syncMutation.isPending}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${syncMutation.isPending ? 'animate-spin' : ''}`} />
          {syncMutation.isPending ? "Syncing..." : "Sync Emails"}
        </Button>
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
        <TabsList>
          <TabsTrigger value="all" className="gap-1">
            All
            {summary && summary.totalPending > 0 && (
              <Badge variant="secondary" className="ml-1">{summary.totalPending}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="promise" className="gap-1">
            <Handshake className="h-4 w-4" />
            Promises
            {summary?.byType?.promise && (
              <Badge variant="secondary" className="ml-1">{summary.byType.promise}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="follow_up" className="gap-1">
            <Clock className="h-4 w-4" />
            Follow-ups
            {summary?.byType?.follow_up && (
              <Badge variant="secondary" className="ml-1">{summary.byType.follow_up}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="sales_opportunity" className="gap-1">
            <Target className="h-4 w-4" />
            Opportunities
            {summary?.byType?.sales_opportunity && (
              <Badge variant="secondary" className="ml-1">{summary.byType.sales_opportunity}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="task" className="gap-1">
            <ListTodo className="h-4 w-4" />
            Tasks
            {summary?.byType?.task && (
              <Badge variant="secondary" className="ml-1">{summary.byType.task}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="question" className="gap-1">
            <HelpCircle className="h-4 w-4" />
            Questions
            {summary?.byType?.question && (
              <Badge variant="secondary" className="ml-1">{summary.byType.question}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value={activeTab} className="mt-4">
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
  );
}

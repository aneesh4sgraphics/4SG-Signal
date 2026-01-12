import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { format, formatDistanceToNow } from "date-fns";
import { 
  RefreshCw, 
  CheckCircle2, 
  AlertCircle,
  Mail,
  Database,
  Link2,
  Unlink,
  Zap,
  Clock,
  FileQuestion,
  Target,
  TrendingUp,
  DollarSign,
  Package,
  AlertTriangle,
  Timer,
  XCircle,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";

interface SyncStatus {
  connection: {
    connected: boolean;
    email: string;
    scopes: string[];
    error?: string;
  };
  syncState: {
    syncStatus: string;
    lastSyncedAt: string | null;
    lastQuery: string | null;
    threadsFound: number;
    messagesStored: number;
    matchedToCustomers: number;
    unmatchedCount: number;
    eventsExtracted: number;
    lastError: string | null;
    syncStartedAt: string | null;
    syncCompletedAt: string | null;
  } | null;
  totalMessages: number;
  pendingUnmatched: number;
}

interface UnmatchedEmail {
  id: number;
  email: string;
  domain: string;
  senderName: string;
  subject: string;
  messageDate: string;
  status: string;
}

interface SalesEvent {
  id: number;
  eventType: string;
  confidence: string;
  triggerText: string;
  occurredAt: string;
  customerId: string | null;
  customerName: string | null;
  isProcessed: boolean;
  coachingTip: string | null;
}

interface Customer {
  id: string;
  company: string;
  email: string;
}

const eventTypeConfig: Record<string, { icon: any; label: string; color: string }> = {
  po: { icon: DollarSign, label: "Purchase Order", color: "bg-green-100 text-green-800" },
  approval: { icon: CheckCircle2, label: "Approval", color: "bg-emerald-100 text-emerald-800" },
  samples: { icon: Package, label: "Samples", color: "bg-purple-100 text-purple-800" },
  urgent: { icon: AlertTriangle, label: "Urgent", color: "bg-red-100 text-red-800" },
  opportunity: { icon: Target, label: "Opportunity", color: "bg-blue-100 text-blue-800" },
  commitment: { icon: Clock, label: "Commitment", color: "bg-cyan-100 text-cyan-800" },
  action: { icon: Zap, label: "Action", color: "bg-orange-100 text-orange-800" },
  feedback: { icon: Lightbulb, label: "Feedback", color: "bg-yellow-100 text-yellow-800" },
};

export default function EmailSyncDebug() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [linkDialogOpen, setLinkDialogOpen] = useState(false);
  const [selectedUnmatched, setSelectedUnmatched] = useState<UnmatchedEmail | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [customerSearch, setCustomerSearch] = useState("");

  const { data: syncStatus, isLoading: statusLoading, refetch: refetchStatus } = useQuery<SyncStatus>({
    queryKey: ["/api/email-intelligence/sync-status"],
  });

  const { data: unmatchedEmails, isLoading: unmatchedLoading } = useQuery<UnmatchedEmail[]>({
    queryKey: ["/api/email-intelligence/unmatched"],
  });

  const { data: salesEvents, isLoading: eventsLoading } = useQuery<SalesEvent[]>({
    queryKey: ["/api/email-intelligence/events"],
  });

  const { data: eventsSummary } = useQuery<any[]>({
    queryKey: ["/api/email-intelligence/events/summary"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    select: (data: any) => data?.customers || data || [],
  });

  const syncMutation = useMutation({
    mutationFn: () => apiRequest("/api/email-intelligence/sync", { method: "POST" }),
    onSuccess: (data: any) => {
      toast({
        title: "Sync Complete",
        description: `Processed ${data.sync?.messagesProcessed || 0} messages, extracted ${data.eventsExtracted || 0} events, created ${data.tasksCreated || 0} tasks`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events/summary"] });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync Gmail",
        variant: "destructive",
      });
    },
  });

  const linkMutation = useMutation({
    mutationFn: ({ id, customerId }: { id: number; customerId: string }) =>
      apiRequest(`/api/email-intelligence/unmatched/${id}/link`, { 
        method: "POST", 
        body: JSON.stringify({ customerId }) 
      }),
    onSuccess: () => {
      toast({ title: "Email Linked", description: "Email successfully linked to customer" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      setLinkDialogOpen(false);
      setSelectedUnmatched(null);
    },
  });

  const ignoreMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest(`/api/email-intelligence/unmatched/${id}/ignore`, { 
        method: "POST",
        body: JSON.stringify({ reason: "Manually ignored" }) 
      }),
    onSuccess: () => {
      toast({ title: "Email Ignored" });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
    },
  });

  const enrichMutation = useMutation({
    mutationFn: () => apiRequest("/api/email-intelligence/events/enrich", { 
      method: "POST",
      body: JSON.stringify({ limit: 30 }) 
    }),
    onSuccess: (data: any) => {
      toast({
        title: "AI Coaching Added",
        description: `Generated coaching tips for ${data.enriched || 0} events`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events"] });
    },
    onError: (error: any) => {
      toast({
        title: "Enrichment Failed",
        description: error.message || "Failed to generate coaching tips",
        variant: "destructive",
      });
    },
  });

  const rematchMutation = useMutation({
    mutationFn: () => apiRequest("/api/email-intelligence/rematch", { 
      method: "POST",
      body: JSON.stringify({ limit: 500 }) 
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Re-match Complete",
        description: `Matched ${data.matched || 0} emails, ignored ${data.ignored || 0} (free/internal), ${data.stillUnmatched || 0} still need manual linking`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events/summary"] });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Re-match Failed",
        description: error.message || "Failed to re-match emails",
        variant: "destructive",
      });
    },
  });

  const reanalyzeMutation = useMutation({
    mutationFn: () => apiRequest("/api/email-intelligence/reanalyze", { 
      method: "POST",
      body: JSON.stringify({ limit: 500 }) 
    }),
    onSuccess: (data: any) => {
      toast({
        title: "Re-analysis Complete",
        description: `Extracted ${data.eventsExtracted || 0} events, detected ${data.staleThreadsDetected || 0} stale threads, created ${data.tasksCreated || 0} tasks`,
      });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/unmatched"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/sync-status"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events"] });
      queryClient.invalidateQueries({ queryKey: ["/api/email-intelligence/events/summary"] });
      refetchStatus();
    },
    onError: (error: any) => {
      toast({
        title: "Re-analysis Failed",
        description: error.message || "Failed to re-analyze emails",
        variant: "destructive",
      });
    },
  });

  const filteredCustomers = customers?.filter(c => 
    c.company?.toLowerCase().includes(customerSearch.toLowerCase()) ||
    c.email?.toLowerCase().includes(customerSearch.toLowerCase())
  ).slice(0, 20) || [];

  const renderConnectionStatus = () => {
    if (statusLoading) return <Skeleton className="h-24" />;
    
    const conn = syncStatus?.connection;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5" />
            Gmail Connection
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-3">
            {conn?.connected ? (
              <CheckCircle2 className="h-5 w-5 text-green-500" />
            ) : (
              <AlertCircle className="h-5 w-5 text-red-500" />
            )}
            <div>
              <p className="font-medium">{conn?.connected ? "Connected" : "Not Connected"}</p>
              {conn?.email && <p className="text-sm text-muted-foreground">{conn.email}</p>}
              {conn?.error && <p className="text-sm text-red-500">{conn.error}</p>}
            </div>
          </div>
          
          {conn?.scopes && conn.scopes.length > 0 && (
            <div>
              <p className="text-sm font-medium mb-2">Granted Scopes:</p>
              <div className="flex flex-wrap gap-1">
                {conn.scopes.map((scope, i) => (
                  <Badge key={i} variant="outline" className="text-xs">
                    {scope.split('/').pop()}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  const renderSyncStats = () => {
    if (statusLoading) return <Skeleton className="h-48" />;
    
    const state = syncStatus?.syncState;
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            Sync Statistics
          </CardTitle>
          <CardDescription>
            {state?.lastSyncedAt 
              ? `Last synced ${formatDistanceToNow(new Date(state.lastSyncedAt), { addSuffix: true })}`
              : "Never synced"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{syncStatus?.totalMessages || 0}</p>
              <p className="text-sm text-muted-foreground">Messages Stored</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{state?.matchedToCustomers || 0}</p>
              <p className="text-sm text-muted-foreground">Matched to Customers</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-amber-600">{syncStatus?.pendingUnmatched || 0}</p>
              <p className="text-sm text-muted-foreground">Unmatched</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold">{state?.threadsFound || 0}</p>
              <p className="text-sm text-muted-foreground">Threads Found</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <p className="text-2xl font-bold text-green-600">{state?.eventsExtracted || 0}</p>
              <p className="text-sm text-muted-foreground">Events Extracted</p>
            </div>
            <div className="text-center p-3 bg-muted rounded-lg">
              <Badge variant={state?.syncStatus === 'idle' ? 'default' : state?.syncStatus === 'error' ? 'destructive' : 'secondary'}>
                {state?.syncStatus || 'never_synced'}
              </Badge>
              <p className="text-sm text-muted-foreground mt-1">Status</p>
            </div>
          </div>
          
          {state?.lastQuery && (
            <div className="mt-4 p-3 bg-muted/50 rounded-lg">
              <p className="text-xs font-medium mb-1">Query Used:</p>
              <code className="text-xs">{state.lastQuery}</code>
            </div>
          )}
          
          {state?.lastError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
              <p className="text-sm font-medium text-red-600 dark:text-red-400">Last Error:</p>
              <p className="text-sm text-red-500">{state.lastError}</p>
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Email Intelligence - Sync Debug</h1>
          <p className="text-muted-foreground">Monitor Gmail sync, customer matching, and event extraction</p>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={() => reanalyzeMutation.mutate()} 
            disabled={reanalyzeMutation.isPending}
            variant="outline"
          >
            {reanalyzeMutation.isPending ? (
              <Sparkles className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4 mr-2" />
            )}
            Re-analyze Emails
          </Button>
          <Button 
            onClick={() => rematchMutation.mutate()} 
            disabled={rematchMutation.isPending}
            variant="outline"
          >
            {rematchMutation.isPending ? (
              <Link2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Link2 className="h-4 w-4 mr-2" />
            )}
            Re-match Unmatched
          </Button>
          <Button 
            onClick={() => syncMutation.mutate()} 
            disabled={syncMutation.isPending}
            size="lg"
          >
            {syncMutation.isPending ? (
              <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Sync Last 30 Days
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {renderConnectionStatus()}
        {renderSyncStats()}
      </div>

      <Tabs defaultValue="events">
        <TabsList>
          <TabsTrigger value="events" className="gap-2">
            <Zap className="h-4 w-4" />
            Sales Events
            {eventsSummary && eventsSummary.length > 0 && (
              <Badge variant="secondary">{eventsSummary.reduce((acc, e) => acc + parseInt(e.count), 0)}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="unmatched" className="gap-2">
            <Unlink className="h-4 w-4" />
            Unmatched Emails
            {syncStatus?.pendingUnmatched ? (
              <Badge variant="destructive">{syncStatus.pendingUnmatched}</Badge>
            ) : null}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="events" className="mt-4">
          {eventsSummary && eventsSummary.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
              {eventsSummary.map((summary: any) => {
                const config = eventTypeConfig[summary.event_type] || { icon: Zap, label: summary.event_type, color: "bg-gray-100 text-gray-800" };
                const Icon = config.icon;
                return (
                  <Card key={summary.event_type} className="p-3">
                    <div className="flex items-center gap-2">
                      <div className={`p-2 rounded ${config.color}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="text-lg font-bold">{summary.count}</p>
                        <p className="text-xs text-muted-foreground">{config.label}</p>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}

          {salesEvents && salesEvents.length > 0 && salesEvents.some(e => !e.coachingTip) && (
            <div className="mb-4 flex justify-end">
              <Button 
                variant="outline" 
                onClick={() => enrichMutation.mutate()} 
                disabled={enrichMutation.isPending}
              >
                {enrichMutation.isPending ? (
                  <Sparkles className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                Add AI Coaching Tips
              </Button>
            </div>
          )}

          {eventsLoading ? (
            <Skeleton className="h-64" />
          ) : salesEvents && salesEvents.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Event Type</TableHead>
                    <TableHead>Customer</TableHead>
                    <TableHead>Trigger</TableHead>
                    <TableHead>Coaching Tip</TableHead>
                    <TableHead>Confidence</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {salesEvents.map((event) => {
                    const config = eventTypeConfig[event.eventType] || { icon: Zap, label: event.eventType, color: "bg-gray-100 text-gray-800" };
                    const Icon = config.icon;
                    return (
                      <TableRow key={event.id}>
                        <TableCell>
                          <Badge className={config.color}>
                            <Icon className="h-3 w-3 mr-1" />
                            {config.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {event.customerName || <span className="text-muted-foreground">Unknown</span>}
                        </TableCell>
                        <TableCell className="max-w-xs truncate text-sm">
                          {event.triggerText || "-"}
                        </TableCell>
                        <TableCell className="max-w-sm">
                          {event.coachingTip ? (
                            <div className="flex items-start gap-2 text-sm">
                              <Lightbulb className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                              <span className="text-muted-foreground line-clamp-2">{event.coachingTip}</span>
                            </div>
                          ) : (
                            <span className="text-muted-foreground text-sm">-</span>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline">
                            {(parseFloat(event.confidence) * 100).toFixed(0)}%
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          {format(new Date(event.occurredAt), "MMM d, h:mm a")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <Zap className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                <h3 className="text-lg font-medium mb-2">No sales events detected</h3>
                <p className="text-muted-foreground">Sync your Gmail to start extracting sales events from emails.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        <TabsContent value="unmatched" className="mt-4">
          {unmatchedLoading ? (
            <Skeleton className="h-64" />
          ) : unmatchedEmails && unmatchedEmails.length > 0 ? (
            <Card>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Domain</TableHead>
                    <TableHead>Sender</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {unmatchedEmails.map((email) => (
                    <TableRow key={email.id}>
                      <TableCell className="font-medium">{email.email}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{email.domain}</Badge>
                      </TableCell>
                      <TableCell>{email.senderName || "-"}</TableCell>
                      <TableCell className="max-w-xs truncate text-sm">{email.subject}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {email.messageDate && format(new Date(email.messageDate), "MMM d")}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-2">
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => {
                              setSelectedUnmatched(email);
                              setLinkDialogOpen(true);
                            }}
                          >
                            <Link2 className="h-3 w-3 mr-1" />
                            Link
                          </Button>
                          <Button 
                            size="sm" 
                            variant="ghost"
                            onClick={() => ignoreMutation.mutate(email.id)}
                          >
                            Ignore
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </Card>
          ) : (
            <Card>
              <CardContent className="py-12 text-center">
                <CheckCircle2 className="h-12 w-12 mx-auto text-green-500 mb-4" />
                <h3 className="text-lg font-medium mb-2">All emails matched</h3>
                <p className="text-muted-foreground">No unmatched emails requiring attention.</p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      <Dialog open={linkDialogOpen} onOpenChange={setLinkDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Link Email to Customer</DialogTitle>
            <DialogDescription>
              Select a customer to link <strong>{selectedUnmatched?.email}</strong>
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <Input
              placeholder="Search customers..."
              value={customerSearch}
              onChange={(e) => setCustomerSearch(e.target.value)}
            />
            
            <div className="max-h-64 overflow-y-auto space-y-2">
              {filteredCustomers.map((customer) => (
                <div
                  key={customer.id}
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className={`p-3 rounded-lg cursor-pointer border ${
                    selectedCustomerId === customer.id 
                      ? 'border-primary bg-primary/5' 
                      : 'border-transparent hover:bg-muted'
                  }`}
                >
                  <p className="font-medium">{customer.company}</p>
                  <p className="text-sm text-muted-foreground">{customer.email}</p>
                </div>
              ))}
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setLinkDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={() => {
                if (selectedUnmatched && selectedCustomerId) {
                  linkMutation.mutate({ id: selectedUnmatched.id, customerId: selectedCustomerId });
                }
              }}
              disabled={!selectedCustomerId || linkMutation.isPending}
            >
              Link Customer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

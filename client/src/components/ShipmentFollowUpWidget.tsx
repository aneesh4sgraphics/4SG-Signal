import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { formatDistanceToNow, isPast, format, addWeeks } from "date-fns";
import { 
  Package, 
  CheckCircle2, 
  X, 
  Clock, 
  AlertTriangle,
  Truck,
  Mail,
  Building2,
  ChevronRight,
  Send,
  Reply,
  CalendarPlus,
  Trophy,
  ThumbsDown,
  ExternalLink,
  User
} from "lucide-react";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ShipmentFollowUpTask {
  id: number;
  shipmentType: string;
  carrier: string | null;
  trackingNumber: string | null;
  subject: string | null;
  recipientEmail: string | null;
  recipientName: string | null;
  customerCompany: string | null;
  customerId: string | null;
  sentAt: string | null;
  followUpDueDate: string;
  status: string;
  reminderCount: number;
  createdAt: string;
}

const shipmentTypeLabels: Record<string, { label: string; icon: string }> = {
  swatchbook: { label: "Swatchbook", icon: "🎨" },
  press_test_kit: { label: "Press Test Kit", icon: "🧪" },
  samples: { label: "Samples", icon: "📦" },
  package: { label: "Package", icon: "📬" },
};

const carrierLabels: Record<string, string> = {
  ups: "UPS",
  fedex: "FedEx",
  usps: "USPS",
  dhl: "DHL",
};

const lostSaleReasons = [
  "Price too high",
  "Went with competitor",
  "No longer needs product",
  "Budget constraints",
  "Quality concerns from samples",
  "Timing not right",
  "No response after multiple follow-ups",
  "Product doesn't meet requirements",
  "Other",
];

export default function ShipmentFollowUpWidget() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedTask, setSelectedTask] = useState<ShipmentFollowUpTask | null>(null);
  const [showLostSaleDialog, setShowLostSaleDialog] = useState(false);
  const [lostSaleReason, setLostSaleReason] = useState("");
  const [lostSaleNotes, setLostSaleNotes] = useState("");
  const [emailSubject, setEmailSubject] = useState("");
  const [emailBody, setEmailBody] = useState("");
  const [showEmailCompose, setShowEmailCompose] = useState(false);
  const [emailMode, setEmailMode] = useState<"send" | "reply">("send");

  const { data: tasks, isLoading } = useQuery<ShipmentFollowUpTask[]>({
    queryKey: ["/api/shipment-followups", { status: "pending" }],
    queryFn: async () => {
      const res = await fetch("/api/shipment-followups?status=pending");
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
    refetchInterval: 60000,
  });

  const completeMutation = useMutation({
    mutationFn: async ({ taskId, outcome, reason }: { taskId: number; outcome?: string; reason?: string }) => {
      const res = await apiRequest("PATCH", `/api/shipment-followups/${taskId}/complete`, { outcome, reason });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-followups"] });
      setSelectedTask(null);
      toast({
        title: "Task completed",
        description: "Follow-up marked as done!",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to complete task",
        variant: "destructive",
      });
    },
  });

  const remindMutation = useMutation({
    mutationFn: async (taskId: number) => {
      const nextWeek = addWeeks(new Date(), 1);
      const res = await apiRequest("PATCH", `/api/shipment-followups/${taskId}/remind`, {
        followUpDueDate: nextWeek.toISOString(),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-followups"] });
      setSelectedTask(null);
      toast({
        title: "Reminder set",
        description: "Follow-up rescheduled to next week",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to set reminder",
        variant: "destructive",
      });
    },
  });

  const dismissMutation = useMutation({
    mutationFn: async ({ taskId, reason }: { taskId: number; reason: string }) => {
      const res = await apiRequest("PATCH", `/api/shipment-followups/${taskId}/dismiss`, {
        reason,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-followups"] });
      setSelectedTask(null);
      setShowLostSaleDialog(false);
      toast({
        title: "Marked as lost",
        description: "Follow-up dismissed and objection recorded",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to dismiss task",
        variant: "destructive",
      });
    },
  });

  const recordObjectionMutation = useMutation({
    mutationFn: async ({ customerId, reason, notes }: { customerId: string; reason: string; notes: string }) => {
      const res = await apiRequest("POST", `/api/crm/objections`, {
        customerId,
        reason,
        notes,
        source: "shipment_followup",
      });
      return res.json();
    },
  });

  const sendEmailMutation = useMutation({
    mutationFn: async ({ to, subject, body }: { to: string; subject: string; body: string }) => {
      const res = await apiRequest("POST", `/api/gmail/send`, {
        to,
        subject,
        body,
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/shipment-followups"] });
      setShowEmailCompose(false);
      setEmailSubject("");
      setEmailBody("");
      toast({
        title: "Email sent",
        description: "Your email has been sent successfully",
      });
    },
    onError: () => {
      toast({
        title: "Error",
        description: "Failed to send email",
        variant: "destructive",
      });
    },
  });

  const handleWonSale = () => {
    if (!selectedTask) return;
    completeMutation.mutate({ taskId: selectedTask.id, outcome: "won" });
  };

  const handleLostSale = () => {
    if (!selectedTask) return;
    
    const fullReason = lostSaleNotes 
      ? `${lostSaleReason}: ${lostSaleNotes}` 
      : lostSaleReason;
    
    if (selectedTask.customerId) {
      recordObjectionMutation.mutate({
        customerId: selectedTask.customerId,
        reason: lostSaleReason,
        notes: lostSaleNotes,
      });
    }
    
    dismissMutation.mutate({ taskId: selectedTask.id, reason: fullReason });
  };

  const handleSendEmail = () => {
    if (!selectedTask?.recipientEmail) return;
    setEmailMode("send");
    setEmailSubject(`Following up on your ${shipmentTypeLabels[selectedTask.shipmentType]?.label || "samples"}`);
    setEmailBody(`Hi ${selectedTask.recipientName || "there"},

I wanted to follow up on the ${shipmentTypeLabels[selectedTask.shipmentType]?.label.toLowerCase() || "samples"} we sent you recently. 

Have you had a chance to review them? I'd love to hear your thoughts and answer any questions you might have.

Please let me know if you'd like to discuss pricing or place an order.

Best regards`);
    setShowEmailCompose(true);
  };

  const handleReplyEmail = () => {
    if (!selectedTask?.recipientEmail) return;
    setEmailMode("reply");
    setEmailSubject(`Re: ${selectedTask.subject || `Your ${shipmentTypeLabels[selectedTask.shipmentType]?.label || "samples"}`}`);
    setEmailBody("");
    setShowEmailCompose(true);
  };

  const handleRemindNextWeek = () => {
    if (!selectedTask) return;
    remindMutation.mutate(selectedTask.id);
  };

  const openTaskDialog = (task: ShipmentFollowUpTask) => {
    setSelectedTask(task);
  };

  if (isLoading) {
    return (
      <Card className="border-2 border-dashed border-orange-200 dark:border-orange-800">
        <CardHeader className="pb-2">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-orange-500" />
            Shipment Follow-ups
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!tasks || tasks.length === 0) {
    return null;
  }

  const overdueTasks = tasks.filter(t => isPast(new Date(t.followUpDueDate)));
  const upcomingTasks = tasks.filter(t => !isPast(new Date(t.followUpDueDate)));

  return (
    <>
      <Card className="border-2 border-orange-200 dark:border-orange-800 bg-gradient-to-br from-orange-50 to-amber-50 dark:from-orange-950 dark:to-amber-950">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg flex items-center gap-2">
              <Package className="h-5 w-5 text-orange-500" />
              Shipment Follow-ups
              {overdueTasks.length > 0 && (
                <Badge variant="destructive" className="ml-2">
                  {overdueTasks.length} overdue
                </Badge>
              )}
            </CardTitle>
            <Badge variant="outline" className="text-orange-600 border-orange-300">
              {tasks.length} pending
            </Badge>
          </div>
          <CardDescription>
            Customers awaiting response after receiving samples
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {overdueTasks.length > 0 && (
            <div className="bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 rounded-lg p-2 mb-3">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300 text-sm font-medium mb-1">
                <AlertTriangle className="h-4 w-4" />
                Overdue - Follow up now!
              </div>
            </div>
          )}

          {tasks.slice(0, 5).map((task) => {
            const isOverdue = isPast(new Date(task.followUpDueDate));
            const typeConfig = shipmentTypeLabels[task.shipmentType] || { label: task.shipmentType, icon: "📦" };

            return (
              <div
                key={task.id}
                onClick={() => openTaskDialog(task)}
                className={`p-3 rounded-lg border cursor-pointer transition-all hover:shadow-md ${
                  isOverdue 
                    ? "bg-red-50 dark:bg-red-950 border-red-200 dark:border-red-700 hover:bg-red-100 dark:hover:bg-red-900" 
                    : "bg-white dark:bg-gray-900 border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-lg">{typeConfig.icon}</span>
                      <span className="font-medium text-sm truncate">
                        {task.customerCompany || task.recipientName || task.recipientEmail || "Unknown"}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                      <Badge variant="secondary" className="text-xs">
                        {typeConfig.label}
                      </Badge>
                      {task.carrier && (
                        <span className="flex items-center gap-1">
                          <Truck className="h-3 w-3" />
                          {carrierLabels[task.carrier] || task.carrier}
                        </span>
                      )}
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Sent {task.sentAt ? formatDistanceToNow(new Date(task.sentAt), { addSuffix: true }) : "recently"}
                      </span>
                    </div>

                    <div className={`text-xs mt-1 ${isOverdue ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"}`}>
                      {isOverdue ? (
                        <span className="flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          Overdue by {formatDistanceToNow(new Date(task.followUpDueDate))}
                          {task.reminderCount > 0 && ` (reminded ${task.reminderCount}x)`}
                        </span>
                      ) : (
                        <span>Follow up {formatDistanceToNow(new Date(task.followUpDueDate), { addSuffix: true })}</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {task.customerId && (
                      <Button
                        variant="ghost"
                        size="sm"
                        asChild
                        className="h-8 w-8 p-0"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Link href={`/clients/${task.customerId}`}>
                          <Building2 className="h-4 w-4 text-muted-foreground" />
                        </Link>
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        completeMutation.mutate({ taskId: task.id });
                      }}
                      disabled={completeMutation.isPending}
                      className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-100"
                      title="Mark as done"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        dismissMutation.mutate({ taskId: task.id, reason: "Manually dismissed" });
                      }}
                      disabled={dismissMutation.isPending}
                      className="h-8 w-8 p-0 text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                      title="Dismiss"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}

          {tasks.length > 5 && (
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/gmail-insights">
                View all {tasks.length} follow-ups
                <ChevronRight className="h-4 w-4 ml-1" />
              </Link>
            </Button>
          )}
        </CardContent>
      </Card>

      {/* Task Detail Dialog */}
      <Dialog open={!!selectedTask && !showLostSaleDialog && !showEmailCompose} onOpenChange={(open) => !open && setSelectedTask(null)}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="text-2xl">{shipmentTypeLabels[selectedTask?.shipmentType || ""]?.icon || "📦"}</span>
              Follow-up: {selectedTask?.customerCompany || selectedTask?.recipientName || "Customer"}
            </DialogTitle>
            <DialogDescription>
              {shipmentTypeLabels[selectedTask?.shipmentType || ""]?.label || "Shipment"} sent {selectedTask?.sentAt ? formatDistanceToNow(new Date(selectedTask.sentAt), { addSuffix: true }) : "recently"}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            {/* Customer Details */}
            <div className="bg-muted/50 rounded-lg p-4 space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-muted-foreground" />
                <span className="font-medium">{selectedTask?.recipientName || "Unknown"}</span>
              </div>
              {selectedTask?.recipientEmail && (
                <div className="flex items-center gap-2">
                  <Mail className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedTask.recipientEmail}</span>
                </div>
              )}
              {selectedTask?.customerCompany && (
                <div className="flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{selectedTask.customerCompany}</span>
                </div>
              )}
              {selectedTask?.carrier && (
                <div className="flex items-center gap-2">
                  <Truck className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm">{carrierLabels[selectedTask.carrier] || selectedTask.carrier}</span>
                  {selectedTask.trackingNumber && (
                    <Badge variant="outline" className="text-xs">{selectedTask.trackingNumber}</Badge>
                  )}
                </div>
              )}
            </div>

            {/* Subject if available */}
            {selectedTask?.subject && (
              <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg border border-blue-200 dark:border-blue-800">
                <div className="text-xs text-muted-foreground mb-1">Original Email Subject</div>
                <div className="text-sm font-medium">{selectedTask.subject}</div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-3">
              <div className="text-sm font-medium text-muted-foreground">Quick Actions</div>
              
              <div className="grid grid-cols-2 gap-2">
                <Button 
                  onClick={handleSendEmail}
                  className="bg-[#875A7B] hover:bg-[#6d4863]"
                  disabled={!selectedTask?.recipientEmail}
                >
                  <Send className="h-4 w-4 mr-2" />
                  Send Email
                </Button>
                <Button 
                  variant="outline"
                  onClick={handleReplyEmail}
                  disabled={!selectedTask?.recipientEmail}
                >
                  <Reply className="h-4 w-4 mr-2" />
                  Reply Email
                </Button>
              </div>

              <Button 
                variant="outline" 
                className="w-full"
                onClick={handleRemindNextWeek}
                disabled={remindMutation.isPending}
              >
                <CalendarPlus className="h-4 w-4 mr-2" />
                Remind Me Next Week
              </Button>

              <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                <Button 
                  variant="default"
                  className="bg-green-600 hover:bg-green-700"
                  onClick={handleWonSale}
                  disabled={completeMutation.isPending}
                >
                  <Trophy className="h-4 w-4 mr-2" />
                  Won Sale
                </Button>
                <Button 
                  variant="outline"
                  className="border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-950"
                  onClick={() => setShowLostSaleDialog(true)}
                >
                  <ThumbsDown className="h-4 w-4 mr-2" />
                  Lost Sale
                </Button>
              </div>
            </div>

            {/* View Customer & Email Links */}
            {selectedTask?.customerId && (
              <div className="flex flex-col gap-2">
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link href={`/clients/${selectedTask.customerId}`}>
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View Customer Profile
                  </Link>
                </Button>
                <Button variant="ghost" size="sm" className="w-full" asChild>
                  <Link href={`/clients/${selectedTask.customerId}?tab=emails`}>
                    <Mail className="h-4 w-4 mr-2" />
                    View Sent Emails
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Lost Sale Reason Dialog */}
      <Dialog open={showLostSaleDialog} onOpenChange={setShowLostSaleDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ThumbsDown className="h-5 w-5 text-red-500" />
              Record Lost Sale
            </DialogTitle>
            <DialogDescription>
              Help us improve by recording why this sale was lost. This will be added to the objection summary.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Reason for lost sale</Label>
              <Select value={lostSaleReason} onValueChange={setLostSaleReason}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a reason..." />
                </SelectTrigger>
                <SelectContent>
                  {lostSaleReasons.map((reason) => (
                    <SelectItem key={reason} value={reason}>{reason}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Additional notes (optional)</Label>
              <Textarea
                placeholder="Any additional context about why the sale was lost..."
                value={lostSaleNotes}
                onChange={(e) => setLostSaleNotes(e.target.value)}
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowLostSaleDialog(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleLostSale}
              disabled={!lostSaleReason || dismissMutation.isPending}
            >
              Record Lost Sale
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Email Compose Dialog */}
      <Dialog open={showEmailCompose} onOpenChange={setShowEmailCompose}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-[#875A7B]" />
              {emailMode === "reply" ? "Reply to Email" : "Send Follow-up Email"}
            </DialogTitle>
            <DialogDescription>
              To: {selectedTask?.recipientEmail}
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Subject</Label>
              <input
                type="text"
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                value={emailSubject}
                onChange={(e) => setEmailSubject(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label>Message</Label>
              <Textarea
                placeholder="Write your message..."
                value={emailBody}
                onChange={(e) => setEmailBody(e.target.value)}
                rows={8}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEmailCompose(false)}>
              Cancel
            </Button>
            <Button 
              className="bg-[#875A7B] hover:bg-[#6d4863]"
              onClick={() => {
                if (selectedTask?.recipientEmail) {
                  sendEmailMutation.mutate({
                    to: selectedTask.recipientEmail,
                    subject: emailSubject,
                    body: emailBody,
                  });
                }
              }}
              disabled={!emailSubject || !emailBody || sendEmailMutation.isPending}
            >
              <Send className="h-4 w-4 mr-2" />
              {sendEmailMutation.isPending ? "Sending..." : "Send Email"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

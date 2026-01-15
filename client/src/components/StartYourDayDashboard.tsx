import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import {
  Sun,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Calendar,
  Package,
  FileText,
  Phone,
  Mail,
  ChevronRight,
  User,
  Building2,
  TrendingUp,
  RefreshCw,
  Filter,
  Flame,
  Users,
  UserCog,
  Lightbulb,
  ArrowRight,
  Zap,
} from "lucide-react";
import { Link } from "wouter";
import { format, formatDistanceToNow, isToday, isPast, isFuture, addDays } from "date-fns";
import type { FollowUpTask, CustomerActivityEvent, Customer } from "@shared/schema";
import { QuoteFollowUpNotifications, QuoteFollowUpReminders } from "./QuoteFollowUpNotifications";

interface AuthUser {
  email: string;
  role: string;
  status: string;
  id?: string;
}

interface TaskWithCustomer extends FollowUpTask {
  customer?: Customer;
}

interface DashboardStats {
  todayTasks: number;
  overdueTasks: number;
  pendingTasks: number;
  idleAccounts: number;
  pendingSamples: number;
  recentActivity: number;
}

interface CriticalClient {
  customerId: string;
  displayName: string;
  score: number;
  reasonCode: string;
  reasonText: string;
  recommendedAction: string;
  priority: 'critical' | 'high' | 'medium';
}

export default function StartYourDayDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskView, setTaskView] = useState<'my' | 'team'>('my');
  const [completedCriticalClients, setCompletedCriticalClients] = useState<Set<string>>(new Set());
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationShown, setCelebrationShown] = useState(false);

  // Get current user to determine if admin and to filter tasks
  const { data: currentUser } = useQuery<AuthUser>({
    queryKey: ["/api/auth/user"],
  });

  const isAdmin = currentUser?.role === 'admin';
  // Use email as primary identifier since that's how tasks are typically assigned
  const currentUserEmail = currentUser?.email;

  const { data: todayTasks, isLoading: loadingToday } = useQuery<FollowUpTask[]>({
    queryKey: ["/api/customer-activity/follow-ups/today"],
  });

  const { data: overdueTasks, isLoading: loadingOverdue } = useQuery<FollowUpTask[]>({
    queryKey: ["/api/customer-activity/follow-ups/overdue"],
  });

  const { data: allTasks } = useQuery<FollowUpTask[]>({
    queryKey: ["/api/customer-activity/follow-ups"],
  });

  const { data: recentEvents } = useQuery<CustomerActivityEvent[]>({
    queryKey: ["/api/customer-activity/events"],
  });

  const { data: customersData } = useQuery<Customer[] | { data: Customer[] }>({
    queryKey: ["/api/customers"],
  });
  
  // Normalize customers data - handle both array and paginated response formats
  const customers = Array.isArray(customersData) ? customersData : (customersData?.data || []);

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/customer-activity/dashboard-stats"],
  });

  const { data: criticalClients, isLoading: loadingCriticalClients } = useQuery<CriticalClient[]>({
    queryKey: ["/api/dashboard/critical-clients"],
  });

  // SPOTLIGHT session stats for daily quota
  const { data: spotlightSession } = useQuery<{
    totalTarget: number;
    totalCompleted: number;
    buckets: { name: string; target: number; completed: number }[];
    dayComplete: boolean;
  }>({
    queryKey: ["/api/spotlight/session"],
  });

  // Filter tasks by assignment for admin view
  const filterTasksByOwnership = (tasks: FollowUpTask[] | undefined, isMyTasks: boolean) => {
    if (!tasks) return [];
    if (!isAdmin) return tasks; // Non-admins see all their tasks
    
    return tasks.filter(task => {
      // Check if task is assigned to current user by email or ID
      const isAssignedToMe = task.assignedTo === currentUserEmail || 
                             task.assignedTo === currentUser?.id;
      // Unassigned tasks show in My Tasks for admins
      const isUnassigned = !task.assignedTo;
      
      if (isMyTasks) {
        return isAssignedToMe || isUnassigned;
      } else {
        return !isAssignedToMe && !isUnassigned;
      }
    });
  };

  const myTodayTasks = filterTasksByOwnership(todayTasks, true);
  const teamTodayTasks = filterTasksByOwnership(todayTasks, false);
  const myOverdueTasks = filterTasksByOwnership(overdueTasks, true);
  const teamOverdueTasks = filterTasksByOwnership(overdueTasks, false);
  const myPendingTasks = filterTasksByOwnership(allTasks?.filter(t => t.status === 'pending'), true);
  const teamPendingTasks = filterTasksByOwnership(allTasks?.filter(t => t.status === 'pending'), false);

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("POST", `/api/customer-activity/follow-ups/${taskId}/complete`, {
        completionNotes: "Completed from dashboard",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/follow-ups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/follow-ups/today"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/follow-ups/overdue"] });
      toast({
        title: "Task completed",
        description: "The follow-up task has been marked as complete.",
      });
    },
  });

  // Handle marking a critical client as worked on
  const handleCompleteCriticalClient = (customerId: string) => {
    setCompletedCriticalClients(prev => {
      const newSet = new Set(prev);
      newSet.add(customerId);
      return newSet;
    });
    toast({
      title: "Great work!",
      description: "Client marked as worked on for today.",
    });
  };

  // Show celebration when 5 critical clients are completed
  useEffect(() => {
    if (completedCriticalClients.size >= 5 && !celebrationShown) {
      setShowCelebration(true);
      setCelebrationShown(true);
    }
  }, [completedCriticalClients, celebrationShown]);

  // Handle loading more tasks after celebration
  const handleLoadMoreTasks = () => {
    setCompletedCriticalClients(new Set());
    setCelebrationShown(false);
    setShowCelebration(false);
    queryClient.invalidateQueries({ queryKey: ["/api/dashboard/critical-clients"] });
    toast({
      title: "New clients loaded!",
      description: "5 more clients to work on. Keep up the great work!",
    });
  };

  const getCustomerName = (customerId: string) => {
    const customer = customers?.find(c => c.id === customerId);
    if (customer) {
      if (customer.company) return customer.company;
      if (customer.firstName || customer.lastName) {
        return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
      }
    }
    return customerId;
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'normal': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const getTaskTypeIcon = (taskType: string | undefined | null) => {
    if (!taskType) return Clock;
    if (taskType.includes('quote')) return FileText;
    if (taskType.includes('sample')) return Package;
    if (taskType.includes('call')) return Phone;
    if (taskType.includes('email')) return Mail;
    return Clock;
  };

  const pendingTasks = allTasks?.filter(t => t.status === 'pending') || [];
  const completedToday = allTasks?.filter(t => 
    t.status === 'completed' && 
    t.completedAt && 
    isToday(new Date(t.completedAt))
  ) || [];
  
  // Email Intelligence tasks (email engagement type)
  const emailTasks = allTasks?.filter(t => 
    t.status === 'pending' && 
    t.taskType?.includes('email')
  ) || [];

  // Calculate stats based on current view
  const displayedTodayTasks = taskView === 'my' ? myTodayTasks : teamTodayTasks;
  const displayedOverdueTasks = taskView === 'my' ? myOverdueTasks : teamOverdueTasks;
  const displayedPendingTasks = taskView === 'my' ? myPendingTasks : teamPendingTasks;

  const stats: DashboardStats = dashboardStats || {
    todayTasks: displayedTodayTasks?.length || 0,
    overdueTasks: displayedOverdueTasks?.length || 0,
    pendingTasks: displayedPendingTasks.length,
    idleAccounts: 0,
    pendingSamples: 0,
    recentActivity: recentEvents?.length || 0,
  };

  const renderTaskCard = (task: FollowUpTask, isOverdue: boolean = false) => {
    const TaskIcon = getTaskTypeIcon(task.taskType);
    const dueDate = new Date(task.dueDate);
    
    return (
      <div 
        key={task.id}
        data-testid={`task-card-${task.id}`}
        className={`p-4 border rounded-lg transition-all hover:shadow-md ${
          isOverdue ? 'border-red-200 bg-red-50/50' : 'border-border bg-card'
        }`}
      >
        <div className="flex items-start gap-3">
          <Checkbox 
            data-testid={`task-complete-${task.id}`}
            checked={task.status === 'completed'}
            disabled={completeTaskMutation.isPending}
            onCheckedChange={() => completeTaskMutation.mutate(task.id)}
            className="mt-1"
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <TaskIcon className="h-4 w-4 text-muted-foreground" />
              <span className="font-medium truncate">{task.title}</span>
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-2">
              <Building2 className="h-3.5 w-3.5" />
              <span className="truncate">{getCustomerName(task.customerId)}</span>
            </div>
            {task.description && (
              <p className="text-sm text-muted-foreground line-clamp-2 mb-2">
                {task.description}
              </p>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="outline" className={getPriorityColor(task.priority)}>
                {task.priority}
              </Badge>
              <Badge variant="outline" className={isOverdue ? 'border-red-300 text-red-600' : ''}>
                <Calendar className="h-3 w-3 mr-1" />
                {isOverdue ? `Overdue: ${formatDistanceToNow(dueDate, { addSuffix: true })}` : format(dueDate, 'MMM d, yyyy')}
              </Badge>
              {task.assignedToName && (
                <Badge variant="outline" className="bg-green-50 border-green-200 text-green-700">
                  <UserCog className="h-3 w-3 mr-1" />
                  {task.assignedToName}
                </Badge>
              )}
              {task.isAutoGenerated && (
                <Badge variant="secondary" className="text-xs">
                  Auto-created
                </Badge>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  const renderActivityItem = (event: CustomerActivityEvent) => {
    const eventDate = new Date(event.eventDate || event.createdAt!);
    const getEventIcon = () => {
      if (event.eventType.includes('quote')) return FileText;
      if (event.eventType.includes('sample')) return Package;
      if (event.eventType.includes('call')) return Phone;
      if (event.eventType.includes('email')) return Mail;
      return Clock;
    };
    const EventIcon = getEventIcon();
    
    return (
      <div 
        key={event.id}
        data-testid={`activity-item-${event.id}`}
        className="flex items-start gap-3 p-3 border-b last:border-0"
      >
        <div className="p-2 rounded-full bg-muted">
          <EventIcon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-medium text-sm truncate">{event.title}</p>
          <p className="text-sm text-muted-foreground">{getCustomerName(event.customerId)}</p>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDistanceToNow(eventDate, { addSuffix: true })}
          </p>
        </div>
      </div>
    );
  };

  if (loadingToday || loadingOverdue) {
    return (
      <div className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Skeleton className="h-10 w-10 rounded-full" />
          <div>
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-4 w-32 mt-1" />
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map(i => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="start-your-day-dashboard">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full bg-amber-100">
            <Sun className="h-8 w-8 text-amber-600" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">Start Your Day</h1>
            <p className="text-muted-foreground">
              {format(new Date(), 'EEEE, MMMM d, yyyy')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isAdmin && (
            <div className="flex bg-muted rounded-lg p-1" data-testid="task-view-toggle">
              <Button
                variant={taskView === 'my' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTaskView('my')}
                className="gap-2"
                data-testid="btn-my-tasks"
              >
                <User className="h-4 w-4" />
                My Tasks
                <Badge variant="secondary" className="ml-1">{myPendingTasks.length}</Badge>
              </Button>
              <Button
                variant={taskView === 'team' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setTaskView('team')}
                className="gap-2"
                data-testid="btn-team-tasks"
              >
                <Users className="h-4 w-4" />
                Team Tasks
                <Badge variant="secondary" className="ml-1">{teamPendingTasks.length}</Badge>
              </Button>
            </div>
          )}
          <Button 
            variant="outline" 
            size="sm"
            onClick={() => {
              queryClient.invalidateQueries({ queryKey: ["/api/customer-activity"] });
            }}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
        <Link href="/spotlight">
          <Card data-testid="stat-spotlight-tasks" className="cursor-pointer transition-all hover:shadow-md border-purple-200 bg-gradient-to-br from-purple-50 to-white">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-purple-600">SPOTLIGHT</p>
                  <p className="text-3xl font-bold text-purple-700">
                    {spotlightSession?.totalCompleted || 0}
                    <span className="text-lg text-purple-400">/{spotlightSession?.totalTarget || 30}</span>
                  </p>
                  <div className="w-full bg-purple-100 rounded-full h-1.5 mt-1">
                    <div 
                      className="bg-purple-600 h-1.5 rounded-full transition-all" 
                      style={{ width: `${Math.min(100, ((spotlightSession?.totalCompleted || 0) / (spotlightSession?.totalTarget || 30)) * 100)}%` }}
                    />
                  </div>
                </div>
                <div className="p-3 rounded-full bg-purple-100">
                  <Zap className="h-6 w-6 text-purple-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/tasks?filter=overdue">
          <Card data-testid="stat-overdue-tasks" className={`cursor-pointer transition-all hover:shadow-md ${stats.overdueTasks > 0 ? 'border-red-200 bg-red-50/30' : ''}`}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Overdue</p>
                  <p className={`text-3xl font-bold ${stats.overdueTasks > 0 ? 'text-red-600' : ''}`}>
                    {stats.overdueTasks}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${stats.overdueTasks > 0 ? 'bg-red-100' : 'bg-gray-100'}`}>
                  <AlertTriangle className={`h-6 w-6 ${stats.overdueTasks > 0 ? 'text-red-600' : 'text-gray-400'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/hot-leads">
          <Card 
            data-testid="stat-hot-leads" 
            className={`cursor-pointer transition-all hover:shadow-md ${
              (customers?.filter(c => c.isHotProspect).length || 0) > 0 
                ? 'border-orange-300 bg-orange-50/50' 
                : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Hot Leads</p>
                  <p className={`text-3xl font-bold ${(customers?.filter(c => c.isHotProspect).length || 0) > 0 ? 'text-orange-600' : ''}`}>
                    {customers?.filter(c => c.isHotProspect).length || 0}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${(customers?.filter(c => c.isHotProspect).length || 0) > 0 ? 'bg-orange-100' : 'bg-gray-100'}`}>
                  <Flame className={`h-6 w-6 ${(customers?.filter(c => c.isHotProspect).length || 0) > 0 ? 'text-orange-500 fill-orange-500' : 'text-gray-400'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/tasks?filter=email">
          <Card 
            data-testid="stat-email-tasks" 
            className={`cursor-pointer transition-all hover:shadow-md ${
              emailTasks.length > 0 
                ? 'border-blue-300 bg-blue-50/50' 
                : ''
            }`}
          >
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Email Tasks</p>
                  <p className={`text-3xl font-bold ${emailTasks.length > 0 ? 'text-blue-600' : ''}`}>
                    {emailTasks.length}
                  </p>
                </div>
                <div className={`p-3 rounded-full ${emailTasks.length > 0 ? 'bg-blue-100' : 'bg-gray-100'}`}>
                  <Mail className={`h-6 w-6 ${emailTasks.length > 0 ? 'text-blue-600' : 'text-gray-400'}`} />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Link href="/tasks?filter=pending">
          <Card data-testid="stat-pending-tasks" className="cursor-pointer transition-all hover:shadow-md">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-muted-foreground">Pending Total</p>
                  <p className="text-3xl font-bold">{stats.pendingTasks}</p>
                </div>
                <div className="p-3 rounded-full bg-amber-100">
                  <Clock className="h-6 w-6 text-amber-600" />
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>

        <Card data-testid="stat-completed-today">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Completed Today</p>
                <p className="text-3xl font-bold text-green-600">{completedToday.length}</p>
              </div>
              <div className="p-3 rounded-full bg-green-100">
                <CheckCircle2 className="h-6 w-6 text-green-600" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quote Follow-up Notifications */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <QuoteFollowUpNotifications />
        <QuoteFollowUpReminders />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-5 w-5" />
                  {isAdmin && taskView === 'team' ? "Team's Today's Follow-ups" : "Today's Follow-ups"}
                </CardTitle>
                <CardDescription>
                  {isAdmin && taskView === 'team' 
                    ? "Tasks assigned to other team members" 
                    : "Tasks due today that need your attention"}
                </CardDescription>
              </div>
              <Badge variant="outline">{displayedTodayTasks?.length || 0} tasks</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px] pr-4">
              {displayedTodayTasks && displayedTodayTasks.length > 0 ? (
                <div className="space-y-3">
                  {displayedTodayTasks.map(task => renderTaskCard(task))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-3" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No follow-ups scheduled for today</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5" />
              Recent Activity
            </CardTitle>
            <CardDescription>Latest customer interactions</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {recentEvents && recentEvents.length > 0 ? (
                <div>
                  {recentEvents.slice(0, 10).map(event => renderActivityItem(event))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <Clock className="h-12 w-12 text-muted-foreground mb-3" />
                  <p className="font-medium">No recent activity</p>
                  <p className="text-sm text-muted-foreground">Activity will appear here as you interact with customers</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Critical Clients - Work on today section */}
      <Card className="border-purple-200 bg-gradient-to-r from-purple-50 to-indigo-50" data-testid="critical-clients-section">
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-purple-700">
                <Lightbulb className="h-5 w-5" />
                I think you should work on these clients today
              </CardTitle>
              <CardDescription>
                Based on your tasks, follow-ups, and customer activity
                {completedCriticalClients.size > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    ({completedCriticalClients.size}/5 completed)
                  </span>
                )}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="bg-purple-100 text-purple-700">
              {criticalClients?.filter(c => !completedCriticalClients.has(c.customerId)).length || 0} remaining
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {loadingCriticalClients ? (
            <div className="space-y-3">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex items-center justify-between p-3 bg-white rounded-lg border">
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-10 w-10 rounded-full" />
                    <div>
                      <Skeleton className="h-4 w-32 mb-1" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <Skeleton className="h-8 w-24" />
                </div>
              ))}
            </div>
          ) : criticalClients && criticalClients.length > 0 ? (
            <div className="space-y-3">
              {criticalClients
                .filter(client => !completedCriticalClients.has(client.customerId))
                .map((client, index) => {
                  const isSystemAction = client.customerId.startsWith('system-action-');
                  const isHygieneTask = client.reasonCode?.startsWith('hygiene_');
                  const isTeamOpportunity = client.reasonCode === 'team_opportunity';
                  const isOutreachTask = client.reasonCode?.startsWith('outreach_') || client.reasonCode?.startsWith('engage_');
                  
                  const content = (
                    <>
                      <div className={`p-2 rounded-full ${
                        client.priority === 'critical' ? 'bg-red-100' :
                        client.priority === 'high' ? 'bg-orange-100' : 
                        isTeamOpportunity ? 'bg-green-100' :
                        isOutreachTask ? 'bg-cyan-100' :
                        isHygieneTask ? 'bg-purple-100' : 'bg-blue-100'
                      }`}>
                        <span className="text-lg font-bold text-gray-600">#{index + 1}</span>
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">
                          {isSystemAction ? client.reasonText : client.displayName}
                        </p>
                        <div className="flex items-center gap-2">
                          <Badge 
                            variant="outline" 
                            className={`text-xs ${
                              client.priority === 'critical' ? 'border-red-300 text-red-700 bg-red-50' :
                              client.priority === 'high' ? 'border-orange-300 text-orange-700 bg-orange-50' : 
                              isTeamOpportunity ? 'border-green-300 text-green-700 bg-green-50' :
                              isOutreachTask ? 'border-cyan-300 text-cyan-700 bg-cyan-50' :
                              isHygieneTask ? 'border-purple-300 text-purple-700 bg-purple-50' :
                              'border-blue-300 text-blue-700 bg-blue-50'
                            }`}
                          >
                            {isSystemAction ? 'action' : isTeamOpportunity ? 'team opportunity' : isOutreachTask ? 'outreach' : isHygieneTask ? 'data quality' : client.priority}
                          </Badge>
                          <span className="text-sm text-muted-foreground">
                            {isSystemAction ? client.recommendedAction : client.reasonText}
                          </span>
                        </div>
                      </div>
                    </>
                  );
                  
                  return (
                    <div 
                      key={client.customerId}
                      className="flex items-center justify-between p-3 bg-white rounded-lg border hover:border-purple-300 hover:shadow-sm transition-all"
                      data-testid={`critical-client-${client.customerId}`}
                    >
                      {isSystemAction ? (
                        <div className="flex items-center gap-3 flex-1">
                          {content}
                        </div>
                      ) : (
                        <Link 
                          href={`/clients?customer=${client.customerId}`}
                          className="flex items-center gap-3 flex-1"
                        >
                          {content}
                        </Link>
                      )}
                      <div className="flex items-center gap-2">
                        <span className="text-sm text-purple-600 font-medium hidden sm:inline">{client.recommendedAction}</span>
                        <Button
                          size="sm"
                          variant="outline"
                          className="border-green-300 text-green-700 hover:bg-green-50"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            handleCompleteCriticalClient(client.customerId);
                          }}
                          data-testid={`complete-critical-client-${client.customerId}`}
                        >
                          <CheckCircle2 className="h-4 w-4 mr-1" />
                          Done
                        </Button>
                      </div>
                    </div>
                  );
                })}
              {/* Show completed clients with strikethrough */}
              {criticalClients
                .filter(client => completedCriticalClients.has(client.customerId))
                .map((client) => (
                <div 
                  key={client.customerId}
                  className="flex items-center justify-between p-3 bg-green-50 rounded-lg border border-green-200 opacity-60"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-full bg-green-100">
                      <CheckCircle2 className="h-5 w-5 text-green-600" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-500 line-through">{client.displayName}</p>
                      <span className="text-sm text-green-600">Completed</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center h-32 text-center">
              <CheckCircle2 className="h-10 w-10 text-green-500 mb-2" />
              <p className="font-medium text-gray-700">No urgent clients today!</p>
              <p className="text-sm text-muted-foreground">All your clients are in good standing</p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Celebration Dialog */}
      <Dialog open={showCelebration} onOpenChange={setShowCelebration}>
        <DialogContent className="sm:max-w-md text-center">
          <DialogHeader>
            <DialogTitle className="text-2xl flex items-center justify-center gap-2">
              <span className="text-4xl animate-bounce">🍾</span>
              Congratulations!
              <span className="text-4xl animate-bounce" style={{ animationDelay: '0.1s' }}>🎉</span>
            </DialogTitle>
            <DialogDescription className="text-lg pt-4">
              You've completed 5 client tasks today! Amazing work keeping your clients happy!
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center py-6">
            <div className="text-6xl mb-4">🏆</div>
            <p className="text-muted-foreground">
              Would you like to take on 5 more clients today?
            </p>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCelebration(false)}
              className="w-full sm:w-auto"
            >
              I'm done for today
            </Button>
            <Button
              onClick={handleLoadMoreTasks}
              className="w-full sm:w-auto bg-purple-600 hover:bg-purple-700"
            >
              Load 5 more clients
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {displayedOverdueTasks && displayedOverdueTasks.length > 0 && (
        <Card className="border-red-200">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-red-700">
                  <AlertTriangle className="h-5 w-5" />
                  {isAdmin && taskView === 'team' ? "Team's Overdue Tasks" : "Overdue Tasks"}
                </CardTitle>
                <CardDescription>
                  {isAdmin && taskView === 'team' 
                    ? "Team tasks that are past due" 
                    : "These tasks need immediate attention"}
                </CardDescription>
              </div>
              <Badge variant="destructive">{displayedOverdueTasks.length} overdue</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ScrollArea className="max-h-[300px] pr-4">
              <div className="space-y-3">
                {displayedOverdueTasks.map(task => renderTaskCard(task, true))}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

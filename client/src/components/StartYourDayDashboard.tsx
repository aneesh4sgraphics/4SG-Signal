import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
} from "lucide-react";
import { Link } from "wouter";
import { format, formatDistanceToNow, isToday, isPast, isFuture, addDays } from "date-fns";
import type { FollowUpTask, CustomerActivityEvent, Customer } from "@shared/schema";

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

export default function StartYourDayDashboard() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [showCompleted, setShowCompleted] = useState(false);
  const [taskView, setTaskView] = useState<'my' | 'team'>('my');

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

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: dashboardStats } = useQuery<DashboardStats>({
    queryKey: ["/api/customer-activity/dashboard-stats"],
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

  const getTaskTypeIcon = (taskType: string) => {
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
        <Card data-testid="stat-today-tasks">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-muted-foreground">Today's Tasks</p>
                <p className="text-3xl font-bold">{stats.todayTasks}</p>
              </div>
              <div className="p-3 rounded-full bg-blue-100">
                <Calendar className="h-6 w-6 text-blue-600" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card data-testid="stat-overdue-tasks" className={stats.overdueTasks > 0 ? 'border-red-200' : ''}>
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

        <Link href="/client-database?filter=hot">
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

        <Card data-testid="stat-pending-tasks">
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

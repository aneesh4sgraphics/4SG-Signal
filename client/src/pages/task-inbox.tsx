import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, useSearch, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Calendar,
  Clock,
  AlertTriangle,
  User,
  Phone,
  Mail,
  ExternalLink,
  Zap,
  CheckCircle2,
  ChevronRight,
  ArrowLeft,
  FileText,
  Package,
} from "lucide-react";
import { format, formatDistanceToNow, isToday, isPast } from "date-fns";

interface UnifiedTask {
  id: number | string;
  customerId: string;
  source: 'calendar' | 'spotlight';
  category: 'today' | 'overdue';
  title: string;
  description?: string;
  taskType?: string;
  dueDate?: string;
  priority?: string;
  status: string;
  customerName: string;
  skippedAt?: string;
}

interface TaskSummary {
  today: number;
  overdue: number;
  pending: number;
  email: number;
  spotlightSkipped: number;
  spotlightRemaining: number;
  spotlightCompleted: number;
  spotlightTarget: number;
}

export default function TaskInboxPage() {
  const [, setLocation] = useLocation();
  const searchString = useSearch();
  const params = new URLSearchParams(searchString);
  const initialFilter = params.get("filter") || "pending";
  
  const [activeTab, setActiveTab] = useState(initialFilter);
  const [selectedTask, setSelectedTask] = useState<UnifiedTask | null>(null);
  const [showSpotlightPrompt, setShowSpotlightPrompt] = useState(false);
  const [showTaskDetail, setShowTaskDetail] = useState(false);
  
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: summary } = useQuery<TaskSummary>({
    queryKey: ["/api/tasks/summary"],
  });

  const { data: tasks, isLoading } = useQuery<UnifiedTask[]>({
    queryKey: ["/api/tasks/list", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/tasks/list?filter=${activeTab}`);
      if (!res.ok) throw new Error("Failed to fetch tasks");
      return res.json();
    },
  });

  const completeTaskMutation = useMutation({
    mutationFn: async (taskId: number) => {
      return apiRequest("POST", `/api/customer-activity/follow-ups/${taskId}/complete`, {
        completionNotes: "Completed from task inbox",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/list"] });
      queryClient.invalidateQueries({ queryKey: ["/api/tasks/summary"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customer-activity/follow-ups"] });
      toast({ title: "Task completed" });
      setShowTaskDetail(false);
      setSelectedTask(null);
    },
  });

  const handleTaskClick = (task: UnifiedTask) => {
    setSelectedTask(task);
    if (task.source === 'spotlight') {
      setShowSpotlightPrompt(true);
    } else {
      setShowTaskDetail(true);
    }
  };

  const handleEnterSpotlight = () => {
    setShowSpotlightPrompt(false);
    setLocation("/");
  };

  const handleViewTaskDetail = () => {
    setShowSpotlightPrompt(false);
    setShowTaskDetail(true);
  };

  const getTaskTypeIcon = (taskType: string | undefined) => {
    if (!taskType) return Clock;
    if (taskType.includes('quote')) return FileText;
    if (taskType.includes('sample')) return Package;
    if (taskType.includes('call')) return Phone;
    if (taskType.includes('email')) return Mail;
    if (taskType.includes('spotlight')) return Zap;
    return Clock;
  };

  const getPriorityColor = (priority: string | undefined) => {
    switch (priority) {
      case 'urgent': return 'bg-red-100 text-red-700 border-red-200';
      case 'high': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'normal': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'low': return 'bg-gray-100 text-gray-700 border-gray-200';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const todayTasks = tasks?.filter(t => t.category === 'today') || [];
  const overdueTasks = tasks?.filter(t => t.category === 'overdue') || [];

  return (
    <div className="min-h-screen bg-[#F7F7F7] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-[#111111]">Task Inbox</h1>
            <p className="text-sm text-[#666666]">All your tasks in one place</p>
          </div>
        </div>

        <div className="grid grid-cols-4 gap-4 mb-6">
          <Card className={activeTab === 'today' ? 'border-blue-500 ring-1 ring-blue-500' : ''}>
            <CardContent className="p-4 cursor-pointer" onClick={() => setActiveTab('today')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Today</p>
                  <p className="text-2xl font-bold">{summary?.today || 0}</p>
                </div>
                <Calendar className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className={activeTab === 'overdue' ? 'border-red-500 ring-1 ring-red-500' : ''}>
            <CardContent className="p-4 cursor-pointer" onClick={() => setActiveTab('overdue')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Overdue</p>
                  <p className="text-2xl font-bold text-red-600">{summary?.overdue || 0}</p>
                  {(summary?.spotlightSkipped || 0) > 0 && (
                    <p className="text-xs text-red-500">{summary?.spotlightSkipped} skipped</p>
                  )}
                </div>
                <AlertTriangle className="h-6 w-6 text-red-500" />
              </div>
            </CardContent>
          </Card>

          <Card className={activeTab === 'email' ? 'border-blue-500 ring-1 ring-blue-500' : ''}>
            <CardContent className="p-4 cursor-pointer" onClick={() => setActiveTab('email')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Email Tasks</p>
                  <p className="text-2xl font-bold text-blue-600">{summary?.email || 0}</p>
                </div>
                <Mail className="h-6 w-6 text-blue-500" />
              </div>
            </CardContent>
          </Card>
          
          <Card className={activeTab === 'pending' ? 'border-amber-500 ring-1 ring-amber-500' : ''}>
            <CardContent className="p-4 cursor-pointer" onClick={() => setActiveTab('pending')}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-muted-foreground">Pending Total</p>
                  <p className="text-2xl font-bold">{summary?.pending || 0}</p>
                </div>
                <Clock className="h-6 w-6 text-amber-500" />
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              {activeTab === 'today' && <Calendar className="h-5 w-5" />}
              {activeTab === 'overdue' && <AlertTriangle className="h-5 w-5 text-red-500" />}
              {activeTab === 'email' && <Mail className="h-5 w-5 text-blue-500" />}
              {activeTab === 'pending' && <Clock className="h-5 w-5" />}
              {activeTab === 'today' ? "Today's Tasks" : 
               activeTab === 'overdue' ? "Overdue Tasks" : 
               activeTab === 'email' ? "Email Intelligence Tasks" : 
               "All Pending Tasks"}
            </CardTitle>
            <CardDescription>
              Click on a task to view details or take action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[500px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading tasks...</p>
                </div>
              ) : tasks && tasks.length > 0 ? (
                <div className="space-y-3">
                  {tasks.map((task) => {
                    const TaskIcon = getTaskTypeIcon(task.taskType);
                    const isSpotlight = task.source === 'spotlight';
                    
                    return (
                      <div
                        key={task.id}
                        onClick={() => handleTaskClick(task)}
                        className={`p-4 border rounded-lg cursor-pointer transition-all hover:shadow-md ${
                          isSpotlight 
                            ? 'border-purple-200 bg-purple-50/50 hover:border-purple-300'
                            : task.category === 'overdue' 
                              ? 'border-red-200 bg-red-50/30 hover:border-red-300' 
                              : 'border-gray-200 hover:border-gray-300'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className={`p-2 rounded-lg ${
                            isSpotlight ? 'bg-purple-100' : 
                            task.category === 'overdue' ? 'bg-red-100' : 'bg-blue-100'
                          }`}>
                            <TaskIcon className={`h-4 w-4 ${
                              isSpotlight ? 'text-purple-600' :
                              task.category === 'overdue' ? 'text-red-600' : 'text-blue-600'
                            }`} />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <h4 className="font-medium text-[#111111] truncate">{task.title}</h4>
                              {isSpotlight && (
                                <Badge variant="outline" className="border-purple-300 text-purple-600 text-xs">
                                  <Zap className="h-3 w-3 mr-1" />
                                  SPOTLIGHT
                                </Badge>
                              )}
                              {task.priority && (
                                <Badge variant="outline" className={getPriorityColor(task.priority)}>
                                  {task.priority}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-4 text-sm text-[#666666]">
                              <span className="flex items-center gap-1">
                                <User className="h-3 w-3" />
                                {task.customerName}
                              </span>
                              {task.dueDate && (
                                <span className={`flex items-center gap-1 ${
                                  isPast(new Date(task.dueDate)) && !isToday(new Date(task.dueDate)) 
                                    ? 'text-red-600' 
                                    : ''
                                }`}>
                                  <Clock className="h-3 w-3" />
                                  {format(new Date(task.dueDate), 'MMM d')}
                                </span>
                              )}
                              {task.skippedAt && (
                                <span className="text-purple-600">Skipped today</span>
                              )}
                            </div>
                          </div>
                          
                          <ChevronRight className="h-5 w-5 text-[#999999]" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-32">
                  <CheckCircle2 className="h-12 w-12 text-green-500 mb-2" />
                  <p className="font-medium">All caught up!</p>
                  <p className="text-sm text-muted-foreground">No tasks in this category</p>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      <Dialog open={showSpotlightPrompt} onOpenChange={setShowSpotlightPrompt}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Zap className="h-5 w-5 text-purple-600" />
              SPOTLIGHT Task
            </DialogTitle>
            <DialogDescription>
              This is a SPOTLIGHT task for <strong>{selectedTask?.customerName}</strong>. 
              Would you like to enter SPOTLIGHT mode for the best workflow experience?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={handleViewTaskDetail}>
              View Details Only
            </Button>
            <Button onClick={handleEnterSpotlight} className="bg-purple-600 hover:bg-purple-700">
              <Zap className="h-4 w-4 mr-2" />
              Enter SPOTLIGHT Mode
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showTaskDetail} onOpenChange={setShowTaskDetail}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedTask?.title}</DialogTitle>
            <DialogDescription>
              {selectedTask?.description || 'No description provided'}
            </DialogDescription>
          </DialogHeader>
          
          {selectedTask && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <p className="text-muted-foreground">Customer</p>
                  <p className="font-medium">{selectedTask.customerName}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Type</p>
                  <p className="font-medium capitalize">{selectedTask.taskType || 'General'}</p>
                </div>
                {selectedTask.dueDate && (
                  <div>
                    <p className="text-muted-foreground">Due Date</p>
                    <p className="font-medium">{format(new Date(selectedTask.dueDate), 'MMM d, yyyy')}</p>
                  </div>
                )}
                {selectedTask.priority && (
                  <div>
                    <p className="text-muted-foreground">Priority</p>
                    <Badge variant="outline" className={getPriorityColor(selectedTask.priority)}>
                      {selectedTask.priority}
                    </Badge>
                  </div>
                )}
              </div>
              
              <div className="flex gap-2 pt-4 border-t">
                <Link href={`/odoo-contacts/${selectedTask.customerId}`}>
                  <Button variant="outline" className="gap-2">
                    <ExternalLink className="h-4 w-4" />
                    View Customer
                  </Button>
                </Link>
                {selectedTask.source === 'calendar' && typeof selectedTask.id === 'number' && (
                  <Button 
                    onClick={() => completeTaskMutation.mutate(selectedTask.id as number)}
                    disabled={completeTaskMutation.isPending}
                    className="gap-2"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Complete Task
                  </Button>
                )}
                {selectedTask.source === 'spotlight' && (
                  <Button onClick={handleEnterSpotlight} className="gap-2 bg-purple-600 hover:bg-purple-700">
                    <Zap className="h-4 w-4" />
                    Enter SPOTLIGHT
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

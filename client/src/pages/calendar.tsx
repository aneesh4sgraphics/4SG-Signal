import { useState, useMemo } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, startOfWeek, endOfWeek } from 'date-fns';
import { ChevronLeft, ChevronRight, Plus, Calendar as CalendarIcon, CheckCircle2, Clock, AlertCircle, User, X, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';
import { queryClient, apiRequest } from '@/lib/queryClient';
import { useAuth } from '@/hooks/useAuth';
import { getSalesRepDisplayName, sortUsersByDisplayName } from '@/lib/utils';
import { Link } from 'wouter';

interface CalendarEvent {
  id: string;
  title: string;
  description?: string;
  start: string;
  end?: string;
  allDay?: boolean;
  source: 'google' | 'app';
  sourceType?: string;
  sourceId?: number;
  priority?: string;
  status?: string;
  taskType?: string;
  customerId?: string;
  customerName?: string;
  assignedTo?: string;
  assignedToName?: string;
  calendarEventId?: string;
  location?: string;
}

interface DayData {
  googleEvents: CalendarEvent[];
  tasks: Array<{
    id: number;
    title: string;
    description?: string;
    status: string;
    priority: string;
    taskType: string;
    dueDate: string;
    customerId: string;
    customerName?: string;
    customerEmail?: string;
    assignedTo?: string;
    assignedToName?: string;
    calendarEventId?: string;
    completedAt?: string;
    completionNotes?: string;
  }>;
}

interface UserData {
  id: number;
  email: string;
  firstName?: string;
  lastName?: string;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showTaskModal, setShowTaskModal] = useState(false);
  const [taskForm, setTaskForm] = useState({
    title: '',
    description: '',
    dueDate: '',
    dueTime: '09:00',
    priority: 'normal',
    taskType: 'general',
    assignedTo: '',
    syncToGoogle: false,
  });

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const { data: calendarStatus } = useQuery<{ connected: boolean }>({
    queryKey: ['/api/calendar/status'],
  });

  const { data: eventsData, isLoading: eventsLoading } = useQuery<{ events: CalendarEvent[] }>({
    queryKey: ['/api/calendar/events', monthStart.toISOString(), monthEnd.toISOString()],
    queryFn: async () => {
      const startStr = calendarStart.toISOString();
      const endStr = calendarEnd.toISOString();
      const response = await fetch(`/api/calendar/events?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch events');
      return response.json();
    },
  });

  const { data: dayData, isLoading: dayLoading } = useQuery<DayData>({
    queryKey: ['/api/calendar/day', selectedDate?.toISOString()],
    queryFn: async () => {
      if (!selectedDate) return { googleEvents: [], tasks: [] };
      const dateStr = format(selectedDate, 'yyyy-MM-dd');
      const response = await fetch(`/api/calendar/day/${dateStr}`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch day data');
      return response.json();
    },
    enabled: !!selectedDate,
  });

  const { data: usersData } = useQuery<UserData[]>({
    queryKey: ['/api/calendar/users'],
  });

  const sortedUsers = useMemo(() => {
    if (!usersData) return [];
    return sortUsersByDisplayName(usersData);
  }, [usersData]);

  const createTaskMutation = useMutation({
    mutationFn: async (data: typeof taskForm) => {
      const dueDateTime = new Date(`${data.dueDate}T${data.dueTime}`);
      return apiRequest('/api/calendar/tasks', {
        method: 'POST',
        body: JSON.stringify({
          title: data.title,
          description: data.description || undefined,
          dueDate: dueDateTime.toISOString(),
          priority: data.priority,
          taskType: data.taskType,
          assignedTo: data.assignedTo || undefined,
          syncToGoogle: data.syncToGoogle,
        }),
      });
    },
    onSuccess: () => {
      toast({ title: 'Task created successfully' });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/day'] });
      setShowTaskModal(false);
      resetTaskForm();
    },
    onError: (error) => {
      toast({ title: 'Failed to create task', description: String(error), variant: 'destructive' });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: { status?: string } }) => {
      return apiRequest(`/api/calendar/tasks/${id}`, {
        method: 'PATCH',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      toast({ title: 'Task updated' });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/events'] });
      queryClient.invalidateQueries({ queryKey: ['/api/calendar/day'] });
    },
  });

  const resetTaskForm = () => {
    setTaskForm({
      title: '',
      description: '',
      dueDate: selectedDate ? format(selectedDate, 'yyyy-MM-dd') : '',
      dueTime: '09:00',
      priority: 'normal',
      taskType: 'general',
      assignedTo: '',
      syncToGoogle: false,
    });
  };

  const days = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const getEventsForDay = (day: Date): CalendarEvent[] => {
    if (!eventsData?.events) return [];
    return eventsData.events.filter(event => {
      const eventDate = new Date(event.start);
      return isSameDay(eventDate, day);
    });
  };

  const getPriorityColor = (priority?: string) => {
    switch (priority) {
      case 'urgent': return 'bg-red-500 text-white';
      case 'high': return 'bg-orange-500 text-white';
      case 'normal': return 'bg-blue-500 text-white';
      case 'low': return 'bg-gray-400 text-white';
      default: return 'bg-purple-500 text-white';
    }
  };

  const getEventPillLabel = (event: CalendarEvent): string => {
    if (event.source === 'google') return event.title;

    const taskTypeShort: Record<string, string> = {
      follow_up: 'FU',
      call: 'Call',
      email: 'Email',
      quote_follow_up: 'Quote FU',
      outreach: 'Outreach',
      swatch_book: 'SB',
      press_test_kit: 'PTK',
      data_hygiene: 'Hygiene',
      sample: 'Sample',
    };

    const parts: string[] = [];

    if (event.customerName) {
      const words = event.customerName.trim().split(/\s+/);
      const shortName = words.length > 1
        ? words.slice(0, 2).join(' ')
        : event.customerName;
      parts.push(shortName.length > 16 ? shortName.slice(0, 15) + '…' : shortName);
    }

    if (event.taskType) {
      const short = taskTypeShort[event.taskType];
      if (short) parts.push(short);
    }

    if (event.assignedToName) {
      const initials = event.assignedToName
        .trim()
        .split(/\s+/)
        .map(n => n[0]?.toUpperCase() || '')
        .join('')
        .slice(0, 2);
      if (initials) parts.push(initials);
    }

    return parts.length > 0 ? parts.join(' · ') : event.title;
  };

  const getStatusIcon = (status?: string) => {
    switch (status) {
      case 'completed': return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'pending': return <Clock className="h-4 w-4 text-yellow-500" />;
      case 'snoozed': return <AlertCircle className="h-4 w-4 text-orange-500" />;
      default: return null;
    }
  };

  const handleCreateTask = () => {
    if (!taskForm.title || !taskForm.dueDate) {
      toast({ title: 'Please fill in title and date', variant: 'destructive' });
      return;
    }
    createTaskMutation.mutate(taskForm);
  };

  const handleAddTaskClick = () => {
    if (selectedDate) {
      setTaskForm(prev => ({ ...prev, dueDate: format(selectedDate, 'yyyy-MM-dd') }));
    } else {
      setTaskForm(prev => ({ ...prev, dueDate: format(new Date(), 'yyyy-MM-dd') }));
    }
    setShowTaskModal(true);
  };

  const handleDayClick = (day: Date) => {
    setSelectedDate(day);
  };

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Calendar Hub</h1>
          <p className="text-gray-600 mt-1">
            View and manage tasks, follow-ups, and Google Calendar events
          </p>
        </div>
        <div className="flex items-center gap-3">
          {calendarStatus?.connected ? (
            <Badge variant="outline" className="text-green-600 border-green-300">
              <CalendarIcon className="h-3 w-3 mr-1" />
              Google Calendar Connected
            </Badge>
          ) : (
            <Badge variant="outline" className="text-gray-500">
              <CalendarIcon className="h-3 w-3 mr-1" />
              Google Calendar Not Connected
            </Badge>
          )}
          <Button onClick={handleAddTaskClick} className="bg-purple-600 hover:bg-purple-700">
            <Plus className="h-4 w-4 mr-2" />
            Add Task
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <CardHeader className="flex flex-row items-center justify-between py-3">
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}>
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <CardTitle className="text-xl font-semibold">
            {format(currentMonth, 'MMMM yyyy')}
          </CardTitle>
          <Button variant="ghost" size="icon" onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}>
            <ChevronRight className="h-5 w-5" />
          </Button>
        </CardHeader>
        <CardContent className="p-2">
          {eventsLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              <span className="ml-3 text-gray-500">Loading events...</span>
            </div>
          ) : (
          <div className="grid grid-cols-7 gap-1">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
              <div key={day} className="p-2 text-center text-sm font-medium text-gray-500">
                {day}
              </div>
            ))}
            {days.map((day, idx) => {
              const dayEvents = getEventsForDay(day);
              const isToday = isSameDay(day, new Date());
              const isCurrentMonth = isSameMonth(day, currentMonth);
              const isSelected = selectedDate && isSameDay(day, selectedDate);
              
              return (
                <div
                  key={idx}
                  onClick={() => handleDayClick(day)}
                  className={`
                    min-h-[100px] p-1 border rounded-lg cursor-pointer transition-colors
                    ${isCurrentMonth ? 'bg-white hover:bg-gray-50' : 'bg-gray-50 text-gray-400'}
                    ${isToday ? 'border-purple-500 border-2' : 'border-gray-200'}
                    ${isSelected ? 'ring-2 ring-purple-400 bg-purple-50' : ''}
                  `}
                >
                  <div className={`text-sm font-medium mb-1 ${isToday ? 'text-purple-600' : ''}`}>
                    {format(day, 'd')}
                  </div>
                  <div className="space-y-0.5 overflow-hidden max-h-[70px]">
                    {dayEvents.slice(0, 3).map((event, eventIdx) => (
                      <div
                        key={event.id || eventIdx}
                        className={`text-xs px-1 py-0.5 rounded truncate ${
                          event.source === 'google' 
                            ? 'bg-blue-100 text-blue-700' 
                            : getPriorityColor(event.priority)
                        }`}
                        title={event.title}
                      >
                        {getEventPillLabel(event)}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <div className="text-xs text-gray-500 px-1">
                        +{dayEvents.length - 3} more
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          )}
        </CardContent>
      </Card>

      <Sheet open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle className="flex items-center justify-between">
              <span>{selectedDate && format(selectedDate, 'EEEE, MMMM d, yyyy')}</span>
              <Button size="sm" onClick={handleAddTaskClick}>
                <Plus className="h-4 w-4 mr-1" />
                Add Task
              </Button>
            </SheetTitle>
          </SheetHeader>
          
          <div className="mt-6 space-y-6">
            {dayLoading ? (
              <div className="flex items-center justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
              </div>
            ) : (
              <>
                {dayData?.googleEvents && dayData.googleEvents.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
                      <CalendarIcon className="h-4 w-4 mr-2 text-blue-500" />
                      Google Calendar Events
                    </h3>
                    <div className="space-y-2">
                      {dayData.googleEvents.map((event, idx) => (
                        <Card key={event.id || idx} className="p-3 bg-blue-50 border-blue-100">
                          <div className="font-medium text-blue-900">{event.title}</div>
                          {event.description && (
                            <div className="text-sm text-blue-700 mt-1">{event.description}</div>
                          )}
                          {event.location && (
                            <div className="text-xs text-blue-600 mt-1">📍 {event.location}</div>
                          )}
                          <div className="text-xs text-blue-500 mt-2">
                            {event.allDay ? 'All day' : format(new Date(event.start), 'h:mm a')}
                            {event.end && !event.allDay && ` - ${format(new Date(event.end), 'h:mm a')}`}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {dayData?.tasks && dayData.tasks.length > 0 && (
                  <div>
                    <h3 className="font-semibold text-gray-700 mb-3 flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-2 text-purple-500" />
                      Tasks & Follow-ups
                    </h3>
                    <div className="space-y-2">
                      {dayData.tasks.map(task => (
                        <Card key={task.id} className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {getStatusIcon(task.status)}
                                <span className={`font-medium ${task.status === 'completed' ? 'line-through text-gray-400' : ''}`}>
                                  {task.title}
                                </span>
                              </div>
                              {task.description && (
                                <div className="text-sm text-gray-600 mt-1">{task.description}</div>
                              )}
                              {task.customerName && (
                                <Link href={`/odoo-contacts/${task.customerId}`}>
                                  <div className="text-sm text-purple-600 mt-1 flex items-center gap-1 hover:underline cursor-pointer">
                                    <User className="h-3 w-3" />
                                    {task.customerName}
                                    <ExternalLink className="h-3 w-3" />
                                  </div>
                                </Link>
                              )}
                              <div className="flex items-center gap-2 mt-2">
                                <Badge variant="outline" className={getPriorityColor(task.priority)}>
                                  {task.priority}
                                </Badge>
                                <Badge variant="outline">{task.taskType}</Badge>
                                {task.assignedToName && (
                                  <span className="text-xs text-gray-500">
                                    Assigned to: {getSalesRepDisplayName(task.assignedToName)}
                                  </span>
                                )}
                              </div>
                            </div>
                            {task.status !== 'completed' && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => updateTaskMutation.mutate({ id: task.id, data: { status: 'completed' } })}
                                disabled={updateTaskMutation.isPending}
                              >
                                <CheckCircle2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </Card>
                      ))}
                    </div>
                  </div>
                )}

                {(!dayData?.googleEvents?.length && !dayData?.tasks?.length) && (
                  <div className="text-center py-8 text-gray-500">
                    <CalendarIcon className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No events or tasks for this day</p>
                    <Button className="mt-4" onClick={handleAddTaskClick}>
                      <Plus className="h-4 w-4 mr-2" />
                      Add Task
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </SheetContent>
      </Sheet>

      <Dialog open={showTaskModal} onOpenChange={setShowTaskModal}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Task</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <div>
              <Label htmlFor="title">Title *</Label>
              <Input
                id="title"
                value={taskForm.title}
                onChange={(e) => setTaskForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="Task title..."
              />
            </div>
            <div>
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={taskForm.description}
                onChange={(e) => setTaskForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Optional description..."
                rows={3}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="dueDate">Date *</Label>
                <Input
                  id="dueDate"
                  type="date"
                  value={taskForm.dueDate}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueDate: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="dueTime">Time</Label>
                <Input
                  id="dueTime"
                  type="time"
                  value={taskForm.dueTime}
                  onChange={(e) => setTaskForm(prev => ({ ...prev, dueTime: e.target.value }))}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="priority">Priority</Label>
                <Select value={taskForm.priority} onValueChange={(v) => setTaskForm(prev => ({ ...prev, priority: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="taskType">Task Type</Label>
                <Select value={taskForm.taskType} onValueChange={(v) => setTaskForm(prev => ({ ...prev, taskType: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="general">General</SelectItem>
                    <SelectItem value="follow_up_quote">Follow Up Quote</SelectItem>
                    <SelectItem value="follow_up_sample">Follow Up Sample</SelectItem>
                    <SelectItem value="call">Call</SelectItem>
                    <SelectItem value="email">Email</SelectItem>
                    <SelectItem value="meeting">Meeting</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label htmlFor="assignedTo">Assign To</Label>
              <Select value={taskForm.assignedTo} onValueChange={(v) => setTaskForm(prev => ({ ...prev, assignedTo: v }))}>
                <SelectTrigger>
                  <SelectValue placeholder="Assign to user..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Self (me)</SelectItem>
                  {sortedUsers.map(u => (
                    <SelectItem key={u.id} value={u.email}>
                      {getSalesRepDisplayName(u.email)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {calendarStatus?.connected && (
              <div className="flex items-center space-x-2">
                <Checkbox
                  id="syncToGoogle"
                  checked={taskForm.syncToGoogle}
                  onCheckedChange={(checked) => setTaskForm(prev => ({ ...prev, syncToGoogle: !!checked }))}
                />
                <Label htmlFor="syncToGoogle" className="cursor-pointer">
                  Sync to Google Calendar
                </Label>
              </div>
            )}
          </div>
          <DialogFooter className="mt-6">
            <Button variant="outline" onClick={() => setShowTaskModal(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateTask} 
              disabled={createTaskMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

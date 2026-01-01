import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Clock, User, Activity, RefreshCw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ActivityLog {
  id: number;
  action: string;
  description: string;
  userId: string;
  userEmail: string;
  userName: string | null;
  userRole: string;
  createdAt: string;
  user?: {
    email: string;
    firstName: string | null;
    lastName: string | null;
  };
}

interface ActivityLogsProps {
  userId?: string; // If provided, shows logs for specific user
  showAllUsers?: boolean; // Admin view shows all users
}

export default function ActivityLogs({ userId, showAllUsers = false }: ActivityLogsProps) {
  const { user } = useAuth();
  const [limit, setLimit] = useState(50);
  
  const isAdmin = (user as any)?.role === 'admin';
  const endpoint = userId 
    ? `/api/activity-logs/user/${userId}` 
    : '/api/activity-logs';

  const { data: response, isLoading, refetch } = useQuery({
    queryKey: [endpoint, limit],
    queryFn: async () => {
      const url = `${endpoint}?limit=${limit}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch activity logs');
      }
      return response.json();
    },
    staleTime: 2 * 60 * 1000, // Keep fresh for 2 minutes
  });

  const activities = response?.activities || [];

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  const getActionBadgeColor = (action: string) => {
    const actionLower = action.toLowerCase();
    if (actionLower.includes('login')) return 'bg-green-100 text-green-800';
    if (actionLower.includes('logout')) return 'bg-gray-100 text-gray-800';
    if (actionLower.includes('upload')) return 'bg-blue-100 text-blue-800';
    if (actionLower.includes('download')) return 'bg-purple-100 text-purple-800';
    if (actionLower.includes('delete')) return 'bg-red-100 text-red-800';
    if (actionLower.includes('create') || actionLower.includes('add')) return 'bg-green-100 text-green-800';
    if (actionLower.includes('update') || actionLower.includes('edit')) return 'bg-yellow-100 text-yellow-800';
    return 'bg-gray-100 text-gray-800';
  };

  const getUserDisplay = (activity: ActivityLog) => {
    if (activity.user) {
      const name = `${activity.user.firstName || ''} ${activity.user.lastName || ''}`.trim();
      return name || activity.user.email;
    }
    return activity.userId;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="h-6 w-6 animate-spin" />
        <span className="ml-2">Loading activity logs...</span>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Activity className="h-5 w-5" />
          Activity Logs
          {userId && <Badge variant="secondary">User Specific</Badge>}
          {showAllUsers && isAdmin && <Badge variant="default">All Users</Badge>}
        </CardTitle>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetch()}
          >
            <RefreshCw className="h-4 w-4" />
          </Button>
          <select
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value))}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value={25}>25 records</option>
            <option value={50}>50 records</option>
            <option value={100}>100 records</option>
            <option value={200}>200 records</option>
          </select>
        </div>
      </CardHeader>
      <CardContent>
        {activities.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>No activity logs found</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Description</TableHead>
                  {showAllUsers && isAdmin && <TableHead>User</TableHead>}
                  <TableHead>Role</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {activities.map((activity: ActivityLog) => (
                  <TableRow key={activity.id}>
                    <TableCell className="font-mono text-xs">
                      <div className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {formatDate(activity.createdAt)}
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={getActionBadgeColor(activity.action)}>
                        {activity.action}
                      </Badge>
                    </TableCell>
                    <TableCell className="max-w-md">
                      <div className="truncate" title={activity.description}>
                        {activity.description}
                      </div>
                    </TableCell>
                    {showAllUsers && isAdmin && (
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          <span className="text-sm">{getUserDisplay(activity)}</span>
                        </div>
                      </TableCell>
                    )}
                    <TableCell>
                      <Badge variant="outline" className="text-xs">
                        {activity.userRole}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
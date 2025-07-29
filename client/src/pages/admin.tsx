import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Download, ArrowLeft, Users, UserCheck, UserX, Clock, Shield, UserCog } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

interface RoleSelectProps {
  user: User;
  onRoleChange: (userId: string, newRole: string) => void;
  isPending: boolean;
}

function RoleSelect({ user, onRoleChange, isPending }: RoleSelectProps) {
  const [localRole, setLocalRole] = React.useState(user.role);
  
  React.useEffect(() => {
    setLocalRole(user.role);
  }, [user.role]);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newRole = e.target.value;
    setLocalRole(newRole);
    onRoleChange(user.id, newRole);
  };

  return (
    <select 
      value={localRole} 
      onChange={handleChange}
      className="px-2 py-1 border border-gray-300 rounded text-sm focus:ring-2 focus:ring-primary focus:border-transparent"
      disabled={isPending}
    >
      <option value="user">User</option>
      <option value="manager">Manager</option>
      <option value="admin">Admin</option>
    </select>
  );
}

export default function Admin() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { logUserAction, logPageView, logDataExport } = useActivityLogger();

  // Log page view when component mounts
  React.useEffect(() => {
    logPageView("Admin Panel");
  }, [logPageView]);



  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: false,
    refetchOnWindowFocus: false,
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/approve`);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const user = users?.find(u => u.id === userId);
      logUserAction("APPROVED USER", user?.email || userId);
      toast({
        title: "User approved",
        description: "User has been approved and can now access the system",
      });
    },
    onError: (error) => {
      toast({
        title: "Error approving user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest("POST", `/api/admin/users/${encodeURIComponent(userId)}/reject`);
    },
    onSuccess: (_, userId) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      const user = users?.find(u => u.id === userId);
      logUserAction("REJECTED USER", user?.email || userId);
      toast({
        title: "User rejected",
        description: "User has been rejected and cannot access the system",
      });
    },
    onError: (error) => {
      toast({
        title: "Error rejecting user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const changeRoleMutation = useMutation({
    mutationFn: async ({ userId, newRole }: { userId: string; newRole: string }) => {
      console.log('Frontend: Changing role for user', userId, 'to', newRole);
      
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/role`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ role: newRole }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update role');
      }

      const result = await response.json();
      console.log('Frontend: Role change response:', result);
      return result;
    },
    onSuccess: (data, { userId, newRole }) => {
      console.log('Frontend: Role change successful, invalidating queries');
      
      // Force refetch to ensure UI shows the latest data
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      queryClient.refetchQueries({ queryKey: ["/api/admin/users"] });
      
      const user = users?.find(u => u.id === userId);
      logUserAction("CHANGED USER ROLE", `${user?.email || userId} to ${newRole}`);
      
      toast({
        title: "Role updated",
        description: "User role has been updated successfully",
      });
    },
    onError: (error) => {
      console.error('Frontend: Role change error:', error);
      
      let errorMessage = "Failed to update user role";
      if (error instanceof Error) {
        errorMessage = error.message;
      } else if (typeof error === 'string') {
        errorMessage = error;
      }
      
      toast({
        title: "Error updating role",
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  // Download all data as ZIP
  const handleDownloadData = async () => {
    try {
      const response = await fetch('/api/admin/download-all-data', {
        method: 'GET',
      });

      if (!response.ok) {
        throw new Error('Failed to download data');
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `database-backup-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
      
      logDataExport("Database Backup", "ZIP");
      toast({
        title: "Success", 
        description: "All database files downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download data",
        variant: "destructive",
      });
    }
  };



  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-8">
          <Button variant="outline" className="flex items-center gap-2" onClick={() => window.history.back()}>
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-secondary mb-2 flex items-center justify-center gap-2">
              <Settings className="h-8 w-8" />
              Admin Panel
            </h1>
            <p className="text-muted-foreground">
              User management and data export tools
            </p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>



        {/* User Management Section */}
        <Card className="shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {usersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading users...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          {user.status === 'approved' ? (
                            <RoleSelect 
                              user={user}
                              onRoleChange={(userId, newRole) => changeRoleMutation.mutate({ userId, newRole })}
                              isPending={changeRoleMutation.isPending}
                            />
                          ) : (
                            <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                              {user.role}
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              user.status === 'approved' ? 'default' : 
                              user.status === 'pending' ? 'secondary' : 
                              'destructive'
                            }
                          >
                            {user.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {user.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => approveUserMutation.mutate(user.id)}
                                disabled={approveUserMutation.isPending}
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => rejectUserMutation.mutate(user.id)}
                                disabled={rejectUserMutation.isPending}
                              >
                                <UserX className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Data Management Section */}
        <div className="max-w-md mx-auto">
          {/* Data Export */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5 text-primary" />
                Export All Data
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-4">
                    Download all database files in a ZIP archive. This includes customer data, product data, pricing data, and quote records.
                  </p>

                </div>

                <Button
                  onClick={handleDownloadData}
                  className="w-full"
                  size="lg"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download All Database Files
                </Button>
              </div>
            </CardContent>
          </Card>


        </div>
      </div>
    </div>
  );
}
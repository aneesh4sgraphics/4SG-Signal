import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Download, ArrowLeft, Users, UserCheck, UserX, Clock, Shield, UserCog, Sliders, ChevronRight, Check } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";
import { useActivityLogger } from "@/hooks/useActivityLogger";
import { useUsers } from "@/features/admin/useUsers";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";

import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

import type { User } from '@shared/schema';

const PRICING_TIERS = [
  { key: 'landedPrice', label: 'Landed Price' },
  { key: 'exportPrice', label: 'Export Only' },
  { key: 'masterDistributorPrice', label: 'Distributor' },
  { key: 'dealerPrice', label: 'Dealer-VIP' },
  { key: 'dealer2Price', label: 'Dealer' },
  { key: 'approvalNeededPrice', label: 'Shopify Lowest' },
  { key: 'tierStage25Price', label: 'Shopify3' },
  { key: 'tierStage2Price', label: 'Shopify2' },
  { key: 'tierStage15Price', label: 'Shopify1' },
  { key: 'tierStage1Price', label: 'Shopify-Account' },
  { key: 'retailPrice', label: 'Retail' }
];

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

interface TierSelectProps {
  user: User;
  onTierChange: (userId: string, tiers: string[] | null) => void;
  isPending: boolean;
}

function TierSelect({ user, onTierChange, isPending }: TierSelectProps) {
  const [localTiers, setLocalTiers] = React.useState<string[]>(user.allowedTiers || []);
  const [open, setOpen] = React.useState(false);
  
  React.useEffect(() => {
    setLocalTiers(user.allowedTiers || []);
  }, [user.allowedTiers]);

  const handleTierToggle = (tierKey: string) => {
    const newTiers = localTiers.includes(tierKey)
      ? localTiers.filter(t => t !== tierKey)
      : [...localTiers, tierKey];
    setLocalTiers(newTiers);
    onTierChange(user.id, newTiers.length > 0 ? newTiers : null);
  };

  const handleSelectAll = () => {
    const allTiers = PRICING_TIERS.map(t => t.key);
    setLocalTiers(allTiers);
    onTierChange(user.id, allTiers);
  };

  const handleClearAll = () => {
    setLocalTiers([]);
    onTierChange(user.id, null);
  };

  const displayText = localTiers.length === 0 
    ? 'All Tiers' 
    : localTiers.length === PRICING_TIERS.length 
      ? 'All Tiers' 
      : `${localTiers.length} tiers`;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={isPending}
          className="min-w-[100px] justify-between text-xs"
        >
          {displayText}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-2" align="start">
        <div className="space-y-2">
          <div className="flex justify-between items-center border-b pb-2">
            <span className="text-sm font-medium">Pricing Tiers</span>
            <div className="flex gap-1">
              <Button variant="ghost" size="sm" onClick={handleSelectAll} className="text-xs h-6 px-2">
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={handleClearAll} className="text-xs h-6 px-2">
                Clear
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            {PRICING_TIERS.map((tier) => (
              <div key={tier.key} className="flex items-center space-x-2">
                <Checkbox
                  id={`tier-${user.id}-${tier.key}`}
                  checked={localTiers.includes(tier.key)}
                  onCheckedChange={() => handleTierToggle(tier.key)}
                />
                <label
                  htmlFor={`tier-${user.id}-${tier.key}`}
                  className="text-sm cursor-pointer flex-1"
                >
                  {tier.label}
                </label>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground pt-2 border-t">
            Empty = All tiers visible
          </p>
        </div>
      </PopoverContent>
    </Popover>
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



  const { data: users, isLoading: usersLoading } = useUsers();

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

      return response.json();
    },
    onSuccess: (data, { userId, newRole }) => {
      
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

  const changeTiersMutation = useMutation({
    mutationFn: async ({ userId, allowedTiers }: { userId: string; allowedTiers: string[] | null }) => {
      const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}/allowed-tiers`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ allowedTiers }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to update allowed tiers');
      }

      return response.json();
    },
    onSuccess: (data, { userId, allowedTiers }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      
      const user = users?.find(u => u.id === userId);
      const tiersText = allowedTiers && allowedTiers.length > 0 
        ? `${allowedTiers.length} tiers` 
        : 'all tiers';
      logUserAction("CHANGED USER TIERS", `${user?.email || userId} to ${tiersText}`);
      
      toast({
        title: "Allowed tiers updated",
        description: "User's visible pricing tiers have been updated",
      });
    },
    onError: (error) => {
      toast({
        title: "Error updating tiers",
        description: error instanceof Error ? error.message : "Failed to update allowed tiers",
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



        {/* Rules & Config Quick Link */}
        <Link href="/admin/config">
          <Card className="glass-card border-0 shadow-lg mb-6 cursor-pointer hover:bg-gray-50 transition-colors" data-testid="link-admin-config">
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="p-2 bg-purple-100 rounded-lg">
                    <Sliders className="h-6 w-6 text-purple-600" />
                  </div>
                  <div>
                    <h3 className="font-semibold text-lg">Rules & Config</h3>
                    <p className="text-sm text-gray-500">Manage coaching timers, nudge settings, and mappings</p>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-gray-400" />
              </div>
            </CardContent>
          </Card>
        </Link>

        {/* User Management Section */}
        <Card className="glass-card border-0 shadow-lg mb-8">
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
                      <TableHead>Allowed Tiers</TableHead>
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
                          {user.status === 'approved' ? (
                            <TierSelect 
                              user={user}
                              onTierChange={(userId, allowedTiers) => changeTiersMutation.mutate({ userId, allowedTiers })}
                              isPending={changeTiersMutation.isPending}
                            />
                          ) : (
                            <span className="text-xs text-muted-foreground">—</span>
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
                          {user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A'}
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
          <Card className="glass-card border-0 shadow-lg">
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
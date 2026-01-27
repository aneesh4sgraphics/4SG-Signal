import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Settings, Download, ArrowLeft, Users, UserCheck, UserX, Clock, Shield, UserCog, Sliders, ChevronRight, Check, Trophy, Flame, Phone, Mail, FileText, Sparkles } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query";
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

  // Leaderboard data
  interface LeaderboardUser {
    user_id: string;
    email: string;
    display_name: string;
    today_total: number;
    week_total: number;
    month_total: number;
    bucket_stats: Record<string, { today: number; week: number; month: number }>;
    hot_leads: number;
  }

  const { data: leaderboardData, isLoading: leaderboardLoading } = useQuery<{
    users: LeaderboardUser[];
    dateRange: { today: string; weekStart: string; monthStart: string };
  }>({
    queryKey: ['/api/admin/leaderboard'],
    staleTime: 60 * 1000,
  });

  const BUCKET_COLORS: Record<string, { bg: string; text: string; label: string; icon: typeof Phone }> = {
    calls: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Calls', icon: Phone },
    follow_ups: { bg: 'bg-green-100', text: 'text-green-700', label: 'Follow-ups', icon: Mail },
    outreach: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Outreach', icon: Sparkles },
    data_hygiene: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Hygiene', icon: FileText },
    enablement: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Enablement', icon: Trophy },
  };

  const getRankColors = (rank: number) => {
    switch (rank) {
      case 1: return 'from-yellow-400 to-amber-500 border-yellow-300';
      case 2: return 'from-gray-300 to-slate-400 border-gray-200';
      case 3: return 'from-amber-600 to-orange-700 border-amber-500';
      default: return 'from-blue-400 to-indigo-500 border-blue-300';
    }
  };

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

        {/* Team Leaderboard Section */}
        <Card className="glass-card border-0 shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Trophy className="h-5 w-5 text-amber-500" />
              Team Leaderboard
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {leaderboardLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading stats...</p>
              </div>
            ) : !leaderboardData?.users?.length ? (
              <div className="text-center py-8 text-muted-foreground">
                No task data yet. Stats will appear once team members complete SPOTLIGHT tasks.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {leaderboardData.users.map((user, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={user.user_id}
                      className={`relative rounded-xl p-4 bg-gradient-to-br ${getRankColors(rank)} shadow-md border-2`}
                    >
                      {/* Rank Badge */}
                      <div className="absolute -top-3 -right-3 w-10 h-10 rounded-full bg-white shadow-lg flex items-center justify-center font-bold text-lg">
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                      </div>

                      {/* User Info */}
                      <div className="mb-4">
                        <h3 className="text-white font-bold text-xl capitalize drop-shadow">
                          {user.display_name}
                        </h3>
                        {user.hot_leads > 0 && (
                          <Badge variant="secondary" className="bg-red-500 text-white mt-1">
                            <Flame className="h-3 w-3 mr-1" />
                            {user.hot_leads} HOT
                          </Badge>
                        )}
                      </div>

                      {/* Stats Grid */}
                      <div className="bg-white/90 rounded-lg p-3 space-y-2">
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">Today</span>
                          <span className="font-bold text-lg">{user.today_total}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm">
                          <span className="text-gray-600">This Week</span>
                          <span className="font-bold text-lg">{user.week_total}</span>
                        </div>
                        <div className="flex justify-between items-center text-sm border-t pt-2">
                          <span className="text-gray-600">This Month</span>
                          <span className="font-bold text-xl text-primary">{user.month_total}</span>
                        </div>
                      </div>

                      {/* Bucket Breakdown */}
                      {user.bucket_stats && Object.keys(user.bucket_stats).length > 0 && (
                        <div className="mt-3 flex flex-wrap gap-1.5">
                          {Object.entries(user.bucket_stats).map(([bucket, stats]) => {
                            const bucketInfo = BUCKET_COLORS[bucket] || { bg: 'bg-gray-100', text: 'text-gray-700', label: bucket };
                            const weekCount = stats.week || 0;
                            if (weekCount === 0) return null;
                            return (
                              <Badge
                                key={bucket}
                                variant="secondary"
                                className={`${bucketInfo.bg} ${bucketInfo.text} text-xs`}
                                title={`${bucketInfo.label}: ${weekCount} this week`}
                              >
                                {bucketInfo.label}: {weekCount}
                              </Badge>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

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
                        <TableCell>
                          <a href={`mailto:${user.email}`} className="text-primary hover:underline">
                            {user.email}
                          </a>
                        </TableCell>
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
import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { 
  Settings,
  AlertCircle,
  ChevronRight,
  Building2,
  Flame,
  Package,
  ExternalLink,
  Trophy,
  Phone,
  Mail,
  FileText,
  Sparkles,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { DailyProgressHero } from "@/components/DailyProgressHero";
import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  totalQuotes: number;
  quotesThisMonth: number;
  monthlyRevenue: number;
  totalCustomers: number;
  hotLeads: number;
  totalProducts: number;
  activityCount: number;
}

interface CRMStats {
  stageCounts: { stage: string; count: number }[];
  totalActiveJourneys: number;
  totalQuotesSent: number;
  quotesLast30Days: number;
  totalCustomers: number;
  newCustomersLast30Days: number;
  pendingSamples: number;
  pendingSwatches: number;
  activePressProfiles: number;
  pendingFeedback: number;
  samplesWithTracking: number;
  swatchesWithTracking: number;
  hotProspects: number;
}

interface UsageStats {
  database: {
    size: string;
    sizeBytes: number;
    tables: { table_name: string; total_size: string; size_bytes: number }[];
  };
  records: {
    customers: number;
    products: number;
    quotes: number;
    activityLogs: number;
  };
  limits: {
    dbMaxSize: string;
    dbMaxSizeBytes: number;
  };
  timestamp: string;
}

interface ApiCostStats {
  summary: {
    totalCost: number;
    totalCalls: number;
    totalInputTokens: number;
    totalOutputTokens: number;
    avgDurationMs: number;
    periodDays: number;
  };
  byOperation: { operation: string; function_name: string; call_count: string; total_cost: string }[];
  byModel: { model: string; call_count: string; total_cost: string }[];
  daily: { date: string; api_provider: string; daily_cost: string; call_count: string }[];
  timestamp: string;
}


export default function Dashboard() {
  const { user, isLoading } = useAuth();


  const { data: stats } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: 2,
  });

  const { data: crmStats } = useQuery<CRMStats>({
    queryKey: ["/api/dashboard/crm"],
    retry: 2,
  });

  const isAdminUser = (user as any)?.role === 'admin';
  
  const { data: usageStats } = useQuery<UsageStats>({
    queryKey: ["/api/dashboard/usage"],
    retry: 1,
    enabled: isAdminUser,
    staleTime: 5 * 60 * 1000,
  });

  const { data: apiCosts } = useQuery<ApiCostStats>({
    queryKey: ["/api/dashboard/api-costs?days=30"],
    retry: 1,
    enabled: isAdminUser,
    staleTime: 5 * 60 * 1000,
  });

  // Leaderboard data (admin only)
  interface LeaderboardUser {
    user_id: string;
    email: string;
    display_name: string;
    today_total: number;
    week_total: number;
    month_total: number;
    bucket_stats: Record<string, { today: number; week: number; month: number }>;
    hot_leads: number;
    total_leads: number;
    leads_emailed: number;
    leads_replied: number;
    customers_worked: { name: string; odooPartnerId: number | null; id: string }[];
  }

  const { data: leaderboardData } = useQuery<{
    users: LeaderboardUser[];
    dateRange: { today: string; weekStart: string; monthStart: string };
  }>({
    queryKey: ['/api/admin/leaderboard'],
    enabled: isAdminUser,
    staleTime: 60 * 1000,
  });

  const BUCKET_COLORS: Record<string, { bg: string; text: string; label: string }> = {
    calls: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Calls' },
    follow_ups: { bg: 'bg-green-100', text: 'text-green-700', label: 'Follow-ups' },
    outreach: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Outreach' },
    data_hygiene: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Hygiene' },
    enablement: { bg: 'bg-pink-100', text: 'text-pink-700', label: 'Enablement' },
  };

  const getRankColors = (rank: number) => {
    switch (rank) {
      case 1: return 'from-yellow-400 to-amber-500 border-yellow-300';
      case 2: return 'from-gray-300 to-slate-400 border-gray-200';
      case 3: return 'from-amber-600 to-orange-700 border-amber-500';
      default: return 'from-blue-400 to-indigo-500 border-blue-300';
    }
  };

  const { data: objections = [] } = useQuery<{ id: number; status: string }[]>({
    queryKey: ["/api/crm/objections"],
    retry: 1,
  });

  interface LabelDashboardStats {
    stats: Array<{ labelType: string; label: string; count: number; totalQuantity: number }>;
    byUser: Array<{ userId: string; userName: string | null; count: number }>;
    recentPrints: Array<{ id: number; labelType: string; customerId: string; printedByUserName: string | null; createdAt: string }>;
    grandTotal: number;
  }
  const { data: labelDashboardStats } = useQuery<LabelDashboardStats>({
    queryKey: ['/api/dashboard/label-stats'],
    retry: 1,
    staleTime: 60000,
  });

  interface OutboundKit {
    id: number;
    labelType: string;
    labelTypeDisplay: string;
    otherDescription: string | null;
    quantity: number;
    customerId: string;
    customerName: string;
    customerEmail: string;
    location: string;
    printedBy: string;
    createdAt: string;
  }
  const [showOutboundKitsDialog, setShowOutboundKitsDialog] = useState(false);
  const { data: outboundKitsData, isLoading: isLoadingKits } = useQuery<{ kits: OutboundKit[] }>({
    queryKey: ['/api/dashboard/outbound-kits'],
    enabled: showOutboundKitsDialog,
    staleTime: 60000,
  });
  const [, navigate] = useLocation();

  const openObjections = objections.filter(o => o.status === 'open').length;

  if (isLoading) {
    return (
      <div className="dashboard-container" style={{
        minHeight: '100vh',
        background: '#F7F7F7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '16px',
        }}>
          <div style={{
            width: '48px',
            height: '48px',
            border: '3px solid #111111',
            borderTop: '3px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: '#666666', fontSize: '14px', fontWeight: 500 }}>Loading...</span>
        </div>
        <style>{`
          @keyframes spin {
            to { transform: rotate(360deg); }
          }
        `}</style>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="dashboard-container" style={{
        minHeight: '100vh',
        background: '#F7F7F7',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '12px',
          padding: '48px',
          border: '1px solid #EAEAEA',
          textAlign: 'center',
          maxWidth: '400px',
        }}>
          <AlertCircle style={{ width: '48px', height: '48px', color: '#999999', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: 600, color: '#111111', marginBottom: '8px' }}>
            Sign in required
          </h3>
          <p style={{ fontSize: '14px', color: '#666666', marginBottom: '24px' }}>
            Please sign in to access your dashboard
          </p>
          <Button 
            onClick={() => window.location.href = "/api/login"}
            style={{
              background: '#111111',
              color: '#FFFFFF',
              borderRadius: '10px',
              padding: '12px 24px',
              fontWeight: 500,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Sign in with Replit
          </Button>
        </div>
      </div>
    );
  }

  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  const isAdmin = (user as any)?.role === 'admin';
  const now = new Date();
  const dateString = now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });

  return (
    <>
      <ConnectionPrompt />
      <div style={{
        minHeight: '100vh',
        background: '#F7F7F7',
        fontFamily: 'Roboto, ui-sans-serif, system-ui, sans-serif',
        margin: '-24px',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: '1152px', margin: '0 auto' }}>
          
          {/* Header */}
          <div style={{ marginBottom: '24px' }}>
            <p style={{ fontSize: '12px', fontWeight: 500, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
              4S Graphics Dashboard
            </p>
            <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111111', margin: 0, marginBottom: '4px' }}>
              Welcome back, {firstName}
            </h1>
            <p style={{ fontSize: '14px', color: '#6B6B8C', margin: 0 }}>{dateString}</p>
          </div>

          {/* Daily Progress Hero */}
          <div style={{ marginBottom: '24px' }}>
            <DailyProgressHero
              completionPercent={crmStats?.totalActiveJourneys ? Math.round((crmStats.quotesLast30Days / Math.max(crmStats.totalActiveJourneys, 1)) * 100) : 0}
              tasksToday={stats?.quotesThisMonth || 0}
              overdueCount={crmStats?.pendingFeedback || 0}
              hotLeadsCount={stats?.hotLeads || 0}
              upcomingTasks={[]}
              dailyGoal={10}
            />
          </div>

          {/* Team Leaderboard - Admin Only */}
          {isAdmin && leaderboardData?.users && leaderboardData.users.length > 0 && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #EAEAEA',
              marginBottom: '24px',
              padding: '20px',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                <Trophy style={{ width: '20px', height: '20px', color: '#F59E0B' }} />
                <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111111', margin: 0 }}>
                  Team Leaderboard
                </h2>
                <span style={{ fontSize: '12px', color: '#6B6B8C', marginLeft: 'auto' }}>
                  This week
                </span>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
                {leaderboardData.users
                  .filter((u) => !u.display_name?.toLowerCase().includes('test'))
                  .map((repUser, index) => {
                  const rank = index + 1;
                  return (
                    <div
                      key={repUser.user_id}
                      className={`relative rounded-xl p-4 bg-gradient-to-br ${getRankColors(rank)} shadow-md border-2`}
                    >
                      {/* Rank Badge */}
                      <div className="absolute -top-2 -right-2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center font-bold text-sm">
                        {rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`}
                      </div>

                      {/* User Info */}
                      <div className="mb-3">
                        <h3 className="text-white font-bold text-lg capitalize drop-shadow">
                          {repUser.display_name}
                        </h3>
                        {repUser.hot_leads > 0 && (
                          <Badge variant="secondary" className="bg-red-500 text-white text-xs mt-1">
                            <Flame className="h-3 w-3 mr-1" />
                            {repUser.hot_leads} HOT
                          </Badge>
                        )}
                      </div>

                      {/* Stats Grid */}
                      <div className="bg-white/90 rounded-lg p-2 space-y-1">
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">Today</span>
                          <span className="font-bold">{repUser.today_total}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                          <span className="text-gray-600">This Week</span>
                          <span className="font-bold text-base">{repUser.week_total}</span>
                        </div>
                        {repUser.total_leads > 0 && (
                          <div className="flex justify-between items-center text-xs border-t pt-1 mt-1">
                            <span className="text-gray-600">Leads</span>
                            <span className="font-medium text-purple-700">
                              {repUser.leads_emailed}/{repUser.total_leads}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Bucket Breakdown */}
                      {repUser.bucket_stats && Object.keys(repUser.bucket_stats).length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1">
                          {Object.entries(repUser.bucket_stats).map(([bucket, bucketStats]) => {
                            const bucketInfo = BUCKET_COLORS[bucket] || { bg: 'bg-gray-100', text: 'text-gray-700', label: bucket };
                            const weekCount = bucketStats.week || 0;
                            if (weekCount === 0) return null;
                            return (
                              <Badge
                                key={bucket}
                                variant="secondary"
                                className={`${bucketInfo.bg} ${bucketInfo.text} text-xs px-1.5 py-0`}
                              >
                                {bucketInfo.label}: {weekCount}
                              </Badge>
                            );
                          })}
                        </div>
                      )}

                      {/* Customers Worked This Week */}
                      {repUser.customers_worked && repUser.customers_worked.length > 0 && (
                        <div className="mt-2 bg-white/80 rounded-lg p-2">
                          <div className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1">
                            Customers This Week ({repUser.customers_worked.length})
                          </div>
                          <div className="max-h-24 overflow-y-auto space-y-0.5">
                            {repUser.customers_worked.slice(0, 15).map((cust, i) => (
                              <Link
                                key={i}
                                href={cust.odooPartnerId ? `/odoo-contacts/${cust.odooPartnerId}` : `/odoo-contacts/${cust.id}`}
                                className="text-xs text-blue-600 hover:text-blue-800 hover:underline truncate flex items-center gap-1 cursor-pointer"
                              >
                                <span className="w-1 h-1 rounded-full bg-blue-400 flex-shrink-0" />
                                {cust.name}
                              </Link>
                            ))}
                            {repUser.customers_worked.length > 15 && (
                              <div className="text-[10px] text-gray-400 italic mt-0.5">
                                +{repUser.customers_worked.length - 15} more
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Quick Action Cards - Two Column Grid */}
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', 
            gap: '16px',
            marginBottom: '24px'
          }}>
            {/* Hot Leads Card */}
            <Link href="/hot-leads" style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #EAEAEA',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#E03D3E';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(224, 61, 62, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAEAEA';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #FF6B6B 0%, #E03D3E 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Flame size={20} style={{ color: '#FFFFFF' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111111' }}>Hot Leads</div>
                      <div style={{ fontSize: '12px', color: '#666666' }}>Ready to close</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: '#E03D3E' }}>{stats?.hotLeads || 0}</span>
                    <ChevronRight size={18} style={{ color: '#999999' }} />
                  </div>
                </div>
              </div>
            </Link>

            {/* Contacts Card */}
            <Link href="/odoo-contacts" style={{ textDecoration: 'none' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #EAEAEA',
                padding: '20px',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#8B7EC8';
                e.currentTarget.style.boxShadow = '0 2px 8px rgba(139, 126, 200, 0.15)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAEAEA';
                e.currentTarget.style.boxShadow = 'none';
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '10px',
                      background: 'linear-gradient(135deg, #8B7EC8 0%, #6B5B95 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}>
                      <Building2 size={20} style={{ color: '#FFFFFF' }} />
                    </div>
                    <div>
                      <div style={{ fontSize: '14px', fontWeight: 600, color: '#111111' }}>Contacts</div>
                      <div style={{ fontSize: '12px', color: '#666666' }}>Manage customers</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: '#8B7EC8' }}>{stats?.totalCustomers || 0}</span>
                    <ChevronRight size={18} style={{ color: '#999999' }} />
                  </div>
                </div>
              </div>
            </Link>
          </div>

          {/* Outbound Marketing Kits */}
          <div style={{ marginBottom: '24px' }}>
            <div 
              onClick={() => labelDashboardStats && labelDashboardStats.grandTotal > 0 && setShowOutboundKitsDialog(true)}
              style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #EAEAEA',
                padding: '20px 24px',
                cursor: labelDashboardStats && labelDashboardStats.grandTotal > 0 ? 'pointer' : 'default',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (labelDashboardStats && labelDashboardStats.grandTotal > 0) {
                  e.currentTarget.style.borderColor = '#6366F1';
                  e.currentTarget.style.boxShadow = '0 2px 8px rgba(99, 102, 241, 0.15)';
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#EAEAEA';
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: labelDashboardStats && labelDashboardStats.grandTotal > 0 ? '16px' : '0' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Package size={18} style={{ color: '#FFFFFF' }} />
                </div>
                <div>
                  <div style={{ fontSize: '15px', fontWeight: 600, color: '#111111' }}>Outbound Marketing Kits</div>
                  <div style={{ fontSize: '12px', color: '#666666' }}>
                    {labelDashboardStats && labelDashboardStats.grandTotal > 0 
                      ? 'Click to view all sent materials' 
                      : 'Print labels from contact pages to start tracking'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontSize: '24px', fontWeight: 700, color: '#6366F1' }}>
                    {labelDashboardStats?.grandTotal ?? 0}
                  </span>
                  {labelDashboardStats && labelDashboardStats.grandTotal > 0 && (
                    <ChevronRight size={20} style={{ color: '#999999' }} />
                  )}
                </div>
              </div>
              {labelDashboardStats && labelDashboardStats.grandTotal > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {labelDashboardStats.stats.map(stat => (
                    <div key={stat.labelType} style={{
                      background: '#F5F3FF',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '12px',
                      color: '#7C3AED',
                      fontWeight: 500,
                    }}>
                      {stat.label}: {stat.count}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Outbound Kits Dialog */}
          <Dialog open={showOutboundKitsDialog} onOpenChange={setShowOutboundKitsDialog}>
            <DialogContent className="max-w-4xl max-h-[80vh] overflow-hidden flex flex-col">
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Package size={20} className="text-violet-600" />
                  Outbound Marketing Kits
                </DialogTitle>
              </DialogHeader>
              <div className="flex-1 overflow-auto">
                {isLoadingKits ? (
                  <div className="flex items-center justify-center py-8">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-violet-600"></div>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Date Sent</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-center">Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Sent By</TableHead>
                        <TableHead></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {outboundKitsData?.kits.map(kit => (
                        <TableRow key={kit.id}>
                          <TableCell className="text-sm text-gray-600">
                            {new Date(kit.createdAt).toLocaleDateString('en-US', { 
                              month: 'short', 
                              day: 'numeric',
                              year: 'numeric'
                            })}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium text-gray-900">{kit.customerName}</div>
                            {kit.customerEmail && (
                              <div className="text-xs text-gray-500">{kit.customerEmail}</div>
                            )}
                          </TableCell>
                          <TableCell>
                            <span className="inline-flex items-center px-2 py-1 rounded-md text-xs font-medium bg-violet-100 text-violet-700">
                              {kit.labelTypeDisplay}
                            </span>
                            {kit.otherDescription && (
                              <div className="text-xs text-gray-500 mt-1">{kit.otherDescription}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-center font-medium">{kit.quantity}</TableCell>
                          <TableCell className="text-sm text-gray-600">{kit.location}</TableCell>
                          <TableCell className="text-sm text-gray-600">{kit.printedBy}</TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setShowOutboundKitsDialog(false);
                                navigate(`/odoo-contacts/${kit.customerId}`);
                              }}
                              className="text-violet-600 hover:text-violet-800"
                            >
                              <ExternalLink size={14} className="mr-1" />
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {(!outboundKitsData?.kits || outboundKitsData.kits.length === 0) && (
                        <TableRow>
                          <TableCell colSpan={7} className="text-center py-8 text-gray-500">
                            No outbound kits have been sent yet.
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                )}
              </div>
            </DialogContent>
          </Dialog>

          {/* Objection Alert */}
          {openObjections > 0 && (
            <Link href="/objections" style={{ textDecoration: 'none', display: 'block', marginBottom: '24px' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #EAEAEA',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#F59E0B' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#111111' }}>Objection Summary</div>
                    <div style={{ fontSize: '12px', color: '#666666' }}>{openObjections} open objections need attention</div>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#999999' }} />
              </div>
            </Link>
          )}

          {/* Admin link - only visible to admins */}
          {isAdmin && (
            <Link href="/admin" style={{ textDecoration: 'none', display: 'block', marginBottom: '24px' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '12px',
                border: '1px solid #EAEAEA',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <Settings size={20} style={{ color: '#111111' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 500, color: '#111111' }}>Admin Panel</div>
                    <div style={{ fontSize: '12px', color: '#666666' }}>Manage users, settings, and configuration</div>
                  </div>
                </div>
                <ChevronRight size={18} style={{ color: '#999999' }} />
              </div>
            </Link>
          )}

        </div>
      </div>

      <style>{`
        @media (max-width: 768px) {
          .app-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (min-width: 769px) and (max-width: 991px) {
          .app-grid {
            grid-template-columns: repeat(4, 1fr) !important;
          }
        }
        @media (min-width: 992px) {
          .app-grid {
            grid-template-columns: repeat(6, 1fr) !important;
          }
        }
      `}</style>
    </>
  );
}

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
import { useQuery, useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";

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
    thisMonthStats: Array<{ labelType: string; label: string; count: number }>;
    thisMonthTotal: number;
    deadline: string;
    byUser: Array<{ userId: string; userName: string | null; count: number }>;
    recentPrints: Array<{ id: number; labelType: string; customerId: string; printedByUserName: string | null; createdAt: string }>;
    grandTotal: number;
  }
  const { data: labelDashboardStats } = useQuery<LabelDashboardStats>({
    queryKey: ['/api/dashboard/label-stats'],
    retry: 1,
    staleTime: 60000,
  });

  interface RecentWin {
    customerId: string;
    odooPartnerId: number | null;
    companyName: string;
    orderNumber: string;
    totalPrice: number;
    orderDate: string;
    daysToWin: number;
    attributedTo: string;
    attributedToName: string;
    stepSummary: {
      emails: number;
      swatchBooks: number;
      pressTestKits: number;
      mailers: number;
      calls: number;
      quotes: number;
      samples: number;
    };
  }
  const { data: recentWinsData } = useQuery<{ wins: RecentWin[]; period: string }>({
    queryKey: ['/api/dashboard/recent-wins'],
    retry: 1,
    staleTime: 60 * 1000,
    refetchInterval: 3 * 60 * 1000,
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

  const { data: kanbanData } = useQuery<{
    replied: any[];
    samplesRequested: any[];
    noResponse: any[];
    issues: any[];
  }>({
    queryKey: ['/api/dashboard/kanban'],
    refetchInterval: 60000,
  });

  const updateKanbanStage = useMutation({
    mutationFn: async ({ leadId, stage }: { leadId: number; stage: string }) =>
      apiRequest('PATCH', `/api/leads/${leadId}/kanban-stage`, { stage }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/dashboard/kanban'] }),
  });

  const [moveMenu, setMoveMenu] = useState<{ leadId: number; x: number; y: number } | null>(null);

  useEffect(() => {
    if (!moveMenu) return;
    const close = () => setMoveMenu(null);
    window.addEventListener('click', close);
    return () => window.removeEventListener('click', close);
  }, [moveMenu]);

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

          <div style={{ marginBottom: '24px' }}>
            <p style={{fontSize:'11px',fontWeight:600,color:'#8A8A8A',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:'12px'}}>Sales pipeline signals</p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '12px' }}>
              {[
                { key: 'replied', label: 'Emails Replied', color: '#D1FAE5', border: '#6EE7B7', dot: '#059669', emptyText: 'No replies yet', hint: 'Email replies, quote & sample requests', hintColor: '#6B8A6B' },
                { key: 'samplesRequested', label: 'Samples Requested', color: '#DBEAFE', border: '#BFDBFE', dot: '#2563EB', emptyText: 'No samples sent', hint: 'Swatchbook, press test kit, mailer sent', hintColor: '#4A6A9B' },
                { key: 'noResponse', label: 'No Response', color: '#FEF9C3', border: '#FDE047', dot: '#D97706', emptyText: 'All leads active', hint: 'Emailed 10+ days ago, no reply', hintColor: '#8A6A20' },
                { key: 'issues', label: 'Issues', color: '#FEE2E2', border: '#FECACA', dot: '#DC2626', emptyText: 'No issues logged', hint: 'Price, supply or print issues flagged', hintColor: '#8A3030' },
              ].map(col => {
                const items = kanbanData?.[col.key as keyof typeof kanbanData] || [];
                return (
                  <div key={col.key} style={{ background: col.color, border: `1px solid ${col.border}`, borderRadius: '12px', padding: '14px', minHeight: '180px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
                      <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: col.dot, flexShrink: 0, display: 'inline-block' }} />
                      <span style={{ fontSize: '12px', fontWeight: 600, color: '#1A1A1A' }}>{col.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: '11px', fontWeight: 600, color: col.dot, background: 'rgba(255,255,255,0.6)', padding: '1px 7px', borderRadius: '10px' }}>{items.length}</span>
                    </div>
                    <p style={{fontSize:'11px',color:col.hintColor,marginBottom:'8px',fontStyle:'italic'}}>{col.hint}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {items.length === 0 ? (
                        <p style={{ fontSize: '12px', color: '#8A8A8A', fontStyle: 'italic', margin: 0 }}>{col.emptyText}</p>
                      ) : (
                        items.slice(0, 6).map((item: any) => (
                          <div
                            key={item.id}
                            style={{ background: 'rgba(255,255,255,0.78)', borderRadius: '8px', padding: '8px 10px', marginBottom: '5px', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '3px' }}
                            onClick={(e) => { e.stopPropagation(); setMoveMenu(moveMenu?.leadId === item.id ? null : { leadId: item.id, x: e.clientX, y: e.clientY }); }}
                          >
                            <span style={{ fontSize: '12px', fontWeight: 500, color: '#1A1A1A', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.company || item.name}</span>
                            {item.signal && (
                              <span style={{ fontSize: '10px', fontWeight: 500, padding: '1px 6px', borderRadius: '4px', display: 'inline-block', width: 'fit-content', background: 'rgba(255,255,255,0.6)', color: '#4A4A4A' }}>{item.signal}</span>
                            )}
                          </div>
                        ))
                      )}
                      {items.length > 6 && (
                        <p style={{ fontSize: '11px', color: '#8A8A8A', margin: 0, padding: '2px 0' }}>+{items.length - 6} more</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {moveMenu && (
              <div
                style={{ position: 'fixed', top: moveMenu.y, left: moveMenu.x, zIndex: 1000, background: '#FFFFFF', border: '1px solid #EBEBEB', borderRadius: '10px', padding: '6px', boxShadow: '0 4px 20px rgba(0,0,0,0.12)', minWidth: '180px' }}
                onClick={(e) => e.stopPropagation()}
              >
                <p style={{ fontSize: '11px', color: '#8A8A8A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', padding: '4px 8px 6px', margin: 0 }}>Move to</p>
                {[
                  { stage: 'replied', label: 'Emails Replied', color: '#059669', bg: '#D1FAE5' },
                  { stage: 'samples_requested', label: 'Samples Requested', color: '#2563EB', bg: '#DBEAFE' },
                  { stage: 'no_response', label: 'No Response', color: '#D97706', bg: '#FEF9C3' },
                  { stage: 'issue', label: 'Issue', color: '#DC2626', bg: '#FEE2E2' },
                  { stage: null, label: 'Remove from board', color: '#8A8A8A', bg: '#F4F3F0' },
                ].map(opt => (
                  <button
                    key={opt.stage || 'remove'}
                    onClick={() => { updateKanbanStage.mutate({ leadId: moveMenu.leadId, stage: opt.stage as string }); setMoveMenu(null); }}
                    style={{ display: 'flex', alignItems: 'center', gap: '8px', width: '100%', padding: '7px 8px', borderRadius: '7px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: '13px', color: '#1A1A1A', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = opt.bg)}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: opt.color, flexShrink: 0, display: 'inline-block' }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            )}
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
                        {(() => {
                          const heat = ((leaderboardData as any)?.repHeat ?? []).find((r: any) =>
                            r.name?.toLowerCase().includes(repUser.display_name?.toLowerCase()?.split(' ')[0] ?? '')
                          );
                          if (!heat || (heat.critical === 0 && heat.escalated === 0)) return null;
                          return (
                            <div className="flex justify-between items-center text-xs border-t pt-1 mt-1">
                              <span className="text-gray-600">Overdue heat</span>
                              <span className={`font-bold ${heat.escalated > 0 ? 'text-red-800' : 'text-red-600'}`}>
                                {heat.escalated > 0 ? `${heat.escalated} AT RISK` : `${heat.critical} critical`}
                              </span>
                            </div>
                          );
                        })()}
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

          {/* Recent Wins - "What's Working This Week" */}
          {recentWinsData && recentWinsData.wins.length > 0 && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #D1FAE5',
              marginBottom: '24px',
              padding: '20px 24px',
            }}>
              {/* Section header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px' }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '8px',
                  background: 'linear-gradient(135deg, #10B981 0%, #059669 100%)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}>
                  <Trophy size={18} style={{ color: '#FFFFFF' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: '16px', fontWeight: 600, color: '#111111', margin: 0, lineHeight: 1.3 }}>
                    What's Working {recentWinsData.period === 'week' ? 'This Week' : 'This Month'}
                  </h2>
                  <p style={{ fontSize: '12px', color: '#6B7280', margin: 0 }}>
                    Real wins — learn the sequence and repeat it
                  </p>
                </div>
              </div>

              {/* Win cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: `repeat(${Math.min(recentWinsData.wins.length, 3)}, 1fr)`,
                gap: '12px',
              }}>
                {recentWinsData.wins.map((win) => {
                  const isMyWin = win.attributedTo === (user as any)?.email;
                  const contactHref = win.odooPartnerId ? `/odoo-contacts/${win.odooPartnerId}` : `/odoo-contacts/${win.customerId}`;

                  const stepBadges: { icon: string; label: string; count: number }[] = [
                    { icon: '✉️', label: 'Email', count: win.stepSummary.emails },
                    { icon: '📚', label: 'Swatch Book', count: win.stepSummary.swatchBooks },
                    { icon: '🧪', label: 'Press Kit', count: win.stepSummary.pressTestKits },
                    { icon: '📬', label: 'Mailer', count: win.stepSummary.mailers },
                    { icon: '📞', label: 'Call', count: win.stepSummary.calls },
                    { icon: '📄', label: 'Quote', count: win.stepSummary.quotes },
                    { icon: '📦', label: 'Sample', count: win.stepSummary.samples },
                  ].filter(b => b.count > 0);

                  return (
                    <div
                      key={win.customerId + win.orderNumber}
                      style={{
                        background: isMyWin ? 'linear-gradient(135deg, #ECFDF5 0%, #D1FAE5 100%)' : '#F9FAFB',
                        borderRadius: '10px',
                        border: isMyWin ? '1.5px solid #6EE7B7' : '1px solid #E5E7EB',
                        padding: '14px',
                        position: 'relative',
                      }}
                    >
                      {isMyWin && (
                        <div style={{
                          position: 'absolute',
                          top: '-10px',
                          right: '12px',
                          background: '#059669',
                          color: '#FFFFFF',
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 8px',
                          borderRadius: '99px',
                          letterSpacing: '0.03em',
                        }}>
                          🎉 Your Win!
                        </div>
                      )}

                      {/* Company name + order amount */}
                      <div style={{ marginBottom: '8px' }}>
                        <Link
                          href={contactHref}
                          style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#059669',
                            textDecoration: 'none',
                            display: 'block',
                            marginBottom: '2px',
                          }}
                          onMouseEnter={(e) => { (e.target as HTMLElement).style.textDecoration = 'underline'; }}
                          onMouseLeave={(e) => { (e.target as HTMLElement).style.textDecoration = 'none'; }}
                        >
                          {win.companyName}
                        </Link>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontSize: '15px', fontWeight: 700, color: '#065F46' }}>
                            ${win.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                          <span style={{ fontSize: '11px', color: '#9CA3AF' }}>
                            {win.orderNumber}
                          </span>
                        </div>
                      </div>

                      {/* Step summary badges */}
                      {stepBadges.length > 0 && (
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                          {stepBadges.map((badge, i) => (
                            <span
                              key={badge.label}
                              style={{
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '3px',
                                fontSize: '11px',
                                padding: '2px 7px',
                                borderRadius: '99px',
                                background: '#FFFFFF',
                                border: '1px solid #D1FAE5',
                                color: '#374151',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {badge.icon} {badge.count} {badge.count === 1 ? badge.label : badge.label + 's'}
                              {i < stepBadges.length - 1 && (
                                <span style={{ color: '#9CA3AF', marginLeft: '1px' }}>→</span>
                              )}
                            </span>
                          ))}
                          <span style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '3px',
                            fontSize: '11px',
                            padding: '2px 7px',
                            borderRadius: '99px',
                            background: '#059669',
                            color: '#FFFFFF',
                            whiteSpace: 'nowrap',
                            fontWeight: 600,
                          }}>
                            🏆 Order ${win.totalPrice.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                          </span>
                        </div>
                      )}

                      {/* Footer: days to win + attribution */}
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                        <span style={{ fontSize: '11px', color: '#6B7280' }}>
                          {win.daysToWin} {win.daysToWin === 1 ? 'day' : 'days'} from first touch
                        </span>
                        {!isMyWin && (
                          <span style={{ fontSize: '11px', color: '#6B7280', fontStyle: 'italic' }}>
                            by {win.attributedToName}
                          </span>
                        )}
                      </div>
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
          {(() => {
            const MONTHLY_GOAL = 50;
            const thisMonthTotal = labelDashboardStats?.thisMonthTotal ?? 0;
            const progressPct = Math.min(100, Math.round((thisMonthTotal / MONTHLY_GOAL) * 100));
            const deadline = labelDashboardStats?.deadline ?? '';
            const typeRows: Array<{ key: string; icon: string; label: string }> = [
              { key: 'swatch_book', icon: '📚', label: 'Swatch Books' },
              { key: 'press_test_kit', icon: '🧪', label: 'Press Test Kits' },
              { key: 'mailer', icon: '📬', label: 'Mailers' },
              { key: 'other', icon: '📦', label: 'Something Else' },
            ];
            const getMonthCount = (typeKey: string) =>
              labelDashboardStats?.thisMonthStats?.find(s => s.labelType === typeKey)?.count ?? 0;
            return (
              <div style={{ marginBottom: '24px' }}>
                <div style={{
                  background: '#FFFFFF',
                  borderRadius: '12px',
                  border: '1px solid #EAEAEA',
                  padding: '20px 24px',
                }}>
                  {/* Header row */}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', marginBottom: '16px' }}>
                    <div style={{
                      width: '36px',
                      height: '36px',
                      borderRadius: '8px',
                      background: 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Package size={18} style={{ color: '#FFFFFF' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: '15px', fontWeight: 600, color: '#111111' }}>Outbound Marketing Kits</span>
                        <span style={{ fontSize: '12px', color: '#888888' }}>
                          Physical touchpoints drive significantly more responses than email alone
                        </span>
                      </div>
                      {deadline && (
                        <div style={{ fontSize: '12px', color: '#F59E0B', fontWeight: 500, marginTop: '2px' }}>
                          Monthly goal: {MONTHLY_GOAL} kits by {deadline}
                        </div>
                      )}
                    </div>
                    <div
                      onClick={() => labelDashboardStats && labelDashboardStats.grandTotal > 0 && setShowOutboundKitsDialog(true)}
                      style={{
                        cursor: labelDashboardStats && labelDashboardStats.grandTotal > 0 ? 'pointer' : 'default',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '4px',
                      }}
                    >
                      <span style={{ fontSize: '22px', fontWeight: 700, color: '#6366F1' }}>{thisMonthTotal}</span>
                      <span style={{ fontSize: '12px', color: '#999999', alignSelf: 'flex-end', paddingBottom: '2px' }}>/ {MONTHLY_GOAL}</span>
                      {labelDashboardStats && labelDashboardStats.grandTotal > 0 && (
                        <ChevronRight size={16} style={{ color: '#999999', marginLeft: '2px' }} />
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div style={{ marginBottom: '16px' }}>
                    <div style={{
                      height: '8px',
                      borderRadius: '4px',
                      background: '#F3F4F6',
                      overflow: 'hidden',
                    }}>
                      <div style={{
                        height: '100%',
                        width: `${progressPct}%`,
                        borderRadius: '4px',
                        background: progressPct >= 100
                          ? 'linear-gradient(90deg, #10B981, #059669)'
                          : progressPct >= 60
                          ? 'linear-gradient(90deg, #6366F1, #8B5CF6)'
                          : 'linear-gradient(90deg, #F59E0B, #F97316)',
                        transition: 'width 0.4s ease',
                      }} />
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
                      <span style={{ fontSize: '11px', color: '#888888' }}>
                        {thisMonthTotal === 0
                          ? 'No kits sent yet this month — print labels from any contact page'
                          : `${thisMonthTotal} sent so far · ${Math.max(0, MONTHLY_GOAL - thisMonthTotal)} to go`}
                      </span>
                      <span style={{ fontSize: '11px', color: '#888888', fontWeight: 500 }}>{progressPct}%</span>
                    </div>
                  </div>

                  {/* Type breakdown — always visible */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px' }}>
                    {typeRows.map(({ key, icon, label }) => {
                      const count = getMonthCount(key);
                      return (
                        <div key={key} style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          background: count > 0 ? '#F5F3FF' : '#F9F9F9',
                          borderRadius: '6px',
                          padding: '6px 10px',
                        }}>
                          <span style={{ fontSize: '12px', color: count > 0 ? '#5B21B6' : '#AAAAAA' }}>
                            {icon} {label}
                          </span>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: 700,
                            color: count > 0 ? '#6D28D9' : '#CCCCCC',
                            minWidth: '20px',
                            textAlign: 'right',
                          }}>
                            {count}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })()}

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

import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Settings,
  AlertCircle,
  ChevronRight,
  Mail,
  Calendar,
  Zap,
  Building2,
  Flame,
  Package,
} from "lucide-react";
import { primaryApps, filterAppsByUser } from "@/lib/nav-links";
import { useAuth } from "@/hooks/useAuth";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import StartYourDayDashboard from "@/components/StartYourDayDashboard";
import ShipmentFollowUpWidget from "@/components/ShipmentFollowUpWidget";
import { ConnectionPrompt } from "@/components/ConnectionPrompt";
import { useQuery } from "@tanstack/react-query";
import { useAppUsage } from "@/hooks/useAppUsage";

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

interface ConnectionStatus {
  odoo: { connected: boolean; error: string | null };
  gmail: { connected: boolean; error: string | null };
  calendar: { connected: boolean; error: string | null };
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

  const { trackUsage } = useAppUsage();

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

  const { data: objections = [] } = useQuery<{ id: number; status: string }[]>({
    queryKey: ["/api/crm/objections"],
    retry: 1,
  });

  const { data: connectionStatus } = useQuery<ConnectionStatus>({
    queryKey: ['/api/integrations/status'],
    refetchOnWindowFocus: false,
    staleTime: 5 * 60 * 1000,
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
          
          {/* Header Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAEAEA',
            padding: '24px',
            marginBottom: '24px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
              <div>
                <p style={{ fontSize: '12px', fontWeight: 500, color: '#666666', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                  4S Graphics Dashboard
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginBottom: '8px' }}>
                  <h1 style={{ fontSize: '24px', fontWeight: 600, color: '#111111', margin: 0 }}>
                    Welcome back, {firstName}
                  </h1>
                </div>
                <p style={{ fontSize: '14px', color: '#6B6B8C', margin: 0 }}>{dateString}</p>
              </div>

              {/* Right side: Stats + Connection Icons */}
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '16px' }}>
                {/* Quick Stats */}
                {stats && (
                  <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#111111' }}>{stats.totalQuotes}</div>
                      <div style={{ fontSize: '12px', color: '#666666' }}>Total Quotes</div>
                    </div>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#111111' }}>{stats.totalCustomers}</div>
                      <div style={{ fontSize: '12px', color: '#666666' }}>Customers</div>
                    </div>
                    <Link href="/hot-leads" style={{ textDecoration: 'none' }}>
                      <div style={{ textAlign: 'center', cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '4px' }}>
                          <Flame size={18} style={{ color: '#E03D3E' }} />
                          <span style={{ fontSize: '24px', fontWeight: 700, color: '#E03D3E' }}>{stats.hotLeads || 0}</span>
                        </div>
                        <div style={{ fontSize: '12px', color: '#E03D3E', fontWeight: 500 }}>Hot Leads</div>
                      </div>
                    </Link>
                    <div style={{ textAlign: 'center' }}>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#111111' }}>{stats.quotesThisMonth}</div>
                      <div style={{ fontSize: '12px', color: '#666666' }}>This Month</div>
                    </div>
                  </div>
                )}

                {/* Connection Status Icons */}
                <TooltipProvider>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: connectionStatus?.odoo?.connected ? 'rgba(17, 17, 17, 0.05)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.odoo?.connected ? 'rgba(17, 17, 17, 0.15)' : 'rgba(108, 117, 125, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                        }}>
                          <Building2 size={18} style={{ color: connectionStatus?.odoo?.connected ? '#111111' : '#999999' }} />
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: connectionStatus?.odoo?.connected ? '#111111' : '#999999',
                            border: '2px solid white',
                          }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>Odoo: {connectionStatus?.odoo?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: connectionStatus?.gmail?.connected ? 'rgba(17, 17, 17, 0.05)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.gmail?.connected ? 'rgba(17, 17, 17, 0.15)' : 'rgba(108, 117, 125, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                        }}>
                          <Mail size={18} style={{ color: connectionStatus?.gmail?.connected ? '#111111' : '#999999' }} />
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: connectionStatus?.gmail?.connected ? '#111111' : '#999999',
                            border: '2px solid white',
                          }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>Gmail: {connectionStatus?.gmail?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          width: '36px',
                          height: '36px',
                          borderRadius: '8px',
                          background: connectionStatus?.calendar?.connected ? 'rgba(17, 17, 17, 0.05)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.calendar?.connected ? 'rgba(17, 17, 17, 0.15)' : 'rgba(108, 117, 125, 0.3)'}`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          cursor: 'pointer',
                          position: 'relative',
                        }}>
                          <Calendar size={18} style={{ color: connectionStatus?.calendar?.connected ? '#111111' : '#999999' }} />
                          <div style={{
                            position: 'absolute',
                            bottom: '-2px',
                            right: '-2px',
                            width: '10px',
                            height: '10px',
                            borderRadius: '50%',
                            background: connectionStatus?.calendar?.connected ? '#111111' : '#999999',
                            border: '2px solid white',
                          }} />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>Calendar: {connectionStatus?.calendar?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>
              </div>
            </div>
          </div>

          {/* Notion-style Top Icon Bar */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #EAEAEA',
            marginBottom: '24px',
            padding: '12px 16px',
          }}>
            <ScrollArea className="w-full">
              <div style={{ display: 'flex', gap: '8px', paddingBottom: '4px' }}>
                {filterAppsByUser(primaryApps, user?.email).map((app) => {
                  const Icon = app.icon;
                  return (
                    <Link
                      key={app.path}
                      href={app.path}
                      onClick={() => trackUsage(app.path)}
                      style={{ textDecoration: 'none' }}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div
                            style={{
                              display: 'flex',
                              flexDirection: 'column',
                              alignItems: 'center',
                              justifyContent: 'flex-start',
                              padding: '12px 8px',
                              borderRadius: '8px',
                              cursor: 'pointer',
                              transition: 'background 0.15s ease',
                              width: '80px',
                              minHeight: '72px',
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.background = '#F2F2F2'}
                            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                            data-testid={`icon-${app.label.toLowerCase().replace(/\s+/g, '-')}`}
                          >
                            <div style={{
                              width: '36px',
                              height: '36px',
                              borderRadius: '8px',
                              backgroundColor: app.iconBg || '#878682',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              marginBottom: '8px',
                            }}>
                              <Icon size={18} style={{ color: app.iconColor || '#FFFFFF' }} />
                            </div>
                            <span style={{
                              fontSize: '9px',
                              fontWeight: 600,
                              color: '#37352F',
                              textAlign: 'center',
                              textTransform: 'uppercase',
                              letterSpacing: '0.5px',
                              lineHeight: 1.3,
                              maxWidth: '72px',
                              wordWrap: 'break-word',
                            }}>
                              {app.label}
                            </span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent side="bottom">
                          <p>{app.description || app.label}</p>
                        </TooltipContent>
                      </Tooltip>
                    </Link>
                  );
                })}
              </div>
              <ScrollBar orientation="horizontal" />
            </ScrollArea>
          </div>

          {/* Spotlight Entry Card */}
          <Link href="/spotlight" style={{ textDecoration: 'none', display: 'block', marginBottom: '24px' }}>
            <div style={{
              background: '#111111',
              borderRadius: '12px',
              padding: '20px 24px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <div style={{
                  width: '48px',
                  height: '48px',
                  borderRadius: '10px',
                  background: 'rgba(255,255,255,0.15)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}>
                  <Zap size={24} style={{ color: '#FFFFFF' }} />
                </div>
                <div>
                  <div style={{ fontSize: '16px', fontWeight: 600, color: '#FFFFFF', marginBottom: '2px' }}>
                    Spotlight
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                    One client at a time. Focus on what matters.
                  </div>
                </div>
              </div>
              <ChevronRight size={20} style={{ color: '#FFFFFF' }} />
            </div>
          </Link>

          {/* Start Your Day Dashboard */}
          <div style={{ marginBottom: '32px' }}>
            <StartYourDayDashboard />
          </div>

          {/* Shipment Follow-up Tasks */}
          <div style={{ marginBottom: '32px' }}>
            <ShipmentFollowUpWidget />
          </div>

          {/* Outbound Marketing Kits */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '12px',
              border: '1px solid #EAEAEA',
              padding: '20px 24px',
            }}>
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
                      ? 'Tracking sent materials' 
                      : 'Print labels from contact pages to start tracking'}
                  </div>
                </div>
                <div style={{ marginLeft: 'auto', fontSize: '24px', fontWeight: 700, color: '#6366F1' }}>
                  {labelDashboardStats?.grandTotal ?? 0}
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

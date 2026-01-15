import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { 
  Settings,
  AlertCircle,
  ChevronRight,
  Clock,
  Mail,
  Gauge,
  Lightbulb,
  Calendar,
  Zap,
  Building2,
} from "lucide-react";
import { primaryApps } from "@/lib/nav-links";
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

  // Efficiency score for NOW MODE
  const { data: efficiencyData } = useQuery<{ efficiencyScore: number; totalTasksCompleted: number }>({
    queryKey: ['/api/now-mode/efficiency'],
    refetchOnWindowFocus: false,
    staleTime: 60 * 1000,
    retry: 1,
  });

  // Dormancy check for popup
  const { data: dormancyData } = useQuery<{
    isDormant: boolean;
    efficiencyScore: number;
    todayCompleted: number;
    todayRemaining: number;
    coachingMessage: string;
  }>({
    queryKey: ['/api/now-mode/dormancy-check'],
    refetchOnWindowFocus: true,
    refetchInterval: 5 * 60 * 1000, // Check every 5 minutes
    retry: 1,
  });

  const [showDormancyPopup, setShowDormancyPopup] = useState(false);
  const [dormancyDismissed, setDormancyDismissed] = useState(false);
  const [lastDormancyCheck, setLastDormancyCheck] = useState<boolean | null>(null);

  // Show dormancy popup when user has been inactive for 90 minutes
  // Reset dismissed state when user becomes active again (to allow popup on next dormancy)
  useEffect(() => {
    if (dormancyData?.isDormant !== undefined) {
      // Reset dismissed state when user returns from dormancy (was dormant, now active)
      if (lastDormancyCheck === true && !dormancyData.isDormant) {
        setDormancyDismissed(false);
      }
      // Show popup when dormant and not dismissed
      if (dormancyData.isDormant && !dormancyDismissed) {
        setShowDormancyPopup(true);
      }
      setLastDormancyCheck(dormancyData.isDormant);
    }
  }, [dormancyData?.isDormant, dormancyDismissed, lastDormancyCheck]);

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
                  {/* Efficiency Score Badge */}
                  {efficiencyData && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '20px',
                          background: 'rgba(17, 17, 17, 0.05)',
                          border: '1px solid rgba(17, 17, 17, 0.15)',
                          cursor: 'pointer',
                        }}>
                          <Gauge size={18} style={{ color: '#111111' }} />
                          <span style={{
                            fontSize: '14px',
                            fontWeight: 600,
                            color: '#111111',
                          }}>
                            {efficiencyData.efficiencyScore}%
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>Your 7-day efficiency score</p>
                        <p style={{ fontSize: '12px', color: '#6B6B8C' }}>{efficiencyData.totalTasksCompleted} total tasks completed</p>
                      </TooltipContent>
                    </Tooltip>
                  )}
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
                {primaryApps.map((app) => {
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
                            <Icon size={24} style={{ color: '#111111', marginBottom: '8px' }} />
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

          {/* Now Mode Entry Card */}
          <Link href="/now-mode" style={{ textDecoration: 'none', display: 'block', marginBottom: '24px' }}>
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
                    Now Mode
                  </div>
                  <div style={{ fontSize: '14px', color: 'rgba(255,255,255,0.7)' }}>
                    One customer. One action. Right now.
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

      {/* Dormancy Popup - appears after 90 minutes of inactivity */}
      {showDormancyPopup && dormancyData && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0, 0, 0, 0.5)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
        }}>
          <div style={{
            background: '#FFFFFF',
            borderRadius: '2px',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.2)',
            maxWidth: '420px',
            width: '90%',
            padding: '32px',
            textAlign: 'center',
          }}>
            <div style={{
              width: '80px',
              height: '80px',
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #6F42C1 0%, #8B5CF6 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <Clock size={40} style={{ color: '#FFFFFF' }} />
            </div>
            
            <h2 style={{ fontSize: '24px', fontWeight: 700, color: '#2C2C54', marginBottom: '8px' }}>
              Time for a check-in!
            </h2>
            
            <p style={{ fontSize: '14px', color: '#6B6B8C', marginBottom: '24px' }}>
              No activity in 90 minutes. Here's your progress:
            </p>

            {/* Progress Display - x/10 format */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '16px',
              padding: '20px',
              background: '#F8F9FA',
              borderRadius: '8px',
              marginBottom: '16px',
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: '#6F42C1',
                  lineHeight: 1,
                }}>
                  {dormancyData.todayCompleted}/10
                </div>
                <div style={{ fontSize: '13px', color: '#6B6B8C', marginTop: '4px' }}>Today's Progress</div>
              </div>
              <div style={{
                width: '1px',
                height: '50px',
                background: '#E0E0E0',
              }} />
              <div style={{ textAlign: 'center' }}>
                <div style={{
                  fontSize: '36px',
                  fontWeight: 700,
                  color: dormancyData.efficiencyScore >= 80 ? '#111111' : 
                         dormancyData.efficiencyScore >= 50 ? '#FFC107' : '#DC3545',
                  lineHeight: 1,
                }}>
                  {dormancyData.efficiencyScore}
                </div>
                <div style={{ fontSize: '13px', color: '#6B6B8C', marginTop: '4px' }}>Efficiency Score</div>
              </div>
            </div>

            {/* Coaching Message */}
            <div style={{
              background: 'rgba(111, 66, 193, 0.08)',
              borderRadius: '8px',
              padding: '16px',
              marginBottom: '24px',
              textAlign: 'left',
            }}>
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
                <Lightbulb size={20} style={{ color: '#6F42C1', flexShrink: 0, marginTop: '2px' }} />
                <p style={{ fontSize: '14px', color: '#2C2C54', margin: 0, lineHeight: 1.5 }}>
                  {dormancyData.coachingMessage}
                </p>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <Link href="/now-mode" style={{ textDecoration: 'none' }}>
                <Button
                  onClick={() => {
                    setShowDormancyPopup(false);
                    setDormancyDismissed(true);
                  }}
                  style={{
                    width: '100%',
                    background: 'linear-gradient(135deg, #6F42C1 0%, #8B5CF6 100%)',
                    color: '#FFFFFF',
                    padding: '12px 24px',
                  }}
                >
                  <Zap size={18} style={{ marginRight: '8px' }} />
                  Resume NOW MODE
                </Button>
              </Link>
              <Button
                variant="outline"
                onClick={() => {
                  setShowDormancyPopup(false);
                  setDormancyDismissed(true);
                  setTimeout(() => setDormancyDismissed(false), 60 * 60 * 1000);
                }}
                style={{ width: '100%' }}
              >
                <Clock size={16} style={{ marginRight: '8px' }} />
                Snooze 60 mins
              </Button>
            </div>
          </div>
        </div>
      )}

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

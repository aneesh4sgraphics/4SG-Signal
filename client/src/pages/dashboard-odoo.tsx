import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { 
  Calculator, 
  FileText, 
  Database, 
  Users, 
  BarChart3, 
  TrendingUp,
  Settings,
  AlertCircle,
  DollarSign,
  Package,
  Printer,
  Layers,
  ChevronRight,
  ChevronDown,
  Truck,
  Tag,
  Target,
  FlaskConical,
  Palette,
  Activity,
  Grid3X3,
  Clock,
  History,
  Mail,
  HardDrive,
  Gauge,
  AlertTriangle,
  Flame,
  Lightbulb,
  Calendar,
  Zap
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import StartYourDayDashboard from "@/components/StartYourDayDashboard";
import ShipmentFollowUpWidget from "@/components/ShipmentFollowUpWidget";
import { ConnectionPrompt, ConnectionStatusBanner } from "@/components/ConnectionPrompt";
import { useQuery } from "@tanstack/react-query";
import { useAppUsage } from "@/hooks/useAppUsage";
import { Progress } from "@/components/ui/progress";

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

const allApps = [
  { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes', color: '#17A2B8' },
  { path: '/price-list', icon: DollarSign, label: 'Price List', color: '#6F42C1' },
  { path: '/saved-quotes', icon: BarChart3, label: 'Saved Quotes', color: '#0D6EFD' },
  { path: '/sales-analytics', icon: TrendingUp, label: 'Sales Charts', color: '#28A745' },
  { path: '/clients', icon: Users, label: 'Clients', color: '#28A745' },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator', color: '#0D6EFD' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices', color: '#DC3545' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping', color: '#17A2B8' },
  { path: '/shipping-labels', icon: Package, label: 'Shipping Labels', color: '#0D6EFD' },
  { path: '/product-labels', icon: Tag, label: 'Product Labels', color: '#D63384' },
  { path: '/crm-samples', icon: FlaskConical, label: 'Samples', color: '#17A2B8' },
  { path: '/crm-swatches', icon: Palette, label: 'Swatches', color: '#6F42C1' },
  { path: '/email-app', icon: Mail, label: 'Email Studio', color: '#D63384' },
  { path: '/crm-journey', icon: Target, label: 'CRM Journey', color: '#28A745' },
  { path: '/calendar', icon: Calendar, label: 'Calendar', color: '#FFC107' },
  { path: '/objections', icon: AlertTriangle, label: 'Objections', color: '#FD7E14' },
];

const adminApps = [
  { path: '/admin', icon: Users, label: 'Users', color: '#6F42C1' },
  { path: '/activity-logs', icon: Activity, label: 'Activity', color: '#17A2B8' },
  { path: '/product-pricing-management', icon: Database, label: 'Products', color: '#0D6EFD' },
  { path: '/pdf-settings', icon: FileText, label: 'PDF Settings', color: '#28A745' },
];

export default function Dashboard() {
  const [hoveredTile, setHoveredTile] = useState<string | null>(null);
  const [appsOpen, setAppsOpen] = useState(false);
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
    queryKey: ["/api/dashboard/api-costs", { days: '30' }],
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

  const openObjections = objections.filter(o => o.status === 'open').length;

  if (isLoading) {
    return (
      <div className="dashboard-container" style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
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
            border: '3px solid #6F42C1',
            borderTop: '3px solid transparent',
            borderRadius: '50%',
            animation: 'spin 1s linear infinite',
          }} />
          <span style={{ color: '#6B6B8C', fontSize: '14px', fontWeight: 500 }}>Loading...</span>
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
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
      }}>
        <div style={{
          background: '#FFFFFF',
          borderRadius: '2px',
          padding: '48px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
          textAlign: 'center',
          maxWidth: '400px',
        }}>
          <AlertCircle style={{ width: '48px', height: '48px', color: '#6B6B8C', marginBottom: '16px' }} />
          <h3 style={{ fontSize: '20px', fontWeight: 700, color: '#2C2C54', marginBottom: '8px' }}>
            Sign in required
          </h3>
          <p style={{ fontSize: '14px', color: '#6B6B8C', marginBottom: '24px' }}>
            Please sign in to access your dashboard
          </p>
          <Button 
            onClick={() => window.location.href = "/api/login"}
            style={{
              background: '#6F42C1',
              color: '#FFFFFF',
              borderRadius: '2px',
              padding: '12px 24px',
              fontWeight: 600,
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

  const AppTile = ({ app, index }: { app: typeof allApps[0]; index: number }) => {
    const Icon = app.icon;
    const isHovered = hoveredTile === `app-${index}`;
    
    return (
      <Link
        href={app.path}
        onClick={() => trackUsage(app.path)}
        onMouseEnter={() => setHoveredTile(`app-${index}`)}
        onMouseLeave={() => setHoveredTile(null)}
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '24px',
          background: '#FFFFFF',
          borderRadius: '2px',
          boxShadow: isHovered 
            ? '0 4px 16px rgba(0,0,0,0.12)' 
            : '0 2px 8px rgba(0,0,0,0.08)',
          cursor: 'pointer',
          textDecoration: 'none',
          transition: 'all 0.2s ease-in-out',
          transform: isHovered ? 'scale(1.02)' : 'scale(1)',
          aspectRatio: '1',
          minHeight: '140px',
        }}
        data-testid={`tile-${app.label.toLowerCase().replace(/\s+/g, '-')}`}
      >
        <div style={{
          width: '64px',
          height: '64px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
        }}>
          <Icon size={48} style={{ color: app.color }} />
        </div>
        <span style={{
          fontSize: '14px',
          fontWeight: 500,
          color: '#2C2C54',
          textAlign: 'center',
          lineHeight: 1.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical',
        }}>
          {app.label}
        </span>
      </Link>
    );
  };

  return (
    <>
      <ConnectionPrompt />
      <div style={{
        minHeight: '100vh',
        background: 'linear-gradient(135deg, #E8E5F0 0%, #F0EDF7 100%)',
        fontFamily: 'Inter, SF Pro, Segoe UI, system-ui, sans-serif',
        margin: '-24px',
        padding: '40px 24px',
      }}>
        <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
          
          {/* Header Card */}
          <div style={{
            background: '#FFFFFF',
            borderRadius: '2px',
            boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
            padding: '32px',
            marginBottom: '32px',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
              <div>
                {/* Connection Status */}
                <TooltipProvider>
                  <div style={{ display: 'flex', gap: '12px', marginBottom: '16px' }}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '2px',
                          background: connectionStatus?.odoo?.connected ? 'rgba(40, 167, 69, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.odoo?.connected ? 'rgba(40, 167, 69, 0.3)' : 'rgba(108, 117, 125, 0.3)'}`,
                          cursor: 'pointer',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: connectionStatus?.odoo?.connected ? '#28A745' : '#6C757D',
                          }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: connectionStatus?.odoo?.connected ? '#28A745' : '#6C757D' }}>
                            Odoo
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>{connectionStatus?.odoo?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '2px',
                          background: connectionStatus?.gmail?.connected ? 'rgba(40, 167, 69, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.gmail?.connected ? 'rgba(40, 167, 69, 0.3)' : 'rgba(108, 117, 125, 0.3)'}`,
                          cursor: 'pointer',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: connectionStatus?.gmail?.connected ? '#28A745' : '#6C757D',
                          }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: connectionStatus?.gmail?.connected ? '#28A745' : '#6C757D' }}>
                            Gmail
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>{connectionStatus?.gmail?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                    
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          padding: '6px 12px',
                          borderRadius: '2px',
                          background: connectionStatus?.calendar?.connected ? 'rgba(40, 167, 69, 0.1)' : 'rgba(108, 117, 125, 0.1)',
                          border: `1px solid ${connectionStatus?.calendar?.connected ? 'rgba(40, 167, 69, 0.3)' : 'rgba(108, 117, 125, 0.3)'}`,
                          cursor: 'pointer',
                        }}>
                          <div style={{
                            width: '8px',
                            height: '8px',
                            borderRadius: '50%',
                            background: connectionStatus?.calendar?.connected ? '#28A745' : '#6C757D',
                          }} />
                          <span style={{ fontSize: '11px', fontWeight: 600, color: connectionStatus?.calendar?.connected ? '#28A745' : '#6C757D' }}>
                            Calendar
                          </span>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent><p>{connectionStatus?.calendar?.connected ? 'Connected' : 'Disconnected'}</p></TooltipContent>
                    </Tooltip>
                  </div>
                </TooltipProvider>

                <p style={{ fontSize: '12px', fontWeight: 600, color: '#6B6B8C', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '8px' }}>
                  4S Graphics Dashboard
                </p>
                <h1 style={{ fontSize: '32px', fontWeight: 700, color: '#2C2C54', margin: '0 0 8px 0' }}>
                  Welcome back, {firstName}
                </h1>
                <p style={{ fontSize: '14px', color: '#6B6B8C', margin: 0 }}>{dateString}</p>
              </div>

              {/* Quick Stats */}
              {stats && (
                <div style={{ display: 'flex', gap: '24px', flexWrap: 'wrap' }}>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#6F42C1' }}>{stats.totalQuotes}</div>
                    <div style={{ fontSize: '12px', color: '#6B6B8C' }}>Total Quotes</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#28A745' }}>{stats.totalCustomers}</div>
                    <div style={{ fontSize: '12px', color: '#6B6B8C' }}>Customers</div>
                  </div>
                  <div style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: '24px', fontWeight: 700, color: '#0D6EFD' }}>{stats.quotesThisMonth}</div>
                    <div style={{ fontSize: '12px', color: '#6B6B8C' }}>This Month</div>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Collapsible App Launcher Tray */}
          <Collapsible open={appsOpen} onOpenChange={setAppsOpen}>
            <div style={{
              background: '#FFFFFF',
              borderRadius: '2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              marginBottom: '24px',
              overflow: 'hidden',
            }}>
              <CollapsibleTrigger asChild>
                <button
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '16px 24px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    transition: 'background 0.2s ease',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(111, 66, 193, 0.05)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <Grid3X3 size={20} style={{ color: '#6F42C1' }} />
                    <span style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C54' }}>
                      App Launcher
                    </span>
                    <span style={{ fontSize: '12px', color: '#6B6B8C' }}>
                      ({allApps.length} apps)
                    </span>
                  </div>
                  <ChevronDown 
                    size={20} 
                    style={{ 
                      color: '#6B6B8C',
                      transition: 'transform 0.2s ease',
                      transform: appsOpen ? 'rotate(180deg)' : 'rotate(0deg)',
                    }} 
                  />
                </button>
              </CollapsibleTrigger>
              
              <CollapsibleContent>
                <div style={{ padding: '0 24px 24px 24px' }}>
                  <div 
                    className="app-grid"
                    style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(6, 1fr)',
                      gap: '24px',
                    }}
                  >
                    {allApps.map((app, index) => (
                      <AppTile key={app.path} app={app} index={index} />
                    ))}
                  </div>
                </div>
              </CollapsibleContent>
            </div>
          </Collapsible>

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
            <Link href="/objections" style={{ textDecoration: 'none', display: 'block', marginBottom: '32px' }}>
              <div style={{
                background: '#FFFFFF',
                borderRadius: '2px',
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                padding: '16px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                border: '1px solid rgba(253, 126, 20, 0.3)',
                cursor: 'pointer',
                transition: 'all 0.2s ease-in-out',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <AlertTriangle size={24} style={{ color: '#FD7E14' }} />
                  <div>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: '#2C2C54' }}>Objection Summary</div>
                    <div style={{ fontSize: '12px', color: '#6B6B8C' }}>{openObjections} open objections need attention</div>
                  </div>
                </div>
                <ChevronRight size={20} style={{ color: '#FD7E14' }} />
              </div>
            </Link>
          )}

          {/* CRM Pipeline Stats */}
          {crmStats && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              padding: '32px',
              marginBottom: '32px',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2C2C54', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Users size={24} style={{ color: '#6B6B8C' }} />
                Customer Journey Pipeline
              </h2>

              {/* KPI Cards */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: '16px',
                marginBottom: '24px',
              }}>
                <div style={{ background: 'rgba(111, 66, 193, 0.1)', borderRadius: '2px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#6F42C1' }}>{crmStats.totalCustomers}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8C' }}>Total Customers</div>
                </div>
                <div style={{ background: 'rgba(40, 167, 69, 0.1)', borderRadius: '2px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#28A745' }}>{crmStats.totalActiveJourneys}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8C' }}>Active Journeys</div>
                </div>
                <div style={{ background: 'rgba(13, 110, 253, 0.1)', borderRadius: '2px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#0D6EFD' }}>{crmStats.totalQuotesSent}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8C' }}>Quotes Sent</div>
                </div>
                <div style={{ background: 'rgba(255, 193, 7, 0.1)', borderRadius: '2px', padding: '20px', textAlign: 'center' }}>
                  <div style={{ fontSize: '28px', fontWeight: 700, color: '#FFC107' }}>{crmStats.newCustomersLast30Days}</div>
                  <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8C' }}>New (30 Days)</div>
                </div>
                {crmStats.hotProspects > 0 && (
                  <Link href="/client-database?filter=hot" style={{ textDecoration: 'none' }}>
                    <div style={{ background: 'rgba(253, 126, 20, 0.15)', borderRadius: '2px', padding: '20px', textAlign: 'center', border: '2px solid rgba(253, 126, 20, 0.3)', cursor: 'pointer' }}>
                      <div style={{ fontSize: '28px', fontWeight: 700, color: '#FD7E14', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                        <Flame size={24} />
                        {crmStats.hotProspects}
                      </div>
                      <div style={{ fontSize: '12px', fontWeight: 500, color: '#6B6B8C' }}>Hot Leads</div>
                    </div>
                  </Link>
                )}
              </div>

              {/* Stage Distribution */}
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                {crmStats.stageCounts.map((stage, i) => {
                  const stageLabels: Record<string, string> = {
                    trigger: 'Trigger',
                    internal_alarm: 'Internal Alarm',
                    supplier_pushback: 'Supplier Pushback',
                    pilot_alignment: 'Pilot Alignment',
                    controlled_trial: 'Controlled Trial',
                    validation_proof: 'Validation & Proof',
                    conversion: 'Conversion'
                  };
                  const stageColors: Record<string, string> = {
                    trigger: '#DC3545',
                    internal_alarm: '#FD7E14',
                    supplier_pushback: '#FFC107',
                    pilot_alignment: '#28A745',
                    controlled_trial: '#17A2B8',
                    validation_proof: '#0D6EFD',
                    conversion: '#6F42C1'
                  };
                  return (
                    <Link key={i} href="/crm-journey" style={{ textDecoration: 'none' }}>
                      <div style={{
                        background: `${stageColors[stage.stage]}15`,
                        border: `1px solid ${stageColors[stage.stage]}40`,
                        borderRadius: '2px',
                        padding: '12px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: '100px',
                        cursor: 'pointer',
                        transition: 'transform 0.2s ease-in-out',
                      }}>
                        <div style={{ fontSize: '24px', fontWeight: 700, color: stageColors[stage.stage] }}>{stage.count}</div>
                        <div style={{ fontSize: '11px', fontWeight: 500, color: '#6B6B8C', textAlign: 'center' }}>
                          {stageLabels[stage.stage] || stage.stage}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Activity Stats */}
              <div style={{ display: 'flex', gap: '24px', marginTop: '24px', paddingTop: '20px', borderTop: '1px solid rgba(0,0,0,0.08)', flexWrap: 'wrap' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#FD7E14' }} />
                  <span style={{ fontSize: '14px', color: '#6B6B8C' }}><strong style={{ color: '#2C2C54' }}>{crmStats.pendingSamples}</strong> pending samples</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#17A2B8' }} />
                  <span style={{ fontSize: '14px', color: '#6B6B8C' }}><strong style={{ color: '#2C2C54' }}>{crmStats.pendingSwatches}</strong> pending swatches</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#6F42C1' }} />
                  <span style={{ fontSize: '14px', color: '#6B6B8C' }}><strong style={{ color: '#2C2C54' }}>{crmStats.activePressProfiles}</strong> press profiles</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#28A745' }} />
                  <span style={{ fontSize: '14px', color: '#6B6B8C' }}><strong style={{ color: '#2C2C54' }}>{crmStats.quotesLast30Days}</strong> quotes (30 days)</span>
                </div>
                {crmStats.pendingFeedback > 0 && (
                  <Link href="/crm-samples" style={{ textDecoration: 'none' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 12px', borderRadius: '16px', background: 'rgba(220, 53, 69, 0.1)', border: '1px solid rgba(220, 53, 69, 0.3)' }}>
                      <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#DC3545' }} />
                      <span style={{ fontSize: '14px', color: '#DC3545', fontWeight: 600 }}>{crmStats.pendingFeedback} awaiting feedback</span>
                    </div>
                  </Link>
                )}
              </div>
            </div>
          )}

          {/* Admin Section */}
          {isAdmin && (
            <div style={{
              background: '#FFFFFF',
              borderRadius: '2px',
              boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
              padding: '32px',
              marginBottom: '32px',
            }}>
              <h2 style={{ fontSize: '20px', fontWeight: 700, color: '#2C2C54', marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '12px' }}>
                <Settings size={24} style={{ color: '#6B6B8C' }} />
                Admin Tools
              </h2>
              
              <div 
                className="app-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(6, 1fr)',
                  gap: '24px',
                }}
              >
                {adminApps.map((app, index) => (
                  <AppTile key={app.path} app={app} index={100 + index} />
                ))}
              </div>

              {/* Usage Stats */}
              {usageStats && (
                <div style={{ marginTop: '32px', padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <Gauge size={20} style={{ color: '#28A745' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2C2C54', margin: 0 }}>Resource Usage</h3>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '2px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <HardDrive size={16} style={{ color: '#0D6EFD' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B6B8C' }}>Database</span>
                      </div>
                      <div style={{ fontSize: '20px', fontWeight: 700, color: '#2C2C54', marginBottom: '8px' }}>{usageStats.database.size}</div>
                      <Progress value={(usageStats.database.sizeBytes / usageStats.limits.dbMaxSizeBytes) * 100} className="h-2" />
                      <div style={{ fontSize: '11px', color: '#6B6B8C', marginTop: '4px' }}>of {usageStats.limits.dbMaxSize}</div>
                    </div>
                    
                    <div style={{ background: '#FFFFFF', borderRadius: '2px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Database size={16} style={{ color: '#6F42C1' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B6B8C' }}>Records</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#2C2C54' }}>{usageStats.records.customers.toLocaleString()}</div>
                          <div style={{ fontSize: '11px', color: '#6B6B8C' }}>Customers</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#2C2C54' }}>{usageStats.records.products.toLocaleString()}</div>
                          <div style={{ fontSize: '11px', color: '#6B6B8C' }}>Products</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#2C2C54' }}>{usageStats.records.quotes.toLocaleString()}</div>
                          <div style={{ fontSize: '11px', color: '#6B6B8C' }}>Quotes</div>
                        </div>
                        <div>
                          <div style={{ fontSize: '16px', fontWeight: 700, color: '#2C2C54' }}>{Number(usageStats.records.activityLogs).toLocaleString()}</div>
                          <div style={{ fontSize: '11px', color: '#6B6B8C' }}>Logs</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* API Cost Tracking */}
              {apiCosts && (
                <div style={{ marginTop: '24px', padding: '24px', background: 'rgba(0,0,0,0.02)', borderRadius: '2px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                    <DollarSign size={20} style={{ color: '#6F42C1' }} />
                    <h3 style={{ fontSize: '16px', fontWeight: 600, color: '#2C2C54', margin: 0 }}>API Spending ({apiCosts.summary.periodDays} days)</h3>
                  </div>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '16px' }}>
                    <div style={{ background: '#FFFFFF', borderRadius: '2px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <DollarSign size={16} style={{ color: '#28A745' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B6B8C' }}>Total Spend</span>
                      </div>
                      <div style={{ fontSize: '24px', fontWeight: 700, color: '#2C2C54', marginBottom: '4px' }}>${apiCosts.summary.totalCost.toFixed(2)}</div>
                      <div style={{ fontSize: '11px', color: '#6B6B8C' }}>{apiCosts.summary.totalCalls.toLocaleString()} calls</div>
                    </div>
                    
                    <div style={{ background: '#FFFFFF', borderRadius: '2px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                        <Activity size={16} style={{ color: '#FD7E14' }} />
                        <span style={{ fontSize: '13px', fontWeight: 600, color: '#6B6B8C' }}>Top Spenders</span>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                        {apiCosts.byOperation.slice(0, 3).map((op, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: '11px', color: '#6B6B8C' }}>{op.operation.replace(/_/g, ' ')}</span>
                            <span style={{ fontSize: '11px', fontWeight: 600, color: '#2C2C54' }}>${parseFloat(op.total_cost || '0').toFixed(2)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
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

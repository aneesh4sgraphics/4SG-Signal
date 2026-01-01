import { useState } from "react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
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
  Sparkles,
  ArrowUpRight,
  Printer,
  Layers,
  ChevronRight,
  Truck,
  Tag,
  Target,
  FlaskConical,
  Palette,
  Activity,
  Grid3X3,
  Plus,
  Clock,
  History,
  Mail,
  HardDrive,
  Gauge,
  AlertTriangle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import StartYourDayDashboard from "@/components/StartYourDayDashboard";
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

// Grouped app tiles by category
const appCategories = [
  {
    name: 'Sales Tools',
    icon: DollarSign,
    apps: [
      { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes', color: '#f59e0b', bgGradient: 'linear-gradient(135deg, rgba(253, 224, 71, 0.4), rgba(250, 204, 21, 0.3))' },
      { path: '/price-list', icon: DollarSign, label: 'Price List', color: '#8b5cf6', bgGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.4), rgba(139, 92, 246, 0.3))' },
      { path: '/saved-quotes', icon: BarChart3, label: 'Saved Quotes', color: '#06b6d4', bgGradient: 'linear-gradient(135deg, rgba(103, 232, 249, 0.4), rgba(6, 182, 212, 0.3))' },
      { path: '/clients', icon: Users, label: 'Clients', color: '#10b981', bgGradient: 'linear-gradient(135deg, rgba(134, 239, 172, 0.4), rgba(110, 231, 183, 0.3))' },
      { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator', color: '#3b82f6', bgGradient: 'linear-gradient(135deg, rgba(147, 197, 253, 0.4), rgba(96, 165, 250, 0.3))' },
      { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices', color: '#ef4444', bgGradient: 'linear-gradient(135deg, rgba(252, 165, 165, 0.4), rgba(248, 113, 113, 0.3))' },
    ]
  },
  {
    name: 'Logistics',
    icon: Truck,
    apps: [
      { path: '/shipping-calculator', icon: Truck, label: 'Shipping', color: '#64748b', bgGradient: 'linear-gradient(135deg, rgba(148, 163, 184, 0.4), rgba(100, 116, 139, 0.3))' },
      { path: '/shipping-labels', icon: Package, label: 'Shipping Labels', color: '#0ea5e9', bgGradient: 'linear-gradient(135deg, rgba(125, 211, 252, 0.4), rgba(56, 189, 248, 0.3))' },
      { path: '/product-labels', icon: Tag, label: 'Product Labels', color: '#ec4899', bgGradient: 'linear-gradient(135deg, rgba(249, 168, 212, 0.4), rgba(244, 114, 182, 0.3))' },
    ]
  },
  {
    name: 'CRM & Samples',
    icon: Target,
    apps: [
      { path: '/crm-samples', icon: FlaskConical, label: 'Samples', color: '#14b8a6', bgGradient: 'linear-gradient(135deg, rgba(94, 234, 212, 0.4), rgba(45, 212, 191, 0.3))' },
      { path: '/crm-swatches', icon: Palette, label: 'Swatches', color: '#a855f7', bgGradient: 'linear-gradient(135deg, rgba(216, 180, 254, 0.4), rgba(192, 132, 252, 0.3))' },
      { path: '/email-app', icon: Mail, label: 'Email Studio', color: '#ec4899', bgGradient: 'linear-gradient(135deg, rgba(249, 168, 212, 0.4), rgba(236, 72, 153, 0.3))' },
    ]
  }
];

// Flat list for backward compatibility
const appTiles = appCategories.flatMap(cat => cat.apps);

const adminTiles = [
  { path: '/admin', icon: Users, label: 'Users', color: '#475569', bgGradient: 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(71, 85, 105, 0.3))' },
  { path: '/activity-logs', icon: Activity, label: 'Activity', color: '#475569', bgGradient: 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(71, 85, 105, 0.3))' },
  { path: '/product-pricing-management', icon: Database, label: 'Products', color: '#475569', bgGradient: 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(71, 85, 105, 0.3))' },
  { path: '/pdf-settings', icon: FileText, label: 'PDF Settings', color: '#475569', bgGradient: 'linear-gradient(135deg, rgba(100, 116, 139, 0.4), rgba(71, 85, 105, 0.3))' },
];

export default function Dashboard() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const { user, isLoading } = useAuth();
  const { trackUsage, usageData } = useAppUsage();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
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
    refetchInterval: 60000, // Refresh every minute
  });

  const { data: objections = [] } = useQuery<{ id: number; status: string }[]>({
    queryKey: ["/api/crm/objections"],
    retry: 1,
  });

  const openObjections = objections.filter(o => o.status === 'open').length;

  const now = new Date();
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const dateString = `${dayNames[now.getDay()]}, ${monthNames[now.getMonth()]} ${now.getDate()}`;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-purple-500 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(60px) saturate(150%)',
          WebkitBackdropFilter: 'blur(60px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '28px',
          padding: '48px',
          boxShadow: '0 8px 32px rgba(148, 163, 184, 0.12)',
          maxWidth: '400px',
          textAlign: 'center'
        }}>
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-xl font-bold mb-2 text-gray-900">Sign in required</h3>
          <p className="text-gray-500 mb-6">Please sign in to access your dashboard</p>
          <Button onClick={() => window.location.href = "/api/login"} style={{
            background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.3), rgba(203, 213, 225, 0.2))',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(148, 163, 184, 0.3)',
            borderRadius: '16px',
            padding: '12px 24px',
            color: '#334155',
            fontWeight: '600'
          }}>
            Sign in with Replit
          </Button>
        </div>
      </div>
    );
  }

  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  const isAdmin = (user as any)?.role === 'admin';


  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #e0e7ef 0%, #dfe7f2 25%, #e8e4f0 50%, #ede7e3 75%, #e5ebe8 100%)',
      backgroundSize: '400% 400%',
      animation: 'gentleShift 20s ease infinite',
      padding: '40px 20px',
      fontFamily: '-apple-system, BlinkMacSystemFont, "SF Pro Display", system-ui, sans-serif',
      position: 'relative',
      overflow: 'hidden',
      marginLeft: '-24px',
      marginRight: '-24px',
      marginTop: '-24px',
      marginBottom: '-24px'
    }}>
      <style>{`
        @keyframes gentleShift {
          0% { background-position: 0% 50%; }
          50% { background-position: 100% 50%; }
          100% { background-position: 0% 50%; }
        }
        @keyframes gentleFloat1 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(30px, -30px); }
          66% { transform: translate(-20px, 20px); }
        }
        @keyframes gentleFloat2 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(-40px, 20px); }
          66% { transform: translate(25px, -25px); }
        }
        @keyframes gentleFloat3 {
          0%, 100% { transform: translate(0, 0); }
          33% { transform: translate(20px, 30px); }
          66% { transform: translate(-30px, -20px); }
        }
      `}</style>

      {/* Soft ambient lighting effects */}
      <div style={{
        position: 'absolute',
        top: '15%',
        left: '10%',
        width: '500px',
        height: '500px',
        background: 'radial-gradient(circle, rgba(147, 197, 253, 0.15) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat1 25s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        top: '50%',
        right: '15%',
        width: '450px',
        height: '450px',
        background: 'radial-gradient(circle, rgba(196, 181, 253, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat2 30s ease-in-out infinite',
        pointerEvents: 'none'
      }} />
      <div style={{
        position: 'absolute',
        bottom: '20%',
        left: '35%',
        width: '400px',
        height: '400px',
        background: 'radial-gradient(circle, rgba(167, 243, 208, 0.12) 0%, transparent 70%)',
        borderRadius: '50%',
        filter: 'blur(80px)',
        animation: 'gentleFloat3 22s ease-in-out infinite',
        pointerEvents: 'none'
      }} />

      <div style={{ maxWidth: '1400px', margin: '0 auto', position: 'relative', zIndex: 1 }}>
        {/* Glass Header */}
        <div style={{
          background: 'rgba(255, 255, 255, 0.7)',
          backdropFilter: 'blur(60px) saturate(150%)',
          WebkitBackdropFilter: 'blur(60px) saturate(150%)',
          border: '1px solid rgba(255, 255, 255, 0.8)',
          borderRadius: '28px',
          padding: '40px 48px',
          marginBottom: '32px',
          boxShadow: '0 8px 32px rgba(148, 163, 184, 0.12), inset 0 1px 0 rgba(255, 255, 255, 0.9)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '24px' }}>
            <div>
              <div style={{
                fontSize: '13px',
                fontWeight: '600',
                color: '#64748b',
                marginBottom: '8px',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}>
                <Printer size={16} />
                4S Graphics Dashboard
              </div>
              <h1 style={{
                fontSize: '52px',
                fontWeight: '700',
                color: '#1e293b',
                margin: '0 0 12px 0',
                letterSpacing: '-0.02em',
              }}>
                Welcome back, {firstName}
              </h1>
              <p style={{
                fontSize: '18px',
                color: '#475569',
                margin: 0,
                fontWeight: '400'
              }}>
                {dateString}
              </p>
            </div>
          </div>
        </div>

        {/* Start Your Day Dashboard */}
        <div style={{ marginBottom: '32px' }}>
          <StartYourDayDashboard />
        </div>

        {/* Objection Summary Card */}
        <Link
          href="/objections"
          style={{
            display: 'block',
            marginBottom: '32px',
            textDecoration: 'none',
          }}
          data-testid="objection-summary-card"
        >
          <div style={{
            background: openObjections > 0 
              ? 'linear-gradient(135deg, rgba(254, 243, 199, 0.8), rgba(253, 230, 138, 0.6))'
              : 'rgba(255, 255, 255, 0.7)',
            backdropFilter: 'blur(60px) saturate(150%)',
            WebkitBackdropFilter: 'blur(60px) saturate(150%)',
            border: openObjections > 0 
              ? '1px solid rgba(251, 191, 36, 0.4)'
              : '1px solid rgba(255, 255, 255, 0.8)',
            borderRadius: '16px',
            padding: '16px 20px',
            boxShadow: '0 4px 16px rgba(148, 163, 184, 0.08)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            cursor: 'pointer',
            transition: 'all 0.3s ease',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{
                width: '40px',
                height: '40px',
                borderRadius: '10px',
                background: openObjections > 0 
                  ? 'linear-gradient(135deg, rgba(251, 191, 36, 0.4), rgba(245, 158, 11, 0.3))'
                  : 'linear-gradient(135deg, rgba(148, 163, 184, 0.3), rgba(100, 116, 139, 0.2))',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}>
                <AlertTriangle size={20} style={{ color: openObjections > 0 ? '#b45309' : '#64748b' }} />
              </div>
              <div>
                <div style={{ 
                  fontSize: '14px', 
                  fontWeight: '600', 
                  color: openObjections > 0 ? '#92400e' : '#475569',
                  marginBottom: '2px'
                }}>
                  Objection Summary
                </div>
                <div style={{ fontSize: '12px', color: openObjections > 0 ? '#a16207' : '#64748b' }}>
                  {objections.length} total objections • {openObjections} open
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {openObjections > 0 && (
                <span style={{
                  background: 'rgba(245, 158, 11, 0.2)',
                  color: '#b45309',
                  padding: '4px 10px',
                  borderRadius: '12px',
                  fontSize: '12px',
                  fontWeight: '600',
                }}>
                  {openObjections} need attention
                </span>
              )}
              <ChevronRight size={18} style={{ color: openObjections > 0 ? '#b45309' : '#94a3b8' }} />
            </div>
          </div>
        </Link>

        {/* App Grid - Categorized */}
        <div style={{ marginBottom: '32px' }}>
          <h2 style={{
            fontSize: '24px',
            fontWeight: '700',
            color: '#1e293b',
            marginBottom: '24px',
            letterSpacing: '-0.01em',
            display: 'flex',
            alignItems: 'center',
            gap: '12px'
          }}>
            <Grid3X3 size={24} style={{ color: '#64748b' }} />
            Apps
          </h2>
          
          {/* Categorized App Sections */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            {appCategories.map((category, catIndex) => {
              const CategoryIcon = category.icon;
              return (
                <div 
                  key={category.name}
                  style={{
                    background: 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(60px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(60px) saturate(150%)',
                    border: '1px solid rgba(255, 255, 255, 0.8)',
                    borderRadius: '24px',
                    padding: '24px',
                    boxShadow: '0 8px 32px rgba(148, 163, 184, 0.1)',
                  }}
                >
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    marginBottom: '16px',
                    paddingBottom: '12px',
                    borderBottom: '1px solid rgba(148, 163, 184, 0.15)'
                  }}>
                    <CategoryIcon size={18} style={{ color: '#64748b' }} />
                    <span style={{
                      fontSize: '14px',
                      fontWeight: '600',
                      color: '#64748b',
                      letterSpacing: '0.3px',
                      textTransform: 'uppercase'
                    }}>
                      {category.name}
                    </span>
                  </div>
                  <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(100px, 1fr))',
                    gap: '12px'
                  }}>
                    {category.apps.map((app, i) => {
                      const Icon = app.icon;
                      const usageCount = usageData[app.path]?.count || 0;
                      const appKey = `${catIndex}-${i}`;
                      const isHovered = hoveredCard === `app-${appKey}`;
                      
                      return (
                        <Link
                          key={app.path}
                          href={app.path}
                          onClick={() => trackUsage(app.path)}
                          onMouseEnter={() => setHoveredCard(`app-${appKey}`)}
                          onMouseLeave={() => setHoveredCard(null)}
                          style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            justifyContent: 'center',
                            padding: '16px 12px',
                            borderRadius: '16px',
                            background: isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.4)',
                            backdropFilter: 'blur(20px)',
                            border: isHovered ? `2px solid ${app.color}40` : '1px solid rgba(255, 255, 255, 0.5)',
                            cursor: 'pointer',
                            textDecoration: 'none',
                            transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                            transform: isHovered ? 'translateY(-2px) scale(1.02)' : 'translateY(0) scale(1)',
                            boxShadow: isHovered 
                              ? `0 8px 24px ${app.color}20`
                              : '0 2px 8px rgba(148, 163, 184, 0.06)',
                            position: 'relative',
                            overflow: 'hidden'
                          }}
                          data-testid={`tile-${app.label.toLowerCase().replace(/\s+/g, '-')}`}
                        >
                          {usageCount >= 3 && (
                            <div style={{
                              position: 'absolute',
                              top: '6px',
                              right: '6px',
                              width: '6px',
                              height: '6px',
                              borderRadius: '50%',
                              background: app.color,
                              boxShadow: `0 0 6px ${app.color}80`
                            }} />
                          )}
                          <div style={{
                            width: '40px',
                            height: '40px',
                            borderRadius: '12px',
                            background: app.bgGradient,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginBottom: '8px',
                            transition: 'transform 0.3s ease',
                            transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                          }}>
                            <Icon size={20} style={{ color: app.color }} />
                          </div>
                          <span style={{
                            fontSize: '11px',
                            fontWeight: '600',
                            color: isHovered ? app.color : '#475569',
                            textAlign: 'center',
                            lineHeight: '1.2',
                            transition: 'color 0.3s ease'
                          }}>
                            {app.label}
                          </span>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* CRM Pipeline Overview */}
        {crmStats && (
          <div style={{ marginBottom: '32px' }}>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '24px',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Users size={24} style={{ color: '#64748b' }} />
              Customer Journey Pipeline
            </h2>
            
            {/* CRM KPI Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '16px',
              marginBottom: '24px'
            }}>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(60px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center'
              }} data-testid="crm-total-customers">
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#6366f1' }}>
                  {crmStats.totalCustomers}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                  Total Customers
                </div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(60px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center'
              }} data-testid="crm-active-journeys">
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#8b5cf6' }}>
                  {crmStats.totalActiveJourneys}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                  Active Journeys
                </div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(60px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center'
              }} data-testid="crm-quotes-sent">
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#10b981' }}>
                  {crmStats.totalQuotesSent}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                  Quotes Sent
                </div>
              </div>
              <div style={{
                background: 'rgba(255, 255, 255, 0.7)',
                backdropFilter: 'blur(60px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '20px',
                padding: '24px',
                textAlign: 'center'
              }} data-testid="crm-new-customers">
                <div style={{ fontSize: '32px', fontWeight: '700', color: '#f59e0b' }}>
                  {crmStats.newCustomersLast30Days}
                </div>
                <div style={{ fontSize: '13px', fontWeight: '600', color: '#64748b', textTransform: 'uppercase' }}>
                  New (30 Days)
                </div>
              </div>
            </div>

            {/* Journey Stage Distribution */}
            <div style={{
              background: 'rgba(255, 255, 255, 0.7)',
              backdropFilter: 'blur(60px) saturate(150%)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              borderRadius: '24px',
              padding: '32px',
            }}>
              <h3 style={{
                fontSize: '16px',
                fontWeight: '600',
                color: '#475569',
                marginBottom: '20px',
                textTransform: 'uppercase',
                letterSpacing: '0.5px'
              }}>
                Stage Distribution
              </h3>
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
                    trigger: '#ef4444',
                    internal_alarm: '#f97316',
                    supplier_pushback: '#eab308',
                    pilot_alignment: '#22c55e',
                    controlled_trial: '#06b6d4',
                    validation_proof: '#3b82f6',
                    conversion: '#8b5cf6'
                  };
                  return (
                    <Link
                      key={i}
                      href="/crm-journey"
                      style={{
                        background: `${stageColors[stage.stage]}15`,
                        border: `1px solid ${stageColors[stage.stage]}40`,
                        borderRadius: '12px',
                        padding: '12px 20px',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        minWidth: '120px',
                        textDecoration: 'none',
                        transition: 'transform 0.2s',
                        cursor: 'pointer'
                      }}
                      data-testid={`stage-${stage.stage}`}
                    >
                      <div style={{
                        fontSize: '28px',
                        fontWeight: '700',
                        color: stageColors[stage.stage]
                      }}>
                        {stage.count}
                      </div>
                      <div style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#64748b',
                        textAlign: 'center',
                        lineHeight: '1.3'
                      }}>
                        {stageLabels[stage.stage] || stage.stage}
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* CRM Activity Stats */}
              <div style={{
                display: 'flex',
                gap: '24px',
                marginTop: '24px',
                paddingTop: '20px',
                borderTop: '1px solid rgba(148, 163, 184, 0.2)',
                flexWrap: 'wrap'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#f59e0b'
                  }} />
                  <span style={{ fontSize: '14px', color: '#64748b' }}>
                    <strong style={{ color: '#1e293b' }}>{crmStats.pendingSamples}</strong> pending samples
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#06b6d4'
                  }} />
                  <span style={{ fontSize: '14px', color: '#64748b' }}>
                    <strong style={{ color: '#1e293b' }}>{crmStats.pendingSwatches}</strong> pending swatches
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#8b5cf6'
                  }} />
                  <span style={{ fontSize: '14px', color: '#64748b' }}>
                    <strong style={{ color: '#1e293b' }}>{crmStats.activePressProfiles}</strong> press profiles
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: '#10b981'
                  }} />
                  <span style={{ fontSize: '14px', color: '#64748b' }}>
                    <strong style={{ color: '#1e293b' }}>{crmStats.quotesLast30Days}</strong> quotes (30 days)
                  </span>
                </div>
                {crmStats.pendingFeedback > 0 && (
                  <Link 
                    href="/crm-samples" 
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '8px',
                      textDecoration: 'none',
                      padding: '4px 12px',
                      borderRadius: '16px',
                      background: 'rgba(239, 68, 68, 0.1)',
                      border: '1px solid rgba(239, 68, 68, 0.3)'
                    }}
                  >
                    <div style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      background: '#ef4444',
                      animation: 'pulse 2s infinite'
                    }} />
                    <span style={{ fontSize: '14px', color: '#ef4444', fontWeight: '600' }}>
                      <strong>{crmStats.pendingFeedback}</strong> awaiting feedback
                    </span>
                  </Link>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Admin Tools - Odoo Style Grid */}
        {isAdmin && (
          <div>
            <h2 style={{
              fontSize: '24px',
              fontWeight: '700',
              color: '#1e293b',
              marginBottom: '24px',
              letterSpacing: '-0.01em',
              display: 'flex',
              alignItems: 'center',
              gap: '12px'
            }}>
              <Settings size={24} style={{ color: '#64748b' }} />
              Admin
            </h2>
            <div style={{
              background: 'rgba(255, 255, 255, 0.6)',
              backdropFilter: 'blur(60px) saturate(150%)',
              WebkitBackdropFilter: 'blur(60px) saturate(150%)',
              border: '1px solid rgba(255, 255, 255, 0.8)',
              borderRadius: '28px',
              padding: '32px',
              boxShadow: '0 8px 32px rgba(148, 163, 184, 0.1)',
            }}>
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))',
                gap: '16px'
              }}>
                {adminTiles.map((app, i) => {
                  const Icon = app.icon;
                  const isHovered = hoveredCard === `admin-${i}`;
                  
                  return (
                    <Link
                      key={app.path}
                      href={app.path}
                      onClick={() => trackUsage(app.path)}
                      onMouseEnter={() => setHoveredCard(`admin-${i}`)}
                      onMouseLeave={() => setHoveredCard(null)}
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        padding: '24px 16px',
                        borderRadius: '20px',
                        background: isHovered ? 'rgba(139, 92, 246, 0.1)' : 'rgba(255, 255, 255, 0.5)',
                        backdropFilter: 'blur(20px)',
                        border: isHovered ? '2px solid rgba(139, 92, 246, 0.3)' : '1px solid rgba(255, 255, 255, 0.6)',
                        cursor: 'pointer',
                        textDecoration: 'none',
                        transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                        transform: isHovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                        boxShadow: isHovered 
                          ? '0 12px 32px rgba(139, 92, 246, 0.2), 0 0 0 1px rgba(139, 92, 246, 0.15)'
                          : '0 2px 8px rgba(148, 163, 184, 0.08)',
                        position: 'relative',
                        overflow: 'hidden'
                      }}
                      data-testid={`tile-admin-${app.label.toLowerCase().replace(/\s+/g, '-')}`}
                    >
                      {/* Gradient overlay on hover */}
                      <div style={{
                        position: 'absolute',
                        inset: 0,
                        background: 'linear-gradient(135deg, rgba(139, 92, 246, 0.15), rgba(109, 40, 217, 0.1))',
                        opacity: isHovered ? 1 : 0,
                        transition: 'opacity 0.3s ease',
                        borderRadius: '20px',
                        pointerEvents: 'none'
                      }} />

                      {/* Glass shine effect */}
                      <div style={{
                        position: 'absolute',
                        top: '-50%',
                        left: '-50%',
                        width: '200%',
                        height: '200%',
                        background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.6) 50%, transparent 70%)',
                        transform: isHovered ? 'translateX(100%)' : 'translateX(-100%)',
                        transition: 'transform 0.6s ease',
                        pointerEvents: 'none'
                      }} />

                      <div style={{
                        position: 'relative',
                        zIndex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: '12px'
                      }}>
                        <div style={{
                          width: '52px',
                          height: '52px',
                          borderRadius: '16px',
                          background: 'linear-gradient(135deg, rgba(100, 116, 139, 0.3), rgba(71, 85, 105, 0.2))',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          boxShadow: '0 4px 16px rgba(71, 85, 105, 0.15)',
                          border: '1px solid rgba(255, 255, 255, 0.6)',
                          transition: 'all 0.3s ease',
                          transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                        }}>
                          <Icon size={26} style={{ color: isHovered ? '#7c3aed' : '#475569' }} />
                        </div>
                        <div style={{ textAlign: 'center' }}>
                          <span style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: isHovered ? '#7c3aed' : '#475569',
                            textAlign: 'center',
                            lineHeight: '1.3',
                            transition: 'color 0.3s ease',
                            display: 'block'
                          }}>
                            {app.label}
                          </span>
                          <span style={{
                            fontSize: '10px',
                            fontWeight: '600',
                            color: '#9333ea',
                            background: 'rgba(139, 92, 246, 0.1)',
                            padding: '2px 8px',
                            borderRadius: '6px',
                            marginTop: '4px',
                            display: 'inline-block'
                          }}>
                            Admin
                          </span>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>

            {/* Usage/Cost Indicator for Admins */}
            {usageStats && (
              <div style={{
                marginTop: '24px',
                background: 'rgba(255, 255, 255, 0.6)',
                backdropFilter: 'blur(60px) saturate(150%)',
                WebkitBackdropFilter: 'blur(60px) saturate(150%)',
                border: '1px solid rgba(255, 255, 255, 0.8)',
                borderRadius: '24px',
                padding: '24px',
                boxShadow: '0 8px 32px rgba(148, 163, 184, 0.08)'
              }} data-testid="usage-indicator">
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
                  <div style={{
                    width: '40px',
                    height: '40px',
                    borderRadius: '12px',
                    background: 'linear-gradient(135deg, rgba(34, 197, 94, 0.3), rgba(22, 163, 74, 0.2))',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    border: '1px solid rgba(34, 197, 94, 0.3)'
                  }}>
                    <Gauge size={20} style={{ color: '#16a34a' }} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '16px', fontWeight: '600', color: '#1e293b', margin: 0 }}>
                      Resource Usage
                    </h3>
                    <p style={{ fontSize: '12px', color: '#64748b', margin: 0 }}>
                      Real-time database & system metrics
                    </p>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  {/* Database Size */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.6)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <HardDrive size={16} style={{ color: '#3b82f6' }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Database</span>
                    </div>
                    <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e293b', marginBottom: '8px' }}>
                      {usageStats.database.size}
                    </div>
                    <div style={{ marginBottom: '8px' }}>
                      <Progress 
                        value={(usageStats.database.sizeBytes / usageStats.limits.dbMaxSizeBytes) * 100} 
                        className="h-2"
                      />
                    </div>
                    <div style={{ fontSize: '11px', color: '#64748b' }}>
                      of {usageStats.limits.dbMaxSize} limit ({((usageStats.database.sizeBytes / usageStats.limits.dbMaxSizeBytes) * 100).toFixed(1)}%)
                    </div>
                  </div>

                  {/* Record Counts */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.6)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Database size={16} style={{ color: '#8b5cf6' }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Records</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                          {usageStats.records.customers.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Customers</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                          {usageStats.records.products.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Products</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                          {usageStats.records.quotes.toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Quotes</div>
                      </div>
                      <div>
                        <div style={{ fontSize: '18px', fontWeight: '700', color: '#1e293b' }}>
                          {Number(usageStats.records.activityLogs).toLocaleString()}
                        </div>
                        <div style={{ fontSize: '11px', color: '#64748b' }}>Activity Logs</div>
                      </div>
                    </div>
                  </div>

                  {/* Top Tables */}
                  <div style={{
                    background: 'rgba(255, 255, 255, 0.5)',
                    borderRadius: '16px',
                    padding: '16px',
                    border: '1px solid rgba(255, 255, 255, 0.6)'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                      <Layers size={16} style={{ color: '#f59e0b' }} />
                      <span style={{ fontSize: '13px', fontWeight: '600', color: '#475569' }}>Top Tables</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                      {usageStats.database.tables.slice(0, 4).map((table, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '12px', color: '#475569', fontFamily: 'monospace' }}>
                            {table.table_name}
                          </span>
                          <span style={{ fontSize: '11px', color: '#64748b', fontWeight: '500' }}>
                            {table.total_size}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: '12px', fontSize: '10px', color: '#94a3b8', textAlign: 'right' }}>
                  Updated: {new Date(usageStats.timestamp).toLocaleTimeString()}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

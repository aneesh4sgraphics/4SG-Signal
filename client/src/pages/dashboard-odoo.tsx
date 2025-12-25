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
  Grid3X3
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
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
}

const appTiles = [
  { path: '/quick-quotes', icon: FileText, label: 'QuickQuotes', color: '#f59e0b', bgGradient: 'linear-gradient(135deg, rgba(253, 224, 71, 0.4), rgba(250, 204, 21, 0.3))' },
  { path: '/price-list', icon: DollarSign, label: 'Price List', color: '#8b5cf6', bgGradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.4), rgba(139, 92, 246, 0.3))' },
  { path: '/saved-quotes', icon: BarChart3, label: 'Saved Quotes', color: '#06b6d4', bgGradient: 'linear-gradient(135deg, rgba(103, 232, 249, 0.4), rgba(6, 182, 212, 0.3))' },
  { path: '/clients', icon: Users, label: 'Clients', color: '#10b981', bgGradient: 'linear-gradient(135deg, rgba(134, 239, 172, 0.4), rgba(110, 231, 183, 0.3))' },
  { path: '/area-pricer', icon: Calculator, label: 'SqM Calculator', color: '#3b82f6', bgGradient: 'linear-gradient(135deg, rgba(147, 197, 253, 0.4), rgba(96, 165, 250, 0.3))' },
  { path: '/competitor-pricing', icon: TrendingUp, label: 'Market Prices', color: '#ef4444', bgGradient: 'linear-gradient(135deg, rgba(252, 165, 165, 0.4), rgba(248, 113, 113, 0.3))' },
  { path: '/shipping-calculator', icon: Truck, label: 'Shipping', color: '#64748b', bgGradient: 'linear-gradient(135deg, rgba(148, 163, 184, 0.4), rgba(100, 116, 139, 0.3))' },
  { path: '/shipping-labels', icon: Package, label: 'Shipping Labels', color: '#0ea5e9', bgGradient: 'linear-gradient(135deg, rgba(125, 211, 252, 0.4), rgba(56, 189, 248, 0.3))' },
  { path: '/product-labels', icon: Tag, label: 'Product Labels', color: '#ec4899', bgGradient: 'linear-gradient(135deg, rgba(249, 168, 212, 0.4), rgba(244, 114, 182, 0.3))' },
  { path: '/crm-journey', icon: Target, label: 'CRM Journey', color: '#6366f1', bgGradient: 'linear-gradient(135deg, rgba(165, 180, 252, 0.4), rgba(129, 140, 248, 0.3))' },
  { path: '/crm-samples', icon: FlaskConical, label: 'Samples', color: '#14b8a6', bgGradient: 'linear-gradient(135deg, rgba(94, 234, 212, 0.4), rgba(45, 212, 191, 0.3))' },
  { path: '/crm-swatches', icon: Palette, label: 'Swatches', color: '#a855f7', bgGradient: 'linear-gradient(135deg, rgba(216, 180, 254, 0.4), rgba(192, 132, 252, 0.3))' },
];

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

  const statCards = [
    { 
      label: 'Total Revenue', 
      value: stats ? `$${stats.monthlyRevenue.toLocaleString()}` : '$0',
      change: '+12.5%',
      icon: DollarSign,
      gradient: 'linear-gradient(135deg, rgba(134, 239, 172, 0.6), rgba(110, 231, 183, 0.5))',
      glowColor: 'rgba(134, 239, 172, 0.2)',
      textColor: '#065f46',
      accentColor: '#86efac'
    },
    { 
      label: 'Active Quotes', 
      value: stats ? stats.totalQuotes.toString() : '0',
      change: `+${stats?.quotesThisMonth || 0} today`,
      icon: FileText,
      gradient: 'linear-gradient(135deg, rgba(147, 197, 253, 0.5), rgba(125, 211, 252, 0.5))',
      glowColor: 'rgba(147, 197, 253, 0.2)',
      textColor: '#0c4a6e',
      accentColor: '#93c5fd'
    },
    { 
      label: 'Growth Rate', 
      value: '23%',
      change: '+5.2% this week',
      icon: TrendingUp,
      gradient: 'linear-gradient(135deg, rgba(253, 186, 116, 0.4), rgba(251, 191, 36, 0.4))',
      glowColor: 'rgba(253, 186, 116, 0.2)',
      textColor: '#78350f',
      accentColor: '#fdba74'
    },
    { 
      label: 'Pending Orders', 
      value: stats ? stats.totalCustomers.toString() : '0',
      change: `${stats?.totalProducts || 0} products`,
      icon: Package,
      gradient: 'linear-gradient(135deg, rgba(196, 181, 253, 0.5), rgba(167, 139, 250, 0.4))',
      glowColor: 'rgba(196, 181, 253, 0.2)',
      textColor: '#5b21b6',
      accentColor: '#c4b5fd'
    }
  ];

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

        {/* Glass Stats Cards */}
        {!statsLoading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {statCards.map((stat, i) => (
              <div
                key={i}
                onMouseEnter={() => setHoveredCard(`stat-${i}`)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  background: hoveredCard === `stat-${i}` 
                    ? 'rgba(255, 255, 255, 0.85)' 
                    : 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(60px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(60px) saturate(150%)',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: '24px',
                  padding: '32px',
                  boxShadow: hoveredCard === `stat-${i}`
                    ? `0 12px 40px ${stat.glowColor}, 0 0 0 1px ${stat.accentColor}20`
                    : '0 8px 24px rgba(148, 163, 184, 0.08)',
                  cursor: 'pointer',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: hoveredCard === `stat-${i}` ? 'translateY(-4px) scale(1.01)' : 'translateY(0) scale(1)',
                  position: 'relative',
                  overflow: 'hidden'
                }}
                data-testid={`stat-card-${i}`}
              >
                {/* Subtle gradient overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: stat.gradient,
                  opacity: hoveredCard === `stat-${i}` ? 1 : 0.7,
                  transition: 'opacity 0.4s ease',
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
                  transform: hoveredCard === `stat-${i}` ? 'translateX(100%)' : 'translateX(-100%)',
                  transition: 'transform 0.8s ease',
                  pointerEvents: 'none'
                }} />

                {/* Top edge highlight */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '10%',
                  right: '10%',
                  height: '1px',
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 0.9), transparent)',
                  opacity: hoveredCard === `stat-${i}` ? 1 : 0.4,
                  transition: 'opacity 0.3s ease'
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '24px'
                  }}>
                    <div style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '16px',
                      background: stat.gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 4px 16px ${stat.glowColor}`,
                      border: `1px solid ${stat.accentColor}40`,
                      backdropFilter: 'blur(10px)'
                    }}>
                      <stat.icon size={28} style={{ color: stat.textColor }} />
                    </div>
                    <ArrowUpRight 
                      size={24} 
                      style={{ 
                        color: '#94a3b8',
                        transition: 'all 0.3s ease',
                        transform: hoveredCard === `stat-${i}` ? 'translate(4px, -4px)' : 'translate(0, 0)'
                      }} 
                    />
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '600',
                    color: '#64748b',
                    marginBottom: '8px',
                    letterSpacing: '0.3px',
                    textTransform: 'uppercase'
                  }}>
                    {stat.label}
                  </div>
                  <div style={{
                    fontSize: '40px',
                    fontWeight: '700',
                    color: stat.textColor,
                    marginBottom: '8px',
                    letterSpacing: '-0.02em'
                  }}>
                    {stat.value}
                  </div>
                  <div style={{
                    fontSize: '14px',
                    fontWeight: '500',
                    color: '#475569',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px'
                  }}>
                    {stat.change}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Loading skeleton */}
        {statsLoading && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: '20px',
            marginBottom: '32px'
          }}>
            {[1, 2, 3, 4].map((i) => (
              <div key={i} style={{
                background: 'rgba(255, 255, 255, 0.5)',
                backdropFilter: 'blur(60px)',
                borderRadius: '24px',
                padding: '32px',
                animation: 'pulse 2s infinite'
              }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '16px', background: 'rgba(200,200,200,0.3)', marginBottom: '24px' }} />
                <div style={{ width: '80px', height: '14px', background: 'rgba(200,200,200,0.3)', borderRadius: '4px', marginBottom: '8px' }} />
                <div style={{ width: '120px', height: '40px', background: 'rgba(200,200,200,0.3)', borderRadius: '4px' }} />
              </div>
            ))}
          </div>
        )}

        {/* App Grid - Odoo Style */}
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
              {appTiles.map((app, i) => {
                const Icon = app.icon;
                const usageCount = usageData[app.path]?.count || 0;
                const isHovered = hoveredCard === `app-${i}`;
                
                return (
                  <Link
                    key={app.path}
                    href={app.path}
                    onClick={() => trackUsage(app.path)}
                    onMouseEnter={() => setHoveredCard(`app-${i}`)}
                    onMouseLeave={() => setHoveredCard(null)}
                    style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      justifyContent: 'center',
                      padding: '24px 16px',
                      borderRadius: '20px',
                      background: isHovered ? 'rgba(255, 255, 255, 0.9)' : 'rgba(255, 255, 255, 0.5)',
                      backdropFilter: 'blur(20px)',
                      border: isHovered ? `2px solid ${app.color}40` : '1px solid rgba(255, 255, 255, 0.6)',
                      cursor: 'pointer',
                      textDecoration: 'none',
                      transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                      transform: isHovered ? 'translateY(-4px) scale(1.02)' : 'translateY(0) scale(1)',
                      boxShadow: isHovered 
                        ? `0 12px 32px ${app.color}25, 0 0 0 1px ${app.color}20`
                        : '0 2px 8px rgba(148, 163, 184, 0.08)',
                      position: 'relative',
                      overflow: 'hidden'
                    }}
                    data-testid={`tile-${app.label.toLowerCase().replace(/\s+/g, '-')}`}
                  >
                    {/* Gradient overlay on hover */}
                    <div style={{
                      position: 'absolute',
                      inset: 0,
                      background: app.bgGradient,
                      opacity: isHovered ? 0.6 : 0,
                      transition: 'opacity 0.3s ease',
                      borderRadius: '20px',
                      pointerEvents: 'none'
                    }} />
                    
                    {/* Usage indicator */}
                    {usageCount >= 3 && (
                      <div style={{
                        position: 'absolute',
                        top: '8px',
                        right: '8px',
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        background: app.color,
                        boxShadow: `0 0 8px ${app.color}80`
                      }} />
                    )}

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
                        background: app.bgGradient,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: `0 4px 16px ${app.color}20`,
                        border: '1px solid rgba(255, 255, 255, 0.6)',
                        transition: 'transform 0.3s ease',
                        transform: isHovered ? 'scale(1.1)' : 'scale(1)'
                      }}>
                        <Icon size={26} style={{ color: app.color }} />
                      </div>
                      <span style={{
                        fontSize: '13px',
                        fontWeight: '600',
                        color: isHovered ? app.color : '#475569',
                        textAlign: 'center',
                        lineHeight: '1.3',
                        transition: 'color 0.3s ease'
                      }}>
                        {app.label}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
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
          </div>
        )}
      </div>
    </div>
  );
}

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
  ChevronRight
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useQuery } from "@tanstack/react-query";

interface DashboardStats {
  totalQuotes: number;
  quotesThisMonth: number;
  monthlyRevenue: number;
  totalCustomers: number;
  totalProducts: number;
  activityCount: number;
}

export default function Dashboard() {
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const { user, isLoading } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
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

  const quickActions = [
    {
      title: 'QuickQuotes',
      desc: 'Generate instant quotes with intelligent pricing calculations',
      icon: Calculator,
      path: '/quick-quotes',
      gradient: 'linear-gradient(135deg, rgba(253, 224, 71, 0.35), rgba(250, 204, 21, 0.3))',
      glowColor: 'rgba(253, 224, 71, 0.15)',
      textColor: '#713f12',
      iconColor: '#854d0e'
    },
    {
      title: 'Price List',
      desc: 'View and export comprehensive pricing tables',
      icon: FileText,
      path: '/price-list',
      gradient: 'linear-gradient(135deg, rgba(167, 139, 250, 0.35), rgba(139, 92, 246, 0.3))',
      glowColor: 'rgba(167, 139, 250, 0.15)',
      textColor: '#5b21b6',
      iconColor: '#6b21a8'
    },
    {
      title: 'Saved Quotes',
      desc: 'Manage and track all generated quotes',
      icon: BarChart3,
      path: '/saved-quotes',
      gradient: 'linear-gradient(135deg, rgba(103, 232, 249, 0.35), rgba(6, 182, 212, 0.3))',
      glowColor: 'rgba(103, 232, 249, 0.15)',
      textColor: '#155e75',
      iconColor: '#0e7490'
    }
  ];

  const adminTools = [
    { title: 'Database', desc: 'System settings', icon: Database, path: '/product-pricing-management' },
    { title: 'Users', desc: 'User management', icon: Users, path: '/customers' },
    { title: 'System', desc: 'Configuration', icon: Settings, path: '/admin' }
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
                {dateString} • Managing your printing operations
              </p>
            </div>
            <Link href="/quick-quotes">
              <button style={{
                background: 'linear-gradient(135deg, rgba(148, 163, 184, 0.3), rgba(203, 213, 225, 0.2))',
                backdropFilter: 'blur(20px)',
                border: '1px solid rgba(148, 163, 184, 0.3)',
                borderRadius: '16px',
                padding: '16px 32px',
                color: '#334155',
                fontSize: '16px',
                fontWeight: '600',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '10px',
                boxShadow: '0 4px 12px rgba(148, 163, 184, 0.15)',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}>
                <Sparkles size={20} />
                New Quote
              </button>
            </Link>
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

        {/* Quick Actions */}
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
            <Layers size={24} style={{ color: '#64748b' }} />
            Quick Actions
          </h2>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
            gap: '24px'
          }}>
            {quickActions.map((action, i) => (
              <Link
                key={i}
                href={action.path}
                onMouseEnter={() => setHoveredCard(`action-${i}`)}
                onMouseLeave={() => setHoveredCard(null)}
                style={{
                  background: 'rgba(255, 255, 255, 0.7)',
                  backdropFilter: 'blur(60px) saturate(150%)',
                  WebkitBackdropFilter: 'blur(60px) saturate(150%)',
                  border: '1px solid rgba(255, 255, 255, 0.8)',
                  borderRadius: '28px',
                  padding: '40px',
                  textAlign: 'left',
                  cursor: 'pointer',
                  boxShadow: hoveredCard === `action-${i}`
                    ? `0 16px 48px ${action.glowColor}`
                    : '0 8px 24px rgba(148, 163, 184, 0.08)',
                  transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
                  transform: hoveredCard === `action-${i}` ? 'translateY(-6px) scale(1.01)' : 'translateY(0) scale(1)',
                  position: 'relative',
                  overflow: 'hidden',
                  display: 'block',
                  textDecoration: 'none'
                }}
                data-testid={`link-${action.title.toLowerCase().replace(/\s/g, '-')}`}
              >
                {/* Soft gradient overlay */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  background: action.gradient,
                  opacity: hoveredCard === `action-${i}` ? 1 : 0.6,
                  transition: 'opacity 0.4s ease',
                  pointerEvents: 'none',
                  borderRadius: '28px'
                }} />

                {/* Glass shine effect */}
                <div style={{
                  position: 'absolute',
                  top: '-100%',
                  left: '-100%',
                  width: '300%',
                  height: '300%',
                  background: 'linear-gradient(45deg, transparent 35%, rgba(255, 255, 255, 0.7) 50%, transparent 65%)',
                  transform: hoveredCard === `action-${i}` ? 'translate(100%, 100%)' : 'translate(-100%, -100%)',
                  transition: 'transform 1s ease',
                  pointerEvents: 'none'
                }} />

                {/* Top edge highlight */}
                <div style={{
                  position: 'absolute',
                  top: 0,
                  left: '15%',
                  right: '15%',
                  height: '2px',
                  background: 'linear-gradient(90deg, transparent, rgba(255, 255, 255, 1), transparent)',
                  opacity: hoveredCard === `action-${i}` ? 1 : 0.3,
                  transition: 'opacity 0.3s ease',
                  filter: 'blur(1px)'
                }} />

                <div style={{ position: 'relative', zIndex: 1 }}>
                  <div style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    marginBottom: '20px'
                  }}>
                    <div style={{
                      width: '64px',
                      height: '64px',
                      borderRadius: '20px',
                      background: action.gradient,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      boxShadow: `0 6px 20px ${action.glowColor}`,
                      border: '1px solid rgba(255,255,255,0.5)',
                      backdropFilter: 'blur(10px)'
                    }}>
                      <action.icon size={32} style={{ color: action.iconColor }} />
                    </div>
                    <ChevronRight 
                      size={28} 
                      style={{ 
                        color: '#94a3b8',
                        transition: 'all 0.3s ease',
                        transform: hoveredCard === `action-${i}` ? 'translateX(6px)' : 'translateX(0)'
                      }} 
                    />
                  </div>
                  <h3 style={{
                    fontSize: '22px',
                    fontWeight: '700',
                    color: action.textColor,
                    marginBottom: '10px',
                    letterSpacing: '-0.01em'
                  }}>
                    {action.title}
                  </h3>
                  <p style={{
                    fontSize: '15px',
                    color: '#475569',
                    lineHeight: '1.6',
                    margin: 0
                  }}>
                    {action.desc}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Admin Tools */}
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
              Admin Tools
            </h2>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '20px'
            }}>
              {adminTools.map((tool, i) => (
                <Link
                  key={i}
                  href={tool.path}
                  onMouseEnter={() => setHoveredCard(`admin-${i}`)}
                  onMouseLeave={() => setHoveredCard(null)}
                  style={{
                    background: hoveredCard === `admin-${i}` 
                      ? 'rgba(255, 255, 255, 0.85)' 
                      : 'rgba(255, 255, 255, 0.6)',
                    backdropFilter: 'blur(60px) saturate(150%)',
                    WebkitBackdropFilter: 'blur(60px) saturate(150%)',
                    border: '1px solid rgba(255, 255, 255, 0.8)',
                    borderRadius: '20px',
                    padding: '28px',
                    cursor: 'pointer',
                    boxShadow: hoveredCard === `admin-${i}`
                      ? '0 12px 40px rgba(148, 163, 184, 0.15)'
                      : '0 4px 16px rgba(148, 163, 184, 0.06)',
                    transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
                    transform: hoveredCard === `admin-${i}` ? 'translateY(-3px)' : 'translateY(0)',
                    display: 'block',
                    textDecoration: 'none',
                    position: 'relative',
                    overflow: 'hidden'
                  }}
                  data-testid={`link-admin-${tool.title.toLowerCase()}`}
                >
                  {/* Shine effect */}
                  <div style={{
                    position: 'absolute',
                    top: '-50%',
                    left: '-50%',
                    width: '200%',
                    height: '200%',
                    background: 'linear-gradient(45deg, transparent 30%, rgba(255, 255, 255, 0.4) 50%, transparent 70%)',
                    transform: hoveredCard === `admin-${i}` ? 'translateX(100%)' : 'translateX(-100%)',
                    transition: 'transform 0.6s ease',
                    pointerEvents: 'none'
                  }} />

                  <div style={{ position: 'relative', zIndex: 1 }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'flex-start',
                      marginBottom: '16px'
                    }}>
                      <div style={{
                        width: '48px',
                        height: '48px',
                        borderRadius: '14px',
                        background: 'linear-gradient(135deg, #475569, #334155)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 4px 12px rgba(71, 85, 105, 0.25)'
                      }}>
                        <tool.icon size={24} style={{ color: '#fff' }} />
                      </div>
                      <span style={{
                        fontSize: '11px',
                        fontWeight: '600',
                        color: '#6b21a8',
                        background: 'rgba(167, 139, 250, 0.15)',
                        padding: '4px 10px',
                        borderRadius: '8px',
                        textTransform: 'uppercase',
                        letterSpacing: '0.5px'
                      }}>
                        Admin
                      </span>
                    </div>
                    <h3 style={{
                      fontSize: '18px',
                      fontWeight: '700',
                      color: '#1e293b',
                      marginBottom: '4px'
                    }}>
                      {tool.title}
                    </h3>
                    <p style={{
                      fontSize: '14px',
                      color: '#64748b',
                      margin: 0
                    }}>
                      {tool.desc}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

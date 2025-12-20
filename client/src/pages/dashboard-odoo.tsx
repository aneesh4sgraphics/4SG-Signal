import { Link } from "wouter";
import { 
  Calculator, 
  FileText, 
  Database, 
  Users, 
  BarChart3, 
  TrendingUp,
  Settings,
  AlertCircle,
  ArrowRight,
  Zap,
  DollarSign,
  Package,
  ClipboardList,
  Wallet,
  UserCheck,
  Boxes
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

interface AppItem {
  title: string;
  description: string;
  path: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  adminOnly?: boolean;
}

const mainApps: AppItem[] = [
  {
    title: "QuickQuotes",
    description: "Generate instant quotes with pricing calculations",
    path: "/quick-quotes",
    icon: Calculator,
    color: "#FFD93D"
  },
  {
    title: "Price List",
    description: "View and export comprehensive pricing tables",
    path: "/price-list",
    icon: FileText,
    color: "#A7F3D0"
  },
  {
    title: "Saved Quotes",
    description: "Manage and track all generated quotes",
    path: "/saved-quotes",
    icon: BarChart3,
    color: "#C4B5FD"
  }
];

const adminApps: AppItem[] = [
  {
    title: "Product Pricing",
    description: "Manage product catalog and pricing data",
    path: "/product-pricing-management",
    icon: Database,
    color: "#FBCFE8",
    adminOnly: true
  },
  {
    title: "Customers",
    description: "Customer database management",
    path: "/customers",
    icon: Users,
    color: "#93C5FD",
    adminOnly: true
  },
  {
    title: "Administration",
    description: "System settings and user management",
    path: "/admin",
    icon: Settings,
    color: "#FED7AA",
    adminOnly: true
  }
];

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-3 border-black border-t-transparent"></div>
          <span className="font-bold">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div 
        className="max-w-md mx-auto mt-20 rounded-2xl p-8 bg-white text-center"
        style={{ border: '3px solid #000' }}
      >
        <div className="w-16 h-16 rounded-full bg-[#FFD93D] flex items-center justify-center mx-auto mb-4" style={{ border: '3px solid #000' }}>
          <AlertCircle className="h-8 w-8 text-black" />
        </div>
        <h3 className="text-2xl font-bold mb-2">Authentication Required</h3>
        <p className="text-gray-600 font-medium mb-6">Please log in to access your dashboard</p>
        <button 
          onClick={() => window.location.href = "/api/login"} 
          className="px-8 py-3 rounded-full font-bold bg-black text-white"
          style={{ border: '3px solid #000' }}
        >
          Login with Replit
        </button>
      </div>
    );
  }

  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  const isAdmin = (user as any)?.role === 'admin';

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: 2,
  });

  return (
    <div className="space-y-8">
      {/* Hero Section */}
      <div 
        className="rounded-2xl p-6 bg-[#FFD93D]"
        style={{ border: '3px solid #000' }}
      >
        <div className="flex items-center gap-4">
          <div 
            className="w-14 h-14 rounded-full bg-black flex items-center justify-center"
            style={{ border: '3px solid #000' }}
          >
            <Zap className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-black">Welcome back, {firstName}</h1>
            <p className="text-lg font-medium text-gray-700">Here's what's happening with your workspace today</p>
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          <div 
            className="rounded-2xl p-6 bg-[#93C5FD] transition-all hover:-translate-y-1"
            style={{ border: '3px solid #000' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div 
                className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                style={{ border: '2px solid #000' }}
              >
                <ClipboardList className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full font-bold text-sm" style={{ border: '2px solid #000' }}>
                <TrendingUp className="h-4 w-4" />
                <span>+{stats.quotesThisMonth}</span>
              </div>
            </div>
            <div className="text-4xl font-black text-black">{stats.totalQuotes}</div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-700">Total Quotes</div>
          </div>

          <div 
            className="rounded-2xl p-6 bg-[#A7F3D0] transition-all hover:-translate-y-1"
            style={{ border: '3px solid #000' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div 
                className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                style={{ border: '2px solid #000' }}
              >
                <Wallet className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full font-bold text-sm" style={{ border: '2px solid #000' }}>
                <DollarSign className="h-4 w-4" />
              </div>
            </div>
            <div className="text-4xl font-black text-black">${stats.monthlyRevenue.toLocaleString()}</div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-700">Monthly Revenue</div>
          </div>

          <div 
            className="rounded-2xl p-6 bg-[#C4B5FD] transition-all hover:-translate-y-1"
            style={{ border: '3px solid #000' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div 
                className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                style={{ border: '2px solid #000' }}
              >
                <UserCheck className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full font-bold text-sm" style={{ border: '2px solid #000' }}>
                <Users className="h-4 w-4" />
              </div>
            </div>
            <div className="text-4xl font-black text-black">{Number(stats.totalCustomers).toLocaleString()}</div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-700">Happy Customers</div>
          </div>

          <div 
            className="rounded-2xl p-6 bg-[#FBCFE8] transition-all hover:-translate-y-1"
            style={{ border: '3px solid #000' }}
          >
            <div className="flex items-start justify-between mb-4">
              <div 
                className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
                style={{ border: '2px solid #000' }}
              >
                <Boxes className="h-6 w-6 text-white" />
              </div>
              <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-full font-bold text-sm" style={{ border: '2px solid #000' }}>
                <Package className="h-4 w-4" />
              </div>
            </div>
            <div className="text-4xl font-black text-black">{stats.totalProducts}</div>
            <div className="text-sm font-bold uppercase tracking-wider text-gray-700">Products</div>
          </div>
        </div>
      )}

      {/* Quick Actions */}
      <div 
        className="rounded-2xl p-6 bg-white"
        style={{ border: '3px solid #000' }}
      >
        <div className="mb-6">
          <h2 className="text-2xl font-black">Quick Actions</h2>
          <p className="font-medium text-gray-600 mt-1">Your most-used tools and features</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {mainApps.map((app) => {
            const Icon = app.icon;
            return (
              <Link 
                key={app.path} 
                href={app.path}
                className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-pointer block"
                style={{ border: '3px solid #000', backgroundColor: app.color }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div 
                    className="w-12 h-12 rounded-full bg-white flex items-center justify-center"
                    style={{ border: '2px solid #000' }}
                  >
                    <Icon className="h-6 w-6 text-black" />
                  </div>
                  <ArrowRight className="h-5 w-5 text-black group-hover:translate-x-1 transition-transform" />
                </div>
                <h3 className="text-xl font-bold mb-2">{app.title}</h3>
                <p className="text-sm font-medium text-gray-700">{app.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <div 
          className="rounded-2xl p-6 bg-white"
          style={{ border: '3px solid #000' }}
        >
          <div className="flex items-center gap-4 mb-6">
            <div 
              className="w-12 h-12 rounded-full bg-black flex items-center justify-center"
              style={{ border: '2px solid #000' }}
            >
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-2xl font-black">Admin Tools</h2>
              <p className="font-medium text-gray-600">Manage system settings and data</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {adminApps.map((app) => {
              const Icon = app.icon;
              return (
                <Link 
                  key={app.path} 
                  href={app.path}
                  className="group rounded-2xl p-6 transition-all duration-200 hover:-translate-y-1 cursor-pointer block"
                  style={{ border: '3px solid #000', backgroundColor: app.color }}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div 
                      className="w-12 h-12 rounded-full bg-white flex items-center justify-center"
                      style={{ border: '2px solid #000' }}
                    >
                      <Icon className="h-6 w-6 text-black" />
                    </div>
                    <span 
                      className="px-3 py-1 rounded-full text-xs font-bold bg-black text-white"
                    >
                      Admin
                    </span>
                  </div>
                  <h3 className="text-xl font-bold mb-2">{app.title}</h3>
                  <p className="text-sm font-medium text-gray-700">{app.description}</p>
                  <div className="mt-4 pt-4 flex items-center font-bold text-sm" style={{ borderTop: '2px dashed #000' }}>
                    <span>Open</span>
                    <ArrowRight className="h-4 w-4 ml-2 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Stats Banner */}
      {stats && (
        <div 
          className="rounded-2xl p-6 bg-black text-white"
          style={{ border: '3px solid #000' }}
        >
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold mb-2">You're doing great!</h3>
              <p className="font-medium text-white/80">
                {stats.activityCount} actions logged this session. Keep up the momentum!
              </p>
            </div>
            <div className="hidden md:flex items-center gap-8">
              <div className="text-center">
                <div className="text-3xl font-black">{stats.quotesThisMonth}</div>
                <div className="text-sm font-medium text-white/70">Quotes</div>
              </div>
              <div className="w-px h-12 bg-white/30"></div>
              <div className="text-center">
                <div className="text-3xl font-black">{stats.totalCustomers}</div>
                <div className="text-sm font-medium text-white/70">Customers</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

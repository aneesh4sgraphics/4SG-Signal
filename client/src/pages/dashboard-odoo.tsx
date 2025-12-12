import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Activity,
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
    color: "bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600"
  },
  {
    title: "Price List",
    description: "View and export comprehensive pricing tables",
    path: "/price-list",
    icon: FileText,
    color: "bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600"
  },
  {
    title: "Saved Quotes",
    description: "Manage and track all generated quotes",
    path: "/saved-quotes",
    icon: BarChart3,
    color: "bg-gradient-to-br from-violet-400 via-purple-500 to-fuchsia-600"
  }
];

const adminApps: AppItem[] = [
  {
    title: "Product Pricing",
    description: "Manage product catalog and pricing data",
    path: "/product-pricing-management",
    icon: Database,
    color: "bg-gradient-to-br from-amber-400 via-orange-500 to-red-500",
    adminOnly: true
  },
  {
    title: "Customers",
    description: "Customer database management",
    path: "/customers",
    icon: Users,
    color: "bg-gradient-to-br from-cyan-400 via-blue-500 to-indigo-600",
    adminOnly: true
  },
  {
    title: "Administration",
    description: "System settings and user management",
    path: "/admin",
    icon: Settings,
    color: "bg-gradient-to-br from-slate-400 via-gray-500 to-zinc-600",
    adminOnly: true
  }
];

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="flex items-center gap-3">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-black border-t-transparent"></div>
          <span className="body-base font-medium">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="modern-card max-w-md mx-auto mt-20">
        <div className="text-center py-8">
          <div className="icon-container icon-container-secondary mx-auto mb-4">
            <AlertCircle className="h-6 w-6" />
          </div>
          <h3 className="heading-sm mb-2">Authentication Required</h3>
          <p className="body-base text-gray-600 mb-6">Please log in to access your dashboard</p>
          <Button onClick={() => window.location.href = "/api/login"} className="primary-button">
            Login with Replit
          </Button>
        </div>
      </div>
    );
  }

  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  const isAdmin = (user as any)?.role === 'admin';

  // Fetch dashboard statistics
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: 2,
  });

  return (
    <div className="glass-container p-6">
      <div className="space-y-12 relative z-10">
        {/* Hero Section */}
        <div className="glass-card p-6 space-y-4">
          <div className="flex items-center gap-3">
            <div className="glass-icon-btn bg-gradient-to-br from-blue-500 to-indigo-600 text-white">
              <Zap className="h-6 w-6" />
            </div>
            <div>
              <h1 className="heading-lg">Welcome back, {firstName}</h1>
              <p className="body-lg text-gray-600">Here's what's happening with your workspace today</p>
            </div>
          </div>
        </div>

        {/* Stats Grid */}
        {!statsLoading && stats && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="glass-stat p-6 group transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-400 via-blue-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-blue-500/30">
                  <ClipboardList className="h-7 w-7 text-white" />
                </div>
                <div className="flex items-center gap-1 text-green-500 text-sm font-medium">
                  <TrendingUp className="h-4 w-4" />
                  <span>+{stats.quotesThisMonth}</span>
                </div>
              </div>
              <div className="stat-value text-black">{stats.totalQuotes}</div>
              <div className="stat-label">Total Quotes</div>
              <div className="mt-3 pt-3 border-t border-gray-100/50">
                <div className="body-sm text-gray-500">{stats.quotesThisMonth} created this month</div>
              </div>
            </div>

            <div className="glass-stat p-6 group transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 via-green-500 to-teal-600 flex items-center justify-center shadow-lg shadow-green-500/30">
                  <Wallet className="h-7 w-7 text-white" />
                </div>
                <div className="flex items-center gap-1 text-emerald-500 text-sm font-medium">
                  <DollarSign className="h-4 w-4" />
                </div>
              </div>
              <div className="stat-value text-black">${stats.monthlyRevenue.toLocaleString()}</div>
              <div className="stat-label">Monthly Revenue</div>
              <div className="mt-3 pt-3 border-t border-gray-100/50">
                <div className="body-sm text-gray-500">From {stats.quotesThisMonth} quotes</div>
              </div>
            </div>

            <div className="glass-stat p-6 group transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-400 via-purple-500 to-fuchsia-600 flex items-center justify-center shadow-lg shadow-purple-500/30">
                  <UserCheck className="h-7 w-7 text-white" />
                </div>
                <div className="flex items-center gap-1 text-purple-500 text-sm font-medium">
                  <Users className="h-4 w-4" />
                </div>
              </div>
              <div className="stat-value text-black">{Number(stats.totalCustomers).toLocaleString()}</div>
              <div className="stat-label">Happy Customers</div>
              <div className="mt-3 pt-3 border-t border-gray-100/50">
                <div className="body-sm text-gray-500">Growing community</div>
              </div>
            </div>

            <div className="glass-stat p-6 group transition-all duration-200 hover:scale-[1.02]">
              <div className="flex items-start justify-between mb-4">
                <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-red-500 flex items-center justify-center shadow-lg shadow-orange-500/30">
                  <Boxes className="h-7 w-7 text-white" />
                </div>
                <div className="flex items-center gap-1 text-orange-500 text-sm font-medium">
                  <Package className="h-4 w-4" />
                </div>
              </div>
              <div className="stat-value text-black">{stats.totalProducts}</div>
              <div className="stat-label">Products</div>
              <div className="mt-3 pt-3 border-t border-gray-100/50">
                <div className="body-sm text-gray-500">In catalog</div>
              </div>
            </div>
          </div>
        )}

        {/* Quick Actions */}
        <div className="glass-card p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="heading-md">Quick Actions</h2>
              <p className="body-base text-gray-600 mt-1">Your most-used tools and features</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {mainApps.map((app) => {
              const Icon = app.icon;
              return (
                <Link 
                  key={app.path} 
                  href={app.path}
                  className="group glass-card-solid p-6 hover:shadow-xl hover:scale-[1.02] cursor-pointer transition-all duration-200 block"
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className={`w-14 h-14 rounded-2xl ${app.color} flex items-center justify-center shadow-lg`}>
                      <Icon className="h-7 w-7 text-white" />
                    </div>
                    <ArrowRight className="h-5 w-5 text-gray-400 group-hover:text-black group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                  <h3 className="heading-sm mb-2 group-hover:text-primary transition-colors">{app.title}</h3>
                  <p className="body-sm text-gray-600">{app.description}</p>
                </Link>
              );
            })}
          </div>
        </div>

        {/* Admin Section */}
        {isAdmin && (
          <div className="glass-card p-6">
            <div className="flex items-center gap-3 mb-6">
              <div className="glass-icon-btn bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
                <Settings className="h-5 w-5" />
              </div>
              <div>
                <h2 className="heading-md">Admin Tools</h2>
                <p className="body-base text-gray-600">Manage system settings and data</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {adminApps.map((app) => {
                const Icon = app.icon;
                return (
                  <Link 
                    key={app.path} 
                    href={app.path}
                    className="group glass-card-solid p-6 hover:shadow-xl hover:scale-[1.02] cursor-pointer transition-all duration-200 block border-2 border-transparent hover:border-indigo-200"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div className={`w-14 h-14 rounded-2xl ${app.color} flex items-center justify-center shadow-lg`}>
                        <Icon className="h-7 w-7 text-white" />
                      </div>
                      <Badge className="glass-badge text-indigo-600">Admin</Badge>
                    </div>
                    <h3 className="heading-sm mb-2 group-hover:text-primary transition-colors">{app.title}</h3>
                    <p className="body-sm text-gray-600">{app.description}</p>
                    <div className="mt-4 pt-4 border-t border-gray-200/50 flex items-center text-primary font-medium body-sm group-hover:gap-2 transition-all duration-200">
                      <span>Open</span>
                      <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        )}

        {/* Quick Stats Banner */}
        {stats && (
          <div className="glass-card p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white border-none">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="heading-sm text-white mb-2">You're doing great!</h3>
                <p className="body-base text-white/90">
                  {stats.activityCount} actions logged this session. Keep up the momentum!
                </p>
              </div>
              <div className="hidden md:flex items-center gap-8">
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{stats.quotesThisMonth}</div>
                  <div className="text-sm text-white/80">Quotes</div>
                </div>
                <div className="w-px h-12 bg-white/20"></div>
                <div className="text-center">
                  <div className="text-3xl font-bold text-white">{stats.totalCustomers}</div>
                  <div className="text-sm text-white/80">Customers</div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

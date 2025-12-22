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
  ArrowRight,
  DollarSign,
  Package,
  ClipboardList,
  ChevronRight,
  Sparkles
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
  adminOnly?: boolean;
}

const mainApps: AppItem[] = [
  {
    title: "QuickQuotes",
    description: "Generate instant quotes with intelligent pricing calculations",
    path: "/quick-quotes",
    icon: Calculator
  },
  {
    title: "Price List",
    description: "View and export comprehensive pricing tables",
    path: "/price-list",
    icon: FileText
  },
  {
    title: "Saved Quotes",
    description: "Manage and track all generated quotes",
    path: "/saved-quotes",
    icon: BarChart3
  }
];

const adminApps: AppItem[] = [
  {
    title: "Database",
    description: "System settings",
    path: "/product-pricing-management",
    icon: Database,
    adminOnly: true
  },
  {
    title: "Users",
    description: "User management",
    path: "/customers",
    icon: Users,
    adminOnly: true
  },
  {
    title: "System",
    description: "Configuration",
    path: "/admin",
    icon: Settings,
    adminOnly: true
  }
];

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["/api/dashboard/stats"],
    retry: 2,
  });

  // Get current date info
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
        <div className="glass-card max-w-md text-center">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-100 to-pink-100 flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="h-8 w-8 text-purple-500" />
          </div>
          <h3 className="text-xl font-bold mb-2 text-gray-900">Sign in required</h3>
          <p className="text-gray-500 mb-6">Please sign in to access your dashboard</p>
          <Button onClick={() => window.location.href = "/api/login"} className="glass-btn-primary">
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
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Welcome Header - Glass Style */}
      <div className="glass-card">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-5 w-5 text-purple-500" />
              <span className="text-sm font-medium text-purple-600">4S Graphics Dashboard</span>
            </div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-purple-800 to-gray-900 bg-clip-text text-transparent">
              Welcome back, {firstName}
            </h1>
            <p className="text-gray-500 mt-1">
              {dateString} • Managing your printing operations
            </p>
          </div>
          <Link href="/quick-quotes">
            <Button className="glass-btn-primary">
              <Calculator className="h-4 w-4 mr-2" />
              New Quote
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid - Glass Cards */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="glass-stat-card group" data-testid="stat-revenue">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 flex items-center justify-center shadow-lg shadow-emerald-200">
                <DollarSign className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-emerald-600 bg-emerald-50 px-2 py-1 rounded-full">
                <TrendingUp className="h-3 w-3" />
                <span>+12.5%</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">${stats.monthlyRevenue.toLocaleString()}</div>
            <div className="text-sm text-gray-500">Total Revenue</div>
          </div>

          <div className="glass-stat-card group" data-testid="stat-quotes">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-400 to-indigo-500 flex items-center justify-center shadow-lg shadow-blue-200">
                <ClipboardList className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-blue-600 bg-blue-50 px-2 py-1 rounded-full">
                <span>+{stats.quotesThisMonth} today</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalQuotes}</div>
            <div className="text-sm text-gray-500">Active Quotes</div>
          </div>

          <div className="glass-stat-card group" data-testid="stat-growth">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-purple-400 to-pink-500 flex items-center justify-center shadow-lg shadow-purple-200">
                <TrendingUp className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                <span>+5.2% this week</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">23%</div>
            <div className="text-sm text-gray-500">Growth Rate</div>
          </div>

          <div className="glass-stat-card group" data-testid="stat-orders">
            <div className="flex items-center justify-between mb-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg shadow-amber-200">
                <Package className="h-5 w-5 text-white" />
              </div>
              <div className="flex items-center gap-1 text-xs font-medium text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
                <span>{stats.totalProducts} products</span>
              </div>
            </div>
            <div className="text-2xl font-bold text-gray-900">{stats.totalCustomers}</div>
            <div className="text-sm text-gray-500">Total Customers</div>
          </div>
        </div>
      )}

      {/* Loading skeleton for stats */}
      {statsLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="glass-stat-card animate-pulse">
              <div className="h-10 w-10 rounded-xl bg-gray-200 mb-3" />
              <div className="h-8 w-24 bg-gray-200 rounded mb-2" />
              <div className="h-4 w-20 bg-gray-100 rounded" />
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions - Glass Cards */}
      <div>
        <h2 className="text-xl font-bold text-gray-900 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {mainApps.map((app) => {
            const Icon = app.icon;
            const gradients = [
              'from-violet-500 to-purple-600',
              'from-cyan-500 to-blue-600',
              'from-emerald-500 to-teal-600'
            ];
            const gradient = gradients[mainApps.indexOf(app) % gradients.length];
            
            return (
              <Link 
                key={app.path} 
                href={app.path}
                className="glass-action-card group block"
                data-testid={`link-${app.title.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${gradient} flex items-center justify-center shadow-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-gray-400 group-hover:text-purple-500 group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-bold text-lg text-gray-900 mb-1">{app.title}</h3>
                <p className="text-sm text-gray-500 line-clamp-2">{app.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Admin Section - Glass Style */}
      {isAdmin && (
        <div>
          <h2 className="text-xl font-bold text-gray-900 mb-4">Admin Tools</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adminApps.map((app) => {
              const Icon = app.icon;
              return (
                <Link 
                  key={app.path} 
                  href={app.path}
                  className="glass-action-card group block"
                  data-testid={`link-admin-${app.title.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-gray-700 to-gray-900 flex items-center justify-center">
                      <Icon className="h-5 w-5 text-white" />
                    </div>
                    <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-purple-100 text-purple-700">Admin</span>
                  </div>
                  <h3 className="font-bold text-gray-900 mb-0.5">{app.title}</h3>
                  <p className="text-sm text-gray-500">{app.description}</p>
                </Link>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

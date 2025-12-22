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
    description: "Generate instant quotes with pricing calculations",
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
    title: "Product Pricing",
    description: "Manage product catalog and pricing data",
    path: "/product-pricing-management",
    icon: Database,
    adminOnly: true
  },
  {
    title: "Customers",
    description: "Customer database management",
    path: "/customers",
    icon: Users,
    adminOnly: true
  },
  {
    title: "Administration",
    description: "System settings and user management",
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

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-gray-900 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm text-gray-500">Loading...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="contra-card max-w-md text-center">
          <div className="contra-avatar-lg mx-auto mb-4 bg-gray-100">
            <AlertCircle className="h-6 w-6 text-gray-400" />
          </div>
          <h3 className="text-xl font-bold mb-2">Sign in required</h3>
          <p className="text-gray-500 mb-6">Please sign in to access your dashboard</p>
          <Button onClick={() => window.location.href = "/api/login"} className="contra-btn-primary">
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
      {/* Welcome Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-extrabold text-[#1A1819] mb-1">
            Welcome back, {firstName}
          </h1>
          <p className="text-[#B7AEA3] font-medium">
            Here's what's happening with your business today
          </p>
        </div>
        <div className="hidden md:flex items-center gap-3">
          <Link href="/quick-quotes">
            <Button 
              className="px-6 py-3 rounded-xl font-bold text-[#1A1819] border-[3px] border-[#1A1819] transition-all hover:shadow-[4px_4px_0px_#1A1819] hover:scale-[1.02]" 
              style={{ backgroundColor: '#FE8505' }}
              data-testid="button-new-quote"
            >
              <Sparkles className="h-4 w-4 mr-2" />
              New Quote
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats Grid */}
      {!statsLoading && stats && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="rounded-2xl p-6 border-[3px] border-[#1A1819] group transition-all hover:scale-[1.02]" style={{ backgroundColor: '#FE8505' }} data-testid="stat-quotes">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                <ClipboardList className="h-6 w-6 text-[#1A1819]" />
              </div>
              <div className="flex items-center gap-1 text-sm font-bold bg-white/20 px-2 py-1 rounded-full border-2 border-[#1A1819]">
                <TrendingUp className="h-3.5 w-3.5 text-[#1A1819]" />
                <span className="text-[#1A1819]">+{stats.quotesThisMonth}</span>
              </div>
            </div>
            <div className="text-4xl font-black mb-1 text-[#1A1819]">{stats.totalQuotes}</div>
            <div className="text-sm font-bold text-[#1A1819]/70">Total Quotes</div>
          </div>

          <div className="rounded-2xl p-6 border-[3px] border-[#1A1819] group transition-all hover:scale-[1.02]" style={{ backgroundColor: '#6A9291' }} data-testid="stat-revenue">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                <DollarSign className="h-6 w-6 text-[#1A1819]" />
              </div>
            </div>
            <div className="text-4xl font-black mb-1 text-[#1A1819]">
              ${stats.monthlyRevenue.toLocaleString()}
            </div>
            <div className="text-sm font-bold text-[#1A1819]/70">Monthly Revenue</div>
          </div>

          <div className="rounded-2xl p-6 border-[3px] border-[#1A1819] group transition-all hover:scale-[1.02]" style={{ backgroundColor: '#FF8FAB' }} data-testid="stat-customers">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                <Users className="h-6 w-6 text-[#1A1819]" />
              </div>
            </div>
            <div className="text-4xl font-black mb-1 text-[#1A1819]">
              {Number(stats.totalCustomers).toLocaleString()}
            </div>
            <div className="text-sm font-bold text-[#1A1819]/70">Customers</div>
          </div>

          <div className="rounded-2xl p-6 border-[3px] border-[#1A1819] group transition-all hover:scale-[1.02]" style={{ backgroundColor: '#C4B5E0' }} data-testid="stat-products">
            <div className="flex items-center justify-between mb-4">
              <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                <Package className="h-6 w-6 text-[#1A1819]" />
              </div>
            </div>
            <div className="text-4xl font-black mb-1 text-[#1A1819]">{stats.totalProducts}</div>
            <div className="text-sm font-bold text-[#1A1819]/70">Products</div>
          </div>
        </div>
      )}

      {/* Loading skeleton for stats */}
      {statsLoading && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="contra-card">
              <div className="contra-skeleton h-10 w-10 rounded-xl mb-4" />
              <div className="contra-skeleton h-8 w-24 mb-2" />
              <div className="contra-skeleton h-4 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Quick Actions */}
      <div>
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-extrabold text-[#1A1819]">Quick Actions</h2>
            <p className="text-sm font-medium text-[#B7AEA3]">Your most-used tools</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {mainApps.map((app, index) => {
            const Icon = app.icon;
            const colors = ['#F4B854', '#6A9291', '#E37202', '#9ED0CE'];
            const color = colors[index % colors.length];
            return (
              <Link 
                key={app.path} 
                href={app.path}
                className="rounded-2xl p-6 border-[3px] border-[#1A1819] group block transition-all hover:scale-[1.02] hover:shadow-[4px_4px_0px_#1A1819]"
                style={{ backgroundColor: color }}
                data-testid={`link-${app.title.toLowerCase().replace(/\s/g, '-')}`}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                    <Icon className="h-6 w-6 text-[#1A1819]" />
                  </div>
                  <ChevronRight className="h-5 w-5 text-[#1A1819] group-hover:translate-x-1 transition-all" />
                </div>
                <h3 className="font-black text-lg mb-1 text-[#1A1819]">{app.title}</h3>
                <p className="text-sm line-clamp-2 font-semibold text-[#1A1819]/70">{app.description}</p>
              </Link>
            );
          })}
        </div>
      </div>

      {/* Admin Section */}
      {isAdmin && (
        <div>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center border-2 border-[#1A1819]" style={{ backgroundColor: '#6A9291' }}>
              <Settings className="h-5 w-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-[#1A1819]">Admin Tools</h2>
              <p className="text-sm text-[#B7AEA3]">Manage system settings</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adminApps.map((app, index) => {
              const Icon = app.icon;
              const colors = ['#C4B5E0', '#FF8FAB', '#FE8505'];
              const color = colors[index % colors.length];
              return (
                <Link 
                  key={app.path} 
                  href={app.path}
                  className="rounded-2xl p-6 border-[3px] border-[#1A1819] group block transition-all hover:scale-[1.02] hover:shadow-[4px_4px_0px_#1A1819]"
                  style={{ backgroundColor: color }}
                  data-testid={`link-admin-${app.title.toLowerCase().replace(/\s/g, '-')}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div className="w-12 h-12 rounded-2xl bg-white/20 flex items-center justify-center border-2 border-[#1A1819]">
                      <Icon className="h-6 w-6 text-[#1A1819]" />
                    </div>
                    <span className="px-3 py-1 text-xs font-bold rounded-full border-2 border-[#1A1819] bg-white/20 text-[#1A1819]">Admin</span>
                  </div>
                  <h3 className="font-black text-lg mb-1 text-[#1A1819]">{app.title}</h3>
                  <p className="text-sm font-semibold text-[#1A1819]/70">{app.description}</p>
                  <div className="mt-4 pt-4 border-t-2 border-[#1A1819]/30 flex items-center gap-1 text-sm font-black text-[#1A1819]">
                    <span>Open</span>
                    <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Activity Banner */}
      {stats && (
        <div className="rounded-2xl p-6 border-[3px] border-[#1A1819]" style={{ backgroundColor: '#F4B854' }}>
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-bold text-xl text-[#1A1819] mb-1">You're doing great!</h3>
              <p className="text-[#1A1819]/70 font-medium">
                {stats.activityCount} actions logged. Keep up the momentum!
              </p>
            </div>
            <div className="hidden md:flex items-center gap-6">
              <div className="text-center px-4 py-2 rounded-xl bg-white/30 border-2 border-[#1A1819]">
                <div className="text-2xl font-extrabold text-[#1A1819]">{stats.quotesThisMonth}</div>
                <div className="text-xs font-semibold text-[#1A1819]/70">This Month</div>
              </div>
              <div className="text-center px-4 py-2 rounded-xl bg-white/30 border-2 border-[#1A1819]">
                <div className="text-2xl font-extrabold text-[#1A1819]">{stats.totalCustomers}</div>
                <div className="text-xs font-semibold text-[#1A1819]/70">Customers</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

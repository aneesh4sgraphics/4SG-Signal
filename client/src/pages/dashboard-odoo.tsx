import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  Calculator, 
  FileText, 
  Database, 
  Users, 
  BarChart3, 
  Package,
  Truck,
  Settings,
  Download,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import OdooCard from "@/components/OdooCard";

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
    color: "bg-blue-500"
  },
  {
    title: "Price List",
    description: "View and export comprehensive pricing tables",
    path: "/price-list",
    icon: FileText,
    color: "bg-green-500"
  },
  {
    title: "Saved Quotes",
    description: "Manage and track all generated quotes",
    path: "/saved-quotes",
    icon: BarChart3,
    color: "bg-purple-500"
  }
];

const adminApps: AppItem[] = [
  {
    title: "Product Pricing",
    description: "Manage product catalog and pricing data",
    path: "/product-pricing-management",
    icon: Database,
    color: "bg-orange-500",
    adminOnly: true
  },
  {
    title: "Customers",
    description: "Customer database management",
    path: "/customers",
    icon: Users,
    color: "bg-indigo-500",
    adminOnly: true
  },
  {
    title: "Administration",
    description: "System settings and user management",
    path: "/admin",
    icon: Settings,
    color: "bg-gray-500",
    adminOnly: true
  }
];

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-purple-600"></div>
        <span className="ml-3 text-sm text-gray-600">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <OdooCard title="Authentication Required">
        <div className="text-center py-8">
          <AlertCircle className="h-12 w-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">Please log in to access your dashboard</p>
          <Button onClick={() => window.location.href = "/api/login"}>
            Login with Replit
          </Button>
        </div>
      </OdooCard>
    );
  }

  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  const isAdmin = (user as any)?.role === 'admin';

  return (
    <div className="space-y-8">
      {/* Welcome Section */}
      <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-lg p-6 border border-purple-100">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-semibold text-gray-900 mb-2">
              Welcome back, {firstName}!
            </h1>
            <p className="text-gray-600 text-lg">
              Ready to create quotes and manage pricing? Start with the applications below.
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Badge variant="outline" className="text-purple-700 border-purple-200 px-3 py-1">
              {(user as any)?.role === 'admin' ? 'Administrator' : 'Employee'}
            </Badge>
            <Calendar className="h-6 w-6 text-purple-400" />
          </div>
        </div>
      </div>

      {/* Main Applications - Featured at Top */}
      <OdooCard title="📋 Main Applications" description="Click on any application below to get started">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {mainApps.map((app) => {
            const Icon = app.icon;
            return (
              <Link key={app.path} href={app.path}>
                <div className="p-6 border-2 border-gray-200 rounded-xl hover:border-purple-300 hover:shadow-lg transition-all cursor-pointer group bg-white">
                  <div className="text-center">
                    <div className={`w-16 h-16 ${app.color} rounded-xl flex items-center justify-center mx-auto mb-4 group-hover:scale-110 transition-transform`}>
                      <Icon className="h-8 w-8 text-white" />
                    </div>
                    <h3 className="text-xl font-semibold text-gray-900 group-hover:text-purple-700 mb-2">
                      {app.title}
                    </h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{app.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </OdooCard>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <OdooCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Active Quotes</p>
              <p className="text-3xl font-bold text-gray-900">12</p>
              <p className="text-xs text-green-600 mt-1">↑ 8% from last week</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-xl">
              <FileText className="h-8 w-8 text-blue-600" />
            </div>
          </div>
        </OdooCard>

        <OdooCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">This Month</p>
              <p className="text-3xl font-bold text-gray-900">$45.2K</p>
              <p className="text-xs text-green-600 mt-1">↑ 12% from last month</p>
            </div>
            <div className="p-3 bg-green-100 rounded-xl">
              <TrendingUp className="h-8 w-8 text-green-600" />
            </div>
          </div>
        </OdooCard>

        <OdooCard>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600 mb-1">Success Rate</p>
              <p className="text-3xl font-bold text-gray-900">94%</p>
              <p className="text-xs text-green-600 mt-1">Excellent performance</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-xl">
              <CheckCircle className="h-8 w-8 text-purple-600" />
            </div>
          </div>
        </OdooCard>
      </div>

      {/* Admin Tools */}
      {isAdmin && (
        <OdooCard title="🔧 Administration Tools" description="System management and configuration - Admin access required">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {adminApps.map((app) => {
              const Icon = app.icon;
              return (
                <Link key={app.path} href={app.path}>
                  <div className="p-4 border border-orange-200 rounded-lg hover:border-orange-300 hover:shadow-md transition-all cursor-pointer group bg-orange-50">
                    <div className="flex items-center mb-3">
                      <div className={`p-2 ${app.color} rounded-lg`}>
                        <Icon className="h-5 w-5 text-white" />
                      </div>
                      <h3 className="ml-3 font-medium text-gray-900 group-hover:text-orange-700">
                        {app.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600">{app.description}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </OdooCard>
      )}

      {/* Recent Activity */}
      <OdooCard title="📈 Recent Activity" description="Latest system updates and changes">
        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-green-50 to-green-100 rounded-lg border border-green-200">
            <div className="flex items-center">
              <div className="p-2 bg-green-500 rounded-full">
                <CheckCircle className="h-5 w-5 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">Quote #A1B2C3 sent to ABC Corp</p>
                <p className="text-xs text-gray-600">2 hours ago • $2,450 total value</p>
              </div>
            </div>
            <Badge variant="outline" className="text-green-700 border-green-300 bg-white">Completed</Badge>
          </div>

          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-blue-100 rounded-lg border border-blue-200">
            <div className="flex items-center">
              <div className="p-2 bg-blue-500 rounded-full">
                <Database className="h-5 w-5 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">Price list updated for Graffiti products</p>
                <p className="text-xs text-gray-600">5 hours ago • 45 products affected</p>
              </div>
            </div>
            <Badge variant="outline" className="text-blue-700 border-blue-300 bg-white">Updated</Badge>
          </div>

          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-purple-100 rounded-lg border border-purple-200">
            <div className="flex items-center">
              <div className="p-2 bg-purple-500 rounded-full">
                <Users className="h-5 w-5 text-white" />
              </div>
              <div className="ml-4">
                <p className="text-sm font-semibold text-gray-900">New customer added: XYZ Industries</p>
                <p className="text-xs text-gray-600">1 day ago • Manufacturing company</p>
              </div>
            </div>
            <Badge variant="outline" className="text-purple-700 border-purple-300 bg-white">New</Badge>
          </div>
        </div>
      </OdooCard>
    </div>
  );
}
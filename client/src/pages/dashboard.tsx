import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, Database, LogOut, Users, Package, Truck, BarChart3, Activity, Shield, Settings, Download } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";

export default function Dashboard() {
  const { user, isLoading } = useAuth();

  // Automatic logout at midnight
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0);
      
      const timeUntilMidnight = midnight.getTime() - now.getTime();
      
      setTimeout(() => {
        window.location.href = '/api/logout';
      }, timeUntilMidnight);
    };

    if (user) {
      checkMidnight();
    }
  }, [user]);

  const handleDownloadData = async () => {
    try {
      const response = await fetch('/api/download-data');
      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `4sgraphics-data-${new Date().toISOString().split('T')[0]}.zip`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      }
    } catch (error) {
      console.error('Error downloading data:', error);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#fafafa' }}>
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-400"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: '#fafafa' }}>
        <div className="text-center">
          <h1 className="heading-primary text-gray-800 mb-4">Authentication Required</h1>
          <Button 
            onClick={() => window.location.href = "/api/login"}
            className="bg-blue-500 hover:bg-blue-600 text-white px-6 py-2 rounded-md label-medium focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
          >
            Login with Replit
          </Button>
        </div>
      </div>
    );
  }

  // Extract first name
  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);

  return (
    <div className="min-h-screen" style={{ backgroundColor: '#fafafa' }}>
      {/* Notion-style Top Navigation */}
      <div className="bg-white" style={{ borderBottom: '1px solid #f3f4f6' }}>
        <div className="max-w-screen-lg mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-6 h-6 bg-blue-500 rounded-sm flex items-center justify-center">
              <span className="text-white text-xs font-medium">4S</span>
            </div>
            <span className="body-small text-gray-800">4S Graphics Employee Portal</span>
          </div>
          <Button
            onClick={() => window.location.href = '/api/logout'}
            className="text-gray-500 hover:text-gray-800 hover:bg-gray-100 px-3 py-1 rounded-md body-small bg-transparent border-none shadow-none"
          >
            <LogOut className="h-4 w-4 mr-2" />
            Logout
          </Button>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-screen-lg mx-auto px-6 py-8">
        {/* Page Header */}
        <div className="mb-8">
          <h1 className="heading-primary text-gray-800 mb-4">Dashboard</h1>
          <p className="body-small text-gray-500 mb-6">Welcome back, {firstName}! Here's a summary of your tools and activity.</p>
        </div>

        {/* Applications Block */}
        <div style={{ border: '1px solid #f3f4f6', backgroundColor: 'white' }} className="rounded-lg p-6 mb-6">
          <h2 className="heading-secondary text-gray-800 mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500" />
            Applications
          </h2>
          <p className="body-small text-gray-500 mb-4">Your core business tools</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* QuickQuotes */}
            <Link href="/quote-calculator">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <Calculator className="h-5 w-5 text-blue-500" />
                  <span className="label-large text-gray-800">QuickQuotes</span>
                </div>
                <p className="body-small text-gray-500">Generate product quotes quickly</p>
              </div>
            </Link>

            {/* Price List */}
            <Link href="/price-list">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <FileText className="h-5 w-5 text-gray-500" />
                  <span className="label-large text-gray-800">Price List</span>
                </div>
                <p className="body-small text-gray-500">View product pricing tiers</p>
              </div>
            </Link>

            {/* SqM Calculator */}
            <Link href="/area-pricer">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <BarChart3 className="h-5 w-5 text-gray-500" />
                  <span className="font-normal text-gray-800">SqM Calculator</span>
                </div>
                <p className="text-sm text-gray-500">Calculate area-based pricing</p>
              </div>
            </Link>

            {/* Saved Quotes */}
            <Link href="/saved-quotes">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <Package className="h-5 w-5 text-gray-500" />
                  <span className="font-normal text-gray-800">Saved Quotes</span>
                </div>
                <p className="text-sm text-gray-500">View and manage saved quotes</p>
              </div>
            </Link>

            {/* ComIntel */}
            <Link href="/competitor-pricing">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <BarChart3 className="h-5 w-5 text-gray-500" />
                  <span className="font-normal text-gray-800">ComIntel</span>
                </div>
                <p className="text-sm text-gray-500">Competitor pricing intelligence</p>
              </div>
            </Link>

            {/* Shipping Calculator */}
            <Link href="/shipping-calculator">
              <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                <div className="flex items-center gap-3 mb-2">
                  <Truck className="h-5 w-5 text-gray-500" />
                  <span className="font-normal text-gray-800">Shipping Calculator</span>
                </div>
                <p className="text-sm text-gray-500">Calculate shipping costs</p>
              </div>
            </Link>
          </div>
        </div>

        {/* Admin Tools Block - Only for admin users */}
        {(user as any)?.role === 'admin' && (
          <div style={{ border: '1px solid #f3f4f6', backgroundColor: 'white' }} className="rounded-lg p-6 mb-6">
            <h2 className="text-lg font-normal text-gray-800 mb-2 flex items-center gap-2">
              <Shield className="h-5 w-5 text-gray-500" />
              Admin Tools
            </h2>
            <p className="text-sm text-gray-500 mb-4">Administrative functions and data management</p>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Admin Panel */}
              <Link href="/admin">
                <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 mb-2">
                    <Settings className="h-5 w-5 text-gray-500" />
                    <span className="font-normal text-gray-800">Admin Panel</span>
                  </div>
                  <p className="text-sm text-gray-500">User management and settings</p>
                </div>
              </Link>

              {/* Customer Management */}
              <Link href="/customer-management">
                <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 mb-2">
                    <Users className="h-5 w-5 text-gray-500" />
                    <span className="font-normal text-gray-800">Customer Management</span>
                  </div>
                  <p className="text-sm text-gray-500">Manage customer database</p>
                </div>
              </Link>

              {/* ProductPricing Management */}
              <Link href="/product-pricing-management">
                <div style={{ border: '1px solid #f3f4f6' }} className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer">
                  <div className="flex items-center gap-3 mb-2">
                    <Database className="h-5 w-5 text-gray-500" />
                    <span className="font-normal text-gray-800">ProductPricing Management</span>
                  </div>
                  <p className="text-sm text-gray-500">Manage product pricing data</p>
                </div>
              </Link>

              {/* Download Data */}
              <div 
                onClick={handleDownloadData}
                style={{ border: '1px solid #f3f4f6' }}
                className="rounded-md p-4 hover:bg-gray-50 transition-colors cursor-pointer"
              >
                <div className="flex items-center gap-3 mb-2">
                  <Download className="h-5 w-5 text-gray-500" />
                  <span className="font-normal text-gray-800">Download Data</span>
                </div>
                <p className="text-sm text-gray-500">Export all database files</p>
              </div>
            </div>
          </div>
        )}

        {/* Quick Stats Block */}
        <div style={{ border: '1px solid #f3f4f6', backgroundColor: 'white' }} className="rounded-lg p-6">
          <h2 className="text-lg font-normal text-gray-800 mb-2 flex items-center gap-2">
            <Activity className="h-5 w-5 text-gray-500" />
            Quick Stats
          </h2>
          <p className="text-sm text-gray-500 mb-4">System status and recent activity</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="text-center p-4 rounded-md" style={{ backgroundColor: '#f3f4f6' }}>
              <div className="text-2xl font-normal text-gray-800 mb-1">Active</div>
              <div className="text-sm text-gray-500">System Status</div>
            </div>
            <div className="text-center p-4 rounded-md" style={{ backgroundColor: '#f3f4f6' }}>
              <div className="text-2xl font-normal text-gray-800 mb-1">6</div>
              <div className="text-sm text-gray-500">Available Tools</div>
            </div>
            <div className="text-center p-4 rounded-md" style={{ backgroundColor: '#f3f4f6' }}>
              <div className="text-2xl font-normal text-gray-800 mb-1">Ready</div>
              <div className="text-sm text-gray-500">Database</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
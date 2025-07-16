import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, TrendingUp, Users, Database, LogOut, Download, Settings, Shield } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, isLoading } = useAuth();

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">Authentication Required</h1>
          <Button onClick={() => window.location.href = "/api/login"}>
            Login with Replit
          </Button>
        </div>
      </div>
    );
  }

  // Extract first name from user data
  const firstName = user.firstName || user.email?.split('@')[0] || "User";
  
  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  return (
    <div className="px-4 sm:px-6 lg:px-8 py-8">
      <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">{getGreeting()}, {firstName}!</h2>
          <p className="text-gray-600">Select a tool below to get started.</p>
        </div>

        {/* User Tools - Single Row */}
        <div className="mb-12">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Applications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* Quote Calculator */}
            <Link href="/quote-calculator">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-3 pt-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-sm">Quote Calc</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Area Pricer */}
            <Link href="/area-pricer">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-3 pt-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calculator className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-sm">Area Pricer</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Saved Quotes */}
            <Link href="/saved-quotes">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-3 pt-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-6 h-6 text-green-600" />
                  </div>
                  <CardTitle className="text-sm">Saved Quotes</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Price Lists */}
            <Link href="/price-list">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-3 pt-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-sm">Price Lists</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Competitor Prices */}
            <Link href="/competitor-pricing">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-3 pt-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-orange-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-6 h-6 text-orange-600" />
                  </div>
                  <CardTitle className="text-sm">Competitor Prices</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Area Pricer */}
            <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50 h-full">
              <CardHeader className="text-center pb-3 pt-4">
                <div className="w-12 h-12 mx-auto mb-2 bg-yellow-100 rounded-lg flex items-center justify-center">
                  <Calculator className="w-6 h-6 text-yellow-600" />
                </div>
                <CardTitle className="text-sm">Area Pricer</CardTitle>
              </CardHeader>
            </Card>

            {/* Data Guide */}
            <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50 h-full">
              <CardHeader className="text-center pb-3 pt-4">
                <div className="w-12 h-12 mx-auto mb-2 bg-indigo-100 rounded-lg flex items-center justify-center">
                  <Database className="w-6 h-6 text-indigo-600" />
                </div>
                <CardTitle className="text-sm">Data Guide</CardTitle>
              </CardHeader>
            </Card>
          </div>
        </div>

        {/* Admin Section - Only show for admin users */}
        {user.role === 'admin' && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Admin Tools</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* Admin Panel */}
              <Link href="/admin">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-red-200">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 mx-auto mb-2 bg-red-100 rounded-lg flex items-center justify-center">
                      <Settings className="w-6 h-6 text-red-600" />
                    </div>
                    <CardTitle className="text-sm text-red-600">Admin Panel</CardTitle>
                  </CardHeader>
                </Card>
              </Link>

              {/* Download Databases */}
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-gray-200" onClick={handleDownloadData}>
                <CardHeader className="text-center pb-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Download className="w-6 h-6 text-gray-600" />
                  </div>
                  <CardTitle className="text-sm text-gray-600">Download Data</CardTitle>
                </CardHeader>
              </Card>

              {/* User Management */}
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-gray-200 opacity-50">
                <CardHeader className="text-center pb-4">
                  <div className="w-12 h-12 mx-auto mb-2 bg-gray-100 rounded-lg flex items-center justify-center">
                    <Users className="w-6 h-6 text-gray-600" />
                  </div>
                  <CardTitle className="text-sm text-gray-600">User Management</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
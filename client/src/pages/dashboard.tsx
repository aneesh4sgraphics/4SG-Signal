import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, TrendingUp, Users, Database, LogOut } from "lucide-react";
import { Link } from "wouter";

export default function Dashboard() {
  const { user, isLoading } = useAuth();

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

  const firstName = user.firstName || "User";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
                  <span className="text-white font-bold text-sm">4S</span>
                </div>
                <div>
                  <h1 className="text-lg font-semibold">Employee Portal</h1>
                  <p className="text-sm text-gray-600">Your Gateway to Fast Quotes & Solutions</p>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-8 h-8 bg-gray-200 rounded-full flex items-center justify-center">
                  <Users className="w-4 h-4 text-gray-600" />
                </div>
                <span className="text-sm text-gray-600">
                  {user.email} {user.role === 'admin' && '(admin)'}
                </span>
              </div>
              <div className="flex items-center space-x-2">
                <span className="text-sm text-gray-600">Admin</span>
                <Button 
                  variant="outline" 
                  size="sm"
                  onClick={() => window.location.href = "/api/logout"}
                >
                  <LogOut className="w-4 h-4 mr-2" />
                  Logout
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Welcome, {firstName}!</h2>
          <p className="text-gray-600">Select a tool below to get started.</p>
        </div>

        {/* Tools Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Quote Calculator */}
          <Link href="/quote-calculator">
            <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white">
              <CardHeader className="text-center pb-4">
                <div className="w-16 h-16 mx-auto mb-4 bg-blue-100 rounded-lg flex items-center justify-center">
                  <Calculator className="w-8 h-8 text-blue-600" />
                </div>
                <CardTitle className="text-lg">Quote Calc</CardTitle>
              </CardHeader>
            </Card>
          </Link>

          {/* Saved Quotes */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText className="w-8 h-8 text-green-600" />
              </div>
              <CardTitle className="text-lg">Saved Quotes</CardTitle>
            </CardHeader>
          </Card>

          {/* Price Lists */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-8 h-8 text-purple-600" />
              </div>
              <CardTitle className="text-lg">Price Lists</CardTitle>
            </CardHeader>
          </Card>

          {/* Competitor Prices */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-orange-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-8 h-8 text-orange-600" />
              </div>
              <CardTitle className="text-lg">Competitor Prices</CardTitle>
            </CardHeader>
          </Card>

          {/* Area Pricer */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-yellow-100 rounded-lg flex items-center justify-center">
                <Calculator className="w-8 h-8 text-yellow-600" />
              </div>
              <CardTitle className="text-lg">Area Pricer</CardTitle>
            </CardHeader>
          </Card>

          {/* Data Guide */}
          <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white opacity-50">
            <CardHeader className="text-center pb-4">
              <div className="w-16 h-16 mx-auto mb-4 bg-indigo-100 rounded-lg flex items-center justify-center">
                <Database className="w-8 h-8 text-indigo-600" />
              </div>
              <CardTitle className="text-lg">Data Guide</CardTitle>
            </CardHeader>
          </Card>

          {/* Admin Panel - Only show for admin users */}
          {user.role === 'admin' && (
            <Link href="/admin">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-red-200">
                <CardHeader className="text-center pb-4">
                  <div className="w-16 h-16 mx-auto mb-4 bg-red-100 rounded-lg flex items-center justify-center">
                    <Database className="w-8 h-8 text-red-600" />
                  </div>
                  <CardTitle className="text-lg text-red-600">Admin Panel</CardTitle>
                </CardHeader>
              </Card>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
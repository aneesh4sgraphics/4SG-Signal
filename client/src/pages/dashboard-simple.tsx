import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, TrendingUp, Users, Database, LogOut } from "lucide-react";
import { Link } from "wouter";

export default function DashboardSimple() {
  const { user } = useAuth();

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900">
          Welcome back, {user?.firstName || 'User'}!
        </h1>
        <p className="text-gray-600 mt-2">
          4S Graphics Employee Portal - Your business tools in one place
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {/* QuickQuotes */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calculator className="w-5 h-5 mr-2 text-blue-600" />
              QuickQuotes
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Generate professional quotes with pricing tiers</p>
            <Link href="/quote-calculator">
              <Button className="w-full">Open Calculator</Button>
            </Link>
          </CardContent>
        </Card>

        {/* SqM Calculator */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center">
              <FileText className="w-5 h-5 mr-2 text-green-600" />
              SqM Calculator
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Calculate material costs per area</p>
            <Link href="/area-pricer">
              <Button className="w-full">Open SqM Calculator</Button>
            </Link>
          </CardContent>
        </Card>

        {/* ComIntel */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="w-5 h-5 mr-2 text-orange-600" />
              ComIntel
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Track competitor pricing data</p>
            <Link href="/competitor-pricing">
              <Button className="w-full">View Pricing</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Price List */}
        <Card className="hover:shadow-lg transition-shadow cursor-pointer">
          <CardHeader>
            <CardTitle className="flex items-center">
              <Database className="w-5 h-5 mr-2 text-purple-600" />
              Price List
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-gray-600 mb-4">Generate formal price lists</p>
            <Link href="/price-list">
              <Button className="w-full">Create Price List</Button>
            </Link>
          </CardContent>
        </Card>

        {/* Admin Tools */}
        {user?.role === 'admin' && (
          <Card className="hover:shadow-lg transition-shadow cursor-pointer">
            <CardHeader>
              <CardTitle className="flex items-center">
                <Users className="w-5 h-5 mr-2 text-red-600" />
                Admin Tools
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 mb-4">Manage users and data</p>
              <Link href="/admin">
                <Button className="w-full">Admin Panel</Button>
              </Link>
            </CardContent>
          </Card>
        )}
      </div>

      <div className="mt-8 flex justify-end">
        <Button 
          variant="outline" 
          onClick={() => window.location.href = '/api/logout'}
          className="flex items-center"
        >
          <LogOut className="w-4 h-4 mr-2" />
          Logout
        </Button>
      </div>
    </div>
  );
}
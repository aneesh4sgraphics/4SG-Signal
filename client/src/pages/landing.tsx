import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Calculator, FileText, TrendingUp, Users } from "lucide-react";

export default function Landing() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="container mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center mb-6">
            <div className="w-16 h-16 bg-green-500 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-2xl">4S</span>
            </div>
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4">
            4S Graphics Employee Portal
          </h1>
          <p className="text-xl text-gray-600 mb-8">
            Your Gateway to Fast Quotes & Solutions
          </p>
          <Button 
            size="lg" 
            onClick={() => window.location.href = "/api/login"}
            className="bg-green-600 hover:bg-green-700 text-white px-8 py-3 text-lg"
          >
            Login with Replit
          </Button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-16">
          <Card className="bg-white shadow-lg">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-blue-100 rounded-lg flex items-center justify-center">
                <Calculator className="w-6 h-6 text-blue-600" />
              </div>
              <CardTitle>Quote Calculator</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Generate accurate quotes quickly with our advanced pricing engine
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-green-100 rounded-lg flex items-center justify-center">
                <FileText className="w-6 h-6 text-green-600" />
              </div>
              <CardTitle>Saved Quotes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Access and manage all your saved quotes in one place
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-purple-100 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <CardTitle>Price Lists</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Browse current pricing for all products and services
              </p>
            </CardContent>
          </Card>

          <Card className="bg-white shadow-lg">
            <CardHeader className="text-center">
              <div className="w-12 h-12 mx-auto mb-4 bg-orange-100 rounded-lg flex items-center justify-center">
                <Users className="w-6 h-6 text-orange-600" />
              </div>
              <CardTitle>Customer Tools</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-gray-600 text-sm">
                Manage customer information and purchase history
              </p>
            </CardContent>
          </Card>
        </div>

        <div className="mt-16 text-center">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-2xl mx-auto">
            <h2 className="text-2xl font-bold text-gray-900 mb-4">
              Access Requirements
            </h2>
            <p className="text-gray-600 mb-4">
              This portal is restricted to 4S Graphics employees only.
            </p>
            <div className="text-sm text-gray-500 space-y-2">
              <p>• Must use @4sgraphics.com email address</p>
              <p>• Account requires admin approval</p>
              <p>• Contact aneesh@4sgraphics.com for access</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
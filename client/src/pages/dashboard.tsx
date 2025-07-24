import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, TrendingUp, Users, Database, LogOut, Download, Settings, Shield, Package, Truck, Zap, BarChart3, Target, PieChart, Sparkles, Layers, DollarSign } from "lucide-react";
import { Link } from "wouter";
import { useEffect } from "react";


export default function Dashboard() {
  const { user, isLoading } = useAuth();


  // Automatic logout at midnight
  useEffect(() => {
    const checkMidnight = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setHours(24, 0, 0, 0); // Next midnight
      
      const timeUntilMidnight = midnight.getTime() - now.getTime();
      
      setTimeout(() => {
        // Logout at midnight
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

  // Extract first name from user data and capitalize it
  const firstName = ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + ((user as any)?.firstName || (user as any)?.email?.split('@')[0] || "User").slice(1);
  
  // Get time-based greeting
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return "Good Morning";
    if (hour < 17) return "Good Afternoon";
    return "Good Evening";
  };

  // Daily motivational quotes that change each day
  const dailyMotivationalQuotes = [
    "Success is not final, failure is not fatal: it is the courage to continue that counts.",
    "The only way to do great work is to love what you do.",
    "Innovation distinguishes between a leader and a follower.",
    "Your limitation—it's only your imagination.",
    "Push yourself, because no one else is going to do it for you.",
    "Great things never come from comfort zones.",
    "Dream it. Wish it. Do it.",
    "Success doesn't just find you. You have to go out and get it.",
    "The harder you work for something, the greater you'll feel when you achieve it.",
    "Dream bigger. Do bigger.",
    "Don't stop when you're tired. Stop when you're done.",
    "Wake up with determination. Go to bed with satisfaction.",
    "Do something today that your future self will thank you for.",
    "Little things make big days.",
    "It's going to be hard, but hard does not mean impossible.",
    "Don't wait for opportunity. Create it.",
    "Sometimes we're tested not to show our weaknesses, but to discover our strengths.",
    "The key to success is to focus on goals, not obstacles.",
    "Dream it. Believe it. Build it.",
    "Your potential is endless.",
    "Stay focused and never give up.",
    "Every accomplishment starts with the decision to try.",
    "Be yourself; everyone else is already taken.",
    "Turn your wounds into wisdom.",
    "Believe you can and you're halfway there.",
    "The future belongs to those who believe in the beauty of their dreams.",
    "Success is walking from failure to failure with no loss of enthusiasm.",
    "The only impossible journey is the one you never begin.",
    "In the middle of difficulty lies opportunity.",
    "Be the change you wish to see in the world.",
    "Excellence is not a skill, it's an attitude."
  ];

  // Get daily quote based on day of year
  const getDailyQuote = () => {
    const now = new Date();
    const start = new Date(now.getFullYear(), 0, 0);
    const diff = now.getTime() - start.getTime();
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dailyMotivationalQuotes[dayOfYear % dailyMotivationalQuotes.length];
  };

  return (
      <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{getGreeting()}, {firstName}!</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-3">Select a tool below to get started.</p>
          <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500 p-4 rounded-lg">
            <p className="text-sm font-medium text-gray-700 italic">"{getDailyQuote()}"</p>
          </div>
        </div>

        {/* User Tools - Mobile 2x3 Grid */}
        <div className="mb-8 sm:mb-12">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Applications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">


            {/* ProductPricing Management */}
            <Link href="/product-pricing-management">
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-blue-50 to-indigo-100 border-0 shadow-md h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Database className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-blue-800">ProductPricing Mgmt</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* SqM Calculator */}
            <Link href="/area-pricer">
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-purple-50 to-pink-100 border-0 shadow-md h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-purple-500 to-pink-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Layers className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-purple-800">SqM Calculator</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Saved Quotes */}
            <Link href="/saved-quotes">
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-green-50 to-emerald-100 border-0 shadow-md h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-green-500 to-emerald-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Sparkles className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-green-800">Saved Quotes</CardTitle>
                </CardHeader>
              </Card>
            </Link>



            {/* ComIntel */}
            <Link href="/competitor-pricing">
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-red-50 to-rose-100 border-0 shadow-md h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-red-500 to-rose-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Target className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-red-800">ComIntel</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Shipping Calculator */}
            <Link href="/shipping-calculator">
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-cyan-50 to-sky-100 border-0 shadow-md h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-cyan-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Truck className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-cyan-800">Shipping Calc</CardTitle>
                </CardHeader>
              </Card>
            </Link>

          </div>
        </div>

        {/* Admin Section - Only show for admin users */}
        {(user as any)?.role === 'admin' && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Admin Tools</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
              {/* Admin Panel */}
              <Link href="/admin">
                <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-rose-50 to-red-100 border-0 shadow-md h-full">
                  <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                    <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-rose-500 to-red-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Settings className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-semibold text-red-800">Admin Panel</CardTitle>
                  </CardHeader>
                </Card>
              </Link>

              {/* Customer Management */}
              <Link href="/customer-management">
                <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-blue-50 to-sky-100 border-0 shadow-md h-full">
                  <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                    <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-blue-500 to-sky-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Users className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-semibold text-blue-800">Customer Management</CardTitle>
                  </CardHeader>
                </Card>
              </Link>

              {/* ProductPricing Management */}
              <Link href="/product-pricing-management">
                <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-violet-50 to-purple-100 border-0 shadow-md h-full">
                  <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                    <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-violet-500 to-purple-600 rounded-xl flex items-center justify-center shadow-lg">
                      <Database className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                    </div>
                    <CardTitle className="text-xs sm:text-sm font-semibold text-violet-800">ProductPricing Mgmt</CardTitle>
                  </CardHeader>
                </Card>
              </Link>

              {/* Download Databases */}
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-emerald-50 to-teal-100 border-0 shadow-md h-full" onClick={handleDownloadData}>
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center shadow-lg">
                    <Download className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-emerald-800">Download Data</CardTitle>
                </CardHeader>
              </Card>

              {/* User Management */}
              <Card className="cursor-pointer hover:shadow-xl transition-all duration-300 hover:scale-105 bg-gradient-to-br from-slate-50 to-gray-100 border-0 shadow-md opacity-50 h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-4 sm:pt-4">
                  <div className="w-12 h-12 sm:w-12 sm:h-12 mx-auto mb-2 bg-gradient-to-br from-slate-400 to-gray-500 rounded-xl flex items-center justify-center shadow-lg">
                    <Users className="w-6 h-6 sm:w-6 sm:h-6 text-white" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm font-semibold text-slate-700">User Management</CardTitle>
                </CardHeader>
              </Card>
            </div>
          </div>
        )}
        </div>
      </div>
  );
}
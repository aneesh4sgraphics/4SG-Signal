import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Calculator, FileText, TrendingUp, Users, Database, LogOut, Download, Settings, Shield, Package, Truck } from "lucide-react";
import { Link } from "wouter";
import { useState, useEffect } from "react";
import WelcomeAnimation from "@/components/WelcomeAnimation";

export default function Dashboard() {
  const { user, isLoading } = useAuth();
  const [showWelcome, setShowWelcome] = useState(false);
  const [hasShownWelcome, setHasShownWelcome] = useState(false);
  const [hasShownQuote, setHasShownQuote] = useState(false);

  useEffect(() => {
    if (user && !hasShownWelcome) {
      setShowWelcome(true);
      setHasShownWelcome(true);
      // Mark that we haven't shown the quote yet for this session
      setHasShownQuote(false);
    }
  }, [user, hasShownWelcome]);

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
  const firstName = (user.firstName || user.email?.split('@')[0] || "User")
    .charAt(0).toUpperCase() + (user.firstName || user.email?.split('@')[0] || "User").slice(1);
  
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
    const diff = now - start;
    const dayOfYear = Math.floor(diff / (1000 * 60 * 60 * 24));
    return dailyMotivationalQuotes[dayOfYear % dailyMotivationalQuotes.length];
  };

  return (
    <>
      {showWelcome && (
        <WelcomeAnimation
          userName={firstName}
          user={user}
          onComplete={() => setShowWelcome(false)}
        />
      )}
      
      <div className="px-3 sm:px-6 lg:px-8 py-4 sm:py-8">
        <div className="max-w-7xl mx-auto">
        {/* Welcome Section */}
        <div className="mb-6 sm:mb-8">
          <h2 className="text-xl sm:text-2xl font-bold text-gray-900 mb-2">{getGreeting()}, {firstName}!</h2>
          <p className="text-sm sm:text-base text-gray-600 mb-3">Select a tool below to get started.</p>
          {!hasShownQuote && (
            <div className="bg-gradient-to-r from-blue-50 to-purple-50 border-l-4 border-blue-500 p-4 rounded-lg">
              <p className="text-sm font-medium text-gray-700 italic">"{getDailyQuote()}"</p>
            </div>
          )}
          
          {/* Auto-hide quote after 5 seconds */}
          {!hasShownQuote && (() => {
            setTimeout(() => setHasShownQuote(true), 5000);
            return null;
          })()}
        </div>

        {/* User Tools - Single Row */}
        <div className="mb-8 sm:mb-12">
          <h3 className="text-base sm:text-lg font-semibold text-gray-900 mb-3 sm:mb-4">Applications</h3>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3 sm:gap-4">
            {/* Quote Calculator */}
            <Link href="/quote-calculator">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Calculator className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Quote Calc</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Area Pricer */}
            <Link href="/area-pricer">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-purple-100 rounded-lg flex items-center justify-center">
                    <Calculator className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Area Pricer</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Saved Quotes */}
            <Link href="/saved-quotes">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-green-100 rounded-lg flex items-center justify-center">
                    <FileText className="w-5 h-5 sm:w-6 sm:h-6 text-green-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Saved Quotes</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Price Lists */}
            <Link href="/price-list">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-purple-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-purple-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Price Lists</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Competitor Prices */}
            <Link href="/competitor-pricing">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-orange-100 rounded-lg flex items-center justify-center">
                    <TrendingUp className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Competitor Prices</CardTitle>
                </CardHeader>
              </Card>
            </Link>

            {/* Shipping Calculator */}
            <Link href="/shipping-calculator">
              <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white h-full">
                <CardHeader className="text-center pb-2 sm:pb-3 pt-3 sm:pt-4">
                  <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-2 bg-blue-100 rounded-lg flex items-center justify-center">
                    <Truck className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600" />
                  </div>
                  <CardTitle className="text-xs sm:text-sm">Shipping Calc</CardTitle>
                </CardHeader>
              </Card>
            </Link>

          </div>
        </div>

        {/* Admin Section - Only show for admin users */}
        {user.role === 'admin' && (
          <div className="mb-8">
            <div className="flex items-center gap-2 mb-4">
              <Shield className="w-5 h-5 text-red-600" />
              <h3 className="text-lg font-semibold text-gray-900">Admin Tools</h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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

              {/* Customer Management */}
              <Link href="/customer-management">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-blue-200">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 mx-auto mb-2 bg-blue-100 rounded-lg flex items-center justify-center">
                      <Users className="w-6 h-6 text-blue-600" />
                    </div>
                    <CardTitle className="text-sm text-blue-600">Customer Management</CardTitle>
                  </CardHeader>
                </Card>
              </Link>

              {/* Product Management */}
              <Link href="/product-management">
                <Card className="cursor-pointer hover:shadow-lg transition-shadow duration-200 bg-white border-indigo-200">
                  <CardHeader className="text-center pb-4">
                    <div className="w-12 h-12 mx-auto mb-2 bg-indigo-100 rounded-lg flex items-center justify-center">
                      <Package className="w-6 h-6 text-indigo-600" />
                    </div>
                    <CardTitle className="text-sm text-indigo-600">Product Management</CardTitle>
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
    </>
  );
}
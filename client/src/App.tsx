import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MicroFeedbackProvider } from "@/components/MicroFeedbackProvider";
import { useAuth } from "@/hooks/useAuth";
import { useState, useEffect } from "react";
import AppHeader from "@/components/AppHeader";
import FirecrackerAnimation from "@/components/FirecrackerAnimation";
import AreaPricer from "@/pages/area-pricer-fixed";
import CompetitorPricing from "@/pages/competitor-pricing-fixed";
import SavedQuotes from "@/pages/saved-quotes";
import CustomerManagement from "@/pages/customer-management";
import ProductPricingManagement from "@/pages/product-pricing-management-new";
import QuoteCalculator from "@/pages/quote-calculator";
import PriceList from "@/pages/price-list";
import ShippingCalculator from "@/pages/shipping-calculator";
import Admin from "@/pages/admin";
import Dashboard from "@/pages/dashboard";

import NotFound from "@/pages/not-found";

// Extracted component to avoid JSX duplication
const PendingPage = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="text-center">
      <h1 className="text-2xl font-bold mb-4">Account Pending Approval</h1>
      <p className="text-gray-600 mb-4">
        Your account is waiting for admin approval. Please contact aneesh@4sgraphics.com
      </p>
      <div className="space-x-4">
        <button 
          onClick={() => window.location.reload()}
          className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
        >
          Check Status
        </button>
        <button 
          onClick={() => window.location.href = '/api/logout'}
          className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
        >
          Logout
        </button>
      </div>
    </div>
  </div>
);

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();
  const [showFirecrackers, setShowFirecrackers] = useState(false);
  const [previousAuthState, setPreviousAuthState] = useState(isAuthenticated);

  // Trigger firecracker animation when user successfully logs in
  useEffect(() => {
    if (!previousAuthState && isAuthenticated && user) {
      setShowFirecrackers(true);
      // Auto-hide after 3 seconds
      setTimeout(() => setShowFirecrackers(false), 3000);
    }
    setPreviousAuthState(isAuthenticated);
  }, [isAuthenticated, user, previousAuthState]);

  if (import.meta.env.DEV) {
    console.log("Router render - isAuthenticated:", isAuthenticated, "isLoading:", isLoading, "user:", user);
  }

  // Show loading state while checking authentication
  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-2">Loading...</p>
      </div>
    );
  }

  // Handle unauthenticated users
  if (!isAuthenticated || !user) {
    if (import.meta.env.DEV) {
      console.log("Showing login redirect - isAuthenticated:", isAuthenticated, "user:", user);
    }
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto p-8">
          {/* 4S Graphics Logo */}
          <div className="mb-8">
            <img 
              src="/company-logo.jpg" 
              alt="4S Graphics Logo" 
              className="w-40 h-40 mx-auto object-contain rounded-full shadow-lg border-4 border-white"
            />
          </div>
          
          {/* Company Name and Portal Title */}
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">4S Graphics, Inc</h1>
            <h2 className="text-lg font-normal text-gray-600 mb-4">Employee Portal</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              This portal is exclusively for 4S Graphics employees.<br />
              Please log in to access your tools and resources.
            </p>
          </div>
          
          {/* Login Button */}
          <button 
            onClick={() => window.location.href = "/api/login"}
            className="bg-green-800 hover:bg-green-900 text-white font-medium px-8 py-3 rounded-lg shadow-lg transition-all duration-200 transform hover:scale-105 active:scale-95"
          >
            Login
          </button>
        </div>
      </div>
    );
  }

  if (import.meta.env.DEV) {
    console.log("Showing dashboard - isAuthenticated:", isAuthenticated, "user:", user);
  }

  // Handle pending users
  if ((user as any)?.status === "pending") {
    return (
      <Switch>
        <Route path="/" component={PendingPage} />
        <Route component={PendingPage} />
      </Switch>
    );
  }

  // Handle authenticated users
  return (
    <div className="min-h-screen bg-gray-50">
      <FirecrackerAnimation isVisible={showFirecrackers} />
      <AppHeader />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/area-pricer" component={AreaPricer} />
        <Route path="/competitor-pricing" component={CompetitorPricing} />
        <Route path="/saved-quotes" component={SavedQuotes} />
        <Route path="/customer-management" component={CustomerManagement} />
        <Route path="/product-pricing-management" component={ProductPricingManagement} />
        <Route path="/quote-calculator" component={QuoteCalculator} />
        <Route path="/price-list" component={PriceList} />
        <Route path="/shipping-calculator" component={ShippingCalculator} />
        <Route path="/admin" component={Admin} />
        <Route component={NotFound} />
      </Switch>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <MicroFeedbackProvider>
          <Toaster />
          <Router />
        </MicroFeedbackProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

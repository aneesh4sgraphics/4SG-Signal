import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MicroFeedbackProvider } from "@/components/MicroFeedbackProvider";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import QuoteCalculator from "@/pages/quote-calculator-new";
import AreaPricer from "@/pages/area-pricer-fixed";
import CompetitorPricing from "@/pages/competitor-pricing-fixed";
import SavedQuotes from "@/pages/saved-quotes";
import PriceList from "@/pages/price-list";
import CustomerManagement from "@/pages/customer-management";
import ProductManagement from "@/pages/product-management";
import PriceManagement from "@/pages/price-management";
import PriceManagementSimple from "@/pages/price-management-simple";
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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold mb-4">4S Graphics Employee Portal</h1>
          <p className="text-gray-600 mb-4">Please log in to access your tools</p>
          <button 
            onClick={() => window.location.href = "/api/login"}
            className="bg-blue-500 text-white px-6 py-2 rounded hover:bg-blue-600"
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
      <AppHeader />
      <Switch>
        <Route path="/" component={Dashboard} />
        <Route path="/quick-quotes" component={QuoteCalculator} />
        <Route path="/area-pricer" component={AreaPricer} />
        <Route path="/competitor-pricing" component={CompetitorPricing} />
        <Route path="/saved-quotes" component={SavedQuotes} />
        <Route path="/price-list" component={PriceList} />
        <Route path="/customer-management" component={CustomerManagement} />
        <Route path="/product-management" component={ProductManagement} />
        <Route path="/price-management" component={PriceManagement} />
        <Route path="/price-management-simple" component={PriceManagementSimple} />
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

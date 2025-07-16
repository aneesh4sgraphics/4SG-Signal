import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { useAuth } from "@/hooks/useAuth";
import AppHeader from "@/components/AppHeader";
import QuoteCalculator from "@/pages/quote-calculator";
import AreaPricer from "@/pages/area-pricer";
import CompetitorPricing from "@/pages/competitor-pricing";
import SavedQuotes from "@/pages/saved-quotes";
import PriceList from "@/pages/price-list";
import CustomerManagement from "@/pages/customer-management";
import ProductManagement from "@/pages/product-management";
import ShippingCalculator from "@/pages/shipping-calculator";
import Admin from "@/pages/admin";
import Dashboard from "@/pages/dashboard";
import Landing from "@/pages/landing";
import NotFound from "@/pages/not-found";

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <Switch>
      {!isAuthenticated ? (
        <Route path="/" component={Landing} />
      ) : user?.status === "pending" ? (
        <Route path="/" component={() => (
          <div className="min-h-screen flex items-center justify-center">
            <div className="text-center">
              <h1 className="text-2xl font-bold mb-4">Account Pending Approval</h1>
              <p className="text-gray-600 mb-4">
                Your account is waiting for admin approval. Please contact aneesh@4sgraphics.com
              </p>
              <button 
                onClick={() => window.location.href = "/api/logout"}
                className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                Logout
              </button>
            </div>
          </div>
        )} />
      ) : (
        <div className="min-h-screen bg-gray-50">
          <AppHeader />
          <Switch>
            <Route path="/" component={Dashboard} />
            <Route path="/quote-calculator" component={QuoteCalculator} />
            <Route path="/area-pricer" component={AreaPricer} />
            <Route path="/competitor-pricing" component={CompetitorPricing} />
            <Route path="/saved-quotes" component={SavedQuotes} />
            <Route path="/price-list" component={PriceList} />
            <Route path="/customer-management" component={CustomerManagement} />
            <Route path="/product-management" component={ProductManagement} />
            <Route path="/shipping-calculator" component={ShippingCalculator} />
            <Route path="/admin" component={Admin} />
            <Route component={NotFound} />
          </Switch>
        </div>
      )}
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

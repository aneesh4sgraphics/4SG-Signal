import { Switch, Route, Link, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Calculator, Settings } from "lucide-react";
import QuoteCalculator from "@/pages/quote-calculator";
import Admin from "@/pages/admin";
import NotFound from "@/pages/not-found";

function Router() {
  const [location] = useLocation();
  
  return (
    <div className="min-h-screen bg-background">
      {/* Navigation */}
      <nav className="border-b bg-white/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div className="flex items-center gap-2">
              <Calculator className="h-6 w-6 text-primary" />
              <span className="font-bold text-xl">4S Graphics</span>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/">
                <Button 
                  variant={location === "/" ? "default" : "ghost"}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Calculator className="h-4 w-4" />
                  Quote Calculator
                </Button>
              </Link>
              <Link href="/admin">
                <Button 
                  variant={location === "/admin" ? "default" : "ghost"}
                  size="sm"
                  className="flex items-center gap-2"
                >
                  <Settings className="h-4 w-4" />
                  Admin
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <Switch>
        <Route path="/" component={QuoteCalculator} />
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
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;

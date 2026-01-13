import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MicroFeedbackProvider } from "@/components/MicroFeedbackProvider";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";
import { ShopifyAppBridgeProvider } from "@/components/ShopifyAppBridgeProvider";
import { ServiceWorkerUpdater } from "@/components/ServiceWorkerUpdater";
import { AuthWatcher } from "@/components/AuthWatcher";
import { EmailComposerProvider } from "@/components/email-composer";
import OdooLayout from "@/components/OdooLayout";
import AreaPricer from "@/pages/area-pricer-fixed";
import CompetitorPricing from "@/pages/competitor-pricing-fixed";
import SavedQuotes from "@/pages/saved-quotes";
import CustomerManagement from "@/pages/customer-management";
import CustomerTable from "@/pages/customer-table";
import ClientDatabase from "@/pages/client-database";
import ProductPricingManagement from "@/pages/product-pricing-management-new";
import QuoteCalculator from "@/pages/quote-calculator";
import PriceList from "@/pages/price-list";
import ShippingCalculator from "@/pages/shipping-calculator";
import Admin from "@/pages/admin";
import AdminConfig from "@/pages/admin-config";
import ActivityLogsPage from "@/pages/activity-logs";
import PdfCategoryAdmin from "@/pages/pdf-category-admin";
import Dashboard from "@/pages/dashboard-odoo";
import ShippingLabels from "@/pages/shipping-labels";
import ProductLabels from "@/pages/product-labels";
import CRMJourneyDashboard from "@/pages/crm-journey";
import EmailApp from "@/pages/email-app";
import ObjectionsPage from "@/pages/objections";
import ShopifySettingsPage from "@/pages/shopify-settings";
import OdooSettingsPage from "@/pages/odoo-settings";
import IntegrationsSettingsPage from "@/pages/integrations-settings";
import ProductMappingPage from "@/pages/product-mapping";
import SalesAnalyticsPage from "@/pages/sales-analytics";
import ReportsPage from "@/pages/reports";
import GmailInsightsPage from "@/pages/gmail-insights";
import EmailSyncDebug from "@/pages/email-sync-debug";
import NowMode from "@/pages/now-mode";
import NowModeAdmin from "@/pages/now-mode-admin";
import CalendarPage from "@/pages/calendar";

import NotFound from "@/pages/not-found";
import logoPath from "@assets/4s logo Clean 150x_1753410902611.png";

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

const AppRoutes = () => (
  <Switch>
    <Route path="/" component={Dashboard} />
    <Route path="/quick-quotes" component={QuoteCalculator} />
    <Route path="/quote-calculator" component={QuoteCalculator} />
    <Route path="/price-list" component={PriceList} />
    <Route path="/area-pricer" component={AreaPricer} />
    <Route path="/competitor-pricing" component={CompetitorPricing} />
    <Route path="/saved-quotes" component={SavedQuotes} />
    <Route path="/clients" component={ClientDatabase} />
    <Route path="/clients/:id" component={ClientDatabase} />
    <Route path="/customer-management" component={CustomerManagement} />
    <Route path="/customer-table" component={CustomerTable} />
    <Route path="/customers" component={ClientDatabase} />
    <Route path="/product-pricing-management" component={ProductPricingManagement} />
    <Route path="/activity-logs" component={ActivityLogsPage} />
    <Route path="/shipping-calculator" component={ShippingCalculator} />
    <Route path="/admin" component={Admin} />
    <Route path="/admin/config" component={AdminConfig} />
    <Route path="/pdf-settings" component={PdfCategoryAdmin} />
    <Route path="/shipping-labels" component={ShippingLabels} />
    <Route path="/product-labels" component={ProductLabels} />
    <Route path="/crm-journey" component={CRMJourneyDashboard} />
    <Route path="/email-app" component={EmailApp} />
    <Route path="/email-insights" component={GmailInsightsPage} />
    <Route path="/email-sync-debug" component={EmailSyncDebug} />
    <Route path="/objections" component={ObjectionsPage} />
    <Route path="/shopify-settings" component={ShopifySettingsPage} />
    <Route path="/odoo-settings" component={OdooSettingsPage} />
    <Route path="/integrations" component={IntegrationsSettingsPage} />
    <Route path="/product-mapping" component={ProductMappingPage} />
    <Route path="/sales-analytics" component={SalesAnalyticsPage} />
    <Route path="/reports" component={ReportsPage} />
    <Route path="/now-mode" component={NowMode} />
    <Route path="/now-mode-admin" component={NowModeAdmin} />
    <Route path="/calendar" component={CalendarPage} />
    <Route><Redirect to="/" /></Route>
  </Switch>
);

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("Router render - isAuthenticated:", isAuthenticated, "isLoading:", isLoading, "user:", user);
    }
  }, [isAuthenticated, isLoading, user]);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
        <p className="ml-2">Loading...</p>
      </div>
    );
  }

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-50 to-gray-100">
        <div className="text-center max-w-md mx-auto p-8">
          <div className="mb-8">
            <img src={logoPath} alt="4S Graphics Logo" className="w-40 h-40 mx-auto object-contain" />
          </div>
          <div className="mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">4S Graphics, Inc</h1>
            <h2 className="text-lg font-normal text-gray-600 mb-4">Employee Portal</h2>
            <p className="text-sm text-gray-500 leading-relaxed">
              This portal is exclusively for 4S Graphics employees.<br />
              Please log in to access your tools and resources.
            </p>
          </div>
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

  if ((user as any)?.status === "pending") {
    return (
      <Switch>
        <Route path="/" component={PendingPage} />
        <Route component={PendingPage} />
      </Switch>
    );
  }

  return (
    <OdooLayout>
      <AppRoutes />
    </OdooLayout>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ShopifyAppBridgeProvider>
        <TooltipProvider>
          <EmailComposerProvider>
            <MicroFeedbackProvider>
              <Toaster />
              <AuthWatcher />
              <Router />
              <ServiceWorkerUpdater />
            </MicroFeedbackProvider>
          </EmailComposerProvider>
        </TooltipProvider>
      </ShopifyAppBridgeProvider>
    </QueryClientProvider>
  );
}

export default App;

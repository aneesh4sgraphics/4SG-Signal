import { Switch, Route, Redirect } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MicroFeedbackProvider } from "@/components/MicroFeedbackProvider";
import { useAuth } from "@/hooks/useAuth";
import { lazy, Suspense, useEffect, Component, ErrorInfo, ReactNode } from "react";
import { ShopifyAppBridgeProvider } from "@/components/ShopifyAppBridgeProvider";
import { ServiceWorkerUpdater } from "@/components/ServiceWorkerUpdater";
import { AuthWatcher } from "@/components/AuthWatcher";
import { EmailComposerProvider } from "@/components/email-composer";
import { LabelQueueProvider, LabelQueueIndicator } from "@/components/PrintLabelButton";
import OdooLayout from "@/components/OdooLayout";
import logoPath from "@assets/4s logo Clean 150x_1753410902611.png";

const Spotlight = lazy(() => import("@/pages/spotlight"));
const Dashboard = lazy(() => import("@/pages/dashboard-odoo"));
const QuoteCalculator = lazy(() => import("@/pages/quote-calculator"));
const PriceList = lazy(() => import("@/pages/price-list"));
const AreaPricer = lazy(() => import("@/pages/area-pricer-fixed"));
const CompetitorPricing = lazy(() => import("@/pages/competitor-pricing-fixed"));
const SavedQuotes = lazy(() => import("@/pages/saved-quotes"));
const CustomerManagement = lazy(() => import("@/pages/customer-management"));
const CustomerTable = lazy(() => import("@/pages/customer-table"));
const ProductPricingManagement = lazy(() => import("@/pages/product-pricing-management-new"));
const ShippingCalculator = lazy(() => import("@/pages/shipping-calculator"));
const Admin = lazy(() => import("@/pages/admin"));
const AdminConfig = lazy(() => import("@/pages/admin-config"));
const SetupWizard = lazy(() => import("@/pages/setup-wizard"));
const ActivityLogsPage = lazy(() => import("@/pages/activity-logs"));
const PdfCategoryAdmin = lazy(() => import("@/pages/pdf-category-admin"));
const ShippingLabels = lazy(() => import("@/pages/shipping-labels"));
const ProductLabels = lazy(() => import("@/pages/product-labels"));
const CRMJourneyDashboard = lazy(() => import("@/pages/crm-journey"));
const EmailApp = lazy(() => import("@/pages/email-app"));
const ObjectionsPage = lazy(() => import("@/pages/objections"));
const ShopifySettingsPage = lazy(() => import("@/pages/shopify-settings"));
const OdooSettingsPage = lazy(() => import("@/pages/odoo-settings"));
const IntegrationsSettingsPage = lazy(() => import("@/pages/integrations-settings"));
const ProductMappingPage = lazy(() => import("@/pages/product-mapping"));
const SalesAnalyticsPage = lazy(() => import("@/pages/sales-analytics"));
const ReportsPage = lazy(() => import("@/pages/reports"));
const CostDashboard = lazy(() => import("@/pages/cost-dashboard"));
const EmailSyncDebug = lazy(() => import("@/pages/email-sync-debug"));
const CalendarPage = lazy(() => import("@/pages/calendar"));
const TaskInbox = lazy(() => import("@/pages/task-inbox"));
const HotLeads = lazy(() => import("@/pages/hot-leads"));
const OdooContacts = lazy(() => import("@/pages/odoo-contacts"));
const OdooCompanyDetail = lazy(() => import("@/pages/odoo-company-detail"));
const OdooProducts = lazy(() => import("@/pages/odoo-products"));
const OdooProductDetail = lazy(() => import("@/pages/odoo-product-detail"));
const LeadsPage = lazy(() => import("@/pages/leads"));
const LeadDetail = lazy(() => import("@/pages/lead-detail"));
const BounceInvestigation = lazy(() => import("@/pages/bounce-investigation"));
const OpportunitiesPage = lazy(() => import("@/pages/opportunities"));
const CustomerMarginsPage = lazy(() => import("@/pages/customer-margins"));
const SpotlightOverview = lazy(() => import("@/pages/SpotlightOverview"));

const PageLoader = () => (
  <div className="flex items-center justify-center py-20">
    <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-purple-600"></div>
  </div>
);

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

class PageErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean; error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[PageErrorBoundary] Render error caught:', error, info.componentStack);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen bg-[#FDFBF7]">
          <div className="text-center p-8 max-w-md">
            <div className="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center mx-auto mb-4">
              <span className="text-red-500 text-xl">!</span>
            </div>
            <h2 className="text-xl font-semibold text-slate-800 mb-2">Something went wrong</h2>
            <p className="text-slate-500 mb-6 text-sm">
              This page ran into an error. This has been logged. Try reloading or going back.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.history.back()}
                className="px-4 py-2 text-sm border border-slate-300 rounded-md text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Go Back
              </button>
              <button
                onClick={() => { this.setState({ hasError: false, error: null }); window.location.reload(); }}
                className="px-4 py-2 text-sm bg-slate-800 text-white rounded-md hover:bg-slate-700 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const AppRoutes = () => (
  <PageErrorBoundary>
  <Suspense fallback={<PageLoader />}>
    <Switch>
      <Route path="/" component={Spotlight} />
      <Route path="/dashboard" component={Dashboard} />
      <Route path="/quick-quotes" component={QuoteCalculator} />
      <Route path="/quote-calculator" component={QuoteCalculator} />
      <Route path="/price-list" component={PriceList} />
      <Route path="/area-pricer" component={AreaPricer} />
      <Route path="/competitor-pricing" component={CompetitorPricing} />
      <Route path="/saved-quotes" component={SavedQuotes} />
      <Route path="/customer-management" component={CustomerManagement} />
      <Route path="/customer-table" component={CustomerTable} />
      <Route path="/product-pricing-management" component={ProductPricingManagement} />
      <Route path="/activity-logs" component={ActivityLogsPage} />
      <Route path="/shipping-calculator" component={ShippingCalculator} />
      <Route path="/admin" component={Admin} />
      <Route path="/admin/config" component={AdminConfig} />
      <Route path="/admin/setup" component={SetupWizard} />
      <Route path="/pdf-settings" component={PdfCategoryAdmin} />
      <Route path="/shipping-labels" component={ShippingLabels} />
      <Route path="/product-labels" component={ProductLabels} />
      <Route path="/crm-journey" component={CRMJourneyDashboard} />
      <Route path="/email-app" component={EmailApp} />
      <Route path="/email-insights" component={Spotlight} />
      <Route path="/email-sync-debug" component={EmailSyncDebug} />
      <Route path="/objections" component={ObjectionsPage} />
      <Route path="/shopify-settings" component={ShopifySettingsPage} />
      <Route path="/odoo-settings" component={OdooSettingsPage} />
      <Route path="/integrations" component={IntegrationsSettingsPage} />
      <Route path="/product-mapping" component={ProductMappingPage} />
      <Route path="/sales-analytics" component={SalesAnalyticsPage} />
      <Route path="/reports" component={ReportsPage} />
      <Route path="/admin/costs" component={CostDashboard} />
      <Route path="/spotlight"><Redirect to="/" /></Route>
      <Route path="/calendar" component={CalendarPage} />
      <Route path="/tasks" component={TaskInbox} />
      <Route path="/hot-leads" component={HotLeads} />
      <Route path="/leads" component={LeadsPage} />
      <Route path="/leads/:id" component={LeadDetail} />
      <Route path="/opportunities" component={OpportunitiesPage} />
      <Route path="/customer-margins" component={CustomerMarginsPage} />
      <Route path="/bounce-investigation/:bounceId" component={BounceInvestigation} />
      <Route path="/odoo-contacts" component={OdooContacts} />
      <Route path="/odoo-contacts/:id" component={OdooCompanyDetail} />
      <Route path="/odoo-products" component={OdooProducts} />
      <Route path="/odoo-products/:id" component={OdooProductDetail} />
      <Route path="/spotlight-overview" component={SpotlightOverview} />
      <Route><Redirect to="/" /></Route>
    </Switch>
  </Suspense>
  </PageErrorBoundary>
);

function Router() {
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (import.meta.env.DEV) {
      console.log("Router render - isAuthenticated:", isAuthenticated, "isLoading:", isLoading, "user:", user);
    }
  }, [isAuthenticated, isLoading, user]);

  // Prefetch Spotlight data immediately on login so the page loads instantly
  useEffect(() => {
    if (!isAuthenticated || !user || (user as any)?.status === 'pending') return;
    // Fire warmup and current task fetch in parallel — results land in the cache
    // so when the user opens Spotlight the data is already there
    queryClient.prefetchQuery({ queryKey: ['/api/spotlight/warmup'], staleTime: 2 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ['/api/spotlight/current', undefined, undefined], staleTime: 2 * 60 * 1000 });
    queryClient.prefetchQuery({ queryKey: ['/api/sales-reps'], staleTime: 30 * 60 * 1000 });
  }, [isAuthenticated, user]);

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
            <LabelQueueProvider>
              <MicroFeedbackProvider>
                <Toaster />
                <AuthWatcher />
                <Router />
                <LabelQueueIndicator />
                <ServiceWorkerUpdater />
              </MicroFeedbackProvider>
            </LabelQueueProvider>
          </EmailComposerProvider>
        </TooltipProvider>
      </ShopifyAppBridgeProvider>
    </QueryClientProvider>
  );
}

export default App;

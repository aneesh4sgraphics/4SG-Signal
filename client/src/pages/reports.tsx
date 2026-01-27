import { useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/useAuth";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign,
  FileText,
  ArrowLeft,
  RefreshCw,
  Scale,
  AlertTriangle,
  Package,
  Banknote,
  Clock,
  Users,
  Lightbulb,
  PiggyBank,
  Calculator,
  Calendar
} from "lucide-react";
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  Legend, 
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area
} from "recharts";
import { DataFreshness, type ReportMeta } from "@/components/DataFreshness";

interface ReportMetaWrapper {
  _meta?: ReportMeta;
}

interface InvoiceData extends ReportMetaWrapper {
  success: boolean;
  year: number;
  grandTotal: number;
  grandUntaxed: number;
  invoiceCount: number;
  chartData: Array<{
    month: string;
    total: number;
    untaxed: number;
    count: number;
  }>;
  waitingToInvoice?: {
    count: number;
    amount: number;
  };
}

interface InventoryTurnoverData extends ReportMetaWrapper {
  success: boolean;
  year: number;
  cogs: number;
  currentInventoryValue: number;
  currentInventoryQty: number;
  productsWithStock: number;
  inventoryTurnover: number;
  daysToSellInventory: number | null;
  hasData: boolean;
}

interface GrossProfitData extends ReportMetaWrapper {
  success: boolean;
  year: number;
  totals: {
    revenue: number;
    cogs: number;
    grossProfit: number;
    grossMarginPercent: number;
  };
  chartData: Array<{
    month: string;
    revenue: number;
    cogs: number;
    profit: number;
    margin: number;
  }>;
}

interface DebtEquityData extends ReportMetaWrapper {
  success: boolean;
  year: number;
  totalDebt: number;
  totalEquity: number;
  debtToEquityRatio: number | null;
  hasData: boolean;
}

interface BadDebtData extends ReportMetaWrapper {
  success: boolean;
  totalReceivables: number;
  totalOverdue: number;
  badDebtRatio: number;
  collectionScore: number;
  agingBuckets: {
    current: number;
    days1_30: number;
    days31_60: number;
    days61_90: number;
    days90Plus: number;
  };
  topOverdueCustomers: Array<{
    id: number;
    name: string;
    amountDue: number;
    oldestDueDate: string;
    daysOverdue: number;
    invoiceCount: number;
  }>;
  collectionTips: string[];
  invoiceCount: number;
  hasData: boolean;
}

interface InvestorReturnsData extends ReportMetaWrapper {
  success: boolean;
  initialInvestment: number;
  currentValue: number;
  totalEquity: number;
  lifetimeRevenue: number;
  lifetimeGrossProfit: number;
  lifetimeCogs: number;
  lifetimeExpenses: number;
  lifetimeNetIncome: number;
  roi: number;
  moic: number;
  annualizedRoi: number;
  yearsInBusiness: number;
  companyStartDate: string;
  yearlyData: Array<{
    year: number;
    revenue: number;
    profit: number;
    cumulativeProfit: number;
  }>;
  hasData: boolean;
}

export default function ReportsPage() {
  const { user, isLoading: authLoading } = useAuth();
  const [, setLocation] = useLocation();
  
  const isAdmin = (user as any)?.role === 'admin';
  
  // All hooks must be called before any conditional returns (Rules of Hooks)
  const { data: invoiceData, isLoading: invoiceLoading, refetch: refetchInvoices } = useQuery<InvoiceData>({
    queryKey: ['/api/reports/invoices-2026'],
    enabled: isAdmin, // Only fetch if admin
  });

  const { data: inventoryData, isLoading: inventoryLoading, refetch: refetchInventory } = useQuery<InventoryTurnoverData>({
    queryKey: ['/api/reports/inventory-turnover-2026'],
    enabled: isAdmin,
  });

  const { data: grossProfitData, isLoading: profitLoading, refetch: refetchProfit } = useQuery<GrossProfitData>({
    queryKey: ['/api/reports/gross-profit-2026'],
    enabled: isAdmin,
  });

  const { data: debtEquityData, isLoading: debtLoading, refetch: refetchDebtEquity } = useQuery<DebtEquityData>({
    queryKey: ['/api/reports/debt-equity-2026'],
    enabled: isAdmin,
  });

  const { data: badDebtData, isLoading: badDebtLoading, refetch: refetchBadDebt } = useQuery<BadDebtData>({
    queryKey: ['/api/reports/bad-debt-2026'],
    enabled: isAdmin,
  });

  // State for initial investment input
  const [initialInvestment, setInitialInvestment] = useState(100000);
  const [investmentInput, setInvestmentInput] = useState('100000');

  const { data: investorData, isLoading: investorLoading, refetch: refetchInvestor } = useQuery<InvestorReturnsData>({
    queryKey: ['/api/reports/investor-returns', { initialInvestment }],
    queryFn: async () => {
      const res = await fetch(`/api/reports/investor-returns?initialInvestment=${initialInvestment}`);
      if (!res.ok) throw new Error('Failed to fetch investor returns');
      return res.json();
    },
    enabled: isAdmin,
  });
  
  // Redirect non-admin users
  useEffect(() => {
    if (!authLoading && !isAdmin) {
      setLocation('/');
    }
  }, [authLoading, isAdmin, setLocation]);
  
  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }
  
  // Don't render for non-admin (will redirect)
  if (!isAdmin) {
    return null;
  }

  const formatCurrency = (value: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
  };

  const formatNumber = (value: number) => {
    return new Intl.NumberFormat('en-CA').format(value);
  };

  const handleRefreshAll = () => {
    refetchInvoices();
    refetchInventory();
    refetchProfit();
    refetchDebtEquity();
    refetchBadDebt();
    refetchInvestor();
  };

  const handleInvestmentUpdate = () => {
    const value = parseFloat(investmentInput);
    if (!isNaN(value) && value > 0) {
      setInitialInvestment(value);
    }
  };
  
  // Get inventory health indicator
  const getInventoryHealth = () => {
    if (!inventoryData) return { status: 'unknown', color: 'gray' };
    const turnover = inventoryData.inventoryTurnover;
    
    if (turnover >= 6) return { status: 'Excellent', color: 'green' };
    if (turnover >= 4) return { status: 'Good', color: 'blue' };
    if (turnover >= 2) return { status: 'Fair', color: 'amber' };
    return { status: 'Low', color: 'red' };
  };

  const CustomTooltipCurrency = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-3">
          <p className="font-medium mb-2">{label}</p>
          {payload.map((entry: any, index: number) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <div 
                className="w-3 h-3 rounded-full" 
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-muted-foreground">{entry.name}:</span>
              <span className="font-medium">{formatCurrency(entry.value)}</span>
            </div>
          ))}
        </div>
      );
    }
    return null;
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Button variant="ghost" size="sm">
                <ArrowLeft className="h-4 w-4 mr-2" />
                Dashboard
              </Button>
            </Link>
            <div>
              <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
                <BarChart3 className="h-6 w-6 text-purple-600" />
                2026 Reports
              </h1>
              <p className="text-sm text-muted-foreground">
                Financial metrics and sales performance for 2026
              </p>
            </div>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleRefreshAll}
            disabled={invoiceLoading || inventoryLoading || profitLoading || debtLoading || badDebtLoading || investorLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(invoiceLoading || inventoryLoading || profitLoading || debtLoading || badDebtLoading || investorLoading) ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Total Invoices 2026 */}
          <Card className="col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-blue-600" />
                    Total Invoices 2026
                  </CardTitle>
                  <CardDescription>Posted invoice totals by month</CardDescription>
                  {invoiceData?._meta && <DataFreshness meta={invoiceData._meta} />}
                </div>
                {invoiceData && (
                  <Badge variant="secondary" className="text-lg px-3 py-1">
                    {formatCurrency(invoiceData.grandTotal)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {invoiceLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : invoiceData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Invoices</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {formatNumber(invoiceData.invoiceCount)}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Net (Untaxed)</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(invoiceData.grandUntaxed)}
                      </p>
                    </div>
                    {invoiceData.waitingToInvoice && invoiceData.waitingToInvoice.count > 0 && (
                      <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                        <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Waiting to Invoice</p>
                        <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                          {formatNumber(invoiceData.waitingToInvoice.count)}
                        </p>
                        <p className="text-xs text-amber-600 dark:text-amber-400">
                          {formatCurrency(invoiceData.waitingToInvoice.amount)}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invoiceData.chartData.map((d, idx) => ({
                        ...d,
                        waitingToInvoice: idx === 0 ? (invoiceData.waitingToInvoice?.amount || 0) : 0
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis 
                          fontSize={12} 
                          tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip content={<CustomTooltipCurrency />} />
                        <Legend />
                        <Bar dataKey="total" name="Invoiced" stackId="a" fill="#3b82f6" />
                        <Bar dataKey="waitingToInvoice" name="Waiting to Invoice" stackId="a" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No invoice data available</p>
              )}
            </CardContent>
          </Card>

          {/* Inventory Turnover */}
          <Card className="col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5 text-purple-600" />
                    Inventory Turnover
                  </CardTitle>
                  <CardDescription>How efficiently inventory is sold and replaced</CardDescription>
                  {inventoryData?._meta && <DataFreshness meta={inventoryData._meta} />}
                </div>
                {inventoryData && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={getInventoryHealth().color === 'green' ? "default" : "secondary"}
                      className="text-lg px-3 py-1"
                    >
                      {inventoryData.inventoryTurnover}x
                    </Badge>
                    <span className={`text-xs font-medium ${
                      getInventoryHealth().color === 'green' ? 'text-green-600' :
                      getInventoryHealth().color === 'blue' ? 'text-blue-600' :
                      getInventoryHealth().color === 'amber' ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {getInventoryHealth().status}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {inventoryLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : inventoryData && inventoryData.hasData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Cost of Goods Sold (2026)</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {formatCurrency(inventoryData.cogs)}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Current Inventory Value</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                        {formatCurrency(inventoryData.currentInventoryValue)}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Turnover Ratio</p>
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {inventoryData.inventoryTurnover}x
                      </p>
                      <p className="text-xs text-purple-600">per year</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-center">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Days to Sell</p>
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {inventoryData.daysToSellInventory ?? 'N/A'}
                      </p>
                      <p className="text-xs text-amber-600">avg days</p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-950 rounded-lg text-center">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Products in Stock</p>
                      <p className="text-2xl font-bold text-gray-700 dark:text-gray-300">
                        {formatNumber(inventoryData.productsWithStock)}
                      </p>
                      <p className="text-xs text-gray-600">{formatNumber(inventoryData.currentInventoryQty)} units</p>
                    </div>
                  </div>
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-900 rounded-lg">
                    <p className="text-sm text-muted-foreground">
                      <strong>What this means:</strong>{' '}
                      {inventoryData.inventoryTurnover > 0 && inventoryData.daysToSellInventory ? (
                        <>
                          Your inventory turns over {inventoryData.inventoryTurnover} times per year, 
                          meaning it takes approximately {inventoryData.daysToSellInventory} days on average to sell through your stock.
                          {inventoryData.inventoryTurnover >= 6 && ' This is excellent inventory efficiency.'}
                          {inventoryData.inventoryTurnover >= 4 && inventoryData.inventoryTurnover < 6 && ' This is good inventory management.'}
                          {inventoryData.inventoryTurnover >= 2 && inventoryData.inventoryTurnover < 4 && ' Consider strategies to move inventory faster.'}
                          {inventoryData.inventoryTurnover < 2 && ' You may have excess inventory. Consider promotions or reducing stock levels.'}
                        </>
                      ) : (
                        <>Turnover ratio cannot be calculated when inventory value is zero or no COGS data is available.</>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No inventory data available</p>
              )}
            </CardContent>
          </Card>

          {/* Gross Profit - COGS vs Sales */}
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <DollarSign className="h-5 w-5 text-green-600" />
                    Gross Profit (COGS vs Sales)
                  </CardTitle>
                  <CardDescription>Revenue, cost of goods sold, and profit margins by month</CardDescription>
                  {grossProfitData?._meta && <DataFreshness meta={grossProfitData._meta} />}
                </div>
                {grossProfitData && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={grossProfitData.totals.grossMarginPercent >= 30 ? "default" : "secondary"}
                      className="text-lg px-3 py-1"
                    >
                      {grossProfitData.totals.grossMarginPercent}% Margin
                    </Badge>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {profitLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-full" />
                  <Skeleton className="h-80 w-full" />
                </div>
              ) : grossProfitData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Revenue</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {formatCurrency(grossProfitData.totals.revenue)}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">Total COGS</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-300">
                        {formatCurrency(grossProfitData.totals.cogs)}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Gross Profit</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(grossProfitData.totals.grossProfit)}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Gross Margin</p>
                      <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                        {grossProfitData.totals.grossMarginPercent}%
                      </p>
                    </div>
                  </div>
                  <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={grossProfitData.chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis 
                          yAxisId="left"
                          fontSize={12} 
                          tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          fontSize={12}
                          tickFormatter={(val) => `${val}%`}
                          domain={[0, 100]}
                        />
                        <Tooltip content={({ active, payload, label }: any) => {
                          if (active && payload && payload.length) {
                            return (
                              <div className="bg-white dark:bg-gray-800 border rounded-lg shadow-lg p-3">
                                <p className="font-medium mb-2">{label}</p>
                                {payload.map((entry: any, index: number) => (
                                  <div key={index} className="flex items-center gap-2 text-sm">
                                    <div 
                                      className="w-3 h-3 rounded-full" 
                                      style={{ backgroundColor: entry.color }}
                                    />
                                    <span className="text-muted-foreground">{entry.name}:</span>
                                    <span className="font-medium">
                                      {entry.name === 'Margin %' ? `${entry.value}%` : formatCurrency(entry.value)}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            );
                          }
                          return null;
                        }} />
                        <Legend />
                        <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="cogs" name="COGS" fill="#ef4444" radius={[4, 4, 0, 0]} />
                        <Area yAxisId="left" type="monotone" dataKey="profit" name="Profit" fill="#22c55e" fillOpacity={0.3} stroke="#22c55e" />
                        <Line yAxisId="right" type="monotone" dataKey="margin" name="Margin %" stroke="#9333ea" strokeWidth={2} dot={{ r: 4 }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No gross profit data available</p>
              )}
            </CardContent>
          </Card>

          {/* Debt to Equity Ratio */}
          <Card className="col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Scale className="h-5 w-5 text-indigo-600" />
                    Debt to Equity Ratio
                  </CardTitle>
                  <CardDescription>Total liabilities vs. shareholders' equity</CardDescription>
                  {debtEquityData?._meta && <DataFreshness meta={debtEquityData._meta} />}
                </div>
                {debtEquityData?.hasData && debtEquityData.debtToEquityRatio !== null && (
                  <Badge 
                    variant={debtEquityData.debtToEquityRatio <= 2 ? "default" : "destructive"}
                    className="text-lg px-3 py-1"
                  >
                    {debtEquityData.debtToEquityRatio.toFixed(2)}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {debtLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-32 w-full" />
                </div>
              ) : debtEquityData?.hasData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">Total Debt</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-300">
                        {formatCurrency(debtEquityData.totalDebt)}
                      </p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Total Equity</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(debtEquityData.totalEquity)}
                      </p>
                    </div>
                    <div className="p-3 bg-indigo-50 dark:bg-indigo-950 rounded-lg">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium">D/E Ratio</p>
                      <p className="text-xl font-bold text-indigo-700 dark:text-indigo-300">
                        {debtEquityData.debtToEquityRatio !== null 
                          ? debtEquityData.debtToEquityRatio.toFixed(2)
                          : 'N/A'}
                      </p>
                    </div>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    <p className="flex items-center gap-2">
                      {debtEquityData.debtToEquityRatio !== null && debtEquityData.debtToEquityRatio <= 1 ? (
                        <>
                          <span className="text-green-600">Low leverage</span> - More equity than debt
                        </>
                      ) : debtEquityData.debtToEquityRatio !== null && debtEquityData.debtToEquityRatio <= 2 ? (
                        <>
                          <span className="text-amber-600">Moderate leverage</span> - Balanced debt/equity mix
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-500" />
                          <span className="text-red-600">High leverage</span> - Consider reducing debt
                        </>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    {debtEquityData?.success === false 
                      ? "Unable to fetch accounting data from Odoo"
                      : "No accounting data available for 2026"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Bad Debt & Collections */}
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <Banknote className="h-5 w-5 text-orange-600" />
                    Bad Debt & Collections
                  </CardTitle>
                  <CardDescription>Receivables aging and collection health</CardDescription>
                  {badDebtData?._meta && <DataFreshness meta={badDebtData._meta} />}
                </div>
                {badDebtData?.hasData && (
                  <div className="flex items-center gap-2">
                    <Badge 
                      variant={badDebtData.collectionScore >= 80 ? "default" : badDebtData.collectionScore >= 60 ? "secondary" : "destructive"}
                      className="text-lg px-3 py-1"
                    >
                      Score: {badDebtData.collectionScore}
                    </Badge>
                    <span className={`text-xs font-medium ${
                      badDebtData.collectionScore >= 80 ? 'text-green-600' :
                      badDebtData.collectionScore >= 60 ? 'text-amber-600' : 'text-red-600'
                    }`}>
                      {badDebtData.collectionScore >= 80 ? 'Healthy' : badDebtData.collectionScore >= 60 ? 'Needs Attention' : 'Critical'}
                    </span>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {badDebtLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : badDebtData?.hasData ? (
                <div className="space-y-6">
                  {/* Summary metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-blue-50 dark:bg-blue-950 rounded-lg">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium">Total Receivables</p>
                      <p className="text-xl font-bold text-blue-700 dark:text-blue-300">
                        {formatCurrency(badDebtData.totalReceivables)}
                      </p>
                      <p className="text-xs text-blue-600">{badDebtData.invoiceCount} open invoices</p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Total Overdue</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                        {formatCurrency(badDebtData.totalOverdue)}
                      </p>
                      <p className="text-xs text-amber-600">
                        {badDebtData.totalReceivables > 0 
                          ? `${Math.round(badDebtData.totalOverdue / badDebtData.totalReceivables * 100)}% of receivables`
                          : '0%'}
                      </p>
                    </div>
                    <div className="p-3 bg-red-50 dark:bg-red-950 rounded-lg">
                      <p className="text-xs text-red-600 dark:text-red-400 font-medium">Bad Debt Ratio</p>
                      <p className="text-xl font-bold text-red-700 dark:text-red-300">
                        {badDebtData.badDebtRatio}%
                      </p>
                      <p className="text-xs text-red-600">90+ days overdue</p>
                    </div>
                    <div className="p-3 bg-green-50 dark:bg-green-950 rounded-lg">
                      <p className="text-xs text-green-600 dark:text-green-400 font-medium">Current (Not Due)</p>
                      <p className="text-xl font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(badDebtData.agingBuckets.current)}
                      </p>
                      <p className="text-xs text-green-600">On-time payments</p>
                    </div>
                  </div>

                  {/* Aging Buckets Chart */}
                  <div>
                    <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                      <Clock className="h-4 w-4" />
                      Aging Breakdown
                    </h4>
                    <div className="h-48">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={[
                          { name: 'Current', value: badDebtData.agingBuckets.current, fill: '#22c55e' },
                          { name: '1-30 Days', value: badDebtData.agingBuckets.days1_30, fill: '#eab308' },
                          { name: '31-60 Days', value: badDebtData.agingBuckets.days31_60, fill: '#f97316' },
                          { name: '61-90 Days', value: badDebtData.agingBuckets.days61_90, fill: '#ef4444' },
                          { name: '90+ Days', value: badDebtData.agingBuckets.days90Plus, fill: '#7f1d1d' },
                        ]} layout="vertical">
                          <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                          <XAxis type="number" tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`} fontSize={12} />
                          <YAxis type="category" dataKey="name" width={80} fontSize={12} />
                          <Tooltip 
                            formatter={(value: number) => formatCurrency(value)}
                            contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
                          />
                          <Bar dataKey="value" radius={[0, 4, 4, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Top Overdue Customers */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Users className="h-4 w-4" />
                        Top Overdue Accounts
                      </h4>
                      {badDebtData.topOverdueCustomers.length > 0 ? (
                        <div className="space-y-2 max-h-48 overflow-y-auto">
                          {badDebtData.topOverdueCustomers.slice(0, 5).map((customer, idx) => (
                            <div key={customer.id} className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-800 rounded-lg">
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium truncate">{customer.name}</p>
                                <p className="text-xs text-muted-foreground">
                                  {customer.daysOverdue} days overdue · {customer.invoiceCount} invoice{customer.invoiceCount > 1 ? 's' : ''}
                                </p>
                              </div>
                              <Badge variant={customer.daysOverdue > 90 ? "destructive" : customer.daysOverdue > 60 ? "secondary" : "outline"}>
                                {formatCurrency(customer.amountDue)}
                              </Badge>
                            </div>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted-foreground text-center py-4">No overdue accounts</p>
                      )}
                    </div>

                    {/* Collection Tips */}
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <Lightbulb className="h-4 w-4 text-yellow-500" />
                        Collection Tips
                      </h4>
                      <div className="space-y-2">
                        {badDebtData.collectionTips.map((tip, idx) => (
                          <div key={idx} className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-950 rounded-lg">
                            <span className="text-yellow-600 font-bold text-sm">{idx + 1}.</span>
                            <p className="text-sm text-yellow-800 dark:text-yellow-200">{tip}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    {badDebtData?.success === false 
                      ? "Unable to fetch receivables data from Odoo"
                      : "No open invoices found"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* ROI & MOIC - Investor Returns */}
          <Card className="col-span-1 lg:col-span-2">
            <CardHeader>
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <PiggyBank className="h-5 w-5 text-emerald-600" />
                    ROI & MOIC - Investor Returns
                  </CardTitle>
                  <CardDescription>Lifetime return on investment analysis</CardDescription>
                </div>
                {investorData?.hasData && (
                  <div className="flex items-center gap-4">
                    <Badge 
                      variant={investorData.moic >= 2 ? "default" : investorData.moic >= 1 ? "secondary" : "destructive"}
                      className="text-lg px-3 py-1"
                    >
                      {investorData.moic}x MOIC
                    </Badge>
                    <Badge 
                      variant={investorData.roi >= 100 ? "default" : investorData.roi >= 0 ? "secondary" : "destructive"}
                      className="text-lg px-3 py-1"
                    >
                      {investorData.roi}% ROI
                    </Badge>
                  </div>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {investorLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : investorData?.hasData ? (
                <div className="space-y-6">
                  {/* Investment Input */}
                  <div className="flex items-center gap-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
                    <div className="flex items-center gap-2">
                      <Calculator className="h-4 w-4 text-gray-500" />
                      <span className="text-sm font-medium">Initial Investment:</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-gray-500">$</span>
                      <Input
                        type="number"
                        value={investmentInput}
                        onChange={(e) => setInvestmentInput(e.target.value)}
                        className="w-32"
                        min={1}
                      />
                      <Button size="sm" onClick={handleInvestmentUpdate}>
                        Update
                      </Button>
                    </div>
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Since {investorData.companyStartDate} ({investorData.yearsInBusiness} years)
                    </div>
                  </div>

                  {/* Key Metrics */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-4 bg-emerald-50 dark:bg-emerald-950 rounded-lg text-center">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mb-1">MOIC</p>
                      <p className="text-3xl font-bold text-emerald-700 dark:text-emerald-300">
                        {investorData.moic}x
                      </p>
                      <p className="text-xs text-emerald-600 mt-1">Multiple on Invested Capital</p>
                    </div>
                    <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg text-center">
                      <p className="text-xs text-blue-600 dark:text-blue-400 font-medium mb-1">Total ROI</p>
                      <p className="text-3xl font-bold text-blue-700 dark:text-blue-300">
                        {investorData.roi}%
                      </p>
                      <p className="text-xs text-blue-600 mt-1">Return on Investment</p>
                    </div>
                    <div className="p-4 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium mb-1">Annualized ROI</p>
                      <p className="text-3xl font-bold text-purple-700 dark:text-purple-300">
                        {investorData.annualizedRoi}%
                      </p>
                      <p className="text-xs text-purple-600 mt-1">CAGR (yearly avg)</p>
                    </div>
                    <div className="p-4 bg-indigo-50 dark:bg-indigo-950 rounded-lg text-center">
                      <p className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mb-1">Current Value</p>
                      <p className="text-2xl font-bold text-indigo-700 dark:text-indigo-300">
                        {formatCurrency(investorData.currentValue)}
                      </p>
                      <p className="text-xs text-indigo-600 mt-1">Book equity value</p>
                    </div>
                  </div>

                  {/* Lifetime Financials */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Lifetime Revenue</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(investorData.lifetimeRevenue)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Lifetime COGS</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(investorData.lifetimeCogs)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Lifetime Gross Profit</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(investorData.lifetimeGrossProfit)}
                      </p>
                    </div>
                    <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                      <p className="text-xs text-gray-600 dark:text-gray-400 font-medium">Total Equity</p>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-100">
                        {formatCurrency(investorData.totalEquity)}
                      </p>
                    </div>
                  </div>

                  {/* Yearly Performance Chart */}
                  {investorData.yearlyData.length > 0 && (
                    <div>
                      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                        <TrendingUp className="h-4 w-4" />
                        Yearly Performance
                      </h4>
                      <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                          <ComposedChart data={investorData.yearlyData}>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                            <XAxis dataKey="year" fontSize={12} />
                            <YAxis 
                              yAxisId="left"
                              fontSize={12} 
                              tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                            />
                            <Tooltip 
                              formatter={(value: number, name: string) => [formatCurrency(value), name]}
                              contentStyle={{ backgroundColor: 'white', borderRadius: '8px' }}
                            />
                            <Legend />
                            <Bar yAxisId="left" dataKey="revenue" name="Revenue" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                            <Bar yAxisId="left" dataKey="profit" name="Gross Profit" fill="#22c55e" radius={[4, 4, 0, 0]} />
                            <Line yAxisId="left" type="monotone" dataKey="cumulativeProfit" name="Cumulative Profit" stroke="#9333ea" strokeWidth={2} dot={{ r: 4 }} />
                          </ComposedChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}

                  {/* Investment Insight */}
                  <div className="p-4 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950 dark:to-blue-950 rounded-lg">
                    <p className="text-sm text-gray-700 dark:text-gray-300">
                      {investorData.moic >= 2 ? (
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-green-600" />
                          <strong className="text-green-600">Strong Returns!</strong> An initial investment of {formatCurrency(investorData.initialInvestment)} is now worth {formatCurrency(investorData.currentValue)}, a {investorData.moic}x return over {investorData.yearsInBusiness} years.
                        </span>
                      ) : investorData.moic >= 1 ? (
                        <span className="flex items-center gap-2">
                          <TrendingUp className="h-4 w-4 text-blue-600" />
                          <strong className="text-blue-600">Positive Returns.</strong> Investment has grown from {formatCurrency(investorData.initialInvestment)} to {formatCurrency(investorData.currentValue)} ({investorData.roi}% gain).
                        </span>
                      ) : (
                        <span className="flex items-center gap-2">
                          <AlertTriangle className="h-4 w-4 text-red-600" />
                          <strong className="text-red-600">Below Investment.</strong> Current value is {formatCurrency(investorData.currentValue)} vs. initial {formatCurrency(investorData.initialInvestment)}. Focus on profitability.
                        </span>
                      )}
                    </p>
                  </div>
                </div>
              ) : (
                <div className="text-center py-8">
                  <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
                  <p className="text-muted-foreground">
                    {investorData?.success === false 
                      ? "Unable to fetch financial data from Odoo"
                      : "No financial data available"}
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Link to other reports */}
        <Card className="mt-6 bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950 dark:to-indigo-950 border-purple-200 dark:border-purple-800">
          <CardContent className="py-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                <div className="p-3 rounded-full bg-purple-100 dark:bg-purple-900">
                  <BarChart3 className="h-6 w-6 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-gray-900 dark:text-white">More Analytics</h3>
                  <p className="text-sm text-muted-foreground">
                    View detailed sales trends and daily analytics
                  </p>
                </div>
              </div>
              <Link href="/sales-analytics">
                <Button variant="outline">
                  Sales Analytics
                  <TrendingUp className="h-4 w-4 ml-2" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

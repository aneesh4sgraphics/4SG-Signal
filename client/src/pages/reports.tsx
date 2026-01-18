import { useState } from "react";
import { Link } from "wouter";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { 
  BarChart3, 
  TrendingUp, 
  DollarSign,
  FileText,
  ArrowLeft,
  RefreshCw
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

interface InvoiceData {
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
}

interface QuotesOrdersData {
  success: boolean;
  year: number;
  totals: {
    quotesAmount: number;
    quotesCount: number;
    confirmedAmount: number;
    confirmedCount: number;
  };
  chartData: Array<{
    month: string;
    quotesAmount: number;
    quotesCount: number;
    confirmedAmount: number;
    confirmedCount: number;
  }>;
}

interface GrossProfitData {
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

export default function ReportsPage() {
  const { data: invoiceData, isLoading: invoiceLoading, refetch: refetchInvoices } = useQuery<InvoiceData>({
    queryKey: ['/api/reports/invoices-2026'],
  });

  const { data: quotesOrdersData, isLoading: quotesLoading, refetch: refetchQuotesOrders } = useQuery<QuotesOrdersData>({
    queryKey: ['/api/reports/quotes-vs-orders-2026'],
  });

  const { data: grossProfitData, isLoading: profitLoading, refetch: refetchProfit } = useQuery<GrossProfitData>({
    queryKey: ['/api/reports/gross-profit-2026'],
  });

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
    refetchQuotesOrders();
    refetchProfit();
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
            disabled={invoiceLoading || quotesLoading || profitLoading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${(invoiceLoading || quotesLoading || profitLoading) ? 'animate-spin' : ''}`} />
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
                  <div className="grid grid-cols-2 gap-4 mb-4">
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
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={invoiceData.chartData}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis 
                          fontSize={12} 
                          tickFormatter={(val) => `$${(val / 1000).toFixed(0)}k`}
                        />
                        <Tooltip content={<CustomTooltipCurrency />} />
                        <Bar dataKey="total" name="Total" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No invoice data available</p>
              )}
            </CardContent>
          </Card>

          {/* Conversion Rate - Quotes Sent vs Sales Orders Confirmed */}
          <Card className="col-span-1">
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                    Conversion Rate
                  </CardTitle>
                  <CardDescription>Quotes sent vs sales orders confirmed</CardDescription>
                </div>
                {quotesOrdersData && quotesOrdersData.totals.quotesCount > 0 && (
                  <Badge 
                    variant={((quotesOrdersData.totals.confirmedCount / quotesOrdersData.totals.quotesCount) * 100) >= 50 ? "default" : "secondary"}
                    className="text-lg px-3 py-1"
                  >
                    {((quotesOrdersData.totals.confirmedCount / quotesOrdersData.totals.quotesCount) * 100).toFixed(1)}% Rate
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {quotesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-8 w-32" />
                  <Skeleton className="h-64 w-full" />
                </div>
              ) : quotesOrdersData ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-4 mb-4">
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg">
                      <p className="text-xs text-amber-600 dark:text-amber-400 font-medium">Quotes Sent</p>
                      <p className="text-xl font-bold text-amber-700 dark:text-amber-300">
                        {formatNumber(quotesOrdersData.totals.quotesCount)}
                      </p>
                      <p className="text-xs text-amber-600">
                        {formatCurrency(quotesOrdersData.totals.quotesAmount)}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg">
                      <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">Orders Confirmed</p>
                      <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">
                        {formatNumber(quotesOrdersData.totals.confirmedCount)}
                      </p>
                      <p className="text-xs text-emerald-600">
                        {formatCurrency(quotesOrdersData.totals.confirmedAmount)}
                      </p>
                    </div>
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg">
                      <p className="text-xs text-purple-600 dark:text-purple-400 font-medium">Conversion Rate</p>
                      <p className="text-xl font-bold text-purple-700 dark:text-purple-300">
                        {quotesOrdersData.totals.quotesCount > 0 
                          ? ((quotesOrdersData.totals.confirmedCount / quotesOrdersData.totals.quotesCount) * 100).toFixed(1)
                          : 0}%
                      </p>
                      <p className="text-xs text-purple-600">
                        of quotes
                      </p>
                    </div>
                  </div>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={quotesOrdersData.chartData.map(d => ({
                        ...d,
                        conversionRate: d.quotesCount > 0 
                          ? Math.round((d.confirmedCount / d.quotesCount) * 100) 
                          : 0
                      }))}>
                        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                        <XAxis dataKey="month" fontSize={12} />
                        <YAxis 
                          yAxisId="left"
                          fontSize={12} 
                          tickFormatter={(val) => `${val}`}
                        />
                        <YAxis 
                          yAxisId="right"
                          orientation="right"
                          fontSize={12} 
                          tickFormatter={(val) => `${val}%`}
                          domain={[0, 100]}
                        />
                        <Tooltip 
                          content={({ active, payload, label }: any) => {
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
                                        {entry.dataKey === 'conversionRate' ? `${entry.value}%` : entry.value}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              );
                            }
                            return null;
                          }}
                        />
                        <Legend />
                        <Bar yAxisId="left" dataKey="quotesCount" name="Quotes Sent" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar yAxisId="left" dataKey="confirmedCount" name="Confirmed" fill="#10b981" radius={[4, 4, 0, 0]} />
                        <Line yAxisId="right" type="monotone" dataKey="conversionRate" name="Conv. Rate" stroke="#8b5cf6" strokeWidth={2} dot={{ r: 4 }} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground text-center py-8">No conversion data available</p>
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

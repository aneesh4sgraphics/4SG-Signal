import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { 
  TrendingUp, 
  TrendingDown, 
  DollarSign, 
  FileText, 
  RefreshCw,
  BarChart3,
  ArrowLeft,
  Download,
  Percent,
  ArrowRightLeft
} from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";

interface ProfitLossData {
  success: boolean;
  period: string;
  year: number;
  month: number | null;
  quarter: number | null;
  startDate: string;
  endDate: string;
  income: number;
  costOfSales: number;
  grossProfit: number;
  grossMarginPercent: number;
}

interface QuotesSentData {
  success: boolean;
  period: string;
  periodLabel: string;
  year: number;
  month: number | null;
  quarter: number | null;
  startDate: string;
  endDate: string;
  totalQuotes: number;
  totalAmount: number;
  outstandingCount: number;
  outstandingAmount: number;
  convertedCount: number;
  convertedAmount: number;
}

interface ConversionRateData {
  success: boolean;
  period: string;
  periodLabel: string;
  year: number;
  month: number | null;
  quarter: number | null;
  startDate: string;
  endDate: string;
  quotesSent: number;
  quotesSentAmount: number;
  ordersConfirmed: number;
  ordersConfirmedAmount: number;
  conversionRate: number;
}

export default function SalesAnalyticsPage() {
  const [periodType, setPeriodType] = useState<string>("year");
  const [selectedYear, setSelectedYear] = useState<string>("2026");
  const [selectedMonth, setSelectedMonth] = useState<string>("1");
  const [selectedQuarter, setSelectedQuarter] = useState<string>("1");
  const { toast } = useToast();

  const buildQueryParams = () => {
    const params = new URLSearchParams();
    params.set('period', periodType);
    params.set('year', selectedYear);
    if (periodType === 'month') params.set('month', selectedMonth);
    if (periodType === 'quarter') params.set('quarter', selectedQuarter);
    return params.toString();
  };

  const queryParams = buildQueryParams();

  const { data: plData, isLoading: plLoading, refetch: refetchPL } = useQuery<ProfitLossData>({
    queryKey: ['/api/analytics/profit-loss', periodType, selectedYear, selectedMonth, selectedQuarter],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/profit-loss?${queryParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch P&L data');
      return res.json();
    },
  });

  const { data: quotesData, isLoading: quotesLoading, refetch: refetchQuotes } = useQuery<QuotesSentData>({
    queryKey: ['/api/analytics/quotes-sent', periodType, selectedYear, selectedMonth, selectedQuarter],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/quotes-sent?${queryParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch quotes data');
      return res.json();
    },
  });

  const { data: conversionData, isLoading: conversionLoading, refetch: refetchConversion } = useQuery<ConversionRateData>({
    queryKey: ['/api/analytics/conversion-rate', periodType, selectedYear, selectedMonth, selectedQuarter],
    queryFn: async () => {
      const res = await fetch(`/api/analytics/conversion-rate?${queryParams}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to fetch conversion data');
      return res.json();
    },
  });

  const isLoading = plLoading || quotesLoading || conversionLoading;

  const syncSalesMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/odoo/sync-sales');
      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(errorData.error || 'Failed to sync sales');
      }
      return res.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Sales Synced",
        description: data.message || `Imported ${data.imported} orders from Odoo`,
      });
      handleRefreshAll();
    },
    onError: (error: any) => {
      toast({
        title: "Sync Failed",
        description: error.message || "Failed to sync sales from Odoo",
        variant: "destructive",
      });
    },
  });

  const handleRefreshAll = () => {
    refetchPL();
    refetchQuotes();
    refetchConversion();
  };

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

  const months = [
    { value: "1", label: "January" },
    { value: "2", label: "February" },
    { value: "3", label: "March" },
    { value: "4", label: "April" },
    { value: "5", label: "May" },
    { value: "6", label: "June" },
    { value: "7", label: "July" },
    { value: "8", label: "August" },
    { value: "9", label: "September" },
    { value: "10", label: "October" },
    { value: "11", label: "November" },
    { value: "12", label: "December" },
  ];

  const getPeriodLabel = () => {
    if (periodType === 'month') {
      const monthName = months.find(m => m.value === selectedMonth)?.label || '';
      return `${monthName} ${selectedYear}`;
    } else if (periodType === 'quarter') {
      return `Q${selectedQuarter} ${selectedYear}`;
    }
    return selectedYear;
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
                Sales Analytics
              </h1>
              <p className="text-sm text-muted-foreground">
                Financial metrics from Profit & Loss Report
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Select value={periodType} onValueChange={setPeriodType}>
              <SelectTrigger className="w-[120px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="month">Month</SelectItem>
                <SelectItem value="quarter">Quarter</SelectItem>
                <SelectItem value="year">Year</SelectItem>
              </SelectContent>
            </Select>

            {periodType === 'month' && (
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {months.map(m => (
                    <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {periodType === 'quarter' && (
              <Select value={selectedQuarter} onValueChange={setSelectedQuarter}>
                <SelectTrigger className="w-[100px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Q1</SelectItem>
                  <SelectItem value="2">Q2</SelectItem>
                  <SelectItem value="3">Q3</SelectItem>
                  <SelectItem value="4">Q4</SelectItem>
                </SelectContent>
              </Select>
            )}

            <Select value={selectedYear} onValueChange={setSelectedYear}>
              <SelectTrigger className="w-[100px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2024">2024</SelectItem>
                <SelectItem value="2025">2025</SelectItem>
                <SelectItem value="2026">2026</SelectItem>
              </SelectContent>
            </Select>

            <Button 
              variant="outline" 
              size="sm" 
              onClick={handleRefreshAll}
              disabled={isLoading}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button 
              variant="default" 
              size="sm" 
              onClick={() => syncSalesMutation.mutate()}
              disabled={syncSalesMutation.isPending}
              className="bg-purple-600 hover:bg-purple-700"
            >
              <Download className={`h-4 w-4 mr-2 ${syncSalesMutation.isPending ? 'animate-spin' : ''}`} />
              {syncSalesMutation.isPending ? 'Syncing...' : 'Sync from Odoo'}
            </Button>
          </div>
        </div>

        <div className="mb-4">
          <Badge variant="outline" className="text-lg px-4 py-2">
            {getPeriodLabel()}
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {/* Total Invoiced (Income from P&L) */}
          <Card>
            <CardContent className="pt-6">
              {plLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Invoiced</p>
                      <p className="text-2xl font-bold text-green-600">
                        {formatCurrency(plData?.income || 0)}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-green-100 dark:bg-green-900 flex items-center justify-center">
                      <DollarSign className="h-6 w-6 text-green-600" />
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Income from Profit & Loss Report
                  </p>
                </>
              )}
            </CardContent>
          </Card>

          {/* Gross Margin (from P&L) */}
          <Card>
            <CardContent className="pt-6">
              {plLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Gross Margin</p>
                      <p className="text-2xl font-bold text-blue-600">
                        {plData?.grossMarginPercent || 0}%
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
                      <Percent className="h-6 w-6 text-blue-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Gross Profit:</span>
                      <span className="font-medium">{formatCurrency(plData?.grossProfit || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Cost of Sales:</span>
                      <span className="font-medium">{formatCurrency(plData?.costOfSales || 0)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Quotes Sent (Total - including converted) */}
          <Card>
            <CardContent className="pt-6">
              {quotesLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Total Quotes</p>
                      <p className="text-2xl font-bold text-purple-600">
                        {formatNumber(quotesData?.totalQuotes || 0)}
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-purple-100 dark:bg-purple-900 flex items-center justify-center">
                      <FileText className="h-6 w-6 text-purple-600" />
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Outstanding:</span>
                      <span className="font-medium text-amber-600">{formatNumber(quotesData?.outstandingCount || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Converted:</span>
                      <span className="font-medium text-green-600">{formatNumber(quotesData?.convertedCount || 0)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Conversion Rate */}
          <Card>
            <CardContent className="pt-6">
              {conversionLoading ? (
                <div className="space-y-2">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-8 w-32" />
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm text-muted-foreground">Conversion Rate</p>
                      <p className="text-2xl font-bold text-amber-600">
                        {conversionData?.conversionRate || 0}%
                      </p>
                    </div>
                    <div className="h-12 w-12 rounded-full bg-amber-100 dark:bg-amber-900 flex items-center justify-center">
                      {(conversionData?.conversionRate || 0) >= 50 ? (
                        <TrendingUp className="h-6 w-6 text-amber-600" />
                      ) : (
                        <TrendingDown className="h-6 w-6 text-amber-600" />
                      )}
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground space-y-1">
                    <div className="flex justify-between">
                      <span>Quotes:</span>
                      <span className="font-medium">{formatNumber(conversionData?.quotesSent || 0)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Confirmed:</span>
                      <span className="font-medium">{formatNumber(conversionData?.ordersConfirmed || 0)}</span>
                    </div>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Detailed Breakdown Cards */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Income vs Cost of Sales */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-green-600" />
                Profit & Loss Summary
              </CardTitle>
              <CardDescription>
                Income and Cost of Sales from Odoo P&L Report
              </CardDescription>
            </CardHeader>
            <CardContent>
              {plLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="p-4 bg-green-50 dark:bg-green-950 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-green-700 dark:text-green-300">Income</span>
                      <span className="text-2xl font-bold text-green-700 dark:text-green-300">
                        {formatCurrency(plData?.income || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-green-200 dark:bg-green-800 rounded-full h-2">
                      <div className="bg-green-600 h-2 rounded-full" style={{ width: '100%' }} />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-red-50 dark:bg-red-950 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium text-red-700 dark:text-red-300">Cost of Sales</span>
                      <span className="text-2xl font-bold text-red-700 dark:text-red-300">
                        {formatCurrency(plData?.costOfSales || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-red-200 dark:bg-red-800 rounded-full h-2">
                      <div 
                        className="bg-red-600 h-2 rounded-full" 
                        style={{ 
                          width: plData?.income ? `${Math.min((plData.costOfSales / plData.income) * 100, 100)}%` : '0%' 
                        }} 
                      />
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg border-2 border-blue-200 dark:border-blue-800">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">Gross Profit</span>
                      <div className="text-right">
                        <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                          {formatCurrency(plData?.grossProfit || 0)}
                        </span>
                        <Badge 
                          className="ml-2"
                          variant={(plData?.grossMarginPercent || 0) >= 30 ? "default" : "secondary"}
                        >
                          {plData?.grossMarginPercent || 0}% margin
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Quotes to Orders Conversion */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ArrowRightLeft className="h-5 w-5 text-amber-600" />
                Quotes to Orders Conversion
              </CardTitle>
              <CardDescription>
                Every sales order was once a quote - track conversion success
              </CardDescription>
            </CardHeader>
            <CardContent>
              {conversionLoading || quotesLoading ? (
                <div className="space-y-4">
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-20 w-full" />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3">
                    <div className="p-3 bg-purple-50 dark:bg-purple-950 rounded-lg text-center">
                      <p className="text-2xl font-bold text-purple-700 dark:text-purple-300">
                        {formatNumber(quotesData?.totalQuotes || 0)}
                      </p>
                      <p className="text-xs text-purple-600 dark:text-purple-400">Total Quotes</p>
                      <p className="text-xs text-purple-500 mt-1">
                        {formatCurrency(quotesData?.totalAmount || 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-emerald-50 dark:bg-emerald-950 rounded-lg text-center">
                      <p className="text-2xl font-bold text-emerald-700 dark:text-emerald-300">
                        {formatNumber(quotesData?.convertedCount || 0)}
                      </p>
                      <p className="text-xs text-emerald-600 dark:text-emerald-400">Converted</p>
                      <p className="text-xs text-emerald-500 mt-1">
                        {formatCurrency(quotesData?.convertedAmount || 0)}
                      </p>
                    </div>
                    <div className="p-3 bg-amber-50 dark:bg-amber-950 rounded-lg text-center border-2 border-amber-300 dark:border-amber-700">
                      <p className="text-2xl font-bold text-amber-700 dark:text-amber-300">
                        {formatNumber(quotesData?.outstandingCount || 0)}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400">Outstanding</p>
                      <p className="text-xs text-amber-500 mt-1">
                        {formatCurrency(quotesData?.outstandingAmount || 0)}
                      </p>
                    </div>
                  </div>
                  
                  <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                        Conversion Rate
                      </span>
                      <span className="text-2xl font-bold text-blue-700 dark:text-blue-300">
                        {conversionData?.conversionRate || 0}%
                      </span>
                    </div>
                    <div className="w-full bg-blue-200 dark:bg-blue-800 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-500" 
                        style={{ width: `${Math.min(conversionData?.conversionRate || 0, 100)}%` }} 
                      />
                    </div>
                    <p className="text-xs text-blue-500 mt-2 text-center">
                      {quotesData?.convertedCount || 0} of {quotesData?.totalQuotes || 0} quotes converted to orders
                    </p>
                  </div>
                  
                  {(quotesData?.outstandingCount || 0) > 0 && (
                    <div className="p-3 bg-amber-100 dark:bg-amber-900 rounded-lg border border-amber-300 dark:border-amber-700">
                      <p className="text-sm text-amber-800 dark:text-amber-200 font-medium">
                        {formatNumber(quotesData?.outstandingCount || 0)} quotes still pending - worth {formatCurrency(quotesData?.outstandingAmount || 0)}
                      </p>
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        Review these to understand why they haven't converted
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="mt-6 text-center text-sm text-muted-foreground">
          <p>Data sourced from Odoo Profit & Loss Report and Sale Orders</p>
        </div>
      </div>
    </div>
  );
}

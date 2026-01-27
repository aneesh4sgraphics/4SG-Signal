import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Mail, Download, ArrowLeft, Calendar, User, DollarSign, Trash2, Search, Eye, FileDown, Sheet, ChevronLeft, ChevronRight, Pencil, Check, X, RefreshCw, ShoppingCart } from "lucide-react";
import { SiShopify } from "react-icons/si";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarComponent } from "@/components/ui/calendar";
import { format } from "date-fns";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { saveAs } from 'file-saver';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from "@/components/ui/table";

interface SentQuote {
  id: number;
  quoteNumber: string;
  customerName: string;
  customerEmail: string | null;
  quoteItems: string;
  totalAmount?: string | null;
  createdAt: string;
  sentVia?: string | null;
  status: string;
  source?: string | null; // 'quickquote', 'shopify_draft', 'shopify_abandoned_cart', 'email', 'pdf'
  priority?: string | null; // 'high', 'normal', 'low'
  shopifyDraftOrderId?: string | null;
  shopifyCheckoutId?: string | null;
}

export default function SavedQuotes() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [quoteToDelete, setQuoteToDelete] = useState<number | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewDialogOpen, setViewDialogOpen] = useState(false);
  const [selectedQuote, setSelectedQuote] = useState<SentQuote | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedQuotes, setSelectedQuotes] = useState<Set<number>>(new Set());
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined }>({ from: undefined, to: undefined });
  const [editingEmail, setEditingEmail] = useState<number | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const ITEMS_PER_PAGE = 25;

  const getStatusVariant = (status: string): "default" | "secondary" | "destructive" | "outline" => {
    switch (status?.toLowerCase()) {
      case 'sent':
        return 'default';
      case 'viewed':
        return 'secondary';
      case 'accepted':
        return 'default';
      case 'rejected':
        return 'destructive';
      case 'expired':
        return 'outline';
      default:
        return 'outline';
    }
  };
  
  const { data: sentQuotes, isLoading: quotesLoading, error: quotesError } = useQuery({
    queryKey: ["/api/sent-quotes", (user as any)?.id],
    queryFn: async () => {
      const response = await apiRequest("GET", "/api/sent-quotes");
      if (!response.ok) {
        throw new Error("Failed to fetch quotes");
      }
      return response.json();
    },
    retry: 3,
    retryDelay: 1000,
  });

  const deleteQuoteMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest("DELETE", `/api/sent-quotes/${id}`);
      if (!response.ok) {
        throw new Error("Failed to delete quote");
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sent-quotes", (user as any)?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customer-sent-quotes"] });
      toast({
        title: "Success",
        description: "Quote deleted successfully",
      });
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
    },
    onError: (error) => {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete quote",
        variant: "destructive",
      });
      setDeleteDialogOpen(false);
      setQuoteToDelete(null);
    },
  });

  // Sync Shopify abandoned carts and draft orders
  const syncShopifyMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest("POST", "/api/shopify/sync-to-saved-quotes");
      if (!response.ok) {
        throw new Error("Failed to sync Shopify data");
      }
      return response.json();
    },
    onSuccess: (data: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/sent-quotes", (user as any)?.id] });
      toast({
        title: "Shopify Sync Complete",
        description: data.message || `Synced ${data.syncedDrafts || 0} draft orders and ${data.syncedCarts || 0} abandoned carts`,
      });
    },
    onError: (error) => {
      toast({
        title: "Sync Failed",
        description: error instanceof Error ? error.message : "Failed to sync Shopify data",
        variant: "destructive",
      });
    },
  });

  const handleDeleteQuote = (id: number) => {
    setQuoteToDelete(id);
    setDeleteDialogOpen(true);
  };

  const confirmDelete = () => {
    if (quoteToDelete) {
      deleteQuoteMutation.mutate(quoteToDelete);
    }
  };

  // Safe date formatting function
  const formatDate = (dateString: string | null | undefined): string => {
    if (!dateString) return "N/A";
    try {
      const date = new Date(dateString);
      return isNaN(date.getTime()) ? "N/A" : date.toLocaleDateString();
    } catch {
      return "N/A";
    }
  };

  // Filter quotes based on search, status, and date range
  const filteredQuotes = useMemo(() => {
    if (!sentQuotes || !Array.isArray(sentQuotes)) return [];
    
    return sentQuotes.filter((quote: SentQuote) => {
      const matchesSearch = searchTerm === "" || 
        quote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (quote.customerEmail && quote.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === "all" || quote.status.toLowerCase() === statusFilter.toLowerCase();
      
      let matchesDateRange = true;
      if (dateRange.from || dateRange.to) {
        const quoteDate = new Date(quote.createdAt);
        if (dateRange.from && quoteDate < dateRange.from) matchesDateRange = false;
        if (dateRange.to) {
          const endOfDay = new Date(dateRange.to);
          endOfDay.setHours(23, 59, 59, 999);
          if (quoteDate > endOfDay) matchesDateRange = false;
        }
      }
      
      return matchesSearch && matchesStatus && matchesDateRange;
    });
  }, [sentQuotes, searchTerm, statusFilter, dateRange]);

  // Paginated quotes
  const paginatedQuotes = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    return filteredQuotes.slice(startIndex, startIndex + ITEMS_PER_PAGE);
  }, [filteredQuotes, currentPage]);

  const totalPages = Math.ceil(filteredQuotes.length / ITEMS_PER_PAGE);

  // Reset page when filters change
  useMemo(() => {
    setCurrentPage(1);
  }, [searchTerm, statusFilter, dateRange]);

  // Selection handlers
  const toggleSelectAll = () => {
    if (selectedQuotes.size === paginatedQuotes.length) {
      setSelectedQuotes(new Set());
    } else {
      setSelectedQuotes(new Set(paginatedQuotes.map((q: SentQuote) => q.id)));
    }
  };

  const toggleSelectQuote = (id: number) => {
    const newSelected = new Set(selectedQuotes);
    if (newSelected.has(id)) {
      newSelected.delete(id);
    } else {
      newSelected.add(id);
    }
    setSelectedQuotes(newSelected);
  };

  // Bulk delete mutation
  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: number[]) => {
      await Promise.all(ids.map(id => apiRequest("DELETE", `/api/sent-quotes/${id}`)));
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sent-quotes", (user as any)?.id] });
      queryClient.invalidateQueries({ queryKey: ["/api/crm/customer-sent-quotes"] });
      toast({ title: "Success", description: `${selectedQuotes.size} quotes deleted` });
      setSelectedQuotes(new Set());
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to delete some quotes", variant: "destructive" });
    },
  });

  // Update email mutation
  const updateEmailMutation = useMutation({
    mutationFn: async ({ id, email }: { id: number; email: string }) => {
      return apiRequest("PATCH", `/api/sent-quotes/${id}`, { customerEmail: email });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/sent-quotes", (user as any)?.id] });
      toast({ title: "Success", description: "Email updated successfully" });
      setEditingEmail(null);
    },
    onError: () => {
      toast({ title: "Error", description: "Failed to update email", variant: "destructive" });
    },
  });

  // Get badge styling for status with distinct colors
  const getStatusStyle = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent': 
        return { variant: 'default' as const, className: 'bg-green-100 text-green-800 hover:bg-green-100 border-green-200' };
      case 'draft':
      case 'pending': 
        return { variant: 'secondary' as const, className: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100 border-yellow-200' };
      case 'failed':
      case 'expired': 
        return { variant: 'destructive' as const, className: 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200' };
      default: 
        return { variant: 'outline' as const, className: '' };
    }
  };

  // Handle quote view
  const handleViewQuote = (quote: SentQuote) => {
    setSelectedQuote(quote);
    setViewDialogOpen(true);
  };

  // Handle CSV/PDF re-download
  const handleReDownload = async (quote: SentQuote, format: 'csv' | 'pdf') => {
    try {
      let quoteItems;
      try {
        quoteItems = JSON.parse(quote.quoteItems);
      } catch {
        toast({
          title: "Error",
          description: "Invalid quote data format",
          variant: "destructive",
        });
        return;
      }

      if (format === 'pdf') {
        const response = await apiRequest("POST", "/api/generate-pdf-quote", {
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          quoteItems: quoteItems,
          quoteNumber: quote.quoteNumber
        });
        
        if (response.ok) {
          const blob = await response.blob();
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `quote_${quote.quoteNumber}.pdf`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        } else {
          throw new Error('Failed to download PDF');
        }
      } else {
        const response = await apiRequest("POST", "/api/generate-quote-csv", {
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          items: quoteItems,
          quoteNumber: quote.quoteNumber
        });
        
        if (response.ok) {
          const csvData = await response.text();
          const blob = new Blob([csvData], { type: 'text/csv' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `quote_${quote.quoteNumber}.csv`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
        }
      }
      
      toast({
        title: "Success",
        description: `Quote ${format.toUpperCase()} downloaded successfully`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: `Failed to download ${format.toUpperCase()}`,
        variant: "destructive",
      });
    }
  };

  // Handle export all quotes as CSV
  const handleExportAll = () => {
    try {
      if (!filteredQuotes.length) {
        toast({
          title: "No Data",
          description: "No quotes available to export",
          variant: "destructive",
        });
        return;
      }

      // Create CSV headers
      const headers = [
        'Quote Number',
        'Customer Name',
        'Customer Email',
        'Total Amount',
        'Date Created',
        'Status',
        'Sent Via',
        'Quote Items'
      ];

      // Convert quotes to CSV rows
      const csvRows = filteredQuotes.map((quote: SentQuote) => {
        // Parse and flatten quote items for better CSV representation
        let quoteItemsText = '';
        try {
          const items = JSON.parse(quote.quoteItems || '[]');
          quoteItemsText = items.map((item: any) => 
            `${item.productName || 'Unknown'} (${item.size || 'Unknown size'}) - Qty: ${item.quantity || 0} - Price: $${item.totalPrice || 0}`
          ).join('; ');
        } catch {
          quoteItemsText = 'Invalid quote data';
        }

        return [
          quote.quoteNumber || '',
          quote.customerName || '',
          quote.customerEmail || '',
          quote.totalAmount ? `$${parseFloat(quote.totalAmount).toFixed(2)}` : '$0.00',
          formatDate(quote.createdAt),
          quote.status || '',
          quote.sentVia || 'Not Known',
          `"${quoteItemsText}"` // Wrap in quotes to handle commas in the text
        ];
      });

      // Combine headers and rows
      const csvContent = [
        headers.join(','),
        ...csvRows.map(row => row.join(','))
      ].join('\n');

      // Create and download the CSV file
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD format
      const filename = `saved-quotes-export-${timestamp}.csv`;
      
      saveAs(blob, filename);
      
      toast({
        title: "Export Successful",
        description: `${filteredQuotes.length} quotes exported to ${filename}`,
      });
    } catch (error) {
      toast({
        title: "Export Failed",
        description: "Failed to export quotes to CSV",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="py-4 sm:py-8 px-3 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 sm:gap-0">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center sm:text-center flex-1">
            <h1 className="text-xl sm:text-3xl font-bold text-gray-900">Saved Quotes</h1>
            <p className="text-sm sm:text-base text-gray-600">View and manage all generated quotes</p>
          </div>
          <div className="flex gap-2">
            <Button 
              onClick={() => syncShopifyMutation.mutate()}
              variant="outline"
              className="flex items-center gap-2 border-green-600 text-green-700 hover:bg-green-50"
              disabled={syncShopifyMutation.isPending}
            >
              {syncShopifyMutation.isPending ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <SiShopify className="h-4 w-4" />
              )}
              Sync Shopify
            </Button>
            <Button 
              onClick={handleExportAll}
              className="flex items-center gap-2 bg-green-600 hover:bg-green-700"
              disabled={filteredQuotes.length === 0}
            >
              <Sheet className="h-4 w-4" />
              Download All CSV
            </Button>
          </div>
        </div>

        {/* Search and Filter Toolbar */}
        <Card className="glass-card border-0 shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by customer name, quote number, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                  data-testid="input-search-quotes"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-[220px] justify-start text-left font-normal" data-testid="btn-date-range">
                    <Calendar className="mr-2 h-4 w-4" />
                    {dateRange.from ? (
                      dateRange.to ? (
                        <>
                          {format(dateRange.from, "MMM d")} - {format(dateRange.to, "MMM d, yyyy")}
                        </>
                      ) : (
                        format(dateRange.from, "MMM d, yyyy")
                      )
                    ) : (
                      <span>Pick a date range</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="range"
                    selected={{ from: dateRange.from, to: dateRange.to }}
                    onSelect={(range) => setDateRange({ from: range?.from, to: range?.to })}
                    numberOfMonths={2}
                  />
                  {(dateRange.from || dateRange.to) && (
                    <div className="p-2 border-t">
                      <Button 
                        variant="ghost" 
                        size="sm" 
                        onClick={() => setDateRange({ from: undefined, to: undefined })}
                        className="w-full"
                      >
                        Clear dates
                      </Button>
                    </div>
                  )}
                </PopoverContent>
              </Popover>
            </div>
            {/* Bulk Actions Toolbar */}
            {selectedQuotes.size > 0 && (
              <div className="flex items-center gap-4 mt-4 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <span className="text-sm font-medium text-blue-800">
                  {selectedQuotes.size} quote{selectedQuotes.size > 1 ? 's' : ''} selected
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    const selectedData = filteredQuotes.filter((q: SentQuote) => selectedQuotes.has(q.id));
                    const csvContent = [
                      ['Quote Number', 'Customer Name', 'Email', 'Total Amount', 'Date', 'Status'].join(','),
                      ...selectedData.map((q: SentQuote) => [
                        q.quoteNumber,
                        q.customerName,
                        q.customerEmail || 'N/A',
                        q.totalAmount ? `$${parseFloat(q.totalAmount).toFixed(2)}` : '$0.00',
                        formatDate(q.createdAt),
                        q.status
                      ].join(','))
                    ].join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    saveAs(blob, `selected-quotes-${new Date().toISOString().split('T')[0]}.csv`);
                    toast({ title: "Exported", description: `${selectedQuotes.size} quotes exported` });
                  }}
                  data-testid="btn-export-selected"
                >
                  <Download className="h-4 w-4 mr-1" />
                  Export Selected
                </Button>
                {(user as any)?.role === 'admin' && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={() => {
                      if (confirm(`Delete ${selectedQuotes.size} selected quotes?`)) {
                        bulkDeleteMutation.mutate(Array.from(selectedQuotes));
                      }
                    }}
                    disabled={bulkDeleteMutation.isPending}
                    data-testid="btn-delete-selected"
                  >
                    <Trash2 className="h-4 w-4 mr-1" />
                    Delete Selected
                  </Button>
                )}
                <Button variant="ghost" size="sm" onClick={() => setSelectedQuotes(new Set())}>
                  Clear selection
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Quotes Table */}
        <Card className="glass-card border-0 shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              All Generated Quotes
              <Badge variant="outline" className="ml-2">
                {filteredQuotes.length} quotes
              </Badge>
            </CardTitle>
            <p className="text-sm text-muted-foreground">
              All quotes generated from the Quote Calculator are automatically saved here.
            </p>
          </CardHeader>
          <CardContent>
            {quotesLoading ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
              </div>
            ) : quotesError ? (
              <div className="text-center py-8 text-red-600">
                <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>Error loading quotes. Please refresh the page.</p>
                <p className="text-sm mt-2">
                  {quotesError instanceof Error ? quotesError.message : "Unknown error occurred"}
                </p>
              </div>
            ) : filteredQuotes.length > 0 ? (
              <TooltipProvider>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[40px]">
                          <Checkbox
                            checked={selectedQuotes.size === paginatedQuotes.length && paginatedQuotes.length > 0}
                            onCheckedChange={toggleSelectAll}
                            data-testid="checkbox-select-all"
                          />
                        </TableHead>
                        <TableHead className="w-[120px]">Quote #</TableHead>
                        <TableHead className="w-[180px]">Customer</TableHead>
                        <TableHead className="w-[200px]">Email</TableHead>
                        <TableHead className="w-[120px]">Actions</TableHead>
                        <TableHead className="w-[120px] text-right">Total Amount</TableHead>
                        <TableHead className="w-[120px]">Date</TableHead>
                        <TableHead className="w-[100px]">Method</TableHead>
                        <TableHead className="w-[100px]">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {paginatedQuotes.map((quote: SentQuote) => (
                        <TableRow key={quote.id} className="hover:bg-gray-50">
                          <TableCell>
                            <Checkbox
                              checked={selectedQuotes.has(quote.id)}
                              onCheckedChange={() => toggleSelectQuote(quote.id)}
                              data-testid={`checkbox-quote-${quote.id}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium font-mono">
                            <div className="flex items-center gap-2">
                              {(quote.source === 'shopify_draft' || quote.source === 'shopify_abandoned_cart') && (
                                <Tooltip>
                                  <TooltipTrigger>
                                    <SiShopify className={`h-4 w-4 ${quote.source === 'shopify_abandoned_cart' ? 'text-orange-500' : 'text-green-600'}`} />
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    {quote.source === 'shopify_abandoned_cart' ? 'Abandoned Cart' : 'Shopify Draft Order'}
                                  </TooltipContent>
                                </Tooltip>
                              )}
                              {quote.quoteNumber}
                              {quote.priority === 'high' && (
                                <Badge variant="destructive" className="ml-1 text-xs px-1 py-0">Priority</Badge>
                              )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <User className="h-4 w-4 text-gray-400" />
                              <span className="truncate max-w-[140px]">{quote.customerName}</span>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm">
                            {editingEmail === quote.id ? (
                              <div className="flex items-center gap-1">
                                <Input
                                  type="email"
                                  value={editEmailValue}
                                  onChange={(e) => setEditEmailValue(e.target.value)}
                                  className="h-7 w-[140px] text-sm"
                                  placeholder="Enter email"
                                  data-testid={`input-edit-email-${quote.id}`}
                                />
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-green-600"
                                  onClick={() => updateEmailMutation.mutate({ id: quote.id, email: editEmailValue })}
                                  disabled={updateEmailMutation.isPending}
                                >
                                  <Check className="h-4 w-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 w-7 p-0 text-gray-500"
                                  onClick={() => setEditingEmail(null)}
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-1">
                                <span className={quote.customerEmail ? 'text-gray-700' : 'text-gray-400 italic'}>
                                  {quote.customerEmail || 'N/A'}
                                </span>
                                {!quote.customerEmail && (
                                  <Tooltip>
                                    <TooltipTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-gray-400 hover:text-blue-600"
                                        onClick={() => {
                                          setEditingEmail(quote.id);
                                          setEditEmailValue(quote.customerEmail || '');
                                        }}
                                        data-testid={`btn-edit-email-${quote.id}`}
                                      >
                                        <Pencil className="h-3 w-3" />
                                      </Button>
                                    </TooltipTrigger>
                                    <TooltipContent>Add email address</TooltipContent>
                                  </Tooltip>
                                )}
                              </div>
                            )}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleViewQuote(quote)}
                                    className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                    data-testid={`btn-view-quote-${quote.id}`}
                                  >
                                    <Eye className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>View quote details</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReDownload(quote, 'pdf')}
                                    className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                                    data-testid={`btn-download-pdf-${quote.id}`}
                                  >
                                    <FileDown className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download as PDF</TooltipContent>
                              </Tooltip>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleReDownload(quote, 'csv')}
                                    className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                                    data-testid={`btn-download-csv-${quote.id}`}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </TooltipTrigger>
                                <TooltipContent>Download as CSV</TooltipContent>
                              </Tooltip>
                              {(user as any)?.role === 'admin' && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={() => handleDeleteQuote(quote.id)}
                                      disabled={deleteQuoteMutation.isPending}
                                      className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                                      data-testid={`btn-delete-quote-${quote.id}`}
                                    >
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </TooltipTrigger>
                                  <TooltipContent>Delete quote</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="text-right font-mono">
                            ${quote.totalAmount && typeof quote.totalAmount === 'string' ? parseFloat(quote.totalAmount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-2 text-sm text-gray-600">
                              <Calendar className="h-4 w-4 text-gray-400" />
                              {formatDate(quote.createdAt)}
                            </div>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {typeof quote.sentVia === 'string' && quote.sentVia.trim()
                                ? quote.sentVia.split(',').map((method, index) => {
                                    const trimmed = method.trim().toLowerCase();
                                    if (trimmed === 'not known') {
                                      return (
                                        <Badge key={index} variant="outline" className="text-xs">
                                          <FileText className="h-3 w-3 mr-1" />Not Known
                                        </Badge>
                                      );
                                    }
                                    return (
                                      <Badge key={index} variant={trimmed === 'email' ? 'default' : 'secondary'} className="text-xs">
                                        {trimmed === 'email' ? (
                                          <><Mail className="h-3 w-3 mr-1" />Email</>
                                        ) : (
                                          <><Download className="h-3 w-3 mr-1" />PDF</>
                                        )}
                                      </Badge>
                                    );
                                  })
                                : (
                                  <Badge variant="outline" className="text-xs">
                                    <FileText className="h-3 w-3 mr-1" />Not Known
                                  </Badge>
                                )}
                            </div>
                          </TableCell>
                          <TableCell>
                            <Badge className={getStatusStyle(quote.status).className}>
                              {quote.status}
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {/* Pagination Controls */}
                {totalPages > 1 && (
                  <div className="flex items-center justify-between mt-4 pt-4 border-t">
                    <p className="text-sm text-gray-600">
                      Showing {((currentPage - 1) * ITEMS_PER_PAGE) + 1} to {Math.min(currentPage * ITEMS_PER_PAGE, filteredQuotes.length)} of {filteredQuotes.length} quotes
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                        data-testid="btn-prev-page"
                      >
                        <ChevronLeft className="h-4 w-4 mr-1" />
                        Previous
                      </Button>
                      <div className="flex items-center gap-1">
                        {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                          let pageNum;
                          if (totalPages <= 5) {
                            pageNum = i + 1;
                          } else if (currentPage <= 3) {
                            pageNum = i + 1;
                          } else if (currentPage >= totalPages - 2) {
                            pageNum = totalPages - 4 + i;
                          } else {
                            pageNum = currentPage - 2 + i;
                          }
                          return (
                            <Button
                              key={pageNum}
                              variant={currentPage === pageNum ? "default" : "outline"}
                              size="sm"
                              className="w-8 h-8 p-0"
                              onClick={() => setCurrentPage(pageNum)}
                            >
                              {pageNum}
                            </Button>
                          );
                        })}
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                        data-testid="btn-next-page"
                      >
                        Next
                        <ChevronRight className="h-4 w-4 ml-1" />
                      </Button>
                    </div>
                  </div>
                )}
              </TooltipProvider>
            ) : (
              <div className="text-center py-12 text-gray-500">
                <FileText className="h-16 w-16 mx-auto mb-4 opacity-50" />
                <h3 className="text-lg font-medium mb-2">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'No quotes match your filters' 
                    : 'No quotes generated yet'}
                </h3>
                <p className="text-sm">
                  {searchTerm || statusFilter !== 'all' 
                    ? 'Try adjusting your search or filter criteria.'
                    : 'Generate quotes from the Quote Calculator to see them here.'}
                </p>
                {!searchTerm && statusFilter === 'all' && (
                  <Link href="/quick-quotes">
                    <Button className="mt-4">
                      Go to Quote Calculator
                    </Button>
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* View Quote Details Dialog */}
        <Dialog open={viewDialogOpen} onOpenChange={setViewDialogOpen}>
          <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Quote Details - {selectedQuote?.quoteNumber}
              </DialogTitle>
            </DialogHeader>
            {selectedQuote && (
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Customer Information</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Name:</span> {selectedQuote.customerName}</p>
                      <p><span className="font-medium">Email:</span> {selectedQuote.customerEmail || 'N/A'}</p>
                      <p><span className="font-medium">Total Amount:</span> ${selectedQuote.totalAmount && typeof selectedQuote.totalAmount === 'string' ? parseFloat(selectedQuote.totalAmount).toFixed(2) : '0.00'}</p>
                    </div>
                  </div>
                  <div>
                    <h4 className="font-medium text-sm text-gray-700 mb-2">Quote Information</h4>
                    <div className="space-y-1 text-sm">
                      <p><span className="font-medium">Quote Number:</span> {selectedQuote.quoteNumber}</p>
                      <p><span className="font-medium">Date:</span> {formatDate(selectedQuote.createdAt)}</p>
                      <p><span className="font-medium">Status:</span> 
                        <Badge variant={getStatusVariant(selectedQuote.status)} className="ml-2">
                          {selectedQuote.status}
                        </Badge>
                      </p>
                      <p><span className="font-medium">Sent Via:</span> {selectedQuote.sentVia || 'Not Known'}</p>
                    </div>
                  </div>
                </div>
                
                <div>
                  <h4 className="font-medium text-sm text-gray-700 mb-2">Quote Items</h4>
                  <div className="bg-gray-50 p-4 rounded-lg">
                    <pre className="text-xs overflow-x-auto whitespace-pre-wrap text-gray-700">
                      {JSON.stringify(JSON.parse(selectedQuote.quoteItems || '[]'), null, 2)}
                    </pre>
                  </div>
                </div>

                <div className="flex justify-between items-center pt-4 border-t">
                  <div className="flex gap-2">
                    <Button
                      onClick={() => handleReDownload(selectedQuote, 'pdf')}
                      className="flex items-center gap-2"
                      variant="outline"
                    >
                      <FileDown className="h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button
                      onClick={() => handleReDownload(selectedQuote, 'csv')}
                      className="flex items-center gap-2"
                      variant="outline"
                    >
                      <Download className="h-4 w-4" />
                      Download CSV
                    </Button>
                  </div>
                  <Button onClick={() => setViewDialogOpen(false)}>
                    Close
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Delete Confirmation Dialog */}
        <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Delete Quote</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Are you sure you want to delete this quote? This action cannot be undone.
              </p>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={deleteQuoteMutation.isPending}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={confirmDelete}
                  disabled={deleteQuoteMutation.isPending}
                >
                  {deleteQuoteMutation.isPending ? "Deleting..." : "Delete Quote"}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
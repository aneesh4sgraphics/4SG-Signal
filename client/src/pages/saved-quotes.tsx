import { useState, useMemo } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FileText, Mail, Download, ArrowLeft, Calendar, User, DollarSign, Trash2, Search, Eye, FileDown } from "lucide-react";
import { Link } from "wouter";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
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
  
  const { data: sentQuotes, isLoading: quotesLoading, error: quotesError } = useQuery({
    queryKey: ["/api/sent-quotes"],
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
      queryClient.invalidateQueries({ queryKey: ["/api/sent-quotes"] });
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

  // Filter quotes based on search and status
  const filteredQuotes = useMemo(() => {
    if (!sentQuotes || !Array.isArray(sentQuotes)) return [];
    
    return sentQuotes.filter((quote: SentQuote) => {
      const matchesSearch = searchTerm === "" || 
        quote.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        quote.quoteNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (quote.customerEmail && quote.customerEmail.toLowerCase().includes(searchTerm.toLowerCase()));
      
      const matchesStatus = statusFilter === "all" || quote.status === statusFilter;
      
      return matchesSearch && matchesStatus;
    });
  }, [sentQuotes, searchTerm, statusFilter]);

  // Get badge variant for status
  const getStatusVariant = (status: string) => {
    switch (status.toLowerCase()) {
      case 'sent': return 'default' as const;
      case 'pending': return 'secondary' as const;
      case 'failed': return 'destructive' as const;
      default: return 'outline' as const;
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
        const response = await apiRequest("POST", "/api/generate-quote-pdf", {
          customerName: quote.customerName,
          customerEmail: quote.customerEmail,
          items: quoteItems,
          quoteNumber: quote.quoteNumber
        });
        
        if (response.ok) {
          const data = await response.json();
          const blob = new Blob([data.html], { type: 'text/html' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `quote_${quote.quoteNumber}.html`;
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
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
          <div className="hidden sm:block w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Search and Filter Toolbar */}
        <Card className="shadow-sm">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="Search by customer name, quote number, or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Filter by status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="sent">Sent</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="failed">Failed</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Quotes Table */}
        <Card className="shadow-sm">
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Quote #</TableHead>
                      <TableHead className="w-[200px]">Customer</TableHead>
                      <TableHead className="w-[200px]">Email</TableHead>
                      <TableHead className="w-[120px]">Actions</TableHead>
                      {(user as any)?.role === 'admin' && <TableHead className="w-[80px]">Delete</TableHead>}
                      <TableHead className="w-[120px]">Total Amount</TableHead>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[100px]">Method</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredQuotes.map((quote: SentQuote) => (
                      <TableRow key={quote.id}>
                        <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <User className="h-4 w-4 text-gray-400" />
                            {quote.customerName}
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-gray-600">
                          {quote.customerEmail || 'N/A'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleViewQuote(quote)}
                              className="h-8 w-8 p-0 text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                              title="View Details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReDownload(quote, 'pdf')}
                              className="h-8 w-8 p-0 text-green-600 hover:text-green-700 hover:bg-green-50"
                              title="Download PDF"
                            >
                              <FileDown className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleReDownload(quote, 'csv')}
                              className="h-8 w-8 p-0 text-orange-600 hover:text-orange-700 hover:bg-orange-50"
                              title="Download CSV"
                            >
                              <Download className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                        {(user as any)?.role === 'admin' && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteQuote(quote.id)}
                              disabled={deleteQuoteMutation.isPending}
                              className="h-8 w-8 p-0 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title="Delete Quote"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        )}
                        <TableCell>
                          ${quote.totalAmount && typeof quote.totalAmount === 'string' ? parseFloat(quote.totalAmount).toFixed(2) : '0.00'}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
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
                                      <Badge key={index} variant="outline">
                                        <FileText className="h-3 w-3 mr-1" />Not Known
                                      </Badge>
                                    );
                                  }
                                  return (
                                    <Badge key={index} variant={trimmed === 'email' ? 'default' : 'secondary'}>
                                      {trimmed === 'email' ? (
                                        <><Mail className="h-3 w-3 mr-1" />Email</>
                                      ) : (
                                        <><Download className="h-3 w-3 mr-1" />PDF</>
                                      )}
                                    </Badge>
                                  );
                                })
                              : (
                                <Badge variant="outline">
                                  <FileText className="h-3 w-3 mr-1" />Not Known
                                </Badge>
                              )}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={getStatusVariant(quote.status)}>
                            {quote.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
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
                  <Link href="/quote-calculator">
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
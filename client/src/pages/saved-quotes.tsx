import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { FileText, Mail, Download, ArrowLeft, Calendar, User, DollarSign } from "lucide-react";
import { Link } from "wouter";
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
  totalAmount: string;
  createdAt: string;
  sentVia: string;
  status: string;
}

export default function SavedQuotes() {
  const { data: sentQuotes, isLoading: quotesLoading } = useQuery({
    queryKey: ["/api/sent-quotes"],
  });

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-6xl mx-auto space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Saved Quotes</h1>
            <p className="text-gray-600">View and manage all generated quotes</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Quotes Table */}
        <Card className="shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2 text-lg">
              <FileText className="h-5 w-5" />
              All Generated Quotes
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
            ) : sentQuotes && sentQuotes.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[120px]">Quote #</TableHead>
                      <TableHead className="w-[200px]">Customer</TableHead>
                      <TableHead className="w-[200px]">Email</TableHead>
                      <TableHead className="w-[120px]">Total Amount</TableHead>
                      <TableHead className="w-[120px]">Date</TableHead>
                      <TableHead className="w-[100px]">Method</TableHead>
                      <TableHead className="w-[100px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sentQuotes.map((quote: SentQuote) => (
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
                          <div className="flex items-center gap-2">
                            <DollarSign className="h-4 w-4 text-green-600" />
                            ${parseFloat(quote.totalAmount).toFixed(2)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Calendar className="h-4 w-4 text-gray-400" />
                            {new Date(quote.createdAt).toLocaleDateString()}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant={quote.sentVia === 'email' ? 'default' : 'secondary'}>
                            {quote.sentVia === 'email' ? (
                              <><Mail className="h-3 w-3 mr-1" />Email</>
                            ) : (
                              <><Download className="h-3 w-3 mr-1" />PDF</>
                            )}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={quote.status === 'sent' ? 'default' : 'secondary'}>
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
                <h3 className="text-lg font-medium mb-2">No quotes generated yet</h3>
                <p className="text-sm">
                  Generate quotes from the Quote Calculator to see them here.
                </p>
                <Link href="/quote-calculator">
                  <Button className="mt-4">
                    Go to Quote Calculator
                  </Button>
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
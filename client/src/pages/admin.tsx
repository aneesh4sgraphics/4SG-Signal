import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Settings, Calendar, Mail, Download, Eye, ArrowLeft, Users, UserCheck, UserX, Clock, UserCog, TrendingUp } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Badge } from "@/components/ui/badge";
import { apiRequest } from "@/lib/queryClient";

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

interface User {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
  status: string;
  createdAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}

export default function Admin() {
  const [productFile, setProductFile] = useState<File | null>(null);
  const [pricingFile, setPricingFile] = useState<File | null>(null);
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [competitorFile, setCompetitorFile] = useState<File | null>(null);
  const [productUploading, setProductUploading] = useState(false);
  const [pricingUploading, setPricingUploading] = useState(false);
  const [customerUploading, setCustomerUploading] = useState(false);
  const [competitorUploading, setCompetitorUploading] = useState(false);
  const [productUploadStatus, setProductUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pricingUploadStatus, setPricingUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [customerUploadStatus, setCustomerUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [competitorUploadStatus, setCompetitorUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: sentQuotes, isLoading: quotesLoading, error: quotesError } = useQuery<SentQuote[]>({
    queryKey: ["/api/sent-quotes"],
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
    retry: 3,
    retryDelay: 1000,
  });

  const { data: users, isLoading: usersLoading } = useQuery<User[]>({
    queryKey: ["/api/admin/users"],
    staleTime: 1 * 60 * 1000, // 1 minute
    gcTime: 5 * 60 * 1000, // 5 minutes
  });

  const approveUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/approve`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User approved",
        description: "User has been approved and can now access the system",
      });
    },
    onError: (error) => {
      toast({
        title: "Error approving user",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  const rejectUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      return await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}/reject`, {
        method: "POST",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/admin/users"] });
      toast({
        title: "User rejected",
        description: "User has been rejected and cannot access the system",
      });
    },
    onError: (error) => {
      toast({
        title: "Error rejecting user",
        description: error.message,
        variant: "destructive",
      });
    },
  });





  const handleProductFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setProductFile(file);
      setProductUploadStatus('idle');
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const handlePricingFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setPricingFile(file);
      setPricingUploadStatus('idle');
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const handleCustomerFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCustomerFile(file);
      setCustomerUploadStatus('idle');
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const handleCompetitorFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.type === 'text/csv') {
      setCompetitorFile(file);
      setCompetitorUploadStatus('idle');
    } else {
      toast({
        title: "Invalid file type",
        description: "Please select a CSV file",
        variant: "destructive",
      });
    }
  };

  const uploadProductFile = async () => {
    if (!productFile) return;

    setProductUploading(true);
    setProductUploadStatus('idle');

    const formData = new FormData();
    formData.append('file', productFile);

    try {
      const response = await fetch('/api/admin/upload-product-data', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setProductUploadStatus('success');
        toast({
          title: "Success",
          description: "Product data file uploaded successfully",
        });
        // Reset file input
        setProductFile(null);
        const fileInput = document.getElementById('product-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setProductUploadStatus('error');
        toast({
          title: "Upload failed",
          description: "Failed to upload product data file",
          variant: "destructive",
        });
      }
    } catch (error) {
      setProductUploadStatus('error');
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setProductUploading(false);
    }
  };

  const uploadPricingFile = async () => {
    if (!pricingFile) return;

    setPricingUploading(true);
    setPricingUploadStatus('idle');

    const formData = new FormData();
    formData.append('file', pricingFile);

    try {
      const response = await fetch('/api/admin/upload-pricing-data', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setPricingUploadStatus('success');
        toast({
          title: "Success",
          description: "Pricing data file uploaded successfully",
        });
        // Reset file input
        setPricingFile(null);
        const fileInput = document.getElementById('pricing-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setPricingUploadStatus('error');
        toast({
          title: "Upload failed",
          description: "Failed to upload pricing data file",
          variant: "destructive",
        });
      }
    } catch (error) {
      setPricingUploadStatus('error');
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setPricingUploading(false);
    }
  };

  const uploadCustomerFile = async () => {
    if (!customerFile) return;

    setCustomerUploading(true);
    setCustomerUploadStatus('idle');

    const formData = new FormData();
    formData.append('file', customerFile);

    try {
      const response = await fetch('/api/admin/upload-customer-data', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setCustomerUploadStatus('success');
        toast({
          title: "Success",
          description: "Customer data file uploaded successfully",
        });
        // Reset file input
        setCustomerFile(null);
        const fileInput = document.getElementById('customer-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setCustomerUploadStatus('error');
        toast({
          title: "Upload failed",
          description: "Failed to upload customer data file",
          variant: "destructive",
        });
      }
    } catch (error) {
      setCustomerUploadStatus('error');
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setCustomerUploading(false);
    }
  };

  const uploadCompetitorFile = async () => {
    if (!competitorFile) return;

    setCompetitorUploading(true);
    setCompetitorUploadStatus('idle');

    const formData = new FormData();
    formData.append('file', competitorFile);

    try {
      const response = await fetch('/api/admin/upload-competitor-data', {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        setCompetitorUploadStatus('success');
        toast({
          title: "Success",
          description: "Competitor pricing data uploaded successfully. Data is now available for all users.",
        });
        // Reset file input
        setCompetitorFile(null);
        const fileInput = document.getElementById('competitor-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        setCompetitorUploadStatus('error');
        toast({
          title: "Upload failed",
          description: "Failed to upload competitor pricing data",
          variant: "destructive",
        });
      }
    } catch (error) {
      setCompetitorUploadStatus('error');
      toast({
        title: "Upload failed",
        description: "An error occurred while uploading the file",
        variant: "destructive",
      });
    } finally {
      setCompetitorUploading(false);
    }
  };

  const downloadData = async (endpoint: string, filename: string) => {
    try {
      const response = await fetch(endpoint);
      
      if (!response.ok) {
        throw new Error('Download failed');
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download data",
        variant: "destructive",
      });
    }
  };

  const downloadCompetitorPricing = async () => {
    try {
      const response = await fetch('/api/competitor-pricing');
      if (!response.ok) {
        throw new Error('Failed to fetch competitor pricing data');
      }
      
      const data = await response.json();
      
      if (!data || data.length === 0) {
        toast({
          title: "No Data",
          description: "No competitor pricing data available",
          variant: "destructive",
        });
        return;
      }

      // Helper function to parse dimensions into width and height/length
      const parseDimensions = (item: any) => {
        // Use stored width/length/unit if available (newer format)
        if (item.width && item.length && item.unit) {
          return {
            width: `${item.width} ${item.unit}`,
            height: `${item.length} ${item.unit}`
          };
        }
        
        // Fallback to parsing dimensions string (older format)
        const match = item.dimensions.match(/(\d+(?:\.\d+)?)\s*[×x]\s*(\d+(?:\.\d+)?)\s*(in|ft)/);
        if (match) {
          const [, width, height, unit] = match;
          return {
            width: `${width} ${unit}`,
            height: `${height} ${unit}`
          };
        }
        
        // Fallback for unparseable dimensions
        return {
          width: item.dimensions,
          height: ""
        };
      };
      
      const headers = ["Source", "Type", "Width", "Height/Length", "Pack Qty", "Input Price", "Thickness", "Product Kind", "Surface Finish", "Supplier", "Info From", "Price/in²", "Price/ft²", "Price/m²", "Notes", "Date"];
      const csvContent = [
        headers.join(","),
        ...data.map((item: any) => {
          const { width, height } = parseDimensions(item);
          return [
            item.source,
            item.type,
            width,
            height,
            item.packQty,
            `$${item.inputPrice.toFixed(2)}`,
            `"${item.thickness}"`,
            `"${item.productKind}"`,
            `"${item.surfaceFinish}"`,
            `"${item.supplierInfo}"`,
            `"${item.infoReceivedFrom}"`,
            `$${item.pricePerSqIn.toFixed(4)}`,
            `$${item.pricePerSqFt.toFixed(4)}`,
            `$${item.pricePerSqMeter.toFixed(4)}`,
            `"${item.notes}"`,
            new Date(item.timestamp).toLocaleDateString()
          ].join(",");
        })
      ].join("\n");

      const blob = new Blob([csvContent], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `competitor-pricing-data-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      
      toast({
        title: "Success",
        description: "Competitor pricing data downloaded successfully",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to download competitor pricing data",
        variant: "destructive",
      });
    }
  };

  const getStatusIcon = (status: 'idle' | 'success' | 'error') => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-500" />;
      default:
        return null;
    }
  };

  const getStatusMessage = (status: 'idle' | 'success' | 'error') => {
    switch (status) {
      case 'success':
        return "File uploaded successfully";
      case 'error':
        return "Upload failed";
      default:
        return "";
    }
  };

  return (
    <div className="min-h-screen py-8 px-4 sm:px-6 lg:px-8 bg-background">
      <div className="max-w-4xl mx-auto">
        {/* Header with Back Button */}
        <div className="flex items-center justify-between mb-8">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-secondary mb-2 flex items-center justify-center gap-2">
              <Settings className="h-8 w-8" />
              Admin Panel
            </h1>
            <p className="text-muted-foreground">
              Upload and manage CSV data files for the quote calculator
            </p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Important Notice */}
        <Alert className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Uploading new files will replace existing data. 
            Make sure to backup your current data before proceeding.
          </AlertDescription>
        </Alert>

        {/* User Management Section */}
        <Card className="shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-primary" />
              User Management
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {usersLoading ? (
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
                <p className="mt-2 text-sm text-muted-foreground">Loading users...</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Created</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users?.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.firstName} {user.lastName}
                        </TableCell>
                        <TableCell>{user.email}</TableCell>
                        <TableCell>
                          <Badge variant={user.role === 'admin' ? 'default' : 'secondary'}>
                            {user.role}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge 
                            variant={
                              user.status === 'approved' ? 'default' : 
                              user.status === 'pending' ? 'secondary' : 
                              'destructive'
                            }
                          >
                            {user.status === 'pending' && <Clock className="h-3 w-3 mr-1" />}
                            {user.status}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {new Date(user.createdAt).toLocaleDateString()}
                        </TableCell>
                        <TableCell>
                          {user.status === 'pending' && (
                            <div className="flex gap-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => approveUserMutation.mutate(user.id)}
                                disabled={approveUserMutation.isPending}
                              >
                                <UserCheck className="h-4 w-4 mr-1" />
                                Approve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => rejectUserMutation.mutate(user.id)}
                                disabled={rejectUserMutation.isPending}
                              >
                                <UserX className="h-4 w-4 mr-1" />
                                Reject
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Product Data Upload */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Product Data File
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>File:</strong> PricePAL_All_Product_Data.csv
                  </p>
                  <p className="mb-2">
                    <strong>Contains:</strong> Product categories, types, sizes, and basic product information
                  </p>
                  <p>
                    <strong>Format:</strong> CSV with headers (ProductID, ProductName, ProductType, Size, etc.)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="product-file">Select Product Data File</Label>
                  <Input
                    id="product-file"
                    type="file"
                    accept=".csv"
                    onChange={handleProductFileChange}
                    disabled={productUploading}
                  />
                </div>

                {productFile && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{productFile.name}</span>
                      <span className="text-muted-foreground">
                        ({(productFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={uploadProductFile}
                  disabled={!productFile || productUploading}
                  className="w-full"
                >
                  {productUploading ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Product Data
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => downloadData('/api/admin/download-product-data', 'product-data.csv')}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Product Data
                </Button>

                {productUploadStatus !== 'idle' && (
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(productUploadStatus)}
                    <span className={productUploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {getStatusMessage(productUploadStatus)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Pricing Data Upload */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Pricing Data File
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>File:</strong> tier_pricing_template.csv
                  </p>
                  <p className="mb-2">
                    <strong>Contains:</strong> Pricing tiers and price per square meter for different customer levels
                  </p>
                  <p>
                    <strong>Format:</strong> CSV with pricing tier columns (EXPORT, MASTER_DISTRIBUTOR, DEALER, etc.)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="pricing-file">Select Pricing Data File</Label>
                  <Input
                    id="pricing-file"
                    type="file"
                    accept=".csv"
                    onChange={handlePricingFileChange}
                    disabled={pricingUploading}
                  />
                </div>

                {pricingFile && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{pricingFile.name}</span>
                      <span className="text-muted-foreground">
                        ({(pricingFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={uploadPricingFile}
                  disabled={!pricingFile || pricingUploading}
                  className="w-full"
                >
                  {pricingUploading ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Pricing Data
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => downloadData('/api/admin/download-pricing-data', 'pricing-data.csv')}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Pricing Data
                </Button>

                {pricingUploadStatus !== 'idle' && (
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(pricingUploadStatus)}
                    <span className={pricingUploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {getStatusMessage(pricingUploadStatus)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Customer Data Upload */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-primary" />
                Customer Data File
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>File:</strong> customers_export.csv
                  </p>
                  <p className="mb-2">
                    <strong>Contains:</strong> Customer information including names, emails, addresses, and purchase history
                  </p>
                  <p>
                    <strong>Format:</strong> CSV with headers (Customer ID, First Name, Last Name, Email, etc.)
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="customer-file">Select Customer Data File</Label>
                  <Input
                    id="customer-file"
                    type="file"
                    accept=".csv"
                    onChange={handleCustomerFileChange}
                    disabled={customerUploading}
                  />
                </div>

                {customerFile && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{customerFile.name}</span>
                      <span className="text-muted-foreground">
                        ({(customerFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={uploadCustomerFile}
                  disabled={!customerFile || customerUploading}
                  className="w-full"
                >
                  {customerUploading ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Customer Data
                    </>
                  )}
                </Button>

                <Button
                  onClick={() => downloadData('/api/admin/download-customer-data', 'customer-data.csv')}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Customer Data
                </Button>

                {customerUploadStatus !== 'idle' && (
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(customerUploadStatus)}
                    <span className={customerUploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {getStatusMessage(customerUploadStatus)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Competitor Pricing Data Upload */}
          <Card className="shadow-lg">
            <CardHeader className="border-b">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                Competitor Pricing Data
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="text-sm text-muted-foreground">
                  <p className="mb-2">
                    <strong>Source:</strong> Data collected from Area Pricer calculations and uploaded CSV files
                  </p>
                  <p className="mb-2">
                    <strong>Contains:</strong> Pricing information, product details, supplier info, and pricing per unit
                  </p>
                  <p>
                    <strong>Format:</strong> CSV with all calculation details including dimensions, pricing tiers, and source information
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="competitor-file">Upload Competitor Pricing Data</Label>
                  <Input
                    id="competitor-file"
                    type="file"
                    accept=".csv"
                    onChange={handleCompetitorFileChange}
                    disabled={competitorUploading}
                  />
                </div>

                {competitorFile && (
                  <div className="bg-muted/50 p-3 rounded-lg">
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4" />
                      <span className="font-medium">{competitorFile.name}</span>
                      <span className="text-muted-foreground">
                        ({(competitorFile.size / 1024).toFixed(1)} KB)
                      </span>
                    </div>
                  </div>
                )}

                <Button
                  onClick={uploadCompetitorFile}
                  disabled={!competitorFile || competitorUploading}
                  className="w-full"
                >
                  {competitorUploading ? (
                    <>
                      <Upload className="h-4 w-4 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-4 w-4 mr-2" />
                      Upload Competitor Data
                    </>
                  )}
                </Button>

                <Button
                  onClick={downloadCompetitorPricing}
                  variant="outline"
                  className="w-full"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download Competitor Pricing Data
                </Button>

                {competitorUploadStatus !== 'idle' && (
                  <div className="flex items-center gap-2 text-sm">
                    {getStatusIcon(competitorUploadStatus)}
                    <span className={competitorUploadStatus === 'success' ? 'text-green-600' : 'text-red-600'}>
                      {getStatusMessage(competitorUploadStatus)}
                    </span>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Usage Instructions */}
        <Card className="shadow-lg mt-8">
          <CardHeader className="border-b">
            <CardTitle>Usage Instructions</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4 text-sm">
              <div>
                <h3 className="font-semibold mb-2">1. Product Data File</h3>
                <p className="text-muted-foreground">
                  This file contains all product information including categories, types, sizes, and specifications. 
                  The system will automatically parse the data and create the hierarchical product structure.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">2. Pricing Data File</h3>
                <p className="text-muted-foreground">
                  This file contains pricing information for different customer tiers. Each tier represents 
                  a different customer level with corresponding pricing per square meter.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">3. Customer Data File</h3>
                <p className="text-muted-foreground">
                  This file contains customer information including contact details, purchase history, and 
                  customer tiers. Used for quote generation and customer management.
                </p>
              </div>
              <div>
                <h3 className="font-semibold mb-2">4. Upload Process</h3>
                <p className="text-muted-foreground">
                  Upload files one at a time. The system will validate the file format and update the database 
                  with the new information. Changes take effect immediately.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Sent Quotes Section */}
        <Card className="shadow-lg mt-8">
          <CardHeader className="border-b">
            <CardTitle className="flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Sent Quotes
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                <p className="mb-4">
                  <strong>All generated quotes are automatically saved here.</strong> This includes both PDF and email quotes generated from the quote calculator.
                </p>
              </div>

              {quotesLoading ? (
                <div className="flex justify-center py-8">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                </div>
              ) : quotesError ? (
                <div className="text-center py-8 text-red-600">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>Error loading quotes. Please refresh the page.</p>
                  <p className="text-sm mt-2">{quotesError.message}</p>
                </div>
              ) : sentQuotes && Array.isArray(sentQuotes) && sentQuotes.length > 0 ? (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Quote #</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Total Amount</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {sentQuotes.map((quote) => (
                        <TableRow key={quote.id}>
                          <TableCell className="font-medium">{quote.quoteNumber}</TableCell>
                          <TableCell>{quote.customerName}</TableCell>
                          <TableCell>{quote.customerEmail || 'N/A'}</TableCell>
                          <TableCell>${quote.totalAmount ? parseFloat(quote.totalAmount).toFixed(2) : '0.00'}</TableCell>
                          <TableCell>{new Date(quote.createdAt).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 flex-wrap">
                              {quote.sentVia && quote.sentVia.trim() && quote.sentVia.split(',').map((method, index) => {
                                const trimmedMethod = method.trim();
                                return (
                                  <Badge key={index} variant={trimmedMethod === 'email' ? 'default' : 'secondary'}>
                                    {trimmedMethod === 'email' ? (
                                      <><Mail className="h-3 w-3 mr-1" />Email</>
                                    ) : (
                                      <><Download className="h-3 w-3 mr-1" />PDF</>
                                    )}
                                  </Badge>
                                );
                              })}
                              {(!quote.sentVia || !quote.sentVia.trim()) && (
                                <Badge variant="secondary">
                                  <Download className="h-3 w-3 mr-1" />PDF
                                </Badge>
                              )}
                            </div>
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
                <div className="text-center py-8 text-muted-foreground">
                  <FileText className="h-12 w-12 mx-auto mb-4 opacity-50" />
                  <p>No quotes have been generated yet.</p>
                  <p className="text-sm mt-2">Generated quotes will appear here automatically.</p>
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
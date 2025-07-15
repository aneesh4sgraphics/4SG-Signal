import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Upload, FileText, CheckCircle, AlertCircle, Settings } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export default function Admin() {
  const [productFile, setProductFile] = useState<File | null>(null);
  const [pricingFile, setPricingFile] = useState<File | null>(null);
  const [customerFile, setCustomerFile] = useState<File | null>(null);
  const [productUploading, setProductUploading] = useState(false);
  const [pricingUploading, setPricingUploading] = useState(false);
  const [customerUploading, setCustomerUploading] = useState(false);
  const [productUploadStatus, setProductUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [pricingUploadStatus, setPricingUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [customerUploadStatus, setCustomerUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const { toast } = useToast();

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
        {/* Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-secondary mb-2 flex items-center justify-center gap-2">
            <Settings className="h-8 w-8" />
            Admin Panel
          </h1>
          <p className="text-muted-foreground">
            Upload and manage CSV data files for the quote calculator
          </p>
        </div>

        {/* Important Notice */}
        <Alert className="mb-8">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            <strong>Important:</strong> Uploading new files will replace existing data. 
            Make sure to backup your current data before proceeding.
          </AlertDescription>
        </Alert>

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
      </div>
    </div>
  );
}
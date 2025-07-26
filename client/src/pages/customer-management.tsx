import { useState, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Users, Upload, Download, FileSpreadsheet, CheckCircle, AlertCircle } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface CustomerData {
  "Customer ID": string;
  "First Name": string;
  "Last Name": string;
  "Email": string;
  "Accepts Email Marketing": string;
  "Default Address Company": string;
  "Default Address Address1": string;
  "Default Address Address2": string;
  "Default Address City": string;
  "Default Address Province Code": string;
  "Default Address Country Code": string;
  "Default Address Zip": string;
  "Default Address Phone": string;
  "Phone": string;
  "Accepts SMS Marketing": string;
  "Total Spent": string;
  "Total Orders": string;
  "Note": string;
  "Tax Exempt": string;
  "Tags": string;
}

export default function CustomerManagement() {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadResult, setUploadResult] = useState<{ success: boolean; message: string; count?: number } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Fetch current customer data stats  
  const { data: customerData = [], isLoading } = useQuery<CustomerData[]>({
    queryKey: ['/api/customers'],
  });

  const stats = {
    totalCustomers: customerData.length
  };

  const handleFileUpload = async (file: File) => {
    if (!file.name.endsWith('.csv')) {
      toast({
        title: "Invalid File Type",
        description: "Please upload a CSV file (.csv)",
        variant: "destructive",
      });
      return;
    }

    setIsUploading(true);
    setUploadProgress(10);
    setUploadResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      setUploadProgress(30);
      
      const response = await fetch('/api/admin/upload-customer-data', {
        method: 'POST',
        body: formData
      });

      setUploadProgress(70);

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: `HTTP ${response.status}: ${response.statusText}`, details: errorText };
        }
        throw new Error(errorData.error || `Upload failed with status ${response.status}`);
      }

      const result = await response.json();
      setUploadProgress(100);
      
      setUploadResult({
        success: true,
        message: `Successfully uploaded ${result.recordsProcessed || 0} customers`,
        count: result.recordsProcessed
      });

      // Refresh the data
      queryClient.invalidateQueries({ queryKey: ['/api/customers'] });

      toast({
        title: "Upload Successful",
        description: `Processed ${result.recordsProcessed || 0} customers from ${file.name}`,
      });

    } catch (error) {
      console.error("Upload error:", error);
      
      let errorMessage = "Unknown error occurred";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      setUploadResult({
        success: false,
        message: errorMessage
      });

      toast({
        title: "Upload Failed",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
      setTimeout(() => {
        setUploadProgress(0);
        setUploadResult(null);
      }, 5000);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDownloadTemplate = () => {
    // Create a sample CSV template based on the CustomerData interface
    const headers = [
      "Customer ID", "First Name", "Last Name", "Email", "Accepts Email Marketing",
      "Default Address Company", "Default Address Address1", "Default Address Address2",
      "Default Address City", "Default Address Province Code", "Default Address Country Code",
      "Default Address Zip", "Default Address Phone", "Phone", "Accepts SMS Marketing",
      "Total Spent", "Total Orders", "Note", "Tax Exempt", "Tags"
    ];
    
    const sampleData = [
      "'595909214328", "Paul", "Hendrickson", "paul@printbasics.com", "yes",
      "Print Basics", "1061 SW 30th Ave", "", "Deerfield Beach", "FL", "US",
      "33442", "'(954) 354-0700", "'+19543540700", "no",
      "18005.88", "26", "Sample customer note", "yes", "#stage3-Printer"
    ];

    const csvContent = [
      headers.join(","),
      sampleData.join(",")
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "customer-template.csv";
    a.click();
    URL.revokeObjectURL(url);

    toast({
      title: "Template Downloaded",
      description: "Customer CSV template has been downloaded",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-4xl font-bold text-blue-900 mb-2 flex items-center justify-center gap-3">
            <Users className="h-10 w-10 text-blue-600" />
            Customer Management
          </h1>
          <p className="text-blue-700 text-lg">
            Upload and manage customer data for all applications
          </p>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-1 gap-6">
          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg text-blue-900 flex items-center gap-2">
                <Users className="h-5 w-5" />
                Total Customers
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-blue-600">
                {isLoading ? "..." : stats.totalCustomers.toLocaleString()}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Upload Section */}
        <Card className="bg-white shadow-xl border-0">
          <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white rounded-t-lg">
            <CardTitle className="text-2xl flex items-center gap-3">
              <Upload className="h-6 w-6" />
              Upload Customer Data
            </CardTitle>
            <CardDescription className="text-blue-100 text-base">
              Upload your customer CSV file to update the database
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-6">
            
            {/* Upload Progress */}
            {isUploading && (
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-blue-600 font-medium">Uploading...</span>
                  <span className="text-blue-500">{uploadProgress}%</span>
                </div>
                <Progress value={uploadProgress} className="h-2" />
              </div>
            )}

            {/* Upload Result */}
            {uploadResult && (
              <Alert className={uploadResult.success ? "border-green-200 bg-green-50" : "border-red-200 bg-red-50"}>
                {uploadResult.success ? (
                  <CheckCircle className="h-4 w-4 text-green-600" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-red-600" />
                )}
                <AlertDescription className={uploadResult.success ? "text-green-800" : "text-red-800"}>
                  {uploadResult.message}
                  {uploadResult.count && (
                    <span className="block mt-1 font-semibold">
                      {uploadResult.count} records processed
                    </span>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {/* Upload Controls */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-3">
                <h3 className="font-semibold text-blue-900 flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4" />
                  Upload CSV File
                </h3>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  disabled={isUploading}
                  className="block w-full text-sm text-blue-600
                           file:mr-4 file:py-2 file:px-4
                           file:rounded-lg file:border-0
                           file:text-sm file:font-semibold
                           file:bg-blue-600 file:text-white
                           hover:file:bg-blue-700
                           file:disabled:opacity-50"
                />
                <p className="text-xs text-blue-600">
                  Supports CSV files with customer data
                </p>
              </div>

              <div className="space-y-3">
                <h3 className="font-semibold text-blue-900">Download Template</h3>
                <Button
                  onClick={handleDownloadTemplate}
                  variant="outline"
                  className="w-full border-blue-300 text-blue-700 hover:bg-blue-50"
                >
                  <Download className="h-4 w-4 mr-2" />
                  Download CSV Template
                </Button>
                <p className="text-xs text-blue-600">
                  Get a sample CSV format to follow
                </p>
              </div>
            </div>

            {/* Current Data Info */}
            <div className="bg-blue-50 rounded-lg p-4 border border-blue-200">
              <h3 className="font-semibold text-blue-900 mb-2">Current Data</h3>
              <div className="text-sm">
                <div>
                  <span className="text-blue-600">Total Records:</span>
                  <span className="ml-2 font-semibold text-blue-800">
                    {stats.totalCustomers.toLocaleString()}
                  </span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div className="bg-yellow-50 rounded-lg p-4 border border-yellow-200">
              <h3 className="font-semibold text-yellow-900 mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4" />
                Upload Instructions
              </h3>
              <ul className="text-sm text-yellow-800 space-y-1">
                <li>• CSV files should include Customer ID, Name, Email, Company, and Address fields</li>
                <li>• New customers will be added, existing customers will be updated</li>
                <li>• Matching is done by Customer ID or Email address</li>
                <li>• All uploaded data will be available across QuickQuotes and Price List apps</li>
              </ul>
            </div>
          </CardContent>
        </Card>

        {/* Back to Dashboard */}
        <div className="text-center">
          <Button 
            onClick={() => window.history.back()}
            variant="outline" 
            className="bg-white border-blue-300 text-blue-700 hover:bg-blue-50"
          >
            ← Back to Dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
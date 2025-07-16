import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { ArrowLeft, Download, DollarSign, Package, FileText, ChevronDown, FileDown, User } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ProductCategory {
  id: number;
  name: string;
  description: string;
}

interface ProductType {
  id: number;
  categoryId: number;
  name: string;
  description: string;
}

interface ProductSize {
  id: number;
  typeId: number;
  name: string;
  width: string;
  height: string;
  widthUnit: string;
  heightUnit: string;
  squareMeters: string;
  itemCode: string;
  minOrderQty: string;
}

interface PricingTier {
  id: number;
  name: string;
  description: string;
  minSquareMeters: string;
  maxSquareMeters: string;
  pricePerSquareMeter: string;
}

interface ProductPricing {
  id: number;
  productTypeId: number;
  tierId: number;
  pricePerSquareMeter: string;
}

interface PriceListItem {
  size: ProductSize;
  type: ProductType;
  pricing: ProductPricing[];
}

export default function PriceList() {
  const [selectedCategory, setSelectedCategory] = useState<string>("");
  const [selectedTier, setSelectedTier] = useState<string>("");
  const [showPriceList, setShowPriceList] = useState<boolean>(false);
  const [selectedRows, setSelectedRows] = useState<Set<string>>(new Set());
  const [clientName, setClientName] = useState<string>("");
  const [showDownloadDialog, setShowDownloadDialog] = useState<boolean>(false);
  const [downloadType, setDownloadType] = useState<"pdf" | "csv">("pdf");
  const { toast } = useToast();

  // Fetch all data
  const { data: categories = [], isLoading: categoriesLoading } = useQuery({
    queryKey: ["/api/product-categories"],
  });

  const { data: tiers = [], isLoading: tiersLoading } = useQuery({
    queryKey: ["/api/pricing-tiers"],
  });

  // Fetch category-specific data only when category is selected
  const { data: categoryTypes = [], isLoading: categoryTypesLoading } = useQuery({
    queryKey: ["/api/product-types", selectedCategory],
    enabled: !!selectedCategory,
  });

  const { data: allSizes = [], isLoading: allSizesLoading } = useQuery({
    queryKey: ["/api/product-sizes"],
    enabled: !!selectedCategory,
  });

  const { data: allPricing = [], isLoading: allPricingLoading } = useQuery({
    queryKey: ["/api/product-pricing"],
    enabled: !!selectedCategory,
  });

  const isLoading = categoriesLoading || tiersLoading || 
    (selectedCategory && (categoryTypesLoading || allSizesLoading || allPricingLoading));

  // Get selected category data
  const selectedCategoryData = categories.find((c: ProductCategory) => c.id === parseInt(selectedCategory));
  const selectedTierData = tiers.find((t: PricingTier) => t.id === parseInt(selectedTier));

  // Create price list items for selected category
  const priceListItems: PriceListItem[] = selectedCategory && selectedTier ? 
    categoryTypes.flatMap((type: ProductType) => {
      const typeSizes = allSizes.filter((size: ProductSize) => size.typeId === type.id);
      const typePricing = allPricing.filter((p: ProductPricing) => p.productTypeId === type.id);
      
      return typeSizes.map((size: ProductSize) => ({
        size,
        type,
        pricing: typePricing
      }));
    }) : [];

  // Get price for selected tier
  const getPriceForTier = (item: PriceListItem, tierId: number) => {
    const tierPricing = item.pricing.find((p: ProductPricing) => p.tierId === tierId);
    if (tierPricing) {
      const pricePerSqm = parseFloat(tierPricing.pricePerSquareMeter);
      const squareMeters = parseFloat(item.size.squareMeters);
      return pricePerSqm * squareMeters;
    }
    return 0;
  };

  // Generate price list function
  const generatePriceList = () => {
    if (!selectedCategory || !selectedTier) {
      toast({
        title: "Missing Selection",
        description: "Please select both a product category and pricing tier.",
        variant: "destructive",
      });
      return;
    }
    setShowPriceList(true);
    setSelectedRows(new Set());
  };

  // Row selection handlers
  const handleRowToggle = (rowId: string) => {
    const newSelectedRows = new Set(selectedRows);
    if (newSelectedRows.has(rowId)) {
      newSelectedRows.delete(rowId);
    } else {
      newSelectedRows.add(rowId);
    }
    setSelectedRows(newSelectedRows);
  };

  const handleSelectAllRows = () => {
    const allRowIds = priceListItems.map(item => `${item.size.id}-${item.type.id}`);
    setSelectedRows(new Set(allRowIds));
  };

  const handleDeselectAllRows = () => {
    setSelectedRows(new Set());
  };

  // Download functions
  const handleDownload = async (type: "pdf" | "csv") => {
    if (!clientName.trim()) {
      toast({
        title: "Client Name Required",
        description: "Please enter a client name before downloading.",
        variant: "destructive",
      });
      return;
    }

    const selectedItems = selectedRows.size > 0 
      ? priceListItems.filter(item => selectedRows.has(`${item.size.id}-${item.type.id}`))
      : priceListItems;

    if (selectedItems.length === 0) {
      toast({
        title: "No Items Selected",
        description: "Please select at least one item to download.",
        variant: "destructive",
      });
      return;
    }

    try {
      if (type === "pdf") {
        await downloadPDF(selectedItems);
      } else {
        await downloadCSV(selectedItems);
      }
      setShowDownloadDialog(false);
      setClientName("");
    } catch (error) {
      toast({
        title: "Download Failed",
        description: "Failed to generate download. Please try again.",
        variant: "destructive",
      });
    }
  };

  const downloadPDF = async (items: PriceListItem[]) => {
    const response = await fetch('/api/generate-price-list-pdf', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: clientName.trim(),
        categoryName: selectedCategoryData?.name,
        tierName: selectedTierData?.name,
        items: items.map(item => ({
          size: item.size,
          type: item.type,
          pricing: item.pricing.find(p => p.tierId === parseInt(selectedTier))
        }))
      })
    });

    if (!response.ok) throw new Error('Failed to generate PDF');

    const data = await response.json();
    const { html, filename } = data;

    // Create a new window with the HTML content
    const newWindow = window.open('', '_blank');
    if (!newWindow) {
      toast({
        title: "Popup blocked",
        description: "Please allow popups for this site and try again.",
        variant: "destructive",
      });
      return;
    }

    // Write the HTML content to the new window
    newWindow.document.write(html);
    newWindow.document.close();

    // Add a print button and instructions
    const printButton = newWindow.document.createElement('button');
    printButton.textContent = 'Print to PDF';
    printButton.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      z-index: 9999;
      background: #007bff;
      color: white;
      border: none;
      padding: 10px 20px;
      border-radius: 5px;
      cursor: pointer;
      font-size: 16px;
    `;
    printButton.onclick = () => {
      newWindow.print();
    };
    
    newWindow.document.body.appendChild(printButton);

    // Show success toast
    toast({
      title: "PDF preview opened",
      description: "Click 'Print to PDF' in the new window to save the PDF file.",
      duration: 5000,
    });
  };

  const downloadCSV = async (items: PriceListItem[]) => {
    const response = await fetch('/api/generate-price-list-csv', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clientName: clientName.trim(),
        categoryName: selectedCategoryData?.name,
        tierName: selectedTierData?.name,
        items: items.map(item => ({
          size: item.size,
          type: item.type,
          pricing: item.pricing.find(p => p.tierId === parseInt(selectedTier))
        }))
      })
    });

    if (!response.ok) throw new Error('Failed to generate CSV');

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${selectedCategoryData?.name}_${selectedTierData?.name}_${clientName.trim()}.csv`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-4xl mx-auto space-y-6">
        
        {/* Header with Back Button */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900 flex items-center justify-center gap-2">
              <FileText className="h-8 w-8" />
              Price List
            </h1>
            <p className="text-gray-600">Generate comprehensive product pricing lists</p>
          </div>
          <div className="w-32"></div> {/* Spacer for centering */}
        </div>

        {/* Configuration Section */}
        {!showPriceList && (
          <Card className="shadow-sm">
            <CardHeader className="pb-6">
              <CardTitle className="text-2xl font-bold text-gray-900">Configure Standard Price List</CardTitle>
              <p className="text-gray-600">Select a product and pricing tier to generate the list.</p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Select Product */}
              <div className="space-y-3">
                <label className="block text-base font-medium text-gray-900">Select Product</label>
                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-full h-12 text-base">
                    <SelectValue placeholder="Choose a product..." />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((category: ProductCategory) => (
                      <SelectItem key={category.id} value={category.id.toString()}>
                        {category.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Select Pricing Tier */}
              <div className="space-y-3">
                <label className="block text-base font-medium text-gray-900">Select Pricing Tier</label>
                <Select value={selectedTier} onValueChange={setSelectedTier}>
                  <SelectTrigger className="w-full h-12 text-base">
                    <SelectValue placeholder="Choose a pricing tier..." />
                  </SelectTrigger>
                  <SelectContent>
                    {tiers.map((tier: PricingTier) => (
                      <SelectItem key={tier.id} value={tier.id.toString()}>
                        {tier.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              {/* Generate Button */}
              <Button 
                onClick={generatePriceList} 
                className="w-full h-12 text-base bg-purple-600 hover:bg-purple-700" 
                disabled={!selectedCategory || !selectedTier}
              >
                Generate Price List
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Price List Results */}
        {showPriceList && selectedCategoryData && selectedTierData && (
          <Card className="shadow-sm">
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg">
                    <Package className="h-5 w-5" />
                    Price List - {selectedCategoryData.name}
                  </CardTitle>
                  <p className="text-sm text-gray-600 mt-1">
                    Pricing tier: <Badge variant="secondary">{selectedTierData.name}</Badge>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button 
                    variant="outline" 
                    onClick={() => setShowPriceList(false)}
                    className="flex items-center gap-2"
                  >
                    <ChevronDown className="h-4 w-4" />
                    Configure
                  </Button>
                  <Dialog open={showDownloadDialog} onOpenChange={setShowDownloadDialog}>
                    <DialogTrigger asChild>
                      <Button className="flex items-center gap-2">
                        <FileDown className="h-4 w-4" />
                        Download PDF
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Download Price List</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4">
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Client Name *</label>
                          <Input
                            placeholder="Enter client name"
                            value={clientName}
                            onChange={(e) => setClientName(e.target.value)}
                          />
                        </div>
                        <div className="space-y-2">
                          <label className="text-sm font-medium">Download Type</label>
                          <Select value={downloadType} onValueChange={(value: "pdf" | "csv") => setDownloadType(value)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="pdf">PDF</SelectItem>
                              <SelectItem value="csv">CSV</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="text-sm text-gray-600">
                          {selectedRows.size > 0 ? (
                            <span>{selectedRows.size} rows selected</span>
                          ) : (
                            <span>All rows will be downloaded</span>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button
                            variant="outline"
                            onClick={() => setShowDownloadDialog(false)}
                          >
                            Cancel
                          </Button>
                          <Button onClick={() => handleDownload(downloadType)}>
                            Download {downloadType.toUpperCase()}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                  <Button 
                    variant="outline" 
                    onClick={() => {
                      setDownloadType("csv");
                      setShowDownloadDialog(true);
                    }}
                    className="flex items-center gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Export CSV
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {priceListItems.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  No items found for this product category and pricing tier.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      Showing {priceListItems.length} items
                    </div>
                    <div className="flex items-center gap-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleSelectAllRows}
                      >
                        Select All
                      </Button>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={handleDeselectAllRows}
                      >
                        Deselect All
                      </Button>
                    </div>
                  </div>
                  
                  {/* Group items by product type */}
                  {categoryTypes.map((type: ProductType) => {
                    const typeItems = priceListItems.filter(item => item.type.id === type.id);
                    if (typeItems.length === 0) return null;
                    
                    return (
                      <div key={type.id} className="border rounded-lg overflow-hidden">
                        <div className="bg-gray-50 px-4 py-3 border-b">
                          <h3 className="font-medium text-gray-900">{type.name}</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full">
                            <thead>
                              <tr className="border-b border-gray-200">
                                <th className="text-left py-3 px-4 font-medium text-gray-700 w-12">
                                  <Checkbox 
                                    checked={typeItems.every(item => selectedRows.has(`${item.size.id}-${item.type.id}`))}
                                    onCheckedChange={(checked) => {
                                      const typeRowIds = typeItems.map(item => `${item.size.id}-${item.type.id}`);
                                      const newSelectedRows = new Set(selectedRows);
                                      if (checked) {
                                        typeRowIds.forEach(id => newSelectedRows.add(id));
                                      } else {
                                        typeRowIds.forEach(id => newSelectedRows.delete(id));
                                      }
                                      setSelectedRows(newSelectedRows);
                                    }}
                                  />
                                </th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Size</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Item Code</th>
                                <th className="text-left py-3 px-4 font-medium text-gray-700">Min Qty</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-700">Price/Sq.M</th>
                                <th className="text-right py-3 px-4 font-medium text-gray-700">Total Price</th>
                              </tr>
                            </thead>
                            <tbody>
                              {typeItems.map((item, index) => {
                                const price = getPriceForTier(item, parseInt(selectedTier));
                                const pricePerSqm = item.pricing.find((p: ProductPricing) => p.tierId === parseInt(selectedTier))?.pricePerSquareMeter || "0";
                                const rowId = `${item.size.id}-${item.type.id}`;
                                
                                return (
                                  <tr key={`${item.size.id}-${index}`} className={`border-b border-gray-100 hover:bg-gray-50 ${selectedRows.has(rowId) ? 'bg-blue-50' : ''}`}>
                                    <td className="py-3 px-4">
                                      <Checkbox
                                        checked={selectedRows.has(rowId)}
                                        onCheckedChange={() => handleRowToggle(rowId)}
                                      />
                                    </td>
                                    <td className="py-3 px-4 text-sm">{item.size.name}</td>
                                    <td className="py-3 px-4 text-sm">
                                      <Badge variant="secondary" className="text-xs">
                                        {item.size.itemCode}
                                      </Badge>
                                    </td>
                                    <td className="py-3 px-4 text-sm">{item.size.minOrderQty}</td>
                                    <td className="py-3 px-4 text-sm text-right font-medium">
                                      ${parseFloat(pricePerSqm).toFixed(2)}
                                    </td>
                                    <td className="py-3 px-4 text-sm text-right font-bold text-green-600">
                                      ${price.toFixed(2)}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
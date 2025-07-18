import React, { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calculator, Plus, Sheet, Trash2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface CalculationResult {
  id: string;
  type: "sheets" | "roll";
  width: number;
  length: number;
  height: number;
  packQty: number;
  inputPrice: number;
  thickness: string;
  productKind: string;
  surfaceFinish: string;
  supplierInfo: string;
  infoReceivedFrom: string;
  pricePerSqIn: number;
  pricePerSqFt: number;
  pricePerSqMeter: number;
  totalSqIn: number;
  totalSqFt: number;
  totalSqMeter: number;
  notes: string;
  timestamp: Date;
}

export default function AreaPricer() {
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  
  // Form state
  const [calculationType, setCalculationType] = useState<"sheets" | "roll">("sheets");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [sheetsPerPack, setSheetsPerPack] = useState("");
  const [pricePerPack, setPricePerPack] = useState("");
  const [thickness, setThickness] = useState("");
  const [productKind, setProductKind] = useState("");
  const [surfaceFinish, setSurfaceFinish] = useState("");
  const [supplierInfo, setSupplierInfo] = useState("");
  const [customSupplier, setCustomSupplier] = useState("");
  const [showCustomSupplier, setShowCustomSupplier] = useState(false);
  const [savedCustomSuppliers, setSavedCustomSuppliers] = useState<string[]>([]);
  const [infoReceivedFrom, setInfoReceivedFrom] = useState("");
  const [notes, setNotes] = useState("");
  
  // Results state
  const [calculations, setCalculations] = useState<CalculationResult[]>([]);
  const [currentResult, setCurrentResult] = useState<CalculationResult | null>(null);
  
  // Loading states
  const [isCalculating, setIsCalculating] = useState(false);
  const [isAddingToCompInfo, setIsAddingToCompInfo] = useState(false);

  const calculate = () => {
    setIsCalculating(true);
    
    try {
      const w = parseFloat(width);
      const h = parseFloat(height);
      const qty = parseFloat(sheetsPerPack);
      const price = parseFloat(pricePerPack);

      if (isNaN(w) || isNaN(h) || isNaN(qty) || isNaN(price)) {
        toast({
          title: "Invalid Input",
          description: "Please enter valid numbers for all required fields",
          variant: "destructive",
        });
        return;
      }

      if (w <= 0 || h <= 0 || qty <= 0 || price <= 0) {
        toast({
          title: "Invalid Input",
          description: "All values must be greater than 0",
          variant: "destructive",
        });
        return;
      }

      // Calculate areas
      let totalSqIn: number;
      let totalSqFt: number;
      let totalSqMeter: number;
      let pricePerSqIn: number;
      let pricePerSqFt: number;
      let pricePerSqMeter: number;

      if (calculationType === "sheets") {
        totalSqIn = w * h * qty;
        totalSqFt = totalSqIn / 144;
        totalSqMeter = totalSqFt / 10.7639;
        
        pricePerSqIn = price / totalSqIn;
        pricePerSqFt = pricePerSqIn * 144;
        pricePerSqMeter = pricePerSqFt * 10.7639;
      } else {
        // Roll calculation - w is width in feet, h is length in feet
        totalSqFt = w * h * qty;
        totalSqIn = totalSqFt * 144;
        totalSqMeter = totalSqFt / 10.7639;
        
        pricePerSqFt = price / totalSqFt;
        pricePerSqIn = pricePerSqFt / 144;
        pricePerSqMeter = pricePerSqFt * 10.7639;
      }

      const result: CalculationResult = {
        id: Date.now().toString(),
        type: calculationType,
        width: w,
        length: h,
        height: h,
        packQty: qty,
        inputPrice: price,
        thickness: thickness || "Unknown",
        productKind: productKind || "Unknown",
        surfaceFinish: surfaceFinish || "Unknown",
        supplierInfo: supplierInfo || "Unknown",
        infoReceivedFrom: infoReceivedFrom || "Unknown",
        pricePerSqIn,
        pricePerSqFt,
        pricePerSqMeter,
        totalSqIn,
        totalSqFt,
        totalSqMeter,
        notes: notes || "",
        timestamp: new Date(),
      };

      setCurrentResult(result);
      toast({
        title: "Calculation Complete",
        description: `Price per ${calculationType === "sheets" ? "square inch" : "square foot"}: $${(calculationType === "sheets" ? pricePerSqIn : pricePerSqFt).toFixed(4)}`,
      });
    } catch (error) {
      console.error("Calculation error:", error);
      toast({
        title: "Calculation Error",
        description: "An error occurred during calculation",
        variant: "destructive",
      });
    } finally {
      setIsCalculating(false);
    }
  };

  const addToSheet = () => {
    if (!currentResult) {
      toast({
        title: "No Calculation",
        description: "Please calculate first before adding to sheet",
        variant: "destructive",
      });
      return;
    }

    setCalculations(prev => [...prev, currentResult]);
    setCurrentResult(null);
    
    // Clear form
    setWidth("");
    setHeight("");
    setSheetsPerPack("");
    setPricePerPack("");
    setThickness("");
    setProductKind("");
    setSurfaceFinish("");
    setSupplierInfo("");
    setInfoReceivedFrom("");
    setNotes("");
    
    toast({
      title: "Added to Sheet",
      description: "Calculation added to your sheet successfully",
    });
  };

  const exportToExcel = () => {
    if (calculations.length === 0) {
      toast({
        title: "No Data",
        description: "No calculations to export",
        variant: "destructive",
      });
      return;
    }

    const headers = [
      "Type", "Width", "Length", "Pack Qty", "Input Price", "Thickness", 
      "Product Kind", "Surface Finish", "Supplier Info", "Info Received From",
      "Price per Sq In", "Price per Sq Ft", "Price per Sq Meter", "Notes"
    ];

    const csvContent = [
      headers.join(","),
      ...calculations.map(calc => [
        calc.type,
        `${calc.width} ${calc.type === "roll" ? "ft" : "in"}`,
        `${calc.length} ${calc.type === "roll" ? "ft" : "in"}`,
        calc.packQty,
        `$${calc.inputPrice.toFixed(2)}`,
        `"${calc.thickness}"`,
        `"${calc.productKind}"`,
        `"${calc.surfaceFinish}"`,
        `"${calc.supplierInfo}"`,
        `"${calc.infoReceivedFrom}"`,
        `$${calc.pricePerSqIn.toFixed(4)}`,
        `$${calc.pricePerSqFt.toFixed(4)}`,
        `$${calc.pricePerSqMeter.toFixed(4)}`,
        `"${calc.notes}"`
      ].join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `area-pricing-calculations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    
    toast({
      title: "Export Complete",
      description: "Excel file downloaded successfully",
    });
  };

  const addToCompInfo = async () => {
    // Alert to confirm button click registration
    alert("ADD TO COMP INFO button clicked! Function is working.");
    
    console.log("=== BUTTON CLICK DETECTED ===");
    console.log("Function called successfully");
    console.log("Current calculations:", calculations);
    console.log("Calculations length:", calculations.length);
    
    if (calculations.length === 0) {
      console.log("No calculations available");
      toast({
        title: "No Data",
        description: "Create calculations first using 'Add to Sheet'",
        variant: "destructive",
      });
      return;
    }

    setIsAddingToCompInfo(true);
    console.log("=== Starting ADD TO COMP INFO ===");

    try {
      let successCount = 0;
      
      for (const calc of calculations) {
        const entry = {
          type: calc.type,
          dimensions: `${calc.width} × ${calc.length} ${calc.type === "roll" ? "ft" : "in"}`,
          width: calc.width,
          length: calc.length,
          unit: calc.type === "roll" ? "ft" : "in",
          packQty: calc.packQty,
          inputPrice: calc.inputPrice,
          thickness: calc.thickness,
          productKind: calc.productKind,
          surfaceFinish: calc.surfaceFinish,
          supplierInfo: calc.supplierInfo,
          infoReceivedFrom: calc.infoReceivedFrom,
          pricePerSqIn: calc.pricePerSqIn,
          pricePerSqFt: calc.pricePerSqFt,
          pricePerSqMeter: calc.pricePerSqMeter,
          notes: calc.notes || "Added from Area Pricer",
          source: "Area Pricer"
        };
        
        console.log("Sending entry:", entry);
        
        const response = await fetch('/api/competitor-pricing', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(entry)
        });
        
        console.log("Response status:", response.status);
        console.log("Response OK:", response.ok);
        
        if (!response.ok) {
          const errorText = await response.text();
          console.error("API Error Response:", errorText);
          throw new Error(`Server error ${response.status}: ${errorText}`);
        }
        
        const result = await response.json();
        console.log("Entry added successfully:", result);
        successCount++;
      }
      
      console.log("All entries processed successfully");
      toast({
        title: "Success!",
        description: `Added ${successCount} entries to competitor pricing database`,
      });
      
      // Clear calculations after successful upload
      setCalculations([]);
      
    } catch (error) {
      console.error("ADD TO COMP INFO Error:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to add calculations",
        variant: "destructive",
      });
    } finally {
      setIsAddingToCompInfo(false);
    }
  };

  const removeCalculation = (id: string) => {
    setCalculations(prev => prev.filter(calc => calc.id !== id));
    toast({
      title: "Removed",
      description: "Calculation removed from sheet",
    });
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-3 sm:p-6 max-w-7xl">
      <div className="text-center mb-6 sm:mb-8">
        <div className="flex justify-center mb-4">
          <div className="p-2 sm:p-3 bg-purple-100 rounded-lg">
            <Calculator className="h-6 w-6 sm:h-8 sm:w-8 text-purple-600" />
          </div>
        </div>
        <h1 className="text-xl sm:text-3xl font-bold text-gray-900 mb-2">SqM Calculator</h1>
        <p className="text-sm sm:text-base text-gray-600">Calculate unit pricing (in², ft², m²) for rolls or sheets. Log entries and export to Excel.</p>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4 sm:gap-8">
        {/* Input Configuration */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Input Configuration</CardTitle>
            <CardDescription>Enter dimensions and pricing information</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 sm:space-y-6">
            {/* Calculation Type */}
            <div>
              <Label className="text-sm sm:text-base font-medium">Calculation Type</Label>
              <RadioGroup
                value={calculationType}
                onValueChange={(value) => setCalculationType(value as "sheets" | "roll")}
                className="flex flex-col sm:flex-row gap-2 sm:gap-4 mt-2"
              >
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="sheets" id="sheets" />
                  <Label htmlFor="sheets" className="text-sm sm:text-base">Sheets (inches)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="roll" id="roll" />
                  <Label htmlFor="roll" className="text-sm sm:text-base">Roll (feet)</Label>
                </div>
              </RadioGroup>
            </div>

            {/* Dimensions */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="width" className="text-sm sm:text-base font-medium">
                  Width ({calculationType === "sheets" ? "inches" : "feet"})
                </Label>
                <Input
                  id="width"
                  type="number"
                  step="0.01"
                  value={width}
                  onChange={(e) => setWidth(e.target.value)}
                  placeholder={calculationType === "sheets" ? "12" : "4"}
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="height" className="text-sm sm:text-base font-medium">
                  {calculationType === "sheets" ? "Height" : "Length"} ({calculationType === "sheets" ? "inches" : "feet"})
                </Label>
                <Input
                  id="height"
                  type="number"
                  step="0.01"
                  value={height}
                  onChange={(e) => setHeight(e.target.value)}
                  placeholder={calculationType === "sheets" ? "18" : "50"}
                  className="mt-1"
                />
              </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="sheetsPerPack" className="text-sm sm:text-base font-medium">
                  {calculationType === "sheets" ? "Sheets per Pack" : "Rolls in Order"}
                </Label>
                <Input
                  id="sheetsPerPack"
                  type="number"
                  step="1"
                  value={sheetsPerPack}
                  onChange={(e) => setSheetsPerPack(e.target.value)}
                  placeholder="10"
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="pricePerPack" className="text-sm sm:text-base font-medium">
                  Price per Pack ($)
                </Label>
                <Input
                  id="pricePerPack"
                  type="number"
                  step="0.01"
                  value={pricePerPack}
                  onChange={(e) => setPricePerPack(e.target.value)}
                  placeholder="25.00"
                  className="mt-1"
                />
              </div>
            </div>

            {/* Product Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="thickness" className="text-sm sm:text-base font-medium">Thickness</Label>
                <Input
                  id="thickness"
                  value={thickness}
                  onChange={(e) => setThickness(e.target.value)}
                  placeholder="e.g., 3mil, 5mm, etc."
                  className="mt-1"
                />
              </div>
              <div>
                <Label htmlFor="productKind" className="text-sm sm:text-base font-medium">Product Kind</Label>
                <Select value={productKind} onValueChange={setProductKind}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select product kind" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Adhesive Type">Adhesive Type</SelectItem>
                    <SelectItem value="Non Adhesive Type">Non Adhesive Type</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
              <div>
                <Label htmlFor="surfaceFinish" className="text-sm sm:text-base font-medium">Surface Finish</Label>
                <Select value={surfaceFinish} onValueChange={setSurfaceFinish}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select surface finish" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Matte">Matte</SelectItem>
                    <SelectItem value="Gloss">Gloss</SelectItem>
                    <SelectItem value="Satin">Satin</SelectItem>
                    <SelectItem value="Semi-Gloss">Semi-Gloss</SelectItem>
                    <SelectItem value="Textured">Textured</SelectItem>
                    <SelectItem value="Smooth">Smooth</SelectItem>
                    <SelectItem value="Brushed">Brushed</SelectItem>
                    <SelectItem value="Metallic">Metallic</SelectItem>
                    <SelectItem value="Clear">Clear</SelectItem>
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="supplierInfo" className="text-sm sm:text-base font-medium">Supplier Info</Label>
                <Select value={supplierInfo} onValueChange={(value) => {
                  setSupplierInfo(value);
                  if (value === "Other") {
                    setShowCustomSupplier(true);
                  } else {
                    setShowCustomSupplier(false);
                    setCustomSupplier("");
                  }
                }}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select supplier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Neekoosa">Neekoosa</SelectItem>
                    <SelectItem value="GPA">GPA</SelectItem>
                    <SelectItem value="MGX">MGX</SelectItem>
                    <SelectItem value="Mac Papers">Mac Papers</SelectItem>
                    <SelectItem value="Lindenmeyr">Lindenmeyr</SelectItem>
                    {savedCustomSuppliers.map((supplier) => (
                      <SelectItem key={supplier} value={supplier}>{supplier}</SelectItem>
                    ))}
                    <SelectItem value="Other">Other</SelectItem>
                  </SelectContent>
                </Select>
                {showCustomSupplier && (
                  <div className="mt-2">
                    <Input
                      value={customSupplier}
                      onChange={(e) => setCustomSupplier(e.target.value)}
                      placeholder="Enter custom supplier name"
                      onBlur={() => {
                        if (customSupplier.trim() && !savedCustomSuppliers.includes(customSupplier.trim())) {
                          setSavedCustomSuppliers(prev => [...prev, customSupplier.trim()]);
                          setSupplierInfo(customSupplier.trim());
                          setShowCustomSupplier(false);
                          setCustomSupplier("");
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && customSupplier.trim()) {
                          if (!savedCustomSuppliers.includes(customSupplier.trim())) {
                            setSavedCustomSuppliers(prev => [...prev, customSupplier.trim()]);
                          }
                          setSupplierInfo(customSupplier.trim());
                          setShowCustomSupplier(false);
                          setCustomSupplier("");
                        }
                      }}
                      className="text-sm"
                    />
                    <p className="text-xs text-gray-500 mt-1">Press Enter or click away to save</p>
                  </div>
                )}
              </div>
              <div>
                <Label htmlFor="supplierInfo" className="text-sm sm:text-base font-medium">Supplier Info</Label>
                <Input
                  id="supplierInfo"
                  value={supplierInfo}
                  onChange={(e) => setSupplierInfo(e.target.value)}
                  placeholder="Supplier Name"
                  className="mt-1"
                />
              </div>
            </div>

            <div>
              <Label htmlFor="infoReceivedFrom" className="text-sm sm:text-base font-medium">Info Received From</Label>
              <Input
                id="infoReceivedFrom"
                value={infoReceivedFrom}
                onChange={(e) => setInfoReceivedFrom(e.target.value)}
                placeholder="Sales Rep Name"
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="notes" className="text-sm sm:text-base font-medium">Notes</Label>
              <Textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Additional notes or comments"
                className="mt-1"
                rows={3}
              />
            </div>

            {/* Calculate Button */}
            <Button 
              onClick={calculate}
              disabled={isCalculating}
              className="w-full bg-purple-600 hover:bg-purple-700 text-white"
            >
              {isCalculating ? "Calculating..." : "Calculate"}
            </Button>
          </CardContent>
        </Card>

        {/* Results */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg sm:text-xl">Calculation Results</CardTitle>
            <CardDescription>Unit pricing and total calculations</CardDescription>
          </CardHeader>
          <CardContent>
            {currentResult ? (
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="p-3 sm:p-4 bg-blue-50 rounded-lg">
                    <h4 className="font-semibold text-blue-900 text-sm sm:text-base">Price per Square Inch</h4>
                    <p className="text-lg sm:text-2xl font-bold text-blue-700">${currentResult.pricePerSqIn.toFixed(4)}</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-green-50 rounded-lg">
                    <h4 className="font-semibold text-green-900 text-sm sm:text-base">Price per Square Foot</h4>
                    <p className="text-lg sm:text-2xl font-bold text-green-700">${currentResult.pricePerSqFt.toFixed(4)}</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-purple-50 rounded-lg">
                    <h4 className="font-semibold text-purple-900 text-sm sm:text-base">Price per Square Meter</h4>
                    <p className="text-lg sm:text-2xl font-bold text-purple-700">${currentResult.pricePerSqMeter.toFixed(4)}</p>
                  </div>
                  <div className="p-3 sm:p-4 bg-orange-50 rounded-lg">
                    <h4 className="font-semibold text-orange-900 text-sm sm:text-base">Total Area</h4>
                    <p className="text-lg sm:text-2xl font-bold text-orange-700">
                      {currentResult.type === "sheets" 
                        ? `${currentResult.totalSqIn.toFixed(2)} in²`
                        : `${currentResult.totalSqFt.toFixed(2)} ft²`
                      }
                    </p>
                  </div>
                </div>
                
                <div className="pt-4 border-t">
                  <h4 className="font-semibold mb-2">Calculation Details</h4>
                  <div className="text-sm space-y-1">
                    <p><strong>Type:</strong> {currentResult.type}</p>
                    <p><strong>Dimensions:</strong> {currentResult.width} × {currentResult.length} {currentResult.type === "roll" ? "ft" : "in"}</p>
                    <p><strong>Quantity:</strong> {currentResult.packQty}</p>
                    <p><strong>Total Price:</strong> ${currentResult.inputPrice.toFixed(2)}</p>
                    <p><strong>Thickness:</strong> {currentResult.thickness}</p>
                    <p><strong>Product:</strong> {currentResult.productKind}</p>
                    <p><strong>Surface:</strong> {currentResult.surfaceFinish}</p>
                    <p><strong>Supplier:</strong> {currentResult.supplierInfo}</p>
                    {currentResult.notes && <p><strong>Notes:</strong> {currentResult.notes}</p>}
                  </div>
                </div>

                <Button 
                  onClick={addToSheet}
                  className="w-full bg-green-600 hover:bg-green-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Add to Sheet
                </Button>
              </div>
            ) : (
              <div className="text-center py-8">
                <Calculator className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-gray-500">Enter dimensions and click Calculate to see results</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Calculations Table */}
      {calculations.length > 0 && (
        <Card className="mt-6 sm:mt-8">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
              <div>
                <CardTitle className="text-lg sm:text-xl">Calculations ({calculations.length})</CardTitle>
                <CardDescription>Your saved calculations</CardDescription>
              </div>
              <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                <Button
                  onClick={exportToExcel}
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Sheet className="w-4 h-4 mr-2" />
                  Export Excel
                </Button>
                <Button
                  onClick={addToCompInfo}
                  disabled={isAddingToCompInfo}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  {isAddingToCompInfo ? "Adding..." : "Add to Comp Info"}
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">Actions</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Qty</TableHead>
                    <TableHead>Price</TableHead>
                    <TableHead>$/sq in</TableHead>
                    <TableHead>$/sq ft</TableHead>
                    <TableHead>$/sq m</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Notes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {calculations.map((calc) => (
                    <TableRow key={calc.id}>
                      <TableCell>
                        <Button
                          onClick={() => removeCalculation(calc.id)}
                          variant="ghost"
                          size="sm"
                          className="text-red-600 hover:text-red-800"
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </TableCell>
                      <TableCell className="font-medium">{calc.type}</TableCell>
                      <TableCell>{calc.width} × {calc.length} {calc.type === "roll" ? "ft" : "in"}</TableCell>
                      <TableCell>{calc.packQty}</TableCell>
                      <TableCell>${calc.inputPrice.toFixed(2)}</TableCell>
                      <TableCell>${calc.pricePerSqIn.toFixed(4)}</TableCell>
                      <TableCell>${calc.pricePerSqFt.toFixed(4)}</TableCell>
                      <TableCell>${calc.pricePerSqMeter.toFixed(4)}</TableCell>
                      <TableCell>{calc.productKind}</TableCell>
                      <TableCell>{calc.supplierInfo}</TableCell>
                      <TableCell className="max-w-32 truncate">{calc.notes || "—"}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
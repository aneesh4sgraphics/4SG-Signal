import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Truck, Package, Calculator, ArrowLeft, Clock, DollarSign, MapPin, Ruler, Weight, History } from "lucide-react";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface ShippingCalculation {
  id: string;
  timestamp: Date;
  origin: string;
  destination: string;
  weight: number;
  dimensions: {
    length: number;
    width: number;
    height: number;
  };
  packageType: string;
  value: number;
  actualWeight: number;
  dimensionalWeight: number;
  billableWeight: number;
  zone: number;
  rates: ShippingRate[];
  notes: string;
}

interface ShippingRate {
  service: string;
  carrier: string;
  rate: number;
  deliveryTime: string;
  features: string[];
}

export default function ShippingCalculator() {
  const { user } = useAuth();
  const { toast } = useToast();
  
  // Form state
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [weight, setWeight] = useState("");
  const [length, setLength] = useState("");
  const [width, setWidth] = useState("");
  const [height, setHeight] = useState("");
  const [packageType, setPackageType] = useState("box");
  const [value, setValue] = useState("");
  const [notes, setNotes] = useState("");
  
  // Results state
  const [calculations, setCalculations] = useState<ShippingCalculation[]>([]);
  const [currentCalculation, setCurrentCalculation] = useState<ShippingCalculation | null>(null);
  const [isCalculating, setIsCalculating] = useState(false);
  
  // Clear any existing data on component mount to start fresh
  useEffect(() => {
    localStorage.removeItem('shippingCalculations');
    setCalculations([]);
  }, []);
  
  // Update calculations in state only (no localStorage persistence)
  const updateCalculations = (newCalculations: ShippingCalculation[]) => {
    setCalculations(newCalculations);
  };
  
  // Calculate dimensional weight
  const calculateDimensionalWeight = (l: number, w: number, h: number): number => {
    // Standard divisor for domestic shipping (UPS/FedEx: 139, USPS: 166)
    return (l * w * h) / 139;
  };
  
  // Determine shipping zone based on ZIP codes
  const determineZone = (originZip: string, destZip: string): number => {
    // Simplified zone calculation - in reality this would use a ZIP code database
    const originPrefix = parseInt(originZip.substring(0, 3));
    const destPrefix = parseInt(destZip.substring(0, 3));
    const difference = Math.abs(originPrefix - destPrefix);
    
    if (difference <= 50) return 1;
    if (difference <= 150) return 2;
    if (difference <= 300) return 3;
    if (difference <= 600) return 4;
    if (difference <= 1000) return 5;
    if (difference <= 1400) return 6;
    if (difference <= 1800) return 7;
    return 8;
  };
  
  // Calculate shipping rates
  const calculateRates = (actualWeight: number, dimensionalWeight: number, zone: number, packageValue: number): ShippingRate[] => {
    const billableWeight = Math.max(actualWeight, dimensionalWeight);
    const baseRate = 5.00 + (billableWeight * 0.85) + (zone * 1.20);
    
    const rates: ShippingRate[] = [
      {
        service: "Ground",
        carrier: "Standard",
        rate: baseRate,
        deliveryTime: "5-7 business days",
        features: ["Tracking included", "Insurance up to $100"]
      },
      {
        service: "Priority",
        carrier: "Standard",
        rate: baseRate * 1.5,
        deliveryTime: "2-3 business days",
        features: ["Tracking included", "Insurance up to $200", "Priority handling"]
      },
      {
        service: "Express",
        carrier: "Standard",
        rate: baseRate * 2.2,
        deliveryTime: "1-2 business days",
        features: ["Tracking included", "Insurance up to $500", "Express delivery"]
      },
      {
        service: "Overnight",
        carrier: "Standard",
        rate: baseRate * 3.5,
        deliveryTime: "Next business day",
        features: ["Tracking included", "Insurance up to $1000", "Overnight delivery"]
      }
    ];
    
    // Add surcharges for high-value packages
    if (packageValue > 100) {
      rates.forEach(rate => {
        rate.rate += Math.ceil((packageValue - 100) / 100) * 2.50;
      });
    }
    
    return rates;
  };
  
  // Handle calculation
  const handleCalculate = () => {
    if (!origin || !destination || !weight || !length || !width || !height) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields",
        variant: "destructive"
      });
      return;
    }
    
    setIsCalculating(true);
    
    // Simulate API call delay
    setTimeout(() => {
      const weightNum = parseFloat(weight);
      const lengthNum = parseFloat(length);
      const widthNum = parseFloat(width);
      const heightNum = parseFloat(height);
      const valueNum = parseFloat(value) || 0;
      
      const dimensionalWeight = calculateDimensionalWeight(lengthNum, widthNum, heightNum);
      const billableWeight = Math.max(weightNum, dimensionalWeight);
      const zone = determineZone(origin, destination);
      const rates = calculateRates(weightNum, dimensionalWeight, zone, valueNum);
      
      const newCalculation: ShippingCalculation = {
        id: Date.now().toString(),
        timestamp: new Date(),
        origin,
        destination,
        weight: weightNum,
        dimensions: {
          length: lengthNum,
          width: widthNum,
          height: heightNum
        },
        packageType,
        value: valueNum,
        actualWeight: weightNum,
        dimensionalWeight,
        billableWeight,
        zone,
        rates,
        notes
      };
      
      setCurrentCalculation(newCalculation);
      const updatedCalculations = [newCalculation, ...calculations];
      updateCalculations(updatedCalculations);
      setIsCalculating(false);
      
      toast({
        title: "Calculation Complete",
        description: `Found ${rates.length} shipping options`
      });
    }, 1000);
  };
  
  // Clear form
  const clearForm = () => {
    setOrigin("");
    setDestination("");
    setWeight("");
    setLength("");
    setWidth("");
    setHeight("");
    setPackageType("box");
    setValue("");
    setNotes("");
    setCurrentCalculation(null);
  };
  
  // Export calculations
  const exportCalculations = () => {
    const headers = ["Date", "Origin", "Destination", "Weight (lbs)", "Dimensions (L×W×H)", "Package Type", "Value", "Actual Weight", "Dimensional Weight", "Billable Weight", "Zone", "Ground Rate", "Priority Rate", "Express Rate", "Overnight Rate", "Notes"];
    const csvContent = [
      headers.join(","),
      ...calculations.map(calc => [
        calc.timestamp.toLocaleDateString(),
        calc.origin,
        calc.destination,
        calc.weight,
        `${calc.dimensions.length}×${calc.dimensions.width}×${calc.dimensions.height}`,
        calc.packageType,
        calc.value,
        calc.actualWeight,
        calc.dimensionalWeight.toFixed(2),
        calc.billableWeight.toFixed(2),
        calc.zone,
        calc.rates[0]?.rate.toFixed(2) || "",
        calc.rates[1]?.rate.toFixed(2) || "",
        calc.rates[2]?.rate.toFixed(2) || "",
        calc.rates[3]?.rate.toFixed(2) || "",
        `"${calc.notes}"`
      ].join(","))
    ].join("\n");
    
    const blob = new Blob([csvContent], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `shipping-calculations-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 bg-gray-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <Link href="/">
            <Button variant="outline" className="flex items-center gap-2">
              <ArrowLeft className="h-4 w-4" />
              Back to Dashboard
            </Button>
          </Link>
          <div className="text-center">
            <h1 className="text-3xl font-bold text-gray-900">Shipping Calculator</h1>
            <p className="text-gray-600">Calculate shipping costs and compare rates</p>
          </div>
          <div className="w-32"></div>
        </div>
        
        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Input Form */}
          <div className="lg:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Package className="h-5 w-5" />
                  Package Details
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Origin and Destination */}
                <div className="grid grid-cols-1 gap-4">
                  <div>
                    <Label htmlFor="origin">Origin ZIP Code</Label>
                    <Input
                      id="origin"
                      value={origin}
                      onChange={(e) => setOrigin(e.target.value)}
                      placeholder="e.g., 90210"
                      maxLength={5}
                    />
                  </div>
                  <div>
                    <Label htmlFor="destination">Destination ZIP Code</Label>
                    <Input
                      id="destination"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g., 10001"
                      maxLength={5}
                    />
                  </div>
                </div>
                
                {/* Weight */}
                <div>
                  <Label htmlFor="weight">Weight (lbs)</Label>
                  <Input
                    id="weight"
                    type="number"
                    step="0.1"
                    value={weight}
                    onChange={(e) => setWeight(e.target.value)}
                    placeholder="e.g., 2.5"
                  />
                </div>
                
                {/* Dimensions */}
                <div>
                  <Label>Dimensions (inches)</Label>
                  <div className="grid grid-cols-3 gap-2">
                    <Input
                      type="number"
                      step="0.1"
                      value={length}
                      onChange={(e) => setLength(e.target.value)}
                      placeholder="Length"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={width}
                      onChange={(e) => setWidth(e.target.value)}
                      placeholder="Width"
                    />
                    <Input
                      type="number"
                      step="0.1"
                      value={height}
                      onChange={(e) => setHeight(e.target.value)}
                      placeholder="Height"
                    />
                  </div>
                </div>
                
                {/* Package Type */}
                <div>
                  <Label htmlFor="packageType">Package Type</Label>
                  <Select value={packageType} onValueChange={setPackageType}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="box">Box</SelectItem>
                      <SelectItem value="envelope">Envelope</SelectItem>
                      <SelectItem value="tube">Tube</SelectItem>
                      <SelectItem value="irregular">Irregular</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                
                {/* Value */}
                <div>
                  <Label htmlFor="value">Package Value ($)</Label>
                  <Input
                    id="value"
                    type="number"
                    step="0.01"
                    value={value}
                    onChange={(e) => setValue(e.target.value)}
                    placeholder="e.g., 50.00"
                  />
                </div>
                
                {/* Notes */}
                <div>
                  <Label htmlFor="notes">Notes (optional)</Label>
                  <Input
                    id="notes"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Additional information..."
                  />
                </div>
                
                {/* Action Buttons */}
                <div className="flex space-x-2">
                  <Button 
                    onClick={handleCalculate}
                    disabled={isCalculating}
                    className="flex-1"
                  >
                    <Calculator className="h-4 w-4 mr-2" />
                    {isCalculating ? "Calculating..." : "Calculate"}
                  </Button>
                  <Button 
                    variant="outline"
                    onClick={clearForm}
                  >
                    Clear
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
          
          {/* Right Column - Results */}
          <div className="lg:col-span-2 space-y-6">
            {/* Current Calculation Results */}
            {currentCalculation && (
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Truck className="h-5 w-5" />
                    Shipping Options
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {/* Calculation Summary */}
                  <div className="bg-gray-50 p-4 rounded-lg mb-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div className="flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-gray-500" />
                        <span><strong>Route:</strong> {currentCalculation.origin} → {currentCalculation.destination}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Weight className="h-4 w-4 text-gray-500" />
                        <span><strong>Weight:</strong> {currentCalculation.billableWeight.toFixed(2)} lbs</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Ruler className="h-4 w-4 text-gray-500" />
                        <span><strong>Dimensions:</strong> {currentCalculation.dimensions.length}×{currentCalculation.dimensions.width}×{currentCalculation.dimensions.height}"</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline">Zone {currentCalculation.zone}</Badge>
                      </div>
                    </div>
                    
                    {currentCalculation.dimensionalWeight > currentCalculation.actualWeight && (
                      <div className="mt-2 text-sm text-amber-600">
                        <strong>Note:</strong> Dimensional weight ({currentCalculation.dimensionalWeight.toFixed(2)} lbs) is higher than actual weight ({currentCalculation.actualWeight} lbs)
                      </div>
                    )}
                  </div>
                  
                  {/* Shipping Rates Table */}
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Service</TableHead>
                          <TableHead>Carrier</TableHead>
                          <TableHead className="text-right">Rate</TableHead>
                          <TableHead>Delivery Time</TableHead>
                          <TableHead>Features</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {currentCalculation.rates.map((rate, index) => (
                          <TableRow key={index}>
                            <TableCell className="font-medium">{rate.service}</TableCell>
                            <TableCell>{rate.carrier}</TableCell>
                            <TableCell className="text-right font-medium">${rate.rate.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Clock className="h-4 w-4 text-gray-500" />
                                {rate.deliveryTime}
                              </div>
                            </TableCell>
                            <TableCell>
                              <div className="flex flex-wrap gap-1">
                                {rate.features.map((feature, i) => (
                                  <Badge key={i} variant="outline" className="text-xs">
                                    {feature}
                                  </Badge>
                                ))}
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            )}
            
            {/* Calculation History */}
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="flex items-center gap-2">
                    <History className="h-5 w-5" />
                    Calculation History ({calculations.length})
                  </CardTitle>
                  {calculations.length > 0 && (
                    <Button 
                      variant="outline"
                      onClick={exportCalculations}
                      className="bg-green-600 hover:bg-green-700 text-white"
                    >
                      <DollarSign className="h-4 w-4 mr-2" />
                      Export CSV
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                {calculations.length === 0 ? (
                  <div className="text-center py-8">
                    <p className="text-gray-500">No calculations yet.</p>
                    <p className="text-sm text-gray-400">Enter package details and calculate shipping to see history.</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {calculations.slice(0, 10).map((calc) => (
                      <div key={calc.id} className="border rounded-lg p-4">
                        <div className="flex justify-between items-start mb-2">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline">Zone {calc.zone}</Badge>
                            <span className="text-sm text-gray-500">
                              {calc.timestamp.toLocaleDateString()} at {calc.timestamp.toLocaleTimeString()}
                            </span>
                          </div>
                          <Badge variant="outline">
                            {calc.packageType}
                          </Badge>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-4 text-sm mb-2">
                          <div><strong>Route:</strong> {calc.origin} → {calc.destination}</div>
                          <div><strong>Weight:</strong> {calc.billableWeight.toFixed(2)} lbs</div>
                          <div><strong>Dimensions:</strong> {calc.dimensions.length}×{calc.dimensions.width}×{calc.dimensions.height}"</div>
                          <div><strong>Value:</strong> ${calc.value.toFixed(2)}</div>
                        </div>
                        
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                          {calc.rates.map((rate, index) => (
                            <div key={index} className="text-center p-2 bg-gray-50 rounded">
                              <div className="text-xs text-gray-600">{rate.service}</div>
                              <div className="font-medium">${rate.rate.toFixed(2)}</div>
                            </div>
                          ))}
                        </div>
                        
                        {calc.notes && (
                          <div className="mt-2 text-sm text-gray-600">
                            <strong>Notes:</strong> {calc.notes}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}
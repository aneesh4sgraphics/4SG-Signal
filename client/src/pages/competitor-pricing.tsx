import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { TrendingUp, Filter, Plus, Download, RotateCcw } from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { Link } from "wouter";
import { toast } from "@/hooks/use-toast";

interface CompetitorData {
  id: string;
  timestamp: Date;
  type: string;
  dimensions: string;
  width?: number;
  length?: number;
  unit?: string;
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
  notes: string;
  source: string;
}

export default function CompetitorPricing() {
  const { user } = useAuth();
  const [competitorData, setCompetitorData] = useState<CompetitorData[]>([]);
  const [filteredData, setFilteredData] = useState<CompetitorData[]>([]);
  
  // Filter states
  const [supplierFilter, setSupplierFilter] = useState("all");
  const [thicknessFilter, setThicknessFilter] = useState("all");
  const [productKindFilter, setProductKindFilter] = useState("all");
  const [surfaceFinishFilter, setSurfaceFinishFilter] = useState("all");
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  
  // Unique values for dropdowns
  const [suppliers, setSuppliers] = useState<string[]>([]);
  const [thicknesses, setThicknesses] = useState<string[]>([]);
  const [productKinds, setProductKinds] = useState<string[]>([]);
  const [surfaceFinishes, setSurfaceFinishes] = useState<string[]>([]);

  // Load data from localStorage
  useEffect(() => {
    const loadData = () => {
      const storedData = localStorage.getItem('competitorData');
      if (storedData) {
        const parsedData = JSON.parse(storedData).map((item: any) => ({
          ...item,
          timestamp: new Date(item.timestamp)
        }));
        setCompetitorData(parsedData);
        setFilteredData(parsedData);
        
        // Extract unique values for filters
        const uniqueSuppliers = [...new Set(parsedData.map((item: CompetitorData) => item.supplierInfo).filter(Boolean))];
        const uniqueThicknesses = [...new Set(parsedData.map((item: CompetitorData) => item.thickness).filter(Boolean))];
        const uniqueProductKinds = [...new Set(parsedData.map((item: CompetitorData) => item.productKind).filter(Boolean))];
        const uniqueSurfaceFinishes = [...new Set(parsedData.map((item: CompetitorData) => item.surfaceFinish).filter(Boolean))];
        
        setSuppliers(uniqueSuppliers);
        setThicknesses(uniqueThicknesses);
        setProductKinds(uniqueProductKinds);
        setSurfaceFinishes(uniqueSurfaceFinishes);
      }
    };
    
    loadData();
    
    // Listen for storage changes (when data is added from Area Pricer)
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'competitorData') {
        loadData();
      }
    };
    
    window.addEventListener('storage', handleStorageChange);
    
    // Check for updates every 2 seconds (for same-tab updates)
    const interval = setInterval(loadData, 2000);
    
    return () => {
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(interval);
    };
  }, []);

  // Filter data based on selected filters
  useEffect(() => {
    let filtered = [...competitorData];
    
    if (supplierFilter && supplierFilter !== "all") {
      filtered = filtered.filter(item => item.supplierInfo === supplierFilter);
    }
    
    if (thicknessFilter && thicknessFilter !== "all") {
      filtered = filtered.filter(item => item.thickness === thicknessFilter);
    }
    
    if (productKindFilter && productKindFilter !== "all") {
      filtered = filtered.filter(item => item.productKind === productKindFilter);
    }
    
    if (surfaceFinishFilter && surfaceFinishFilter !== "all") {
      filtered = filtered.filter(item => item.surfaceFinish === surfaceFinishFilter);
    }
    
    if (minPrice) {
      const min = parseFloat(minPrice);
      filtered = filtered.filter(item => item.pricePerSqMeter >= min);
    }
    
    if (maxPrice) {
      const max = parseFloat(maxPrice);
      filtered = filtered.filter(item => item.pricePerSqMeter <= max);
    }
    
    setFilteredData(filtered);
  }, [competitorData, supplierFilter, thicknessFilter, productKindFilter, surfaceFinishFilter, minPrice, maxPrice]);

  const resetFilters = () => {
    setSupplierFilter("all");
    setThicknessFilter("all");
    setProductKindFilter("all");
    setSurfaceFinishFilter("all");
    setMinPrice("");
    setMaxPrice("");
  };

  const exportToExcel = () => {
    if (filteredData.length === 0) return;

    // Helper function to parse dimensions into width and height/length
    const parseDimensions = (item: CompetitorData) => {
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
      ...filteredData.map(item => {
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
          item.timestamp.toLocaleDateString()
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
  };

  return (
    <div className="container mx-auto p-6 max-w-7xl">
      <div className="text-center mb-8">
        <div className="flex justify-between items-center mb-4">
          <div className="flex items-center">
            <div className="p-3 bg-orange-100 rounded-lg mr-4">
              <TrendingUp className="h-8 w-8 text-orange-600" />
            </div>
            <div className="text-left">
              <h1 className="text-3xl font-bold text-gray-900">Competitor Pricing Intelligence</h1>
              <p className="text-gray-600">Track, analyze, and contribute competitor pricing information.</p>
              <p className="text-sm text-gray-500">Logged in as: {user?.email || 'Loading...'}</p>
            </div>
          </div>
          <Link href="/area-pricer">
            <Button className="bg-purple-600 hover:bg-purple-700 text-white">
              <Plus className="w-4 h-4 mr-2" />
              Add New Entry
            </Button>
          </Link>
        </div>
      </div>

      {/* Filter Section */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center">
            <Filter className="w-5 h-5 mr-2" />
            Filter Pricing Data
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-4">
            <div>
              <Label htmlFor="supplier">Supplier</Label>
              <Select value={supplierFilter} onValueChange={setSupplierFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Supplier" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Supplier</SelectItem>
                  {suppliers.map((supplier) => (
                    <SelectItem key={supplier} value={supplier}>
                      {supplier}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="thickness">Thickness</Label>
              <Select value={thicknessFilter} onValueChange={setThicknessFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Thickness" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Thickness</SelectItem>
                  {thicknesses.map((thickness) => (
                    <SelectItem key={thickness} value={thickness}>
                      {thickness}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="productKind">Product Kind</Label>
              <Select value={productKindFilter} onValueChange={setProductKindFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Kind" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Kind</SelectItem>
                  {productKinds.map((kind) => (
                    <SelectItem key={kind} value={kind}>
                      {kind}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            <div>
              <Label htmlFor="surfaceFinish">Surface Finish</Label>
              <Select value={surfaceFinishFilter} onValueChange={setSurfaceFinishFilter}>
                <SelectTrigger>
                  <SelectValue placeholder="Any Finish" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Any Finish</SelectItem>
                  {surfaceFinishes.map((finish) => (
                    <SelectItem key={finish} value={finish}>
                      {finish}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="minPrice">Min Price/m² ($)</Label>
              <Input
                id="minPrice"
                type="number"
                step="0.01"
                value={minPrice}
                onChange={(e) => setMinPrice(e.target.value)}
                placeholder="e.g., 5.00"
              />
            </div>
            
            <div>
              <Label htmlFor="maxPrice">Max Price/m² ($)</Label>
              <Input
                id="maxPrice"
                type="number"
                step="0.01"
                value={maxPrice}
                onChange={(e) => setMaxPrice(e.target.value)}
                placeholder="e.g., 20.00"
              />
            </div>
          </div>
          
          <div className="flex justify-end mt-4">
            <Button onClick={resetFilters} variant="outline">
              <RotateCcw className="w-4 h-4 mr-2" />
              Reset Filters
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Data Table */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle>Pricing Data ({filteredData.length} entries)</CardTitle>
            <Button onClick={exportToExcel} className="bg-green-600 hover:bg-green-700 text-white">
              <Download className="w-4 h-4 mr-2" />
              Export Excel
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {filteredData.length === 0 ? (
            <div className="text-center py-8">
              <p className="text-gray-500">No competitor pricing data available.</p>
              <p className="text-sm text-gray-400">Add data from the Area Pricer or use the "Add New Entry" button.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Source</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead>Pack Qty</TableHead>
                    <TableHead>Input Price</TableHead>
                    <TableHead>Thickness</TableHead>
                    <TableHead>Product Kind</TableHead>
                    <TableHead>Surface Finish</TableHead>
                    <TableHead>Supplier</TableHead>
                    <TableHead>Info From</TableHead>
                    <TableHead>Price/in²</TableHead>
                    <TableHead>Price/ft²</TableHead>
                    <TableHead>Price/m²</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredData.map((item) => (
                    <TableRow key={item.id}>
                      <TableCell className="font-medium">{item.source}</TableCell>
                      <TableCell className="capitalize">{item.type}</TableCell>
                      <TableCell>{item.dimensions}</TableCell>
                      <TableCell>{item.packQty}</TableCell>
                      <TableCell>${item.inputPrice.toFixed(2)}</TableCell>
                      <TableCell>{item.thickness}</TableCell>
                      <TableCell>{item.productKind}</TableCell>
                      <TableCell>{item.surfaceFinish}</TableCell>
                      <TableCell>{item.supplierInfo}</TableCell>
                      <TableCell>{item.infoReceivedFrom}</TableCell>
                      <TableCell>${item.pricePerSqIn.toFixed(4)}</TableCell>
                      <TableCell>${item.pricePerSqFt.toFixed(4)}</TableCell>
                      <TableCell>${item.pricePerSqMeter.toFixed(4)}</TableCell>
                      <TableCell className="max-w-xs truncate">{item.notes}</TableCell>
                      <TableCell>{item.timestamp.toLocaleDateString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
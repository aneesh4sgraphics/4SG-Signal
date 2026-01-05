import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Users, Package, FileText, TrendingUp, Calendar, Mail, 
  BarChart3, Bell, ChevronRight, Star, Clock, Target,
  AlertTriangle, CheckCircle2, Eye, ShoppingCart
} from "lucide-react";
import logoPath from "@assets/4s logo Clean 150x_1753410902611.png";

const DEMO_CUSTOMERS = [
  { id: "1", company: "ABC Printing Co.", city: "Miami", state: "FL", email: "john@abcprinting.com", tier: "Tier 1", status: "Active", trustLevel: "Habitual" },
  { id: "2", company: "Digital Press Masters", city: "Los Angeles", state: "CA", email: "sarah@digitalpress.com", tier: "Tier 2", status: "Active", trustLevel: "Adopted" },
  { id: "3", company: "Quick Print Solutions", city: "Houston", state: "TX", email: "mike@quickprint.com", tier: "Tier 3", status: "Prospect", trustLevel: "Introduced" },
  { id: "4", company: "Premium Graphics LLC", city: "Chicago", state: "IL", email: "lisa@premiumgraphics.com", tier: "Tier 1", status: "Active", trustLevel: "Evaluated" },
  { id: "5", company: "Ink Masters International", city: "New York", state: "NY", email: "david@inkmasters.com", tier: "Tier 2", status: "Active", trustLevel: "Habitual" },
  { id: "6", company: "Southern Print Works", city: "Atlanta", state: "GA", email: "jennifer@southernprint.com", tier: "Tier 4", status: "Prospect", trustLevel: "Not Introduced" },
  { id: "7", company: "Pacific Label Co.", city: "San Francisco", state: "CA", email: "robert@pacificlabel.com", tier: "Tier 2", status: "Active", trustLevel: "Adopted" },
  { id: "8", company: "Midwest Packaging", city: "Detroit", state: "MI", email: "amanda@midwestpack.com", tier: "Tier 3", status: "Active", trustLevel: "Evaluated" },
];

const DEMO_PRODUCTS = [
  { name: "Premium Coated Paper 80#", category: "Coated Papers", price: 45.99, stock: 1250 },
  { name: "Matte Finish Stock 100#", category: "Coated Papers", price: 52.50, stock: 890 },
  { name: "Gloss Cover 12pt", category: "Cover Stock", price: 68.00, stock: 2100 },
  { name: "Uncoated Text 70#", category: "Uncoated Papers", price: 38.25, stock: 3400 },
  { name: "Recycled Bond 24#", category: "Bond Papers", price: 29.99, stock: 1800 },
  { name: "Synthetic Label Stock", category: "Label Materials", price: 89.00, stock: 560 },
];

const DEMO_QUOTES = [
  { id: "Q-2024-001", customer: "ABC Printing Co.", amount: 12500, status: "Won", date: "2024-01-15" },
  { id: "Q-2024-002", customer: "Digital Press Masters", amount: 8750, status: "Pending", date: "2024-01-18" },
  { id: "Q-2024-003", customer: "Quick Print Solutions", amount: 3200, status: "Follow-up", date: "2024-01-20" },
  { id: "Q-2024-004", customer: "Premium Graphics LLC", amount: 15800, status: "Won", date: "2024-01-22" },
  { id: "Q-2024-005", customer: "Ink Masters International", amount: 6400, status: "Lost", date: "2024-01-25" },
];

const DEMO_TASKS = [
  { customer: "Digital Press Masters", action: "Follow up on pending quote", priority: "high", dueIn: "Today" },
  { customer: "Quick Print Solutions", action: "Send sample kit", priority: "medium", dueIn: "Tomorrow" },
  { customer: "Southern Print Works", action: "Schedule product demo", priority: "low", dueIn: "3 days" },
  { customer: "Midwest Packaging", action: "Review pricing tier upgrade", priority: "high", dueIn: "Today" },
  { customer: "Pacific Label Co.", action: "Send updated price list", priority: "medium", dueIn: "2 days" },
];

const getTrustBadge = (level: string) => {
  const colors: Record<string, string> = {
    "Habitual": "bg-green-100 text-green-800",
    "Adopted": "bg-blue-100 text-blue-800",
    "Evaluated": "bg-yellow-100 text-yellow-800",
    "Introduced": "bg-orange-100 text-orange-800",
    "Not Introduced": "bg-gray-100 text-gray-600"
  };
  return colors[level] || "bg-gray-100 text-gray-600";
};

const getPriorityColor = (priority: string) => {
  const colors: Record<string, string> = {
    "high": "text-red-600 bg-red-50",
    "medium": "text-yellow-600 bg-yellow-50",
    "low": "text-green-600 bg-green-50"
  };
  return colors[priority] || "text-gray-600 bg-gray-50";
};

const getStatusBadge = (status: string) => {
  const colors: Record<string, string> = {
    "Won": "bg-green-100 text-green-800",
    "Pending": "bg-blue-100 text-blue-800",
    "Follow-up": "bg-yellow-100 text-yellow-800",
    "Lost": "bg-red-100 text-red-800"
  };
  return colors[status] || "bg-gray-100 text-gray-600";
};

export default function DemoPage() {
  const [activeTab, setActiveTab] = useState("dashboard");

  const handleDemoAction = () => {
    alert("This is a read-only demo. Please contact us for full access!");
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-purple-50 to-slate-100">
      <div className="fixed top-0 left-0 right-0 z-50 bg-gradient-to-r from-purple-800 to-purple-900 text-white py-2 px-4 text-center text-sm font-medium shadow-lg">
        <div className="flex items-center justify-center gap-2">
          <Eye className="h-4 w-4" />
          <span>Demo Mode - Read-Only Preview</span>
          <Badge variant="outline" className="ml-2 bg-white/20 text-white border-white/30">
            Exhibition Version
          </Badge>
        </div>
      </div>

      <div className="pt-12">
        <header className="bg-white/80 backdrop-blur-sm border-b shadow-sm sticky top-12 z-40">
          <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <img src={logoPath} alt="4S Graphics" className="h-10 w-auto" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">4S Graphics CRM</h1>
                <p className="text-xs text-gray-500">Quote Calculator & Customer Journey</p>
              </div>
            </div>
            <Button 
              onClick={() => window.location.href = "/api/login"}
              className="bg-purple-700 hover:bg-purple-800"
            >
              Login for Full Access
            </Button>
          </div>
        </header>

        <main className="max-w-7xl mx-auto px-4 py-6">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
            <TabsList className="grid w-full grid-cols-4 lg:w-auto lg:inline-flex bg-white/80 backdrop-blur-sm">
              <TabsTrigger value="dashboard" className="gap-2">
                <BarChart3 className="h-4 w-4" />
                <span className="hidden sm:inline">Dashboard</span>
              </TabsTrigger>
              <TabsTrigger value="customers" className="gap-2">
                <Users className="h-4 w-4" />
                <span className="hidden sm:inline">Customers</span>
              </TabsTrigger>
              <TabsTrigger value="quotes" className="gap-2">
                <FileText className="h-4 w-4" />
                <span className="hidden sm:inline">Quotes</span>
              </TabsTrigger>
              <TabsTrigger value="products" className="gap-2">
                <Package className="h-4 w-4" />
                <span className="hidden sm:inline">Products</span>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="dashboard" className="space-y-6">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Total Customers</p>
                        <p className="text-2xl font-bold text-gray-900">3,257</p>
                      </div>
                      <Users className="h-8 w-8 text-purple-500 opacity-80" />
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                      <TrendingUp className="h-3 w-3" />
                      <span>+12% this month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Active Quotes</p>
                        <p className="text-2xl font-bold text-gray-900">128</p>
                      </div>
                      <FileText className="h-8 w-8 text-blue-500 opacity-80" />
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-blue-600">
                      <Clock className="h-3 w-3" />
                      <span>5 pending follow-up</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Monthly Revenue</p>
                        <p className="text-2xl font-bold text-gray-900">$48.5K</p>
                      </div>
                      <TrendingUp className="h-8 w-8 text-green-500 opacity-80" />
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-green-600">
                      <TrendingUp className="h-3 w-3" />
                      <span>+8% vs last month</span>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm text-gray-500">Products</p>
                        <p className="text-2xl font-bold text-gray-900">211</p>
                      </div>
                      <Package className="h-8 w-8 text-orange-500 opacity-80" />
                    </div>
                    <div className="flex items-center gap-1 mt-2 text-xs text-gray-500">
                      <CheckCircle2 className="h-3 w-3" />
                      <span>All synced from CSV</span>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="grid md:grid-cols-2 gap-6">
                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Target className="h-5 w-5 text-purple-600" />
                      Today's Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {DEMO_TASKS.map((task, i) => (
                          <div 
                            key={i} 
                            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                            onClick={handleDemoAction}
                          >
                            <div className="flex-1">
                              <p className="font-medium text-sm text-gray-900">{task.customer}</p>
                              <p className="text-xs text-gray-600">{task.action}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={getPriorityColor(task.priority)}>
                                {task.dueIn}
                              </Badge>
                              <ChevronRight className="h-4 w-4 text-gray-400" />
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                  <CardHeader className="pb-2">
                    <CardTitle className="text-lg flex items-center gap-2">
                      <FileText className="h-5 w-5 text-blue-600" />
                      Recent Quotes
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <div className="space-y-3">
                        {DEMO_QUOTES.map((quote) => (
                          <div 
                            key={quote.id}
                            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 cursor-pointer transition-colors"
                            onClick={handleDemoAction}
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <p className="font-medium text-sm text-gray-900">{quote.id}</p>
                                <Badge className={getStatusBadge(quote.status)} variant="outline">
                                  {quote.status}
                                </Badge>
                              </div>
                              <p className="text-xs text-gray-600">{quote.customer}</p>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">${quote.amount.toLocaleString()}</p>
                              <p className="text-xs text-gray-500">{quote.date}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </div>

              <Card className="bg-gradient-to-r from-purple-600 to-purple-800 text-white border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                      <h3 className="text-xl font-bold mb-2">Ready to boost your sales?</h3>
                      <p className="text-purple-100 text-sm">
                        Get full access to our Quote Calculator, Customer Journey tracking, 
                        Email Studio, and more.
                      </p>
                    </div>
                    <Button 
                      size="lg"
                      className="bg-white text-purple-700 hover:bg-purple-50 whitespace-nowrap"
                      onClick={() => window.location.href = "/api/login"}
                    >
                      Get Started
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="customers" className="space-y-4">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Users className="h-5 w-5" />
                    Customer Database
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b bg-gray-50">
                          <th className="text-left p-3 font-medium">Company</th>
                          <th className="text-left p-3 font-medium">Location</th>
                          <th className="text-left p-3 font-medium">Pricing Tier</th>
                          <th className="text-left p-3 font-medium">Trust Level</th>
                          <th className="text-left p-3 font-medium">Status</th>
                          <th className="text-left p-3 font-medium">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {DEMO_CUSTOMERS.map((customer) => (
                          <tr key={customer.id} className="border-b hover:bg-gray-50">
                            <td className="p-3">
                              <div>
                                <p className="font-medium">{customer.company}</p>
                                <p className="text-xs text-gray-500">{customer.email}</p>
                              </div>
                            </td>
                            <td className="p-3 text-gray-600">
                              {customer.city}, {customer.state}
                            </td>
                            <td className="p-3">
                              <Badge variant="outline">{customer.tier}</Badge>
                            </td>
                            <td className="p-3">
                              <Badge className={getTrustBadge(customer.trustLevel)}>
                                {customer.trustLevel}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Badge variant={customer.status === "Active" ? "default" : "secondary"}>
                                {customer.status}
                              </Badge>
                            </td>
                            <td className="p-3">
                              <Button size="sm" variant="outline" onClick={handleDemoAction}>
                                View
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="quotes" className="space-y-4">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center gap-2">
                      <FileText className="h-5 w-5" />
                      Quote Management
                    </CardTitle>
                    <Button onClick={handleDemoAction} className="bg-purple-600 hover:bg-purple-700">
                      + New Quote
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid gap-4">
                    {DEMO_QUOTES.map((quote) => (
                      <div 
                        key={quote.id}
                        className="flex items-center justify-between p-4 rounded-lg border bg-white hover:shadow-md transition-shadow cursor-pointer"
                        onClick={handleDemoAction}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center">
                            <FileText className="h-6 w-6 text-purple-600" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-semibold">{quote.id}</p>
                              <Badge className={getStatusBadge(quote.status)}>
                                {quote.status}
                              </Badge>
                            </div>
                            <p className="text-sm text-gray-600">{quote.customer}</p>
                            <p className="text-xs text-gray-400">{quote.date}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-xl font-bold text-gray-900">
                            ${quote.amount.toLocaleString()}
                          </p>
                          <Button size="sm" variant="ghost" className="mt-1">
                            View Details <ChevronRight className="h-4 w-4 ml-1" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-4">
              <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-md">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Package className="h-5 w-5" />
                    Product Catalog
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {DEMO_PRODUCTS.map((product, i) => (
                      <div 
                        key={i}
                        className="p-4 rounded-lg border bg-white hover:shadow-md transition-shadow cursor-pointer"
                        onClick={handleDemoAction}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <Badge variant="outline" className="text-xs">
                            {product.category}
                          </Badge>
                          <p className="font-bold text-lg text-purple-700">
                            ${product.price}
                          </p>
                        </div>
                        <h4 className="font-medium text-gray-900 mb-2">{product.name}</h4>
                        <div className="flex items-center justify-between text-sm">
                          <span className="text-gray-500">In Stock:</span>
                          <span className="font-medium text-green-600">{product.stock.toLocaleString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </main>

        <footer className="bg-white/80 backdrop-blur-sm border-t mt-12">
          <div className="max-w-7xl mx-auto px-4 py-6 text-center">
            <p className="text-gray-600 text-sm">
              4S Graphics CRM - Quote Calculator & Customer Journey System
            </p>
            <p className="text-gray-400 text-xs mt-1">
              Demo Mode - Contact us for full access
            </p>
          </div>
        </footer>
      </div>
    </div>
  );
}

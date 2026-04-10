import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import {
  Flame,
  ArrowLeft,
  Building2,
  Mail,
  Phone,
  MapPin,
  ExternalLink,
  Star,
  Clock,
  ChevronRight,
  Zap,
  User,
} from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import type { Customer } from "@shared/schema";

export default function HotLeadsPage() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: customersData, isLoading } = useQuery<Customer[] | { data: Customer[] }>({
    queryKey: ["/api/customers"],
  });

  const customers = Array.isArray(customersData) ? customersData : (customersData?.data || []);
  const hotLeads = customers.filter(c => c.isHotProspect === true);

  const removeHotLeadMutation = useMutation({
    mutationFn: async (customerId: string) => {
      return apiRequest("PUT", `/api/customers/${customerId}`, {
        isHotProspect: false,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Removed from hot leads" });
    },
  });

  const getCustomerName = (customer: Customer) => {
    if (customer.company) return customer.company;
    if (customer.firstName || customer.lastName) {
      return `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
    }
    return customer.email || 'Unknown';
  };

  const getPriorityLevel = (customer: Customer) => {
    const daysSinceUpdate = customer.updatedAt 
      ? Math.floor((Date.now() - new Date(customer.updatedAt).getTime()) / (1000 * 60 * 60 * 24))
      : 999;
    
    if (daysSinceUpdate < 3) return { level: 'hot', color: 'bg-red-100 text-red-700 border-red-200', label: 'Very Hot' };
    if (daysSinceUpdate < 7) return { level: 'warm', color: 'bg-orange-100 text-orange-700 border-orange-200', label: 'Warm' };
    return { level: 'cooling', color: 'bg-yellow-100 text-yellow-700 border-yellow-200', label: 'Cooling' };
  };

  return (
    <div className="min-h-screen bg-[#F7F7F7] p-6">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center gap-4 mb-6">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back
          </Button>
          <div className="flex-1">
            <h1 className="text-2xl font-bold text-[#111111] flex items-center gap-2">
              <Flame className="h-6 w-6 text-orange-500 fill-orange-500" />
              Hot Leads
            </h1>
            <p className="text-sm text-[#666666]">Clients marked as high priority prospects</p>
          </div>
          <Badge variant="outline" className="border-orange-300 text-orange-600 text-lg px-3 py-1">
            {hotLeads.length} leads
          </Badge>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-orange-500" />
              Priority Prospects
            </CardTitle>
            <CardDescription>
              Click on a lead to view full details or take action
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[600px]">
              {isLoading ? (
                <div className="flex items-center justify-center h-32">
                  <p className="text-muted-foreground">Loading hot leads...</p>
                </div>
              ) : hotLeads.length > 0 ? (
                <div className="space-y-3">
                  {hotLeads.map((customer) => {
                    const priority = getPriorityLevel(customer);
                    
                    return (
                      <div
                        key={customer.id}
                        className="p-4 border rounded-lg border-orange-200 bg-orange-50/30 hover:border-orange-300 hover:shadow-md transition-all"
                      >
                        <div className="flex items-start gap-4">
                          <div className="p-2 rounded-full bg-orange-100">
                            <Flame className="h-5 w-5 text-orange-500 fill-orange-500" />
                          </div>
                          
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-2">
                              <h4 className="font-semibold text-[#111111] truncate text-lg">
                                {getCustomerName(customer)}
                              </h4>
                              <Badge variant="outline" className={priority.color}>
                                {priority.label}
                              </Badge>
                              {customer.pricingTier && (
                                <Badge variant="outline" className="bg-purple-50 border-purple-200 text-purple-700">
                                  {customer.pricingTier}
                                </Badge>
                              )}
                            </div>
                            
                            <div className="grid grid-cols-2 gap-2 text-sm text-[#666666] mb-3">
                              {customer.email && (
                                <span className="flex items-center gap-1.5">
                                  <Mail className="h-3.5 w-3.5" />
                                  <span className="truncate">{customer.email}</span>
                                </span>
                              )}
                              {customer.phone && (
                                <span className="flex items-center gap-1.5">
                                  <Phone className="h-3.5 w-3.5" />
                                  {customer.phone}
                                </span>
                              )}
                              {(customer.city || customer.province) && (
                                <span className="flex items-center gap-1.5">
                                  <MapPin className="h-3.5 w-3.5" />
                                  {[customer.city, customer.province].filter(Boolean).join(', ')}
                                </span>
                              )}
                              {customer.updatedAt && (
                                <span className="flex items-center gap-1.5">
                                  <Clock className="h-3.5 w-3.5" />
                                  Updated {formatDistanceToNow(new Date(customer.updatedAt), { addSuffix: true })}
                                </span>
                              )}
                            </div>

                            <div className="flex items-center gap-2">
                              <Link href={`/odoo-contacts/${customer.id}`}>
                                <Button size="sm" variant="outline" className="gap-1.5">
                                  <ExternalLink className="h-3.5 w-3.5" />
                                  View Details
                                </Button>
                              </Link>
                              <Link href="/">
                                <Button size="sm" className="gap-1.5 bg-purple-600 hover:bg-purple-700">
                                  <Zap className="h-3.5 w-3.5" />
                                  SPOTLIGHT
                                </Button>
                              </Link>
                              <Button 
                                size="sm" 
                                variant="ghost" 
                                className="gap-1.5 text-gray-500 hover:text-gray-700"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  removeHotLeadMutation.mutate(customer.id);
                                }}
                                disabled={removeHotLeadMutation.isPending}
                              >
                                <Flame className="h-3.5 w-3.5" />
                                Remove
                              </Button>
                            </div>
                          </div>
                          
                          <Link href={`/odoo-contacts/${customer.id}`}>
                            <ChevronRight className="h-5 w-5 text-[#999999] mt-2 hover:text-orange-500 transition-colors cursor-pointer" />
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center h-48 text-center">
                  <div className="p-4 rounded-full bg-gray-100 mb-4">
                    <Flame className="h-12 w-12 text-gray-300" />
                  </div>
                  <p className="font-medium text-lg">No hot leads yet</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Mark customers as hot leads from SPOTLIGHT or customer details
                  </p>
                  <Link href="/">
                    <Button className="mt-4 gap-2 bg-purple-600 hover:bg-purple-700">
                      <Zap className="h-4 w-4" />
                      Start SPOTLIGHT
                    </Button>
                  </Link>
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

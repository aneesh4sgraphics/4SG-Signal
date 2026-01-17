import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Building2,
  User,
  Mail,
  Phone,
  MapPin,
  DollarSign,
  TrendingUp,
  Package,
  CreditCard,
  Clock,
  AlertCircle,
  ExternalLink,
  ChevronRight,
  Tag,
} from "lucide-react";

interface Contact {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  email2: string | null;
  company: string | null;
  phone: string | null;
  phone2: string | null;
  cell: string | null;
  address1: string | null;
  city: string | null;
  province: string | null;
  country: string | null;
  zip: string | null;
  website: string | null;
  isCompany: boolean;
  contactType: string | null;
  salesRepName: string | null;
  pricingTier: string | null;
  tags: string | null;
  note: string | null;
  isHotProspect: boolean;
  odooPartnerId: number | null;
  totalOrders: number;
  totalSpent: string;
  createdAt: string;
  updatedAt: string;
}

interface ProductCategory {
  id: number;
  name: string;
}

interface BusinessMetrics {
  salesPerson: string | null;
  paymentTerms: string | null;
  totalOutstanding: number;
  lifetimeSales: number;
  averageMargin: number;
  topProducts: Array<{ name: string; quantity: number; totalSpent: number }>;
  purchasedCategories: ProductCategory[];
  allCategories: ProductCategory[];
  connected: boolean;
}

interface OdooContact {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  function: string | null;
}

export default function OdooCompanyDetail() {
  const [, params] = useRoute("/odoo-contacts/:id");
  const companyId = params?.id;

  const { data: company, isLoading: companyLoading } = useQuery<Contact>({
    queryKey: ['/api/customers', companyId],
    queryFn: async () => {
      const res = await fetch(`/api/customers/${companyId}`);
      if (!res.ok) throw new Error('Failed to fetch company');
      return res.json();
    },
    enabled: !!companyId,
  });

  const { data: metrics, isLoading: metricsLoading } = useQuery<BusinessMetrics>({
    queryKey: ['/api/odoo/customer', companyId, 'business-metrics'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${companyId}/business-metrics`);
      if (!res.ok) throw new Error('Failed to fetch metrics');
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  const { data: contactsData, isLoading: contactsLoading } = useQuery<{ contacts: OdooContact[] }>({
    queryKey: ['/api/odoo/customer', companyId, 'contacts'],
    queryFn: async () => {
      const res = await fetch(`/api/odoo/customer/${companyId}/contacts`);
      if (!res.ok) throw new Error('Failed to fetch contacts');
      return res.json();
    },
    enabled: !!companyId,
    staleTime: 60000,
  });

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-CA', {
      style: 'currency',
      currency: 'CAD',
      minimumFractionDigits: 2,
    }).format(amount);
  };

  const formatNumber = (num: number) => {
    return new Intl.NumberFormat('en-CA').format(num);
  };

  if (companyLoading) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] p-6">
        <div className="max-w-6xl mx-auto">
          <Skeleton className="h-10 w-64 mb-6" />
          <div className="grid grid-cols-3 gap-6">
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
            <Skeleton className="h-40" />
          </div>
        </div>
      </div>
    );
  }

  if (!company) {
    return (
      <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="w-16 h-16 text-gray-400 mx-auto mb-4" />
          <h2 className="text-xl font-semibold text-gray-700 mb-2">Company Not Found</h2>
          <p className="text-gray-500 mb-4">The company you're looking for doesn't exist.</p>
          <Link href="/odoo-contacts">
            <Button variant="outline">
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Companies
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  const displayName = company.company || `${company.firstName || ''} ${company.lastName || ''}`.trim() || 'Unnamed';

  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <div className="sticky top-0 z-40 bg-white/80 backdrop-blur-md border-b border-gray-100">
        <div className="max-w-6xl mx-auto px-6 py-4">
          <div className="flex items-center gap-2 text-sm text-gray-500 mb-3">
            <Link href="/">
              <span className="hover:text-gray-900 cursor-pointer">Home</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <Link href="/odoo-contacts">
              <span className="hover:text-gray-900 cursor-pointer">Companies</span>
            </Link>
            <ChevronRight className="w-3 h-3" />
            <span className="text-gray-900 font-medium truncate max-w-[200px]">{displayName}</span>
          </div>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white shadow-lg shadow-violet-200">
                <Building2 className="w-7 h-7" />
              </div>
              <div>
                <h1 className="text-2xl font-semibold text-gray-900 tracking-tight">{displayName}</h1>
                <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                  {company.email && (
                    <a href={`mailto:${company.email}`} className="flex items-center gap-1 hover:text-violet-600">
                      <Mail className="w-3.5 h-3.5" />
                      <span>{company.email}</span>
                    </a>
                  )}
                  {company.phone && (
                    <a href={`tel:${company.phone}`} className="flex items-center gap-1 hover:text-violet-600">
                      <Phone className="w-3.5 h-3.5" />
                      <span>{company.phone}</span>
                    </a>
                  )}
                  {(company.address1 || company.city) && (
                    <span className="flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5" />
                      <span>{[company.address1, company.city, company.province, company.zip, company.country].filter(Boolean).join(', ')}</span>
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-2">
                  {company.pricingTier && (
                    <Badge variant="secondary" className="capitalize bg-violet-100 text-violet-700">
                      {company.pricingTier}
                    </Badge>
                  )}
                  {company.isHotProspect && (
                    <Badge className="bg-orange-100 text-orange-700">Hot Prospect</Badge>
                  )}
                  {!metrics?.connected && (
                    <Badge variant="outline" className="text-amber-600 border-amber-300">
                      Not linked to Odoo
                    </Badge>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <Link href={`/clients/${company.id}`}>
                <Button variant="outline" size="sm">
                  <ExternalLink className="w-4 h-4 mr-2" />
                  View Full Profile
                </Button>
              </Link>
              <Link href="/odoo-contacts">
                <Button variant="ghost" size="sm">
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  Back
                </Button>
              </Link>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-6xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-green-600 mb-2">
                    <DollarSign className="w-5 h-5" />
                    <span className="text-sm font-medium">Lifetime Sales</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-green-700">
                      {formatCurrency(metrics?.lifetimeSales || 0)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-red-50 to-rose-50 border-red-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-red-600 mb-2">
                    <AlertCircle className="w-5 h-5" />
                    <span className="text-sm font-medium">Outstanding</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-red-700">
                      {formatCurrency(metrics?.totalOutstanding || 0)}
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-blue-50 to-indigo-50 border-blue-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-blue-600 mb-2">
                    <TrendingUp className="w-5 h-5" />
                    <span className="text-sm font-medium">Avg. Margin</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-blue-700">
                      {metrics?.averageMargin || 0}%
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="bg-gradient-to-br from-purple-50 to-violet-50 border-purple-100">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 text-purple-600 mb-2">
                    <Package className="w-5 h-5" />
                    <span className="text-sm font-medium">Products</span>
                  </div>
                  {metricsLoading ? (
                    <Skeleton className="h-8 w-24" />
                  ) : (
                    <p className="text-2xl font-bold text-purple-700">
                      {metrics?.topProducts?.length || 0}
                    </p>
                  )}
                </CardContent>
              </Card>
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Package className="w-5 h-5 text-violet-500" />
                  Product Analysis
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Tabs defaultValue="purchased" className="w-full">
                  <TabsList className="grid w-full grid-cols-2 mb-4">
                    <TabsTrigger value="purchased">Products Purchased</TabsTrigger>
                    <TabsTrigger value="not-purchased">Categories Not Purchased</TabsTrigger>
                  </TabsList>
                  
                  <TabsContent value="purchased">
                    {metricsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-12 w-full" />
                        ))}
                      </div>
                    ) : metrics?.topProducts && metrics.topProducts.length > 0 ? (
                      <div className="space-y-3">
                        {metrics.topProducts.map((product, index) => (
                          <div
                            key={product.name}
                            className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                          >
                            <div className="flex items-center gap-3">
                              <div className="w-8 h-8 rounded-full bg-violet-100 flex items-center justify-center text-violet-600 font-semibold text-sm">
                                {index + 1}
                              </div>
                              <div>
                                <p className="font-medium text-gray-900 text-sm">{product.name}</p>
                                <p className="text-xs text-gray-500">
                                  Qty: {formatNumber(product.quantity)}
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="font-semibold text-gray-900">
                                {formatCurrency(product.totalSpent)}
                              </p>
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-500">
                        <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                        <p>No purchase history available</p>
                      </div>
                    )}
                  </TabsContent>
                  
                  <TabsContent value="not-purchased">
                    {metricsLoading ? (
                      <div className="space-y-3">
                        {[1, 2, 3, 4, 5].map((i) => (
                          <Skeleton key={i} className="h-10 w-full" />
                        ))}
                      </div>
                    ) : (() => {
                      const purchasedCategoryIds = new Set(metrics?.purchasedCategories?.map(c => c.id) || []);
                      const notPurchasedCategories = (metrics?.allCategories || []).filter(c => !purchasedCategoryIds.has(c.id));
                      
                      return notPurchasedCategories.length > 0 ? (
                        <div className="space-y-2">
                          {notPurchasedCategories.map((category) => (
                            <div
                              key={category.id}
                              className="flex items-center gap-3 p-3 bg-amber-50 rounded-lg border border-amber-100"
                            >
                              <Tag className="w-4 h-4 text-amber-600" />
                              <p className="font-medium text-gray-900 text-sm">{category.name}</p>
                            </div>
                          ))}
                          <p className="text-xs text-gray-500 mt-4 text-center">
                            These are product categories this customer hasn't purchased yet - potential upsell opportunities
                          </p>
                        </div>
                      ) : (
                        <div className="text-center py-8 text-gray-500">
                          <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                          <p>Customer has purchased from all categories!</p>
                        </div>
                      );
                    })()}
                  </TabsContent>
                </Tabs>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Business Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-start gap-3">
                  <User className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Sales Person</p>
                    {metricsLoading ? (
                      <Skeleton className="h-5 w-32 mt-1" />
                    ) : (
                      <p className="font-medium text-gray-900">
                        {metrics?.salesPerson || company.salesRepName || 'Not Assigned'}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <CreditCard className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Payment Terms</p>
                    {metricsLoading ? (
                      <Skeleton className="h-5 w-32 mt-1" />
                    ) : (
                      <p className="font-medium text-gray-900">
                        {metrics?.paymentTerms || 'Not Set'}
                      </p>
                    )}
                  </div>
                </div>

                <Separator />

                <div className="flex items-start gap-3">
                  <Clock className="w-5 h-5 text-gray-400 mt-0.5" />
                  <div>
                    <p className="text-sm text-gray-500">Pricing Tier</p>
                    <p className="font-medium text-gray-900 capitalize">
                      {company.pricingTier || 'Standard'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <User className="w-5 h-5 text-violet-500" />
                  Contacts
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contactsLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : contactsData?.contacts && contactsData.contacts.length > 0 ? (
                  <div className="space-y-3">
                    {contactsData.contacts.map((contact) => (
                      <div
                        key={contact.id}
                        className="p-3 bg-gray-50 rounded-lg hover:bg-gray-100 transition-colors"
                      >
                        <p className="font-medium text-gray-900 text-sm">{contact.name}</p>
                        {contact.function && (
                          <p className="text-xs text-gray-500 mt-0.5">{contact.function}</p>
                        )}
                        <div className="flex flex-wrap gap-3 mt-2 text-xs">
                          {contact.email && (
                            <a
                              href={`mailto:${contact.email}`}
                              className="flex items-center gap-1 text-violet-600 hover:text-violet-700"
                            >
                              <Mail className="w-3 h-3" />
                              {contact.email}
                            </a>
                          )}
                          {contact.phone && (
                            <a
                              href={`tel:${contact.phone}`}
                              className="flex items-center gap-1 text-gray-600 hover:text-violet-600"
                            >
                              <Phone className="w-3 h-3" />
                              {contact.phone}
                            </a>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-6 text-gray-500">
                    <User className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                    <p className="text-sm">No contacts found</p>
                  </div>
                )}
              </CardContent>
            </Card>

            {company.note && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Notes</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-gray-700 whitespace-pre-wrap">{company.note}</p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

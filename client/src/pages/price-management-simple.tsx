import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface PricingEntry {
  id: number;
  productTypeId: number;
  tierId: number;
  pricePerSquareMeter: string;
  categoryName?: string;
  productTypeName?: string;
  tierName?: string;
}

export default function PriceManagementSimple() {
  const [debug, setDebug] = useState(false);

  // Fetch pricing data with joins
  const { data: pricingData = [], isLoading, error } = useQuery<PricingEntry[]>({
    queryKey: ["/api/pricing-data"],
    staleTime: 2 * 60 * 1000,
    gcTime: 5 * 60 * 1000,
  });

  console.log("PriceManagementSimple Debug:", {
    pricingData: pricingData.slice(0, 3),
    isLoading,
    error,
    dataLength: pricingData.length
  });

  return (
    <div className="container mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <Link href="/admin">
            <Button variant="outline" size="sm">
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Admin
            </Button>
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Price Management (Simple)</h1>
        </div>
        <Button onClick={() => setDebug(!debug)} variant="outline">
          {debug ? 'Hide' : 'Show'} Debug
        </Button>
      </div>

      {debug && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Debug Information</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 text-sm">
              <div>Loading: {isLoading ? 'Yes' : 'No'}</div>
              <div>Error: {error ? error.message : 'None'}</div>
              <div>Data length: {pricingData.length}</div>
              <div>First item: {JSON.stringify(pricingData[0] || {}, null, 2)}</div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pricing Data</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-500">Loading pricing data...</p>
            </div>
          ) : error ? (
            <div className="text-center py-8">
              <div className="text-red-600 mb-2">Error loading pricing data</div>
              <p className="text-gray-500 text-sm">{error.message}</p>
            </div>
          ) : pricingData.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              No pricing data found
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      ID
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Product Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Tier
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Price/m²
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {pricingData.slice(0, 10).map((item) => (
                    <tr key={item.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.categoryName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.productTypeName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {item.tierName || 'N/A'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        ${item.pricePerSquareMeter}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {pricingData.length > 10 && (
                <div className="text-center mt-4 text-gray-500">
                  Showing first 10 of {pricingData.length} entries
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
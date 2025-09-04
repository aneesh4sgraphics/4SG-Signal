import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';
import type { ProductPricingMaster } from '@shared/schema';

export function usePricingData(userId?: string) {
  return useQuery({
    queryKey: ['pricing-data', userId],
    queryFn: () => api<{ data: ProductPricingMaster[] }>('/api/product-pricing-database').then(res => res.data || []),
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
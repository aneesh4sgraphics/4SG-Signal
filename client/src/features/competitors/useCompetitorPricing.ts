import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';
import type { CompetitorPricing } from '@shared/schema';

export function useCompetitorPricing(isAuthenticated?: boolean) {
  return useQuery({
    queryKey: ['competitor-pricing'],
    queryFn: () => api<CompetitorPricing[]>('/api/competitor-pricing'),
    enabled: isAuthenticated,
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
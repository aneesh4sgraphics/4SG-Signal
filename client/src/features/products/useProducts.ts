import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';

export function useProducts() {
  return useQuery({
    queryKey: ['products'],
    queryFn: () => api('/api/products'),
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
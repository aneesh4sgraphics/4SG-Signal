import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';
import type { Customer } from '@shared/schema';

export function useCustomers() {
  return useQuery({
    queryKey: ['customers'],
    queryFn: () => api<Customer[]>('/api/customers'),
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
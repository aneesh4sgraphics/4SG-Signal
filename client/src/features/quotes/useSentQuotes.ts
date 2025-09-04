import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';
import type { SentQuote } from '@shared/schema';

export function useSentQuotes(userId?: string) {
  return useQuery({
    queryKey: ['sent-quotes', userId],
    queryFn: () => api<SentQuote[]>('/api/sent-quotes'),
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
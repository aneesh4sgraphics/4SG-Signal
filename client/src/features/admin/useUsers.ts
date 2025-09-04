import { useQuery } from '@tanstack/react-query';
import { api } from '@/api/fetcher';
import type { User } from '@shared/schema';

export function useUsers() {
  return useQuery({
    queryKey: ['users'],
    queryFn: () => api<User[]>('/api/admin/users'),
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}
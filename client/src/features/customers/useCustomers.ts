import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import type { Customer } from '@shared/schema';

// Type for paginated response
export interface PaginatedCustomersResponse {
  data: Partial<Customer>[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Filter options for customer list
export interface CustomerFilters {
  search?: string;
  salesRepId?: string;
  pricingTier?: string;
  province?: string;
  isHotProspect?: boolean;
  isCompany?: boolean;
  doNotContact?: boolean;
}

// Build query string from filters
function buildQueryString(page: number, limit: number, filters?: CustomerFilters): string {
  const params = new URLSearchParams();
  params.set('page', String(page));
  params.set('limit', String(limit));
  params.set('paginated', 'true'); // Explicitly request paginated format
  
  if (filters?.search) params.set('search', filters.search);
  if (filters?.salesRepId) params.set('salesRepId', filters.salesRepId);
  if (filters?.pricingTier) params.set('pricingTier', filters.pricingTier);
  if (filters?.province) params.set('province', filters.province);
  if (filters?.isHotProspect !== undefined) params.set('isHotProspect', String(filters.isHotProspect));
  if (filters?.isCompany !== undefined) params.set('isCompany', String(filters.isCompany));
  if (filters?.doNotContact !== undefined) params.set('doNotContact', String(filters.doNotContact));
  
  return params.toString();
}

// Hook for paginated customers with filters
export function useCustomersPaginated(
  page: number = 1,
  limit: number = 50,
  filters?: CustomerFilters
) {
  const queryString = buildQueryString(page, limit, filters);
  
  return useQuery<PaginatedCustomersResponse>({
    queryKey: ['/api/customers', { page, limit, ...filters }],
    queryFn: async () => {
      const response = await fetch(`/api/customers?${queryString}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
    staleTime: 1 * 60 * 1000, // 1 minute
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}

// Hook for infinite scroll (load more) pattern
export function useCustomersInfinite(
  limit: number = 50,
  filters?: CustomerFilters
) {
  return useInfiniteQuery<PaginatedCustomersResponse>({
    queryKey: ['/api/customers/infinite', { limit, ...filters }],
    queryFn: async ({ pageParam = 1 }) => {
      const queryString = buildQueryString(pageParam as number, limit, filters);
      const response = await fetch(`/api/customers?${queryString}`);
      if (!response.ok) throw new Error('Failed to fetch customers');
      return response.json();
    },
    initialPageParam: 1,
    getNextPageParam: (lastPage) => {
      if (lastPage.page < lastPage.totalPages) {
        return lastPage.page + 1;
      }
      return undefined;
    },
    staleTime: 1 * 60 * 1000,
  });
}

// Legacy hook - returns full customer array for backward compatibility
// Used by dropdowns, search, dashboard stats that need all customers
export function useCustomers() {
  return useQuery<Customer[]>({
    queryKey: ['/api/customers'],
    staleTime: 1 * 60 * 1000,
    retry: (count, err: any) => {
      if ([401, 403, 404].includes(err?.status)) return false;
      return count < 2;
    },
  });
}

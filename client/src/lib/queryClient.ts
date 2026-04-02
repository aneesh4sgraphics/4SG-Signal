import { QueryClient, QueryFunction } from "@tanstack/react-query";

const appLoadTime = Date.now();
let globalAuthFailed = false;
let authPreviouslyFailed = false;

// Export function to check if auth has globally failed (for components to stop polling)
export function isAuthFailed(): boolean {
  return globalAuthFailed;
}

// Reset auth failed state (called after successful login).
// If auth was previously failed, refetch all stale queries so they recover automatically.
export function resetAuthFailed(): void {
  if (globalAuthFailed) {
    authPreviouslyFailed = true;
    globalAuthFailed = false;
    // Refetch queries that may have been stuck in error state due to auth failure.
    // Use a short delay so the auth query result propagates first.
    setTimeout(() => {
      if (authPreviouslyFailed) {
        authPreviouslyFailed = false;
        // Invalidate everything so stale/errored queries can refetch cleanly
        queryClient.invalidateQueries();
      }
    }, 300);
  }
}

export class ApiError extends Error {
  status?: number;
  statusText?: string;
  responseText?: string;
  url?: string;
  isNetworkError: boolean = false;
  isAuthError: boolean = false;

  constructor(message: string, options?: {
    status?: number;
    statusText?: string;
    responseText?: string;
    url?: string;
    isNetworkError?: boolean;
  }) {
    super(message);
    this.name = 'ApiError';
    this.status = options?.status;
    this.statusText = options?.statusText;
    this.responseText = options?.responseText;
    this.url = options?.url;
    this.isNetworkError = options?.isNetworkError || false;
    this.isAuthError = this.status === 401 || this.status === 403;
  }
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;

    let serverMessage: string | null = null;
    try {
      const parsed = JSON.parse(text);
      serverMessage = parsed.error || parsed.message || parsed.details || null;
    } catch {}

    let message: string;
    if (res.status === 401) {
      message = 'Your session has expired. Please log in again.';
    } else if (res.status === 403) {
      message = serverMessage || 'You do not have permission to access this resource.';
    } else if (res.status === 404) {
      message = serverMessage || 'The requested resource was not found.';
    } else {
      message = serverMessage || `Request failed with status ${res.status}`;
    }

    throw new ApiError(message, {
      status: res.status,
      statusText: res.statusText,
      responseText: text,
      url: res.url
    });
  }
}

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const headers: Record<string, string> = {};

    if (data) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(url, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error: Unable to connect to the server', {
        isNetworkError: true,
        url,
        responseText: error.message
      });
    }
    
    if (error instanceof ApiError) {
      throw error;
    }
    
    throw new ApiError('An unexpected error occurred', {
      responseText: error instanceof Error ? error.message : 'Unknown error',
      url
    });
  }
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey }) => {
    const url = queryKey.join("/") as string;
    
    try {
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      if (res.status === 401 || res.status === 403) {
        if (res.status === 401) {
          // Mark auth as globally failed to stop retry loops
          globalAuthFailed = true;
          // Don't immediately invalidate — let the staleTime expire naturally.
          // Aggressive invalidation here causes render flicker loops.
        }

        const message = res.status === 401
          ? "Session expired. Please log in again."
          : "You don't have permission to access this resource.";

        throw new ApiError(message, {
          status: res.status,
          statusText: res.statusText,
          url: res.url
        });
      }
      
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('fetch')) {
        throw new ApiError('Network error: Unable to connect to the server', {
          isNetworkError: true,
          url,
          responseText: error.message
        });
      }
      
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes - keep in cache
      retry: (failureCount, error) => {
        // Don't retry if auth has globally failed
        if (globalAuthFailed) return false;
        // Don't retry auth errors
        if (error instanceof ApiError && error.isAuthError) return false;
        return failureCount < 1;
      },
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

// Safe function to clear query client (called after queryClient is initialized)
export function clearQueryClientOnAuthFailure(): void {
  if (globalAuthFailed) {
    queryClient.cancelQueries();
    queryClient.clear();
  }
}

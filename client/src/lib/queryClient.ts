import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

// Track if we've already shown a session expired toast to avoid spam
let sessionExpiredToastShown = false;
let lastSessionExpiredTime = 0;

// Reset the toast shown flag after 30 seconds
function resetSessionExpiredFlag() {
  setTimeout(() => {
    sessionExpiredToastShown = false;
  }, 30000);
}

// Enhanced error class with more details
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
    
    // Create a detailed error message
    let message = `Request failed`;
    
    // Add user-friendly message based on status
    if (res.status === 401) {
      message = 'Your session has expired. Please log in again.';
    } else if (res.status === 403) {
      message = 'You do not have permission to access this resource.';
    } else if (res.status === 404) {
      message = 'The requested resource was not found.';
    } else if (res.status >= 500) {
      message = 'The server encountered an error. Please try again later.';
    } else {
      message = `Request failed with status ${res.status}`;
    }
    
    throw new ApiError(message, {
      status: res.status,
      statusText: res.statusText,
      responseText: text,
      url: res.url
    });
  }
}

// Cache version for preventing stale data issues
const CACHE_VERSION = Date.now().toString(36);

// Enhanced fetch with cache busting and service worker protection
export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    // Add cache busting for GET requests and health checks
    const urlWithCache = method === 'GET' || url.includes('/health')
      ? `${url}${url.includes('?') ? '&' : '?'}_v=${CACHE_VERSION}&_t=${Date.now()}`
      : url;

    const headers: Record<string, string> = {
      // Force fresh response, prevent service worker cache
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    };

    if (data) {
      headers['Content-Type'] = 'application/json';
    }

    const res = await fetch(urlWithCache, {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
      cache: 'no-store', // Force bypass cache
    });

    await throwIfResNotOk(res);
    return res;
  } catch (error) {
    // Handle network errors
    if (error instanceof TypeError && error.message.includes('fetch')) {
      throw new ApiError('Network error: Unable to connect to the server', {
        isNetworkError: true,
        url,
        responseText: error.message
      });
    }
    
    // Re-throw ApiErrors
    if (error instanceof ApiError) {
      throw error;
    }
    
    // Wrap other errors
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
      // Enhanced fetch with cache busting for query requests
      const urlWithCache = `${url}${url.includes('?') ? '&' : '?'}_v=${CACHE_VERSION}&_t=${Date.now()}`;
      
      const res = await fetch(urlWithCache, {
        credentials: "include",
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0',
        },
        cache: 'no-store',
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
      }

      // Handle 401/403 with toast notification (debounced to prevent spam)
      if (res.status === 401 || res.status === 403) {
        const now = Date.now();
        const message = res.status === 401 
          ? "Session expired. Please log in again."
          : "You don't have permission to access this resource.";
        
        // Only show toast if we haven't shown one recently (within 10 seconds)
        if (!sessionExpiredToastShown && (now - lastSessionExpiredTime > 10000)) {
          sessionExpiredToastShown = true;
          lastSessionExpiredTime = now;
          
          toast({
            title: res.status === 401 ? "Session Expired" : "Access Denied",
            description: message,
            variant: "destructive",
          });
          
          resetSessionExpiredFlag();
          
          // Trigger re-auth by redirecting to login after a delay (only for 401)
          if (res.status === 401) {
            setTimeout(() => {
              window.location.href = '/api/login';
            }, 2500);
          }
        }
        
        throw new ApiError(message, {
          status: res.status,
          statusText: res.statusText,
          url: res.url
        });
      }
      
      await throwIfResNotOk(res);
      return await res.json();
    } catch (error) {
      // Handle network errors
      if (error instanceof TypeError && error.message.includes('fetch')) {
        const networkError = new ApiError('Network error: Unable to connect to the server', {
          isNetworkError: true,
          url,
          responseText: error.message
        });
        
        // Log in development
        if (process.env.NODE_ENV === 'development') {
          console.error('[Network Error]', url, error);
        }
        
        throw networkError;
      }
      
      // Log ApiErrors in development
      if (error instanceof ApiError && process.env.NODE_ENV === 'development') {
        console.error('[API Error]', {
          url: error.url,
          status: error.status,
          message: error.message,
          responseText: error.responseText
        });
      }
      
      // Re-throw the error
      throw error;
    }
  };

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: false,
      staleTime: Infinity,
      retry: false,
    },
    mutations: {
      retry: false,
    },
  },
});

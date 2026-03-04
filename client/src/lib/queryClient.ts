import { QueryClient, QueryFunction } from "@tanstack/react-query";

const appLoadTime = Date.now();
let globalAuthFailed = false;
let autoLogoutTriggered = false;

// Export function to check if auth has globally failed (for components to stop polling)
export function isAuthFailed(): boolean {
  return globalAuthFailed;
}

// Reset auth failed state (called after successful login)
export function resetAuthFailed(): void {
  globalAuthFailed = false;
  autoLogoutTriggered = false;
}

// Redirect to logout — clears the session server-side then sends user to the login page
function triggerAutoLogout(): void {
  if (autoLogoutTriggered) return;
  autoLogoutTriggered = true;
  globalAuthFailed = true;
  // Small delay lets the current render cycle finish cleanly
  setTimeout(() => {
    window.location.href = '/api/logout';
  }, 300);
}

function checkLoginGracePeriod(): boolean {
  // Grace period after login
  const authTimestamp = sessionStorage.getItem('authTimestamp');
  if (authTimestamp) {
    const loginTime = parseInt(authTimestamp, 10);
    const gracePeriod = 15000; // Extended to 15 seconds for tab transitions
    if (Date.now() - loginTime < gracePeriod) {
      return true;
    }
  }
  
  // Grace period for initial app load (8 seconds)
  // This prevents "session expired" toast during initial page load race conditions
  if (Date.now() - appLoadTime < 8000) {
    return true;
  }
  
  return false;
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

    if (res.status === 401) {
      console.log('[Auth] Session expired (mutation) — auto-logout triggered');
      triggerAutoLogout();
    }

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
        const now = Date.now();
        const isInGracePeriod = checkLoginGracePeriod();
        
        if (isInGracePeriod && res.status === 401) {
          throw new ApiError("Session initializing", {
            status: res.status,
            statusText: res.statusText,
            url: res.url
          });
        }
        
        // On 401 outside the grace period, auto-logout and redirect to login
        if (res.status === 401) {
          console.log('[Auth] Session expired — auto-logout triggered');
          triggerAutoLogout();
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

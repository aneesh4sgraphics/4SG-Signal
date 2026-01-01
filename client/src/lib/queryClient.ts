import { QueryClient, QueryFunction } from "@tanstack/react-query";
import { toast } from "@/hooks/use-toast";

let sessionExpiredToastShown = false;
let lastSessionExpiredTime = 0;

function checkLoginGracePeriod(): boolean {
  const authTimestamp = sessionStorage.getItem('authTimestamp');
  if (authTimestamp) {
    const loginTime = parseInt(authTimestamp, 10);
    const gracePeriod = 10000;
    if (Date.now() - loginTime < gracePeriod) {
      return true;
    }
  }
  return false;
}

function resetSessionExpiredFlag() {
  setTimeout(() => {
    sessionExpiredToastShown = false;
  }, 30000);
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
    
    let message = `Request failed`;
    
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
        
        const message = res.status === 401 
          ? "Session expired. Please log in again."
          : "You don't have permission to access this resource.";
        
        if (!sessionExpiredToastShown && (now - lastSessionExpiredTime > 10000)) {
          sessionExpiredToastShown = true;
          lastSessionExpiredTime = now;
          
          toast({
            title: res.status === 401 ? "Session Expired" : "Access Denied",
            description: message,
            variant: "destructive",
          });
          
          resetSessionExpiredFlag();
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
      retry: 1,
      retryDelay: 1000,
    },
    mutations: {
      retry: false,
    },
  },
});

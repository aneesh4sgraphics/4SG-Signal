import { QueryClient, QueryFunction } from "@tanstack/react-query";

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

export async function apiRequest(
  method: string,
  url: string,
  data?: unknown | undefined,
): Promise<Response> {
  try {
    const res = await fetch(url, {
      method,
      headers: data ? { "Content-Type": "application/json" } : {},
      body: data ? JSON.stringify(data) : undefined,
      credentials: "include",
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
      const res = await fetch(url, {
        credentials: "include",
      });

      if (unauthorizedBehavior === "returnNull" && res.status === 401) {
        return null;
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

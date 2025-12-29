import { useQuery } from "@tanstack/react-query";
import { getQueryFn } from "@/lib/queryClient";

export function useAuth() {
  // Check if we just logged in - give session time to establish
  const justLoggedIn = typeof window !== 'undefined' && sessionStorage.getItem('justLoggedIn') === 'true';
  
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    queryFn: getQueryFn({ on401: "returnNull" }), // Return null on 401 instead of throwing
    retry: justLoggedIn ? 3 : 1, // More retries right after login
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000), // 1s, 2s, 3s delays
    staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 minutes
    refetchOnWindowFocus: false, // Don't refetch on window focus
    refetchOnMount: false, // Don't refetch on every mount
  });

  if (import.meta.env.DEV) {
    console.log("useAuth - user:", user, "isLoading:", isLoading, "error:", error);
  }

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    error
  };
}
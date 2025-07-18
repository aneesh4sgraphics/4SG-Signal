import { useQuery } from "@tanstack/react-query";

export function useAuth() {
  const { data: user, isLoading, error } = useQuery({
    queryKey: ["/api/auth/user"],
    retry: false,
    staleTime: 0, // No cache - always fetch fresh
    gcTime: 0, // Don't keep in cache
  });

  console.log("useAuth - user:", user, "isLoading:", isLoading, "error:", error);

  return {
    user,
    isLoading,
    isAuthenticated: !!user && !error,
    error
  };
}
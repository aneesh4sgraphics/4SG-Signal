import { useQuery } from "@tanstack/react-query";

interface AuthUser {
  id: string;
  email: string;
  firstName?: string;
  lastName?: string;
  profileImageUrl?: string;
  role: "admin" | "user" | "manager";
  status: "approved" | "pending" | "rejected";
  loginCount?: number;
  lastLoginDate?: string;
}

async function fetchAuthUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/user", {
    credentials: "include",
    headers: {
      "Accept": "application/json",
    },
  });

  if (res.status === 401) {
    return null;
  }

  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`);
  }

  return res.json();
}

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchAuthUser,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: true,
  });

  const isAuthenticated = !!user && !error;
  const isApproved = isAuthenticated && user?.status === "approved";
  const isAdmin = isAuthenticated && user?.role === "admin";

  return {
    user,
    isLoading,
    isAuthenticated,
    isApproved,
    isAdmin,
    error,
    refetch,
  };
}

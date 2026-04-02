import { useQuery, keepPreviousData } from "@tanstack/react-query";
import { resetAuthFailed } from "@/lib/queryClient";

const AUTH_CACHE_KEY = 'cachedAuthUser';

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

function getCachedUser(): AuthUser | undefined {
  try {
    const raw = sessionStorage.getItem(AUTH_CACHE_KEY);
    if (!raw) return undefined;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return undefined;
  }
}

async function fetchAuthUser(): Promise<AuthUser | null> {
  const res = await fetch("/api/auth/user", {
    credentials: "include",
    headers: {
      "Accept": "application/json",
    },
  });

  if (res.status === 401) {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
    return null;
  }

  if (!res.ok) {
    throw new Error(`Auth check failed: ${res.status}`);
  }

  const user = await res.json();

  if (user) {
    sessionStorage.setItem('authTimestamp', String(Date.now()));
    sessionStorage.setItem(AUTH_CACHE_KEY, JSON.stringify(user));
    resetAuthFailed();
  } else {
    sessionStorage.removeItem(AUTH_CACHE_KEY);
  }

  return user;
}

export function useAuth() {
  const { data: user, isLoading, error, refetch } = useQuery<AuthUser | null>({
    queryKey: ["/api/auth/user"],
    queryFn: fetchAuthUser,
    initialData: getCachedUser() ?? undefined,
    retry: 2,
    retryDelay: (attemptIndex) => Math.min(1000 * (attemptIndex + 1), 3000),
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
    placeholderData: keepPreviousData,
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

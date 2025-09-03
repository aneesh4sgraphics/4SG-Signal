import { useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { queryClient } from '@/lib/queryClient';

export function AuthWatcher() {
  const { user } = useAuth();
  const previousUserId = useRef<string | null>(null);
  
  useEffect(() => {
    const currentUserId = (user as any)?.id || null;
    
    // Check if user has changed (login, logout, or switch user)
    if (previousUserId.current !== currentUserId) {
      console.log('[AuthWatcher] User changed from', previousUserId.current, 'to', currentUserId);
      
      // If there was a previous user and now there's a different one (or none)
      if (previousUserId.current !== null) {
        console.log('[AuthWatcher] Invalidating all user-specific queries');
        
        // Invalidate all user-specific queries
        queryClient.invalidateQueries({ queryKey: ['/api/product-pricing-database'] });
        queryClient.invalidateQueries({ queryKey: ['/api/customers'] });
        queryClient.invalidateQueries({ queryKey: ['/api/sent-quotes'] });
        queryClient.invalidateQueries({ queryKey: ['/api/upload-batches'] });
        queryClient.invalidateQueries({ queryKey: ['/api/competitor-pricing'] });
        queryClient.invalidateQueries({ queryKey: ['/api/admin/users'] });
        queryClient.invalidateQueries({ queryKey: ['/api/activity-logs'] });
        
        // If logging in (previous was null, now there's a user)
        if (previousUserId.current === null && currentUserId !== null) {
          console.log('[AuthWatcher] User logged in, refetching data');
        }
        // If switching users
        else if (previousUserId.current !== null && currentUserId !== null) {
          console.log('[AuthWatcher] User switched, clearing all cache');
          queryClient.clear(); // Clear all cache when switching users
        }
      }
      
      // Update the ref to track the current user
      previousUserId.current = currentUserId;
    }
  }, [user]);
  
  return null; // This component doesn't render anything
}
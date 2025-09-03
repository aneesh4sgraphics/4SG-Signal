import { queryClient } from '@/lib/queryClient';

export const APP_CACHE_VERSION = 'v1.0.1';

export async function resetAppData({ whitelistKeys = [], skipReload = false }: { whitelistKeys?: string[], skipReload?: boolean } = {}) {
  console.log('[Reset] Starting app data reset...');
  
  // Step 1: Copy whitelisted keys from localStorage
  const preserved = new Map<string, string>();
  whitelistKeys.forEach(key => {
    const value = localStorage.getItem(key);
    if (value !== null) {
      preserved.set(key, value);
      console.log(`[Reset] Preserving: ${key}`);
    }
  });
  
  // Step 2: Clear localStorage and sessionStorage
  localStorage.clear();
  sessionStorage.clear();
  console.log('[Reset] Cleared localStorage and sessionStorage');
  
  // Step 3: Restore whitelisted keys
  preserved.forEach((value, key) => {
    localStorage.setItem(key, value);
    console.log(`[Reset] Restored: ${key}`);
  });
  
  // Step 4: Delete all IndexedDB databases
  if ('indexedDB' in window) {
    try {
      if ('databases' in indexedDB) {
        const databases = await indexedDB.databases();
        for (const db of databases) {
          if (db.name) {
            console.log(`[Reset] Deleting IndexedDB: ${db.name}`);
            await indexedDB.deleteDatabase(db.name);
          }
        }
      }
    } catch (error) {
      console.warn('[Reset] Could not clear IndexedDB:', error);
    }
  }
  
  // Step 5: Clear React Query cache if present
  try {
    queryClient.clear();
    console.log('[Reset] Cleared React Query cache');
  } catch (error) {
    console.warn('[Reset] Could not clear React Query cache:', error);
  }
  
  // Step 6: Unregister all service workers
  if ('serviceWorker' in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        await registration.unregister();
        console.log('[Reset] Unregistered service worker');
      }
    } catch (error) {
      console.warn('[Reset] Could not unregister service workers:', error);
    }
  }
  
  // Step 7: Reload the page (unless skipped)
  if (!skipReload) {
    console.log('[Reset] Reloading page...');
    location.reload();
  }
}

export async function checkAndUpdateVersion() {
  const storedVersion = localStorage.getItem('APP_CACHE_VERSION');
  
  if (storedVersion !== APP_CACHE_VERSION) {
    console.log(`[Cache Version] Version mismatch: stored=${storedVersion}, current=${APP_CACHE_VERSION}`);
    console.log('[Cache Version] Running automatic cache clear...');
    
    // Clear caches but preserve theme and set new version
    await resetAppData({ 
      whitelistKeys: ['theme', 'APP_CACHE_VERSION'],
      skipReload: true 
    });
    
    // Set the new version
    localStorage.setItem('APP_CACHE_VERSION', APP_CACHE_VERSION);
    console.log(`[Cache Version] Updated to version ${APP_CACHE_VERSION}`);
    
    // Reload to apply changes
    location.reload();
  } else {
    console.log(`[Cache Version] Version is current: ${APP_CACHE_VERSION}`);
  }
}
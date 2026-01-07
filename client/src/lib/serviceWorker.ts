// Service Worker Registration and Management
export class ServiceWorkerManager {
  private registration: ServiceWorkerRegistration | null = null;
  private updateAvailable = false;
  
  // Cache version should match the one in sw.js
  public readonly CACHE_VERSION = 'v1.0.2';
  
  async register(): Promise<void> {
    if (!('serviceWorker' in navigator)) {
      console.log('[SW Manager] Service workers not supported');
      return;
    }
    
    try {
      // Register the service worker
      this.registration = await navigator.serviceWorker.register('/sw.js', {
        scope: '/'
      });
      
      console.log('[SW Manager] Service worker registered successfully');
      
      // Set up event listeners
      this.setupEventListeners();
      
      // Check for updates immediately
      await this.checkForUpdates();
      
      // Check for updates periodically (every 30 minutes)
      setInterval(() => this.checkForUpdates(), 30 * 60 * 1000);
      
    } catch (error) {
      console.error('[SW Manager] Registration failed:', error);
    }
  }
  
  private setupEventListeners(): void {
    if (!this.registration) return;
    if (!('serviceWorker' in navigator)) return;
    
    // Listen for new service worker waiting
    this.registration.addEventListener('updatefound', () => {
      console.log('[SW Manager] New service worker found');
      
      const newWorker = this.registration!.installing;
      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker?.controller) {
            console.log('[SW Manager] New service worker waiting');
            this.updateAvailable = true;
            this.notifyUpdateAvailable();
          }
        });
      }
    });
    
    // Listen for controller changes
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      console.log('[SW Manager] Controller changed, reloading page');
      window.location.reload();
    });
    
    // Listen for messages from service worker
    navigator.serviceWorker.addEventListener('message', (event) => {
      console.log('[SW Manager] Message from service worker:', event.data);
      
      if (event.data && event.data.type === 'VERSION_INFO') {
        console.log('[SW Manager] Service worker version:', event.data.version);
      }
    });
  }
  
  async checkForUpdates(): Promise<void> {
    if (!this.registration) return;
    
    try {
      await this.registration.update();
      console.log('[SW Manager] Checked for updates');
    } catch (error) {
      console.error('[SW Manager] Update check failed:', error);
    }
  }
  
  async activateUpdate(): Promise<void> {
    if (!this.registration?.waiting) {
      console.log('[SW Manager] No update waiting');
      return;
    }
    
    console.log('[SW Manager] Activating update');
    
    // Tell the waiting service worker to skip waiting
    this.registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  }
  
  private notifyUpdateAvailable(): void {
    // Show update notification to user
    const updateBanner = document.createElement('div');
    updateBanner.id = 'sw-update-banner';
    updateBanner.className = 'fixed bottom-4 right-4 z-50 bg-blue-600 text-white p-4 rounded-lg shadow-lg flex items-center gap-3';
    updateBanner.innerHTML = `
      <div class="flex-1">
        <div class="font-semibold">Update Available</div>
        <div class="text-sm opacity-90">A new version of the app is available.</div>
      </div>
      <button id="sw-update-btn" class="px-4 py-2 bg-white text-blue-600 rounded font-medium hover:bg-blue-50 transition-colors">
        Update Now
      </button>
      <button id="sw-dismiss-btn" class="text-white hover:text-blue-100">
        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
        </svg>
      </button>
    `;
    
    document.body.appendChild(updateBanner);
    
    // Handle update button click
    document.getElementById('sw-update-btn')?.addEventListener('click', () => {
      this.activateUpdate();
      updateBanner.remove();
    });
    
    // Handle dismiss button click
    document.getElementById('sw-dismiss-btn')?.addEventListener('click', () => {
      updateBanner.remove();
    });
  }
  
  async clearCache(): Promise<void> {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker?.controller) {
      console.log('[SW Manager] No active service worker');
      return;
    }
    
    const controller = navigator.serviceWorker.controller;
    
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'CACHE_CLEARED') {
          console.log('[SW Manager] Cache cleared successfully');
          resolve();
        }
      };
      
      controller.postMessage(
        { type: 'CLEAR_CACHE' },
        [messageChannel.port2]
      );
    });
  }
  
  async getVersion(): Promise<string | null> {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker?.controller) {
      return null;
    }
    
    const controller = navigator.serviceWorker.controller;
    
    return new Promise((resolve) => {
      const messageChannel = new MessageChannel();
      
      messageChannel.port1.onmessage = (event) => {
        if (event.data && event.data.type === 'VERSION_INFO') {
          resolve(event.data.version);
        }
      };
      
      controller.postMessage(
        { type: 'CHECK_VERSION' },
        [messageChannel.port2]
      );
    });
  }
  
  async unregister(): Promise<boolean> {
    if (!this.registration) {
      return false;
    }
    
    try {
      const success = await this.registration.unregister();
      console.log('[SW Manager] Unregistered:', success);
      return success;
    } catch (error) {
      console.error('[SW Manager] Unregister failed:', error);
      return false;
    }
  }
  
  isUpdateAvailable(): boolean {
    return this.updateAvailable;
  }
  
  hasActiveWorker(): boolean {
    return !!('serviceWorker' in navigator && navigator.serviceWorker?.controller);
  }
}

// Export singleton instance
export const swManager = new ServiceWorkerManager();
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { swManager } from "./lib/serviceWorker";
import { checkAndUpdateVersion } from "./lib/cache";

// Check and update cache version on app startup
checkAndUpdateVersion().catch(error => {
  console.error('Cache version check failed:', error);
});

// Register service worker in production
if (import.meta.env.PROD) {
  window.addEventListener('load', () => {
    swManager.register().catch(error => {
      console.error('Service worker registration failed:', error);
    });
  });
}

// Expose service worker manager globally for debugging
if (import.meta.env.DEV) {
  (window as any).swManager = swManager;
}

createRoot(document.getElementById("root")!).render(<App />);

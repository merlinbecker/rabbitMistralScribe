import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { registerServiceWorker } from "./lib/registerServiceWorker";

createRoot(document.getElementById("root")!).render(<App />);

// Register service worker for PWA after DOM is ready
if (document.readyState === 'complete') {
  registerServiceWorker();
} else {
  window.addEventListener('load', () => {
    registerServiceWorker();
  });
}

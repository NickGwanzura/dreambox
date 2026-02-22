
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log("Initializing Billboard Suite...");

try {
  const rootElement = document.getElementById('root');
  if (!rootElement) {
    throw new Error("Could not find root element to mount to");
  }

  // Use createRoot directly from named import
  const root = createRoot(rootElement);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
  console.log("App mounted successfully.");
} catch (error) {
  console.error("Failed to mount application:", error);
  document.body.innerHTML = `
    <div style="
        height: 100vh; 
        display: flex; 
        flex-direction: column; 
        align-items: center; 
        justify-content: center; 
        text-align: center; 
        font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
        background-color: #f8fafc;
        color: #1e293b;
        padding: 20px;
    ">
        <h1 style="font-size: 1.5rem; font-weight: 700; margin-bottom: 1rem; color: #ef4444;">Application Failed to Load</h1>
        <p style="margin-bottom: 1rem; max-width: 500px; line-height: 1.5;">An unexpected error occurred during initialization. This may be due to a deployment configuration issue.</p>
        <pre style="background: #f1f5f9; padding: 1rem; border-radius: 0.5rem; color: #ef4444; font-size: 0.875rem; overflow-x: auto; max-width: 100%; text-align: left;">
${error instanceof Error ? error.message : String(error)}
        </pre>
        <button onclick="window.location.reload()" style="margin-top: 2rem; padding: 0.75rem 1.5rem; background-color: #0f172a; color: white; border: none; border-radius: 9999px; font-weight: 600; cursor: pointer;">Reload Application</button>
    </div>
  `;
}

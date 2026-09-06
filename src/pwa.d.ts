/// <reference types="vite-plugin-pwa/client" />

declare global {
  interface Window {
    /** Set by App so Settings can force an update check. */
    __hybridCheckForUpdate?: () => void | Promise<void>;
  }
}

export {};

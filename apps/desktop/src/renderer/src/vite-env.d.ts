/// <reference types="vite/client" />

interface Window {
  roomi: {
    platform: NodeJS.Platform;
    windowControls: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
    };
  };
}

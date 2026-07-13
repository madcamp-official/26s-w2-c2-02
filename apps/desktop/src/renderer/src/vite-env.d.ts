/// <reference types="vite/client" />

interface Window {
  roomi: {
    platform: NodeJS.Platform;
    windowControls: {
      minimize: () => Promise<void>;
      toggleMaximize: () => Promise<void>;
      close: () => Promise<void>;
    };
    media: {
      ensureAccess: () => Promise<{ camera: boolean; microphone: boolean }>;
      openPrivacySettings: () => Promise<void>;
    };
    clipboard: {
      writeText: (text: string) => void;
    };
  };
}

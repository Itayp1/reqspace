import { create } from 'zustand';

interface ExtensionStore {
  /** Whether to show the "Install Reqspace Extension" download modal. */
  showDownloadModal: boolean;
  setShowDownloadModal: (show: boolean) => void;
}

export const useExtensionStore = create<ExtensionStore>((set) => ({
  showDownloadModal: false,
  setShowDownloadModal: (showDownloadModal) => set({ showDownloadModal }),
}));

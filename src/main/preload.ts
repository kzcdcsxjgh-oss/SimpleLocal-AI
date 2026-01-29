import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // Ollama operations
  checkOllama: () => ipcRenderer.invoke('ollama:check'),
  getModels: () => ipcRenderer.invoke('ollama:models'),
  setModel: (modelName: string) => ipcRenderer.invoke('ollama:setModel', modelName),

  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // Document operations
  processDocument: (filePath: string) => ipcRenderer.invoke('document:process', filePath),
  listDocuments: () => ipcRenderer.invoke('document:list'),
  removeDocument: (documentId: string) => ipcRenderer.invoke('document:remove', documentId),

  // Chat operations
  sendMessage: (message: string) => ipcRenderer.invoke('chat:send', message),
  clearChat: () => ipcRenderer.invoke('chat:clear'),

  // Event listeners
  onDocumentProcessing: (callback: (data: any) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('document:processing', subscription);
    return () => ipcRenderer.removeListener('document:processing', subscription);
  },

  onChatStream: (callback: (data: { chunk: string; done: boolean }) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('chat:stream', subscription);
    return () => ipcRenderer.removeListener('chat:stream', subscription);
  },
});

// Type definitions for the exposed API
export interface ElectronAPI {
  checkOllama: () => Promise<{ available: boolean; error?: string }>;
  getModels: () => Promise<{ models: string[] }>;
  setModel: (modelName: string) => Promise<{ success: boolean }>;
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  processDocument: (filePath: string) => Promise<{ success: boolean; chunks?: number; error?: string }>;
  listDocuments: () => Promise<{ id: string; name: string; path: string; addedAt: string }[]>;
  removeDocument: (documentId: string) => Promise<{ success: boolean }>;
  sendMessage: (message: string) => Promise<{ success: boolean; response?: string; error?: string }>;
  clearChat: () => Promise<{ success: boolean }>;
  onDocumentProcessing: (callback: (data: any) => void) => () => void;
  onChatStream: (callback: (data: { chunk: string; done: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

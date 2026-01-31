import { contextBridge, ipcRenderer } from 'electron';

// Expose protected methods that allow the renderer process to use
// ipcRenderer without exposing the entire object
contextBridge.exposeInMainWorld('electronAPI', {
  // AI status operations
  checkAI: () => ipcRenderer.invoke('ai:check'),
  initializeAI: () => ipcRenderer.invoke('ai:initialize'),

  // File dialog
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // Document operations
  processDocument: (filePath: string) => ipcRenderer.invoke('document:process', filePath),
  listDocuments: () => ipcRenderer.invoke('document:list'),
  removeDocument: (documentId: string) => ipcRenderer.invoke('document:remove', documentId),

  // Chat operations
  sendMessage: (message: string) => ipcRenderer.invoke('chat:send', message),
  clearChat: () => ipcRenderer.invoke('chat:clear'),

  // Chat session operations
  getChatSessions: () => ipcRenderer.invoke('chat:getSessions'),
  getChatSession: (sessionId: string) => ipcRenderer.invoke('chat:getSession', sessionId),
  createChatSession: () => ipcRenderer.invoke('chat:createSession'),
  updateChatSession: (sessionId: string, messages: ChatMessage[], title?: string) =>
    ipcRenderer.invoke('chat:updateSession', sessionId, messages, title),
  deleteChatSession: (sessionId: string) => ipcRenderer.invoke('chat:deleteSession', sessionId),
  renameChatSession: (sessionId: string, title: string) =>
    ipcRenderer.invoke('chat:renameSession', sessionId, title),

  // Event listeners
  onAIStatus: (callback: (data: AIStatus) => void) => {
    const subscription = (_event: any, data: any) => callback(data);
    ipcRenderer.on('ai:status', subscription);
    return () => ipcRenderer.removeListener('ai:status', subscription);
  },

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

// Type definitions
export interface AIStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
  modelName?: string;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface ElectronAPI {
  checkAI: () => Promise<AIStatus>;
  initializeAI: () => Promise<{ success: boolean; error?: string }>;
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;
  processDocument: (filePath: string) => Promise<{ success: boolean; chunks?: number; error?: string }>;
  listDocuments: () => Promise<{ id: string; name: string; path: string; addedAt: string }[]>;
  removeDocument: (documentId: string) => Promise<{ success: boolean }>;
  sendMessage: (message: string) => Promise<{ success: boolean; response?: string; error?: string }>;
  clearChat: () => Promise<{ success: boolean }>;
  getChatSessions: () => Promise<ChatSession[]>;
  getChatSession: (sessionId: string) => Promise<ChatSession | null>;
  createChatSession: () => Promise<ChatSession>;
  updateChatSession: (sessionId: string, messages: ChatMessage[], title?: string) => Promise<ChatSession | null>;
  deleteChatSession: (sessionId: string) => Promise<{ success: boolean }>;
  renameChatSession: (sessionId: string, title: string) => Promise<ChatSession | null>;
  onAIStatus: (callback: (data: AIStatus) => void) => () => void;
  onDocumentProcessing: (callback: (data: any) => void) => () => void;
  onChatStream: (callback: (data: { chunk: string; done: boolean }) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

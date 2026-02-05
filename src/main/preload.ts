import { contextBridge, ipcRenderer } from 'electron';

// Type definitions
export interface AIStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
  provider?: string;
}

export type LLMProvider = 'ollama' | 'openai';

export interface LLMSettings {
  provider?: LLMProvider;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  hasApiKey?: boolean;
}

export interface AppSettings {
  llm: LLMSettings;
}

export interface Source {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
  createdAt?: string;
}

export interface Conversation {
  id: string;
  title: string;
  documentIds: string[];
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

export interface ChatStreamData {
  chunk: string;
  done: boolean;
  sources?: Source[];
  error?: string;
}

// Expose protected methods to renderer
contextBridge.exposeInMainWorld('electronAPI', {
  // === AI Status ===
  checkAI: () => ipcRenderer.invoke('ai:check'),

  // === Settings ===
  getSettings: () => ipcRenderer.invoke('settings:get'),
  setSettings: (settings: AppSettings) => ipcRenderer.invoke('settings:set', settings),

  // === File Dialog ===
  openFileDialog: () => ipcRenderer.invoke('dialog:openFile'),

  // === Documents ===
  processDocument: (filePath: string) => ipcRenderer.invoke('document:process', filePath),
  listDocuments: () => ipcRenderer.invoke('document:list'),
  removeDocument: (documentId: string) => ipcRenderer.invoke('document:remove', documentId),

  // === Conversations (new API) ===
  listConversations: () => ipcRenderer.invoke('conversation:list'),
  getConversation: (conversationId: string) => ipcRenderer.invoke('conversation:get', conversationId),
  createConversation: (documentIds?: string[]) => ipcRenderer.invoke('conversation:create', documentIds),
  updateConversation: (conversationId: string, updates: { title?: string; documentIds?: string[] }) =>
    ipcRenderer.invoke('conversation:update', conversationId, updates),
  deleteConversation: (conversationId: string) => ipcRenderer.invoke('conversation:delete', conversationId),

  // === Chat (conversation-based) ===
  sendMessage: (conversationId: string, message: string) =>
    ipcRenderer.invoke('chat:send', conversationId, message),
  clearChat: () => ipcRenderer.invoke('chat:clear'),

  // === Legacy Chat Session API (backwards compatibility) ===
  getChatSessions: () => ipcRenderer.invoke('chat:getSessions'),
  getChatSession: (sessionId: string) => ipcRenderer.invoke('chat:getSession', sessionId),
  createChatSession: () => ipcRenderer.invoke('chat:createSession'),
  updateChatSession: (sessionId: string, messages: ChatMessage[], title?: string) =>
    ipcRenderer.invoke('chat:updateSession', sessionId, messages, title),
  deleteChatSession: (sessionId: string) => ipcRenderer.invoke('chat:deleteSession', sessionId),
  renameChatSession: (sessionId: string, title: string) =>
    ipcRenderer.invoke('chat:renameSession', sessionId, title),

  // === Event Listeners ===
  onAIStatus: (callback: (data: AIStatus) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: AIStatus) => callback(data);
    ipcRenderer.on('ai:status', subscription);
    return () => ipcRenderer.removeListener('ai:status', subscription);
  },

  onDocumentProcessing: (callback: (data: { filePath: string; status: string; error?: string }) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: { filePath: string; status: string; error?: string }) => callback(data);
    ipcRenderer.on('document:processing', subscription);
    return () => ipcRenderer.removeListener('document:processing', subscription);
  },

  onChatStream: (callback: (data: ChatStreamData) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, data: ChatStreamData) => callback(data);
    ipcRenderer.on('chat:stream', subscription);
    return () => ipcRenderer.removeListener('chat:stream', subscription);
  },
});

// TypeScript interface for window.electronAPI
export interface ElectronAPI {
  // AI
  checkAI: () => Promise<AIStatus>;

  // Settings
  getSettings: () => Promise<AppSettings>;
  setSettings: (settings: AppSettings) => Promise<{ success: boolean; ready: boolean }>;

  // File Dialog
  openFileDialog: () => Promise<{ canceled: boolean; filePaths: string[] }>;

  // Documents
  processDocument: (filePath: string) => Promise<{ success: boolean; document?: Document; error?: string }>;
  listDocuments: () => Promise<Document[]>;
  removeDocument: (documentId: string) => Promise<{ success: boolean; error?: string }>;

  // Conversations (new)
  listConversations: () => Promise<Omit<Conversation, 'messages'>[]>;
  getConversation: (conversationId: string) => Promise<Conversation | null>;
  createConversation: (documentIds?: string[]) => Promise<Conversation>;
  updateConversation: (conversationId: string, updates: { title?: string; documentIds?: string[] }) => Promise<Omit<Conversation, 'messages'>>;
  deleteConversation: (conversationId: string) => Promise<{ success: boolean }>;

  // Chat
  sendMessage: (conversationId: string, message: string) => Promise<{ success: boolean; sources?: Source[]; error?: string }>;
  clearChat: () => Promise<{ success: boolean }>;

  // Legacy Chat Sessions
  getChatSessions: () => Promise<Conversation[]>;
  getChatSession: (sessionId: string) => Promise<Conversation | null>;
  createChatSession: () => Promise<Conversation>;
  updateChatSession: (sessionId: string, messages: ChatMessage[], title?: string) => Promise<Conversation | null>;
  deleteChatSession: (sessionId: string) => Promise<{ success: boolean }>;
  renameChatSession: (sessionId: string, title: string) => Promise<Conversation | null>;

  // Events
  onAIStatus: (callback: (data: AIStatus) => void) => () => void;
  onDocumentProcessing: (callback: (data: { filePath: string; status: string; error?: string }) => void) => () => void;
  onChatStream: (callback: (data: ChatStreamData) => void) => () => void;
}

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

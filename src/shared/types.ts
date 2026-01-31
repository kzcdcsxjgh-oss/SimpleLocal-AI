/**
 * Shared types between main and renderer processes
 */

export interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  chunkCount?: number;
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

export interface ProcessingStatus {
  filePath: string;
  status: 'started' | 'processing' | 'completed' | 'error';
  progress?: number;
  error?: string;
}

export interface OllamaStatus {
  available: boolean;
  error?: string;
  models?: string[];
  currentModel?: string;
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system';
  fontSize: 'small' | 'medium' | 'large';
  ollamaModel: string;
  chunkSize: number;
  chunkOverlap: number;
}

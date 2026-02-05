/**
 * Storage interface
 *
 * Verantwoordelijk voor persistentie van documents, chunks, conversations en messages.
 * Implementaties: SQLite, in-memory (voor tests)
 */

import type {
  Document,
  Chunk,
  Conversation,
  Message,
} from './types';

export interface DocumentInput {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  hash: string;
}

export interface ChunkInput {
  documentId: string;
  content: string;
  index: number;
  startOffset: number;
  endOffset: number;
}

export interface ConversationInput {
  title?: string;
  documentIds?: string[];
}

export interface MessageInput {
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Message['sources'];
}

export interface IStorage {
  // === Lifecycle ===
  initialize(): Promise<void>;
  close(): Promise<void>;

  // === Documents ===
  createDocument(input: DocumentInput): Promise<Document>;
  getDocument(id: string): Promise<Document | null>;
  getDocumentByPath(path: string): Promise<Document | null>;
  listDocuments(): Promise<Document[]>;
  deleteDocument(id: string): Promise<void>;

  // === Chunks ===
  createChunks(chunks: ChunkInput[]): Promise<Chunk[]>;
  getChunksForDocument(documentId: string): Promise<Chunk[]>;
  getChunk(id: string): Promise<Chunk | null>;
  deleteChunksForDocument(documentId: string): Promise<void>;

  // === Conversations ===
  createConversation(input?: ConversationInput): Promise<Conversation>;
  getConversation(id: string): Promise<Conversation | null>;
  listConversations(): Promise<Conversation[]>;
  updateConversation(id: string, updates: Partial<ConversationInput>): Promise<Conversation>;
  deleteConversation(id: string): Promise<void>;

  // === Messages ===
  createMessage(input: MessageInput): Promise<Message>;
  getMessagesForConversation(conversationId: string): Promise<Message[]>;
  deleteMessagesForConversation(conversationId: string): Promise<void>;
}

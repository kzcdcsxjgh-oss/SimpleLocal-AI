/**
 * Core types voor MakeItPrivate
 * Geen dependencies, pure data structuren
 */

// === Documents ===

export interface Document {
  id: string;
  name: string;
  path: string;
  mimeType: string;
  size: number;
  hash: string; // Voor detectie of document gewijzigd is
  createdAt: Date;
  updatedAt: Date;
}

export interface Chunk {
  id: string;
  documentId: string;
  content: string;
  index: number; // Positie in document
  startOffset: number; // Character offset voor highlighting
  endOffset: number;
}

// === Chat ===

export interface Conversation {
  id: string;
  title: string;
  documentIds: string[]; // Welke documenten actief in dit gesprek
  createdAt: Date;
  updatedAt: Date;
}

export interface Message {
  id: string;
  conversationId: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[]; // Bronverwijzingen voor assistant berichten
  createdAt: Date;
}

export interface Source {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string; // De relevante tekst
  score: number; // Relevantie score
}

// === Search ===

export interface SearchResult {
  chunk: Chunk;
  document: Document;
  score: number;
  highlights?: string[]; // Gemarkeerde fragmenten
}

export interface SearchOptions {
  documentIds?: string[]; // Beperk tot specifieke documenten
  limit?: number;
  minScore?: number;
}

// === LLM ===

export interface GenerateOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

// === Errors ===

export class CoreError extends Error {
  constructor(
    message: string,
    public code: string,
    public cause?: Error
  ) {
    super(message);
    this.name = 'CoreError';
  }
}

export class DocumentNotFoundError extends CoreError {
  constructor(id: string) {
    super(`Document niet gevonden: ${id}`, 'DOCUMENT_NOT_FOUND');
  }
}

export class ConversationNotFoundError extends CoreError {
  constructor(id: string) {
    super(`Gesprek niet gevonden: ${id}`, 'CONVERSATION_NOT_FOUND');
  }
}

export class LLMConnectionError extends CoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'LLM_CONNECTION_ERROR', cause);
  }
}

export class SearchError extends CoreError {
  constructor(message: string, cause?: Error) {
    super(message, 'SEARCH_ERROR', cause);
  }
}

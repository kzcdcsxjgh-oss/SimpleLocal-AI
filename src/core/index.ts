/**
 * SimpleLocal AI Core
 *
 * Framework-agnostische core library.
 * Kan gebruikt worden vanuit Electron, Tauri, CLI, of tests.
 */

import path from 'path';
import type { IStorage } from './interfaces/storage';
import type { ISearch } from './interfaces/search';
import type { ILLM, LLMConfig } from './interfaces/llm';
import type {
  Document,
  Conversation,
  Message,
  Source,
  SearchResult,
  StreamChunk,
  GenerateOptions,
} from './interfaces/types';
import { SQLiteStorage } from './storage/sqlite';
import { FTS5Search } from './search/fts';
import { OllamaAdapter } from './adapters/ollama';
import { OpenAIAdapter } from './adapters/openai';
import { DocumentProcessor } from './document-processor';

// Re-export types
export * from './interfaces/types';
export * from './interfaces/storage';
export * from './interfaces/search';
export * from './interfaces/llm';

export interface CoreConfig {
  dataDir: string; // Directory for database and data
  llm?: LLMConfig;
}

export interface ChatOptions extends GenerateOptions {
  includeHistory?: boolean; // Include conversation history in context
  maxHistoryMessages?: number;
  maxContextChunks?: number;
}

export class Core {
  private storage: SQLiteStorage;
  private searchEngine: FTS5Search;
  private llm: ILLM;
  private processor: DocumentProcessor;
  private initialized = false;

  constructor(private config: CoreConfig) {
    const dbPath = path.join(config.dataDir, 'simplelocal.db');
    this.storage = new SQLiteStorage(dbPath);
    this.searchEngine = new FTS5Search(this.storage);
    this.llm = this.createLLMAdapter(config.llm);
    this.processor = new DocumentProcessor();
  }

  /**
   * Create LLM adapter based on provider config
   */
  private createLLMAdapter(config?: LLMConfig): ILLM {
    const provider = config?.provider ?? 'ollama';

    switch (provider) {
      case 'openai':
        return new OpenAIAdapter(config);
      case 'ollama':
      default:
        return new OllamaAdapter(config);
    }
  }

  /**
   * Change LLM provider at runtime
   */
  setLLMConfig(config: LLMConfig): void {
    this.llm = this.createLLMAdapter(config);
    this.config.llm = config;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    await this.storage.initialize();
    this.initialized = true;
  }

  async close(): Promise<void> {
    await this.storage.close();
    this.initialized = false;
  }

  // === LLM Status ===

  async isLLMAvailable(): Promise<boolean> {
    return this.llm.isAvailable();
  }

  getLLMConfig(): LLMConfig {
    return this.llm.getConfig();
  }

  // === Documents ===

  async addDocument(filePath: string): Promise<Document> {
    this.ensureInitialized();

    // Process document once (hash + tekst + chunks)
    const processed = await this.processor.process(filePath);

    // Check if document already exists
    const existing = await this.storage.getDocumentByPath(filePath);
    if (existing) {
      if (processed.hash === existing.hash) {
        return existing; // Geen wijzigingen
      }
      // Document gewijzigd, oude data verwijderen
      await this.storage.deleteDocument(existing.id);
    }

    // Store document
    const document = await this.storage.createDocument({
      name: processed.name,
      path: processed.path,
      mimeType: processed.mimeType,
      size: processed.size,
      hash: processed.hash,
    });

    // Store chunks with document ID
    const chunksWithDocId = processed.chunks.map(chunk => ({
      ...chunk,
      documentId: document.id,
    }));
    await this.storage.createChunks(chunksWithDocId);

    return document;
  }

  async removeDocument(documentId: string): Promise<void> {
    this.ensureInitialized();
    await this.storage.deleteDocument(documentId);
  }

  async listDocuments(): Promise<Document[]> {
    this.ensureInitialized();
    return this.storage.listDocuments();
  }

  async getDocument(documentId: string): Promise<Document | null> {
    this.ensureInitialized();
    return this.storage.getDocument(documentId);
  }

  getSupportedExtensions(): string[] {
    return this.processor.getSupportedExtensions();
  }

  // === Conversations ===

  async createConversation(documentIds?: string[], title?: string): Promise<Conversation> {
    this.ensureInitialized();
    return this.storage.createConversation({ documentIds, title });
  }

  async getConversation(conversationId: string): Promise<Conversation | null> {
    this.ensureInitialized();
    return this.storage.getConversation(conversationId);
  }

  async listConversations(): Promise<Conversation[]> {
    this.ensureInitialized();
    return this.storage.listConversations();
  }

  async updateConversation(
    conversationId: string,
    updates: { title?: string; documentIds?: string[] }
  ): Promise<Conversation> {
    this.ensureInitialized();
    return this.storage.updateConversation(conversationId, updates);
  }

  async deleteConversation(conversationId: string): Promise<void> {
    this.ensureInitialized();
    await this.storage.deleteConversation(conversationId);
  }

  async getMessages(conversationId: string): Promise<Message[]> {
    this.ensureInitialized();
    return this.storage.getMessagesForConversation(conversationId);
  }

  async clearMessages(conversationId: string): Promise<void> {
    this.ensureInitialized();
    await this.storage.deleteMessagesForConversation(conversationId);
  }

  // === Chat ===

  /**
   * Send a message and get a streaming response
   */
  async *chat(
    conversationId: string,
    userMessage: string,
    options?: ChatOptions
  ): AsyncGenerator<StreamChunk & { sources?: Source[] }> {
    this.ensureInitialized();

    const conversation = await this.storage.getConversation(conversationId);
    if (!conversation) {
      throw new Error('Gesprek niet gevonden');
    }

    // Save user message
    await this.storage.createMessage({
      conversationId,
      role: 'user',
      content: userMessage,
    });

    // Search for relevant chunks (scoped to conversation's documents)
    const searchResults = await this.searchEngine.search(userMessage, {
      documentIds: conversation.documentIds.length > 0 ? conversation.documentIds : undefined,
      limit: options?.maxContextChunks ?? 5,
    });

    // Build context from search results
    const context = this.buildContext(searchResults);
    const sources = this.buildSources(searchResults);

    // Get conversation history if needed
    const history = options?.includeHistory !== false
      ? await this.getRecentHistory(conversationId, options?.maxHistoryMessages ?? 10)
      : [];

    // Build messages for LLM
    const messages = [
      ...history,
      { role: 'user' as const, content: userMessage },
    ];

    // Stream response
    let fullResponse = '';
    for await (const chunk of this.llm.generate(messages, context, options)) {
      fullResponse += chunk.content;
      yield { ...chunk, sources: chunk.done ? sources : undefined };
    }

    // Save assistant message with sources
    await this.storage.createMessage({
      conversationId,
      role: 'assistant',
      content: fullResponse,
      sources,
    });

    // Update conversation title if it's the first exchange
    if (history.length === 0) {
      const title = this.generateTitle(userMessage);
      await this.storage.updateConversation(conversationId, { title });
    }
  }

  /**
   * Non-streaming chat for simple use cases
   */
  async chatSync(
    conversationId: string,
    userMessage: string,
    options?: ChatOptions
  ): Promise<{ response: string; sources: Source[] }> {
    let response = '';
    let sources: Source[] = [];

    for await (const chunk of this.chat(conversationId, userMessage, options)) {
      response += chunk.content;
      if (chunk.sources) {
        sources = chunk.sources;
      }
    }

    return { response, sources };
  }

  // === Search ===

  async search(query: string, documentIds?: string[]): Promise<SearchResult[]> {
    this.ensureInitialized();
    return this.searchEngine.search(query, { documentIds });
  }

  // === Private Helpers ===

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error('Core not initialized. Call initialize() first.');
    }
  }

  private buildContext(results: SearchResult[]): string {
    if (results.length === 0) {
      return '';
    }

    return results
      .map((r, i) => `[Bron ${i + 1}: ${r.document.name}]\n${r.chunk.content}`)
      .join('\n\n---\n\n');
  }

  private buildSources(results: SearchResult[]): Source[] {
    return results.map(r => ({
      chunkId: r.chunk.id,
      documentId: r.document.id,
      documentName: r.document.name,
      content: r.chunk.content,
      score: r.score,
    }));
  }

  private async getRecentHistory(
    conversationId: string,
    maxMessages: number
  ): Promise<Pick<Message, 'role' | 'content'>[]> {
    const messages = await this.storage.getMessagesForConversation(conversationId);
    return messages
      .slice(-maxMessages)
      .map(m => ({ role: m.role, content: m.content }));
  }

  private generateTitle(firstMessage: string): string {
    // Simple title generation: first 50 chars of first message
    const cleaned = firstMessage.replace(/\s+/g, ' ').trim();
    if (cleaned.length <= 50) {
      return cleaned;
    }
    return cleaned.slice(0, 47) + '...';
  }
}

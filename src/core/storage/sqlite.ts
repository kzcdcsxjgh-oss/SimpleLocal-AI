/**
 * SQLite Storage implementatie
 *
 * Alles in één database: documents, chunks, conversations, messages
 * Gebruikt better-sqlite3 voor performance
 */

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';
import type {
  IStorage,
  DocumentInput,
  ChunkInput,
  ConversationInput,
  MessageInput,
} from '../interfaces/storage';
import type {
  Document,
  Chunk,
  Conversation,
  Message,
  Source,
} from '../interfaces/types';

export class SQLiteStorage implements IStorage {
  private db: Database.Database | null = null;
  private readonly dbPath: string;

  constructor(dbPath: string) {
    this.dbPath = dbPath;
  }

  async initialize(): Promise<void> {
    this.db = new Database(this.dbPath);
    this.db.pragma('journal_mode = WAL'); // Better performance
    this.db.pragma('foreign_keys = ON');

    this.createTables();
  }

  private createTables(): void {
    if (!this.db) throw new Error('Database not initialized');

    this.db.exec(`
      -- Documents
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        path TEXT NOT NULL UNIQUE,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        hash TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Chunks
      CREATE TABLE IF NOT EXISTS chunks (
        id TEXT PRIMARY KEY,
        document_id TEXT NOT NULL,
        content TEXT NOT NULL,
        chunk_index INTEGER NOT NULL,
        start_offset INTEGER NOT NULL,
        end_offset INTEGER NOT NULL,
        FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_chunks_document ON chunks(document_id);

      -- Conversations
      CREATE TABLE IF NOT EXISTS conversations (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        document_ids TEXT NOT NULL DEFAULT '[]',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Messages
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        sources TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);

      -- FTS5 virtual table for full-text search
      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
        content,
        chunk_id UNINDEXED,
        document_id UNINDEXED,
        tokenize='porter unicode61'
      );
    `);
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  // === Documents ===

  async createDocument(input: DocumentInput): Promise<Document> {
    if (!this.db) throw new Error('Database not initialized');

    const id = randomUUID();
    const now = new Date().toISOString();

    this.db.prepare(`
      INSERT INTO documents (id, name, path, mime_type, size, hash, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(id, input.name, input.path, input.mimeType, input.size, input.hash, now, now);

    return {
      id,
      name: input.name,
      path: input.path,
      mimeType: input.mimeType,
      size: input.size,
      hash: input.hash,
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async getDocument(id: string): Promise<Document | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM documents WHERE id = ?').get(id) as DocumentRow | undefined;
    return row ? this.rowToDocument(row) : null;
  }

  async getDocumentByPath(path: string): Promise<Document | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM documents WHERE path = ?').get(path) as DocumentRow | undefined;
    return row ? this.rowToDocument(row) : null;
  }

  async listDocuments(): Promise<Document[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all() as DocumentRow[];
    return rows.map(row => this.rowToDocument(row));
  }

  async deleteDocument(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Delete FTS entries first
    this.db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(id);
    // CASCADE will handle chunks
    this.db.prepare('DELETE FROM documents WHERE id = ?').run(id);
  }

  // === Chunks ===

  async createChunks(inputs: ChunkInput[]): Promise<Chunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const chunks: Chunk[] = [];
    const insertChunk = this.db.prepare(`
      INSERT INTO chunks (id, document_id, content, chunk_index, start_offset, end_offset)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertFts = this.db.prepare(`
      INSERT INTO chunks_fts (content, chunk_id, document_id)
      VALUES (?, ?, ?)
    `);

    const transaction = this.db.transaction(() => {
      for (const input of inputs) {
        const id = randomUUID();
        insertChunk.run(id, input.documentId, input.content, input.index, input.startOffset, input.endOffset);
        insertFts.run(input.content, id, input.documentId);
        chunks.push({
          id,
          documentId: input.documentId,
          content: input.content,
          index: input.index,
          startOffset: input.startOffset,
          endOffset: input.endOffset,
        });
      }
    });

    transaction();
    return chunks;
  }

  async getChunksForDocument(documentId: string): Promise<Chunk[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(
      'SELECT * FROM chunks WHERE document_id = ? ORDER BY chunk_index'
    ).all(documentId) as ChunkRow[];

    return rows.map(row => this.rowToChunk(row));
  }

  async getChunk(id: string): Promise<Chunk | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM chunks WHERE id = ?').get(id) as ChunkRow | undefined;
    return row ? this.rowToChunk(row) : null;
  }

  getChunksByIds(ids: string[]): Chunk[] {
    if (!this.db || ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(
      `SELECT * FROM chunks WHERE id IN (${placeholders})`
    ).all(...ids) as ChunkRow[];

    return rows.map(row => this.rowToChunk(row));
  }

  getDocumentsByIds(ids: string[]): Document[] {
    if (!this.db || ids.length === 0) return [];

    const placeholders = ids.map(() => '?').join(', ');
    const rows = this.db.prepare(
      `SELECT * FROM documents WHERE id IN (${placeholders})`
    ).all(...ids) as DocumentRow[];

    return rows.map(row => this.rowToDocument(row));
  }

  async deleteChunksForDocument(documentId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('DELETE FROM chunks_fts WHERE document_id = ?').run(documentId);
    this.db.prepare('DELETE FROM chunks WHERE document_id = ?').run(documentId);
  }

  // === Conversations ===

  async createConversation(input?: ConversationInput): Promise<Conversation> {
    if (!this.db) throw new Error('Database not initialized');

    const id = randomUUID();
    const now = new Date().toISOString();
    const title = input?.title ?? 'Nieuw gesprek';
    const documentIds = JSON.stringify(input?.documentIds ?? []);

    this.db.prepare(`
      INSERT INTO conversations (id, title, document_ids, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `).run(id, title, documentIds, now, now);

    return {
      id,
      title,
      documentIds: input?.documentIds ?? [],
      createdAt: new Date(now),
      updatedAt: new Date(now),
    };
  }

  async getConversation(id: string): Promise<Conversation | null> {
    if (!this.db) throw new Error('Database not initialized');

    const row = this.db.prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConversationRow | undefined;
    return row ? this.rowToConversation(row) : null;
  }

  async listConversations(): Promise<Conversation[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare('SELECT * FROM conversations ORDER BY updated_at DESC').all() as ConversationRow[];
    return rows.map(row => this.rowToConversation(row));
  }

  async updateConversation(id: string, updates: Partial<ConversationInput>): Promise<Conversation> {
    if (!this.db) throw new Error('Database not initialized');

    const now = new Date().toISOString();
    const sets: string[] = ['updated_at = ?'];
    const values: (string | number)[] = [now];

    if (updates.title !== undefined) {
      sets.push('title = ?');
      values.push(updates.title);
    }
    if (updates.documentIds !== undefined) {
      sets.push('document_ids = ?');
      values.push(JSON.stringify(updates.documentIds));
    }

    values.push(id);

    this.db.prepare(`UPDATE conversations SET ${sets.join(', ')} WHERE id = ?`).run(...values);

    const updated = await this.getConversation(id);
    if (!updated) throw new Error('Conversation not found after update');
    return updated;
  }

  async deleteConversation(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // CASCADE will handle messages
    this.db.prepare('DELETE FROM conversations WHERE id = ?').run(id);
  }

  // === Messages ===

  async createMessage(input: MessageInput): Promise<Message> {
    if (!this.db) throw new Error('Database not initialized');

    const id = randomUUID();
    const now = new Date().toISOString();
    const sources = input.sources ? JSON.stringify(input.sources) : null;

    this.db.prepare(`
      INSERT INTO messages (id, conversation_id, role, content, sources, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(id, input.conversationId, input.role, input.content, sources, now);

    // Update conversation's updated_at
    this.db.prepare('UPDATE conversations SET updated_at = ? WHERE id = ?').run(now, input.conversationId);

    return {
      id,
      conversationId: input.conversationId,
      role: input.role,
      content: input.content,
      sources: input.sources,
      createdAt: new Date(now),
    };
  }

  async getMessagesForConversation(conversationId: string): Promise<Message[]> {
    if (!this.db) throw new Error('Database not initialized');

    const rows = this.db.prepare(
      'SELECT * FROM messages WHERE conversation_id = ? ORDER BY created_at'
    ).all(conversationId) as MessageRow[];

    return rows.map(row => this.rowToMessage(row));
  }

  async deleteMessagesForConversation(conversationId: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    this.db.prepare('DELETE FROM messages WHERE conversation_id = ?').run(conversationId);
  }

  // === FTS Search (exposed for Search interface) ===

  searchFTS(query: string, documentIds?: string[], limit = 10): FTSResult[] {
    if (!this.db) throw new Error('Database not initialized');

    let sql = `
      SELECT chunk_id, document_id, snippet(chunks_fts, 0, '<mark>', '</mark>', '...', 32) as snippet,
             bm25(chunks_fts) as score
      FROM chunks_fts
      WHERE chunks_fts MATCH ?
    `;

    const params: (string | number)[] = [query];

    if (documentIds && documentIds.length > 0) {
      const placeholders = documentIds.map(() => '?').join(', ');
      sql += ` AND document_id IN (${placeholders})`;
      params.push(...documentIds);
    }

    sql += ' ORDER BY score LIMIT ?';
    params.push(limit);

    return this.db.prepare(sql).all(...params) as FTSResult[];
  }

  // === Helpers ===

  private rowToDocument(row: DocumentRow): Document {
    return {
      id: row.id,
      name: row.name,
      path: row.path,
      mimeType: row.mime_type,
      size: row.size,
      hash: row.hash,
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToChunk(row: ChunkRow): Chunk {
    return {
      id: row.id,
      documentId: row.document_id,
      content: row.content,
      index: row.chunk_index,
      startOffset: row.start_offset,
      endOffset: row.end_offset,
    };
  }

  private rowToConversation(row: ConversationRow): Conversation {
    return {
      id: row.id,
      title: row.title,
      documentIds: JSON.parse(row.document_ids),
      createdAt: new Date(row.created_at),
      updatedAt: new Date(row.updated_at),
    };
  }

  private rowToMessage(row: MessageRow): Message {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role as 'user' | 'assistant',
      content: row.content,
      sources: row.sources ? JSON.parse(row.sources) : undefined,
      createdAt: new Date(row.created_at),
    };
  }
}

// === Row types ===

interface DocumentRow {
  id: string;
  name: string;
  path: string;
  mime_type: string;
  size: number;
  hash: string;
  created_at: string;
  updated_at: string;
}

interface ChunkRow {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  start_offset: number;
  end_offset: number;
}

interface ConversationRow {
  id: string;
  title: string;
  document_ids: string;
  created_at: string;
  updated_at: string;
}

interface MessageRow {
  id: string;
  conversation_id: string;
  role: string;
  content: string;
  sources: string | null;
  created_at: string;
}

export interface FTSResult {
  chunk_id: string;
  document_id: string;
  snippet: string;
  score: number;
}

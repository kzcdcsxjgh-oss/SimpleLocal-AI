import * as lancedb from '@lancedb/lancedb';
import path from 'path';
import fs from 'fs/promises';
import { v4 as uuidv4 } from 'uuid';
import { sanitizeDocumentId } from '../utils/validation';

export interface VectorDocument {
  id: string;
  documentId: string;
  documentName: string;
  documentPath: string;
  content: string;
  chunkIndex: number;
  vector: number[];
  addedAt: string;
  [key: string]: unknown;
}

export interface IndexedDocument {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  chunkCount: number;
}

export class VectorStore {
  private dataDir: string;
  private db: lancedb.Connection | null = null;
  private table: lancedb.Table | null = null;
  private readonly tableName = 'documents';

  constructor(dataDir: string) {
    this.dataDir = dataDir;
  }

  /**
   * Initialize the vector store
   */
  async initialize(): Promise<void> {
    // Ensure data directory exists
    await fs.mkdir(this.dataDir, { recursive: true });

    const dbPath = path.join(this.dataDir, 'vectordb');
    this.db = await lancedb.connect(dbPath);

    // Try to open existing table or create new one
    try {
      const tables = await this.db.tableNames();
      if (tables.includes(this.tableName)) {
        this.table = await this.db.openTable(this.tableName);
      }
    } catch (error) {
      console.log('No existing table found, will create on first insert');
    }
  }

  /**
   * Add document chunks with their embeddings to the vector store
   */
  async addDocuments(
    documents: Array<{
      content: string;
      documentPath: string;
      documentName: string;
      chunkIndex: number;
      embedding: number[];
    }>
  ): Promise<string> {
    if (!this.db) {
      throw new Error('Vector store not initialized');
    }

    const documentId = uuidv4();
    const addedAt = new Date().toISOString();

    const records: VectorDocument[] = documents.map((doc, index) => ({
      id: `${documentId}-${index}`,
      documentId,
      documentName: doc.documentName,
      documentPath: doc.documentPath,
      content: doc.content,
      chunkIndex: doc.chunkIndex,
      vector: doc.embedding,
      addedAt,
    }));

    if (!this.table) {
      // Create table with first batch of documents
      this.table = await this.db.createTable(this.tableName, records);
    } else {
      // Add to existing table
      await this.table.add(records);
    }

    return documentId;
  }

  /**
   * Search for similar documents using vector similarity
   */
  async search(
    queryEmbedding: number[],
    limit = 5
  ): Promise<Array<{ content: string; documentName: string; score: number }>> {
    if (!this.table) {
      return [];
    }

    try {
      const results = await this.table
        .vectorSearch(queryEmbedding)
        .limit(limit)
        .toArray();

      return results.map((result: any) => ({
        content: result.content,
        documentName: result.documentName,
        score: result._distance || 0,
      }));
    } catch (error) {
      console.error('Search error:', error);
      return [];
    }
  }

  /**
   * Get list of all indexed documents
   */
  async getIndexedDocuments(): Promise<IndexedDocument[]> {
    if (!this.table) {
      return [];
    }

    try {
      const allDocs = await this.table.query().toArray();

      // Group by documentId
      const documentMap = new Map<string, IndexedDocument>();

      for (const doc of allDocs) {
        const existing = documentMap.get(doc.documentId);
        if (existing) {
          existing.chunkCount++;
        } else {
          documentMap.set(doc.documentId, {
            id: doc.documentId,
            name: doc.documentName,
            path: doc.documentPath,
            addedAt: doc.addedAt,
            chunkCount: 1,
          });
        }
      }

      return Array.from(documentMap.values()).sort(
        (a, b) => new Date(b.addedAt).getTime() - new Date(a.addedAt).getTime()
      );
    } catch (error) {
      console.error('Error getting indexed documents:', error);
      return [];
    }
  }

  /**
   * Remove a document and all its chunks from the store
   */
  async removeDocument(documentId: string): Promise<void> {
    if (!this.table) {
      return;
    }

    // Sanitize document ID to prevent injection attacks
    const sanitizedId = sanitizeDocumentId(documentId);
    if (!sanitizedId) {
      console.error('Invalid document ID format:', documentId);
      throw new Error('Invalid document ID format');
    }

    try {
      await this.table.delete(`documentId = '${sanitizedId}'`);
    } catch (error) {
      console.error('Error removing document:', error);
      throw error;
    }
  }

  /**
   * Clear all documents from the store
   */
  async clear(): Promise<void> {
    if (this.db && this.table) {
      await this.db.dropTable(this.tableName);
      this.table = null;
    }
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    // LanceDB handles cleanup automatically
    this.db = null;
    this.table = null;
  }

  /**
   * Get document count
   */
  async getDocumentCount(): Promise<number> {
    if (!this.table) {
      return 0;
    }

    try {
      const docs = await this.getIndexedDocuments();
      return docs.length;
    } catch {
      return 0;
    }
  }
}

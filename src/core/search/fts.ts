/**
 * Full-Text Search implementatie met SQLite FTS5
 *
 * Voordelen boven vector search:
 * - Geen ML model nodig
 * - Instant resultaten
 * - Exacte matches
 * - Highlighting gratis
 */

import type { ISearch } from '../interfaces/search';
import type { SearchResult, SearchOptions } from '../interfaces/types';
import type { SQLiteStorage } from '../storage/sqlite';

export class FTS5Search implements ISearch {
  constructor(private storage: SQLiteStorage) {}

  async indexChunk(chunkId: string, content: string, documentId: string): Promise<void> {
    // FTS indexing happens automatically in SQLiteStorage.createChunks()
    // This method exists for interface compatibility and potential future use
  }

  async removeDocument(documentId: string): Promise<void> {
    // Handled by SQLiteStorage.deleteDocument() with CASCADE
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResult[]> {
    const limit = options?.limit ?? 10;
    const documentIds = options?.documentIds;

    // Escape special FTS5 characters and convert to prefix search
    const sanitizedQuery = this.sanitizeQuery(query);
    if (!sanitizedQuery) {
      return [];
    }

    const ftsResults = this.storage.searchFTS(sanitizedQuery, documentIds, limit);

    const results: SearchResult[] = [];

    for (const ftsResult of ftsResults) {
      const chunk = await this.storage.getChunk(ftsResult.chunk_id);
      const document = await this.storage.getDocument(ftsResult.document_id);

      if (chunk && document) {
        const score = Math.abs(ftsResult.score); // BM25 returns negative scores

        if (options?.minScore && score < options.minScore) {
          continue;
        }

        results.push({
          chunk,
          document,
          score,
          highlights: [ftsResult.snippet],
        });
      }
    }

    return results;
  }

  async rebuildIndex(): Promise<void> {
    // FTS5 index is automatically maintained
    // This could be used for VACUUM or optimization in the future
  }

  /**
   * Sanitize query for FTS5
   * - Escapes special characters
   * - Adds prefix matching for better UX
   */
  private sanitizeQuery(query: string): string {
    // Remove FTS5 special characters that could cause syntax errors
    let sanitized = query
      .replace(/[""'']/g, '"') // Normalize quotes
      .replace(/[^\w\s"*-]/g, ' ') // Keep only words, spaces, quotes, wildcards, hyphens
      .trim();

    if (!sanitized) {
      return '';
    }

    // Split into terms and add prefix matching
    const terms = sanitized.split(/\s+/).filter(t => t.length > 0);

    // For single-word queries, use prefix match
    // For multi-word, use AND logic
    if (terms.length === 1) {
      return `${terms[0]}*`;
    }

    // Join with implicit AND (space in FTS5 is AND)
    return terms.join(' ');
  }
}

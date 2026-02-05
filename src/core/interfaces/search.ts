/**
 * Search interface
 *
 * Verantwoordelijk voor het doorzoeken van document chunks.
 * Implementaties: FTS5 (full-text), Vector (semantic), Hybrid
 */

import type { SearchResult, SearchOptions } from './types';

export interface ISearch {
  /**
   * Indexeer een chunk voor zoeken
   */
  indexChunk(chunkId: string, content: string, documentId: string): Promise<void>;

  /**
   * Verwijder alle indexed data voor een document
   */
  removeDocument(documentId: string): Promise<void>;

  /**
   * Zoek naar relevante chunks
   */
  search(query: string, options?: SearchOptions): Promise<SearchResult[]>;

  /**
   * Herbouw de index (na corruptie of upgrade)
   */
  rebuildIndex(): Promise<void>;
}

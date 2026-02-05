/**
 * Document Processor
 *
 * Extraheert tekst uit documenten en splitst in chunks.
 * Verbeterde chunking: respecteert paragraaf- en zingrenzen.
 */

import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';
import type { ChunkInput } from './interfaces/storage';

export interface ProcessedDocument {
  name: string;
  path: string;
  mimeType: string;
  size: number;
  hash: string;
  chunks: ChunkInput[];
}

export interface ProcessorOptions {
  chunkSize?: number; // Target chunk size in characters
  chunkOverlap?: number; // Overlap between chunks
}

const DEFAULT_OPTIONS: Required<ProcessorOptions> = {
  chunkSize: 1000, // Larger chunks = better context
  chunkOverlap: 100,
};

const MIME_TYPES: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
};

export class DocumentProcessor {
  private options: Required<ProcessorOptions>;

  constructor(options?: ProcessorOptions) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async process(filePath: string): Promise<ProcessedDocument> {
    const stats = await fs.stat(filePath);
    const extension = path.extname(filePath).toLowerCase();
    const mimeType = MIME_TYPES[extension];

    if (!mimeType) {
      throw new Error(`Niet ondersteund bestandstype: ${extension}`);
    }

    // Read file and compute hash
    const buffer = await fs.readFile(filePath);
    const hash = crypto.createHash('sha256').update(buffer).digest('hex');

    // Extract text
    const text = await this.extractText(filePath, extension, buffer);

    // Create chunks
    const chunks = this.createChunks(text);

    return {
      name: path.basename(filePath),
      path: filePath,
      mimeType,
      size: stats.size,
      hash,
      chunks,
    };
  }

  private async extractText(filePath: string, extension: string, buffer: Buffer): Promise<string> {
    switch (extension) {
      case '.pdf':
        return this.extractPdf(buffer);
      case '.docx':
        return this.extractDocx(buffer);
      case '.txt':
      case '.md':
        return buffer.toString('utf-8');
      default:
        throw new Error(`Niet ondersteund: ${extension}`);
    }
  }

  private async extractPdf(buffer: Buffer): Promise<string> {
    const data = await pdf(buffer);
    return this.normalizeText(data.text);
  }

  private async extractDocx(buffer: Buffer): Promise<string> {
    const result = await mammoth.extractRawText({ buffer });
    return this.normalizeText(result.value);
  }

  private normalizeText(text: string): string {
    return text
      .replace(/\r\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/ {2,}/g, ' ')
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  /**
   * Improved chunking that respects semantic boundaries
   */
  private createChunks(text: string): ChunkInput[] {
    const chunks: ChunkInput[] = [];
    const paragraphs = text.split(/\n\n+/);

    let currentChunk = '';
    let currentStart = 0;
    let chunkIndex = 0;
    let position = 0;

    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      const paragraphWithSeparator = i > 0 ? '\n\n' + paragraph : paragraph;

      // If adding this paragraph exceeds target size, finalize current chunk
      if (currentChunk.length + paragraphWithSeparator.length > this.options.chunkSize && currentChunk.length > 0) {
        chunks.push({
          documentId: '', // Will be set by storage
          content: currentChunk.trim(),
          index: chunkIndex,
          startOffset: currentStart,
          endOffset: currentStart + currentChunk.length,
        });

        // Start new chunk with overlap
        const overlapText = this.getOverlapText(currentChunk);
        currentStart = position - overlapText.length;
        currentChunk = overlapText + paragraphWithSeparator;
        chunkIndex++;
      } else {
        currentChunk += paragraphWithSeparator;
      }

      position += paragraphWithSeparator.length;
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        documentId: '',
        content: currentChunk.trim(),
        index: chunkIndex,
        startOffset: currentStart,
        endOffset: currentStart + currentChunk.length,
      });
    }

    return chunks;
  }

  /**
   * Get overlap text from the end of a chunk
   * Tries to break at sentence boundaries
   */
  private getOverlapText(text: string): string {
    if (text.length <= this.options.chunkOverlap) {
      return text;
    }

    const overlapRegion = text.slice(-this.options.chunkOverlap * 2);

    // Try to find a sentence boundary
    const sentenceEnd = overlapRegion.search(/[.!?]\s+[A-Z]/);
    if (sentenceEnd !== -1) {
      return overlapRegion.slice(sentenceEnd + 2);
    }

    // Fall back to word boundary
    const lastSpace = overlapRegion.lastIndexOf(' ', this.options.chunkOverlap);
    if (lastSpace !== -1) {
      return overlapRegion.slice(lastSpace + 1);
    }

    return overlapRegion.slice(-this.options.chunkOverlap);
  }

  getSupportedExtensions(): string[] {
    return Object.keys(MIME_TYPES);
  }
}

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import mammoth from 'mammoth';

export interface DocumentChunk {
  id: string;
  content: string;
  metadata: {
    documentPath: string;
    documentName: string;
    chunkIndex: number;
    pageNumber?: number;
  };
}

export class DocumentProcessor {
  private readonly chunkSize: number;
  private readonly chunkOverlap: number;

  constructor(chunkSize = 500, chunkOverlap = 50) {
    this.chunkSize = chunkSize;
    this.chunkOverlap = chunkOverlap;
  }

  /**
   * Process a document and return chunks for indexing
   */
  async processDocument(filePath: string): Promise<DocumentChunk[]> {
    const extension = path.extname(filePath).toLowerCase();
    const documentName = path.basename(filePath);

    let text: string;

    switch (extension) {
      case '.pdf':
        text = await this.extractPdfText(filePath);
        break;
      case '.docx':
        text = await this.extractDocxText(filePath);
        break;
      case '.txt':
      case '.md':
        text = await this.extractPlainText(filePath);
        break;
      default:
        throw new Error(`Unsupported file type: ${extension}`);
    }

    // Clean and normalize the text
    text = this.normalizeText(text);

    // Split into chunks
    const chunks = this.splitIntoChunks(text, filePath, documentName);

    return chunks;
  }

  /**
   * Extract text from PDF files
   */
  private async extractPdfText(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const data = await pdf(dataBuffer);
    return data.text;
  }

  /**
   * Extract text from DOCX files
   */
  private async extractDocxText(filePath: string): Promise<string> {
    const dataBuffer = await fs.readFile(filePath);
    const result = await mammoth.extractRawText({ buffer: dataBuffer });
    return result.value;
  }

  /**
   * Extract text from plain text files
   */
  private async extractPlainText(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8');
  }

  /**
   * Normalize text by removing extra whitespace and special characters
   */
  private normalizeText(text: string): string {
    return text
      // Replace multiple newlines with double newline (paragraph break)
      .replace(/\n{3,}/g, '\n\n')
      // Replace multiple spaces with single space
      .replace(/ {2,}/g, ' ')
      // Remove form feed and other control characters
      .replace(/[\f\r\v]/g, '')
      // Trim each line
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      // Trim the entire text
      .trim();
  }

  /**
   * Split text into overlapping chunks for better context preservation
   */
  private splitIntoChunks(
    text: string,
    documentPath: string,
    documentName: string
  ): DocumentChunk[] {
    const chunks: DocumentChunk[] = [];

    // Split by paragraphs first to preserve context
    const paragraphs = text.split(/\n\n+/);
    let currentChunk = '';
    let chunkIndex = 0;

    for (const paragraph of paragraphs) {
      // If adding this paragraph would exceed chunk size, save current chunk
      if (currentChunk.length + paragraph.length > this.chunkSize && currentChunk.length > 0) {
        chunks.push({
          id: `${documentPath}-${chunkIndex}`,
          content: currentChunk.trim(),
          metadata: {
            documentPath,
            documentName,
            chunkIndex,
          },
        });

        // Start new chunk with overlap from previous chunk
        const words = currentChunk.split(' ');
        const overlapWords = words.slice(-Math.floor(this.chunkOverlap / 5));
        currentChunk = overlapWords.join(' ') + ' ' + paragraph;
        chunkIndex++;
      } else {
        // Add paragraph to current chunk
        currentChunk = currentChunk ? currentChunk + '\n\n' + paragraph : paragraph;
      }
    }

    // Don't forget the last chunk
    if (currentChunk.trim().length > 0) {
      chunks.push({
        id: `${documentPath}-${chunkIndex}`,
        content: currentChunk.trim(),
        metadata: {
          documentPath,
          documentName,
          chunkIndex,
        },
      });
    }

    return chunks;
  }

  /**
   * Get supported file extensions
   */
  getSupportedExtensions(): string[] {
    return ['.pdf', '.docx', '.txt', '.md'];
  }
}

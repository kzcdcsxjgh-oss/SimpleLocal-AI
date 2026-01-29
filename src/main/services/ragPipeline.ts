import { VectorStore } from './vectorStore';
import { OllamaService } from './ollamaService';
import { DocumentChunk } from './documentProcessor';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export class RAGPipeline {
  private vectorStore: VectorStore;
  private ollamaService: OllamaService;
  private chatHistory: ChatMessage[] = [];
  private readonly maxHistoryLength = 10;

  constructor(vectorStore: VectorStore, ollamaService: OllamaService) {
    this.vectorStore = vectorStore;
    this.ollamaService = ollamaService;
  }

  /**
   * Index a document by generating embeddings for all chunks
   */
  async indexDocument(documentPath: string, chunks: DocumentChunk[]): Promise<void> {
    const documentsWithEmbeddings = [];

    for (const chunk of chunks) {
      // Generate embedding for this chunk
      const embedding = await this.ollamaService.generateEmbedding(chunk.content);

      documentsWithEmbeddings.push({
        content: chunk.content,
        documentPath: chunk.metadata.documentPath,
        documentName: chunk.metadata.documentName,
        chunkIndex: chunk.metadata.chunkIndex,
        embedding,
      });
    }

    // Store in vector database
    await this.vectorStore.addDocuments(documentsWithEmbeddings);
  }

  /**
   * Chat with documents using RAG
   * Returns an async generator for streaming responses
   */
  async *chat(userMessage: string): AsyncGenerator<string> {
    // Add user message to history
    this.chatHistory.push({ role: 'user', content: userMessage });

    // Generate embedding for the query
    const queryEmbedding = await this.ollamaService.generateEmbedding(userMessage);

    // Search for relevant document chunks
    const relevantChunks = await this.vectorStore.search(queryEmbedding, 5);

    // Build context from relevant chunks
    const context = this.buildContext(relevantChunks);

    // Build the prompt with RAG context
    const systemPrompt = this.buildSystemPrompt(context);
    const conversationPrompt = this.buildConversationPrompt();

    // Generate response using Ollama (streaming)
    let fullResponse = '';

    try {
      for await (const chunk of this.ollamaService.generateStream({
        prompt: conversationPrompt,
        system: systemPrompt,
      })) {
        fullResponse += chunk;
        yield chunk;
      }
    } catch (error) {
      // If streaming fails, try non-streaming
      fullResponse = await this.ollamaService.generate({
        prompt: conversationPrompt,
        system: systemPrompt,
      });
      yield fullResponse;
    }

    // Add assistant response to history
    this.chatHistory.push({ role: 'assistant', content: fullResponse });

    // Trim history if too long
    if (this.chatHistory.length > this.maxHistoryLength * 2) {
      this.chatHistory = this.chatHistory.slice(-this.maxHistoryLength * 2);
    }
  }

  /**
   * Build context string from relevant document chunks
   */
  private buildContext(
    chunks: Array<{ content: string; documentName: string; score: number }>
  ): string {
    if (chunks.length === 0) {
      return '';
    }

    const contextParts = chunks.map((chunk, index) => {
      return `[Source ${index + 1}: ${chunk.documentName}]\n${chunk.content}`;
    });

    return contextParts.join('\n\n---\n\n');
  }

  /**
   * Build the system prompt with RAG context
   */
  private buildSystemPrompt(context: string): string {
    const basePrompt = `You are a helpful, friendly assistant that helps people understand their documents.
You speak in simple, clear language that anyone can understand - avoid technical jargon.
Be warm and patient, like a helpful neighbor explaining something.
If you don't know the answer, say so honestly.`;

    if (context) {
      return `${basePrompt}

Here is relevant information from the user's documents that you should use to answer their questions:

${context}

When answering:
- Base your answers on the document information provided above
- If the documents don't contain relevant information, let the user know
- Quote specific parts of the documents when helpful
- Be conversational and easy to understand`;
    }

    return `${basePrompt}

The user hasn't added any documents yet, or their question isn't related to any documents.
You can still help them with general questions and guide them on how to use this app.
To add documents, they can click the "Add Document" button.`;
  }

  /**
   * Build the conversation prompt from chat history
   */
  private buildConversationPrompt(): string {
    // Include recent conversation history for context
    const recentHistory = this.chatHistory.slice(-6); // Last 3 exchanges

    const historyText = recentHistory
      .map((msg) => `${msg.role === 'user' ? 'User' : 'Assistant'}: ${msg.content}`)
      .join('\n\n');

    return historyText;
  }

  /**
   * Clear chat history
   */
  clearHistory(): void {
    this.chatHistory = [];
  }

  /**
   * Get chat history
   */
  getHistory(): ChatMessage[] {
    return [...this.chatHistory];
  }
}

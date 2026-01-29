import { app } from 'electron';
import path from 'path';

// Dynamic import for ES modules compatibility
let pipeline: any;
let env: any;

export interface ModelStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
  modelName?: string;
}

export class LocalAIService {
  private embeddingPipeline: any = null;
  private generationPipeline: any = null;
  private modelStatus: ModelStatus = {
    ready: false,
    loading: false,
    progress: 0,
  };
  private progressCallback?: (status: ModelStatus) => void;
  private modelsDir: string;

  // Use small, efficient models that work well on consumer hardware
  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly GENERATION_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';

  constructor() {
    this.modelsDir = path.join(app.getPath('userData'), 'models');
  }

  /**
   * Set callback for progress updates during model loading
   */
  onProgress(callback: (status: ModelStatus) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Initialize the AI service - downloads models if needed
   */
  async initialize(): Promise<void> {
    if (this.modelStatus.ready || this.modelStatus.loading) {
      return;
    }

    this.modelStatus.loading = true;
    this.updateProgress(0, 'Starting AI setup...');

    try {
      // Dynamic import of transformers
      const transformers = await import('@xenova/transformers');
      pipeline = transformers.pipeline;
      env = transformers.env;

      // Configure model cache directory
      env.cacheDir = this.modelsDir;
      env.allowLocalModels = true;
      env.allowRemoteModels = true;

      // Load embedding model first (smaller, faster)
      this.updateProgress(10, 'Downloading language understanding...');
      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        this.EMBEDDING_MODEL,
        {
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              const pct = 10 + (progress.progress || 0) * 0.4;
              this.updateProgress(pct, 'Downloading language understanding...');
            }
          },
        }
      );

      // Load text generation model
      this.updateProgress(50, 'Downloading conversation ability...');
      this.generationPipeline = await pipeline(
        'text-generation',
        this.GENERATION_MODEL,
        {
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading') {
              const pct = 50 + (progress.progress || 0) * 0.45;
              this.updateProgress(pct, 'Downloading conversation ability...');
            }
          },
        }
      );

      this.updateProgress(100, 'Ready!');
      this.modelStatus = {
        ready: true,
        loading: false,
        progress: 100,
        modelName: this.GENERATION_MODEL,
      };

      if (this.progressCallback) {
        this.progressCallback(this.modelStatus);
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.modelStatus = {
        ready: false,
        loading: false,
        progress: 0,
        error: `Failed to load AI: ${errorMessage}`,
      };

      if (this.progressCallback) {
        this.progressCallback(this.modelStatus);
      }

      throw error;
    }
  }

  /**
   * Check if the AI service is ready
   */
  getStatus(): ModelStatus {
    return { ...this.modelStatus };
  }

  /**
   * Generate embeddings for text
   */
  async generateEmbedding(text: string): Promise<number[]> {
    if (!this.embeddingPipeline) {
      throw new Error('AI not initialized. Please wait for setup to complete.');
    }

    const result = await this.embeddingPipeline(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert to regular array
    return Array.from(result.data);
  }

  /**
   * Generate a response to a message with context
   */
  async generate(
    userMessage: string,
    context: string,
    _onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!this.generationPipeline) {
      throw new Error('AI not initialized. Please wait for setup to complete.');
    }

    // Build a simple prompt with context
    const systemPrompt = context
      ? `You are a helpful assistant that answers questions based on the provided documents. Be friendly, clear, and concise. If the documents don't contain relevant information, say so honestly.

Here is information from the user's documents:
${context}

Answer the user's question based on this information.`
      : `You are a helpful assistant. Be friendly, clear, and concise. The user hasn't added any documents yet, so just have a helpful conversation.`;

    const prompt = `<|im_start|>system
${systemPrompt}<|im_end|>
<|im_start|>user
${userMessage}<|im_end|>
<|im_start|>assistant
`;

    try {
      const result = await this.generationPipeline(prompt, {
        max_new_tokens: 512,
        temperature: 0.7,
        do_sample: true,
        top_p: 0.9,
        repetition_penalty: 1.1,
      });

      // Extract the generated text
      let response = result[0]?.generated_text || '';

      // Remove the prompt from the response
      if (response.includes('<|im_start|>assistant')) {
        response = response.split('<|im_start|>assistant').pop() || '';
      }

      // Clean up any remaining tokens
      response = response
        .replace(/<\|im_end\|>/g, '')
        .replace(/<\|im_start\|>/g, '')
        .trim();

      return response || "I'm sorry, I couldn't generate a response. Please try again.";
    } catch (error) {
      console.error('Generation error:', error);
      return "I'm having trouble thinking right now. Please try again in a moment.";
    }
  }

  /**
   * Update progress and notify callback
   */
  private updateProgress(progress: number, message?: string): void {
    this.modelStatus.progress = progress;
    if (this.progressCallback) {
      this.progressCallback({
        ...this.modelStatus,
        progress,
      });
    }
    if (message) {
      console.log(`[LocalAI] ${message} (${progress.toFixed(0)}%)`);
    }
  }
}

import { app } from 'electron';
import path from 'path';
import fs from 'fs';
import https from 'https';
import http from 'http';
import { URL } from 'url';

// Dynamic import helper that won't be converted to require by TypeScript
async function dynamicImport(moduleName: string): Promise<any> {
  return new Function('moduleName', 'return import(moduleName)')(moduleName);
}

export interface ModelStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
  modelName?: string;
}

export class LocalAIService {
  private embeddingPipeline: any = null;
  private llama: any = null;
  private model: any = null;
  private context: any = null;
  private modelStatus: ModelStatus = {
    ready: false,
    loading: false,
    progress: 0,
  };
  private progressCallback?: (status: ModelStatus) => void;
  private modelsDir: string;
  private localModelsDir: string;
  private bundledModelsDir: string;
  private hasBundledModels: boolean = false;

  // Embedding model - keep using transformers.js (small and efficient)
  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';

  // Generation model - Phi-3.5-mini via node-llama-cpp (best quality/size ratio)
  // Q4_K_M quantization: ~2.3GB, runs great on 8GB RAM laptops
  private readonly GENERATION_MODEL = 'Phi-3.5-mini-instruct-Q4_K_M.gguf';
  private readonly GENERATION_MODEL_DISPLAY = 'Phi-3.5-mini-instruct';
  private readonly GENERATION_MODEL_URL = 'https://huggingface.co/bartowski/Phi-3.5-mini-instruct-GGUF/resolve/main/Phi-3.5-mini-instruct-Q4_K_M.gguf';

  constructor() {
    // User data directory for downloaded/cached models
    this.modelsDir = path.join(app.getPath('userData'), 'models');

    // Local models directory where we copy bundled models
    this.localModelsDir = path.join(app.getPath('userData'), 'local-models');

    // Bundled models directory (included with installer)
    const isPackaged = app.isPackaged;
    if (isPackaged) {
      this.bundledModelsDir = path.join(process.resourcesPath, 'models');
    } else {
      this.bundledModelsDir = path.join(__dirname, '..', '..', '..', 'models');
    }

    // Check if bundled models exist
    this.hasBundledModels = this.checkBundledModels();
    if (this.hasBundledModels) {
      console.log('[LocalAI] Bundled models found at:', this.bundledModelsDir);
    } else {
      console.log('[LocalAI] No bundled models, will download from internet');
    }
  }

  /**
   * Check if bundled models are available
   */
  private checkBundledModels(): boolean {
    try {
      const embeddingModelDir = path.join(
        this.bundledModelsDir,
        this.EMBEDDING_MODEL.replace('/', '--')
      );
      const generationModelPath = path.join(this.bundledModelsDir, this.GENERATION_MODEL);

      // Check if embedding model directory has config.json and GGUF model exists
      const embeddingExists = fs.existsSync(path.join(embeddingModelDir, 'config.json'));
      const generationExists = fs.existsSync(generationModelPath);

      return embeddingExists && generationExists;
    } catch {
      return false;
    }
  }

  /**
   * Check if models are already copied to local directory
   */
  private checkLocalModels(): {
    embedding: boolean;
    generation: boolean;
  } {
    try {
      const embeddingModelDir = path.join(this.localModelsDir, this.EMBEDDING_MODEL);
      const generationModelPath = path.join(this.localModelsDir, this.GENERATION_MODEL);

      const embeddingExists = fs.existsSync(path.join(embeddingModelDir, 'config.json'));
      const generationExists = fs.existsSync(generationModelPath);

      return { embedding: embeddingExists, generation: generationExists };
    } catch {
      return { embedding: false, generation: false };
    }
  }

  /**
   * Copy a directory recursively
   */
  private copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src, { withFileTypes: true });

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name);
      const destPath = path.join(dest, entry.name);

      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath);
      } else {
        fs.copyFileSync(srcPath, destPath);
      }
    }
  }

  /**
   * Copy bundled models to local directory
   */
  private copyBundledModelsToLocal(): void {
    console.log('[LocalAI] Copying bundled models to local directory...');

    // Copy embedding model (directory structure)
    const embeddingBundledDir = path.join(
      this.bundledModelsDir,
      this.EMBEDDING_MODEL.replace('/', '--')
    );
    const embeddingLocalDir = path.join(this.localModelsDir, this.EMBEDDING_MODEL);

    if (fs.existsSync(embeddingBundledDir)) {
      console.log(`[LocalAI] Copying ${this.EMBEDDING_MODEL}...`);
      const parentDir = path.dirname(embeddingLocalDir);
      fs.mkdirSync(parentDir, { recursive: true });
      this.copyDirSync(embeddingBundledDir, embeddingLocalDir);
    }

    // Copy generation model (single GGUF file)
    const generationBundledPath = path.join(this.bundledModelsDir, this.GENERATION_MODEL);
    const generationLocalPath = path.join(this.localModelsDir, this.GENERATION_MODEL);

    if (fs.existsSync(generationBundledPath)) {
      console.log(`[LocalAI] Copying ${this.GENERATION_MODEL}...`);
      fs.mkdirSync(this.localModelsDir, { recursive: true });
      fs.copyFileSync(generationBundledPath, generationLocalPath);
    }

    console.log('[LocalAI] Bundled models copied successfully');
  }

  /**
   * Check if an error is a retryable network error
   */
  private isRetryableError(error: Error): boolean {
    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ENOTFOUND',
      'ETIMEDOUT',
      'ENETUNREACH',
      'EHOSTUNREACH',
      'EPIPE',
      'EAI_AGAIN',
      'ECONNABORTED',
      'ESOCKETTIMEDOUT',
    ];
    const errorCode = (error as NodeJS.ErrnoException).code;
    return retryableCodes.includes(errorCode || '') ||
           error.message.includes('socket hang up') ||
           error.message.includes('network');
  }

  /**
   * Sleep for a given number of milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Download the generation model from HuggingFace at first run.
   * Handles HTTP redirects (HuggingFace uses 302 → CDN).
   * Includes retry logic with exponential backoff for network errors.
   */
  private async downloadGenerationModel(): Promise<void> {
    const destPath = path.join(this.localModelsDir, this.GENERATION_MODEL);
    fs.mkdirSync(this.localModelsDir, { recursive: true });

    console.log('[LocalAI] Downloading generation model (~2.3 GB)...');
    this.updateProgress(20, 'Downloading AI model (~2.3 GB)...');

    const maxRetries = 4;
    const baseDelay = 2000; // 2 seconds
    const socketTimeout = 30000; // 30 seconds timeout for socket inactivity

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        await new Promise<void>((resolve, reject) => {
          const doRequest = (url: string, redirectsLeft: number): void => {
            if (redirectsLeft <= 0) {
              reject(new Error('Too many redirects downloading generation model'));
              return;
            }

            const parsed = new URL(url);
            const transport = parsed.protocol === 'https:' ? https : http;

            const req = transport.get(
              url,
              {
                headers: { 'User-Agent': 'SimpleLocal-AI/1.0' },
                timeout: socketTimeout,
              },
              (res) => {
                if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                  const location = res.headers.location;
                  const redirectUrl = location.startsWith('http') ? location : new URL(location, url).href;
                  res.resume(); // consume response to free socket
                  doRequest(redirectUrl, redirectsLeft - 1);
                  return;
                }

                if (res.statusCode !== 200) {
                  reject(new Error(`HTTP ${res.statusCode} downloading generation model`));
                  return;
                }

                const totalSize = parseInt(res.headers['content-length'] || '0', 10);
                let downloaded = 0;
                const file = fs.createWriteStream(destPath);

                // Set timeout for data reception
                res.setTimeout(socketTimeout, () => {
                  res.destroy();
                  file.close();
                  fs.unlink(destPath, () => {});
                  reject(new Error('Download stalled - no data received'));
                });

                res.on('data', (chunk: Buffer) => {
                  downloaded += chunk.length;
                  if (totalSize) {
                    const pct = 20 + (downloaded / totalSize) * 35; // 20 % → 55 %
                    const percent = ((downloaded / totalSize) * 100).toFixed(1);
                    this.updateProgress(pct, `Downloading AI model... ${percent}%`);
                  }
                });

                res.pipe(file);
                file.on('finish', () => { file.close(); resolve(); });
                file.on('error', (err) => { fs.unlink(destPath, () => {}); reject(err); });
              }
            );

            req.on('timeout', () => {
              req.destroy();
              reject(new Error('Connection timeout'));
            });

            req.on('error', (err) => {
              fs.unlink(destPath, () => {});
              reject(err);
            });
          };

          doRequest(this.GENERATION_MODEL_URL, 10);
        });

        // If we reach here, download succeeded
        console.log('[LocalAI] Generation model downloaded successfully');
        return;

      } catch (error) {
        const err = error instanceof Error ? error : new Error('Unknown error');
        const isRetryable = this.isRetryableError(err);

        console.error(`[LocalAI] Download attempt ${attempt}/${maxRetries} failed:`, err.message);

        // Clean up partial download
        try {
          if (fs.existsSync(destPath)) {
            fs.unlinkSync(destPath);
          }
        } catch { /* ignore cleanup errors */ }

        if (attempt < maxRetries && isRetryable) {
          const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff: 2s, 4s, 8s, 16s
          console.log(`[LocalAI] Retrying in ${delay / 1000}s...`);
          this.updateProgress(20, `Connection error, retrying in ${delay / 1000}s... (attempt ${attempt + 1}/${maxRetries})`);
          await this.sleep(delay);
        } else {
          // Not retryable or max retries exceeded
          throw new Error(`Download failed after ${attempt} attempt(s): ${err.message}`);
        }
      }
    }
  }

  /**
   * Set callback for progress updates during model loading
   */
  onProgress(callback: (status: ModelStatus) => void): void {
    this.progressCallback = callback;
  }

  /**
   * Get the path to the GGUF model file
   */
  private getGenerationModelPath(): string | null {
    const localPath = path.join(this.localModelsDir, this.GENERATION_MODEL);
    if (fs.existsSync(localPath)) {
      return localPath;
    }

    const bundledPath = path.join(this.bundledModelsDir, this.GENERATION_MODEL);
    if (fs.existsSync(bundledPath)) {
      return bundledPath;
    }

    return null;
  }

  /**
   * Initialize the AI service
   */
  async initialize(): Promise<void> {
    if (this.modelStatus.ready || this.modelStatus.loading) {
      return;
    }

    this.modelStatus.loading = true;
    this.updateProgress(0, 'Starting AI setup...');

    try {
      // Copy bundled models if needed
      if (this.hasBundledModels) {
        const localModels = this.checkLocalModels();
        if (!localModels.embedding || !localModels.generation) {
          this.updateProgress(5, 'Preparing AI models...');
          this.copyBundledModelsToLocal();
        }
      }

      // Load embedding model using transformers.js
      this.updateProgress(5, 'Loading language understanding...');
      await this.loadEmbeddingModel();

      // Download generation model on first run if not bundled / already cached
      if (!this.hasBundledModels) {
        const localModels = this.checkLocalModels();
        if (!localModels.generation) {
          await this.downloadGenerationModel();
        }
      }

      // Load generation model using node-llama-cpp
      this.updateProgress(55, 'Loading conversation model...');
      await this.loadGenerationModel();

      this.updateProgress(100, 'Ready!');
      this.modelStatus = {
        ready: true,
        loading: false,
        progress: 100,
        modelName: this.GENERATION_MODEL_DISPLAY,
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
   * Load embedding model using transformers.js
   */
  private async loadEmbeddingModel(): Promise<void> {
    const transformers = await dynamicImport('@xenova/transformers');
    const pipeline = transformers.pipeline;
    const env = transformers.env;

    const localModels = this.checkLocalModels();
    const useLocalEmbedding = localModels.embedding;

    env.allowLocalModels = true;
    env.cacheDir = this.modelsDir;

    if (useLocalEmbedding) {
      env.localModelPath = this.localModelsDir;
      env.allowRemoteModels = false;
      console.log('[LocalAI] Loading local embedding model');
    } else {
      env.allowRemoteModels = true;
      console.log('[LocalAI] Will download embedding model');
    }

    console.log('[LocalAI] Loading embedding model:', this.EMBEDDING_MODEL);

    this.embeddingPipeline = await pipeline('feature-extraction', this.EMBEDDING_MODEL, {
      local_files_only: useLocalEmbedding,
      progress_callback: (progress: any) => {
        if (progress.status === 'downloading' || progress.status === 'loading') {
          const pct = 5 + (progress.progress || 0) * 0.15;
          this.updateProgress(pct, 'Loading language understanding...');
        }
      },
    });

    console.log('[LocalAI] Embedding model loaded');
  }

  /**
   * Load generation model using node-llama-cpp
   */
  private async loadGenerationModel(): Promise<void> {
    const modelPath = this.getGenerationModelPath();

    if (!modelPath) {
      throw new Error(
        `Generation model not found. Please download ${this.GENERATION_MODEL} and place it in the models directory.`
      );
    }

    console.log('[LocalAI] Loading generation model from:', modelPath);

    // Import node-llama-cpp
    const { getLlama } = await dynamicImport('node-llama-cpp');

    // Initialize llama
    this.llama = await getLlama();
    console.log('[LocalAI] Llama initialized');

    this.updateProgress(55, 'Loading conversation model...');

    // Load the model
    this.model = await this.llama.loadModel({
      modelPath,
      onLoadProgress: (progress: number) => {
        const pct = 55 + progress * 40;
        this.updateProgress(pct, 'Loading conversation model...');
      },
    });

    console.log('[LocalAI] Model loaded');

    // Create a context for generation
    this.context = await this.model.createContext({
      contextSize: 4096, // Good balance for document Q&A
    });

    console.log('[LocalAI] Generation model ready');
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

    return Array.from(result.data);
  }

  /**
   * Generate a response to a message with context
   * Supports streaming via onChunk callback for real-time token output
   */
  async generate(
    userMessage: string,
    context: string,
    onChunk?: (chunk: string) => void
  ): Promise<string> {
    if (!this.model || !this.context) {
      throw new Error('AI not initialized. Please wait for setup to complete.');
    }

    // Build the system prompt
    const systemPrompt = context
      ? `You are a helpful assistant that answers questions based on the provided documents. Be friendly, clear, and concise. If the documents don't contain relevant information, say so honestly.

Here is information from the user's documents:
${context}

Answer the user's question based on this information.`
      : `You are a helpful assistant. Be friendly, clear, and concise. The user hasn't added any documents yet, so just have a helpful conversation.`;

    try {
      // Import ChatSession
      const { LlamaChatSession } = await dynamicImport('node-llama-cpp');

      // Create a chat session
      const session = new LlamaChatSession({
        contextSequence: this.context.getSequence(),
        systemPrompt,
      });

      let response = '';

      // Generate response with streaming
      if (onChunk) {
        // Stream tokens
        response = await session.prompt(userMessage, {
          maxTokens: 512,
          temperature: 0.7,
          topP: 0.9,
          onTextChunk: (chunk: string) => {
            onChunk(chunk);
          },
        });
      } else {
        // Non-streaming
        response = await session.prompt(userMessage, {
          maxTokens: 512,
          temperature: 0.7,
          topP: 0.9,
        });
      }

      // Note: LlamaChatSession doesn't have dispose(), memory is managed by the context
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

import { app } from 'electron';
import path from 'path';
import fs from 'fs';

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
  private generationPipeline: any = null;
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

  // Use small, efficient models that work well on consumer hardware
  private readonly EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
  private readonly GENERATION_MODEL = 'Xenova/Qwen1.5-0.5B-Chat';

  constructor() {
    // User data directory for downloaded/cached models
    this.modelsDir = path.join(app.getPath('userData'), 'models');

    // Local models directory where we copy bundled models
    // Structure: {localModelsDir}/Xenova/all-MiniLM-L6-v2/
    this.localModelsDir = path.join(app.getPath('userData'), 'local-models');

    // Bundled models directory (included with installer)
    // In production: resources/models, in dev: project/models
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
      const generationModelDir = path.join(
        this.bundledModelsDir,
        this.GENERATION_MODEL.replace('/', '--')
      );

      // Check if model directories exist and have config.json
      const embeddingExists = fs.existsSync(path.join(embeddingModelDir, 'config.json'));
      const generationExists = fs.existsSync(path.join(generationModelDir, 'config.json'));

      return embeddingExists && generationExists;
    } catch {
      return false;
    }
  }

  /**
   * Check if models are already copied to local directory
   */
  private checkLocalModels(): boolean {
    try {
      // Check for the correct directory structure: {localModelsDir}/Xenova/all-MiniLM-L6-v2/
      const embeddingModelDir = path.join(this.localModelsDir, this.EMBEDDING_MODEL);
      const generationModelDir = path.join(this.localModelsDir, this.GENERATION_MODEL);

      const embeddingExists = fs.existsSync(path.join(embeddingModelDir, 'config.json'));
      const generationExists = fs.existsSync(path.join(generationModelDir, 'config.json'));

      return embeddingExists && generationExists;
    } catch {
      return false;
    }
  }

  /**
   * Copy a directory recursively
   */
  private copyDirSync(src: string, dest: string): void {
    // Create destination directory
    fs.mkdirSync(dest, { recursive: true });

    // Read source directory
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
   * Copy bundled models to local directory with correct structure
   * Bundled: {bundledModelsDir}/Xenova--all-MiniLM-L6-v2/
   * Target:  {localModelsDir}/Xenova/all-MiniLM-L6-v2/
   */
  private copyBundledModelsToLocal(): void {
    console.log('[LocalAI] Copying bundled models to local directory...');

    const models = [this.EMBEDDING_MODEL, this.GENERATION_MODEL];

    for (const model of models) {
      // Source: Xenova--all-MiniLM-L6-v2
      const bundledDir = path.join(this.bundledModelsDir, model.replace('/', '--'));
      // Target: Xenova/all-MiniLM-L6-v2
      const localDir = path.join(this.localModelsDir, model);

      if (fs.existsSync(bundledDir)) {
        console.log(`[LocalAI] Copying ${model}...`);
        console.log(`[LocalAI]   From: ${bundledDir}`);
        console.log(`[LocalAI]   To: ${localDir}`);

        // Create parent directory (e.g., Xenova/)
        const parentDir = path.dirname(localDir);
        fs.mkdirSync(parentDir, { recursive: true });

        // Copy model files
        this.copyDirSync(bundledDir, localDir);
        console.log(`[LocalAI] Copied ${model} successfully`);
      } else {
        console.warn(`[LocalAI] Bundled model not found: ${bundledDir}`);
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
   * Initialize the AI service - uses bundled models or downloads if needed
   */
  async initialize(): Promise<void> {
    if (this.modelStatus.ready || this.modelStatus.loading) {
      return;
    }

    this.modelStatus.loading = true;
    this.updateProgress(0, 'Starting AI setup...');

    try {
      // Dynamic import of transformers (must use this pattern for ES modules in CommonJS)
      const transformers = await dynamicImport('@xenova/transformers');
      const pipeline = transformers.pipeline;
      const env = transformers.env;

      // Determine if we can use local models
      let useLocalModels = false;

      if (this.hasBundledModels) {
        // Check if models are already in local directory
        if (!this.checkLocalModels()) {
          this.updateProgress(5, 'Preparing AI models...');
          // Copy bundled models to local directory with correct structure
          this.copyBundledModelsToLocal();
        }
        useLocalModels = this.checkLocalModels();
      }

      // Configure transformers.js environment
      env.allowLocalModels = true;
      env.cacheDir = this.modelsDir;

      if (useLocalModels) {
        // Set localModelPath to our local models directory
        // transformers.js will look for: {localModelPath}/{model_id}/
        env.localModelPath = this.localModelsDir;
        env.allowRemoteModels = false;
        console.log('[LocalAI] Using local models from:', this.localModelsDir);
      } else {
        env.allowRemoteModels = true;
        console.log('[LocalAI] Will download models to:', this.modelsDir);
      }

      // Load embedding model first (smaller, faster)
      const embeddingMessage = useLocalModels
        ? 'Loading language understanding...'
        : 'Downloading language understanding...';
      this.updateProgress(10, embeddingMessage);

      console.log('[LocalAI] Loading embedding model:', this.EMBEDDING_MODEL);

      this.embeddingPipeline = await pipeline(
        'feature-extraction',
        this.EMBEDDING_MODEL,
        {
          local_files_only: useLocalModels,
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading' || progress.status === 'loading') {
              const pct = 10 + (progress.progress || 0) * 0.4;
              this.updateProgress(pct, embeddingMessage);
            }
          },
        }
      );

      // Load text generation model
      const generationMessage = useLocalModels
        ? 'Loading conversation ability...'
        : 'Downloading conversation ability...';
      this.updateProgress(50, generationMessage);

      console.log('[LocalAI] Loading generation model:', this.GENERATION_MODEL);

      this.generationPipeline = await pipeline(
        'text-generation',
        this.GENERATION_MODEL,
        {
          local_files_only: useLocalModels,
          progress_callback: (progress: any) => {
            if (progress.status === 'downloading' || progress.status === 'loading') {
              const pct = 50 + (progress.progress || 0) * 0.45;
              this.updateProgress(pct, generationMessage);
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

import http from 'http';
import https from 'https';

export interface OllamaModel {
  name: string;
  size: number;
  digest: string;
  modifiedAt: string;
}

export interface GenerateOptions {
  prompt: string;
  system?: string;
  context?: number[];
  stream?: boolean;
}

export class OllamaService {
  private baseUrl: string;
  private currentModel: string;

  constructor(baseUrl = 'http://localhost:11434', defaultModel = 'llama3.2') {
    this.baseUrl = baseUrl;
    this.currentModel = defaultModel;
  }

  /**
   * Check if Ollama is running and accessible
   */
  async checkConnection(): Promise<{ available: boolean; error?: string }> {
    try {
      const response = await this.makeRequest('/api/tags', 'GET');
      return { available: true };
    } catch (error) {
      return {
        available: false,
        error: 'Ollama is not running. Please start Ollama first.',
      };
    }
  }

  /**
   * Get list of available models
   */
  async getAvailableModels(): Promise<{ models: string[] }> {
    try {
      const response = await this.makeRequest('/api/tags', 'GET');
      const data = JSON.parse(response);
      const models = data.models?.map((m: OllamaModel) => m.name) || [];
      return { models };
    } catch (error) {
      return { models: [] };
    }
  }

  /**
   * Set the active model
   */
  setModel(modelName: string): void {
    this.currentModel = modelName;
  }

  /**
   * Get the current model name
   */
  getModel(): string {
    return this.currentModel;
  }

  /**
   * Generate embeddings for text using Ollama
   */
  async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.makeRequest('/api/embeddings', 'POST', {
        model: this.currentModel,
        prompt: text,
      });

      const data = JSON.parse(response);
      return data.embedding || [];
    } catch (error) {
      // Fallback: Use a simple hash-based embedding for demo purposes
      // In production, you'd want to ensure Ollama has an embedding model
      console.warn('Embedding generation failed, using fallback');
      return this.fallbackEmbedding(text);
    }
  }

  /**
   * Generate a response using the local LLM (streaming)
   */
  async *generateStream(options: GenerateOptions): AsyncGenerator<string> {
    const requestBody = {
      model: this.currentModel,
      prompt: options.prompt,
      system: options.system,
      stream: true,
    };

    const url = new URL('/api/generate', this.baseUrl);

    yield* this.streamRequest(url.toString(), requestBody);
  }

  /**
   * Generate a response using the local LLM (non-streaming)
   */
  async generate(options: GenerateOptions): Promise<string> {
    const response = await this.makeRequest('/api/generate', 'POST', {
      model: this.currentModel,
      prompt: options.prompt,
      system: options.system,
      stream: false,
    });

    const data = JSON.parse(response);
    return data.response || '';
  }

  /**
   * Make an HTTP request to Ollama
   */
  private makeRequest(
    endpoint: string,
    method: string,
    body?: object
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const url = new URL(endpoint, this.baseUrl);
      const isHttps = url.protocol === 'https:';
      const client = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 60000, // 60 second timeout
      };

      const req = client.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => {
          data += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            resolve(data);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          }
        });
      });

      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request timeout'));
      });

      if (body) {
        req.write(JSON.stringify(body));
      }
      req.end();
    });
  }

  /**
   * Stream response from Ollama
   */
  private async *streamRequest(
    urlString: string,
    body: object
  ): AsyncGenerator<string> {
    const url = new URL(urlString);
    const isHttps = url.protocol === 'https:';
    const client = isHttps ? https : http;

    const response = await new Promise<http.IncomingMessage>((resolve, reject) => {
      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      };

      const req = client.request(options, resolve);
      req.on('error', reject);
      req.write(JSON.stringify(body));
      req.end();
    });

    for await (const chunk of response) {
      const lines = chunk.toString().split('\n').filter(Boolean);
      for (const line of lines) {
        try {
          const data = JSON.parse(line);
          if (data.response) {
            yield data.response;
          }
        } catch {
          // Ignore parse errors for incomplete JSON
        }
      }
    }
  }

  /**
   * Fallback embedding using simple text hashing
   * This is NOT for production use - just a demo fallback
   */
  private fallbackEmbedding(text: string, dimensions = 384): number[] {
    const embedding = new Array(dimensions).fill(0);
    const words = text.toLowerCase().split(/\s+/);

    for (let i = 0; i < words.length; i++) {
      const word = words[i];
      for (let j = 0; j < word.length; j++) {
        const charCode = word.charCodeAt(j);
        const index = (charCode * (i + 1) * (j + 1)) % dimensions;
        embedding[index] += 1 / (words.length * word.length);
      }
    }

    // Normalize
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    if (magnitude > 0) {
      for (let i = 0; i < embedding.length; i++) {
        embedding[i] /= magnitude;
      }
    }

    return embedding;
  }
}

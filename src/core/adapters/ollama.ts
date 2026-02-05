/**
 * Ollama LLM Adapter
 *
 * Gebruikt de Ollama HTTP API (standaard op localhost:11434)
 * Voordelen:
 * - Gebruiker installeert Ollama zelf (simpel, cross-platform)
 * - Geen 2.3GB download door onze app
 * - Gebruiker kiest zelf het model
 * - Ollama handelt GPU/CPU optimalisatie af
 */

import type { ILLM, LLMConfig } from '../interfaces/llm';
import type { Message, GenerateOptions, StreamChunk } from '../interfaces/types';
import { LLMConnectionError } from '../interfaces/types';
import { buildSystemPrompt, collectStream } from './helpers';

const DEFAULT_CONFIG: Required<LLMConfig> = {
  provider: 'ollama',
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
  timeout: 120000,
  apiKey: '',
};

export class OllamaAdapter implements ILLM {
  private config: Required<LLMConfig>;

  constructor(config?: LLMConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.config.baseUrl}/api/tags`, {
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async *generate(
    messages: Pick<Message, 'role' | 'content'>[],
    context: string,
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk> {
    const systemPrompt = buildSystemPrompt(context, options?.systemPrompt);

    const ollamaMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const body = {
      model: this.config.model,
      messages: ollamaMessages,
      stream: true,
      options: {
        temperature: options?.temperature ?? 0.7,
        num_predict: options?.maxTokens ?? 1024,
      },
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });
    } catch (error) {
      throw new LLMConnectionError(
        'Kan geen verbinding maken met Ollama. Is Ollama gestart?',
        error instanceof Error ? error : undefined
      );
    }

    if (!response.ok) {
      const text = await response.text();
      throw new LLMConnectionError(`Ollama error: ${response.status} - ${text}`);
    }

    if (!response.body) {
      throw new LLMConnectionError('Geen response body van Ollama');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { content: '', done: true };
          break;
        }

        const text = decoder.decode(value, { stream: true });
        const lines = text.split('\n').filter(line => line.trim());

        for (const line of lines) {
          try {
            const json = JSON.parse(line) as OllamaStreamResponse;

            if (json.message?.content) {
              yield { content: json.message.content, done: false };
            }

            if (json.done) {
              yield { content: '', done: true };
              return;
            }
          } catch {
            // Skip invalid JSON lines
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  async generateSync(
    messages: Pick<Message, 'role' | 'content'>[],
    context: string,
    options?: GenerateOptions
  ): Promise<string> {
    return collectStream(this.generate(messages, context, options));
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }
}

interface OllamaStreamResponse {
  model: string;
  message?: {
    role: string;
    content: string;
  };
  done: boolean;
}

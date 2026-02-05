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

const DEFAULT_CONFIG: Required<LLMConfig> = {
  baseUrl: 'http://localhost:11434',
  model: 'llama3.2',
  timeout: 120000,
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
    const systemPrompt = this.buildSystemPrompt(context, options?.systemPrompt);

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
    const chunks: string[] = [];

    for await (const chunk of this.generate(messages, context, options)) {
      if (!chunk.done) {
        chunks.push(chunk.content);
      }
    }

    return chunks.join('');
  }

  getConfig(): LLMConfig {
    return { ...this.config };
  }

  /**
   * Build system prompt with document context
   */
  private buildSystemPrompt(context: string, customPrompt?: string): string {
    const base = customPrompt ?? `Je bent een behulpzame assistent die vragen beantwoordt over documenten.
Gebruik ALLEEN de informatie uit de gegeven context om te antwoorden.
Als het antwoord niet in de context staat, zeg dat eerlijk.
Antwoord in dezelfde taal als de vraag.`;

    if (!context) {
      return base;
    }

    return `${base}

--- DOCUMENT CONTEXT ---
${context}
--- EINDE CONTEXT ---`;
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

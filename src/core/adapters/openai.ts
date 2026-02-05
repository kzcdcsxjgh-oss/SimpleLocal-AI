/**
 * OpenAI-compatible LLM Adapter
 *
 * Werkt met:
 * - OpenAI API
 * - Azure OpenAI
 * - Anthropic Claude (via OpenAI-compatible endpoint)
 * - Andere compatible APIs (Together, Groq, OpenRouter, etc.)
 */

import type { ILLM, LLMConfig } from '../interfaces/llm';
import type { Message, GenerateOptions, StreamChunk } from '../interfaces/types';
import { LLMConnectionError } from '../interfaces/types';

export interface OpenAIConfig extends LLMConfig {
  apiKey?: string;
}

const DEFAULT_CONFIG: Required<OpenAIConfig> = {
  provider: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o-mini',
  timeout: 120000,
  apiKey: '',
};

export class OpenAIAdapter implements ILLM {
  private config: Required<OpenAIConfig>;

  constructor(config?: OpenAIConfig) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) {
      return false;
    }

    try {
      const response = await fetch(`${this.config.baseUrl}/models`, {
        headers: {
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
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
    if (!this.config.apiKey) {
      throw new LLMConnectionError('API key is niet ingesteld');
    }

    const systemPrompt = this.buildSystemPrompt(context, options?.systemPrompt);

    const openaiMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.map(m => ({ role: m.role, content: m.content })),
    ];

    const body = {
      model: this.config.model,
      messages: openaiMessages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1024,
    };

    let response: Response;
    try {
      response = await fetch(`${this.config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.config.apiKey}`,
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.config.timeout),
      });
    } catch (error) {
      throw new LLMConnectionError(
        'Kan geen verbinding maken met de API',
        error instanceof Error ? error : undefined
      );
    }

    if (!response.ok) {
      const text = await response.text();
      let errorMessage = `API error: ${response.status}`;
      try {
        const errorJson = JSON.parse(text);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = text || errorMessage;
      }
      throw new LLMConnectionError(errorMessage);
    }

    if (!response.body) {
      throw new LLMConnectionError('Geen response body van API');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          yield { content: '', done: true };
          break;
        }

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || ''; // Keep incomplete line in buffer

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;

          const data = trimmed.slice(6); // Remove 'data: ' prefix
          if (data === '[DONE]') {
            yield { content: '', done: true };
            return;
          }

          try {
            const json = JSON.parse(data) as OpenAIStreamResponse;
            const content = json.choices?.[0]?.delta?.content;
            if (content) {
              yield { content, done: false };
            }

            // Check for finish reason
            if (json.choices?.[0]?.finish_reason) {
              yield { content: '', done: true };
              return;
            }
          } catch {
            // Skip invalid JSON
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
    return {
      baseUrl: this.config.baseUrl,
      model: this.config.model,
      timeout: this.config.timeout,
    };
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

interface OpenAIStreamResponse {
  id: string;
  object: string;
  created: number;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string;
    };
    finish_reason: string | null;
  }[];
}

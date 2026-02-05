/**
 * LLM interface
 *
 * Verantwoordelijk voor text generation.
 * Implementaties: Ollama, OpenAI-compatible, llama.cpp
 */

import type { Message, GenerateOptions, StreamChunk } from './types';

export interface LLMConfig {
  baseUrl?: string;
  model?: string;
  timeout?: number;
}

export interface ILLM {
  /**
   * Check of de LLM beschikbaar is
   */
  isAvailable(): Promise<boolean>;

  /**
   * Genereer een response (streaming)
   */
  generate(
    messages: Pick<Message, 'role' | 'content'>[],
    context: string,
    options?: GenerateOptions
  ): AsyncGenerator<StreamChunk>;

  /**
   * Genereer een response (niet-streaming, voor eenvoudige cases)
   */
  generateSync(
    messages: Pick<Message, 'role' | 'content'>[],
    context: string,
    options?: GenerateOptions
  ): Promise<string>;

  /**
   * Huidige configuratie
   */
  getConfig(): LLMConfig;
}

/**
 * Gedeelde hulpfuncties voor LLM adapters
 */

import type { StreamChunk } from '../interfaces/types';

const BASE_SYSTEM_PROMPT = `Je bent een behulpzame assistent die vragen beantwoordt over documenten.
Gebruik ALLEEN de informatie uit de gegeven context om te antwoorden.
Als het antwoord niet in de context staat, zeg dat eerlijk.
Antwoord in dezelfde taal als de vraag.`;

export function buildSystemPrompt(context: string, customPrompt?: string): string {
  const base = customPrompt ?? BASE_SYSTEM_PROMPT;

  if (!context) {
    return base;
  }

  return `${base}

--- DOCUMENT CONTEXT ---
${context}
--- EINDE CONTEXT ---`;
}

export async function collectStream(generator: AsyncGenerator<StreamChunk>): Promise<string> {
  const chunks: string[] = [];

  for await (const chunk of generator) {
    if (!chunk.done) {
      chunks.push(chunk.content);
    }
  }

  return chunks.join('');
}

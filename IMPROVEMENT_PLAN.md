# SimpleLocal-AI Improvement Plan

Dit document beschrijft het verbeteringsplan voor de SimpleLocal-AI applicatie, gebaseerd op een grondige code-analyse.

## Overzicht

| Categorie | Kritiek | Hoog | Medium | Laag |
|-----------|---------|------|--------|------|
| Security | 1 | 2 | 2 | - |
| Type Safety | - | 1 | 3 | - |
| Error Handling | - | 2 | 3 | 2 |
| Testing | - | 1 | 2 | - |
| Performance | - | 1 | 3 | 1 |

---

## 1. KRITIEKE SECURITY FIXES

### 1.1 SQL Injection Kwetsbaarheid (KRITIEK)

**Locatie:** `src/main/services/vectorStore.ts:173`

**Probleem:**
```typescript
// HUIDIGE CODE - ONVEILIG
await this.table.delete(`documentId = '${documentId}'`);
```

**Oplossing:**
```typescript
// VERBETERDE CODE - VEILIG
async deleteDocumentVectors(documentId: string): Promise<void> {
  try {
    if (!this.table) {
      throw new Error('Vector store not initialized');
    }

    // Valideer documentId format
    if (!documentId || typeof documentId !== 'string') {
      throw new Error('Invalid documentId');
    }

    // Sanitize input - alleen alfanumerieke karakters en koppeltekens
    const sanitizedId = documentId.replace(/[^a-zA-Z0-9-_]/g, '');
    if (sanitizedId !== documentId) {
      throw new Error('DocumentId contains invalid characters');
    }

    await this.table.delete(`documentId = '${sanitizedId}'`);
    console.log(`Deleted vectors for document: ${sanitizedId}`);
  } catch (error) {
    console.error('Error deleting document vectors:', error);
    throw error;
  }
}
```

**Impact:** Voorkomt data-corruptie en ongeautoriseerde verwijdering van documenten.

---

### 1.2 Input Validatie voor Bestandspaden (HOOG)

**Locatie:** `src/main/index.ts:101`

**Probleem:** Geen validatie van bestandspaden, waardoor path traversal aanvallen mogelijk zijn.

**Oplossing - Nieuwe utility functie:**
```typescript
// src/main/utils/validation.ts
import path from 'path';
import { app } from 'electron';

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.txt', '.md'];
const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100MB

export function validateFilePath(filePath: string): { valid: boolean; error?: string } {
  // Check if path is absolute
  if (!path.isAbsolute(filePath)) {
    return { valid: false, error: 'File path must be absolute' };
  }

  // Check extension
  const ext = path.extname(filePath).toLowerCase();
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    return { valid: false, error: `Invalid file extension: ${ext}` };
  }

  // Prevent path traversal
  const normalizedPath = path.normalize(filePath);
  if (normalizedPath.includes('..')) {
    return { valid: false, error: 'Path traversal detected' };
  }

  return { valid: true };
}

export function validateMessageContent(message: string): { valid: boolean; error?: string } {
  const MAX_MESSAGE_LENGTH = 10000;

  if (!message || typeof message !== 'string') {
    return { valid: false, error: 'Message must be a non-empty string' };
  }

  if (message.length > MAX_MESSAGE_LENGTH) {
    return { valid: false, error: `Message exceeds maximum length of ${MAX_MESSAGE_LENGTH}` };
  }

  return { valid: true };
}
```

---

### 1.3 Content Security Policy Verbetering (MEDIUM)

**Locatie:** `src/renderer/index.html:6`

**Probleem:** `style-src 'unsafe-inline'` staat CSS injection toe.

**Oplossing:**
```html
<!-- VERBETERD -->
<meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'nonce-GENERATED_NONCE';
               img-src 'self' data:;
               connect-src 'self';">
```

---

## 2. TYPE SAFETY VERBETERINGEN

### 2.1 Verwijder `any` Types (HOOG)

**Betrokken bestanden:**
- `src/main/preload.ts:24,30,36`
- `src/main/services/vectorStore.ts:115`
- `src/main/services/localAIService.ts:19,20,150,170`

**Oplossing - Nieuwe type definities:**
```typescript
// src/shared/types.ts - UITBREIDING

// Event handler types
export interface ChatStreamData {
  chunk: string;
  isComplete: boolean;
}

export interface ProgressData {
  file?: string;
  name?: string;
  progress: number;
  loaded?: number;
  total?: number;
  status?: string;
}

// Vector store types
export interface VectorSearchResult {
  text: string;
  documentId: string;
  documentName: string;
  chunkIndex: number;
  _distance: number;
}

// AI Service types
export interface TextGenerationPipeline {
  (text: string, options?: GenerationOptions): Promise<GenerationResult[]>;
}

export interface GenerationOptions {
  max_new_tokens?: number;
  temperature?: number;
  do_sample?: boolean;
  callback_function?: (output: StreamCallbackOutput) => void;
}

export interface StreamCallbackOutput {
  output_token_ids?: number[][];
}

export interface GenerationResult {
  generated_text: string;
}
```

**Implementatie in preload.ts:**
```typescript
// VOOR
onChatStream: (callback: (chunk: string) => void) => { ... }

// NA
onChatStream: (callback: (data: ChatStreamData) => void) => {
  const handler = (_event: Electron.IpcRendererEvent, data: ChatStreamData) => {
    callback(data);
  };
  ipcRenderer.on('chat-stream', handler);
  return () => ipcRenderer.removeListener('chat-stream', handler);
}
```

---

### 2.2 Unificeer Message Interface (MEDIUM)

**Probleem:** `Message` interface bestaat in zowel `App.tsx` als `shared/types.ts`.

**Oplossing:**
```typescript
// src/shared/types.ts - ENIGE DEFINITIE
export interface Message {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  metadata?: {
    sources?: string[];
    processingTime?: number;
  };
}

// App.tsx - import gebruiken
import type { Message } from '../shared/types';
```

---

## 3. ERROR HANDLING VERBETERINGEN

### 3.1 React Error Boundary (HOOG)

**Nieuw bestand:** `src/renderer/components/ErrorBoundary.tsx`

```typescript
import React, { Component, ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('ErrorBoundary caught an error:', error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return this.props.fallback || (
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Er is iets misgegaan</h2>
          <p>{this.state.error?.message}</p>
          <button onClick={() => window.location.reload()}>
            Herlaad Applicatie
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
```

**Gebruik in App.tsx:**
```typescript
import { ErrorBoundary } from './components/ErrorBoundary';

function App() {
  return (
    <ErrorBoundary>
      {/* bestaande app content */}
    </ErrorBoundary>
  );
}
```

---

### 3.2 Centrale Error Utility (MEDIUM)

**Nieuw bestand:** `src/main/utils/errors.ts`

```typescript
export class AppError extends Error {
  constructor(
    message: string,
    public code: string,
    public recoverable: boolean = true,
    public originalError?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export function formatError(error: unknown): string {
  if (error instanceof AppError) {
    return `[${error.code}] ${error.message}`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'An unknown error occurred';
}

export function logError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const message = formatError(error);
  console.error(`[${timestamp}] [${context}] ${message}`);

  if (error instanceof Error && error.stack) {
    console.error(error.stack);
  }
}
```

---

### 3.3 MainWindow Null Checks (HOOG)

**Locatie:** `src/main/index.ts`

**Probleem:** `mainWindow?.webContents.send()` kan falen als mainWindow null is.

**Oplossing:**
```typescript
// Utility functie voor veilige IPC sends
function safeSend(channel: string, ...args: unknown[]): boolean {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args);
    return true;
  }
  console.warn(`Cannot send to channel '${channel}': mainWindow not available`);
  return false;
}

// Gebruik
safeSend('chat-stream', chunk);
safeSend('document-progress', { progress: 50 });
```

---

## 4. TESTING STRATEGIE

### 4.1 Test Framework Setup (HOOG)

**Nieuwe devDependencies:**
```json
{
  "devDependencies": {
    "vitest": "^1.6.0",
    "@testing-library/react": "^14.2.0",
    "@testing-library/jest-dom": "^6.4.0",
    "@types/jest": "^29.5.0"
  }
}
```

**vitest.config.ts:**
```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      exclude: ['node_modules/', 'src/test/']
    }
  }
});
```

---

### 4.2 Prioriteit Unit Tests

**Test 1: Document Processor** (`src/main/services/__tests__/documentProcessor.test.ts`)
```typescript
import { describe, it, expect, vi } from 'vitest';
import { DocumentProcessor } from '../documentProcessor';

describe('DocumentProcessor', () => {
  describe('processDocument', () => {
    it('should extract text from PDF files', async () => {
      // Test implementation
    });

    it('should extract text from DOCX files', async () => {
      // Test implementation
    });

    it('should handle corrupted files gracefully', async () => {
      // Test implementation
    });

    it('should respect chunk size limits', async () => {
      // Test implementation
    });
  });

  describe('chunkText', () => {
    it('should split text into chunks of specified size', () => {
      // Test implementation
    });

    it('should maintain word boundaries', () => {
      // Test implementation
    });
  });
});
```

**Test 2: Vector Store** (`src/main/services/__tests__/vectorStore.test.ts`)
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { VectorStore } from '../vectorStore';

describe('VectorStore', () => {
  let vectorStore: VectorStore;

  beforeEach(async () => {
    vectorStore = new VectorStore();
    await vectorStore.initialize(':memory:');
  });

  afterEach(async () => {
    await vectorStore.close();
  });

  describe('addDocumentChunks', () => {
    it('should store document chunks with embeddings', async () => {
      // Test implementation
    });

    it('should reject invalid document IDs', async () => {
      // Test implementation
    });
  });

  describe('searchSimilar', () => {
    it('should return relevant chunks', async () => {
      // Test implementation
    });

    it('should respect limit parameter', async () => {
      // Test implementation
    });
  });
});
```

**Test 3: Input Validation** (`src/main/utils/__tests__/validation.test.ts`)
```typescript
import { describe, it, expect } from 'vitest';
import { validateFilePath, validateMessageContent } from '../validation';

describe('validateFilePath', () => {
  it('should accept valid PDF paths', () => {
    const result = validateFilePath('/home/user/document.pdf');
    expect(result.valid).toBe(true);
  });

  it('should reject path traversal attempts', () => {
    const result = validateFilePath('/home/user/../../../etc/passwd');
    expect(result.valid).toBe(false);
    expect(result.error).toContain('traversal');
  });

  it('should reject unsupported extensions', () => {
    const result = validateFilePath('/home/user/script.exe');
    expect(result.valid).toBe(false);
  });
});

describe('validateMessageContent', () => {
  it('should accept valid messages', () => {
    const result = validateMessageContent('Hello, how are you?');
    expect(result.valid).toBe(true);
  });

  it('should reject messages exceeding max length', () => {
    const longMessage = 'a'.repeat(15000);
    const result = validateMessageContent(longMessage);
    expect(result.valid).toBe(false);
  });
});
```

---

## 5. PERFORMANCE OPTIMALISATIES

### 5.1 UUID voor Message IDs (MEDIUM)

**Locatie:** `src/renderer/App.tsx:106,115`

**Probleem:** `Date.now()` kan duplicaten creëren bij snelle berichten.

**Oplossing:**
```typescript
// Installeer: npm install uuid @types/uuid
import { v4 as uuidv4 } from 'uuid';

// Gebruik
const userMessage: Message = {
  id: uuidv4(),  // Gegarandeerd uniek
  role: 'user',
  content: inputMessage,
  timestamp: Date.now()
};
```

---

### 5.2 Document Processing Batching (HOOG)

**Locatie:** `src/main/index.ts:110-120`

**Probleem:** Alle chunks worden synchroon verwerkt, wat UI bevriest.

**Oplossing:**
```typescript
async function processDocumentChunks(
  chunks: Array<{ text: string; embedding: number[] }>,
  documentId: string,
  documentName: string,
  batchSize: number = 10
): Promise<void> {
  const totalChunks = chunks.length;

  for (let i = 0; i < totalChunks; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize);

    await Promise.all(
      batch.map((chunk, idx) =>
        vectorStore.addChunk({
          ...chunk,
          documentId,
          documentName,
          chunkIndex: i + idx
        })
      )
    );

    // Progress update
    const progress = Math.round(((i + batch.length) / totalChunks) * 100);
    safeSend('document-progress', { progress, status: 'indexing' });

    // Yield to event loop
    await new Promise(resolve => setImmediate(resolve));
  }
}
```

---

### 5.3 Vector Store Indexering (MEDIUM)

**Locatie:** `src/main/services/vectorStore.ts:135-157`

**Probleem:** O(n) complexiteit voor document lookup.

**Oplossing:**
```typescript
// Voeg index toe bij initialisatie
async initialize(dbPath: string): Promise<void> {
  // ... bestaande code ...

  // Maak index voor documentId
  await this.table.createIndex('documentId');
}

// Geoptimaliseerde document lijst
async getDocumentList(): Promise<DocumentInfo[]> {
  if (!this.table) return [];

  // Gebruik SQL aggregatie i.p.v. in-memory grouping
  const results = await this.db.execute(`
    SELECT
      documentId,
      documentName,
      COUNT(*) as chunkCount,
      MAX(timestamp) as lastModified
    FROM ${this.tableName}
    GROUP BY documentId, documentName
    ORDER BY lastModified DESC
  `);

  return results.map(row => ({
    id: row.documentId,
    name: row.documentName,
    chunkCount: row.chunkCount,
    lastModified: row.lastModified
  }));
}
```

---

### 5.4 React State Optimalisatie (MEDIUM)

**Locatie:** `src/renderer/App.tsx:124-127`

**Probleem:** Inefficiënte string concatenatie bij streaming.

**Oplossing:**
```typescript
// Gebruik useRef voor streaming content
const streamingContentRef = useRef<string>('');

// In onChatStream callback
const handleStreamChunk = useCallback((chunk: string) => {
  streamingContentRef.current += chunk;

  // Throttle state updates (elke 100ms)
  if (!throttleTimeoutRef.current) {
    throttleTimeoutRef.current = setTimeout(() => {
      setMessages(prev =>
        prev.map(msg =>
          msg.id === currentMessageId
            ? { ...msg, content: streamingContentRef.current }
            : msg
        )
      );
      throttleTimeoutRef.current = null;
    }, 100);
  }
}, [currentMessageId]);
```

---

## 6. CODE QUALITY VERBETERINGEN

### 6.1 ESLint Configuratie (LAAG)

**Nieuw bestand:** `.eslintrc.cjs`
```javascript
module.exports = {
  root: true,
  env: { browser: true, es2020: true, node: true },
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:react/recommended',
    'plugin:react-hooks/recommended',
  ],
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    project: ['./tsconfig.json'],
  },
  plugins: ['@typescript-eslint', 'react'],
  rules: {
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/explicit-function-return-type': 'warn',
    '@typescript-eslint/no-unused-vars': 'error',
    'react/react-in-jsx-scope': 'off',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
  },
  settings: {
    react: { version: 'detect' },
  },
};
```

---

### 6.2 Prettier Configuratie (LAAG)

**Nieuw bestand:** `.prettierrc`
```json
{
  "semi": true,
  "trailingComma": "es5",
  "singleQuote": true,
  "printWidth": 100,
  "tabWidth": 2,
  "useTabs": false
}
```

---

## 7. CI/CD VERBETERINGEN

### 7.1 Multi-Platform Build (MEDIUM)

**Locatie:** `.github/workflows/build.yml`

```yaml
name: Build

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci
      - run: npm run lint
      - run: npm run test

  build:
    needs: test
    strategy:
      matrix:
        os: [windows-latest, macos-latest, ubuntu-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'
      - run: npm ci --legacy-peer-deps
      - run: npm run build
      - uses: actions/upload-artifact@v4
        with:
          name: build-${{ matrix.os }}
          path: dist/
```

---

## 8. IMPLEMENTATIE VOLGORDE

### Fase 1: Kritieke Security (Week 1)
- [ ] Fix SQL injection in vectorStore.ts
- [ ] Implementeer input validatie utility
- [ ] Voeg file path validatie toe

### Fase 2: Stabiliteit (Week 2)
- [ ] Implementeer Error Boundary
- [ ] Voeg mainWindow null checks toe
- [ ] Maak centrale error utility

### Fase 3: Type Safety (Week 3)
- [ ] Verwijder alle `any` types
- [ ] Unificeer type definities
- [ ] Voeg strikte TypeScript checks toe

### Fase 4: Testing (Week 4)
- [ ] Setup test framework
- [ ] Schrijf unit tests voor core services
- [ ] Configureer code coverage

### Fase 5: Performance (Week 5)
- [ ] Implementeer UUID voor message IDs
- [ ] Voeg document processing batching toe
- [ ] Optimaliseer vector store queries

### Fase 6: Code Quality (Week 6)
- [ ] Configureer ESLint
- [ ] Configureer Prettier
- [ ] Update CI/CD pipeline

---

## Bijlage: Bestands-specifieke Issues

| Bestand | Regel | Issue | Prioriteit |
|---------|-------|-------|------------|
| `vectorStore.ts` | 173 | SQL injection | KRITIEK |
| `index.ts` | 101 | Geen path validatie | HOOG |
| `index.ts` | 56,104,125 | mainWindow null | HOOG |
| `localAIService.ts` | 6-8 | dynamic import | LAAG |
| `localAIService.ts` | 19,20,150 | any types | MEDIUM |
| `App.tsx` | 106,115 | Date.now() ID | MEDIUM |
| `App.tsx` | 122-143 | Event listener timing | LAAG |
| `preload.ts` | 24,30,36 | any types | MEDIUM |
| `index.html` | 6 | CSP unsafe-inline | MEDIUM |

---

*Document gegenereerd: 2026-01-30*
*Versie: 1.0*

import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import fs from 'fs';
import { Core, LLMConfig } from '../core';
import type { Source } from '../core';

let mainWindow: BrowserWindow | null = null;
let core: Core;
let settingsPath: string;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

interface Settings {
  llm: LLMConfig;
}

function loadSettings(): Settings {
  const defaults: Settings = {
    llm: { provider: 'ollama', baseUrl: 'http://localhost:11434', model: 'llama3.2' },
  };

  try {
    if (fs.existsSync(settingsPath)) {
      const data = fs.readFileSync(settingsPath, 'utf-8');
      return { ...defaults, ...JSON.parse(data) };
    }
  } catch (error) {
    console.error('Error loading settings:', error);
  }

  return defaults;
}

function saveSettings(settings: Settings): void {
  try {
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
  } catch (error) {
    console.error('Error saving settings:', error);
  }
}

/**
 * Safely send IPC message to renderer
 */
function safeSend(channel: string, ...args: unknown[]): boolean {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args);
    return true;
  }
  return false;
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    title: 'SimpleLocal AI',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
    backgroundColor: '#ffffff',
  });

  mainWindow.setMenuBarVisibility(false);

  if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

async function initializeCore() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'simplelocal-data');
  settingsPath = path.join(userDataPath, 'settings.json');

  // Load saved settings
  const settings = loadSettings();

  core = new Core({ dataDir, llm: settings.llm });
  await core.initialize();

  // Check LLM status and notify renderer
  const llmAvailable = await core.isLLMAvailable();
  const config = core.getLLMConfig();
  const providerName = config.provider === 'openai' ? 'OpenAI' : 'Ollama';

  safeSend('ai:status', {
    ready: llmAvailable,
    loading: false,
    progress: 100,
    error: llmAvailable
      ? undefined
      : config.provider === 'openai'
        ? 'OpenAI API niet beschikbaar. Controleer je API key.'
        : 'Ollama niet gevonden. Start Ollama met: ollama serve',
    provider: providerName,
  });
}

// IPC Handlers
function setupIpcHandlers() {
  // === AI Status ===
  ipcMain.handle('ai:check', async () => {
    const ready = await core.isLLMAvailable();
    const config = core.getLLMConfig();
    return {
      ready,
      loading: false,
      progress: 100,
      error: ready ? undefined : 'LLM niet beschikbaar',
      provider: config.provider === 'openai' ? 'OpenAI' : 'Ollama',
    };
  });

  // === Settings ===
  ipcMain.handle('settings:get', async () => {
    const settings = loadSettings();
    // Don't send full API key to renderer, just indicate if it's set
    return {
      llm: {
        ...settings.llm,
        apiKey: settings.llm.apiKey ? '••••••••' : undefined,
        hasApiKey: !!settings.llm.apiKey,
      },
    };
  });

  ipcMain.handle('settings:set', async (_event, newSettings: { llm: LLMConfig }) => {
    const currentSettings = loadSettings();

    // If apiKey is masked or empty, keep the existing key
    const apiKey = newSettings.llm.apiKey === '••••••••' || !newSettings.llm.apiKey
      ? currentSettings.llm.apiKey
      : newSettings.llm.apiKey;

    const updatedSettings: Settings = {
      llm: {
        ...newSettings.llm,
        apiKey,
      },
    };

    saveSettings(updatedSettings);

    // Update Core with new LLM config
    core.setLLMConfig(updatedSettings.llm);

    // Check new LLM status
    const ready = await core.isLLMAvailable();
    const config = core.getLLMConfig();

    safeSend('ai:status', {
      ready,
      loading: false,
      progress: 100,
      error: ready ? undefined : 'LLM niet beschikbaar na wijziging',
      provider: config.provider === 'openai' ? 'OpenAI' : 'Ollama',
    });

    return { success: true, ready };
  });

  // === File Dialog ===
  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };

    const extensions = core.getSupportedExtensions().map(ext => ext.slice(1));
    return dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions },
        { name: 'All Files', extensions: ['*'] },
      ],
    });
  });

  // === Documents ===
  ipcMain.handle('document:process', async (_event, filePath: string) => {
    try {
      safeSend('document:processing', { filePath, status: 'started' });
      const document = await core.addDocument(filePath);
      safeSend('document:processing', { filePath, status: 'completed' });
      return { success: true, document };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      safeSend('document:processing', { filePath, status: 'error', error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  ipcMain.handle('document:list', async () => {
    const documents = await core.listDocuments();
    return documents.map(doc => ({
      id: doc.id,
      name: doc.name,
      path: doc.path,
      addedAt: doc.createdAt.toISOString(),
    }));
  });

  ipcMain.handle('document:remove', async (_event, documentId: string) => {
    try {
      await core.removeDocument(documentId);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      return { success: false, error: errorMessage };
    }
  });

  // === Conversations (new API) ===
  ipcMain.handle('conversation:list', async () => {
    const conversations = await core.listConversations();
    return conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      documentIds: conv.documentIds,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    }));
  });

  ipcMain.handle('conversation:get', async (_event, conversationId: string) => {
    const conv = await core.getConversation(conversationId);
    if (!conv) return null;

    const messages = await core.getMessages(conversationId);
    return {
      id: conv.id,
      title: conv.title,
      documentIds: conv.documentIds,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
        sources: msg.sources,
        createdAt: msg.createdAt.toISOString(),
      })),
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('conversation:create', async (_event, documentIds?: string[]) => {
    const conv = await core.createConversation(documentIds);
    return {
      id: conv.id,
      title: conv.title,
      documentIds: conv.documentIds,
      messages: [],
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('conversation:update', async (_event, conversationId: string, updates: { title?: string; documentIds?: string[] }) => {
    const conv = await core.updateConversation(conversationId, updates);
    return {
      id: conv.id,
      title: conv.title,
      documentIds: conv.documentIds,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('conversation:delete', async (_event, conversationId: string) => {
    await core.deleteConversation(conversationId);
    return { success: true };
  });

  // === Chat (new: conversation-based) ===
  ipcMain.handle('chat:send', async (_event, conversationId: string, message: string) => {
    try {
      let sources: Source[] = [];

      for await (const chunk of core.chat(conversationId, message)) {
        safeSend('chat:stream', {
          chunk: chunk.content,
          done: chunk.done,
          sources: chunk.sources,
        });
        if (chunk.sources) {
          sources = chunk.sources;
        }
      }

      return { success: true, sources };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout';
      safeSend('chat:stream', { chunk: '', done: true, error: errorMessage });
      return { success: false, error: errorMessage };
    }
  });

  // === Legacy Chat Session Handlers (backwards compatibility) ===
  ipcMain.handle('chat:getSessions', async () => {
    const conversations = await core.listConversations();
    return conversations.map(conv => ({
      id: conv.id,
      title: conv.title,
      messages: [],
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    }));
  });

  ipcMain.handle('chat:getSession', async (_event, sessionId: string) => {
    const conv = await core.getConversation(sessionId);
    if (!conv) return null;

    const messages = await core.getMessages(sessionId);
    return {
      id: conv.id,
      title: conv.title,
      messages: messages.map(msg => ({
        id: msg.id,
        role: msg.role,
        content: msg.content,
      })),
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('chat:createSession', async () => {
    const conv = await core.createConversation();
    return {
      id: conv.id,
      title: conv.title,
      messages: [],
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('chat:updateSession', async (_event, sessionId: string, _messages: unknown[], title?: string) => {
    if (title) {
      const conv = await core.updateConversation(sessionId, { title });
      const messages = await core.getMessages(sessionId);
      return {
        id: conv.id,
        title: conv.title,
        messages: messages.map(msg => ({
          id: msg.id,
          role: msg.role,
          content: msg.content,
        })),
        createdAt: conv.createdAt.toISOString(),
        updatedAt: conv.updatedAt.toISOString(),
      };
    }
    return core.getConversation(sessionId);
  });

  ipcMain.handle('chat:deleteSession', async (_event, sessionId: string) => {
    await core.deleteConversation(sessionId);
    return { success: true };
  });

  ipcMain.handle('chat:renameSession', async (_event, sessionId: string, title: string) => {
    const conv = await core.updateConversation(sessionId, { title });
    return {
      id: conv.id,
      title: conv.title,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    };
  });

  ipcMain.handle('chat:clear', async (_event, conversationId?: string) => {
    if (conversationId) {
      await core.clearMessages(conversationId);
    }
    return { success: true };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();
  await initializeCore();

  app.on('activate', async () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      await createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async () => {
  await core?.close();
});

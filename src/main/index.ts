import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { DocumentProcessor } from './services/documentProcessor';
import { VectorStore } from './services/vectorStore';
import { LocalAIService } from './services/localAIService';
import { ChatStore } from './services/chatStore';
import {
  validateFilePath,
  validateMessageContent,
  validateDocumentId
} from './utils/validation';

let mainWindow: BrowserWindow | null = null;
let documentProcessor: DocumentProcessor;
let vectorStore: VectorStore;
let localAI: LocalAIService;
let chatStore: ChatStore;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

/**
 * Safely send IPC message to renderer
 * Handles null mainWindow and destroyed window cases
 */
function safeSend(channel: string, ...args: unknown[]): boolean {
  if (mainWindow && !mainWindow.isDestroyed() && mainWindow.webContents) {
    mainWindow.webContents.send(channel, ...args);
    return true;
  }
  console.warn(`Cannot send to channel '${channel}': mainWindow not available`);
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
    // Senior-friendly: larger default size, clear window
    backgroundColor: '#ffffff',
  });

  // Remove menu bar for cleaner look
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

async function initializeServices() {
  const userDataPath = app.getPath('userData');
  const dataDir = path.join(userDataPath, 'simplelocal-data');

  // Initialize services
  vectorStore = new VectorStore(dataDir);
  documentProcessor = new DocumentProcessor();
  localAI = new LocalAIService();
  chatStore = new ChatStore(dataDir);

  // Set up progress callback for AI initialization
  localAI.onProgress((status) => {
    safeSend('ai:status', status);
  });

  await vectorStore.initialize();
  await chatStore.initialize();

  // Start AI initialization in background (don't block app start)
  localAI.initialize().catch((error) => {
    console.error('Failed to initialize AI:', error);
  });
}

// IPC Handlers
function setupIpcHandlers() {
  // Check AI status
  ipcMain.handle('ai:check', async () => {
    return localAI.getStatus();
  });

  // Manually trigger AI initialization
  ipcMain.handle('ai:initialize', async () => {
    try {
      await localAI.initialize();
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Open file dialog for document selection
  ipcMain.handle('dialog:openFile', async () => {
    if (!mainWindow) return { canceled: true, filePaths: [] };

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'txt', 'docx', 'md'] },
        { name: 'All Files', extensions: ['*'] },
      ],
    });

    return result;
  });

  // Process and index a document
  ipcMain.handle('document:process', async (_event, filePath: string) => {
    try {
      // Validate file path before processing
      const pathValidation = validateFilePath(filePath);
      if (!pathValidation.valid) {
        console.error('Invalid file path:', pathValidation.error);
        return { success: false, error: pathValidation.error };
      }

      // Notify renderer that processing started
      safeSend('document:processing', { filePath, status: 'started' });

      // Process the document into chunks
      const chunks = await documentProcessor.processDocument(filePath);

      // Generate embeddings for each chunk
      const documentsWithEmbeddings = [];
      for (const chunk of chunks) {
        const embedding = await localAI.generateEmbedding(chunk.content);
        documentsWithEmbeddings.push({
          content: chunk.content,
          documentPath: chunk.metadata.documentPath,
          documentName: chunk.metadata.documentName,
          chunkIndex: chunk.metadata.chunkIndex,
          embedding,
        });
      }

      // Store in vector database
      await vectorStore.addDocuments(documentsWithEmbeddings);

      safeSend('document:processing', { filePath, status: 'completed' });

      return { success: true, chunks: chunks.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      safeSend('document:processing', {
        filePath,
        status: 'error',
        error: errorMessage
      });
      return { success: false, error: errorMessage };
    }
  });

  // Get list of indexed documents
  ipcMain.handle('document:list', async () => {
    return await vectorStore.getIndexedDocuments();
  });

  // Remove a document from the index
  ipcMain.handle('document:remove', async (_event, documentId: string) => {
    // Validate document ID before removal
    const idValidation = validateDocumentId(documentId);
    if (!idValidation.valid) {
      console.error('Invalid document ID:', idValidation.error);
      return { success: false, error: idValidation.error };
    }

    try {
      await vectorStore.removeDocument(documentId);
      return { success: true };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Chat with documents
  ipcMain.handle('chat:send', async (_event, message: string) => {
    try {
      // Validate message content before processing
      const messageValidation = validateMessageContent(message);
      if (!messageValidation.valid) {
        console.error('Invalid message:', messageValidation.error);
        return { success: false, error: messageValidation.error };
      }

      // Generate embedding for the query
      const queryEmbedding = await localAI.generateEmbedding(message);

      // Search for relevant document chunks
      const relevantChunks = await vectorStore.search(queryEmbedding, 5);

      // Build context from relevant chunks
      let context = '';
      if (relevantChunks.length > 0) {
        context = relevantChunks
          .map((chunk) => `[From: ${chunk.documentName}]\n${chunk.content}`)
          .join('\n\n---\n\n');
      }

      // Generate response
      const response = await localAI.generate(message, context, (chunk) => {
        safeSend('chat:stream', { chunk, done: false });
      });

      safeSend('chat:stream', { chunk: response, done: true });

      return { success: true, response };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Clear chat history (for future implementation)
  ipcMain.handle('chat:clear', async () => {
    return { success: true };
  });

  // Chat session management
  ipcMain.handle('chat:getSessions', async () => {
    return await chatStore.getSessions();
  });

  ipcMain.handle('chat:getSession', async (_event, sessionId: string) => {
    return await chatStore.getSession(sessionId);
  });

  ipcMain.handle('chat:createSession', async () => {
    return await chatStore.createSession();
  });

  ipcMain.handle('chat:updateSession', async (_event, sessionId: string, messages: any[], title?: string) => {
    return await chatStore.updateSession(sessionId, messages, title);
  });

  ipcMain.handle('chat:deleteSession', async (_event, sessionId: string) => {
    const success = await chatStore.deleteSession(sessionId);
    return { success };
  });

  ipcMain.handle('chat:renameSession', async (_event, sessionId: string, title: string) => {
    return await chatStore.renameSession(sessionId, title);
  });
}

// App lifecycle
app.whenReady().then(async () => {
  setupIpcHandlers();
  await createWindow();
  await initializeServices();

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
  // Cleanup resources
  await vectorStore?.close();
});

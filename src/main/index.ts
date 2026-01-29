import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import path from 'path';
import { DocumentProcessor } from './services/documentProcessor';
import { VectorStore } from './services/vectorStore';
import { RAGPipeline } from './services/ragPipeline';
import { OllamaService } from './services/ollamaService';

let mainWindow: BrowserWindow | null = null;
let documentProcessor: DocumentProcessor;
let vectorStore: VectorStore;
let ragPipeline: RAGPipeline;
let ollamaService: OllamaService;

const isDev = process.env.NODE_ENV === 'development' || !app.isPackaged;

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
  ollamaService = new OllamaService();
  vectorStore = new VectorStore(dataDir);
  documentProcessor = new DocumentProcessor();
  ragPipeline = new RAGPipeline(vectorStore, ollamaService);

  await vectorStore.initialize();
}

// IPC Handlers
function setupIpcHandlers() {
  // Check if Ollama is available
  ipcMain.handle('ollama:check', async () => {
    return await ollamaService.checkConnection();
  });

  // Get available models
  ipcMain.handle('ollama:models', async () => {
    return await ollamaService.getAvailableModels();
  });

  // Set the active model
  ipcMain.handle('ollama:setModel', async (_event, modelName: string) => {
    ollamaService.setModel(modelName);
    return { success: true };
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
      // Notify renderer that processing started
      mainWindow?.webContents.send('document:processing', { filePath, status: 'started' });

      // Process the document into chunks
      const chunks = await documentProcessor.processDocument(filePath);

      // Generate embeddings and store in vector database
      await ragPipeline.indexDocument(filePath, chunks);

      mainWindow?.webContents.send('document:processing', { filePath, status: 'completed' });

      return { success: true, chunks: chunks.length };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      mainWindow?.webContents.send('document:processing', {
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
    await vectorStore.removeDocument(documentId);
    return { success: true };
  });

  // Chat with documents using RAG
  ipcMain.handle('chat:send', async (_event, message: string) => {
    try {
      // Stream the response
      const responseStream = ragPipeline.chat(message);
      let fullResponse = '';

      for await (const chunk of responseStream) {
        fullResponse += chunk;
        mainWindow?.webContents.send('chat:stream', { chunk, done: false });
      }

      mainWindow?.webContents.send('chat:stream', { chunk: '', done: true });

      return { success: true, response: fullResponse };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return { success: false, error: errorMessage };
    }
  });

  // Clear chat history
  ipcMain.handle('chat:clear', async () => {
    ragPipeline.clearHistory();
    return { success: true };
  });
}

// App lifecycle
app.whenReady().then(async () => {
  await initializeServices();
  setupIpcHandlers();
  await createWindow();

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

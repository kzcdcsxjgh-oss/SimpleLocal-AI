import React, { useState, useEffect, useRef, useCallback } from 'react';
import DocumentList from './components/DocumentList';
import ChatArea from './components/ChatArea';

interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  chunkCount?: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [isOllamaOnline, setIsOllamaOnline] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);

  // Check Ollama status and load documents on mount
  useEffect(() => {
    const initialize = async () => {
      // Check Ollama status
      const status = await window.electronAPI.checkOllama();
      setIsOllamaOnline(status.available);

      // Load existing documents
      const docs = await window.electronAPI.listDocuments();
      setDocuments(docs);
    };

    initialize();

    // Set up event listeners
    const unsubscribeProcessing = window.electronAPI.onDocumentProcessing((data) => {
      if (data.status === 'started') {
        setProcessingFile(data.filePath);
      } else if (data.status === 'completed' || data.status === 'error') {
        setProcessingFile(null);
        // Refresh document list
        window.electronAPI.listDocuments().then(setDocuments);
      }
    });

    return () => {
      unsubscribeProcessing();
    };
  }, []);

  // Handle adding documents
  const handleAddDocument = useCallback(async () => {
    const result = await window.electronAPI.openFileDialog();

    if (!result.canceled && result.filePaths.length > 0) {
      setIsProcessing(true);

      for (const filePath of result.filePaths) {
        await window.electronAPI.processDocument(filePath);
      }

      setIsProcessing(false);

      // Refresh document list
      const docs = await window.electronAPI.listDocuments();
      setDocuments(docs);
    }
  }, []);

  // Handle removing documents
  const handleRemoveDocument = useCallback(async (documentId: string) => {
    await window.electronAPI.removeDocument(documentId);
    const docs = await window.electronAPI.listDocuments();
    setDocuments(docs);
  }, []);

  // Handle sending messages
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Add user message
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Create placeholder for assistant response
    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Set up streaming listener
    const unsubscribe = window.electronAPI.onChatStream((data) => {
      if (data.chunk) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: msg.content + data.chunk }
              : msg
          )
        );
      }
      if (data.done) {
        setIsLoading(false);
      }
    });

    // Send message
    try {
      await window.electronAPI.sendMessage(content);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessage.id
            ? { ...msg, content: 'Sorry, something went wrong. Please try again.' }
            : msg
        )
      );
    } finally {
      setIsLoading(false);
      unsubscribe();
    }
  }, [isLoading]);

  // Handle clearing chat
  const handleClearChat = useCallback(async () => {
    await window.electronAPI.clearChat();
    setMessages([]);
  }, []);

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="header__title">SimpleLocal AI</h1>
          <p className="header__subtitle">Your private document assistant</p>
        </div>
        <div className={`status ${isOllamaOnline ? 'status--online' : 'status--offline'}`}>
          <span className="status__dot"></span>
          {isOllamaOnline ? 'AI Ready' : 'AI Offline'}
        </div>
      </header>

      {/* Ollama warning */}
      {!isOllamaOnline && (
        <div className="alert alert--warning">
          <strong>AI is not available.</strong> Please make sure Ollama is running on your computer.
          Visit <strong>ollama.ai</strong> to download and install it.
        </div>
      )}

      {/* Main content */}
      <main className="main">
        {/* Sidebar with documents */}
        <aside className="sidebar">
          <h2 className="sidebar__title">Your Documents</h2>

          <button
            className="add-document-btn"
            onClick={handleAddDocument}
            disabled={isProcessing}
          >
            <span className="add-document-btn__icon">+</span>
            Add Document
          </button>

          {processingFile && (
            <div className="processing">
              <div className="processing__spinner"></div>
              Processing document...
            </div>
          )}

          <DocumentList
            documents={documents}
            onRemove={handleRemoveDocument}
          />
        </aside>

        {/* Chat area */}
        <ChatArea
          messages={messages}
          onSendMessage={handleSendMessage}
          onClearChat={handleClearChat}
          isLoading={isLoading}
          isDisabled={!isOllamaOnline}
          hasDocuments={documents.length > 0}
        />
      </main>
    </div>
  );
};

export default App;

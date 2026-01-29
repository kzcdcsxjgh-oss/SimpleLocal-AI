import React, { useState, useEffect, useCallback } from 'react';
import DocumentList from './components/DocumentList';
import ChatArea from './components/ChatArea';
import SetupScreen from './components/SetupScreen';

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

interface AIStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
}

const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [aiStatus, setAIStatus] = useState<AIStatus>({
    ready: false,
    loading: true,
    progress: 0,
  });
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);

  // Initialize and check AI status on mount
  useEffect(() => {
    const initialize = async () => {
      // Check AI status
      const status = await window.electronAPI.checkAI();
      setAIStatus(status);

      // Load existing documents
      const docs = await window.electronAPI.listDocuments();
      setDocuments(docs);
    };

    initialize();

    // Set up event listeners
    const unsubscribeAI = window.electronAPI.onAIStatus((status) => {
      setAIStatus(status);
    });

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
      unsubscribeAI();
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
      if (data.chunk && !data.done) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: msg.content + data.chunk }
              : msg
          )
        );
      }
      if (data.done) {
        // Set the final response
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessage.id
              ? { ...msg, content: data.chunk || msg.content }
              : msg
          )
        );
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
      setIsLoading(false);
    } finally {
      unsubscribe();
    }
  }, [isLoading]);

  // Handle clearing chat
  const handleClearChat = useCallback(async () => {
    await window.electronAPI.clearChat();
    setMessages([]);
  }, []);

  // Show setup screen while AI is loading for the first time
  if (aiStatus.loading && !aiStatus.ready) {
    return <SetupScreen progress={aiStatus.progress} error={aiStatus.error} />;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="header__title">SimpleLocal AI</h1>
          <p className="header__subtitle">Your private document assistant</p>
        </div>
        <div className={`status ${aiStatus.ready ? 'status--online' : 'status--offline'}`}>
          <span className="status__dot"></span>
          {aiStatus.ready ? 'AI Ready' : aiStatus.loading ? 'Loading...' : 'AI Offline'}
        </div>
      </header>

      {/* Error message if AI failed to load */}
      {aiStatus.error && (
        <div className="alert alert--error">
          <strong>Something went wrong:</strong> {aiStatus.error}
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
            disabled={isProcessing || !aiStatus.ready}
          >
            <span className="add-document-btn__icon">+</span>
            Add Document
          </button>

          {processingFile && (
            <div className="processing">
              <div className="processing__spinner"></div>
              Reading your document...
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
          isDisabled={!aiStatus.ready}
          hasDocuments={documents.length > 0}
        />
      </main>
    </div>
  );
};

export default App;

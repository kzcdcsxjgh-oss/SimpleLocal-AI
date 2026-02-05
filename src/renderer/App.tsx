import React, { useState, useEffect, useCallback } from 'react';
import DocumentList from './components/DocumentList';
import ChatArea from './components/ChatArea';
import ChatList from './components/ChatList';
import SetupScreen from './components/SetupScreen';
import Settings from './components/Settings';

interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

interface Source {
  chunkId: string;
  documentId: string;
  documentName: string;
  content: string;
  score: number;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources?: Source[];
}

interface Conversation {
  id: string;
  title: string;
  documentIds: string[];
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface AIStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
  provider?: string;
}

const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<string[]>([]);
  const [aiStatus, setAIStatus] = useState<AIStatus>({
    ready: false,
    loading: true,
    progress: 0,
  });
  const [isProcessing, setIsProcessing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [processingFile, setProcessingFile] = useState<string | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Initialize on mount
  useEffect(() => {
    const initialize = async () => {
      const status = await window.electronAPI.checkAI();
      setAIStatus(status);

      const docs = await window.electronAPI.listDocuments();
      setDocuments(docs);

      const convs = await window.electronAPI.getChatSessions();
      setConversations(convs);

      if (convs.length > 0) {
        const conv = await window.electronAPI.getConversation(convs[0].id);
        if (conv) {
          setCurrentConversationId(conv.id);
          setMessages(conv.messages || []);
          setSelectedDocumentIds(conv.documentIds || []);
        }
      }
    };

    initialize();

    const unsubscribeAI = window.electronAPI.onAIStatus(setAIStatus);
    const unsubscribeProcessing = window.electronAPI.onDocumentProcessing((data) => {
      if (data.status === 'started') {
        setProcessingFile(data.filePath);
      } else {
        setProcessingFile(null);
        window.electronAPI.listDocuments().then(setDocuments);
      }
    });

    return () => {
      unsubscribeAI();
      unsubscribeProcessing();
    };
  }, []);

  // Create new conversation
  const handleNewChat = useCallback(async () => {
    const conv = await window.electronAPI.createConversation(selectedDocumentIds);
    setConversations((prev) => [conv, ...prev]);
    setCurrentConversationId(conv.id);
    setMessages([]);
  }, [selectedDocumentIds]);

  // Select conversation
  const handleSelectSession = useCallback(async (conversationId: string) => {
    const conv = await window.electronAPI.getConversation(conversationId);
    if (conv) {
      setCurrentConversationId(conv.id);
      setMessages(conv.messages || []);
      setSelectedDocumentIds(conv.documentIds || []);
    }
  }, []);

  // Delete conversation
  const handleDeleteSession = useCallback(async (conversationId: string) => {
    await window.electronAPI.deleteChatSession(conversationId);
    setConversations((prev) => prev.filter((c) => c.id !== conversationId));

    if (conversationId === currentConversationId) {
      const remaining = conversations.filter((c) => c.id !== conversationId);
      if (remaining.length > 0) {
        handleSelectSession(remaining[0].id);
      } else {
        setCurrentConversationId(null);
        setMessages([]);
        setSelectedDocumentIds([]);
      }
    }
  }, [currentConversationId, conversations, handleSelectSession]);

  // Toggle document selection for current conversation
  const handleToggleDocument = useCallback(async (documentId: string) => {
    const newSelection = selectedDocumentIds.includes(documentId)
      ? selectedDocumentIds.filter((id) => id !== documentId)
      : [...selectedDocumentIds, documentId];

    setSelectedDocumentIds(newSelection);

    // Update conversation if one exists
    if (currentConversationId) {
      await window.electronAPI.updateConversation(currentConversationId, {
        documentIds: newSelection,
      });
    }
  }, [selectedDocumentIds, currentConversationId]);

  // Add document
  const handleAddDocument = useCallback(async () => {
    const result = await window.electronAPI.openFileDialog();

    if (!result.canceled && result.filePaths.length > 0) {
      setIsProcessing(true);

      for (const filePath of result.filePaths) {
        await window.electronAPI.processDocument(filePath);
      }

      setIsProcessing(false);
      const docs = await window.electronAPI.listDocuments();
      setDocuments(docs);
    }
  }, []);

  // Remove document
  const handleRemoveDocument = useCallback(async (documentId: string) => {
    await window.electronAPI.removeDocument(documentId);
    const docs = await window.electronAPI.listDocuments();
    setDocuments(docs);

    // Remove from selection if selected
    if (selectedDocumentIds.includes(documentId)) {
      const newSelection = selectedDocumentIds.filter((id) => id !== documentId);
      setSelectedDocumentIds(newSelection);
      if (currentConversationId) {
        await window.electronAPI.updateConversation(currentConversationId, {
          documentIds: newSelection,
        });
      }
    }
  }, [selectedDocumentIds, currentConversationId]);

  // Send message
  const handleSendMessage = useCallback(async (content: string) => {
    if (!content.trim() || isLoading) return;

    // Create conversation if needed
    let conversationId = currentConversationId;
    if (!conversationId) {
      const conv = await window.electronAPI.createConversation(selectedDocumentIds);
      setConversations((prev) => [conv, ...prev]);
      setCurrentConversationId(conv.id);
      conversationId = conv.id;
    }

    // Add user message locally
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: content.trim(),
    };
    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Add placeholder for assistant
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
    };
    setMessages((prev) => [...prev, assistantMessage]);

    // Set up streaming listener
    const unsubscribe = window.electronAPI.onChatStream((data) => {
      if (data.error) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: `Fout: ${data.error}` }
              : msg
          )
        );
        setIsLoading(false);
        return;
      }

      if (!data.done && data.chunk) {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, content: msg.content + data.chunk }
              : msg
          )
        );
      }

      if (data.done) {
        // Update with sources
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { ...msg, sources: data.sources }
              : msg
          )
        );
        setIsLoading(false);

        // Refresh conversation list to show updated title
        window.electronAPI.getChatSessions().then(setConversations);
      }
    });

    try {
      await window.electronAPI.sendMessage(conversationId, content);
    } catch (error) {
      console.error('Error sending message:', error);
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, content: 'Sorry, er ging iets mis. Probeer het opnieuw.' }
            : msg
        )
      );
      setIsLoading(false);
    } finally {
      unsubscribe();
    }
  }, [isLoading, currentConversationId, selectedDocumentIds]);

  // Clear chat
  const handleClearChat = useCallback(async () => {
    setMessages([]);
  }, []);

  // Show setup screen while loading
  if (aiStatus.loading && !aiStatus.ready) {
    return <SetupScreen progress={aiStatus.progress} error={aiStatus.error} />;
  }

  return (
    <div className="app">
      {/* Header */}
      <header className="header">
        <div>
          <h1 className="header__title">SimpleLocal AI</h1>
          <p className="header__subtitle">Uw privé document-assistent</p>
        </div>
        <div className="header__actions">
          <div className={`status ${aiStatus.ready ? 'status--online' : 'status--offline'}`}>
            <span className="status__dot"></span>
            {aiStatus.ready ? (aiStatus.provider || 'AI') : 'Offline'}
          </div>
          <button
            className="settings-btn"
            onClick={() => setIsSettingsOpen(true)}
            title="Instellingen"
          >
            ⚙
          </button>
        </div>
      </header>

      {/* Error message */}
      {aiStatus.error && (
        <div className="alert alert--error">
          <strong>Let op:</strong> {aiStatus.error}
        </div>
      )}

      {/* Main content */}
      <main className="main">
        {/* Left sidebar - Conversations */}
        <aside className="sidebar sidebar--chats">
          <h2 className="sidebar__title">Gesprekken</h2>
          <ChatList
            sessions={conversations}
            currentSessionId={currentConversationId}
            onSelectSession={handleSelectSession}
            onNewChat={handleNewChat}
            onDeleteSession={handleDeleteSession}
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

        {/* Right sidebar - Documents */}
        <aside className="sidebar sidebar--documents">
          <h2 className="sidebar__title">Documenten</h2>

          <button
            className="add-document-btn"
            onClick={handleAddDocument}
            disabled={isProcessing || !aiStatus.ready}
          >
            <span className="add-document-btn__icon">+</span>
            Document Toevoegen
          </button>

          {processingFile && (
            <div className="processing">
              <div className="processing__spinner"></div>
              Document wordt verwerkt...
            </div>
          )}

          {documents.length > 0 && (
            <p className="sidebar__hint">
              Selecteer documenten voor dit gesprek:
            </p>
          )}

          <DocumentList
            documents={documents}
            selectedIds={selectedDocumentIds}
            onToggle={handleToggleDocument}
            onRemove={handleRemoveDocument}
          />
        </aside>
      </main>

      {/* Settings modal */}
      <Settings isOpen={isSettingsOpen} onClose={() => setIsSettingsOpen(false)} />
    </div>
  );
};

export default App;

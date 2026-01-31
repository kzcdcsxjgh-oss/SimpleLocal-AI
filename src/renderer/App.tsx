import React, { useState, useEffect, useCallback } from 'react';
import DocumentList from './components/DocumentList';
import ChatArea from './components/ChatArea';
import ChatList from './components/ChatList';
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

interface ChatSession {
  id: string;
  title: string;
  messages: Message[];
  createdAt: string;
  updatedAt: string;
}

interface AIStatus {
  ready: boolean;
  loading: boolean;
  progress: number;
  error?: string;
}

const App: React.FC = () => {
  const [documents, setDocuments] = useState<Document[]>([]);
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
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

      // Load chat sessions
      const chatSessions = await window.electronAPI.getChatSessions();
      setSessions(chatSessions);

      // If there are sessions, select the most recent one
      if (chatSessions.length > 0) {
        setCurrentSessionId(chatSessions[0].id);
        setMessages(chatSessions[0].messages);
      }
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

  // Save messages to current session when they change
  useEffect(() => {
    if (currentSessionId && messages.length > 0) {
      window.electronAPI.updateChatSession(currentSessionId, messages).then((updatedSession) => {
        if (updatedSession) {
          setSessions((prev) =>
            prev.map((s) => (s.id === updatedSession.id ? updatedSession : s))
          );
        }
      });
    }
  }, [messages, currentSessionId]);

  // Handle creating a new chat session
  const handleNewChat = useCallback(async () => {
    const newSession = await window.electronAPI.createChatSession();
    setSessions((prev) => [newSession, ...prev]);
    setCurrentSessionId(newSession.id);
    setMessages([]);
  }, []);

  // Handle selecting a chat session
  const handleSelectSession = useCallback(async (sessionId: string) => {
    const session = await window.electronAPI.getChatSession(sessionId);
    if (session) {
      setCurrentSessionId(session.id);
      setMessages(session.messages);
    }
  }, []);

  // Handle deleting a chat session
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await window.electronAPI.deleteChatSession(sessionId);
    setSessions((prev) => prev.filter((s) => s.id !== sessionId));

    // If we deleted the current session, switch to another or clear
    if (sessionId === currentSessionId) {
      const remaining = sessions.filter((s) => s.id !== sessionId);
      if (remaining.length > 0) {
        setCurrentSessionId(remaining[0].id);
        setMessages(remaining[0].messages);
      } else {
        setCurrentSessionId(null);
        setMessages([]);
      }
    }
  }, [currentSessionId, sessions]);

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

    // Create a new session if none exists
    let sessionId = currentSessionId;
    if (!sessionId) {
      const newSession = await window.electronAPI.createChatSession();
      setSessions((prev) => [newSession, ...prev]);
      setCurrentSessionId(newSession.id);
      sessionId = newSession.id;
    }

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
            ? { ...msg, content: 'Sorry, er ging iets mis. Probeer het opnieuw.' }
            : msg
        )
      );
      setIsLoading(false);
    } finally {
      unsubscribe();
    }
  }, [isLoading, currentSessionId]);

  // Handle clearing chat
  const handleClearChat = useCallback(async () => {
    await window.electronAPI.clearChat();
    setMessages([]);
    if (currentSessionId) {
      await window.electronAPI.updateChatSession(currentSessionId, []);
      setSessions((prev) =>
        prev.map((s) =>
          s.id === currentSessionId
            ? { ...s, messages: [], title: 'Nieuw gesprek', updatedAt: new Date().toISOString() }
            : s
        )
      );
    }
  }, [currentSessionId]);

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
          <p className="header__subtitle">Uw privé document-assistent</p>
        </div>
        <div className={`status ${aiStatus.ready ? 'status--online' : 'status--offline'}`}>
          <span className="status__dot"></span>
          {aiStatus.ready ? 'AI Gereed' : aiStatus.loading ? 'Laden...' : 'AI Offline'}
        </div>
      </header>

      {/* Error message if AI failed to load */}
      {aiStatus.error && (
        <div className="alert alert--error">
          <strong>Er ging iets mis:</strong> {aiStatus.error}
        </div>
      )}

      {/* Main content */}
      <main className="main">
        {/* Left sidebar with chats */}
        <aside className="sidebar sidebar--chats">
          <h2 className="sidebar__title">Gesprekken</h2>
          <ChatList
            sessions={sessions}
            currentSessionId={currentSessionId}
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

        {/* Right sidebar with documents */}
        <aside className="sidebar sidebar--documents">
          <h2 className="sidebar__title">Uw Documenten</h2>

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
              Document wordt gelezen...
            </div>
          )}

          <DocumentList
            documents={documents}
            onRemove={handleRemoveDocument}
          />
        </aside>
      </main>
    </div>
  );
};

export default App;

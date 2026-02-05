import React, { useState, useRef, useEffect } from 'react';

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

interface ChatAreaProps {
  messages: Message[];
  onSendMessage: (content: string) => void;
  onClearChat: () => void;
  isLoading: boolean;
  isDisabled: boolean;
  hasDocuments: boolean;
}

const ChatArea: React.FC<ChatAreaProps> = ({
  messages,
  onSendMessage,
  onClearChat,
  isLoading,
  isDisabled,
  hasDocuments,
}) => {
  const [input, setInput] = useState('');
  const [expandedSources, setExpandedSources] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Auto-resize textarea
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading && !isDisabled) {
      onSendMessage(input);
      setInput('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const toggleSources = (messageId: string) => {
    setExpandedSources(expandedSources === messageId ? null : messageId);
  };

  return (
    <section className="chat">
      {/* Messages area */}
      <div className="chat__messages">
        {messages.length === 0 ? (
          <div className="chat__messages--empty">
            <div className="chat__welcome-icon">💬</div>
            <h2 className="chat__welcome-title">
              {hasDocuments ? 'Stel een vraag over uw documenten!' : 'Welkom bij SimpleLocal AI'}
            </h2>
            <p className="chat__welcome-text">
              {hasDocuments
                ? 'Ik heb uw documenten gelezen en ben klaar om te helpen. Stel gerust een vraag!'
                : 'Voeg eerst documenten toe met de knop rechts, dan kunt u vragen stellen. Alles blijft privé op uw computer.'}
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <div
                key={message.id}
                className={`message message--${message.role}`}
              >
                <div className="message__avatar">
                  {message.role === 'user' ? '👤' : '🤖'}
                </div>
                <div className="message__content">
                  {message.content || (
                    <div className="loading">
                      <div className="loading__dots">
                        <span className="loading__dot"></span>
                        <span className="loading__dot"></span>
                        <span className="loading__dot"></span>
                      </div>
                    </div>
                  )}

                  {/* Sources section */}
                  {message.role === 'assistant' && message.sources && message.sources.length > 0 && (
                    <div className="message__sources">
                      <button
                        className="message__sources-toggle"
                        onClick={() => toggleSources(message.id)}
                      >
                        📚 {message.sources.length} bron{message.sources.length > 1 ? 'nen' : ''} gebruikt
                        <span className={`message__sources-arrow ${expandedSources === message.id ? 'expanded' : ''}`}>
                          ▼
                        </span>
                      </button>

                      {expandedSources === message.id && (
                        <div className="message__sources-list">
                          {message.sources.map((source, index) => (
                            <div key={source.chunkId} className="message__source">
                              <div className="message__source-header">
                                <span className="message__source-number">{index + 1}</span>
                                <span className="message__source-name">{source.documentName}</span>
                              </div>
                              <div className="message__source-content">
                                {source.content.length > 200
                                  ? source.content.slice(0, 200) + '...'
                                  : source.content}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div ref={messagesEndRef} />
          </>
        )}
      </div>

      {/* Input area */}
      <form className="chat__input-area" onSubmit={handleSubmit}>
        <textarea
          ref={textareaRef}
          className="chat__input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            isDisabled
              ? 'Wachten op AI...'
              : hasDocuments
              ? 'Stel een vraag over uw documenten...'
              : 'Voeg eerst documenten toe...'
          }
          disabled={isDisabled}
          rows={1}
        />
        <button
          type="submit"
          className="chat__send-btn"
          disabled={isDisabled || isLoading || !input.trim()}
        >
          {isLoading ? 'Denken...' : 'Verstuur'}
        </button>
      </form>
    </section>
  );
};

export default ChatArea;

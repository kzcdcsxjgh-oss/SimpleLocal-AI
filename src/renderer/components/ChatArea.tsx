import React, { useState, useRef, useEffect } from 'react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
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
    // Submit on Enter (without Shift)
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <section className="chat">
      {/* Messages area */}
      <div className="chat__messages">
        {messages.length === 0 ? (
          <div className="chat__messages--empty">
            <div className="chat__welcome-icon">💬</div>
            <h2 className="chat__welcome-title">
              {hasDocuments ? 'Ask me about your documents!' : 'Welcome to SimpleLocal AI'}
            </h2>
            <p className="chat__welcome-text">
              {hasDocuments
                ? "I've read your documents and I'm ready to help. Ask me anything about them!"
                : 'Add some documents using the button on the left, then ask me questions about them. Everything stays private on your computer.'}
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
              ? 'Waiting for AI to initialize...'
              : hasDocuments
              ? 'Ask me about your documents...'
              : 'Add documents first, then ask questions...'
          }
          disabled={isDisabled}
          rows={1}
        />
        <button
          type="submit"
          className="chat__send-btn"
          disabled={isDisabled || isLoading || !input.trim()}
        >
          {isLoading ? 'Thinking...' : 'Send'}
        </button>
      </form>
    </section>
  );
};

export default ChatArea;

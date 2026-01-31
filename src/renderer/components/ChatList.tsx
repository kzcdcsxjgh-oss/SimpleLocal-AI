import React from 'react';

interface ChatSession {
  id: string;
  title: string;
  messages: { id: string; role: 'user' | 'assistant'; content: string }[];
  createdAt: string;
  updatedAt: string;
}

interface ChatListProps {
  sessions: ChatSession[];
  currentSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onNewChat: () => void;
  onDeleteSession: (sessionId: string) => void;
}

const ChatList: React.FC<ChatListProps> = ({
  sessions,
  currentSessionId,
  onSelectSession,
  onNewChat,
  onDeleteSession,
}) => {
  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diffDays = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return 'Vandaag';
    } else if (diffDays === 1) {
      return 'Gisteren';
    } else if (diffDays < 7) {
      return `${diffDays} dagen geleden`;
    } else {
      return date.toLocaleDateString('nl-NL', {
        day: 'numeric',
        month: 'short',
      });
    }
  };

  return (
    <div className="chat-list">
      <button className="new-chat-btn" onClick={onNewChat}>
        <span className="new-chat-btn__icon">+</span>
        Nieuw gesprek
      </button>

      <div className="chat-list__sessions">
        {sessions.length === 0 ? (
          <div className="chat-list__empty">
            <p>Nog geen gesprekken</p>
            <p style={{ fontSize: '14px', marginTop: '8px' }}>
              Start een nieuw gesprek hierboven
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <div
              key={session.id}
              className={`chat-list__item ${
                session.id === currentSessionId ? 'chat-list__item--active' : ''
              }`}
              onClick={() => onSelectSession(session.id)}
            >
              <div className="chat-list__item-icon">💬</div>
              <div className="chat-list__item-info">
                <div className="chat-list__item-title" title={session.title}>
                  {session.title}
                </div>
                <div className="chat-list__item-meta">
                  {formatDate(session.updatedAt)}
                  {session.messages.length > 0 && ` · ${session.messages.length} berichten`}
                </div>
              </div>
              <button
                className="chat-list__item-delete"
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteSession(session.id);
                }}
                title="Gesprek verwijderen"
                aria-label={`Verwijder ${session.title}`}
              >
                ✕
              </button>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default ChatList;

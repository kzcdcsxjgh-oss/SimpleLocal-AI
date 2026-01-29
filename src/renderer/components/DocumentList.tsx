import React from 'react';

interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
  chunkCount?: number;
}

interface DocumentListProps {
  documents: Document[];
  onRemove: (documentId: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({ documents, onRemove }) => {
  if (documents.length === 0) {
    return (
      <div className="document-list document-list--empty">
        <div className="document-list__empty-icon">📄</div>
        <p>No documents yet</p>
        <p style={{ fontSize: '14px', marginTop: '8px' }}>
          Click "Add Document" to get started
        </p>
      </div>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getFileIcon = (fileName: string): string => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return '📕';
      case 'docx':
      case 'doc':
        return '📘';
      case 'txt':
        return '📝';
      case 'md':
        return '📋';
      default:
        return '📄';
    }
  };

  return (
    <div className="document-list">
      {documents.map((doc) => (
        <div key={doc.id} className="document-item">
          <span className="document-item__icon">{getFileIcon(doc.name)}</span>
          <div className="document-item__info">
            <div className="document-item__name" title={doc.name}>
              {doc.name}
            </div>
            <div className="document-item__meta">
              Added {formatDate(doc.addedAt)}
            </div>
          </div>
          <button
            className="document-item__remove"
            onClick={() => onRemove(doc.id)}
            title="Remove document"
            aria-label={`Remove ${doc.name}`}
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
};

export default DocumentList;

import React from 'react';

interface Document {
  id: string;
  name: string;
  path: string;
  addedAt: string;
}

interface DocumentListProps {
  documents: Document[];
  selectedIds?: string[];
  onToggle?: (documentId: string) => void;
  onRemove: (documentId: string) => void;
}

const DocumentList: React.FC<DocumentListProps> = ({
  documents,
  selectedIds = [],
  onToggle,
  onRemove,
}) => {
  if (documents.length === 0) {
    return (
      <div className="document-list document-list--empty">
        <div className="document-list__empty-icon">📄</div>
        <p>Nog geen documenten</p>
        <p style={{ fontSize: '14px', marginTop: '8px' }}>
          Klik op "Document Toevoegen" om te beginnen
        </p>
      </div>
    );
  }

  const formatDate = (dateString: string): string => {
    const date = new Date(dateString);
    return date.toLocaleDateString('nl-NL', {
      day: 'numeric',
      month: 'short',
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
      {documents.map((doc) => {
        const isSelected = selectedIds.includes(doc.id);
        return (
          <div
            key={doc.id}
            className={`document-item ${isSelected ? 'document-item--selected' : ''}`}
            onClick={() => onToggle?.(doc.id)}
            style={{ cursor: onToggle ? 'pointer' : 'default' }}
          >
            {onToggle && (
              <input
                type="checkbox"
                className="document-item__checkbox"
                checked={isSelected}
                onChange={() => onToggle(doc.id)}
                onClick={(e) => e.stopPropagation()}
              />
            )}
            <span className="document-item__icon">{getFileIcon(doc.name)}</span>
            <div className="document-item__info">
              <div className="document-item__name" title={doc.name}>
                {doc.name}
              </div>
              <div className="document-item__meta">
                {formatDate(doc.addedAt)}
              </div>
            </div>
            <button
              className="document-item__remove"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(doc.id);
              }}
              title="Verwijder document"
              aria-label={`Verwijder ${doc.name}`}
            >
              ✕
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default DocumentList;

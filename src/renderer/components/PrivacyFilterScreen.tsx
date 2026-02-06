import React, { useState, useCallback } from 'react';

type PrivacyDataType =
  | 'bsn' | 'date' | 'name' | 'iban'
  | 'email' | 'phone' | 'postcode' | 'address';

interface PrivacyMatch {
  placeholder: string;
  original: string;
  type: PrivacyDataType;
  startOffset: number;
  endOffset: number;
}

interface PrivacyStats {
  counts: Record<PrivacyDataType, number>;
  total: number;
}

interface FilteredDocument {
  fileName: string;
  originalText: string;
  filteredText: string;
  matches: PrivacyMatch[];
  stats: PrivacyStats;
}

const TYPE_LABELS: Record<PrivacyDataType, string> = {
  bsn: 'BSN-nummers',
  date: 'Datums',
  name: 'Namen',
  iban: 'IBAN-nummers',
  email: 'E-mailadressen',
  phone: 'Telefoonnummers',
  postcode: 'Postcodes',
  address: 'Adressen',
};

const TYPE_ICONS: Record<PrivacyDataType, string> = {
  bsn: '#',
  date: 'D',
  name: 'N',
  iban: 'B',
  email: '@',
  phone: 'T',
  postcode: 'P',
  address: 'A',
};

const PrivacyFilterScreen: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [results, setResults] = useState<FilteredDocument[]>([]);
  const [selectedResult, setSelectedResult] = useState<number | null>(null);
  const [viewMode, setViewMode] = useState<'filtered' | 'comparison'>('filtered');
  const [error, setError] = useState<string | null>(null);
  const [exportSuccess, setExportSuccess] = useState<string | null>(null);

  const handleSelectFiles = useCallback(async () => {
    setError(null);
    setExportSuccess(null);

    const result = await window.electronAPI.privacyOpenFile();
    if (result.canceled || result.filePaths.length === 0) return;

    setIsProcessing(true);
    setProcessStatus('Bestanden worden verwerkt...');

    const newResults: FilteredDocument[] = [];

    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      setProcessStatus(`Verwerken: ${fileName}...`);

      const filterResult = await window.electronAPI.privacyFilter(filePath);

      if (filterResult.success && filterResult.filteredText) {
        newResults.push({
          fileName: filterResult.fileName || fileName,
          originalText: filterResult.originalText || '',
          filteredText: filterResult.filteredText,
          matches: filterResult.matches || [],
          stats: filterResult.stats || { counts: {} as Record<PrivacyDataType, number>, total: 0 },
        });
      } else {
        setError(`Fout bij ${fileName}: ${filterResult.error}`);
      }
    }

    setResults(prev => [...prev, ...newResults]);
    if (newResults.length > 0 && selectedResult === null) {
      setSelectedResult(results.length); // Select first new result
    }

    setIsProcessing(false);
    setProcessStatus('');
  }, [results.length, selectedResult]);

  const handleExport = useCallback(async (index: number) => {
    const doc = results[index];
    if (!doc) return;

    setExportSuccess(null);
    const result = await window.electronAPI.privacyExport(doc.filteredText, doc.fileName);

    if (result.success && result.filePath) {
      setExportSuccess(`Opgeslagen: ${result.filePath}`);
    } else if (!result.canceled && result.error) {
      setError(`Export fout: ${result.error}`);
    }
  }, [results]);

  const handleExportAll = useCallback(async () => {
    for (let i = 0; i < results.length; i++) {
      await handleExport(i);
    }
  }, [results, handleExport]);

  const handleRemoveResult = useCallback((index: number) => {
    setResults(prev => prev.filter((_, i) => i !== index));
    if (selectedResult === index) {
      setSelectedResult(null);
    } else if (selectedResult !== null && selectedResult > index) {
      setSelectedResult(selectedResult - 1);
    }
  }, [selectedResult]);

  const handleClearAll = useCallback(() => {
    setResults([]);
    setSelectedResult(null);
    setError(null);
    setExportSuccess(null);
  }, []);

  const currentDoc = selectedResult !== null ? results[selectedResult] : null;

  return (
    <div className="privacy-screen">
      {/* Left panel: file list + upload */}
      <aside className="privacy-sidebar">
        <div className="privacy-sidebar__header">
          <h2 className="privacy-sidebar__title">Documenten</h2>
          {results.length > 0 && (
            <button
              className="privacy-clear-btn"
              onClick={handleClearAll}
              title="Alles wissen"
            >
              Wis alles
            </button>
          )}
        </div>

        <button
          className="privacy-upload-btn"
          onClick={handleSelectFiles}
          disabled={isProcessing}
        >
          <span className="privacy-upload-btn__icon">+</span>
          {isProcessing ? processStatus : 'Document Uploaden'}
        </button>

        {isProcessing && (
          <div className="privacy-processing">
            <div className="processing__spinner"></div>
            {processStatus}
          </div>
        )}

        <div className="privacy-file-list">
          {results.map((doc, index) => (
            <div
              key={index}
              className={`privacy-file-item ${selectedResult === index ? 'privacy-file-item--active' : ''}`}
              onClick={() => setSelectedResult(index)}
            >
              <div className="privacy-file-item__info">
                <div className="privacy-file-item__name">{doc.fileName}</div>
                <div className="privacy-file-item__stats">
                  {doc.stats.total > 0
                    ? `${doc.stats.total} item${doc.stats.total !== 1 ? 's' : ''} gevonden`
                    : 'Geen gevoelige data gevonden'}
                </div>
              </div>
              <div className="privacy-file-item__actions">
                <button
                  className="privacy-file-item__export"
                  onClick={(e) => { e.stopPropagation(); handleExport(index); }}
                  title="Exporteer gefilterd document"
                >
                  Opslaan
                </button>
                <button
                  className="privacy-file-item__remove"
                  onClick={(e) => { e.stopPropagation(); handleRemoveResult(index); }}
                  title="Verwijder"
                >
                  ✕
                </button>
              </div>
            </div>
          ))}

          {results.length === 0 && !isProcessing && (
            <div className="privacy-file-list__empty">
              <div className="privacy-file-list__empty-icon">&#128196;</div>
              <p>Upload een document om gevoelige informatie te detecteren en verwijderen</p>
              <p className="privacy-file-list__formats">PDF, DOCX, TXT, MD</p>
            </div>
          )}
        </div>

        {results.length > 1 && (
          <button
            className="privacy-export-all-btn"
            onClick={handleExportAll}
          >
            Alles Exporteren
          </button>
        )}
      </aside>

      {/* Main content: results */}
      <main className="privacy-main">
        {currentDoc ? (
          <>
            {/* Stats bar */}
            <div className="privacy-stats-bar">
              <h3 className="privacy-stats-bar__title">{currentDoc.fileName}</h3>
              <div className="privacy-stats-bar__badges">
                {(Object.entries(currentDoc.stats.counts) as [PrivacyDataType, number][])
                  .filter(([, count]) => count > 0)
                  .map(([type, count]) => (
                    <span key={type} className={`privacy-badge privacy-badge--${type}`}>
                      <span className="privacy-badge__icon">{TYPE_ICONS[type]}</span>
                      {count} {TYPE_LABELS[type]}
                    </span>
                  ))
                }
                {currentDoc.stats.total === 0 && (
                  <span className="privacy-badge privacy-badge--clean">
                    Geen gevoelige data gevonden
                  </span>
                )}
              </div>
              <div className="privacy-stats-bar__actions">
                <button
                  className={`privacy-view-toggle ${viewMode === 'filtered' ? 'privacy-view-toggle--active' : ''}`}
                  onClick={() => setViewMode('filtered')}
                >
                  Gefilterd
                </button>
                <button
                  className={`privacy-view-toggle ${viewMode === 'comparison' ? 'privacy-view-toggle--active' : ''}`}
                  onClick={() => setViewMode('comparison')}
                >
                  Vergelijking
                </button>
              </div>
            </div>

            {/* Document view */}
            {viewMode === 'filtered' ? (
              <div className="privacy-document-view">
                <pre className="privacy-document-text">{currentDoc.filteredText}</pre>
              </div>
            ) : (
              <div className="privacy-comparison-view">
                <div className="privacy-comparison-panel">
                  <h4 className="privacy-comparison-panel__title">Origineel</h4>
                  <pre className="privacy-document-text privacy-document-text--original">
                    {currentDoc.originalText}
                  </pre>
                </div>
                <div className="privacy-comparison-panel">
                  <h4 className="privacy-comparison-panel__title">Gefilterd</h4>
                  <pre className="privacy-document-text privacy-document-text--filtered">
                    {currentDoc.filteredText}
                  </pre>
                </div>
              </div>
            )}

            {/* Matches detail */}
            {currentDoc.matches.length > 0 && (
              <div className="privacy-matches">
                <h4 className="privacy-matches__title">
                  Gevonden gevoelige informatie ({currentDoc.matches.length})
                </h4>
                <div className="privacy-matches__list">
                  {currentDoc.matches.map((match, i) => (
                    <div key={i} className={`privacy-match-item privacy-match-item--${match.type}`}>
                      <span className="privacy-match-item__type">{TYPE_LABELS[match.type]}</span>
                      <span className="privacy-match-item__original">{match.original}</span>
                      <span className="privacy-match-item__arrow">&#8594;</span>
                      <span className="privacy-match-item__placeholder">{match.placeholder}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="privacy-empty-state">
            <div className="privacy-empty-state__icon">&#128274;</div>
            <h2 className="privacy-empty-state__title">Privacy Filter</h2>
            <p className="privacy-empty-state__text">
              Upload een document en alle gevoelige informatie wordt automatisch gedetecteerd en verwijderd.
            </p>
            <div className="privacy-empty-state__features">
              <div className="privacy-feature">
                <span className="privacy-feature__icon">#</span>
                <span>BSN-nummers</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">N</span>
                <span>Namen</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">D</span>
                <span>Geboortedata</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">B</span>
                <span>IBAN-nummers</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">@</span>
                <span>E-mailadressen</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">T</span>
                <span>Telefoonnummers</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">P</span>
                <span>Postcodes</span>
              </div>
              <div className="privacy-feature">
                <span className="privacy-feature__icon">A</span>
                <span>Adressen</span>
              </div>
            </div>
            <button
              className="privacy-upload-btn privacy-upload-btn--large"
              onClick={handleSelectFiles}
              disabled={isProcessing}
            >
              <span className="privacy-upload-btn__icon">+</span>
              Document Uploaden
            </button>
            <p className="privacy-empty-state__note">
              Alles draait lokaal op uw computer. Er wordt niets naar het internet verstuurd.
            </p>
          </div>
        )}

        {/* Notifications */}
        {error && (
          <div className="privacy-notification privacy-notification--error">
            {error}
            <button onClick={() => setError(null)}>&#10005;</button>
          </div>
        )}
        {exportSuccess && (
          <div className="privacy-notification privacy-notification--success">
            {exportSuccess}
            <button onClick={() => setExportSuccess(null)}>&#10005;</button>
          </div>
        )}
      </main>
    </div>
  );
};

export default PrivacyFilterScreen;

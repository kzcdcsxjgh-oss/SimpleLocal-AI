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

// Bestaand text-document resultaat
interface FilteredDocument {
  kind: 'text';
  fileName: string;
  originalText: string;
  filteredText: string;
  matches: PrivacyMatch[];
  stats: PrivacyStats;
}

// Nieuw Excel-document resultaat
interface FilteredExcelDocument {
  kind: 'excel';
  fileName: string;
  headers: string[];
  rows: string[][];
  filteredRows: string[][];
  cells: ExcelCell[];
  stats: PrivacyStats;
  totalRows: number;
  totalCols: number;
}

interface ExcelCell {
  row: number;
  col: number;
  header: string;
  originalValue: string;
  filteredValue: string;
  matches: PrivacyMatch[];
}

type FilteredResult = FilteredDocument | FilteredExcelDocument;

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

const EXCEL_EXTENSIONS = ['.xlsx', '.xls'];

function isExcelFileName(fileName: string): boolean {
  const lower = fileName.toLowerCase();
  return EXCEL_EXTENSIONS.some(ext => lower.endsWith(ext));
}

const PrivacyFilterScreen: React.FC = () => {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processStatus, setProcessStatus] = useState<string>('');
  const [results, setResults] = useState<FilteredResult[]>([]);
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

    const newResults: FilteredResult[] = [];

    for (const filePath of result.filePaths) {
      const fileName = filePath.split(/[/\\]/).pop() || filePath;
      setProcessStatus(`Verwerken: ${fileName}...`);

      if (isExcelFileName(fileName)) {
        // Excel-bestand: gebruik de Excel-specifieke filter
        const excelResult = await window.electronAPI.privacyFilterExcel(filePath);

        if (excelResult.success && excelResult.headers) {
          newResults.push({
            kind: 'excel',
            fileName: excelResult.fileName || fileName,
            headers: excelResult.headers,
            rows: excelResult.rows || [],
            filteredRows: excelResult.filteredRows || [],
            cells: excelResult.cells || [],
            stats: excelResult.stats || { counts: {} as Record<PrivacyDataType, number>, total: 0 },
            totalRows: excelResult.totalRows || 0,
            totalCols: excelResult.totalCols || 0,
          });
        } else {
          setError(`Fout bij ${fileName}: ${excelResult.error}`);
        }
      } else {
        // Tekst-document: bestaande flow
        const filterResult = await window.electronAPI.privacyFilter(filePath);

        if (filterResult.success && filterResult.filteredText) {
          newResults.push({
            kind: 'text',
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

    if (doc.kind === 'excel') {
      // Excel export: schrijf terug als .xlsx
      const result = await window.electronAPI.privacyExportExcel(
        doc.headers,
        doc.filteredRows,
        doc.fileName,
      );
      if (result.success && result.filePath) {
        setExportSuccess(`Opgeslagen: ${result.filePath}`);
      } else if (!result.canceled && result.error) {
        setError(`Export fout: ${result.error}`);
      }
    } else {
      // Tekst export: bestaande flow
      const result = await window.electronAPI.privacyExport(doc.filteredText, doc.fileName);
      if (result.success && result.filePath) {
        setExportSuccess(`Opgeslagen: ${result.filePath}`);
      } else if (!result.canceled && result.error) {
        setError(`Export fout: ${result.error}`);
      }
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
                <div className="privacy-file-item__name">
                  {doc.kind === 'excel' && <span className="privacy-file-item__badge">XLS</span>}
                  {doc.fileName}
                </div>
                <div className="privacy-file-item__stats">
                  {doc.stats.total > 0
                    ? `${doc.stats.total} item${doc.stats.total !== 1 ? 's' : ''} gevonden`
                    : 'Geen gevoelige data gevonden'}
                  {doc.kind === 'excel' && ` · ${doc.totalRows} rijen`}
                </div>
              </div>
              <div className="privacy-file-item__actions">
                <button
                  className="privacy-file-item__export"
                  onClick={(e) => { e.stopPropagation(); handleExport(index); }}
                  title={doc.kind === 'excel' ? 'Exporteer als Excel' : 'Exporteer gefilterd document'}
                >
                  Opslaan
                </button>
                <button
                  className="privacy-file-item__remove"
                  onClick={(e) => { e.stopPropagation(); handleRemoveResult(index); }}
                  title="Verwijder"
                >
                  &#10005;
                </button>
              </div>
            </div>
          ))}

          {results.length === 0 && !isProcessing && (
            <div className="privacy-file-list__empty">
              <div className="privacy-file-list__empty-icon">&#128196;</div>
              <p>Upload een document om gevoelige informatie te detecteren en verwijderen</p>
              <p className="privacy-file-list__formats">PDF, DOCX, TXT, MD, XLSX, XLS</p>
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

            {/* Content area: text or excel */}
            {currentDoc.kind === 'excel' ? (
              <ExcelResultView
                doc={currentDoc}
                viewMode={viewMode}
              />
            ) : (
              <TextResultView
                doc={currentDoc}
                viewMode={viewMode}
              />
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
            <div className="privacy-empty-state__formats-box">
              <span className="privacy-empty-state__format-tag">PDF</span>
              <span className="privacy-empty-state__format-tag">DOCX</span>
              <span className="privacy-empty-state__format-tag">TXT</span>
              <span className="privacy-empty-state__format-tag">MD</span>
              <span className="privacy-empty-state__format-tag privacy-empty-state__format-tag--new">XLSX</span>
              <span className="privacy-empty-state__format-tag privacy-empty-state__format-tag--new">XLS</span>
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

/** Bestaande tekst-weergave (ongewijzigd) */
const TextResultView: React.FC<{
  doc: FilteredDocument;
  viewMode: 'filtered' | 'comparison';
}> = ({ doc, viewMode }) => (
  <>
    {viewMode === 'filtered' ? (
      <div className="privacy-document-view">
        <pre className="privacy-document-text">{doc.filteredText}</pre>
      </div>
    ) : (
      <div className="privacy-comparison-view">
        <div className="privacy-comparison-panel">
          <h4 className="privacy-comparison-panel__title">Origineel</h4>
          <pre className="privacy-document-text privacy-document-text--original">
            {doc.originalText}
          </pre>
        </div>
        <div className="privacy-comparison-panel">
          <h4 className="privacy-comparison-panel__title">Gefilterd</h4>
          <pre className="privacy-document-text privacy-document-text--filtered">
            {doc.filteredText}
          </pre>
        </div>
      </div>
    )}

    {doc.matches.length > 0 && (
      <div className="privacy-matches">
        <h4 className="privacy-matches__title">
          Gevonden gevoelige informatie ({doc.matches.length})
        </h4>
        <div className="privacy-matches__list">
          {doc.matches.map((match, i) => (
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
);

/** Nieuwe Excel tabel-weergave */
const ExcelResultView: React.FC<{
  doc: FilteredExcelDocument;
  viewMode: 'filtered' | 'comparison';
}> = ({ doc, viewMode }) => {
  // Bepaal welke cellen gewijzigd zijn (voor highlighting)
  const changedCells = new Set(
    doc.cells.map(c => `${c.row}-${c.col}`)
  );

  const showOriginal = viewMode === 'comparison';

  return (
    <>
      {/* Samenvatting boven de tabel */}
      <div className="excel-summary">
        <span className="excel-summary__item">
          {doc.totalRows} rijen
        </span>
        <span className="excel-summary__sep">·</span>
        <span className="excel-summary__item">
          {doc.totalCols} kolommen
        </span>
        <span className="excel-summary__sep">·</span>
        <span className="excel-summary__item excel-summary__item--highlight">
          {doc.cells.length} cel{doc.cells.length !== 1 ? 'len' : ''} geanonimiseerd
        </span>
      </div>

      {/* Tabel */}
      <div className="excel-table-wrapper">
        <table className="excel-table">
          <thead>
            <tr>
              <th className="excel-table__row-num">#</th>
              {doc.headers.map((header, colIdx) => (
                <th key={colIdx} className="excel-table__header">
                  {header || `Kolom ${colIdx + 1}`}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {doc.filteredRows.map((filteredRow, rowIdx) => (
              <tr key={rowIdx}>
                <td className="excel-table__row-num">{rowIdx + 1}</td>
                {filteredRow.map((cellValue, colIdx) => {
                  const isChanged = changedCells.has(`${rowIdx}-${colIdx}`);
                  const originalValue = doc.rows[rowIdx]?.[colIdx] || '';

                  return (
                    <td
                      key={colIdx}
                      className={`excel-table__cell ${isChanged ? 'excel-table__cell--changed' : ''}`}
                    >
                      {showOriginal && isChanged ? (
                        <div className="excel-table__cell-comparison">
                          <span className="excel-table__cell-original">{originalValue}</span>
                          <span className="excel-table__cell-filtered">{cellValue}</span>
                        </div>
                      ) : (
                        cellValue
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Matches detail */}
      {doc.cells.length > 0 && (
        <div className="privacy-matches">
          <h4 className="privacy-matches__title">
            Geanonimiseerde cellen ({doc.cells.length})
          </h4>
          <div className="privacy-matches__list">
            {doc.cells.map((cell, i) => (
              <div key={i} className="privacy-match-item">
                <span className="privacy-match-item__type">
                  Rij {cell.row + 1} · {cell.header}
                </span>
                <span className="privacy-match-item__original">{cell.originalValue}</span>
                <span className="privacy-match-item__arrow">&#8594;</span>
                <span className="privacy-match-item__placeholder">{cell.filteredValue}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
};

export default PrivacyFilterScreen;

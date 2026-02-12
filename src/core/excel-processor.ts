/**
 * Excel Processor
 *
 * Leest Excel-bestanden, anonimiseert celinhoud per kolom/rij
 * met de bestaande PrivacyFilter, en schrijft het resultaat
 * terug naar een nieuw Excel-bestand.
 */

import fs from 'fs';
import path from 'path';
import * as XLSX from 'xlsx';
import type { PrivacyMatch, PrivacyStats, PrivacyDataType } from './privacy/types';
import { ALL_PRIVACY_TYPES } from './privacy/types';
import { PrivacyFilter } from './privacy/privacy-filter';

/**
 * Sanitize error messages to prevent PII leakage
 * Removes BSN numbers, IBAN, emails, phone numbers, and potential names
 */
export function sanitizeErrorMessage(message: string): string {
  let sanitized = message;

  // Remove 9-digit sequences (potential BSN)
  sanitized = sanitized.replace(/\b\d{9}\b/g, '[GETAL]');

  // Remove IBAN patterns
  sanitized = sanitized.replace(/\b[A-Z]{2}\d{2}[A-Z0-9]{4,30}\b/g, '[IBAN]');

  // Remove emails
  sanitized = sanitized.replace(/\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-z]{2,10}\b/gi, '[EMAIL]');

  // Remove phone numbers (Dutch format)
  sanitized = sanitized.replace(/\b0\d[\d\s\-\.]{8,}\b/g, '[TELEFOON]');

  // Remove capitalized words that might be names (2+ consecutive capital words)
  sanitized = sanitized.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, '[NAAM]');

  return sanitized;
}

export interface ExcelCell {
  row: number;
  col: number;
  header: string;
  filteredValue: string;
  matches: PrivacyMatch[];
}

export interface ExcelFilterResult {
  success: boolean;
  fileName?: string;
  headers?: string[];
  filteredRows?: string[][];
  cells?: ExcelCell[];
  stats?: PrivacyStats;
  totalRows?: number;
  totalCols?: number;
  error?: string;
}

export class ExcelProcessor {
  /**
   * Lees een Excel-bestand en anonimiseer alle cellen.
   *
   * Twee-pass aanpak voor betere naamdetectie:
   * 1. Pre-scan: combineer alle celteksten, draai de filter op de volledige tekst
   *    om namen te ontdekken (entity discovery)
   * 2. Per-cel filtering: filter elke cel individueel, met de ontdekte namen
   *    als customNames zodat ze ook in korte cellen herkend worden
   */
  static filterExcel(filePath: string, privacyFilter: PrivacyFilter): ExcelFilterResult {
    try {
      const buffer = fs.readFileSync(filePath);
      const workbook = XLSX.read(buffer, { type: 'buffer' });

      // Pak het eerste werkblad
      const sheetName = workbook.SheetNames[0];
      if (!sheetName) {
        return { success: false, error: 'Geen werkbladen gevonden in het Excel-bestand' };
      }

      const sheet = workbook.Sheets[sheetName];
      if (!sheet) {
        return { success: false, error: 'Werkblad is leeg' };
      }

      // Converteer naar array-of-arrays (inclusief lege cellen)
      const rawData: (string | number | boolean | null)[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: '',
        raw: false,
      });

      if (rawData.length === 0) {
        return { success: false, error: 'Het Excel-bestand bevat geen data' };
      }

      // Eerste rij = headers
      const headers = rawData[0].map(h => String(h ?? ''));
      const dataRows = rawData.slice(1);

      // === Pass 1: Pre-scan voor entity discovery ===
      // Combineer alle celteksten tot één document zodat de naamdetector
      // entity propagation en context-detectie kan toepassen
      const allCellTexts: string[] = [];
      for (const row of dataRows) {
        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const cellValue = String(row[colIdx] ?? '').trim();
          if (cellValue) {
            allCellTexts.push(cellValue);
          }
        }
      }

      const combinedText = allCellTexts.join('\n');
      const preScanResult = privacyFilter.filter(combinedText);

      // Extraheer alle unieke naam-strings die gevonden zijn
      const discoveredNames: string[] = [];
      for (const match of preScanResult.matches) {
        if (match.type === 'name') {
          // Voeg de volledige naam toe
          discoveredNames.push(match.original);
          // Splits ook in componenten (voornaam, achternaam apart)
          const parts = match.original.split(/\s+/);
          for (const part of parts) {
            // Skip tussenvoegsels en te korte woorden
            if (part.length >= 2 && /^[A-ZÀ-ÿ]/.test(part) &&
                !/^(?:van|de|den|der|het|te|ten|ter|in|op|aan|bij|uit|voor|over|onder|tot)$/i.test(part)) {
              discoveredNames.push(part);
            }
          }
        }
      }

      // Verrijk de filter tijdelijk met de ontdekte namen als customNames
      const originalConfig = privacyFilter.getConfig();
      const originalCustomNames = originalConfig.customNames ?? [];
      const enrichedCustomNames = [...new Set([...originalCustomNames, ...discoveredNames])];

      // Update de filter met de verrijkte namenlijst
      privacyFilter.updateConfig({ customNames: enrichedCustomNames });

      // === Pass 2: Per-cel filtering met verrijkte namen ===
      const filteredRows: string[][] = [];
      const allCells: ExcelCell[] = [];
      const globalStats: PrivacyStats = {
        counts: {} as Record<PrivacyDataType, number>,
        total: 0,
      };
      for (const type of ALL_PRIVACY_TYPES) {
        globalStats.counts[type] = 0;
      }

      for (let rowIdx = 0; rowIdx < dataRows.length; rowIdx++) {
        const row = dataRows[rowIdx];
        const filteredRow: string[] = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const cellValue = String(row[colIdx] ?? '');

          if (cellValue.trim() === '') {
            filteredRow.push('');
            continue;
          }

          // Draai de privacy filter op de cel-tekst
          const result = privacyFilter.filter(cellValue);

          filteredRow.push(result.filteredText);

          // Sla alleen cellen op die matches bevatten
          if (result.matches.length > 0) {
            allCells.push({
              row: rowIdx,
              col: colIdx,
              header: headers[colIdx] || `Kolom ${colIdx + 1}`,
              filteredValue: result.filteredText,
              matches: result.matches.map(m => ({
                placeholder: m.placeholder,
                type: m.type,
                // Security: Don't include m.original - use placeholder
                original: '[VERWIJDERD]',
                startOffset: 0,
                endOffset: 0,
              })),
            });

            // Tel statistieken op
            for (const type of ALL_PRIVACY_TYPES) {
              globalStats.counts[type] += result.stats.counts[type] || 0;
            }
            globalStats.total += result.matches.length;
          }
        }

        filteredRows.push(filteredRow);
      }

      // Herstel de originele customNames
      privacyFilter.updateConfig({ customNames: originalCustomNames });

      // Audit logging (metadata only, NO PII)
      console.log('[PRIVACY-AUDIT]', {
        timestamp: new Date().toISOString(),
        fileName: path.basename(filePath),
        operation: 'filter',
        itemsFiltered: globalStats.total,
        filterStats: globalStats,
      });

      return {
        success: true,
        fileName: path.basename(filePath),
        headers,
        filteredRows,
        cells: allCells,
        stats: globalStats,
        totalRows: dataRows.length,
        totalCols: headers.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error
        ? sanitizeErrorMessage(error.message)
        : 'Onbekende fout bij verwerken Excel';
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Schrijf geanonimiseerde data terug naar een Excel-bestand
   */
  static writeFilteredExcel(
    headers: string[],
    filteredRows: string[][],
    outputPath: string,
  ): void {
    // Bouw worksheet data op: headers + rijen
    const wsData = [headers, ...filteredRows];
    const worksheet = XLSX.utils.aoa_to_sheet(wsData);

    // Stel kolombreedtes in op basis van inhoud
    const colWidths = headers.map((h, colIdx) => {
      let maxLen = h.length;
      for (const row of filteredRows) {
        const cellLen = (row[colIdx] || '').length;
        if (cellLen > maxLen) maxLen = cellLen;
      }
      return { wch: Math.min(Math.max(maxLen + 2, 10), 50) };
    });
    worksheet['!cols'] = colWidths;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Geanonimiseerd');

    XLSX.writeFile(workbook, outputPath);
  }

  /**
   * Controleer of een bestandsextensie een Excel-formaat is
   */
  static isExcelFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return ext === '.xlsx' || ext === '.xls';
  }
}

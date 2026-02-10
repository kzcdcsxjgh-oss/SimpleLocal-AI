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

export interface ExcelCell {
  row: number;
  col: number;
  header: string;
  originalValue: string;
  filteredValue: string;
  matches: PrivacyMatch[];
}

export interface ExcelFilterResult {
  success: boolean;
  fileName?: string;
  headers?: string[];
  rows?: string[][];
  filteredRows?: string[][];
  cells?: ExcelCell[];
  stats?: PrivacyStats;
  totalRows?: number;
  totalCols?: number;
  error?: string;
}

export class ExcelProcessor {
  /**
   * Lees een Excel-bestand en anonimiseer alle cellen
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

      const rows: string[][] = [];
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
        const originalRow: string[] = [];
        const filteredRow: string[] = [];

        for (let colIdx = 0; colIdx < headers.length; colIdx++) {
          const cellValue = String(row[colIdx] ?? '');
          originalRow.push(cellValue);

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
              originalValue: cellValue,
              filteredValue: result.filteredText,
              matches: result.matches,
            });

            // Tel statistieken op
            for (const type of ALL_PRIVACY_TYPES) {
              globalStats.counts[type] += result.stats.counts[type] || 0;
            }
            globalStats.total += result.matches.length;
          }
        }

        rows.push(originalRow);
        filteredRows.push(filteredRow);
      }

      return {
        success: true,
        fileName: path.basename(filePath),
        headers,
        rows,
        filteredRows,
        cells: allCells,
        stats: globalStats,
        totalRows: dataRows.length,
        totalCols: headers.length,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Onbekende fout bij verwerken Excel';
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

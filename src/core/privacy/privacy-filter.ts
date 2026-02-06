/**
 * Privacy Filter
 *
 * Detecteert en vervangt persoonsgegevens (PII) in tekst.
 * Draait volledig lokaal — er wordt NIETS naar externe services gestuurd.
 *
 * Ondersteunde types:
 * - BSN (Burgerservicenummer) met elfproef-validatie
 * - Datums (diverse Nederlandse formaten)
 * - IBAN bankrekeningnummers
 * - E-mailadressen
 * - Telefoonnummers (NL)
 * - Postcodes (NL)
 * - Adressen (straat + huisnummer)
 * - Namen (via aparte NameDetector)
 */

import type {
  PrivacyDataType,
  PrivacyMatch,
  PrivacyFilterResult,
  PrivacyFilterConfig,
  PrivacyStats,
} from './types';
import { ALL_PRIVACY_TYPES } from './types';
import { NameDetector } from './name-detector';

interface DetectedItem {
  original: string;
  type: PrivacyDataType;
  start: number;
  end: number;
}

export class PrivacyFilter {
  private config: Required<PrivacyFilterConfig>;
  private nameDetector: NameDetector;

  constructor(config?: PrivacyFilterConfig) {
    this.config = {
      enabledTypes: config?.enabledTypes ?? [...ALL_PRIVACY_TYPES],
      customNames: config?.customNames ?? [],
      excludeWords: config?.excludeWords ?? [],
      placeholderStyle: config?.placeholderStyle ?? 'bracket',
    };
    this.nameDetector = new NameDetector(this.config.customNames);
  }

  /**
   * Filter alle persoonsgegevens uit de tekst
   */
  filter(text: string): PrivacyFilterResult {
    // Stap 1: Detecteer alle gevoelige items
    let allDetections: DetectedItem[] = [];

    for (const type of this.config.enabledTypes) {
      const detections = this.detect(text, type);
      allDetections.push(...detections);
    }

    // Stap 2: Verwijder overlappende detecties (langste match wint)
    allDetections = this.resolveOverlaps(allDetections);

    // Stap 3: Filter uitgesloten woorden
    allDetections = allDetections.filter(
      d => !this.config.excludeWords.some(
        w => w.toLowerCase() === d.original.toLowerCase()
      )
    );

    // Stap 4: Sorteer op positie (achteraan beginnen voor vervanging)
    allDetections.sort((a, b) => a.start - b.start);

    // Stap 5: Genereer placeholders en vervang
    const counters: Record<string, number> = {};
    const matches: PrivacyMatch[] = [];
    let filteredText = text;
    let offset = 0;

    for (const detection of allDetections) {
      counters[detection.type] = (counters[detection.type] || 0) + 1;
      const num = String(counters[detection.type]).padStart(3, '0');

      const placeholder = this.config.placeholderStyle === 'redacted'
        ? '█'.repeat(detection.original.length)
        : `[${detection.type.toUpperCase()}-${num}]`;

      const adjustedStart = detection.start + offset;
      const adjustedEnd = detection.end + offset;

      filteredText =
        filteredText.slice(0, adjustedStart) +
        placeholder +
        filteredText.slice(adjustedEnd);

      offset += placeholder.length - (detection.end - detection.start);

      matches.push({
        placeholder,
        original: detection.original,
        type: detection.type,
        startOffset: detection.start,
        endOffset: detection.end,
      });
    }

    // Stap 6: Statistieken
    const stats = this.buildStats(matches);

    return { filteredText, matches, stats };
  }

  /**
   * Herstel placeholders naar originele waarden
   */
  restore(filteredText: string, matches: PrivacyMatch[]): string {
    let restored = filteredText;
    // Vervang in omgekeerde volgorde om offsets correct te houden
    for (const match of [...matches].reverse()) {
      restored = restored.replace(match.placeholder, match.original);
    }
    return restored;
  }

  /**
   * Update configuratie
   */
  updateConfig(config: Partial<PrivacyFilterConfig>): void {
    if (config.enabledTypes) this.config.enabledTypes = config.enabledTypes;
    if (config.customNames) {
      this.config.customNames = config.customNames;
      this.nameDetector = new NameDetector(this.config.customNames);
    }
    if (config.excludeWords) this.config.excludeWords = config.excludeWords;
    if (config.placeholderStyle) this.config.placeholderStyle = config.placeholderStyle;
  }

  // === Detectie per type ===

  private detect(text: string, type: PrivacyDataType): DetectedItem[] {
    switch (type) {
      case 'bsn': return this.detectBSN(text);
      case 'date': return this.detectDates(text);
      case 'iban': return this.detectIBAN(text);
      case 'email': return this.detectEmail(text);
      case 'phone': return this.detectPhone(text);
      case 'postcode': return this.detectPostcode(text);
      case 'address': return this.detectAddress(text);
      case 'name': return this.detectNames(text);
      default: return [];
    }
  }

  /**
   * BSN-nummers: 9 cijfers die voldoen aan de elfproef
   */
  private detectBSN(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    // BSN kan geschreven worden als 123456789 of 1234.56.789
    const pattern = /\b(\d{9})\b|\b(\d{4})[.\s](\d{2})[.\s](\d{3})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      let digits: string;
      if (match[1]) {
        digits = match[1];
      } else {
        digits = match[2] + match[3] + match[4];
      }

      if (this.isValidBSN(digits)) {
        results.push({
          original: match[0],
          type: 'bsn',
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return results;
  }

  /**
   * BSN elfproef: 9×d1 + 8×d2 + 7×d3 + 6×d4 + 5×d5 + 4×d6 + 3×d7 + 2×d8 - 1×d9
   * Moet deelbaar zijn door 11 en niet 0
   */
  private isValidBSN(digits: string): boolean {
    if (digits.length !== 9) return false;
    if (digits === '000000000') return false;

    const d = digits.split('').map(Number);
    const sum =
      9 * d[0] + 8 * d[1] + 7 * d[2] + 6 * d[3] +
      5 * d[4] + 4 * d[5] + 3 * d[6] + 2 * d[7] - 1 * d[8];

    return sum > 0 && sum % 11 === 0;
  }

  /**
   * Datums in diverse Nederlandse formaten
   */
  private detectDates(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    const patterns = [
      // dd-mm-yyyy, dd/mm/yyyy, dd.mm.yyyy
      /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/g,
      // dd-mm-yy, dd/mm/yy
      /\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{2})\b/g,
      // "15 maart 2023", "3 jan 1990"
      /\b(\d{1,2})\s+(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december|jan|feb|mrt|apr|jun|jul|aug|sep|okt|nov|dec)\.?\s+(\d{4})\b/gi,
      // "maart 2023" (zonder dag)
      /\b(januari|februari|maart|april|mei|juni|juli|augustus|september|oktober|november|december)\s+(\d{4})\b/gi,
      // Geboortedatum specifiek: "geboren op dd-mm-yyyy" of "geb. dd-mm-yyyy"
      /\b(geboren\s+op|geb\.?)\s+(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        // Valideer dat het een realistische datum is
        if (this.isPlausibleDate(match[0])) {
          results.push({
            original: match[0],
            type: 'date',
            start: match.index,
            end: match.index + match[0].length,
          });
        }
      }
    }

    return results;
  }

  /**
   * Basis datumvalidatie: dag 1-31, maand 1-12
   */
  private isPlausibleDate(dateStr: string): boolean {
    const numMatch = dateStr.match(/(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})/);
    if (numMatch) {
      const day = parseInt(numMatch[1], 10);
      const month = parseInt(numMatch[2], 10);
      if (day < 1 || day > 31 || month < 1 || month > 12) return false;
    }
    return true;
  }

  /**
   * IBAN-nummers (alle landen, focus op NL)
   */
  private detectIBAN(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    // NL IBAN: NL + 2 check digits + 4 letter bankcode + 10 cijfers
    // Internationaal: 2 letters + 2 cijfers + tot 30 alfanumeriek
    const pattern = /\b([A-Z]{2}\d{2}\s?[A-Z]{4}\s?\d{4}\s?\d{4}\s?\d{2,4})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      results.push({
        original: match[0],
        type: 'iban',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return results;
  }

  /**
   * E-mailadressen
   */
  private detectEmail(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    const pattern = /\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      results.push({
        original: match[0],
        type: 'email',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return results;
  }

  /**
   * Nederlandse telefoonnummers
   */
  private detectPhone(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    const patterns = [
      // 06-12345678, 06 12345678, 0612345678
      /\b(06[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2})\b/g,
      // +31 6 12345678, 0031 6 12345678
      /(\+31|0031)[-\s.]?(\(0\)|0)?[-\s.]?6[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2}/g,
      // Vaste nummers: 020-1234567, 030 1234567, etc.
      /\b(0[1-9]\d{1,2})[-\s.](\d{6,7})\b/g,
      // +31 20 1234567
      /(\+31|0031)[-\s.]?(\(0\)|0)?[-\s.]?([1-9]\d{1,2})[-\s.]?(\d{6,7})\b/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        results.push({
          original: match[0],
          type: 'phone',
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return results;
  }

  /**
   * Nederlandse postcodes: 4 cijfers + 2 letters
   */
  private detectPostcode(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    const pattern = /\b(\d{4})\s?([A-Z]{2})\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const digits = parseInt(match[1], 10);
      // Nederlandse postcodes lopen van 1000 tot 9999
      if (digits >= 1000 && digits <= 9999) {
        results.push({
          original: match[0],
          type: 'postcode',
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return results;
  }

  /**
   * Adressen: straatnaam + huisnummer
   */
  private detectAddress(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];
    // Patroon: woord(en) eindigend op straat/laan/weg/gracht/plein/singel/kade + huisnummer
    const pattern = /\b([A-Z][a-zéèêëïöüà]+(?:\s[a-z]+)*(?:straat|laan|weg|gracht|plein|singel|kade|dreef|hof|park|dijk|steeg|markt|boulevard|allee))\s+(\d{1,5}\s?[a-zA-Z]?(?:\s?(?:bis|hs))?)\b/g;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      results.push({
        original: match[0],
        type: 'address',
        start: match.index,
        end: match.index + match[0].length,
      });
    }

    return results;
  }

  /**
   * Namen via de NameDetector
   */
  private detectNames(text: string): DetectedItem[] {
    return this.nameDetector.detect(text);
  }

  // === Hulpmethoden ===

  /**
   * Los overlappende detecties op: langste match wint
   */
  private resolveOverlaps(detections: DetectedItem[]): DetectedItem[] {
    if (detections.length <= 1) return detections;

    // Sorteer op startpositie, bij gelijke start: langste eerst
    detections.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const resolved: DetectedItem[] = [];
    let lastEnd = -1;

    for (const detection of detections) {
      if (detection.start >= lastEnd) {
        resolved.push(detection);
        lastEnd = detection.end;
      }
      // Als er overlap is, houden we de eerdere (langere) match
    }

    return resolved;
  }

  /**
   * Bouw statistieken op
   */
  private buildStats(matches: PrivacyMatch[]): PrivacyStats {
    const counts = {} as Record<PrivacyDataType, number>;
    for (const type of ALL_PRIVACY_TYPES) {
      counts[type] = 0;
    }

    for (const match of matches) {
      counts[match.type]++;
    }

    return {
      counts,
      total: matches.length,
    };
  }
}

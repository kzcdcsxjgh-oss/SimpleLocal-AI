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
   * Pre-normalisatie voor OCR- en PDF-artefacten.
   * Bouwt een karakter-voor-karakter mapping van genormaliseerde posities
   * terug naar originele posities, zodat detectieresultaten correct
   * terugvertaald kunnen worden.
   *
   * Stappen:
   * 1. Verwijder onzichtbare tekens (soft hyphens, zero-width chars)
   * 2. Herstel OCR-afbrekingen: "Varen-\nkamp" → "Varenkamp"
   * 3. Normaliseer whitespace (tabs, NBSP → spatie, herhaalde spaties)
   * 4. Voeg spaties toe bij case-overgangen: "30Tom" → "30 Tom"
   */
  private normalizeForDetection(text: string): { normalized: string; toOriginal: number[] } {
    // Stap 1-3: OCR-normalisatie met positie-tracking
    const { cleaned, cleanedToOrig } = this.preNormalizeOCR(text);

    // Stap 4: Spatie-injectie bij case-overgangen
    const toOriginal: number[] = [];
    let normalized = '';

    for (let i = 0; i < cleaned.length; i++) {
      const ch = cleaned[i];
      const prev = i > 0 ? cleaned[i - 1] : '';

      if (
        i > 0 &&
        /[A-ZÀ-Ý]/.test(ch) &&
        (/[a-zà-ÿ]/.test(prev) || /[0-9]/.test(prev))
      ) {
        normalized += ' ';
        toOriginal.push(-1);
      }

      normalized += ch;
      toOriginal.push(cleanedToOrig[i]);
    }

    return { normalized, toOriginal };
  }

  /**
   * Bouw een genormaliseerde tekst met posities terug naar origineel.
   * Verwijdert onzichtbare tekens, herstelt afbrekingen, normaliseert whitespace.
   */
  private preNormalizeOCR(text: string): { cleaned: string; cleanedToOrig: number[] } {
    let cleaned = '';
    const cleanedToOrig: number[] = [];

    // Set van onzichtbare tekens om te verwijderen
    const INVISIBLE = new Set(['\u00AD', '\u200B', '\u200C', '\u200D', '\uFEFF']);

    let i = 0;
    while (i < text.length) {
      const ch = text[i];

      // Verwijder onzichtbare tekens (skip, geen output)
      if (INVISIBLE.has(ch)) {
        i++;
        continue;
      }

      // Herstel woordafbreking: "a-\n  b" → "ab" (alleen kleine letter - newline - kleine letter)
      if (
        ch === '-' &&
        i > 0 && /[a-zà-ÿ]/.test(text[i - 1])
      ) {
        // Kijk of er whitespace+newline+whitespace+kleine letter volgt
        let j = i + 1;
        while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
        if (j < text.length && text[j] === '\n') {
          j++;
          while (j < text.length && (text[j] === ' ' || text[j] === '\t')) j++;
          if (j < text.length && /[a-zà-ÿ]/.test(text[j])) {
            // Afbreking gevonden — sla het koppelteken en whitespace over
            i = j;
            continue;
          }
        }
      }

      // Normaliseer tabs en NBSP naar gewone spatie
      if (ch === '\t' || ch === '\u00A0') {
        // Sla herhaalde spaties over
        if (cleaned.length > 0 && cleaned[cleaned.length - 1] === ' ') {
          i++;
          continue;
        }
        cleaned += ' ';
        cleanedToOrig.push(i);
        i++;
        continue;
      }

      // Sla herhaalde spaties over
      if (ch === ' ' && cleaned.length > 0 && cleaned[cleaned.length - 1] === ' ') {
        i++;
        continue;
      }

      cleaned += ch;
      cleanedToOrig.push(i);
      i++;
    }

    return { cleaned, cleanedToOrig };
  }

  /**
   * Vertaal positie in genormaliseerde tekst terug naar originele tekst
   */
  private mapToOriginal(
    start: number,
    end: number,
    toOriginal: number[],
  ): { origStart: number; origEnd: number } {
    // Zoek eerste niet-ingevoegde positie >= start
    let origStart = start;
    while (origStart < toOriginal.length && toOriginal[origStart] === -1) {
      origStart++;
    }
    // Zoek laatste niet-ingevoegde positie < end
    let origEnd = end - 1;
    while (origEnd >= 0 && toOriginal[origEnd] === -1) {
      origEnd--;
    }

    return {
      origStart: toOriginal[origStart] ?? start,
      origEnd: (toOriginal[origEnd] ?? origEnd) + 1,
    };
  }

  /**
   * Filter alle persoonsgegevens uit de tekst
   */
  filter(text: string): PrivacyFilterResult {
    // Stap 0: Normaliseer tekst voor betere detectie
    const { normalized, toOriginal } = this.normalizeForDetection(text);

    // Stap 1: Detecteer alle gevoelige items in genormaliseerde tekst
    let allDetections: DetectedItem[] = [];

    for (const type of this.config.enabledTypes) {
      const detections = this.detect(normalized, type);
      allDetections.push(...detections);
    }

    // Stap 1b: Vertaal posities terug naar originele tekst
    allDetections = allDetections.map(d => {
      const { origStart, origEnd } = this.mapToOriginal(d.start, d.end, toOriginal);
      return {
        ...d,
        original: text.slice(origStart, origEnd),
        start: origStart,
        end: origEnd,
      };
    });

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
    // Entity mapping voor namen: zelfde persoon → zelfde placeholder-nummer
    const counters: Record<string, number> = {};
    const nameEntities: { fullName: string; num: number }[] = [];
    const matches: PrivacyMatch[] = [];
    let filteredText = text;
    let offset = 0;

    for (const detection of allDetections) {
      let num: number;

      if (detection.type === 'name') {
        num = this.getNameEntityNumber(detection.original, nameEntities, counters);
      } else {
        counters[detection.type] = (counters[detection.type] || 0) + 1;
        num = counters[detection.type];
      }

      const numStr = String(num).padStart(3, '0');

      const placeholder = this.config.placeholderStyle === 'redacted'
        ? '█'.repeat(detection.original.length)
        : `[${detection.type.toUpperCase()}-${numStr}]`;

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
   * Ondersteunt diverse scheidingstekens: -, spatie, ., en-dash (–), etc.
   */
  private detectPhone(text: string): DetectedItem[] {
    const results: DetectedItem[] = [];

    // Normaliseer speciale koppeltekens naar gewone koppeltekens voor detectie
    // En-dash (–), em-dash (—), etc.
    const normalizedText = text.replace(/[–—−]/g, '-');

    const patterns = [
      // 06-12345678, 06 12345678, 0612345678, ook met meerdere spaties: 06 12 34 56 78
      /\b(06[-\s.]?\d{1,2}[-\s.]?\d{1,2}[-\s.]?\d{1,2}[-\s.]?\d{1,2}[-\s.]?\d{1,2})\b/g,
      // +31 6 12345678, 0031 6 12345678
      /(\+31|0031)[-\s.]?(\(0\)|0)?[-\s.]?6[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2}[-\s.]?\d{2}/g,
      // Vaste nummers: 020-1234567, 030 1234567, 020 123 45 67 (met extra spaties)
      /\b(0[1-9]\d{1,2})[-\s.](\d{1,3}[-\s.]?\d{1,3}[-\s.]?\d{1,3})\b/g,
      // +31 20 1234567
      /(\+31|0031)[-\s.]?(\(0\)|0)?[-\s.]?([1-9]\d{1,2})[-\s.]?(\d{6,7})\b/g,
      // Telefoonnummers met "tel:" prefix
      /\b(?:tel:|telefoon:)\s*([-\s\d()]+)/gi,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(normalizedText)) !== null) {
        // Map terug naar originele tekst positie
        const originalMatch = text.slice(match.index, match.index + match[0].length);

        // Filter te korte matches (moet minimaal 9-10 cijfers bevatten)
        const digitCount = originalMatch.replace(/\D/g, '').length;
        if (digitCount >= 9) {
          results.push({
            original: originalMatch,
            type: 'phone',
            start: match.index,
            end: match.index + match[0].length,
          });
        }
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

  // === Entity mapping ===

  /**
   * Bepaal het placeholder-nummer voor een naam.
   * Als "Tom" al gezien is als onderdeel van "Tom Polet", krijgt het hetzelfde nummer.
   * Dit volgt de NetOwl/Presidio co-reference best practice.
   */
  private getNameEntityNumber(
    name: string,
    entities: { fullName: string; num: number }[],
    counters: Record<string, number>,
  ): number {
    const nameLower = name.toLowerCase();

    for (const entity of entities) {
      const entityLower = entity.fullName.toLowerCase();

      // Exacte match
      if (entityLower === nameLower) return entity.num;

      // "Tom" is onderdeel van "Tom Polet" (voornaam)
      if (entityLower.startsWith(nameLower + ' ')) return entity.num;

      // "Polet" is onderdeel van "Tom Polet" (achternaam)
      if (entityLower.endsWith(' ' + nameLower)) return entity.num;

      // "Tom Polet" bevat "Tom" of "Polet" als woorddeel
      const entityParts = entityLower.split(/\s+/);
      const nameParts = nameLower.split(/\s+/);
      if (nameParts.length === 1 && entityParts.includes(nameParts[0])) return entity.num;

      // Omgekeerd: "Tom Polet" is een langere variant van eerder gezien "Tom"
      if (nameLower.startsWith(entityLower + ' ')) {
        entity.fullName = name; // Upgrade naar langere vorm
        return entity.num;
      }
    }

    // Nieuw entity
    counters['name'] = (counters['name'] || 0) + 1;
    const num = counters['name'];
    entities.push({ fullName: name, num });
    return num;
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

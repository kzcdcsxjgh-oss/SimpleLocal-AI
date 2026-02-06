/**
 * Name Detector
 *
 * Detecteert Nederlandse voor- en achternamen in tekst.
 * Gebruikt een combinatie van:
 * 1. Woordenlijst met bekende Nederlandse namen
 * 2. Contextpatronen (bijv. "Dhr.", "Geachte", etc.)
 * 3. Tussenvoegsel-patronen (van, de, van der, etc.)
 *
 * Draait volledig lokaal — geen externe API's.
 */

import {
  DUTCH_FIRST_NAMES,
  DUTCH_LAST_NAMES,
  DUTCH_PREFIXES,
  NAME_INDICATORS,
} from './dutch-names';

interface DetectedName {
  original: string;
  type: 'name';
  start: number;
  end: number;
}

// Woorden die niet als naam behandeld moeten worden, ook al staan ze in de lijst
const COMMON_WORDS = new Set([
  'er', 'en', 'de', 'het', 'een', 'van', 'in', 'is', 'op', 'te', 'aan',
  'met', 'als', 'bij', 'dit', 'dat', 'wat', 'wie', 'wel', 'nog', 'kan',
  'ook', 'dan', 'ben', 'heb', 'zal', 'tot', 'uit', 'voor', 'niet',
  'maar', 'zijn', 'haar', 'hem', 'hun', 'zij', 'wij', 'hij', 'ons',
  'door', 'over', 'naar', 'meer', 'veel', 'goed', 'heel', 'alle',
  'Den', 'Berg', 'Meer', 'Hal', 'Groot', 'Klein', 'Kort', 'Lang',
  // Maanden die als naam verward kunnen worden
  'Mei',
]);

export class NameDetector {
  private firstNameSet: Set<string>;
  private lastNameSet: Set<string>;
  private prefixPatterns: string[];
  private indicatorPattern: RegExp;

  constructor(customNames?: string[]) {
    // Bouw sets voor snelle lookup
    this.firstNameSet = new Set([
      ...DUTCH_FIRST_NAMES,
      ...(customNames ?? []),
    ]);

    this.lastNameSet = new Set(DUTCH_LAST_NAMES);

    // Sorteer prefixes op lengte (langste eerst) voor greedy matching
    this.prefixPatterns = [...DUTCH_PREFIXES].sort((a, b) => b.length - a.length);

    // Bouw regex voor naam-indicatoren
    const escapedIndicators = NAME_INDICATORS.map(i =>
      i.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    );
    this.indicatorPattern = new RegExp(
      `(?:${escapedIndicators.join('|')})\\s+`,
      'gi'
    );
  }

  /**
   * Detecteer namen in de tekst
   */
  detect(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Methode 1: Namen na indicatoren (hoogste betrouwbaarheid)
    results.push(...this.detectAfterIndicators(text));

    // Methode 2: Bekende voornaam + (tussenvoegsel +) achternaam combinaties
    results.push(...this.detectFullNames(text));

    // Methode 3: Alleenstaande voornamen in verdachte context
    results.push(...this.detectContextualNames(text));

    // Verwijder duplicaten en overlaps
    return this.deduplicateNames(results);
  }

  /**
   * Methode 1: Detecteer namen die volgen na indicatoren
   * Bijv. "Dhr. Jan van den Berg", "Geachte mevrouw De Vries"
   */
  private detectAfterIndicators(text: string): DetectedName[] {
    const results: DetectedName[] = [];
    let match;

    this.indicatorPattern.lastIndex = 0;
    while ((match = this.indicatorPattern.exec(text)) !== null) {
      const afterPos = match.index + match[0].length;
      const remaining = text.slice(afterPos);

      // Probeer een volledige naam te vinden na de indicator
      const nameMatch = this.extractNameAtPosition(remaining);
      if (nameMatch) {
        results.push({
          original: nameMatch,
          type: 'name',
          start: afterPos,
          end: afterPos + nameMatch.length,
        });
      }
    }

    return results;
  }

  /**
   * Methode 2: Detecteer "Voornaam (tussenvoegsel) Achternaam" patronen
   */
  private detectFullNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Zoek naar woorden die beginnen met een hoofdletter
    const wordPattern = /\b([A-ZÀ-ÿ][a-zà-ÿ]+)\b/g;
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      const word = match[1];
      const pos = match.index;

      // Skip veelvoorkomende woorden
      if (COMMON_WORDS.has(word)) continue;

      // Check of dit een bekende voornaam is
      if (this.firstNameSet.has(word)) {
        // Kijk wat er na de voornaam komt
        const afterFirst = text.slice(pos + word.length);
        const fullName = this.tryExtendToFullName(word, afterFirst);

        if (fullName && fullName !== word) {
          results.push({
            original: fullName,
            type: 'name',
            start: pos,
            end: pos + fullName.length,
          });
          // Spring voorbij deze naam
          wordPattern.lastIndex = pos + fullName.length;
        }
      }
    }

    return results;
  }

  /**
   * Methode 3: Detecteer namen in context-gevoelige posities
   * Bijv. na "Naam:", komma-gescheiden lijsten, etc.
   */
  private detectContextualNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Patroon: initialen + achternaam, bijv. "J. de Vries", "A.B. Bakker"
    const initialPattern = /\b([A-Z]\.\s?(?:[A-Z]\.\s?)*)((?:(?:van|de|den|der|het|'t|te|ten|ter)\s+)*[A-Z][a-zà-ÿ]+)\b/g;
    let match;

    while ((match = initialPattern.exec(text)) !== null) {
      const lastName = match[2].replace(/^(?:van|de|den|der|het|'t|te|ten|ter)\s+/i, '').trim();
      if (this.lastNameSet.has(lastName) || this.isLikelySurname(lastName)) {
        results.push({
          original: match[0],
          type: 'name',
          start: match.index,
          end: match.index + match[0].length,
        });
      }
    }

    return results;
  }

  /**
   * Probeer een naam te extraheren op een positie in de tekst
   * Bijv. "Jan van den Berg" of "Marie de Vries"
   */
  private extractNameAtPosition(text: string): string | null {
    // Probeer: Voornaam (tussenvoegsel) Achternaam
    const namePattern = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+)?)\s+((?:(?:van|de|den|der|het|'t|te|ten|ter|in|op|aan|bij|uit|voor|over|onder|tot)\s+)*[A-ZÀ-ÿ][a-zà-ÿ]+)/;
    const simpleMatch = namePattern.exec(text);
    if (simpleMatch) {
      return simpleMatch[0];
    }

    // Probeer: enkel een naam met hoofdletter
    const singleMatch = /^([A-ZÀ-ÿ][a-zà-ÿ]{2,})/.exec(text);
    if (singleMatch) {
      const word = singleMatch[1];
      if (this.firstNameSet.has(word) || this.lastNameSet.has(word)) {
        return word;
      }
    }

    return null;
  }

  /**
   * Probeer een voornaam uit te breiden naar een volledige naam
   * "Jan" + " van den Berg woont..." → "Jan van den Berg"
   */
  private tryExtendToFullName(firstName: string, remaining: string): string | null {
    // Check voor tussenvoegsel + achternaam
    for (const prefix of this.prefixPatterns) {
      const prefixPattern = new RegExp(
        `^\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([A-ZÀ-ÿ][a-zà-ÿ]+)`,
        'i'
      );
      const match = prefixPattern.exec(remaining);
      if (match) {
        return `${firstName}${match[0]}`;
      }
    }

    // Check voor directe achternaam (hoofdletter)
    const directMatch = /^\s+([A-ZÀ-ÿ][a-zà-ÿ]+)/.exec(remaining);
    if (directMatch) {
      const possibleLastName = directMatch[1];
      if (this.lastNameSet.has(possibleLastName) && !COMMON_WORDS.has(possibleLastName)) {
        return `${firstName}${directMatch[0]}`;
      }
    }

    return null;
  }

  /**
   * Check of een woord waarschijnlijk een achternaam is
   * (niet in de lijst, maar past in het patroon)
   */
  private isLikelySurname(word: string): boolean {
    if (word.length < 3) return false;
    if (COMMON_WORDS.has(word)) return false;

    // Typische Nederlandse achternaam-achtervoegsels
    const suffixes = ['man', 'stra', 'sma', 'ema', 'inga', 'ink', 'sen', 'ssen', 'berg', 'dijk', 'meer', 'veld'];
    return suffixes.some(s => word.toLowerCase().endsWith(s));
  }

  /**
   * Verwijder overlappende naamdetecties
   */
  private deduplicateNames(names: DetectedName[]): DetectedName[] {
    if (names.length <= 1) return names;

    // Sorteer op start, bij gelijk: langste eerst
    names.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

    const result: DetectedName[] = [];
    let lastEnd = -1;

    for (const name of names) {
      if (name.start >= lastEnd) {
        result.push(name);
        lastEnd = name.end;
      }
    }

    return result;
  }
}

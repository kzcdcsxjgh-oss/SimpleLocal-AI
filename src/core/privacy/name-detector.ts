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
// (case-insensitive check via isCommonWord helper)
const COMMON_WORDS_LIST = [
  'er', 'en', 'de', 'het', 'een', 'van', 'in', 'is', 'op', 'te', 'aan',
  'met', 'als', 'bij', 'dit', 'dat', 'wat', 'wie', 'wel', 'nog', 'kan',
  'ook', 'dan', 'ben', 'heb', 'zal', 'tot', 'uit', 'voor', 'niet',
  'maar', 'zijn', 'haar', 'hem', 'hun', 'zij', 'wij', 'hij', 'ons',
  'door', 'over', 'naar', 'meer', 'veel', 'goed', 'heel', 'alle',
  'den', 'berg', 'hal', 'groot', 'klein', 'kort', 'lang',
  // Maanden die als naam verward kunnen worden
  'mei',
  // Veelvoorkomende woorden aan begin van zinnen
  'hoe', 'die', 'dus', 'hier', 'daar', 'toen', 'toch', 'waar',
];
const COMMON_WORDS = new Set(COMMON_WORDS_LIST);

function isCommonWord(word: string): boolean {
  return COMMON_WORDS.has(word.toLowerCase());
}

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
   *
   * Twee-pass strategie (best practice: entity propagation):
   *   Pass 1-3: Detecteer volledige namen (hoge betrouwbaarheid)
   *   Pass 4:   Entity propagation — zoek losse vermeldingen van al-gevonden namen
   *   Pass 5:   Contextuele detectie — herken losse voornamen in Nederlands taalpatroon
   */
  detect(text: string): DetectedName[] {
    // === Pass 1-3: Volledige namen detecteren ===
    const fullNameResults: DetectedName[] = [];

    // Methode 1: Namen na indicatoren (hoogste betrouwbaarheid)
    fullNameResults.push(...this.detectAfterIndicators(text));

    // Methode 2: Bekende voornaam + (tussenvoegsel +) achternaam combinaties
    fullNameResults.push(...this.detectFullNames(text));

    // Methode 3: Initialen + achternaam patronen
    fullNameResults.push(...this.detectContextualNames(text));

    // Dedup voor we verdergaan
    const confirmedNames = this.deduplicateNames(fullNameResults);

    // === Pass 4: Entity propagation ===
    // Zoek losse vermeldingen van voor-/achternamen die al als volledige naam gevonden zijn
    const propagated = this.detectPropagatedNames(text, confirmedNames);

    // === Pass 5: Contextuele standalone voornamen ===
    // Herken bekende voornamen in Nederlands taalpatronen
    // (bijv. "Christa, die komt" / "met Agnes" / "Agnes is")
    const allSoFar = this.deduplicateNames([...confirmedNames, ...propagated]);
    const contextual = this.detectStandaloneFirstNames(text, allSoFar);

    // Finale deduplicatie
    return this.deduplicateNames([...allSoFar, ...contextual]);
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
   * Ondersteunt ook samengestelde voornamen zoals "Klaas-Jan"
   */
  private detectFullNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Zoek naar woorden die beginnen met een hoofdletter
    // Gebruik flexibelere grenzen: ook na cijfers of begin van tekst
    const wordPattern = /(?:^|(?<=[\s.,;:!?()"']))([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)(?=[\s.,;:!?()"']|$)/gm;
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      const word = match[1];
      const pos = match.index;

      // Skip veelvoorkomende woorden
      if (isCommonWord(word)) continue;

      // Check of dit een bekende voornaam is (ook samengestelde: "Klaas-Jan")
      const isKnownFirstName = this.isKnownFirstName(word);

      if (isKnownFirstName) {
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
   * Check of een woord (inclusief samengestelde namen) een bekende voornaam is
   * "Jan" → true, "Klaas-Jan" → true (als "Klaas" of "Jan" bekend is)
   */
  private isKnownFirstName(word: string): boolean {
    if (this.firstNameSet.has(word)) return true;

    // Check samengestelde voornamen: "Klaas-Jan" → check "Klaas" en "Jan"
    if (word.includes('-')) {
      const parts = word.split('-');
      return parts.every(part => this.firstNameSet.has(part));
    }

    return false;
  }

  /**
   * Methode 3: Detecteer namen in context-gevoelige posities
   * Bijv. na "Naam:", komma-gescheiden lijsten, etc.
   */
  private detectContextualNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Patroon: initialen + achternaam, bijv. "J. de Vries", "A.B. Bakker"
    const initialPattern = /(?:^|(?<=[\s.,;:!?()"']))([A-Z]\.\s?(?:[A-Z]\.\s?)*)((?:(?:van|de|den|der|het|'t|te|ten|ter)\s+)*[A-Z][a-zà-ÿ]+)(?=[\s.,;:!?()"']|$)/gm;
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
    // Probeer: Voornaam(-Voornaam) (tussenvoegsel) Achternaam
    const namePattern = /^([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*(?:\s+[A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)?)\s+((?:(?:van|de|den|der|het|'t|te|ten|ter|in|op|aan|bij|uit|voor|over|onder|tot)\s+)*[A-ZÀ-ÿ][a-zà-ÿ]+)/;
    const simpleMatch = namePattern.exec(text);
    if (simpleMatch) {
      return simpleMatch[0];
    }

    // Probeer: enkel een naam met hoofdletter (inclusief samengesteld)
    const singleMatch = /^([A-ZÀ-ÿ][a-zà-ÿ]{2,}(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)/.exec(text);
    if (singleMatch) {
      const word = singleMatch[1];
      if (this.isKnownFirstName(word) || this.lastNameSet.has(word)) {
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
        `^\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([A-ZÀ-ÿ][a-zà-ÿ]+)(?=[\\s.,;:!?()"']|$)`,
        'i'
      );
      const match = prefixPattern.exec(remaining);
      if (match) {
        return `${firstName}${match[0]}`;
      }
    }

    // Check voor directe achternaam (hoofdletter), gevolgd door woordgrens
    const directMatch = /^\s+([A-ZÀ-ÿ][a-zà-ÿ]+)(?=[\s.,;:!?()"']|$)/.exec(remaining);
    if (directMatch) {
      const possibleLastName = directMatch[1];
      if ((this.lastNameSet.has(possibleLastName) || this.isLikelySurname(possibleLastName)) && !isCommonWord(possibleLastName)) {
        return `${firstName}${directMatch[0]}`;
      }

      // Check voor samengestelde achternaam: bijv. "Klein Wassink"
      // Als het eerste woord een common word is maar in de achternaamlijst staat,
      // kijk of er nog een achternaam volgt
      if (isCommonWord(possibleLastName) && this.lastNameSet.has(possibleLastName)) {
        const afterCompound = remaining.slice(directMatch[0].length);
        const secondPart = /^\s+([A-ZÀ-ÿ][a-zà-ÿ]+)(?=[\s.,;:!?()"']|$)/.exec(afterCompound);
        if (secondPart && (this.lastNameSet.has(secondPart[1]) || this.isLikelySurname(secondPart[1]))) {
          return `${firstName}${directMatch[0]}${secondPart[0]}`;
        }
      }
    }

    return null;
  }

  // === Pass 4 & 5: Entity propagation en contextuele detectie ===

  /**
   * Pass 4: Entity propagation
   *
   * Als "Tom Polet" gevonden is, zoek dan alle losse vermeldingen van "Tom"
   * en "Polet" in de rest van de tekst. Dit is de standaard aanpak van
   * tools zoals Microsoft Presidio en NetOwl (co-reference resolution).
   */
  private detectPropagatedNames(text: string, confirmedNames: DetectedName[]): DetectedName[] {
    const results: DetectedName[] = [];
    const components = this.extractNameComponents(confirmedNames);

    for (const name of components) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const pattern = new RegExp(
        `(?:^|(?<=[\\s.,;:!?()"']))${escaped}(?=[\\s.,;:!?()"']|$)`,
        'gm'
      );
      let match;

      while ((match = pattern.exec(text)) !== null) {
        const start = match.index;
        const end = start + name.length;

        // Sla over als deze positie al gedekt is
        if (this.isPositionCovered(start, end, confirmedNames, results)) continue;

        results.push({
          original: name,
          type: 'name',
          start,
          end,
        });
      }
    }

    return results;
  }

  /**
   * Extraheer losse naamonderdelen uit gevonden volledige namen
   * "Tom Polet" → {"Tom", "Polet"}
   * "Klaas-Jan Burgler" → {"Klaas-Jan", "Burgler"}
   * "Christa Klein Wassink" → {"Christa", "Wassink"}
   */
  private extractNameComponents(detections: DetectedName[]): Set<string> {
    const components = new Set<string>();

    for (const det of detections) {
      const parts = det.original.split(/\s+/);
      if (parts.length < 2) continue;

      // Voornaam (eerste deel, evt. samengesteld)
      const firstName = parts[0];
      if (firstName.length >= 2 && /^[A-ZÀ-ÿ]/.test(firstName) && !isCommonWord(firstName)) {
        components.add(firstName);
      }

      // Achternaam (laatste deel)
      const lastName = parts[parts.length - 1];
      if (lastName.length >= 2 && /^[A-ZÀ-ÿ]/.test(lastName) && !isCommonWord(lastName)) {
        components.add(lastName);
      }
    }

    return components;
  }

  /**
   * Pass 5: Contextuele standalone voornamen
   *
   * Detecteer bekende voornamen die in typisch Nederlands taalgebruik
   * voorkomen, zelfs als ze niet eerder als volledige naam gevonden zijn.
   *
   * Patronen:
   *   A: "Christa, die komt ook"      (naam + komma + betrekkelijk vnw / werkwoord)
   *   B: "met Agnes" / "voor Christa" (voorzetsel + naam)
   *   C: "Agnes is er ook"            (naam + werkwoord)
   */
  private detectStandaloneFirstNames(text: string, existingDetections: DetectedName[]): DetectedName[] {
    const results: DetectedName[] = [];

    const CONTEXT_AFTER_COMMA = /^,\s+(?:die|dat|deze|zij|hij|haar|zijn|we|ze|onze|ons|de|het|komt|gaat|wil|kan|moet|heeft|had|was|is|zal|wordt|zei|zegt)\b/i;
    const PREPOSITION_BEFORE = /(?:met|voor|bij|aan|over|naar|door|tegen|zonder|volgens|namens|behalve)\s+$/i;
    const VERB_AFTER = /^\s+(?:is|was|heeft|had|wordt|werd|kan|kon|zal|zou|moet|moest|wil|wilde|gaat|ging|komt|kwam|lijkt|blijft|staat|zit|loopt|zei|zegt|vindt|vond|doet|deed|mag|mocht)\b/i;

    const wordPattern = /(?:^|(?<=[\s.,;:!?()"']))([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)(?=[\s.,;:!?()"']|$)/gm;
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      const word = match[1];
      const pos = match.index;

      if (!this.isKnownFirstName(word)) continue;
      if (isCommonWord(word)) continue;
      if (this.isPositionCovered(pos, pos + word.length, existingDetections, results)) continue;

      const afterWord = text.slice(pos + word.length);
      const beforeWord = text.slice(Math.max(0, pos - 20), pos);

      // Patroon A: "Naam, die/dat/zij/..."
      if (CONTEXT_AFTER_COMMA.test(afterWord)) {
        results.push({ original: word, type: 'name', start: pos, end: pos + word.length });
        continue;
      }

      // Patroon B: "met/voor/bij/... Naam"
      if (PREPOSITION_BEFORE.test(beforeWord)) {
        results.push({ original: word, type: 'name', start: pos, end: pos + word.length });
        continue;
      }

      // Patroon C: "Naam is/was/heeft/..."
      if (VERB_AFTER.test(afterWord)) {
        results.push({ original: word, type: 'name', start: pos, end: pos + word.length });
        continue;
      }
    }

    return results;
  }

  /**
   * Check of een positie al gedekt is door een bestaande detectie
   */
  private isPositionCovered(
    start: number,
    end: number,
    ...detectionSets: DetectedName[][]
  ): boolean {
    for (const detections of detectionSets) {
      for (const d of detections) {
        // Overlap: niet (end <= d.start || start >= d.end)
        if (start < d.end && end > d.start) return true;
      }
    }
    return false;
  }

  /**
   * Check of een woord waarschijnlijk een achternaam is
   * (niet in de lijst, maar past in het patroon)
   */
  private isLikelySurname(word: string): boolean {
    if (word.length < 3) return false;
    if (isCommonWord(word)) return false;

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

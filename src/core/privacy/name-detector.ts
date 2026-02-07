/**
 * Name Detector
 *
 * Detecteert Nederlandse voor- en achternamen in tekst.
 * Gebruikt een ensemble van detectiemechanismen:
 * 1. Woordenlijst met bekende Nederlandse namen
 * 2. Contextpatronen (bijv. "Dhr.", "Geachte", zorgcontext, etc.)
 * 3. Tussenvoegsel-patronen (van, de, van der, etc.)
 * 4. Vergadertranscript speaker-labels (timestamp + naam)
 * 5. "Achternaam, Voornaam" patronen
 * 6. ALL-CAPS naamdetectie
 * 7. Two-pass: tweede ronde met agressievere detectie
 *
 * Principe: als één detector iets als naam ziet, wordt het geredacteerd.
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

/**
 * Normaliseer een ALL-CAPS woord naar Title Case voor vergelijking
 * "TOM" → "Tom", "KLAAS-JAN" → "Klaas-Jan"
 */
function toTitleCase(word: string): string {
  return word
    .split('-')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join('-');
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
   * Ensemble-strategie met twee rondes:
   *
   * Ronde 1 (passes 1-7): Brede detectie via meerdere mechanismen
   *   Pass 1: Namen na indicatoren (hoogste betrouwbaarheid)
   *   Pass 2: Bekende voornaam + achternaam combinaties
   *   Pass 3: Initialen + achternaam patronen
   *   Pass 4: Vergadertranscript speaker-labels (timestamp + naam)
   *   Pass 5: "Achternaam, Voornaam" patronen
   *   Pass 6: ALL-CAPS namen
   *   Pass 7: Entity propagation — losse vermeldingen van al-gevonden namen
   *   Pass 8: Contextuele standalone voornamen (taalpatronen)
   *
   * Ronde 2 (pass 9): Agressieve herdetectie
   *   Zoek resterende naamachtige tokens in persoonscontext
   *
   * Principe: als één detector iets als naam ziet, wordt het geredacteerd.
   */
  detect(text: string): DetectedName[] {
    // === Ronde 1: Brede detectie ===
    const fullNameResults: DetectedName[] = [];

    // Pass 1: Namen na indicatoren (hoogste betrouwbaarheid)
    fullNameResults.push(...this.detectAfterIndicators(text));

    // Pass 2: Bekende voornaam + (tussenvoegsel +) achternaam combinaties
    fullNameResults.push(...this.detectFullNames(text));

    // Pass 3: Initialen + achternaam patronen
    fullNameResults.push(...this.detectContextualNames(text));

    // Pass 4: Vergadertranscript speaker-labels
    fullNameResults.push(...this.detectSpeakerLabels(text));

    // Pass 5: "Achternaam, Voornaam" patronen
    fullNameResults.push(...this.detectReversedNames(text));

    // Pass 6: ALL-CAPS namen
    fullNameResults.push(...this.detectAllCapsNames(text));

    // Dedup voor we verdergaan
    const confirmedNames = this.deduplicateNames(fullNameResults);

    // Pass 7: Entity propagation
    const propagated = this.detectPropagatedNames(text, confirmedNames);

    // Pass 8: Contextuele standalone voornamen
    const allSoFar = this.deduplicateNames([...confirmedNames, ...propagated]);
    const contextual = this.detectStandaloneFirstNames(text, allSoFar);

    // === Ronde 2: Agressieve herdetectie ===
    const afterRound1 = this.deduplicateNames([...allSoFar, ...contextual]);
    const aggressive = this.detectAggressiveSecondPass(text, afterRound1);

    // Finale deduplicatie
    return this.deduplicateNames([...afterRound1, ...aggressive]);
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

  // === Pass 4: Speaker-label detectie ===

  /**
   * Pass 4: Detecteer namen in vergadertranscripten
   *
   * In transcripten staan namen vaak als speaker-label op eigen regels:
   *   "04:20\nKlaas-Jan Burgler\nHet richt nu nog..."
   *   "00:06\nTom Polet\nHallo Rogier."
   *
   * Patroon: een regel die alleen een naam bevat (2-4 woorden, begint met
   * hoofdletter), optioneel voorafgegaan door een timestamp-regel.
   */
  private detectSpeakerLabels(text: string): DetectedName[] {
    const results: DetectedName[] = [];
    const lines = text.split('\n');
    let offset = 0;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const lineStart = text.indexOf(lines[i], offset);
      offset = lineStart + lines[i].length;

      // Controleer of vorige regel een timestamp is (bijv. "04:20", "01:34")
      const prevLine = i > 0 ? lines[i - 1].trim() : '';
      const isAfterTimestamp = /^\d{1,2}:\d{2}(?::\d{2})?$/.test(prevLine);

      // Controleer of de huidige regel een speaker-label is:
      // - 2-4 woorden lang (voornaam + evt. tussenvoegsel + achternaam)
      // - Begint met hoofdletter
      // - Geen interpunctie behalve koppeltekens en punten (initialen)
      // - Volgt op timestamp OF staat aan begin document
      if (!isAfterTimestamp && i > 1) continue;

      // Korte regels met alleen naam-achtige woorden
      const words = line.split(/\s+/);
      if (words.length < 2 || words.length > 5) continue;
      if (!/^[A-ZÀ-ÿ]/.test(line)) continue;
      // Geen zin (geen werkwoord-achtige eindtekens)
      if (/[.!?;]$/.test(line)) continue;
      // Alle woorden beginnen met hoofdletter of zijn tussenvoegsels
      const allNameLike = words.every(w =>
        /^[A-ZÀ-ÿ]/.test(w) ||
        /^(?:van|de|den|der|het|'t|te|ten|ter|in|op|aan|bij|uit|voor|over|onder|tot)$/i.test(w) ||
        w === '-'
      );
      if (!allNameLike) continue;

      // Controleer of minstens één woord een bekende voornaam of achternaam is
      const hasKnownName = words.some(w =>
        this.isKnownFirstName(w) ||
        this.lastNameSet.has(w) ||
        this.isLikelySurname(w)
      );
      if (!hasKnownName) continue;

      results.push({
        original: line,
        type: 'name',
        start: lineStart,
        end: lineStart + line.length,
      });
    }

    return results;
  }

  // === Pass 5: "Achternaam, Voornaam" patronen ===

  /**
   * Pass 5: Detecteer namen in omgekeerde volgorde
   * Bijv. "Polet, Tom" of "Vries, J. de" of "Burgler, Klaas-Jan"
   */
  private detectReversedNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Patroon: Achternaam, Voornaam (evt. met tussenvoegsel ervoor)
    const pattern = /(?:^|(?<=[\s(]))([A-ZÀ-ÿ][a-zà-ÿ]+),\s+([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)?)(?:\s+(?:van|de|den|der|het|'t|te|ten|ter))*(?=[\s).,;:!?]|$)/gm;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const surname = match[1];
      const firstName = match[2];

      // Controleer of voornaam bekend is EN achternaam in lijst of waarschijnlijk
      if (
        this.isKnownFirstName(firstName) &&
        (this.lastNameSet.has(surname) || this.isLikelySurname(surname))
      ) {
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

  // === Pass 6: ALL-CAPS namen ===

  /**
   * Pass 6: Detecteer namen die volledig in hoofdletters zijn geschreven
   * Bijv. "TOM POLET", "KLAAS-JAN BURGLER"
   */
  private detectAllCapsNames(text: string): DetectedName[] {
    const results: DetectedName[] = [];

    // Zoek 2+ opeenvolgende ALL-CAPS woorden (min 2 letters elk)
    const pattern = /(?:^|(?<=[\s.,;:!?()"']))([A-ZÀ-Ý]{2,}(?:-[A-ZÀ-Ý]{2,})?)(?:\s+(?:VAN|DE|DEN|DER|HET|TE|TEN|TER)\s+)?(\s+[A-ZÀ-Ý]{2,}(?:-[A-ZÀ-Ý]{2,})?)(?=[\s.,;:!?()"']|$)/gm;
    let match;

    while ((match = pattern.exec(text)) !== null) {
      const fullMatch = match[0];
      const words = fullMatch.split(/\s+/).filter(w => w.length > 0);

      // Filter tussenvoegsel-woorden uit voor naamcontrole
      const nameWords = words.filter(w =>
        !/^(?:VAN|DE|DEN|DER|HET|TE|TEN|TER)$/i.test(w)
      );

      if (nameWords.length < 2) continue;

      // Controleer of titel-case versies bekende namen zijn
      const firstTitle = toTitleCase(nameWords[0]);
      const lastTitle = toTitleCase(nameWords[nameWords.length - 1]);

      const hasKnownFirst = this.isKnownFirstName(firstTitle);
      const hasKnownLast = this.lastNameSet.has(lastTitle) || this.isLikelySurname(lastTitle);

      if (hasKnownFirst || hasKnownLast) {
        results.push({
          original: fullMatch,
          type: 'name',
          start: match.index,
          end: match.index + fullMatch.length,
        });
      }
    }

    return results;
  }

  // === Pass 7-8: Entity propagation en contextuele detectie ===

  /**
   * Pass 7: Entity propagation
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
   * Pass 8: Contextuele standalone voornamen
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

  // === Ronde 2: Agressieve herdetectie ===

  /**
   * Pass 9: Agressieve tweede ronde
   *
   * Na de eerste ronde kijken we opnieuw naar de tekst en zoeken we
   * agressiever naar resterende naam-achtige tokens. Dit helpt bij:
   * - Onbekende achternamen naast bekende voornamen
   * - Losse voornamen die in de buurt staan van al-gevonden namen
   * - Gekapitaliseerde woorden op regels waar al namen gevonden zijn
   *
   * In de zorgcontext is over-redactie (een woord te veel weghalen)
   * acceptabeler dan een naam missen.
   */
  private detectAggressiveSecondPass(text: string, existingDetections: DetectedName[]): DetectedName[] {
    const results: DetectedName[] = [];

    // Strategie A: Als een bekende voornaam gevonden is maar niet als volledige naam,
    // kijk of het volgende gekapitaliseerde woord een onbekende achternaam kan zijn
    const wordPattern = /(?:^|(?<=[\s.,;:!?()"']))([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)(?=[\s.,;:!?()"']|$)/gm;
    let match;

    while ((match = wordPattern.exec(text)) !== null) {
      const word = match[1];
      const pos = match.index;

      if (isCommonWord(word)) continue;
      if (this.isPositionCovered(pos, pos + word.length, existingDetections, results)) continue;

      // Als dit een bekende voornaam is, kijk agressiever naar wat er na komt
      if (this.isKnownFirstName(word)) {
        const afterFirst = text.slice(pos + word.length);

        // Probeer uit te breiden met een onbekend maar gekapitaliseerd woord
        // (lossere eis dan in Pass 2: geen achternaamcontrole nodig)
        for (const prefix of this.prefixPatterns) {
          const prefixPat = new RegExp(
            `^\\s+${prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+([A-ZÀ-ÿ][a-zà-ÿ]+)(?=[\\s.,;:!?()"']|$)`,
            'i'
          );
          const pm = prefixPat.exec(afterFirst);
          if (pm && !isCommonWord(pm[1])) {
            const fullName = `${word}${pm[0]}`;
            results.push({ original: fullName, type: 'name', start: pos, end: pos + fullName.length });
            wordPattern.lastIndex = pos + fullName.length;
            break;
          }
        }

        // Direct volgend gekapitaliseerd woord dat niet common is
        if (!this.isPositionCovered(pos, pos + word.length, existingDetections, results)) {
          const directMatch = /^\s+([A-ZÀ-ÿ][a-zà-ÿ]{2,})(?=[\s.,;:!?()"']|$)/.exec(afterFirst);
          if (directMatch && !isCommonWord(directMatch[1])) {
            const possibleLast = directMatch[1];
            // Controleer of dit woord in de buurt van andere namen staat (zelfde paragraaf)
            const paragraphStart = text.lastIndexOf('\n\n', pos);
            const paragraphEnd = text.indexOf('\n\n', pos);

            // Als er al namen in deze paragraaf zijn gevonden, is dit waarschijnlijk ook een naam
            const hasNamesInParagraph = existingDetections.some(d =>
              d.start >= (paragraphStart === -1 ? 0 : paragraphStart) &&
              d.end <= (paragraphEnd === -1 ? text.length : paragraphEnd)
            );

            if (hasNamesInParagraph || this.isLikelySurname(possibleLast)) {
              const fullName = `${word}${directMatch[0]}`;
              results.push({ original: fullName, type: 'name', start: pos, end: pos + fullName.length });
              wordPattern.lastIndex = pos + fullName.length;
            }
          }
        }
      }
    }

    // Strategie B: Losse bekende voornamen die in de buurt van al-gevonden namen staan
    // (zachter dan Pass 8 — hier hoeft geen werkwoord of voorzetsel bij)
    const nameWordPattern = /(?:^|(?<=[\s.,;:!?()"']))([A-ZÀ-ÿ][a-zà-ÿ]+(?:-[A-ZÀ-ÿ][a-zà-ÿ]+)*)(?=[\s.,;:!?()"']|$)/gm;
    let m2;

    while ((m2 = nameWordPattern.exec(text)) !== null) {
      const word = m2[1];
      const pos = m2.index;

      if (!this.isKnownFirstName(word)) continue;
      if (isCommonWord(word)) continue;
      if (this.isPositionCovered(pos, pos + word.length, existingDetections, results)) continue;

      // Kijk of er namen in de buurt staan (binnen 200 tekens)
      const nearbyRange = 200;
      const hasNearbyName = existingDetections.some(d =>
        Math.abs(d.start - pos) < nearbyRange || Math.abs(d.end - pos) < nearbyRange
      );

      if (hasNearbyName) {
        results.push({ original: word, type: 'name', start: pos, end: pos + word.length });
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

    const lower = word.toLowerCase();

    // Typische Nederlandse achternaam-achtervoegsels
    const suffixes = [
      // Klassiek
      'man', 'mans', 'stra', 'sma', 'ema', 'inga', 'ink',
      'sen', 'ssen', 'son',
      // Topografisch
      'berg', 'dijk', 'meer', 'veld', 'kamp', 'huis', 'huizen',
      'hoven', 'hoek', 'broek', 'bos', 'boom', 'beek', 'horst',
      'laar', 'wijk', 'dam', 'donk', 'loo', 'stein', 'veen',
      'daal', 'laan', 'poort', 'kerk', 'hof', 'brug', 'sloot',
      'woud', 'aard',
      // Beroep/eigenschap
      'ler', 'ner', 'ker', 'ger',
      // Patroniem
      'ens', 'ink', 'ling',
    ];

    if (suffixes.some(s => lower.endsWith(s))) return true;

    // Typische Nederlandse achternaam-voorvoegsels
    const prefixes = ['over', 'onder', 'oost', 'west', 'noord', 'zuid'];
    if (prefixes.some(p => lower.startsWith(p)) && word.length > 5) return true;

    return false;
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

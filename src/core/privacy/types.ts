/**
 * Privacy Filter Types
 *
 * Definities voor het detecteren en filteren van
 * persoonsgegevens (PII) uit documenten.
 */

export type PrivacyDataType =
  | 'bsn'        // Burgerservicenummer
  | 'date'       // Geboortedatums en andere datums
  | 'name'       // Voor- en achternamen
  | 'iban'       // Bankrekeningnummers
  | 'email'      // E-mailadressen
  | 'phone'      // Telefoonnummers
  | 'postcode'   // Nederlandse postcodes
  | 'address';   // Straatnamen met huisnummer

export interface PrivacyMatch {
  /** Placeholder die in de tekst komt, bijv. "[BSN-001]" */
  placeholder: string;
  /** Originele waarde */
  original: string;
  /** Type gevoelige data */
  type: PrivacyDataType;
  /** Start positie in originele tekst */
  startOffset: number;
  /** Eind positie in originele tekst */
  endOffset: number;
}

export interface PrivacyFilterResult {
  /** Tekst met alle gevoelige data vervangen door placeholders */
  filteredText: string;
  /** Alle gevonden en vervangen items */
  matches: PrivacyMatch[];
  /** Samenvatting per type */
  stats: PrivacyStats;
}

export interface PrivacyStats {
  /** Aantal gevonden items per type */
  counts: Record<PrivacyDataType, number>;
  /** Totaal aantal gevonden items */
  total: number;
}

export interface PrivacyFilterConfig {
  /** Welke types data filteren (standaard: allemaal aan) */
  enabledTypes?: PrivacyDataType[];
  /** Extra woorden/namen om te filteren */
  customNames?: string[];
  /** Woorden die NIET gefilterd moeten worden */
  excludeWords?: string[];
  /** Placeholder stijl: 'bracket' = [BSN-001], 'redacted' = ████████ */
  placeholderStyle?: 'bracket' | 'redacted';
}

export const ALL_PRIVACY_TYPES: PrivacyDataType[] = [
  'bsn', 'date', 'name', 'iban', 'email', 'phone', 'postcode', 'address',
];

export const PRIVACY_TYPE_LABELS: Record<PrivacyDataType, string> = {
  bsn: 'BSN-nummers',
  date: 'Datums',
  name: 'Namen',
  iban: 'IBAN-nummers',
  email: 'E-mailadressen',
  phone: 'Telefoonnummers',
  postcode: 'Postcodes',
  address: 'Adressen',
};

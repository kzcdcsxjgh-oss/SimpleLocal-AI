/**
 * Test script voor anonymisatie filtering
 *
 * Dit script test of de PrivacyFilter alle gevoelige data in het testdocument kan detecteren.
 */

import { PrivacyFilter } from './src/core/privacy/privacy-filter';

const TEST_DOCUMENT = `Cliëntdossier – testdocument anonimisatie (dummy data)Datum opmaak: 07-02-2026Organisatie: Stichting Zonnewende Zorg (test)Locatie: De Lijsterhof, afdeling 2B
In dit document staan testgegevens die uitsluitend bedoeld zijn om het anonimiseren te testen. De cliënt is geregistreerd onder de naam mevrouw Anna de Vries, geboren op 14-03-1948, met een test-BSN 123456782. De contactpersoon is haar zoon, de heer Jeroen de Vries, telefoonnummer 06-12345678 en e-mailadres jeroen.devries@testmail.example. Als tweede contactpersoon staat vermeld: "M. van der Meer" (mantelzorger), bereikbaar via 020 123 45 67 en via m.vandermeer@testmail.example.
Het bezoekadres van de cliënt staat genoteerd als: Parklaan 12, 1017 AB Amsterdam. Het factuuradres staat apart vermeld als: t.a.v. A. de Vries, Postbus 203, 1000 AE Amsterdam. In het ECD is daarnaast een oud adres terug te vinden: Van Woustraat 99 hs, 1074 AD Amsterdam, met een notitie dat dit adres niet meer actueel is sinds 01-09-2022.
In het ECD is daarnaast een oud adres terug te vinden: Van Woustraat 99 hs, 1074 AD Amsterdam, met een notitie dat dit adres niet meer actueel is sinds 01-09-2022.
Tijdens het intakegesprek was wijkverpleegkundige drs. Sanne Jansen aanwezig, samen met verzorgende IG Pieter-Jan Kuipers. In het verslag is opgenomen dat Sanne Jansen de medicatielijst heeft doorgenomen en dat Pieter-Jan Kuipers de thuissituatie heeft besproken. De huisarts die in het systeem staat is "Dr. A. Smit", praktijk "Huisartsenpraktijk De Brug", telefoon 010-98765432. Als apotheek staat geregistreerd: Apotheek 't Centrum, tel. 035-1112233, met contactpersoon "Fatima El Amrani".
A. Smit", praktijk "Huisartsenpraktijk De Brug", telefoon 010-98765432. Als apotheek staat geregistreerd: Apotheek 't Centrum, tel. 035-1112233, met contactpersoon "Fatima El Amrani".
In de dagelijkse rapportage van 05-02-2026 is geschreven dat Anna de Vries onrustig was in de ochtend en vroeg naar "Lotte". Later op de dag werd vermeld dat "Mevr. de Vries" meer ontspannen was na bezoek van Jeroen. In een korte notitie staat ook: "mw Devries vroeg naar haar zus: Marijke." In een andere regel staat de naam in omgekeerde volgorde: "De Vries, Anna" en in een overdrachtsregel staat alleen: "A. de Vries".
naam in omgekeerde volgorde: "De Vries, Anna" en in een overdrachtsregel staat alleen: "A. de Vries".
Er is een medisch meetmoment geregistreerd met als identificatie: cliëntnummer CL-948271, en een tweede registratienummer: Dossier-ID 2026/02/07-XY. In het systeem staat ook een personeelsverwijzing naar medewerker "Nienke van 't Hof", met telefoon 06 87654321. In een bijlage staat een afspraakbevestiging met de naam "Jean-Luc van Damme" als fysiotherapeut, praktijkadres: Keizersgracht 5, 1015 CC Amsterdam, e-mail: jeanluc.vandamme@testmail.example.
Onderstaande passage bevat expres lastige tekstopmaak zoals afbrekingen en regeleinden, zodat je kunt testen of namen alsnog blijven staan door PDF/OCR-achtige ruis.De cliënt is gezien door Mevr. An-na de Vries en haar contactpers-oon Jeroen de Vries. De zorgme-dewerker P. J. Kuipers heeft toe-lichting gegeven over het plan.
An-na de Vries en haar contactpers-oon Jeroen de Vries. De zorgme-dewerker P. J. Kuipers heeft toe-lichting gegeven over het plan.
In het zorgplan staat dat de cliënt hulp nodig heeft bij ADL en dat de medicatie wordt toegediend volgens schema. In de opmerkingen is genoteerd dat "Sanne" heeft gebeld met "Fatima" van de apotheek over een herhaalrecept. Verder staat in de vrije tekst: "Graag terugkoppelen aan Van der Meer (mantelzorger) na het weekend."
Er is ook een losse regel opgenomen met alleen hoofdletters om te testen op herkenning van namen in caps: "CONTACT: JEROEN DE VRIES". Verder staat er een variant met een tussenvoegsel en meerdere spaties: "Anna van der Velde" en een variant met een koppelteken: "Noor-Jane Koster-van Dijk". In een interne notitie staat een e-mailhandtekening met naam en mobiele nummer: "Met vriendelijke groet, Bram Oosterhuis | 06-22223333".
In een interne notitie staat een e-mailhandtekening met naam en mobiele nummer: "Met vriendelijke groet, Bram Oosterhuis | 06-22223333".
Voor testdoeleinden staan hieronder extra identifiers die je tool zou moeten weghalen, zoals geboortedata, telefoonnummers, e-mails en test-BSN's (niet-elfproef).De heer K. Bakker, geboren op 01-01-1970, test-BSN 987654321, telefoon 088-1200300, e-mail: k.bakker@testmail.example.Mevrouw L. van Rijn, geboren 31-12-1962, test-BSN 111222334, telefoon +31 6 99998888, e-mail: l.vanrijn@testmail.example.De heer "O. Çelik", geboortedatum 02-02-1982, test-BSN 222333445, telefoon 070 333 44 55, e-mail: o.celik@testmail.example.Mevrouw "Zoë d'Angelo", geboortedatum 10-10-1990, test-BSN 333444556, telefoon 030-4445566, e-mail: zoe.dangelo@testmail.example.
geboortedatum 10-10-1990, test-BSN 333444556, telefoon 030-4445566, e-mail: zoe.dangelo@testmail.example.
Tot slot staat er een korte passage met alleen initialen en achternaam, omdat die vaak gemist wordt door naïeve filters: "Overleg gehad met J.B. de Wit en M.C. van Leeuwen over vervolgafspraak." Ook staat er een passage met een naam tussen aanhalingstekens: "Cliënt noemde 'Hicham' en 'Elize' als vertrouwde gezichten." In de bijlage staat één regel met "BSN: 444555667" en één regel met "Tel: 06–10101010", waarbij het streepje expres anders is dan normaal.`;

// Lijst van verwachte namen die gedetecteerd moeten worden
const EXPECTED_NAMES = [
  'Anna de Vries',
  'Jeroen de Vries',
  'M. van der Meer',
  'Sanne Jansen',
  'Pieter-Jan Kuipers',
  'A. Smit',
  'Fatima El Amrani',
  'Lotte',
  'Marijke',
  'Nienke van \'t Hof',
  'Jean-Luc van Damme',
  'P. J. Kuipers',
  'Van der Meer',
  'Anna van der Velde',
  'Noor-Jane Koster-van Dijk',
  'Bram Oosterhuis',
  'K. Bakker',
  'L. van Rijn',
  'O. Çelik',
  'Zoë d\'Angelo',
  'J.B. de Wit',
  'M.C. van Leeuwen',
  'Hicham',
  'Elize',
  'De Vries, Anna',
  'A. de Vries',
  'Anna', // losse vermelding
  'Jeroen', // losse vermelding
  'Sanne', // losse vermelding
  'Fatima', // losse vermelding
];

// Run the test
console.log('🧪 Testing Privacy Filter met Nederlands zorgdocument\n');
console.log('📄 Document lengte:', TEST_DOCUMENT.length, 'karakters\n');

const filter = new PrivacyFilter({
  placeholderStyle: 'bracket'
});

const result = filter.filter(TEST_DOCUMENT);

console.log('📊 RESULTATEN:\n');
console.log('Totaal gevonden items:', result.stats.total);
console.log('\nPer type:');
for (const [type, count] of Object.entries(result.stats.counts)) {
  if (count > 0) {
    console.log(`  ${type}: ${count}`);
  }
}

console.log('\n📝 GEVONDEN NAMEN:');
const foundNames = result.matches.filter(m => m.type === 'name');
console.log(`Totaal: ${foundNames.length} namen gevonden\n`);

// Groepeer namen per unieke waarde
const uniqueNames = new Map<string, number>();
for (const match of foundNames) {
  const count = uniqueNames.get(match.original) || 0;
  uniqueNames.set(match.original, count + 1);
}

// Sorteer en toon
const sortedNames = Array.from(uniqueNames.entries()).sort((a, b) => a[0].localeCompare(b[0]));
for (const [name, count] of sortedNames) {
  console.log(`  "${name}" (${count}x)`);
}

console.log('\n❌ MOGELIJK GEMISTE NAMEN:');
const foundNamesSet = new Set(foundNames.map(m => m.original.toLowerCase()));
const missedNames: string[] = [];

for (const expectedName of EXPECTED_NAMES) {
  const normalized = expectedName.toLowerCase();
  let found = false;

  // Check exacte match of als onderdeel van andere match
  for (const foundName of foundNames) {
    const foundNormalized = foundName.original.toLowerCase();
    if (foundNormalized === normalized ||
        foundNormalized.includes(normalized) ||
        normalized.includes(foundNormalized)) {
      found = true;
      break;
    }
  }

  if (!found) {
    missedNames.push(expectedName);
  }
}

if (missedNames.length > 0) {
  for (const name of missedNames) {
    console.log(`  ⚠️  "${name}"`);
  }
  console.log(`\n⚠️  Totaal gemist: ${missedNames.length}/${EXPECTED_NAMES.length}`);
} else {
  console.log('  ✅ Alle verwachte namen zijn gevonden!');
}

console.log('\n📧 GEVONDEN EMAILS:');
const foundEmails = result.matches.filter(m => m.type === 'email');
for (const match of foundEmails) {
  console.log(`  ${match.original}`);
}

console.log('\n📞 GEVONDEN TELEFOONNUMMERS:');
const foundPhones = result.matches.filter(m => m.type === 'phone');
for (const match of foundPhones) {
  console.log(`  ${match.original}`);
}

console.log('\n🆔 GEVONDEN BSN-NUMMERS:');
const foundBSN = result.matches.filter(m => m.type === 'bsn');
for (const match of foundBSN) {
  console.log(`  ${match.original}`);
}

console.log('\n📅 GEVONDEN DATUMS:');
const foundDates = result.matches.filter(m => m.type === 'date');
for (const match of foundDates) {
  console.log(`  ${match.original}`);
}

console.log('\n🏠 GEVONDEN ADRESSEN:');
const foundAddresses = result.matches.filter(m => m.type === 'address');
for (const match of foundAddresses) {
  console.log(`  ${match.original}`);
}

console.log('\n📮 GEVONDEN POSTCODES:');
const foundPostcodes = result.matches.filter(m => m.type === 'postcode');
for (const match of foundPostcodes) {
  console.log(`  ${match.original}`);
}

console.log('\n\n📄 GEANONIMISEERDE TEKST (eerste 1000 karakters):');
console.log('─'.repeat(80));
console.log(result.filteredText.slice(0, 1000));
console.log('─'.repeat(80));

// Export results to file for analysis
import { writeFileSync } from 'fs';
writeFileSync(
  '/home/user/SimpleLocal-AI/test-anonymization-results.json',
  JSON.stringify(
    {
      stats: result.stats,
      matches: result.matches,
      missedNames,
      filteredText: result.filteredText,
    },
    null,
    2
  )
);

console.log('\n💾 Volledige resultaten opgeslagen in: test-anonymization-results.json\n');

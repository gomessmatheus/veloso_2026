/**
 * src/lib/brands.js
 *
 * Pure helpers for the Brand entity.
 * No side-effects — all async work is in db.js / App.jsx.
 *
 * Brand shape (JS, no TypeScript):
 * {
 *   id:                   string,
 *   name:                 string,   // "Netshoes"
 *   slug:                 string,   // "netshoes"
 *   category:             string,   // key of BRAND_CATEGORIES
 *   primaryColor:         string,   // hex, inferred from first contract color
 *   contact: {
 *     name?:  string,
 *     email?: string,
 *     phone?: string,
 *     role?:  string,
 *   },
 *   exclusivityWindowDays: number,  // default 7, for future conflict detection
 *   recurringBriefing:    string,   // briefing permanente da marca (≠ contract.briefingNote)
 *   notes:                string,
 *   logoUrl?:             string,
 *   createdAt:            string,   // ISO
 *   updatedAt:            string,   // ISO
 * }
 */

export const BRAND_CATEGORIES = {
  VAREJO_ESPORTIVO: "Varejo Esportivo",
  BANCO:            "Banco / Fintech",
  BEBIDA:           "Bebida",
  TELCO:            "Telecom",
  AUTOMOTIVO:       "Automotivo",
  BEAUTY:           "Beauty",
  FOOD:             "Food & Beverage",
  TECH:             "Tech",
  GAMING:           "Gaming",
  STREAMING:        "Streaming",
  VIAGEM:           "Viagem",
  ENTRETENIMENTO:   "Entretenimento",
  OUTROS:           "Outros",
};

/**
 * Convert a brand name to a URL/ID-safe slug.
 * "Cacau Show" → "cacau-show"
 * @param {string} str
 * @returns {string}
 */
export function slugify(str) {
  if (!str) return "";
  return String(str)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")   // remove diacritics
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Guess a brand category from its name.
 * Falls back to "OUTROS" when no match is found.
 * @param {string} name
 * @returns {string}  key of BRAND_CATEGORIES
 */
export function inferCategory(name) {
  const n = (name || "").toLowerCase();
  if (/netshoes|decathlon|centauro|nike|adidas|puma|asics|umbro/.test(n)) return "VAREJO_ESPORTIVO";
  if (/coca.cola|pepsi|heineken|ambev|brahma|guaraná|redbull/.test(n)) return "BEBIDA";
  if (/kabum|samsung|intel|amd|logitech|razer|corsair/.test(n)) return "GAMING";
  if (/diamond|filmes|cinema|netflix|warner|disney|universal/.test(n)) return "ENTRETENIMENTO";
  if (/decolar|latam|airbnb|booking|hoteis|tripadvisor/.test(n)) return "VIAGEM";
  if (/cacau|tramontina|sadia|perdigão|nestlé|mondelez|ifood/.test(n)) return "FOOD";
  if (/paco.rabanne|natura|o.boticário|avon|loreal|nivea/.test(n)) return "BEAUTY";
  if (/claro|vivo|tim|oi|nextel|telecom/.test(n)) return "TELCO";
  if (/banco|bradesco|itaú|nubank|inter|c6|picpay|fintech/.test(n)) return "BANCO";
  if (/tesla|toyota|honda|chevrolet|volkswagen|hyundai|ford/.test(n)) return "AUTOMOTIVO";
  return "OUTROS";
}

/**
 * Run the one-time migration: infer Brand entities from existing contracts.
 *
 * Idempotent: guarded by localStorage flag "brands_migrated_v1".
 * Safe to call twice — will exit immediately on the second call.
 *
 * Algorithm:
 *   1. Group contracts by normalized company name.
 *   2. For each unique name, find existing brand (by slug) or create new one.
 *   3. Stamp each contract with its brandId (skip if already set).
 *   4. Persist brands and updated contracts.
 *   5. Set localStorage flag.
 *
 * @param {{
 *   contracts:    object[],
 *   brands:       object[],
 *   saveBrands:   (brands: object[]) => Promise<void>,
 *   saveContracts:(contracts: object[]) => Promise<void>,
 *   uid:          () => string,
 * }} params
 */
export async function runBrandsMigration({ contracts, brands, saveBrands, saveContracts, uid }) {
  const FLAG = "brands_migrated_v1";
  if (localStorage.getItem(FLAG) === "true") return;

  const now = new Date().toISOString();
  const newBrands      = [...brands];
  const updatedContracts = contracts.map(c => ({ ...c }));
  let changed = false;

  // Group contracts by normalised company name
  const grouped = {};
  contracts.forEach(c => {
    const key = slugify(c.company || "sem-nome");
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(c);
  });

  Object.entries(grouped).forEach(([slug, group]) => {
    const representativeContract = group[0];

    // Find or create brand
    let brand = newBrands.find(b => b.slug === slug);
    if (!brand) {
      brand = {
        id:                   uid(),
        name:                 representativeContract.company || "Sem nome",
        slug,
        category:             inferCategory(representativeContract.company || ""),
        primaryColor:         representativeContract.color || "#374151",
        contact:              {},
        exclusivityWindowDays: 7,
        recurringBriefing:    "",
        notes:                "",
        createdAt:            now,
        updatedAt:            now,
      };
      newBrands.push(brand);
      changed = true;
    }

    // Stamp contracts that don't have a brandId yet
    group.forEach(c => {
      const idx = updatedContracts.findIndex(x => x.id === c.id);
      if (idx !== -1 && !updatedContracts[idx].brandId) {
        updatedContracts[idx].brandId = brand.id;
        changed = true;
      }
    });
  });

  if (changed) {
    await saveBrands(newBrands);
    await saveContracts(updatedContracts);
  }

  localStorage.setItem(FLAG, "true");
}

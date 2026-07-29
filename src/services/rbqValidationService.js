// =============================================================================
// RBQ (Régie du bâtiment du Québec) License Validation Service
// =============================================================================
//
// The RBQ registry at https://www.pes.rbq.gouv.qc.ca/RegistreLicences is a
// JavaScript SPA — plain HTTP requests only return a loading shell, so we
// can't scrape it with a bare `fetch()`. Real validation requires either:
//   (a) The XHR endpoint the SPA calls internally (best — one HTTP call,
//       JSON response). Discovery: open the site, DevTools → Network, run a
//       search for a real license, copy the request URL/method/body/response.
//       Then fill in `queryRBQRegistry` below.
//   (b) A headless browser (puppeteer/playwright) to render the SPA — heavy,
//       ~3-5 s per lookup, ~200 MB Chromium. Not implemented here.
//   (c) A third-party paid API. Set env `RBQ_VENDOR=xxx` and the endpoint,
//       then swap out `queryRBQRegistry`.
//
// Until (a)/(b)/(c) is in place, `queryRBQRegistry` returns
// `{ ok: false, reason: 'unavailable' }` and the caller decides what to do
// (see RBQ_VALIDATION_ENABLED in registrationController).
//
// Public API:
//   validateRBQLicense(licenseNumber) → {
//     ok:           boolean   // was the RBQ lookup successful?
//     status:       'valid' | 'restricted' | 'invalid'
//     holderName:   string?
//     restrictions: string[]?
//     reason:       string?   // when ok=false: 'bad-format' | 'unavailable' | 'error'
//     checkedAt:    ISO string
//   }
// =============================================================================

import pool from "../config/db.js";

// -----------------------------------------------------------------------------
// Format helpers
// -----------------------------------------------------------------------------

// RBQ licenses in Quebec are 10 digits, canonical form `NNNN-NNNN-NN`
// (e.g. 5715-1234-01). Users often paste "5715123401" or "RBQ 5715-1234-01".
// normalise strips everything but digits, then re-inserts dashes.
export const normaliseRBQLicense = (raw) => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  if (digits.length !== 10) return null;
  return `${digits.slice(0, 4)}-${digits.slice(4, 8)}-${digits.slice(8, 10)}`;
};

export const isValidRBQFormat = (raw) => normaliseRBQLicense(raw) !== null;

// -----------------------------------------------------------------------------
// Cache: results are TTL-cached in the DB itself (entrepreneur_profiles) but a
// process-level cache dedupes back-to-back lookups during a debounced typing
// session on the frontend. 12 hours matches the DB revalidation cadence.
// -----------------------------------------------------------------------------

const memoryCache = new Map(); // license → { result, expiresAt }
const CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const readCache = (license) => {
  const hit = memoryCache.get(license);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    memoryCache.delete(license);
    return null;
  }
  return hit.result;
};

const writeCache = (license, result) => {
  memoryCache.set(license, { result, expiresAt: Date.now() + CACHE_TTL_MS });
};

// -----------------------------------------------------------------------------
// The one function you (or a follow-up dev) need to actually implement.
//
// Task: replace the body with a real HTTP call to the RBQ registry XHR endpoint
//       (found via browser DevTools) OR a paid vendor's API. Return one of:
//
//   { ok: true,  status: 'valid',      holderName, restrictions: [] }
//   { ok: true,  status: 'restricted', holderName, restrictions: [...] }
//   { ok: true,  status: 'invalid' }   // RBQ returned "no such licence"
//   { ok: false, reason: 'unavailable' | 'error' }
//
// KEEP the fetch wrapped in try/catch — one RBQ hiccup shouldn't crash the
// registration flow. Reason 'unavailable' vs 'error' matters for the caller:
// 'unavailable' means "try again later"; 'error' means something we didn't
// expect (log it, maybe alert).
// -----------------------------------------------------------------------------
// -----------------------------------------------------------------------------
// Real RBQ registry call.
//
// Endpoint discovered from the public search SPA at
// https://www.pes.rbq.gouv.qc.ca/RegistreLicences (DevTools → Network →
// "Rechercher" XHR). The SPA POSTs a large search-criteria envelope to
// /APIPROXY/RBQ.Registre.API/Licence/Rechercher and receives:
//
//   { retour: { criteresRecherche: {...}, licences: [] },
//     succes: boolean,
//     messages: [] }
//
// * `licences` is empty when no match found → we treat that as 'invalid'.
// * `licences[0]` populated → 'valid' (with best-effort restriction detection —
//   see notes inside handleLicenceRecord; refine once we have a real sample).
//
// The RBQ server checks Origin/Referer; we send both so the reverse proxy
// accepts the call the same way it accepts the browser's XHR.
// -----------------------------------------------------------------------------
const RBQ_ENDPOINT =
  process.env.RBQ_LOOKUP_URL ||
  "https://www.pes.rbq.gouv.qc.ca/APIPROXY/RBQ.Registre.API/Licence/Rechercher";
const RBQ_ORIGIN =
  process.env.RBQ_ORIGIN || "https://www.pes.rbq.gouv.qc.ca";

// Try to decide whether the licence has active restrictions. We don't yet
// have a confirmed shape for a real hit (empty array on the test search), so
// this is defensive: look at a couple of plausible field names and default
// to 'valid' when unclear. Real records will be logged so we can tighten this.
const detectRestrictions = (licence) => {
  if (!licence || typeof licence !== "object") return [];
  const candidates = [
    licence.restrictions,
    licence.Restrictions,
    licence.limitations,
    licence.Limitations,
  ].filter((v) => Array.isArray(v) && v.length > 0);
  if (candidates.length > 0) return candidates[0].map((r) => (typeof r === "string" ? r : (r?.description || JSON.stringify(r))));
  // Textual "état" field with a non-active value counts as a restriction indicator.
  const state = licence.etat || licence.Etat || licence.statut || licence.Statut;
  if (typeof state === "string" && /suspend|annul|revoqu|expir|limit/i.test(state)) {
    return [state];
  }
  return [];
};

const holderNameOf = (licence) =>
  licence?.nomEntreprise ||
  licence?.NomEntreprise ||
  licence?.raisonSociale ||
  licence?.RaisonSociale ||
  licence?.nom ||
  licence?.Nom ||
  null;

const queryRBQRegistry = async (license) => {
  // Body mirrors the SPA payload verbatim. Most fields are echoed back
  // unchanged and don't affect the search; `NoLicence` +
  // `RechercheParNoLicence: true` are what actually drive the lookup.
  const body = {
    IdDetail: "",
    CriteresFicheRepondant: { IdInterlocuteur: null, IdLicence: null },
    CriteresRecherche: {
      CategorieCertificat: "Catégories 1 et 2",
      CodePostal: "",
      CodeRegionAdministrative: null,
      DistanceMaximale: null,
      IdSousCategories: [],
      Latitude: 0,
      Longitude: 0,
      NEQ: null,
      NoCertificat: null,
      NoLicence: license,
      NoTelephone: null,
      Nom: null,
      NomEntreprise: null,
      Prenom: null,
      RechercheParNoLicence: true,
      RegionAdministrativeHorsQuebec: false,
      TypeRechercheRegion: 0,
    },
    ListeCriteres: { NoLicence: license },
    ListeTexteCriteresSaisie: [license],
    ModeRecherche: 1,
  };

  let res;
  try {
    res = await fetch(RBQ_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Accept": "application/json",
        "Origin": RBQ_ORIGIN,
        "Referer": `${RBQ_ORIGIN}/RegistreLicences/ResultatRecherche?mode=Entreprise`,
        "User-Agent":
          "Mozilla/5.0 Intervos (contractor licence verification; contact@intervos.ai)",
      },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // Network-level failure (DNS, TLS, timeout, offline). Retryable.
    console.error("❌ RBQ registry unreachable:", err.message);
    return { ok: false, reason: "unavailable" };
  }

  if (!res.ok) {
    console.error(`❌ RBQ registry returned HTTP ${res.status}`);
    return { ok: false, reason: res.status >= 500 ? "unavailable" : "error" };
  }

  let data;
  try {
    data = await res.json();
  } catch (err) {
    console.error("❌ RBQ registry returned non-JSON body:", err.message);
    return { ok: false, reason: "error" };
  }

  if (data?.succes !== true) {
    console.warn("⚠️ RBQ registry replied with succes=false:", data?.messages);
    return { ok: false, reason: "error" };
  }

  const licences = Array.isArray(data?.retour?.licences) ? data.retour.licences : [];
  if (licences.length === 0) {
    return { ok: true, status: "invalid", licenceNumber: license };
  }

  // Log the raw first record ONCE per licence lookup so we can tighten the
  // parsing (holder name + restrictions field names) once we see a real hit.
  const licence = licences[0];
  console.log("🔍 RBQ registry hit — record shape:", Object.keys(licence));

  const restrictions = detectRestrictions(licence);
  return {
    ok: true,
    status: restrictions.length ? "restricted" : "valid",
    holderName: holderNameOf(licence),
    restrictions,
    licenceNumber: license,
  };
};

// -----------------------------------------------------------------------------
// Public entry
// -----------------------------------------------------------------------------
export const validateRBQLicense = async (rawLicense) => {
  const checkedAt = new Date().toISOString();

  const licenseNumber = normaliseRBQLicense(rawLicense);
  if (!licenseNumber) {
    return {
      ok: false,
      reason: "bad-format",
      checkedAt,
    };
  }

  const cached = readCache(licenseNumber);
  if (cached) return { ...cached, checkedAt };

  let result;
  try {
    result = await queryRBQRegistry(licenseNumber);
  } catch (err) {
    console.error("❌ RBQ registry query threw:", err);
    result = { ok: false, reason: "error" };
  }

  const enriched = { ...result, licenseNumber, checkedAt };
  writeCache(licenseNumber, enriched);
  return enriched;
};

// -----------------------------------------------------------------------------
// Persistence — called after registration + on ad-hoc re-checks. Updates the
// entrepreneur's RBQ columns with the latest lookup result.
// -----------------------------------------------------------------------------
export const persistRBQResult = async (entrepreneurProfileId, result) => {
  if (!entrepreneurProfileId) return;
  const status =
    !result.ok
      ? "unverified"
      : result.status === "valid"
        ? "valid"
        : result.status === "restricted"
          ? "restricted"
          : "invalid";

  const verifiedAt =
    result.ok && result.status === "valid" ? new Date() : null;

  await pool.query(
    `UPDATE entrepreneur_profiles
     SET rbq_status       = $1,
         rbq_holder_name  = $2,
         rbq_restrictions = $3,
         rbq_checked_at   = now(),
         rbq_verified_at  = COALESCE($4, rbq_verified_at)
     WHERE id = $5`,
    [
      status,
      result.holderName || null,
      result.restrictions || null,
      verifiedAt,
      entrepreneurProfileId,
    ]
  );
};

// Feature flag helper. Registration only hard-blocks when RBQ_VALIDATION_ENABLED
// is truthy AND the queryRBQRegistry function has been wired to something real.
export const isRBQValidationEnabled = () =>
  String(process.env.RBQ_VALIDATION_ENABLED || "").toLowerCase() === "true";

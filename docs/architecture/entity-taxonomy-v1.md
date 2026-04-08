# Entity Taxonomy v1

Entities are the long-lived business objects that Signal monitors. They are the "nouns" — the things users watch, the things signals are linked to, the things watchlists group.

This document defines each canonical entity type for MVP, its purpose, fields, identity rules, and boundaries.

---

## Design Decisions

### Why these types and not others

The entity types below were selected because each one is:
1. **Referenced in real intelligence workflows** — board members ask "What's happening with [Competitor X]?" or "Any updates on [Project Y]?" — these are entity-scoped questions.
2. **Needed for entity resolution** — the pipeline must match source content against known entities. Without entity types, there is no matching vocabulary.
3. **Needed for signal linking** — every signal must reference at least one entity. The entity taxonomy defines what can be referenced.

### Why Person is NOT included in MVP

Person is excluded from the MVP entity taxonomy for these reasons:

1. **The product monitors institutional activity, not individuals.** The relevant question is "What is Enel doing?" not "What is [CEO name] doing?" Executive actions are modeled as events on the Organization entity, not as Person entity updates.
2. **Person identity resolution is disproportionately expensive.** People change roles, companies, and names. The same person may appear as "John Smith", "J. Smith", "Dr. John Smith, CEO of X Corp". Solving this reliably requires NER + disambiguation infrastructure that is not justified for MVP.
3. **Person names appear in events, not as watched entities.** If a CEO is mentioned in an earnings call, the CEO name is an `extractedFacts` field on the ExtractedEvent, not a separate entity. The signal links to the Organization.
4. **Adding Person later is additive.** If post-MVP user research reveals demand for person-level tracking (e.g., tracking key executives across the energy sector), Person can be added to the taxonomy without restructuring existing entities or signals.

**Exception:** If a person's name is critical for entity resolution (e.g., "Mario Rossi" is how users refer to a competitor's CEO in conversation), that name can be added as an alias on the Organization entity with a `context` field (e.g., `{ alias: "Mario Rossi", context: "CEO, as of 2025" }`). This is a pragmatic shortcut, not a Person entity.

---

## 1. Organization

**Business meaning:** A company, public body, agency, consortium, or institutional actor that Signal monitors or that appears in source content as a relevant party.

**Canonical purpose:** Primary entity type. Most signals will link to at least one Organization. Competitors, clients, partners, and regulators are all Organizations.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `entityId` | string | System-generated UUID |
| `entityType` | literal | `organization` |
| `canonicalName` | string | Official registered name (e.g., "Eni S.p.A.") |
| `role` | enum | `competitor`, `client`, `partner`, `regulator`, `industry_body`, `other` |
| `country` | string | ISO 3166-1 alpha-2 code of primary jurisdiction |
| `active` | boolean | Whether actively monitored |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `description` | string | Brief description (≤ 500 chars) |
| `sector` | string | Industry sector (energy, utilities, oil & gas, renewables, etc.) |
| `website` | string | Primary corporate website URL |
| `parentEntityId` | string | FK to parent Organization (for subsidiary modeling) |
| `geographyIds` | string[] | FKs to Geography entities where the org primarily operates |
| `logoUrl` | string | URL to logo image for dashboard display |

**Aliases and external identifiers:**

Stored in a sub-collection or embedded array `aliases[]`:

| Field | Type | Description |
|---|---|---|
| `value` | string | The alias text (e.g., "ENI", "Ente Nazionale Idrocarburi") |
| `type` | enum | `trade_name`, `abbreviation`, `former_name`, `local_name`, `ticker`, `lei`, `vat_id`, `brand`, `subsidiary_name`, `custom` |
| `context` | string | Optional note (e.g., "Pre-2024 name", "Used in Italian press") |

See [Relationships and Identity](relationships-and-identity-v1.md) for alias matching rules.

**Relationships:**
- **→ Signal:** An Organization is referenced by signals via `entityIds[]`.
- **→ Organization (parent):** Subsidiary relationship via `parentEntityId`. Unidirectional: child points to parent.
- **→ Geography:** Operational geography via `geographyIds[]`.
- **→ Source:** Sources may be associated with specific organizations (e.g., "Enel investor relations page" → Source linked to Enel entity). This is modeled on the Source, not the Organization.
- **→ Watchlist:** Organizations appear in watchlists via the Watchlist's `entityIds[]`.

**Storage:**
- **Firestore:** `entities/{entityId}` — full document including aliases.
- **BigQuery:** `entities` table — snapshot for analytical joins. Updated on entity CRUD via pipeline event.

**What MUST NOT be modeled on Organization:**
- Financial data (revenue, stock price). These are event/signal data, not entity properties.
- Historical name changes as separate entities. Use aliases with `type: 'former_name'`.
- Contact information or personnel. Not in scope for MVP.
- Source configuration. Sources are separate objects that may reference an entity.

---

## 2. Project

**Business meaning:** A named capital project, infrastructure initiative, or strategic program in the energy sector. Projects are long-running (months to years), have specific geographic footprints, and involve one or more organizations.

**Canonical purpose:** Enables tracking of specific initiatives across their lifecycle. Board members ask "What's the status of [Wind Farm X]?" or "Any new developments on [Pipeline Y]?" Projects are distinct from organizations because they have their own lifecycle, geography, and multi-org involvement.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `entityId` | string | System-generated UUID |
| `entityType` | literal | `project` |
| `canonicalName` | string | Official project name |
| `status` | enum | `announced`, `under_development`, `operational`, `decommissioned`, `unknown` |
| `active` | boolean | Whether actively monitored |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `description` | string | Brief description (≤ 500 chars) |
| `projectType` | string | `wind_farm`, `solar_plant`, `pipeline`, `lng_terminal`, `refinery`, `grid_infra`, `hydrogen`, `nuclear`, `other` |
| `ownerEntityIds` | string[] | Organizations that own or lead the project |
| `geographyIds` | string[] | Where the project is located |
| `capacityValue` | number | Capacity (MW, barrels/day, etc.) |
| `capacityUnit` | string | Unit of capacity |
| `estimatedCompletion` | string | Year or quarter if known |

**Aliases:** Projects may have multiple names (e.g., official name vs. media name vs. prior name). Same alias structure as Organization.

**Relationships:**
- **→ Organization:** Via `ownerEntityIds[]`. Multiple orgs may co-own a project.
- **→ Geography:** Via `geographyIds[]`.
- **→ Signal:** Referenced by signals about project milestones, awards, delays.

**Storage:** Firestore `entities/{entityId}`, BigQuery `entities` table.

### Project vs Tender

**Tenders are NOT entities. Tenders are events.**

A tender is a time-bounded opportunity — it appears in source content, gets extracted as an event (`tender_opportunity`), and may produce a signal. If a tender leads to a project award, the award is a separate event linked to the Project entity.

Rationale: Tenders are ephemeral. They open, close, and result in awards or cancellations. Users don't "watch" a tender the way they watch a project. They watch entities (organizations, geographies) and get alerted when tenders involving those entities appear. Making Tender a first-class entity would create thousands of short-lived entity records with no ongoing monitoring value.

If a tender is significant enough to track over time (e.g., a mega-tender for a national grid overhaul), it should be promoted to a Project entity with `status: 'announced'` when the award decision creates a lasting initiative.

---

## 3. Technology

**Business meaning:** A specific technology, technical approach, or energy technology category that the organization tracks for competitive intelligence.

**Canonical purpose:** Enables tracking of technology developments across organizations and projects. Board members ask "What's happening with hydrogen storage?" or "Any new CCUS announcements?"

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `entityId` | string | System-generated UUID |
| `entityType` | literal | `technology` |
| `canonicalName` | string | Standard name for the technology |
| `category` | string | `generation`, `storage`, `transmission`, `efficiency`, `carbon_capture`, `hydrogen`, `nuclear`, `digital`, `other` |
| `active` | boolean | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `description` | string | (≤ 500 chars) |
| `maturityLevel` | string | `emerging`, `demonstrated`, `commercial`, `mature` |

**Aliases:** Technologies have many name variants. "CCUS" = "Carbon Capture, Utilization, and Storage" = "CCS" = "Carbon Capture and Storage". Alias handling is critical here.

| `value` | `type` | Example |
|---|---|---|
| "CCS" | `abbreviation` | |
| "Carbon Capture and Storage" | `trade_name` | Older variant without "Utilization" |
| "CCUS" | `abbreviation` | |

**Relationships:**
- **→ Signal:** Referenced when signals concern technology milestones, announcements, or deployments.
- **→ Project:** Projects may involve specific technologies, but this is modeled on the Project (as a tag or description), not as a formal FK. Keeping it loose avoids over-modeling; the link is established through signals that reference both.

**Storage:** Firestore `entities/{entityId}`, BigQuery `entities` table.

**What MUST NOT be modeled on Technology:**
- Vendor-specific product names as separate technologies. "Siemens Gamesa SG 14-236 DD" is a product of the Organization "Siemens Gamesa"; the Technology entity is "Offshore Wind Turbine" or "Direct Drive Wind Turbine".
- Performance benchmarks. These are event data, not entity properties.

---

## 4. Commodity

**Business meaning:** A traded commodity or energy product whose price movements, supply dynamics, or regulatory changes are relevant to the organization's business.

**Canonical purpose:** Enables tracking of commodity-related signals — price movements, supply disruptions, regulatory changes affecting commodity markets.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `entityId` | string | System-generated UUID |
| `entityType` | literal | `commodity` |
| `canonicalName` | string | Standard commodity name (e.g., "Brent Crude Oil") |
| `commodityClass` | string | `crude_oil`, `natural_gas`, `lng`, `coal`, `power`, `carbon_credits`, `hydrogen`, `lithium`, `uranium`, `other` |
| `active` | boolean | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `unit` | string | Standard unit (e.g., "USD/bbl", "EUR/MWh", "USD/MMBtu") |
| `region` | string | Market region if commodity is region-specific (e.g., "TTF" for European gas) |

**Aliases and external identifiers:**

| `value` | `type` | Example |
|---|---|---|
| "WTI" | `ticker` | West Texas Intermediate |
| "CL" | `ticker` | NYMEX crude oil ticker |
| "West Texas Intermediate" | `trade_name` | |
| "Petrolio WTI" | `local_name` | Italian variant |

**Relationships:**
- **→ Signal:** Referenced when signals concern commodity price movements, supply changes, or policy impacts on commodity markets.

**Storage:** Firestore `entities/{entityId}`, BigQuery `entities` table.

**What MUST NOT be modeled on Commodity:**
- Price data. Signal does not track commodity prices as time series. It detects *signals about* commodity developments (a new policy affecting gas prices, a supply disruption). Actual price feeds are an external data source, not an entity property.
- Forward curves or forecasts. These are analytical outputs, not entity fields.

---

## 5. Geography

**Business meaning:** A country, region, or named geographic area relevant to energy industry activity. Geographies scope where things happen — where projects are built, where regulations apply, where market dynamics play out.

**Canonical purpose:** Enables geographic filtering and alerting. Board members ask "What's happening in the North Sea?" or "Any regulatory changes in the EU?"

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `entityId` | string | System-generated UUID |
| `entityType` | literal | `geography` |
| `canonicalName` | string | Standard geographic name |
| `geoLevel` | enum | `country`, `region`, `sub_region`, `sea_basin`, `economic_zone` |
| `active` | boolean | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `isoCode` | string | ISO 3166-1 alpha-2 for countries |
| `parentGeographyId` | string | FK to parent Geography (e.g., "North Sea" → "Europe") |
| `description` | string | (≤ 500 chars) |

**Aliases:**

| `value` | `type` | Example |
|---|---|---|
| "UAE" | `abbreviation` | |
| "Emirati Arabi Uniti" | `local_name` | Italian |
| "United Arab Emirates" | `trade_name` | English full name |

Geographies are pre-seeded by admins. The system does not auto-discover new geographies from sources.

**Relationships:**
- **→ Organization:** Organizations have `geographyIds[]` for primary operating regions.
- **→ Project:** Projects have `geographyIds[]` for physical locations.
- **→ Signal:** Signals may reference geographies directly (e.g., a regulatory change in a specific jurisdiction).

**Storage:** Firestore `entities/{entityId}`, BigQuery `entities` table.

**What MUST NOT be modeled on Geography:**
- GPS coordinates or GeoJSON polygons. Signal is not a GIS system.
- Population or economic data. These are not entity properties.

---

## 6. Source

**Business meaning:** A monitored information source — a specific web page, RSS feed, API endpoint, or document repository that Signal fetches on schedule.

**Canonical purpose:** Source is a configuration object: it tells `services/ingest` what to fetch, how often, and where to archive it. It is the entry point of the entire pipeline.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `sourceId` | string | System-generated UUID |
| `name` | string | Human-readable label (e.g., "Enel Investor Relations") |
| `url` | string | Fetch URL (Zod registry v1: `canonicalUrl` — same semantics) |
| `sourceType` | enum | `web_page`, `rss_feed`, `pdf_endpoint`, `json_api`, `regulatory_feed`. Note: Source-level types describe the source itself. Content-level types on SourceContent may differ (e.g., `rss_feed` source produces `rss_entry` content records). |
| `fetchFrequency` | string | Cron expression or preset (`hourly`, `every_6h`, `daily`, `weekly`) |
| `active` | boolean | |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `description` | string | |
| `linkedEntityIds` | string[] | Legacy list form; registry v1 uses `linkedEntityRefs` (`EntityRef[]`) instead. |
| `language` | string | ISO 639-1 language code (e.g., `it`, `en`) |
| `lastFetchedAt` | timestamp | Updated by `services/ingest` |
| `lastContentHash` | string | Updated by `services/ingest` |
| `lastGcsPath` | string | Updated by `services/ingest` (registry v1: `lastArchivedGcsUri`) |
| `fetchStatus` | enum | `healthy`, `degraded`, `failing`, `disabled` |
| `consecutiveFailures` | integer | Circuit breaker counter |
| `sourceAuthority` | integer | 0–100 authority score assigned by admin. Feeds into signal scoring. |

**Note:** `lastFetchedAt`, `lastContentHash`, archive path, `fetchStatus`, and `consecutiveFailures` are maintained by `services/ingest`, not by user CRUD. The API exposes them as read-only fields.

**Relationships:**
- **→ Entity:** Via `linkedEntityRefs[]` (v1) or legacy `linkedEntityIds[]`. A source may be associated with specific entities (e.g., "Enel IR page" linked to Enel Organization entity).
- **→ SourceContent:** Each successful fetch with a delta creates a SourceContent record referencing this sourceId.

**Storage:** Firestore `sources/{sourceId}`.

For the full Zod-backed field list, fetch/parser strategy metadata, and MVP placement rules, see [Source registry v1](source-registry-v1.md).

**What MUST NOT be modeled on Source:**
- Extracted content or events. Source is configuration, not content.
- Scoring rules. Source authority is a property of the source; scoring rules are system-level configuration.

---

## 7. Watchlist

**Business meaning:** A user-defined collection of entities that the user wants to monitor as a group. Watchlists enable personalized filtering: "Show me signals relevant to my watchlist" or "Alert me when anything in my watchlist scores above 70."

**Canonical purpose:** Watchlists are the bridge between entities (system-managed reference data) and user preferences (what a specific person cares about). They do NOT create new intelligence semantics — a watchlist is a filter, not a source of truth.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `watchlistId` | string | System-generated UUID |
| `name` | string | User-given name (e.g., "Key Competitors", "North Africa Projects") |
| `ownerId` | string | User ID |
| `entityIds` | string[] | Entities in this watchlist |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `description` | string | |
| `shared` | boolean | Whether other users in the workspace can see this watchlist. Default: false. |

**Relationships:**
- **→ Entity:** Via `entityIds[]`. A watchlist groups entities. It does not own them.
- **→ AlertRule:** Alert rules may reference a watchlist's entity IDs (denormalized at rule creation time, not as a live FK). If the watchlist changes, existing alert rules are not auto-updated — this is deliberate to avoid surprise alert behavior changes.
- **→ Brief:** Brief configuration may scope to a watchlist's entities.

**What MUST NOT be modeled on Watchlist:**
- Signal storage. Watchlists do not "contain" signals. Signals are linked to entities; the dashboard filters signals by checking if `signal.entityIds ∩ watchlist.entityIds ≠ ∅`.
- Entity definitions. Adding an entity to a watchlist does not create the entity. Removing it does not delete the entity.
- Scoring overrides. Watchlists do not modify how signals are scored. They only filter what the user sees.

**Storage:** Firestore `watchlists/{watchlistId}`.

---

## 8. User

**Business meaning:** A person who uses Signal — a board member, BI analyst, or administrator.

**Canonical purpose:** Identity, preferences, and access control. User is not a business intelligence entity; it is an operator of the system.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `userId` | string | Firebase Auth UID |
| `email` | string | From Firebase Auth |
| `displayName` | string | |
| `role` | enum | `admin`, `analyst`, `viewer` |
| `createdAt` | timestamp | |
| `updatedAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `theme` | enum | `dark`, `light`. Default: `dark`. |
| `timezone` | string | IANA timezone (default: `Europe/Rome`) |
| `briefEnabled` | boolean | Whether the user receives daily briefs. Default: true. |
| `briefMinScore` | integer | Minimum composite score for signals included in the brief. Default: 40. |
| `language` | string | Preferred language for briefs/alerts. Default: `it`. |

**Roles:**
- **admin:** Full access. Can manage entities, sources, watchlists, users, and all configuration. Can access analytics.
- **analyst:** Can manage entities, sources, own watchlists, own alert rules. Can view all signals and analytics.
- **viewer:** Read-only access to dashboard, signals, briefs. Can manage own watchlist and alert rules.

**Storage:** Firebase Auth (credentials) + Firestore `users/{userId}` (preferences and role).

**What MUST NOT be modeled on User:**
- Business intelligence data. Users are not entities in the intelligence sense.
- Activity logs as a user property. Activity logging goes to BigQuery, not to the user document.

---

## 9. Workspace

**Business meaning:** The organizational tenant in Signal. For MVP, there is exactly one workspace.

**Canonical purpose:** Container for all configuration and data. Exists to make future multi-tenancy possible without restructuring.

**Required fields:**

| Field | Type | Description |
|---|---|---|
| `workspaceId` | string | System-generated UUID |
| `name` | string | Organization name |
| `createdAt` | timestamp | |

**Optional fields:**

| Field | Type | Description |
|---|---|---|
| `defaultTimezone` | string | Default: `Europe/Rome` |
| `briefSchedule` | string | Cron expression for daily brief. Default: `0 7 * * *` (07:00 daily) |
| `briefTimezone` | string | Timezone for brief schedule. Default: `Europe/Rome` |
| `scoringWeights` | object | Custom scoring dimension weights. See [Scoring Model](scoring-model-v1.md). |

**Storage:** Firestore `workspaces/{workspaceId}`. For MVP, a single document.

**What MUST NOT be modeled on Workspace:**
- User list (users reference the workspace, not the other way).
- Entity list (entities are queried by collection, not scoped by a workspace FK, because MVP is single-tenant).
- For multi-tenancy, workspace scoping will be added as a `workspaceId` field on all relevant collections. This is not built for MVP.

---

## Entity Summary Table

| Type | MVP Count (est.) | Identity Complexity | Change Frequency |
|---|---|---|---|
| Organization | 50–200 | High (aliases, subsidiaries) | Low (admin-managed) |
| Project | 20–100 | Medium (name variants) | Low |
| Technology | 15–50 | Medium (abbreviation sprawl) | Very low |
| Commodity | 10–30 | Low (standardized tickers) | Very low |
| Geography | 20–80 | Low (ISO codes) | Very low |
| Source | 50–300 | Low (URL-based) | Medium (new sources added) |
| Watchlist | 5–50 per user | None | Medium |
| User | 5–30 | None (Firebase Auth) | Very low |
| Workspace | 1 | None | Never |

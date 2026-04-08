# Event and Signal Taxonomy v1

## The Five-Object Pipeline

Signal processes information through five distinct object types. Confusing any two of these is the most common design error in intelligence platforms. Here they are, precisely:

| # | Object | Meaning | Created by | Visible to users? |
|---|---|---|---|---|
| 1 | **SourceContent** | "We fetched this page/document and it changed." | `services/ingest` | No (provenance only) |
| 2 | **ExtractedEvent** | "We found evidence that X happened, with Y confidence." | `services/intel` | No (pipeline intermediate) |
| 3 | **Signal** | "This business-relevant development deserves attention." | `services/intel` | Yes (dashboard, API) |
| 4 | **Alert** | "This signal matched a rule you configured." | Alert worker | Yes (email notification) |
| 5 | **BriefItem** | "This signal was included in your daily digest." | Brief worker | Yes (email digest) |

### Why this distinction matters

**SourceContent ≠ ExtractedEvent.** A single web page may contain evidence of three different events (a project award, a partnership announcement, and a CEO quote about hydrogen strategy). Or, three different web pages may all discuss the same project award. If you conflate source content with events, you either miss multi-event pages or duplicate signals.

**ExtractedEvent ≠ Signal.** Not every extracted event becomes a signal. An event may be:
- Low confidence (parser wasn't sure what it found)
- Below the relevance threshold (event concerns an entity we don't track)
- A duplicate of an event already processed from another source
- Noise (a date change on a web page that doesn't represent a business event)

Signals are the subset of extracted events that pass quality, relevance, and deduplication gates.

**Signal ≠ Alert.** A signal exists whether or not anyone has configured an alert rule for it. Alerts are delivery artifacts. Deleting an alert rule doesn't delete the signal. Alert fatigue is managed by tuning rules, not by suppressing signals.

**Signal ≠ BriefItem.** A brief item is a snapshot of a signal's state at brief-generation time. If the signal is later updated or dismissed, the brief item remains unchanged. Briefs are historical artifacts, not live views.

---

## Mapping Rules

### How many ExtractedEvents from one SourceContent?

**Zero, one, or many.** The normalization pipeline examines each SourceContent and may extract:

- **Zero events:** The content changed (new hash) but the change is non-substantive (boilerplate update, layout change, date rotation). The pipeline logs this as `extractionStatus: 'skipped'` on the SourceContent.
- **One event:** The page announces a single development (e.g., "Enel awarded 500 MW wind farm contract in Brazil").
- **Multiple events:** The page contains several newsworthy items (e.g., a quarterly report page with earnings results, a divestment announcement, and a new board appointment).

The pipeline MUST support the many-events case. This means each event gets its own ExtractedEvent record, each with its own confidence, entity matches, and event family.

### How many SourceContents can contribute to one ExtractedEvent?

**One or more.** Most events are extracted from a single source. But the same real-world event may appear in multiple sources:

- The same project award announced on the company's IR page AND on a regulatory filing site AND in an RSS news feed.

When multiple SourceContents provide evidence for the same event, the ExtractedEvent's `sourceContentIds[]` lists all of them. The deterministic `eventId` is computed from the sorted list of source content IDs + event family + entity IDs, so the first source to trigger extraction creates the event, and subsequent sources add to its evidence base.

**Implementation note for MVP:** In MVP, cross-source event merging is simplified. Each SourceContent independently produces events. Deduplication happens at the Signal level: if two events from different sources produce signals with the same `signalType` and overlapping `entityIds` within a short time window, the second signal is marked with `novelty: 'update'` and may supersede the first. Full cross-source event merging is post-MVP.

### How many Signals from one ExtractedEvent?

**Usually one. Sometimes zero.**

- **One signal:** The event is relevant, high enough confidence, and linked to tracked entities. The standard path.
- **Zero signals:** The event is too low confidence, concerns untracked entities, or is a duplicate of an already-active signal.

**Multiple signals from one event** should be rare. It could occur if an event involves multiple entities that each warrant separate tracking (e.g., a merger between Org A and Org B may produce one signal for each org's stakeholders). But this is an edge case, not the default path. In most cases: one event → one signal.

### When should an event NOT become a signal?

1. **Confidence below threshold.** If `confidence < 30`, the event is stored in BigQuery for audit but no signal is created.
2. **No entity match.** If `entityIds` is empty and no fuzzy match exceeds the threshold, no signal is created. (The event may still be flagged for manual review if desired.)
3. **Duplicate detection.** If an active signal already exists with the same `signalType` and overlapping `entityIds` within the dedup window (default: 72 hours), and the new event doesn't add material new facts, no new signal is created. The existing signal's `scoredAt` may be updated.
4. **Noise filter.** Certain sourceType + eventFamily combinations are known noise generators (e.g., cookie banner changes on web pages). These are filtered by type-specific rules in the pipeline config.

---

## Canonical Event Families

Each event family below defines the kinds of real-world developments that Signal extracts from source content. Event families are the classification system for ExtractedEvents. Signal types (on the Signal object) mirror event families but may diverge as the system evolves.

### 1. Project Award

**Triggering evidence:** Source content announces that an organization has won, been awarded, or been selected for a named project, contract, or concession.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `projectName` | string | Name of the awarded project |
| `awardedTo` | string | Organization name as stated in the source |
| `awarder` | string | Granting authority if mentioned |
| `value` | string | Contract/project value if mentioned (free text, may include currency) |
| `capacityValue` | number | Capacity if mentioned |
| `capacityUnit` | string | MW, km, units, etc. |

**Common ambiguities:**
- "Selected as preferred bidder" vs "awarded" — these are different stages. Preferred bidder is not a final award.
- Consortium awards where multiple organizations are involved — extract all named organizations.
- Conditional awards ("subject to regulatory approval") — still extract, note in `ambiguityNotes`.

**Confidence considerations:** High if the source is the awarding body's official site or the company's IR page. Medium if from press/news. Low if the wording is ambiguous ("reportedly" / "expected to").

**Signal mapping:** → `project_award` signal type. Almost always becomes a signal unless the entity is untracked.

### 2. Investment Plan Update

**Triggering evidence:** An organization announces or updates a capital expenditure plan, CAPEX allocation, investment commitment, or funding decision.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `organization` | string | |
| `planName` | string | If the plan has a name (e.g., "Strategic Plan 2025-2028") |
| `totalValue` | string | Total investment amount if stated |
| `period` | string | Time period covered |
| `focusAreas` | string[] | Technologies, sectors, or geographies mentioned |

**Common ambiguities:**
- Restatements of existing plans vs genuinely new commitments.
- Headline numbers vs. incremental additions.
- Currency and time period mismatches between sources.

**Confidence considerations:** High from IR presentations or regulatory filings. Lower from press summaries that may misquote figures.

**Signal mapping:** → `investment_plan_update`. Becomes a signal if the organization is tracked.

### 3. Earnings / Reporting Update

**Triggering evidence:** Publication of quarterly/annual earnings, financial statements, or significant updates to financial guidance.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `organization` | string | |
| `reportPeriod` | string | e.g., "Q3 2025", "FY 2025" |
| `reportType` | string | `quarterly_earnings`, `annual_report`, `guidance_update`, `profit_warning` |
| `keyMetrics` | object | Revenue, EBITDA, net income if extractable (structured or free text) |

**Common ambiguities:**
- Preliminary vs final results.
- Adjusted vs reported figures (GAAP vs non-GAAP).
- Different fiscal year calendars across organizations.

**Confidence considerations:** Very high when sourced from the company's official filing or IR page. Medium from news summaries.

**Signal mapping:** → `earnings_reporting_update`. Always becomes a signal for tracked organizations.

### 4. Partnership / MoU

**Triggering evidence:** Two or more organizations announce a partnership, joint venture, MoU, or strategic alliance.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `parties` | string[] | Named organizations |
| `partnershipType` | string | `joint_venture`, `mou`, `strategic_alliance`, `consortium`, `supply_agreement` |
| `purpose` | string | What the partnership is for |
| `value` | string | If disclosed |

**Common ambiguities:**
- MoUs are non-binding — they signal intent, not commitment.
- "Partnership" used loosely in PR vs legal joint ventures.
- Renewals/extensions of existing partnerships vs new ones.

**Signal mapping:** → `partnership_mou`. Becomes a signal if at least one party is tracked.

### 5. M&A / Divestment

**Triggering evidence:** An organization announces an acquisition, merger, divestment, sale of assets, or spin-off.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `acquirer` | string | |
| `target` | string | Organization or asset being acquired/divested |
| `transactionType` | string | `acquisition`, `merger`, `divestment`, `asset_sale`, `spin_off` |
| `value` | string | Transaction value if disclosed |
| `status` | string | `announced`, `completed`, `terminated` |

**Common ambiguities:**
- "In discussions" / "exploring options" vs binding agreements.
- Partial acquisitions (stake purchases) vs full acquisitions.
- Asset sales vs corporate divestments.

**Confidence considerations:** High from regulatory filings or official announcements. Low from "sources familiar with the matter" reports.

**Signal mapping:** → `ma_divestment`. High-priority signal type. Almost always becomes a signal.

### 6. Technology Milestone

**Triggering evidence:** A significant technical achievement, first-of-kind deployment, efficiency record, or technology commercialization announcement.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `technology` | string | Technology name |
| `milestoneType` | string | `first_deployment`, `commercial_launch`, `efficiency_record`, `pilot_completion`, `patent_grant` |
| `organization` | string | Organization involved |
| `details` | string | Description of the milestone |

**Common ambiguities:**
- "Breakthrough" in press releases that may be incremental improvements.
- Lab results vs commercial-scale achievements.
- Announcements of future plans vs actual milestones.

**Signal mapping:** → `technology_milestone`. Becomes a signal if the technology or organization is tracked.

### 7. Geographic Expansion

**Triggering evidence:** An organization enters a new geographic market, opens new offices/facilities in a new region, or makes a significant geographic commitment.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `organization` | string | |
| `geography` | string | Country/region entered |
| `expansionType` | string | `market_entry`, `facility_opening`, `license_awarded`, `office_opening` |

**Signal mapping:** → `geographic_expansion`. Becomes a signal if the organization or geography is tracked.

### 8. Commodity Movement

**Triggering evidence:** A significant price movement, supply disruption, new pricing mechanism, or structural shift in a commodity market.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `commodity` | string | Commodity name/ticker |
| `movementType` | string | `price_spike`, `price_drop`, `supply_disruption`, `demand_shift`, `new_contract_structure`, `inventory_change` |
| `magnitude` | string | Description of the magnitude if available |
| `cause` | string | Stated or inferred cause |

**Common ambiguities:**
- Daily price fluctuations vs structural shifts. Signal should focus on structural/significant movements, not daily noise.
- Regional vs global impact.

**Confidence considerations:** High from exchange data feeds or official market reports. Lower from commentary/analysis.

**Signal mapping:** → `commodity_movement`. Becomes a signal if the commodity is tracked AND the movement is judged significant (not routine daily fluctuation).

**When it should NOT become a signal:** Routine daily price movements within normal volatility ranges. The pipeline needs a configurable volatility threshold per commodity. Movements within the threshold are logged as events in BigQuery but do not produce signals.

### 9. Policy / Regulatory Change

**Triggering evidence:** A government, regulator, or international body announces new policy, regulation, directive, subsidy, tax, or enforcement action affecting the energy sector.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `authority` | string | Issuing body |
| `policyType` | string | `regulation`, `directive`, `subsidy`, `tax_change`, `enforcement`, `consultation`, `ban` |
| `geography` | string | Jurisdiction affected |
| `sector` | string | Energy sub-sector affected |
| `summary` | string | Key provisions |
| `effectiveDate` | string | If stated |

**Common ambiguities:**
- Draft/proposed vs enacted/final.
- Consultations vs binding decisions.
- National implementation of EU directives — may appear as multiple events.

**Signal mapping:** → `policy_regulatory_change`. Becomes a signal if the geography or affected sector intersects with tracked entities.

### 10. Tender / Opportunity Detection

**Triggering evidence:** A tender, RFP, RFQ, auction, or concession opportunity is published.

**Required extracted fields:**

| Field | Type | Description |
|---|---|---|
| `tenderTitle` | string | |
| `issuingBody` | string | |
| `geography` | string | |
| `sector` | string | |
| `deadlineDate` | string | If stated |
| `estimatedValue` | string | If stated |

**Common ambiguities:**
- Re-publications of existing tenders vs new ones.
- Pre-qualification notices vs actual tenders.
- Framework agreements vs specific project tenders.

**Confidence considerations:** Very high when sourced from official procurement portals. Medium from aggregator sites.

**Signal mapping:** → `tender_opportunity`. Becomes a signal if the issuing body's geography or sector intersects with tracked entities or watchlists. Tenders have inherent time sensitivity — the signal's freshness score is weighted heavily.

**When it should NOT become a signal:** Re-publication of an already-detected tender (dedup by tender title + issuing body + deadline). Tenders in sectors/geographies with no tracked entities.

---

## Signal Types Summary

Signal types mirror event families but are the user-facing classification. They use the same names unless there's a reason for the user-facing label to differ.

| Signal Type | Source Event Family | Typical Priority |
|---|---|---|
| `project_award` | Project Award | High |
| `investment_plan_update` | Investment Plan Update | High |
| `earnings_reporting_update` | Earnings / Reporting Update | High |
| `partnership_mou` | Partnership / MoU | Medium |
| `ma_divestment` | M&A / Divestment | High |
| `technology_milestone` | Technology Milestone | Medium |
| `geographic_expansion` | Geographic Expansion | Medium |
| `commodity_movement` | Commodity Movement | Variable (threshold-gated) |
| `policy_regulatory_change` | Policy / Regulatory Change | High |
| `tender_opportunity` | Tender / Opportunity Detection | Medium (time-sensitive) |

---

## ExtractedFacts Structure

The `extractedFacts` field on ExtractedEvent is a polymorphic object whose shape depends on `eventFamily`. Each event family defines its own required and optional fields (listed above).

For contract validation, `extractedFacts` is validated with a discriminated union keyed on `eventFamily`:

```typescript
// Illustrative — actual Zod schemas will live in packages/contracts
const ExtractedFactsSchema = z.discriminatedUnion("eventFamily", [
  z.object({ eventFamily: z.literal("project_award"), projectName: z.string(), awardedTo: z.string(), ... }),
  z.object({ eventFamily: z.literal("investment_plan_update"), organization: z.string(), ... }),
  // ... one variant per event family
]);
```

This ensures that every ExtractedEvent carries the correct structured data for its family, validated at the boundary.

---

## Event Time Handling

Real-world events have imprecise timing. A quarterly earnings report covers Q3, but the announcement date is November 5. A project award may state "expected completion in 2028" without a specific date.

Signal handles this with a compound `eventTime` object:

| Field | Type | Description |
|---|---|---|
| `value` | timestamp | Best-available timestamp (UTC) |
| `precision` | enum | `day`, `month`, `quarter`, `year`, `unknown` |

Rules:
- If the source provides an exact date, `precision: 'day'`.
- If the source says "Q3 2025", `value` is `2025-07-01T00:00:00Z` and `precision: 'quarter'`.
- If the source says "2025", `value` is `2025-01-01T00:00:00Z` and `precision: 'year'`.
- If no event date is detectable, `value` is `fetchedAt` from the SourceContent and `precision: 'unknown'`.

The dashboard displays time with appropriate formatting based on precision (exact date vs "Q3 2025" vs "2025").

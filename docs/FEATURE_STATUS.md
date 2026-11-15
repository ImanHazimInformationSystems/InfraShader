# InfraShader feature status

Generated from canonical CSV registers. Do not edit this summary directly.

Latest tracking review: 2026-11-16. Implementation and acceptance remain separate; initial audit evidence is dated 26 October 2026.

85 project roadmap features: the 84-feature 11 November 2026 PDF baseline plus the user-requested L31 roadwork addendum dated 12 November 2026. The source PDF remains an 84-feature historical baseline. The 38 overlapping baseline references (F/D/E) and six refinements (K) are not extra features. Resources, gates, SRS names and aliases are excluded. No completion percentage is asserted.

| Roadmap implementation | Records |
|---|---:|
| Not audited | 39 |
| Not implemented | 0 |
| Partial | 32 |
| Implemented | 14 |

Implementation, verification, deployment and acceptance are recorded per feature below. Read the evidence and remaining gates before interpreting a Passed verification status as acceptance. No hosted deployment is inferred.

Historical 26 October audit checks: frontend lint/typecheck/build passed; 36 frontend tests passed; Ruff passed; 158 backend tests passed and 26 database-dependent tests skipped; nine desktop Demo/fixture browser tests passed. Real Auth/Storage/PostGIS integration, provider/device, field and customer acceptance were not rerun. See [audit evidence](tracking/evidence/audit-2026-10-26.md).

Read [specification guide](FEATURE_SPEC.md), [maintenance instructions](tracking/README.md) and [reconciliation](tracking/reconciliation.md) before feature work.

## Next work by controlling stage

- D0: S04/F12/F14 retained issued bytes and recovery; F11/L16 commercial explanations; S06/D06/D09 forced-expiry, form recovery, privacy and joint restore; S07/S08/D08/D10 measured accessibility/operations.
- D1A: L03/K01/K05 evidence and brief confirmation; L04/K02 editing/change impact; L05/F17 limited calibrated reference subject to its gate; L09/L10/L13â€“L16/K04 curated schedules, build-ups and price readiness; L24/L26/K03 retained proposal/change ledger; L22 limited maintenance checklist.
- D1B: O02â€“O07 document intake and human-confirmed common scope; O09/O10/O12 locked rubric and reproducible scores; O14/K06 coverage/readiness; O15/O16 clarification and simple signoff; O17/O18/O28 retained decision pack and bounded dashboard/exports.
- L31: user-requested road/driveway takeoff is a new addendum with partial area-to-uniform-layer implementation. Bounded drag/click road drawing, width and curve/area editing are connected; separate road overlaps are rejected. Confirm local road standards/class; verify independent metric quantities, proposal disclosure, qualified review and pilot acceptance.
- Keep connected exchange, AI and D3/D4 spatial/enterprise expansions deferred to their stated prerequisites. No automatic backlog implementation is authorised.

## Register

| ID | Feature | Priority | Audited implementation | Verification |
|---|---|---|---|---|
| [L01](features/L01.md) | Client, project and opportunity hub | CORE / NEXT | Implemented | Passed |
| [L02](features/L02.md) | Site discovery and environment explorer | KEEP | Implemented | Passed |
| [L03](features/L03.md) | Survey evidence and constraints register | CORE | Implemented | Passed |
| [L04](features/L04.md) | Professional spatial editing tools | CORE / NEXT | Partial | Passed |
| [L05](features/L05.md) | Calibrated existing-plan overlay | CORE (LIMITED) | Implemented | Passed |
| [L06](features/L06.md) | Terrain sculpting and concept ponds | LATER | Implemented | Passed |
| [L07](features/L07.md) | Expanded licensed 3d object palette | LATER | Implemented | Passed |
| [L08](features/L08.md) | Private custom object and glb library | LATER | Not audited | Not run |
| [L09](features/L09.md) | Plant palette and planting plan | CORE (LIMITED) | Implemented | Passed |
| [L10](features/L10.md) | Hardscape and material assemblies | CORE / NEXT | Implemented | Passed |
| [L11](features/L11.md) | Shade and use-time studies | KEEP / NEXT | Implemented | Passed |
| [L12](features/L12.md) | Scenario library and controlled option revisions | CORE / LATER | Implemented | Passed |
| [L13](features/L13.md) | Professional boq and takeoff workbook | CORE | Partial | Passed |
| [L14](features/L14.md) | Supplier and rate source management | CORE / NEXT | Implemented | Passed |
| [L15](features/L15.md) | Labour, equipment and cost build-ups | CORE (LIMITED) | Implemented | Passed |
| [L16](features/L16.md) | Markup, margin and pricing explanations | CORE | Implemented | Passed |
| [L17](features/L17.md) | Phasing, work programme and constructability checklist | NEXT | Not audited | Not run |
| [L18](features/L18.md) | Irrigation and drainage concept coordination | LATER | Not audited | Not run |
| [L19](features/L19.md) | Rooftop, terrace and podium planning | LATER | Not audited | Not run |
| [L20](features/L20.md) | Design quality and constraint checks | CORE / NEXT | Not audited | Not run |
| [L21](features/L21.md) | Sustainability and maintenance indicators | KEEP / NEXT | Not audited | Not run |
| [L22](features/L22.md) | Maintenance and whole-life cost proposal | CORE / NEXT | Partial | Passed |
| [L23](features/L23.md) | Presentation sheets and client walkthrough | CORE / NEXT | Partial | Passed |
| [L24](features/L24.md) | Proposal builder and issue completion | CORE | Implemented | Passed |
| [L25](features/L25.md) | Invited opportunity and submission workspace | NEXT | Partial | Passed |
| [L26](features/L26.md) | Clarifications, revisions and alternatives | CORE / NEXT | Partial | Passed |
| [L27](features/L27.md) | Designer and estimator ai assistant | NEXT | Not audited | Not run |
| [L28](features/L28.md) | Handover, snagging and maintenance transition | NEXT | Not audited | Not run |
| [L29](features/L29.md) | Offline site capture and later synchronisation | LATER | Not audited | Not run |
| [L30](features/L30.md) | Business pipeline and estimate learning dashboard | NEXT | Not audited | Not run |
| [O01](features/O01.md) | Portfolio and multi-site project dashboard | KEEP / NEXT | Not audited | Not run |
| [O02](features/O02.md) | Owner project brief and shared baseline | CORE | Partial | Passed |
| [O03](features/O03.md) | Brief library and invitation packages | CORE / NEXT | Not audited | Not run |
| [O04](features/O04.md) | Eligibility and document checklist | CORE (LIMITED) | Partial | Passed |
| [O05](features/O05.md) | Proposal inbox and controlled receipt | CORE | Partial | Passed |
| [O06](features/O06.md) | Document reader and reviewed data extraction | CORE / NEXT | Partial | Passed |
| [O07](features/O07.md) | Common scope and boq normalisation | CORE | Partial | Passed |
| [O08](features/O08.md) | Synchronised spatial and proposal comparison | KEEP / CORE | Partial | Passed |
| [O09](features/O09.md) | Criteria template and weighted scorecard builder | CORE | Partial | Passed |
| [O10](features/O10.md) | Independent technical and financial evaluations | CORE / NEXT | Partial | Passed |
| [O11](features/O11.md) | Moderation and committee consensus | NEXT | Not audited | Not run |
| [O12](features/O12.md) | Deterministic ranking and sensitivity analysis | CORE / NEXT | Partial | Passed |
| [O13](features/O13.md) | Financial and whole-life comparison | CORE / NEXT | Partial | Passed |
| [O14](features/O14.md) | Requirements and evidence coverage matrix | CORE | Partial | Passed |
| [O15](features/O15.md) | Clarifications, addenda and revised submissions | CORE / NEXT | Partial | Passed |
| [O16](features/O16.md) | Approval routing and delegation | CORE (LIMITED) | Partial | Passed |
| [O17](features/O17.md) | Decision memorandum and auditable report pack | CORE | Partial | Passed |
| [O18](features/O18.md) | Management and evaluation dashboard | CORE (LIMITED) | Partial | Passed |
| [O19](features/O19.md) | Ai proposal-analysis workbench | NEXT | Not audited | Not run |
| [O20](features/O20.md) | Portfolio budget allocation and prioritisation | LATER | Not audited | Not run |
| [O21](features/O21.md) | Landscaping outcome and sustainability comparison | KEEP / NEXT | Not audited | Not run |
| [O22](features/O22.md) | Supplier evidence and performance history | NEXT | Not audited | Not run |
| [O23](features/O23.md) | Selection handoff and milestone monitoring | NEXT | Not audited | Not run |
| [O24](features/O24.md) | Asset handover and maintenance portfolio | NEXT | Not audited | Not run |
| [O25](features/O25.md) | Stakeholder consultation and feedback | LATER | Not audited | Not run |
| [O26](features/O26.md) | Reusable evaluation policy and templates | CORE / NEXT | Not audited | Not run |
| [O27](features/O27.md) | Enterprise access and deployment options | LATER | Not audited | Not run |
| [O28](features/O28.md) | Interoperability and management exports | CORE / LATER | Not audited | Not run |
| [O29](features/O29.md) | Controlled opening, confidentiality and conflict safeguards | LATER | Not audited | Not run |
| [O30](features/O30.md) | Process performance and continuous improvement | NEXT | Not audited | Not run |
| [S01](features/S01.md) | Two workspace shells and capability-driven navigation | CORE | Partial | Passed |
| [S02](features/S02.md) | Organisation onboarding and complete membership lifecycle | CORE / NEXT | Partial | Passed |
| [S03](features/S03.md) | Separate private designs from published submission packages | CORE / NEXT | Partial | Passed |
| [S04](features/S04.md) | Retained document and file lifecycle | CORE | Partial | Passed |
| [S05](features/S05.md) | Discussion, annotations, tasks and notifications | CORE / NEXT | Not audited | Not run |
| [S06](features/S06.md) | Recovery, version checks and operational hardening | CORE | Partial | Passed |
| [S07](features/S07.md) | Large-table and map performance | CORE / NEXT | Partial | Passed |
| [S08](features/S08.md) | Language, units and accessibility | CORE / NEXT | Partial | Passed |
| [S09](features/S09.md) | Import/export contracts and integrations | CORE / LATER | Partial | Passed |
| [S10](features/S10.md) | Audit, retention and decision records | CORE | Partial | Passed |
| [S11](features/S11.md) | Asynchronous jobs and reproducible results | CORE / NEXT | Not audited | Not run |
| [S12](features/S12.md) | Reviewer feedback and product acceptance | CORE | Partial | Not run |
| [A01](features/A01.md) | Document extraction and proposal summaries | NEXT | Not audited | Not run |
| [A02](features/A02.md) | Reviewed line matching and unit normalisation | NEXT | Not audited | Not run |
| [A03](features/A03.md) | Requirement response and evidence-gap analyser | NEXT | Not audited | Not run |
| [A04](features/A04.md) | Proposal and decision narrative drafting | CORE / NEXT | Not audited | Not run |
| [A05](features/A05.md) | Price and scope anomaly assistant | CORE / NEXT | Not audited | Not run |
| [A06](features/A06.md) | Source-grounded project question answering | NEXT | Not audited | Not run |
| [A07](features/A07.md) | Evaluation explanation and sensitivity narration | CORE / NEXT | Not audited | Not run |
| [A08](features/A08.md) | Clarification and response drafting | CORE / NEXT | Not audited | Not run |
| [A09](features/A09.md) | Explainable design improvement suggestions | LATER | Not audited | Not run |
| [A10](features/A10.md) | Executive dashboard briefing | NEXT | Not audited | Not run |
| [A11](features/A11.md) | Ai review, privacy and reproducibility controls | CORE / NEXT | Not audited | Not run |
| [A12](features/A12.md) | Portfolio optimisation and predictive analytics | LATER | Not audited | Not run |
| [K01](features/K01.md) | Agreed brief, scope and assumptions checkpoint | CORE | Implemented | Passed |
| [K02](features/K02.md) | Dependency-aware change impact and consistency check | CORE | Partial | Passed |
| [K03](features/K03.md) | Change request and commercial impact record | CORE | Partial | Passed |
| [K04](features/K04.md) | Price validity and estimate completeness gate | CORE | Implemented | Passed |
| [K05](features/K05.md) | Measurement source and site-verification queue | CORE | Partial | Passed |
| [K06](features/K06.md) | Comparison readiness and review coverage check | CORE | Partial | Passed |
| [F01](features/F01.md) | Stakeholder, project and outcome brief | REFERENCE | Not audited | Not run |
| [F02](features/F02.md) | Site information and evidence | REFERENCE | Not audited | Not run |
| [F03](features/F03.md) | Explore map and interactive site map | REFERENCE | Not audited | Not run |
| [F04](features/F04.md) | Drawing and measuring work areas | REFERENCE | Not audited | Not run |
| [F05](features/F05.md) | Buildings and heights | REFERENCE | Not audited | Not run |
| [F06](features/F06.md) | Existing-site solar and shade analysis | REFERENCE | Partial | Not run |
| [F07](features/F07.md) | Simple proposed canopy | REFERENCE | Partial | Not run |
| [F08](features/F08.md) | No-build baseline and up to two proposed options | REFERENCE | Not audited | Not run |
| [F09](features/F09.md) | Organisation product and rate catalogue | REFERENCE | Partial | Passed |
| [F10](features/F10.md) | Quantity-based project estimate | REFERENCE | Partial | Passed |
| [F11](features/F11.md) | Markup, margin and internal profit | REFERENCE | Implemented | Passed |
| [F12](features/F12.md) | Contractor client proposal and pdf | REFERENCE | Implemented | Passed |
| [F13](features/F13.md) | Building surface planner | REFERENCE | Not audited | Not run |
| [F14](features/F14.md) | Developer option review and decision brief | REFERENCE | Partial | Not run |
| [F15](features/F15.md) | Basic outdoor elements and scope schedule | REFERENCE | Not audited | Not run |
| [F16](features/F16.md) | Assisted option explanation | REFERENCE | Not audited | Not run |
| [F17](features/F17.md) | Existing plan reference overlay | REFERENCE | Implemented | Passed |
| [F18](features/F18.md) | Local terrain shaping and concept pond | REFERENCE | Implemented | Passed |
| [F19](features/F19.md) | Expanded placeable 3d object library | REFERENCE | Implemented | Passed |
| [F20](features/F20.md) | User-owned custom object import and placement | REFERENCE | Not audited | Not run |
| [D01](features/D01.md) | Identity and sessions | REFERENCE | Not audited | Not run |
| [D02](features/D02.md) | Organisation membership and permissions | REFERENCE | Partial | Not run |
| [D03](features/D03.md) | Dashboard and navigation | REFERENCE | Not audited | Not run |
| [D04](features/D04.md) | Project record controls | REFERENCE | Not audited | Not run |
| [D05](features/D05.md) | Settings | REFERENCE | Not audited | Not run |
| [D06](features/D06.md) | Save states, revisions and safe editing | REFERENCE | Not audited | Not run |
| [D07](features/D07.md) | Validation, feedback and recovery | REFERENCE | Not audited | Not run |
| [D08](features/D08.md) | Responsive and accessible controls | REFERENCE | Not audited | Not run |
| [D09](features/D09.md) | Privacy, file access and data lifecycle | REFERENCE | Not audited | Not run |
| [D10](features/D10.md) | Support, health and release basics | REFERENCE | Not audited | Not run |
| [E01](features/E01.md) | Automatic map-building shadows | REFERENCE | Not audited | Not run |
| [E02](features/E02.md) | Date, time and solar controls | REFERENCE | Not audited | Not run |
| [E03](features/E03.md) | Fullscreen and collapsible map controls | REFERENCE | Not audited | Not run |
| [E04](features/E04.md) | Provider 3D and search recovery | REFERENCE | Not audited | Not run |
| [E05](features/E05.md) | Full Shadowmap-level coverage | REFERENCE | Partial | Not run |
| [E06](features/E06.md) | Sun, sky and day/night simulation | REFERENCE | Not audited | Not run |
| [E07](features/E07.md) | Cloud, rain and storm simulation | REFERENCE | Not audited | Not run |
| [E08](features/E08.md) | Weather-data integration | REFERENCE | Not audited | Not run |
| [L31](features/L31.md) | Road and driveway planning and construction cost takeoff | CORE (LIMITED) / NEXT | Partial | Passed |

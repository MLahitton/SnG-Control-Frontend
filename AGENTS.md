<!-- BEGIN:nextjs-agent-rules -->

This is NOT the Next.js you know
This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in node_modules/next/dist/docs/ (resolved from this file's directory; in monorepos the next package may not be visible from the repo root) before writing any code. Heed deprecation notices.
This block is written and re-added by next dev — verify at node_modules/next/dist/server/lib/generate-agent-files.js. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
<!-- END:nextjs-agent-rules -->

SnG Control Frontend — Agent Instructions
These instructions are permanent repository rules.
Task-specific instructions override this file only when explicitly stated.
1. Primary objective
Build the operational frontend for SnG Control using the existing backend as the source of truth.
Priorities:
1. functional correctness;
2. faithful representation of backend business state;
3. usability;
4. maintainability;
5. efficient implementation.
Do not invent business functionality that the backend does not support.
Do not build fake dashboards, fake metrics, placeholder workflows or simulated modules.
Prefer the smallest coherent implementation.
Do not perform unrelated refactors.
2. Current stack
Current project uses:
- Next.js 16
- App Router
- React 19
- TypeScript strict
- Tailwind CSS 4
- pnpm
- Vitest
- Testing Library
- jsdom
- @react-oauth/google
Use installed versions.
Do not upgrade frameworks or packages unless required by the task.
Before changing Next.js-specific behavior, consult the installed documentation under node_modules/next/dist/docs/ when relevant.
Do not rely on outdated Next.js assumptions.
3. Repository structure
Current functional direction:
src/
  app/
  features/
  lib/
tests/
Prefer feature-oriented organization, for example:
- features/auth
- features/projects
- features/clients
- features/tasks
- features/budgets
- features/commercial-quotation
- features/notifications
Do not create an overly generic architecture.
Do not create empty folders for future modules.
4. Authentication model
Google provides identity.
The frontend receives a Google ID Token through Google Identity Services.
Current authentication flow:
Google → credential → AuthProvider → Next.js backend bridge → SnG-Control-Backend → /api/auth/me → validated CurrentUser.
Current user shape:
- subject
- email
- name
The stable identity is subject.
Never treat email as authorization identity.
The frontend must not invent roles based on email.
5. Token storage
Current development session uses sessionStorage with key sng.google.id_token.
Do NOT use:
- localStorage
- querystring
- URL fragments
- application logs
- rendered HTML
Do not persist user identity separately as an authoritative source.
On session restoration, revalidate the token against backend.
Do not decode JWT claims locally as a substitute for backend validation.
6. Secrets
Never store or expose:
- Google Client Secret
- backend credentials
- database credentials
- real tokens
- connection strings
NEXT_PUBLIC_GOOGLE_CLIENT_ID is public configuration and may be exposed to browser code.
SNG_API_BASE_URL must remain server-only.
Do not introduce NEXT_PUBLIC_SNG_API_BASE_URL unless explicitly required.
Do not commit .env.local.
7. Backend communication
The .NET backend is the authority for:
- authentication validation
- authorization
- workflow state
- deadlines
- Lead Time
- notifications
- quotation data
- task status
- economic values
The frontend must NOT duplicate backend business logic.
Do not calculate locally:
- task deadlines
- overdue state
- business days
- Colombian holidays
- Lead Time status
- quotation totals
- prices
- workflow transitions
Render backend-provided state.
8. BFF / backend bridge
The browser should communicate with Next.js same-origin endpoints.
Next.js communicates server-side with SNG_API_BASE_URL.
Do not expose the backend base URL to the browser unnecessarily.
For the first auth block there is a specific /api/auth/me route handler.
As the application grows, a controlled BFF/backend bridge may be introduced.
If implementing a generic backend bridge:
- it must only target SNG_API_BASE_URL;
- never accept arbitrary external URLs;
- never become an open proxy;
- forward only approved methods/headers/body;
- preserve relevant HTTP status codes;
- sanitize errors;
- never expose backend URL;
- never log Authorization;
- correctly support JSON;
- correctly support multipart uploads;
- correctly support XLSX downloads;
- use cache: "no-store" for operational API requests.
Do not create one Route Handler per backend endpoint if a safe shared bridge is already available.
9. TLS development
Do NOT disable TLS verification.
Never use NODE_TLS_REJECT_UNAUTHORIZED=0.
For local Windows development with trusted .NET development certificates, Node may require system CA support:
$env:NODE_USE_SYSTEM_CA="1"
pnpm dev
Document local trust requirements.
Do not weaken production TLS.
10. Google Sign-In
Use the existing maintained Google integration.
Do not introduce:
- gapi.auth2
- OAuth implicit access-token flows
- custom password login
- custom JWT
- refresh-token infrastructure
unless explicitly requested.
Avoid multiple initialization of Google Identity Services.
If development logs show google.accounts.id.initialize() is called multiple times, inspect provider/component mounting and Strict Mode interaction.
Do not ignore avoidable warnings attributable to our code.
11. Existing authentication components
Existing concepts include:
- AuthProvider
- useAuth
- AuthGate
- GoogleSignInButton
- UserIdentityCard
- authService
Reuse these unless a task specifically requires evolving them.
Do not duplicate session state in another state management system.
Do not add Redux/Zustand/React Query merely because the application is growing.
Introduce a library only when current native patterns become materially insufficient.
12. Current backend workflow to represent
Current backend supports:
Commercial:
- create clients
- create projects
- send Project to Budgets
Budgets:
- receives PrepareQuotation
- assigns/corrects SG
- uploads quotation XLSX
- receives technical preview
- edits allowed technical values before confirmation
- confirms technical catalog
- sends quotation to Commercial
Commercial Head:
- receives ReviewQuotation
- downloads confirmed.xlsx
- edits externally
- uploads revised XLSX
- gets review-only preview
- sees economic values
- sees technical differences
- confirms commercial.xlsx
Advisor:
- receives PresentQuotationToClient
Do not implement client approval or payment until backend supports it.
13. Project responsibility
Project creator is currently the responsible commercial advisor.
Backend exposes creator identity.
Do not create a separate responsible-advisor model in frontend.
Do not invent reassignment UI until backend supports reassignment.
14. Tasks
Task types currently supported:
- PrepareQuotation
- ReviewQuotation
- PresentQuotationToClient
Task UI should use backend-provided area, status, assignedToGoogleSubject, AssignedAt, StartedAt, DeadlineAt, CompletedAt, WasOverdue and LeadTimeStatus when available.
Do NOT recalculate Lead Time in React.
15. Lead Time presentation
Lead Time is backend-owned.
The frontend may visually map statuses such as:
- NotStarted
- OnTrack
- DueSoon
- DueToday
- Overdue
- CompletedOnTime
- CompletedLate
- UntrackedLegacy
but must not infer them independently from dates when backend already provides them.
User-facing text should be operational, for example:
- “Vence en 2 días laborales”
- “Vence hoy”
- “Cotización atrasada”
- “Revisión de cotización atrasada”
- “Presentación al cliente atrasada”
Avoid exposing internal engineering terms like Lead Time exceeded unless used in technical admin/debug contexts.
16. Notifications
Backend is the source of truth for notifications.
Do not implement frontend-only notification history.
Do not invent read/unread state.
Current notification model intentionally has no:
- IsRead
- ReadAt
- bell unread count
The frontend may show personal notifications, project notification history, state, timestamps and resolved overdue alerts.
Do not mutate notification status unless backend exposes a supported operation.
17. Quotations
Presupuestos preview may allow editing only fields explicitly accepted by backend.
Commercial quotation preview is review-only.
Do not add editable controls to commercial preview.
Economic values are document-authoritative.
Do not calculate UnitPrice, TotalPrice, ProjectTotal, IVA or discounts.
Display backend values.
Technical difference display should clearly distinguish previous Presupuestos value and current Commercial value.
Do not hide technical changes.
18. XLSX uploads
Use backend upload limits and error responses.
Do not parse XLSX in the browser unless explicitly requested.
Do not duplicate backend OpenXML behavior in JavaScript.
Uploads should validate obvious client-side file type where useful, still trust backend validation as authoritative, and preserve multipart file bytes.
Do not transform uploaded XLSX.
19. XLSX downloads
Downloads must use bytes returned by backend.
Do not regenerate XLSX in frontend.
Use backend-provided filename / Content-Disposition where available.
Do not allow query-controlled arbitrary filenames.
20. UI rules
Design should be professional, clean, operational, responsive and information-dense without clutter.
Steel & Glass direction: white, neutral grays, dark text, restrained blue/cyan accent.
Do not create an over-designed marketing site.
Do not introduce a heavy design system without need.
Do not create dozens of generic UI primitives before there is real reuse.
21. Accessibility
Maintain keyboard accessibility, visible focus states, adequate contrast, semantic headings, labels and accessible error/status messages.
Use role="alert" for actionable errors and role="status" for non-disruptive state feedback when appropriate.
Do not rely exclusively on color for task/alert state.
22. Navigation
Build navigation only for backend-supported functionality.
Do not display fake sections for Accounting, Installation, Engineering, Production, Logistics or Postventa until functionality exists.
It is acceptable to design the shell so these can be added later.
Do not show disabled fake modules merely for appearance unless explicitly requested.
23. Error handling
Normalize operational backend errors centrally where practical.
Correctly handle 400, 401, 403, 404, 409, 413 and 500/502/503.
401: clear invalid session and require login.
403: show permission error; do not treat as logged out.
409: show business conflict returned by backend.
Never expose stack traces, internal storage paths, backend base URL, raw tokens or connection information.
24. Loading states
All async screens/actions must have deliberate loading states.
Avoid double-submit, duplicate uploads and duplicate confirmations.
Disable destructive/submitting controls while requests are active.
Do not hide long-running upload/confirm activity.
25. No fake optimistic workflow transitions
For business-critical transitions such as SG assignment, quotation confirmation, send-to-commercial and commercial confirmation, do not permanently update UI before backend success.
Backend response is authoritative.
Optimistic UI should only be used when failure cannot create misleading business state.
26. State management
Prefer local state, React Context for authentication and feature-local hooks/services.
Do not introduce global state management automatically.
If server-state complexity later justifies React Query or similar, introduce it as a deliberate task.
Do not duplicate cached business entities across unrelated contexts.
27. Types
TypeScript strict remains required.
Do not use any unless unavoidable and documented.
Prefer explicit types mirroring backend contracts.
Do not manually create divergent frontend enum names when backend strings are stable.
Centralize shared API types by feature.
28. API client
Business components should not contain repeated raw fetch logic.
Use feature services or a shared typed API client.
Central behavior should cover where applicable:
- Authorization Bearer
- safe status handling
- ProblemDetails
- JSON
- multipart
- blob/file downloads
- session invalidation on 401
Do not swallow meaningful backend 409 codes.
29. Testing strategy
Use Vitest, Testing Library and jsdom.
Do not call real Google, real backend or Internet in normal tests.
Mock network boundaries.
Test business-facing UI behavior rather than implementation details.
Do not write fragile tests for Tailwind class strings.
30. Efficient frontend verification
During implementation, run focused tests only, for example:
pnpm test:run -- authService
pnpm test:run -- Project
pnpm test:run -- CommercialQuotation
Use the syntax supported by the installed Vitest version.
Do not run all tests after every edit.
Run pnpm typecheck after meaningful type-level changes.
Run pnpm lint when feature code is stable.
Final validation ONCE:
pnpm test:run
pnpm lint
pnpm typecheck
pnpm build
If one fails, fix it, rerun focused validation, and repeat the full failing command once after fixes.
Do not repeatedly rerun successful expensive commands.
31. Install policy
Run pnpm install only when dependencies changed, lockfile is missing/outdated, node_modules is unavailable or the environment requires it.
Do not reinstall dependencies on every task.
Do not change package versions unnecessarily.
32. Browser smoke policy
Run browser/manual smoke only when the task changes visible or integration behavior, such as Google login, routing, XLSX upload/download or major new workflow pages.
Do not manually smoke every unrelated page after every task.
For purely internal service/type changes, automated tests may be sufficient.
33. No unnecessary screenshots / visual work
Do not generate visual assets merely to decorate operational screens.
Do not add placeholder charts.
Do not create fake dashboard statistics.
Visuals must serve real backend data or actual workflow.
34. Documentation
Maintain README.md as functional state and README_TECHNICAL.md as technical handoff.
They are living docs, not changelogs.
Update only affected sections plus clearly stale statements discovered during the task.
Keep documented: current stack, env variables, authentication, BFF architecture, session behavior, local TLS requirements, testing and current implemented workflow.
Do not include secrets.
35. Environment files
Keep .env
Never commit .env, .env.local or .env.*.local.
Expected concepts include:
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<GOOGLE_OAUTH_CLIENT_ID>
SNG_API_BASE_URL=<SNG_CONTROL_BACKEND_BASE_URL>
Never include real values in docs/tests.
36. Git discipline
Before work:
git status --short
Do not overwrite unrelated user changes.
At end:
git diff --check
git status --short
Review accidental files.
Do not commit/push unless explicitly requested.
37. Scope discipline
Before implementation:
1. read this AGENTS.md;
2. inspect only the relevant feature;
3. inspect related tests;
4. inspect backend contract when necessary;
5. implement minimal coherent UI.
Do not scan every file by default.
Do not refactor authentication while implementing projects unless needed.
Do not rebuild the entire shell for a small feature.
Do not create future modules proactively.
38. Default execution order
For each task:
1. Read AGENTS.md.
2. Read relevant code/tests.
3. Consult installed Next.js docs only when relevant.
4. Make a short internal plan.
5. Implement.
6. Run focused tests.
7. Fix.
8. Run typecheck if relevant.
9. Run lint.
10. Run full tests once when stable.
11. Build once.
12. Smoke manually only if relevant.
13. Update affected documentation.
14. Run git diff --check.
15. Review final diff.
16. Report.
17. Stop.
Do not continue into the next frontend block without explicit instruction.
39. Final report format
Keep final reports concise.
Include:
1. what was implemented;
2. key screens/components/services;
3. backend endpoints integrated;
4. relevant security behavior;
5. tests added/updated;
6. focused test result;
7. full test result;
8. lint/typecheck/build result;
9. browser smoke only if performed;
10. documentation updated;
11. assumptions or pending integration issues.
Do not produce dozens of repetitive numbered items.
40. Priority rule
Correctness and faithful backend integration come first.
Efficiency means:
- reading fewer irrelevant files;
- running targeted tests while coding;
- avoiding repeated full suites;
- avoiding repeated builds;
- avoiding reinstalling dependencies;
- avoiding unnecessary browser smokes;
- avoiding unnecessary abstraction.
Efficiency must never mean inventing backend behavior or skipping final verification.

## Realtime Voice 2C boundary

- Browser owns WebRTC audio, captions/UI and local media cleanup only.
- Only POST live/session and live/close are allowed through the Intelligence BFF.
- Never interpret/execute function calls, forward question/callId, send function_call_output,
  send response.create, or restore a business relay. Intelligence's private sideband owns tools.
- Keep the data channel and its lifecycle/caption/progress events. Ignore reflected tool items.
- Conversation 3A explicitly unifies text/Live ephemeral context via Intelligence. Basic voice
  remains independent; never synchronize transcript deltas as business memory.
- Live captions are not verified structured references; do not invent cards from spoken output.
- Google auth remains in the existing HTTP/BFF flow. OpenAI keys and private Live credential
  context stay exclusively in Intelligence. No new browser credential storage.
- Close media on identity change/logout/unmount, errors and the absolute 600 second limit.


## Conversation 3A boundary

- Keep conversationId/messages only in React memory under the authenticated Management AppShell.
  No localStorage/sessionStorage/cookies/IndexedDB for conversation state. Existing Google auth
  storage is unchanged. The server generates IDs and checks official subject ownership.
- Create on first panel open; panel hide/navigation preserve ID. Logout/identity change aborts
  work, clears messages/references/audio, closes Live and conversation best-effort. New conversation
  closes/replaces explicitly; never silently replay a failed question into a new context.
- Chat and Live creation send the same ID. Disable text while Live is active. Basic voice is
  explicitly stateless. Browser does not resolve references, execute tools or own business truth.
- Only POST conversation and conversation/close extend the existing closed BFF allowlist.
  Keep strict contracts, safe errors, no-store, server-only origin and credential forwarding.
- Live captions are visual fragments, not shared turn history. Intelligence stores only completed
  semantic delegations and rereads current facts via existing tools. No persistent memory or RAG.


## Management Intelligence 4B boundary

- Parse and render the closed `document_analysis` contract and minimal document references.
- Source metadata (filename, version/current status, date, project association) comes from
  Intelligence evidence backed by SnG Control. Do not invent page numbers or document links.
- Document assertions are attributed content, never authoritative current operational state.
- Source navigation opens the existing project page only. No new file viewer, provider Files
  API, document bytes, document execution, RAG or persistent document cache in Intelligence UI.
- Keep metadata-only lists and complete document clarification choices visible and accessible.
- Preserve the existing conversationId and Live protocol; never execute document tools in browser
  or send provider credentials, document content or fabricated reference metadata to Intelligence.
- Existing operational document upload/download behavior remains outside this feature.

Identity & Areas V1: available roles come only from Backend auth/me. One activeRole controls navigation and actions; sessionStorage is a non-authoritative preference revalidated on restore. Operational requests send X-SnG-Active-Role through the closed BFF. Role switches cancel/remount the experience and clean up Management Intelligence/voice; do not change project ownership or task assignments.

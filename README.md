Layer Purpose
Agent PWA Polling unit agents submit Form EC8A results and incident reports from the field — works fully offline
Admin Dashboards Live national → state → LGA → ward → PU drill-down with real-time vote tallies
Verification Workflow Ward Admins review photographic evidence and verify or flag submissions
Collation Engine Automatically aggregates verified votes up the 5-level hierarchy with hash-chain integrity
Incident Tracking Agents report violence, ballot snatching, and irregularities; admins triage and resolve
CSV Exports Downloadable per-PU results and per-LGA collation summaries for external analysis

Layer Technology
Frontend React 18 + Vite + Tailwind CSS + React Router + Zustand
PWA vite-plugin-pwa + IndexedDB (idb) + Workbox
Backend Node.js + Express 4
Database MongoDB Atlas (Mongoose)
Auth JWT (access + refresh rotation) + bcrypt
Storage Cloudinary (evidence photos + videos)
Maps Leaflet + react-leaflet (incident heatmap)
Deployment Vercel (frontend) + Render (backend)

ERMS/
├── backend/
│   ├── src/
│   │   ├── config/           # env, database, cloudinary
│   │   ├── models/           # User, State, LGA, Ward, PU, Election, Party, Candidate,
│   │   │                     # Result, Incident, Collation, Notification, AuditLog
│   │   ├── controllers/      # auth, election, result, incident, collation,
│   │   │                     # party, candidate, geo, report, notification
│   │   ├── routes/           # one per controller, wired in routes/index.js
│   │   ├── middleware/       # auth, scope, rateLimiter, upload, validate, errorHandler
│   │   ├── services/         # collation, evidence, incidentEvidence, audit, resultHash
│   │   ├── utils/            # ApiError, asyncHandler, geo, roleScope, tokens
│   │   ├── validators/       # Zod schemas for every route
│   │   └── server.js
│   ├── scripts/
│   │   ├── seedGeo.js        # Load geo tree from CSV
│   │   └── seedSuperAdmin.js # Bootstrap the first admin
│   └── package.json
│
├── frontend/
│   ├── src/
│   │   ├── components/       # AppShell, PartyBar, ReportingRing, IncidentMap
│   │   ├── context/          # AuthContext (user + tokens)
│   │   ├── hooks/            # useApi (fetch + polling)
│   │   ├── services/         # api, offlineQueue, syncService, notifications
│   │   ├── pages/
│   │   │   ├── auth/         # LoginPage
│   │   │   ├── agent/        # AgentHome, SubmitResult, SubmitIncident, OfflineQueue
│   │   │   └── admin/        # AdminDashboard, DashboardState/LGA/Ward,
│   │   │                     # ResultsReview, IncidentsPage, ElectionsPage,
│   │   │                     # PartiesPage, CandidatesPage, UsersPage
│   │   ├── utils/            # roles
│   │   └── App.jsx
│   └── package.json
│
└── README.md

Role Scope Can Do
NATIONAL_SUPER_ADMIN All Nigeria Create elections (all levels), manage all users, view national dashboard, verify anything
STATE_ADMIN Assigned state Create State/LGA/Ward elections, create LGA/Ward admins + agents, view state dashboard
LGA_ADMIN Assigned LGA Create Ward admins + agents, view LGA dashboard, verify ward results
WARD_ADMIN Assigned ward Create agents, verify PU results, manage incidents in ward
POLLING_UNIT_AGENT Assigned PU Submit results + incidents for their PU only
OBSERVER Read-only View all dashboards + results (no actions)


Level Type Scope Required
FEDERAL President None (national)
FEDERAL Senator State
FEDERAL House of Reps State + LGA
STATE Governor State
STATE State Assembly State + LGA
LOCAL_GOVERNMENT LGA Chairman State + LGA
WARD Councillor State + LGA + Ward

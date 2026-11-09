CodeSmartNG ERMS

Election Results Management System

Developed by CodeSmartNG

CodeSmartNG ERMS is a web-based Election Results Management System designed to support election observation, polling-unit result reporting, evidence collection, verification, incident reporting and hierarchical results collation across Nigeria.

The platform provides a structured system for managing election observation activities from polling units to national-level reporting.

Live Demo: https://erms-frontend-mu.vercel.app/

---

1. Project Overview

CodeSmartNG ERMS provides a centralised platform where authorised election observers and administrators can submit, review, verify and analyse election observation data.

The system uses a hierarchical administrative structure to organise election information and control access to sensitive records.

2. Key Features

- Election management
- Political party management
- Candidate management
- User and role management
- Polling-unit result submission
- Photographic evidence collection
- Results verification
- Results collation and reporting
- Election incident reporting
- Geographic administration
- CSV report downloads
- National dashboard and statistics
- Role-based access control

3. Administrative Structure

The platform supports five administrative levels:

Role| Responsibilities
Super Admin| National administration and system oversight
State Admin| Manages assigned state
LGA Admin| Manages assigned Local Government Areas
Ward Admin| Manages assigned wards
Polling Unit Agent| Submits polling-unit reports and evidence

4. Results Reporting Workflow

1. Polling Unit Agent submits election results and photographic evidence.
2. Ward Admin reviews submitted reports.
3. Results are verified, flagged or rejected according to the workflow.
4. Verified ward results are collated at LGA level.
5. LGA results are collated at state level.
6. State results are collated at national level.
7. Authorised administrators access reports and statistics.

5. Geographic Coverage

The platform is designed for Nigeria's:

- 36 states
- Federal Capital Territory
- 774 Local Government Areas
- Electoral wards
- Polling units

Geographic access is controlled according to administrative responsibilities.

6. Technology Stack

Frontend

- React
- Vite
- Tailwind CSS

Backend

- Node.js
- Express.js
- MongoDB
- Mongoose
- JWT Authentication

Deployment

- Vercel (Frontend)
- Render (Backend)
- MongoDB Atlas (Database)

7. Dashboard and Reports

The dashboard provides election-level statistics, including:

- Polling units verified
- Accredited voters
- Total votes
- Reporting percentage
- Election reporting progress

The system also supports downloadable CSV reports for authorised users.

8. Security and Access Control

The platform is designed with:

- Authentication and role-based permissions
- Geographic access restrictions
- Password protection
- Result submission history
- Photographic evidence records
- Verification workflows
- Administrative access controls

Security and data-integrity controls should be tested and independently reviewed before operational deployment.

9. Intended Use

CodeSmartNG ERMS is intended to support independent election observation, structured reporting, monitoring and results analysis.

Important: CodeSmartNG ERMS is an independent software platform. It is not an official INEC platform and does not replace INEC's statutory election processes or official declarations. Results displayed on the platform represent submitted or verified observation data, not automatically certified election results.

10. Live Platform

Visit the demonstration platform:

https://erms-frontend-mu.vercel.app/

11. Developer

CodeSmartNG

Software Development | Technology | Digital Solutions

Project: CodeSmartNG ERMS

---

Copyright © 2026 CodeSmartNG. All rights reserved.

# Project Brief: WAHA Gateway

**Goal:** Build a gateway application (likely for WhatsApp or a similar messaging service, inferred from "WAHA") that allows users to manage interactions, potentially including message templates, contacts, and campaigns.

**Core Requirements:**

*   User authentication and authorization.
*   Management of application-specific resources (e.g., Message Templates).
*   A web-based dashboard for user interaction.
*   API for programmatic access (tRPC).

**Key Technologies:**

*   Next.js (Frontend Framework)
*   tRPC (API Layer)
*   Prisma (ORM)
*   NextAuth.js (Authentication)
*   shadcn/ui (UI Components)
*   PostgreSQL (Database - inferred from Prisma usage)
*   TypeScript

**Scope:** The initial focus is on implementing CRUD functionality for Message Templates. Future scope may include contact management, message sending, campaign management, etc.
# Plan: Campaign History & Dashboard UI

**Goal:** Create the main dashboard overview page and the campaign history page, displaying relevant information fetched via tRPC with pagination.

**1. Enhance tRPC `list` Procedure (`src/server/api/routers/campaign.ts`)**

*   **Input:** Modify the existing `list` procedure to accept pagination input using `zod`. Use offset/limit pagination.
    *   `page`: `z.number().int().positive().optional().default(1)`
    *   `pageSize`: `z.number().int().positive().optional().default(10)`
*   **Logic:**
    *   Calculate `skip` (`(page - 1) * pageSize`) and `take` (`pageSize`).
    *   Fetch the paginated list of campaigns for the logged-in user (`ctx.session.user.id`) using `ctx.db.campaign.findMany` with `skip`, `take`, and `where: { userId }`.
    *   Fetch the total count using `ctx.db.campaign.count({ where: { userId } })`.
    *   Order campaigns by `createdAt: 'desc'`.
    *   Select necessary fields: `id`, `name`, `status`, `scheduledAt`, `createdAt`, `totalContacts`, `sentCount`, `failedCount`.
*   **Output:** Return an object: `{ campaigns: Campaign[], totalCount: number }`.

**2. Update Campaign History Page (`src/app/dashboard/campaigns/page.tsx`)**

*   **Data Fetching:**
    *   Use `useState` for `pageIndex` (0-based for TanStack Table) and `pageSize`.
    *   Modify `api.campaign.list.useQuery` to pass `{ page: pageIndex + 1, pageSize }`.
*   **State Management:**
    *   Define `pagination` state: `const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 10 });`
*   **DataTable Integration:**
    *   Calculate `pageCount`: `Math.ceil(data?.totalCount ?? 0 / pagination.pageSize)`.
    *   Pass `data?.campaigns ?? []` as `data`.
    *   Pass `pageCount`.
    *   Pass `pagination` state.
    *   Pass `setPagination` as `onPaginationChange`.

**3. Enhance `DataTable` Component (`src/components/data-table.tsx`)**

*   **Props:** Add:
    *   `pageCount: number`
    *   `pagination?: PaginationState` (where `PaginationState` is `{ pageIndex: number, pageSize: number }` from `@tanstack/react-table`)
    *   `onPaginationChange?: OnChangeFn<PaginationState>`
*   **React Table Configuration:**
    *   Add `manualPagination: true` to `useReactTable` options.
    *   Pass `pageCount`, `state: { ..., pagination }`, `onPaginationChange`.
*   **UI:**
    *   Update "Previous"/"Next" button `disabled` logic using `table.getState().pagination.pageIndex` and `pageCount`.
    *   Display current page info: `Page {table.getState().pagination.pageIndex + 1} of {table.getPageCount()}`.

**4. Update Dashboard Overview Page (`src/app/dashboard/page.tsx`)**

*   **Convert to Client Component:** Add `"use client";`.
*   **Recent Campaigns:**
    *   Use `api.campaign.list.useQuery({ page: 1, pageSize: 5 })`.
    *   Render loading/error states.
    *   Display data in a `Card` with a simple `Table` or list (Name, Status, Progress).
*   **Create Campaign Button:** Add `<Link href="/dashboard/campaigns/create"><Button>Create Campaign</Button></Link>`.
*   **Connection Status:** Ensure `<ConnectionStatus />` is present.

**5. Navigation (`src/app/dashboard/layout.tsx`)**

*   Review `src/app/dashboard/layout.tsx` for a sidebar/navigation component.
*   Ensure links exist for: `/dashboard`, `/dashboard/campaigns`, `/dashboard/templates`, `/dashboard/contacts`. Add if missing.

**6. Testing**

*   **Backend (`campaign.test.ts`):** Test `list` with pagination parameters.
*   **Frontend (Component Tests):**
    *   Test `DataTable` with pagination props.
    *   Test `CampaignsPage` with mocked paginated data.
    *   Test `DashboardPage`'s "Recent Campaigns" section.

**Mermaid Diagram:**

```mermaid
graph TD
    subgraph Backend (tRPC)
        A[campaign.ts: list(page, pageSize)] -- Prisma Query (skip, take, count) --> B(Database: Campaigns)
        A -- Returns { campaigns[], totalCount } --> C{Frontend}
    end

    subgraph Frontend (Next.js/React)
        C -- tRPC Hook (page, pageSize) --> D[campaigns/page.tsx (Client)]
        D -- Manages --> Pa[Pagination State (pageIndex, pageSize)]
        D -- Passes Props --> F[DataTable Component]
        F -- Uses --> Pa
        F -- Calls --> Pb[onPaginationChange Handler in D]

        C -- tRPC Hook (page:1, pageSize:5) --> E[dashboard/page.tsx (Client)]
        E -- Renders --> G[Recent Campaigns UI (Card/Table)]
        E -- Renders --> H[ConnectionStatus Component]
        E -- Renders --> I[Create Campaign Button (Link)]

        L[dashboard/layout.tsx] -- Provides --> M[Sidebar Navigation]
    end

    subgraph Components
        F[DataTable Component] -- Enhanced Props (pageCount, pagination, onPaginationChange) --> F
        F -- Renders --> J[Table & Pagination Controls (Page X of Y)]
    end

    subgraph Testing
        N[campaign.test.ts] -- Tests Pagination --> A
        O[Component Tests (Vitest)] -- Mocks tRPC & Props --> D
        O -- Mocks tRPC & Props --> E
        O -- Mocks Props --> F
    end

    B -- Returns Data & Count --> A
    M -- Links To --> D
    M -- Links To --> E
    M -- Links To --> P[Other Pages: Templates, Contacts]

    style A fill:#ccf,stroke:#333,stroke-width:2px
    style F fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#cfc,stroke:#333,stroke-width:2px
    style E fill:#cfc,stroke:#333,stroke-width:2px
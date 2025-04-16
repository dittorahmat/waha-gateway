Okay, let's architect this WAHA WhatsApp Gateway Dashboard using the T3 stack (Next.js, Prisma, tRPC, NextAuth.js, Tailwind, shadcn) and PostgreSQL.

**Project Goal:** Build a web dashboard for small business owners to connect their WhatsApp number (via WAHA), manage contacts (CSV upload) and message templates, and schedule/send personalized promotional campaigns with images, incorporating safe sending delays.

**Tech Stack:**

*   **Framework:** Next.js (App Router)
*   **Language:** TypeScript
*   **Database:** PostgreSQL
*   **ORM:** Prisma
*   **API Layer:** tRPC
*   **Authentication:** NextAuth.js (Email/Password Provider)
*   **UI Components:** shadcn/ui
*   **Styling:** Tailwind CSS
*   **WhatsApp Engine:** External WAHA instance

---

**Blueprint: Step-by-Step Implementation Plan**

1.  **Phase 1: Foundation & Setup**
    *   **Step 1.1:** Initialize Project using `create-t3-app` (Next.js, TypeScript, Prisma, tRPC, NextAuth.js, Tailwind).
    *   **Step 1.2:** Configure PostgreSQL connection for Prisma.
    *   **Step 1.3:** Define initial Prisma Schema (User, Account, Session, VerificationToken for NextAuth).
    *   **Step 1.4:** Run initial Prisma migration.
    *   **Step 1.5:** Configure NextAuth.js with Email/Password provider.
    *   **Step 1.6:** Implement basic Login/Signup UI pages using shadcn components.
    *   **Step 1.7:** Create a simple protected dashboard page accessible only after login.
    *   **Step 1.8:** Set up basic tRPC router structure.
    *   **Step 1.9:** Configure `.env` for database URL and NextAuth secrets. Add placeholders for WAHA URL/API Key.
    *   **Testing:** Basic auth flow testing (signup, login, accessing protected route).

2.  **Phase 2: Core Data Management (Templates, Contacts, Media)**
    *   **Step 2.1:** Extend Prisma Schema: Add `MessageTemplate` model (userId, name, textContent). Run migration.
    *   **Step 2.2:** Create tRPC procedures (router) for MessageTemplate CRUD (create, read list, read single, update, delete) - ensure user ownership is checked.
    *   **Step 2.3:** Build UI section for Message Templates: Use shadcn Table to list templates, Dialog/Form to create/edit (Input for name, Textarea for text), AlertDialog for delete confirmation. Add instructions for markdown and `{Name}` placeholder.
    *   **Step 2.4:** Extend Prisma Schema: Add `ContactList` (userId, name, contactCount, createdAt) and `Contact` (contactListId, phoneNumber, firstName nullable). Run migration.
    *   **Step 2.5:** Create tRPC procedures for ContactList management: Upload CSV (parse, validate, store contacts, update count), List (user's lists), Delete list (and associated contacts).
    *   **Step 2.6:** Build UI section for Contact Lists: Form with FileInput (shadcn) for CSV upload, Table to list lists, AlertDialog for delete confirmation.
    *   **Step 2.7:** Extend Prisma Schema: Add `MediaLibraryItem` (userId, filename, storagePath, mimeType, createdAt). Run migration.
    *   **Step 2.8:** Implement backend logic for storing uploaded images (e.g., in a `./public/uploads/{userId}/` directory or a configured path). Ensure unique filenames or use IDs.
    *   **Step 2.9:** Create tRPC procedures for Media Library: Upload image (store file, save metadata), List images (user's images), Delete image (delete file, remove metadata).
    *   **Step 2.10:** Build UI section for Media Library: Simple grid display of image thumbnails, Upload button, Delete button per image.
    *   **Testing:** Unit tests for CSV parsing. Integration tests for tRPC procedures (CRUD operations, user ownership checks). Component tests for UI forms/tables. Test image upload/deletion.

3.  **Phase 3: WAHA Integration & Session Management**
    *   **Step 3.1:** Extend Prisma Schema: Add `WahaSession` (userId, sessionName, status - string enum matching WAHASessionStatus). Run migration. *Note: Status might be fetched live, but storing last known status can be useful.*
    *   **Step 3.2:** Create a backend service/utility for interacting with the WAHA API (using configured URL/Key from `.env`). Include methods for `startSession`, `getSessionStatus`, `getQrCode`, `requestCode`, `logoutSession`, `sendText`, `sendImage`. Handle basic API errors.
    *   **Step 3.3:** Create tRPC procedures: `connectWahaSession` (calls WAHA start, stores session name/initial status), `getWahaSessionStatus` (calls WAHA status endpoint, updates DB, returns status/QR/code), `logoutWahaSession` (calls WAHA logout, updates DB status).
    *   **Step 3.4:** Build UI component for WhatsApp Connection Status: Display status from `getWahaSessionStatus`. Show "Connect" button if no session exists for the user. Show QR code/Pairing code if status requires it. Show "Logout" button if connected. Implement periodic polling for status updates on the frontend.
    *   **Testing:** Mock WAHA API service. Test tRPC procedures for session lifecycle. Test UI component displays correct status/QR/buttons.

4.  **Phase 4: Campaign Core & Scheduling**
    *   **Step 4.1:** Extend Prisma Schema: Add `Campaign` model (userId, name, contactListId, messageTemplateId, mediaLibraryItemId (nullable), defaultNameValue, scheduledAt, status (enum: Scheduled, Running, Paused, Completed, Failed), totalContacts, sentCount, failedCount, lastProcessedContactIndex (nullable), createdAt, startedAt (nullable), completedAt (nullable)). Add foreign key constraints. Run migration.
    *   **Step 4.2:** Create tRPC procedure: `createCampaign` (takes all inputs from UI, validates, saves campaign with 'Scheduled' status).
    *   **Step 4.3:** Build UI for Campaign Creation: Form using shadcn components. Selectors for Contact List, Message Template. Optional section for Image (Upload new / Select from Library). Input for Default Name Value. DateTime Picker for scheduling.
    *   **Step 4.4:** Implement a basic job scheduling mechanism on the backend. (e.g., using `node-cron` for simplicity initially, or a more robust queue like BullMQ if scaling is anticipated later). The job should trigger based on `scheduledAt`.
    *   **Testing:** Test tRPC procedure for campaign creation (validation, saving). Test UI form submission. Test basic job scheduling (e.g., log a message when a scheduled time is hit).

5.  **Phase 5: Campaign Execution & Handling**
    *   **Step 5.1:** Create a Backend Campaign Runner Service. This service will be invoked by the scheduler.
    *   **Step 5.2:** Implement Runner Logic (Part 1 - Fetching): Given a campaign ID, fetch campaign details, associated contacts, template text, and media path (if any). Update campaign status to `Running`.
    *   **Step 5.3:** Implement Runner Logic (Part 2 - Basic Loop): Iterate through contacts (starting from `lastProcessedContactIndex` or 0). Personalize message text (`{Name}`). *For now, just log the personalized message and target number.* Update `lastProcessedContactIndex`.
    *   **Step 5.4:** Integrate WAHA Sending: Modify the loop to call the WAHA API service (`sendText` or `sendImage`). Update `sentCount` or `failedCount` based on the API response.
    *   **Step 5.5:** Implement Randomized Delay: Add `await sleep(random(6000, 12000))` within the loop after each successful/failed send attempt.
    *   **Step 5.6:** Implement Status Check & Pause: Before sending each message, call the WAHA API service to check the session status. If not `WORKING`, update the campaign status to `Paused` in the DB and stop the loop.
    *   **Step 5.7:** Implement Completion: When the loop finishes, update the campaign status to `Completed`.
    *   **Step 5.8:** Create tRPC procedure: `resumeCampaign` (takes campaign ID, updates status to `Scheduled` - the scheduler should pick it up again, or directly trigger the runner service to continue from `lastProcessedContactIndex`).
    *   **Step 5.9:** Add "Resume" button to UI for paused campaigns.
    *   **Testing:** Unit test the Runner Service logic (fetching, personalization, looping, status updates). Mock the WAHA API service and scheduler. Test pause/resume flow. Test delay mechanism.

6.  **Phase 6: UI Polish & Final Integration**
    *   **Step 6.1:** Build Campaign History UI: Table displaying campaigns fetched via a new tRPC procedure (`listCampaigns`). Show Name, Status, Schedule Time, Summary Counts. Add Resume button conditionally.
    *   **Step 6.2:** Build Dashboard Overview UI: Combine the Connection Status component (Step 3.4) and a summary view of Recent Campaigns (from Step 6.1). Add prominent "Create Campaign" button.
    *   **Step 6.3:** Implement UI Notifications: Use shadcn Toaster to show notifications for key events (e.g., Campaign Paused, Campaign Completed, CSV Upload Success/Failure).
    *   **Step 6.4:** Apply Tailwind CSS and shadcn styling consistently across all UI components. Ensure responsiveness.
    *   **Step 6.5:** Add the WhatsApp blocking disclaimer prominently in the UI (e.g., near campaign creation/scheduling).
    *   **Testing:** E2E tests covering the main user flows. Manual testing for UI/UX and edge cases.

---

**LLM Prompts for Implementation (Iterative & Test-Driven)**

*(Note: Each prompt assumes the context of the previous steps and the specified tech stack. The developer using these prompts should adapt file paths and existing code structures as needed.)*

---

**Prompt 1: Project Setup & Basic Auth**

```text
# Project Setup & Basic Authentication

**Goal:** Initialize the T3 application, set up the database connection, configure basic email/password authentication using NextAuth.js, and create a protected dashboard route.

**Tasks:**

1.  **Initialize Project:** Run `npm create t3-app@latest` selecting Next.js (App Router), TypeScript, Prisma, tRPC, NextAuth.js, and Tailwind CSS.
2.  **Configure Database:** Update the `.env` file with your PostgreSQL connection string (`DATABASE_URL`).
3.  **Prisma Schema (Auth):** Update `schema.prisma` to include the necessary models for NextAuth.js (`User`, `Account`, `Session`, `VerificationToken`). Ensure the `User` model has `email` and `password` (for the Credentials provider) fields. Add basic `createdAt` and `updatedAt` fields.
4.  **Prisma Migrate:** Run `npx prisma db push` (or `migrate dev`) to sync the schema with the database.
5.  **NextAuth Configuration:**
    *   Configure NextAuth.js in `src/server/auth.ts` (or equivalent T3 setup location).
    *   Set up the `CredentialsProvider` for email/password authentication. Implement the `authorize` function to validate user credentials against the database (hash password on signup, compare hash on login - use a library like `bcrypt`).
    *   Configure the Prisma adapter for NextAuth.js (`@next-auth/prisma-adapter`).
    *   Update `.env` with `NEXTAUTH_SECRET` and `NEXTAUTH_URL`.
6.  **UI Components (Auth):**
    *   Create basic `app/auth/signin/page.tsx` and `app/auth/signup/page.tsx` components using shadcn `Card`, `Input`, `Button`, and `Label`.
    *   Implement form handling for signup (calling a tRPC mutation - see next step) and login (using NextAuth's `signIn` function).
7.  **tRPC Setup (Auth):**
    *   Create a basic tRPC router (`src/server/api/root.ts`).
    *   Create an `auth` router (`src/server/api/routers/auth.ts`).
    *   Add a `signup` mutation to the `auth` router that takes email/password, hashes the password, and creates a new user in the database using Prisma.
8.  **Protected Route:**
    *   Create a simple dashboard page (e.g., `app/dashboard/page.tsx`).
    *   Protect this route using NextAuth.js server-side session checking or middleware to redirect unauthenticated users to the sign-in page. Display the logged-in user's email or a welcome message.
9.  **Testing:**
    *   Manually test the signup and login flow.
    *   Verify that the dashboard page is protected.
    *   Write a basic unit test for the password hashing logic within the signup mutation.
```

---

**Prompt 2: Database Schema Expansion**

```text
# Database Schema Expansion

**Goal:** Define the complete Prisma schema for all required data models based on the project specification.

**Context:** Building upon the previous setup with User/Auth models.

**Tasks:**

1.  **Update Prisma Schema (`schema.prisma`):**
    *   **`WahaSession`:** Add fields `userId` (relation to User), `sessionName` (String, unique per user), `status` (String, consider making this an Enum later if needed), `createdAt`, `updatedAt`.
    *   **`MessageTemplate`:** Add fields `userId` (relation to User), `name` (String), `textContent` (String @db.Text), `createdAt`, `updatedAt`. Add index on `userId`.
    *   **`ContactList`:** Add fields `userId` (relation to User), `name` (String), `contactCount` (Int, default 0), `createdAt`. Add index on `userId`.
    *   **`Contact`:** Add fields `contactListId` (relation to ContactList), `phoneNumber` (String), `firstName` (String, nullable). Add index on `contactListId`. Add index on `phoneNumber` (consider if uniqueness is needed per list or globally).
    *   **`MediaLibraryItem`:** Add fields `userId` (relation to User), `filename` (String), `storagePath` (String, unique), `mimeType` (String), `createdAt`. Add index on `userId`.
    *   **`Campaign`:** Add fields `userId` (relation to User), `name` (String), `contactListId` (relation to ContactList), `messageTemplateId` (relation to MessageTemplate), `mediaLibraryItemId` (relation to MediaLibraryItem, nullable), `defaultNameValue` (String), `scheduledAt` (DateTime), `status` (String - e.g., "Scheduled", "Running", "Paused", "Completed", "Failed"), `totalContacts` (Int), `sentCount` (Int, default 0), `failedCount` (Int, default 0), `lastProcessedContactIndex` (Int, nullable), `createdAt`, `startedAt` (DateTime, nullable), `completedAt` (DateTime, nullable). Add index on `userId`. Add index on `status`.
    *   Ensure all relations (`@relation`) and cascading deletes (`onDelete`) are appropriately defined (e.g., deleting a `ContactList` should delete its `Contacts`, deleting a `User` might delete all their associated data).
2.  **Prisma Migrate:** Run `npx prisma migrate dev --name expand-schema` (or similar) to generate and apply the SQL migration.
3.  **Prisma Generate:** Run `npx prisma generate` to update the Prisma Client.
4.  **Testing:** No direct tests here, but review the generated SQL migration file for correctness.
```

---

**Prompt 3: Message Template CRUD**

```text
# Message Template CRUD

**Goal:** Implement the backend tRPC procedures and frontend UI for creating, reading, updating, and deleting message templates.

**Context:** The Prisma schema including `MessageTemplate` is defined. Basic auth and tRPC structure exist.

**Tasks:**

1.  **tRPC Router (`template.ts`):**
    *   Create a new router `src/server/api/routers/template.ts` and add it to the main `root.ts` router.
    *   Implement the following protected procedures (ensure user is authenticated and operations are scoped to the logged-in user's `userId`):
        *   `create`: Input: `name` (string), `textContent` (string). Creates a new template for the user. Returns the created template. Use Zod for input validation.
        *   `list`: Input: None. Returns a list of all templates belonging to the user.
        *   `get`: Input: `id` (string). Returns a single template belonging to the user.
        *   `update`: Input: `id` (string), `name` (string), `textContent` (string). Updates the specified template. Returns the updated template.
        *   `delete`: Input: `id` (string). Deletes the specified template. Returns success status.
2.  **Frontend UI (`app/dashboard/templates/page.tsx`):**
    *   Create a new page route for managing templates.
    *   Use the `list` tRPC query (`api.template.list.useQuery()`) to fetch and display templates in a shadcn `DataTable`. Include columns for Name and Actions (Edit, Delete).
    *   Implement a "Create Template" button that opens a shadcn `Dialog`.
    *   Inside the Dialog, use a shadcn `Form` with `Input` for Name and `Textarea` for `textContent`. Add helper text/link regarding markdown formatting and the `{Name}` placeholder. Handle form submission using the `create` tRPC mutation (`api.template.create.useMutation()`). Invalidate the `list` query on success to refresh the table.
    *   Implement the "Edit" action: Open the same Dialog, pre-filled with template data (fetched via `api.template.get.useQuery()` or passed from the list). Handle form submission using the `update` tRPC mutation. Invalidate the `list` query.
    *   Implement the "Delete" action: Use a shadcn `AlertDialog` for confirmation. On confirm, call the `delete` tRPC mutation. Invalidate the `list` query.
3.  **Navigation:** Add a link to the new "Templates" page in the main dashboard layout/navigation.
4.  **Testing:**
    *   Write integration tests for the tRPC procedures (create, list, get, update, delete), ensuring user ownership constraints work.
    *   Write basic component tests for the Form/Dialog and DataTable components.
    *   Manually test the full CRUD flow in the UI.
```

---

**Prompt 4: Contact List CRUD & CSV Upload**

```text
# Contact List CRUD & CSV Upload

**Goal:** Implement backend tRPC and frontend UI for uploading contact lists via CSV, viewing lists, and deleting them.

**Context:** Prisma schema includes `ContactList` and `Contact`. Template CRUD is implemented.

**Tasks:**

1.  **CSV Parsing Utility:** Create a utility function (e.g., `src/utils/csvParser.ts`) that takes a file buffer or path, parses the CSV content, validates headers (`phone_number`, optional `first_name`), validates phone number formats (basic check, e.g., digits only, maybe length), formats numbers to `number@c.us`, and returns an array of contact objects `{ phoneNumber: string, firstName?: string }`. Handle potential errors during parsing.
2.  **tRPC Router (`contactList.ts`):**
    *   Create `src/server/api/routers/contactList.ts` and add to `root.ts`.
    *   Implement protected procedures:
        *   `upload`: Input: `name` (string), `fileContentBase64` (string). Decodes the base64 content, uses the CSV parser utility, creates a `ContactList` record, creates associated `Contact` records in a transaction, updates `contactCount`. Returns the created `ContactList`. Use Zod for input. Handle parsing/validation errors.
        *   `list`: Input: None. Returns a list of `ContactList` records (id, name, contactCount, createdAt) for the logged-in user.
        *   `delete`: Input: `id` (string). Deletes the `ContactList` and its associated `Contact` records (ensure cascading delete works or handle manually in a transaction). Returns success status.
3.  **Frontend UI (`app/dashboard/contacts/page.tsx`):**
    *   Create a new page route for managing contact lists.
    *   Implement an "Upload List" section:
        *   Use a shadcn `Form` with `Input` for List Name and a file input component (you might need a custom one or adapt shadcn `Input type="file"`).
        *   On file selection, read the file content as base64 on the client-side.
        *   On submit, call the `upload` tRPC mutation (`api.contactList.upload.useMutation()`). Provide feedback on success/error. Invalidate the `list` query on success.
    *   Use the `list` tRPC query (`api.contactList.list.useQuery()`) to display lists in a shadcn `DataTable` (Name, Contact Count, Upload Date, Delete Action).
    *   Implement the "Delete" action using a shadcn `AlertDialog` and the `delete` tRPC mutation. Invalidate the `list` query.
4.  **Navigation:** Add a link to the "Contact Lists" page in the dashboard navigation.
5.  **Testing:**
    *   Unit test the CSV parsing utility with various valid/invalid inputs.
    *   Integration test the tRPC procedures (upload with valid/invalid CSVs, list, delete).
    *   Manually test the UI flow for uploading, viewing, and deleting lists.
```

---

**Prompt 5: WAHA Connection UI & Backend**

```text
# WAHA Connection UI & Backend

**Goal:** Implement the backend logic and frontend UI for connecting a user's WhatsApp account via WAHA, displaying the status/QR code, and allowing logout.

**Context:** Prisma schema includes `WahaSession`. Basic auth exists. `.env` has placeholders for WAHA config.

**Tasks:**

1.  **WAHA API Service (`src/server/services/wahaClient.ts`):**
    *   Create a service class to encapsulate all WAHA API interactions.
    *   Read `WAHA_BASE_URL` and `WAHA_API_KEY` from environment variables (use a config service or directly `process.env`). Throw an error on startup if they are missing.
    *   Implement methods using `axios` or similar:
        *   `startSession(sessionName: string): Promise<void>` (Calls `POST /api/sessions`)
        *   `getSessionStatus(sessionName: string): Promise<{ status: WAHASessionStatus, qr?: string, code?: string }>` (Calls `GET /api/sessions/{session}` and potentially `GET /api/sessions/{session}/auth/qr` or `POST /.../request-code` based on status)
        *   `getQrCode(sessionName: string): Promise<string | null>` (Calls `GET /api/sessions/{session}/auth/qr` - expects base64 image)
        *   `requestCode(sessionName: string, phoneNumber: string): Promise<string | null>` (Calls `POST /api/sessions/{session}/auth/request-code`)
        *   `logoutSession(sessionName: string): Promise<void>` (Calls `POST /api/sessions/{session}/logout`)
        *   `sendTextMessage(sessionName: string, chatId: string, text: string): Promise<any>` (Calls `POST /api/sendText`)
        *   `sendImageMessage(sessionName: string, chatId: string, file: { filename: string, base64: string, mimeType: string }, caption?: string): Promise<any>` (Calls `POST /api/sendImage`)
    *   Include the API key in request headers. Handle basic network/API errors.
2.  **tRPC Router (`waha.ts`):**
    *   Create `src/server/api/routers/waha.ts` and add to `root.ts`.
    *   Implement protected procedures:
        *   `getSessionState`: Fetches the user's associated `WahaSession` from DB. If none, return `{ connected: false }`. If exists, call `wahaClient.getSessionStatus`. If status requires QR/code, fetch it using `wahaClient`. Update the status in the DB. Return `{ connected: boolean, status: WAHASessionStatus, qrCode?: string, pairingCode?: string }`.
        *   `startSession`: Checks if user already has a session. If not, generate a unique `sessionName` (e.g., `user_${userId}`), call `wahaClient.startSession`, save the `WahaSession` record to DB with initial status (e.g., 'STARTING'). Return success/failure.
        *   `requestPairingCode`: Input `phoneNumber` (string). Get user's `sessionName`. Call `wahaClient.requestCode`. Return the code.
        *   `logoutSession`: Get user's `sessionName`. Call `wahaClient.logoutSession`. Update `WahaSession` status in DB to 'STOPPED' or remove the record. Return success.
3.  **Frontend Component (`ConnectionStatus.tsx`):**
    *   Create a reusable component to display the connection status.
    *   Use `api.waha.getSessionState.useQuery()` to fetch the state. Implement polling (`refetchInterval`) to keep the status updated (e.g., every 5 seconds).
    *   **Display Logic:**
        *   If `!connected`, show a "Connect WhatsApp" button which triggers a `startSession` mutation (`api.waha.startSession.useMutation()`).
        *   If `status === 'SCAN_QR_CODE'`, display the `qrCode` (as an `<img>` tag with base64 src). Add instructions to scan.
        *   If `status === 'PAIRING_CODE'`, display the `pairingCode`. Add instructions to enter it. (Consider adding a phone number input and button to trigger `requestPairingCode` mutation).
        *   If `status === 'WORKING'`, show "Connected" status and a "Logout" button triggering `logoutSession` mutation.
        *   If `status === 'Disconnected'` or `Error` (or other non-working states), show the status and potentially a "Reconnect" (calls `startSession` again) or "Logout" button.
4.  **Integration:** Place the `ConnectionStatus` component prominently on the main dashboard page (`app/dashboard/page.tsx`).
5.  **Testing:**
    *   Unit test the WAHA API service methods by mocking `axios`.
    *   Integration test the tRPC procedures, mocking the WAHA API service. Test different status scenarios.
    *   Manually test the connection flow UI: Connect button -> QR display -> Scan -> Connected status -> Logout. Test pairing code flow if implemented. Test polling updates status correctly.
```

---

**Prompt 6: Campaign Creation (UI & Basic Backend)**

```text
# Campaign Creation (UI & Basic Backend)

**Goal:** Implement the UI and tRPC procedure for creating and saving a new campaign record, linking it to existing contact lists, templates, and optionally media items, without implementing the sending logic yet.

**Context:** CRUD for Templates, Contact Lists, and Media Library exists. WAHA connection UI is present. Prisma schema includes `Campaign`.

**Tasks:**

1.  **tRPC Router (`campaign.ts`):**
    *   Create `src/server/api/routers/campaign.ts` and add to `root.ts`.
    *   Implement a protected procedure `create`:
        *   Input: `name` (string), `contactListId` (string), `messageTemplateId` (string), `mediaLibraryItemId` (string, optional), `defaultNameValue` (string), `scheduledAt` (Date). Use Zod for validation.
        *   Logic:
            *   Verify the selected `contactListId`, `messageTemplateId`, and `mediaLibraryItemId` (if provided) belong to the logged-in user.
            *   Fetch the `contactCount` from the selected `ContactList`.
            *   Create a new `Campaign` record in the database with `status: 'Scheduled'`, `totalContacts: contactCount`, `sentCount: 0`, `failedCount: 0`, and other provided details.
        *   Return: The created `Campaign` object or success status.
2.  **Frontend UI (`app/dashboard/campaigns/create/page.tsx`):**
    *   Create a new page route for creating campaigns.
    *   Build a form using shadcn components:
        *   `Input` for Campaign Name.
        *   `Select` for Contact List (populate options using `api.contactList.list.useQuery()`).
        *   `Select` for Message Template (populate options using `api.template.list.useQuery()`).
        *   **Image Attachment Section (Optional):**
            *   Checkbox or Radio group: "Attach Image?" / "No Image" vs "Attach Image".
            *   If "Attach Image" is selected:
                *   Radio group: "Upload New" vs "Select from Library".
                *   If "Upload New": Show file input. Handle upload via `api.mediaLibrary.upload.useMutation()` and store the returned `mediaLibraryItemId`.
                *   If "Select from Library": Show a modal or dropdown populated by `api.mediaLibrary.list.useQuery()` allowing image selection. Store the selected `mediaLibraryItemId`.
        *   `Input` for Default Name Value (for `{Name}` placeholder).
        *   Date/Time Picker component (you might need to integrate one like `react-day-picker` used by shadcn Calendar/DatePicker) for `scheduledAt`.
        *   "Schedule Campaign" `Button`.
    *   On form submission, call the `create` tRPC mutation (`api.campaign.create.useMutation()`). Redirect to the campaign history page or show a success message on success. Handle validation/submission errors.
3.  **Navigation:** Add a "Create Campaign" link/button in the dashboard navigation or overview page.
4.  **Testing:**
    *   Integration test the `create` tRPC procedure (validation, ownership checks, record creation).
    *   Component test the campaign creation form.
    *   Manually test creating a campaign with and without an image attachment (both upload and library selection). Verify data is saved correctly in the database.
```

---

**Prompt 7: Basic Campaign Runner Service (Backend Logging Only)**

```text
# Basic Campaign Runner Service (Backend Logging Only)

**Goal:** Create a backend service that can be triggered (manually for now) to process a 'Scheduled' campaign. It should fetch data, iterate contacts, personalize messages, and log the intended actions, but *not* actually call the WAHA API yet. It should update the campaign status.

**Context:** Campaign creation is implemented. WAHA API service exists but won't be called yet.

**Tasks:**

1.  **Campaign Runner Service (`src/server/services/campaignRunner.ts`):**
    *   Create a class `CampaignRunnerService`.
    *   Inject Prisma client.
    *   Implement a method `runCampaign(campaignId: string): Promise<void>`.
    *   **Inside `runCampaign`:**
        *   Fetch the `Campaign` record by ID. If not found or not in 'Scheduled' (or 'Paused' later) state, log an error and return.
        *   Update campaign status to `Running` and set `startedAt` timestamp in the DB.
        *   Fetch the associated `MessageTemplate`.
        *   Fetch the associated `ContactList` and all its `Contacts` (potentially paginated if lists are huge, but start simple).
        *   Fetch the associated `MediaLibraryItem` path if `mediaLibraryItemId` is set.
        *   Determine the starting index (use `lastProcessedContactIndex` if resuming, else 0).
        *   **Loop through contacts:**
            *   For each contact starting from the index:
                *   Get `phoneNumber` and `firstName`.
                *   Personalize the template text: Replace `{Name}` with `firstName` or `defaultNameValue`.
                *   **Log Action:** Log the intended action, e.g., `console.log(`[Campaign ${campaignId}] Would send to ${contact.phoneNumber}: ${personalizedText} ${mediaPath ? `with media ${mediaPath}` : ''}`);`
                *   Update `lastProcessedContactIndex` in the DB for this campaign (can be done periodically or after each contact for resilience, start with after each).
                *   *Skip WAHA call for now.*
                *   *Skip delay for now.*
                *   *Skip status check/pause for now.*
        *   Once the loop completes, update campaign status to `Completed` and set `completedAt` timestamp in the DB.
        *   Implement basic error handling (e.g., wrap in try/catch, update status to `Failed` on major error).
2.  **Manual Trigger (Temporary):**
    *   Create a temporary, protected tRPC procedure (e.g., `campaign.runManually`) that takes a `campaignId` and calls `campaignRunnerService.runCampaign(campaignId)`. This is just for testing the runner service logic.
3.  **Testing:**
    *   Unit test the `CampaignRunnerService`: Mock Prisma, test fetching data, personalization logic, status updates (`Running`, `Completed`, `Failed`), and `lastProcessedContactIndex` updates.
    *   Manually trigger the `runManually` tRPC procedure for a created campaign and check server logs and database updates for correct behavior.
```

---

**Prompt 8: Integrate WAHA Sending into Runner Service**

```text
# Integrate WAHA Sending into Runner Service

**Goal:** Modify the `CampaignRunnerService` to call the actual WAHA API service methods (`sendText` or `sendImage`) for each contact. Update campaign summary counts based on API call success/failure.

**Context:** The basic `CampaignRunnerService` loop exists and logs intended actions. The `WahaApiClient` service with `sendText` and `sendImage` methods is implemented.

**Tasks:**

1.  **Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**
    *   Inject the `WahaApiClient` service.
    *   Fetch the user's `sessionName` associated with the campaign's `userId` from the `WahaSession` table. If not found, mark campaign as Failed.
    *   **Inside the contact loop:**
        *   Remove the `console.log` for the intended action.
        *   Determine if media needs to be sent based on `campaign.mediaLibraryItemId`.
        *   **If sending text only:**
            *   Call `wahaApiClient.sendTextMessage(sessionName, contact.phoneNumber, personalizedText)`.
        *   **If sending image:**
            *   Read the image file content from `mediaItem.storagePath` into a base64 string.
            *   Call `wahaApiClient.sendImageMessage(sessionName, contact.phoneNumber, { filename: mediaItem.filename, base64: imageBase64, mimeType: mediaItem.mimeType }, personalizedText)`. *(Note: WAHA might use `caption` for text with media)*.
        *   **Handle API Response:**
            *   Use `try/catch` around the API call.
            *   On success: Increment `sentCount` in the DB for the campaign.
            *   On failure: Increment `failedCount` in the DB. Log the specific error internally (don't stop the whole campaign for one failed message).
        *   *Delay and Pause logic are still skipped.*
2.  **Testing:**
    *   Update unit tests for `CampaignRunnerService`: Mock the `WahaApiClient` and verify `sendText`/`sendImage` is called with correct parameters. Test `sentCount`/`failedCount` updates.
    *   Manually trigger a campaign using the temporary tRPC procedure. Use a *test WhatsApp number* connected via WAHA. Verify messages are sent (or fail) and counts are updated in the database. Check internal logs for any API errors.
```

---

**Prompt 9: Implement Randomized Delay**

```text
# Implement Randomized Delay in Campaign Runner

**Goal:** Add the mandatory 6-12 second randomized delay between sending messages in the `CampaignRunnerService`.

**Context:** The `CampaignRunnerService` now calls the WAHA API to send messages.

**Tasks:**

1.  **Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**
    *   Import or create a `sleep` utility function (`const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));`).
    *   Import or create a `randomInt` utility function (`const randomInt = (min: number, max: number) => Math.floor(Math.random() * (max - min + 1)) + min;`).
    *   **Inside the contact loop, *after* the `try/catch` block for the WAHA API call (i.e., after attempting to send):**
        *   Calculate the delay: `const delay = randomInt(6000, 12000);`
        *   Add the sleep: `await sleep(delay);`
2.  **Testing:**
    *   Manually trigger a campaign with a small contact list (2-3 contacts). Observe the server logs or use timing mechanisms to verify that there is a delay of roughly 6-12 seconds between the completion of one API call attempt and the start of the next iteration (or the check for the next iteration).
    *   Update unit tests if necessary to mock/verify the sleep call (though this can be tricky and might be better tested manually/E2E).
```

---

**Prompt 10: Implement Status Check & Pause Logic**

```text
# Implement Status Check & Pause Logic in Campaign Runner

**Goal:** Before sending each message, check the WAHA session status. If the session is not 'WORKING', pause the campaign and stop processing.

**Context:** The `CampaignRunnerService` sends messages with delays. The `WahaApiClient` has a `getSessionStatus` method.

**Tasks:**

1.  **Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**
    *   **Inside the contact loop, *before* making the WAHA API call (`sendText`/`sendImage`):**
        *   Call `wahaApiClient.getSessionStatus(sessionName)`.
        *   Use `try/catch` around the status check. If the status check itself fails, log the error, update campaign status to `Paused`, and `break` the loop.
        *   Check the returned `status`. If it is *not* equal to `WAHASessionStatus.WORKING`:
            *   Log that the session is not working and the campaign is pausing.
            *   Update the campaign status to `Paused` in the database (ensure `lastProcessedContactIndex` is already updated from the *previous* iteration or update it here before breaking).
            *   `break;` // Exit the contact processing loop.
2.  **Testing:**
    *   Unit test the new logic: Mock `WahaApiClient.getSessionStatus` to return different statuses ('WORKING', 'SCAN_QR_CODE', 'FAILED', etc.) and verify the campaign status is updated to 'Paused' and the loop breaks appropriately when not 'WORKING'. Mock the status check throwing an error and verify pausing.
    *   Manual/E2E Test:
        *   Start a campaign.
        *   While it's running (during the delay), manually stop or disconnect the WAHA session (e.g., using the Logout button implemented earlier, or stopping the WAHA container).
        *   Observe the dashboard/database: Verify the campaign status changes to `Paused`. Check the server logs for relevant messages. Verify `lastProcessedContactIndex` reflects the last successfully *attempted* contact.
```

---

**Prompt 11: Implement Job Scheduling**

```text
# Implement Job Scheduling for Campaigns

**Goal:** Replace the manual campaign trigger with a proper job scheduler that runs campaigns at their `scheduledAt` time.

**Context:** Campaigns are created with a `scheduledAt` time. The `CampaignRunnerService` can execute a campaign given its ID.

**Tasks:**

1.  **Choose & Install Scheduler:** Select a Node.js scheduler library (e.g., `node-cron` for simplicity, or a more robust queue like `BullMQ` if background jobs/retries are needed long-term. Let's start with `node-cron`). Install it: `npm install node-cron @types/node-cron` or `yarn add node-cron @types/node-cron`.
2.  **Scheduler Service (`src/server/services/scheduler.ts`):**
    *   Create a service to manage scheduled jobs.
    *   On application startup (e.g., in a NestJS `onModuleInit` or a similar mechanism in T3's structure), query the database for all campaigns with `status: 'Scheduled'` and `scheduledAt` in the future.
    *   For each such campaign, schedule a `node-cron` job (or equivalent) to run *once* at its `scheduledAt` time.
    *   The job's task should be to instantiate `CampaignRunnerService` and call `campaignRunnerService.runCampaign(campaignId)`.
    *   Implement logic to handle scheduling new campaigns created *after* startup (the `campaign.create` tRPC procedure should now also call a method on the scheduler service to schedule the new job).
    *   Consider how to handle jobs for campaigns whose `scheduledAt` time has already passed upon startup (e.g., run them immediately, mark as failed, or ignore). Start by running immediately if the status is still 'Scheduled'.
    *   Implement cleanup: When a campaign is deleted or completed/failed, ensure its corresponding scheduled job is cancelled/removed.
3.  **Remove Manual Trigger:** Delete the temporary `campaign.runManually` tRPC procedure.
4.  **Integration:** Ensure the scheduler service is initialized correctly when the backend starts.
5.  **Testing:**
    *   Unit test the scheduler service logic (querying campaigns, scheduling jobs - mock `node-cron`, handling new campaigns, cleanup).
    *   Integration Test: Create a campaign scheduled for a few minutes in the future. Verify the `CampaignRunnerService` is triggered at the correct time by checking logs and campaign status updates in the DB. Test creating a campaign *after* startup and verify it runs. Test deleting a scheduled campaign and ensure it doesn't run.
```

---

**Prompt 12: Implement Manual Campaign Resume**

```text
# Implement Manual Campaign Resume

**Goal:** Allow users to manually resume a 'Paused' campaign via the UI, triggering the backend to continue processing from where it left off.

**Context:** Campaigns can enter a 'Paused' state. The `CampaignRunnerService` uses `lastProcessedContactIndex`. The scheduler is implemented.

**Tasks:**

1.  **tRPC Router (`campaign.ts`):**
    *   Implement a protected procedure `resume`:
        *   Input: `campaignId` (string). Use Zod for validation.
        *   Logic:
            *   Fetch the `Campaign` by ID. Verify it belongs to the user and its status is `Paused`.
            *   Update the campaign status back to `Scheduled` in the database.
            *   *Crucially:* Trigger the `CampaignRunnerService.runCampaign(campaignId)` *immediately* instead of waiting for the original schedule time. (Alternatively, if using a robust queue system, you could just add the job back to the queue). Let's go with immediate execution via the service for simplicity.
        *   Return: Success status.
2.  **Frontend UI (Campaign History):**
    *   In the campaign history table (`app/dashboard/campaigns/page.tsx` or similar), conditionally display a "Resume" `Button` next to campaigns with status `Paused`.
    *   Wire the button's `onClick` handler to call the `resume` tRPC mutation (`api.campaign.resume.useMutation()`).
    *   On success, invalidate the campaign list query (`api.campaign.list.useQuery()`) to refresh the status display.
3.  **Modify `CampaignRunnerService` (`src/server/services/campaignRunner.ts`):**
    *   Ensure the `runCampaign` method correctly handles starting from `lastProcessedContactIndex` when a campaign is resumed (it should already do this if implemented correctly in Prompt 7).
    *   Ensure it correctly transitions from 'Paused' -> 'Running' -> 'Completed'/'Failed'. The initial status update should handle both 'Scheduled' and 'Paused' -> 'Running'.
4.  **Testing:**
    *   Integration test the `resume` tRPC procedure: Verify it updates the status and triggers the runner service (mock the service call). Test that it only works for paused campaigns belonging to the user.
    *   Manual/E2E Test: Pause a campaign (by disconnecting WAHA during run). Reconnect WAHA. Go to the history page, click "Resume". Verify the campaign status changes to 'Running' and then 'Completed', and that messages are sent only for the remaining contacts.
```

---

**Prompt 13: Campaign History & Dashboard UI**

```text
# Campaign History & Dashboard UI

**Goal:** Create the main dashboard overview page and the campaign history page, displaying relevant information fetched via tRPC.

**Context:** All backend logic for campaigns, templates, contacts, and WAHA connection is functional.

**Tasks:**

1.  **tRPC Router (`campaign.ts`):**
    *   Implement a protected procedure `list`:
        *   Input: Optional pagination parameters (e.g., limit, cursor for infinite scrolling, or page number/size).
        *   Logic: Fetch campaigns for the logged-in user from the database, ordered by `createdAt` or `scheduledAt` descending. Include necessary fields for display (name, status, scheduledAt, totalContacts, sentCount, failedCount). Implement pagination logic using Prisma cursor-based pagination or offset/limit.
        *   Return: Paginated list of campaigns.
2.  **Frontend UI (`app/dashboard/campaigns/page.tsx`):**
    *   Create the Campaign History page.
    *   Use `api.campaign.list.useQuery()` (or `useInfiniteQuery`) to fetch campaign data.
    *   Display the data in a shadcn `DataTable`. Columns: Name, Status (use shadcn `Badge` with different colors), Scheduled At (format date), Progress (e.g., "Sent X / Failed Y / Total Z"), Actions (e.g., Resume button if Paused, maybe View Details later).
    *   Implement pagination controls if using offset/limit, or an "Load More" button/infinite scroll trigger if using cursors.
3.  **Frontend UI (`app/dashboard/page.tsx`):**
    *   This is the main Dashboard Overview page.
    *   Integrate the `ConnectionStatus` component (from Prompt 5).
    *   Add a "Recent Campaigns" section: Fetch the first few campaigns using `api.campaign.list.useQuery({ limit: 5 })`. Display a simplified version of the history table or a list view.
    *   Add prominent "Create Campaign" `Button` linking to the creation page.
4.  **Navigation:** Ensure clear navigation exists between the Dashboard Overview, Templates, Contact Lists, Media Library, and Campaign History pages (e.g., using a sidebar layout).
5.  **Testing:**
    *   Integration test the `list` tRPC procedure with pagination.
    *   Component test the Campaign History table and Dashboard Overview components, mocking the tRPC queries.
    *   Manually test navigation and data display on both pages. Verify pagination/infinite scroll works.
```

---

**Prompt 14: UI Notifications & Polish**

```text
# UI Notifications & Polish

**Goal:** Integrate UI notifications for key events and apply consistent styling. Add the WhatsApp blocking warning.

**Context:** All core features are implemented. UI pages exist.

**Tasks:**

1.  **Notifications:**
    *   Integrate shadcn `Toast` (or `Sonner` if preferred). Set up the `Toaster` component in the root layout.
    *   Use the `useToast` hook to display notifications on the frontend for:
        *   Campaign Paused (triggered after status check fails in the runner, potentially via a WebSocket push from backend or detected during polling on history page). *Initial simple approach: Show toast when user clicks Resume and it succeeds, or when they visit history and see Paused status.*
        *   Campaign Completed/Failed (triggered after runner finishes, detected via polling).
        *   CSV Upload Success/Failure.
        *   Template/Contact List/Media Item Save/Delete Success.
        *   WAHA Connection Success/Logout Success.
        *   General API errors from tRPC mutations.
2.  **Styling:**
    *   Review all pages and components. Apply Tailwind CSS utility classes and shadcn component styling consistently for a clean and professional look.
    *   Ensure basic responsiveness for common screen sizes (desktop, tablet).
3.  **WhatsApp Blocking Disclaimer:**
    *   Add a clear, persistent warning message somewhere prominent (e.g., on the Dashboard Overview, Campaign Creation page, or in a site footer/modal).
    *   Text suggestion: "Warning: Automating WhatsApp messages carries a significant risk of your number being blocked by WhatsApp, especially when sending to many contacts or those who haven't interacted with you recently. Use this tool responsibly and at your own risk. Ensure you comply with WhatsApp's Terms of Service."
4.  **Final Review:** Click through all user flows, check for console errors, ensure smooth navigation and consistent UI.
5.  **Testing:**
    *   Manually verify that toasts appear for the specified actions.
    *   Manually review the UI for consistency and responsiveness.
    *   Confirm the blocking disclaimer is visible.
```

---

**Prompt 15: Comprehensive Testing & Finalization**

```text
# Comprehensive Testing & Finalization

**Goal:** Add more robust testing, especially E2E tests, and prepare the application for a V1 release.

**Context:** All features are implemented and basic testing has been done throughout.

**Tasks:**

1.  **Review Unit/Integration Tests:** Ensure adequate coverage for tRPC procedures, utility functions (CSV parsing), and key backend services (`CampaignRunnerService`, `WahaApiClient` mocks). Add tests where gaps exist.
2.  **Implement E2E Tests:**
    *   Set up an E2E testing framework (e.g., Playwright or Cypress).
    *   Create test scripts for critical user flows:
        *   Signup -> Login -> Access Dashboard.
        *   Connect WAHA (requires manual scan or pre-configured test session).
        *   Upload Contacts CSV -> Verify list appears.
        *   Create Template -> Verify template appears.
        *   Create Campaign (Text only) -> Schedule -> Verify it runs (check status changes, *cannot easily verify actual message receipt in E2E*) -> Verify summary report.
        *   Create Campaign (With Image) -> Schedule -> Verify it runs -> Verify summary.
        *   Test Campaign Pause/Resume flow (requires ability to manipulate WAHA session state during test, might be difficult).
        *   Logout WAHA session.
    *   **Note:** E2E tests involving actual WAHA sending *will* require a dedicated test number expected to be blocked. Mocking the WAHA API at the network level might be an alternative for some E2E scenarios.
3.  **Refactor & Cleanup:** Review code for clarity, consistency, and adherence to best practices. Remove any temporary code (like the manual campaign trigger). Optimize database queries if needed.
4.  **Environment Variables:** Ensure all necessary environment variables (`DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `WAHA_BASE_URL`, `WAHA_API_KEY`, etc.) are documented in a `.env.example` file.
5.  **Build & Deployment Prep:** Ensure the application builds correctly (`npm run build`). Prepare deployment scripts or documentation (e.g., Dockerfile if needed).
```

---

This blueprint breaks the project into manageable, iterative steps, prioritizing core functionality and safety measures (like delays and pausing). Each prompt provides specific tasks and context for an LLM, focusing on integrating new code with existing parts and including testing considerations.

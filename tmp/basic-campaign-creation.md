# Campaign Creation Feature Plan

**Goal:** Implement the UI and tRPC procedure for creating and saving a new campaign record, linking it to existing contact lists, templates, and optionally media items, without implementing the sending logic yet. Includes adding basic Media Library API endpoints and a Date Picker component.

**Phase 1: Setup & Dependencies**

1.  **Install Dependencies:** Add `react-day-picker` and `date-fns` for the date picker functionality.
    *   Command: `npm install react-day-picker date-fns`
2.  **Add Shadcn UI Components:** Add the `Calendar`, `Popover`, and potentially a pre-built `DatePicker` component using the shadcn/ui CLI (or manually create them based on shadcn examples if the CLI isn't set up). This will create/update:
    *   `src/components/ui/calendar.tsx`
    *   `src/components/ui/popover.tsx`
    *   (Potentially) `src/components/ui/datepicker.tsx`

**Phase 2: Backend (tRPC Routers)**

1.  **Create `mediaLibrary.ts` Router:**
    *   Create file: `src/server/api/routers/mediaLibrary.ts`
    *   Implement `mediaLibraryRouter` using `createTRPCRouter`.
    *   Add a `list` procedure:
        *   `protectedProcedure`.
        *   Fetches `MediaLibraryItem` records (`id`, `filename`, `createdAt`) belonging to `ctx.session.user.id`.
        *   Returns the list.
    *   Add a basic `upload` procedure:
        *   `protectedProcedure`.
        *   Input: `z.object({ filename: z.string(), fileContentBase64: z.string() })` (or similar).
        *   Logic: **(Placeholder)** For now, it can just return a dummy `mediaLibraryItemId` like `"dummy-upload-id"` or throw a `TRPCError` with code `NOT_IMPLEMENTED`. The actual file storage logic is out of scope for this initial implementation.
        *   Return: `{ id: string }`.
2.  **Create `campaign.ts` Router:**
    *   Create file: `src/server/api/routers/campaign.ts`
    *   Implement `campaignRouter` using `createTRPCRouter`.
    *   Add the `create` procedure:
        *   `protectedProcedure`.
        *   Input Schema (Zod):
            *   `name`: `z.string().min(1)`
            *   `contactListId`: `z.string().cuid()`
            *   `messageTemplateId`: `z.string().cuid()`
            *   `mediaLibraryItemId`: `z.string().cuid().optional()`
            *   `defaultNameValue`: `z.string()`
            *   `scheduledAt`: `z.date()`
        *   Logic:
            *   Get `userId` from `ctx.session.user.id`.
            *   Fetch `ContactList` using `input.contactListId` and `userId` to verify ownership and get `contactCount`. Throw `NOT_FOUND` if not found/owned.
            *   Fetch `MessageTemplate` using `input.messageTemplateId` and `userId` to verify ownership. Throw `NOT_FOUND` if not found/owned.
            *   If `input.mediaLibraryItemId` is provided, fetch `MediaLibraryItem` using the ID and `userId` to verify ownership. Throw `NOT_FOUND` if not found/owned.
            *   Create `Campaign` record in `db.campaign.create` with:
                *   `userId`
                *   `name: input.name`
                *   `contactListId: input.contactListId`
                *   `messageTemplateId: input.messageTemplateId`
                *   `mediaLibraryItemId: input.mediaLibraryItemId` (if provided)
                *   `defaultNameValue: input.defaultNameValue`
                *   `scheduledAt: input.scheduledAt`
                *   `status: "Scheduled"`
                *   `totalContacts: contactList.contactCount`
                *   `sentCount: 0`
                *   `failedCount: 0`
        *   Return: The created `Campaign` object.
3.  **Update `root.ts`:**
    *   Open `src/server/api/root.ts`.
    *   Import `mediaLibraryRouter` from `./mediaLibrary`.
    *   Import `campaignRouter` from `./campaign`.
    *   Add `mediaLibrary: mediaLibraryRouter` and `campaign: campaignRouter` to the `appRouter` object.

**Phase 3: Frontend (UI & Logic)**

1.  **Create Campaign Page:**
    *   Create file: `src/app/dashboard/campaigns/create/page.tsx`
    *   Implement a React Server Component (or Client Component if needed for hooks immediately).
2.  **Build Campaign Form Component:**
    *   Create a client component (e.g., `src/app/dashboard/campaigns/create/_components/campaign-form.tsx`).
    *   Use `react-hook-form` with `zodResolver` based on the `campaign.create` input schema (excluding `userId`).
    *   Use `shadcn/ui` components (`Form`, `Input`, `Select`, `Checkbox`/`RadioGroup`, `DatePicker`, `Button`, etc.).
    *   **Fields:**
        *   Campaign Name (`Input`).
        *   Contact List (`Select`):
            *   Fetch options using `api.contactList.list.useQuery()`.
            *   Display `name` and `contactCount`. Store `id`.
        *   Message Template (`Select`):
            *   Fetch options using `api.template.list.useQuery()`.
            *   Display `name`. Store `id`.
        *   Image Attachment (`Checkbox` or `RadioGroup`):
            *   Conditional rendering based on selection.
            *   If "Attach Image":
                *   Radio group: "Upload New" / "Select from Library".
                *   If "Upload New": `Input type="file"`. Handle file reading (to base64) and call `api.mediaLibrary.upload.useMutation()`. Store the returned ID in form state.
                *   If "Select from Library": `Select` or Modal using `Dialog`. Fetch options with `api.mediaLibrary.list.useQuery()`. Store selected ID in form state.
        *   Default Name Value (`Input`).
        *   Scheduled At (`DatePicker` component using `Calendar` and `Popover`).
        *   Submit Button (`Button`).
    *   **Form Submission:**
        *   Use `api.campaign.create.useMutation()`.
        *   On submit, call the mutation with form data (including the optional `mediaLibraryItemId`).
        *   Handle loading state (`isPending`).
        *   On success (`onSuccess`): Show success toast (`sonner`), potentially redirect (e.g., using `useRouter` from `next/navigation`) to a campaign list page (e.g., `/dashboard/campaigns`).
        *   On error (`onError`): Show error toast.
3.  **Add Navigation:**
    *   Modify the dashboard layout (`src/app/dashboard/layout.tsx` or a sidebar component) to add a link/button pointing to `/dashboard/campaigns/create`.

**Phase 4: Testing (Conceptual)**

1.  **Backend:** Write integration tests for `campaign.create` (using Vitest, similar to `template.test.ts`) covering:
    *   Successful creation (with/without image).
    *   Validation errors (missing fields, invalid types).
    *   Ownership errors (trying to use another user's list/template/media).
    *   Correct `totalContacts` calculation.
2.  **Frontend:** Write component tests for `campaign-form.tsx` covering:
    *   Rendering of all fields.
    *   Client-side validation.
    *   Conditional rendering of image attachment section.
    *   State updates based on selections.
3.  **Manual:**
    *   Create a campaign without an image. Verify DB record.
    *   Create a campaign selecting an image from the (mock) library. Verify DB record.
    *   Create a campaign using the (mock) upload. Verify DB record.
    *   Test form validation messages.
    *   Test navigation link.

**Diagram (Simplified Interaction Flow):**

```mermaid
graph TD
    subgraph Browser (Client)
        A[Dashboard Page] -- Link --> B(Create Campaign Page: /dashboard/campaigns/create);
        B -- Renders --> C{Campaign Form Component};
        C -- useQuery(list) --> D(tRPC API: contactList.list);
        C -- useQuery(list) --> E(tRPC API: template.list);
        C -- useQuery(list) --> F(tRPC API: mediaLibrary.list);
        subgraph Image Attachment [Optional]
            C -- User Action --> G{Select Image Source};
            G -- Select 'Upload' --> H[File Input];
            H -- File Read & useMutation(upload) --> I(tRPC API: mediaLibrary.upload);
            G -- Select 'Library' --> J[Image Selection UI];
            J -- Uses data from --> F;
        end
        C -- User Fills Form --> K[Form State w/ Validation];
        K -- Submit & useMutation(create) --> L(tRPC API: campaign.create);
    end

    subgraph Server (tRPC)
        D -- Reads --> M[DB: ContactList];
        E -- Reads --> N[DB: MessageTemplate];
        F -- Reads --> O[DB: MediaLibraryItem];
        I -- (Placeholder Logic) --> O;
        L -- Verifies Ownership & Reads --> M;
        L -- Verifies Ownership & Reads --> N;
        L -- Verifies Ownership & Reads --> O;
        L -- Creates --> P[DB: Campaign];
    end

    subgraph Database
        M; N; O; P;
    end

    L -- Returns Campaign --> C;
    I -- Returns ID --> C;
    C -- onSuccess --> Q[Redirect/Success Message];
    C -- onError --> R[Error Message];

    style P fill:#ccffcc,stroke:#333,stroke-width:2px
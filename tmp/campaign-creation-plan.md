# Campaign Creation Plan

This document outlines the plan for implementing the UI and tRPC procedure for creating and saving a new campaign record.

**Goal:** Implement the UI and tRPC procedure for creating and saving a new campaign record, linking it to existing contact lists, templates, and optionally media items, without implementing the sending logic yet.

**Context:** CRUD for Templates, Contact Lists, and Media Library exists. WAHA connection UI is present. Prisma schema includes `Campaign`.

---

## Phase 1: Backend (tRPC API)

1.  **Create Router File:**
    *   Create the file `src/server/api/routers/campaign.ts`.
2.  **Define Input Schema:**
    *   Inside `campaign.ts`, define a Zod schema for the `create` procedure's input:
        ```typescript
        import { z } from "zod";

        const createCampaignInput = z.object({
          name: z.string().min(1, "Campaign name cannot be empty"),
          contactListId: z.string().cuid("Invalid Contact List ID"),
          messageTemplateId: z.string().cuid("Invalid Message Template ID"),
          mediaLibraryItemId: z.string().cuid("Invalid Media Item ID").optional(), // Optional image
          defaultNameValue: z.string().min(1, "Default name value cannot be empty"),
          scheduledAt: z.date({ required_error: "Scheduled date and time are required" }),
        });
        ```
3.  **Implement `create` Procedure:**
    *   In `campaign.ts`, create a `protectedProcedure` named `create`:
        *   Use the `createCampaignInput` schema for validation.
        *   Get the `userId` from `ctx.session.user.id`.
        *   **Ownership Verification:**
            *   Fetch the selected `ContactList` ensuring `userId` matches. Throw `TRPCError` ('NOT_FOUND' or 'FORBIDDEN') if not found or ownership mismatch.
            *   Fetch the selected `MessageTemplate` ensuring `userId` matches. Throw error if mismatch.
            *   If `mediaLibraryItemId` is provided, fetch the `MediaLibraryItem` ensuring `userId` matches. Throw error if mismatch.
        *   Get `contactCount` from the fetched `ContactList`.
        *   **Database Creation:** Use `ctx.db.campaign.create` to save the new campaign with:
            *   `userId`
            *   Input data (`name`, `contactListId`, `messageTemplateId`, `mediaLibraryItemId`, `defaultNameValue`, `scheduledAt`)
            *   `status: 'Scheduled'`
            *   `totalContacts: contactCount`
            *   `sentCount: 0`
            *   `failedCount: 0`
        *   Return the newly created `Campaign` object.
4.  **Register Router:**
    *   Open `src/server/api/root.ts`.
    *   Import `campaignRouter` from `./routers/campaign`.
    *   Add `campaign: campaignRouter` to the `appRouter` object.

---

## Phase 2: Frontend (UI)

1.  **Create Page Route:**
    *   Create the file `src/app/dashboard/campaigns/create/page.tsx`.
    *   This page will primarily import and render the `CampaignForm` component.
2.  **Install Date-Time Picker:**
    *   Research and install a suitable shadcn/ui-compatible date-time picker library (e.g., check `shadcn-datetime-picker` or alternatives). Add it to `package.json`.
    *   *Note:* The specific implementation might require creating a wrapper component to integrate smoothly with `react-hook-form`.
3.  **Create Form Component:**
    *   Create the file `src/app/dashboard/campaigns/create/_components/campaign-form.tsx`.
    *   Mark it with `"use client";`.
    *   Use `react-hook-form` with `zodResolver`, using the same `createCampaignInput` Zod schema (or a frontend-specific version if needed).
    *   **Fetch Data for Selects:**
        *   Use `api.contactList.list.useQuery()` to get contact lists.
        *   Use `api.template.list.useQuery()` to get message templates.
        *   Use `api.mediaLibrary.list.useQuery()` for the "Select from Library" option.
    *   **Build Form Structure (using `shadcn/ui` components):**
        *   `Form`, `FormField`, `FormItem`, `FormLabel`, `FormControl`, `Input` for Campaign Name.
        *   `FormField` with `Select` for Contact List (populate with fetched data).
        *   `FormField` with `Select` for Message Template (populate with fetched data).
        *   **Image Attachment Section:**
            *   `FormField` with `RadioGroup` ("No Image" / "Attach Image"). Store selection in form state.
            *   Conditionally render based on the above selection:
                *   If "Attach Image":
                    *   `FormField` with `RadioGroup` ("Upload New" / "Select from Library"). Store selection.
                    *   Conditionally render:
                        *   If "Upload New": `FormField` with `Input type="file"`. Manage file state.
                        *   If "Select from Library": `FormField` with `Select` (or a modal trigger button) populated by the media library query. Store selected `mediaLibraryItemId`.
        *   `FormField` with `Input` for Default Name Value.
        *   `FormField` integrating the chosen Date-Time Picker component, bound to the `scheduledAt` form field.
        *   `Button type="submit"`.
    *   **Implement Submission Logic:**
        *   Get the `createCampaign` mutation function using `api.campaign.create.useMutation()`.
        *   Get the `uploadMedia` mutation function using `api.mediaLibrary.upload.useMutation()`.
        *   In the `onSubmit` handler provided to `react-hook-form`:
            *   Check if "Upload New" image was selected. If yes:
                *   Call `uploadMedia.mutateAsync()` with the file.
                *   Get the returned `mediaLibraryItemId` and add it to the form data being submitted to `createCampaign`.
            *   Call `createCampaign.mutateAsync()` with the final form data (including the potentially uploaded or selected `mediaLibraryItemId`).
            *   Handle loading state (`createCampaign.isLoading`, `uploadMedia.isLoading`). Disable submit button.
            *   Handle errors (`createCampaign.error`, `uploadMedia.error`). Display errors using `FormMessage` or `sonner`.
            *   On success (`createCampaign.onSuccess`):
                *   Show a success toast notification (e.g., using `sonner`).
                *   Optionally, redirect the user (e.g., to `/dashboard/campaigns`) using `next/navigation`.

---

## Phase 3: Navigation

1.  **Add "Create Campaign" Link:**
    *   Edit `src/app/dashboard/layout.tsx` (or another suitable navigation component).
    *   Add a `Link` component (from `next/link`) or a navigation item pointing to `/dashboard/campaigns/create`.

---

## Phase 4: Testing

1.  **Backend Integration Tests:**
    *   Create/Update `src/server/api/routers/campaign.test.ts`.
    *   Write tests for the `create` procedure covering:
        *   Successful creation.
        *   Input validation errors.
        *   Ownership verification failures (for contact list, template, media item).
        *   Correct calculation/setting of `totalContacts`, `status`, etc.
2.  **Frontend Component Tests:**
    *   Create/Update `src/app/dashboard/campaigns/create/_components/campaign-form.test.tsx`.
    *   Write tests for `CampaignForm` covering:
        *   Rendering of all fields.
        *   Conditional rendering of image attachment options.
        *   Form validation.
        *   Mocking and verifying tRPC calls (`list` queries, `create` mutation, `upload` mutation).
3.  **Manual End-to-End Testing:**
    *   Create a campaign *without* an image. Verify data in the database.
    *   Create a campaign *with* an image selected from the library. Verify data.
    *   Create a campaign *with* a newly uploaded image. Verify data and image storage (if applicable).
    *   Test validation rules on the form.
    *   Test date/time selection.

---

## Mermaid Diagram: Form Image Attachment Logic

```mermaid
graph TD
    A[Start Form] --> B{Attach Image?};
    B -- No --> F[Other Fields...];
    B -- Yes --> C{How?};
    C -- Upload New --> D[Show File Input];
    C -- Select from Library --> E[Show Library Selector];
    D --> F;
    E --> F;
    F --> G[Schedule At (Date/Time Picker)];
    G --> H[Submit Button];
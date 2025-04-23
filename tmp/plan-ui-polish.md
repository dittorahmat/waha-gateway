# Plan: UI Notifications & Polish (Easy Path)

**Goal:** Integrate UI notifications using Sonner, apply consistent styling, and add a persistent WhatsApp blocking warning.

**Phase 1: Setup & Disclaimer**

1.  **Toaster Setup:** Verify/Add `<Toaster />` from `src/components/ui/sonner.tsx` to `src/app/dashboard/layout.tsx`.
2.  **Blocking Disclaimer:** Create `src/components/ui/blocking-warning-banner.tsx` and add it persistently to `src/app/dashboard/layout.tsx` with the suggested warning text: "Warning: Automating WhatsApp messages carries a significant risk of your number being blocked by WhatsApp... Use this tool responsibly and at your own risk. Ensure you comply with WhatsApp's Terms of Service."

**Phase 2: Notification Integration (using `toast()` from Sonner)**

1.  **tRPC Errors:** Implement global error toasts for failed tRPC mutations.
2.  **WAHA Connection/Logout:** Add success toasts in `src/app/dashboard/_components/ConnectionStatus.tsx` (or relevant component).
3.  **CRUD Operations:** Add success/error toasts for Template, Contact List, Media Item actions.
4.  **CSV Upload:** Add success/error toasts for CSV upload results.
5.  **Campaign Status (Initial):** Add toasts for Pause/Resume actions and for Completed/Failed status detected via polling on the history page.

**Phase 3: Styling & Review**

1.  **Consistent Styling:** Review key dashboard pages (`Overview`, `Campaigns List/Create`, `Contacts`, `Templates`) applying consistent Tailwind/shadcn styling and basic responsiveness.
2.  **Final Review:** Click through flows, check console errors, verify toasts and disclaimer visibility, and check UI consistency/responsiveness.

---

**Diagram:**

```mermaid
graph TD
    A[Start: UI Polish Task] --> B{Phase 1: Setup};
    B --> B1[Setup Toaster in Layout];
    B --> B2[Create & Add Blocking Banner];

    A --> C{Phase 2: Notifications};
    C --> C1[Global tRPC Error Toasts];
    C --> C2[WAHA Connect/Logout Toasts];
    C --> C3[CRUD Op Toasts (Templates, Contacts, etc.)];
    C --> C4[CSV Upload Toasts];
    C --> C5[Campaign Status Toasts (Polling/Action-based)];

    A --> D{Phase 3: Styling & Review};
    D --> D1[Apply Consistent Styling (Tailwind/Shadcn)];
    D --> D2[Responsiveness Check];
    D --> D3[Final Click-Through & Console Check];
    D --> D4[Verify Toasts & Disclaimer];

    B1 & B2 --> C1;
    C1 & C2 & C3 & C4 & C5 --> D1;
    D1 & D2 & D3 & D4 --> E[End: Task Complete];

    subgraph Styling Targets
        direction LR
        S1[Dashboard Overview]
        S2[Campaign List/History]
        S3[Campaign Create Form]
        S4[Contacts Page]
        S5[Templates Page]
    end

    D1 --> Styling Targets;
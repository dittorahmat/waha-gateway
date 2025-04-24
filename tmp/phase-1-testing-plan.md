# Plan: Address Phase 1 Testing Gaps

This plan outlines the steps to address the identified gaps in Unit and Integration testing based on the initial comprehensive testing plan (`tmp/comprehensive-testing.md`).

**Status:** Confirmed based on file structure analysis and `package.json` review.

**Missing Tests Identified:**

*   `src/server/api/routers/mediaLibrary.test.ts`
*   `src/server/services/wahaClient.test.ts`
*   Test file for `src/app/dashboard/_components/ConnectionStatus.tsx`
*   Test file for `src/app/dashboard/_components/SendMessageForm.tsx`
*   Test file for `src/components/data-table.tsx`
*   Test file for `src/app/dashboard/templates/_components/template-form.tsx`

**Steps:**

1.  **Create Missing Test Files:** Generate placeholder test files for the components and modules listed above.
2.  **Implement Tests (Iterative):** Begin writing actual test cases within these new files and potentially improve existing ones, focusing on critical logic first. (Requires switching to Code mode).
3.  **Analyze `src/lib/utils.ts`:** Review this file for any complex functions that warrant unit tests and create them if necessary.
4.  **Review Existing Tests:** As part of the iterative implementation, review existing tests (`auth`, `campaign`, `contactList`, `template`, `waha` routers; `campaignRunner`, `scheduler`, `csvParser` services/utils; `campaign-form` component) for completeness and quality.

**Visual Plan:**

```mermaid
graph TD
    A[Current State: Some Tests Exist] --> B{Missing Tests Identified?};
    B -- Yes --> C[Create Placeholder Test Files];
    C --> D[Implement Unit/Integration Tests (Iterative)];
    D --> E{Review Existing Tests?};
    E -- Yes --> F[Improve Existing Tests];
    F --> G;
    E -- No --> G;
    B -- No --> G;
    G{Analyze utils.ts?};
    G -- Yes --> H[Review src/lib/utils.ts];
    H --> I{Needs Tests?};
    I -- Yes --> J[Add Tests for utils.ts];
    J --> K;
    I -- No --> K;
    G -- No --> K;
    K[Phase 1 Testing Enhanced];

    %% Styling
    style C fill:#f9f,stroke:#333,stroke-width:2px
    style D fill:#f9f,stroke:#333,stroke-width:2px
    style F fill:#f9f,stroke:#333,stroke-width:2px
    style J fill:#f9f,stroke:#333,stroke-width:2px
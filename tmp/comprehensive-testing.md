# Plan: Comprehensive Testing & V1 Finalization

This plan outlines the steps to add robust testing (Unit, Integration, E2E) and finalize the application for a V1 release.

**Phase 1: Enhance Unit & Integration Testing**

*   **Goal:** Ensure core logic (tRPC procedures, services, utilities, components) is robustly tested in isolation or small integrations.
*   **Steps:**
    1.  **Review Existing Tests:** Analyze current tests (`auth.test.ts`, `campaign.test.ts`, `contactList.test.ts`, `template.test.ts`, `campaignRunner.test.ts`, `scheduler.test.ts`, `csvParser.test.ts`, `campaign-form.test.tsx`) for coverage depth and quality.
    2.  **Identify & Fill Gaps:**
        *   **tRPC Routers:** Add tests for `src/server/api/routers/waha.ts` and `src/server/api/routers/mediaLibrary.ts`. Review existing router tests for completeness.
        *   **Services:** Add specific tests for `src/server/services/wahaClient.ts`, focusing on mocking its interactions. Review `campaignRunner.test.ts` and `scheduler.test.ts` coverage.
        *   **Utilities:** Review `src/utils/csvParser.test.ts`. Check `src/lib/utils.ts` for any complex logic needing tests.
        *   **Components:** Review `campaign-form.test.tsx`. Identify and test other critical UI components (e.g., `ConnectionStatus`, `SendMessageForm`, `DataTable`, `TemplateForm`).
    3.  **Execute:** Write necessary tests using `vitest` and `@testing-library/react`. Run `npm run test` frequently.

**Phase 2: Implement End-to-End (E2E) Testing**

*   **Goal:** Verify critical user flows simulate real user interaction from the browser.
*   **Steps:**
    1.  **Framework Setup:** Install and configure Playwright (`npm install --save-dev @playwright/test`, `npx playwright install`, setup `playwright.config.ts`).
    2.  **Test Script Development:** Create test files (e.g., `e2e/auth.spec.ts`, `e2e/campaigns.spec.ts`) for core flows: Auth, WAHA Connection (Mocked), Contact Upload, Template Create, Campaign Create/Run/Summary, WAHA Logout.
    3.  **WAHA Interaction Strategy:** Use **Mock API** approach (e.g., Playwright's `page.route` or `msw`) to intercept calls to `WAHA_BASE_URL` and return predefined responses. This is the chosen strategy for ease of development and reliability.
    4.  **Execute:** Run E2E tests via `npx playwright test`.

**Phase 3: Code Refinement & Cleanup**

*   **Goal:** Enhance code quality, consistency, and maintainability.
*   **Steps:**
    1.  **Code Review:** Systematically review `src/server`, `src/app`, `src/components`, `src/lib`, `src/utils`.
    2.  **Remove Temporary Code:** Delete debugging aids, console logs, etc.
    3.  **Database Optimization:** Analyze and optimize slow queries if needed.
    4.  **Linting & Formatting:** Ensure `npm run lint` and `npm run format:check` pass.

**Phase 4: Environment & Configuration**

*   **Goal:** Ensure environment setup is clear, secure, and documented.
*   **Steps:**
    1.  **Audit `.env`:** Identify all used environment variables.
    2.  **Update `.env.example`:** Ensure it includes all required variables with descriptions.

**Phase 5: Build & Deployment Preparation**

*   **Goal:** Verify the application builds correctly and prepare deployment artifacts/documentation.
*   **Steps:**
    1.  **Production Build:** Run `npm run build` and resolve errors.
    2.  **Deployment Strategy & Documentation:** Decide on target environment (Vercel, Docker, etc.). Create `Dockerfile` or document deployment steps.
    3.  **README Update:** Include updated setup, development, testing, and deployment instructions.

**Visual Overview:**

```mermaid
graph TD
    A[Start: Features Implemented] --> B(Phase 1: Unit/Integration Tests);
    B --> C{Coverage Gaps?};
    C -- Yes --> B_Add[Add/Improve Tests];
    B_Add --> B;
    C -- No --> D(Phase 2: E2E Tests);

    D --> E[Setup Playwright];
    E --> F[Develop E2E Scripts];
    F --> G{WAHA Strategy?};
    G -- Mock API (Recommended) --> H[Implement API Mocking]; // Chosen Strategy
    H --> J[Run E2E Tests];

    J --> K(Phase 3: Refactor & Cleanup);
    K --> L[Code Review & Optimize];
    L --> M[Remove Temp Code];
    M --> N[Lint & Format];

    N --> P(Phase 4: Environment Setup);
    P --> Q[Update .env.example];

    Q --> R(Phase 5: Build & Deployment Prep);
    R --> S[Verify Build (`npm run build`)];
    S --> T[Define/Document Deployment];
    T --> U[Create Dockerfile/Docs];
    U --> V[Update README];
    V --> W[End: V1 Ready];

    style H fill:#ccffcc,stroke:#333,stroke-width:2px // Highlight chosen strategy
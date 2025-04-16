**Specification: WAHA WhatsApp Gateway Dashboard - Version 1.0**

**1. Introduction & Overview**

*   **Purpose:** To provide a web-based dashboard application enabling small business owners to send scheduled, templated promotional messages via WhatsApp to a list of contacts.
*   **Core Technology:** The dashboard will leverage an existing, self-hosted WAHA (WhatsApp HTTP API) instance as its backend engine for all WhatsApp interactions.
*   **Target User:** Small business owners.
*   **Primary Goal:** Allow users to easily connect their WhatsApp number, manage contacts and message templates, and schedule bulk promotional message campaigns.

**2. Core Features (V1.0)**

*   User Authentication (Email/Password).
*   Single WhatsApp Number Connection per User Account.
*   WhatsApp Session Management (QR/Pairing Code Scan, Status Display, Manual Logout).
*   Contact List Management via CSV Upload (View, Delete lists).
*   Message Template Management (Create, View, Edit, Delete templates with markdown support and `{Name}` placeholder).
*   Simple Media Library for Images (Upload, Select, Delete images).
*   Campaign Creation & Scheduling (Select List, Template, Optional Image, Set Default Name, Schedule Date/Time).
*   Automated Campaign Sending with Randomized Delay (6-12 seconds between messages).
*   Automatic Campaign Pausing on WhatsApp Disconnection (with UI notification).
*   Manual Campaign Resumption after Reconnection.
*   Campaign History Tracking (Status: Scheduled, Running, Paused, Completed, Failed).
*   Campaign Summary Reporting (Total Contacts, Messages Sent, Messages Failed).

**3. Architecture**

*   **Frontend:** Web Application (Technology to be determined by the development team, e.g., React, Vue, Angular). Communicates with the Backend API.
*   **Backend:** API Server (Technology to be determined, e.g., Node.js/Express, Python/Flask/Django, Go).
    *   Handles user authentication, business logic, data storage, campaign scheduling/execution, and communication with the WAHA API.
*   **Database:** PostgreSQL. Stores user data, contact lists, contacts, message templates, media library metadata, and campaign details/history.
*   **WhatsApp Engine:** External WAHA instance. The dashboard backend communicates with this instance via its REST API.
*   **Configuration:** WAHA instance details (Base URL, API Key) are configured globally for the dashboard backend via a `.env` file.

**4. Detailed Feature Specifications**

*   **4.1. User Authentication:**
    *   Implement simple user registration using Email and Password.
    *   Implement user login using Email and Password.
    *   Store user passwords securely (hashed and salted).
    *   *Out of Scope (V1):* Password complexity rules, password reset functionality.

*   **4.2. WhatsApp Connection Management:**
    *   Each dashboard user account can connect exactly one WhatsApp number.
    *   **Connection Process:**
        *   UI provides a "Connect Number" button/prompt.
        *   Backend calls WAHA `POST /api/sessions` (using a user-specific session name or a predictable one like `user_{user_id}`). Store this session name associated with the user.
        *   Backend calls WAHA `GET /api/sessions/{session}/auth/qr` or `POST /api/sessions/{session}/auth/request-code`.
        *   Frontend displays the QR code or pairing code clearly for the user to scan/enter via their WhatsApp mobile app.
    *   **Status Display:**
        *   The dashboard overview page must prominently display the current connection status fetched periodically from WAHA (e.g., `GET /api/sessions/{session}`).
        *   Key statuses to display clearly: `Needs QR Scan`, `Disconnected`, `Error`, `Working`. Other WAHA statuses (`STARTING`, `FAILED`) can potentially be mapped to `Error` or a generic "Connecting..." state for simplicity.
        *   If status is `Needs QR Scan`, provide an easy way to view the QR/Pairing Code again.
    *   **Logout:**
        *   Provide a "Logout WhatsApp Number" button.
        *   Backend calls WAHA `POST /api/sessions/{session}/logout`.
        *   Update the displayed status.

*   **4.3. Contact List Management:**
    *   **CSV Upload:**
        *   Allow users to upload CSV files.
        *   Mandatory column: `phone_number`.
        *   Optional column: `first_name`.
        *   Backend parses the CSV, validates phone numbers (basic format check), and stores contacts associated with the user and the list name in PostgreSQL. Handle potential parsing errors gracefully.
        *   Backend must format phone numbers to `number@c.us` before storing or using with WAHA.
    *   **Storage:** Store contact lists (list name, user association) and individual contacts (phone number, first name, list association) in PostgreSQL.
    *   **UI:**
        *   Provide a section to view uploaded contact lists (displaying list name, number of contacts, upload date).
        *   Allow viewing the contents of a specific list (optional for V1, could just show name/count).
        *   Allow deleting entire contact lists.
    *   *Out of Scope (V1):* Editing contacts within a list, manual contact entry, deleting individual contacts.

*   **4.4. Message Template Management:**
    *   **Storage:** Store message templates (template name, template text, user association) in PostgreSQL.
    *   **UI:**
        *   Provide a section to create, view, edit, and delete message templates.
        *   **Create/Edit:** Include fields for "Template Name" and "Message Text" (using a simple `<textarea>`).
        *   **Formatting:** Instruct users (via text or link to [WhatsApp FAQ](https://faq.whatsapp.com/539178204879377)) to use markdown (`*bold*`, `_italics_`, `~strikethrough~`, ```monospace```) directly in the text area. No WYSIWYG editor needed for V1.
        *   **Personalization:** Support the placeholder `{Name}` within the template text.

*   **4.5. Media Library (Images Only):**
    *   **Storage:**
        *   Store image metadata (user association, filename, internal ID, potentially upload date) in PostgreSQL.
        *   Store image files on the filesystem accessible by the backend server.
    *   **UI:**
        *   Provide a simple media library view (e.g., thumbnails of uploaded images).
        *   Allow users to upload new images (validate file type and size).
        *   Allow users to delete images from the library.
        *   Allow users to select an image from the library during campaign setup.

*   **4.6. Campaign Management:**
    *   **Campaign Creation UI:**
        *   Input: **Campaign Name** (Mandatory).
        *   Select: Contact List (from user's saved lists).
        *   Select: Message Template (from user's saved templates).
        *   Optional: Attach Image - provide options:
            *   "Upload New Image".
            *   "Select from Library".
        *   Input: **Default Value for {Name}** (used if `first_name` is missing for a contact).
        *   Input: **Schedule Date and Time** (using a date/time picker).
    *   **Storage:** Store campaign details in PostgreSQL (Campaign Name, User ID, Contact List ID, Template ID, Optional Media ID, Default Name Value, Scheduled Time, Status, Summary Counts, Progress Tracking - e.g., last contact index processed).
    *   **Campaign History UI:**
        *   Display a list of all past and scheduled campaigns.
        *   Show: Campaign Name, Scheduled Time, Status (Scheduled, Running, Paused, Completed, Failed), Summary Report (Total Contacts, Sent, Failed).
    *   **Campaign Execution (Backend):**
        *   Use a reliable job scheduler (e.g., cron, background task queue like BullMQ, Celery depending on backend tech) to trigger campaigns at their scheduled time.
        *   **Sending Loop:**
            *   Retrieve campaign details and associated contacts/template/media.
            *   Iterate through contacts sequentially.
            *   *Before each send:* Check the user's WAHA session status via `GET /api/sessions/{session}`. If status is not `WORKING`:
                *   Pause the campaign (update status in DB to `Paused`).
                *   Store the index of the next contact to process.
                *   Stop the loop.
                *   (UI should reflect the paused state and notify the user).
            *   Personalize message text: Replace `{Name}` with contact's `first_name` or the campaign's default value.
            *   Determine WAHA endpoint (`/sendText` or `/sendImage`).
            *   Construct the API payload for WAHA.
            *   Call the WAHA API endpoint.
            *   Increment `Sent` count on success, `Failed` count on API error. Log errors internally.
            *   Wait for a random duration between 6 and 12 seconds.
            *   Update campaign progress (e.g., last processed contact index).
            *   After loop finishes (or is stopped early due to errors), update campaign status to `Completed` or potentially `Failed` if error thresholds are met (V1: just `Completed`).
    *   **Manual Resume:**
        *   UI provides a "Resume" button for campaigns in `Paused` state.
        *   Backend job runner should be able to pick up the campaign from the stored progress index when resumed.

*   **4.7. Reporting:**
    *   Focus on the campaign summary stored with each campaign record.
    *   Display: Total Contacts, Messages Sent Successfully (API call made), Messages Failed (API call failed).
    *   *Out of Scope (V1):* Detailed per-message delivery status (Delivered, Read - would require webhook implementation). Detailed error logging per contact visible to the user.

**5. Data Management (PostgreSQL)**

*   **Schema:** Define tables for:
    *   `users` (id, email, password_hash, created_at)
    *   `waha_sessions` (id, user_id, session_name, status, created_at, updated_at) - *Note: Status here might be redundant if always fetched live from WAHA, but could store last known status.*
    *   `contact_lists` (id, user_id, name, contact_count, created_at)
    *   `contacts` (id, contact_list_id, phone_number, first_name) - *Index phone_number*.
    *   `message_templates` (id, user_id, name, text_content, created_at, updated_at)
    *   `media_library` (id, user_id, filename, storage_path, mime_type, created_at) - *Store path relative to a base media directory*.
    *   `campaigns` (id, user_id, name, contact_list_id, message_template_id, media_library_id (nullable), default_name_value, scheduled_at, status, total_contacts, sent_count, failed_count, last_processed_contact_index (nullable), created_at, started_at (nullable), completed_at (nullable)) - *Status enum: Scheduled, Running, Paused, Completed, Failed*.
*   **Relationships:** Define foreign keys (e.g., `campaigns.user_id` -> `users.id`).
*   **Phone Numbers:** Store formatted as `number@c.us` or ensure consistent formatting before use with WAHA.

**6. API Integration (WAHA)**

*   **Configuration:** Backend reads `WAHA_BASE_URL` and `WAHA_API_KEY` from a `.env` file.
*   **Required Endpoints:**
    *   `POST /api/sessions`
    *   `GET /api/sessions/{session}` (for status checks)
    *   `GET /api/sessions/{session}/auth/qr`
    *   `POST /api/sessions/{session}/auth/request-code`
    *   `POST /api/sessions/{session}/logout`
    *   `POST /api/sendText`
    *   `POST /api/sendImage` (or potentially a generic `/sendFile` if WAHA supports it well for images)

**7. Error Handling & Edge Cases**

*   **WAHA API Errors:** Backend should handle potential errors from WAHA (404 Session Not Found, 422 Unprocessable Entity, 500 Server Error, etc.). Increment 'Failed' count for the campaign summary. Log detailed errors internally.
*   **Session Disconnection:** Implement the campaign pausing logic described in 4.6.
*   **CSV Errors:** Provide clear UI feedback on invalid CSV format or parsing issues.
*   **Database Errors:** Implement standard backend error logging.
*   **WhatsApp Blocking:** Include a prominent, persistent disclaimer in the UI warning users about the risk of getting their WhatsApp number blocked if they misuse the tool for spam or excessive messaging, and that usage is at their own risk.

**8. User Interface (UI) / User Experience (UX) Notes**

*   **Dashboard Overview:** Landing page showing connection status, prompt for QR/code if needed, recent campaign summaries, and clear navigation.
*   **Workflow:** Guide the user logically through connecting their number, managing lists/templates, and creating/scheduling campaigns.
*   **Status Indicators:** Use clear visual cues for WhatsApp connection status and campaign status.
*   **Feedback:** Provide immediate feedback for actions like uploads, saves, deletes, and campaign scheduling. Show the "Sending message X of Y" status for running campaigns.
*   **Simplicity:** Keep the interface clean and focused on the core tasks for V1.

**9. Security Considerations**

*   **Password Storage:** Hash and salt user passwords.
*   **API Keys:** Store the WAHA API Key securely in the backend environment (`.env`), never expose it to the frontend.
*   **Input Validation:** Sanitize and validate all user inputs (CSV data, template text, campaign names, etc.).
*   **Authentication:** Protect all backend API endpoints, ensuring only logged-in users can access their own data and trigger actions.
*   **Rate Limiting/Delays:** The 6-12 second random delay is crucial not just for WhatsApp health but also as a basic form of backend rate limiting for the WAHA API.

**10. Testing Plan**

*   **Unit Tests:**
    *   Backend: Test CSV parsing logic, template personalization (`{Name}` replacement), database model interactions, campaign state transitions (Scheduled -> Running -> Paused -> Running -> Completed).
    *   Frontend: Test component rendering, basic form validation.
*   **Integration Tests:**
    *   Backend <-> PostgreSQL: Verify data is stored and retrieved correctly.
    *   Backend <-> WAHA API: Mock the WAHA API endpoints to test request formatting and response handling (success/error cases). Test status checking and disconnection handling logic.
*   **End-to-End (E2E) Tests:**
    *   Use a testing framework (like Cypress, Playwright) to simulate the full user journey: Register, Login, Connect WhatsApp (requires manual QR scan during test or a pre-configured session), Upload CSV, Create Template, Create/Schedule Campaign, Monitor Status, Check Summary Report, Logout WhatsApp.
    *   **Crucially:** Use a dedicated test WhatsApp number for E2E tests, as it is *highly likely* to get blocked during testing.
*   **Manual Testing:**
    *   Test various CSV formats and edge cases (missing names, invalid numbers).
    *   Test markdown formatting rendering in templates (if preview is implemented) and in WhatsApp itself.
    *   Test image uploads (different types, sizes) and selection from the library.
    *   Verify campaign scheduling accuracy.
    *   Manually disconnect the WhatsApp session during a campaign run to test pausing and resuming.
    *   Test UI responsiveness and clarity across different screen sizes (if applicable).
    *   Verify the connection status display is accurate and updates correctly.

**11. Future Considerations (Out of Scope for V1)**

*   Detailed per-contact delivery status tracking (requires WAHA webhook implementation).
*   Support for more media types (Video, Documents, Audio).
*   Contact list editing, manual contact addition/deletion.
*   More complex personalization placeholders.
*   User-configurable (but safe-ranged) sending delays.
*   Support for multiple WhatsApp numbers per user account.
*   User-provided WAHA instance details.
*   Dashboard user password reset functionality.
*   WYSIWYG editor for message templates.
*   Handling incoming replies via webhooks.
*   More sophisticated error reporting and retry mechanisms for failed messages.

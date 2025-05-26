# WAHA Gateway

WAHA Gateway is a marketing campaign application built on the T3 Stack that allows users to send personalized messages via WhatsApp using the WAHA API.

## Features

### Implemented / In Progress

*   **Campaign Creation:** Create and save new campaign records, linking them to existing contact lists, message templates, and optional media items.
*   **Campaign Running:** Backend service to process contacts for a campaign, personalize messages, and send them via the WAHA API.
*   **WAHA Integration:** Integrate actual `sendText` and `sendImage` API calls into the campaign runner.
*   **Configurable Delay:** Implement a configurable randomized delay between sending messages in the campaign runner.
*   **Status Check & Pause:** Check WAHA session status during campaign runs and pause the campaign if the session is not `WORKING` or if status check fails, saving progress.
*   **Manual Campaign Resume:** Allow users to manually resume paused campaigns from where they left off.
*   **Campaign History & Dashboard:** Create dashboard overview and campaign history pages with pagination to display campaign information.
*   **UI Polish:** Integrate UI notifications (Sonner), apply consistent styling, and add a persistent WhatsApp blocking warning.

### Planned

*   **Job Scheduling:** Replace manual campaign triggers with a `node-cron` based job scheduler to run campaigns at their scheduled time.
*   **Comprehensive Testing:** Implement robust Unit, Integration, and End-to-End (E2E) testing using Vitest and Playwright.

## Technologies Used

*   [Next.js](https://nextjs.org)
*   [NextAuth.js](https://next-auth.js.org)
*   [Prisma](https://prisma.io)
*   [Tailwind CSS](https://tailwindcss.com)
*   [tRPC](https://trpc.io)
*   [node-cron](https://www.npmjs.com/package/node-cron)
*   [Sonner](https://sonner.emilkowal.ski/)
*   [Vitest](https://vitest.dev/)
*   [Playwright](https://playwright.dev/)
*   WAHA API

## Setup and Installation

Follow these steps to set up the project locally:

1.  **Clone the repository:**
    ```bash
    git clone [repository_url]
    cd waha-gateway # Or the name of the cloned directory
    ```
2.  **Install dependencies:**
    ```bash
    npm install
    ```
3.  **Set up environment variables:**
    *   Copy the example environment file:
        ```bash
        cp .env.example .env
        ```
    *   Edit the `.env` file and fill in the required values, including database credentials and WAHA API details.
4.  **Set up the database:**
    *   Ensure you have a PostgreSQL database running.
    *   Run Prisma migrations to set up the database schema:
        ```bash
        npx prisma migrate dev
        ```
    *   Alternatively, you can use the provided script to start a local database (if available and configured):
        ```bash
        ./start-database.sh
        ```
5.  **Start the development server:**
    ```bash
    npm run dev
    ```
    The application should now be running at `http://localhost:3000`.

## Development

*   **Run the development server:**
    ```bash
    npm run dev
    ```
*   **Run unit and integration tests (Vitest):**
    ```bash
    npm run test
    ```
*   **Run end-to-end tests (Playwright):**
    ```bash
    npx playwright test
    ```
*   **Check and fix linting issues:**
    ```bash
    npm run lint
    npm run lint:fix
    ```
*   **Check and fix formatting issues:**
    ```bash
    npm run format:check
    ```
*   **Check and fix formatting issues:**
    ```bash
    npm run format
    ```

## Deployment

To deploy the application, you will first need to build it:

```bash
npm run build
```

Refer to the deployment guides for specific platforms:

*   [Vercel](https://create.t3.gg/en/deployment/vercel)
*   [Netlify](https://create.t3.gg/en/deployment/netlify)
*   [Docker](https://create.t3.gg/en/deployment/docker)

## Warning

Automating WhatsApp messages carries a significant risk of your number being blocked by WhatsApp. Use this tool responsibly and at your own risk. Ensure you comply with WhatsApp's Terms of Service.

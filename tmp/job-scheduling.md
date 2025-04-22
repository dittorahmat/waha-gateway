# Plan: Implement Job Scheduling for Campaigns using node-cron

**Goal:** Replace the manual campaign trigger with a proper job scheduler that runs campaigns at their `scheduledAt` time using `node-cron`.

**Context:** Campaigns are created with a `scheduledAt` time. The `CampaignRunnerService` can execute a campaign given its ID, requiring `PrismaClient` and `WahaApiClient` dependencies.

**Steps:**

1.  **Install Dependencies:**
    *   Add `node-cron` and its types to the project.
    *   Command: `npm install node-cron @types/node-cron` (or `yarn add node-cron @types/node-cron`)

2.  **Create Scheduler Service (`src/server/services/scheduler.ts`):**
    *   Define a `SchedulerService` class.
    *   **Dependencies:** Inject `PrismaClient` (`db`) and `WahaApiClient` instances via the constructor.
    *   **Job Storage:** Maintain a private `Map<string, cron.ScheduledTask>` named `scheduledJobs` to track active jobs (campaignId -> task instance).
    *   **`initialize()` Method:**
        *   Called once on application startup.
        *   Query DB for campaigns with `status: 'Scheduled'`.
        *   For each campaign:
            *   If `scheduledAt` is future: Call `scheduleCampaignJob(campaign)`.
            *   If `scheduledAt` is past: Log warning, call `this.runMissedCampaign(campaign.id)`.
        *   Log completion.
    *   **`scheduleCampaignJob(campaign: Campaign)` Method:**
        *   Schedules a single campaign to run *once* at `scheduledAt`.
        *   Handles rescheduling (cancels existing job first).
        *   Validates `scheduledAt` is future.
        *   Uses `node-cron.schedule(campaign.scheduledAt, async () => { ... }, { scheduled: true, timezone: "UTC" })`. *(Assumption: UTC timezone)*
        *   Callback function:
            *   Logs start/end.
            *   Instantiates `CampaignRunnerService(this.db, this.wahaApiClient)`.
            *   Runs `runner.runCampaign(campaign.id)` in `try...catch`.
            *   Logs errors.
            *   `finally`: Removes job from `scheduledJobs` map.
        *   Stores `cron.ScheduledTask` in `scheduledJobs`.
        *   Logs scheduling success.
    *   **`cancelCampaignJob(campaignId: string)` Method:**
        *   Stops and removes a scheduled job.
        *   Retrieves job from `scheduledJobs`.
        *   If found: Calls `job.stop()`, deletes from map, logs cancellation.
        *   If not found: Logs warning.
    *   **`runMissedCampaign(campaignId: string)` Method (Private):**
        *   Runs campaigns missed during downtime.
        *   Logs attempt.
        *   Instantiates `CampaignRunnerService`.
        *   Runs `runner.runCampaign(campaignId)` in `try...catch`, logs errors.

3.  **Integrate Scheduler Service:**
    *   **Application Startup:**
        *   In the main app entry point/setup:
        *   Instantiate `PrismaClient`, `WahaApiClient`.
        *   Instantiate `SchedulerService`.
        *   Call `schedulerService.initialize()` after DB connection is ready.
    *   **Campaign Router (`src/server/api/routers/campaign.ts`):**
        *   Make `schedulerService` instance available (e.g., via context, DI, singleton).
        *   **Modify `create` Mutation:** After successful `ctx.db.campaign.create`, call `await schedulerService.scheduleCampaignJob(newCampaign);`.
        *   **Remove `runManually` Procedure:** Delete the entire procedure.
    *   **Campaign Deletion/Update Logic:**
        *   **On Delete:** Before DB delete, call `await schedulerService.cancelCampaignJob(campaignId);`.
        *   **On Update:** If `status` changes from `Scheduled` or `scheduledAt` changes, call `cancelCampaignJob` and potentially `scheduleCampaignJob` if rescheduled.

4.  **Testing:**
    *   **Unit Tests (`scheduler.test.ts`):**
        *   Mock `node-cron`, `PrismaClient`, `WahaApiClient`, `CampaignRunnerService`.
        *   Test `initialize()` (DB queries, scheduling/running logic).
        *   Test `scheduleCampaignJob()` (cron calls, map storage, cancellation, callback execution).
        *   Test `cancelCampaignJob()` (stop call, map removal).
        *   Test `runMissedCampaign()` (runner call).
    *   **Integration Tests:**
        *   Requires running DB (mock WAHA optional).
        *   Test Case 1 (Scheduled Run): Create future campaign -> Verify run via logs/DB status.
        *   Test Case 2 (Post-Startup Scheduling): Start app -> Create future campaign -> Verify run.
        *   Test Case 3 (Cancellation): Create future campaign -> Delete -> Verify *no* run.
        *   Test Case 4 (Missed Schedule): Stop app -> Set past `scheduledAt` in DB -> Start app -> Verify immediate run.

**Diagram (Mermaid Sequence):**

```mermaid
sequenceDiagram
    participant App Startup
    participant SchedulerService
    participant DB
    participant NodeCron
    participant CampaignRunnerService
    participant User
    participant CampaignRouter
    participant WahaApiClient

    App Startup->>SchedulerService: Instantiate(db, wahaClient)
    App Startup->>SchedulerService: initialize()
    SchedulerService->>DB: query("Scheduled" campaigns)
    DB-->>SchedulerService: scheduledCampaigns
    loop For each campaign
        alt scheduledAt > now
            SchedulerService->>SchedulerService: scheduleCampaignJob(campaign)
            SchedulerService->>NodeCron: schedule(date, callback)
            NodeCron-->>SchedulerService: jobInstance
            SchedulerService->>SchedulerService: Store jobInstance in map
        else scheduledAt <= now
            SchedulerService->>SchedulerService: runMissedCampaign(campaign.id)
            SchedulerService->>CampaignRunnerService: Instantiate(db, wahaClient)
            CampaignRunnerService->>CampaignRunnerService: runCampaign(campaign.id)
            CampaignRunnerService->>DB: Update status, etc.
            CampaignRunnerService->>WahaApiClient: Send messages, etc.
        end
    end

    User->>CampaignRouter: createCampaign(data)
    CampaignRouter->>DB: create(data)
    DB-->>CampaignRouter: newCampaign
    CampaignRouter->>SchedulerService: scheduleCampaignJob(newCampaign)
    SchedulerService->>NodeCron: schedule(date, callback)
    NodeCron-->>SchedulerService: jobInstance
    SchedulerService->>SchedulerService: Store jobInstance in map

    Note over NodeCron, CampaignRunnerService: Later, at scheduled time...
    NodeCron->>SchedulerService: Execute callback for campaignId
    SchedulerService->>CampaignRunnerService: Instantiate(db, wahaClient)
    CampaignRunnerService->>CampaignRunnerService: runCampaign(campaignId)
    CampaignRunnerService->>DB: Update status (Running, Completed/Failed)
    CampaignRunnerService->>WahaApiClient: Send messages, check status
    WahaApiClient-->>CampaignRunnerService: Results/Status
    DB-->>CampaignRunnerService: Update results
    CampaignRunnerService-->>SchedulerService: (Completion or Error)
    SchedulerService->>SchedulerService: Remove jobInstance from map

    User->>CampaignRouter: deleteCampaign(campaignId)
    CampaignRouter->>SchedulerService: cancelCampaignJob(campaignId)
    SchedulerService->>NodeCron: job.stop()
    SchedulerService->>SchedulerService: Remove jobInstance from map
    CampaignRouter->>DB: delete(campaignId)
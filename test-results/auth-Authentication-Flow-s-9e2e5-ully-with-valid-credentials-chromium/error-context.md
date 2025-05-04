# Test info

- Name: Authentication Flow >> should sign in successfully with valid credentials
- Location: /home/ditto/Documents/work with hendra/waha-gateway/e2e/auth.spec.ts:19:3

# Error details

```
Error: page.waitForURL: Test timeout of 30000ms exceeded.
=========================== logs ===========================
waiting for navigation to "/dashboard" until "load"
============================================================
    at /home/ditto/Documents/work with hendra/waha-gateway/e2e/auth.spec.ts:30:16
```

# Page snapshot

```yaml
- text: Sign In Email
- textbox "Email" [disabled]: test@example.com
- text: Password
- textbox "Password" [disabled]: password123
- button "Signing In..." [disabled]
- region "Notifications alt+T"
- alert
- button "Open Next.js Dev Tools":
  - img
```

# Test source

```ts
   1 | import { test, expect } from '@playwright/test';
   2 |
   3 | test.describe('Authentication Flow', () => {
   4 |   test('should load sign-in page correctly', async ({ page }) => {
   5 |     // Navigate directly to the sign-in page
   6 |     await page.goto('/auth/signin'); // Changed from '/'
   7 |
   8 |     // Expect the title to be the actual title of the page
   9 |     await expect(page).toHaveTitle(/WA Blast/i); // Updated to actual title
  10 |
  11 |     // Check for specific elements on the sign-in page
  12 |     // Use getByText and .first() to target the CardTitle specifically
  13 |     await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible(); // Added .first()
  14 |     await expect(page.getByLabel(/Email/i)).toBeVisible();
  15 |     await expect(page.getByLabel(/Password/i)).toBeVisible();
  16 |     await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  17 |   });
  18 |
  19 |   test('should sign in successfully with valid credentials', async ({ page }) => {
  20 |     await page.goto('/auth/signin');
  21 |
  22 |     // Fill in the form
  23 |     await page.getByLabel(/Email/i).fill('test@example.com'); // Use appropriate test credentials
  24 |     await page.getByLabel(/Password/i).fill('password123'); // Use appropriate test credentials
  25 |
  26 |     // Click the sign-in button
  27 |     await page.getByRole('button', { name: /Sign In/i }).click();
  28 |
  29 |     // Wait for navigation to the dashboard and assert the URL
> 30 |     await page.waitForURL('/dashboard');
     |                ^ Error: page.waitForURL: Test timeout of 30000ms exceeded.
  31 |     await expect(page).toHaveURL('/dashboard');
  32 |
  33 |     // Optionally, assert that some dashboard element is visible
  34 |     // await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  35 |   });
  36 |
  37 |   // TODO: Add test for failed sign-in (wrong credentials)
  38 |   // TODO: Add test for navigating to sign-up page
  39 |   // TODO: Add test for sign-up process (if applicable)
  40 | });
```
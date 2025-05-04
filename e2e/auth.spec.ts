import { test, expect } from '@playwright/test';

test.describe('Authentication Flow', () => {
  test('should load sign-in page correctly', async ({ page }) => {
    // Navigate directly to the sign-in page
    await page.goto('/auth/signin'); // Changed from '/'

    // Expect the title to be the actual title of the page
    await expect(page).toHaveTitle(/WA Blast/i); // Updated to actual title

    // Check for specific elements on the sign-in page
    // Use getByText and .first() to target the CardTitle specifically
    await expect(page.getByText('Sign In', { exact: true }).first()).toBeVisible(); // Added .first()
    await expect(page.getByLabel(/Email/i)).toBeVisible();
    await expect(page.getByLabel(/Password/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /Sign In/i })).toBeVisible();
  });

  test('should sign in successfully with valid credentials', async ({ page }) => {
    await page.goto('/auth/signin');

    // Fill in the form
    await page.getByLabel(/Email/i).fill('test@example.com'); // Use appropriate test credentials
    await page.getByLabel(/Password/i).fill('password123'); // Use appropriate test credentials

    // Click the sign-in button
    await page.getByRole('button', { name: /Sign In/i }).click();

    // Wait for navigation to the dashboard and assert the URL
    await page.waitForURL('/dashboard');
    await expect(page).toHaveURL('/dashboard');

    // Optionally, assert that some dashboard element is visible
    // await expect(page.getByRole('heading', { name: /Dashboard/i })).toBeVisible();
  });

  // TODO: Add test for failed sign-in (wrong credentials)
  // TODO: Add test for navigating to sign-up page
  // TODO: Add test for sign-up process (if applicable)
});
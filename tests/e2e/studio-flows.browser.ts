import { expect, setDefaultTimeout, test } from 'bun:test';
import { mkdir } from 'node:fs/promises';
import { Database } from 'bun:sqlite';
import { chromium, type Page } from 'playwright';
import {
  pageHasNoHorizontalOverflow,
  seriousAccessibilityViolations,
  trackBrowserIssues
} from '../helpers/browser-assertions';
import { startBrowserAppHarness } from '../helpers/browser-app-harness';

setDefaultTimeout(120_000);

async function waitUntil(predicate: () => boolean, message: string, timeoutMs = 10_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (predicate()) return;
    await Bun.sleep(25);
  }
  throw new Error(message);
}

async function chooseImageTextWorkflow(page: Page): Promise<void> {
  const inspector = page.locator('#parameter-inspector');
  await inspector.getByLabel('Creative intent').selectOption('text-to-image');
  await inspector.getByLabel('Audited model').selectOption('flux-schnell:text-to-image');
  await inspector
    .getByRole('textbox', { name: /^Prompt/ })
    .fill('A quiet blue observatory above a calm northern sea');
  await inspector.getByText('Request validated locally.').waitFor();
}

async function chooseImageEditWorkflow(page: Page): Promise<void> {
  const inspector = page.locator('#parameter-inspector');
  await inspector.getByLabel('Creative intent').selectOption('image-edit');
  await inspector.getByLabel('Audited model').selectOption('flux-dev:image-edit');
  await inspector
    .getByRole('textbox', { name: /^Prompt/ })
    .fill('Transform the retained source into a quiet cyanotype');
  await inspector.getByLabel('Add local file').setInputFiles('tests/fixtures/media/tiny.png');
  await inspector.getByText('tiny.png').waitFor();
  await inspector.getByText('1 × 1 px').waitFor();
  await inspector.getByText('Local transfer and Poyo upload completed.').waitFor();
  await inspector.getByText('Request validated locally.').waitFor();
}

async function createMultiOutputImage(page: Page): Promise<void> {
  const inspector = page.locator('#parameter-inspector');
  await inspector.getByLabel('Creative intent').selectOption('text-to-image');
  await inspector.getByLabel('Audited model').selectOption('gpt-4o-image:text-to-image');
  await inspector
    .getByRole('textbox', { name: /^Prompt/ })
    .fill('Two cobalt paper sculptures for a related-output comparison');
  await inspector.getByLabel('N', { exact: true }).fill('2');
  await inspector.getByText('Request validated locally.').waitFor();
  await inspector.getByRole('button', { name: 'Generate image' }).click();
  await page.getByRole('heading', { name: 'Generation verified locally' }).waitFor({
    timeout: 15_000
  });
}

async function assertPrimaryRoutesAccessible(page: Page, baseUrl: string): Promise<void> {
  for (const route of [
    '/',
    '/studio/image',
    '/studio/video',
    '/jobs',
    '/library',
    '/models',
    '/presets',
    '/settings',
    '/settings/diagnostics'
  ]) {
    await page.goto(`${baseUrl}${route}`);
    await page.locator('h1').waitFor();
    expect(await page.locator('h1').count()).toBe(1);
    expect(await seriousAccessibilityViolations(page)).toEqual([]);
  }
}

test('E2E-01..15 production studios, recovery, library, settings and accessibility', async () => {
  const harness = await startBrowserAppHarness();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    reducedMotion: 'reduce'
  });
  const page = await context.newPage();
  const issues = trackBrowserIssues(page);
  const browserRequests: string[] = [];
  page.on('request', (request) => browserRequests.push(request.url()));

  try {
    await page.goto(harness.url);
    await page.getByRole('heading', { name: 'Dashboard', level: 1 }).waitFor();
    expect(await page.getByText('Model registry').count()).toBeGreaterThan(0);
    expect(await pageHasNoHorizontalOverflow(page)).toBe(true);

    const theme = page.getByRole('button', { name: /Light theme\. Activate next theme\./ }).first();
    await theme.click();
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');
    await page.reload();
    expect(await page.locator('html').getAttribute('data-theme')).toBe('dark');

    await page.goto(`${harness.url}/studio/image`);
    await chooseImageTextWorkflow(page);
    const inspector = page.locator('#parameter-inspector');
    await inspector.getByRole('button', { name: 'Save preset', exact: true }).click();
    await inspector.getByLabel('Preset name').fill('Northern observatory');
    await inspector.getByLabel('Description').fill('Synthetic browser-suite preset');
    await inspector.getByRole('button', { name: 'Save preset', exact: true }).first().click();
    await inspector.getByText('Saved preset “Northern observatory”.').waitFor();

    const imageGenerate = inspector.getByRole('button', {
      name: 'Generate image'
    });
    await imageGenerate.dblclick();
    await waitUntil(
      () =>
        harness.mock.requests.filter((request) => request.pathname === '/api/generate/submit')
          .length === 1,
      'Image submission did not reach the mock server exactly once.'
    );
    await page.getByRole('heading', { name: 'Generation verified locally' }).waitFor({
      timeout: 15_000
    });
    expect(
      harness.mock.requests.filter((request) => request.pathname === '/api/generate/submit')
    ).toHaveLength(1);
    const imageSubmit = harness.mock.requests.find(
      (request) => request.pathname === '/api/generate/submit'
    );
    expect(imageSubmit).toMatchObject({ authorizationScheme: 'Bearer' });
    expect(JSON.stringify(imageSubmit?.json)).toContain('flux-schnell');
    expect(JSON.stringify(imageSubmit?.json)).not.toContain(harness.syntheticKey);

    await page.goto(`${harness.url}/studio/image`);
    await chooseImageEditWorkflow(page);
    await page
      .locator('#parameter-inspector')
      .getByRole('button', { name: 'Generate image' })
      .click();
    await page.getByRole('heading', { name: 'Generation verified locally' }).waitFor({
      timeout: 15_000
    });
    expect(
      harness.mock.requests.filter((request) => request.pathname === '/api/common/upload/stream')
    ).toHaveLength(1);
    const database = new Database(harness.databasePath, { readonly: true });
    try {
      const input = database
        .query<
          {
            local_reference: string | null;
            managed_source_id: string | null;
            relative_path: string | null;
            upload_url: string | null;
          },
          []
        >(
          `SELECT ji.local_reference,ji.managed_source_id,ms.relative_path,ji.upload_url
           FROM job_inputs ji LEFT JOIN managed_sources ms ON ms.id=ji.managed_source_id
           ORDER BY ji.rowid DESC LIMIT 1`
        )
        .get();
      expect(input?.local_reference).toBeNull();
      expect(input?.managed_source_id).toBeTruthy();
      expect(input?.relative_path).toBeTruthy();
      expect(
        input?.relative_path &&
          (await Bun.file(`${harness.appData}/uploads/${input.relative_path}`).exists())
      ).toBe(true);
      expect(input?.upload_url).toContain('/media/source.png');
    } finally {
      database.close();
    }

    harness.mock.queueOutcome('held');
    await page.goto(`${harness.url}/studio/video`);
    const videoInspector = page.locator('#parameter-inspector');
    await videoInspector
      .getByRole('textbox', { name: /^Prompt/ })
      .fill('A slow cinematic orbit around a glass sculpture at sunrise');
    await videoInspector.getByText('Request validated locally.').waitFor();
    await videoInspector.getByRole('button', { name: 'Generate video' }).click();
    await page.getByRole('heading', { name: 'Poyo is generating' }).waitFor({ timeout: 15_000 });
    expect(await page.getByText('42%').count()).toBeGreaterThan(0);

    await harness.stopApp();
    await page.getByText('Live updates reconnecting').waitFor({ timeout: 8_000 });
    await harness.startApp();
    await page.getByText('Live updates connected').waitFor({ timeout: 12_000 });
    harness.mock.releaseHeldTasks();
    await page.getByRole('heading', { name: 'Generation verified locally' }).waitFor({
      timeout: 15_000
    });
    expect(harness.mock.tasks.size).toBe(3);
    expect(
      harness.mock.requests.filter((request) => request.pathname === '/api/generate/submit')
    ).toHaveLength(3);

    await page.goto(`${harness.url}/studio/image`);
    await createMultiOutputImage(page);

    await page.goto(`${harness.url}/jobs`);
    await page.getByRole('heading', { name: 'Generation history' }).waitFor();
    expect(await page.getByText('Flux Schnell', { exact: true }).count()).toBeGreaterThan(0);
    expect(await page.getByText(/Grok Imagine Video/).count()).toBeGreaterThan(0);
    await page.getByRole('link', { name: 'Completed' }).click();
    expect(await page.getByText('4 tracked jobs').count()).toBe(1);

    await page.goto(`${harness.url}/library`);
    await page.getByRole('heading', { name: 'Generation groups' }).waitFor();
    expect(await page.getByText('4 grouped generations').count()).toBe(1);
    await page.getByRole('link', { name: 'List view' }).click();
    await page.waitForURL(/view=list/);
    expect(await page.getByRole('link', { name: 'List view' }).getAttribute('aria-current')).toBe(
      'page'
    );
    const favorite = page.getByRole('button', { name: 'Add to favorites' }).first();
    await favorite.click();
    await page.getByRole('button', { name: 'Remove from favorites' }).first().waitFor();
    await page.getByRole('link', { name: /Favorites/ }).click();
    await page.waitForURL(/favorite=true/);
    expect(await page.getByText('1 grouped generation').count()).toBe(1);

    await page.goto(`${harness.url}/library`);
    const comparisonGroup = page.locator('article').filter({
      hasText: 'Two cobalt paper sculptures for a related-output comparison'
    });
    await comparisonGroup.getByRole('link', { name: 'GPT-4o Image', exact: true }).click();
    await page.getByRole('heading', { name: 'Compare related outputs' }).waitFor();
    expect(
      await page.getByRole('combobox', { name: 'Output A', exact: true }).inputValue()
    ).not.toBe(await page.getByRole('combobox', { name: 'Output B', exact: true }).inputValue());
    await page
      .getByRole('button', {
        name: /Open full-screen media viewer for .* comparison output A/
      })
      .click();
    const viewer = page.getByRole('dialog', { name: /comparison output A/ });
    await viewer.waitFor();
    await viewer.getByRole('button', { name: 'Zoom in' }).click();
    await viewer.getByText('Zoom 125 percent.').waitFor();
    expect(await seriousAccessibilityViolations(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Remix image' }).first().waitFor();
    await page.getByRole('link', { name: 'Animate in Video Studio' }).first().click();
    const remixedVideoInspector = page.locator('#parameter-inspector');
    expect(await remixedVideoInspector.getByRole('textbox', { name: /^Prompt/ }).inputValue()).toBe(
      'Two cobalt paper sculptures for a related-output comparison'
    );
    await remixedVideoInspector.getByText('127.0.0.1').waitFor();

    await page.goto(`${harness.url}/studio/video`);
    const videoEditInspector = page.locator('#parameter-inspector');
    await videoEditInspector.getByLabel('Creative intent').selectOption('video-edit');
    await videoEditInspector.getByLabel('Audited model').selectOption('happy-horse:video-edit');
    await videoEditInspector
      .getByRole('textbox', { name: /^Prompt/ })
      .fill('Regrade the source video with cool evening light');
    await videoEditInspector
      .locator('input[type="file"][accept^="video/"]')
      .setInputFiles('tests/fixtures/media/tiny.mp4');
    await videoEditInspector.getByText('16 × 16 px · 0.20 s').waitFor();
    await videoEditInspector.getByText('Local transfer and Poyo upload completed.').waitFor();
    await videoEditInspector.getByText('sourceVideoDuration is below minimum.').waitFor();

    await page.goto(`${harness.url}/presets`);
    await page.getByRole('heading', { name: 'Saved presets' }).waitFor();
    await page.getByText('Northern observatory').waitFor();
    await page.getByRole('link', { name: 'Use preset' }).click();
    await page.getByText('Loaded preset “Northern observatory”.').waitFor();

    await page.goto(`${harness.url}/settings`);
    await page.getByText('Environment key active').waitFor();
    await page.getByRole('button', { name: /Test connection/ }).click();
    await page.getByText(/Passed/).waitFor();
    await page.getByLabel('Download successful outputs automatically').uncheck();
    await page.getByLabel('Polling interval (seconds)').fill('2');
    await page.getByLabel('Stale threshold (minutes)').fill('3');
    await page.getByRole('button', { name: 'Save operational settings' }).click();
    await page.getByText('Operational settings saved.').waitFor();
    await page.reload();
    expect(await page.getByLabel('Download successful outputs automatically').isChecked()).toBe(
      false
    );
    expect(await page.getByLabel('Polling interval (seconds)').inputValue()).toBe('2');
    expect(await page.getByLabel('Stale threshold (minutes)').inputValue()).toBe('3');
    expect(await page.getByText('Never delete automatically').count()).toBeGreaterThan(0);
    await page.getByRole('button', { name: 'Save automatic policy and preview' }).click();
    await page.getByText('Preview: 0 candidates').waitFor();
    await page.getByRole('heading', { name: 'Remote Poyo cleanup' }).scrollIntoViewIfNeeded();
    expect(await page.getByText(/No toggle, schedule, or simulated remote deletion/).count()).toBe(
      1
    );

    await page.goto(`${harness.url}/settings/diagnostics`);
    await page.getByRole('heading', { name: 'Application diagnostics' }).waitFor();
    expect(await page.getByText('127.0.0.1 · loopback only').count()).toBe(1);
    expect(await page.getByText('Disabled', { exact: true }).count()).toBeGreaterThan(0);
    expect(await page.locator('body').textContent()).not.toContain(harness.syntheticKey);

    harness.mock.queueOutcome('failed');
    await page.goto(`${harness.url}/studio/image`);
    await chooseImageTextWorkflow(page);
    await page
      .locator('#parameter-inspector')
      .getByRole('button', { name: 'Generate image' })
      .click();
    await page.getByRole('heading', { name: 'Poyo generation failed' }).waitFor({
      timeout: 15_000
    });
    expect(await page.getByText(/authoritatively reported/).count()).toBe(1);
    expect(await page.getByText('Generation verified locally').count()).toBe(0);

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`${harness.url}/studio/image`);
    expect(await pageHasNoHorizontalOverflow(page)).toBe(true);
    await page.getByRole('button', { name: 'Edit setup' }).click();
    const dialog = page.getByRole('dialog', { name: 'Image setup' });
    await dialog.waitFor();
    await dialog.getByRole('button', { name: 'Prompt' }).click();
    await dialog
      .getByRole('textbox', { name: /^Prompt/ })
      .fill('Keyboard accessible mobile prompt');
    expect(await dialog.getByRole('textbox', { name: /^Prompt/ }).isVisible()).toBe(true);
    await page.keyboard.press('Escape');
    expect(await page.getByRole('button', { name: 'Edit setup' }).isVisible()).toBe(true);

    await page.setViewportSize({ width: 1440, height: 900 });
    await assertPrimaryRoutesAccessible(page, harness.url);

    const applicationPort = new URL(harness.url).port;
    const unexpectedBrowserRequests = browserRequests.filter((requestUrl) => {
      const url = new URL(requestUrl);
      if (!['http:', 'https:'].includes(url.protocol)) return false;
      return url.hostname !== '127.0.0.1' || url.port !== applicationPort;
    });
    expect(unexpectedBrowserRequests).toEqual([]);
    const unexpectedConsoleErrors = issues.consoleErrors.filter(
      (message) =>
        !message.includes('ERR_INCOMPLETE_CHUNKED_ENCODING') &&
        !message.includes('TypeError: Failed to fetch') &&
        message !== 'TypeError: network error' &&
        !message.includes('status of 422 (Unprocessable Entity)')
    );
    expect(unexpectedConsoleErrors).toEqual([]);
    expect(issues.pageErrors).toEqual([]);
  } catch (error) {
    await mkdir('test-results', { recursive: true });
    await page.screenshot({ path: 'test-results/e2e-failure.png', fullPage: true }).catch(() => {});
    throw error;
  } finally {
    await context.close();
    await browser.close();
    await harness.cleanup();
  }
});

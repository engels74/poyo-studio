import { Database } from 'bun:sqlite';
import { expect, setDefaultTimeout, test } from 'bun:test';
import { chromium } from 'playwright';
import { JobRepository } from '../../src/lib/server/jobs/repository';
import { startBrowserAppHarness } from '../helpers/browser-app-harness';

setDefaultTimeout(60_000);

test('job detail reveals lifecycle history in bounded pages', async () => {
  const harness = await startBrowserAppHarness();
  await harness.stopApp();
  const database = new Database(harness.databasePath, { strict: true });
  const repository = new JobRepository(database, () => new Date('2026-07-18T20:00:00.000Z'));
  const job = repository.create({
    actionId: crypto.randomUUID(),
    workflow: 'text-to-image',
    publicModelId: 'flux-schnell',
    guidedRequest: { prompt: 'Bounded lifecycle history' },
    normalizedPayload: {
      model: 'flux-schnell',
      input: { prompt: 'Bounded lifecycle history' }
    }
  });
  const insertEvent = database.query(
    `INSERT INTO job_events(
      job_id,event_type,local_phase,remote_status_raw,remote_status,failure_domain,
      progress,safe_payload_json,observed_at
    ) VALUES (?,?,?,?,?,?,?,?,?)`
  );
  for (let index = 1; index < 45; index += 1) {
    insertEvent.run(
      job.id,
      'status.observed',
      'monitoring',
      'running',
      'running',
      'none',
      index,
      JSON.stringify({ observedProgress: index }),
      new Date(Date.parse('2026-07-18T20:00:00.000Z') + index * 1000).toISOString()
    );
  }
  database
    .query(
      `UPDATE jobs
       SET local_phase='complete',remote_status_raw='finished',remote_status='finished',
           completed_at='2026-07-18T20:01:00.000Z',updated_at='2026-07-18T20:01:00.000Z'
       WHERE id=?`
    )
    .run(job.id);
  database.close();
  await harness.startApp();

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  try {
    await page.goto(`${harness.url}/jobs/${job.id}`);
    const history = page.locator('section[aria-labelledby="history-heading"]');
    const entries = history.locator('ol > li');

    await page.getByText('Showing 20 of 45', { exact: true }).waitFor();
    expect(await entries.count()).toBe(20);
    await page.getByRole('button', { name: 'Show 20 older events' }).click();
    await page.getByText('Showing 40 of 45', { exact: true }).waitFor();
    expect(await entries.count()).toBe(40);
    await page.getByRole('button', { name: 'Show 20 older events' }).click();
    await page.getByText('Showing 45 of 45', { exact: true }).waitFor();
    expect(await entries.count()).toBe(45);
    expect(await page.getByRole('button', { name: 'Show 20 older events' }).count()).toBe(0);
  } finally {
    await context.close();
    await browser.close();
    await harness.cleanup();
  }
});

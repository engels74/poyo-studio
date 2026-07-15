import { expect, setDefaultTimeout, test } from 'bun:test';
import { systemClock } from '../../src/lib/server/poyo/backoff';
import { PoyoClient } from '../../src/lib/server/poyo/client';
import { PoyoTransport } from '../../src/lib/server/poyo/transport';

const REVIEWED_PRICING_HASH = 'd9967a136a8aad200d408e2b852bae9a6dc9b1e212f472b7fefba41b466d0faf';
const liveCases = {
  'nano-banana-2-lite': {
    maximumCredits: 5,
    request: {
      model: 'nano-banana-2-lite',
      input: { prompt: 'A single blue ceramic cup on a plain white table', aspect_ratio: '1:1' }
    }
  }
} as const;

const enabled = Bun.env.POYO_LIVE_TESTS === '1' || Bun.env.POYO_LIVE_TEST === '1';

test('LIVE-00 paid integration is disabled by default and performs no network request', () => {
  if (!enabled) {
    expect(Bun.env.POYO_LIVE_TESTS).not.toBe('1');
    expect(Bun.env.POYO_LIVE_TEST).not.toBe('1');
  }
});

test.skipIf(!enabled)(
  'LIVE-01 one reviewed paid image request stays within the explicit ledger',
  async () => {
    setDefaultTimeout(25 * 60_000);
    const apiKey = Bun.env.POYO_API_KEY?.trim();
    const model = Bun.env.POYO_LIVE_MODEL as keyof typeof liveCases | undefined;
    const budget = Number(Bun.env.POYO_LIVE_BUDGET_CREDITS);
    if (Bun.env.POYO_LIVE_APPROVED !== 'YES') {
      throw new Error('Live paid submission requires POYO_LIVE_APPROVED=YES.');
    }
    if (!apiKey) throw new Error('Live paid submission requires POYO_API_KEY.');
    if (!model || !(model in liveCases)) {
      throw new Error(`POYO_LIVE_MODEL must be one of: ${Object.keys(liveCases).join(', ')}.`);
    }
    if (!Number.isSafeInteger(budget) || budget < 1 || budget > 300) {
      throw new Error('POYO_LIVE_BUDGET_CREDITS must be an integer from 1 through 300.');
    }
    if (Bun.env.POYO_LIVE_PRICING_HASH !== REVIEWED_PRICING_HASH) {
      throw new Error('The reviewed pricing hash does not match; no paid task was submitted.');
    }
    const liveCase = liveCases[model];
    if (liveCase.maximumCredits > budget || liveCase.maximumCredits > 150) {
      throw new Error('The reviewed case does not fit the approved fail-closed budget reserve.');
    }

    const client = new PoyoClient(new PoyoTransport({ apiKey }), systemClock);
    const before = await client.getBalance();
    if (before.creditsAmount < liveCase.maximumCredits) {
      throw new Error('Known balance is below the reviewed maximum; no paid task was submitted.');
    }

    const submitted = await client.submit(liveCase.request);
    let status = await client.getStatus(submitted.taskId);
    const deadline = Date.now() + 20 * 60_000;
    while (!['finished', 'failed'].includes(status.status) && Date.now() < deadline) {
      await Bun.sleep(5_000);
      status = await client.getStatus(submitted.taskId);
    }
    if (!['finished', 'failed'].includes(status.status)) {
      throw new Error('The single paid task did not reach a terminal state within twenty minutes.');
    }
    const after = await client.getBalance();
    const observedSpend = Math.max(0, before.creditsAmount - after.creditsAmount);
    expect(status.taskId).toBe(submitted.taskId);
    expect(status.creditsAmount).toBeLessThanOrEqual(liveCase.maximumCredits);
    expect(observedSpend).toBeLessThanOrEqual(budget);
    console.log(
      JSON.stringify({
        case: model,
        taskId: submitted.taskId,
        status: status.status,
        declaredMaximum: liveCase.maximumCredits,
        authoritativeCredits: status.creditsAmount,
        observedSpend,
        startedBalance: before.creditsAmount,
        finishedBalance: after.creditsAmount
      })
    );
  }
);

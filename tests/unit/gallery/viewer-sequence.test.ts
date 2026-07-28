import { describe, expect, test } from 'bun:test';
import {
  createViewerSequenceController,
  parseViewerSequencePage,
  resolveViewerSelectionSeed,
  type ViewerSequenceState,
  viewerSequenceFilters,
  viewerSequenceItems,
  viewerSequenceSearchParams
} from '../../../src/lib/features/gallery/viewer-sequence';
import type {
  GalleryViewerItemDto,
  LibraryFiltersDto
} from '../../../src/lib/features/library/contracts';

const filters: LibraryFiltersDto = {
  q: '',
  mediaKind: '',
  model: '',
  provider: '',
  workflow: '',
  aspectRatio: '',
  status: 'all',
  favorite: false,
  tag: '',
  dateFrom: '',
  dateTo: '',
  cursor: 'grid-cursor',
  view: 'grid'
};
const item = (
  jobId: string,
  outputId: string,
  createdAt = '2026-01-01T00:00:00.000Z'
): GalleryViewerItemDto => ({
  jobId,
  outputId,
  createdAt,
  displayName: jobId,
  provider: 'provider',
  workflow: 'workflow',
  promptExcerpt: null,
  mediaKind: 'image',
  mediaUrl: `/api/media/${outputId}`
});
const page = (
  items: GalleryViewerItemDto[],
  nextCursor: string | null,
  total: number | null,
  snapshot = 'snapshot'
) => ({ items, nextCursor, total, snapshot });
const response = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('viewer sequence', () => {
  test('omits grid cursor and view from filters', () => {
    const sequenceFilters = viewerSequenceFilters(filters);
    expect(sequenceFilters).not.toHaveProperty('cursor');
    expect(sequenceFilters).not.toHaveProperty('view');
    expect(viewerSequenceSearchParams(sequenceFilters).toString()).not.toContain('cursor');
  });

  test('rejects duplicate identities, bad order, and malformed pages', () => {
    expect(parseViewerSequencePage(page([item('a', 'a'), item('a', 'b')], null, 2))).toBeNull();
    expect(parseViewerSequencePage(page([item('a', 'a'), item('b', 'b')], null, 2))).toBeNull();
    expect(
      parseViewerSequencePage({ items: [], nextCursor: null, total: 0, snapshot: '' })
    ).toBeNull();
    for (const createdAt of ['2025-02-29T00:00:00.000Z', '2026-01-01T24:00:00.000Z']) {
      expect(parseViewerSequencePage(page([item('a', 'a', createdAt)], null, 1))).toBeNull();
    }
  });

  test('walks pages sequentially and atomically publishes only after terminal total', async () => {
    const calls: string[] = [];
    const controller = createViewerSequenceController({
      fetch: async (input) => {
        calls.push(String(input));
        return calls.length === 1
          ? response(page([item('b', 'b', '2026-01-02T00:00:00.000Z')], 'next', 2))
          : response(page([item('a', 'a')], null, 2));
      }
    });
    const pending = controller.load(viewerSequenceFilters(filters));
    expect(controller.state.complete).toBeFalse();
    expect(controller.state.items).toEqual([]);
    expect(await pending).toMatchObject({ type: 'complete', total: 2 });
    expect(calls).toHaveLength(2);
    expect(controller.state.items.map((entry) => entry.outputId)).toEqual(['b', 'a']);
  });

  test('publishes a selected old representative with its canonical replacement atomically', async () => {
    const published: ViewerSequenceState[] = [];
    const selected = item('same-job', 'old-output');
    const controller = createViewerSequenceController({
      fetch: async () => response(page([item('same-job', 'new-output')], null, 1)),
      onState: (state) => published.push(state)
    });

    await controller.load(viewerSequenceFilters(filters), () => selected);

    const completed = published.filter((state) => state.complete);
    expect(completed).toHaveLength(1);
    const completedState = completed[0];
    if (!completedState) throw new Error('Expected one completed viewer sequence state.');
    expect(completedState.overlay).toBe(selected);
    expect(viewerSequenceItems(completedState).map((entry) => entry.outputId)).toEqual([
      'old-output',
      'new-output'
    ]);
  });

  test('uses the latest selected representative when a deferred load completes', async () => {
    const deferred = Promise.withResolvers<Response>();
    const published: ViewerSequenceState[] = [];
    const original = item('first-job', 'first-old', '2026-01-02T00:00:00.000Z');
    const latest = item('second-job', 'second-old');
    let selected = original;
    const controller = createViewerSequenceController({
      fetch: () => deferred.promise,
      onState: (state) => published.push(state)
    });

    const pending = controller.load(viewerSequenceFilters(filters), () => selected);
    selected = latest;
    deferred.resolve(
      response(
        page(
          [
            item('first-job', 'first-new', '2026-01-02T00:00:00.000Z'),
            item('second-job', 'second-new')
          ],
          null,
          2
        )
      )
    );
    await pending;

    const completedState = published.find((state) => state.complete);
    if (!completedState) throw new Error('Expected one completed viewer sequence state.');
    expect(completedState.overlay).toBe(latest);
    expect(viewerSequenceItems(completedState).map((entry) => entry.outputId)).toEqual([
      'first-new',
      'second-old',
      'second-new'
    ]);
    expect(
      viewerSequenceItems(completedState).some((entry) => entry.outputId === 'first-old')
    ).toBe(false);
  });

  test('keeps the old complete list while a refresh is building and ignores stale work', async () => {
    const controller = createViewerSequenceController({
      fetch: (_input, init) =>
        new Promise<Response>((resolve, reject) => {
          init?.signal?.addEventListener(
            'abort',
            () => reject(new DOMException('Aborted', 'AbortError')),
            { once: true }
          );
          if (!init?.signal?.aborted) resolve(response(page([], null, 0)));
        })
    });
    const first = controller.load(viewerSequenceFilters(filters));
    const second = controller.load(viewerSequenceFilters(filters));
    expect(await first).toEqual({ type: 'error', error: 'aborted' });
    expect(await second).toMatchObject({ type: 'complete', total: 0 });
  });

  test('adds only a selected old representative overlay and removes/releases it', async () => {
    const controller = createViewerSequenceController({
      fetch: async () => response(page([item('same-job', 'new-output')], null, 1))
    });
    await controller.load(viewerSequenceFilters(filters));
    controller.setOverlay(item('same-job', 'old-output'));
    expect(controller.state.items).toHaveLength(1);
    expect(controller.state.overlay?.outputId).toBe('old-output');
    expect(viewerSequenceItems(controller.state).map((entry) => entry.outputId)).toEqual([
      'old-output',
      'new-output'
    ]);
    const gridSeed = item('grid-job', 'grid-output');
    const canonicalSeed = resolveViewerSelectionSeed(controller.state, 'new-output', gridSeed);
    expect(canonicalSeed?.outputId).toBe('new-output');
    const overlaySeed = resolveViewerSelectionSeed(controller.state, 'old-output', canonicalSeed);
    expect(overlaySeed?.outputId).toBe('old-output');
    expect(resolveViewerSelectionSeed(controller.state, null, overlaySeed)).toBe(overlaySeed);
    expect(resolveViewerSelectionSeed(controller.state, 'missing-output', overlaySeed)).toBe(
      overlaySeed
    );
    controller.remove('old-output');
    expect(controller.state.items).toHaveLength(1);
    expect(controller.state.overlay).toBeNull();
    controller.reset();
    expect(controller.state.overlay).toBeNull();
  });
});

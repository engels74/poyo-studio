import type {
  GalleryViewerItemDto,
  GalleryViewerSequencePageDto,
  LibraryFiltersDto
} from '../library/contracts';
import { isExactIsoUtcInstant } from '../library/contracts';

export type ViewerSequenceFilters = Omit<LibraryFiltersDto, 'cursor' | 'view'>;
export type ViewerSequenceError = 'aborted' | 'invalid_page' | 'request_failed' | 'changed';
export type ViewerSequenceResult =
  | { type: 'complete'; items: GalleryViewerItemDto[]; total: number }
  | { type: 'changed' }
  | { type: 'error'; error: ViewerSequenceError };

export interface ViewerSequenceState {
  items: GalleryViewerItemDto[];
  total: number;
  complete: boolean;
  updating: boolean;
  generation: number;
  error: ViewerSequenceError | null;
  overlay: GalleryViewerItemDto | null;
}

export interface ViewerSequenceRequest {
  filters: ViewerSequenceFilters;
  signal: AbortSignal;
}

export type ViewerSequenceFetch = (
  input: RequestInfo | URL,
  init?: RequestInit
) => Promise<Response>;

export interface ViewerSequenceControllerOptions {
  fetch?: ViewerSequenceFetch;
  endpoint?: string;
  pageSize?: number;
  onState?: (state: ViewerSequenceState) => void;
}

const maximumPageItems = 200;
const maximumCursorLength = 512;
const maximumSnapshotLength = 1024;
const initialState = (): ViewerSequenceState => ({
  items: [],
  total: 0,
  complete: false,
  updating: false,
  generation: 0,
  error: null,
  overlay: null
});

export function viewerSequenceFilters(filters: LibraryFiltersDto): ViewerSequenceFilters {
  const { cursor: _cursor, view: _view, ...sequenceFilters } = filters;
  return sequenceFilters;
}

export function viewerSequenceSearchParams(filters: ViewerSequenceFilters): URLSearchParams {
  const params = new URLSearchParams();
  const values: Record<keyof ViewerSequenceFilters, string> = {
    q: filters.q,
    mediaKind: filters.mediaKind,
    model: filters.model,
    provider: filters.provider,
    workflow: filters.workflow,
    aspectRatio: filters.aspectRatio,
    status: filters.status,
    favorite: String(filters.favorite),
    tag: filters.tag,
    dateFrom: filters.dateFrom,
    dateTo: filters.dateTo
  };
  for (const [key, value] of Object.entries(values)) {
    if (value && value !== 'all' && value !== 'false') params.set(key, value);
  }
  return params;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);
const compare = (left: GalleryViewerItemDto, right: GalleryViewerItemDto): number => {
  if (left.createdAt !== right.createdAt) return left.createdAt > right.createdAt ? -1 : 1;
  if (left.jobId !== right.jobId) return left.jobId > right.jobId ? -1 : 1;
  if (left.outputId !== right.outputId) return left.outputId > right.outputId ? -1 : 1;
  return 0;
};

export function isViewerSequenceItem(value: unknown): value is GalleryViewerItemDto {
  if (!isRecord(value)) return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.jobId === 'string' &&
    item.jobId.length > 0 &&
    typeof item.displayName === 'string' &&
    typeof item.provider === 'string' &&
    typeof item.workflow === 'string' &&
    (typeof item.promptExcerpt === 'string' || item.promptExcerpt === null) &&
    isExactIsoUtcInstant(item.createdAt) &&
    typeof item.outputId === 'string' &&
    item.outputId.length > 0 &&
    (item.mediaKind === 'image' || item.mediaKind === 'video') &&
    item.mediaUrl === `/api/media/${encodeURIComponent(item.outputId)}`
  );
}

/** Validates one bounded wire page independently of the traversal state. */
export function parseViewerSequencePage(value: unknown): GalleryViewerSequencePageDto | null {
  if (!isRecord(value) || !Array.isArray(value.items)) return null;
  const { items: pageItems, snapshot, nextCursor, total } = value;
  if (
    pageItems.length > maximumPageItems ||
    typeof snapshot !== 'string' ||
    snapshot.length === 0 ||
    snapshot.length > maximumSnapshotLength ||
    (nextCursor !== null &&
      (typeof nextCursor !== 'string' ||
        nextCursor.length === 0 ||
        nextCursor.length > maximumCursorLength)) ||
    (total !== null && (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0))
  )
    return null;
  const items: GalleryViewerItemDto[] = [];
  const jobs = new Set<string>();
  const outputs = new Set<string>();
  for (const item of pageItems) {
    if (!isViewerSequenceItem(item) || jobs.has(item.jobId) || outputs.has(item.outputId))
      return null;
    const previous = items.at(-1);
    if (previous && compare(previous, item) >= 0) return null;
    jobs.add(item.jobId);
    outputs.add(item.outputId);
    items.push(item);
  }
  return { items, nextCursor, snapshot, total };
}

export function viewerSequenceItems(state: ViewerSequenceState): GalleryViewerItemDto[] {
  if (!state.overlay || state.items.some((item) => item.outputId === state.overlay?.outputId))
    return state.items;
  return [...state.items, state.overlay].sort(compare);
}
const selectedOverlay = (
  items: GalleryViewerItemDto[],
  item: GalleryViewerItemDto | null
): GalleryViewerItemDto | null =>
  item &&
  items.some((candidate) => candidate.jobId === item.jobId && candidate.outputId !== item.outputId)
    ? item
    : null;
export function resolveViewerSelectionSeed(
  state: ViewerSequenceState,
  outputId: string | null,
  current: GalleryViewerItemDto | null
): GalleryViewerItemDto | null {
  if (!outputId) return current;
  return viewerSequenceItems(state).find((item) => item.outputId === outputId) ?? current;
}

export function createViewerSequenceController(options: ViewerSequenceControllerOptions = {}) {
  const request = options.fetch ?? fetch;
  const endpoint = options.endpoint ?? '/api/library/viewer-sequence';
  const pageSize = options.pageSize ?? 100;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > maximumPageItems)
    throw new Error('Invalid viewer sequence page size.');
  let state = initialState();
  let controller: AbortController | null = null;
  let disposed = false;
  const publish = () => options.onState?.(state);
  const set = (next: ViewerSequenceState) => {
    state = next;
    publish();
  };
  const current = (generation: number) => !disposed && state.generation === generation;
  const abort = () => {
    controller?.abort();
    controller = null;
  };

  async function load(
    filters: ViewerSequenceFilters,
    selectedSeed: () => GalleryViewerItemDto | null = () => state.overlay
  ): Promise<ViewerSequenceResult> {
    abort();
    const generation = state.generation + 1;
    controller = new AbortController();
    const signal = controller.signal;
    set({ ...state, generation, updating: true, error: null });
    const building: GalleryViewerItemDto[] = [];
    const jobIds = new Set<string>();
    const outputIds = new Set<string>();
    let cursor: string | null = null;
    let snapshot: string | null = null;
    let initialTotal: number | null = null;
    const cursors = new Set<string>();
    try {
      for (;;) {
        if (signal.aborted || !current(generation)) return { type: 'error', error: 'aborted' };
        const params = viewerSequenceSearchParams(filters);
        params.set('limit', String(pageSize));
        if (cursor && snapshot) {
          params.set('cursor', cursor);
          params.set('snapshot', snapshot);
        }
        const response = await request(`${endpoint}?${params}`, { signal });
        if (signal.aborted || !current(generation)) return { type: 'error', error: 'aborted' };
        if (response.status === 409) {
          set({ ...state, updating: false, error: 'changed' });
          return { type: 'changed' };
        }
        if (!response.ok) return { type: 'error', error: 'request_failed' };
        const page = parseViewerSequencePage(await response.json());
        if (signal.aborted || !current(generation)) return { type: 'error', error: 'aborted' };
        if (!page || (snapshot !== null && page.snapshot !== snapshot))
          return { type: 'error', error: 'invalid_page' };
        if (initialTotal === null) {
          if (page.total === null) return { type: 'error', error: 'invalid_page' };
          initialTotal = page.total;
          snapshot = page.snapshot;
        } else if (page.total !== null && page.nextCursor !== null)
          return { type: 'error', error: 'invalid_page' };
        for (const item of page.items) {
          const previous = building.at(-1);
          if (
            jobIds.has(item.jobId) ||
            outputIds.has(item.outputId) ||
            (previous && compare(previous, item) >= 0)
          )
            return { type: 'error', error: 'invalid_page' };
          jobIds.add(item.jobId);
          outputIds.add(item.outputId);
          building.push(item);
        }
        if (page.nextCursor !== null) {
          if (page.items.length === 0 || cursors.has(page.nextCursor))
            return { type: 'error', error: 'invalid_page' };
          cursors.add(page.nextCursor);
          cursor = page.nextCursor;
          continue;
        }
        if (page.total === null || page.total !== initialTotal || building.length !== initialTotal)
          return { type: 'error', error: 'invalid_page' };
        if (!current(generation)) return { type: 'error', error: 'aborted' };
        set({
          ...state,
          items: building,
          total: initialTotal,
          complete: true,
          updating: false,
          error: null,
          overlay: selectedOverlay(building, selectedSeed())
        });
        controller = null;
        return { type: 'complete', items: building, total: initialTotal };
      }
    } catch (error) {
      if (
        signal.aborted ||
        !current(generation) ||
        (error instanceof DOMException && error.name === 'AbortError')
      )
        return { type: 'error', error: 'aborted' };
      return { type: 'error', error: 'request_failed' };
    } finally {
      if (current(generation) && (signal.aborted || state.updating)) {
        const result = signal.aborted ? 'aborted' : 'request_failed';
        set({ ...state, updating: false, error: result });
      }
    }
  }

  return {
    get state(): ViewerSequenceState {
      return state;
    },
    load,
    abort,
    remove(outputId: string): void {
      const items = state.items.filter((item) => item.outputId !== outputId);
      const overlay = state.overlay?.outputId === outputId ? null : state.overlay;
      set({ ...state, items, total: Math.min(state.total, items.length), overlay });
    },
    setOverlay(item: GalleryViewerItemDto | null): void {
      set({ ...state, overlay: selectedOverlay(state.items, item) });
    },
    reset(): void {
      abort();
      set({ ...initialState(), generation: state.generation + 1 });
    },
    dispose(): void {
      abort();
      disposed = true;
      state = { ...initialState(), generation: state.generation + 1 };
      publish();
    }
  };
}

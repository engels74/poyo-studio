import type { ElementToken, MediaKind } from './viewer-transform';

export interface BoundSnapshot {
  open: boolean;
  renderable: boolean;
  outputId: string | null;
  mediaKind?: MediaKind;
}
export interface LiveIdentity {
  generation: number;
  outputId: string;
  mediaKind: MediaKind;
  attachedToken?: ElementToken;
}
export interface ViewerLifecycleState {
  committed: BoundSnapshot;
  nextGeneration: number;
  endedGeneration: number | null;
  expectedBoundSnapshot?: BoundSnapshot;
  live?: LiveIdentity;
}
export type ViewerLifecycleCommand =
  | { type: 'PAUSE_MEDIA'; generation: number; outputId: string; token: ElementToken }
  | { type: 'END_SESSION'; generation: number; outputId: string }
  | { type: 'CANCEL_ASYNC'; generation: number }
  | { type: 'RELEASE_CAPTURES'; generation: number }
  | { type: 'CLEAR_MEDIA_REGISTRATION'; generation: number; outputId: string; token?: ElementToken }
  | { type: 'BEGIN_ITEM'; generation: number; outputId: string; mediaKind: MediaKind }
  | { type: 'WRITE_SELECTED_OUTPUT'; outputId: string }
  | { type: 'WRITE_OPEN_FALSE' };
export interface LifecycleResult {
  state: ViewerLifecycleState;
  commands: ViewerLifecycleCommand[];
}
export type ViewerLifecycleEvent =
  | { type: 'SYNC_SNAPSHOT'; snapshot: BoundSnapshot }
  | { type: 'REQUEST_SELECTION'; outputId: string; mediaKind: MediaKind }
  | { type: 'REQUEST_CLOSE'; reason: 'button' | 'escape' | 'outside' }
  | { type: 'UNMOUNT' }
  | {
      type: 'REGISTER_MEDIA_ATTACHMENT';
      generation: number;
      outputId: string;
      mediaKind: MediaKind;
      token: ElementToken;
    }
  | {
      type: 'UNREGISTER_MEDIA_ATTACHMENT';
      generation: number;
      outputId: string;
      token: ElementToken;
    };

export const initialViewerLifecycleState = (
  snapshot: BoundSnapshot = { open: false, renderable: false, outputId: null }
): ViewerLifecycleState => ({ committed: snapshot, nextGeneration: 1, endedGeneration: null });
const liveFor = (
  snapshot: BoundSnapshot
): snapshot is BoundSnapshot & { outputId: string; mediaKind: MediaKind } =>
  snapshot.open && snapshot.renderable && !!snapshot.outputId && !!snapshot.mediaKind;
const sameSnapshot = (left: BoundSnapshot, right: BoundSnapshot): boolean =>
  left.open === right.open &&
  left.renderable === right.renderable &&
  left.outputId === right.outputId &&
  left.mediaKind === right.mediaKind;
const endLive = (state: ViewerLifecycleState): LifecycleResult => {
  if (!state.live) return { state, commands: [] };
  const live = state.live;
  const commands: ViewerLifecycleCommand[] = [];
  if (live.mediaKind === 'video' && live.attachedToken)
    commands.push({
      type: 'PAUSE_MEDIA',
      generation: live.generation,
      outputId: live.outputId,
      token: live.attachedToken
    });
  commands.push(
    { type: 'END_SESSION', generation: live.generation, outputId: live.outputId },
    { type: 'CANCEL_ASYNC', generation: live.generation },
    { type: 'RELEASE_CAPTURES', generation: live.generation },
    {
      type: 'CLEAR_MEDIA_REGISTRATION',
      generation: live.generation,
      outputId: live.outputId,
      ...(live.attachedToken ? { token: live.attachedToken } : {})
    }
  );
  const { live: _live, ...withoutLive } = state;
  return { state: { ...withoutLive, endedGeneration: live.generation }, commands };
};
const begin = (state: ViewerLifecycleState, snapshot: BoundSnapshot): LifecycleResult => {
  if (!liveFor(snapshot)) return { state, commands: [] };
  const generation = state.nextGeneration;
  const live: LiveIdentity = {
    generation,
    outputId: snapshot.outputId,
    mediaKind: snapshot.mediaKind
  };
  return {
    state: { ...state, live, nextGeneration: generation + 1 },
    commands: [
      { type: 'BEGIN_ITEM', generation, outputId: live.outputId, mediaKind: live.mediaKind }
    ]
  };
};
const append = (first: LifecycleResult, second: LifecycleResult): LifecycleResult => ({
  state: second.state,
  commands: [...first.commands, ...second.commands]
});
const endThenBegin = (state: ViewerLifecycleState, snapshot: BoundSnapshot): LifecycleResult => {
  const ended = endLive(state);
  return append(ended, begin(ended.state, snapshot));
};

/** Coordinates controlled binding edges. Commands are executed synchronously in listed order. */
export const reduceViewerLifecycle = (
  state: ViewerLifecycleState,
  event: ViewerLifecycleEvent
): LifecycleResult => {
  if (event.type === 'REGISTER_MEDIA_ATTACHMENT') {
    const live = state.live;
    if (
      !live ||
      live.generation !== event.generation ||
      live.outputId !== event.outputId ||
      live.mediaKind !== event.mediaKind
    )
      return { state, commands: [] };
    if (live.attachedToken && live.attachedToken !== event.token) return { state, commands: [] };
    return {
      state: live.attachedToken
        ? state
        : { ...state, live: { ...live, attachedToken: event.token } },
      commands: []
    };
  }
  if (event.type === 'UNREGISTER_MEDIA_ATTACHMENT') {
    const live = state.live;
    if (
      !live ||
      live.generation !== event.generation ||
      live.outputId !== event.outputId ||
      live.attachedToken !== event.token
    )
      return { state, commands: [] };
    const { attachedToken: _attachedToken, ...withoutToken } = live;
    return { state: { ...state, live: withoutToken }, commands: [] };
  }
  if (event.type === 'UNMOUNT') {
    const { expectedBoundSnapshot: _expectedBoundSnapshot, ...withoutExpectation } = state;
    return endLive(withoutExpectation);
  }
  if (event.type === 'REQUEST_CLOSE') {
    const ended = endLive(state);
    return {
      state: {
        ...ended.state,
        committed: { ...ended.state.committed, open: false },
        expectedBoundSnapshot: { open: false, renderable: false, outputId: null }
      },
      commands: [...ended.commands, { type: 'WRITE_OPEN_FALSE' }]
    };
  }
  if (event.type === 'REQUEST_SELECTION') {
    const destination: BoundSnapshot = {
      open: true,
      renderable: true,
      outputId: event.outputId,
      mediaKind: event.mediaKind
    };
    const transition = endThenBegin(state, destination);
    return {
      state: { ...transition.state, expectedBoundSnapshot: destination },
      commands: [
        ...transition.commands,
        { type: 'WRITE_SELECTED_OUTPUT', outputId: event.outputId }
      ]
    };
  }

  const snapshot = event.snapshot;
  if (state.expectedBoundSnapshot && sameSnapshot(state.expectedBoundSnapshot, snapshot)) {
    const { expectedBoundSnapshot: _expectedBoundSnapshot, ...withoutExpectation } = state;
    return { state: { ...withoutExpectation, committed: snapshot }, commands: [] };
  }
  const { expectedBoundSnapshot: _expectedBoundSnapshot, ...withSnapshot } = state;
  withSnapshot.committed = snapshot;
  const live = withSnapshot.live;
  if (
    live &&
    liveFor(snapshot) &&
    live.outputId === snapshot.outputId &&
    live.mediaKind === snapshot.mediaKind
  )
    return { state: withSnapshot, commands: [] };
  if (!liveFor(snapshot)) {
    const ended = endLive(withSnapshot);
    const invalidOpen = snapshot.open && !snapshot.renderable;
    return {
      state: invalidOpen
        ? {
            ...ended.state,
            expectedBoundSnapshot: { open: false, renderable: false, outputId: null }
          }
        : ended.state,
      commands: invalidOpen ? [...ended.commands, { type: 'WRITE_OPEN_FALSE' }] : ended.commands
    };
  }
  return endThenBegin(withSnapshot, snapshot);
};

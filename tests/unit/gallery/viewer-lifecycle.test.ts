import { describe, expect, test } from 'bun:test';
import {
  type BoundSnapshot,
  initialViewerLifecycleState,
  reduceViewerLifecycle,
  type ViewerLifecycleCommand,
  type ViewerLifecycleState
} from '../../../src/lib/features/gallery/viewer-lifecycle';
import { elementToken } from '../../../src/lib/features/gallery/viewer-transform';

const image: BoundSnapshot = {
  open: true,
  renderable: true,
  outputId: 'image',
  mediaKind: 'image'
};
const video: BoundSnapshot = {
  open: true,
  renderable: true,
  outputId: 'video',
  mediaKind: 'video'
};
const closed: BoundSnapshot = { open: false, renderable: false, outputId: null };
const invalidVideo: BoundSnapshot = {
  open: true,
  renderable: false,
  outputId: 'video',
  mediaKind: 'video'
};
const step = (state: ViewerLifecycleState, event: Parameters<typeof reduceViewerLifecycle>[1]) =>
  reduceViewerLifecycle(state, event);

const registeredVideo = (token = elementToken('video-token')) => {
  let result = step(initialViewerLifecycleState(), { type: 'SYNC_SNAPSHOT', snapshot: video });
  result = step(result.state, {
    type: 'REGISTER_MEDIA_ATTACHMENT',
    generation: 1,
    outputId: 'video',
    mediaKind: 'video',
    token
  });
  return { state: result.state, token };
};

const orderedVideoTeardown = (token: ReturnType<typeof elementToken>): ViewerLifecycleCommand[] => [
  { type: 'PAUSE_MEDIA', generation: 1, outputId: 'video', token },
  { type: 'END_SESSION', generation: 1, outputId: 'video' },
  { type: 'CANCEL_ASYNC', generation: 1 },
  { type: 'RELEASE_CAPTURES', generation: 1 },
  { type: 'CLEAR_MEDIA_REGISTRATION', generation: 1, outputId: 'video', token }
];

describe('viewer lifecycle generation and binding edges', () => {
  test('begins once for an external open and matching acknowledgement is inert', () => {
    let result = step(initialViewerLifecycleState(), { type: 'SYNC_SNAPSHOT', snapshot: image });
    expect(result.commands).toEqual([
      { type: 'BEGIN_ITEM', generation: 1, outputId: 'image', mediaKind: 'image' }
    ]);
    result = step(result.state, { type: 'SYNC_SNAPSHOT', snapshot: image });
    expect(result.commands).toEqual([]);
  });

  test('internal selection ends old session before one new BEGIN and acknowledgement does not duplicate it', () => {
    let result = step(initialViewerLifecycleState(), { type: 'SYNC_SNAPSHOT', snapshot: image });
    result = step(result.state, {
      type: 'REQUEST_SELECTION',
      outputId: 'video',
      mediaKind: 'video'
    });
    expect(result.commands.map((command) => command.type)).toEqual([
      'END_SESSION',
      'CANCEL_ASYNC',
      'RELEASE_CAPTURES',
      'CLEAR_MEDIA_REGISTRATION',
      'BEGIN_ITEM',
      'WRITE_SELECTED_OUTPUT'
    ]);
    expect(result.commands).toContainEqual({
      type: 'BEGIN_ITEM',
      generation: 2,
      outputId: 'video',
      mediaKind: 'video'
    });
    result = step(result.state, { type: 'SYNC_SNAPSHOT', snapshot: video });
    expect(result.commands).toEqual([]);
  });

  test('uses the full video teardown order for every close, invalidation, and unmount edge', () => {
    const cases: Array<{
      name: string;
      event: Parameters<typeof reduceViewerLifecycle>[1];
      trailingCommand?: { type: 'WRITE_OPEN_FALSE' };
    }> = [
      {
        name: 'button close',
        event: { type: 'REQUEST_CLOSE', reason: 'button' },
        trailingCommand: { type: 'WRITE_OPEN_FALSE' }
      },
      {
        name: 'escape close',
        event: { type: 'REQUEST_CLOSE', reason: 'escape' },
        trailingCommand: { type: 'WRITE_OPEN_FALSE' }
      },
      {
        name: 'outside close',
        event: { type: 'REQUEST_CLOSE', reason: 'outside' },
        trailingCommand: { type: 'WRITE_OPEN_FALSE' }
      },
      { name: 'external parent false', event: { type: 'SYNC_SNAPSHOT', snapshot: closed } },
      {
        name: 'invalid renderability',
        event: { type: 'SYNC_SNAPSHOT', snapshot: invalidVideo },
        trailingCommand: { type: 'WRITE_OPEN_FALSE' }
      },
      { name: 'unmount', event: { type: 'UNMOUNT' } }
    ];

    for (const closeCase of cases) {
      const { state, token } = registeredVideo(elementToken(closeCase.name));
      const result = step(state, closeCase.event);
      expect(result.commands, closeCase.name).toEqual([
        ...orderedVideoTeardown(token),
        ...(closeCase.trailingCommand ? [closeCase.trailingCommand] : [])
      ]);
      expect(result.state.live, closeCase.name).toBeUndefined();
      expect(result.state.endedGeneration, closeCase.name).toBe(1);
    }
  });

  test('invalidates state before commands can reenter and ends a generation only once', () => {
    const { state, token } = registeredVideo();
    const closedResult = step(state, { type: 'REQUEST_CLOSE', reason: 'escape' });

    expect(closedResult.state.live).toBeUndefined();
    expect(closedResult.commands).toEqual([
      ...orderedVideoTeardown(token),
      { type: 'WRITE_OPEN_FALSE' }
    ]);

    const reentrantEvents: Parameters<typeof reduceViewerLifecycle>[1][] = [
      { type: 'REQUEST_CLOSE', reason: 'outside' },
      { type: 'SYNC_SNAPSHOT', snapshot: closed },
      { type: 'UNMOUNT' },
      {
        type: 'UNREGISTER_MEDIA_ATTACHMENT',
        generation: 1,
        outputId: 'video',
        token
      }
    ];
    for (const event of reentrantEvents) {
      const reentrant = step(closedResult.state, event);
      expect(
        reentrant.commands.map((command) => command.type),
        event.type
      ).not.toContain('END_SESSION');
    }
    expect(step(closedResult.state, { type: 'REQUEST_CLOSE', reason: 'button' }).commands).toEqual([
      { type: 'WRITE_OPEN_FALSE' }
    ]);
  });

  test('rejects stale tokens after a new generation begins', () => {
    const first = elementToken('first');
    const second = elementToken('second');
    const { state } = registeredVideo(first);
    let result = step(state, { type: 'SYNC_SNAPSHOT', snapshot: closed });
    result = step(result.state, { type: 'SYNC_SNAPSHOT', snapshot: video });

    expect(result.state.live).toMatchObject({ generation: 2, outputId: 'video' });
    for (const event of [
      {
        type: 'REGISTER_MEDIA_ATTACHMENT' as const,
        generation: 1,
        outputId: 'video',
        mediaKind: 'video' as const,
        token: first
      },
      {
        type: 'UNREGISTER_MEDIA_ATTACHMENT' as const,
        generation: 1,
        outputId: 'video',
        token: first
      }
    ]) {
      expect(step(result.state, event).state).toEqual(result.state);
    }
    result = step(result.state, {
      type: 'REGISTER_MEDIA_ATTACHMENT',
      generation: 2,
      outputId: 'video',
      mediaKind: 'video',
      token: second
    });
    expect(result.state.live?.attachedToken).toBe(second);
    const replacement = elementToken('replacement');
    expect(
      step(result.state, {
        type: 'REGISTER_MEDIA_ATTACHMENT',
        generation: 2,
        outputId: 'video',
        mediaKind: 'video',
        token: replacement
      }).state
    ).toEqual(result.state);
  });

  test('treats an expected snapshot mismatch as external truth and starts the actual destination', () => {
    let result = step(initialViewerLifecycleState(), { type: 'SYNC_SNAPSHOT', snapshot: image });
    result = step(result.state, {
      type: 'REQUEST_SELECTION',
      outputId: 'video',
      mediaKind: 'video'
    });
    result = step(result.state, { type: 'SYNC_SNAPSHOT', snapshot: image });
    expect(result.commands.map((command) => command.type)).toEqual([
      'END_SESSION',
      'CANCEL_ASYNC',
      'RELEASE_CAPTURES',
      'CLEAR_MEDIA_REGISTRATION',
      'BEGIN_ITEM'
    ]);
    expect(result.commands).toContainEqual({
      type: 'BEGIN_ITEM',
      generation: 3,
      outputId: 'image',
      mediaKind: 'image'
    });
  });
});

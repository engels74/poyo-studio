import { describe, expect, test } from 'bun:test';
import {
  actualTransform,
  contain,
  elementToken,
  endedSession,
  focalZoom,
  type Geometry,
  normalizeWheelDelta,
  type Point,
  panTransform,
  type ReadyImageSession,
  reduceViewerTransform,
  resizeTransform,
  type ViewerSession,
  wheelZoomFactor,
  zoomBounds
} from '../../../src/lib/features/gallery/viewer-transform';

const token = elementToken('one');
function requiredGeometry(value: Geometry | undefined): Geometry {
  if (!value) throw new Error('Expected valid viewer geometry');
  return value;
}
const geometry = requiredGeometry(
  contain({ width: 400, height: 200 }, { width: 200, height: 200 })
);
const ready = (): ReadyImageSession => {
  let state = reduceViewerTransform(endedSession(), {
    type: 'BEGIN',
    generation: 1,
    outputId: 'image',
    mediaKind: 'image'
  });
  state = reduceViewerTransform(state, {
    type: 'ATTACH_ELEMENT',
    generation: 1,
    outputId: 'image',
    mediaKind: 'image',
    token
  });
  return reduceViewerTransform(state, {
    type: 'MEDIA_READY',
    generation: 1,
    outputId: 'image',
    mediaKind: 'image',
    token,
    intrinsic: { width: 400, height: 200 },
    viewport: { width: 200, height: 200 }
  }) as ReadyImageSession;
};

describe('viewer transform geometry', () => {
  test('contains, computes exact Actual bounds, and rejects malformed geometry', () => {
    expect(geometry.fitted).toEqual({ width: 200, height: 100 });
    expect(zoomBounds(geometry)).toEqual({ min: 0.5, max: 8, actual: 2 });
    expect(actualTransform(geometry).zoom).toBe(2);
    expect(contain({ width: 0, height: 1 }, { width: 1, height: 1 })).toBeUndefined();
  });

  test('keeps a focal source point stable and clamps pan', () => {
    const bounds = zoomBounds(geometry);
    const zoomed = focalZoom(geometry, bounds, { zoom: 1, x: 0, y: 0 }, { x: 20, y: 100 }, 2);
    expect(zoomed.zoom).toBe(2);
    expect(zoomed.x).toBeCloseTo(-20);
    expect(zoomed.y).toBeCloseTo(0);
    const panned = panTransform(geometry, bounds, zoomed, { x: 999, y: 999 });
    expect(panned.zoom).toBe(2);
    expect(panned.x).toBeCloseTo(100);
    expect(panned.y).toBeCloseTo(0);
  });

  test('preserves source fractions on custom and actual resize while Fit recenters', () => {
    const next = requiredGeometry(
      contain({ width: 400, height: 200 }, { width: 300, height: 200 })
    );
    const bounds = zoomBounds(next);
    expect(resizeTransform(geometry, next, bounds, 'fit', { zoom: 1, x: 20, y: 10 })).toEqual({
      zoom: 1,
      x: 0,
      y: 0
    });
    const resized = resizeTransform(geometry, next, bounds, 'custom', { zoom: 2, x: -40, y: 0 });
    expect(resized.zoom).toBe(2);
    expect(resized.x).toBeCloseTo(-60);
    expect(resized.y).toBeCloseTo(0);
    expect(resizeTransform(geometry, next, bounds, 'actual', { zoom: 2, x: -40, y: 0 }).zoom).toBe(
      4 / 3
    );
  });

  test('normalizes wheel delta modes, signs, and per-event cap', () => {
    expect(normalizeWheelDelta(2, 0, 100)).toBe(2);
    expect(normalizeWheelDelta(2, 1, 100)).toBe(32);
    expect(normalizeWheelDelta(2, 2, 100)).toBe(200);
    expect(normalizeWheelDelta(2, 2, 0)).toBeUndefined();
    expect(wheelZoomFactor(-10_000)).toBe(1.25);
    expect(wheelZoomFactor(10_000)).toBe(1 / 1.25);
  });
});

describe('viewer transform session and pointer recovery', () => {
  test('requires an attached token for Ready and ignores stale events after END', () => {
    let state = reduceViewerTransform(endedSession(), {
      type: 'BEGIN',
      generation: 1,
      outputId: 'image',
      mediaKind: 'image'
    });
    state = reduceViewerTransform(state, {
      type: 'MEDIA_READY',
      generation: 1,
      outputId: 'image',
      mediaKind: 'image',
      token,
      intrinsic: { width: 1, height: 1 },
      viewport: { width: 1, height: 1 }
    });
    expect(state.status).toBe('loading');
    state = reduceViewerTransform(state, { type: 'END', generation: 1 });
    expect(
      reduceViewerTransform(state, {
        type: 'MEDIA_ERROR',
        generation: 1,
        outputId: 'image',
        mediaKind: 'image',
        token,
        reason: 'late'
      })
    ).toEqual(state);
  });

  test('keeps Ready through transient zero layout and resets a new item to loading', () => {
    let state: ViewerSession = ready();
    state = reduceViewerTransform(state, {
      type: 'RECONCILE_VIEWPORT',
      generation: 1,
      viewport: { width: 0, height: 0 }
    });
    expect(state.status).toBe('ready-image');
    expect((state as ReadyImageSession).pendingLayout).toBe(true);
    state = reduceViewerTransform(state, {
      type: 'BEGIN',
      generation: 2,
      outputId: 'next',
      mediaKind: 'image'
    });
    expect(state).toMatchObject({ status: 'loading', generation: 2, outputId: 'next' });
  });

  test('uses expected capture loss on resize and blocks abnormal capture loss', () => {
    let state: ViewerSession = reduceViewerTransform(ready(), {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 3,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: 0, y: 0 },
        at: 1
      }
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'CAPTURE_SUCCEEDED',
      generation: 1,
      pointerId: 3,
      captureSerial: 4,
      interactionEpoch: 0
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'PREPARE_VIEWPORT_RESIZE',
      generation: 1
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).interactionEpoch).toBe(1);
    expect((state as ReadyImageSession).expectedCaptureLoss).toEqual([
      { generation: 1, pointerId: 3, captureSerial: 4, interactionEpoch: 0 }
    ]);
    state = reduceViewerTransform(state, {
      type: 'PREPARE_VIEWPORT_RESIZE',
      generation: 1
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).interactionEpoch).toBe(2);
    expect((state as ReadyImageSession).blocked).toEqual([{ pointerId: 3, pointerType: 'mouse' }]);
    expect((state as ReadyImageSession).expectedCaptureLoss).toEqual([
      { generation: 1, pointerId: 3, captureSerial: 4, interactionEpoch: 0 }
    ]);
    state = reduceViewerTransform(state, {
      type: 'LOST_POINTER_CAPTURE',
      generation: 1,
      pointerId: 3,
      captureSerial: 4,
      interactionEpoch: 0
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).expectedCaptureLoss).toEqual([]);
    state = reduceViewerTransform(state, {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 4,
        pointerType: 'mouse',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: 0, y: 0 },
        at: 1
      }
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'CAPTURE_SUCCEEDED',
      generation: 1,
      pointerId: 4,
      captureSerial: 9,
      interactionEpoch: 3
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'LOST_POINTER_CAPTURE',
      generation: 1,
      pointerId: 4,
      captureSerial: 9,
      interactionEpoch: 3
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).blocked).toEqual([{ pointerId: 4, pointerType: 'mouse' }]);
  });

  test('preserves multiple exact capture losses and consumes out-of-order identities independently', () => {
    let state = reduceViewerTransform(ready(), {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 10,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: -10, y: 0 },
        at: 0
      }
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'CAPTURE_SUCCEEDED',
      generation: 1,
      pointerId: 10,
      captureSerial: 100,
      interactionEpoch: 0
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 11,
        pointerType: 'touch',
        isPrimary: false,
        button: 0,
        buttons: 1,
        point: { x: 10, y: 0 },
        at: 1
      }
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'CAPTURE_SUCCEEDED',
      generation: 1,
      pointerId: 11,
      captureSerial: 101,
      interactionEpoch: 0
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'PREPARE_VIEWPORT_RESIZE',
      generation: 1
    }) as ReadyImageSession;
    expect(state.blocked).toEqual([
      { pointerId: 10, pointerType: 'touch' },
      { pointerId: 11, pointerType: 'touch' }
    ]);
    expect(state.expectedCaptureLoss).toHaveLength(2);
    state = reduceViewerTransform(state, {
      type: 'LOST_POINTER_CAPTURE',
      generation: 1,
      pointerId: 11,
      captureSerial: 101,
      interactionEpoch: 0
    }) as ReadyImageSession;
    expect(state.expectedCaptureLoss).toEqual([
      { generation: 1, pointerId: 10, captureSerial: 100, interactionEpoch: 0 }
    ]);

    state = {
      ...state,
      expectedCaptureLoss: [
        ...state.expectedCaptureLoss,
        { generation: 1, pointerId: 10, captureSerial: 102, interactionEpoch: 0 }
      ]
    };
    state = reduceViewerTransform(state, {
      type: 'LOST_POINTER_CAPTURE',
      generation: 1,
      pointerId: 10,
      captureSerial: 102,
      interactionEpoch: 0
    }) as ReadyImageSession;
    expect(state.expectedCaptureLoss).toEqual([
      { generation: 1, pointerId: 10, captureSerial: 100, interactionEpoch: 0 }
    ]);
    state = reduceViewerTransform(state, {
      type: 'LOST_POINTER_CAPTURE',
      generation: 1,
      pointerId: 10,
      captureSerial: 100,
      interactionEpoch: 0
    }) as ReadyImageSession;
    expect(state.expectedCaptureLoss).toEqual([]);
  });

  test('rejects malformed pointer input and recovers with a fresh eligible primary down', () => {
    let state: ViewerSession = reduceViewerTransform(ready(), {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 1,
        pointerType: 'pen',
        isPrimary: false,
        button: 0,
        buttons: 1,
        point: { x: 0, y: 0 },
        at: 0
      }
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).pointers).toEqual([]);
    state = reduceViewerTransform(state, {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: 0, y: 0 },
        at: 0
      }
    }) as ReadyImageSession;
    state = reduceViewerTransform(state, {
      type: 'POINTER_MOVE',
      pointerId: 2,
      buttons: 2,
      point: { x: 1, y: 1 }
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).blocked).toEqual([{ pointerId: 2, pointerType: 'touch' }]);
    state = reduceViewerTransform(state, {
      type: 'POINTER_DOWN',
      input: {
        pointerId: 2,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: 2, y: 2 },
        at: 2
      }
    }) as ReadyImageSession;
    expect((state as ReadyImageSession).pointers).toHaveLength(1);
  });
});
test('uses immutable baselines for pan and pinch focal math', () => {
  let state = reduceViewerTransform(ready(), {
    type: 'ZOOM',
    zoom: 2,
    anchor: { x: 0, y: 0 }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: -20, y: 0 },
      at: 0
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 1,
    buttons: 1,
    point: { x: 20, y: 0 }
  }) as ReadyImageSession;
  expect(state.transform.x).toBeCloseTo(40);
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      buttons: 1,
      point: { x: 60, y: 0 },
      at: 10
    }
  }) as ReadyImageSession;
  const sourceAtPinchStart: Point = {
    x: (40 - state.transform.x) / state.transform.zoom,
    y: 0
  };
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 2,
    buttons: 1,
    point: { x: 80, y: 0 }
  }) as ReadyImageSession;
  expect(state.pointers[0]?.start).toEqual({ x: -20, y: 0 });
  expect(state.transform.zoom).toBeCloseTo(3);
  expect((50 - state.transform.x) / state.transform.zoom).toBeCloseTo(sourceAtPinchStart.x);
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 1,
    buttons: 1,
    point: { x: 0, y: 0 }
  }) as ReadyImageSession;
  expect(state.transform.zoom).toBeCloseTo(4);
  expect((40 - state.transform.x) / state.transform.zoom).toBeCloseTo(sourceAtPinchStart.x);
});

test('qualifies touch double taps exactly once and suppresses its native click', () => {
  let state: ViewerSession = ready();
  for (const [pointerId, at] of [
    [1, 0],
    [2, 200]
  ] as const) {
    state = reduceViewerTransform(state, {
      type: 'POINTER_DOWN',
      input: {
        pointerId,
        pointerType: 'touch',
        isPrimary: true,
        button: 0,
        buttons: 1,
        point: { x: 0, y: 0 },
        at
      }
    });
    state = reduceViewerTransform(state, {
      type: 'POINTER_UP',
      pointerId,
      point: { x: 0, y: 0 },
      at: at + 100
    });
  }
  expect((state as ReadyImageSession).mode).toBe('custom');
  const zoom = (state as ReadyImageSession).transform.zoom;
  state = reduceViewerTransform(state, {
    type: 'DOUBLE_CLICK',
    point: { x: 0, y: 0 },
    at: 301
  });
  expect((state as ReadyImageSession).transform.zoom).toBe(zoom);
  state = reduceViewerTransform(state, {
    type: 'DOUBLE_CLICK',
    point: { x: 0, y: 0 },
    at: 801
  });
  expect((state as ReadyImageSession).mode).toBe('fit');
});
test('blocks capture failure and accepts a fresh interaction', () => {
  let state = reduceViewerTransform(ready(), {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 7,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 0
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'CAPTURE_FAILED',
    generation: 1,
    pointerId: 7,
    captureSerial: 0,
    interactionEpoch: 0
  }) as ReadyImageSession;
  expect(state.blocked).toEqual([{ pointerId: 7, pointerType: 'mouse' }]);
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 8,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 1, y: 1 },
      at: 1
    }
  }) as ReadyImageSession;
  expect(state.pointers.map((pointer) => pointer.pointerId)).toEqual([8]);
  expect(state.interactionEpoch).toBe(1);
  expect(state.blocked).toEqual([]);
  state = reduceViewerTransform(state, {
    type: 'POINTER_CANCEL',
    generation: 1,
    pointerId: 7,
    captureSerial: 0,
    interactionEpoch: 0
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 8,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 1, y: 1 },
      at: 1
    }
  }) as ReadyImageSession;
  expect(state.pointers.map((pointer) => pointer.pointerId)).toEqual([8]);
  expect(state.blocked).toEqual([]);
});
test('keeps a sub-threshold press tappable but permanently revokes it after panning', () => {
  let state = reduceViewerTransform(ready(), {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 0
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 1,
    buttons: 1,
    point: { x: 6, y: 0 }
  }) as ReadyImageSession;
  expect(state.pointers[0]).toMatchObject({ phase: 'pressed', tapEligible: true });
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 1,
    buttons: 1,
    point: { x: 7, y: 0 }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_MOVE',
    pointerId: 1,
    buttons: 1,
    point: { x: 0, y: 0 }
  }) as ReadyImageSession;
  expect(state.pointers[0]).toMatchObject({ phase: 'panning', tapEligible: false });
  state = reduceViewerTransform(state, {
    type: 'POINTER_UP',
    pointerId: 1,
    point: { x: 0, y: 0 },
    at: 10
  }) as ReadyImageSession;
  expect(state.tap).toBeUndefined();
});

test('preserves Fit for no-op pan and blocks a pinch remainder', () => {
  let state = reduceViewerTransform(ready(), {
    type: 'PAN',
    delta: { x: 10, y: 10 }
  }) as ReadyImageSession;
  expect(state.mode).toBe('fit');
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 1,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 0
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 2,
      pointerType: 'touch',
      isPrimary: false,
      button: 0,
      buttons: 1,
      point: { x: 20, y: 0 },
      at: 1
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'POINTER_UP',
    pointerId: 2,
    point: { x: 20, y: 0 },
    at: 2
  }) as ReadyImageSession;
  expect(state.pointers).toEqual([]);
  expect(state.blocked).toEqual([{ pointerId: 1, pointerType: 'touch' }]);
});

test('requires local terminal and same-type primary recovery, and ignores stale capture loss', () => {
  let state = reduceViewerTransform(ready(), {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 4,
      pointerType: 'touch',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 0
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'CAPTURE_SUCCEEDED',
    generation: 1,
    pointerId: 4,
    captureSerial: 1,
    interactionEpoch: 0
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'PREPARE_VIEWPORT_RESIZE',
    generation: 1
  }) as ReadyImageSession;
  const reused = reduceViewerTransform(state, {
    type: 'LOST_POINTER_CAPTURE',
    generation: 1,
    pointerId: 4,
    captureSerial: 1,
    interactionEpoch: 1
  });
  expect(reused).toEqual(state);
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 5,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 1
    }
  }) as ReadyImageSession;
  expect(state.pointers).toEqual([]);
  state = reduceViewerTransform(state, {
    type: 'POINTER_CANCEL',
    generation: 1,
    pointerId: 4,
    captureSerial: 1,
    interactionEpoch: 0
  }) as ReadyImageSession;
  expect(state.blocked).toEqual([]);
  expect(state.blockedPointerType).toBeUndefined();
  expect(state.expectedCaptureLoss).toEqual([]);
  state = reduceViewerTransform(state, {
    type: 'POINTER_DOWN',
    input: {
      pointerId: 5,
      pointerType: 'mouse',
      isPrimary: true,
      button: 0,
      buttons: 1,
      point: { x: 0, y: 0 },
      at: 2
    }
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'CAPTURE_SUCCEEDED',
    generation: 1,
    pointerId: 5,
    captureSerial: 2,
    interactionEpoch: 1
  }) as ReadyImageSession;
  state = reduceViewerTransform(state, {
    type: 'LOST_POINTER_CAPTURE',
    generation: 1,
    pointerId: 4,
    captureSerial: 1,
    interactionEpoch: 0
  }) as ReadyImageSession;
  expect(state.pointers.map((pointer) => pointer.pointerId)).toEqual([5]);
});

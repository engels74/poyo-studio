export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 8;
export const DISCRETE_ZOOM_FACTOR = 1.25;
export const WHEEL_LINE_SIZE = 16;
export const WHEEL_RATE = 0.002;
export const KEYBOARD_PAN = 32;
export const KEYBOARD_PAN_FAST = 96;
export const DRAG_THRESHOLD = 6;
export const TAP_MAX_MS = 250;
export const DOUBLE_TAP_MAX_MS = 300;
export const DOUBLE_TAP_DISTANCE = 24;
export const DOUBLE_CLICK_SUPPRESSION_MS = 500;

export type MediaKind = 'image' | 'video';
export type ViewerMode = 'fit' | 'custom' | 'actual';
export type ElementToken = string & { readonly __elementToken: unique symbol };
export interface CssSize {
  width: number;
  height: number;
}
export interface Point {
  x: number;
  y: number;
}
export interface Transform {
  zoom: number;
  x: number;
  y: number;
}
export interface ZoomBounds {
  min: number;
  max: number;
  actual: number;
}
export interface Geometry {
  intrinsic: CssSize;
  viewport: CssSize;
  fitted: CssSize;
  containScale: number;
}
export interface CaptureIdentity {
  generation: number;
  pointerId: number;
  captureSerial: number;
  interactionEpoch: number;
}
export interface PointerRecord extends CaptureIdentity {
  pointerType: 'mouse' | 'touch' | 'pen';
  start: Point;
  current: Point;
  startedAt: number;
  captured: boolean;
  tapEligible: boolean;
  phase: 'pressed' | 'panning';
}
export interface TapRecord {
  point: Point;
  at: number;
}
interface GestureBaseline {
  transform: Transform;
  firstPointerId: number;
  secondPointerId?: number;
  centroid?: Point;
  distance?: number;
}

interface SessionBase {
  generation: number;
  outputId: string;
  mediaKind: MediaKind;
}
export interface LoadingSession extends SessionBase {
  status: 'loading';
  elementToken?: ElementToken;
  intrinsic?: CssSize;
  viewport?: CssSize;
}
export interface ReadyImageSession extends SessionBase {
  status: 'ready-image';
  mediaKind: 'image';
  elementToken: ElementToken;
  geometry: Geometry;
  bounds: ZoomBounds;
  mode: ViewerMode;
  transform: Transform;
  lastDetailZoom: number;
  pendingLayout: boolean;
  interactionEpoch: number;
  pointers: PointerRecord[];
  expectedCaptureLoss: CaptureIdentity[];
  blocked: Array<{ pointerId: number; pointerType: 'mouse' | 'touch' | 'pen' }>;
  blockedPointerType?: 'mouse' | 'touch' | 'pen';
  tap?: TapRecord;
  suppressNativeDoubleClickUntil: number;
  gesture?: GestureBaseline;
}
export interface ReadyVideoSession extends SessionBase {
  status: 'ready-video';
  mediaKind: 'video';
  elementToken: ElementToken;
  geometry: Geometry;
  pendingLayout: boolean;
}
export interface ErrorSession extends SessionBase {
  status: 'error';
  reason: string;
  elementToken?: ElementToken;
}
export interface EndedSession {
  status: 'ended';
  generation: number;
}
export type ViewerSession =
  | LoadingSession
  | ReadyImageSession
  | ReadyVideoSession
  | ErrorSession
  | EndedSession;

export const endedSession = (generation = 0): EndedSession => ({ status: 'ended', generation });
export const elementToken = (value: string): ElementToken => value as ElementToken;
export const finitePositive = (value: number): boolean => Number.isFinite(value) && value > 0;
export const validSize = (size: CssSize | undefined): size is CssSize =>
  !!size && finitePositive(size.width) && finitePositive(size.height);
export const clamp = (value: number, min: number, max: number): number =>
  Number.isFinite(value) ? Math.min(max, Math.max(min, value)) : min;
export const contain = (intrinsic: CssSize, viewport: CssSize): Geometry | undefined => {
  if (!validSize(intrinsic) || !validSize(viewport)) return undefined;
  const containScale = Math.min(
    viewport.width / intrinsic.width,
    viewport.height / intrinsic.height
  );
  if (!finitePositive(containScale)) return undefined;
  return {
    intrinsic,
    viewport,
    containScale,
    fitted: { width: intrinsic.width * containScale, height: intrinsic.height * containScale }
  };
};
export const zoomBounds = (geometry: Geometry): ZoomBounds => ({
  actual: 1 / geometry.containScale,
  min: Math.min(MIN_ZOOM, 1 / geometry.containScale),
  max: Math.max(MAX_ZOOM, 1 / geometry.containScale)
});
export const translationBounds = (geometry: Geometry, zoom: number): Point => ({
  x: Math.max(0, (geometry.fitted.width * zoom - geometry.viewport.width) / 2),
  y: Math.max(0, (geometry.fitted.height * zoom - geometry.viewport.height) / 2)
});
export const clampTransform = (
  geometry: Geometry,
  bounds: ZoomBounds,
  transform: Transform
): Transform => {
  const zoom = clamp(transform.zoom, bounds.min, bounds.max);
  const limit = translationBounds(geometry, zoom);
  return {
    zoom,
    x: clamp(transform.x, -limit.x, limit.x),
    y: clamp(transform.y, -limit.y, limit.y)
  };
};
export const actualTransform = (geometry: Geometry, bounds = zoomBounds(geometry)): Transform => ({
  zoom: bounds.actual,
  x: 0,
  y: 0
});
export const focalZoom = (
  geometry: Geometry,
  bounds: ZoomBounds,
  transform: Transform,
  anchor: Point,
  requestedZoom: number
): Transform => {
  if (
    ![transform.zoom, transform.x, transform.y, anchor.x, anchor.y, requestedZoom].every(
      Number.isFinite
    ) ||
    transform.zoom <= 0
  )
    return { zoom: 1, x: 0, y: 0 };
  const zoom = clamp(requestedZoom, bounds.min, bounds.max);
  return clampTransform(geometry, bounds, {
    zoom,
    x: anchor.x - ((anchor.x - transform.x) / transform.zoom) * zoom,
    y: anchor.y - ((anchor.y - transform.y) / transform.zoom) * zoom
  });
};
export const panTransform = (
  geometry: Geometry,
  bounds: ZoomBounds,
  transform: Transform,
  delta: Point
): Transform =>
  clampTransform(geometry, bounds, {
    ...transform,
    x: transform.x + delta.x,
    y: transform.y + delta.y
  });
export const normalizeWheelDelta = (
  deltaY: number,
  deltaMode: number,
  viewportHeight: number
): number | undefined => {
  if (!Number.isFinite(deltaY) || deltaY === 0) return undefined;
  if (deltaMode === 0) return deltaY;
  if (deltaMode === 1) return deltaY * WHEEL_LINE_SIZE;
  return deltaMode === 2 && finitePositive(viewportHeight) ? deltaY * viewportHeight : undefined;
};
export const wheelZoomFactor = (normalizedDelta: number): number | undefined => {
  if (!Number.isFinite(normalizedDelta) || normalizedDelta === 0) return undefined;
  return clamp(
    Math.exp(-normalizedDelta * WHEEL_RATE),
    1 / DISCRETE_ZOOM_FACTOR,
    DISCRETE_ZOOM_FACTOR
  );
};
export const sourceFractions = (geometry: Geometry, transform: Transform): Point | undefined => {
  if (!validSize(geometry.fitted) || !finitePositive(transform.zoom)) return undefined;
  return {
    x: 0.5 - transform.x / (geometry.fitted.width * transform.zoom),
    y: 0.5 - transform.y / (geometry.fitted.height * transform.zoom)
  };
};
export const resizeTransform = (
  oldGeometry: Geometry,
  nextGeometry: Geometry,
  bounds: ZoomBounds,
  mode: ViewerMode,
  transform: Transform
): Transform => {
  if (mode === 'fit') return { zoom: 1, x: 0, y: 0 };
  const fraction = sourceFractions(oldGeometry, transform);
  if (!fraction) return { zoom: 1, x: 0, y: 0 };
  const zoom = mode === 'actual' ? bounds.actual : clamp(transform.zoom, bounds.min, bounds.max);
  return clampTransform(nextGeometry, bounds, {
    zoom,
    x: (0.5 - fraction.x) * nextGeometry.fitted.width * zoom,
    y: (0.5 - fraction.y) * nextGeometry.fitted.height * zoom
  });
};

export type PointerInput = {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;
  button: number;
  buttons: number;
  point: Point;
  at: number;
};
export const eligibleFirstPointer = (
  input: PointerInput
): input is PointerInput & { pointerType: 'mouse' | 'touch' | 'pen' } =>
  (input.pointerType === 'mouse' || input.pointerType === 'touch' || input.pointerType === 'pen') &&
  input.isPrimary &&
  input.button === 0 &&
  input.buttons === 1;
export const eligibleSecondTouch = (first: PointerRecord, input: PointerInput): boolean =>
  first.pointerType === 'touch' &&
  input.pointerType === 'touch' &&
  first.pointerId !== input.pointerId &&
  input.button === 0 &&
  input.buttons === 1;

export type TransformAction =
  | { type: 'BEGIN'; generation: number; outputId: string; mediaKind: MediaKind }
  | { type: 'END'; generation: number }
  | {
      type: 'ATTACH_ELEMENT';
      generation: number;
      outputId: string;
      mediaKind: MediaKind;
      token: ElementToken;
    }
  | {
      type: 'MEDIA_READY';
      generation: number;
      outputId: string;
      mediaKind: MediaKind;
      token: ElementToken;
      intrinsic: CssSize;
      viewport: CssSize;
    }
  | {
      type: 'MEDIA_ERROR';
      generation: number;
      outputId: string;
      mediaKind: MediaKind;
      token?: ElementToken;
      reason: string;
    }
  | { type: 'PREPARE_VIEWPORT_RESIZE'; generation: number }
  | { type: 'RECONCILE_VIEWPORT'; generation: number; viewport: CssSize }
  | { type: 'FIT' }
  | { type: 'ACTUAL' }
  | { type: 'ZOOM'; zoom: number; anchor: Point }
  | { type: 'PAN'; delta: Point }
  | { type: 'POINTER_DOWN'; input: PointerInput }
  | {
      type: 'CAPTURE_SUCCEEDED';
      generation: number;
      pointerId: number;
      captureSerial: number;
      interactionEpoch: number;
    }
  | {
      type: 'CAPTURE_FAILED';
      generation: number;
      pointerId: number;
      captureSerial: number;
      interactionEpoch: number;
    }
  | { type: 'POINTER_MOVE'; pointerId: number; buttons: number; point: Point }
  | { type: 'POINTER_UP'; pointerId: number; point: Point; at: number }
  | {
      type: 'POINTER_CANCEL' | 'LOST_POINTER_CAPTURE';
      generation: number;
      pointerId: number;
      captureSerial: number;
      interactionEpoch: number;
    }
  | { type: 'DOUBLE_CLICK'; point: Point; at: number };

const sameLive = (
  session: ViewerSession,
  action: { generation: number; outputId: string; mediaKind: MediaKind; token?: ElementToken }
): boolean =>
  session.status !== 'ended' &&
  session.generation === action.generation &&
  session.outputId === action.outputId &&
  session.mediaKind === action.mediaKind &&
  (!action.token || ('elementToken' in session && session.elementToken === action.token));
const toBlocked = (session: ReadyImageSession, contacts = session.pointers): ReadyImageSession => {
  const next = { ...session };
  delete next.tap;
  delete next.gesture;
  const blocked = [...session.blocked];
  for (const { pointerId, pointerType } of contacts) {
    if (!blocked.some((candidate) => candidate.pointerId === pointerId))
      blocked.push({ pointerId, pointerType });
  }
  const pointerTypes = blocked.map(({ pointerType }) => pointerType);
  const blockedPointerType =
    pointerTypes.length > 0 && pointerTypes.every((pointerType) => pointerType === pointerTypes[0])
      ? pointerTypes[0]
      : pointerTypes.length === 0
        ? session.blockedPointerType
        : undefined;
  if (blockedPointerType) next.blockedPointerType = blockedPointerType;
  else delete next.blockedPointerType;
  return {
    ...next,
    pointers: [],
    expectedCaptureLoss: session.expectedCaptureLoss,
    blocked
  };
};
const clearBlockedContact = (session: ReadyImageSession, pointerId: number): ReadyImageSession => {
  const blocked = session.blocked.filter((pointer) => pointer.pointerId !== pointerId);
  if (blocked.length > 0) return { ...session, blocked };
  const idle = { ...session, blocked: [], expectedCaptureLoss: [] };
  delete idle.blockedPointerType;
  return idle;
};
const imageReady = (
  loading: LoadingSession,
  token: ElementToken,
  geometry: Geometry
): ReadyImageSession => {
  const bounds = zoomBounds(geometry);
  return {
    ...loading,
    status: 'ready-image',
    mediaKind: 'image',
    elementToken: token,
    geometry,
    bounds,
    mode: 'fit',
    transform: { zoom: 1, x: 0, y: 0 },
    lastDetailZoom: clamp(2, bounds.min, bounds.max),
    pendingLayout: false,
    interactionEpoch: 0,
    pointers: [],
    expectedCaptureLoss: [],
    blocked: [],
    suppressNativeDoubleClickUntil: 0
  };
};
const errorSession = (
  session: Exclude<ViewerSession, EndedSession>,
  reason: string
): ErrorSession => ({
  status: 'error',
  generation: session.generation,
  outputId: session.outputId,
  mediaKind: session.mediaKind,
  reason,
  ...('elementToken' in session && session.elementToken
    ? { elementToken: session.elementToken }
    : {})
});

export const reduceViewerTransform = (
  session: ViewerSession,
  action: TransformAction
): ViewerSession => {
  if (action.type === 'BEGIN')
    return {
      status: 'loading',
      generation: action.generation,
      outputId: action.outputId,
      mediaKind: action.mediaKind
    };
  if (action.type === 'END')
    return session.status !== 'ended' && session.generation === action.generation
      ? endedSession(action.generation)
      : session;
  if (action.type === 'ATTACH_ELEMENT')
    return session.status === 'loading' &&
      session.generation === action.generation &&
      session.outputId === action.outputId &&
      session.mediaKind === action.mediaKind &&
      !session.elementToken
      ? { ...session, elementToken: action.token }
      : session;
  if (action.type === 'MEDIA_ERROR')
    return session.status !== 'ended' && sameLive(session, action)
      ? errorSession(session, action.reason)
      : session;
  if (action.type === 'MEDIA_READY') {
    if (
      !sameLive(session, action) ||
      session.status !== 'loading' ||
      session.elementToken !== action.token
    )
      return session;
    if (!validSize(action.intrinsic)) return errorSession(session, 'Invalid intrinsic dimensions');
    if (!validSize(action.viewport))
      return { ...session, intrinsic: action.intrinsic, viewport: action.viewport };
    const geometry = contain(action.intrinsic, action.viewport);
    if (!geometry) return session;
    return session.mediaKind === 'image'
      ? imageReady(session, action.token, geometry)
      : {
          ...session,
          status: 'ready-video',
          mediaKind: 'video',
          elementToken: action.token,
          geometry,
          pendingLayout: false
        };
  }
  if (
    action.type === 'PREPARE_VIEWPORT_RESIZE' &&
    session.status === 'ready-image' &&
    session.generation === action.generation
  ) {
    const blocked = toBlocked(session);
    const expectedCaptureLoss = [...session.expectedCaptureLoss];
    for (const pointer of session.pointers) {
      if (
        pointer.captured &&
        !expectedCaptureLoss.some(
          (loss) =>
            loss.generation === pointer.generation &&
            loss.pointerId === pointer.pointerId &&
            loss.captureSerial === pointer.captureSerial &&
            loss.interactionEpoch === pointer.interactionEpoch
        )
      )
        expectedCaptureLoss.push({
          generation: pointer.generation,
          pointerId: pointer.pointerId,
          captureSerial: pointer.captureSerial,
          interactionEpoch: pointer.interactionEpoch
        });
    }
    return {
      ...blocked,
      interactionEpoch: session.interactionEpoch + 1,
      expectedCaptureLoss
    };
  }
  if (
    action.type === 'RECONCILE_VIEWPORT' &&
    session.status !== 'ended' &&
    session.generation === action.generation
  ) {
    if (!validSize(action.viewport)) {
      if (session.status === 'loading') return { ...session, viewport: action.viewport };
      return session.status === 'ready-image' || session.status === 'ready-video'
        ? { ...session, pendingLayout: true }
        : session;
    }
    if (session.status === 'loading') {
      if (!validSize(session.intrinsic) || !session.elementToken)
        return { ...session, viewport: action.viewport };
      const geometry = contain(session.intrinsic, action.viewport);
      return geometry
        ? session.mediaKind === 'image'
          ? imageReady(session, session.elementToken, geometry)
          : {
              ...session,
              status: 'ready-video',
              mediaKind: 'video',
              elementToken: session.elementToken,
              geometry,
              pendingLayout: false
            }
        : session;
    }
    if (session.status === 'ready-video') {
      const geometry = contain(session.geometry.intrinsic, action.viewport);
      return geometry ? { ...session, geometry, pendingLayout: false } : session;
    }
    if (session.status === 'ready-image') {
      const geometry = contain(session.geometry.intrinsic, action.viewport);
      if (!geometry) return session;
      const bounds = zoomBounds(geometry);
      return {
        ...session,
        geometry,
        bounds,
        transform: resizeTransform(
          session.geometry,
          geometry,
          bounds,
          session.mode,
          session.transform
        ),
        pendingLayout: false
      };
    }
  }
  if (session.status !== 'ready-image') return session;
  if (action.type === 'FIT') return { ...session, mode: 'fit', transform: { zoom: 1, x: 0, y: 0 } };
  if (action.type === 'ACTUAL')
    return {
      ...session,
      mode: 'actual',
      transform: actualTransform(session.geometry, session.bounds)
    };
  if (action.type === 'ZOOM') {
    const transform = focalZoom(
      session.geometry,
      session.bounds,
      session.transform,
      action.anchor,
      action.zoom
    );
    const mode = Math.abs(transform.zoom - 1) < 1e-9 ? 'fit' : 'custom';
    return {
      ...session,
      mode,
      transform,
      lastDetailZoom:
        mode === 'custom' && transform.zoom > 1 ? transform.zoom : session.lastDetailZoom
    };
  }
  if (action.type === 'PAN') {
    const transform = panTransform(
      session.geometry,
      session.bounds,
      session.transform,
      action.delta
    );
    const changed =
      transform.zoom !== session.transform.zoom ||
      transform.x !== session.transform.x ||
      transform.y !== session.transform.y;
    return {
      ...session,
      mode: changed && session.mode === 'fit' ? 'custom' : session.mode,
      transform
    };
  }
  const toggleDetail = (current: ReadyImageSession, point: Point): ReadyImageSession => {
    if (current.mode !== 'fit')
      return { ...current, mode: 'fit', transform: { zoom: 1, x: 0, y: 0 } };
    const transform = focalZoom(
      current.geometry,
      current.bounds,
      current.transform,
      point,
      current.lastDetailZoom
    );
    return { ...current, mode: 'custom', transform };
  };
  if (action.type === 'POINTER_DOWN') {
    const existing = session.pointers[0];
    const input = action.input;
    const eligible = eligibleFirstPointer(input);
    if (!existing && eligible) {
      if (
        (session.blocked.length > 0 && session.blockedPointerType === undefined) ||
        (session.blockedPointerType !== undefined &&
          session.blockedPointerType !== input.pointerType)
      )
        return session;
      const recovering = session.blocked.length > 0 || session.blockedPointerType !== undefined;
      const interactionEpoch = recovering ? session.interactionEpoch + 1 : session.interactionEpoch;
      const next = { ...session };
      delete next.blockedPointerType;
      return {
        ...next,
        interactionEpoch,
        blocked: [],
        expectedCaptureLoss: recovering ? [] : session.expectedCaptureLoss,
        gesture: { transform: session.transform, firstPointerId: input.pointerId },
        pointers: [
          {
            ...input,
            pointerType: input.pointerType,
            start: input.point,
            current: input.point,
            startedAt: input.at,
            tapEligible: true,
            phase: 'pressed',
            generation: session.generation,
            captureSerial: 0,
            interactionEpoch,
            captured: false
          }
        ]
      } as ReadyImageSession;
    }
    if (existing && session.pointers.length === 1 && eligibleSecondTouch(existing, input)) {
      const centroid = {
        x: (existing.current.x + input.point.x) / 2,
        y: (existing.current.y + input.point.y) / 2
      };
      return {
        ...session,
        gesture: {
          transform: session.transform,
          firstPointerId: existing.pointerId,
          secondPointerId: input.pointerId,
          centroid,
          distance: Math.max(
            1,
            Math.hypot(existing.current.x - input.point.x, existing.current.y - input.point.y)
          )
        },
        pointers: [
          { ...existing, tapEligible: false, phase: 'panning' },
          {
            ...input,
            pointerType: 'touch',
            start: input.point,
            current: input.point,
            startedAt: input.at,
            tapEligible: false,
            phase: 'panning',
            generation: session.generation,
            captureSerial: 0,
            interactionEpoch: session.interactionEpoch,
            captured: false
          }
        ]
      };
    }
    return session;
  }
  if (action.type === 'CAPTURE_SUCCEEDED')
    return action.generation === session.generation
      ? {
          ...session,
          pointers: session.pointers.map((pointer) =>
            pointer.pointerId === action.pointerId &&
            pointer.interactionEpoch === action.interactionEpoch &&
            !pointer.captured
              ? { ...pointer, captureSerial: action.captureSerial, captured: true }
              : pointer
          )
        }
      : session;
  if (action.type === 'CAPTURE_FAILED') {
    const pointer = session.pointers.find(
      (candidate) =>
        candidate.pointerId === action.pointerId &&
        candidate.interactionEpoch === action.interactionEpoch
    );
    return action.generation === session.generation && pointer && !pointer.captured
      ? toBlocked(session)
      : session;
  }
  if (action.type === 'POINTER_MOVE') {
    const pointer = session.pointers.find((candidate) => candidate.pointerId === action.pointerId);
    if (!pointer) return session;
    if (action.buttons !== 1) return toBlocked(session);
    const pointers = session.pointers.map((candidate) =>
      candidate.pointerId === action.pointerId ? { ...candidate, current: action.point } : candidate
    );
    const gesture = session.gesture;
    if (gesture?.secondPointerId !== undefined && gesture.centroid && gesture.distance) {
      const first = pointers.find((candidate) => candidate.pointerId === gesture.firstPointerId);
      const second = pointers.find((candidate) => candidate.pointerId === gesture.secondPointerId);
      if (!first || !second) return { ...session, pointers };
      const centroid = {
        x: (first.current.x + second.current.x) / 2,
        y: (first.current.y + second.current.y) / 2
      };
      const zoom = clamp(
        (gesture.transform.zoom *
          Math.hypot(first.current.x - second.current.x, first.current.y - second.current.y)) /
          gesture.distance,
        session.bounds.min,
        session.bounds.max
      );
      const transform = clampTransform(session.geometry, session.bounds, {
        zoom,
        x:
          centroid.x - ((gesture.centroid.x - gesture.transform.x) / gesture.transform.zoom) * zoom,
        y: centroid.y - ((gesture.centroid.y - gesture.transform.y) / gesture.transform.zoom) * zoom
      });
      return {
        ...session,
        pointers,
        mode: Math.abs(transform.zoom - 1) < 1e-9 ? 'fit' : 'custom',
        transform,
        lastDetailZoom: transform.zoom > 1 ? transform.zoom : session.lastDetailZoom
      };
    }
    if (!gesture) return { ...session, pointers };
    const distance = Math.hypot(action.point.x - pointer.start.x, action.point.y - pointer.start.y);
    if (pointer.phase === 'pressed' && distance <= DRAG_THRESHOLD) return { ...session, pointers };
    const panningPointers = pointers.map((candidate) =>
      candidate.pointerId === action.pointerId
        ? { ...candidate, phase: 'panning' as const, tapEligible: false }
        : candidate
    );
    const transform = panTransform(session.geometry, session.bounds, gesture.transform, {
      x: action.point.x - pointer.start.x,
      y: action.point.y - pointer.start.y
    });
    const changed = transform.x !== session.transform.x || transform.y !== session.transform.y;
    return {
      ...session,
      pointers: panningPointers,
      mode: changed && session.mode === 'fit' ? 'custom' : session.mode,
      transform
    };
  }
  if (action.type === 'POINTER_UP') {
    const blocked = session.blocked.find((candidate) => candidate.pointerId === action.pointerId);
    if (blocked) return clearBlockedContact(session, action.pointerId);
    const pointer = session.pointers.find((candidate) => candidate.pointerId === action.pointerId);
    if (!pointer) return session;
    const wasPinching = session.gesture?.secondPointerId !== undefined;
    const distance = Math.hypot(action.point.x - pointer.start.x, action.point.y - pointer.start.y);
    const qualifyingTap =
      pointer.tapEligible &&
      pointer.pointerType === 'touch' &&
      action.at >= pointer.startedAt &&
      action.at - pointer.startedAt <= TAP_MAX_MS &&
      distance <= DRAG_THRESHOLD;
    const remaining = session.pointers.filter(
      (candidate) => candidate.pointerId !== action.pointerId
    );
    const next: ReadyImageSession = {
      ...session,
      pointers: remaining,
      expectedCaptureLoss: pointer.captured
        ? [
            ...session.expectedCaptureLoss,
            {
              generation: pointer.generation,
              pointerId: pointer.pointerId,
              captureSerial: pointer.captureSerial,
              interactionEpoch: pointer.interactionEpoch
            }
          ]
        : session.expectedCaptureLoss
    };
    if (wasPinching && remaining.length === 1)
      return {
        ...toBlocked(next, remaining),
        expectedCaptureLoss: [
          ...next.expectedCaptureLoss,
          ...remaining
            .filter((candidate) => candidate.captured)
            .map(({ generation, pointerId, captureSerial, interactionEpoch }) => ({
              generation,
              pointerId,
              captureSerial,
              interactionEpoch
            }))
        ]
      };
    if (remaining.length === 1) {
      const [remainingPointer] = remaining;
      if (remainingPointer) {
        next.gesture = {
          transform: next.transform,
          firstPointerId: remainingPointer.pointerId
        };
        next.pointers = [
          {
            ...remainingPointer,
            start: remainingPointer.current,
            tapEligible: false,
            phase: 'panning'
          }
        ];
      }
    } else delete next.gesture;
    if (!qualifyingTap || wasPinching) return next;
    if (
      next.tap &&
      action.at - next.tap.at >= 0 &&
      action.at - next.tap.at <= DOUBLE_TAP_MAX_MS &&
      Math.hypot(action.point.x - next.tap.point.x, action.point.y - next.tap.point.y) <=
        DOUBLE_TAP_DISTANCE
    ) {
      const toggled = toggleDetail(next, action.point);
      delete toggled.tap;
      return {
        ...toggled,
        suppressNativeDoubleClickUntil: action.at + DOUBLE_CLICK_SUPPRESSION_MS
      };
    }
    return { ...next, tap: { point: action.point, at: action.at } };
  }
  if (action.type === 'DOUBLE_CLICK')
    return action.at <= session.suppressNativeDoubleClickUntil
      ? session
      : toggleDetail(session, action.point);
  if (action.type === 'LOST_POINTER_CAPTURE') {
    const expected = session.expectedCaptureLoss.find(
      (loss) =>
        loss.generation === action.generation &&
        loss.pointerId === action.pointerId &&
        loss.captureSerial === action.captureSerial &&
        loss.interactionEpoch === action.interactionEpoch
    );
    return expected
      ? {
          ...session,
          expectedCaptureLoss: session.expectedCaptureLoss.filter((loss) => loss !== expected)
        }
      : action.generation === session.generation &&
          session.pointers.some(
            (pointer) =>
              pointer.pointerId === action.pointerId &&
              pointer.captureSerial === action.captureSerial &&
              pointer.interactionEpoch === action.interactionEpoch
          )
        ? toBlocked(session)
        : session;
  }
  if (action.type === 'POINTER_CANCEL') {
    const blocked = session.blocked.find((pointer) => pointer.pointerId === action.pointerId);
    if (blocked) return clearBlockedContact(session, action.pointerId);
    return action.generation === session.generation &&
      session.pointers.some(
        (pointer) =>
          pointer.pointerId === action.pointerId &&
          pointer.captureSerial === action.captureSerial &&
          pointer.interactionEpoch === action.interactionEpoch
      )
      ? toBlocked(session)
      : session;
  }
  return session;
};

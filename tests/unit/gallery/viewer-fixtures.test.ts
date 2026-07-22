import { describe, expect, test } from 'bun:test';

const fixtureDirectory = new URL('../../fixtures/media/', import.meta.url);
const pngSignature = Uint8Array.of(137, 80, 78, 71, 13, 10, 26, 10);

type Generation = {
  tool: string;
  command: string;
  algorithm?: string;
  notes?: string;
};

type Fixture = {
  path: string;
  mediaType: 'image/png' | 'video/mp4';
  sha256: string;
  bytes: number;
  width: number;
  height: number;
  durationSeconds?: number;
  timescale?: number;
  duration?: number;
  container?: string;
  generation: Generation;
};

type Manifest = {
  schemaVersion: number;
  provenance: {
    license: string;
    source: string;
    generationNotes: string;
  };
  fixtures: Fixture[];
};

const expectedProvenance = {
  license: 'CC0-1.0',
  source: 'Generated locally from synthetic test patterns; no third-party media is included.',
  generationNotes:
    "PNG files are lossless RGB checkerboard color bands written with Python standard-library struct/zlib (filter byte 0, zlib level 9). The MP4 is a synthetic FFmpeg testsrc2 stream with no audio. Regenerate deliberately and update every manifest checksum/size and this validator's expectations together."
};

function record(value: unknown, name: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    throw new Error(`${name} must be an object`);
  return value as Record<string, unknown>;
}

function string(value: unknown, name: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`${name} must be a non-empty string`);
  return value;
}

function number(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0)
    throw new Error(`${name} must be a positive finite number`);
  return value;
}

function validateManifest(value: unknown): Manifest {
  const manifest = record(value, 'manifest');
  expect(Object.keys(manifest).sort()).toEqual(['fixtures', 'provenance', 'schemaVersion']);
  expect(manifest.schemaVersion).toBe(1);

  const provenance = record(manifest.provenance, 'manifest.provenance');
  expect(Object.keys(provenance).sort()).toEqual(['generationNotes', 'license', 'source']);
  for (const [key, expected] of Object.entries(expectedProvenance))
    expect(string(provenance[key], `manifest.provenance.${key}`)).toBe(expected);

  if (!Array.isArray(manifest.fixtures) || manifest.fixtures.length !== 3)
    throw new Error('manifest.fixtures must contain the three committed fixtures');
  const fixtures = manifest.fixtures.map((value, index) => {
    const fixture = record(value, `manifest.fixtures[${index}]`);
    const mediaType = string(fixture.mediaType, `manifest.fixtures[${index}].mediaType`);
    if (mediaType !== 'image/png' && mediaType !== 'video/mp4')
      throw new Error(`manifest.fixtures[${index}].mediaType is unsupported`);
    const video = mediaType === 'video/mp4';
    expect(Object.keys(fixture).sort()).toEqual(
      (video
        ? [
            'bytes',
            'container',
            'duration',
            'durationSeconds',
            'generation',
            'height',
            'mediaType',
            'path',
            'sha256',
            'timescale',
            'width'
          ]
        : ['bytes', 'generation', 'height', 'mediaType', 'path', 'sha256', 'width']
      ).sort()
    );

    const generation = record(fixture.generation, `manifest.fixtures[${index}].generation`);
    expect(Object.keys(generation).sort()).toEqual(
      (video ? ['command', 'notes', 'tool'] : ['algorithm', 'command', 'tool']).sort()
    );
    const tool = string(generation.tool, `manifest.fixtures[${index}].generation.tool`);
    const version = tool.match(/\d+(?:\.\d+)*/)?.[0];
    expect(version, `${tool} must declare its generator version`).toBeDefined();
    const command = string(generation.command, `manifest.fixtures[${index}].generation.command`);
    if (video) {
      expect(command).toContain(string(fixture.path, `manifest.fixtures[${index}].path`));
    } else {
      expect(command).toStartWith('python3 -c ');
    }
    string(
      generation[video ? 'notes' : 'algorithm'],
      `manifest.fixtures[${index}].generation.${video ? 'notes' : 'algorithm'}`
    );

    const typed: Fixture = {
      path: string(fixture.path, `manifest.fixtures[${index}].path`),
      mediaType,
      sha256: string(fixture.sha256, `manifest.fixtures[${index}].sha256`),
      bytes: number(fixture.bytes, `manifest.fixtures[${index}].bytes`),
      width: number(fixture.width, `manifest.fixtures[${index}].width`),
      height: number(fixture.height, `manifest.fixtures[${index}].height`),
      generation: {
        tool,
        command,
        ...(video
          ? { notes: string(generation.notes, `manifest.fixtures[${index}].generation.notes`) }
          : {
              algorithm: string(
                generation.algorithm,
                `manifest.fixtures[${index}].generation.algorithm`
              )
            })
      }
    };
    if (video) {
      typed.durationSeconds = number(
        fixture.durationSeconds,
        `manifest.fixtures[${index}].durationSeconds`
      );
      typed.timescale = number(fixture.timescale, `manifest.fixtures[${index}].timescale`);
      typed.duration = number(fixture.duration, `manifest.fixtures[${index}].duration`);
      typed.container = string(fixture.container, `manifest.fixtures[${index}].container`);
    }
    return typed;
  });
  return { schemaVersion: 1, provenance: expectedProvenance, fixtures };
}

type Box = {
  type: string;
  contentStart: number;
  end: number;
};

function readUint32(bytes: Uint8Array, offset: number): number {
  if (offset + 4 > bytes.byteLength) throw new Error(`Unexpected end of file at byte ${offset}`);
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(offset);
}

function readUint64(bytes: Uint8Array, offset: number): number {
  if (offset + 8 > bytes.byteLength) throw new Error(`Unexpected end of file at byte ${offset}`);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return Number((BigInt(view.getUint32(offset)) << 32n) | BigInt(view.getUint32(offset + 4)));
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(...bytes.slice(offset, offset + 4));
}

function parseBoxes(bytes: Uint8Array, start: number, end: number): Box[] {
  const boxes: Box[] = [];
  let offset = start;

  while (offset < end) {
    if (offset + 8 > end) throw new Error(`Truncated MP4 box at byte ${offset}`);
    let size = readUint32(bytes, offset);
    const type = boxType(bytes, offset + 4);
    let headerSize = 8;

    if (size === 1) {
      size = readUint64(bytes, offset + 8);
      headerSize = 16;
    } else if (size === 0) {
      size = end - offset;
    }

    if (size < headerSize || offset + size > end)
      throw new Error(`Invalid ${type} box at byte ${offset}`);
    boxes.push({ type, contentStart: offset + headerSize, end: offset + size });
    offset += size;
  }

  return boxes;
}

function childBoxes(bytes: Uint8Array, box: Box): Box[] {
  return parseBoxes(bytes, box.contentStart, box.end);
}

function requiredBox(boxes: Box[], type: string): Box {
  const box = boxes.find((candidate) => candidate.type === type);
  if (!box) throw new Error(`Missing ${type} box`);
  return box;
}

function parsePng(bytes: Uint8Array): {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
} {
  expect(bytes.slice(0, pngSignature.byteLength)).toEqual(pngSignature);
  expect(readUint32(bytes, 8)).toBe(13);
  expect(boxType(bytes, 12)).toBe('IHDR');

  return {
    width: readUint32(bytes, 16),
    height: readUint32(bytes, 20),
    bitDepth: bytes[24] ?? 0,
    colorType: bytes[25] ?? 0
  };
}

function parseMovieHeader(bytes: Uint8Array, box: Box): { timescale: number; duration: number } {
  const version = bytes[box.contentStart];
  if (version === 0) {
    return {
      timescale: readUint32(bytes, box.contentStart + 12),
      duration: readUint32(bytes, box.contentStart + 16)
    };
  }
  if (version === 1) {
    return {
      timescale: readUint32(bytes, box.contentStart + 20),
      duration: readUint64(bytes, box.contentStart + 24)
    };
  }
  throw new Error(`Unsupported mvhd version ${version}`);
}

function parseTrackDimensions(bytes: Uint8Array, box: Box): { width: number; height: number } {
  const version = bytes[box.contentStart];
  const dimensionsOffset = box.contentStart + (version === 0 ? 76 : version === 1 ? 88 : -1);
  if (dimensionsOffset < box.contentStart) throw new Error(`Unsupported tkhd version ${version}`);

  return {
    width: readUint32(bytes, dimensionsOffset) / 65536,
    height: readUint32(bytes, dimensionsOffset + 4) / 65536
  };
}

async function readFixture(path: string): Promise<Uint8Array> {
  return new Uint8Array(await Bun.file(new URL(path, fixtureDirectory)).arrayBuffer());
}

const expectedFixtures: Array<Omit<Fixture, 'generation'>> = [
  {
    path: 'gallery-landscape.png',
    mediaType: 'image/png',
    sha256: '3a1ad58bf0130ceff68176a8d9618b16653055019af88679c607e470abeb86d6',
    bytes: 3670,
    width: 640,
    height: 360
  },
  {
    path: 'gallery-portrait.png',
    mediaType: 'image/png',
    sha256: '05ef6f16b25fd1d071ef6de295da655a2d25eb79acaf09dee980b9ef9f821122',
    bytes: 1336,
    width: 240,
    height: 360
  },
  {
    path: 'gallery-playback.mp4',
    mediaType: 'video/mp4',
    sha256: 'efda19c5c7d7e6248561d189993c240d3ec3fe804a1ce9ccdf033a86e5b7db04',
    bytes: 45508,
    width: 320,
    height: 180,
    durationSeconds: 3.2,
    timescale: 1000,
    duration: 3200,
    container: 'ISO Base Media File Format (MP4), H.264 Constrained Baseline video, no audio'
  }
];

describe('Gallery viewer committed media fixtures', () => {
  test('locks manifest entries, bytes, and PNG intrinsic dimensions without host tools', async () => {
    const manifest = validateManifest(
      await Bun.file(new URL('gallery-viewer-fixtures.json', fixtureDirectory)).json()
    );
    expect(manifest).toMatchObject({
      schemaVersion: 1,
      provenance: expectedProvenance,
      fixtures: expectedFixtures
    });
    expect(manifest.fixtures.map((fixture) => fixture.generation.tool)).toEqual([
      'Python 3 standard library (struct, zlib)',
      'Python 3 standard library (struct, zlib)',
      'FFmpeg 8.1.2 (libx264)'
    ]);

    for (const expected of expectedFixtures.slice(0, 2)) {
      const bytes = await readFixture(expected.path);
      expect(bytes.byteLength).toBe(expected.bytes);
      expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(expected.sha256);

      const png = parsePng(bytes);
      expect(png).toMatchObject({
        width: expected.width,
        height: expected.height,
        bitDepth: 8,
        colorType: 2
      });
      expect(png.width).not.toBe(png.height);
    }
  });

  test('locks MP4 bytes, movie duration, and display dimensions without host tools', async () => {
    const expected = expectedFixtures[2];
    if (!expected) throw new Error('MP4 fixture manifest entry is missing');
    if (
      expected.durationSeconds === undefined ||
      expected.timescale === undefined ||
      expected.duration === undefined
    ) {
      throw new Error('MP4 fixture manifest is missing duration metadata');
    }
    const bytes = await readFixture(expected.path);
    expect(bytes.byteLength).toBe(expected.bytes);
    expect(new Bun.CryptoHasher('sha256').update(bytes).digest('hex')).toBe(expected.sha256);

    const topLevel = parseBoxes(bytes, 0, bytes.byteLength);
    const ftyp = requiredBox(topLevel, 'ftyp');
    const mdat = requiredBox(topLevel, 'mdat');
    expect(boxType(bytes, ftyp.contentStart)).toBe('isom');
    expect(ftyp.end).toBeGreaterThan(ftyp.contentStart);
    expect(mdat.end - mdat.contentStart).toBeGreaterThan(0);
    const moov = requiredBox(topLevel, 'moov');
    const movie = parseMovieHeader(bytes, requiredBox(childBoxes(bytes, moov), 'mvhd'));
    const track = requiredBox(childBoxes(bytes, moov), 'trak');
    const dimensions = parseTrackDimensions(bytes, requiredBox(childBoxes(bytes, track), 'tkhd'));

    expect(movie).toEqual({ timescale: expected.timescale, duration: expected.duration });
    expect(movie.duration / movie.timescale).toBe(expected.durationSeconds);
    expect(movie.duration / movie.timescale).toBeGreaterThanOrEqual(3);
    expect(dimensions).toEqual({ width: expected.width, height: expected.height });
    expect(dimensions.width).not.toBe(dimensions.height);
  });
});

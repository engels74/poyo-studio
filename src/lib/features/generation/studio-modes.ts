// Presentation catalogue for the studio creative-intent selector.
// Pure, browser-safe: no server imports, no registry imports, no I/O.

export type StudioModeGroupKey = 'create' | 'edit' | 'other';

export interface StudioMode {
  workflow: string;
  group: StudioModeGroupKey;
  /** What the person is doing, in their own words. */
  label: string;
  /** The pipeline shape, in the shorthand the model catalogues use. */
  tag: string;
}

export interface StudioModeGroup {
  key: StudioModeGroupKey;
  label: string;
  /** What the group asks of the person, so the heading carries information. */
  description: string;
  modes: StudioMode[];
}

const groupLabels: Record<StudioModeGroupKey, { label: string; description: string }> = {
  create: { label: 'Create', description: 'Starts from your prompt alone.' },
  edit: { label: 'Edit', description: 'Starts from media you supply.' },
  other: { label: 'Other', description: 'Documented by the registry without a grouped mode.' }
};

/**
 * Ordered from the plainest input to the most specialized, so the list itself reads as a
 * progression rather than an alphabetical dump.
 */
const modes: readonly StudioMode[] = [
  { workflow: 'text-to-image', group: 'create', label: 'Text to image', tag: 'txt2img' },
  { workflow: 'text-to-video', group: 'create', label: 'Text to video', tag: 'txt2vid' },
  { workflow: 'multi-shot-video', group: 'create', label: 'Shot list to video', tag: 'shots2vid' },
  { workflow: 'image-to-image', group: 'edit', label: 'Image to image', tag: 'img2img' },
  { workflow: 'image-edit', group: 'edit', label: 'Edit an image', tag: 'img2img' },
  { workflow: 'image-to-video', group: 'edit', label: 'Image to video', tag: 'img2vid' },
  { workflow: 'frame-to-video', group: 'edit', label: 'First and last frame', tag: 'frames2vid' },
  { workflow: 'reference-to-video', group: 'edit', label: 'References to video', tag: 'ref2vid' },
  { workflow: 'image-fusion-video', group: 'edit', label: 'Fuse images', tag: 'fuse2vid' },
  { workflow: 'video-to-video', group: 'edit', label: 'Video to video', tag: 'vid2vid' },
  { workflow: 'video-edit', group: 'edit', label: 'Edit a video', tag: 'vid2vid' },
  { workflow: 'motion-control', group: 'edit', label: 'Motion transfer', tag: 'motion2vid' },
  { workflow: 'character-animation', group: 'edit', label: 'Animate a character', tag: 'char2vid' },
  {
    workflow: 'character-replacement',
    group: 'edit',
    label: 'Replace a character',
    tag: 'charswap'
  },
  { workflow: 'avatar-video', group: 'edit', label: 'Audio-driven avatar', tag: 'audio2vid' }
];

const modesByWorkflow = new Map(modes.map((mode) => [mode.workflow, mode]));

function fallbackMode(workflow: string): StudioMode {
  return {
    workflow,
    group: 'other',
    label: workflow.replaceAll('-', ' '),
    tag: workflow.replaceAll('-to-', '2')
  };
}

/** The catalogued mode for a registry workflow, or a derived one when the registry moves first. */
export function studioMode(workflow: string): StudioMode {
  return modesByWorkflow.get(workflow) ?? fallbackMode(workflow);
}

/** The mode label used wherever a workflow is named in the interface. */
export function studioModeLabel(workflow: string): string {
  return studioMode(workflow).label;
}

/**
 * Group the workflows a modality actually offers, keeping catalogue order inside each group and
 * dropping groups that would render empty.
 */
export function studioModeGroups(workflows: readonly string[]): StudioModeGroup[] {
  const available = [...new Set(workflows)];
  const catalogued = modes.filter((mode) => available.includes(mode.workflow));
  const derived = available
    .filter((workflow) => !modesByWorkflow.has(workflow))
    .map(fallbackMode)
    .sort((left, right) => left.label.localeCompare(right.label));
  return (['create', 'edit', 'other'] as const)
    .map((key) => ({
      key,
      label: groupLabels[key].label,
      description: groupLabels[key].description,
      modes: [...catalogued, ...derived].filter((mode) => mode.group === key)
    }))
    .filter((group) => group.modes.length > 0);
}

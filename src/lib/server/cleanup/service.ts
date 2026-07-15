import { lstat, realpath } from 'node:fs/promises';
import { basename } from 'node:path';
import type {
  CleanupCandidateDto,
  CleanupConsequence,
  CleanupPreviewDto,
  LocalCleanupPolicy
} from '../../features/cleanup/contracts';
import { safeErrorSummary } from '../diagnostics/redaction';
import { type AppPaths, resolvePathWithin } from '../platform/app-paths';
import {
  CleanupValidationError,
  cleanupHash,
  DEFAULT_CLEANUP_POLICY,
  normalizeCleanupPolicy
} from './policy';
import type { CleanupActionSnapshot, CleanupClaim, CleanupRepository } from './repository';

export interface CleanupStorageSnapshot {
  freeBytes: number | null;
}

export interface CleanupServiceOptions {
  repository: CleanupRepository;
  paths: Pick<AppPaths, 'media' | 'uploads'>;
  now?: () => Date;
  storage?: () => Promise<CleanupStorageSnapshot>;
  removeFile?: (root: string, path: string) => Promise<'removed' | 'already-missing'>;
}

async function defaultStorage(paths: Pick<AppPaths, 'media'>): Promise<CleanupStorageSnapshot> {
  try {
    const stats = await import('node:fs/promises').then(({ statfs }) => statfs(paths.media));
    return { freeBytes: Number(stats.bavail) * Number(stats.bsize) };
  } catch {
    return { freeBytes: null };
  }
}

async function secureRemove(
  root: string,
  candidate: string
): Promise<'removed' | 'already-missing'> {
  const path = resolvePathWithin(root, candidate);
  let info: Awaited<ReturnType<typeof lstat>>;
  try {
    info = await lstat(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return 'already-missing';
    throw error;
  }
  if (info.isSymbolicLink()) throw new Error('Cleanup refuses to remove symbolic links.');
  const [realRoot, realCandidate] = await Promise.all([realpath(root), realpath(path)]);
  resolvePathWithin(realRoot, realCandidate);
  await Bun.file(realCandidate).delete();
  return 'removed';
}

function isProtected(
  target: ReturnType<CleanupRepository['listTargets']>[number],
  policy: LocalCleanupPolicy
): boolean {
  return (
    target.activeReference ||
    (policy.exclusions.favorites && target.favorite) ||
    (policy.exclusions.pinned && target.pinned) ||
    target.tags.some((tag) => policy.exclusions.tags.includes(tag))
  );
}

function assertConsequence(value: unknown): asserts value is CleanupConsequence {
  if (!['file', 'metadata', 'both'].includes(String(value))) {
    throw new CleanupValidationError('Cleanup consequence is not supported.');
  }
}

export class CleanupService {
  private readonly now: () => Date;

  constructor(private readonly options: CleanupServiceOptions) {
    this.now = options.now ?? (() => new Date());
  }

  policy(): LocalCleanupPolicy {
    const current = this.options.repository.getPolicy();
    if (current) return current;
    return this.options.repository.savePolicy(DEFAULT_CLEANUP_POLICY);
  }

  setPolicy(input: unknown): LocalCleanupPolicy {
    return this.options.repository.savePolicy(normalizeCleanupPolicy(input));
  }

  async scheduleEnabledPolicy(): Promise<number> {
    const policy = this.options.repository.getEnabledPolicy();
    if (!policy) return 0;
    if (this.options.repository.hasPendingActions(cleanupHash(policy), policy.consequence))
      return 0;
    const preview = await this.preview(policy.consequence);
    return this.options.repository.schedulePreview(preview.token);
  }

  async preview(consequenceInput: unknown): Promise<CleanupPreviewDto> {
    assertConsequence(consequenceInput);
    const consequence = consequenceInput;
    const policy = this.policy();
    const targets = this.options.repository.listTargets(consequence);
    const eligible = targets.filter((target) => !isProtected(target, policy));
    const selected = new Map<
      string,
      { target: (typeof targets)[number]; reasons: CleanupActionSnapshot['reasons'] }
    >();

    if (policy.mode === 'age') {
      const cutoff = this.now().getTime() - (policy.olderThanDays ?? 0) * 86_400_000;
      for (const target of eligible) {
        if (new Date(target.createdAt).getTime() < cutoff) {
          selected.set(`${target.targetKind}:${target.targetId}`, { target, reasons: ['age'] });
        }
      }
    }

    if (policy.mode === 'total-size') {
      const total = targets.reduce((sum, target) => sum + target.bytes, 0);
      let remaining = Math.max(0, total - (policy.maxBytes ?? total));
      for (const target of eligible) {
        if (remaining <= 0) break;
        selected.set(`${target.targetKind}:${target.targetId}`, {
          target,
          reasons: ['storage-limit']
        });
        remaining -= target.bytes;
      }
    }

    if (policy.mode === 'min-free-space') {
      const storage = await (this.options.storage ?? (() => defaultStorage(this.options.paths)))();
      if (storage.freeBytes === null) {
        throw new CleanupValidationError('Free disk space could not be measured safely.');
      }
      let remaining = Math.max(0, (policy.minFreeBytes ?? storage.freeBytes) - storage.freeBytes);
      for (const target of eligible) {
        if (remaining <= 0) break;
        selected.set(`${target.targetKind}:${target.targetId}`, {
          target,
          reasons: ['free-space']
        });
        remaining -= target.bytes;
      }
    }

    const policyHash = cleanupHash(policy);
    const snapshots: CleanupActionSnapshot[] = [...selected.values()].map(
      ({ target, reasons }) => ({
        ...target,
        reasons,
        policyHash
      })
    );
    const token = cleanupHash({
      version: 2,
      policyHash,
      consequence,
      candidates: snapshots.map(({ targetKind, targetId, localPath, bytes, reasons }) => ({
        targetKind,
        targetId,
        localPath,
        bytes,
        reasons
      }))
    });
    this.options.repository.persistPreview(token, policyHash, consequence, snapshots);
    const candidates: CleanupCandidateDto[] = snapshots.map((snapshot) => ({
      targetKind: snapshot.targetKind,
      targetId: snapshot.targetId,
      outputId: snapshot.outputId,
      managedSourceId: snapshot.managedSourceId,
      jobId: snapshot.jobId,
      jobIds: snapshot.jobIds,
      fileName: basename(snapshot.localPath),
      mediaKind: snapshot.mediaKind,
      bytes: snapshot.bytes,
      createdAt: snapshot.createdAt,
      reasons: snapshot.reasons
    }));
    return {
      token,
      policy,
      consequence,
      candidates,
      totalBytes: candidates.reduce((total, candidate) => total + candidate.bytes, 0),
      createdAt: this.now().toISOString(),
      requiresConfirmation: true
    };
  }

  apply(token: unknown, confirmed: unknown): { scheduled: number; token: string } {
    if (confirmed !== true) throw new CleanupValidationError('Cleanup confirmation is required.');
    if (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)) {
      throw new CleanupValidationError('Cleanup preview token is invalid.');
    }
    return { scheduled: this.options.repository.schedulePreview(token), token };
  }

  async execute(claim: CleanupClaim): Promise<unknown> {
    const removeFile = this.options.removeFile ?? secureRemove;
    try {
      let file: 'removed' | 'already-missing' | 'retained' = 'retained';
      let metadata: 'removed' | 'already-missing' | 'retained' | 'retained-for-history' =
        'retained';
      if (claim.snapshot.targetKind === 'managed-source' && claim.actionKind !== 'local_file') {
        throw new Error('Managed source metadata is retained for generation history.');
      }
      if (claim.actionKind === 'local_file' || claim.actionKind === 'local_both') {
        file = await removeFile(
          claim.snapshot.targetKind === 'managed-source'
            ? this.options.paths.uploads
            : this.options.paths.media,
          claim.snapshot.localPath
        );
      }
      if (claim.snapshot.targetKind === 'managed-source') {
        metadata = 'retained-for-history';
        this.options.repository.markManagedSourceFileRemoved(
          claim.targetId,
          file === 'already-missing' ? 'missing' : 'deleted'
        );
      } else if (claim.actionKind === 'local_metadata' || claim.actionKind === 'local_both') {
        metadata = this.options.repository.removeOutputMetadata(claim.targetId)
          ? 'removed'
          : 'already-missing';
      } else {
        metadata = this.options.repository.markOutputFileRemoved(claim.targetId)
          ? 'retained'
          : 'already-missing';
      }
      const result = { file, metadata };
      this.options.repository.complete(claim, result);
      return result;
    } catch (error) {
      const result = { error: safeErrorSummary(error) };
      this.options.repository.fail(claim, result);
      throw error;
    }
  }
}

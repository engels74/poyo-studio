---
name: registry-change
description: Update Poyo model registry definitions together with their network evidence and reviewed request fixtures.
---

# Registry change

Use this workflow when changing model entries, request adapters, registry versions, or
`src/lib/features/registry/evidence/**`.

1. Establish whether the committed upstream baseline has drifted:

   ```bash
   bun run registry:audit:network
   ```

   This is an unauthenticated, zero-credit documentation audit. A drift exit is evidence to
   review, not a reason to accept upstream changes blindly.

2. Change the authoritative registry and adapter code under `src/lib/features/registry/**`.
   Update `IMAGE_REGISTRY_VERSION` or `VIDEO_REGISTRY_VERSION` when the corresponding committed
   registry contract changes.

3. Refresh derived evidence only after reviewing the upstream change:

   ```bash
   bun run registry:evidence:refresh
   ```

   The first script rewrites
   `src/lib/features/registry/evidence/official-source-manifest.json` from live public docs. The
   second rewrites the three `reviewed-*-fixtures*.json` files from current registry definitions
   and normalizers. Inspect every generated diff; the command does not update
   `reviewed-conflicts.json` or `reviewed-conditional-vectors.json`.

4. Update `reviewed-conflicts.json` for newly resolved or introduced source contradictions and
   `reviewed-conditional-vectors.json` for each changed conditional rule. Do not erase a manual
   decision merely because fixture refresh did not reproduce it.

5. Validate the evidence/registry coupling, then run the focused registry tests and normal gates:

   ```bash
   bun run validate:registry
   bun test tests/unit/registry
   bun run check
   bun run lint
   bun run build
   ```

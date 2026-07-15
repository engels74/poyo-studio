# Technical rule provenance and reconciliation

- Recorded: `2026-07-15T11:23:41Z`
- Source: `/Users/dkp/Documents/GitHub/engels74/otpravkarr-project/otpravkarr/.augment/rules/bun-svelte-pro.md`
- Tracked target: `.augment/rules/poyo-studio-tech-stack.md`
- Source SHA-256: `a82697bf4ea8bedd3540a271cc4ddd6679101677dc16790387e605699e810a18`
- Target SHA-256: `a82697bf4ea8bedd3540a271cc4ddd6679101677dc16790387e605699e810a18`
- Byte comparison: identical (`cmp` exit status `0`)

The target is an unchanged copy. Implementation decisions use the agreed precedence
`REQ > RULE > API > STACK > PRD`; this note records how examples in the rule are applied
when a higher-precedence requirement or newer verified upstream evidence is more specific.

| Rule area | Poyo Local Studio decision |
| --- | --- |
| Bun and SvelteKit foundation | Bun remains the runtime, package manager, script runner, TypeScript runtime, and production-server basis. Svelte 5 runes, SvelteKit 2, `svelte-adapter-bun`, strict TypeScript, and server-only boundaries are binding. The versions and adapter smoke gates in the verified stack record take priority over unpinned scaffold examples. |
| Testing | The rule's Vitest example is not adopted. `REQ` explicitly mandates Bun's test runner, so unit, integration, contract, browser-driver, and UI-flow assertions run through `bun:test`; Playwright is a library used by Bun tests, not a separate test runner. A future isolated `.svelte` test exception requires an explicit reviewed decision. Jest is prohibited. |
| UnoCSS | UnoCSS with `presetWind4` is binding. The current official UnoCSS SvelteKit guidance recorded in the stack audit controls plugin order and stylesheet integration where it differs from the rule's older example: `UnoCSS()` precedes `sveltekit()`, with the Svelte extractor enabled. No Tailwind configuration or runtime is introduced. |
| shadcn-svelte and Modern Minimal | Components are Svelte 5 source owned by this repository and adapted to UnoCSS/Bits UI. The TweakCN Modern Minimal registry item is treated as reviewed token data; React, Tailwind directives, and incompatible CLI side effects are discarded. |
| Formatting and semantic checks | Biome may format and lint supported files, but `svelte-check` remains the authoritative Svelte/TypeScript semantic gate. Root scripts expose separate format, lint, check, test, registry, and build commands. |
| Runtime and security | Production explicitly binds `127.0.0.1`; the adapter's broader default is not accepted. Secrets, filesystem access, SQLite, and Poyo credentials remain in server-only modules. Environment configuration has precedence over optional local secret storage. |
| State, forms, and components | The rule's runes, snippets, `$props`, `$derived`, `$effect`, progressive enhancement, accessible primitives, and feature-oriented server/client separation apply without exception. |

No unresolved conflict blocks implementation. This reconciliation resolves guidance only;
it does not modify the authoritative copied rule.

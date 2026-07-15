import axe from 'axe-core';
import type { Page } from 'playwright';

export interface BrowserIssueTracker {
  consoleErrors: string[];
  pageErrors: string[];
}

export function trackBrowserIssues(page: Page): BrowserIssueTracker {
  const tracker: BrowserIssueTracker = { consoleErrors: [], pageErrors: [] };
  page.on('console', (message) => {
    if (message.type() === 'error') tracker.consoleErrors.push(message.text());
  });
  page.on('pageerror', (error) => tracker.pageErrors.push(error.message));
  return tracker;
}

export async function seriousAccessibilityViolations(page: Page): Promise<
  Array<{
    id: string;
    impact: string | null;
    help: string;
    targets: string[][];
  }>
> {
  await page.addScriptTag({ content: axe.source });
  return page.evaluate(async () => {
    const browserAxe = (
      globalThis as unknown as {
        axe: {
          run: (
            root: Document,
            options: { runOnly: { type: 'tag'; values: string[] } }
          ) => Promise<{
            violations: Array<{
              id: string;
              impact: string | null;
              help: string;
              nodes: Array<{ target: string[] }>;
            }>;
          }>;
        };
      }
    ).axe;
    const result = await browserAxe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa'] }
    });
    return result.violations
      .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
      .map((violation) => ({
        id: violation.id,
        impact: violation.impact,
        help: violation.help,
        targets: violation.nodes.map((node) => node.target)
      }));
  });
}

export async function pageHasNoHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1
  );
}

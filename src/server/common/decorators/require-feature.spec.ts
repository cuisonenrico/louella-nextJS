import * as fs from 'fs';
import * as path from 'path';

/**
 * `@RequireFeature()` is metadata, and metadata is last-write-wins.
 *
 * Two of these on one handler is therefore not "require both" and not "require
 * either" — the lower one is applied first and the upper one overwrites it
 * outright. The keys in the lower decorator are silently dropped, along with
 * whatever access they were added to grant, and nothing warns about it.
 *
 * This scans the source rather than the compiled metadata because that is the
 * form the mistake is made in: the duplicate is obvious in a diff and invisible
 * at runtime. To require several keys, list them in one decorator — the guard
 * already treats them as OR.
 */

const SERVER_DIR = path.join(__dirname, '..', '..');

function controllerFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...controllerFiles(full));
    else if (entry.name.endsWith('.controller.ts')) out.push(full);
  }
  return out;
}

/**
 * Returns every handler in `source` that carries more than one
 * `@RequireFeature(...)` in its own decorator block, as "file:line" labels.
 *
 * A decorator block is the run of decorator lines and comments immediately
 * above a member; a blank line or the member itself ends it.
 */
function duplicateDecoratorSites(source: string, label: string): string[] {
  const lines = source.split('\n');
  const hits: string[] = [];
  let blockStart = -1;
  let count = 0;

  const flush = () => {
    if (count > 1) hits.push(`${label}:${blockStart + 1}`);
    blockStart = -1;
    count = 0;
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('@RequireFeature(')) {
      if (count === 0) blockStart = i;
      count++;
      continue;
    }
    // Other decorators and comments keep the block open; anything else ends it.
    if (line.startsWith('@') || line.startsWith('//') || line.startsWith('*'))
      continue;
    flush();
  }
  flush();

  return hits;
}

describe('@RequireFeature', () => {
  it('is never applied twice to the same handler', () => {
    const offenders = controllerFiles(SERVER_DIR).flatMap((file) =>
      duplicateDecoratorSites(
        fs.readFileSync(file, 'utf-8'),
        path.relative(SERVER_DIR, file).replace(/\\/g, '/'),
      ),
    );

    expect(offenders).toEqual([]);
  });
});

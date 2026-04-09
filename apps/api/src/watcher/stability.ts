/**
 * apps/api/src/watcher/stability.ts
 *
 * Pure stability-check utility (WAT-02).
 *
 * Although chokidar's `awaitWriteFinish` already handles write-stability gating
 * before firing the `add` event, this module exposes the raw two-poll stat check
 * so it can be tested independently and re-used in any context where chokidar
 * is not involved (e.g. a CLI re-scan command in v2).
 *
 * Note: `isSizeAndMtimeStable` is NOT called again inside the watcher add-handler
 * (that would double the stability window). It is used directly by tests.
 */

import { stat } from "node:fs/promises";

/**
 * Returns true only if the file's size and mtime are identical across two stat
 * calls separated by `windowMs` milliseconds — i.e., the file is not actively
 * being written. Both fields must agree; a size match with a different mtime
 * (or vice versa) is treated as unstable.
 *
 * SMB note: some SMB servers have 1-2s mtime resolution. If `windowMs` is set
 * below the server's mtime resolution the check will always return false for
 * small files. Default of 1000ms covers most SMB implementations.
 */
export async function isSizeAndMtimeStable(
  filePath: string,
  windowMs: number,
): Promise<boolean> {
  const before = await stat(filePath);
  await new Promise<void>((resolve) => setTimeout(resolve, windowMs));
  const after = await stat(filePath);
  return (
    before.size === after.size &&
    before.mtimeMs === after.mtimeMs
  );
}

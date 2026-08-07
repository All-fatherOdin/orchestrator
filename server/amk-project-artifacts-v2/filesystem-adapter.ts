import { lstat, readFile, readdir } from "node:fs/promises";
import type { Dirent } from "node:fs";
import { join } from "node:path";
import type { AmkRunSourceAdapterV1 } from "./http.ts";
import { amkQueueIdV1, parseAmkQueueProjectionSourceV1 } from "./queue-source.ts";
import type { AmkQueueSourceDescriptorV1 } from "./queue-source.ts";
import {
  parseAmkRunProjectionSourceV1,
  type AmkRunProjectionSourceV1,
  type AmkRunSourceDescriptorV1,
} from "./run-source.ts";

const RUN_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_RUN_RECORD_BYTES = 4 * 1024 * 1024;
const MAX_QUEUE_BYTES = 1024 * 1024;
export const AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT = 50;

export class AmkFilesystemRunSourceAdapterV1 implements AmkRunSourceAdapterV1 {
  constructor(private readonly runsDirectory: string, private readonly queuesDirectory?: string) {}

  async load(selectorKind: "run" | "queue", sourceId: string) {
    return selectorKind === "run" ? this.loadRun(sourceId) : this.loadQueue(sourceId);
  }

  private async loadRun(runId: string): Promise<AmkRunProjectionSourceV1 | undefined> {
    if (!RUN_ID.test(runId)) return undefined;
    const directory = join(this.runsDirectory, runId);
    const file = join(directory, "run.json");
    try {
      const [directoryMetadata, fileMetadata] = await Promise.all([lstat(directory), lstat(file)]);
      if (!directoryMetadata.isDirectory() || directoryMetadata.isSymbolicLink() ||
          !fileMetadata.isFile() || fileMetadata.isSymbolicLink() ||
          fileMetadata.size > MAX_RUN_RECORD_BYTES) return undefined;
      const source = parseAmkRunProjectionSourceV1(await readFile(file, "utf8"));
      return source?.descriptor.runId === runId ? source : undefined;
    } catch { return undefined; }
  }

  private async queueFiles() {
    if (!this.queuesDirectory) return [];
    try {
      return (await readdir(this.queuesDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isFile() && /\.ya?ml$/i.test(entry.name))
        .sort((left, right) => left.name.localeCompare(right.name))
        .slice(0, AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT);
    } catch { return []; }
  }

  private async loadQueue(queueId: string) {
    if (!this.queuesDirectory || !/^QUEUE-[a-f0-9]{64}$/.test(queueId)) return undefined;
    const entry = (await this.queueFiles()).find((candidate) => amkQueueIdV1(candidate.name) === queueId);
    if (!entry) return undefined;
    const file = join(this.queuesDirectory, entry.name);
    try {
      const metadata = await lstat(file);
      if (!metadata.isFile() || metadata.isSymbolicLink() || metadata.size > MAX_QUEUE_BYTES) return undefined;
      return parseAmkQueueProjectionSourceV1(await readFile(file, "utf8"), queueId);
    } catch { return undefined; }
  }

  async list(): Promise<readonly (AmkRunSourceDescriptorV1 | AmkQueueSourceDescriptorV1)[]> {
    let entries: Dirent[] = [];
    try { entries = await readdir(this.runsDirectory, { withFileTypes: true }); }
    catch { /* Queue discovery remains available when the run store is absent. */ }
    const candidates = entries
      .filter((entry) => entry.isDirectory() && RUN_ID.test(entry.name))
      .sort((left, right) => right.name.localeCompare(left.name))
      .slice(0, AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT);
    const descriptors: AmkRunSourceDescriptorV1[] = [];
    for (const entry of candidates) {
      const source = await this.loadRun(entry.name);
      if (source) descriptors.push(source.descriptor);
    }
    const queueDescriptors = (await Promise.all((await this.queueFiles()).map((entry) =>
      this.loadQueue(amkQueueIdV1(entry.name)),
    ))).flatMap((source) => source ? [source.descriptor] : []);
    const sortedRuns = descriptors.sort((left, right) =>
      (right.startedAt ?? "").localeCompare(left.startedAt ?? "") || left.runId.localeCompare(right.runId));
    const queueLimit = Math.min(queueDescriptors.length, Math.ceil(AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT / 2));
    const runLimit = AMK_FILESYSTEM_DISCOVERY_SCAN_LIMIT - queueLimit;
    return [...sortedRuns.slice(0, runLimit), ...queueDescriptors.slice(0, queueLimit)];
  }
}

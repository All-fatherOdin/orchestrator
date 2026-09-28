import { createHash } from "node:crypto";
import { lstat, mkdir, readdir, readFile, writeFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

/** Opt-in artifact staging. Only the runner may publish, after gates and review. */
export type IsolatedArtifactsV1 = {
  contractType: "IsolatedArtifactsV1";
  contractVersion: "1.0";
  inputPaths: string[];
  publishCommands: string[];
};

export function validateIsolatedArtifacts(value: unknown): IsolatedArtifactsV1 {
  const c = value as IsolatedArtifactsV1;
  if (!c || typeof c !== "object" || Array.isArray(c) ||
    Object.keys(c).sort().join() !== "contractType,contractVersion,inputPaths,publishCommands" ||
    c.contractType !== "IsolatedArtifactsV1" || c.contractVersion !== "1.0" ||
    !Array.isArray(c.inputPaths) || !c.inputPaths.length ||
    !Array.isArray(c.publishCommands) || !c.publishCommands.length ||
    c.publishCommands.some(s => typeof s !== "string" || !s.trim()) ||
    new Set(c.inputPaths).size !== c.inputPaths.length)
    throw new Error("Invalid IsolatedArtifactsV1 contract.");
  for (const p of c.inputPaths) {
    if (typeof p !== "string" || !p || p !== p.normalize("NFC") ||
      /[\\:*?\[\]\x00-\x1f]/.test(p) || p.split("/").some(s => !s || s === "." || s === ".." || [".git", ".orchestrator-scratch"].includes(s.toLowerCase()) || /[. ]$/.test(s)))
      throw new Error("Isolated inputPaths must be exact normalized relative files/directories without .git.");
  }
  return structuredClone(c);
}

const hash = (data: Buffer) => createHash("sha256").update(data).digest("hex");
const stages = new Map<string, ArtifactStage>();
export type ArtifactStage = {
  root: string;
  project: string;
  receipt: string;
  inputs: Map<string, string>;
  baseline: Map<string, string>;
  reviewed?: Map<string, string>;
  inputPaths: string[];
  sealedRoot?: string;
};

/** Never follow links/junctions, including ancestors of an explicitly selected input. */
export async function assertPlainPath(root: string, target: string) {
  const rel = relative(resolve(root), resolve(target));
  if (isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`) || resolve(root, rel) !== resolve(target))
    throw new Error("Isolated path escapes root.");
  let current = resolve(root);
  for (const part of ["", ...rel.split(sep).filter(Boolean)]) {
    if (part) current = join(current, part);
    const stat = await lstat(current);
    if (stat.isSymbolicLink()) throw new Error(`Isolated path contains a link: ${current}`);
  }
  if (resolve(await realpath(target)).toLowerCase() !== resolve(target).toLowerCase())
    throw new Error("Isolated path resolves outside its declared identity.");
}

export async function inventory(root: string): Promise<Map<string, string>> {
  await assertPlainPath(root, root);
  const result = new Map<string, string>();
  async function visit(folder: string) {
    for (const e of (await readdir(folder, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = join(folder, e.name);
      const s = await lstat(p);
      if (s.isSymbolicLink() || (!s.isFile() && !s.isDirectory())) throw new Error("Isolated artifacts contain a link or special file.");
      if (s.isDirectory()) await visit(p);
      else {
        if (s.nlink !== 1) throw new Error("Isolated artifacts contain a hard link.");
        const key = relative(root, p).split(sep).join("/");
        if (!key.startsWith(".orchestrator-scratch/")) result.set(key, hash(await readFile(p)));
      }
    }
  }
  await visit(root);
  return result;
}

export async function prepareArtifactStage(project: string, parent: string, contract: IsolatedArtifactsV1) {
  validateIsolatedArtifacts(contract);
  const root = resolve(parent, "workspace");
  // An existing directory is uncertain prior execution; never silently reuse it.
  await mkdir(parent, { recursive: true });
  await assertPlainPath(parent, parent);
  await mkdir(root);
  await mkdir(join(root, ".orchestrator-scratch"));
  const inputs = new Map<string, string>();
  async function copy(p: string) {
    const source = join(project, p);
    await assertPlainPath(project, source);
    const s = await lstat(source);
    if (s.isDirectory()) {
      for (const e of await readdir(source)) await copy(`${p}/${e}`);
    } else {
      if (!s.isFile() || s.nlink !== 1) throw new Error("Input is not a plain independent file.");
      const data = await readFile(source);
      const target = join(root, p);
      await mkdir(dirname(target), { recursive: true });
      if (!inputs.has(p)) await writeFile(target, data, { flag: "wx" });
      inputs.set(p, hash(data));
    }
  }
  for (const p of contract.inputPaths) await copy(p);
  const stage: ArtifactStage = { root, project, receipt: join(parent, "stage.json"), inputs, inputPaths: contract.inputPaths, baseline: await inventory(root) };
  await writeFile(stage.receipt, JSON.stringify({ status: "prepared", root, project, contract, inputs: Object.fromEntries(inputs) }, null, 2), { flag: "wx" });
  stages.set(root, stage);
  return stage;
}

export function artifactStage(root: string) { return stages.get(resolve(root)); }
export async function assertArtifactStage(stage: ArtifactStage, allowedPaths: string[]) {
  const current = await inventory(stage.root);
  const changed = [...new Set([...stage.baseline.keys(), ...current.keys()])].filter(p => stage.baseline.get(p) !== current.get(p));
  if (changed.some(p => !allowedPaths.some(s => s.endsWith("/**") ? p.startsWith(`${s.slice(0, -3)}/`) : p === s)))
    throw new Error("Isolated executor changed files outside allowedPaths.");
  for (const [p, expected] of stage.inputs) {
    await assertPlainPath(stage.project, join(stage.project, p));
    if (hash(await readFile(join(stage.project, p))) !== expected) throw new Error(`Canonical input changed: ${p}`);
  }
  for (const p of stage.inputPaths) {
    if ((await lstat(join(stage.project, p))).isDirectory()) {
      const actual = [...(await inventory(join(stage.project, p))).keys()].map(k => `${p}/${k}`).sort();
      const expected = [...stage.inputs.keys()].filter(k => k.startsWith(`${p}/`)).sort();
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`Canonical input inventory changed: ${p}`);
    }
  }
  return current;
}

export async function sealArtifactReview(stage: ArtifactStage, allowedPaths: string[]) {
  stage.reviewed = await assertArtifactStage(stage, allowedPaths);
}

export async function beginArtifactPublication(stage: ArtifactStage, allowedPaths: string[]) {
  if (!stage.reviewed) throw new Error("Independent artifact review is required.");
  const current = await assertArtifactStage(stage, allowedPaths);
  if (JSON.stringify([...current]) !== JSON.stringify([...stage.reviewed])) throw new Error("Reviewed artifacts changed before publication.");
  const marker = join(dirname(stage.receipt), "publication-started.json");
  await writeFile(marker, JSON.stringify({ stage: stage.root, files: Object.fromEntries(current) }), { flag: "wx" });
  const sealed = join(dirname(stage.receipt), "sealed");
  await mkdir(sealed);
  for (const [p, expected] of current) {
    await assertPlainPath(stage.root, join(stage.root, p));
    const bytes = await readFile(join(stage.root, p));
    if (hash(bytes) !== expected) throw new Error("Reviewed artifacts changed during sealing.");
    await mkdir(dirname(join(sealed, p)), { recursive: true });
    await writeFile(join(sealed, p), bytes, { flag: "wx" });
  }
  await mkdir(join(sealed, ".orchestrator-scratch"));
  stage.sealedRoot = sealed;
  // Never replay a started publication automatically, including after a crash.
}

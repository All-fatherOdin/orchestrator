import { execFile } from "node:child_process";
import { constants } from "node:fs";
import { access, stat } from "node:fs/promises";
import { delimiter, extname, isAbsolute, join, resolve } from "node:path";

export type RuntimeToolV1 = {
  name: string;
  command?: string;
  environmentVariable?: string;
  versionPrefix?: string;
};
export type RuntimeRequirementsV1 = {
  contractType: "RuntimeRequirementsV1";
  contractVersion: "1.0";
  tools: RuntimeToolV1[];
};
export type RuntimeToolCheckV1 = {
  name: string;
  ok: boolean;
  detail: string;
  executable?: string;
  version?: string;
};

export function validateRuntimeRequirementsV1(value: unknown): RuntimeRequirementsV1 {
  const fail = (): never => { throw new Error("Invalid RuntimeRequirementsV1: declare 1–16 unique tools using command OR environmentVariable, and an optional versionPrefix."); };
  if (!value || typeof value !== "object" || Array.isArray(value)) return fail();
  const envelope = value as Record<string, unknown>;
  if (Object.keys(envelope).some(key => !["contractType", "contractVersion", "tools"].includes(key)) ||
      envelope.contractType !== "RuntimeRequirementsV1" || envelope.contractVersion !== "1.0" ||
      !Array.isArray(envelope.tools) || !envelope.tools.length || envelope.tools.length > 16) return fail();
  const names = new Set<string>();
  const tools = envelope.tools.map((entry): RuntimeToolV1 => {
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) return fail();
    const tool = entry as Record<string, unknown>;
    if (Object.keys(tool).some(key => !["name", "command", "environmentVariable", "versionPrefix"].includes(key)) ||
        typeof tool.name !== "string" || !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(tool.name) ||
        names.has(tool.name.toLowerCase()) ||
        (tool.command === undefined) === (tool.environmentVariable === undefined)) return fail();
    names.add(tool.name.toLowerCase());
    if (tool.command !== undefined && (typeof tool.command !== "string" ||
        !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(tool.command))) return fail();
    if (tool.environmentVariable !== undefined && (typeof tool.environmentVariable !== "string" ||
        !/^[A-Za-z_][A-Za-z0-9_]{0,63}$/.test(tool.environmentVariable))) return fail();
    if (tool.versionPrefix !== undefined && (typeof tool.versionPrefix !== "string" ||
        !tool.versionPrefix.length || tool.versionPrefix.length > 128 ||
        tool.versionPrefix.trim() !== tool.versionPrefix || /[\x00-\x1f\x7f]/.test(tool.versionPrefix))) return fail();
    return {
      name: tool.name,
      ...(tool.command !== undefined ? { command: tool.command as string } : {}),
      ...(tool.environmentVariable !== undefined ? { environmentVariable: tool.environmentVariable as string } : {}),
      ...(tool.versionPrefix !== undefined ? { versionPrefix: tool.versionPrefix as string } : {}),
    };
  });
  return { contractType: "RuntimeRequirementsV1", contractVersion: "1.0", tools };
}

function environmentValue(environment: NodeJS.ProcessEnv, name: string) {
  const key = process.platform === "win32"
    ? Object.keys(environment).find(key => key.toLowerCase() === name.toLowerCase()) : name;
  return key ? environment[key] : undefined;
}

async function executableFile(path: string) {
  try {
    if (!(await stat(path)).isFile()) return false;
    if (process.platform === "win32" && ![".exe", ".com", ".cmd", ".bat"].includes(extname(path).toLowerCase())) return false;
    await access(path, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    return true;
  } catch { return false; }
}

async function resolveTool(tool: RuntimeToolV1, cwd: string, environment: NodeJS.ProcessEnv) {
  if (tool.environmentVariable) {
    const path = environmentValue(environment, tool.environmentVariable);
    return path && isAbsolute(path) && await executableFile(path) ? path : undefined;
  }
  const extensions = process.platform === "win32" && !extname(tool.command!)
    ? (environmentValue(environment, "PATHEXT") || ".COM;.EXE;.BAT;.CMD").split(";")
      .filter(extension => /^\.(exe|com|cmd|bat)$/i.test(extension)) : [""];
  // A relative PATH entry or cwd shadow must not make the proof depend on cwd.
  if (process.platform === "win32") {
    for (const extension of extensions)
      if (await executableFile(join(cwd, tool.command! + extension)))
        throw new Error("Command is shadowed by the working directory; use an absolute executable environment variable.");
  }
  for (const directory of (environmentValue(environment, "PATH") || "").split(delimiter)) {
    if (!isAbsolute(directory)) {
      for (const extension of extensions)
        if (await executableFile(resolve(cwd, directory, tool.command! + extension)))
          throw new Error("Command resolves through a relative PATH entry; use an absolute executable environment variable.");
      continue;
    }
    for (const extension of extensions) {
      const path = join(directory, tool.command! + extension);
      if (await executableFile(path)) return path;
    }
  }
  return undefined;
}

function probeVersion(executable: string, cwd: string, env: NodeJS.ProcessEnv): Promise<string> {
  let program = executable;
  let args = ["--version"];
  let windowsVerbatimArguments = false;
  if (process.platform === "win32" && /\.(cmd|bat)$/i.test(executable)) {
    if (/["%!\r\n]/.test(executable)) return Promise.reject(new Error("Unsafe batch executable path."));
    program = environmentValue(env, "ComSpec") || "cmd.exe";
    args = ["/d", "/s", "/c", `""${executable}" --version"`];
    windowsVerbatimArguments = true;
  }
  return new Promise((resolve, reject) => {
    execFile(program, args, { cwd, env, windowsHide: true, windowsVerbatimArguments, timeout: 5_000, maxBuffer: 8_192, encoding: "utf8" },
      (error, stdout, stderr) => {
        if (error) reject(new Error("Version probe failed, timed out, or exceeded its output limit."));
        else resolve((stdout || stderr).trim());
      });
  });
}

export async function checkRuntimeRequirementsV1(
  requirements: RuntimeRequirementsV1 | undefined,
  cwd: string,
  environment: NodeJS.ProcessEnv,
): Promise<RuntimeToolCheckV1[]> {
  if (!requirements) return [];
  const checks: RuntimeToolCheckV1[] = [];
  for (const tool of validateRuntimeRequirementsV1(requirements).tools) {
    try {
      const executable = await resolveTool(tool, cwd, environment);
      if (!executable) throw new Error(`Executable unavailable via ${tool.environmentVariable ? `environment variable ${tool.environmentVariable}` : `PATH command ${tool.command}`}.`);
      const version = await probeVersion(executable, cwd, environment);
      if (tool.versionPrefix && !version.startsWith(tool.versionPrefix))
        throw new Error(`Version does not start with ${JSON.stringify(tool.versionPrefix)}.`);
      checks.push({ name: tool.name, ok: true, detail: `${executable}: ${version}`, executable, version });
    } catch (error) {
      checks.push({ name: tool.name, ok: false, detail: error instanceof Error ? error.message : "Runtime unavailable." });
    }
  }
  return checks;
}

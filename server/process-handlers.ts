import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { createGisHandler, validateGisPackage, gisImplementationIdentity, type GisPackageV1 } from "./gis-quality.ts";
import { processSha, type ProcessHandler } from "./process-stages.ts";

/** Closed registration; configuration selects trusted code, never a module path. */
export type ProcessPackageV1 = {
  contractType: "ProcessPackageV1"; contractVersion: "1.0";
  handler: "gis-audit"; handlerVersion: "1"; configuration: GisPackageV1;
};
const path = typeof import.meta.url === "string" && import.meta.url.startsWith("file:") ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
export const processRegistryIdentity = { path, sha256: processSha(readFileSync(path)) };
const registered = {
  "gis-audit": { version: "1", validate: validateGisPackage, create: createGisHandler, implementation: () => gisImplementationIdentity },
} as const;
export function validateProcessPackage(value: ProcessPackageV1): ProcessPackageV1 {
  assert.deepEqual(Object.keys(value).sort(), ["configuration", "contractType", "contractVersion", "handler", "handlerVersion"]);
  assert.equal(value.contractType, "ProcessPackageV1"); assert.equal(value.contractVersion, "1.0");
  assert.ok(Object.hasOwn(registered, value.handler), "Unknown trusted process handler");
  const handler = registered[value.handler];
  assert.equal(value.handlerVersion, handler.version, "Unsupported process handler version");
  handler.validate(value.configuration);
  return structuredClone(value);
}
export function selectProcessPackage(value?: { gisPackage?: GisPackageV1; processPackage?: ProcessPackageV1 }): ProcessPackageV1 | undefined {
  if (!value) return undefined;
  assert.ok(!(value.gisPackage && value.processPackage), "Ambiguous process configuration");
  if (value.processPackage) return validateProcessPackage(value.processPackage);
  if (value.gisPackage) return validateProcessPackage({ contractType: "ProcessPackageV1", contractVersion: "1.0", handler: "gis-audit", handlerVersion: "1", configuration: value.gisPackage });
  return undefined;
}
export function registeredProcessImplementation(contract: ProcessPackageV1) {
  return registered[validateProcessPackage(contract).handler].implementation();
}
export async function createRegisteredProcessHandler(contract: ProcessPackageV1, options: Omit<Parameters<typeof createGisHandler>[0], "contract">): Promise<ProcessHandler> {
  const c = validateProcessPackage(contract);
  return registered[c.handler].create({ ...options, contract: c.configuration });
}

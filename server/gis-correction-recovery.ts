import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ProcessProgress } from './process-stages.ts';
export const preparedCorrectionImplementation = (() => {
  const path = typeof import.meta.url === 'string' && import.meta.url.startsWith('file:') ? fileURLToPath(import.meta.url) : resolve(process.argv[1]);
  return { path, sha256: createHash('sha256').update(readFileSync(path)).digest('hex') };
})();

export type PrelaunchSuccessorV1 = { contractType:'PrelaunchSuccessorV1'; contractVersion:'1.0'; runId:string; taskId:string; canonicalSha256:string; reservationSha256:string };
export type GISMechanicalCompatibilityV1 = { contractType:'GISMechanicalCompatibilityV1'; contractVersion:'1.0'; manifest:{path:string;sha256:string} };
export type PreparedCorrectionRecoveryV1 = {
  contractType: 'PreparedCorrectionRecoveryV1'; contractVersion: '1.0';
  diagnosticCoverage: 'retained-events-manual-v1';
  sourceSha256: string; invocationId: string; terminalSha256: string; toolsStateSha256: string;
  prelaunchSuccessor?: PrelaunchSuccessorV1;
  mechanicalCompatibility?: GISMechanicalCompatibilityV1;
};
export function validatePreparedCorrectionRecovery(value: unknown): PreparedCorrectionRecoveryV1 {
  const v = value as PreparedCorrectionRecoveryV1;
  assert.ok(v && typeof v === 'object' && !Array.isArray(v));
  assert.deepEqual(Object.keys(v).sort(), ['contractType','contractVersion','diagnosticCoverage','invocationId','sourceSha256','terminalSha256','toolsStateSha256', ...(v.prelaunchSuccessor === undefined ? [] : ['prelaunchSuccessor']), ...(v.mechanicalCompatibility === undefined ? [] : ['mechanicalCompatibility'])].sort());
  assert.equal(v.contractType, 'PreparedCorrectionRecoveryV1'); assert.equal(v.contractVersion, '1.0');
  assert.equal(v.diagnosticCoverage, 'retained-events-manual-v1');
  assert.match(v.invocationId, /^[a-f0-9]{32}$/);
  for (const h of [v.sourceSha256,v.terminalSha256,v.toolsStateSha256]) assert.match(h, /^[a-f0-9]{64}$/);
  if (v.prelaunchSuccessor !== undefined) {
    const s=v.prelaunchSuccessor;
    assert.deepEqual(Object.keys(s).sort(), ['canonicalSha256','contractType','contractVersion','reservationSha256','runId','taskId']);
    assert.equal(s.contractType,'PrelaunchSuccessorV1'); assert.equal(s.contractVersion,'1.0');
    for(const id of [s.runId,s.taskId]) assert.match(id,/^[a-z0-9]+-[a-z0-9]+$/);
    for(const h of [s.canonicalSha256,s.reservationSha256]) assert.match(h,/^[a-f0-9]{64}$/);
    assert.ok(v.mechanicalCompatibility,'Prelaunch successor requires mechanical compatibility');
  }
  if (v.mechanicalCompatibility !== undefined) {
    const m=v.mechanicalCompatibility;
    assert.deepEqual(Object.keys(m).sort(), ['contractType','contractVersion','manifest']);
    assert.equal(m.contractType,'GISMechanicalCompatibilityV1'); assert.equal(m.contractVersion,'1.0');
    assert.deepEqual(Object.keys(m.manifest).sort(), ['path','sha256']);
    assert.ok(isAbsolute(m.manifest.path) && resolve(m.manifest.path)===m.manifest.path);
    assert.match(m.manifest.sha256,/^[a-f0-9]{64}$/);
  }
  return structuredClone(v);
}
export function assertPrelaunchPredecessor(run:any, task:any, originalOwner:any, binding:PreparedCorrectionRecoveryV1, nativeBeforeCommand:string) {
  const s=binding.prelaunchSuccessor!;
  assert.equal(run.id,s.runId); assert.equal(run.status,'failed');
  assert.equal(run.tasks.filter((t:any)=>t.id===s.taskId).length,1); assert.equal(task.id,s.taskId); assert.equal(task.status,'failed');
  assert.equal(task.exitCode,1); assert.equal(task.timedOut,false);
  assert.ok(task.startedAt && task.finishedAt && Date.parse(task.finishedAt)>=Date.parse(task.startedAt));
  assert.equal(task.authorizationEvidence?.decision,'authorized');
  assert.deepEqual(task.preparedCorrectionReservation,originalOwner); assert.equal(originalOwner.runId,run.id); assert.equal(originalOwner.taskId,task.id);
  const previous=task.recovery?.preparedCorrection;
  assert.ok(previous && !previous.prelaunchSuccessor && !previous.mechanicalCompatibility,'Successor chains are forbidden');
  for(const name of ['sourceSha256','invocationId','terminalSha256','toolsStateSha256','diagnosticCoverage']) assert.equal(previous[name],(binding as any)[name]);
  assert.equal(task.executionKind?.kind,'recovery');
  assert.deepEqual(task.recovery,task.authorizationEvidence.recovery);
  for(const name of ['processProgress','gisProgress','executionAttempts','attempts','providerRuntimeIdentity','providerRuntimeDecision','usage','reviewStatus','reviewFailure','reviewOutput','reviewArtifactEvidence','finalOutput','executorOutcome','executionBudgetCarriedCompletion']) assert.equal(task[name],undefined,`Launched or ambiguous predecessor: ${name}`);
  for(const name of ['agentToolInvocations','agentReports','agentToolStateReceipts','structuredReviewInvocations','structuredReviews','reviewTransportRecoveries','verificationEvidence','publicationEvidence','executionBudgetEvidence','changedFiles','reviewWriteViolations']) assert.ok(task[name]===undefined || Array.isArray(task[name]) && task[name].length===0,`Launched or ambiguous predecessor: ${name}`);
  const receipts=task.preconditionEvidence;
  assert.ok(Array.isArray(receipts) && receipts.length>0 && receipts.length<=task.preconditions.length);
  assert.deepEqual(receipts.map((r:any)=>r.command),task.preconditions.slice(0,receipts.length));
  assert.equal(receipts.at(-1).command,nativeBeforeCommand);
  for(const [i,r] of receipts.entries()) { assert.equal(r.timedOut,false); assert.ok(!r.cancelled); assert.equal(r.exitCode,i===receipts.length-1?1:0); }
}
export function assertMechanicalManifestCompatibility(source:any, replacement:any, currentHashes:Map<string,string>) {
  assert.ok(Array.isArray(source.mechanicalEvidence) && source.mechanicalEvidence.length>0);
  assert.equal(new Set(source.mechanicalEvidence.map((e:any)=>e.path)).size,source.mechanicalEvidence.length,'Duplicate mechanical file');
  const expected=structuredClone(source); let changed=false;
  for(const e of expected.mechanicalEvidence) {
    assert.deepEqual(Object.keys(e).sort(),['path','sha256']);
    assert.match(e.sha256,/^[a-f0-9]{64}$/);
    const current=currentHashes.get(e.path); assert.ok(current); assert.match(current,/^[a-f0-9]{64}$/);
    changed ||= current!==e.sha256; e.sha256=current;
  }
  assert.ok(changed,'Compatibility must bind actual mechanical drift');
  assert.deepEqual(replacement,expected,'Only mechanical SHA-256 updates are allowed');
}
export function preparedCorrectionSource(p: ProcessProgress) {
  assert.equal(p.contractType, 'ProcessProgressV1');
  assert.deepEqual(p.baseline, p.inputs, 'Prepared source must retain an input-only baseline');
  assert.equal(p.phase, 'prepared'); assert.equal(p.failure?.stage, 'prepared'); assert.equal(p.failure?.kind, 'result-defect');
  assert.equal(p.attempts.publication, 0);
  const corrections = p.history.filter(h => h.stage === 'analysis-correction');
  assert.ok(corrections.length > 0 && corrections.length <= 2);
  assert.equal(p.attempts.executor, corrections.length + 1);
  assert.equal(p.attempts.review, corrections.length); assert.equal(p.attempts.verification, corrections.length);
  const last = corrections.at(-1)!;
  const receipt = last.receipt as { feedback: string; archived: string; artifacts: Record<string,string>; correctionTargets?: number[] };
  assert.ok(receipt?.feedback?.trim() && Buffer.byteLength(receipt.feedback) <= 16_384);
  assert.equal(last.result, createHash('sha256').update(receipt.feedback.trim().replace(/\s+/gu,' ')).digest('hex'));
  const index = p.history.lastIndexOf(last), review = p.history.slice(0,index).filter(h => h.stage === 'review').at(-1);
  assert.equal(review?.result, 'changes_requested');
  assert.ok(!p.history.slice(index + 1).some(h => ['review','analysis-patch','publication'].includes(h.stage)), 'Ambiguous correction outcome');
  return receipt;
}
// Retained diagnostics do not cover every item event or stderr channel. The
// approval-bound manual coverage opt-in acknowledges that historical limitation;
// these assertions concern only the complete retained top-level diagnostic set.
export function assertClosedCorrectionFailure(terminal: any, state: any, identity: any) {
  assert.deepEqual(terminal.identity, identity); assert.deepEqual(state.identity, identity);
  assert.equal(state.status, 'closed'); assert.equal(state.validations, 0);
  assert.equal(terminal.code, 1); assert.equal(terminal.timedOut, false); assert.equal(terminal.cancelled, false);
  assert.equal(terminal.success, false); assert.equal(terminal.failure, true);
  assert.equal(terminal.counts.completed, 0); assert.equal(terminal.counts.failed, 1);
  assert.equal(terminal.counts.malformed, 0); assert.equal(terminal.counts.afterTerminal, 0);
  const evidence = terminal.evidence;
  assert.ok(Array.isArray(evidence) && evidence.length > 0 && evidence.length < 16);
  assert.equal(evidence.filter((e:any) => e.type === 'error').length, terminal.counts.errors);
  assert.equal(evidence.filter((e:any) => e.type === 'turn.failed').length, 1);
  for (const e of evidence) {
    assert.ok(['error','turn.failed'].includes(e.type)); assert.equal(typeof e.raw,'string');
    assert.equal(createHash('sha256').update(e.raw).digest('hex'), e.sha256); assert.equal(Buffer.byteLength(e.raw),e.bytes);
    const event = JSON.parse(e.raw); assert.equal(event.type,e.type);
    const message = event.type === 'error' ? event.message : event.error?.message;
    assert.equal(typeof message,'string');
    assert.match(message,/^(?:Reconnecting\.\.\. [1-5]\/5 \()?unexpected status 403 Forbidden:[\s\S]*, url: (?:wss|https):\/\/chatgpt\.com\/backend-api\/codex\/responses, cf-ray: [A-Za-z0-9-]+\)?$/u);
  }
}
export async function reservePreparedCorrection(file: string, owner: { runId:string; taskId:string; sourceSha256:string; invocationId:string }) {
  const bytes = JSON.stringify(owner);
  try { await writeFile(file,bytes,{flag:'wx'}); }
  catch (e) { if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e; assert.equal(await readFile(file,'utf8'),bytes,'Prepared correction recovery already reserved'); }
}
export async function assertPreparedCorrectionReservation(file: string, owner: { runId:string; taskId:string; sourceSha256:string; invocationId:string }) {
  assert.ok(await readFile(file,'utf8') === JSON.stringify(owner),'Prepared correction recovery reservation changed');
}

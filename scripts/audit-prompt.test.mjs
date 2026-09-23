import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
test('versioned audit v2 template explicitly preserves all four coverage fields',async()=>{
 const text=await readFile(new URL('../templates/audit-v2.prompt.md',import.meta.url),'utf8');
 for(const slot of ['{{QUESTIONS_JSON}}','{{CONTEXT_JSON}}'])assert.equal(text.split(slot).length,2);
 assert.match(text,/exactly four fields: id, case, evidence, status/);
 assert.match(text,/Do not omit, shorten or paraphrase case/);
 assert.match(text,/Copy each entire coverageCases object unchanged/);
 assert.match(text,/No prose, citations field, testsExecuted field or additional claims/);
 assert.match(text,/Other project tests not supplied here are unknown, not absent/);
 assert.match(text,/Do not execute gates or read contracts, historical answers or run records/);
 // This verifies template delivery, not model compliance or semantic completeness.
});

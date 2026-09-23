import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyAuditAnswer} from './audit-evidence.mjs';

// Gate regression fixtures, not an oracle for an external application's code.
// Each generalization is replaced by a bounded input or operation sequence.
const path='src/display.test.ts';
const coverage=[{id:'unknown-display',case:'Unknown localized display in supplied src/display.test.ts only',status:'covered',evidence:[{path,lines:[1,2]}]}];
const facts={
  upperFallback:'FOO BAR',lowerFallback:'Foo bar',spacedBoolean:' true ',
  notifyCallsAfterTwoErrors:2,visibleAfterDismissAndError:0,
  explicitZeroTtl:0,visibleAfterDismissSourceAndError:0,
  absent:null,zero:0,
};
const loaded={contract:{version:2,facts,coverage},contractSha256:'a'.repeat(64),sources:[{path}]};
const answer=p=>'```json\n'+JSON.stringify(p)+'\n```\nORCHESTRATOR_EXECUTOR_OUTCOME_V1: COMPLETED';
const payload=()=>structuredClone({facts,coverage});

test('v2 rejects each of eight seeded structured error occurrences, including subtle generalizations',()=>{
  const mutations=[
    ['single-case',p=>{p.facts.upperFallback='Foo bar';}],
    ['multiple-coverage',p=>{p.coverage[0].status='not-covered';}],
    ['multiple-case',p=>{p.facts.upperFallback='Foo bar';}],
    ['multiple-whitespace',p=>{p.facts.spacedBoolean='Да';}],
    ['dismiss-key',p=>{p.facts.visibleAfterDismissAndError=1;}],
    ['handler-calls',p=>{p.facts.notifyCallsAfterTwoErrors=1;}],
    ['zero-ttl',p=>{p.facts.explicitZeroTtl=5000;}],
    ['source-after-dismiss',p=>{p.facts.visibleAfterDismissSourceAndError=1;}],
  ];
  for(const [id,mutate] of mutations){
    const p=payload();mutate(p);
    assert.throws(()=>verifyAuditAnswer(answer(p),loaded),/AUDIT_(FACT|COVERAGE)_MISMATCH/,id);
  }
  for(const first of [1,4]){
    const p=payload();for(const [,mutate] of mutations.slice(first,first+3))mutate(p);
    assert.throws(()=>verifyAuditAnswer(answer(p),loaded),/AUDIT_(FACT|COVERAGE)_MISMATCH/);
  }
});

test('v2 accepts exact structured controls and rejects omissions, extra claims, null/zero confusion',()=>{
  for(let repeat=0;repeat<2;repeat++){
    const result=verifyAuditAnswer(answer(payload()),loaded);
    assert.deepEqual(result.facts,facts);assert.deepEqual(result.coverage,coverage);
    assert.equal(result.narrativeStatus,'not-permitted');
  }
  for(const mutate of [
    p=>{delete p.facts.upperFallback;},p=>{p.facts.zero=null;},
    p=>{delete p.facts.absent;},p=>{p.facts.uncheckedClaim='Always safe';},
    p=>{p.comment='All tests passed';},p=>{p.coverage=[];},
  ]){const p=payload();mutate(p);assert.throws(()=>verifyAuditAnswer(answer(p),loaded),/AUDIT_/);}
});

test('v2 never promotes contradictory or correct free prose into a verified result',()=>{
  const valid=answer(payload());
  for(const claim of [
    'Case never affects display.', 'Any unknown entity is untested.',
    'Boolean whitespace is trimmed.', 'Dismiss permits the next error.',
    'Dedupe prevents handler calls.', 'Zero TTL uses the default.',
    'Source cleanup clears dismissed keys.', 'Only exact boolean strings are translated.',
  ])for(const text of [claim+'\n'+valid,valid+'\n'+claim])
    assert.throws(()=>verifyAuditAnswer(text,loaded),/AUDIT_UNSTRUCTURED_CLAIM/);
});

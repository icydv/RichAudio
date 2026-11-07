import test from 'node:test';
import assert from 'node:assert/strict';
import {compareBatiAccelerationRedirect01} from '../tools/Compare-BatiAccelerationRedirect01.mjs';

function authoredProjection(){
  const identities=[
    ['vehicle','Dat151Vehicle','VehicleAudioRecord'],
    ['granular','Dat151VehicleEngineGranular','GranularRecord'],
    ['engine','Dat54GranularSound','Sounds.EngineAccel'],
    ['exhaust','Dat54EnvironmentSound','Sounds.ExhaustAccel'],
    ['npc','Dat54GranularSound','Sounds.EngineAccelNPC'],
  ];
  const Nodes=identities.map(([Id,ParserType],index)=>({
    Id,Record:{ParserType,Hash:String(index+1).padStart(8,'0')},
    SourceBinding:{State:'exact-rel-metadata-bytes-sha256',SHA256:'a'.repeat(64)},
  }));
  const Edges=[
    ['vehicle','EngineGranular','granular'],['granular','EngineAccel','engine'],
    ['granular','EngineAccelNPC','npc'],['granular','ExhaustAccel','exhaust'],
    ['granular','ExhaustAccelNPC','exhaust'],['npc','ParentSound','engine'],
  ].map(([From,Field,to])=>({
    From,Field,Targets:[to],Hash:'0x'+Nodes.find(node=>node.Id===to).Record.Hash,
    Resolution:'unique-public-audio-record',
  }));
  const Roots=identities.map(([NodeId,,Label])=>({NodeId,Label,State:'resolved-metadata-root'}));
  return {Kind:'RichAudioBatiAudioDependencyGraph01',Nodes,Edges,Roots};
}

test('private field redirects keep retained engine and exhaust aliases on the original records',()=>{
  const input=authoredProjection(), before=structuredClone(input);
  const result=compareBatiAccelerationRedirect01(input);
  assert.deepEqual(input,before);
  assert.equal(result.privateRecordCount,4);
  assert.equal(result.sameModelNeighborGraphUnchanged,true);
  assert.deepEqual(result.routeComparisons.map(row=>row.retainedInboundReferences),[['ParentSound'],['ExhaustAccelNPC']]);
  for(const route of result.routeComparisons){
    assert.equal(route.originalRecordReachableThroughRetainedFields,true);
    assert.equal(route.selectedFieldResolvesToPrivateRecord,true);
    assert.equal(route.privateRecordReachableThroughRetainedFields,false);
    assert.equal(route.privateRecordReachableFromNeighbor,false);
  }
  assert.equal(result.effectiveBaselineReadBack,false);
  assert.equal(result.runtimeAssignmentEnabled,false);
  assert.equal(result.selectiveSuppressionVerified,false);
});

test('a missing source binding, ambiguous edge or inconsistent hash blocks the redirect experiment',()=>{
  for(const [mutate,error] of [
    [g=>g.Nodes[0].SourceBinding=null,/unbound typed audio root/],
    [g=>g.Edges.push({...g.Edges[1]}),/ambiguous or mismatched audio reference/],
    [g=>g.Edges[1].Hash='0xffffffff',/ambiguous or mismatched audio reference/],
    [g=>g.Edges[1].Targets=['npc'],/ambiguous or mismatched audio reference/],
  ]){
    const graph=authoredProjection();
    mutate(graph);
    assert.throws(()=>compareBatiAccelerationRedirect01(graph),error);
  }
});

import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';
import {compareBatiAccelerationRedirect01} from '../../tools/Compare-BatiAccelerationRedirect01.mjs';
import {OfflineOwnershipPolicy, requiredEvidence} from '../../src/acoustics/ownership/policy.mjs';

const a = {session:'shadow-fixture',handle:7,generation:1,model:0xf9300cc5};
const b = {...a,handle:8};
const key = ({session,handle,generation,model})=>JSON.stringify([session,handle,generation,model]);
const original = 'authored-prior-script-override';
const baseline = {kind:'authored-exact-profile',known:true,profile:original,identityKey:key(a)};
const certificate = {kind:'authored-fixture-assumptions',build:'authored',components:['engine','exhaust'],
  ...Object.fromEntries(requiredEvidence.map(field=>[field,true]))};
const measurement = {identity:a,kind:'independent-fixture-measurement',unrelatedPreserved:true};

if (process.argv[2] === '--controller-fixture') {
  const policy = new OfflineOwnershipPolicy({identity:a,build:'authored',mode:'authored-fixture'});
  process.on('message', ({action,frame,transaction})=>{
    if (action === 'prepare') {
      assert(policy.observe({identity:a,acquiredFrame:frame,receivedFrame:frame}));
      assert(policy.prepare({identity:a,frame,replacementHealthy:true,baseline,certificate}));
      process.send(policy.takeover({identity:a,frame}));
    } else if (action === 'ack') {
      process.send({accepted:policy.acknowledge({...measurement,frame,transaction,nativeSuppressed:true,replacementAudible:true})});
    } else if (action === 'host-loss') {
      process.send(policy.health({identity:a,frame,replacementHealthy:false}));
    } else if (action === 'restore-ack') {
      process.send({accepted:policy.acknowledge({...measurement,frame,transaction,nativeRestored:true}),state:policy.state});
    }
  });
} else {
  // The authoritative profile table and lease clock belong to this process.
  // The disposable controller process has no direct access to either.
  function authority(shadow) {
    const slots = new Map([[a.handle,{identity:a,profile:original}],[b.handle,{identity:b,profile:original}]]);
    let lease = null;
    const consumed = new Set();
    const select = (command, frame)=>{
      const slot = slots.get(command.identity.handle), identity = key(command.identity);
      const request = JSON.stringify([identity,command.id]);
      if (lease || !slot || identity !== key(slot.identity) || command.action !== 'exclusive-handoff' ||
          consumed.has(request) || frame >= command.deadlineFrame || command.baseline.identityKey !== identity ||
          command.baseline.profile !== slot.profile) return false;
      consumed.add(request);
      lease = {command:structuredClone(command),slot,identity};
      slot.profile = shadow.root.name;
      return true;
    };
    const restore = ()=>{
      if (!lease) return 'no-lease';
      const {slot,identity,command} = lease;
      lease = null;
      const current = slots.get(command.identity.handle);
      if (!current || current !== slot || key(current.identity) !== identity) return 'lifetime-changed';
      if (current.profile !== shadow.root.name) return 'external-profile-change';
      current.profile = command.baseline.profile;
      return 'restored';
    };
    return {slots,select,
      expire(frame){return lease && frame >= lease.command.deadlineFrame ? restore() : 'not-due';},
      release(command,frame){
        if (!lease || command.action !== 'restore-exact-baseline' || frame >= command.deadlineFrame ||
            key(command.identity) !== lease.identity || command.id !== lease.command.id + 1 ||
            JSON.stringify(command.baseline) !== JSON.stringify(lease.command.baseline)) return 'stale-request';
        return restore();
      },
    };
  }

  async function startController(t) {
    const child = fork(fileURLToPath(import.meta.url), ['--controller-fixture'], {execArgv:[]});
    const closed = once(child,'exit');
    t.after(async()=>{if(child.exitCode===null && child.signalCode===null)child.kill(); await closed;});
    return {
      async request(message) {
        const response = once(child,'message',{signal:AbortSignal.timeout(2000)});
        child.send(message);
        return (await response)[0];
      },
      async kill() {assert(child.kill('SIGKILL')); await closed;},
    };
  }

  const directory = process.argv[2];
  const {shadow} = JSON.parse(readFileSync(path.join(directory,'authored-plan.json'),'utf8'));
  const graph = JSON.parse(readFileSync(path.join(directory,'authored-catalogue.json'),'utf8')).Vehicles[0].AudioDependencyGraph01;
  const options = {continuous:true,shadowNamespace:'ra_shadow_2222444466668888'};

  test('real topology planner separates twelve links and refuses namespace collisions or untyped relocation', ()=>{
    const result = compareBatiAccelerationRedirect01(graph,options);
    assert.deepEqual(result.shadow,shadow);
    assert.equal(result.sameModelNeighborGraphUnchanged,true);
    assert(shadow.disabled);
    assert.equal(shadow.records.flatMap(record=>record.relocations).length,12);
    const root = shadow.records.find(record=>record.name===shadow.root.name);
    const granular = shadow.records.find(record=>record.role==='EngineGranular');
    for (const field of ['Horns','Collision','Unk29']) assert(root.preserved.some(edge=>edge.field===field));
    assert.equal(granular.relocations.find(row=>row.field==='ExhaustAccel').from,
      granular.preserved.find(row=>row.field==='ExhaustAccelNPC').hash);
    const collision = structuredClone(graph);
    collision.Edges.find(row=>row.Field==='Unk29').Hash = shadow.root.hash;
    assert.throws(()=>compareBatiAccelerationRedirect01(collision,options),/name hash collision/);
    const wrongType = structuredClone(graph);
    wrongType.Edges.find(row=>row.Field==='EngineGranular').DeclaredType = 'System.UInt32';
    assert.throws(()=>compareBatiAccelerationRedirect01(wrongType,options),/Untyped relocation/);
  });

  test('two identical vehicles and actual policy preserve exact authored override after host loss', {timeout:6000}, async t=>{
    const store = authority(shadow);
    const controller = await startController(t);
    const cmd = await controller.request({action:'prepare',frame:1});
    assert.equal(store.select({...cmd,identity:b},1),false);
    assert(store.select(cmd,1));
    assert.equal(store.slots.get(a.handle).profile,shadow.root.name);
    assert.equal(store.slots.get(b.handle).profile,original);
    assert.deepEqual(await controller.request({action:'ack',frame:2,transaction:cmd.id}),{accepted:true});
    const restore = await controller.request({action:'host-loss',frame:3});
    assert.equal(store.release({...restore,id:cmd.id},3),'stale-request');
    assert.equal(store.release(restore,3),'restored');
    assert.deepEqual(await controller.request({action:'restore-ack',frame:4,transaction:restore.id}),{accepted:true,state:'NativeOnly'});
    assert.equal(store.slots.get(a.handle).profile,original);
    assert.equal(store.select(cmd,4),false);
  });

  for (const change of ['none','retired','recycled','external-override']) {
    test('controller process death and authored lease expiry with '+change, {timeout:6000}, async t=>{
      const store = authority(shadow);
      const controller = await startController(t);
      const cmd = await controller.request({action:'prepare',frame:1});
      assert(store.select(cmd,1));
      assert.deepEqual(await controller.request({action:'ack',frame:2,transaction:cmd.id}),{accepted:true});
      await controller.kill();
      if (change==='retired') store.slots.delete(a.handle);
      if (change==='recycled') store.slots.set(a.handle,{identity:{...a,generation:2},profile:'new-occupant'});
      if (change==='external-override') store.slots.get(a.handle).profile='new-external-override';
      assert.equal(store.expire(cmd.deadlineFrame-1),'not-due');
      assert.equal(store.expire(cmd.deadlineFrame),{
        none:'restored',retired:'lifetime-changed',recycled:'lifetime-changed','external-override':'external-profile-change',
      }[change]);
      assert.equal(store.slots.get(a.handle)?.profile,{
        none:original,retired:undefined,recycled:'new-occupant','external-override':'new-external-override',
      }[change]);
      assert.equal(store.slots.get(b.handle).profile,original);
      assert.equal(store.select(cmd,cmd.deadlineFrame),false);
    });
  }
}

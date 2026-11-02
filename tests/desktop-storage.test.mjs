import test from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../.desktop-tests/tasks.mjs';
import * as s from '../.desktop-tests/storage.mjs';

let payload=null,revision=0,checkpoints=[],calls=[],failWrite=false,cancelExport=false;
globalThis.isTauri=true;
globalThis.window={__TAURI_INTERNALS__:{invoke:async(command,args={})=>{
 calls.push(command);
 if(command==='read_document')return {payload,revision};
 if(command==='read_state')return {memory:payload?JSON.parse(payload).memory:null,revision};
 if(command==='write_state'){assert.equal(args.expectedRevision,revision);if(failWrite)throw new Error('simulated disk failure');const old=payload?JSON.parse(payload):{format:'youxu-full-backup',version:2,createdAt:new Date().toISOString(),assets:[]};old.memory=JSON.parse(args.memory);const retained=new Set(old.memory.resources.map(r=>r.blobId));old.assets=old.assets.filter(a=>retained.has(a.id));payload=JSON.stringify(old);revision++;return;}
 if(command==='write_document'){
  assert.equal(args.expectedRevision,revision);
  if(failWrite)throw new Error('simulated disk failure');
  if(args.restoring&&payload)checkpoints.push(payload);
  payload=args.payload;revision++;return;
 }
 if(command==='export_document')return !cancelExport;
 if(command==='list_snapshots')return [];
 throw new Error('Unexpected command '+command);
}}};
globalThis.FileReader=class {
 readAsDataURL(blob){blob.arrayBuffer().then(bytes=>{this.result='data:application/octet-stream;base64,'+Buffer.from(bytes).toString('base64');this.onload();});}
};
function reset(){payload=null;revision=0;checkpoints=[];calls=[];failWrite=false;cancelExport=false;}
function fixture(){
 let m=t.clearSamples(t.createMemory());
 m=t.saveTask(m,{title:'Synthetic research task',project:'research',parentId:null,dueDate:null,notes:'public test fixture',outcome:'',problem:'',nextStep:''},null,null);
 m={...m,journals:[{date:t.localToday(),reflection:'work reflection',comment:'',progress:t.emptyProgress(),taskIds:[m.tasks[0].id],updatedAt:new Date().toISOString()}],moodEntries:[{date:t.localToday(),score:8,reflection:'private test diary',updatedAt:new Date().toISOString()}]};
 m=t.transitionWork(m,'start',Date.now()-10000);m=t.transitionWork(m,'finish',Date.now()-5000);return m;
}
test('desktop storage never opens IndexedDB; serial mutations retain both updates',async()=>{
 reset();await s.changeMemory(()=>fixture());
 await Promise.all([s.changeMemory(m=>({...m,tasks:m.tasks.map(x=>({...x,notes:'edited'}))})),s.changeMemory(m=>({...m,moodEntries:m.moodEntries.map(x=>({...x,score:9}))}))]);
 const memory=await s.readMemory();assert.equal(memory.tasks[0].notes,'edited');assert.equal(memory.moodEntries[0].score,9);assert.equal(revision,3);assert.equal(calls.includes('read_document'),false);assert.equal(calls.includes('write_document'),false);
});
test('browser JSON migrates losslessly into desktop and exports back with binary attachment',async()=>{
 reset();const memory=fixture(),id=crypto.randomUUID();
 memory.resources=[{id,taskId:memory.tasks[0].id,kind:'paper',mode:'copy',name:'synthetic.txt',path:'',blobId:id,mime:'text/plain',size:5,createdAt:new Date().toISOString()}];
 const browser={date:t.localToday(),createdAt:new Date().toISOString(),memory,assets:[{id,name:'synthetic.txt',mime:'text/plain',blob:new Blob(['hello'])}]};
 const imported=s.parseBackup(JSON.parse(await s.serializeSnapshot(browser)));
 await s.restoreSnapshot(imported);
 const captured=await s.captureCurrent();
 for(const key of ['tasks','journals','moodEntries','records','workdays','resources'])assert.deepEqual(captured.memory[key],memory[key],key);
 assert.equal(await captured.assets[0].blob.text(),'hello');
 assert.equal(JSON.parse(await s.serializeSnapshot(captured)).assets[0].data,'aGVsbG8=');
});
test('restore preserves today finished lock and creates a pre-restore checkpoint',async()=>{
 reset();const current=fixture();await s.changeMemory(()=>current);
 const old={...fixture(),workdays:[],journals:[]};await s.restoreSnapshot({date:t.localToday(),createdAt:new Date().toISOString(),memory:old,assets:[]});
 assert.equal(checkpoints.length,1);assert.deepEqual(JSON.parse(checkpoints[0]).memory.journals,current.journals);
 assert.deepEqual((await s.readMemory()).workdays,current.workdays);
});
test('corrupt attachment rejects import without changing any current record',async()=>{
 reset();await s.changeMemory(()=>fixture());const before=payload,rev=revision;
 const raw=JSON.parse(payload);raw.assets=[{id:'x',name:'broken',mime:'text/plain',size:8,data:'YQ=='}];
 assert.throws(()=>s.parseBackup(raw));assert.equal(payload,before);assert.equal(revision,rev);
});
test('failed native save leaves old state intact and does not poison the mutation queue',async()=>{
 reset();await s.changeMemory(()=>fixture());const before=payload;failWrite=true;
 await assert.rejects(s.changeMemory(m=>({...m,journals:[]})),/disk failure/);assert.equal(payload,before);
 failWrite=false;await s.changeMemory(m=>({...m,tasks:m.tasks.map(x=>({...x,notes:'after failure'}))}));assert.equal((await s.readMemory()).tasks[0].notes,'after failure');
});
test('cancelled export rejects, so confirm-restore cannot proceed after cancellation',async()=>{
 reset();await s.changeMemory(()=>fixture());cancelExport=true;await assert.rejects(s.exportBackup(),/取消/);assert.equal(checkpoints.length,0);
});
test('resource deletion removes only its own attachment, leaving journal and work history',async()=>{
 reset();await s.changeMemory(()=>fixture());const m=await s.readMemory();
 const id=crypto.randomUUID(),file=new File(['bytes'],'sample.txt',{type:'text/plain'});
 await s.addResource({id,taskId:m.tasks[0].id,kind:'paper',mode:'copy',name:file.name,path:'',blobId:id,mime:file.type,size:file.size,createdAt:new Date().toISOString()},file);
 assert.equal(await (await s.resourceBlob(id)).blob.text(),'bytes');await s.removeResource(id);
 const captured=await s.captureCurrent();assert.equal(captured.assets.length,0);assert.deepEqual(captured.memory.journals,m.journals);assert.deepEqual(captured.memory.workdays,m.workdays);
});

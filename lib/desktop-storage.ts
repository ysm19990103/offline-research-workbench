import {native} from './desktop';
import {createMemory,localToday,reconcileMemory,restoreMemory,saveTask,validateBackup,type Memory,type Resource} from './tasks';
import {parseBackup,serializeSnapshot,type Snapshot,type StoredAsset,type BackupInfo,type DiskStatus} from './storage';

type Document={revision:number;payload:string|null};
// Never retry a user mutation silently after a conflicting revision.
let queue:Promise<unknown>=Promise.resolve();
const serial=<T>(fn:()=>Promise<T>):Promise<T>=>{const next=queue.then(fn);queue=next.catch(()=>{});return next;};
const snapshotOf=(memory:Memory,assets:StoredAsset[]):Snapshot=>({date:localToday(),createdAt:new Date().toISOString(),memory,assets});
async function read(){const doc=await native<Document>('read_document');return {...doc,snapshot:doc.payload?parseBackup(JSON.parse(doc.payload)):snapshotOf(createMemory(),[])};}
function retain(memory:Memory,assets:StoredAsset[]){const ids=new Set(memory.resources.filter(r=>r.mode==='copy').map(r=>r.blobId));return assets.filter(a=>ids.has(a.id));}
async function write(doc:Document,memory:Memory,assets:StoredAsset[],restoring=false){
 const checked=validateBackup({...memory,updatedAt:new Date().toISOString()});
 // Round trip checks all attachment references before crossing the native boundary.
 const payload=await serializeSnapshot(snapshotOf(checked,retain(checked,assets)));parseBackup(JSON.parse(payload));
 await native('write_document',{payload,expectedRevision:doc.revision,restoring});return checked;
}
export const desktopRead=()=>serial(async()=> (await read()).snapshot.memory);
export const desktopChange=(fn:(m:Memory)=>Memory)=>serial(async()=>{const doc=await read();return write(doc,fn(doc.snapshot.memory),doc.snapshot.assets);});
export const desktopCapture=()=>serial(async()=>{const doc=await read();return {...doc.snapshot,memory:reconcileMemory(doc.snapshot.memory)};});
export const desktopDaily=()=>serial(async()=>{
 // Persist an initial state before the native daily worker takes its first snapshot.
 const doc=await read();if(!doc.payload)await write(doc,doc.snapshot.memory,[]);
 const payload=await native<string>('ensure_daily_backup');const snapshot=parseBackup(JSON.parse(payload));return snapshot;
});
export const desktopList=()=>native<BackupInfo[]>('list_snapshots');
export const desktopSnapshot=async(key:string)=>{const payload=await native<string>('read_snapshot',{key});const snapshot=parseBackup(JSON.parse(payload));return {...snapshot,date:JSON.parse(payload).createdAt.slice(0,10)};};
export const desktopRestore=(incoming:Snapshot)=>serial(async()=>{
 // Validate before native code creates the mandatory recovery point and commits atomically.
 const snapshot=parseBackup(JSON.parse(await serializeSnapshot(incoming))),doc=await read();
 return write(doc,restoreMemory(doc.snapshot.memory,snapshot.memory),snapshot.assets,true);
});
export const desktopAdd=(resource:Resource,file?:File)=>serial(async()=>{
 const doc=await read();let current=doc.snapshot.memory;const target=current.tasks.find(t=>t.id===resource.taskId);if(!target)throw new Error('关联事项不存在。');
 if(target.sample)current=saveTask(current,target,target.id,target.completedOn);
 if(file&&file.size>50*1024*1024)throw new Error('单份资料副本限 50 MB。');
 if(current.resources.reduce((s,r)=>s+r.size,0)+(file?.size??0)>200*1024*1024)throw new Error('资料副本总量限 200 MB。');
 const assets=[...doc.snapshot.assets];if(file)assets.push({id:resource.blobId!,name:file.name,mime:file.type,blob:file});
 return write(doc,{...current,resources:[...current.resources,resource]},assets);
});
export const desktopRemove=(id:string)=>serial(async()=>{const doc=await read();return write(doc,{...doc.snapshot.memory,resources:doc.snapshot.memory.resources.filter(r=>r.id!==id)},doc.snapshot.assets);});
export const desktopAsset=(id:string)=>serial(async()=>{const asset=(await read()).snapshot.assets.find(a=>a.id===id);if(!asset)throw new Error('资料副本缺失，请重新导入。');return asset;});
export const desktopDisk=()=>native<DiskStatus>('backup_status');
export const desktopConnect=()=>native<DiskStatus>('choose_backup_directory');
export const desktopDisconnect=()=>native<void>('disconnect_backup_directory');
export async function desktopExport(snapshot:Snapshot,filename:string){const saved=await native<boolean>('export_document',{payload:await serializeSnapshot(snapshot),filename});if(!saved)throw new Error('已取消导出，未执行恢复。');}

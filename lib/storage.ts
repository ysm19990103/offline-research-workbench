import {createMemory,localToday,validateBackup,reconcileMemory,restoreMemory,saveTask,type Memory,type Resource} from './tasks';
const DB_NAME='offline-research-workbench-v1'; // Isolated storage for this source distribution.
let database:Promise<IDBDatabase>|undefined;
export type StoredAsset={id:string;name:string;mime:string;blob:Blob};
export type Snapshot={date:string;createdAt:string;memory:Memory;assets:StoredAsset[]};
export type BackupInfo={date:string;createdAt:string;tasks:number;assets:number};
type Directory=FileSystemDirectoryHandle&{queryPermission:(o:{mode:'readwrite'})=>Promise<PermissionState>;requestPermission:(o:{mode:'readwrite'})=>Promise<PermissionState>};
type DiskConfig={handle:Directory;writtenOn:string|null};
export type DiskStatus={state:'unconfigured'|'permission'|'saved'|'error';name?:string;date?:string;message?:string};

function openDatabase(){
 if(!database)database=new Promise<IDBDatabase>((resolve,reject)=>{
  if(!window.indexedDB){reject(new Error('浏览器不支持本地保存，请使用允许保存网站数据的 Chrome 或 Edge。'));return;}
  const req=indexedDB.open(DB_NAME,2);
  req.onupgradeneeded=()=>{for(const name of ['memory','assets','backups','settings'])if(!req.result.objectStoreNames.contains(name))req.result.createObjectStore(name);};
  req.onsuccess=()=>{req.result.onversionchange=()=>{req.result.close();database=undefined;};resolve(req.result);};
  req.onerror=()=>{database=undefined;reject(new Error('无法打开本地记忆，请检查浏览器存储设置。'));};
  req.onblocked=()=>{database=undefined;reject(new Error('请关闭其他旧版工作台页面，再重新打开新版。'));};
 });return database;
}
const txError=(tx:IDBTransaction)=>new Error(tx.error?.name==='QuotaExceededError'?'本机存储空间不足，请导出备份并释放空间。':'本地保存失败，请重试；当前页面中未保存的文字请先保留。');
export async function changeMemory(change:(memory:Memory)=>Memory):Promise<Memory>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['memory','assets'],'readwrite'),store=tx.objectStore('memory');let result:Memory,caught:unknown;
  store.get('current').onsuccess=e=>{try{const raw=(e.target as IDBRequest).result;const current=raw?validateBackup(raw):createMemory();result={...change(current),updatedAt:new Date().toISOString()};const retained=new Set(result.resources.map(r=>r.blobId));for(const r of current.resources)if(r.blobId&&!retained.has(r.blobId))tx.objectStore('assets').delete(r.blobId);store.put(result,'current');}catch(e){caught=e;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(caught instanceof Error?caught:txError(tx));
 });
}
export async function readMemory():Promise<Memory>{const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction('memory').objectStore('memory').get('current');req.onsuccess=()=>{try{resolve(req.result?validateBackup(req.result):createMemory());}catch(e){reject(e);}};req.onerror=()=>reject(new Error('读取本地记忆失败。'));});}
function requiredAssets(memory:Memory,assets:StoredAsset[]){const ids=new Set(memory.resources.filter(r=>r.mode==='copy').map(r=>r.blobId!));const result=assets.filter(a=>ids.has(a.id));if(result.length!==ids.size)throw new Error('部分资料副本缺失，未生成不完整备份。请重新关联缺失资料。');for(const r of memory.resources)if(r.mode==='copy'&&result.find(a=>a.id===r.blobId)?.blob.size!==r.size)throw new Error('资料副本大小与记录不一致，未生成不完整备份。');return result;}
export function dailySnapshot(existing:Snapshot|undefined,memory:Memory,assets:StoredAsset[],now=Date.now()):Snapshot{
 const date=localToday(new Date(now));if(existing?.date===date)return existing;
 return {date,createdAt:new Date(now).toISOString(),memory:structuredClone(reconcileMemory(memory,now)),assets:structuredClone(requiredAssets(memory,assets))};
}
export function expiredSnapshotDates(dates:string[],date:string){return [...new Set([...dates,date])].sort().slice(0,-30);}

export async function ensureDailyBackup(now=Date.now()):Promise<Snapshot>{
 const db=await openDatabase(),date=localToday(new Date(now));return new Promise((resolve,reject)=>{
  const tx=db.transaction(['memory','assets','backups'],'readwrite'),backups=tx.objectStore('backups');let raw:any,assets:StoredAsset[],existing:Snapshot|undefined,keys:IDBValidKey[],result:Snapshot,caught:unknown,pending=4;
  const ready=()=>{if(--pending)return;try{if(existing){result=existing;return;}result=dailySnapshot(existing,raw?validateBackup(raw):createMemory(date),assets,now);backups.add(result,date);for(const key of expiredSnapshotDates(keys.map(String),date))backups.delete(key);}catch(e){caught=e;tx.abort();}};
  tx.objectStore('memory').get('current').onsuccess=e=>{raw=(e.target as IDBRequest).result;ready();};
  tx.objectStore('assets').getAll().onsuccess=e=>{assets=(e.target as IDBRequest).result;ready();};
  backups.get(date).onsuccess=e=>{existing=(e.target as IDBRequest).result;ready();};
  backups.getAllKeys().onsuccess=e=>{keys=(e.target as IDBRequest).result;ready();};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(caught instanceof Error?caught:txError(tx));
 });
}
export async function listBackups():Promise<BackupInfo[]>{const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction('backups').objectStore('backups').getAll();req.onsuccess=()=>resolve((req.result as Snapshot[]).map(s=>({date:s.date,createdAt:s.createdAt,tasks:s.memory.tasks.length,assets:s.assets.length})).sort((a,b)=>b.date.localeCompare(a.date)));req.onerror=()=>reject(new Error('读取备份失败。'));});}
export async function readSnapshot(date:string):Promise<Snapshot>{const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction('backups').objectStore('backups').get(date);req.onsuccess=()=>req.result?resolve(req.result):reject(new Error('该备份已不存在。'));req.onerror=()=>reject(new Error('无法读取备份。'));});}
export async function captureCurrent():Promise<Snapshot>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['memory','assets']);let memory:Memory,assets:StoredAsset[],caught:unknown;tx.objectStore('memory').get('current').onsuccess=e=>{try{const raw=(e.target as IDBRequest).result;memory=reconcileMemory(raw?validateBackup(raw):createMemory());}catch(e){caught=e;tx.abort();}};tx.objectStore('assets').getAll().onsuccess=e=>{assets=(e.target as IDBRequest).result;};tx.oncomplete=()=>{try{resolve({date:localToday(),createdAt:new Date().toISOString(),memory,assets:requiredAssets(memory,assets)});}catch(e){reject(e);}};tx.onerror=tx.onabort=()=>reject(caught??new Error('读取完整备份失败。'));});
}
const blobBase64=(blob:Blob)=>new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('无法读取资料副本。'));reader.readAsDataURL(blob);});
export async function serializeSnapshot(snapshot:Snapshot){const assets=[];for(const a of snapshot.assets)assets.push({id:a.id,name:a.name,mime:a.mime,size:a.blob.size,data:await blobBase64(a.blob)});return JSON.stringify({format:'youxu-full-backup',version:2,createdAt:snapshot.createdAt,memory:snapshot.memory,assets});}
export function parseBackup(raw:any):Snapshot{
 const wrapped=raw?.format==='youxu-full-backup';if(wrapped&&raw.version!==2)throw new Error('不支持这份备份的版本。');const memory=validateBackup(wrapped?raw.memory:raw);
 if(wrapped&&(!Array.isArray(raw.assets)||raw.assets.length>10000))throw new Error('备份中的资料清单无效。');
 const assets:StoredAsset[]=[];const ids=new Set<string>();let size=0;
 for(const a of wrapped?raw.assets:[]){if(!a||typeof a.id!=='string'||!a.id||ids.has(a.id)||typeof a.name!=='string'||typeof a.mime!=='string'||typeof a.data!=='string'||a.data.length>70*1024*1024||(a.data.length%4!==0||!/^[A-Za-z0-9+/]*={0,2}$/.test(a.data)))throw new Error('资料副本格式无效，当前数据未被修改。');const decoded=atob(a.data);size+=decoded.length;if(decoded.length!==a.size||size>200*1024*1024)throw new Error('资料大小无效或超过 200 MB。');const bytes=Uint8Array.from(decoded,c=>c.charCodeAt(0));assets.push({id:a.id,name:a.name,mime:a.mime,blob:new Blob([bytes],{type:a.mime})});ids.add(a.id);}
 return {date:localToday(),createdAt:typeof raw?.createdAt==='string'?raw.createdAt:new Date().toISOString(),memory,assets:requiredAssets(memory,assets)};
}
export async function restoreSnapshot(snapshot:Snapshot):Promise<Memory>{
 const incoming=validateBackup(snapshot.memory);requiredAssets(incoming,snapshot.assets);const db=await openDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['memory','assets'],'readwrite');let result:Memory,caught:unknown;const store=tx.objectStore('memory');store.get('current').onsuccess=e=>{try{const raw=(e.target as IDBRequest).result;result=restoreMemory(raw?validateBackup(raw):createMemory(),incoming);store.put(result,'current');tx.objectStore('assets').clear();for(const a of snapshot.assets)tx.objectStore('assets').put(a,a.id);}catch(e){caught=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(caught instanceof Error?caught:txError(tx));
 });
}
export function downloadBlob(filename:string,blob:Blob){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=filename;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);}
export function downloadText(filename:string,text:string,type='text/plain;charset=utf-8'){downloadBlob(filename,new Blob([text],{type}));}
export async function exportBackup(){const snapshot=await captureCurrent();downloadText(`有序_完整备份_${snapshot.date}.json`,await serializeSnapshot(snapshot),'application/json;charset=utf-8');}
export async function exportSnapshot(date:string){downloadText(`有序_自动备份_${date}.json`,await serializeSnapshot(await readSnapshot(date)),'application/json;charset=utf-8');}

export async function addResource(resource:Resource,file?:File):Promise<Memory>{
 const db=await openDatabase();return new Promise((resolve,reject)=>{
  const tx=db.transaction(['memory','assets'],'readwrite'),store=tx.objectStore('memory');let result:Memory,caught:unknown;
  store.get('current').onsuccess=e=>{try{let current=validateBackup((e.target as IDBRequest).result);const target=current.tasks.find(t=>t.id===resource.taskId);if(!target)throw new Error('关联事项不存在。');if(target.sample)current=saveTask(current,target,target.id,target.completedOn);if(file&&file.size>50*1024*1024)throw new Error('单份资料副本限 50 MB；大文件或代码目录可使用路径关联。');if(current.resources.reduce((s,r)=>s+r.size,0)+(file?.size??0)>200*1024*1024)throw new Error('资料副本总量限 200 MB，大型资料请使用路径关联。');result={...current,resources:[...current.resources,resource],updatedAt:new Date().toISOString()};if(file)tx.objectStore('assets').put({id:resource.blobId,name:file.name,mime:file.type,blob:file},resource.blobId!);store.put(result,'current');}catch(e){caught=e;tx.abort();}};
  tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(caught instanceof Error?caught:txError(tx));
 });
}
export async function removeResource(id:string):Promise<Memory>{const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['memory','assets'],'readwrite'),store=tx.objectStore('memory');let result:Memory,caught:unknown;store.get('current').onsuccess=e=>{try{const current=validateBackup((e.target as IDBRequest).result),r=current.resources.find(r=>r.id===id);result={...current,resources:current.resources.filter(r=>r.id!==id),updatedAt:new Date().toISOString()};if(r?.blobId)tx.objectStore('assets').delete(r.blobId);store.put(result,'current');}catch(e){caught=e;tx.abort();}};tx.oncomplete=()=>resolve(result);tx.onerror=tx.onabort=()=>reject(caught instanceof Error?caught:txError(tx));});}
export async function resourceBlob(id:string):Promise<StoredAsset>{const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction('assets').objectStore('assets').get(id);req.onsuccess=()=>req.result?resolve(req.result):reject(new Error('资料副本缺失，请重新导入。'));req.onerror=()=>reject(new Error('无法读取资料。'));});}

async function diskConfig():Promise<DiskConfig|undefined>{const db=await openDatabase();return new Promise((resolve,reject)=>{const req=db.transaction('settings').objectStore('settings').get('backupDirectory');req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(new Error('无法读取备份目录设置。'));});}
async function setDiskConfig(config:DiskConfig|null){const db=await openDatabase();return new Promise<void>((resolve,reject)=>{const tx=db.transaction('settings','readwrite');if(config)tx.objectStore('settings').put(config,'backupDirectory');else tx.objectStore('settings').delete('backupDirectory');tx.oncomplete=()=>resolve();tx.onerror=()=>reject(txError(tx));});}
export function canChooseBackupFolder(){return 'showDirectoryPicker' in window;}
export async function writeDailyToFolder(snapshot:Snapshot):Promise<DiskStatus>{
 const config=await diskConfig();if(!config)return {state:'unconfigured'};
 try{if(await config.handle.queryPermission({mode:'readwrite'})!=='granted')return {state:'permission',name:config.handle.name};
  if(config.writtenOn!==snapshot.date){const file=await config.handle.getFileHandle(`有序_自动备份_${snapshot.date}.json`,{create:true});const stream=await file.createWritable();try{await stream.write(await serializeSnapshot(snapshot));await stream.close();}catch(e){await stream.abort().catch(()=>{});throw e;}await setDiskConfig({...config,writtenOn:snapshot.date});}
  return {state:'saved',name:config.handle.name,date:snapshot.date};
 }catch(e){return {state:'error',name:config.handle.name,message:(e as Error).message};}
}
export async function connectBackupFolder(){const picker=(window as unknown as {showDirectoryPicker:(o:{mode:string;id:string})=>Promise<Directory>}).showDirectoryPicker;if(!picker)throw new Error('当前浏览器不支持目录授权。可导出 JSON 备份，或使用支持此功能的 Chrome / Edge。');const handle=await picker.call(window,{mode:'readwrite',id:'youxu-backups'});await setDiskConfig({handle,writtenOn:null});return writeDailyToFolder(await ensureDailyBackup());}
export async function authorizeBackupFolder(){const config=await diskConfig();if(!config)return connectBackupFolder();if(await config.handle.requestPermission({mode:'readwrite'})!=='granted')return {state:'permission' as const,name:config.handle.name};return writeDailyToFolder(await ensureDailyBackup());}
export async function disconnectBackupFolder(){await setDiskConfig(null);}
export function downloadOfflineApp(){const code=document.getElementById('app-script')?.textContent,css=document.getElementById('app-style')?.textContent;if(!code||!css)throw new Error('离线文件暂不可用。');downloadText('有序_离线工作台.html','<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>有序 · 离线工作台</title><style id="app-style">'+css+'</style></head><body><div id="root"></div><script id="app-script">'+code+'</script></body></html>','text/html;charset=utf-8');}

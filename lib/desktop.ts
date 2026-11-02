import {invoke, isTauri} from '@tauri-apps/api/core';

// Browser builds retain IndexedDB. Only the local Tauri window receives IPC access.
export const isDesktop=()=>typeof window!=='undefined'&&isTauri();
export const native=<T>(command:string,args?:Record<string,unknown>)=>invoke<T>(command,args);
export type LinkedPath={path:string;name:string;directory:boolean};
export type NotificationStatus={state:'granted'|'denied'|'notDetermined'|'unsupported';scheduled:number;message?:string};
export const chooseResourcePath=(resourceId:string,directory=false)=>native<LinkedPath|null>('choose_resource',{resourceId,directory});
export const openResource=(resourceId:string,reveal=false)=>native<void>('open_resource',{resourceId,reveal});
export const syncNotifications=(requestPermission=false)=>native<NotificationStatus>('sync_notifications',{requestPermission});

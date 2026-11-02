import React,{useEffect,useState} from 'react';
import {Button} from '@/components/ui/button';
import {syncNotifications,type NotificationStatus} from '@/lib/desktop';

export function DesktopPanel(){
 const [status,setStatus]=useState<NotificationStatus|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 const check=async(request=false)=>{setBusy(true);try{setStatus(await syncNotifications(request));setError('');}catch(e){setError(String(e));}finally{setBusy(false);}};
 useEffect(()=>{void check();},[]);
 return <section className="paper-card report-section"><h3>macOS 系统提醒</h3><p>截止前一天上午 9:00 提醒；当天较晚添加的事项会在排程后提醒。22:00 休息提醒沿用页脚开关。修改日期或完成任务后会同步更新系统排程。</p><p className="backup-status">{status?.state==='granted'?`通知已允许 · 当前排程 ${status.scheduled} 项`:status?.state==='denied'?'通知未允许，请到系统设置中开启。':status?.state==='unsupported'?'当前系统不支持 macOS 排程。':'系统通知尚未授权。'}</p>{(error||status?.message)&&<p role="alert" className="form-error">{error||status?.message}</p>}<div className="head-actions"><Button disabled={busy} onClick={()=>void check(true)}>{busy?'正在更新…':'启用 / 检查系统提醒'}</Button><Button variant="outline" disabled={busy} onClick={()=>void check()}>重新同步</Button></div><p className="field-hint">已交给 macOS 的提醒可在应用退出后显示。系统通知权限、专注模式、关机和休眠可能影响显示时间。最多排程最近 59 项截止提醒；打开应用时自动补充。此开发构建尚需实机验证。</p></section>;
}

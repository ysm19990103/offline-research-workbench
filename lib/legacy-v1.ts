export const PROJECT_KEYS = ['research', 'computer', 'media', 'game'] as const;
export type Project = (typeof PROJECT_KEYS)[number];
export type Task = { id: string; project: Project; title: string; notes: string; dueDate: string | null; completed: boolean; completedAt: string | null; completedOn: string | null; createdAt: string; updatedAt: string; sample: boolean; order: number };
export type TaskDraft = Pick<Task, 'project' | 'title' | 'notes' | 'dueDate'>;
export type Journal = { date: string; reflection: string; comment: string; updatedAt: string };
export type Report = { month: string; generatedAt: string; completedTasks: Task[]; journals: Journal[]; summary: string[]; comment: string };
export type WorkDay = { date: string; state: 'active' | 'paused' | 'finished'; startedAt: number; activeSince: number | null; accumulatedMs: number; finishedAt: number | null };
export type WeekReport = { week: string; generatedAt: string; days: { date: string; durationMs: number }[]; totalMs: number; summary: string[] };
export type Memory = { version: 1; startedOn: string; tasks: Task[]; journals: Journal[]; reports: Report[]; workdays: WorkDay[]; weeklyReports: WeekReport[]; sleepReminder: { enabled: boolean; lastRemindedOn: string | null }; updatedAt: string };
export const PROJECTS: Record<Project, { name: string; short: string; english: string; mode: string }> = {
 research: { name: '科研项目', short: '研究设计', english: 'RESEARCH', mode: '专注推进' },
 computer: { name: '计算机学习', short: '计算机学习', english: 'LEARNING', mode: '专注推进' },
 media: { name: '写作项目', short: '公众号', english: 'WRITING', mode: '随心创作' },
 game: { name: '创意项目', short: '创意项目', english: 'CREATING', mode: '随心创作' },
};
export const isFocus = (project: Project) => project === 'research' || project === 'computer';
export function localToday(now = new Date()): string { return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`; }
export function validDate(value: unknown): value is string {
 if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || value < '1900-01-01' || value > '9999-12-31') return false;
 const d = new Date(`${value}T00:00:00Z`); return Number.isFinite(d.getTime()) && d.toISOString().slice(0,10) === value;
}
export function dayDifference(date: string, today: string) { return Math.round((Date.parse(`${date}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`))/86400000); }
export function dateLabel(date: string, today: string) { const [y,m,d]=date.split('-'); return `${y === today.slice(0,4) ? '' : y+'年'}${Number(m)}月${Number(d)}日`; }
export function urgency(task: Task, today: string) {
 if (!task.dueDate) return {text: isFocus(task.project) ? '未设日期' : '时间随心', tone: 'neutral'};
 if (!isFocus(task.project) || task.completed) return {text:dateLabel(task.dueDate,today), tone:'neutral'};
 const d=dayDifference(task.dueDate,today);
 if(d<0) return {text:`已逾期 ${-d} 天`,tone:'overdue'};
 if(d===0) return {text:'今天截止',tone:'today'};
 if(d===1) return {text:'明天截止',tone:'soon'};
 if(d<=3) return {text:`${d} 天后截止`,tone:'soon'};
 if(d<=7) return {text:`${d} 天后截止`,tone:'week'};
 return {text:dateLabel(task.dueDate,today),tone:'neutral'};
}
export function sortFocus(tasks: Task[]) { return [...tasks].sort((a,b)=>Number(a.completed)-Number(b.completed) || (a.completed && b.completed ? (b.completedAt??'').localeCompare(a.completedAt??'') : (a.dueDate??'9999-99-99').localeCompare(b.dueDate??'9999-99-99')) || a.order-b.order || a.id.localeCompare(b.id)); }
export function sortMilestones(tasks: Task[]) { return [...tasks].sort((a,b)=>a.order-b.order || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)); }
export function buildSamples(today: string): Task[] {
 const date=(n:number)=>new Date(Date.parse(`${today}T00:00:00Z`)+n*86400000).toISOString().slice(0,10);
 const specs: [Project,string,number|null,boolean][] = [
 ['research','核对示例项目的数据字典',0,false], ['computer','完成 Python 数据处理练习',1,false],
 ['research','整理近期文献与研究问题',3,false], ['computer','学习 Git 的分支与版本管理',6,false],
 ['research','梳理研究资料的目录结构',-2,true], ['computer','配置 Python 学习环境',-1,true],
 ['media','收集想写的选题',null,true], ['media','完成第一篇推文草稿',null,false], ['media','排版并发布',null,false],
 ['game','确定故事与角色方向',null,true], ['game','做出第一个可玩章节',null,false], ['game','整理示例素材',null,false],
 ];
 return specs.map(([project,title,offset,completed],i)=>({id:`sample-${i+1}`,project,title,notes:'这是一项示例，标题和日期仅供演示。编辑保存后将成为你的正式事项。',dueDate:offset===null?null:date(offset),completed,completedAt:completed?new Date().toISOString():null,completedOn:completed?today:null,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),sample:true,order:i+1}));
}
export function createMemory(today=localToday()): Memory { return {version:1,startedOn:today,tasks:buildSamples(today),journals:[],reports:[],workdays:[],weeklyReports:[],sleepReminder:{enabled:true,lastRemindedOn:null},updatedAt:new Date().toISOString()}; }
export function completeTask(task: Task, completed: boolean, today=localToday()): Task { return {...task,completed,completedAt:completed?new Date().toISOString():null,completedOn:completed?today:null,updatedAt:new Date().toISOString()}; }
export function monthLabel(month:string) { const [y,m]=month.split('-'); return `${y} 年 ${Number(m)} 月`; }
export function previousMonth(month:string) { const [y,m]=month.split('-').map(Number); return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`; }
export function reportFor(memory:Memory,month:string):Report {
 const completedTasks=memory.tasks.filter(t=>!t.sample && t.completed && t.completedOn?.startsWith(month)).sort((a,b)=>(a.completedOn??'').localeCompare(b.completedOn??''));
 const journals=memory.journals.filter(j=>j.date.startsWith(month)&&(j.reflection.trim()||j.comment.trim())).sort((a,b)=>a.date.localeCompare(b.date));
 const counts=Object.fromEntries(PROJECT_KEYS.map(p=>[p,completedTasks.filter(t=>t.project===p).length])) as Record<Project,number>;
 const summary:string[]=[];
 summary.push(`本月完成 ${completedTasks.length} 项事项：科研项目 ${counts.research} 项、计算机学习 ${counts.computer} 项、公众号 ${counts.media} 个节点、创意项目 ${counts.game} 个节点。`);
 const scheduled=completedTasks.filter(t=>isFocus(t.project)&&t.dueDate);
 const ontime=scheduled.filter(t=>t.completedOn!<=t.dueDate!);
 if(scheduled.length) summary.push(`研究与学习中，${scheduled.length} 项完成事项设置了截止日期，其中 ${ontime.length} 项按期完成，${scheduled.length-ontime.length} 项在截止日期后完成。`);
 else summary.push('本月暂无设置截止日期的研究或学习完成记录。');
 const reflections=journals.filter(j=>j.reflection.trim());
 const comments=journals.filter(j=>j.comment.trim());
 summary.push(`记录了 ${journals.length} 天的心得或评论，其中 ${reflections.length} 天有心得、${comments.length} 天有评论。`);
 const source=journals.flatMap(j=>[j.reflection,j.comment]).join('\n');
 const themes:[string,RegExp][]=[['文献与研究设计',/文献|研究设计|综述|论文|实验|假说/],['数据与分析',/数据|统计|队列|分析|模型/],['编程与计算机',/Python|pandas|Git\b|代码|编程|算法|计算机/i],['写作与传播',/公众号|推文|写作|读者|选题|排版/],['游戏与故事',/游戏|Steam|角色|剧情|剧本|章节/i]];
 const matches=themes.filter(([,re])=>re.test(source)).map(([name])=>name);
 if(matches.length) summary.push(`从心得与评论中的关键词看，本月涉及：${matches.join('、')}。`);
 const questions=journals.filter(j=>/困难|卡住|问题|困惑|不懂|失败|需要|待解决/.test(j.reflection+'\n'+j.comment));
 if(questions.length) summary.push(`有 ${questions.length} 天的记录提到问题或待解决事项，可回看 ${questions.map(j=>j.date.slice(5).replace('-','月')+'日').join('、')} 的原文，确定下一步。`);
 if(counts.media+counts.game>0) summary.push(`随心创作推进了 ${counts.media+counts.game} 个节点；公众号和游戏不计入截止日期与按期完成统计。`);
 return {month,generatedAt:new Date().toISOString(),completedTasks:structuredClone(completedTasks),journals:structuredClone(journals),summary,comment:memory.reports.find(r=>r.month===month)?.comment??''};
}
export function autoReports(memory:Memory,today=localToday()):Memory {
 const months:string[]=[]; let month=memory.startedOn.slice(0,7); const current=today.slice(0,7);
 while(month<current && months.length<1200){months.push(month);const [y,m]=month.split('-').map(Number);month=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;}
 const missing=months.filter(m=>!memory.reports.some(r=>r.month===m));
 if(!missing.length)return memory;
 return {...memory,reports:[...memory.reports,...missing.map(m=>reportFor(memory,m))],updatedAt:new Date().toISOString()};
}
function checkTask(t:any):boolean { return t && typeof t.id==='string' && t.id.length>0 && PROJECT_KEYS.includes(t.project) && typeof t.title==='string' && t.title.trim().length>0 && t.title.length<=200 && typeof t.notes==='string' && t.notes.length<=20000 && (t.dueDate===null||validDate(t.dueDate)) && typeof t.completed==='boolean' && typeof t.sample==='boolean' && Number.isFinite(t.order) && typeof t.createdAt==='string' && typeof t.updatedAt==='string' && (t.completedAt===null||typeof t.completedAt==='string') && (t.completedOn===null||validDate(t.completedOn)) && (t.completed ? !!t.completedOn && !!t.completedAt : t.completedOn===null && t.completedAt===null); }
function checkJournal(j:any):boolean { return j && validDate(j.date) && typeof j.reflection==='string' && j.reflection.length<=100000 && typeof j.comment==='string' && j.comment.length<=100000 && typeof j.updatedAt==='string'; }
export function validateBackup(raw:unknown):Memory {
 const d=raw as any;
 if(!d||d.version!==1||!validDate(d.startedOn)||typeof d.updatedAt!=='string'||!Array.isArray(d.tasks)||!Array.isArray(d.journals)||!Array.isArray(d.reports)||d.tasks.length>50000||d.journals.length>40000||d.reports.length>1200)throw new Error('这不是有效的有序工作台备份。');
 if(!d.tasks.every(checkTask)||new Set(d.tasks.map((t:any)=>t.id)).size!==d.tasks.length||!d.journals.every(checkJournal)||new Set(d.journals.map((j:any)=>j.date)).size!==d.journals.length)throw new Error('备份中的事项或心得格式不正确，未修改当前数据。');
 if(!d.reports.every((r:any)=>r&&typeof r.month==='string'&&validDate(r.month+'-01')&&typeof r.generatedAt==='string'&&typeof r.comment==='string'&&Array.isArray(r.completedTasks)&&r.completedTasks.every(checkTask)&&Array.isArray(r.journals)&&r.journals.every(checkJournal)&&Array.isArray(r.summary)&&r.summary.every((x:unknown)=>typeof x==='string'))||new Set(d.reports.map((r:any)=>r.month)).size!==d.reports.length)throw new Error('备份中的月报格式不正确，未修改当前数据。');
 if(!Array.isArray(d.workdays)||!Array.isArray(d.weeklyReports)||!d.workdays.every(validWorkDay)||new Set(d.workdays.map((w:any)=>w.date)).size!==d.workdays.length||!d.weeklyReports.every((w:any)=>w&&validDate(w.week)&&weekStart(w.week)===w.week&&typeof w.generatedAt==='string'&&Number.isFinite(w.totalMs)&&w.totalMs>=0&&Array.isArray(w.summary)&&w.summary.every((x:unknown)=>typeof x==='string')&&Array.isArray(w.days)&&w.days.length===7&&w.days.every((x:any)=>validDate(x.date)&&Number.isFinite(x.durationMs)&&x.durationMs>=0)))throw new Error('备份中的计时记录格式不正确，未修改当前数据。');
 if(!d.sleepReminder||typeof d.sleepReminder.enabled!=='boolean'||!(d.sleepReminder.lastRemindedOn===null||validDate(d.sleepReminder.lastRemindedOn)))throw new Error('备份中的提醒设置不正确。');
 return structuredClone(d) as Memory;
}
export function reportText(report:Report):string {
 return `# ${monthLabel(report.month)} · 月度回顾\n\n生成时间：${new Date(report.generatedAt).toLocaleString('zh-CN')}\n\n## 本月总结\n\n${report.summary.map(s=>'- '+s).join('\n')}\n\n## 完成事项\n\n${PROJECT_KEYS.map(p=>`### ${PROJECTS[p].name}\n\n${report.completedTasks.filter(t=>t.project===p).map(t=>`- [x] ${t.title}（完成：${t.completedOn}${isFocus(p)&&t.dueDate?'；截止：'+t.dueDate:''}）${t.notes?'\n  备注：'+t.notes:''}`).join('\n')||'本月暂无完成记录。'}`).join('\n\n')}\n\n## 每日心得与评论\n\n${report.journals.map(j=>`### ${j.date}\n\n心得：\n${j.reflection||'未填写'}\n\n评论：\n${j.comment||'未填写'}`).join('\n\n')||'本月暂无记录。'}\n\n## 月度评论\n\n${report.comment||'未填写'}\n\n---\n总结由本地规则生成；主题来自关键词匹配，原文完整保留。示例事项不计入月报。\n`;
}

export function shiftDate(date:string,n:number) { return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10); }
export function endOfDay(date:string) { const [y,m,d]=date.split('-').map(Number); return new Date(y,m-1,d+1).getTime(); }
export function workDuration(day:WorkDay|undefined,now=Date.now()) { if(!day)return 0;return day.accumulatedMs+(day.state==='active'&&day.activeSince!==null?Math.max(0,Math.min(now,endOfDay(day.date))-day.activeSince):0); }
export function clockText(ms:number) { const seconds=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(seconds/3600)).padStart(2,'0')}:${String(Math.floor(seconds/60)%60).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`; }
export function hoursText(ms:number) { const minutes=Math.floor(ms/60000);return `${Math.floor(minutes/60)} 小时 ${minutes%60} 分钟`; }
export function transitionWork(memory:Memory,action:'start'|'pause'|'resume'|'finish',now=Date.now()):Memory {
 const today=localToday(new Date(now)); const old=memory.workdays.find(w=>w.date===today);
 if(old?.state==='finished')throw new Error('今天的工作已结束，明天再继续。');
 let day:WorkDay;
 if(action==='start') { if(old)throw new Error('今天已打卡，请继续当前记录。');day={date:today,state:'active',startedAt:now,activeSince:now,accumulatedMs:0,finishedAt:null}; }
 else { if(!old)throw new Error('请先开始今天的工作。');
  if(action==='pause') { if(old.state!=='active')throw new Error('计时已暂停。');day={...old,state:'paused',accumulatedMs:workDuration(old,now),activeSince:null}; }
  else if(action==='resume') { if(old.state!=='paused')throw new Error('计时正在进行。');day={...old,state:'active',activeSince:now}; }
  else day={...old,state:'finished',accumulatedMs:workDuration(old,now),activeSince:null,finishedAt:now};
 }
 return {...memory,workdays:[...memory.workdays.filter(w=>w.date!==today),day],updatedAt:new Date(now).toISOString()};
}
export function weekStart(date:string) { const d=new Date(date+'T00:00:00Z'); const weekday=d.getUTCDay(); return shiftDate(date,-(weekday===0?6:weekday-1)); }
export function weeklyReportFor(memory:Memory,week:string,now=Date.now()):WeekReport {
 const days=Array.from({length:7},(_,i)=>{const date=shiftDate(week,i);return {date,durationMs:workDuration(memory.workdays.find(w=>w.date===date),now)};});
 const totalMs=days.reduce((sum,d)=>sum+d.durationMs,0), active=days.filter(d=>d.durationMs>0);
 const best=[...active].sort((a,b)=>b.durationMs-a.durationMs)[0];
 const previous=memory.weeklyReports.find(w=>w.week===shiftDate(week,-7));
 const summary=[`本周累计工作 ${hoursText(totalMs)}，有 ${active.length} 天记录了有效工作时间，暂停时间已扣除。`];
 if(active.length)summary.push(`按有工作记录的日期计算，平均每天 ${hoursText(totalMs/active.length)}；${best.date.slice(5).replace('-','月')}日的工作时长最多，为 ${hoursText(best.durationMs)}。`);
 if(previous)summary.push(`与上周相比，${totalMs===previous.totalMs?'总时长相同':`${totalMs>previous.totalMs?'增加':'减少'}了 ${hoursText(Math.abs(totalMs-previous.totalMs))}`}。`);
 return {week,generatedAt:new Date(now).toISOString(),days,totalMs,summary};
}
export function reconcileMemory(memory:Memory,now=Date.now()):Memory {
 const today=localToday(new Date(now));let updated=false;
 const workdays=memory.workdays.map(w=>{if(w.date<today&&w.state!=='finished'){updated=true;return {...w,state:'finished' as const,accumulatedMs:workDuration(w,endOfDay(w.date)),activeSince:null,finishedAt:endOfDay(w.date)};}return w;});
 let next=updated?{...memory,workdays}:memory;
 const monthNext=autoReports(next,today);if(monthNext!==next){updated=true;next=monthNext;}
 const start=weekStart(memory.startedOn),thisWeek=weekStart(today),weeks:string[]=[];
 for(let week=start;week<thisWeek&&weeks.length<5300;week=shiftDate(week,7))weeks.push(week);
 if(today===shiftDate(thisWeek,6)&&next.workdays.find(w=>w.date===today)?.state==='finished')weeks.push(thisWeek);
 for(const week of weeks){if(!next.weeklyReports.some(w=>w.week===week)){next={...next,weeklyReports:[...next.weeklyReports,weeklyReportFor(next,week,now)]};updated=true;}}
 return updated?{...next,updatedAt:new Date(now).toISOString()}:memory;
}
export function validWorkDay(w:any):boolean {
 return !!w&&validDate(w.date)&&['active','paused','finished'].includes(w.state)&&Number.isFinite(w.startedAt)&&Number.isFinite(w.accumulatedMs)&&w.accumulatedMs>=0&&(w.activeSince===null||Number.isFinite(w.activeSince))&&(w.finishedAt===null||Number.isFinite(w.finishedAt))&&(w.state==='active'?w.activeSince!==null&&w.finishedAt===null:w.activeSince===null)&&(w.state==='finished'?w.finishedAt!==null:true);
}
export function weekReportText(r:WeekReport) { return `# ${r.week} — ${shiftDate(r.week,6)} 工作周报\n\n${r.summary.join('\n\n')}\n\n## 每日时长\n\n${r.days.map(d=>`- ${d.date}：${hoursText(d.durationMs)}`).join('\n')}\n\n统计仅包含主动计时的时段，暂停时间不计入。\n`; }

export function shouldRemind(memory:Memory,now=Date.now()) { const d=new Date(now);return memory.sleepReminder.enabled&&d.getHours()>=22&&memory.sleepReminder.lastRemindedOn!==localToday(d); }

export function restoreMemory(current:Memory,backup:Memory,now=Date.now()):Memory {
 const restored=validateBackup(backup),today=localToday(new Date(now));
 const locked=current.workdays.find(w=>w.date===today&&w.state==='finished');
 if(locked)restored.workdays=[...restored.workdays.filter(w=>w.date!==today),structuredClone(locked)];
 return reconcileMemory(restored,now);
}

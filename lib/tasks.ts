import {validateBackup as validateV1, type Memory as MemoryV1, type Task as TaskV1} from './legacy-v1';
import {refreshWordCloud,validWordCloud,type WordCloudSnapshot} from './word-cloud';

export const PROJECT_KEYS = ['research', 'clinical', 'skills', 'leisure'] as const;
export type Project = (typeof PROJECT_KEYS)[number];
// Retained only for compatibility with version 2 backups; all new time is global.
const TIME_KEYS = [...PROJECT_KEYS, 'unassigned'] as const;
export type TimeProject = (typeof TIME_KEYS)[number];
export type Allocation = Record<TimeProject, number>;
export const PROJECTS: Record<Project, {name:string; short:string; english:string; mode:string; color:string}> = {
 research:{name:'科研工作',short:'科研',english:'RESEARCH',mode:'专注推进',color:'#0c6048'},
 clinical:{name:'临床工作',short:'临床',english:'CLINICAL',mode:'专注推进',color:'#3b8a76'},
 skills:{name:'个人技能',short:'技能',english:'SKILLS',mode:'持续积累',color:'#85b6a1'},
 leisure:{name:'个人娱乐',short:'娱乐',english:'LIFE',mode:'时间随心',color:'#b5a271'},
};
export const emptyAllocation=():Allocation=>({research:0,clinical:0,skills:0,leisure:0,unassigned:0});
export const isFocus=(p:Project)=>p!=='leisure';
export type Task = {id:string;project:Project;parentId:string|null;title:string;notes:string;dueDate:string|null;outcome:string;problem:string;nextStep:string;completed:boolean;completedAt:string|null;completedOn:string|null;createdAt:string;updatedAt:string;sample:boolean;order:number};
export type TaskDraft=Pick<Task,'project'|'parentId'|'title'|'notes'|'dueDate'|'outcome'|'problem'|'nextStep'>;
export const SECTION_KEYS=['done','result','problem','next'] as const;
export const SECTION_NAMES={done:'完成了什么',result:'得到什么结果',problem:'遇到什么问题',next:'下一步是什么'};
export type SectionKey=(typeof SECTION_KEYS)[number];
export type ProgressNotes=Record<SectionKey,string>;
export const emptyProgress=():ProgressNotes=>({done:'',result:'',problem:'',next:''});
export type Journal={date:string;reflection:string;comment:string;progress:ProgressNotes;taskIds:string[];updatedAt:string};
export type TaskRecord={id:string;taskId:string;date:string;at:string;event:'created'|'updated'|'completed'|'reopened'|'deleted'|'migrated';task:Task};
export type ReportLine={text:string;date:string;source:'task'|'journal';sourceId:string};
export type WorkSegment={project:TimeProject;start:number;end:number};
export type WorkDay={date:string;state:'active'|'paused'|'finished';startedAt:number;activeSince:number|null;activeProject:TimeProject;accumulatedMs:number;legacyMs:number;segments:WorkSegment[];finishedAt:number|null};
export type ReportDay={date:string;mood?:number|null;durationMs:number;byProject:Allocation;included:boolean};
export type WeekReport={week:string;generatedAt:string;finalized:boolean;days:ReportDay[];totalMs:number;byProject:Allocation;summary:string[]};
export type Report={month:string;generatedAt:string;finalized:boolean;completedTasks:Task[];journals:Journal[];records:TaskRecord[];sections:Record<SectionKey,ReportLine[]>;weeks:WeekReport[];summary:string[];comment:string;priorSummary?:string[]};
export const RESOURCE_KINDS={paper:'论文',code:'代码',table:'表格',material:'素材'} as const;
export type Resource={id:string;taskId:string;kind:keyof typeof RESOURCE_KINDS;mode:'copy'|'path';name:string;path:string;blobId:string|null;mime:string;size:number;createdAt:string};
export type MoodEntry={date:string;score:number|null;reflection:string;updatedAt:string};
export type DeadlineReminder={taskId:string;dueDate:string;remindedOn:string};
export type Memory={version:2;deadlineReminders?:DeadlineReminder[];wordCloud?:WordCloudSnapshot;moodEntries?:MoodEntry[];currentTaskId:string|null;startedOn:string;tasks:Task[];journals:Journal[];records:TaskRecord[];resources:Resource[];reports:Report[];workdays:WorkDay[];weeklyReports:WeekReport[];sleepReminder:{enabled:boolean;lastRemindedOn:string|null};migratedFromV1:boolean;updatedAt:string};

export function localToday(now=new Date()) {return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}-${String(now.getDate()).padStart(2,'0')}`;}
export function validDate(value:unknown):value is string {
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value)||value<'1900-01-01'||value>'9999-12-31')return false;
 const d=new Date(value+'T00:00:00Z');return Number.isFinite(d.getTime())&&d.toISOString().slice(0,10)===value;
}
export function shiftDate(date:string,n:number){return new Date(Date.parse(date+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);}
export function dayDifference(date:string,today:string){return Math.round((Date.parse(date+'T00:00:00Z')-Date.parse(today+'T00:00:00Z'))/86400000);}
export function dateLabel(date:string,today:string){const[y,m,d]=date.split('-');return `${y===today.slice(0,4)?'':y+'年'}${Number(m)}月${Number(d)}日`;}
export function urgency(task:Task,today:string){
 if(!isFocus(task.project))return {text:'时间随心',tone:'neutral'};
 if(!task.dueDate)return {text:'未设日期',tone:'neutral'};
 if(task.completed)return {text:dateLabel(task.dueDate,today),tone:'neutral'};
 const d=dayDifference(task.dueDate,today);
 return d<0?{text:`已逾期 ${-d} 天`,tone:'overdue'}:d===0?{text:'今天截止',tone:'today'}:d<=3?{text:d===1?'明天截止':`${d} 天后截止`,tone:'soon'}:d<=7?{text:`${d} 天后截止`,tone:'week'}:{text:dateLabel(task.dueDate,today),tone:'neutral'};
}
export function sortFocus(tasks:Task[]){return [...tasks].sort((a,b)=>Number(a.completed)-Number(b.completed)||(a.completed&&b.completed?(b.completedAt??'').localeCompare(a.completedAt??''):(a.dueDate??'9999-99-99').localeCompare(b.dueDate??'9999-99-99'))||a.order-b.order||a.id.localeCompare(b.id));}
export function sortMilestones(tasks:Task[]){return [...tasks].sort((a,b)=>a.order-b.order||a.id.localeCompare(b.id));}
export function descendants(tasks:Task[],id:string){const found=new Set<string>();const pending=[id];const children=new Map<string,Task[]>();for(const t of tasks)if(t.parentId)children.set(t.parentId,[...(children.get(t.parentId)??[]),t]);while(pending.length){for(const t of children.get(pending.pop()!)??[])if(!found.has(t.id)){found.add(t.id);pending.push(t.id);}}return found;}
export function taskPath(tasks:Task[],task:Task){const parts:string[]=[];const map=new Map(tasks.map(t=>[t.id,t]));let t:Task|undefined=task;const seen=new Set<string>();while(t&&!seen.has(t.id)){seen.add(t.id);parts.unshift(t.title);t=t.parentId?map.get(t.parentId):undefined;}return parts.join(' / ');}
export function assertHierarchy(tasks:Task[]){
 const map=new Map(tasks.map(t=>[t.id,t]));const done=new Set<string>();
 for(const task of tasks){let t:Task|undefined=task;const chain=new Set<string>();while(t&&!done.has(t.id)){if(chain.has(t.id))throw new Error('子任务不能形成循环，请重新选择上级事项。');chain.add(t.id);if(t.parentId){const parent=map.get(t.parentId);if(!parent||parent.project!==t.project)throw new Error('子任务必须与上级事项属于同一板块。');t=parent;}else t=undefined;}for(const id of chain)done.add(id);}
}
export function buildSamples(today:string):Task[]{
 const specs:[Project,string,string|null,number|null][]=[['research','示例研究课题',null,7],['research','核对公开示例数据','sample-1',1],['research','整理论文与分析表格','sample-1',3],['clinical','准备工作交流材料',null,2],['skills','Python 数据分析练习',null,5],['skills','完成数据清洗练习','sample-5',2],['leisure','创意写作',null,null],['leisure','收集想写的选题','sample-7',null],['leisure','创意项目',null,null],['leisure','做出第一个可玩场景','sample-9',null]];
 const at=new Date().toISOString();return specs.map(([project,title,parentId,offset],i)=>({id:`sample-${i+1}`,project,parentId,title,notes:'示例事项；编辑保存后成为正式记录。',dueDate:offset===null?null:shiftDate(today,offset),outcome:'',problem:'',nextStep:'',completed:false,completedAt:null,completedOn:null,createdAt:at,updatedAt:at,sample:true,order:i+1}));
}
export function createMemory(today=localToday()):Memory{return {version:2,currentTaskId:null,startedOn:today,tasks:buildSamples(today),journals:[],records:[],resources:[],reports:[],workdays:[],weeklyReports:[],sleepReminder:{enabled:true,lastRemindedOn:null},migratedFromV1:false,updatedAt:new Date().toISOString()};}
export function completeTask(task:Task,completed:boolean,today=localToday()):Task{return {...task,completed,completedAt:completed?new Date().toISOString():null,completedOn:completed?today:null,updatedAt:new Date().toISOString()};}
export function taskRecord(task:Task,event:TaskRecord['event'],date=localToday(),now=Date.now()):TaskRecord{return {id:crypto.randomUUID(),taskId:task.id,date,at:new Date(now).toISOString(),event,task:structuredClone(task)};}
function stripLeisureDate(t:Task):Task {return t.project==='leisure'&&t.dueDate?{...t,notes:`${t.notes}${t.notes?'\n\n':''}原节点日期：${t.dueDate}（仅保留历史文字，不作为截止日期）`,dueDate:null}:t;}
function activateAncestors(tasks:Task[],id:string|null,records:TaskRecord[],today:string){
 while(id){const p=tasks.find(t=>t.id===id);if(!p)break;const changed=p.sample||p.completed;if(changed){p.sample=false;if(p.completed)Object.assign(p,completeTask(p,false,today));records.push(taskRecord(p,'updated',today));}id=p.parentId;}
}
export function saveTask(memory:Memory,draft:TaskDraft,id:string|null,completedOn:string|null,today=localToday()):Memory{
 if(!draft.title.trim())throw new Error('请填写事项名称。');
 const tasks=structuredClone(memory.tasks),records=[...memory.records],at=new Date().toISOString();
 let task:Task;const existing=id?tasks.find(t=>t.id===id):undefined;
 if(id&&!existing)throw new Error('这项事项已被删除，请重新添加。');
 if(existing){
  if(existing.completed&&(!completedOn||!validDate(completedOn)||completedOn>today))throw new Error('完成日期无效，或晚于今天。');
  task=stripLeisureDate({...existing,...draft,title:draft.title.trim(),completedOn:existing.completed?completedOn:null,sample:false,updatedAt:at});
  const children=descendants(tasks,existing.id);
  for(let i=0;i<tasks.length;i++){if(tasks[i].id===id)tasks[i]=task;else if(children.has(tasks[i].id)&&tasks[i].project!==task.project){tasks[i]=stripLeisureDate({...tasks[i],project:task.project,updatedAt:at});records.push(taskRecord(tasks[i],'updated',today));}}
 }else {task=stripLeisureDate({...draft,title:draft.title.trim(),id:crypto.randomUUID(),completed:false,completedAt:null,completedOn:null,createdAt:at,updatedAt:at,sample:false,order:Math.max(0,...tasks.map(t=>t.order))+1});tasks.push(task);}
 assertHierarchy(tasks);activateAncestors(tasks,task.parentId,records,today);
 records.push(taskRecord(task,existing?'updated':'created',today));
 if(task.completed&&existing?.completedOn!==task.completedOn)records.push(taskRecord(task,'completed',task.completedOn!));
 return {...memory,tasks,records};
}
export function toggleTask(memory:Memory,id:string,value:boolean,today=localToday()):Memory{
 const tasks=structuredClone(memory.tasks),records=[...memory.records],task=tasks.find(t=>t.id===id);if(!task)throw new Error('事项不存在。');
 if(value){const children=descendants(tasks,id);if(tasks.some(t=>children.has(t.id)&&!t.completed))throw new Error('还有未完成的子任务，请先完成子任务，再勾选上级事项。');}
 Object.assign(task,completeTask(task,value,today));if(!task.sample)records.push(taskRecord(task,value?'completed':'reopened',today));
 if(!value)activateAncestors(tasks,task.parentId,records,today);
 return {...memory,tasks,records};
}
export function deleteTask(memory:Memory,id:string,today=localToday()):Memory{
 const ids=descendants(memory.tasks,id);ids.add(id);
 return {...memory,tasks:memory.tasks.filter(t=>!ids.has(t.id)),resources:memory.resources.filter(r=>!ids.has(r.taskId)),records:[...memory.records,...memory.tasks.filter(t=>ids.has(t.id)&&!t.sample).map(t=>taskRecord(t,'deleted',today))]};
}

export function endOfDay(date:string){const[y,m,d]=date.split('-').map(Number);return new Date(y,m-1,d+1).getTime();}
export function workDuration(day:WorkDay|undefined,now=Date.now()){return day?day.accumulatedMs+(day.state==='active'&&day.activeSince!==null?Math.max(0,Math.min(now,endOfDay(day.date))-day.activeSince):0):0;}
function settle(day:WorkDay,now:number):WorkDay{
 if(now<(day.activeSince??day.segments.at(-1)?.end??day.startedAt))throw new Error('设备时间早于上一次计时记录，请校正设备时间后重试。');
 if(day.state!=='active'||day.activeSince===null)return {...day,segments:[...day.segments]};
 const end=Math.max(day.activeSince,Math.min(now,endOfDay(day.date))),segments=[...day.segments];
 if(end>day.activeSince)segments.push({project:'unassigned',start:day.activeSince,end});
 return {...day,segments,accumulatedMs:day.accumulatedMs+end-day.activeSince,activeSince:null};
}
export function transitionWork(memory:Memory,action:'start'|'pause'|'resume'|'finish',now=Date.now()):Memory{
 const today=localToday(new Date(now)),old=memory.workdays.find(w=>w.date===today);if(old?.state==='finished')throw new Error('今天的工作已结束，明天再继续。');let day:WorkDay;
 if(old&&now<(old.activeSince??old.segments.at(-1)?.end??old.startedAt))throw new Error('设备时间早于上一次计时记录，请校正设备时间后重试。');
 if(action==='start'){if(old)throw new Error('今天已打卡，请继续当前记录。');day={date:today,state:'active',startedAt:now,activeSince:now,activeProject:'unassigned',accumulatedMs:0,legacyMs:0,segments:[],finishedAt:null};}
 else {if(!old)throw new Error('请先开始今天的工作。');if(action==='pause'){if(old.state!=='active')throw new Error('计时已暂停。');day={...settle(old,now),state:'paused'};}else if(action==='resume'){if(old.state!=='paused')throw new Error('计时正在进行。');day={...old,state:'active',activeProject:'unassigned',activeSince:now};}else day={...settle(old,now),state:'finished',activeSince:null,finishedAt:now};}
 return {...memory,currentTaskId:null,workdays:[...memory.workdays.filter(w=>w.date!==today),day],updatedAt:new Date(now).toISOString()};
}
export function clearSamples(memory:Memory){return {...memory,tasks:memory.tasks.filter(t=>!t.sample)};}
export function clockText(ms:number){const s=Math.max(0,Math.floor(ms/1000));return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s/60)%60).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;}
export function hoursText(ms:number){const m=Math.floor(ms/60000);return `${Math.floor(m/60)} 小时 ${m%60} 分钟`;}
export function weekStart(date:string){const d=new Date(date+'T00:00:00Z');return shiftDate(date,-(d.getUTCDay()===0?6:d.getUTCDay()-1));}
export function weeklySummary(report:Pick<WeekReport,'days'|'totalMs'|'summary'>):string[]{
 const active=report.days.filter(d=>d.durationMs>0),best=[...active].sort((a,b)=>b.durationMs-a.durationMs)[0];
 const summary=[`累计记录 ${hoursText(report.totalMs)}，其中 ${active.length} 天有有效计时；暂停时间已扣除。`];
 if(best)summary.push(`按有计时的日期计算，平均每天 ${hoursText(report.totalMs/active.length)}；${best.date} 最多，为 ${hoursText(best.durationMs)}。`);
 // Retain a historical comparison, but never display former category allocations.
 summary.push(...report.summary.filter(s=>s.startsWith('与上周相比，')));return summary;
}
export function weeklyReportFor(memory:Memory,week:string,now=Date.now(),month?:string):WeekReport{
 const days=Array.from({length:7},(_,i)=>{const date=shiftDate(week,i),included=!month||date.startsWith(month),day=included?memory.workdays.find(w=>w.date===date):undefined,durationMs=workDuration(day,now);return {date,included,durationMs,mood:included?memory.moodEntries?.find(j=>j.date===date)?.score??null:null,byProject:{...emptyAllocation(),unassigned:durationMs}};});
 const totalMs=days.reduce((s,d)=>s+d.durationMs,0),byProject={...emptyAllocation(),unassigned:totalMs};
 const summary=weeklySummary({days,totalMs,summary:[]});
 if(!month){const previousTotal=Array.from({length:7},(_,i)=>workDuration(memory.workdays.find(w=>w.date===shiftDate(week,i-7)),now)).reduce((a,b)=>a+b,0);if(memory.workdays.some(w=>w.date>=shiftDate(week,-7)&&w.date<week))summary.push(`与上周相比，${totalMs===previousTotal?'总时长相同':`${totalMs>previousTotal?'增加':'减少'} ${hoursText(Math.abs(totalMs-previousTotal))}`}。`);}
 const today=localToday(new Date(now)),finalized=week<weekStart(today)||(today===shiftDate(week,6)&&memory.workdays.find(w=>w.date===today)?.state==='finished');
 return {week,generatedAt:new Date(now).toISOString(),finalized,days,totalMs,byProject,summary};
}
export function monthWeeks(memory:Memory,month:string,now=Date.now()){const result:WeekReport[]=[];for(let w=weekStart(month+'-01');w<=month+'-31';w=shiftDate(w,7))result.push(weeklyReportFor(memory,w,now,month));return result;}
export function monthLabel(month:string){const[y,m]=month.split('-');return `${y} 年 ${Number(m)} 月`;}
export function previousMonth(month:string){const[y,m]=month.split('-').map(Number);return m===1?`${y-1}-12`:`${y}-${String(m-1).padStart(2,'0')}`;}
export const validMood=(m:unknown):m is number|null|undefined=>m===null||m===undefined||typeof m==='number'&&Number.isInteger(m)&&m>=1&&m<=10;
export function journalText(j:Journal|undefined):string{
 if(!j)return '';return [...SECTION_KEYS.filter(k=>j.progress[k]).map(k=>`${SECTION_NAMES[k]}：${j.progress[k]}`),j.reflection,j.comment?`评论：${j.comment}`:''].filter(Boolean).join('\n\n');
}
export function saveJournal(memory:Memory,date:string,text:string,taskIds:string[],now=Date.now()):Memory{
 if(!validDate(date)||date>localToday(new Date(now))||text.length>700000)throw new Error('记录日期或文字长度无效。');
 return {...memory,journals:[...memory.journals.filter(j=>j.date!==date),{date,reflection:text,comment:'',progress:emptyProgress(),taskIds:[...taskIds],updatedAt:new Date(now).toISOString()}]};
}
export function saveMood(memory:Memory,date:string,score:number|null,reflection:string,now=Date.now()):Memory{
 if(!validDate(date)||date>localToday(new Date(now))||score===undefined||!validMood(score)||reflection.length>100000)throw new Error('日期、心情分数或文字长度无效。');
 return {...memory,moodEntries:[...(memory.moodEntries??[]).filter(e=>e.date!==date),{date,score,reflection,updatedAt:new Date(now).toISOString()}]};
}
export function upcomingReminders(memory:Memory,today=localToday()):Task[]{
 const tomorrow=shiftDate(today,1);
 return sortFocus(memory.tasks.filter(t=>!t.sample&&!t.completed&&isFocus(t.project)&&t.dueDate===tomorrow&&!(memory.deadlineReminders??[]).some(r=>r.taskId===t.id&&r.dueDate===t.dueDate)));
}
export function claimDeadlineReminders(memory:Memory,today=localToday()):Memory{
 const tasks=upcomingReminders(memory,today);if(!tasks.length)return memory;
 const pending=tasks.map(t=>({taskId:t.id,dueDate:t.dueDate!,remindedOn:today}));
 return {...memory,deadlineReminders:[...(memory.deadlineReminders??[]).filter(r=>r.dueDate>=today),...pending]};
}
export function hasJournal(j:Journal){return !!journalText(j).trim();}
function journalSections(j:Journal):ProgressNotes{
 const result={...j.progress};
 const prefixes:Record<SectionKey,RegExp>={done:/^(?:完成了什么|完成|今天完成|今日完成)[:：]\s*(.+)/,result:/^(?:得到什么结果|结果|得到的结果|收获)[:：]\s*(.+)/,problem:/^(?:遇到什么问题|遇到的问题|问题|困难)[:：]\s*(.+)/,next:/^(?:下一步是什么|下一步|明日计划|明天计划)[:：]\s*(.+)/};
 for(const line of j.reflection.split(/\r?\n/))for(const k of SECTION_KEYS)if(prefixes[k].test(line.trim()))result[k]+=(result[k]?'\n':'')+line.trim();
 return result;
}
export function reportFor(memory:Memory,month:string,now=Date.now()):Report{
 const completedTasks=memory.tasks.filter(t=>!t.sample&&t.completed&&t.completedOn?.startsWith(month)).sort((a,b)=>(a.completedOn??'').localeCompare(b.completedOn??''));
 const journals=memory.journals.filter(j=>j.date.startsWith(month)&&hasJournal(j)).sort((a,b)=>a.date.localeCompare(b.date));
 const records=memory.records.filter(r=>r.date.startsWith(month)&&!r.task.sample).map(r=>structuredClone(r));
 const sections:Record<SectionKey,ReportLine[]>={done:[],result:[],problem:[],next:[]};
 for(const t of completedTasks){let source=[...records].reverse().find(r=>r.taskId===t.id&&r.date===t.completedOn&&r.task.completed);if(!source){source={...taskRecord(t,'migrated',t.completedOn!),id:`snapshot-${t.id}-${t.completedOn}`};records.push(source);}sections.done.push({text:`${PROJECTS[t.project].name} · ${t.title}`,date:t.completedOn!,source:'task',sourceId:source.id});}
 const fieldMap={result:'outcome',problem:'problem',next:'nextStep'} as const;
 const previous=new Map<string,string>(),latest=new Map<string,{record:TaskRecord;key:'result'|'problem'|'next'}>();
 const history=[...memory.records,...records.filter(r=>!memory.records.some(x=>x.id===r.id))].filter(r=>r.date<=month+'-31'&&!r.task.sample&&r.event!=='deleted').sort((a,b)=>a.at.localeCompare(b.at));
 for(const r of history)for(const key of ['result','problem','next'] as const){const id=`${r.taskId}:${key}`,value=r.task[fieldMap[key]].trim();if(value!==(previous.get(id)??'')&&r.date.startsWith(month)){if(value)latest.set(id,{record:r,key});else latest.delete(id);}previous.set(id,value);}
 for(const {record:r,key} of latest.values())sections[key].push({text:`${r.task.title}：${r.task[fieldMap[key]].trim()}`,date:r.date,source:'task',sourceId:r.id});
 for(const j of journals){const notes=journalSections(j);for(const key of SECTION_KEYS)if(notes[key].trim())sections[key].push({text:notes[key],date:j.date,source:'journal',sourceId:j.date});}
 for(const key of SECTION_KEYS)sections[key].sort((a,b)=>a.date.localeCompare(b.date));
 const weeks=monthWeeks(memory,month,now),total=weeks.reduce((s,w)=>s+w.totalMs,0);
 const summary=[`完成 ${completedTasks.length} 项独立勾选的事项（含上级事项与子任务），保留 ${journals.length} 天每日记录，累计计时 ${hoursText(total)}。`,PROJECT_KEYS.map(p=>`${PROJECTS[p].name} ${completedTasks.filter(t=>t.project===p).length} 项`).join('；')+'。'];
 const previousReport=memory.reports.find(r=>r.month===month);
 return {month,generatedAt:new Date(now).toISOString(),finalized:month<localToday(new Date(now)).slice(0,7),completedTasks:structuredClone(completedTasks),journals:structuredClone(journals),records,sections,weeks,summary,comment:previousReport?.comment??'',...(previousReport?.priorSummary?{priorSummary:previousReport.priorSummary}:{})};
}
export function autoReports(memory:Memory,today=localToday(),now=Date.now()):Memory{
 const missing:string[]=[];let month=memory.startedOn.slice(0,7);for(let i=0;month<today.slice(0,7)&&i<1200;i++){if(!memory.reports.some(r=>r.month===month&&r.finalized))missing.push(month);const[y,m]=month.split('-').map(Number);month=m===12?`${y+1}-01`:`${y}-${String(m+1).padStart(2,'0')}`;}
 return missing.length?{...memory,reports:[...memory.reports.filter(r=>!missing.includes(r.month)),...missing.map(m=>reportFor(memory,m,now))]}:memory;
}
export function reconcileMemory(memory:Memory,now=Date.now()):Memory{
 const today=localToday(new Date(now));const cloud=refreshWordCloud(memory.wordCloud,memory.tasks,today,now);let next=cloud===memory.wordCloud?memory:{...memory,wordCloud:cloud};
 const workdays=memory.workdays.map(w=>w.date<today&&w.state!=='finished'?{...settle(w,endOfDay(w.date)),state:'finished' as const,activeSince:null,finishedAt:endOfDay(w.date)}:w);
 if(workdays.some((w,i)=>w!==memory.workdays[i]))next={...next,workdays};
 next=autoReports(next,today,now);const thisWeek=weekStart(today),weeks:string[]=[];
 for(let w=weekStart(memory.startedOn);w<thisWeek&&weeks.length<5300;w=shiftDate(w,7))weeks.push(w);
 if(today===shiftDate(thisWeek,6)&&next.workdays.find(w=>w.date===today)?.state==='finished')weeks.push(thisWeek);
 for(const week of weeks)if(!next.weeklyReports.some(r=>r.week===week&&r.finalized))next={...next,weeklyReports:[...next.weeklyReports.filter(r=>r.week!==week),weeklyReportFor(next,week,now)]};
 return next===memory?memory:{...next,updatedAt:new Date(now).toISOString()};
}
export function shouldRemind(memory:Memory,now=Date.now()){const d=new Date(now);return memory.sleepReminder.enabled&&d.getHours()>=22&&memory.sleepReminder.lastRemindedOn!==localToday(d);}

function migrateTask(t:TaskV1):Task{
 const mapping={research:'research',computer:'skills',media:'leisure',game:'leisure'} as const;
 const label={research:'科研项目',computer:'计算机学习',media:'写作项目',game:'创意项目'};
 return stripLeisureDate({...t,project:mapping[t.project],parentId:null,outcome:'',problem:'',nextStep:'',notes:`${t.notes}${t.notes?'\n\n':''}旧版板块：${label[t.project]}`});
}
export function migrateV1(raw:MemoryV1,now=Date.now()):Memory{
 const tasks=raw.tasks.map(migrateTask),journals=raw.journals.map(j=>({...j,progress:emptyProgress(),taskIds:[]}));
 const convertRecords=(items:Task[])=>items.filter(t=>!t.sample).map(t=>({...taskRecord(t,'migrated',t.completedOn??localToday(new Date(t.updatedAt)),now),id:`v1-${t.id}-${t.completedOn??'record'}`}));
 let memory:Memory={...raw,version:2,currentTaskId:null,tasks,journals,records:convertRecords(tasks),resources:[],reports:[],weeklyReports:[],migratedFromV1:true,workdays:raw.workdays.map(w=>({...w,activeProject:'unassigned',legacyMs:w.accumulatedMs,segments:[]}))};
 memory.weeklyReports=raw.weeklyReports.map(w=>({...w,finalized:true,byProject:{...emptyAllocation(),unassigned:w.totalMs},days:w.days.map(d=>({...d,included:true,byProject:{...emptyAllocation(),unassigned:d.durationMs}}))}));
 memory.reports=raw.reports.map(r=>{const completedTasks=r.completedTasks.map(migrateTask);const report=reportFor({...memory,tasks:completedTasks,records:convertRecords(completedTasks),journals:r.journals.map(j=>({...j,progress:emptyProgress(),taskIds:[]}))},r.month,now);return {...report,finalized:true,generatedAt:r.generatedAt,comment:r.comment,priorSummary:r.summary};});
 return memory;
}

const textOk=(x:unknown,max=100000):x is string=>typeof x==='string'&&x.length<=max;
const numberOk=(x:unknown):x is number=>typeof x==='number'&&Number.isFinite(x)&&x>=0;
const unique=(items:any[],key:string)=>new Set(items.map(x=>x[key])).size===items.length;
const taskOk=(t:any):t is Task=>!!t&&textOk(t.id,200)&&t.id.length>0&&PROJECT_KEYS.includes(t.project)&&textOk(t.title,200)&&!!t.title.trim()&&textOk(t.notes)&&['outcome','problem','nextStep'].every(k=>textOk(t[k],20000))&&(t.parentId===null||textOk(t.parentId,200))&&(t.dueDate===null||validDate(t.dueDate))&&(t.project!=='leisure'||t.dueDate===null)&&typeof t.completed==='boolean'&&typeof t.sample==='boolean'&&Number.isFinite(t.order)&&textOk(t.createdAt)&&textOk(t.updatedAt)&&(t.completed?validDate(t.completedOn)&&textOk(t.completedAt):t.completedOn===null&&t.completedAt===null);
const journalOk=(j:any):j is Journal=>!!j&&validDate(j.date)&&textOk(j.reflection,700000)&&textOk(j.comment)&&textOk(j.updatedAt)&&j.progress&&SECTION_KEYS.every(k=>textOk(j.progress[k]))&&Array.isArray(j.taskIds)&&j.taskIds.every((id:any)=>textOk(id,200));
const recordOk=(r:any):r is TaskRecord=>!!r&&textOk(r.id,300)&&validDate(r.date)&&textOk(r.at)&&textOk(r.taskId,200)&&['created','updated','completed','reopened','deleted','migrated'].includes(r.event)&&taskOk(r.task)&&r.task.id===r.taskId;
function allocationOk(a:any,total:number){return !!a&&TIME_KEYS.every(p=>numberOk(a[p]))&&Math.abs(TIME_KEYS.reduce((s,p)=>s+a[p],0)-total)<1;}
export function validWorkDay(w:any):boolean{
 if(!w||!validDate(w.date)||!['active','paused','finished'].includes(w.state)||!numberOk(w.startedAt)||!numberOk(w.accumulatedMs)||!numberOk(w.legacyMs)||!TIME_KEYS.includes(w.activeProject)||!Array.isArray(w.segments))return false;
 if(w.state==='active'?(!numberOk(w.activeSince)||w.finishedAt!==null):w.activeSince!==null)return false;
 if(w.state==='finished'?!numberOk(w.finishedAt):w.finishedAt!==null)return false;
 let end=w.startedAt;for(const s of w.segments){if(!s||!TIME_KEYS.includes(s.project)||!numberOk(s.start)||!numberOk(s.end)||s.start<end||s.end<s.start||s.end>endOfDay(w.date))return false;end=s.end;}
 return (w.activeSince===null||w.activeSince>=end)&&Math.abs(w.accumulatedMs-w.legacyMs-w.segments.reduce((s:number,x:WorkSegment)=>s+x.end-x.start,0))<1;
}
function weekOk(w:any):boolean{return !!w&&validDate(w.week)&&weekStart(w.week)===w.week&&textOk(w.generatedAt)&&typeof w.finalized==='boolean'&&numberOk(w.totalMs)&&allocationOk(w.byProject,w.totalMs)&&Array.isArray(w.summary)&&w.summary.every((x:any)=>textOk(x))&&Array.isArray(w.days)&&w.days.length===7&&w.days.every((d:any,i:number)=>d&&d.date===shiftDate(w.week,i)&&numberOk(d.durationMs)&&validMood(d.mood)&&typeof d.included==='boolean'&&allocationOk(d.byProject,d.durationMs))&&Math.abs(w.days.reduce((s:number,d:ReportDay)=>s+d.durationMs,0)-w.totalMs)<1;}
export function validateBackup(raw:unknown):Memory{
 let d=raw as any;if(d?.version===1)d=migrateV1(validateV1(d));
 const fail=()=>{throw new Error('备份数据不完整或格式无效，当前记录未被修改。');};
 if(!d||d.version!==2||!validDate(d.startedOn)||!textOk(d.updatedAt)||typeof d.migratedFromV1!=='boolean'||!(d.currentTaskId===null||textOk(d.currentTaskId,200)))fail();
 for(const key of ['tasks','journals','records','resources','reports','workdays','weeklyReports'])if(!Array.isArray(d[key])||d[key].length>(key==='records'?200000:50000))fail();
 if(!d.tasks.every(taskOk)||!unique(d.tasks,'id')||!d.journals.every(journalOk)||!unique(d.journals,'date')||!d.records.every(recordOk)||!unique(d.records,'id'))fail();
 assertHierarchy(d.tasks);
 if(!d.workdays.every(validWorkDay)||!unique(d.workdays,'date')||!d.weeklyReports.every(weekOk)||!unique(d.weeklyReports,'week'))fail();
 if(!d.resources.every((r:any)=>r&&textOk(r.id,200)&&d.tasks.some((t:Task)=>t.id===r.taskId)&&Object.hasOwn(RESOURCE_KINDS,r.kind)&&['copy','path'].includes(r.mode)&&textOk(r.name,500)&&textOk(r.path,4000)&&textOk(r.mime,200)&&numberOk(r.size)&&textOk(r.createdAt)&&(r.mode==='copy'?textOk(r.blobId,200)&&r.blobId.length>0:r.blobId===null&&r.path.length>0))||!unique(d.resources,'id'))fail();
 if(!d.reports.every((r:any)=>r&&validDate(r.month+'-01')&&textOk(r.generatedAt)&&typeof r.finalized==='boolean'&&textOk(r.comment)&&Array.isArray(r.completedTasks)&&r.completedTasks.every(taskOk)&&Array.isArray(r.journals)&&r.journals.every(journalOk)&&Array.isArray(r.records)&&r.records.every(recordOk)&&Array.isArray(r.weeks)&&r.weeks.every(weekOk)&&Array.isArray(r.summary)&&r.summary.every((s:any)=>textOk(s))&&(r.priorSummary===undefined||Array.isArray(r.priorSummary)&&r.priorSummary.every((s:any)=>textOk(s)))&&r.sections&&SECTION_KEYS.every(k=>Array.isArray(r.sections[k])&&r.sections[k].every((l:any)=>l&&textOk(l.text,700000)&&validDate(l.date)&&textOk(l.sourceId,300)&&(l.source==='task'?r.records.some((s:TaskRecord)=>s.id===l.sourceId):l.source==='journal'&&r.journals.some((j:Journal)=>j.date===l.sourceId)))))||!unique(d.reports,'month'))fail();
 if(!d.sleepReminder||typeof d.sleepReminder.enabled!=='boolean'||!(d.sleepReminder.lastRemindedOn===null||validDate(d.sleepReminder.lastRemindedOn)))fail();
 if(d.deadlineReminders!==undefined&&(!Array.isArray(d.deadlineReminders)||d.deadlineReminders.length>50000||!d.deadlineReminders.every((r:any)=>r&&textOk(r.taskId,200)&&validDate(r.dueDate)&&validDate(r.remindedOn))))fail();
 if(d.wordCloud!==undefined&&!validWordCloud(d.wordCloud))fail();
 if(d.moodEntries!==undefined&&(!Array.isArray(d.moodEntries)||d.moodEntries.length>50000||!unique(d.moodEntries,'date')||!d.moodEntries.every((e:any)=>e&&validDate(e.date)&&e.score!==undefined&&validMood(e.score)&&textOk(e.reflection)&&textOk(e.updatedAt))))fail();
 return {...structuredClone(d),currentTaskId:null} as Memory;
}
export function restoreMemory(current:Memory,backup:Memory,now=Date.now()):Memory{
 const restored=validateBackup(backup),today=localToday(new Date(now)),locked=current.workdays.find(w=>w.date===today&&w.state==='finished');
 if(locked)restored.workdays=[...restored.workdays.filter(w=>w.date!==today),structuredClone(locked)];return reconcileMemory(restored,now);
}
export function reportText(r:Report){return `# ${monthLabel(r.month)} · 月报\n\n${r.summary.join('\n\n')}\n\n${SECTION_KEYS.map(k=>`## ${SECTION_NAMES[k]}\n\n${r.sections[k].map(l=>`- ${l.text}（来源：${l.date}）`).join('\n')||'未记录。'}`).join('\n\n')}\n\n## 月度评论\n\n${r.comment}\n` ;}
export function weekReportText(r:WeekReport){return `# ${r.week} — ${shiftDate(r.week,6)} 周报\n\n${weeklySummary(r).join('\n\n')}\n\n${r.days.map(d=>`${d.date}：${clockText(d.durationMs)}`).join('\n')}`;}

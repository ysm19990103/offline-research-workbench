import test from 'node:test';
import assert from 'node:assert/strict';
import * as t from '../.offline-tests/tasks.mjs';
import * as legacy from '../.offline-tests/legacy-v1.mjs';
import * as reports from '../.offline-tests/report-export.mjs';
import * as storage from '../.offline-tests/storage.mjs';
import * as cloud from '../.offline-tests/word-cloud.mjs';
import {calendarInfo} from '../.offline-tests/calendar.mjs';
const at=(s)=>new Date(s).getTime();
const empty=(date='2026-09-01')=>({...t.createMemory(date),tasks:[]});
const task=(id,project,dueDate,overrides={})=>({id,project,parentId:null,outcome:'',problem:'',nextStep:'',title:'任务 '+id,notes:'',dueDate,completed:false,completedAt:null,completedOn:null,createdAt:'2026-09-01T00:00:00.000Z',updatedAt:'2026-09-01T00:00:00.000Z',sample:false,order:1,...overrides});
test('priority sorting places overdue, today, future and undated tasks in chronological order',()=>{
 const list=[task('undated','research',null),task('future','skills','2026-09-12'),task('today','research','2026-09-09'),task('overdue','skills','2026-09-01')];
 assert.deepEqual(t.sortFocus(list).map(x=>x.id),['overdue','today','future','undated']);
 assert.equal(t.urgency(list[2],'2026-09-09').text,'今天截止');assert.equal(t.urgency(list[3],'2026-09-09').tone,'overdue');
});
test('creative milestones have no overdue or urgency flag and preserve node order',()=>{
 const first=task('a','leisure','2020-01-01',{order:1}),second=task('b','leisure','2026-09-09',{order:2});
 assert.equal(t.urgency(first,'2026-09-09').tone,'neutral');assert.equal(t.urgency(second,'2026-09-09').tone,'neutral');
 assert.deepEqual(t.sortMilestones([second,first]).map(x=>x.id),['a','b']);
});
test('invalid dates are rejected',()=>{assert.equal(t.validDate('2026-02-30'),false);assert.equal(t.validDate('2024-02-29'),true);assert.equal(t.validDate('2026-13-01'),false);});
test('pause excludes elapsed break; finishing preserves exactly four hours',()=>{
 let m=empty('2026-09-09');m=t.transitionWork(m,'start',at('2026-09-09T09:00:00+08:00'));
 m=t.transitionWork(m,'pause',at('2026-09-09T10:00:00+08:00'));
 assert.equal(t.workDuration(m.workdays[0],at('2026-09-09T12:00:00+08:00')),3600000);
 m=t.transitionWork(m,'resume',at('2026-09-09T12:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-09T15:00:00+08:00'));
 assert.equal(t.workDuration(m.workdays[0],at('2026-09-09T22:00:00+08:00')),4*3600000);
 assert.equal(t.clockText(m.workdays[0].accumulatedMs),'04:00:00');
});
test('same-day start and resume are forbidden after finish, including after backup reload',()=>{
 let m=t.transitionWork(empty('2026-09-09'),'start',at('2026-09-09T09:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-09T10:00:00+08:00'));
 m=t.validateBackup(JSON.parse(JSON.stringify(m)));
 assert.throws(()=>t.transitionWork(m,'start',at('2026-09-09T11:00:00+08:00')));
 assert.throws(()=>t.transitionWork(m,'resume',at('2026-09-09T11:00:00+08:00')));
 assert.equal(t.transitionWork(m,'start',at('2026-09-10T09:00:00+08:00')).workdays.length,2);
});
test('active timer survives reload and settles at midnight, paused time remains fixed',()=>{
 let m=t.transitionWork(empty('2026-09-09'),'start',at('2026-09-09T23:00:00+08:00'));
 m=t.validateBackup(JSON.parse(JSON.stringify(m)));
 assert.equal(t.workDuration(m.workdays[0],at('2026-09-09T23:30:00+08:00')),1800000);
 const next=t.reconcileMemory(m,at('2026-09-10T07:00:00+08:00'));
 assert.equal(next.workdays[0].state,'finished');assert.equal(next.workdays[0].accumulatedMs,3600000);
 const paused=t.transitionWork(m,'pause',at('2026-09-09T23:15:00+08:00'));
 assert.equal(t.reconcileMemory(paused,at('2026-09-10T07:00:00+08:00')).workdays[0].accumulatedMs,900000);
});
test('weekly summary uses Monday through Sunday and excludes paused hours',()=>{
 let m=empty('2026-09-07');
 for(const date of ['2026-09-07','2026-09-09']){m=t.transitionWork(m,'start',at(date+'T09:00:00+08:00'));m=t.transitionWork(m,'finish',at(date+'T11:30:00+08:00'));}
 const r=t.weeklyReportFor(m,'2026-09-07');assert.equal(r.totalMs,5*3600000);assert.equal(r.days.length,7);assert.equal(r.days[6].date,'2026-09-13');
 assert.equal(t.weekStart('2026-09-13'),'2026-09-07');assert.equal(t.weekStart('2027-01-01'),'2026-12-28');
});
test('Sunday finish produces a saved weekly report; missed weekends are backfilled',()=>{
 let m=t.transitionWork(empty('2026-09-07'),'start',at('2026-09-13T10:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-13T11:00:00+08:00'));
 const sunday=t.reconcileMemory(m,at('2026-09-13T11:00:00+08:00'));assert.equal(sunday.weeklyReports.length,1);assert.equal(sunday.weeklyReports[0].totalMs,3600000);
 const next=t.reconcileMemory(m,at('2026-09-21T10:00:00+08:00'));assert.deepEqual(next.weeklyReports.map(w=>w.week),['2026-09-07','2026-09-14']);
 assert.equal(t.reconcileMemory(next,at('2026-09-21T10:00:00+08:00')).weeklyReports.length,2);
});
test('monthly reports use completion date, omit examples, preserve comments and source journals',()=>{
 const m=empty();m.tasks=[t.completeTask(task('a','research','2026-09-09'),true,'2026-09-09'),t.completeTask(task('b','leisure',null),true,'2026-09-10'),t.completeTask(task('old','skills',null),true,'2026-08-31'),t.completeTask(task('demo','leisure',null,{sample:true}),true,'2026-09-11')];
 m.journals=[{date:'2026-09-09',reflection:'学习 Python 和统计分析。',comment:'数据有一个问题需要再核对。',updatedAt:'2026-09-09T00:00:00Z',progress:t.emptyProgress(),taskIds:[]}];
 const r=t.reportFor(m,'2026-09');assert.equal(r.completedTasks.length,2);assert.equal(r.journals.length,1);assert.equal(r.sections.done.length,2);assert.match(reports.monthlyReportHtml(r),/数据有一个问题需要再核对/);
 m.reports=[{...r,comment:'下个月继续。'}];assert.equal(t.reportFor(m,'2026-09').comment,'下个月继续。');
});
test('new month automatically archives previous month exactly once',()=>{
 const m=empty('2026-09-09');const next=t.reconcileMemory(m,at('2026-10-02T09:00:00+08:00'));assert.equal(next.reports.length,1);assert.equal(next.reports[0].month,'2026-09');
 assert.equal(t.reconcileMemory(next,at('2026-10-03T09:00:00+08:00')).reports.length,1);
});
test('22:00 reminder is due once per local day and respects its switch',()=>{
 const m=empty('2026-09-09');assert.equal(t.shouldRemind(m,at('2026-09-09T21:59:59+08:00')),false);assert.equal(t.shouldRemind(m,at('2026-09-09T22:00:00+08:00')),true);
 m.sleepReminder.lastRemindedOn='2026-09-09';assert.equal(t.shouldRemind(m,at('2026-09-09T23:00:00+08:00')),false);assert.equal(t.shouldRemind(m,at('2026-09-10T22:00:00+08:00')),true);
 m.sleepReminder.enabled=false;assert.equal(t.shouldRemind(m,at('2026-09-10T22:00:00+08:00')),false);
});
test('backup includes all modules, round-trips, and rejects corruption without touching current data',()=>{
 const m=empty('2026-09-09');assert.deepEqual(t.validateBackup(JSON.parse(JSON.stringify(m))),m);
 const bad=structuredClone(m);bad.tasks=[{title:'invalid'}];assert.throws(()=>t.validateBackup(bad));assert.equal(m.tasks.length,0);
 const duplicate=structuredClone(m);duplicate.tasks=[task('same','research',null),task('same','research',null)];assert.throws(()=>t.validateBackup(duplicate));
});
test('September 9, 2026 is 丙戌, 七月廿八, 丙火戌土, 屋上土',()=>{
 const c=calendarInfo('2026-09-09');assert.equal(c.ganzhi,'丙戌');assert.equal(c.lunarName,'七月廿八');assert.equal(c.elementText,'丙火 · 戌土');assert.equal(c.nayin,'屋上土');
});
test('lunar calendar matches HKO 2026 new year, eighth-month start and Mid-Autumn dates',()=>{
 assert.equal(calendarInfo('2026-02-17').lunarName,'正月初一');assert.equal(calendarInfo('2026-09-11').lunarName,'八月初一');assert.equal(calendarInfo('2026-09-25').festival,'中秋节');
 assert.equal(calendarInfo('2025-07-25').lunarName,'闰六月初一');assert.equal(calendarInfo('2000-01-07').ganzhi,'甲子');
});
test('all 2026 days have valid lunar dates and a continuous sexagenary cycle, including range limits',()=>{
 assert.ok(calendarInfo('1900-01-01').ganzhi);assert.ok(calendarInfo('2099-12-31').ganzhi);assert.throws(()=>calendarInfo('2100-01-01'));
 const stems='甲乙丙丁戊己庚辛壬癸',branches='子丑寅卯辰巳午未申酉戌亥';let previous=null;
 for(let i=0;i<365;i++){const c=calendarInfo(t.shiftDate('2026-01-01',i));assert.ok(c.lunarDay>=1&&c.lunarDay<=30);if(previous){assert.equal((stems.indexOf(previous.ganzhi[0])+1)%10,stems.indexOf(c.ganzhi[0]));assert.equal((branches.indexOf(previous.ganzhi[1])+1)%12,branches.indexOf(c.ganzhi[1]));}previous=c;}
});
test('restoring an earlier backup cannot unlock a finished current day',()=>{
 const old=empty('2026-09-09');let m=t.transitionWork(old,'start',at('2026-09-09T09:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-09T10:00:00+08:00'));
 const restored=t.restoreMemory(m,old,at('2026-09-09T11:00:00+08:00'));
 assert.equal(restored.workdays[0].state,'finished');assert.throws(()=>t.transitionWork(restored,'start',at('2026-09-09T12:00:00+08:00')));
});

test('v1 migration preserves categories, retired dates, history and finished timer lock',()=>{
 const old=legacy.createMemory('2026-09-09');
 old.tasks=old.tasks.map(x=>({...x,sample:false}));old.tasks.find(x=>x.project==='game').dueDate='2026-09-20';
 old.journals=[{date:'2026-09-09',reflection:'原始心得',comment:'原始评论',updatedAt:'2026-09-09T00:00:00Z'}];
 old.reports=[{...legacy.reportFor(old,'2026-09'),comment:'旧月报评语'}];
 let timed=legacy.transitionWork(old,'start',at('2026-09-09T09:00:00+08:00'));
 timed=legacy.transitionWork(timed,'finish',at('2026-09-09T10:00:00+08:00'));
 const m=t.validateBackup(timed);
 assert.equal(m.version,2);assert.equal(m.tasks.length,old.tasks.length);assert.equal(m.tasks.filter(x=>x.project==='clinical').length,0);
 assert.ok(m.tasks.some(x=>x.project==='skills'));assert.ok(m.tasks.filter(x=>x.project==='leisure').every(x=>x.dueDate===null));
 assert.match(m.tasks.find(x=>x.notes.includes('创意项目')).notes,/2026-09-20/);
 assert.equal(m.journals[0].reflection,'原始心得');assert.equal(m.reports[0].comment,'旧月报评语');assert.deepEqual(m.reports[0].priorSummary,old.reports[0].summary);
 assert.equal(t.workDuration(m.workdays[0]),3600000);
 assert.equal(t.validateBackup(m).workdays[0].state,'finished');
 assert.deepEqual(t.reportFor(m,'2026-09').priorSummary,old.reports[0].summary);
});
test('hierarchy rejects cycles and cross-board parents; child completion does not silently complete its parent',()=>{
 const m=empty('2026-09-09');m.tasks=[task('root','research',null),task('child','research','2026-09-10',{parentId:'root'}),task('leaf','research',null,{parentId:'child'})];
 t.assertHierarchy(m.tasks);assert.equal(t.taskPath(m.tasks,m.tasks[2]),'任务 root / 任务 child / 任务 leaf');assert.equal(t.descendants(m.tasks,'root').size,2);
 assert.throws(()=>t.assertHierarchy(m.tasks.map(x=>x.id==='root'?{...x,parentId:'leaf'}:x)),/循环/);
 assert.throws(()=>t.assertHierarchy(m.tasks.map(x=>x.id==='leaf'?{...x,project:'clinical'}:x)),/同一板块/);
 assert.throws(()=>t.toggleTask(m,'root',true),/子任务/);
 const next=t.toggleTask(m,'leaf',true,'2026-09-09');assert.equal(next.tasks.find(x=>x.id==='child').completed,false);assert.equal(next.records[0].event,'completed');
});
test('moving a subtree into leisure removes every deadline and preserves it in notes',()=>{
 const m=empty('2026-09-09');m.tasks=[task('root','research','2026-09-12'),task('child','research','2026-09-10',{parentId:'root'})];
 const next=t.saveTask(m,{...m.tasks[0],project:'leisure'},'root',null,'2026-09-09');
 assert.ok(next.tasks.every(x=>x.project==='leisure'&&x.dueDate===null));assert.ok(next.tasks.every(x=>x.notes.includes('原节点日期')));t.validateBackup(next);
 const corrupt=structuredClone(next);corrupt.tasks[0].dueDate='2026-09-10';assert.throws(()=>t.validateBackup(corrupt));
});
test('adding a child reopens completed parent and formalizes sample ancestors',()=>{
 const m=empty('2026-09-09');m.tasks=[t.completeTask(task('root','research',null,{sample:true}),true,'2026-09-09')];
 const next=t.saveTask(m,{...task('new','research',null),parentId:'root'},null,null,'2026-09-09');
 assert.equal(next.tasks[0].sample,false);assert.equal(next.tasks[0].completed,false);assert.equal(next.tasks[1].parentId,'root');
 assert.equal(t.deleteTask(next,'root').tasks.length,0);assert.ok(t.deleteTask(next,'root').records.some(r=>r.event==='deleted'));
});
test('one global timer ignores all task changes and excludes pauses',()=>{
 let m=empty('2026-09-09');m.tasks=[task('r','research',null),task('c','clinical',null),task('s','skills',null),task('l','leisure',null)];
 m.currentTaskId='r';m=t.transitionWork(m,'start',at('2026-09-09T09:00:00+08:00'));
 const started=structuredClone(m.workdays);
 m=t.saveTask(m,{...m.tasks[0],project:'leisure'},'r',null,'2026-09-09');
 m=t.toggleTask(m,'c',true,'2026-09-09');m=t.deleteTask(m,'s','2026-09-09');
 assert.deepEqual(m.workdays,started);assert.equal(m.currentTaskId,null);
 m=t.transitionWork(m,'pause',at('2026-09-09T11:00:00+08:00'));
 const paused=structuredClone(m.workdays);m=t.toggleTask(m,'c',false,'2026-09-09');assert.deepEqual(m.workdays,paused);
 m=t.transitionWork(m,'resume',at('2026-09-09T13:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-09T14:15:00+08:00'));
 assert.equal(t.workDuration(m.workdays[0]),3.25*3600000);assert.equal(m.workdays[0].segments.length,2);
 assert.ok(m.workdays[0].segments.every(segment=>segment.project==='unassigned'));
 assert.equal(t.weeklyReportFor(m,'2026-09-07').totalMs,3.25*3600000);t.validateBackup(m);
 assert.throws(()=>t.transitionWork(m,'start',at('2026-09-09T15:00:00+08:00')));
});
test('monthly daily bars partition the month without counting adjacent month days twice',()=>{
 let m=empty('2026-08-31');
 for(const date of ['2026-08-31','2026-09-01','2026-09-30','2026-10-01']){m=t.transitionWork(m,'start',at(date+'T09:00:00+08:00'));m=t.transitionWork(m,'finish',at(date+'T10:00:00+08:00'));}
 const weeks=t.monthWeeks(m,'2026-09'),included=weeks.flatMap(w=>w.days.filter(d=>d.included));
 assert.equal(included.length,30);assert.equal(new Set(included.map(d=>d.date)).size,30);assert.equal(weeks.reduce((s,w)=>s+w.totalMs,0),7200000);
 assert.equal(weeks[0].days[0].included,false);assert.equal(weeks[0].days[0].durationMs,0);assert.equal(weeks.at(-1).days[3].durationMs,0);
 assert.equal(weeks.reduce((sum,w)=>sum+w.totalMs,0),7200000);
});
test('structured monthly report links every line to a preserved raw record, with safe offline chart export',()=>{
 const m=empty();m.tasks=[t.completeTask(task('r','research',null,{outcome:'得到 3 个结果',problem:'还有 1 项未核对',nextStep:'复查原表'}),true,'2026-09-09')];
 m.records=[{...t.taskRecord(m.tasks[0],'completed','2026-09-09'),at:'2026-09-09T10:00:00Z'}];
 m.journals=[{date:'2026-09-09',reflection:'<script>alert(1)</script>',comment:'原始评论',progress:{done:'完成核对',result:'发现一项差异',problem:'编码待确认',next:'回看病历'},taskIds:['r'],updatedAt:'2026-09-09T10:00:00Z'}];
 const r=t.reportFor(m,'2026-09');for(const k of t.SECTION_KEYS)assert.ok(r.sections[k].length>0);
 const html=reports.monthlyReportHtml(r),links=[...html.matchAll(/href="#([^"]+)"/g)].map(x=>x[1]);for(const link of links)assert.ok(html.includes(`id="${link}"`));
 assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));assert.ok(!html.includes('<script>'));assert.equal((html.match(/<svg /g)||[]).length,r.weeks.length*2);
 const weekly=reports.weeklyReportHtml(t.weeklyReportFor(m,'2026-09-07'));assert.match(weekly,/<svg /);for(const p of t.PROJECT_KEYS)assert.ok(!weekly.includes(t.PROJECTS[p].name));
 assert.equal(r.journals[0].reflection,m.journals[0].reflection);m.journals[0].reflection='后来修改';assert.notEqual(r.journals[0].reflection,m.journals[0].reflection);
 t.validateBackup({...m,reports:[r]});
});
test('unchanged outcome is not repeated as a new result when only notes change in a later month',()=>{
 const m=empty();const first=task('r','research',null,{outcome:'九月得到的结果'}),second={...first,notes:'十月修改备注'};m.tasks=[second];
 m.records=[{...t.taskRecord(first,'updated','2026-09-09'),at:'2026-09-09T10:00:00Z'},{...t.taskRecord(second,'updated','2026-10-01'),at:'2026-10-01T10:00:00Z'}];
 assert.equal(t.reportFor(m,'2026-09').sections.result.length,1);assert.equal(t.reportFor(m,'2026-10').sections.result.length,0);
});
test('daily snapshot is immutable, created once per local date, and retains the newest 30 dates',()=>{
 const m=empty('2026-09-09');m.tasks=[task('r','research',null)];const first=storage.dailySnapshot(undefined,m,[],at('2026-09-09T09:00:00+08:00'));
 m.tasks[0].title='后来修改';assert.equal(first.memory.tasks[0].title,'任务 r');assert.equal(storage.dailySnapshot(first,m,[],at('2026-09-09T22:00:00+08:00')),first);
 const next=storage.dailySnapshot(first,m,[],at('2026-09-10T09:00:00+08:00'));assert.notEqual(next,first);assert.equal(next.memory.tasks[0].title,'后来修改');
 const dates=Array.from({length:31},(_,i)=>t.shiftDate('2026-08-10',i));assert.deepEqual(storage.expiredSnapshotDates(dates,'2026-09-10'),['2026-08-10','2026-08-11']);
});
test('full backup embeds file bytes and rejects missing, duplicate or mismatched attachments',async()=>{
 globalThis.FileReader=class{readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:application/octet-stream;base64,'+Buffer.from(b).toString('base64');this.onload();}).catch(()=>this.onerror());}};
 const m=empty('2026-09-09');m.tasks=[task('r','research',null)];const blob=new Blob(['论文测试\n'],{type:'text/plain'});
 m.resources=[{id:'a',taskId:'r',kind:'paper',mode:'copy',name:'论文.txt',path:'',blobId:'a',mime:'text/plain',size:blob.size,createdAt:'2026-09-09T00:00:00Z'}];
 const s=storage.dailySnapshot(undefined,m,[{id:'a',name:'论文.txt',mime:'text/plain',blob}],at('2026-09-09T09:00:00+08:00')),raw=JSON.parse(await storage.serializeSnapshot(s)),restored=storage.parseBackup(raw);
 assert.equal(await restored.assets[0].blob.text(),'论文测试\n');assert.deepEqual(restored.memory,s.memory);assert.deepEqual(restored.memory.resources,m.resources);
 assert.throws(()=>storage.parseBackup({...raw,assets:[]}));assert.throws(()=>storage.parseBackup({...raw,assets:[...raw.assets,...raw.assets]}));
 const corrupted=structuredClone(raw);corrupted.assets[0].size++;assert.throws(()=>storage.parseBackup(corrupted));
});

test('in-progress weekly and monthly drafts are finalized with later work, while comments survive',()=>{
 let m=empty('2026-09-07');
 m.reports=[{...t.reportFor(m,'2026-09',at('2026-09-09T10:00:00+08:00')),comment:'提前写的月评'}];
 m.weeklyReports=[t.weeklyReportFor(m,'2026-09-07',at('2026-09-09T10:00:00+08:00'))];
 assert.equal(m.reports[0].finalized,false);assert.equal(m.weeklyReports[0].finalized,false);
 m=t.transitionWork(m,'start',at('2026-09-13T09:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-13T11:00:00+08:00'));
 m.tasks=[t.completeTask(task('later','research',null),true,'2026-09-20')];
 const closedWeek=t.reconcileMemory(m,at('2026-09-13T11:00:00+08:00'));
 assert.equal(closedWeek.weeklyReports[0].totalMs,7200000);assert.equal(closedWeek.weeklyReports[0].finalized,true);
 const closedMonth=t.reconcileMemory(closedWeek,at('2026-10-01T09:00:00+08:00'));
 assert.equal(closedMonth.reports[0].completedTasks.length,1);assert.equal(closedMonth.reports[0].comment,'提前写的月评');assert.equal(closedMonth.reports[0].finalized,true);
 const repeated=t.reconcileMemory(closedMonth,at('2026-10-02T09:00:00+08:00'));assert.deepEqual(repeated.reports,closedMonth.reports);t.validateBackup(repeated);
});

test('existing v2 category segments and archived totals survive while every report shows global time only',()=>{
 let m=empty('2026-09-09');m.tasks=[task('r','research',null)];
 m=t.transitionWork(m,'start',at('2026-09-09T09:00:00+08:00'));
 m=t.transitionWork(m,'pause',at('2026-09-09T10:00:00+08:00'));
 m=t.transitionWork(m,'resume',at('2026-09-09T11:00:00+08:00'));
 m=t.transitionWork(m,'finish',at('2026-09-09T12:00:00+08:00'));
 m.currentTaskId='r';m.workdays[0].activeProject='clinical';m.workdays[0].segments[0].project='research';m.workdays[0].segments[1].project='clinical';
 const old=t.weeklyReportFor(m,'2026-09-07');old.summary=['科研工作：1 小时。','临床工作：1 小时。','另有未分类工时。'];
 const allocation={research:3600000,clinical:3600000,skills:0,leisure:0,unassigned:0};old.byProject=allocation;old.days.find(d=>d.date==='2026-09-09').byProject=allocation;
 for(const d of old.days)delete d.mood;m.weeklyReports=[old];
 const restored=t.validateBackup(JSON.parse(JSON.stringify(m)));
 assert.deepEqual(restored.workdays,m.workdays);assert.equal(restored.currentTaskId,null);assert.equal(t.workDuration(restored.workdays[0]),7200000);
 assert.equal(restored.weeklyReports[0].totalMs,7200000);
 const html=reports.weeklyReportHtml(restored.weeklyReports[0]);assert.match(html,/2 小时 0 分钟/);assert.doesNotMatch(html,/科研工作|临床工作|未分类|板块/);
 assert.equal((reports.chartSvg(old).match(/<rect /g)||[]).length,1);assert.doesNotMatch(t.weekReportText(old),/科研工作|临床工作|未分类/);
});
test('a single work journal preserves all old text and monthly sources without a four-box template',()=>{
 const m=empty('2026-09-09');m.journals=[{date:'2026-09-09',reflection:'自由心得',comment:'原始评论',progress:{done:'核对表格',result:'发现差异',problem:'编码问题',next:'回看原表'},taskIds:[],updatedAt:'2026-09-09T10:00:00Z'}];
 const text=t.journalText(m.journals[0]);for(const original of ['核对表格','发现差异','编码问题','回看原表','自由心得','原始评论'])assert.ok(text.includes(original));
 const next=t.saveJournal(m,'2026-09-09',text+'\n补记：已经复查',[],at('2026-09-09T22:00:00+08:00'));
 assert.deepEqual(next.journals[0].progress,t.emptyProgress());assert.equal(next.journals[0].comment,'');assert.equal(t.journalText(next.journals[0]),text+'\n补记：已经复查');
 const r=t.reportFor(next,'2026-09');for(const key of t.SECTION_KEYS)assert.ok(r.sections[key].some(l=>l.source==='journal'&&l.sourceId==='2026-09-09'));
 assert.match(reports.monthlyReportHtml(r),/补记：已经复查/);t.validateBackup(next);
});
test('independent mood diary accepts only 1–10 scores, preserves thoughts in backups and excludes thoughts from reports and CSV',()=>{
 let m=empty('2026-09-09');m=t.saveMood(m,'2026-09-09',8,'仅限日记的心情感悟',at('2026-09-09T22:00:00+08:00'));
 assert.equal(m.journals.length,0);assert.equal(t.validateBackup(m).moodEntries[0].reflection,'仅限日记的心情感悟');
 for(const score of [0,11,1.5,NaN,'8',undefined])assert.throws(()=>t.saveMood(m,'2026-09-09',score,'',at('2026-09-09T22:00:00+08:00')));
 const r=t.weeklyReportFor(m,'2026-09-07',at('2026-09-09T22:00:00+08:00'));assert.equal(r.days[2].mood,8);assert.equal(r.days[1].mood,null);
 const month=t.reportFor(m,'2026-09');assert.equal(month.journals.length,0);assert.ok(t.SECTION_KEYS.every(k=>month.sections[k].length===0));
 for(const output of [JSON.stringify(r),JSON.stringify(month),reports.weeklyReportHtml(r),reports.monthlyReportHtml(month),reports.monthlyTimeMoodCsv(m,'2026-09',at('2026-09-09T22:00:00+08:00'))])assert.doesNotMatch(output,/仅限日记的心情感悟/);
 const cleared=t.saveMood(m,'2026-09-09',null,'仅限日记的心情感悟',at('2026-09-09T22:00:00+08:00'));assert.equal(cleared.moodEntries[0].score,null);assert.equal(cleared.moodEntries[0].reflection,m.moodEntries[0].reflection);
 const corrupt=structuredClone(m);corrupt.moodEntries[0].score=11;assert.throws(()=>t.validateBackup(corrupt));
});
test('monthly CSV aligns local dates, total work duration and optional scores, including unrated and unworked days',()=>{
 let m=empty('2026-09-01');m=t.transitionWork(m,'start',at('2026-09-01T23:00:00+08:00'));m=t.transitionWork(m,'finish',at('2026-09-01T23:30:00+08:00'));
 m=t.saveMood(m,'2026-09-01',7,'秘密一',at('2026-09-02T09:00:00+08:00'));m=t.saveMood(m,'2026-09-02',4,'秘密二',at('2026-09-02T09:00:00+08:00'));
 const csv=reports.monthlyTimeMoodCsv(m,'2026-09',at('2026-09-03T00:30:00+08:00')),rows=csv.trim().split('\r\n');
 assert.equal(csv.charCodeAt(0),0xFEFF);assert.equal(rows.length,4);
 assert.equal(rows[1],'2026-09-01,0.5000,00:30:00,7,已结束');assert.equal(rows[2],'2026-09-02,0.0000,00:00:00,4,未打卡');assert.equal(rows[3],'2026-09-03,0.0000,00:00:00,,未打卡');
 assert.equal(reports.monthlyTimeMoodCsv(m,'2026-09',at('2026-10-01T09:00:00+08:00')).trim().split('\r\n').length,31);
 assert.throws(()=>reports.monthlyTimeMoodCsv(m,'2026-13'));assert.doesNotMatch(csv,/秘密/);
});
test('mood weather chart leaves missing dates empty and never bridges gaps or plots unrated zeroes',()=>{
 let m=empty('2026-09-07');for(const [date,score] of [['2026-09-07',1],['2026-09-09',10],['2026-09-10',6]])m=t.saveMood(m,date,score,'',at('2026-09-10T22:00:00+08:00'));
 const html=reports.moodChartSvg(t.weeklyReportFor(m,'2026-09-07'));assert.equal((html.match(/<circle /g)||[]).length,3);assert.equal((html.match(/stroke="#4d9173"/g)||[]).length,1);assert.match(html,/未评分/);assert.match(html,/>雨</);assert.match(html,/>晴</);assert.match(html,/>多云</);
});
test('word cloud uses real recent tasks, deduplicates each task, excludes examples, and preserves literal topic phrases',()=>{
 const tasks=[task('r','research',null,{title:'研究设计 Python Python 数据分析',notes:'Python 数据分析 今天完成',updatedAt:'2026-09-09T12:00:00Z'}),task('s','skills',null,{title:'Python 数据分析',updatedAt:'2026-09-10T12:00:00Z'}),task('old','clinical',null,{title:'过时词汇',createdAt:'2026-08-01T00:00:00Z',updatedAt:'2026-08-01T00:00:00Z'}),task('demo','leisure',null,{title:'不应出现示例词',sample:true})];
 const snapshot=cloud.buildWordCloud(tasks,'2026-09-13',at('2026-09-13T09:00:00+08:00'));
 assert.equal(snapshot.from,'2026-08-31');assert.equal(snapshot.taskCount,2);assert.equal(snapshot.words.find(w=>w.text==='python').count,2);assert.equal(snapshot.words.find(w=>w.text==='研究设计').count,1);assert.deepEqual(snapshot.words.find(w=>w.text==='数据分析').taskIds,['r','s']);
 assert.ok(snapshot.words.every(w=>!['今天','完成','过时词汇','不应出现示例词'].includes(w.text)));assert.ok(cloud.validWordCloud(snapshot));
 assert.ok(cloud.keywordTokens('研究设计 Python 完成',false).includes('研究设计'));assert.ok(!cloud.keywordTokens('https://example.com/secret').length);
 const corrupt=structuredClone(snapshot);corrupt.words[0].count=99;assert.equal(cloud.validWordCloud(corrupt),false);
});
test('word cloud initializes with first tasks, refreshes once on Sunday and catches up after missed weekends',()=>{
 const tasks=[task('r','research',null,{title:'研究设计',updatedAt:'2026-09-09T12:00:00Z'})];
 const blank=cloud.buildWordCloud([],'2026-09-09',at('2026-09-09T08:00:00+08:00'));
 const initial=cloud.refreshWordCloud(blank,tasks,'2026-09-09',at('2026-09-09T21:00:00+08:00'));assert.notEqual(initial,blank);
 assert.equal(cloud.refreshWordCloud(initial,tasks,'2026-09-12'),initial);
 const sunday=cloud.refreshWordCloud(initial,tasks,'2026-09-13',at('2026-09-13T00:00:00+08:00'));assert.notEqual(sunday,initial);assert.equal(sunday.scheduledFor,'2026-09-13');
 assert.equal(cloud.refreshWordCloud(sunday,[], '2026-09-13'),sunday);assert.equal(cloud.refreshWordCloud(sunday,tasks,'2026-09-14'),sunday);
 const late=cloud.refreshWordCloud(sunday,tasks,'2026-09-23',at('2026-09-23T09:00:00+08:00'));assert.equal(late.scheduledFor,'2026-09-20');assert.equal(late.through,'2026-09-23');assert.equal(late.taskCount,0);
 const m=empty('2026-09-09');m.tasks=tasks;const reconciled=t.reconcileMemory(m,at('2026-09-13T09:00:00+08:00'));assert.deepEqual(t.validateBackup(reconciled).wordCloud,reconciled.wordCloud);
});
test('deadline popups cover every unfinished dated task once, exclude examples and leisure, and follow deadline changes',()=>{
 let m=empty('2026-09-09');m.tasks=[task('r','research','2026-09-10'),task('c','clinical','2026-09-10'),task('s','skills','2026-09-10'),task('done','research','2026-09-10',{completed:true,completedAt:'2026-09-09T00:00:00Z',completedOn:'2026-09-09'}),task('later','skills','2026-09-11'),task('l','leisure',null),task('demo','research','2026-09-10',{sample:true})];
 assert.deepEqual(t.upcomingReminders(m,'2026-09-09').map(x=>x.id).sort(),['c','r','s']);
 m=t.claimDeadlineReminders(m,'2026-09-09');assert.equal(t.upcomingReminders(m,'2026-09-09').length,0);assert.equal(t.claimDeadlineReminders(m,'2026-09-09'),m);assert.equal(t.upcomingReminders(t.validateBackup(m),'2026-09-09').length,0);
 m.tasks=m.tasks.map(x=>x.id==='r'?{...x,dueDate:'2026-09-11'}:x);assert.deepEqual(t.upcomingReminders(m,'2026-09-10').map(x=>x.id).sort(),['later','r']);
 assert.equal(t.upcomingReminders(m,'2026-09-11').length,0);
});

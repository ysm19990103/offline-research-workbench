import type {Task} from './tasks';

export type CloudWord={text:string;count:number;taskIds:string[]};
export type WordCloudSnapshot={version:1;scheduledFor:string;generatedAt:string;from:string;through:string;taskCount:number;words:CloudWord[]};
const shift=(date:string,days:number)=>new Date(Date.parse(date+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
const localDate=(value:string)=>{const d=new Date(value);return Number.isFinite(d.getTime())?`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`:'';};
export function cloudSunday(today:string){return shift(today,-new Date(today+'T00:00:00Z').getUTCDay());}
const stop=new Set(('今天 今日 明天 昨天 本周 下周 上周 本月 下月 最近 近期 每天 工作 任务 事项 计划 安排 开始 继续 完成 整理 进行 准备 需要 已经 一个 一些 这个 那个 相关 内容 记录 示例 备注 新增 更新 修改 查看 添加 学习 研究 练习 核对 确认 检查 以及 然后 我们 可以 通过 主要 如果 因为 所以 about after again all also and are as at be been before being by can could do does for from had has have how in into is it its just may more most my new next not of on or our out over own same should so some such than that the their them then there these they this those through to too under until up very was we were what when where which while who why will with would you your todo done task tasks https http www com pdf docx xlsx csv md txt').split(/\s+/));
// These phrases are preserved only when they occur literally in task text.
const phrases=['研究设计','文献检索','文献综述','数据分析','数据清洗','统计建模','机器学习','项目管理','版本控制','游戏开发','知识整理'];
type WordSegmenter={segment:(text:string)=>Iterable<{segment:string;isWordLike?:boolean}>};
const Segmenter=(Intl as unknown as {Segmenter?:new(locale:string,options:{granularity:'word'})=>WordSegmenter}).Segmenter;
const segmenter=Segmenter?new Segmenter('zh-CN',{granularity:'word'}):null;
export function keywordTokens(text:string,useNative=true):string[]{
 let source=text.normalize('NFKC').replace(/https?:\/\/\S+/gi,' ').replace(/(?:\/[^\s/]+){2,}/g,' ');
 const result:string[]=[];
 for(const phrase of phrases){if(source.includes(phrase)){result.push(phrase);source=source.split(phrase).join(' ');}}
 const tokens=useNative&&segmenter?[...segmenter.segment(source)].filter(x=>x.isWordLike).map(x=>x.segment):source.match(/[A-Za-z][A-Za-z0-9+#.-]*|[\p{Script=Han}]{2,8}/gu)??[];
 for(const token of tokens){const word=token.toLocaleLowerCase('en-US').replace(/^[.\-]+|[.\-]+$/g,'');if(word.length>=2&&word.length<=24&&/[\p{L}]/u.test(word)&&!stop.has(word)&&!/^[\d年月日周号]+$/.test(word))result.push(word);}
 return [...new Set(result)];
}
export function buildWordCloud(tasks:Task[],today:string,now=Date.now()):WordCloudSnapshot{
 const from=shift(today,-13),recent=tasks.filter(t=>!t.sample&&[t.createdAt,t.updatedAt].some(at=>{const date=localDate(at);return date>=from&&date<=today;}));
 const words=new Map<string,CloudWord>();
 for(const task of recent)for(const text of keywordTokens(`${task.title}\n${task.notes}`)){const word=words.get(text)??{text,count:0,taskIds:[]};word.count++;word.taskIds.push(task.id);words.set(text,word);}
 return {version:1,scheduledFor:cloudSunday(today),generatedAt:new Date(now).toISOString(),from,through:today,taskCount:recent.length,words:[...words.values()].sort((a,b)=>b.count-a.count||a.text.localeCompare(b.text,'zh-CN')).slice(0,24)};
}
export function refreshWordCloud(previous:WordCloudSnapshot|undefined,tasks:Task[],today:string,now=Date.now()):WordCloudSnapshot{
 const firstTasks=previous?.taskCount===0&&tasks.some(t=>!t.sample&&[t.createdAt,t.updatedAt].some(at=>{const date=localDate(at);return date>=shift(today,-13)&&date<=today;}));
 return !previous||firstTasks||previous.scheduledFor<cloudSunday(today)?buildWordCloud(tasks,today,now):previous;
}
export function validWordCloud(raw:unknown):raw is WordCloudSnapshot{
 const w=raw as WordCloudSnapshot;if(!w||w.version!==1)return false;
 const date=(x:unknown)=>typeof x==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(x)&&Number.isFinite(Date.parse(x+'T00:00:00Z'))&&new Date(x+'T00:00:00Z').toISOString().slice(0,10)===x;
 return date(w.from)&&date(w.through)&&date(w.scheduledFor)&&w.from===shift(w.through,-13)&&w.scheduledFor===cloudSunday(w.through)&&typeof w.generatedAt==='string'&&Number.isFinite(Date.parse(w.generatedAt))&&Number.isInteger(w.taskCount)&&w.taskCount>=0&&w.taskCount<=50000&&Array.isArray(w.words)&&w.words.length<=24&&new Set(w.words.map(x=>x?.text)).size===w.words.length&&w.words.every(x=>x&&typeof x.text==='string'&&x.text.length>=2&&x.text.length<=24&&Number.isInteger(x.count)&&x.count>0&&x.count<=w.taskCount&&Array.isArray(x.taskIds)&&x.taskIds.length===x.count&&new Set(x.taskIds).size===x.count&&x.taskIds.every(id=>typeof id==='string'&&id.length>0&&id.length<=200));
}

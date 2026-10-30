'use client';
import React,{useState} from 'react';
import {Sparkles,ArrowUpRight} from 'lucide-react';
import {shiftDate,type Task} from '@/lib/tasks';
import type {WordCloudSnapshot} from '@/lib/word-cloud';

export function WordCloudCard({snapshot,tasks,edit}:{snapshot?:WordCloudSnapshot;tasks:Task[];edit:(task:Task)=>void}){
 const [selected,setSelected]=useState<string|null>(null),words=snapshot?.words??[],max=Math.max(1,...words.map(w=>w.count)),word=words.find(w=>w.text===selected);
 return <aside className="word-cloud-rail" aria-label="近期任务关键词"><section className="paper-card word-cloud-card"><div className="cloud-eyebrow"><Sparkles size={13}/> RECENT FOCUS</div><h2>最近，关注什么</h2><p className="cloud-subtitle">任务关键词 · 每周日更新</p>{words.length>0?<div className="word-cloud" aria-label="字号越大，涉及的任务越多">{words.map((w,i)=><button key={w.text} onClick={()=>setSelected(selected===w.text?null:w.text)} aria-pressed={selected===w.text} title={`${w.text} · ${w.count} 项任务`} style={{fontSize:`${14+Math.sqrt(w.count/max)*16}px`,color:['#0b4737','#347e64','#718e7d','#4b6c5b'][i%4],fontWeight:i<4?700:500}}>{w.text}</button>)}</div>:<div className="cloud-empty"><Sparkles size={25}/><p>关注，从一个行动开始</p><span>{snapshot?.taskCount?'暂未提取到有效关键词。':'近 14 天还没有正式任务。'}<br/>添加任务后，周日会把关注的主题收集在这里。</span></div>}{word&&<div className="cloud-sources"><strong>“{word.text}” · {word.count} 项任务</strong>{word.taskIds.map(id=>{const task=tasks.find(t=>t.id===id);return task?<button key={id} onClick={()=>edit(task)}>{task.title}<ArrowUpRight size={12}/></button>:<span key={id}>该任务已删除</span>;})}</div>}<div className="cloud-caption"><p>每项任务中同一词只计一次，点击词语可回看任务。</p>{snapshot&&<><time>{snapshot.from} — {snapshot.through}</time><span>{snapshot.taskCount} 项任务 · 下次更新 {shiftDate(snapshot.scheduledFor,7)}</span></>}</div></section><p className="cloud-footnote">词云来自近期创建或更新的任务名称与备注，保存在本机。工作台关闭时，下次打开补更新。</p></aside>;
}

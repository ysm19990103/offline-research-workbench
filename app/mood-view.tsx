'use client';
import React,{useRef,useState} from 'react';
import {CloudSun,Save} from 'lucide-react';
import {Button} from '@/components/ui/button';
import {Textarea} from '@/components/ui/textarea';
import {toast} from 'sonner';
import {saveMood,type Memory,type MoodEntry} from '@/lib/tasks';
import {DateControls} from './review-views';
import {Blank,type Mutate} from './workbench';

function MoodEditor({entry,date,mutate}:{entry?:MoodEntry;date:string;mutate:Mutate}){
 const [draft,setDraft]=useState({score:entry?.score??null,reflection:entry?.reflection??''}),[status,setStatus]=useState('输入后自动保存到心情日记');const seq=useRef(0);
 const save=async(next=draft)=>{const id=++seq.current;setStatus('正在保存…');try{await mutate(m=>saveMood(m,date,next.score,next.reflection));if(seq.current===id)setStatus('已保存到本机心情日记');}catch(e){if(seq.current===id)setStatus('保存失败，请点击重试');toast.error((e as Error).message);}};
 const change=(next:typeof draft)=>{setDraft(next);void save(next);};
 return <><div className="mood-editor"><div className="mood-question"><h3>今天，心情怎么样？</h3><span>{draft.score==null?'尚未评分':`${draft.score} / 10`}</span></div><div className="mood-scale" role="group" aria-label="每日心情自评分，从1到10"><span>低落</span><span>愉快</span>{Array.from({length:10},(_,i)=>i+1).map(score=><button key={score} type="button" aria-pressed={draft.score===score} aria-label={`心情 ${score} 分`} className={draft.score===score?'selected':''} onClick={()=>change({...draft,score})}>{score}</button>)}</div><button className="mood-clear" disabled={draft.score===null} onClick={()=>change({...draft,score:null})}>清除评分</button><div className="field"><label htmlFor="mood-reflection">留一点空间，给自己的感受</label><Textarea id="mood-reflection" className="unified-journal" value={draft.reflection} maxLength={100000} onChange={e=>change({...draft,reflection:e.target.value})} placeholder="开心的瞬间、说不清的情绪，或只是此刻的感受……"/></div><p className="mood-private-note">感悟原文只保存在这本日记中。周报、月报和工时数据导出只使用评分。</p></div><div className="editor-savebar"><span aria-live="polite">{status}</span><Button onClick={()=>void save()}><Save size={14}/>保存 / 重试</Button></div></>;
}
export function MoodDiaryView({memory,mutate,today}:{memory:Memory;mutate:Mutate;today:string}){
 const [date,setDate]=useState(today),entries=[...(memory.moodEntries??[])].filter(e=>e.score!==null||e.reflection.trim()).sort((a,b)=>b.date.localeCompare(a.date));
 return <div className="subpage journal-layout mood-diary"><section className="paper-card"><div className="paper-toolbar"><h2><CloudSun size={18}/>心情日记</h2><DateControls value={date} change={setDate} min="1900-01-01" max={today}/></div><MoodEditor key={date} date={date} entry={entries.find(e=>e.date===date)} mutate={mutate}/></section><aside><section className="paper-card recent-card"><h3>翻一翻，之前的心情</h3>{entries.slice(0,20).map(e=><button className="recent-item" key={e.date} onClick={()=>setDate(e.date)}><div className="mood-recent-date"><time>{e.date}</time><span>{e.score==null?'未评分':`${e.score} 分`}</span></div><p>{e.reflection||'只记录了这一天的心情分数。'}</p></button>)}{!entries.length&&<Blank small title="今天，先问候自己" description="一句感受或一个分数，都值得记下。"/>}</section></aside></div>;
}

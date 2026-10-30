import {readdirSync,readFileSync,statSync} from 'node:fs';
import {relative,join} from 'node:path';

const root=process.cwd();
const skipped=new Set(['.git','node_modules','.offline-build','.offline-tests']);
const allowedJson=new Set(['package.json','package-lock.json','tsconfig.json','lib/lunar-months.json']);
const licenseFiles=new Set(['THIRD_PARTY_NOTICES.txt','vendor/shadcn-tailwind-4.13.0.LICENSE.md']);
const patterns=[
 ['private key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
 ['GitHub credential',/\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})\b/],
 ['cloud access key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
 ['API credential',/\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b/],
 ['internal project identifier',/\b(?:appgprj|appgver|libfile|libdir)_[a-f0-9]{20,}\b/],
 ['internal source host',/git\.chatgpt-team\.site/],
 ['absolute account path',/(?:\/Users\/|\/home\/|\/workspace\/|[A-Z]:\\Users\\)[^\s'"<>]+/],
 ['credential URL',/https?:\/\/[^\s/@]+:[^\s/@]+@/],
 ['literal credential assignment',/(?:api[_-]?key|access[_-]?token|password|secret)["']?\s*[:=]\s*["'][A-Za-z0-9_+\/-]{20,}["']/i],
];
const email=/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
const failures=[];let count=0;
function inspect(dir){
 for(const name of readdirSync(dir)){
  if(skipped.has(name))continue;
  const path=join(dir,name),rel=relative(root,path).replaceAll('\\','/');
  if(statSync(path).isDirectory()){
   if(['.openai','.wrangler','data','private','backups','exports','attachments','user-content'].includes(name))failures.push([rel,'private or deployment directory']);
   else inspect(path);
   continue;
  }
  count++;
  if(name.startsWith('.env')||/\.(?:csv|xlsx?|pdf|docx|sqlite3?|db|zip|png|jpe?g|mp4|log)$/i.test(name))failures.push([rel,'data or local configuration file']);
  if(name.endsWith('.json')&&!allowedJson.has(rel))failures.push([rel,'unexpected JSON payload']);
  const text=readFileSync(path,'utf8');
  for(const [label,re] of patterns)if(re.test(text))failures.push([rel,label]);
  if(!licenseFiles.has(rel)&&email.test(text))failures.push([rel,'email outside third-party license']);
  if(/^(?:app|lib|offline)\//.test(rel)&&/\b(?:fetch\s*\(|XMLHttpRequest|WebSocket|sendBeacon\s*\()/.test(text))failures.push([rel,'runtime network API']);
 }
}
inspect(root);
if(failures.length){for(const [file,reason] of failures)console.error(`${file}: ${reason}`);process.exit(1);}
console.log(`PASS: ${count} source/build files checked; no flagged credentials, private paths or runtime data files.`);

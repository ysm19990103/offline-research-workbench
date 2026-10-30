import {build} from 'vite';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
await build({configFile:'vite.offline.config.ts'});
const js=readFileSync('.offline-build/workbench.js','utf8').replace(/<\/script/gi,'<\\/script');
const css=readFileSync('.offline-build/workbench.css','utf8');
if(/@import\b/.test(css))throw new Error('Unexpected external CSS import');
const html=`<!doctype html>\n<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="description" content="有序：离线个人工作台。待办、每日心得、工作计时、万年历与周月回顾。"><title>有序 · 离线工作台</title><link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='18' fill='%230c6048'/%3E%3Cpath d='M16 25 32 16 48 25 32 34Zm0 9 16 9 16-9M16 43l16 9 16-9' fill='none' stroke='white' stroke-width='3' stroke-linejoin='round'/%3E%3C/svg%3E"><style id="app-style">${css}</style></head><body><div id="root"></div><noscript>请在浏览器中启用 JavaScript。工作台的全部功能均可离线运行。</noscript><script id="app-script">${js}</script></body></html>`;
mkdirSync('dist',{recursive:true});writeFileSync('dist/index.html',html);
console.log(`Self-contained offline workbench: ${Math.round(Buffer.byteLength(html)/1024)} KB. No CDN, server, or network request required.`);

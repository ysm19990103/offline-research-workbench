import {build} from 'vite';
import {mkdirSync,writeFileSync,copyFileSync} from 'node:fs';
// Share the complete React UI, but load local JS/CSS files under a restrictive CSP.
await build({configFile:'vite.offline.config.ts',build:{outDir:'desktop-dist'}});
writeFileSync('desktop-dist/index.html','<!doctype html><html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>有序 · 工作台</title><link rel="stylesheet" href="./workbench.css"></head><body><div id="root"></div><script src="./workbench.js"></script></body></html>');
// Keep license notices available with local bundles as well as source distributions.
copyFileSync('THIRD_PARTY_NOTICES.txt','desktop-dist/THIRD_PARTY_NOTICES.txt');
console.log('Desktop assets built locally without remote scripts, fonts or styles.');

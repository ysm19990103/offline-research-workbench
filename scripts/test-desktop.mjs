import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['lib/storage.ts','lib/tasks.ts','lib/desktop.ts'],outdir:'.desktop-tests',bundle:true,platform:'node',format:'esm',outExtension:{'.js':'.mjs'},logLevel:'silent'});
const result=spawnSync(process.execPath,['--test','tests/desktop-storage.test.mjs'],{stdio:'inherit',env:{...process.env,TZ:'Asia/Shanghai'}});
process.exit(result.status??1);

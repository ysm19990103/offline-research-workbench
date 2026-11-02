import {execFileSync,spawn} from 'node:child_process';
import {readdirSync,writeFileSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';

if(process.platform!=='darwin')throw new Error('Run this verification on a macOS build host.');
const target=process.argv[2];
if(!['aarch64-apple-darwin','x86_64-apple-darwin','universal-apple-darwin'].includes(target))throw new Error('Expected a macOS target.');
const bundle=`src-tauri/target/${target}/release/bundle`,app=join(bundle,'macos','Research Workbench.app');
const binary=join(app,'Contents/MacOS/offline-research-workbench');
const run=(cmd,args)=>execFileSync(cmd,args,{encoding:'utf8',timeout:30000}).trim();
const architecture=run('lipo',['-archs',binary]);
for(const arch of target.startsWith('universal')?['arm64','x86_64']:[target.startsWith('aarch64')?'arm64':'x86_64'])if(!architecture.split(' ').includes(arch))throw new Error(`Missing ${arch}: ${architecture}`);
run('codesign',['--verify','--deep','--strict',app]);
execFileSync('codesign',['-dv','--verbose=2',app],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
const dmg=join(bundle,'dmg',readdirSync(join(bundle,'dmg')).find(s=>s.endsWith('.dmg'))??'missing');
if(!existsSync(dmg))throw new Error('Missing DMG');
run('hdiutil',['verify',dmg]);
// Only a synthetic, empty profile may be created on the disposable hosted runner.
// Launch as an app bundle so UserNotifications sees its real bundle identifier.
run('open',['-n',app]);
await new Promise(resolve=>setTimeout(resolve,8000));
const pids=run('pgrep',['-f',binary]).split('\n').filter(Boolean);
if(!pids.length)throw new Error('App did not remain running for startup smoke test.');
for(const pid of pids)run('kill',['-TERM',pid]);
const archive=join(bundle,'macos','Research Workbench.app.tar.gz');
run('tar',['-czf',archive,'-C',join(bundle,'macos'),'Research Workbench.app']);
const files=[dmg,archive],hashes=files.map(path=>`${createHash('sha256').update(readFileSync(path)).digest('hex')}  ${path.split('/').at(-1)}`).join('\n')+'\n';
writeFileSync(join(bundle,'SHA256SUMS.txt'),hashes);
const record={testedAt:new Date().toISOString(),commit:process.env.GITHUB_SHA??null,target,host:run('sw_vers',['-productVersion']),hostArchitecture:process.arch,binaryArchitectures:architecture,appStartupSmoke:'passed (8 seconds)',dmgIntegrity:'passed',codeSignature:'ad hoc development only',notarized:false,physicalDeviceTests:false,uiInteractionTests:false,notificationDeliveryAfterQuit:false,fileDialogsAndDefaultApps:false,minimumOSRuntimeVerified:false};
writeFileSync(join(bundle,'verification.json'),JSON.stringify(record,null,2)+'\n');
console.log(JSON.stringify(record,null,2));

import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {clockedFiles,openClockedTrafficReplay} from './soundmap/clocked-traffic-replay.mjs';

const [input,output]=process.argv.slice(2);
if(!input||!output)throw Error('Supply a completed clocked session and a fresh private replay folder');
const source=await fs.realpath(input), session=path.basename(source);
if(!/^[a-f0-9]{32}$/.test(session)||path.basename(path.dirname(source))!=='gameplay'||!source.split(path.sep).includes('.local'))
  throw Error('A private clocked gameplay session is required');
const local=await fs.realpath(fileURLToPath(new URL('../.local/',import.meta.url)));
const destination=path.join(await fs.realpath(path.dirname(path.resolve(output))),path.basename(output));
const relative=path.relative(local,destination);
if(!relative||relative==='..'||relative.startsWith('..'+path.sep)||path.isAbsolute(relative))throw Error('Replay destination must be under .local');
await fs.mkdir(destination);
const files={};
for(const name of clockedFiles){
  const file=path.join(source,name),stat=await fs.lstat(file);
  if(!stat.isFile()||stat.isSymbolicLink()||stat.size>128*1024*1024)throw Error('Invalid capture input '+name);
  const content=await fs.readFile(file);
  files[name]=createHash('sha256').update(content).digest('hex');
  await fs.writeFile(path.join(destination,name),content,{flag:'wx'});
}
await fs.writeFile(path.join(destination,'clocked-replay.json'),JSON.stringify({schema:1,session,files},null,2)+'\n',{flag:'wx'});
const replay=await openClockedTrafficReplay(destination);
const launcher=path.relative(destination,fileURLToPath(new URL('./Open-PowertrainReplay.mjs',import.meta.url))).replaceAll('/','\\');
await fs.writeFile(path.join(destination,'Open clocked traffic in SoundMap.cmd'),
  '@echo off\r\nnode "%~dp0'+launcher+'" "%~dp0." --take clocked --witness %*\r\nif errorlevel 1 pause\r\n',{flag:'wx'});
console.log(JSON.stringify({verified:true,session,output:destination,manifest:replay.manifest,events:replay.events},null,2));

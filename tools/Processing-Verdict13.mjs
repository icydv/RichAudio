import fs from 'node:fs';import path from 'node:path';
import {processingVerdict13} from './ci-gates13.mjs';
const input=path.resolve(process.argv[2]??''),output=path.resolve(process.argv[3]??''),local=path.resolve('.local')+path.sep;
if(!input.startsWith(local)||!output.startsWith(local)||path.extname(input)!=='.json'||path.extname(output)!=='.json')throw Error('Owned local report paths required');
const verdict=processingVerdict13(JSON.parse(fs.readFileSync(input)));
fs.writeFileSync(output,JSON.stringify(verdict,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(verdict));if(!verdict.requiredPassed)process.exitCode=1;

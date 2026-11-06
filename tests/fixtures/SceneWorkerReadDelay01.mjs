// Test-process preload only. A controlled IO stall on one authored manifest,
// never installed inputs. Does not alter any production deadline or algorithm.
import fs from 'node:fs';import {isMainThread} from 'node:worker_threads';
if(!isMainThread){const read=fs.readFileSync,exists=fs.existsSync,gate=new Int32Array(new SharedArrayBuffer(4));fs.readFileSync=function(file,...args){if(String(file)===process.env.RICHAUDIO_ORIGINAL_PHASE_MANIFEST01&&exists(process.env.RICHAUDIO_ORIGINAL_PHASE_MARKER01))Atomics.wait(gate,0,0,300);return read.call(this,file,...args);};}

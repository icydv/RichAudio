import {readFileSync,existsSync,statSync,realpathSync} from 'node:fs';
import {createHash} from 'node:crypto';
import path from 'node:path';
export const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex').toUpperCase();
export function preflight(file){
 const p=JSON.parse(readFileSync(file,'utf8').replace(/^\uFEFF/,''));
 if(p.schema!==1||p.state!=='REVIEW_ONLY'||p.runtime!=='b5143db8c99decef49a8c9fdf1473f0c3db4840f')throw Error('Candidate identity');
 if(p.hostSha256!=='847D5B59464A75DF67D9D2B51E5E444F1DF9D1D934C1CE8AD6F1F6ED20C5BAB7'||p.bridgeSha256!=='96EE4100BA2C2CCB2AB75A0664A3047A3BC293D5A8F43A3D37F21D09247EAFAD'||p.manifestSha256!=='64FC1B32CDEAE1877FA82B124EC827F0307005833A6EF36E9F444303E3A71BBA')throw Error('Sealed identity');
 for(const b of p.bindings){if(!path.isAbsolute(b.path)||hash(b.path)!==b.sha256)throw Error('Binding drift: '+b.role);}
 for(const [role,file,sha] of [['host',p.executable,p.hostSha256],['bridge',p.bridge,p.bridgeSha256],['manifest',p.manifest,p.manifestSha256]])if(hash(file)!==sha)throw Error(role+' drift');
 if(realpathSync(p.node)!==realpathSync(process.execPath))throw Error('Node resolution drift');
 const expected=['--root',p.cwd,'--scene','open-road','--beacon','harmonic','--beacon-frequency-hz','600','--beacon-level','0.44','--beacon-output-trim-db','24','--sources','1','--gain','0.20','--seconds','120','--device','default','--listener-pipe','--output',p.output];
 if(JSON.stringify(p.args)!==JSON.stringify(expected))throw Error('Invocation drift');
 if(!path.isAbsolute(p.output)||!p.output.startsWith(p.packageDirectory+path.sep)||existsSync(p.output))throw Error('Fresh private output required');
 if(!statSync(p.cwd).isDirectory()||p.env.PATH!==path.dirname(p.node)||p.env.NODE_OPTIONS!==''||p.env.NODE_PATH!=='')throw Error('Environment drift');
 // CreateProcess search checks application/current/system directories before PATH.
 for(const dir of [path.dirname(p.executable),p.cwd,p.env.SystemRoot,path.join(p.env.SystemRoot,'System32')]){const f=path.join(dir,'node.exe');if(existsSync(f)&&realpathSync(f)!==realpathSync(p.node))throw Error('Shadow Node executable');}
 return p;
}

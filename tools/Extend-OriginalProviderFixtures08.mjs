// Fixed original-fixture generator extension; no external input discovery.
import {readFile,writeFile,lstat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {originalEncryptedArchive08,providerByteSHA08} from '../tests/fixtures/ProviderWorld08.mjs';
const repo=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const args=process.argv.slice(2);if(args.length!==2||args[0]!=='--original-root')throw Error('fixed --original-root required');
const root=path.resolve(repo,args[1]);if(!root.startsWith(path.join(repo,'.local')+path.sep))throw Error('current-checkout original fixture root required');
for(let at=root;;at=path.dirname(at)){const s=await lstat(at);if(s.isSymbolicLink())throw Error('linked original fixture root');if(at===repo)break;if(path.dirname(at)===at)throw Error('fixture escaped checkout');}
const original=await readFile(path.join(root,'original.rpf'));if(original.length>32768)throw Error('fixed original archive byte ceiling');
const ng=originalEncryptedArchive08(original),aes=originalEncryptedArchive08(original,{aes:true});
for(const [file,bytes]of [['ng.rpf',ng.bytes],['aes.rpf',aes.bytes],['original-state.bin',ng.state],['original-aes.bin',aes.aesKey]])await writeFile(path.join(root,file),bytes,{flag:'wx'});
const proof=await readFile(path.join(root,'proof.json'));
const sourcePins={};for(const file of ['tests/CodeWalkerProviderFixtures08.cs','tools/New-CodeWalkerProviderFixtures08.ps1','tools/Extend-OriginalProviderFixtures08.mjs','tests/fixtures/ProviderWorld08.mjs','tests/fixtures/NgMetadata041.mjs'])sourcePins[file]=providerByteSHA08(await readFile(path.join(repo,file)));
const files={};for(const file of ['original.rpf','scrambled.rpf','nested.rpf','metadata-links.rpf','unknown-tag.rpf','missing-ng.rpf','bad-tree.rpf','bad-range.rpf','original.ymap','original.ytyp','original.ybn','ng.rpf','aes.rpf','original-state.bin','original-aes.bin']){const bytes=await readFile(path.join(root,file));files[file]={bytes:bytes.length,sha256:providerByteSHA08(bytes)};}
const sparse=await lstat(path.join(root,'sparse-original.rpf'));if(!sparse.isFile()||sparse.size!==3000000073)throw Error('Original sparse range fixture length');
files['sparse-original.rpf']={bytes:sparse.size,sha256:null,headerSHA256:providerByteSHA08(original.subarray(0,16)),authoredPrefixSHA256:providerByteSHA08(original),contentBasis:'original-authored-sparse-range-fixture'};
await writeFile(path.join(root,'generation.json'),JSON.stringify({schema:1,kind:'RichAudioOriginalProviderGeneration08',sourceAuthority:'original-authored-fixture',sourcePins,proofSHA256:providerByteSHA08(proof),files,gameFilesRead:false,keysAcquired:false,privateInputsRead:false},null,2)+'\n',{flag:'wx'});
console.log('PASS original NG/AES fixture extension and generator source bindings');

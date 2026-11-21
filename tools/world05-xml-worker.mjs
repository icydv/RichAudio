// Fixed supplied-buffer decoder. No input paths, filesystem APIs, game/key
// loaders, plugins, native addons, network calls or child creation.
import {decodeCodeWalkerXmlBuilding05} from './codewalker-xml05.mjs';
let text='',size=0;
try{
 for await(const bytes of process.stdin){size+=bytes.length;if(size>8388608)throw Error('stdin-bound');text+=bytes.toString('utf8');}
 const packet=JSON.parse(text);
 if(packet?.kind!=='bounded-xml-process05'||packet.schema!==1||Object.keys(packet).sort().join(',')!=='kind,request,schema')throw Error('packet-schema');
 const request=packet.request;
 if(!Array.isArray(request?.resources)||request.resources.length!==3)throw Error('triplet');
 let total=0;
 const resources=request.resources.map(r=>{
  if(typeof r.xml!=='string'||r.xml.length>1398104)throw Error('XML-encoded-bound');
  const xml=Buffer.from(r.xml,'base64');total+=xml.length;
  if(xml.length>1048576||total>2097152||xml.toString('base64')!==r.xml)throw Error('XML-decoded-bound');
  return {...r,xml};
 });
 const result=decodeCodeWalkerXmlBuilding05({...request,resources});
 const output=JSON.stringify({kind:'World05XmlDecodedResult',passed:true,sourceAuthority:'unqualified-supplied-buffer',decoded:result,installedWorldVerified:false,genuineResourceVerified:false});
 if(Buffer.byteLength(output)>1048576)throw Error('output-bound');
 process.stdout.write(output);
}catch{
 process.stderr.write('XML05 bounded decoding rejected input.');process.exitCode=1;
}

// Shared by the actual measurement and the declared launcher fixture worker.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
export function prepareNormalOuterInvocation01({repo,config,binding,templateSHA256}) {
 if(!/^[a-f0-9]{64}$/.test(templateSHA256??''))throw Error('Explicit parent proposal digest required');
 const wrapper=path.join(repo,'tools/Invoke-NormalReadinessOuter01.ps1');
 const pin=config.SourcePins.find(p=>p.Path==='tools/Invoke-NormalReadinessOuter01.ps1');
 const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
 if(!pin||hash(wrapper)!==pin.SHA256)throw Error('Pinned actual inner wrapper required');
 const bindingPath=path.join(binding.PrivateRoot,'inner-wrapper-binding.json');
 const value={...binding,SourcePins:config.SourcePins,ProposalIdentity:config.ProposalIdentity,TemplateSHA256:templateSHA256};
 fs.writeFileSync(bindingPath,JSON.stringify(value,null,2),{flag:'wx'});
 return {wrapper,bindingPath,args:['-NoProfile','-File',wrapper,'-BindingPath',bindingPath,'-ExpectedBindingSHA256',hash(bindingPath),'-ExpectedWrapperSHA256',pin.SHA256]};
}

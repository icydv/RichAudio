// A wholly authored catalogue-to-resource association. The encrypted catalogue
// does not itself contain geometry bytes or certify collision ownership.
import {worldResources04} from './WorldResources04.mjs';
import {originalNgMetadata041,encryptSyntheticNg041} from './NgMetadata041.mjs';
import {decodeNgMetadata041} from '../../src/acoustics/world/ng-metadata041.mjs';
import {byteDigest} from '../../src/acoustics/world/contracts.mjs';
export function worldFixture041(){
 const world=worldResources04(),ng=originalNgMetadata041(),entries=Buffer.from(ng.plainEntries);
 const map={ymap:'building.ymap',ytyp:'common/data/building.ytyp',ybn:'collision.ybn'},indices={ymap:2,ytyp:6,ybn:3};
 world.inventory.resources=world.inventory.resources.filter(r=>r.scopeTiles.includes('west'));
 for(const resource of world.inventory.resources){resource.path=map[resource.kind];resource.dependencies=resource.kind==='ymap'?[map.ytyp,map.ybn]:[];entries.writeUIntLE(resource.bytes,indices[resource.kind]*16+2,3);
  const packet=world.inputs.decodedResources[resource.id],normalized=JSON.parse(packet.decodedJson);if(resource.kind==='ybn')normalized.data.source.entry=resource.path;
  packet.decodedJson=JSON.stringify(normalized);packet.decodedSHA256=byteDigest(Buffer.from(packet.decodedJson));
 }
 const table=Buffer.concat([encryptSyntheticNg041(entries,ng.material,ng),encryptSyntheticNg041(ng.plainNames,ng.material,ng)]);
 const catalog=decodeNgMetadata041({archive:ng.archive,archiveName:ng.archiveName,archiveBytes:ng.archiveBytes,header:ng.header,table,profile:ng.profile,expected:{headerSHA256:byteDigest(ng.header),tableSHA256:byteDigest(table)}});
 const bindings=world.inventory.resources.map(r=>{const member=catalog.rows.find(row=>row.logicalMember===r.path);if(!member||member.storedRange.bytes!==r.bytes)throw Error('Original authored metadata association mismatch');return {resourceId:r.id,logicalMemberKey:member.logicalMemberKey,memberIdentity:member.memberIdentity,resourceSHA256:r.sha256,basis:'original-authored-fixture-association-not-installed-ownership'};});
 return {...world,catalog,bindings};
}

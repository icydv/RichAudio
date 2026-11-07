// Shared acoustic-core/browser wire contract. Pure data and process-local
// branding only: no filesystem, viewer package or acoustic engine imports.
export const SOUND_MAP_WIRE = Object.freeze({
  frameBytes:262144,compactGeometryBytes:524288,compactSurfaces:128,
  installedGeometryBytes:8*1024*1024,installedSurfaces:4096,
  telemetryBytes:8*1024*1024+262144+65536,
  serviceGeometryCacheBytes:32*1024*1024,viewerGeometryCacheBytes:16*1024*1024,
});
export const INSTALLED_GEOMETRY_PROFILE='installed-static-workset01';
// The producer and its client import this one module identity. JSON messages
// and browser callers cannot manufacture the process-local association.
const preparedEncodings=new WeakMap();
export const rememberPreparedGeometryEncoding=(geometry,encoding)=>preparedEncodings.set(geometry,encoding);
export const preparedGeometryEncoding=geometry=>geometry&&preparedEncodings.get(geometry);
export function geometryWireBudget(geometry) {
  const profile=geometry?.geometryProfile;
  if(profile===undefined||profile==='compact')return {profile:'compact',bytes:SOUND_MAP_WIRE.compactGeometryBytes,surfaces:SOUND_MAP_WIRE.compactSurfaces};
  if(profile!==INSTALLED_GEOMETRY_PROFILE||geometry.observationModel?.kind!=='conditional-installed-static-model')throw Error('Unsupported SoundMap geometry profile');
  return {profile,bytes:SOUND_MAP_WIRE.installedGeometryBytes,surfaces:SOUND_MAP_WIRE.installedSurfaces};
}

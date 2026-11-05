// Shared browser/producer/service wire bounds. This module has no IO or engine
// dependency, so the standalone viewer retains its existing packaging route.
export const SOUND_MAP_WIRE = Object.freeze({
  frameBytes:262144,compactGeometryBytes:524288,compactSurfaces:128,
  installedGeometryBytes:8*1024*1024,installedSurfaces:4096,
  telemetryBytes:8*1024*1024+262144+65536,
  serviceGeometryCacheBytes:32*1024*1024,viewerGeometryCacheBytes:16*1024*1024,
});
export const INSTALLED_GEOMETRY_PROFILE='installed-static-workset01';
// Process-local association. The immutable geometry descriptor and the exact
// encoded body are produced together; consumers cannot alter this association
// through JSON telemetry or browser input.
const preparedEncodings=new WeakMap();
export const rememberPreparedGeometryEncoding=(geometry,encoding)=>preparedEncodings.set(geometry,encoding);
export const preparedGeometryEncoding=geometry=>geometry&&preparedEncodings.get(geometry);
export function geometryWireBudget(geometry) {
  const profile=geometry?.geometryProfile;
  if(profile===undefined||profile==='compact')return {profile:'compact',bytes:SOUND_MAP_WIRE.compactGeometryBytes,surfaces:SOUND_MAP_WIRE.compactSurfaces};
  if(profile!==INSTALLED_GEOMETRY_PROFILE||geometry.observationModel?.kind!=='conditional-installed-static-model')throw Error('Unsupported SoundMap geometry profile');
  return {profile,bytes:SOUND_MAP_WIRE.installedGeometryBytes,surfaces:SOUND_MAP_WIRE.installedSurfaces};
}

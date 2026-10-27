import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
const s=JSON.parse(fs.readFileSync(path.join(process.argv[2],'markers.json'),'utf8'));let checks=0;
for(const [value,expected]of [[s.Version,1],[s.Domain,'original-synthetic-fixture'],[s.MarkersComplete,true],[s.RouteClear,false],[s.BenchmarkStartSupported,false],[s.RouteCoverage,'UNKNOWN'],[s.Revision,32],[s.Lines.length,5],[s.Start.Position.X,0],[s.Finish.Position.X,100],[s.Listener.Position.X,50],[s.Listener.Position.Y,10]]){assert.equal(value,expected);checks++;}
for(const line of s.Lines){assert(['Start','Finish','Listener'].includes(line.Kind));assert([line.A,line.B].every(p=>['X','Y','Z'].every(k=>Number.isFinite(p[k]))));checks+=2;}
const adapter=fs.readFileSync(new URL('../src/benchmark/BenchmarkMarkers.Rph.cs',import.meta.url),'utf8');assert(!/GetAllVehicles|TraceLine|CreateVehicle|DeleteEntity|\.Delete\(|WarpInto|PlaySound|245A6883|B3B33593|EAE6DCC7|INVALIDATE_IDLE_CAM/.test(adapter));checks++;
const draw=adapter.slice(adapter.indexOf('private static void Draw('),adapter.indexOf('[ConsoleCommand',adapter.indexOf('private static void Draw(')));assert(!/NativeFunction|Capture\(|\.Position|GetAllVehicles/.test(draw));checks++;
for(const command of ['RichAudioBenchStart','RichAudioBenchFinish','RichAudioBenchListener']){assert(adapter.includes('Name="'+command+'"'));checks++;}
console.log('PASS: '+checks+' independent marker geometry/provenance/separation checks; synthetic only.');

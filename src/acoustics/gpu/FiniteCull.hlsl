// Conservative acoustic visibility broadphase, not DXR/hardware ray tracing.
// All inputs are local to one bounded tile. CPU double-precision finite-patch,
// opening and ambiguity tests remain authoritative for every potential result.
struct Segment { float4 a; float4 b; };
struct Surface { float4 center; float4 normal; float4 lo; float4 hi; };
StructuredBuffer<Segment> segments : register(t0);
StructuredBuffer<Surface> surfaces : register(t1);
RWStructuredBuffer<uint4> result : register(u0);
cbuffer Counts : register(b0) { uint surfaceCount; uint segmentCount; float margin; uint unused; };
groupshared uint masks[4];
[numthreads(128,1,1)]
void main(uint3 group : SV_GroupID, uint lane : SV_GroupIndex) {
    if (lane < 4) masks[lane] = 0;
    GroupMemoryBarrierWithGroupSync();
    if (group.x < segmentCount && lane < surfaceCount) {
        Segment ray = segments[group.x];
        Surface patch = surfaces[lane];
        bool possible = all(max(ray.a.xyz,ray.b.xyz) >= patch.lo.xyz-margin)
                     && all(min(ray.a.xyz,ray.b.xyz) <= patch.hi.xyz+margin);
        float da = dot(ray.a.xyz-patch.center.xyz,patch.normal.xyz);
        float db = dot(ray.b.xyz-patch.center.xyz,patch.normal.xyz);
        possible = possible && !((da>margin && db>margin)||(da< -margin && db< -margin));
        if (possible) InterlockedOr(masks[lane>>5],1u<<(lane&31));
    }
    GroupMemoryBarrierWithGroupSync();
    if (lane == 0 && group.x < segmentCount) result[group.x] = uint4(masks[0],masks[1],masks[2],masks[3]);
}

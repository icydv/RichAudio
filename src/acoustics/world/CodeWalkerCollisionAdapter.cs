// Original read-only normalization adapter for the user's existing CodeWalker dev46.
// No vendor source is copied and no archive/file write API is called here.
using System;
using System.Collections.Generic;
using System.Web.Script.Serialization;
using CodeWalker.GameFiles;
using SharpDX;

namespace RichAudio.World
{
    public static class CodeWalkerCollisionAdapter
    {
        private static double[] Vector(Vector3 v) { return new[] { (double)v.X, (double)v.Y, (double)v.Z }; }
        // Authored fixtures exercise this installed DLL's real geometry and placement APIs.
        // They are not an observed map/entity match and contain no extracted game geometry.
        public static string AuthoredOracleFixtures()
        {
            var geometry = new BoundGeometry { Vertices = new[] { new Vector3(3,4,5), new Vector3(4,7,10), new Vector3(5,8,6), new Vector3(6,5,9) },
                CenterGeom = new Vector3(10,2,-3), Transform = Matrix.RotationZ(0.5f) * Matrix.Translation(100,20,30),
                Materials = new[] { new BoundMaterial_s { Data1 = 0x80000007u, Data2 = 65536u } }, PolygonMaterialIndices = new byte[] { 0 } };
            var box = new BoundPolygonBox { boxIndex1 = 0, boxIndex2 = 1, boxIndex3 = 2, boxIndex4 = 3, Owner = geometry };
            geometry.Polygons = new BoundPolygon[] { box };
            var serializer = new JavaScriptSerializer { MaxJsonLength = 268435456 };
            var collision = serializer.DeserializeObject(Normalize(geometry, "authored.rpf", "authored.ybn", new string('a',64), 0));
            var placements = new List<object>();
            var nearUnit = Quaternion.RotationAxis(Vector3.UnitZ, (float)Math.PI / 2);
            nearUnit = new Quaternion(nearUnit.X * 1.0004f, nearUnit.Y * 1.0004f, nearUnit.Z * 1.0004f, nearUnit.W * 1.0004f);
            var rotations = new[] { Quaternion.Identity, Quaternion.RotationAxis(Vector3.UnitZ, (float)Math.PI / 2), Quaternion.RotationAxis(Vector3.Normalize(new Vector3(1,2,3)), 0.7f), nearUnit };
            for (int i = 0; i < rotations.Length; i++)
            {
                var q = rotations[i];
                var def = new CEntityDef { position = new Vector3(100,200,-30), rotation = new Vector4(q.X,q.Y,q.Z,q.W), scaleXY = i == 2 ? -2 : 2, scaleZ = 3 };
                var entity = new YmapEntityDef(null, i, ref def);
                var transform = Matrix.Transformation(Vector3.Zero, Quaternion.Identity, entity.Scale, Vector3.Zero, entity.Orientation, entity.Position);
                var point = i == 3 ? new Vector3(1000,300,-150) : new Vector3(2,3,4);
                placements.Add(new { kind = "CEntityDef", id = "authored-" + i, position = Vector(def.position), rotation = new[] { (double)q.X, q.Y, q.Z, q.W },
                    scaleXY = (double)def.scaleXY, scaleZ = (double)def.scaleZ, point = Vector(point), expectedWorld = Vector(Vector3.TransformCoordinate(point, transform)) });
            }
            return serializer.Serialize(new { schema = 1, evidence = "authored-local-CodeWalker-api-fixtures", collision, boxDiagonalInParent = new[] { Vector(box.Vertex1), Vector(box.Vertex2), Vector(box.Vertex3), Vector(box.Vertex4) }, placements });
        }
        public static string Normalize(Bounds root, string archive, string entry, string hash, int bytes)
        {
            if (root == null) throw new InvalidOperationException("YBN bounds missing");
            var nodes = new List<object>();
            long vertices = 0, polygons = 0;
            Visit(root, null, "root", 0, nodes, ref vertices, ref polygons);
            var result = new
            {
                schema = 1, kind = "CodeWalkerYbnMesh",
                source = new { archive, entry, sha256 = hash, bytes,
                    coordinateSpace = "resource-root", placement = "unresolved-static-vs-archetype-local",
                    transformConvention = "SharpDX-row-vector-leaf-to-root-center-before-transform",
                    parser = "existing-trusted-local-CodeWalker-dev46", worldPlacementVerified = false },
                nodes
            };
            return new JavaScriptSerializer { MaxJsonLength = 268435456, RecursionLimit = 128 }.Serialize(result);
        }
        private static void Visit(Bounds bound, string parent, string transformSource, int depth,
            List<object> nodes, ref long totalVertices, ref long totalPolygons)
        {
            if (depth > 63 || nodes.Count >= 65536) throw new InvalidOperationException("Bounds tree limit");
            string id = "n" + nodes.Count;
            var geometry = bound as BoundGeometry;
            var composite = bound as BoundComposite;
            var vertices = new List<double[]>();
            var polygons = new List<object>();
            var materials = new List<object>();
            var oracles = new List<object>();
            if (geometry != null)
            {
                var vv = geometry.Vertices;
                var pp = geometry.Polygons;
                var mm = geometry.Materials;
                totalVertices += vv == null ? 0 : vv.Length;
                totalPolygons += pp == null ? 0 : pp.Length;
                if (totalVertices > 2000000 || totalPolygons > 2000000) throw new InvalidOperationException("Geometry count limit");
                if (vv != null) foreach (var v in vv) vertices.Add(Vector(v));
                if (mm != null) foreach (var m in mm) materials.Add(new { type = m.Data1 & 255u, data1 = m.Data1, data2 = m.Data2 });
                if (pp != null) for (int i = 0; i < pp.Length; i++)
                {
                    var p = pp[i];
                    var triangle = p as BoundPolygonTriangle;
                    var box = p as BoundPolygonBox;
                    var sphere = p as BoundPolygonSphere;
                    var capsule = p as BoundPolygonCapsule;
                    var cylinder = p as BoundPolygonCylinder;
                    int slot = -1;
                    if (geometry.PolygonMaterialIndices != null && i < geometry.PolygonMaterialIndices.Length) slot = geometry.PolygonMaterialIndices[i];
                    if ((triangle != null || box != null) && (slot < 0 || mm == null || slot >= mm.Length)) throw new InvalidOperationException("Surface material reference missing");
                    polygons.Add(new { family = triangle != null ? "Triangle" : (p == null ? "NullPolygon" : p.Type.ToString()),
                        indices = p == null ? new int[0] : (p.VertexIndices ?? new int[0]), materialSlot = slot,
                        radius = sphere != null ? (double)sphere.sphereRadius : capsule != null ? (double)capsule.capsuleRadius : cylinder != null ? (double)cylinder.cylinderRadius : 0 });
                }
                if (vv != null && vv.Length > 0) for (int i = 0; i < Math.Min(8, vv.Length); i++)
                {
                    int vi = (int)((long)i * (vv.Length - 1) / Math.Max(1, Math.Min(8, vv.Length) - 1));
                    oracles.Add(new { index = vi, positionInParent = Vector(geometry.GetVertexPos(vi)) });
                }
            }
            nodes.Add(new { id, parent, type = bound.GetType().Name, transform = Array.ConvertAll(bound.Transform.ToArray(), v => (double)v), transformSource,
                center = geometry == null ? new double[] { 0, 0, 0 } : Vector(geometry.CenterGeom),
                vertices, polygons, materials, oracleSamples = oracles, unsupportedBound = geometry == null && composite == null,
                declaredBounds = new { min = Vector(bound.BoxMin), max = Vector(bound.BoxMax) } });
            if (composite == null || composite.Children == null || composite.Children.data_items == null) return;
            var children = composite.Children.data_items;
            var transforms = composite.ChildrenTransformation1 ?? composite.ChildrenTransformation2;
            for (int i = 0; i < children.Length; i++)
            {
                var child = children[i];
                if (child == null) throw new InvalidOperationException("Null collision child prevents complete traversal");
                Matrix expected = transforms != null && i < transforms.Length ? transforms[i].ToMatrix() : Matrix.Identity;
                if (!expected.Equals(child.Transform)) throw new InvalidOperationException("Parser child transform mismatch");
                string basis = transforms == null || i >= transforms.Length ? "parser-identity-fallback" :
                    (composite.ChildrenTransformation1 != null ? "ChildrenTransformation1" : "ChildrenTransformation2");
                Visit(child, id, basis, depth + 1, nodes, ref totalVertices, ref totalPolygons);
            }
        }
    }
}

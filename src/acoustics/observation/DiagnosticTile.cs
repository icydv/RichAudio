// Original, bounded research model. No RPH, collision callbacks, rendering or audio.
using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
namespace RichAudio.GeometryResearch
{
    public static class TilePlan
    {
        public const int Groups=2, RaysPerGroup=9, MaximumCalls=18;
        public const string Id="wall-ground-two-groups-v1";
        public static PlannedRay[] Create(string group,Point3 player,Point3 forward)
        {
            if(group=="wall")return SurfacePlan.Create(player,forward);
            if(group!="ground")throw new InvalidDataException("Unknown fixed group");
            double h=Math.Sqrt(forward.X*forward.X+forward.Y*forward.Y);
            if(!player.Finite||!forward.Finite||h<.5)throw new InvalidDataException("Invalid fixed pose");
            var rays=new List<PlannedRay>();Point3 d=new Point3(forward.X/h,forward.Y/h,0),r=new Point3(d.Y,-d.X,0);
            for(int row=0;row<3;row++)for(int col=0;col<3;col++){
                double x=(col-1)*.75,y=(row-1)*.75;
                var a=new Point3(player.X+x*r.X+y*d.X,player.Y+x*r.Y+y*d.Y,player.Z+1);
                var b=new Point3(a.X,a.Y,a.Z-8);
                if(!a.Finite||!b.Finite)throw new InvalidDataException("Invalid ground ray");
                rays.Add(new PlannedRay{Order=rays.Count,Row=row,Column=col,Lateral=x,Vertical=y,Origin=a,End=b});
            }
            return rays.ToArray();
        }
    }
    // Claims are monotonic. Display operations cannot reset this gate or call a query.
    public sealed class TileBudget
    {
        private readonly bool[] claimed=new bool[2];private readonly object sync=new object();private int active=-1,calls,groupCalls;private bool stopped;
        public int Calls {get{lock(sync)return calls;}} public bool Stopped {get{lock(sync)return stopped;}}
        public bool Claim(string name){lock(sync){int n=name=="wall"?0:name=="ground"?1:-1;if(n<0||stopped||active>=0||claimed[n])return false;claimed[n]=true;active=n;groupCalls=0;return true;}}
        public bool Next(){lock(sync){if(stopped||active<0||groupCalls>=9||calls>=18)return false;groupCalls++;calls++;return true;}}
        public void Finish(){lock(sync)active=-1;}public void Stop(){lock(sync){stopped=true;active=-1;}}
    }
    [DataContract] public sealed class TileGroup
    {
        [DataMember] public string Name,Kind,Session,Build="1.0.1158.16",Framework="1.132.1428.17748",Plan=TilePlan.Id,Completion="not_executed",Error;
        [DataMember] public int Interior,Generation=1,TraceCalls;
        [DataMember] public Point3 Player,Forward;
        [DataMember] public double StartedMs,FinishedMs,ReconstructionMs,TileUpdateMs,SnapshotMs;
        [DataMember] public List<SurfaceSample> Samples=new List<SurfaceSample>();
    }
    [DataContract] public sealed class InferredPatch
    {
        [DataMember] public readonly string Id,Group,Session,Build,Status="inferred-local-planarity-only",Material="unknown",Permanence="unverified",Units="gta-native-units-unverified";
        [DataMember] public readonly int Interior,Generation;
        [DataMember] public readonly Point3 Center,Normal;
        [DataMember] public readonly double Rms,MaxResidual,NormalDegrees,PlaneTolerance,Inset,ObservedMs;
        [DataMember(Name="Footprint")] private readonly Point3[] footprint;
        public int Count {get{return footprint.Length;}}public Point3 PointAt(int i){return footprint[i];}
        internal InferredPatch(TileGroup g,Point3 center,Point3 normal,Point3[] polygon,double rms,double residual,double degrees,double tolerance,double inset)
        {Id=g.Name+"-candidate-1";Group=g.Name;Session=g.Session;Build=g.Build;Interior=g.Interior;Generation=g.Generation;Center=center;Normal=normal;footprint=(Point3[])polygon.Clone();Rms=rms;MaxResidual=residual;NormalDegrees=degrees;PlaneTolerance=tolerance;Inset=inset;ObservedMs=g.FinishedMs;}
        public bool Current(string session,string build,int interior,int generation,double now)
        {return session==Session&&build==Build&&interior==Interior&&generation==Generation&&ObservationRules.Finite(now)&&now>=ObservedMs&&now-ObservedMs<1000;}
    }
    public static class PatchReconstruction
    {
        internal static Point3 Add(Point3 a,Point3 b){return new Point3(a.X+b.X,a.Y+b.Y,a.Z+b.Z);}
        internal static Point3 Mul(Point3 p,double s){return new Point3(p.X*s,p.Y*s,p.Z*s);}
        internal static Point3 Unit(Point3 p){if(!p.Finite||p.Length<1e-12)throw new InvalidDataException("Degenerate direction");return Mul(p,1/p.Length);}
        private static Point3 Cross(Point3 a,Point3 b){return new Point3(a.Y*b.Z-a.Z*b.Y,a.Z*b.X-a.X*b.Z,a.X*b.Y-a.Y*b.X);}
        private struct UV {public double X,Y;public UV(double x,double y){X=x;Y=y;}}
        private static double Turn(UV a,UV b,UV c){return(b.X-a.X)*(c.Y-a.Y)-(b.Y-a.Y)*(c.X-a.X);}
        private static List<UV> Half(List<UV> ps){var h=new List<UV>();foreach(var p in ps){while(h.Count>=2&&Turn(h[h.Count-2],h[h.Count-1],p)<=1e-12)h.RemoveAt(h.Count-1);h.Add(p);}return h;}
        public static InferredPatch Fit(TileGroup g)
        {
            ValidateEnvelope(g);if(g.Completion!="complete"||g.TraceCalls!=9||g.Samples.Count!=9||g.Error!=null)throw new InvalidDataException("Incomplete support; unknown coverage retained");
            var points=new List<Point3>();var normals=new List<Point3>();var identities=new HashSet<string>();double tolerance=0;double previous=g.StartedMs;
            var plan=TilePlan.Create(g.Kind,g.Player,g.Forward);uint? player=null;
            for(int i=0;i<9;i++){
                SurfaceSample s=g.Samples[i];GeometryObservation o=s==null?null:s.Observation;PlannedRay ray=s==null?null:s.Ray;
                var validation=ObservationRules.Validate(o);
                if(s==null||s.Id!=g.Name+"-ray-"+i||ray==null||ray.Order!=i||ray.Row!=plan[i].Row||ray.Column!=plan[i].Column||ray.Lateral!=plan[i].Lateral||ray.Vertical!=plan[i].Vertical||!validation.SurfaceValid)throw new InvalidDataException("Missing or invalid sample");
                double t=validation.PositionTolerance.Value;
                if(o.SessionId!=g.Session||o.GameVersion!=g.Build||o.FrameworkVersion!=g.Framework||o.ErrorClass!=null||o.QueryProvenance==null||o.QueryProvenance.Length>256||o.ObservedAtMs<previous||o.ObservedAtMs>g.FinishedMs||player.HasValue&&player!=o.IgnoredPlayerHandle)throw new InvalidDataException("Sample provenance or time mismatch");
                if(Point3.Sub(ray.Origin,plan[i].Origin).Length>t||Point3.Sub(ray.End,plan[i].End).Length>t||Point3.Sub(o.Origin.Value,plan[i].Origin).Length>t||Point3.Sub(o.End.Value,plan[i].End).Length>t)throw new InvalidDataException("Fixed ray mismatch");
                points.Add(o.HitPosition.Value);normals.Add(Unit(o.HitNormal.Value));identities.Add(o.HitEntityHandle.HasValue?"handle-"+o.HitEntityHandle.Value:"unavailable");tolerance=Math.Max(tolerance,t);previous=o.ObservedAtMs;player=o.IgnoredPlayerHandle;
            }
            if(identities.Count!=1)throw new InvalidDataException("Mixed entity support");
            // Same bounded symmetric Jacobi fit as the independently tested JS research fit.
            Point3 anchor=points[0],mean=new Point3();foreach(var p in points)mean=Add(mean,Mul(Point3.Sub(p,anchor),1.0/9));Point3 center=Add(anchor,mean);
            var a=new double[3,3];var v=new double[3,3];for(int i=0;i<3;i++)v[i,i]=1;
            foreach(var point in points){Point3 d=Point3.Sub(Point3.Sub(point,anchor),mean);double[] z={d.X,d.Y,d.Z};for(int i=0;i<3;i++)for(int j=0;j<3;j++)a[i,j]+=z[i]*z[j]/9;}
            double scale=1;foreach(double x in a)scale=Math.Max(scale,Math.Abs(x));
            for(int k=0;k<48;k++){
                int p=0,q=1;if(Math.Abs(a[0,2])>Math.Abs(a[p,q])){p=0;q=2;}if(Math.Abs(a[1,2])>Math.Abs(a[p,q])){p=1;q=2;}if(Math.Abs(a[p,q])<=1e-14*scale)break;
                double angle=.5*Math.Atan2(2*a[p,q],a[q,q]-a[p,p]),s=Math.Sin(angle),c=Math.Cos(angle),app=a[p,p],aqq=a[q,q],apq=a[p,q];
                for(int i=0;i<3;i++)if(i!=p&&i!=q){double x=a[i,p],y=a[i,q];a[i,p]=a[p,i]=c*x-s*y;a[i,q]=a[q,i]=s*x+c*y;}
                a[p,p]=c*c*app-2*s*c*apq+s*s*aqq;a[q,q]=s*s*app+2*s*c*apq+c*c*aqq;a[p,q]=a[q,p]=0;
                for(int i=0;i<3;i++){double x=v[i,p],y=v[i,q];v[i,p]=c*x-s*y;v[i,q]=s*x+c*y;}
            }
            if(Math.Max(Math.Abs(a[0,1]),Math.Max(Math.Abs(a[0,2]),Math.Abs(a[1,2])))>1e-11*scale)throw new InvalidDataException("Fit convergence");
            int[] order={0,1,2};Array.Sort(order,delegate(int x,int y){int c=a[x,x].CompareTo(a[y,y]);return c!=0?c:x-y;});
            if(a[order[1],order[1]]<1e-8||a[order[1],order[1]]/Math.Max(a[order[2],order[2]],1e-30)<.01)throw new InvalidDataException("Degenerate support");
            Point3 normal=Unit(new Point3(v[0,order[0]],v[1,order[0]],v[2,order[0]]));if(Point3.Dot(normal,normals[0])<0)normal=Mul(normal,-1);
            double sum=0,max=0,degrees=0;foreach(var p in points){double r=Point3.Dot(Point3.Sub(p,center),normal);sum+=r*r;max=Math.Max(max,Math.Abs(r));}
            foreach(var n in normals)degrees=Math.Max(degrees,Math.Acos(Math.Max(-1,Math.Min(1,Point3.Dot(n,normal))))*180/Math.PI);
            double planeTolerance=Math.Max(.005,4*tolerance);
            if(max>planeTolerance||degrees>5)throw new InvalidDataException("Residual or normal disagreement; no subset selection");
            // Fit arbitrary orientations. Intended query family is provenance, not proof
            // of wall/ground identity; the independent experiment review checks that goal.
            Point3 reference=Math.Abs(normal.X)<.8?new Point3(1,0,0):new Point3(0,1,0),u=Unit(Point3.Sub(reference,Mul(normal,Point3.Dot(reference,normal)))),w=Unit(Cross(normal,u));
            var uv=new List<UV>();foreach(var p in points){Point3 d=Point3.Sub(p,center);uv.Add(new UV(Point3.Dot(d,u),Point3.Dot(d,w)));}
            uv.Sort(delegate(UV x,UV y){int c=x.X.CompareTo(y.X);return c!=0?c:x.Y.CompareTo(y.Y);});var lower=Half(uv);uv.Reverse();var upper=Half(uv);lower.RemoveAt(lower.Count-1);upper.RemoveAt(upper.Count-1);lower.AddRange(upper);if(lower.Count<3||lower.Count>9)throw new InvalidDataException("Degenerate hull");
            double inset=Math.Max(2*planeTolerance,2*(max+tolerance));int count=lower.Count;var aa=new double[count];var bb=new double[count];var cc=new double[count];
            for(int i=0;i<count;i++){UV p=lower[i],q=lower[(i+1)%count];double dx=q.X-p.X,dy=q.Y-p.Y,n=Math.Sqrt(dx*dx+dy*dy);aa[i]=-dy/n;bb[i]=dx/n;cc[i]=aa[i]*p.X+bb[i]*p.Y+inset;}
            var polygon=new Point3[count];double area=0;var inner=new UV[count];for(int i=0;i<count;i++){int j=(i+count-1)%count;double den=aa[j]*bb[i]-aa[i]*bb[j];if(Math.Abs(den)<1e-12)throw new InvalidDataException("Unstable inset");var p=new UV((cc[j]*bb[i]-cc[i]*bb[j])/den,(aa[j]*cc[i]-aa[i]*cc[j])/den);for(int k=0;k<count;k++)if(Turn(lower[k],lower[(k+1)%count],p)<-1e-9)throw new InvalidDataException("Inset outside support");inner[i]=p;polygon[i]=Add(center,Add(Mul(u,p.X),Mul(w,p.Y)));if(!polygon[i].Finite)throw new InvalidDataException("Invalid polygon");}
            for(int i=0;i<count;i++)area+=inner[i].X*inner[(i+1)%count].Y-inner[i].Y*inner[(i+1)%count].X;if(Math.Abs(area)<1e-8)throw new InvalidDataException("Empty footprint");
            return new InferredPatch(g,center,normal,polygon,Math.Sqrt(sum/9),max,degrees,planeTolerance,inset);
        }
        public static void ValidateEnvelope(TileGroup g)
        {
            if(g==null||g.Name==null||!System.Text.RegularExpressions.Regex.IsMatch(g.Name,"^[A-Za-z0-9_-]{1,32}$")||(g.Kind!="wall"&&g.Kind!="ground")||g.Session==null||!System.Text.RegularExpressions.Regex.IsMatch(g.Session,"^[A-Za-z0-9_-]{1,64}$")||g.Build!="1.0.1158.16"||g.Framework!="1.132.1428.17748"||g.Plan!=TilePlan.Id||g.Generation!=1||g.Interior<0||g.Samples==null||g.Samples.Count>9||g.TraceCalls<0||g.TraceCalls>9||!g.Player.Finite||!g.Forward.Finite||!ObservationRules.Finite(g.StartedMs)||g.StartedMs<0||!ObservationRules.Finite(g.FinishedMs)||g.FinishedMs<g.StartedMs||g.FinishedMs-g.StartedMs>1000)throw new InvalidDataException("Invalid group envelope");
        }
    }
    public sealed class DiagnosticTile
    {
        private readonly List<InferredPatch> patches=new List<InferredPatch>();private readonly HashSet<string> groups=new HashSet<string>();
        private readonly string session;private readonly int interior;private readonly Point3 anchor;private string invalid;
        public DiagnosticTile(string session,int interior,Point3 anchor){if(session==null||interior<0||!anchor.Finite)throw new InvalidDataException("Tile provenance");this.session=session;this.interior=interior;this.anchor=anchor;}
        public int Count {get{return patches.Count;}}public bool Invalid {get{return invalid!=null;}}public string InvalidReason {get{return invalid;}}
        public InferredPatch At(int i){return patches[i];}
        public void Insert(TileGroup group)
        {PatchReconstruction.ValidateEnvelope(group);if(Invalid||group.Session!=session||group.Interior!=interior||Point3.Sub(group.Player,anchor).Length>16||groups.Contains(group.Name)||groups.Count>=2)throw new InvalidDataException("Duplicate, stale or incompatible tile group");groups.Add(group.Name);patches.Add(PatchReconstruction.Fit(group));}
        public bool ContextMatches(int value,Point3 position){return value==interior&&position.Finite&&Point3.Sub(position,anchor).Length<=16;}
        public void Invalidate(string reason){invalid=reason??"invalidated";}
        public int CurrentCount(double now){if(Invalid)return 0;int n=0;foreach(var p in patches)if(p.Current(session,"1.0.1158.16",interior,1,now))n++;return n;}
    }
    [DataContract] public struct VisualLine
    {
        [DataMember] public readonly Point3 A,B;
        [DataMember] public readonly string Kind,Id;
        public VisualLine(Point3 a,Point3 b,string kind,string id){if(!a.Finite||!b.Finite||Point3.Sub(a,b).Length>20||Array.IndexOf(new[]{"ray","hit","measured-normal","inferred-outline","fitted-normal"},kind)<0||id==null||id.Length>80)throw new InvalidDataException("Invalid visual primitive");A=a;B=b;Kind=kind;Id=id;}
    }
    [DataContract] public sealed class VisualSnapshot
    {
        [DataMember] public readonly int SchemaVersion=1,ObservationCount,ValidHitCount,SurfaceCount;
        [DataMember] public readonly string Status,Unknown="Between rays, beyond footprints, material, unit scale and permanence UNKNOWN. No acoustic simulation.",Evidence="Recorded diagnostic evidence; inferred support is not current-map certification.";
        [DataMember(Name="Lines")] private readonly VisualLine[] lines;
        [DataMember(Name="Rejections")] private readonly string[] rejections;
        [DataMember(Name="CandidateValidUntilMs")] private readonly double[] validUntil;
        public const int MaximumLines=192;
        public int Count {get{return lines.Length;}}public VisualLine At(int n){return lines[n];}public int RejectionCount {get{return rejections.Length;}}public string RejectionAt(int n){return rejections[n];}
        public int CurrentCount(double now){if(!ObservationRules.Finite(now))return 0;int n=0;foreach(double until in validUntil)if(now>=until-1000&&now<until)n++;return n;}
        public VisualSnapshot(VisualLine[] lines,string[] reasons,int observations,int valid,int surfaces,string status,double[] validUntil=null)
        {if(lines==null||lines.Length>MaximumLines||reasons==null||reasons.Length>20||observations<0||observations>18||valid<0||valid>observations||surfaces<0||surfaces>2||status==null||status.Length>128)throw new InvalidDataException("Snapshot bounds");if(validUntil==null)validUntil=new double[surfaces];if(validUntil.Length!=surfaces)throw new InvalidDataException("Expiry count");foreach(double t in validUntil)if(!ObservationRules.Finite(t)||t<0)throw new InvalidDataException("Expiry time");foreach(var line in lines)new VisualLine(line.A,line.B,line.Kind,line.Id);foreach(string r in reasons)if(r==null||r.Length>160)throw new InvalidDataException("Reason bounds");this.lines=(VisualLine[])lines.Clone();rejections=(string[])reasons.Clone();this.validUntil=(double[])validUntil.Clone();ObservationCount=observations;ValidHitCount=valid;SurfaceCount=surfaces;Status=status;}
        public static VisualSnapshot Build(IList<TileGroup> groups,DiagnosticTile tile,string status)
        {
            if(groups==null||groups.Count>2)throw new InvalidDataException("Snapshot group bound");var lines=new List<VisualLine>();var reasons=new List<string>();int observations=0,valid=0;
            var names=new HashSet<string>();foreach(var g in groups)if(g==null||!names.Add(g.Name)||g.Session!=groups[0].Session||g.Build!=groups[0].Build||g.Framework!=groups[0].Framework||g.Generation!=1)throw new InvalidDataException("Snapshot provenance mismatch");
            foreach(var g in groups){if(g.Samples.Count>9)throw new InvalidDataException("Snapshot sample bound");foreach(var sample in g.Samples){var o=sample.Observation;if(o==null||o.TraceCalls!=1){reasons.Add(g.Name+": rejected unexecuted/missing observation");continue;}observations++;
                // A call reservation/throw is not proof that the query completed.
                if((o.Completion=="hit"||o.Completion=="miss")&&o.Origin.HasValue&&o.End.HasValue&&o.Origin.Value.Finite&&o.End.Value.Finite&&Point3.Sub(o.Origin.Value,o.End.Value).Length<=10)lines.Add(new VisualLine(o.Origin.Value,o.End.Value,"ray",sample.Id));
                var r=ObservationRules.Validate(o);if(o.SessionId!=g.Session||o.GameVersion!=g.Build||o.FrameworkVersion!=g.Framework){reasons.Add(sample.Id+": sample_provenance_mismatch");continue;}if(!r.SurfaceValid){reasons.Add(sample.Id+": "+string.Join(",",r.Reasons.ToArray()));continue;}
                valid++;Point3 p=o.HitPosition.Value;for(int i=0;i<3;i++){var d=i==0?new Point3(.035,0,0):i==1?new Point3(0,.035,0):new Point3(0,0,.035);lines.Add(new VisualLine(PatchReconstruction.Add(p,PatchReconstruction.Mul(d,-1)),PatchReconstruction.Add(p,d),"hit",sample.Id));}
                lines.Add(new VisualLine(p,PatchReconstruction.Add(p,PatchReconstruction.Mul(PatchReconstruction.Unit(o.HitNormal.Value),.22)),"measured-normal",sample.Id));
            }if(g.Error!=null)reasons.Add(g.Name+": "+g.Error);}
            if(tile!=null&&!tile.Invalid)for(int i=0;i<tile.Count;i++){var p=tile.At(i);for(int j=0;j<p.Count;j++)lines.Add(new VisualLine(p.PointAt(j),p.PointAt((j+1)%p.Count),"inferred-outline",p.Id));
                // Dashed inferred normal, unlike each continuous measured normal.
                for(int j=0;j<3;j++)lines.Add(new VisualLine(PatchReconstruction.Add(p.Center,PatchReconstruction.Mul(p.Normal,.3+j*.12)),PatchReconstruction.Add(p.Center,PatchReconstruction.Mul(p.Normal,.36+j*.12)),"fitted-normal",p.Id));}
            int count=tile==null||tile.Invalid?0:tile.Count;var expiry=new double[count];for(int i=0;i<count;i++)expiry[i]=tile.At(i).ObservedMs+1000;
            return new VisualSnapshot(lines.ToArray(),reasons.ToArray(),observations,valid,count,status,expiry);
        }
    }
    public sealed class PresentationControl
    {
        private double until;private bool hidden=true,cleared,stopped,unsupported;
        public void Show(double now){if(!stopped&&!unsupported&&ObservationRules.Finite(now)&&now>=0){hidden=false;cleared=false;until=now+60000;}}
        public void Hide(){hidden=true;}public void Clear(){hidden=true;cleared=true;}public void Stop(){stopped=true;hidden=true;}
        public void DrawingFailed(){unsupported=true;hidden=true;}public bool Unsupported {get{return unsupported;}}
        public bool Visible(double now,bool paused){return !paused&&!stopped&&!unsupported&&!hidden&&!cleared&&ObservationRules.Finite(now)&&now>=until-60000&&now<until;}
    }
    public static class DiagnosticPersistence
    {
        public static void SaveNew<T>(string path,T value){using(var s=new FileStream(path+".partial",FileMode.CreateNew,FileAccess.Write,FileShare.None)){new DataContractJsonSerializer(typeof(T)).WriteObject(s,value);s.Flush(true);}File.Move(path+".partial",path);}
    }
}

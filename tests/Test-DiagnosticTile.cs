// Wholly original synthetic geometry. Never loads RPH or accesses a game installation.
using System;
using System.IO;
using System.Collections.Generic;
using RichAudio.GeometryResearch;
public static class TestDiagnosticTile
{
    static int checks;
    static void Check(bool condition,string name){checks++;if(!condition)throw new Exception(name);}
    static void Reject(Action action,string name){bool failed=false;try{action();}catch(InvalidDataException){failed=true;}Check(failed,name);}
    static bool Near(Point3 a,Point3 b,double t){return Point3.Sub(a,b).Length<t;}
    public static TileGroup Fixture(string name,Point3 player,Point3 forward)
    {
        var g=new TileGroup{Name=name,Kind=name,Session="synthetic-session",Interior=0,Player=player,Forward=forward,StartedMs=0,FinishedMs=10,Completion="complete",TraceCalls=9};
        foreach(var ray in TilePlan.Create(name,player,forward)){
            Point3 p=new Point3((ray.Origin.X+ray.End.X)/2,(ray.Origin.Y+ray.End.Y)/2,(ray.Origin.Z+ray.End.Z)/2);
            Point3 n=name=="ground"?new Point3(0,0,1):new Point3(-(ray.End.X-ray.Origin.X)/8,-(ray.End.Y-ray.Origin.Y)/8,0);
            var o=new GeometryObservation{SessionId=g.Session,GameVersion=g.Build,FrameworkVersion=g.Framework,ObservedAtMs=ray.Order,TraceDurationMs=.1,ConversionDurationMs=.01,TraceCalls=1,Origin=ray.Origin,End=ray.End,Completion="hit",HitPosition=p,HitNormal=n,PositionStatus="observed",NormalStatus="observed",EntityStatus="none_returned_static_unproven",SetupStatus="on_foot_stationary_by_SDK_getters",PlayerSpeed=0,IgnoredPlayerHandle=1};
            g.Samples.Add(new SurfaceSample{Id=name+"-ray-"+ray.Order,Ray=ray,Observation=o});
        }return g;
    }
    static TileGroup F(string name){return Fixture(name,new Point3(),new Point3(0,1,0));}
    static TileGroup Slope(double slope,bool noisy)
    {
        var g=F("ground");foreach(var s in g.Samples){var o=s.Observation;Point3 a=o.Origin.Value;double z=-3+slope*a.X+(noisy&&s.Ray.Order==4?.1:0);o.HitPosition=new Point3(a.X,a.Y,z);o.HitNormal=new Point3(-slope/Math.Sqrt(1+slope*slope),0,1/Math.Sqrt(1+slope*slope));}return g;
    }
    public static int Main(string[] args)
    {
        try{
            var wall=F("wall");var ground=F("ground");var tile=new DiagnosticTile(wall.Session,0,new Point3());tile.Insert(wall);tile.Insert(ground);
            Check(tile.Count==2,"A wall and ground separate");Check(Math.Abs(Point3.Dot(tile.At(0).Normal,tile.At(1).Normal))<1e-12,"A distinct normals");
            Check(tile.At(0).MaxResidual<1e-12&&tile.At(1).MaxResidual<1e-12,"exact original planes");
            Check(Near(tile.At(0).Center,new Point3(0,4,1),1e-12),"wall measured plane center");Check(Near(tile.At(1).Center,new Point3(0,0,-3),1e-12),"ground measured plane center");
            Check(tile.At(0).Count==4&&tile.At(1).Count==4,"inferred rectangular footprints");
            for(int i=0;i<tile.At(0).Count;i++){Point3 p=tile.At(0).PointAt(i);Check(Math.Abs(p.X)<=.74+1e-12&&Math.Abs(p.Z-1)<=.49+1e-12,"wall inset inside measured hull");}
            var corner=Fixture("wall",new Point3(1,0,0),new Point3(1,0,0));corner.Name="corner";for(int i=0;i<9;i++)corner.Samples[i].Id="corner-ray-"+i;var cp=PatchReconstruction.Fit(corner);Check(Math.Abs(Point3.Dot(tile.At(0).Normal,cp.Normal))<1e-12,"B independent corner fit not flattened");var cornerTile=new DiagnosticTile(wall.Session,0,new Point3());cornerTile.Insert(wall);cornerTile.Insert(corner);Check(cornerTile.Count==2,"B both corner faces retained separately");
            Reject(delegate{tile.Insert(wall);},"duplicate group cannot merge nearby planes");
            var mixed=F("wall");mixed.Samples[4].Observation.HitPosition=new Point3(0,4.1,1);Reject(delegate{PatchReconstruction.Fit(mixed);},"E incompatible hit cannot become planar support");
            var uneven=Slope(.1,false);var sp=PatchReconstruction.Fit(uneven);Check(sp.MaxResidual<1e-12&&Math.Abs(sp.Normal.Z)>.99,"C gently sloped ground supported");
            Reject(delegate{PatchReconstruction.Fit(Slope(.1,true));},"C nonplanar outlier rejected");
            var incomplete=F("wall");var miss=incomplete.Samples[4].Observation;miss.Completion="miss";miss.HitPosition=null;miss.HitNormal=null;miss.PositionStatus="not_returned_miss";miss.NormalStatus="not_returned_miss";miss.EntityStatus="not_returned_miss";
            Reject(delegate{PatchReconstruction.Fit(incomplete);},"D incomplete support remains unknown");
            var d=VisualSnapshot.Build(new[]{incomplete},null,"RESULTS");Check(d.ValidHitCount==8&&d.SurfaceCount==0&&d.RejectionCount==1,"missing hit no patch");
            Check(d.Unknown.Contains("UNKNOWN"),"unknown support explicit");
            var snapshot=VisualSnapshot.Build(new[]{wall,ground},tile,"RESULTS");Check(snapshot.ObservationCount==18&&snapshot.ValidHitCount==18&&snapshot.SurfaceCount==2,"truthful counts");Check(snapshot.Count==104,"bounded exact primitive count");
            int rays=0,hits=0,normals=0,outlines=0,fitted=0;for(int i=0;i<snapshot.Count;i++){var line=snapshot.At(i);if(line.Kind=="ray"){rays++;int n=int.Parse(line.Id.Substring(line.Id.LastIndexOf('-')+1));var g=line.Id.StartsWith("wall")?wall:ground;Check(Near(line.A,g.Samples[n].Observation.Origin.Value,1e-15)&&Near(line.B,g.Samples[n].Observation.End.Value,1e-15),"exact executed ray endpoints");}
                else if(line.Kind=="hit"){hits++;int n=int.Parse(line.Id.Substring(line.Id.LastIndexOf('-')+1));var g=line.Id.StartsWith("wall")?wall:ground;Point3 mid=new Point3((line.A.X+line.B.X)/2,(line.A.Y+line.B.Y)/2,(line.A.Z+line.B.Z)/2);Check(Near(mid,g.Samples[n].Observation.HitPosition.Value,1e-14),"green cross centered on measured hit");}
                else if(line.Kind=="measured-normal"){normals++;int n=int.Parse(line.Id.Substring(line.Id.LastIndexOf('-')+1));var g=line.Id.StartsWith("wall")?wall:ground;Check(Near(Point3.Sub(line.B,line.A),new Point3(g.Samples[n].Observation.HitNormal.Value.X*.22,g.Samples[n].Observation.HitNormal.Value.Y*.22,g.Samples[n].Observation.HitNormal.Value.Z*.22),1e-14),"normal direction and scale");}
                else if(line.Kind=="inferred-outline")outlines++;else if(line.Kind=="fitted-normal")fitted++;
            }
            Check(rays==18&&hits==54&&normals==18&&outlines==8&&fitted==6,"visual meaning counts");
            var invalid=F("wall");invalid.Samples[0].Observation.HitPosition=new Point3(double.NaN,0,0);var inv=VisualSnapshot.Build(new[]{invalid},null,"REJECTED");Check(inv.ValidHitCount==8&&inv.RejectionCount==1,"nonfinite hit never green");
            invalid.Samples[0].Observation.Origin=null;inv=VisualSnapshot.Build(new[]{invalid},null,"REJECTED");int rayCount=0;for(int i=0;i<inv.Count;i++)if(inv.At(i).Kind=="ray")rayCount++;Check(rayCount==8,"missing origin not drawn");
            var uncertain=F("wall");uncertain.Samples[0].Observation.Completion="not_executed";var thrown=VisualSnapshot.Build(new[]{uncertain},null,"API threw");rayCount=0;for(int i=0;i<thrown.Count;i++)if(thrown.At(i).Kind=="ray")rayCount++;Check(rayCount==8&&thrown.ValidHitCount==8,"API reservation/exception is not a completed ray");
            uncertain=F("wall");uncertain.Samples[0].Observation.SessionId="other";Check(VisualSnapshot.Build(new[]{uncertain},null,"wrong session").ValidHitCount==8,"cross-session hit not presented as valid");
            Reject(delegate{new VisualSnapshot(new VisualLine[193],new string[0],0,0,0,"x");},"primitive hard cap");
            Reject(delegate{new VisualLine(new Point3(),new Point3(100,0,0),"ray","x");},"visual coordinate bound");
            Reject(delegate{new VisualSnapshot(new[]{default(VisualLine)},new string[0],0,0,0,"x");},"uninitialised primitive fails closed");
            var copied=new[]{new VisualLine(new Point3(),new Point3(1,0,0),"ray","copy")};var immutable=new VisualSnapshot(copied,new string[0],1,0,0,"copy");copied[0]=new VisualLine(new Point3(),new Point3(2,0,0),"ray","changed");Check(immutable.At(0).B.X==1,"snapshot deep copied");
            wall.Samples[0].Observation.HitPosition=new Point3(10,10,10);Check(snapshot.ValidHitCount==18&&snapshot.At(1).A.X!=10,"snapshot independent of mutated acquisition");wall=F("wall");
            Check(tile.CurrentCount(10)==2&&tile.CurrentCount(1010)==0,"candidate expires independently of replay");Check(!tile.At(0).Current("another",wall.Build,0,1,10),"session mismatch stale");Check(!tile.At(0).Current(wall.Session,"wrong",0,1,10),"build mismatch stale");Check(!tile.At(0).Current(wall.Session,wall.Build,1,1,10),"interior mismatch stale");Check(!tile.At(0).Current(wall.Session,wall.Build,0,2,10),"generation mismatch stale");
            Check(snapshot.CurrentCount(10)==2&&snapshot.CurrentCount(1010)==0,"immutable presentation distinguishes expired historical support");
            Check(tile.ContextMatches(0,new Point3(16,0,0))&&!tile.ContextMatches(0,new Point3(16.001,0,0))&&!tile.ContextMatches(1,new Point3()),"bounded tile and interior context");
            tile.Invalidate("F stale");Check(tile.CurrentCount(10)==0,"F invalidation fail closed");var stale=VisualSnapshot.Build(new[]{wall,ground},tile,"INVALIDATED");Check(stale.SurfaceCount==0&&stale.Count==90,"invalid geometry outlines removed; historical hits retained");
            var other=F("ground");other.Session="different";Reject(delegate{new DiagnosticTile(wall.Session,0,new Point3()).Insert(other);},"wrong session group rejected");other=F("ground");other.Interior=1;Reject(delegate{new DiagnosticTile(wall.Session,0,new Point3()).Insert(other);},"wrong interior group rejected");
            var otherSession=F("ground");otherSession.Session="wrong";Reject(delegate{VisualSnapshot.Build(new[]{wall,otherSession},null,"mixed");},"mixed-session visual evidence rejected");
            Reject(delegate{VisualSnapshot.Build(new[]{wall,wall},null,"duplicate");},"duplicate visual group rejected");
            var gate=new TileBudget();Check(gate.Claim("wall"),"explicit group claim");for(int i=0;i<9;i++)Check(gate.Next(),"authorised ray "+i);Check(!gate.Next(),"ninth hard stop");gate.Finish();
            var control=new PresentationControl();Check(!control.Visible(0,false),"disabled default");
            long before=GC.GetTotalMemory(true);bool framesValid=true;for(int i=0;i<10000;i++){control.Show(i);framesValid&=control.Visible(i,false)&&!control.Visible(i,true);control.Hide();control.Clear();for(int j=0;j<snapshot.Count;j++)GC.KeepAlive(snapshot.At(j));}Check(framesValid,"10000 display and pause iterations; no query");
            Check(gate.Calls==9&&!gate.Claim("wall"),"G replay show hide clear cannot rescan");Check(GC.GetTotalMemory(true)-before<2*1024*1024,"replay bounded retained memory");
            control.Show(100);Check(control.Visible(60099,false)&&!control.Visible(60100,false),"60s timeout");control.Clear();Check(!control.Visible(100,false),"clear hides");control.Show(200);Check(control.Visible(200,false),"show replays prior snapshot");control.Stop();control.Show(300);Check(!control.Visible(300,false),"terminal presentation");
            var unsupported=new PresentationControl();unsupported.DrawingFailed();unsupported.Show(10);Check(unsupported.Unsupported&&!unsupported.Visible(10,false),"drawing unavailable explicit");
            Check(gate.Claim("ground"),"second independent group");for(int i=0;i<9;i++)gate.Next();gate.Finish();Check(gate.Calls==18&&!gate.Claim("ground"),"18 total hard cap");gate.Stop();Check(!gate.Next()&&!gate.Claim("wall"),"stopped no automatic restart");
            var cancelled=new TileBudget();cancelled.Claim("ground");cancelled.Next();cancelled.Stop();Check(!cancelled.Next()&&cancelled.Calls==1,"cancellation no retries");
            var simultaneous=new TileBudget();int claims=0;var threads=new List<System.Threading.Thread>();for(int i=0;i<16;i++){var thread=new System.Threading.Thread(delegate(){if(simultaneous.Claim("wall"))System.Threading.Interlocked.Increment(ref claims);});threads.Add(thread);thread.Start();}foreach(var thread in threads)thread.Join();Check(claims==1,"concurrent commands cannot multiply claim budget");
            var duplicate=F("wall");duplicate.Samples[1].Id=duplicate.Samples[0].Id;Reject(delegate{PatchReconstruction.Fit(duplicate);},"duplicate sample");
            var wrong=F("ground");wrong.Samples[0].Ray.End=new Point3();Reject(delegate{PatchReconstruction.Fit(wrong);},"plan mutation");
            Reject(delegate{TilePlan.Create("automatic",new Point3(),new Point3(0,1,0));},"unknown plan");Reject(delegate{TilePlan.Create("ground",new Point3(),new Point3());},"invalid pose");
            Directory.CreateDirectory(args[0]);DiagnosticPersistence.SaveNew(Path.Combine(args[0],"wall.json"),wall);DiagnosticPersistence.SaveNew(Path.Combine(args[0],"ground.json"),ground);DiagnosticPersistence.SaveNew(Path.Combine(args[0],"slope.json"),uneven);
            var fresh=new DiagnosticTile(wall.Session,0,new Point3());fresh.Insert(wall);fresh.Insert(ground);var replay=VisualSnapshot.Build(new[]{wall,ground},fresh,"RESULTS");DiagnosticPersistence.SaveNew(Path.Combine(args[0],"snapshot.json"),replay);DiagnosticPersistence.SaveNew(Path.Combine(args[0],"snapshot-again.json"),VisualSnapshot.Build(new[]{wall,ground},fresh,"RESULTS"));DiagnosticPersistence.SaveNew(Path.Combine(args[0],"wall-patch.json"),fresh.At(0));DiagnosticPersistence.SaveNew(Path.Combine(args[0],"ground-patch.json"),fresh.At(1));DiagnosticPersistence.SaveNew(Path.Combine(args[0],"slope-patch.json"),sp);
            bool overwrite=false;try{DiagnosticPersistence.SaveNew(Path.Combine(args[0],"snapshot.json"),replay);}catch(IOException){overwrite=true;}Check(overwrite,"private evidence no overwrite");
            Console.WriteLine("PASS: "+checks+" original tile, reconstruction, snapshot and lifecycle checks; no RPH execution.");return 0;
        }catch(Exception e){Console.Error.WriteLine(e.ToString());return 1;}
    }
}

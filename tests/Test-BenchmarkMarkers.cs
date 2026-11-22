using System;using System.IO;using System.Runtime.Serialization.Json;using RichAudio.MarkerResearch;
public static class TestBenchmarkMarkers
{
    static int checks;static void Check(bool b,string why){checks++;if(!b)throw new Exception(why);}static void Reject(Action f,string why){bool rejected=false;try{f();}catch{rejected=true;}Check(rejected,why);}
    static MarkerPose P(double t,double x,double y=0,double z=0){return new MarkerPose{AtMs=t,Position=new MarkerPoint(x,y,z),OnFoot=true};}
    static MarkerPlan Plan(){return new MarkerPlan("original-synthetic-fixture","synthetic-marker-session");}
    public static int Main(string[] args)
    {
        var p=Plan();Check(!p.Snapshot().MarkersComplete&&p.Snapshot().Lines.Length==0,"empty setup");var pose=P(1,0);p.Set(MarkerKind.Start,pose);pose.Position=new MarkerPoint(99,99,99);Check(p.Snapshot().Start.Position.X==0,"input copied");Check(p.Snapshot().Lines.Length==2,"single point cross before direction exists");
        p.Set(MarkerKind.Finish,P(2,100,0,3));var s=p.Set(MarkerKind.Listener,P(3,50,10,2));Check(s.MarkersComplete&&s.Revision==3,"three explicit positions");Check(s.Lines.Length==5,"bounded start/finish/listener drawing");Check(s.HorizontalSeparation==100,"observed chord independent of listener");Check(!s.RouteClear&&!s.BenchmarkStartSupported&&s.RouteCoverage=="UNKNOWN","markers never authorize a route");Check(s.Units=="uncalibrated-native-game-units","no assumed metres");
        Check(s.Lines[0].A.X==0&&s.Lines[0].B.X==0&&s.Lines[0].A.Y==-4&&s.Lines[0].B.Y==4,"start line perpendicular, width eight native units");Check(s.Lines[1].A.X==100&&s.Lines[1].B.X==100&&s.Lines[1].A.Z==3.2,"finish uses captured elevation plus presentation offset");
        s.Start.Position=new MarkerPoint(777,0,0);s.Lines[0]=new MarkerLine();Check(p.Snapshot().Start.Position.X==0&&p.Snapshot().Lines[0].Kind=="Start","snapshot copied");
        int revision=p.Snapshot().Revision;Reject(()=>p.Set(MarkerKind.Finish,P(4,0)),"coincident endpoint rejected");Check(p.Snapshot().Revision==revision&&p.Snapshot().Finish.Position.X==100,"rejection atomic");Reject(()=>p.Set(MarkerKind.Finish,P(4,5001)),"bounded span");Reject(()=>p.Set(MarkerKind.Listener,P(3,4)),"duplicate timestamp rejected");Reject(()=>p.Set(MarkerKind.Listener,P(2,4)),"stale timestamp rejected");
        foreach(double n in new[]{double.NaN,double.PositiveInfinity,200001d,199999d})Reject(()=>p.Set(MarkerKind.Listener,P(4,n)),"invalid coordinate or insufficient presentation margin");
        var bad=P(4,4);bad.Speed=.26;Reject(()=>p.Set(MarkerKind.Listener,bad),"moving marker rejected");bad=P(4,4);bad.OnFoot=false;Reject(()=>p.Set(MarkerKind.Listener,bad),"listener must be on foot");bad=P(4,4);bad.Speed=-1;Reject(()=>p.Set(MarkerKind.Start,bad),"negative speed");Reject(()=>p.Set((MarkerKind)8,P(4,4)),"unknown marker kind");Reject(()=>p.Set(MarkerKind.Start,null),"missing pose");
        var driven=P(4,-10);driven.OnFoot=false;p.Set(MarkerKind.Start,driven);Check(!p.Snapshot().Start.OnFoot,"stationary vehicle position allowed at endpoints without guessing road surface");
        p.Stop();Reject(()=>p.Set(MarkerKind.Listener,P(5,20)),"stop is terminal");
        p=Plan();p.Set(MarkerKind.Finish,P(1,100));p.Set(MarkerKind.Listener,P(2,50,10));p.Set(MarkerKind.Start,P(3,0));Check(p.Snapshot().MarkersComplete,"capture order independent");
        for(int i=4;i<=32;i++)p.Set(MarkerKind.Listener,P(i,50,10));Reject(()=>p.Set(MarkerKind.Listener,P(33,50,10)),"revision bound");
        var diagonal=Plan();diagonal.Set(MarkerKind.Start,P(1,0,0));var diag=diagonal.Set(MarkerKind.Finish,P(2,30,40));var line=diag.Lines[0];Check(Math.Abs((line.B.X-line.A.X)*30+(line.B.Y-line.A.Y)*40)<1e-8,"independent diagonal perpendicular check");Check(Math.Abs(Math.Sqrt(Math.Pow(line.B.X-line.A.X,2)+Math.Pow(line.B.Y-line.A.Y,2))-8)<1e-8,"independent line length");
        Directory.CreateDirectory(args[0]);using(var file=new FileStream(Path.Combine(args[0],"markers.json"),FileMode.CreateNew))new DataContractJsonSerializer(typeof(MarkerSnapshot)).WriteObject(file,p.Snapshot());
        Console.WriteLine("PASS: "+checks+" original benchmark marker assertions; no game or SDK execution.");return 0;
    }
}

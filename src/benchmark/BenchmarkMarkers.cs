// Original bounded marker setup only. No traffic, vehicle, geometry-query or audio API.
using System;using System.Collections.Generic;using System.Runtime.Serialization;
namespace RichAudio.MarkerResearch
{
    public enum MarkerKind {Start,Finish,Listener}
    [DataContract] public struct MarkerPoint
    {
        [DataMember]public double X,Y,Z;
        public MarkerPoint(double x,double y,double z){X=x;Y=y;Z=z;}
        public bool Valid {get{return Finite(X)&&Finite(Y)&&Finite(Z)&&Math.Sqrt(X*X+Y*Y+Z*Z)<=200000;}}
        public static bool Finite(double n){return !double.IsNaN(n)&&!double.IsInfinity(n);}
    }
    [DataContract] public sealed class MarkerPose
    {
        [DataMember]public MarkerPoint Position;
        [DataMember]public double AtMs,Speed;
        [DataMember]public bool OnFoot;
        public MarkerPose Copy(){return (MarkerPose)MemberwiseClone();}
    }
    [DataContract] public struct MarkerLine
    {
        [DataMember]public string Kind;[DataMember]public MarkerPoint A,B;
        public MarkerLine(string kind,MarkerPoint a,MarkerPoint b){Kind=kind;A=a;B=b;}
    }
    [DataContract] public sealed class MarkerSnapshot
    {
        [DataMember]public int Version=1,Revision;
        [DataMember]public string Domain,Session,GameVersion="1.0.1158.16",Units="uncalibrated-native-game-units",RouteCoverage="UNKNOWN";
        [DataMember]public MarkerPose Start,Finish,Listener;
        [DataMember]public bool MarkersComplete,RouteClear=false,BenchmarkStartSupported=false;
        [DataMember]public double HorizontalSeparation;
        [DataMember]public MarkerLine[] Lines;
    }
    public sealed class MarkerPlan
    {
        public const int MaximumRevisions=32;
        private MarkerPose start,finish,listener;private readonly string domain,session;private int revision;private double last=-1;private bool stopped;
        public MarkerPlan(string domain,string session){if((domain!="runtime-observation"&&domain!="original-synthetic-fixture")||string.IsNullOrEmpty(session)||session.Length>64)throw new ArgumentException("marker provenance");this.domain=domain;this.session=session;}
        private static double Separation(MarkerPose a,MarkerPose b){return a==null||b==null?0:Math.Sqrt(Math.Pow(b.Position.X-a.Position.X,2)+Math.Pow(b.Position.Y-a.Position.Y,2));}
        public MarkerSnapshot Set(MarkerKind kind,MarkerPose pose)
        {
            if(stopped||revision>=MaximumRevisions)throw new InvalidOperationException("marker setup closed or revision cap");
            if(!Enum.IsDefined(typeof(MarkerKind),kind)||pose==null||!pose.Position.Valid||Math.Sqrt(pose.Position.X*pose.Position.X+pose.Position.Y*pose.Position.Y+pose.Position.Z*pose.Position.Z)>199990||!MarkerPoint.Finite(pose.AtMs)||pose.AtMs<0||pose.AtMs>86400000||pose.AtMs<=last||!MarkerPoint.Finite(pose.Speed)||pose.Speed<0||pose.Speed>.25||kind==MarkerKind.Listener&&!pose.OnFoot)throw new ArgumentException("stationary measured marker pose required");
            MarkerPose proposedStart=kind==MarkerKind.Start?pose:start,proposedFinish=kind==MarkerKind.Finish?pose:finish;
            if(proposedStart!=null&&proposedFinish!=null){double d=Separation(proposedStart,proposedFinish);if(d<5||d>5000)throw new ArgumentException("horizontal marker separation outside research bounds");}
            if(kind==MarkerKind.Start)start=pose.Copy();else if(kind==MarkerKind.Finish)finish=pose.Copy();else listener=pose.Copy();revision++;last=pose.AtMs;return Snapshot();
        }
        public void Stop(){stopped=true;}
        private static MarkerPoint Offset(MarkerPoint p,double x,double y,double z){return new MarkerPoint(p.X+x,p.Y+y,p.Z+z);}
        private static void Cross(List<MarkerLine> lines,string kind,MarkerPoint p){lines.Add(new MarkerLine(kind,Offset(p,-.5,0,.2),Offset(p,.5,0,.2)));lines.Add(new MarkerLine(kind,Offset(p,0,-.5,.2),Offset(p,0,.5,.2)));}
        public MarkerSnapshot Snapshot()
        {
            var lines=new List<MarkerLine>();double d=Separation(start,finish);
            if(start!=null&&finish!=null){double rx=-(finish.Position.Y-start.Position.Y)/d,ry=(finish.Position.X-start.Position.X)/d;lines.Add(new MarkerLine("Start",Offset(start.Position,-4*rx,-4*ry,.2),Offset(start.Position,4*rx,4*ry,.2)));lines.Add(new MarkerLine("Finish",Offset(finish.Position,-4*rx,-4*ry,.2),Offset(finish.Position,4*rx,4*ry,.2)));}
            else{if(start!=null)Cross(lines,"Start",start.Position);if(finish!=null)Cross(lines,"Finish",finish.Position);}
            if(listener!=null){Cross(lines,"Listener",listener.Position);lines.Add(new MarkerLine("Listener",listener.Position,Offset(listener.Position,0,0,1)));}
            return new MarkerSnapshot{Domain=domain,Session=session,Revision=revision,Start=start==null?null:start.Copy(),Finish=finish==null?null:finish.Copy(),Listener=listener==null?null:listener.Copy(),MarkersComplete=start!=null&&finish!=null&&listener!=null,HorizontalSeparation=d,Lines=lines.ToArray()};
        }
    }
}

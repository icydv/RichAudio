using System;
using System.Collections.Generic;
using System.Linq;
using System.Runtime.Serialization;
using RichAudio.MarkerResearch;

namespace RichAudio.BatiResearch
{
    [DataContract]public sealed class SpeedSummary
    {
        [DataMember]public double? StartingSpeed,HighestObservedSpeed,FinalSpeed,FirstValidAt,LastValidAt;
        [DataMember]public double SampledPathLength,IntegratedSpeedDistance;
        [DataMember]public int Gaps,DeceleratingPairs;
        [DataMember]public bool SteadyCandidate;
        [DataMember]public double? SteadyStart,SteadyEnd,SteadyMean,SteadySlope,LastAcceleration;
        [DataMember]public double?[] ThresholdTimes;
        [DataMember]public string MaximumPossibleSpeed="NOT PROVEN",FinishAcceleration="not reached";
    }
    public sealed class SpeedAnalysis
    {
        private readonly Policy p;private readonly MarkerPoint listener;private readonly List<SpeedPoint> points=new List<SpeedPoint>();
        private readonly SpeedSummary summary;
        public SpeedAnalysis(Policy settings,MarkerPoint fixedListener){settings.Validate();p=settings.Copy();Check.Point(fixedListener);listener=fixedListener;summary=new SpeedSummary{ThresholdTimes=new double?[p.Thresholds.Length]};}
        public SpeedPoint Add(Reading input,double progress,double deviation)
        {
            Check.That(input!=null&&points.Count<p.MaxSamples,"sample capacity/null");var r=input.Copy();
            Check.That(Check.Finite(r.At)&&r.At>=0&&r.At<=86400&&Check.Finite(r.Speed)&&r.Speed>=0&&r.Speed<=200,"invalid time/speed");
            if(r.RawRpm.HasValue&&!Check.Finite(r.RawRpm.Value))r.RawRpm=null;
            foreach(var v in new[]{r.Position,r.Velocity,r.Rotation,r.PlayerPosition,r.PlayerVelocity})Check.Point(v);
            Check.That(Math.Abs(r.Speed-Check.Length(r.Velocity))<=1e-5,"speed/velocity mismatch");
            Check.That(Check.Finite(progress)&&progress>=0&&Check.Finite(deviation)&&deviation>=0,"route measurement invalid");
            var previous=points.Count==0?null:points[points.Count-1];double dt=previous==null?0:r.At-previous.Observation.At;
            Check.That(previous==null||dt>0,"nonmonotonic telemetry");
            var offset=Check.Sub(r.Position,listener);double distance=Check.Length(offset);var relative=Check.Sub(r.Velocity,r.PlayerVelocity);
            var point=new SpeedPoint{Observation=r,RouteProgress=progress,Deviation=deviation,DistanceToMarker=distance,ListenerOffset=offset,RelativeVelocity=relative,RadialVelocity=distance>1e-9?(double?)(Check.Dot(offset,relative)/distance):null,Gap=previous!=null&&dt>p.MaxGapSeconds};
            point.RpmReason=!r.RawRpm.HasValue?"getter unavailable/nonfinite":r.RawRpm.Value<0||r.RawRpm.Value>1?"outside documented ratio range":"dynamic validity not established; no RPM conversion";
            if(previous!=null){if(point.Gap){summary.Gaps++;summary.LastAcceleration=null;}else{
                double travelled=Check.Distance(r.Position,previous.Observation.Position);
                Check.That(travelled<=(Math.Max(r.Speed,previous.Observation.Speed)+2)*dt+1,"position jump / simulation continuity unknown");
                summary.SampledPathLength+=travelled;summary.IntegratedSpeedDistance+=(r.Speed+previous.Observation.Speed)*.5*dt;
                point.Acceleration=(r.Speed-previous.Observation.Speed)/dt;summary.LastAcceleration=point.Acceleration;if(point.Acceleration<-.15)summary.DeceleratingPairs++;
                for(int k=0;k<p.Thresholds.Length;k++)if(!summary.ThresholdTimes[k].HasValue&&previous.Observation.Speed<p.Thresholds[k]&&r.Speed>=p.Thresholds[k])summary.ThresholdTimes[k]=previous.Observation.At-summary.FirstValidAt.Value+dt*(p.Thresholds[k]-previous.Observation.Speed)/(r.Speed-previous.Observation.Speed);
            }}else{summary.StartingSpeed=r.Speed;summary.FirstValidAt=r.At;for(int k=0;k<p.Thresholds.Length;k++)if(r.Speed>=p.Thresholds[k])summary.ThresholdTimes[k]=0;}
            point.SampledPathLength=summary.SampledPathLength;summary.HighestObservedSpeed=Math.Max(summary.HighestObservedSpeed??0,r.Speed);summary.FinalSpeed=r.Speed;summary.LastValidAt=r.At;points.Add(point);FindSteady();return Copy(point);
        }
        private void FindSteady()
        {
            if(points.Count<2)return;int end=points.Count-1,start=end;double now=points[end].Observation.At;
            while(start>0&&now-points[start].Observation.At<p.SteadySeconds)start--;
            if(now-points[start].Observation.At<p.SteadySeconds)return;
            double min=double.MaxValue,max=0,sum=0,sx=0,sxx=0,sxy=0;int n=end-start+1;
            for(int i=start;i<=end;i++){var s=points[i];if(i>start&&s.Gap)return;double x=s.Observation.At-points[start].Observation.At,y=s.Observation.Speed;min=Math.Min(min,y);max=Math.Max(max,y);sum+=y;sx+=x;sxx+=x*x;sxy+=x*y;}
            double mean=sum/n,den=n*sxx-sx*sx;if(den<=0||min<=.5||points[end].RouteProgress-points[start].RouteProgress<1.5)return;
            double slope=(n*sxy-sx*sum)/den;
            if(max-min<=Math.Max(p.SteadySpanAbsolute,p.SteadySpanFraction*mean)&&Math.Abs(slope)<=p.SteadySlope){summary.SteadyCandidate=true;summary.SteadyStart=points[start].Observation.At;summary.SteadyEnd=now;summary.SteadyMean=mean;summary.SteadySlope=slope;}
        }
        public void Finish(){summary.FinishAcceleration=!summary.LastAcceleration.HasValue?"INCONCLUSIVE":summary.LastAcceleration.Value>.15?"still accelerating":summary.LastAcceleration.Value<-.15?"decelerating":"within declared derivative tolerance; not top-speed proof";}
        private static SpeedPoint Copy(SpeedPoint p){return new SpeedPoint{Observation=p.Observation.Copy(),DistanceToMarker=p.DistanceToMarker,SampledPathLength=p.SampledPathLength,RouteProgress=p.RouteProgress,Deviation=p.Deviation,Acceleration=p.Acceleration,RadialVelocity=p.RadialVelocity,ListenerOffset=p.ListenerOffset,RelativeVelocity=p.RelativeVelocity,Gap=p.Gap,RpmReason=p.RpmReason};}
        public SpeedPoint[] Snapshot(){return points.Select(Copy).ToArray();}
        public SpeedSummary Summary(){return new SpeedSummary{StartingSpeed=summary.StartingSpeed,HighestObservedSpeed=summary.HighestObservedSpeed,FinalSpeed=summary.FinalSpeed,FirstValidAt=summary.FirstValidAt,LastValidAt=summary.LastValidAt,SampledPathLength=summary.SampledPathLength,IntegratedSpeedDistance=summary.IntegratedSpeedDistance,Gaps=summary.Gaps,DeceleratingPairs=summary.DeceleratingPairs,SteadyCandidate=summary.SteadyCandidate,SteadyStart=summary.SteadyStart,SteadyEnd=summary.SteadyEnd,SteadyMean=summary.SteadyMean,SteadySlope=summary.SteadySlope,LastAcceleration=summary.LastAcceleration,ThresholdTimes=(double?[])summary.ThresholdTimes.Clone(),FinishAcceleration=summary.FinishAcceleration};}
    }
}

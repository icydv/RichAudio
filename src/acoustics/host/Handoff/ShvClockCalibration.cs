using System;
using System.Collections.Generic;

namespace RichAudio.Beacon.Handoff
{
    // The owner is the verified loaded-module accessor, not a deserialized
    // authenticated flag. Production construction occurs only around a real
    // accessor call with host clock reads immediately before and after it.
    internal sealed class ShvClockWitness
    {
        readonly object owner;
        internal readonly long SourceFrequency,HostFrequency,SourceInstance,SourceAnchor,HostBefore,HostAfter;
        internal ShvClockWitness(object owner,long sourceFrequency,long hostFrequency,long instance,
            long sourceAnchor,long hostBefore,long hostAfter)
        {this.owner=owner;SourceFrequency=sourceFrequency;HostFrequency=hostFrequency;SourceInstance=instance;
         SourceAnchor=sourceAnchor;HostBefore=hostBefore;HostAfter=hostAfter;}
        internal bool IssuedBy(object expected){return owner!=null&&Object.ReferenceEquals(owner,expected);}
    }
    internal sealed class ShvMeasuredClockMap
    {
        readonly object owner;
        internal readonly long SourceFrequency,HostFrequency,SourceInstance,SourceAnchor,HostBefore,HostAfter,Expires;
        internal readonly int DriftPpm,AnchorsUsed;
        internal readonly decimal MinimumMeasuredRatePpm,MaximumMeasuredRatePpm;
        internal ShvMeasuredClockMap(object owner,ShvClockWitness latest,int drift,int anchors,decimal low,decimal high)
        {this.owner=owner;SourceFrequency=latest.SourceFrequency;HostFrequency=latest.HostFrequency;
         SourceInstance=latest.SourceInstance;SourceAnchor=latest.SourceAnchor;HostBefore=latest.HostBefore;HostAfter=latest.HostAfter;
         Expires=checked(latest.HostAfter+latest.HostFrequency*ShvOperatingStateHandoff.MaximumMapLifetimeMs/1000);
         DriftPpm=drift;AnchorsUsed=anchors;MinimumMeasuredRatePpm=low;MaximumMeasuredRatePpm=high;}
        internal bool IssuedBy(object expected){return owner!=null&&Object.ReferenceEquals(owner,expected);}
    }
    internal sealed class ShvClockCalibration
    {
        internal const int MaximumAnchors=32,MinimumAnchors=3,MinimumMeasuredSpanMs=250;
        readonly object owner;
        readonly long sourceFrequency,hostFrequency,instance;
        readonly List<ShvClockWitness> anchors=new List<ShvClockWitness>();
        string failure;
        internal ShvClockCalibration(object owner,long sourceFrequency,long hostFrequency,long instance)
        {
            if(owner==null||sourceFrequency<=0||sourceFrequency>1000000000||hostFrequency<=0||hostFrequency>1000000000||instance<=0)
                throw new ArgumentException("owned clock calibration domain");
            this.owner=owner;this.sourceFrequency=sourceFrequency;this.hostFrequency=hostFrequency;this.instance=instance;
        }
        internal string Failure{get{return failure;}}
        internal int AnchorsObserved{get{return anchors.Count;}}
        internal bool Add(ShvClockWitness witness)
        {
            if(failure!=null)return false;
            if(witness==null||!witness.IssuedBy(owner)||witness.SourceFrequency!=sourceFrequency
                ||witness.HostFrequency!=hostFrequency||witness.SourceInstance!=instance){failure="clock-witness-owner-or-domain";return false;}
            if(witness.SourceAnchor<0||witness.HostBefore<0||witness.HostAfter<witness.HostBefore
                ||(decimal)witness.HostAfter-witness.HostBefore>(decimal)hostFrequency*ShvOperatingStateHandoff.MaximumAnchorWidthMs/1000)
                {failure="clock-anchor-uncertainty";return false;}
            if(anchors.Count>0){var prior=anchors[anchors.Count-1];
                if(witness.SourceAnchor<=prior.SourceAnchor||witness.HostBefore<prior.HostAfter)
                    {failure="clock-anchor-order";return false;}}
            anchors.Add(witness);if(anchors.Count>MaximumAnchors)anchors.RemoveAt(0);return true;
        }
        internal bool TryMap(long now,out ShvMeasuredClockMap mapping,out string reason)
        {
            mapping=null;reason=failure;
            if(failure!=null)return false;
            if(anchors.Count<MinimumAnchors){reason="clock-insufficient-anchors";return false;}
            var latest=anchors[anchors.Count-1];
            if(now<latest.HostAfter||(decimal)now-latest.HostAfter>(decimal)hostFrequency*ShvOperatingStateHandoff.MaximumMapLifetimeMs/1000)
                {reason="clock-map-expired-or-future";return false;}
            decimal low=Decimal.MinValue,high=Decimal.MaxValue;int measuredPairs=0;
            for(int i=0;i<anchors.Count-1;i++)for(int j=i+1;j<anchors.Count;j++){
                var a=anchors[i];var b=anchors[j];decimal sourceSpan=(decimal)b.SourceAnchor-a.SourceAnchor;
                if(sourceSpan*1000/sourceFrequency<MinimumMeasuredSpanMs)continue;
                decimal nominal=sourceSpan*hostFrequency/sourceFrequency;
                decimal pairLow=(((decimal)b.HostBefore-a.HostAfter)/nominal-1)*1000000;
                decimal pairHigh=(((decimal)b.HostAfter-a.HostBefore)/nominal-1)*1000000;
                low=Math.Max(low,pairLow);high=Math.Min(high,pairHigh);measuredPairs++;
            }
            if(measuredPairs==0){reason="clock-insufficient-measured-span";return false;}
            if(low>high){failure=reason="clock-correspondence-inconsistent";return false;}
            // Do not clip an unmeasured rate to the authored100ppm policy.
            decimal bound=Decimal.Ceiling(Math.Max(Math.Abs(low),Math.Abs(high)));
            if(bound>ShvOperatingStateHandoff.MaximumDriftPpm){reason="clock-rate-uncertainty-too-wide";return false;}
            if((decimal)latest.HostAfter+hostFrequency*ShvOperatingStateHandoff.MaximumMapLifetimeMs/1000m>Int64.MaxValue)
                {failure=reason="clock-map-range";return false;}
            mapping=new ShvMeasuredClockMap(owner,latest,(int)bound,anchors.Count,low,high);reason=null;return true;
        }
    }
}

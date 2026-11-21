// Original research-only bounded cohort selection. No game API or world visibility claim.
using System;using System.Collections.Generic;
namespace RichAudio.TrafficResearch
{
    public static class PoolSelection
    {
        public const int Limit=32;
        public static string Identity(uint handle,uint model,int generation){return handle.ToString("X8")+"-"+model.ToString("X8")+"-"+generation.ToString("X2");}
        public static Sample Select(Area area,IList<VehicleReading> input,int enumerated,int errors)
        {
            if(area==null)throw new ArgumentException("missing pool anchor");area.Validate();
            if(!area.StreamedPool||input==null||enumerated<0||enumerated>4096||errors<0||input.Count+errors!=enumerated)throw new ArgumentException("bounded pool accounting");
            var sorted=new List<VehicleReading>();var handles=new HashSet<uint>();
            foreach(var v in input){if(v==null)throw new ArgumentException("missing reading");v.Validate();if(v.Identity!=Identity(v.Handle,v.Model,v.PoolCounter)||!handles.Add(v.Handle))throw new ArgumentException("ambiguous pool identity");sorted.Add(v.Copy());}
            sorted.Sort(delegate(VehicleReading a,VehicleReading b){
                int d=V3.Sub(a.Position,area.Anchor).Length.CompareTo(V3.Sub(b.Position,area.Anchor).Length);
                if(d!=0)return d;d=a.Handle.CompareTo(b.Handle);if(d!=0)return d;d=a.Model.CompareTo(b.Model);return d!=0?d:a.PoolCounter.CompareTo(b.PoolCounter);
            });
            if(sorted.Count>Limit)sorted.RemoveRange(Limit,sorted.Count-Limit);
            return new Sample{Coverage="PARTIAL",Enumerated=enumerated,ReadErrors=errors,PoolEligible=input.Count,PoolOmitted=input.Count-sorted.Count,Listener=area.Anchor,Vehicles=sorted.ToArray()};
        }
    }
}

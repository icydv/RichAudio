using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using RichAudio.Telemetry;

namespace RichAudio.Analysis
{
    [DataContract] public sealed class Band
    {
        [DataMember] public string Range;
        [DataMember] public int Observations,RpmAvailable,GearAvailable,EngineStateAvailable,EngineOnRpmZero;
        [DataMember] public List<string> TrackingIds=new List<string>();
    }
    [DataContract] public sealed class Report
    {
        [DataMember] public string Input,SessionId,Scope="Descriptive capture analysis. Counts concern selected sampled entities; cannot establish all-world population or acoustic audibility.";
        [DataMember] public int SchemaVersion=1,Records,Samples,InvalidLines,UnknownSchemas,SequenceGaps,NonMonotonicSequences,NonMonotonicSamples,MaximumAvailableCount,MaximumSelectedCount,TruncatedCensusSamples,SourceLimitOmitted,BudgetOmitted;
        [DataMember] public bool HasHeader,HasFooter,Complete,AcquisitionBudgetKnown;
        [DataMember] public long ReportedDrops,MissedDeadlines,InvalidValues;
        [DataMember] public int DistinctPoolIndexes,IndexesWithMultipleCounters,AcquisitionBudgetEvaluatedSamples,AcquisitionOverBudgetSamples,BudgetPressureSamples;
        [DataMember] public double DurationSeconds,ObservedSampleHz,ScheduleDelayP95Ms,AcquisitionP95Ms,ProcessingP95Ms,SampleIntervalP95Ms,MaximumSampledNpcDistanceM,MaximumSampledNonPlayerVehicleDistanceM,AcquisitionBudgetMs,AcquisitionOverBudgetPercentage,PeakAcquisitionMs;
        [DataMember] public Band[] DistanceBands;
        [DataMember] public string[] Contexts,LifecycleKinds;
    }
    public static class Program
    {
        private static double P95(List<double> xs) {if(xs.Count==0)return 0;xs.Sort();return xs[Math.Max(0,(int)Math.Ceiling(xs.Count*0.95)-1)];}
        public static Report Analyze(string path) {
            var r=new Report{Input=Path.GetFileName(path),DistanceBands=new[]{new Band{Range="[0,25)m"},new Band{Range="[25,50)m"},new Band{Range="[50,100)m"},new Band{Range="[100,200)m"},new Band{Range="[200,400)m"},new Band{Range="[400,infinity)m"}}};
            var delays=new List<double>();var acquisition=new List<double>();var processing=new List<double>();var intervals=new List<double>();var contexts=new HashSet<string>();var lifecycle=new HashSet<string>();
            var counters=new Dictionary<uint,HashSet<int>>();
            double first=-1,last=-1;long seq=-1;bool ended=false;
            foreach(string line in File.ReadLines(path)) {
                if(string.IsNullOrWhiteSpace(line))continue;
                CaptureRecord c;try{c=JsonLines.Parse(line);}catch{r.InvalidLines++;continue;}
                if(c.SchemaVersion!=1){r.UnknownSchemas++;continue;}
                r.Records++;if(r.SessionId==null)r.SessionId=c.SessionId;if(c.SessionId!=r.SessionId)throw new InvalidDataException("Mixed sessions are not supported");
                if(seq>=0&&c.Sequence<=seq)r.NonMonotonicSequences++;if(seq>=0&&c.Sequence>seq+1)r.SequenceGaps+=(int)Math.Min(int.MaxValue,c.Sequence-seq-1);seq=c.Sequence;
                if(c.Kind=="session_start") {
                    r.HasHeader=true;
                    if(c.Metadata!=null&&Validity.Finite(c.Metadata.AcquisitionBudgetMs)&&c.Metadata.AcquisitionBudgetMs>0) {
                        r.AcquisitionBudgetKnown=true;r.AcquisitionBudgetMs=c.Metadata.AcquisitionBudgetMs;
                    }
                }
                ended=c.Kind=="session_end";if(ended)r.HasFooter=true;
                r.ReportedDrops=Math.Max(r.ReportedDrops,c.QueueDropped);r.MissedDeadlines=Math.Max(r.MissedDeadlines,c.MissedDeadlines);r.InvalidValues=Math.Max(r.InvalidValues,c.InvalidValues);
                if(c.Context!=null)contexts.Add(c.Context);
                if(c.Events!=null)foreach(var e in c.Events)lifecycle.Add(e.Kind);
                if(c.Kind!="sample")continue;
                r.Samples++;if(first<0)first=c.TimestampSeconds;
                if(last>=0){if(c.TimestampSeconds<=last)r.NonMonotonicSamples++;else intervals.Add((c.TimestampSeconds-last)*1000);}last=c.TimestampSeconds;
                delays.Add(c.ScheduleDelayMs);acquisition.Add(c.AcquisitionMs);processing.Add(c.ProcessingMs);
                if(Validity.Finite(c.AcquisitionMs)&&c.AcquisitionMs>=0) {
                    r.PeakAcquisitionMs=Math.Max(r.PeakAcquisitionMs,c.AcquisitionMs);
                    if(r.AcquisitionBudgetKnown) {
                        r.AcquisitionBudgetEvaluatedSamples++;
                        if(c.AcquisitionMs>r.AcquisitionBudgetMs)r.AcquisitionOverBudgetSamples++;
                    }
                }
                if(c.BudgetOmitted>0)r.BudgetPressureSamples++;
                r.MaximumAvailableCount=Math.Max(r.MaximumAvailableCount,c.AvailableCount);r.MaximumSelectedCount=Math.Max(r.MaximumSelectedCount,c.Vehicles.Count);if(c.CensusTruncated)r.TruncatedCensusSamples++;r.SourceLimitOmitted+=c.SourceLimitOmitted;r.BudgetOmitted+=c.BudgetOmitted;
                foreach(var v in c.Vehicles) {
                    if(v.PoolIndex!=null&&v.PoolIndex.Value.HasValue&&v.PoolCounter!=null&&v.PoolCounter.Value.HasValue){uint poolIndex=v.PoolIndex.Value.Value;if(!counters.ContainsKey(poolIndex))counters[poolIndex]=new HashSet<int>();counters[poolIndex].Add(v.PoolCounter.Value.Value);}
                    if(v.PlayerVehicle==null||v.PlayerVehicle.Value!=false||v.DistanceFromListener==null||!v.DistanceFromListener.Value.HasValue)continue;
                    double d=v.DistanceFromListener.Value.Value;r.MaximumSampledNonPlayerVehicleDistanceM=Math.Max(r.MaximumSampledNonPlayerVehicleDistanceM,d);
                    if(v.DriverPresent==null||v.DriverPresent.Value!=true)continue;
                    r.MaximumSampledNpcDistanceM=Math.Max(r.MaximumSampledNpcDistanceM,d);
                    int index=d<25?0:d<50?1:d<100?2:d<200?3:d<400?4:5;var b=r.DistanceBands[index];b.Observations++;if(!b.TrackingIds.Contains(v.TrackingId))b.TrackingIds.Add(v.TrackingId);
                    if(v.EngineRunning!=null&&v.EngineRunning.Value.HasValue)b.EngineStateAvailable++;
                    if(v.RpmRatio!=null&&v.RpmRatio.Value.HasValue){b.RpmAvailable++;if(v.EngineRunning!=null&&v.EngineRunning.Value==true&&v.RpmRatio.Value.Value==0)b.EngineOnRpmZero++;}
                    if(v.Gear!=null&&v.Gear.Value.HasValue)b.GearAvailable++;
                }
            }
            r.Complete=r.HasHeader&&ended&&r.InvalidLines==0&&r.UnknownSchemas==0&&r.NonMonotonicSamples==0&&r.NonMonotonicSequences==0;r.DurationSeconds=Math.Max(0,last-first);r.ObservedSampleHz=r.DurationSeconds>0?(r.Samples-1)/r.DurationSeconds:0;
            r.AcquisitionOverBudgetPercentage=r.AcquisitionBudgetEvaluatedSamples>0?100.0*r.AcquisitionOverBudgetSamples/r.AcquisitionBudgetEvaluatedSamples:0;
            r.ScheduleDelayP95Ms=P95(delays);r.AcquisitionP95Ms=P95(acquisition);r.ProcessingP95Ms=P95(processing);r.SampleIntervalP95Ms=P95(intervals);r.Contexts=contexts.OrderBy(x=>x).ToArray();r.LifecycleKinds=lifecycle.OrderBy(x=>x).ToArray();r.DistinctPoolIndexes=counters.Count;r.IndexesWithMultipleCounters=counters.Values.Count(x=>x.Count>1);return r;
        }
        public static int Main(string[] args) {
            try {
                if(args.Length<1||args.Length>2){Console.Error.WriteLine("Usage: RichAudio.Telemetry.Analysis.exe capture.jsonl [report.json]");return 2;}
                var report=Analyze(args[0]);string json;using(var ms=new MemoryStream()){new DataContractJsonSerializer(typeof(Report)).WriteObject(ms,report);json=Encoding.UTF8.GetString(ms.ToArray());}
                if(args.Length==2)File.WriteAllText(args[1],json,new UTF8Encoding(false));else Console.WriteLine(json);
                return report.InvalidLines==0&&report.UnknownSchemas==0?0:1;
            }catch(Exception ex){Console.Error.WriteLine(ex.GetType().Name+": "+ex.Message);return 1;}
        }
    }
}

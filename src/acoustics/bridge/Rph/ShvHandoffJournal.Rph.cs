#if SHV_HANDOFF_09
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using Microsoft.Win32.SafeHandles;
using RichAudio.Beacon.Transport;

namespace RichAudio.Beacon.Handoff
{
    // Bounded asynchronous private evidence only. The writer never invokes a
    // game/SDK native, caller callback, transport endpoint or audio component.
    internal sealed class ShvHandoffJournal
    {
        const int Capacity=128,MaximumItemBytes=65536,MaximumSourceRecords=4801,MaximumBytes=12*1024*1024,SummaryReserve=16384;
        sealed class Item{internal byte[] Bytes;internal bool Source;}
        readonly object gate=new object();readonly Item[] queue=new Item[Capacity];
        readonly AutoResetEvent wake=new AutoResetEvent(false);readonly ManualResetEvent done=new ManualResetEvent(false);
        readonly string root;readonly Thread worker;readonly JavaScriptSerializer json=new JavaScriptSerializer{MaxJsonLength=MaximumItemBytes,RecursionLimit=24};
        int head,tail,count,highWater,sourceQueued,sourceWritten,eventWritten,dropped;
        long admittedBytes,writtenBytes,lastQpc=-1,lastAuditOrdinal;ulong lastSourceSequence;bool pendingReturn,terminalSeen;
        byte[] lastAuditBytes;int sourceOrderAnomalies,duplicateAuditsSuppressed;
        bool healthy=true,completing,producerCompleted,sourceRetired,completionObserved;long completionDeadline;string error,reason;
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern bool CreateDirectoryW(string path,IntPtr security);
        [DllImport("kernel32.dll",CharSet=CharSet.Unicode,SetLastError=true)] static extern SafeFileHandle CreateFileW(string path,uint access,uint share,IntPtr security,uint creation,uint flags,IntPtr template);
        [StructLayout(LayoutKind.Sequential)] struct FileInfo{internal uint Attributes,CreationLow,CreationHigh,AccessLow,AccessHigh,WriteLow,WriteHigh,Volume,SizeHigh,SizeLow,Links,IndexHigh,IndexLow;}
        [DllImport("kernel32.dll",SetLastError=true)] static extern bool GetFileInformationByHandle(SafeFileHandle file,out FileInfo info);
        internal ShvHandoffJournal(string evidenceRoot)
        {
            string parent=Path.Combine(ShvHandoffBuildPolicy.WorkspaceRoot,".local","playable-09","live-session");
            root=Path.GetFullPath(evidenceRoot);string leaf=Path.GetFileName(root);
            if(Path.GetDirectoryName(root)!=parent||!System.Text.RegularExpressions.Regex.IsMatch(leaf,"\\A[a-f0-9]{32}\\z"))throw new ArgumentException("compiled private evidence root");
            worker=new Thread(Run){IsBackground=true,Name="RichAudio bounded passive evidence"};worker.Start();
        }
        internal bool Healthy{get{lock(gate)return healthy;}}
        internal string Error{get{lock(gate)return error;}}
        internal bool CompletionObservedWithinBound{get{lock(gate)return completionObserved;}}
        internal bool WorkerAlive{get{return worker.IsAlive;}}
        void Fail(string why){lock(gate){healthy=false;if(error==null)error=why;dropped++;}wake.Set();}
        bool Add(byte[] bytes,bool source)
        {
            lock(gate){
                if(!healthy||completing)return false;
                long now=Stopwatch.GetTimestamp();
                if(bytes==null||bytes.Length==0||bytes.Length>MaximumItemBytes||now<lastQpc||count==Capacity
                    ||admittedBytes+bytes.Length>MaximumBytes-SummaryReserve){healthy=false;error="journal-queue-clock-or-byte-budget";dropped++;wake.Set();return false;}
                lastQpc=now;queue[head]=new Item{Bytes=bytes,Source=source};head=(head+1)%Capacity;count++;admittedBytes+=bytes.Length;
                if(count>highWater)highWater=count;wake.Set();return true;
            }
        }
        static byte[] SourceBytes(ShvAbi.Record record)
        {
            IntPtr own=Marshal.AllocHGlobal(256);
            try{Marshal.StructureToPtr(record,own,false);var bytes=new byte[256];Marshal.Copy(own,bytes,0,256);return bytes;}
            finally{Marshal.FreeHGlobal(own);}
        }
        bool Source(ShvAbi.Record record,byte[] bytes)
        {
            if(!healthy||completing)return false;
            if(sourceQueued>=MaximumSourceRecords){Fail("journal-source-record-bound");return false;}
            if(!Add(bytes,true))return false;
            // This is an audit sink, not a qualification parser. Preserve the
            // actual fixed-layout bytes even when reported metadata is invalid.
            bool order=record.Size==256&&!terminalSeen;
            if(record.Kind==ShvAbi.Kind.TargetReturn){order&=!pendingReturn&&record.Sequence==lastSourceSequence+1;pendingReturn=true;lastSourceSequence=record.Sequence;}
            else if(record.Kind==ShvAbi.Kind.Observation){order&=pendingReturn&&record.Sequence==lastSourceSequence;pendingReturn=false;}
            else if(record.Kind==ShvAbi.Kind.Terminal){order&=record.Sequence==lastSourceSequence;terminalSeen=true;}
            else order=false;
            if(!order)sourceOrderAnomalies++;sourceQueued++;return true;
        }
        internal bool WriteSource(ShvAbi.Record record)
        {
            try{lock(gate)return Source(record,SourceBytes(record));}
            catch(ThreadAbortException){throw;}catch{Fail("journal-source-serialization");return false;}
        }
        internal bool WriteSourceAudit(long ordinal,ShvAbi.Record record)
        {
            try{lock(gate){
                byte[] bytes=SourceBytes(record);
                if(ordinal==lastAuditOrdinal&&lastAuditBytes!=null){
                    bool equal=true;for(int i=0;i<256;i++)equal&=bytes[i]==lastAuditBytes[i];
                    if(!equal){Fail("journal-audit-ordinal-bytes-changed");return false;}
                    duplicateAuditsSuppressed++;return true;
                }
                if(ordinal<=0||ordinal!=lastAuditOrdinal+1){Fail("journal-audit-ordinal-order");return false;}
                bool admitted=false;
                // CLR ThreadAbort is deferred through this finally. Admission
                // and its idempotency commit cannot be split by an abort before
                // the caller acknowledges the separately retained audit row.
                try{}finally{
                    if(Source(record,bytes)){lastAuditBytes=bytes;lastAuditOrdinal=ordinal;admitted=true;}
                }
                return admitted;
            }
            }catch(ThreadAbortException){throw;}catch{Fail("journal-source-audit-serialization");return false;}
        }
        internal bool WriteEvent(string kind,object payload)
        {
            try{
                if(kind==null||!System.Text.RegularExpressions.Regex.IsMatch(kind,"\\A[a-z0-9-]{1,64}\\z")){Fail("journal-event-kind");return false;}
                string text;lock(gate)text=json.Serialize(new{kind=kind,hostQpc=Stopwatch.GetTimestamp(),data=payload});
                return Add(new UTF8Encoding(false,true).GetBytes(text+"\n"),false);
            }catch(ThreadAbortException){throw;}catch{Fail("journal-event-serialization");return false;}
        }
        internal bool WriteFrame(GameplayFrame frame,ShvGameplayFrameAdapter.Lineage line)
        {
            try{
                if(frame==null||frame.Vehicles==null||frame.Vehicles.Length>1||((frame.Vehicles.Length==1)!=(line!=null))){Fail("journal-frame-lineage");return false;}
                var encoded=GameplayWire.Encode(frame,frame.Session);
                object lineage=line==null?null:new{session=line.SessionId,generation=line.SourceGeneration,sequence=line.SourceSequence,
                    rawBits=line.RawBits,operatingPoint=line.OperatingPoint,sourceBeforeTicks=line.SourceBeforeTicks,sourceAfterTicks=line.SourceAfterTicks,
                    minimumHostTicks=line.MinimumHostTicks,maximumHostTicks=line.MaximumHostTicks,hostFrequency=line.HostClockFrequency,
                    peerStartTicks=line.PeerStartTicks,peerEndTicks=line.PeerEndTicks,vehicleObservationTicks=line.VehicleObservationTicks,
                    listenerObservationTicks=line.ListenerObservationTicks,validThroughHostTicks=line.ValidThroughHostTicks,hostVehicleId=line.HostVehicleId};
                return WriteEvent("gameplay-frame",new{frameJson=new UTF8Encoding(false,true).GetString(encoded),lineage=lineage,passiveOnly=true,audioPlaybackAllowed=false});
            }catch(ThreadAbortException){throw;}catch{Fail("journal-gameplay-codec");return false;}
        }
        static void PinDirectory(string path,List<SafeFileHandle> holds)
        {
            var held=CreateFileW(path,0x80,3,IntPtr.Zero,3,0x02200000,IntPtr.Zero);FileInfo info;
            if(held.IsInvalid||!GetFileInformationByHandle(held,out info)||(info.Attributes&0x400)!=0||(info.Attributes&0x10)==0){held.Dispose();throw new IOException("unlinked held evidence directory required");}
            holds.Add(held);
        }
        void Run()
        {
            var holds=new List<SafeFileHandle>();
            try{
                ShvHandoffBootstrap.CheckUnlinked(root);
                string parent=Path.GetDirectoryName(root);var ancestors=new Stack<string>();
                for(string at=parent;!String.IsNullOrEmpty(at);at=Path.GetDirectoryName(at)){ancestors.Push(at);if(Path.GetDirectoryName(at)==at)break;}
                while(ancestors.Count>0){string at=ancestors.Pop();if(!Directory.Exists(at))Directory.CreateDirectory(at);PinDirectory(at,holds);}
                if(!CreateDirectoryW(root,IntPtr.Zero))throw new IOException("new private session directory required");PinDirectory(root,holds);
                using(var source=new FileStream(Path.Combine(root,"source-records.bin"),FileMode.CreateNew,FileAccess.Write,FileShare.Read))
                using(var events=new FileStream(Path.Combine(root,"events.ndjson"),FileMode.CreateNew,FileAccess.Write,FileShare.Read)){
                    while(true){
                        Item item=null;bool finish;
                        lock(gate){if(count>0){item=queue[tail];queue[tail]=null;tail=(tail+1)%Capacity;count--;}finish=completing&&count==0&&item==null;}
                        if(item!=null){var target=item.Source?source:events;target.Write(item.Bytes,0,item.Bytes.Length);target.Flush(true);
                            lock(gate){writtenBytes+=item.Bytes.Length;if(item.Source)sourceWritten++;else eventWritten++;}continue;}
                        if(finish)break;wake.WaitOne(20);
                    }
                    source.Flush(true);events.Flush(true);
                }
                byte[] summary;
                lock(gate)summary=new UTF8Encoding(false).GetBytes(json.Serialize(new{schema=1,profile="PLAYABLE-09",session=Path.GetFileName(root),
                    passiveOnly=true,audioPlaybackAllowed=false,producerCompleted=producerCompleted,sourceRetired=sourceRetired,
                    sourceCallbackOutcome=producerCompleted?"completed":"outcome-unobserved",nativeOutcomeMayRemainUnobserved=!producerCompleted,
                    summaryPreparedHostQpc=Stopwatch.GetTimestamp(),completionDeadlineHostQpc=completionDeadline,
                    writerCompletionRequiresExternalCallerJoinObservation=true,boundedWriterCompletionEstablishedBySummary=false,
                    healthyAtSummaryPreparation=healthy,errorAtSummaryPreparation=error,reason=reason,sourceRecordsAdmitted=sourceQueued,sourceRecordsWritten=sourceWritten,
                    eventsWritten=eventWritten,dropped=dropped,queueHighWater=highWater,bytesWrittenBeforeSummary=writtenBytes,
                    maximumBytes=MaximumBytes,sourceTerminalRecordSeen=terminalSeen,pendingTargetReturn=pendingReturn,
                    sourceOrderAnomalies=sourceOrderAnomalies,lastAuditOrdinal=lastAuditOrdinal,duplicateAuditsSuppressed=duplicateAuditsSuppressed}));
                if(summary.Length>SummaryReserve)throw new IOException("summary byte bound");
                string pending=Path.Combine(root,"summary.pending");
                using(var file=new FileStream(pending,FileMode.CreateNew,FileAccess.Write,FileShare.Read)){file.Write(summary,0,summary.Length);file.Flush(true);}
                File.Move(pending,Path.Combine(root,"summary.json"));
            }catch(ThreadAbortException){throw;}
            catch(Exception exception){Fail("journal-writer-failed:"+exception.GetType().Name);}
            finally{foreach(var held in holds)held.Dispose();done.Set();}
        }
        internal bool Complete(bool producerIsCompleted,bool sourceIsRetired,string terminalReason)
        {
            lock(gate){
                if(completing)return completionObserved&&healthy;
                completing=true;producerCompleted=producerIsCompleted;sourceRetired=sourceIsRetired;
                completionDeadline=Stopwatch.GetTimestamp()+Stopwatch.Frequency*1500/1000;
                reason=terminalReason==null?"unspecified":terminalReason.Substring(0,Math.Min(256,terminalReason.Length));wake.Set();
            }
            bool joined=worker.Join(1500);long observed=Stopwatch.GetTimestamp();
            if(!joined||observed>completionDeadline){Fail("journal-writer-completion-unobserved-within-bound");return false;}
            lock(gate){completionObserved=true;return healthy;}
        }
    }
}
#endif

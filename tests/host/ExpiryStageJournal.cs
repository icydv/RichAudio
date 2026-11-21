using System;
using System.Diagnostics;
using System.IO;
using System.IO.MemoryMappedFiles;
using System.Threading;

// Fixture-only, fixed-size shared-memory observations. The parent retains its
// mapping until owned-child termination is verified; no terminal child JSON is
// needed to recover a committed stage. No production callback writes here.
public sealed class ExpiryStageJournal:MarshalByRefObject,IDisposable
{
    private const int Bytes=2112,HeaderBytes=64,EntryBytes=32,ParentEntries=16,ChildEntries=48;
    private readonly FileStream file;
    private readonly MemoryMappedFile mapping;
    private readonly MemoryMappedViewAccessor view;
    private readonly int processId;
    private readonly string fault;
    private int entries;
    public ExpiryStageJournal(string path,string nonce,int ownerPid,long ownerCreationTicks,string faultStage,string role)
    {
        file=new FileStream(path,FileMode.Open,FileAccess.ReadWrite,FileShare.ReadWrite);
        if(file.Length!=Bytes)throw new InvalidDataException("journal bound");
        mapping=MemoryMappedFile.CreateFromFile(file,null,Bytes,MemoryMappedFileAccess.ReadWrite,HandleInheritability.None,true);
        view=mapping.CreateViewAccessor(0,Bytes,MemoryMappedFileAccess.ReadWrite);
        byte[] expected=new Guid(nonce).ToByteArray(),actual=new byte[16];view.ReadArray(32,actual,0,16);
        bool identity=true;for(int n=0;n<16;n++)identity&=actual[n]==expected[n];
        using(var owner=Process.GetProcessById(ownerPid))
        {
            if(!identity||view.ReadInt32(0)!=0x45585032||view.ReadInt32(4)!=1||view.ReadInt32(8)!=ownerPid||view.ReadInt64(16)!=ownerCreationTicks||view.ReadInt64(24)!=Stopwatch.Frequency||view.ReadInt32(12)!=(role=="send"?1:2)||owner.HasExited||owner.StartTime.ToUniversalTime().Ticks!=ownerCreationTicks)
                throw new InvalidDataException("journal owner identity");
        }
        processId=Process.GetCurrentProcess().Id;fault=faultStage;
    }
    public void Mark(int stage,int observedDomain)
    {
        lock(this)
        {
            if(stage<32||stage>63||observedDomain<=0||entries>=ChildEntries)throw new InvalidDataException("journal entry bound");
            int index=entries++,offset=HeaderBytes+(ParentEntries+index)*EntryBytes;
            // Commit is written last. A killed partial write is rejected by the
            // parent rather than fabricated as a completed stage.
            view.Write(offset+4,stage);view.Write(offset+8,processId);view.Write(offset+12,observedDomain);
            view.Write(offset+16,Stopwatch.GetTimestamp());view.Write(offset+24,(long)0);Thread.MemoryBarrier();view.Write(offset,index+1);
        }
        if(fault==stage.ToString(System.Globalization.CultureInfo.InvariantCulture))Thread.Sleep(30000);
    }
    public override object InitializeLifetimeService(){return null;}
    public void Dispose(){view.Flush();view.Dispose();mapping.Dispose();file.Dispose();}
}

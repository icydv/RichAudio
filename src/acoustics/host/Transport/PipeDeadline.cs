using System;using System.IO;using System.IO.Pipes;using System.Threading;
namespace RichAudio.Beacon.Transport {
 // The completion callback owns EndRead/EndWrite/EndWaitForConnection. A timed-out caller abandons
 // this gate and closes its pipe, but never disposes an async-result event
 // which a still-pending kernel completion will subsequently signal.
 // Kept independent of the historical protocol classes so reproduction
 // fixtures can still compile their deliberately unchanged older StatePipe.
 internal static class PipeDeadline {
  public static int Read(PipeStream pipe,byte[] bytes,int offset,int length,int timeout,string reason){return new PendingIo(pipe,false).Run(bytes,offset,length,timeout,reason);}
  public static void Write(Stream pipe,byte[] bytes,int timeout,string reason){new PendingIo(pipe,true).Run(bytes,0,bytes.Length,timeout,reason);}
  public static void WaitForConnection(NamedPipeServerStream pipe,int timeout,string reason){new PendingIo(pipe,false,true).Run(null,0,0,timeout,reason);}
  sealed class PendingIo {
   readonly object gate=new object();readonly ManualResetEvent done=new ManualResetEvent(false);readonly Stream pipe;readonly bool write,connection;bool complete,abandoned;int count;Exception error;
   public PendingIo(Stream pipe,bool write,bool connection=false){this.pipe=pipe;this.write=write;this.connection=connection;}
   void Finish(IAsyncResult operation){
    try{if(connection)((NamedPipeServerStream)pipe).EndWaitForConnection(operation);else if(write)pipe.EndWrite(operation);else count=pipe.EndRead(operation);}catch(Exception e){error=e;}
    lock(gate){complete=true;if(abandoned)done.Dispose();else done.Set();}
   }
   public int Run(byte[] bytes,int offset,int length,int timeout,string reason){
    try{if(connection)((NamedPipeServerStream)pipe).BeginWaitForConnection(Finish,null);else if(write)pipe.BeginWrite(bytes,offset,length,Finish,null);else pipe.BeginRead(bytes,offset,length,Finish,null);}catch{done.Dispose();throw;}
    bool signalled=false;try{signalled=done.WaitOne(timeout);}finally{lock(gate){abandoned=true;if(complete)done.Dispose();}}
    if(!signalled){pipe.Dispose();throw new TimeoutException(reason);}
    if(error!=null)throw error;return count;
   }
  }
 }
}

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Text;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

public static class TestInGameRecording
{
    private static int checks;
    private static void Need(bool value,string message){checks++;if(!value)throw new Exception(message);}
    private static void Wait(Func<bool> condition,string message)
    {var clock=Stopwatch.StartNew();while(!condition()&&clock.ElapsedMilliseconds<4000)Thread.Sleep(10);Need(condition(),message);}
    private sealed class Server:IDisposable
    {
        internal readonly TcpListener Socket=new TcpListener(IPAddress.Loopback,0);
        internal readonly string Token=new string('a',64);
        internal string Url;
        internal volatile bool Halt,Active,WrongStopId;
        internal int Starts,Stops,Authorized;
        private Thread thread;
        internal Server(){Socket.Start();Url="http://127.0.0.1:"+((IPEndPoint)Socket.LocalEndpoint).Port;thread=new Thread(Run){IsBackground=true};thread.Start();}
        private void Run(){while(!Halt){try{using(var client=Socket.AcceptTcpClient()){
            client.ReceiveTimeout=1000;client.SendTimeout=1000;
            using(var stream=client.GetStream())using(var reader=new StreamReader(stream,Encoding.ASCII,false,1024,true)){
                string first=reader.ReadLine(),line;int length=0;bool authorized=false;
                while(!String.IsNullOrEmpty(line=reader.ReadLine())){
                    if(line.StartsWith("Content-Length:",StringComparison.OrdinalIgnoreCase))length=Int32.Parse(line.Substring(15).Trim());
                    if(line.StartsWith("X-RichAudio-Token:",StringComparison.OrdinalIgnoreCase))authorized=line.Substring(18).Trim()==Token;}
                if(length<0||length>4096)throw new IOException("Fixture request bound");
                var body=new char[length];int offset=0;while(offset<length){int count=reader.Read(body,offset,length-offset);if(count==0)throw new IOException("Fixture body EOF");offset+=count;}
                if(!authorized)throw new IOException("Missing capability");Interlocked.Increment(ref Authorized);
                string route=first.Split(' ')[1],response;
                if(route=="/api/record/start"){Active=true;Interlocked.Increment(ref Starts);response="{}";}
                else if(route=="/api/record/stop"){
                    var data=new JavaScriptSerializer().Deserialize<Dictionary<string,object>>(new string(body));
                    if(!data.ContainsKey("id")||(string)data["id"]!="fixture-recording-1")WrongStopId=true;
                    Active=false;Interlocked.Increment(ref Stops);response="{}";}
                else if(route=="/api/status")response=Active?"{\"recording\":{\"id\":\"fixture-recording-1\",\"state\":\"recording\"}}":"{\"recording\":null}";
                else throw new IOException("Unexpected fixture route");
                byte[] bytes=Encoding.UTF8.GetBytes(response),header=Encoding.ASCII.GetBytes("HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: "+bytes.Length+"\r\nConnection: close\r\n\r\n");
                stream.Write(header,0,header.Length);stream.Write(bytes,0,bytes.Length);
            }
        }}catch{if(!Halt)Thread.Sleep(10);}}}
        public void Dispose(){Halt=true;Socket.Stop();thread.Join(1200);}
    }
    private static void Put(string path,object value){File.WriteAllText(path,new JavaScriptSerializer().Serialize(value),new UTF8Encoding(false));}
    public static int Main(string[] args)
    {
        string root=Path.GetFullPath(args[0]);if(Directory.Exists(root))throw new IOException("Fresh private fixture required");
        Directory.CreateDirectory(Path.Combine(root,".local","soundmap"));
        string pointer=Path.Combine(root,"menu.json"),descriptor=Path.Combine(root,".local","soundmap","service.json");
        Put(pointer,new{schemaVersion=1,workspaceRoot=root,settingsPath=".local/preferences.json",toggleKey="F10",controllerEnabled=true});
        using(var server=new Server())using(var bridge=new InGameRecordingBridge(pointer)){
            Put(descriptor,new{schemaVersion=1,url=server.Url,token=server.Token});
            Need(!bridge.TrySetRecording(true),"Recording cannot start before observed service readiness");bridge.Start();
            Wait(()=>bridge.Snapshot.Available,"Actual bounded background HTTP status");
            Need(!bridge.Snapshot.Active,"Initial inactive recorder");
            Need(bridge.TrySetRecording(true),"Explicit Start queued");
            Need(!bridge.TrySetRecording(true),"Duplicate pending Start rejected");
            Wait(()=>bridge.Snapshot.Active&&!bridge.Snapshot.Pending,"Start confirmed by observed recorder status");
            Need(server.Starts==1&&server.Authorized>0,"Exactly one authenticated Start");
            Need(!bridge.TrySetRecording(true),"Active recording cannot Start again");
            var clock=Stopwatch.StartNew();bool allActive=true;for(int i=0;i<10000;i++){var status=bridge.Snapshot;allActive&=status.Active;}
            Need(allActive,"Ten thousand cached snapshot reads retain the current state");
            Need(clock.ElapsedMilliseconds<250,"Game-fiber snapshot access performs no network or waits");
            Need(bridge.TrySetRecording(false),"Explicit Stop queued");
            Wait(()=>!bridge.Snapshot.Active&&bridge.Snapshot.Available&&!bridge.Snapshot.Pending,"Stop acknowledged");
            Need(server.Stops==1&&!server.WrongStopId,"Stop binds original recording identity");
            Put(descriptor,new{schemaVersion=1,url="http://example.invalid:17833",token=server.Token});
            Wait(()=>!bridge.Snapshot.Available,"Non-loopback descriptor rejected without request");
            Need(!bridge.TrySetRecording(true)&&server.Starts==1,"Unavailable service cannot start recording");
            Put(descriptor,new{schemaVersion=1,url=server.Url,token=server.Token});
            Wait(()=>bridge.Snapshot.Available,"Same private service reconnects");
            bridge.RequestStop();Wait(()=>!bridge.Snapshot.Available,"Unload invalidates recorder controls");
            Need(!bridge.TrySetRecording(true),"Stopped bridge cannot restart");
        }
        Console.WriteLine("PASS: "+checks+" recording bridge assertions; loopback fixture only, no game or audio endpoint.");return 0;
    }
}

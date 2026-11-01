using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Windows;

internal static class TestPassiveSoundMap
{
    public static int Main(string[] args)
    {
        if(args.Length==2&&args[0]=="--validate"){
            try{InGameSettingsLink.Load(args[1]);Console.WriteLine("PASS strict passive sidecar");return 0;}
            catch(Exception error){Console.WriteLine("REJECT "+error.GetType().Name);return 2;}
        }
        string root=args[0],pointer=Path.Combine(root,"menu.json"),stop=Path.Combine(root,"stop-fixture");
        bool showWindow=args.Length>3&&args[3]=="window";
        var json=new JavaScriptSerializer();
        File.WriteAllText(pointer,json.Serialize(new{schemaVersion=1,workspaceRoot=root,settingsPath=".local/settings.json",toggleKey="F10",controllerEnabled=true,soundMap=new{enabled=true,autoStartService=true,openWindow=showWindow,sampleHz=20,port=Int32.Parse(args[2]),nodeExecutable=args[1]}}));
        using(var bridge=new PassiveSoundMapBridge(pointer)){
            bridge.Start();Thread.Sleep(350);
            if(File.Exists(Path.Combine(root,".local","soundmap","service.json")))throw new Exception("Service started before Story ready");
            bridge.SetStoryReady(true);var deadline=Stopwatch.StartNew();long sequence=0;
            while(!File.Exists(stop)&&deadline.ElapsedMilliseconds<(showWindow?240000:15000)){
                long ticks=Stopwatch.GetTimestamp();long unix=(long)(DateTime.UtcNow-new DateTime(1970,1,1,0,0,0,DateTimeKind.Utc)).TotalMilliseconds;
                bridge.Publish(new PassiveCameraSample{Sequence=sequence++,Generation=1,ObservationTicks=ticks,ObservedAtUnixMs=unix,Position=new[]{sequence*0.1,2.0,3.0},Forward=new[]{0.0,1.0,0.0},Up=new[]{0.0,0.0,1.0},Velocity=null,Valid=true,Reason="device-free-injected-camera"});Thread.Sleep(50);
            }
            if(!File.Exists(stop))throw new Exception("Passive fixture completion bound");
            bridge.RequestStop();
        }
        Console.WriteLine("PASS actual passive worker / original sample timestamps / owned Node service / no audio or sensing");return 0;
    }
}

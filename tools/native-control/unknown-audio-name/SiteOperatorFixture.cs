using System;
using System.Collections.Generic;
using System.Linq;
using System.Xml;
using System.Web.Script.Serialization;
using GTA.Math;
using RichAudio.NativeSuppression01;

internal static partial class TestUnknownName {
    // The PowerShell fixture host uses the real SDK argument conversions, with only game responses authored.
    static T Fields<T>(XmlElement values) where T:new() {
        var result=new T();
        foreach(var field in typeof(T).GetFields()){
            if(values.HasAttribute(field.Name))
                field.SetValue(result,Convert.ChangeType(values.GetAttribute(field.Name),field.FieldType));
        }
        return result;
    }

    static int WireFixture(){
        var f=new Fixture();
        var json=new JavaScriptSerializer();
        var start=new Vector3(1737.014f,3293.598f,40.50861f);
        var foot=new Vector3(1737.733f,3293.922f,41.16322f);
        f.Game.Current=1282;f.Game.Player=start;f.Input.ReplayExit=true;
        f.Game.Entities.Add(1282,new SetupGame11.Entity{Handle=1282,Driver=2,Position=start});
        bool seenExit=false,seenOccupied=false;
        f.BeforeTick=delegate {
            if(!seenExit && f.Game.Current==0){
                seenExit=true;f.Game.Player=foot;f.Game.PlayerSpeed=.120991267f;
            }else if(seenExit)f.Game.PlayerSpeed=0;
        };
        f.Input.Occupied=(x,y,r)=>{
            bool occupied=r==.60f && Math.Abs(x-foot.X)<.01 && Math.Abs(y-foot.Y)<.01;
            if(occupied && !seenOccupied){seenOccupied=true;f.Game.UnpavedSamples=1;}
            return occupied;
        };
        int sent=0;
        while(true){
            var state=f.Run.State;
            Console.WriteLine(json.Serialize(new Dictionary<string,object>{
                {"state",typeof(RunState).GetFields().ToDictionary(k=>k.Name,k=>k.GetValue(state))},
                {"journal",f.Log.Wire.Skip(sent).ToArray()},{"created",f.Game.Created},{"profiles",f.Game.Profiles},
                {"reservations",f.Log.Lines.Where(l=>l.StartsWith("setup-command-reserved")).Select(l=>l.Split(' ')[1]).ToArray()},
                {"registered",f.Game.N("register")},{"models",f.Game.N("model")}
            }));
            Console.Out.Flush();sent=f.Log.Wire.Count;
            string line=Console.ReadLine();if(line==null)return 0;
            var input=new XmlDocument();input.LoadXml(line);
            f.WireCapture=Fields<CaptureLease>((XmlElement)input.SelectSingleNode("/step/capture"));
            foreach(XmlElement command in input.SelectNodes("/step/command")){
                var c=Fields<RunCommand>(command);
                var reply=f.Run.Command(c,f.WireCapture);
                if(!reply.StartsWith("accepted"))throw new Exception("operator command rejected: "+reply);
            }
            for(int tick=0;tick<4;tick++)f.Step();
        }
    }
}

using System;
using System.Collections.Generic;
using System.IO;
using System.Text;
using System.Web.Script.Serialization;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

namespace RichAudio.Integration
{
    // Worker-only path resolution. A portable scripts/RichAudio tree resolves
    // its own payload after copying; shipped pointers never contain staging paths.
    public sealed class ShvdnePackageLinks
    {
        public string MenuPath { get; private set; }
        public string PlayablePath { get; private set; }
        public static ShvdnePackageLinks Prepare(string root,ShvdneConfiguration config)
        {
            root=Path.GetFullPath(root);PlayableConfiguration.NoLinks(root);
            string payload=Path.Combine(root,"payload"),state=Path.Combine(root,"state");
            PlayableConfiguration.NoLinks(payload);PlayableConfiguration.NoLinks(state);
            if(!Directory.Exists(payload))throw new InvalidDataException("SHVDNE payload missing");
            var serializer=new JavaScriptSerializer{MaxJsonLength=4096,RecursionLimit=8};
            string descriptor=Path.Combine(root,"package.json");PlayableConfiguration.NoLinks(descriptor);
            if(new FileInfo(descriptor).Length>4096)throw new InvalidDataException("Bounded package descriptor required");
            var package=serializer.Deserialize<Dictionary<string,object>>(File.ReadAllText(descriptor));
            object schema,manifestHash;
            if(package==null||!package.TryGetValue("schema",out schema)||!Equals(schema,1)||!package.TryGetValue("manifestSha256",out manifestHash))
                throw new InvalidDataException("SHVDNE package descriptor required");
            string manifest=Path.Combine(payload,"playable.json");
            if(config.HostEnabled){
                PlayableConfiguration.NoLinks(manifest);
                if(!(manifestHash is string)||((string)manifestHash).Length!=64||
                    !String.Equals(PlayableConfiguration.Digest(manifest),(string)manifestHash,StringComparison.OrdinalIgnoreCase))
                    throw new InvalidDataException("SHVDNE package manifest binding differs");
            }
            if(config.HostEnabled){
                if(new FileInfo(manifest).Length>131072)throw new InvalidDataException("Bounded playable manifest required");
                var metadata=new JavaScriptSerializer{MaxJsonLength=131072}.Deserialize<Dictionary<string,object>>(File.ReadAllText(manifest));
                object mode;bool transport=metadata.TryGetValue("transportValidationOnly",out mode)&&Equals(mode,true);
                if(config.TransportValidationOnly!=transport)throw new InvalidDataException("Adapter/host transport mode mismatch");
                if(transport)PlayableConfiguration.Load(manifest);
            }
            Directory.CreateDirectory(state);
            // A fresh package has no mutable preferences among its immutable
            // bindings. Seed stock fallback once so the host can start its
            // supervisor without FileNotFound retries. Never replace a save.
            string settings=AcousticSettingsStore.PrivatePath(payload,AcousticSettingsStore.DefaultPath(payload));
            if(!File.Exists(settings)){
                try{AcousticSettingsStore.SaveExpected(payload,settings,AcousticSettings.Defaults(1),0);}
                catch(InvalidDataException){
                    // Another settings owner may have won the create race.
                    // Accept its validated save without overwriting it.
                    if(!File.Exists(settings))throw;
                    AcousticSettingsStore.Load(payload,settings);
                }
            }
            var links=new ShvdnePackageLinks{MenuPath=Path.Combine(state,"menu.json"),PlayablePath=Path.Combine(state,"playable-pointer.json")};
            var menu=new{schemaVersion=1,workspaceRoot=payload,settingsPath=".local/acoustic-settings.json",toggleKey="F10",controllerEnabled=true,
                soundMap=new{enabled=config.SoundMapEnabled,autoStartService=config.SoundMapEnabled,openWindow=config.SoundMapEnabled,
                    sampleHz=config.SampleHz,port=17833,nodeExecutable=Path.Combine(payload,"runtime","node.exe")}};
            Write(links.MenuPath,serializer.Serialize(menu));
            if(config.HostEnabled)Write(links.PlayablePath,serializer.Serialize(new{schema=1,packageRoot=payload,manifestSha256=(string)manifestHash}));
            return links;
        }
        static void Write(string file,string text)
        {
            PlayableConfiguration.NoLinks(file);string temporary=file+"."+Guid.NewGuid().ToString("N")+".tmp";
            try{
                using(var stream=new FileStream(temporary,FileMode.CreateNew,FileAccess.Write,FileShare.None)){
                    byte[] bytes=new UTF8Encoding(false).GetBytes(text);stream.Write(bytes,0,bytes.Length);stream.Flush(true);
                }
                if(File.Exists(file))File.Replace(temporary,file,null);else File.Move(temporary,file);
            }finally{if(File.Exists(temporary))File.Delete(temporary);}
        }
    }
}

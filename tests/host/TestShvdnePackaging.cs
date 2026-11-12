using System;
using System.IO;
using System.Reflection;
using System.Web.Script.Serialization;
using RichAudio.Integration;
using RichAudio.Beacon.Transport;
using RichAudio.Beacon.Windows;

public static class TestShvdnePackaging
{
    static int checks;
    static void Need(bool condition,string name){if(!condition)throw new Exception(name);checks++;}
    static void Reject(Action action,string name){try{action();}catch(Exception){checks++;return;}throw new Exception("Accepted "+name);}
    public static int Main(string[] args)
    {
        try{
            string root=Path.Combine(args[0],"portable-"+Guid.NewGuid().ToString("N"));Directory.CreateDirectory(root);
            var defaults=new ShvdneConfiguration();defaults.Validate();
            Need(!defaults.Enabled&&!defaults.HostEnabled&&!defaults.AllowMemoryTelemetry&&!defaults.UseEnhancedNativeTelemetry&&!defaults.SoundMapEnabled&&!defaults.WorldWarmupEnabled,"disabled defaults");
            Need(!ShvdneConfiguration.Read(Path.Combine(root,"missing.json")).Enabled,"missing config disabled");
            defaults.SampleHz=21;Reject(defaults.Validate,"sample budget");defaults.SampleHz=20;
            defaults.MaximumVehicles=33;Reject(defaults.Validate,"fleet budget");defaults.MaximumVehicles=16;
            defaults.Schema=2;Reject(defaults.Validate,"unknown schema");defaults.Schema=1;
            defaults.AllowMemoryTelemetry=true;defaults.UseEnhancedNativeTelemetry=true;
            Reject(defaults.Validate,"conflicting operating-point providers");
            defaults.AllowMemoryTelemetry=false;defaults.Validate();Need(defaults.UseEnhancedNativeTelemetry,"explicit native provider accepted");
            defaults.UseEnhancedNativeTelemetry=false;
            File.WriteAllText(Path.Combine(root,"incomplete.json"),"{\"schema\":1}");
            Reject(delegate{ShvdneConfiguration.Read(Path.Combine(root,"incomplete.json"));},"incomplete configuration");
            Directory.CreateDirectory(Path.Combine(root,"payload"));
            File.WriteAllText(Path.Combine(root,"package.json"),"{\"schema\":1,\"manifestSha256\":null}");
            var links=ShvdnePackageLinks.Prepare(root,defaults);
            var json=new JavaScriptSerializer();dynamic menu=json.DeserializeObject(File.ReadAllText(links.MenuPath));
            Need((string)menu["workspaceRoot"]==Path.Combine(root,"payload"),"portable root resolved");
            Need(!File.Exists(links.PlayablePath),"no host pointer without admitted host");
            Need((bool)menu["soundMap"]["enabled"]==false,"viewer default disabled");
            string settings=Path.Combine(root,"payload",".local","acoustic-settings.json");
            Need(File.Exists(settings),"first-run preferences seeded");
            var initial=AcousticSettingsStore.Load(Path.Combine(root,"payload"),settings);
            Need(initial.IntegrationMode=="stock-fallback"&&initial.Revision==1,"first-run defaults retain native stock audio");
            var saved=new AcousticSettings("quality","cpu",2,false,.65,true,true,"stock-fallback",false,"F11");
            AcousticSettingsStore.SaveExpected(Path.Combine(root,"payload"),settings,saved,1);
            string savedBytes=File.ReadAllText(settings);
            ShvdnePackageLinks.Prepare(root,defaults);
            Need(File.ReadAllText(settings)==savedBytes,"existing preferences byte-preserved");
            string moved=root+"-moved",fixturePrefix=Path.GetFullPath(args[0]).TrimEnd(Path.DirectorySeparatorChar)+Path.DirectorySeparatorChar;
            Need(Path.GetFullPath(root).StartsWith(fixturePrefix,StringComparison.OrdinalIgnoreCase)&&Path.GetFullPath(moved).StartsWith(fixturePrefix,StringComparison.OrdinalIgnoreCase),"relocation bounded to fixture root");
            Directory.Move(root,moved);root=moved;
            links=ShvdnePackageLinks.Prepare(root,defaults);menu=json.DeserializeObject(File.ReadAllText(links.MenuPath));
            Need((string)menu["workspaceRoot"]==Path.Combine(root,"payload"),"relocation refreshes only generated links");
            settings=Path.Combine(root,"payload",".local","acoustic-settings.json");
            Need(File.ReadAllText(settings)==savedBytes,"relocation preserves existing preferences");
            defaults.HostEnabled=true;Reject(delegate{ShvdnePackageLinks.Prepare(root,defaults);},"missing manifest pin");
            string manifest=Path.Combine(root,"payload","playable.json");File.WriteAllText(manifest,"{\"authoredFixture\":true}");
            File.WriteAllText(Path.Combine(root,"package.json"),json.Serialize(new{schema=1,manifestSha256=PlayableConfiguration.Digest(manifest)}));
            links=ShvdnePackageLinks.Prepare(root,defaults);
            dynamic pointer=json.DeserializeObject(File.ReadAllText(links.PlayablePath));
            Need((string)pointer["manifestSha256"]==PlayableConfiguration.Digest(manifest),"host pointer bound");
            File.AppendAllText(manifest," ");Reject(delegate{ShvdnePackageLinks.Prepare(root,defaults);},"tampered manifest");
            defaults.HostEnabled=false;File.WriteAllText(settings,"malformed retained preference fixture");
            ShvdnePackageLinks.Prepare(root,defaults);
            Need(File.ReadAllText(settings)=="malformed retained preference fixture","malformed existing preferences preserved for explicit recovery");
            foreach(string assemblyPath in new[]{args[1],args[2]}){
                var assembly=Assembly.ReflectionOnlyLoadFrom(assemblyPath);bool api=false;
                foreach(var reference in assembly.GetReferencedAssemblies()){
                    Need(reference.Name.IndexOf("Rage",StringComparison.OrdinalIgnoreCase)<0&&reference.Name.IndexOf("Rph",StringComparison.OrdinalIgnoreCase)<0,"RPH-free metadata");
                    if(reference.Name=="ScriptHookVDotNet3"){api=true;Need(reference.Version.ToString()=="3.9.0.0","pinned API identity");}
                }
                Need(assemblyPath==args[1]?api:!api,"host/framework separation");
            }
            if(args.Length>3&&!String.IsNullOrEmpty(args[3])){
                var package=PlayableConfiguration.Load(Path.Combine(args[3],"scripts","RichAudio","payload","playable.json"));
                Need(package.Shvdne&&package.RphVersion==null&&package.DemoProfile==null,"actual private package has SHVDNE binding");
                Need(package.Bindings.Length>=8,"actual complete payload bindings");
                Console.WriteLine("Validated actual private payload: "+package.Bindings.Length+" bound files; exact game file read only");
            }
            Console.WriteLine("PASS "+checks+" configuration, portable package, manifest and actual assembly metadata checks; no game/API invoked");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

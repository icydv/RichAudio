using System;
using System.IO;
using System.Reflection;
public static class CompatibilityFixtureLoader
{
    public static int Main(string[] args)
    {
        try
        {
            // A byte-loaded harmless API has no Location. No injection into the
            // production checker is needed to verify absent diagnostic bytes.
            if(args[2]=="memory")
            {
                Assembly memoryApi=Assembly.Load(File.ReadAllBytes(args[0]));
                AppDomain.CurrentDomain.AssemblyResolve+=delegate(object sender,ResolveEventArgs resolve)
                {return new AssemblyName(resolve.Name).Name==memoryApi.GetName().Name?memoryApi:null;};
                // Keep the private fixture bytes, but remove the normal lookup
                // name so the harness binds to the byte-loaded test API.
                File.Move(args[0],args[0]+".retained");
            }
            var harness=Assembly.LoadFrom(args[1]);
            var run=harness.GetType("CompatibilityFixtureHarness",true).GetMethod("Run");
            Console.WriteLine((string)run.Invoke(null,new object[]{args[2]}));return 0;
        }
        catch(Exception error){Console.Error.WriteLine(error);return 1;}
    }
}

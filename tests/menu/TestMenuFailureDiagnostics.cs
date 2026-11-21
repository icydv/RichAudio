using System;
using System.Collections.Generic;
using System.IO;
using System.Runtime.CompilerServices;
using System.Text;
using System.Text.RegularExpressions;
using System.Web.Script.Serialization;
using RichAudio.Settings.InGame;

public static class TestMenuFailureDiagnostics
{
    private const string Secret="PRIVATE_EXCEPTION_C:\\Users\\PrivateFixture\\preferences.json_TOKEN_deadbeef";
    private static int checks;
    private static readonly List<object> observations=new List<object>();
    private static void Check(bool value,string why){checks++;if(!value)throw new Exception(why);}
    private sealed class HostileException:Exception
    {
        public override string Message{get{throw new InvalidOperationException("Message getter must never run");}}
        public override string StackTrace{get{throw new InvalidOperationException("StackTrace getter must never run");}}
        public override string ToString(){throw new InvalidOperationException("ToString must never run");}
    }
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static Exception CaptureSecret(){try{ThrowSecret();return null;}catch(Exception e){return e;}}
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void ThrowSecret(){throw new NullReferenceException(Secret);}
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Recurse(int left){if(left==0)ThrowSecret();else{Recurse(left-1);GC.KeepAlive(left);}}
    private static Exception CaptureDeep(){try{Recurse(48);return null;}catch(Exception e){return e;}}
    private static int Occurrences(string text,string part){int count=0,at=0;while((at=text.IndexOf(part,at,StringComparison.Ordinal))>=0){count++;at+=part.Length;}return count;}
    private static int FrameCount(string line){var match=Regex.Match(line,@"(?:^| )frames=(\d+)(?: |$)");Check(match.Success,"Frame count is not explicitly recorded");return Int32.Parse(match.Groups[1].Value,System.Globalization.CultureInfo.InvariantCulture);}
    private static void PrivateAndBounded(string line)
    {
        Check(line!=null&&line.Length<=MenuFailureDiagnostics.MaxCharacters,"Diagnostic line exceeds its hard output bound");
        Check(!line.Contains(Secret)&&!line.Contains("PRIVATE_EXCEPTION")&&!line.Contains("PrivateFixture")&&!line.Contains("TOKEN_deadbeef"),"Private exception content escaped");
        Check(!line.Contains("C:\\")&&!line.Contains("C:/")&&!line.Contains(":line "),"Private file or source-line data escaped");
        Check(!line.Contains("\r")&&!line.Contains("\n"),"Diagnostic line permits multiline log injection");
    }
    private static string Observe(string name,MenuOperationStage stage,long loop,MenuFailureObservation state,Exception error)
    {
        string line=MenuFailureDiagnostics.Format(stage,loop,state,error);PrivateAndBounded(line);observations.Add(new{name=name,line=line});return line;
    }
    public static int Main(string[] args)
    {
        try{
            if(args.Length!=1)throw new ArgumentException("Private fixture output required");
            var unknown=new MenuFailureObservation();
            string missing=Observe("unthrown-exception",MenuOperationStage.ReadLoading,1,unknown,new NullReferenceException(Secret));
            Check(missing.Contains("ReadLoading"),"Known operation stage was lost");
            Check(missing.Contains("loop=1"),"Run loop counter was lost");
            Check(missing.Contains("NullReferenceException"),"Original exception class was lost");
            Check(missing.Contains("frames=0")&&missing.Contains("stack=unavailable"),"Missing trace is not explicitly unavailable");
            foreach(string field in new[]{"prefs","loading","paused","console","story","controller","visible","captured"})
                Check(missing.Contains(field+"=unknown"),"An unobserved value was fabricated: "+field);
            var observed=new MenuFailureObservation{PreferencesAvailable=true,Loading=false,Paused=false,ConsoleOpen=false,Story=true,ControllerInput=false,MenuVisible=false,InputCaptured=false};
            Exception captured=CaptureSecret();
            string actual=Observe("captured-stack",MenuOperationStage.ReadMouseState,17,observed,captured);
            Check(actual.Contains("ReadMouseState")&&actual.Contains("loop=17"),"Captured stage or loop differs");
            Check(actual.Contains("ThrowSecret")&&actual.Contains("CaptureSecret"),"Actual exception-origin method stack was not retained");
            Check(actual.Contains("prefs=true")&&actual.Contains("loading=false")&&actual.Contains("story=true"),"Already-observed booleans were not retained");
            string absent=Observe("null-exception",MenuOperationStage.Yield,-1,unknown,null);
            Check(absent.Contains("loop=unavailable")&&absent.Contains("stack=unavailable"),"Absent exception/loop did not remain unavailable");
            string hostile=Observe("hostile-exception-accessors",MenuOperationStage.NetworkSession,2,unknown,new HostileException());
            Check(hostile.Contains("HostileException"),"Safe runtime exception type was not retained");
            string deep=Observe("bounded-deep-stack",MenuOperationStage.ToggleInputs,3,observed,CaptureDeep());
            Check(FrameCount(deep)<=MenuFailureDiagnostics.MaxFrames,"Reported total frame bound was exceeded");
            string deepStack=deep.Substring(deep.IndexOf("stack=",StringComparison.Ordinal)+6);
            Check(deepStack.Split('|').Length==FrameCount(deep),"Reported frame count differs from retained complete method tokens");
            Check(Occurrences(deep,"Recurse")<=MenuFailureDiagnostics.MaxFrames,"Stack-frame bound was exceeded");
            Check(Occurrences(deep,"Recurse")>0,"Deep actual stack was discarded entirely");
            string wide=Observe("bounded-long-metadata",MenuOperationStage.ReadMouseState,5,unknown,BoundaryType_TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT.Capture());
            Check(wide.Length>1800&&wide.Length<=MenuFailureDiagnostics.MaxCharacters,"Long actual metadata did not exercise the character boundary");
            Check(FrameCount(wide)<MenuFailureDiagnostics.MaxFrames,"Character bound was not reached before the frame bound");
            Check(!wide.EndsWith("|",StringComparison.Ordinal),"Bounded stack contains an incomplete trailing frame separator");
            string unknownStage=Observe("invalid-stage",(MenuOperationStage)Int32.MaxValue,Int64.MaxValue,unknown,captured);
            Check(!unknownStage.Contains("2147483647"),"Unrecognized stage value was emitted instead of a safe unavailable label");
            Check(unknownStage.Contains("loop="+Int64.MaxValue.ToString(System.Globalization.CultureInfo.InvariantCulture)),"Valid long loop identity was changed");
            foreach(MenuOperationStage stage in Enum.GetValues(typeof(MenuOperationStage))){string line=Observe("stage-"+stage,stage,4,unknown,captured);Check(line.Contains(stage.ToString()),"Declared operation stage was not identifiable");}
            string root=Path.GetFullPath(args[0]);string output=Path.Combine(root,"formatter-result.json");
            var result=new{kind="MenuFailureFormatterFixture",checks=checks,passed=true,observations=observations.ToArray(),maxCharacters=MenuFailureDiagnostics.MaxCharacters,maxFrames=MenuFailureDiagnostics.MaxFrames,
                scope="Actual SDK-free formatter from adapter source; no RPH, file settings, audio, endpoint or visible window",targetRuntimeProof=false};
            using(var file=new FileStream(output,FileMode.CreateNew,FileAccess.Write,FileShare.None))using(var writer=new StreamWriter(file,new UTF8Encoding(false)))writer.Write(new JavaScriptSerializer().Serialize(result));
            Console.WriteLine("PASS: "+checks+" actual diagnostic formatter checks; no RPH or device");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

// Valid, long runtime metadata makes the real formatter reach its character
// budget before its frame budget; no synthetic replacement formatter is used.
internal static class BoundaryType_TTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTTT
{
    internal static Exception Capture(){try{Recursive_MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM(40);return null;}catch(Exception e){return e;}}
    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void Recursive_MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM(int left)
    {if(left==0)throw new NullReferenceException("PRIVATE_EXCEPTION_C:\\Users\\PrivateFixture\\preferences.json_TOKEN_deadbeef");Recursive_MMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMMM(left-1);GC.KeepAlive(left);}
}

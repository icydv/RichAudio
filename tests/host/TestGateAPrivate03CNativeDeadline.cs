using System;
using System.Reflection;
using RichAudio.GateA.Private03;

internal static class TestGateAPrivate03CNativeDeadline
{
    static int assignments;
    static long now;
    static bool cross;
    static object Native(ulong value,object[] args)
    {
        if(value==0x4F0C413926060B38UL){assignments++;return null;}
        switch((GTA.Native.Hash)value) {
            case GTA.Native.Hash.PLAYER_ID:return 1;
            case GTA.Native.Hash.PLAYER_PED_ID:return 10;
            case GTA.Native.Hash.GET_ENTITY_MODEL:return 0xF9300CC5u;
            case GTA.Native.Hash.DECOR_GET_INT:return 77;
            case GTA.Native.Hash.GET_ENTITY_SPEED:return 0f;
            case GTA.Native.Hash.GET_PED_IN_VEHICLE_SEAT:return 0;
            case GTA.Native.Hash.IS_VEHICLE_DRIVEABLE:if(cross)now=100000;return true;
            case GTA.Native.Hash.DOES_ENTITY_EXIST:
            case GTA.Native.Hash.IS_PLAYER_PLAYING:
            case GTA.Native.Hash.DOES_ENTITY_BELONG_TO_THIS_SCRIPT:
            case GTA.Native.Hash.DECOR_EXIST_ON:return true;
            default:return false;
        }
    }
    static ShvdneProfileApi Api(Func<bool> phase)
    {
        var constructors=typeof(ShvdneProfileApi).GetConstructors(BindingFlags.Instance|BindingFlags.NonPublic);
        foreach(var constructor in constructors) {
            if(constructor.GetParameters().Length==2)return (ShvdneProfileApi)constructor.Invoke(new object[]{new Func<bool>(delegate{return true;}),phase});
        }
        return (ShvdneProfileApi)constructors[0].Invoke(new object[]{new Func<bool>(delegate{return true;})});
    }
    static bool Invoke(ShvdneProfileApi api)
    {
        try{api.AssignPrivateProfile(new ProbeLifetime{Handle=123,Token=77,Role="A"});return true;}
        catch(InvalidOperationException){return false;}
    }
    public static int Main(string[] args)
    {
        try {
            bool old=args.Length==1&&args[0]=="demonstrate-old";
            GTA.Native.Function.Handler=Native;now=99999;cross=true;assignments=0;
            bool returned=Invoke(Api(delegate{return now<100000;}));
            if(old){if(!returned||assignments!=1||now!=100000)throw new Exception("Old native edge not reproduced");Console.WriteLine("DEMONSTRATED build01 actualAPI finalcontextchecks cross100s and setter stilldispatches because no final phase guard");return 0;}
            if(returned||assignments!=0||now!=100000)throw new Exception("Final phase deadline not enforced after native contextchecks");
            Console.WriteLine("PASS actualAPI finalcontext crossing100seconds refuses setter");
            now=99999;cross=false;assignments=0;returned=Invoke(Api(delegate{return now<100000;}));
            if(!returned||assignments!=1)throw new Exception("Beforedeadline valid A assignment refused");
            Console.WriteLine("PASS actualAPI predeadline Aonly setter remains available");
            now=99999;cross=false;assignments=0;returned=Invoke(Api(delegate{return false;}));
            if(returned||assignments!=0)throw new Exception("False final phase guard accepted");
            Console.WriteLine("PASS actualAPI explicit final phase revocation refuses setter");
            Console.WriteLine("PASS actualAPI native deadline cases=3");return 0;
        }catch(Exception e){Console.Error.WriteLine(e);return 1;}
    }
}

using System;
using System.IO;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;

namespace RichAudio.Integration
{
    [DataContract]
    public sealed class ShvdneConfiguration
    {
        [DataMember(Name="schema",IsRequired=true)] public int Schema=1;
        [DataMember(Name="enabled",IsRequired=true)] public bool Enabled;
        [DataMember(Name="allowMemoryTelemetry",IsRequired=true)] public bool AllowMemoryTelemetry;
        [DataMember(Name="useEnhancedNativeTelemetry",EmitDefaultValue=false)] public bool UseEnhancedNativeTelemetry;
        [DataMember(Name="hostEnabled",IsRequired=true)] public bool HostEnabled;
        [DataMember(Name="menuEnabled",IsRequired=true)] public bool MenuEnabled=true;
        [DataMember(Name="soundMapEnabled",IsRequired=true)] public bool SoundMapEnabled;
        [DataMember(Name="worldWarmupEnabled",IsRequired=true)] public bool WorldWarmupEnabled;
        [DataMember(Name="sampleHz",IsRequired=true)] public int SampleHz=20;
        [DataMember(Name="maximumVehicles",IsRequired=true)] public int MaximumVehicles=16;
        [DataMember(Name="transportValidationOnly",EmitDefaultValue=false)] public bool TransportValidationOnly;
        [DataMember(Name="startupTiming02B",EmitDefaultValue=false)] public bool StartupTiming02B;
        public void Validate()
        {
            if(Schema!=1||SampleHz<1||SampleHz>20||MaximumVehicles<1||MaximumVehicles>32)
                throw new InvalidDataException("Unsupported integration configuration");
            if(StartupTiming02B&&!TransportValidationOnly)throw new InvalidDataException("Startup diagnostics require disarmed transport-only configuration");
            if(TransportValidationOnly&&(!HostEnabled||AllowMemoryTelemetry||UseEnhancedNativeTelemetry||MenuEnabled||SoundMapEnabled||WorldWarmupEnabled))throw new InvalidDataException("Transport validation excludes mechanical providers and auxiliary output");
            if(AllowMemoryTelemetry&&UseEnhancedNativeTelemetry)
                throw new InvalidDataException("Select one operating-point provider; automatic fallback is not supported");
            // These switches configure the independent observation/host paths;
            // no profile setter, suppression or probe switch exists here.
        }
        public static ShvdneConfiguration Read(string path)
        {
            if(!File.Exists(path))return new ShvdneConfiguration();
            var info=new FileInfo(path);if(info.Length>4096)throw new InvalidDataException("Bounded integration configuration required");
            using(var stream=File.OpenRead(path)){
                var value=(ShvdneConfiguration)new DataContractJsonSerializer(typeof(ShvdneConfiguration)).ReadObject(stream);
                if(value==null)throw new InvalidDataException("Missing integration configuration");value.Validate();return value;
            }
        }
    }
}

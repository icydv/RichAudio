#requires -Version 7.0
# Built-in .NET PE metadata reader. No assembly loading or code execution.
[CmdletBinding()]
param()
$ErrorActionPreference='Stop'
$repo=Split-Path -Parent $PSScriptRoot
$stage=Join-Path $repo '.local\rph\runtime-9695-1158.16'
$report=Join-Path $repo 'evidence\phase2.1\pe-dependencies.json'
# Verify the entire stage against the pinned official archive before inspecting it.
& (Join-Path $PSScriptRoot 'Inspect-RuntimePackage.ps1') | Out-Null
function InspectPe([string]$Path){
    $stream=[IO.File]::OpenRead($Path)
    $pe=[Reflection.PortableExecutable.PEReader]::new($stream)
    try {
        function U32([byte[]]$Bytes,[int]$Offset){return [BitConverter]::ToUInt32($Bytes,$Offset)}
        function Content([int]$Rva){return ,([byte[]]$pe.GetSectionData($Rva).GetContent())}
        function ImportName([int]$Rva){
            $bytes=Content $Rva;$limit=[Math]::Min(512,$bytes.Length);$n=0
            while($n -lt $limit -and $bytes[$n] -ne 0){$n++}
            if($n -eq $limit){throw 'Unterminated import name'}
            return [Text.Encoding]::ASCII.GetString($bytes,0,$n)
        }
        $native=@();$delay=@();$refs=@();$pinvoke=@();$metadataError=$null;$identity=$null
        $hdr=$pe.PEHeaders.PEHeader
        if($hdr.ImportTableDirectory.RelativeVirtualAddress){
            $bytes=Content $hdr.ImportTableDirectory.RelativeVirtualAddress
            for($offset=0;$offset+20 -le [Math]::Min($bytes.Length,$hdr.ImportTableDirectory.Size);$offset+=20){
                $rva=U32 $bytes ($offset+12);if(!$rva){break};$native+=ImportName $rva
            }
        }
        if($hdr.DelayImportTableDirectory.RelativeVirtualAddress){
            $bytes=Content $hdr.DelayImportTableDirectory.RelativeVirtualAddress
            for($offset=0;$offset+32 -le [Math]::Min($bytes.Length,$hdr.DelayImportTableDirectory.Size);$offset+=32){
                $rva=U32 $bytes ($offset+4);if(!$rva){break}
                if(((U32 $bytes $offset) -band 1) -ne 1){throw 'VA-based delay imports need separate review'}
                $delay+=ImportName $rva
            }
        }
        if($pe.HasMetadata){
            try {
                $md=[Reflection.Metadata.PEReaderExtensions]::GetMetadataReader($pe)
                $a=$md.GetAssemblyDefinition();$identity=$md.GetString($a.Name)+', Version='+$a.Version
                foreach($h in $md.AssemblyReferences){$a=$md.GetAssemblyReference($h);$refs+=($md.GetString($a.Name)+', Version='+$a.Version)}
                foreach($h in $md.MethodDefinitions){
                    $m=$md.GetMethodDefinition($h)
                    if($m.Attributes -band [Reflection.MethodAttributes]::PinvokeImpl){
                        $i=$m.GetImport()
                        if(!$i.Module.IsNil){$module=$md.GetModuleReference($i.Module);if(!$module.Name.IsNil){$pinvoke+=$md.GetString($module.Name)}}
                    }
                }
            }catch{$metadataError=$_.Exception.Message}
        }
        return [pscustomobject]@{
            Path=$Path;SHA256=(Get-FileHash -LiteralPath $Path).Hash;Machine=[string]$pe.PEHeaders.CoffHeader.Machine
            PEKind=[string]$hdr.Magic;HasClrMetadata=$pe.HasMetadata;AssemblyIdentity=$identity;MetadataError=$metadataError
            NativeImports=$native;DelayImports=$delay;ManagedReferences=$refs;PInvokeLibraries=@($pinvoke | Sort-Object -Unique)
        }
    }finally{$pe.Dispose();$stream.Dispose()}
}
$files=@(Get-ChildItem -LiteralPath $stage -File | Where-Object Extension -in '.dll','.exe')
$files+=Get-Item (Join-Path $repo 'build\telemetry\RichAudio.Telemetry.Rph.dll')
$files+=Get-Item (Join-Path $repo '.local\rph\sdk\RagePluginHookSDK.dll')
$files+=Get-Item '__USER_HOME__\Downloads\6d0158-OpenRPF\OpenRPF.asi'
$rows=@($files | ForEach-Object {InspectPe $_.FullName})
[ordered]@{SchemaVersion=1;InspectedUtc=[DateTime]::UtcNow.ToString('o');Files=$rows
    Scope='PE headers, import tables and CLR dependency metadata only. No IL/body inspection, unpacking, patching or dependency execution.'
    Limitation='Static imports do not reveal every dynamically loaded component. The runtime CLR metadata is not readable by the standard reader; runtime API binding remains a smoke-test gate.'
} | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath $report -Encoding utf8
$names=@($rows.NativeImports)+@($rows.DelayImports)+@($rows.PInvokeLibraries)
@($names | Where-Object {$_ -and $_ -notmatch '^(api-ms-|ext-ms-|[<])'} | Sort-Object -Unique | ForEach-Object {
    $name=if([IO.Path]::GetExtension($_)){$_}else{$_+'.dll'}
    [pscustomobject]@{Name=$_;ResolvedName=$name;InPackage=(Test-Path -LiteralPath (Join-Path $stage $name));System32Present=(Test-Path -LiteralPath (Join-Path "$env:WINDIR\System32" $name));ClrDirectoryPresent=(Test-Path -LiteralPath (Join-Path "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319" $name))}
}) | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $repo 'evidence\phase2.1\native-dependency-presence.json') -Encoding utf8
$hostEvidence=[ordered]@{ObservedUtc=[DateTime]::UtcNow.ToString('o')}
$hostEvidence.RuntimeFrameworkRelease=(Get-ItemProperty 'HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full' -Name Release).Release
$hostEvidence.Drive=@(Get-Partition -DriveLetter D | Get-Disk | Select-Object Number,FriendlyName,BusType)
$hostEvidence.Vc2010Registry=@(foreach($key in @('HKLM:\SOFTWARE\Microsoft\VisualStudio\10.0\VC\VCRedist\x64','HKLM:\SOFTWARE\WOW6432Node\Microsoft\VisualStudio\10.0\VC\VCRedist\x64')){if(Test-Path -LiteralPath $key){Get-ItemProperty -LiteralPath $key | Select-Object Installed,Version}})
$hostEvidence.Vc100SxS=@(Get-ChildItem -LiteralPath "$env:WINDIR\WinSxS" -Directory -Filter 'amd64_microsoft.vc100.crt*' | Select-Object -ExpandProperty Name)
$hostEvidence.ClrFusionPresent=Test-Path -LiteralPath "$env:WINDIR\Microsoft.NET\Framework64\v4.0.30319\fusion.dll"
$hostEvidence.PluginsDirectoryExists=Test-Path -LiteralPath '__GAME_ROOT__\Plugins'
$hostEvidence | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $repo 'evidence\phase2.1\host-prerequisites.json') -Encoding utf8
$rows | Select-Object @{n='File';e={Split-Path $_.Path -Leaf}},AssemblyIdentity,MetadataError

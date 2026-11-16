param([Parameter(Mandatory)][string]$OutputDirectory)
$ErrorActionPreference='Stop';$repo=[IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../../..'));$out=[IO.Path]::GetFullPath($OutputDirectory)
if(!$out.StartsWith((Join-Path $repo '.local')+'\',[StringComparison]::OrdinalIgnoreCase)-or(Test-Path $out)){throw 'Fresh private output required'}
New-Item -ItemType Directory $out|Out-Null
# Execute the preserved pre-fix runner/controller. Only its old authored API
# fixture is extended to model a physically unsettled vehicle after seating.
# This is not evidence that motion caused the historical GTA failure.
$original=Join-Path $repo 'tests/host/TestAutomaticNative08.cs';$text=[IO.File]::ReadAllText($original)
$text=$text.Replace('public bool Ready=true,','public bool Motion,Ready=true,')
$text=$text.Replace('public void SeatA(Lifetime a){Seats++;if(!SeatFails)Seated=true;}','public void SeatA(Lifetime a){Seats++;if(!SeatFails)Seated=true;Motion=true;}')
$text=$text.Replace('public void StartA(Lifetime a){AStarts++;AEngine=true;}','public void StartA(Lifetime a){if(Motion)throw new InvalidOperationException("bounded setup-only A start");AStarts++;AEngine=true;}')
$text=$text.Replace('public void LeaveA(Lifetime a){Seated=false;AEngine=false;}','public void LeaveA(Lifetime a){if(Motion)throw new InvalidOperationException("bounded stationary A dismount");Seated=false;AEngine=false;}')
$begin=$text.IndexOf('    public static int Main()');if($begin-lt0){throw 'Preserved fixture layout changed'}
$text=$text.Substring(0,$begin)+@'
    public static int Main(){try{
      Test("old immediate engine guard and cleanup guard both fail for authored post-seat motion",()=>{var f=new Fixture();f.Begin();f.Finish(false);Check(f.Api.Seats==1&&f.Api.AStarts==0&&f.Api.Profiles.Count==0&&!f.Run.State.Retired,"old runner prematurely starts then cannot retire");Check(f.Journal.Lines.Any(s=>s.Contains("bounded setup-only A start"))&&f.Journal.Lines.Any(s=>s.Contains("bounded stationary A dismount")),"both old guards reproduced");System.IO.File.WriteAllLines(System.IO.Path.Combine(AppDomain.CurrentDomain.BaseDirectory,"authored-old-journal.txt"),f.Journal.Lines);});
      Console.WriteLine("PASS authored old compiled runner regression; historical failing predicate remains unknown; not native adapter qualification");return 0;
    }catch(Exception e){Console.Error.WriteLine(e);return 1;}}
}
'@
$generated=Join-Path $out 'AuthoredOldRegression.cs';[IO.File]::WriteAllText($generated,$text)
$sources=@('IdleExperiment.cs','AutomaticRun.cs')|ForEach-Object{Join-Path $repo ('tools/native-control/native-suppression08/'+$_)}
$exe=Join-Path $out 'OldRegression.exe';$csc='C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
& $csc /nologo /target:exe /langversion:5 /optimize+ /warnaserror+ /nowarn:0649 /r:System.Core.dll ('/out:'+$exe) @sources $generated
if($LASTEXITCODE){throw 'Preserved runner regression compile failed'}
$result=& $exe 2>&1;$code=$LASTEXITCODE;$result|Set-Content (Join-Path $out 'result.txt');$result|Write-Output
$pins=@($sources)+@($original,$generated,$exe,$PSCommandPath)|ForEach-Object{@{path=$_;sha256=(Get-FileHash $_).Hash.ToLowerInvariant()}}
@{passed=($code-eq0);schema='NativeSuppression11OldAuthoredRegression';historicalCauseEstablished=$false;actualAdapterQualification=$false;artifacts=$pins;gameLaunched=$false}|ConvertTo-Json -Depth 5|Set-Content (Join-Path $out 'result.json')
if($code){throw 'Preserved runner regression failed'}

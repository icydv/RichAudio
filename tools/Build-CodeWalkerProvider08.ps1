#requires -Version 7.0
# Builds the actual pinned Core reader and RichAudio worker. No installed files,
# key/bootstrap payloads, resx files, GUI or proprietary resource is acquired.
[CmdletBinding()]
param(
 [Parameter(Mandatory)][string]$OutputRoot,
 [string]$PublicPreparationRoot,
 [string]$CompilerPath,
 [switch]$CoreOnly
)
$ErrorActionPreference='Stop'
$repo=Split-Path $PSScriptRoot -Parent
$commit='485d56bec00262ed7fa472261cce7bbc6202b96e'
function Hash([string]$p){(Get-FileHash -LiteralPath $p -Algorithm SHA256).Hash.ToLowerInvariant()}
function CheckPath([string]$p,[bool]$fresh=$false){
 $p=[IO.Path]::GetFullPath($p)
 $ok=@((Join-Path $repo '.local'),(Join-Path $repo 'build'))|Where-Object{$p.StartsWith([IO.Path]::GetFullPath($_)+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)}
 if(!$ok){throw 'Build output must be inside this checkout build/ or .local/'}
 for($at=$p;$at;$at=[IO.Path]::GetDirectoryName($at)){if((Test-Path -LiteralPath $at)-and((Get-Item -LiteralPath $at -Force).Attributes-band[IO.FileAttributes]::ReparsePoint)){throw 'Linked build path refused'}}
 if($fresh-and(Test-Path -LiteralPath $p)){throw 'Fresh build output required; existing evidence is never replaced'}
 $p
}
function WriteNew([string]$p,[string]$value){$s=[IO.File]::Open($p,[IO.FileMode]::CreateNew,[IO.FileAccess]::Write,[IO.FileShare]::None);try{$b=[Text.UTF8Encoding]::new($false).GetBytes($value);$s.Write($b,0,$b.Length)}finally{$s.Dispose()}}
function ReplaceOnce([string]$text,[string]$old,[string]$new){if($text.Split(@($old),[StringSplitOptions]::None).Length-ne2){throw 'Pinned source adaptation anchor changed'};$text.Replace($old,$new)}
$output=CheckPath $OutputRoot $true
if(!$PublicPreparationRoot){
 $PublicPreparationRoot=Join-Path $repo ('.local/world-03/world08-public-'+[guid]::NewGuid().ToString('N'))
 & (Join-Path $repo 'tools/Prepare-CodeWalkerPublicProfile03.ps1') -OutputRoot $PublicPreparationRoot -CompilerPath $CompilerPath
 if(!$?){throw 'Pinned public source preparation failed'}
}
$prep=CheckPath $PublicPreparationRoot
if(!$prep.StartsWith([IO.Path]::GetFullPath((Join-Path $repo '.local/world-03'))+[IO.Path]::DirectorySeparatorChar,[StringComparison]::OrdinalIgnoreCase)){throw 'Only an explicit public world-03 preparation in this checkout is accepted'}
$source=Join-Path $prep 'source';$dependencies=Join-Path $prep 'dependencies'
$preparation=Get-Content -LiteralPath (Join-Path $prep 'preparation.json') -Raw|ConvertFrom-Json
if(!$preparation.passed-or$preparation.sourceCommit-cne$commit-or$preparation.sourcePolicy-cne'partial-clone-public-csharp-and-notices-only-no-embedded-key-data'){throw 'Bound public-source preparation required'}
if((git -C $source rev-parse HEAD)-cne$commit-or$LASTEXITCODE-ne0-or!([string]::IsNullOrWhiteSpace((git -C $source status --porcelain|Out-String)))){throw 'Exact unchanged pinned public source required'}
$refs=@(
 @{file='SharpDX.dll';sha256='a0af255ea4b09a8cdb995b8c6fd1075e46f098e23c2351c974e6ded9b8b620cf';archive='sharpdx.4.2.0.nupkg';archiveSHA256='117126040200faaa118f1312ad5a5b1e7d067c90abf6e726f18b6d1635216fc3'},
 @{file='SharpDX.Mathematics.dll';sha256='4c9615496970ea84320e2a6e99f8fb828e3c7790384df5585d93fc368885d94e';archive='sharpdx.mathematics.4.2.0.nupkg';archiveSHA256='cb107f2b73c7982a31a7f9dd2e74c1c262f7b79e8b40344053a22f2ad8f1d594'}
)
foreach($d in $refs){if((Hash (Join-Path $dependencies $d.file))-cne$d.sha256-or(Hash (Join-Path $dependencies $d.archive))-cne$d.archiveSHA256){throw 'Pinned public dependency archive/library changed'}}
if(!$CompilerPath){$vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe';if(!(Test-Path -LiteralPath $vswhere)){throw 'Existing Roslyn compiler required; this build installs no tools'};$CompilerPath=(& $vswhere -latest -products '*' -find 'MSBuild\**\Roslyn\csc.exe'|Select-Object -First 1)}
if(!$CompilerPath-or!(Test-Path -LiteralPath $CompilerPath)){throw 'Existing Roslyn compiler unavailable'}
$compilerSHA256=Hash $CompilerPath
$files=@(Get-ChildItem -LiteralPath (Join-Path $source 'CodeWalker.Core') -Recurse -File -Filter '*.cs'|Sort-Object FullName)
if($files.Count-ne114){throw 'Full pinned Core C# closure changed'}
[IO.Directory]::CreateDirectory($output)|Out-Null
$adapted=Join-Path $output 'adapted-source';$core=Join-Path $output 'core';[IO.Directory]::CreateDirectory($adapted)|Out-Null;[IO.Directory]::CreateDirectory($core)|Out-Null
$pins=@();$adaptations=@();$compile=@()
foreach($f in $files){
 $relative=[IO.Path]::GetRelativePath($source,$f.FullName).Replace('\','/');$originalSHA256=Hash $f.FullName
 $text=[IO.File]::ReadAllText($f.FullName).Replace("`r`n","`n")
 if($relative-ceq'CodeWalker.Core/GameFiles/Utils/GTAKeys.cs'){
  $text=ReplaceOnce $text '            UseMagicData(path, gen9, key);' '            throw new NotSupportedException("RichAudio-CodeWalker-protected-bootstrap-unavailable: no proprietary bootstrap data is included; no executable or key path was opened.");'
  # Adapt CodeWalker by dexyfex's UseMagicData to explicitly supplied memory.
  # No embedded payload, executable search or filesystem fallback is enabled.
  $text=ReplaceOnce $text '        private static void UseMagicData(string path, bool gen9, string key)' @'
        public static void InitializeFromRichAudio09(byte[] magic, byte[] aes)
        {
            if (magic == null || magic.Length < 16 || magic.Length > 1048576 || aes == null || aes.Length != 32)
                throw new ArgumentException("bounded explicit CodeWalker bootstrap inputs required");
            byte[][] random = new byte[4][]; byte[] decoded = null, payload = null, encrypted = null;
            try
            {
                Random rnd = new Random(unchecked((int)JenkHash.GenHash(aes)));
                for (int r = 0; r < 4; r++) { random[r] = new byte[magic.Length]; rnd.NextBytes(random[r]); }
                encrypted = new byte[magic.Length];
                for (int i = 0; i < magic.Length; i++)
                    encrypted[i] = unchecked((byte)(magic[i] - random[0][i] - random[1][i] - random[2][i] - random[3][i]));
                decoded = GTACrypto.DecryptAESData(encrypted, aes);
                payload = new byte[306272];
                using (var input = new MemoryStream(decoded, false))
                using (var inflater = new DeflateStream(input, CompressionMode.Decompress))
                {
                    int at = 0, n;
                    while (at < payload.Length && (n = inflater.Read(payload, at, payload.Length - at)) > 0) at += n;
                    if (at != payload.Length || inflater.ReadByte() != -1)
                        throw new InvalidDataException("CodeWalker bootstrap must decode exactly 306272 bytes");
                }
                byte[] schedules = new byte[27472], tables = new byte[278528], lut = new byte[256];
                uint[] awc = new uint[4];
                try
                {
                    Buffer.BlockCopy(payload, 0, schedules, 0, schedules.Length);
                    Buffer.BlockCopy(payload, 27472, tables, 0, tables.Length);
                    Buffer.BlockCopy(payload, 306000, lut, 0, lut.Length);
                    Buffer.BlockCopy(payload, 306256, awc, 0, 16);
                    var keys = CryptoIO.ReadNgKeys(schedules); var decryptTables = CryptoIO.ReadNgTables(tables);
                    PC_AES_KEY = (byte[])aes.Clone(); PC_NG_KEYS = keys; PC_NG_DECRYPT_TABLES = decryptTables;
                    PC_LUT = lut; PC_AWC_KEY = awc; GTA5Hash.LUT = lut;
                }
                finally { Array.Clear(schedules, 0, schedules.Length); Array.Clear(tables, 0, tables.Length); }
            }
            finally
            {
                foreach (var bytes in random) if (bytes != null) Array.Clear(bytes, 0, bytes.Length);
                foreach (var bytes in new[] { decoded, payload, encrypted }) if (bytes != null) Array.Clear(bytes, 0, bytes.Length);
            }
        }

        private static void UseMagicData(string path, bool gen9, string key)
'@
 }
 elseif($relative-ceq'CodeWalker.Core/Properties/Resources.Designer.cs'){
  $text=ReplaceOnce $text "                object obj = ResourceManager.GetObject(`"magic`", resourceCulture);`n                return ((byte[])(obj));" '                throw new NotSupportedException("RichAudio-CodeWalker-protected-bootstrap-unavailable: proprietary embedded data is excluded.");'
 }
 elseif($relative-ceq'CodeWalker.Core/GameFiles/RpfFile.cs'){
  $text=ReplaceOnce $text '        private void ReadHeader(BinaryReader br)' @'
        // RichAudio08: memory-only entrypoint. Original Core entry decoding follows.
        public void ReadHeaderForRichAudio08(BinaryReader br) { ReadHeader(br); }
        private void ReadHeader(BinaryReader br)
'@
  $text=ReplaceOnce $text '            byte[] entriesdata = br.ReadBytes((int)EntryCount * 16); //4x uints each' @'
            if (!br.BaseStream.CanSeek || EntryCount == 0 || EntryCount > 65536 || NamesLength == 0 || NamesLength > 4194304)
                throw new InvalidDataException("RichAudio08 bounded RPF table counts");
            long remaining = br.BaseStream.Length - br.BaseStream.Position;
            if ((long)EntryCount * 16 + NamesLength > remaining)
                throw new InvalidDataException("RichAudio08 truncated RPF tables");
            if (Encryption != RpfEncryption.NONE && Encryption != RpfEncryption.OPEN && Encryption != RpfEncryption.AES && Encryption != RpfEncryption.NG)
                throw new InvalidDataException("RichAudio08 unknown RPF encryption");
            byte[] entriesdata = br.ReadBytes((int)EntryCount * 16); //4x uints each
'@
  $text=ReplaceOnce $text '            byte[] namesdata = br.ReadBytes((int)NamesLength);' @'
            byte[] namesdata = br.ReadBytes((int)NamesLength);
            if (entriesdata.Length != (int)EntryCount * 16 || namesdata.Length != (int)NamesLength)
                throw new InvalidDataException("RichAudio08 short table read");
'@
  $text=ReplaceOnce $text '                namesrdr.Position = e.NameOffset;' @'
                if (e.NameOffset >= NamesLength) throw new InvalidDataException("RichAudio08 name offset");
                int nameEnd = (int)e.NameOffset;
                while (nameEnd < namesdata.Length && nameEnd - (int)e.NameOffset <= 256 && namesdata[nameEnd] != 0) nameEnd++;
                if (nameEnd >= namesdata.Length || nameEnd - (int)e.NameOffset > 256 || namesdata[nameEnd] != 0)
                    throw new InvalidDataException("RichAudio08 unterminated or long name");
                namesrdr.Position = e.NameOffset;
'@
  $text=ReplaceOnce $text '            Root = (RpfDirectoryEntry)AllEntries[0];' @'
            if (!(AllEntries[0] is RpfDirectoryEntry)) throw new InvalidDataException("RichAudio08 root directory required");
            Root = (RpfDirectoryEntry)AllEntries[0];
            var richAudioSeen08 = new HashSet<RpfEntry>(); richAudioSeen08.Add(Root);
'@
  $text=ReplaceOnce $text '                int starti = (int)item.EntriesIndex;' @'
                ulong richAudioEnd08 = (ulong)item.EntriesIndex + item.EntriesCount;
                if (richAudioEnd08 > EntryCount) throw new InvalidDataException("RichAudio08 directory span");
                int richAudioDepth08 = 0; for (RpfEntry at08 = item; at08 != null; at08 = at08.Parent)
                    if (++richAudioDepth08 > 64) throw new InvalidDataException("RichAudio08 directory depth");
                int starti = (int)item.EntriesIndex;
'@
  $text=ReplaceOnce $text '                    RpfEntry e = AllEntries[i];' @'
                    RpfEntry e = AllEntries[i];
                    if (!richAudioSeen08.Add(e)) throw new InvalidDataException("RichAudio08 cyclic or multiply owned directory entry");
                    if (item.Path.Length + e.NameLower.Length + 1 > 4096) throw new InvalidDataException("RichAudio08 path bound");
'@
  $text=ReplaceOnce $text '            br.BaseStream.Position = StartPos;' @'
            if (richAudioSeen08.Count != AllEntries.Count) throw new InvalidDataException("RichAudio08 orphaned RPF entry");
            br.BaseStream.Position = StartPos;
'@
 }
 $dest=Join-Path $adapted $relative;[IO.Directory]::CreateDirectory([IO.Path]::GetDirectoryName($dest))|Out-Null;WriteNew $dest $text
 $adaptedSHA256=Hash $dest;$pins+=@{file=$relative;upstreamSHA256=$originalSHA256;compiledSHA256=$adaptedSHA256};$compile+=$dest
 if($relative-in@('CodeWalker.Core/GameFiles/Utils/GTAKeys.cs','CodeWalker.Core/Properties/Resources.Designer.cs','CodeWalker.Core/GameFiles/RpfFile.cs')){$adaptations+=@{file=$relative;upstreamSHA256=$originalSHA256;adaptedSHA256=$adaptedSHA256}}
}
$dll=Join-Path $core 'CodeWalker.Core.dll';$rsp=Join-Path $output 'core-compile.rsp'
$options=@('/nologo','/target:library','/optimize+','/langversion:latest','/unsafe+','/deterministic+','/debug-',('/out:"'+$dll+'"'),('/pathmap:"'+$adapted+'=CodeWalker-RichAudio08"'),'/r:System.Runtime.Serialization.dll','/r:System.Xml.Linq.dll','/r:System.Drawing.dll')+@($refs|ForEach-Object{'/r:"'+(Join-Path $dependencies $_.file)+'"'})+@($compile|ForEach-Object{'"'+$_+'"'})
WriteNew $rsp ($options-join"`n");& $CompilerPath ('@'+$rsp) *> (Join-Path $output 'core-compile.log');if($LASTEXITCODE-ne0){throw 'Adapted full Core compilation failed; retained output'}
foreach($d in $refs){Copy-Item -LiteralPath (Join-Path $dependencies $d.file) -Destination (Join-Path $core $d.file)}
$workerSources=@('src/acoustics/world/CodeWalkerHeadlessProvider08.cs','src/acoustics/world/CodeWalkerResourceBoundary03.cs','src/acoustics/world/CodeWalkerStaticResourceAdapter02.cs','src/acoustics/world/CodeWalkerCollisionAdapter.cs')
$workerPins=@();$workerSHA256=$null
if(!$CoreOnly){
 foreach($p in $workerSources){if(!(Test-Path -LiteralPath (Join-Path $repo $p))){throw 'Worker source closure missing'};$workerPins+=@{file=$p;sha256=Hash (Join-Path $repo $p)}}
 $worker=Join-Path $core 'provider-worker08.exe';$workerRsp=Join-Path $output 'worker-compile.rsp'
 $workerOptions=@('/nologo','/target:exe','/optimize+','/langversion:latest','/unsafe+','/deterministic+','/debug-',('/out:"'+$worker+'"'),('/pathmap:"'+$repo+'=RichAudio"'),'/r:System.Web.Extensions.dll','/r:System.IO.Compression.dll','/r:System.Xml.dll','/r:System.Runtime.Serialization.dll','/r:System.Drawing.dll')+@('CodeWalker.Core.dll','SharpDX.dll','SharpDX.Mathematics.dll'|ForEach-Object{'/r:"'+(Join-Path $core $_)+'"'})+@($workerSources|ForEach-Object{'"'+(Join-Path $repo $_)+'"'})
 WriteNew $workerRsp ($workerOptions-join"`n");& $CompilerPath ('@'+$workerRsp) *> (Join-Path $output 'worker-compile.log');if($LASTEXITCODE-ne0){throw 'Headless worker compilation failed; retained output'};$workerSHA256=Hash $worker
}
foreach($p in $pins){if((Hash (Join-Path $source $p.file))-cne$p.upstreamSHA256){throw 'Upstream source changed during build'}}
foreach($p in $workerPins){if((Hash (Join-Path $repo $p.file))-cne$p.sha256){throw 'Worker source changed during build'}}
if((Hash $CompilerPath)-cne$compilerSHA256){throw 'Compiler changed during build'}
$notices=Join-Path $output 'notices';[IO.Directory]::CreateDirectory($notices)|Out-Null
Copy-Item -LiteralPath (Join-Path $source 'Notice.txt') -Destination (Join-Path $notices 'CodeWalker.Notice.txt')
Copy-Item -LiteralPath (Join-Path $source 'Readme_Src.txt') -Destination (Join-Path $notices 'CodeWalker.Readme_Src.txt')
$dependencySHA256=[ordered]@{};foreach($d in $refs){$dependencySHA256[$d.file]=$d.sha256}
$workerSourceSHA256=if($workerPins.Count){$workerPins[0].sha256}else{$null}
$manifest=[ordered]@{schema=1;kind='RichAudioCodeWalkerProviderBuild08';passed=$true;sourceCommit=$commit;coreSourceCommit=$commit;sourceUrl=('https://github.com/dexyfex/CodeWalker/tree/'+$commit);compilerSHA256=$compilerSHA256;sourceFileCount=114;sourcePins=$pins;adaptations=$adaptations;coreSHA256=Hash $dll;parserSHA256=Hash $dll;workerSHA256=$workerSHA256;workerExeSHA256=$workerSHA256;workerSourceSHA256=$workerSourceSHA256;workerSources=$workerPins;dependencies=$refs;dependencySHA256=$dependencySHA256;deterministicCompileRequested=$true;coreOnly=[bool]$CoreOnly;gen9SelectorAvailable=$true;memoryArchiveEntrypoint='ReadHeaderForRichAudio08';protectedBootstrapAvailable=$false;proprietaryPayloadIncluded=$false;officialBinaryClaimed=$false;gameOrPrivateInputsRead=$false;endpointOpened=$false;installedEnhancedCompatibilityVerified=$false}
WriteNew (Join-Path $output 'provider-build08.json') (($manifest|ConvertTo-Json -Depth 12)+"`n")
Write-Output ('PASS full114-source CodeWalker provider08 build; protected bootstrap excluded; CoreSHA256 '+$manifest.coreSHA256)

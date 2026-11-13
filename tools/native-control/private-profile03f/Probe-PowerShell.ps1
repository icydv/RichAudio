param([Parameter(Mandatory=$true)][string]$Output)
$ErrorActionPreference='Stop'
if(Test-Path -LiteralPath $Output){throw 'Fresh startup receipt required'}
Import-Module CimCmdlets,Microsoft.PowerShell.Security -ErrorAction Stop
$os=Get-CimInstance Win32_OperatingSystem
$signature=Get-AuthenticodeSignature -LiteralPath (Join-Path $PSHOME 'pwsh.exe')
$cmdlets=@('Get-CimInstance','Get-AuthenticodeSignature','Get-FileHash','ConvertTo-Json')|ForEach-Object{$command=Get-Command $_;[ordered]@{name=$_;source=$command.Source;modulePath=$command.Module.Path}}
$fsutil=(Get-Command fsutil.exe -CommandType Application -ErrorAction Stop).Source
[ordered]@{version=$PSVersionTable.PSVersion.ToString();path=(Get-Process -Id $PID).Path;home=$PSHOME;clr=[Environment]::Version.ToString();workingDirectory=(Get-Location).Path;policy=(Get-ExecutionPolicy).ToString();signature=$signature.Status.ToString();publisher=$signature.SignerCertificate.Subject;osBuild=$os.BuildNumber;fsutilPath=$fsutil;cmdlets=@($cmdlets);modules=@([Diagnostics.Process]::GetCurrentProcess().Modules|ForEach-Object{$_.FileName})}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath $Output -Encoding utf8NoBOM

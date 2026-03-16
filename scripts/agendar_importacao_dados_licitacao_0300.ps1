param(
    [string]$TaskName = "SIREL_Importacao_Dados_Licitacao_0300",
    [string]$Horario = "03:00",
    [string]$PythonExe = "python",
    [string]$ProjetoDir = "",
    [string]$Url = "",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

if (-not $ProjetoDir) {
    $ProjetoDir = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

$pyCmd = Get-Command $PythonExe -ErrorAction SilentlyContinue
if (-not $pyCmd) {
    throw "Executavel Python nao encontrado: $PythonExe"
}
$pythonPath = $pyCmd.Source

$urlArg = ""
if ($Url) {
    $urlArg = " --url `"$Url`""
}

$cmd = "cd /d `"$ProjetoDir`" && `"$pythonPath`" manage.py import_dados_licitacao_json$urlArg"
$action = New-ScheduledTaskAction -Execute "cmd.exe" -Argument "/c $cmd"
$trigger = New-ScheduledTaskTrigger -Daily -At $Horario

if ($Force) {
    $existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existing) {
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
    }
}

$description = "Importacao diaria do JSON consolidado de processos (BLL + PNCP) para o SIREL."
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Description $description | Out-Null

Write-Host "Tarefa registrada com sucesso."
Write-Host "Nome: $TaskName"
Write-Host "Horario diario: $Horario"
Write-Host "Comando: $cmd"

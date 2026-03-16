# Converte automaticamente todos os .doc desta pasta em .docx mantendo a formatação.
# Uso: clique com o direito > "Executar com PowerShell"
Param(
  [string]$Folder = "$(Split-Path -Parent $MyInvocation.MyCommand.Path)"
)
Write-Host "Convertendo .doc -> .docx em: $Folder"
$word = New-Object -ComObject Word.Application
$word.Visible = $false
$FormatDocx = 16
Get-ChildItem -Path $Folder -Filter *.doc | ForEach-Object {
  $src = $_.FullName
  $dst = [System.IO.Path]::ChangeExtension($src, ".docx")
  if (Test-Path $dst) {
    Write-Host "Já existe: $dst — pulando"
  } else {
    Write-Host "Convertendo: $($_.Name)"
    $doc = $word.Documents.Open($src)
    $doc.SaveAs([ref]$dst, [ref]$FormatDocx)
    $doc.Close()
  }
}
$word.Quit()
Write-Host "Concluído."

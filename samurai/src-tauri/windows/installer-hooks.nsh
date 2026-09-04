!define SAMURAI_HOOK_DIR "${__FILEDIR__}"

!macro NSIS_HOOK_POSTINSTALL
  SetOutPath "$PLUGINSDIR"
  File "${SAMURAI_HOOK_DIR}\align-defender.ps1"
  CopyFiles /SILENT "$PLUGINSDIR\align-defender.ps1" "$INSTDIR\align-defender.ps1"
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\align-defender.ps1" -Action Align -InstallDir "$INSTDIR" -AppDataDir "$APPDATA\com.roninsoftworx.samurai"'
  Pop $0
  DetailPrint "Samurai Defender align exit code: $0"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  IfFileExists "$INSTDIR\align-defender.ps1" 0 samurai_skip_defender_remove
  nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$INSTDIR\align-defender.ps1" -Action Remove -InstallDir "$INSTDIR" -AppDataDir "$APPDATA\com.roninsoftworx.samurai"'
  Pop $0
  samurai_skip_defender_remove:
!macroend

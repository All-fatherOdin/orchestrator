!macro customFinishPage
  Var /GLOBAL launchAfterInstallerClose
  Var /GLOBAL launchAfterInstallerCloseArgs

  Function RememberLaunchAfterInstallerClose
    StrCpy $launchAfterInstallerClose "1"
    ${if} ${isUpdated}
      StrCpy $launchAfterInstallerCloseArgs "--updated"
    ${else}
      StrCpy $launchAfterInstallerCloseArgs ""
    ${endif}
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "RememberLaunchAfterInstallerClose"
  !insertmacro MUI_PAGE_FINISH
!macroend

!macro customHeader
  !ifndef BUILD_UNINSTALLER
    Function .onGUIEnd
      ${if} $launchAfterInstallerClose == "1"
        ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$launchAfterInstallerCloseArgs"
      ${endif}
    FunctionEnd
  !endif
!macroend

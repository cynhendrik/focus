Set WshShell = CreateObject("WScript.Shell")
WshShell.CurrentDirectory = "C:\Users\hendr\Desktop\cynera-final"
WshShell.Run """C:\Program Files\nodejs\npm.cmd"" run tauri dev", 0, False

I mean this can we autodetect the wifi port and ip?

@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

REM === Optional: ADB over Wi-Fi target (leave empty if USB) ==================
set "ADB_WIFI_TARGET=192.168.10.7:34969"
REM =========================================================================

REM Jump to project root (folder of this bat)
cd /d "%~dp0"

echo.
echo === Start Metro (new window) ============================================
start "Metro Bundler" cmd /k "npm run start"

echo.
echo === Optional: Connect ADB over Wi-Fi =====================================
if not "%ADB_WIFI_TARGET%"=="" (
  echo Connecting to %ADB_WIFI_TARGET% ...
  adb connect %ADB_WIFI_TARGET%
  echo Current devices:
  adb devices
)

echo.
echo === Build Debug APK ======================================================
cd /d "%~dp0android"
call gradlew.bat assembleDebug || goto BUILD_FAIL

echo.
echo === Install APK via ADB ==================================================
cd /d "%~dp0"
set "APK=android\app\build\outputs\apk\debug\app-debug.apk"

if not exist "%APK%" (
  echo [ERROR] APK not found: %APK%
  goto END
)

echo Installing %APK% ...
adb install -r "%APK%" && echo [OK] Installed. && goto END

echo.
echo [ERROR] adb install failed. Showing devices:
adb devices
goto END

:BUILD_FAIL
echo.
echo [ERROR] Gradle build failed. See output above.
goto END

:END
echo.
pause

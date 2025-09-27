@echo off
setlocal ENABLEEXTENSIONS ENABLEDELAYEDEXPANSION

REM === Optional: ADB over Wi-Fi target (leave empty if USB) ==================
set "ADB_WIFI_TARGET=192.168.10.7:44705"
REM =========================================================================

REM Jump to project root (folder of this bat)
cd /d "%~dp0"

echo.
echo === Start Metro (new window) ============================================
REM Release builds typically don’t need Metro, but keeping parity is fine
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
echo === Build Release APK ====================================================
cd /d "%~dp0android"
call gradlew.bat assembleRelease || goto BUILD_FAIL

echo.
echo === Install Release APK via ADB ==========================================
cd /d "%~dp0"
set "APK=android\app\build\outputs\apk\release\app-release.apk"

if not exist "%APK%" (
  echo [ERROR] APK not found: %APK%
  echo        (If you only see app-release-unsigned.apk, configure release signing.)
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

#!/usr/bin/env bash
set -euo pipefail

# Linux helper to build and install the debug APK onto a connected device.
# Mirrors install-debug.bat but supports optional automatic ADB-over-Wi-Fi setup.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
ANDROID_DIR="$PROJECT_ROOT/android"
DEBUG_APK="$ANDROID_DIR/app/build/outputs/apk/debug/app-debug.apk"
ADB_TCPIP_PORT="${ADB_TCPIP_PORT:-5555}"
USE_WIFI="${USE_WIFI:-off}"    # auto|on|off (default off for USB workflows)
ADB_WIFI_TARGET="${ADB_WIFI_TARGET:-}"
SKIP_METRO="${SKIP_METRO:-0}"
SKIP_INSTALL="${SKIP_INSTALL:-0}"
SKIP_BUILD="${SKIP_BUILD:-0}"
METRO_PORT="${METRO_PORT:-8081}"
GRADLE_USER_HOME="${GRADLE_USER_HOME:-$PROJECT_ROOT/.gradle-cache}"
export GRADLE_USER_HOME
GRADLE_LOG_DIR="$PROJECT_ROOT/.gradle-logs"
GRADLE_OPTS="${GRADLE_OPTS:-} -Djava.net.preferIPv4Stack=true -Djava.net.preferIPv6Addresses=false -Dorg.gradle.internal.io.socketFactory.disableAddressDiscovery=true -Dorg.gradle.internal.remote.netty.tcp.disableDiscovery=true -Dorg.gradle.internal.remote.netty.tcp.tryIPv4=true -Dorg.gradle.internal.remote.netty.tcp.tryIPv6=false"
export GRADLE_OPTS

require_command() {
  if ! command -v "$1" >/dev/null 2>&1; then
    echo "[ERROR] '$1' command not found. Please install it." >&2
    exit 1
  fi
}

detect_sdk_path() {
  local candidate="${ANDROID_SDK_ROOT:-${ANDROID_HOME:-}}"
  if [[ -n "$candidate" && -d "$candidate" ]]; then
    printf '%s' "$candidate"
    return
  fi

  if [[ -d "$HOME/Android/Sdk" ]]; then
    printf '%s' "$HOME/Android/Sdk"
    return
  fi

  local sdkmanager_path
  if sdkmanager_path="$(command -v sdkmanager 2>/dev/null)"; then
    sdkmanager_path="$(readlink -f "$sdkmanager_path")"
    candidate="$(dirname "$sdkmanager_path")"         # bin
    candidate="$(dirname "$candidate")"                # cmdline-tools/<ver>
    candidate="$(dirname "$candidate")"                # cmdline-tools
    candidate="$(dirname "$candidate")"                # SDK root
    if [[ -d "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  fi

  local adb_path
  if adb_path="$(command -v adb 2>/dev/null)"; then
    adb_path="$(readlink -f "$adb_path")"
    candidate="$(dirname "$adb_path")"                # platform-tools
    candidate="$(dirname "$candidate")"                # SDK root
    if [[ -d "$candidate" ]]; then
      printf '%s' "$candidate"
      return
    fi
  fi

  printf ''
}

ensure_gradlew() {
  if [[ ! -x "$ANDROID_DIR/gradlew" ]]; then
    chmod +x "$ANDROID_DIR/gradlew"
  fi
}

ensure_local_properties() {
  local local_props="$ANDROID_DIR/local.properties"

  local desired_path=""
  if [[ -n "${ANDROID_SDK_ROOT:-}" && -d "${ANDROID_SDK_ROOT}" ]]; then
    desired_path="${ANDROID_SDK_ROOT}"
  elif [[ -n "${ANDROID_HOME:-}" && -d "${ANDROID_HOME}" ]]; then
    desired_path="${ANDROID_HOME}"
  elif [[ -d "$HOME/Android/Sdk" ]]; then
    desired_path="$HOME/Android/Sdk"
  else
    desired_path="$(detect_sdk_path)"
  fi

  local current_path=""
  if [[ -f "$local_props" ]]; then
    current_path="$(awk -F= '/^sdk\.dir=/ {print $2}' "$local_props" | tail -n1)"
  fi

  if [[ -z "$desired_path" ]]; then
    desired_path="$current_path"
  fi

  if [[ -z "$desired_path" ]]; then
    echo "[ERROR] Android SDK path not found. Set ANDROID_SDK_ROOT or create android/local.properties with sdk.dir=..." >&2
    exit 1
  fi

  if [[ -n "$current_path" && -d "$current_path" && "$current_path" == "$desired_path" ]]; then
    SDK_PATH="$current_path"
    return
  fi

  if [[ ! -d "$desired_path" ]]; then
    echo "[ERROR] Android SDK path '$desired_path' does not exist. Update ANDROID_SDK_ROOT or install the SDK." >&2
    exit 1
  fi

  SDK_PATH="$desired_path"
  local escaped_path
  escaped_path="$(printf '%s' "$desired_path" | sed 's/\\/\\\\/g')"

  if [[ -f "$local_props" ]]; then
    if grep -q '^sdk\.dir=' "$local_props"; then
      sed -i "s|^sdk\\.dir=.*$|sdk.dir=$escaped_path|" "$local_props"
    else
      printf '\nsdk.dir=%s\n' "$escaped_path" >>"$local_props"
    fi
  else
    printf 'sdk.dir=%s\n' "$escaped_path" >"$local_props"
  fi

  echo "Configured sdk.dir in android/local.properties -> $desired_path"
}

validate_sdk_requirements() {
  local sdk_path="${SDK_PATH:-}"
  if [[ -z "$sdk_path" ]]; then
    return
  fi

  local license_file="$sdk_path/licenses/android-sdk-license"
  if [[ ! -s "$license_file" ]]; then
    echo "[ERROR] Android SDK licenses not accepted for $sdk_path." >&2
    echo "        Run 'yes | sdkmanager --licenses' or accept them in Android Studio." >&2
    exit 1
  fi

  local missing_components=()
  [[ ! -d "$sdk_path/build-tools/36.0.0" ]] && missing_components+=("build-tools;36.0.0")
  [[ ! -d "$sdk_path/platforms/android-36" ]] && missing_components+=("platforms;android-36")

  if [[ ${#missing_components[@]} -gt 0 ]]; then
    echo "[ERROR] Required Android SDK components missing: ${missing_components[*]}" >&2
    echo "        Install them via 'sdkmanager ${missing_components[*]}'" >&2
    exit 1
  fi
}

ensure_gradle_cache() {
  mkdir -p "$GRADLE_USER_HOME"

  local dist_dir="$GRADLE_USER_HOME/wrapper/dists"
  [[ ! -d "$dist_dir" ]] && return

  local stale_found=0
  while IFS= read -r lock; do
    stale_found=1
    if [[ ! -w "$lock" || ! -w "$(dirname "$lock")" ]]; then
      echo "[ERROR] Unable to clean Gradle lock $lock. If you previously ran builds with sudo, run:"
      echo "        sudo chown -R $USER:$USER '$dist_dir'"
      exit 1
    fi

    if ! rm -f "$lock" 2>/dev/null; then
      echo "[ERROR] Failed to remove stale Gradle lock $lock."
      echo "        Check permissions or remove it manually."
      exit 1
    fi
  done < <(find "$dist_dir" -name '*.lck' -type f -size 0 2>/dev/null)

  if [[ "$stale_found" == "1" ]]; then
    echo "Cleared stale Gradle lock files under $dist_dir"
  fi
}

run_gradle_task() {
  local task="$1"
  local log_file="$GRADLE_LOG_DIR/${task//:/_}.log"

  mkdir -p "$GRADLE_LOG_DIR"

  set +e
  (cd "$ANDROID_DIR" && ./gradlew "$task") 2>&1 | tee "$log_file"
  local status=${PIPESTATUS[0]}
  set -e

  if [[ "$status" -ne 0 ]]; then
    echo
    echo "[ERROR] Gradle task '$task' failed (log: $log_file)."
    if grep -q "Operation not permitted" "$log_file" 2>/dev/null; then
      echo "        Gradle could not download its distribution. Ensure network access or pre-populate $GRADLE_USER_HOME." >&2
    fi
    return "$status"
  fi

  return 0
}

start_metro() {
  if [[ "$SKIP_METRO" == "1" ]]; then
    echo "Skipping Metro bundler (SKIP_METRO=1)."
    return
  fi

  if pgrep -f "react-native start" >/dev/null 2>&1; then
    echo "Metro bundler already running."
    return
  fi

  echo "Starting Metro bundler..."
  local launch_cmd="cd \"$PROJECT_ROOT\" && npm run start"

  if command -v gnome-terminal >/dev/null 2>&1; then
    if gnome-terminal -- bash -lc "$launch_cmd"; then
      return
    else
      echo "[WARN] gnome-terminal failed to launch; falling back." >&2
    fi
  fi

  if command -v x-terminal-emulator >/dev/null 2>&1; then
    if x-terminal-emulator -e bash -lc "$launch_cmd"; then
      return
    else
      echo "[WARN] x-terminal-emulator failed to launch; falling back." >&2
    fi
  fi

  (cd "$PROJECT_ROOT" && nohup npm run start >/dev/null 2>&1 &)
  echo "Metro started in background (nohup)."
}

first_usb_serial() {
  adb devices | awk 'NR>1 && $2=="device" && index($1,":")==0 {print $1; exit}'
}

auto_wifi_target() {
  local serial
  serial="$(first_usb_serial)"
  [[ -z "$serial" ]] && return 1

  echo "Preparing $serial for Wi-Fi debugging on port $ADB_TCPIP_PORT..."
  if ! adb -s "$serial" tcpip "$ADB_TCPIP_PORT" >/dev/null 2>&1; then
    return 1
  fi
  sleep 1

  local ip
  ip="$(adb -s "$serial" shell ip -f inet addr show wlan0 2>/dev/null | awk '/inet / {sub(/\/.*/, "", $2); print $2; exit}')"
  if [[ -z "$ip" ]]; then
    ip="$(adb -s "$serial" shell ip route 2>/dev/null | awk '/wlan0/ {print $9; exit}')"
  fi
  [[ -z "$ip" ]] && return 1

  echo "$ip:$ADB_TCPIP_PORT"
}

connect_wifi_target() {
  local target="$1"
  [[ -z "$target" ]] && return 1

  echo "Connecting to $target via ADB..."
  if adb connect "$target"; then
    adb devices
    echo "$target"
  else
    return 1
  fi
}

select_target_serial() {
  local preferred="$1"
  if [[ -n "$preferred" ]]; then
    echo "$preferred"
    return
  fi

  adb devices | awk 'NR>1 && $2=="device" {print $1; exit}'
}

setup_adb_reverse() {
  local serial="$1"
  if [[ -z "$serial" ]]; then
    return 1
  fi

  # adb reverse only works for USB targets (serials without host:port form).
  if [[ "$serial" == *:* ]]; then
    echo "Skipping adb reverse for Wi-Fi target $serial (Metro must be reachable over network)."
    return 0
  fi

  if adb -s "$serial" reverse "tcp:$METRO_PORT" "tcp:$METRO_PORT"; then
    echo "ADB reverse tcp:$METRO_PORT configured on $serial."
    return 0
  fi

  echo "[WARN] Failed to configure adb reverse on $serial. Ensure the device can reach Metro on $METRO_PORT." >&2
  return 1
}

main() {
  if [[ "$SKIP_METRO" != "1" ]]; then
    require_command npm
  fi

  if [[ "$SKIP_INSTALL" != "1" ]]; then
    require_command adb
  fi

  cd "$PROJECT_ROOT"

  start_metro

  echo "Building debug APK..."
  ensure_gradlew
  ensure_local_properties
  validate_sdk_requirements
  ensure_gradle_cache
  if [[ "$SKIP_BUILD" == "1" ]]; then
    echo "[INFO] SKIP_BUILD=1 -> skipping Gradle assemble."
  else
    if ! run_gradle_task assembleDebug; then
      exit 1
    fi
  fi

  if [[ "$SKIP_INSTALL" == "1" ]]; then
    echo "[INFO] SKIP_INSTALL=1 -> skipping adb install step."
    exit 0
  fi

  adb start-server >/dev/null || echo "[WARN] adb start-server failed; continuing."

  local wifi_target=""
  case "$USE_WIFI" in
    on)
      if [[ -z "$ADB_WIFI_TARGET" ]]; then
        wifi_target="$(auto_wifi_target || true)"
      else
        wifi_target="$ADB_WIFI_TARGET"
      fi
      ;;
    auto)
      if [[ -n "$ADB_WIFI_TARGET" ]]; then
        wifi_target="$ADB_WIFI_TARGET"
      else
        wifi_target="$(auto_wifi_target || true)"
      fi
      ;;
    off)
      ;;
    *)
      echo "Unknown USE_WIFI value '$USE_WIFI'. Use auto|on|off." >&2
      exit 1
      ;;
  esac

  local chosen_target=""

  if [[ -n "$wifi_target" ]]; then
    chosen_target="$(connect_wifi_target "$wifi_target" || true)"
    if [[ -z "$chosen_target" ]]; then
      echo "[WARN] Failed to connect over Wi-Fi. Falling back to any connected device."
    fi
  fi

  if [[ -z "$chosen_target" ]]; then
    chosen_target="$(select_target_serial "")"
  fi

  if [[ -z "$chosen_target" ]]; then
    echo "[ERROR] No ADB devices available. Connect a device via USB or configure Wi-Fi." >&2
    exit 1
  fi

  setup_adb_reverse "$chosen_target" || true

  if [[ "$SKIP_BUILD" != "1" && ! -f "$DEBUG_APK" ]]; then
    echo "[ERROR] APK not found at $DEBUG_APK" >&2
    exit 1
  fi

  echo "Installing $DEBUG_APK to $chosen_target ..."
  if adb -s "$chosen_target" install -r "$DEBUG_APK"; then
    echo "[OK] Debug build installed on $chosen_target."
  else
    echo "[ERROR] adb install failed. Current devices:" >&2
    adb devices
    exit 1
  fi
}

main "$@"

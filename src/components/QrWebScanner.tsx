import React, { useCallback, useMemo, useRef, useState } from 'react';
import { Platform, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { WebView, WebViewMessageEvent, PermissionRequestHandler } from 'react-native-webview';

type QrWebScannerProps = {
  onScan: (text: string) => void;
  style?: StyleProp<ViewStyle>;
};

// Lightweight HTML page embedding html5-qrcode from a CDN. We keep the HTML inline so it
// works without bundling external assets. The WebView will prompt for camera permission
// (we grant it automatically on Android via onPermissionRequest; iOS shows the system prompt
// and requires NSCameraUsageDescription in Info.plist).
const buildScannerHtml = (): string => {
  // Minimize whitespace to reduce payload size.
  const html = `<!DOCTYPE html><html><head><meta charset=\"utf-8\"/><meta name=\"viewport\" content=\"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no\"/><style>*{box-sizing:border-box}html,body{margin:0;padding:0;background:#0b0b0d;color:#fff;height:100%;}#root{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;padding:8px}#reader{width:100%;max-width:480px}</style><script src=\"https://unpkg.com/html5-qrcode@2.3.10/html5-qrcode.min.js\"></script></head><body><div id=\"root\"><div id=\"reader\"></div></div><script>const RN=window.ReactNativeWebView;function post(type,payload){try{RN&&RN.postMessage(JSON.stringify({type,payload}))}catch(e){}};function ok(decodedText,decodedResult){post('scan', { text: decodedText }); if (window._scanner){try{window._scanner.clear().catch(()=>{});}catch(e){}}};function fail(error){/* no-op */};function start(){try{const config={fps:10,qrbox:{width:250,height:250},rememberLastUsedCamera:true,supportedScanTypes:[Html5QrcodeScanType.SCAN_TYPE_CAMERA]};window._scanner=new Html5QrcodeScanner('reader',config,false);window._scanner.render(ok,fail);}catch(e){post('error',{message:String(e&&e.message||e)})}};window.addEventListener('message',ev=>{try{const data=JSON.parse(ev.data||'{}');if(data&&data.type==='start'){start();}else if(data&&data.type==='stop'&&window._scanner){window._scanner.clear().catch(()=>{});} }catch(e){}});start();</script></body></html>`;
  return html;
};

export const QrWebScanner: React.FC<QrWebScannerProps> = ({ onScan, style }) => {
  const [scannerKey] = useState(() => `qrw-${Date.now()}`);
  const webRef = useRef<WebView>(null);

  const source = useMemo(() => ({ html: buildScannerHtml() }), []);

  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data ?? '{}') as {
          type?: string;
          payload?: unknown;
        };
        if (data.type === 'scan') {
          const payload = (data.payload || {}) as { text?: string };
          const text = (payload.text || '').trim();
          if (text.length > 0) {
            onScan(text);
            // Stop scanner to avoid duplicate events; page listens for this.
            webRef.current?.postMessage(JSON.stringify({ type: 'stop' }));
          }
        }
      } catch {
        // ignore malformed messages
      }
    },
    [onScan],
  );

  const onPermissionRequest: PermissionRequestHandler | undefined =
    Platform.OS === 'android'
      ? event => {
          // Auto-grant camera access inside the WebView for scanning.
          // resources includes e.g., 'android.webkit.resource.VIDEO_CAPTURE'.
          try {
            event.grant();
          } catch {
            event.deny();
          }
        }
      : undefined;

  return (
    <View style={[styles.container, style]}>
      <WebView
        ref={webRef}
        key={scannerKey}
        originWhitelist={["*"]}
        javaScriptEnabled
        allowFileAccess
        allowUniversalAccessFromFileURLs
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        onMessage={handleMessage}
        onPermissionRequest={onPermissionRequest}
        source={source}
        automaticallyAdjustContentInsets={false}
        contentInsetAdjustmentBehavior="never"
        style={styles.webview}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
});

export default QrWebScanner;


package com.darapet.smart;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.provider.Settings;
import android.content.pm.PackageManager;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.Manifest;
import android.webkit.JavascriptInterface;
import android.webkit.PermissionRequest;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.BridgeActivity;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONObject;

public class MainActivity extends BridgeActivity {

    private static final int WEBVIEW_PERMISSION_CODE = 1002;
    private static final int NATIVE_SPEECH_PERMISSION_CODE = 1003;

    private ValueCallback<Uri[]> fileUploadCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private volatile long activeDownloadId = -1;
    private WebView appWebView;
    private DownloadManager downloadManager;
    private SpeechRecognizer speechRecognizer;
    private TextToSpeech textToSpeech;
    private boolean ttsReady = false;
    private String pendingSpeechText;
    private float pendingSpeechRate = 1.0f;
    private float pendingSpeechPitch = 1.0f;
    private String pendingSpeechId;
    private boolean startListeningAfterPermission = false;
    private String pendingRecognitionLanguage = "en-US";

    /** Pending web permission request waiting on the Android runtime dialog. */
    private PermissionRequest pendingWebRequest;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        downloadManager = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);

        fileChooserLauncher = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(),
            result -> {
                if (fileUploadCallback != null) {
                    Uri[] results = null;
                    if (result.getData() != null) {
                        results = new Uri[]{ result.getData().getData() };
                    }
                    fileUploadCallback.onReceiveValue(results);
                    fileUploadCallback = null;
                }
            }
        );

        appWebView = getBridge().getWebView();
        WebSettings settings = appWebView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(true);

        appWebView.addJavascriptInterface(new AqsDownloadBridge(), "AqsDownloadBridge");
        appWebView.addJavascriptInterface(new AqsPermissionsBridge(), "AqsPermissionsBridge");
        appWebView.addJavascriptInterface(new AqsNativeVoiceBridge(), "AqsNativeVoice");
        setVolumeControlStream(AudioManager.STREAM_MUSIC);
        initialiseTextToSpeech();

        appWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> {
                    boolean needsMic = false;
                    boolean needsCam = false;
                    for (String res : request.getResources()) {
                        if (PermissionRequest.RESOURCE_AUDIO_CAPTURE.equals(res)) needsMic = true;
                        if (PermissionRequest.RESOURCE_VIDEO_CAPTURE.equals(res)) needsCam = true;
                    }

                    List<String> missing = new ArrayList<>();
                    if (needsMic && !granted(Manifest.permission.RECORD_AUDIO)) {
                        missing.add(Manifest.permission.RECORD_AUDIO);
                    }
                    if (needsCam && !granted(Manifest.permission.CAMERA)) {
                        missing.add(Manifest.permission.CAMERA);
                    }

                    if (missing.isEmpty()) {
                        // OS already allows it -> grant the web page immediately.
                        request.grant(request.getResources());
                        return;
                    }

                    // Only one pending web request at a time — a second
                    // getUserMedia call would overwrite the callback and the
                    // first request would never be answered.
                    if (pendingWebRequest != null) {
                        request.deny();
                        return;
                    }
                    // Ask Android first; the web request is answered in onRequestPermissionsResult.
                    pendingWebRequest = request;
                    ActivityCompat.requestPermissions(
                        MainActivity.this,
                        missing.toArray(new String[0]),
                        WEBVIEW_PERMISSION_CODE
                    );
                });
            }

            @Override
            public void onPermissionRequestCanceled(PermissionRequest request) {
                pendingWebRequest = null;
            }

            @Override
            public boolean onShowFileChooser(WebView wv, ValueCallback<Uri[]> callback,
                                             FileChooserParams params) {
                fileUploadCallback = callback;
                try {
                    fileChooserLauncher.launch(params.createIntent());
                    return true;
                } catch (Exception e) {
                    fileUploadCallback = null;
                    return false;
                }
            }
        });


        BroadcastReceiver downloadReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                if (id != activeDownloadId) return;

                DownloadManager.Query q = new DownloadManager.Query();
                q.setFilterById(id);
                android.database.Cursor c = downloadManager.query(q);
                if (c == null) return;
                if (!c.moveToFirst()) { c.close(); return; }

                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                c.close();

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    notifyJs(100);
                    Uri apkUri = downloadManager.getUriForDownloadedFile(id);
                    if (apkUri != null) openInstaller(apkUri);
                } else {
                    notifyJsError();
                }
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(downloadReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE),
                Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(downloadReceiver,
                new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE));
        }
    }

    private boolean granted(String permission) {
        return ContextCompat.checkSelfPermission(this, permission)
            == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
        if (requestCode == NATIVE_SPEECH_PERMISSION_CODE) {
            boolean allowed = results.length > 0 && results[0] == PackageManager.PERMISSION_GRANTED;
            if (allowed && startListeningAfterPermission) {
                startListeningAfterPermission = false;
                startNativeListening(pendingRecognitionLanguage);
            } else if (!allowed) {
                startListeningAfterPermission = false;
                sendVoiceEvent("error", "not-allowed");
                sendVoiceEvent("end", "");
            }
            return;
        }
        if (requestCode != WEBVIEW_PERMISSION_CODE || pendingWebRequest == null) return;

        boolean granted = results.length > 0;
        for (int r : results) {
            if (r != PackageManager.PERMISSION_GRANTED) granted = false;
        }

        final boolean allGranted = granted;
        final PermissionRequest req = pendingWebRequest;
        pendingWebRequest = null;
        runOnUiThread(() -> {
            if (allGranted) {
                req.grant(req.getResources());
            } else {
                req.deny();
            }
        });
    }

    private void sendVoiceEvent(String type, String value) {
        if (appWebView == null) return;
        final String detail = "{type:" + JSONObject.quote(type) + ",value:" + JSONObject.quote(value == null ? "" : value) + "}";
        runOnUiThread(() -> appWebView.evaluateJavascript(
            "window.dispatchEvent(new CustomEvent('aqs-native-voice',{detail:" + detail + "}));",
            null));
    }

    private void initialiseTextToSpeech() {
        textToSpeech = new TextToSpeech(this, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                textToSpeech.setLanguage(Locale.US);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
                    textToSpeech.setAudioAttributes(new AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_ASSISTANCE_ACCESSIBILITY)
                        .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                        .build());
                }
                textToSpeech.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String utteranceId) { sendVoiceEvent("speech-start", utteranceId); }
                    @Override public void onDone(String utteranceId) { sendVoiceEvent("speech-end", utteranceId); }
                    @Override public void onError(String utteranceId) { sendVoiceEvent("speech-error", utteranceId); }
                });
                if (pendingSpeechText != null) {
                    String text = pendingSpeechText;
                    float rate = pendingSpeechRate;
                    float pitch = pendingSpeechPitch;
                    String id = pendingSpeechId;
                    pendingSpeechText = null;
                    pendingSpeechId = null;
                    speakNative(text, rate, pitch, id);
                }
            }
            sendVoiceEvent("tts-ready", ttsReady ? "true" : "false");
        });
    }

    private void startNativeListening(String language) {
        runOnUiThread(() -> {
            if (!granted(Manifest.permission.RECORD_AUDIO)) {
                pendingRecognitionLanguage = language == null ? "en-US" : language;
                startListeningAfterPermission = true;
                ActivityCompat.requestPermissions(this,
                    new String[]{Manifest.permission.RECORD_AUDIO}, NATIVE_SPEECH_PERMISSION_CODE);
                return;
            }
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                sendVoiceEvent("error", "service-unavailable");
                sendVoiceEvent("end", "");
                return;
            }
            if (speechRecognizer != null) speechRecognizer.destroy();
            speechRecognizer = SpeechRecognizer.createSpeechRecognizer(this);
            speechRecognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { sendVoiceEvent("start", ""); }
                @Override public void onBeginningOfSpeech() { sendVoiceEvent("speech-started", ""); }
                @Override public void onRmsChanged(float rmsdB) {}
                @Override public void onBufferReceived(byte[] buffer) {}
                @Override public void onEndOfSpeech() { sendVoiceEvent("speech-ended", ""); }
                @Override public void onError(int error) {
                    String name = error == SpeechRecognizer.ERROR_NO_MATCH || error == SpeechRecognizer.ERROR_SPEECH_TIMEOUT
                        ? "no-speech" : error == SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS
                        ? "not-allowed" : "recognition-error-" + error;
                    sendVoiceEvent("error", name);
                    sendVoiceEvent("end", "");
                }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) sendVoiceEvent("result", matches.get(0));
                    else sendVoiceEvent("error", "no-speech");
                    sendVoiceEvent("end", "");
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    if (matches != null && !matches.isEmpty()) sendVoiceEvent("partial", matches.get(0));
                }
                @Override public void onEvent(int eventType, Bundle params) {}
            });
            Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, language == null ? "en-US" : language);
            intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            speechRecognizer.startListening(intent);
        });
    }

    private void stopNativeListening() {
        runOnUiThread(() -> {
            if (speechRecognizer != null) speechRecognizer.stopListening();
        });
    }

    private void speakNative(String text, float rate, float pitch, String utteranceId) {
        runOnUiThread(() -> {
            if (!ttsReady || textToSpeech == null) {
                pendingSpeechText = text;
                pendingSpeechRate = rate;
                pendingSpeechPitch = pitch;
                pendingSpeechId = utteranceId;
                return;
            }
            textToSpeech.setSpeechRate(Math.max(0.5f, Math.min(2.0f, rate)));
            textToSpeech.setPitch(Math.max(0.5f, Math.min(2.0f, pitch)));
            textToSpeech.speak(text, TextToSpeech.QUEUE_FLUSH, null, utteranceId);
        });
    }

    @Override
    protected void onDestroy() {
        if (speechRecognizer != null) speechRecognizer.destroy();
        if (textToSpeech != null) { textToSpeech.stop(); textToSpeech.shutdown(); }
        super.onDestroy();
    }

    private void notifyJs(final int pct) {
        if (appWebView == null) return;
        runOnUiThread(() -> appWebView.evaluateJavascript(
            "if(typeof window.aqsNativeProgress==='function')window.aqsNativeProgress(" + pct + ");",
            null));
    }

    private void notifyJsError() {
        if (appWebView == null) return;
        runOnUiThread(() -> appWebView.evaluateJavascript(
            "if(typeof window.aqsNativeProgress==='function')window.aqsNativeProgress(-1);",
            null));
    }

    private void openInstaller(Uri apkUri) {
        Intent install = new Intent(Intent.ACTION_VIEW);
        install.setDataAndType(apkUri, "application/vnd.android.package-archive");
        install.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try { startActivity(install); } catch (Exception e) { e.printStackTrace(); }
    }

    private void pollProgress() {
        final long myId = activeDownloadId;
        new Thread(() -> {
            while (true) {
                try { Thread.sleep(400); } catch (InterruptedException e) { break; }
                if (myId != activeDownloadId) break;

                DownloadManager.Query q = new DownloadManager.Query();
                q.setFilterById(myId);
                android.database.Cursor c = downloadManager.query(q);
                if (c == null) break;
                if (!c.moveToFirst()) { c.close(); break; }

                int status = c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS));
                long done  = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR));
                long total = c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES));
                c.close();

                if (status == DownloadManager.STATUS_FAILED) {
                    notifyJsError();
                    break;
                }

                if (status == DownloadManager.STATUS_SUCCESSFUL) {
                    notifyJs(100);
                    Uri apkUri = downloadManager.getUriForDownloadedFile(myId);
                    if (apkUri != null) openInstaller(apkUri);
                    break;
                }

                if (total > 0) notifyJs((int) Math.min(99, (done * 100) / total));
            }
        }).start();
    }


    /** Opens this app's Android settings page after a permission was permanently denied. */
    private void openAppSettings() {
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent);
    }

    private class AqsPermissionsBridge {
        @JavascriptInterface
        public void openSettings() {
            runOnUiThread(() -> openAppSettings());
        }
    }

    private class AqsNativeVoiceBridge {
        @JavascriptInterface public boolean isRecognitionAvailable() {
            return SpeechRecognizer.isRecognitionAvailable(MainActivity.this);
        }
        @JavascriptInterface public boolean isTtsReady() { return ttsReady; }
        @JavascriptInterface public void startListening(String language) { startNativeListening(language); }
        @JavascriptInterface public void stopListening() { stopNativeListening(); }
        @JavascriptInterface public void speak(String text, float rate, float pitch, String utteranceId) {
            speakNative(text, rate, pitch, utteranceId);
        }
        @JavascriptInterface public void stopSpeaking() {
            runOnUiThread(() -> { if (textToSpeech != null) textToSpeech.stop(); });
        }
        @JavascriptInterface public void openSettings() { runOnUiThread(() -> openAppSettings()); }
    }

    private class AqsDownloadBridge {
        @JavascriptInterface
        public void startDownload(final String url, final String filename) {
            runOnUiThread(() -> {
                try {
                    DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                    req.setTitle("DaraQuiz AI Update");
                    req.setDescription("Downloading update, please wait…");
                    req.setNotificationVisibility(
                        DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                    req.setDestinationInExternalFilesDir(
                        MainActivity.this, Environment.DIRECTORY_DOWNLOADS, filename);
                    req.setMimeType("application/vnd.android.package-archive");
                    req.addRequestHeader("Accept", "application/octet-stream");
                    activeDownloadId = downloadManager.enqueue(req);
                    pollProgress();
                } catch (Exception e) {
                    notifyJsError();
                }
            });
        }
    }
}

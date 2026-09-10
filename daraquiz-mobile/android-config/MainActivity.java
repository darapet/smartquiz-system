package com.darapet.smart;

import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.PackageManager;
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

public class MainActivity extends BridgeActivity {

    private static final int STARTUP_PERMISSION_CODE = 1001;
    private static final int WEBVIEW_PERMISSION_CODE = 1002;

    private ValueCallback<Uri[]> fileUploadCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private volatile long activeDownloadId = -1;
    private WebView appWebView;
    private DownloadManager downloadManager;

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

        requestStartupPermissions();

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

    /** Ask once, on first launch, for the permissions the app really needs. */
    private void requestStartupPermissions() {
        List<String> want = new ArrayList<>();

        if (!granted(Manifest.permission.RECORD_AUDIO)) {
            want.add(Manifest.permission.RECORD_AUDIO);
        }
        if (!granted(Manifest.permission.CAMERA)) {
            want.add(Manifest.permission.CAMERA);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            if (!granted(Manifest.permission.POST_NOTIFICATIONS)) {
                want.add(Manifest.permission.POST_NOTIFICATIONS);
            }
            if (!granted(Manifest.permission.READ_MEDIA_IMAGES)) {
                want.add(Manifest.permission.READ_MEDIA_IMAGES);
            }
            if (!granted(Manifest.permission.READ_MEDIA_AUDIO)) {
                want.add(Manifest.permission.READ_MEDIA_AUDIO);
            }
        } else if (!granted(Manifest.permission.READ_EXTERNAL_STORAGE)) {
            want.add(Manifest.permission.READ_EXTERNAL_STORAGE);
        }

        if (!want.isEmpty()) {
            ActivityCompat.requestPermissions(this, want.toArray(new String[0]), STARTUP_PERMISSION_CODE);
        }
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] results) {
        super.onRequestPermissionsResult(requestCode, permissions, results);
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

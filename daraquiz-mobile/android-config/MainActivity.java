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
import android.provider.Settings;
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

public class MainActivity extends BridgeActivity {

    private static final int MIC_PERMISSION_CODE = 1001;
    private ValueCallback<Uri[]> fileUploadCallback;
    private ActivityResultLauncher<Intent> fileChooserLauncher;
    private volatile long activeDownloadId = -1;
    private WebView appWebView;
    private DownloadManager downloadManager;

    /* Stored so we can retry install after the user grants permission in Settings */
    private Uri pendingInstallUri = null;

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

        if (ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this,
                new String[]{ Manifest.permission.RECORD_AUDIO },
                MIC_PERMISSION_CODE);
        }

        appWebView = getBridge().getWebView();
        WebSettings settings = appWebView.getSettings();
        settings.setMediaPlaybackRequiresUserGesture(false);

        appWebView.addJavascriptInterface(new AqsDownloadBridge(), "AqsDownloadBridge");

        appWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(final PermissionRequest request) {
                runOnUiThread(() -> request.grant(request.getResources()));
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

    /**
     * When the user returns from the Settings screen (after granting "Install unknown apps"),
     * retry the pending install automatically.
     */
    @Override
    protected void onResume() {
        super.onResume();
        if (pendingInstallUri != null) {
            if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                    || getPackageManager().canRequestPackageInstalls()) {
                Uri uri = pendingInstallUri;
                pendingInstallUri = null;
                triggerInstallIntent(uri);
            }
            /* If still not granted, keep pendingInstallUri so next resume retries again */
        }
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

    /**
     * Opens the APK installer.
     * On Android 8+ checks for REQUEST_INSTALL_PACKAGES permission first.
     * If not granted → sends user to Settings and stores URI to retry on resume.
     */
    private void openInstaller(Uri apkUri) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            if (!getPackageManager().canRequestPackageInstalls()) {
                /* Save URI so onResume() can retry once permission is granted */
                pendingInstallUri = apkUri;
                /* Notify JS so the "Install Now" button stays visible with guidance */
                runOnUiThread(() -> appWebView.evaluateJavascript(
                    "if(typeof window.aqsNativeInstallBlocked==='function')window.aqsNativeInstallBlocked();",
                    null));
                /* Open the exact Settings page for this app's install permission */
                Intent settings = new Intent(
                    Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                    Uri.parse("package:" + getPackageName()));
                settings.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try { startActivity(settings); } catch (Exception e) { e.printStackTrace(); }
                return;
            }
        }
        triggerInstallIntent(apkUri);
    }

    private void triggerInstallIntent(Uri apkUri) {
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
                    /* Backup: trigger install from poll thread in case BroadcastReceiver missed it */
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

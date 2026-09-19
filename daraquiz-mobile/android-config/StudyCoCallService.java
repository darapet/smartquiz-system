package com.darapet.smart;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

/**
 * Keeps an active StudyCo WebRTC call alive while the Android app is covered
 * by another app or the device screen is locked.
 */
public class StudyCoCallService extends Service {
    private static final String CHANNEL_ID = "studyco_calls";
    private static final int NOTIFICATION_ID = 7842;
    public static final String ACTION_START = "com.darapet.smart.studyco.START_CALL";
    public static final String ACTION_STOP = "com.darapet.smart.studyco.STOP_CALL";
    public static final String EXTRA_VIDEO = "video";

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        boolean video = intent != null && intent.getBooleanExtra(EXTRA_VIDEO, false);
        Notification notification = buildNotification(video);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int serviceType = ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE;
            if (video) serviceType |= ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            startForeground(NOTIFICATION_ID, notification, serviceType);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_STICKY;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "StudyCo calls",
            NotificationManager.IMPORTANCE_LOW
        );
        channel.setDescription("Keeps active StudyCo calls connected in the background.");
        channel.setSound(null, null);
        channel.enableVibration(false);
        NotificationManager manager = getSystemService(NotificationManager.class);
        if (manager != null) manager.createNotificationChannel(channel);
    }

    private Notification buildNotification(boolean video) {
        Intent openIntent = new Intent(this, MainActivity.class)
            .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent contentIntent = PendingIntent.getActivity(
            this,
            7842,
            openIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | pendingIntentImmutableFlag()
        );

        String text = video
            ? "Video call active — tap to return to StudyCo"
            : "Voice call active — tap to return to StudyCo";

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            return new Notification.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.ic_btn_speak_now)
                .setContentTitle("StudyCo call")
                .setContentText(text)
                .setCategory(Notification.CATEGORY_CALL)
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(contentIntent)
                .build();
        }

        return new Notification.Builder(this)
            .setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("StudyCo call")
            .setContentText(text)
            .setCategory(Notification.CATEGORY_CALL)
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setContentIntent(contentIntent)
            .build();
    }

    private int pendingIntentImmutableFlag() {
        return Build.VERSION.SDK_INT >= Build.VERSION_CODES.M
            ? PendingIntent.FLAG_IMMUTABLE
            : 0;
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
package com.duelistraj.aurumpos;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.ClipData;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.IOException;
import java.util.Locale;

@CapacitorPlugin(
    name = "AurumFileNotifications",
    permissions = @Permission(
        strings = { Manifest.permission.POST_NOTIFICATIONS },
        alias = AurumFileNotificationsPlugin.NOTIFICATION_PERMISSION
    )
)
public class AurumFileNotificationsPlugin extends Plugin {
    static final String NOTIFICATION_PERMISSION = "display";
    static final String CHANNEL_ID = "aurum_downloads";
    private static final String PDF_MIME_TYPE = "application/pdf";
    private static final String XLSX_MIME_TYPE =
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

    @Override
    public void load() {
        super.load();
        createNotificationChannel();
    }

    @PluginMethod
    public void showDownloadedFile(PluginCall call) {
        if (
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
            getPermissionState(NOTIFICATION_PERMISSION) != PermissionState.GRANTED
        ) {
            requestPermissionForAlias(
                NOTIFICATION_PERMISSION,
                call,
                "notificationPermissionCallback"
            );
            return;
        }
        displayNotification(call);
    }

    @PermissionCallback
    private void notificationPermissionCallback(PluginCall call) {
        if (getPermissionState(NOTIFICATION_PERMISSION) != PermissionState.GRANTED) {
            resolveDisplayed(call, false);
            return;
        }
        displayNotification(call);
    }

    @SuppressLint("MissingPermission")
    private void displayNotification(PluginCall call) {
        String rawUri = call.getString("uri");
        if (rawUri == null || rawUri.isBlank()) {
            call.reject("uri is required");
            return;
        }

        try {
            File file = resolveDownloadedFile(rawUri);
            String mimeType = mimeTypeFor(file);
            if (mimeType == null) {
                call.reject("Only PDF and XLSX downloads can be opened");
                return;
            }

            NotificationManagerCompat notifications = NotificationManagerCompat.from(getContext());
            if (!notifications.areNotificationsEnabled()) {
                resolveDisplayed(call, false);
                return;
            }

            Uri contentUri = FileProvider.getUriForFile(
                getContext(),
                getContext().getPackageName() + ".fileprovider",
                file
            );
            int notificationId = notificationIdFor(file);
            PendingIntent openFile = PendingIntent.getActivity(
                getContext(),
                notificationId,
                buildOpenIntent(contentUri, mimeType, file.getName()),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
            );
            NotificationCompat.Builder notification = new NotificationCompat.Builder(
                getContext(),
                CHANNEL_ID
            )
                .setSmallIcon(R.drawable.ic_notification_download)
                .setContentTitle(file.getName())
                .setContentText("Download complete - tap to open")
                .setCategory(NotificationCompat.CATEGORY_STATUS)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setOnlyAlertOnce(true)
                .setContentIntent(openFile)
                .addAction(android.R.drawable.ic_menu_view, "Open", openFile);

            notifications.notify(notificationId, notification.build());
            resolveDisplayed(call, true);
        } catch (SecurityException | IllegalArgumentException | IOException exception) {
            call.reject("Unable to create a notification for this download", exception);
        }
    }

    private File resolveDownloadedFile(String rawUri) throws IOException {
        Uri uri = Uri.parse(rawUri);
        if (!"file".equalsIgnoreCase(uri.getScheme()) || uri.getPath() == null) {
            throw new IllegalArgumentException("Downloaded file must use a file URI");
        }

        File documents = Environment
            .getExternalStoragePublicDirectory(Environment.DIRECTORY_DOCUMENTS)
            .getCanonicalFile();
        File file = new File(uri.getPath()).getCanonicalFile();
        if (!isWithinDirectory(documents, file) || !file.isFile()) {
            throw new IllegalArgumentException("Downloaded file is outside Documents or missing");
        }
        return file;
    }

    static boolean isWithinDirectory(File directory, File candidate) throws IOException {
        String directoryPath = directory.getCanonicalPath();
        String candidatePath = candidate.getCanonicalPath();
        return candidatePath.startsWith(directoryPath + File.separator);
    }

    static String mimeTypeFor(File file) {
        String name = file.getName().toLowerCase(Locale.ROOT);
        if (name.endsWith(".pdf")) {
            return PDF_MIME_TYPE;
        }
        if (name.endsWith(".xlsx")) {
            return XLSX_MIME_TYPE;
        }
        return null;
    }

    private Intent buildOpenIntent(Uri contentUri, String mimeType, String fileName) {
        Intent openFile = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(contentUri, mimeType)
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        openFile.setClipData(ClipData.newRawUri(fileName, contentUri));
        if (openFile.resolveActivity(getContext().getPackageManager()) != null) {
            return openFile;
        }

        Intent genericViewer = new Intent(Intent.ACTION_VIEW)
            .setDataAndType(contentUri, "*/*")
            .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        genericViewer.setClipData(ClipData.newRawUri(fileName, contentUri));
        if (genericViewer.resolveActivity(getContext().getPackageManager()) != null) {
            return genericViewer;
        }

        return new Intent(Intent.ACTION_OPEN_DOCUMENT)
            .addCategory(Intent.CATEGORY_OPENABLE)
            .setType(mimeType)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
    }

    private static int notificationIdFor(File file) throws IOException {
        int value = file.getCanonicalPath().hashCode() & Integer.MAX_VALUE;
        return value == 0 ? 1 : value;
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
            return;
        }
        NotificationChannel channel = new NotificationChannel(
            CHANNEL_ID,
            "Downloads",
            NotificationManager.IMPORTANCE_DEFAULT
        );
        channel.setDescription("Completed Aurum POS file downloads");
        NotificationManager manager = (NotificationManager) getContext()
            .getSystemService(Context.NOTIFICATION_SERVICE);
        manager.createNotificationChannel(channel);
    }

    private static void resolveDisplayed(PluginCall call, boolean displayed) {
        JSObject result = new JSObject();
        result.put("displayed", displayed);
        call.resolve(result);
    }
}

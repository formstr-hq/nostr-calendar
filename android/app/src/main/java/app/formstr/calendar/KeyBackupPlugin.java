package app.formstr.calendar;

import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Context;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.MediaStore;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.OutputStream;
import java.nio.charset.StandardCharsets;

/** Native clipboard and Downloads support for exported text files. */
@CapacitorPlugin(name = "KeyBackup")
public class KeyBackupPlugin extends Plugin {
    @PluginMethod
    public void copyText(PluginCall call) {
        String text = call.getString("text");
        if (text == null) {
            call.reject("text is required");
            return;
        }

        ClipboardManager clipboard = (ClipboardManager) getContext()
                .getSystemService(Context.CLIPBOARD_SERVICE);
        if (clipboard == null) {
            call.reject("Clipboard is unavailable");
            return;
        }

        clipboard.setPrimaryClip(ClipData.newPlainText("Nostr Calendar key backup", text));
        call.resolve();
    }

    @PluginMethod
    public void saveFile(PluginCall call) {
        String text = call.getString("text");
        String fileName = call.getString("fileName");
        String mimeType = call.getString("mimeType");
        if (text == null || fileName == null || mimeType == null) {
            call.reject("text, fileName, and mimeType are required");
            return;
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) {
            call.reject("Saving key files requires Android 10 or later");
            return;
        }

        ContentValues values = new ContentValues();
        values.put(MediaStore.Downloads.DISPLAY_NAME, fileName);
        values.put(MediaStore.Downloads.MIME_TYPE, mimeType);
        values.put(MediaStore.Downloads.RELATIVE_PATH, Environment.DIRECTORY_DOWNLOADS);
        values.put(MediaStore.Downloads.IS_PENDING, 1);

        Uri uri = getContext().getContentResolver().insert(
                MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
        if (uri == null) {
            call.reject("Could not create key file in Downloads");
            return;
        }

        try (OutputStream output = getContext().getContentResolver().openOutputStream(uri)) {
            if (output == null) throw new IllegalStateException("Could not open file");
            output.write(text.getBytes(StandardCharsets.UTF_8));
            output.flush();

            ContentValues completed = new ContentValues();
            completed.put(MediaStore.Downloads.IS_PENDING, 0);
            getContext().getContentResolver().update(uri, completed, null, null);

            JSObject result = new JSObject();
            result.put("uri", uri.toString());
            call.resolve(result);
        } catch (Exception error) {
            getContext().getContentResolver().delete(uri, null, null);
            call.reject("Could not save file", error);
        }
    }
}

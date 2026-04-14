package app.formstr.calendar;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "SecureKeyStorage")
public class SecureKeyStoragePlugin extends Plugin {
    private static final String PREFS_NAME = "nostr_secure_key_storage";

    private SharedPreferences getSecurePreferences() throws Exception {
        Context context = getContext();
        MasterKey masterKey = new MasterKey.Builder(context)
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();

        return EncryptedSharedPreferences.create(
                context,
                PREFS_NAME,
                masterKey,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        );
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");

        if (key == null || key.isEmpty()) {
            call.reject("Key is required");
            return;
        }

        if (value == null) {
            call.reject("Value is required");
            return;
        }

        try {
            getSecurePreferences().edit().putString(key, value).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to securely store value", e);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");

        if (key == null || key.isEmpty()) {
            call.reject("Key is required");
            return;
        }

        try {
            String value = getSecurePreferences().getString(key, null);
            JSObject result = new JSObject();
            result.put("value", value);
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Failed to securely load value", e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");

        if (key == null || key.isEmpty()) {
            call.reject("Key is required");
            return;
        }

        try {
            getSecurePreferences().edit().remove(key).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to securely remove value", e);
        }
    }
}

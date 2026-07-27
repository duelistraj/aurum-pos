package com.duelistraj.aurumpos;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONObject;

import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.Map;

@CapacitorPlugin(name = "AurumSecureStorage")
public class AurumSecureStoragePlugin extends Plugin {
    private AurumSecureStorage storage;

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value are required");
            return;
        }
        try {
            Map<String, String> values = new LinkedHashMap<>();
            values.put(key, value);
            storage().setMany(values);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to securely store authentication data", exception);
        }
    }

    @PluginMethod
    public void setMany(PluginCall call) {
        JSObject input = call.getObject("values");
        if (input == null || input.length() == 0) {
            call.reject("values are required");
            return;
        }
        Map<String, String> values = new LinkedHashMap<>();
        Iterator<String> keys = input.keys();
        while (keys.hasNext()) {
            String key = keys.next();
            String value = input.optString(key, null);
            if (value == null) {
                call.reject("Storage values must be strings");
                return;
            }
            values.put(key, value);
        }
        try {
            storage().setMany(values);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to securely store authentication data", exception);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        try {
            String value = storage().get(key);
            JSObject result = new JSObject();
            result.put("value", value == null ? JSONObject.NULL : value);
            call.resolve(result);
        } catch (Exception exception) {
            call.reject("Unable to read secure authentication data", exception);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) {
            call.reject("key is required");
            return;
        }
        try {
            storage().remove(key);
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to remove secure authentication data", exception);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            storage().clear();
            call.resolve();
        } catch (Exception exception) {
            call.reject("Unable to clear secure authentication data", exception);
        }
    }

    private AurumSecureStorage storage() {
        if (storage == null) {
            storage = new AurumSecureStorage(getContext());
        }
        return storage;
    }
}

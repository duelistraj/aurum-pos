package com.duelistraj.aurumpos;

import android.content.Context;
import android.content.SharedPreferences;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.Key;
import java.security.KeyStore;
import java.util.LinkedHashMap;
import java.util.Map;

import javax.crypto.Cipher;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;

final class AurumSecureStorage {
    static final String KEY_ALIAS = "aurum_pos_auth_storage_v1";
    static final String PREFERENCES_NAME = "aurum_pos_secure_storage";

    private static final Object STORAGE_LOCK = new Object();
    private static final int IV_LENGTH = 12;
    private static final int GCM_TAG_BITS = 128;

    private final Context context;

    AurumSecureStorage(Context context) {
        this.context = context.getApplicationContext();
    }

    void setMany(Map<String, String> values) throws Exception {
        if (values.isEmpty()) {
            throw new IllegalArgumentException("At least one value is required");
        }
        for (Map.Entry<String, String> entry : values.entrySet()) {
            if (entry.getKey() == null || entry.getValue() == null) {
                throw new IllegalArgumentException("Storage keys and values are required");
            }
        }

        synchronized (STORAGE_LOCK) {
            try {
                writeEncrypted(values);
            } catch (Exception firstFailure) {
                reset();
                try {
                    writeEncrypted(values);
                } catch (Exception retryFailure) {
                    retryFailure.addSuppressed(firstFailure);
                    throw retryFailure;
                }
            }
        }
    }

    String get(String key) throws Exception {
        synchronized (STORAGE_LOCK) {
            String payload = preferences().getString(key, null);
            if (payload == null) {
                return null;
            }
            try {
                return decrypt(payload);
            } catch (Exception exception) {
                reset();
                return null;
            }
        }
    }

    void remove(String key) throws IOException {
        synchronized (STORAGE_LOCK) {
            if (!preferences().edit().remove(key).commit()) {
                throw new IOException("Unable to remove secure authentication data");
            }
        }
    }

    void clear() throws Exception {
        synchronized (STORAGE_LOCK) {
            reset();
        }
    }

    private SharedPreferences preferences() {
        return context.getSharedPreferences(PREFERENCES_NAME, Context.MODE_PRIVATE);
    }

    private void writeEncrypted(Map<String, String> values) throws Exception {
        Map<String, String> encrypted = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : values.entrySet()) {
            encrypted.put(entry.getKey(), encrypt(entry.getValue()));
        }

        SharedPreferences.Editor editor = preferences().edit();
        for (Map.Entry<String, String> entry : encrypted.entrySet()) {
            editor.putString(entry.getKey(), entry.getValue());
        }
        if (!editor.commit()) {
            throw new IOException("Unable to persist secure authentication data");
        }
    }

    private SecretKey getOrCreateKey() throws Exception {
        KeyStore keyStore = keyStore();
        Key key = keyStore.getKey(KEY_ALIAS, null);
        if (key instanceof SecretKey) {
            return (SecretKey) key;
        }
        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS);
        }

        KeyGenerator generator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        );
        generator.init(
            new KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .build()
        );
        return generator.generateKey();
    }

    private String encrypt(String value) throws Exception {
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.ENCRYPT_MODE, getOrCreateKey());
        byte[] iv = cipher.getIV();
        if (iv == null || iv.length != IV_LENGTH) {
            throw new IllegalStateException("Android Keystore returned an invalid GCM IV");
        }
        byte[] ciphertext = cipher.doFinal(value.getBytes(StandardCharsets.UTF_8));
        byte[] payload = new byte[iv.length + ciphertext.length];
        System.arraycopy(iv, 0, payload, 0, iv.length);
        System.arraycopy(ciphertext, 0, payload, iv.length, ciphertext.length);
        return Base64.encodeToString(payload, Base64.NO_WRAP);
    }

    private String decrypt(String payload) throws Exception {
        byte[] bytes = Base64.decode(payload, Base64.NO_WRAP);
        if (bytes.length <= IV_LENGTH) {
            throw new IllegalArgumentException("Invalid encrypted payload");
        }
        byte[] iv = new byte[IV_LENGTH];
        byte[] ciphertext = new byte[bytes.length - IV_LENGTH];
        System.arraycopy(bytes, 0, iv, 0, IV_LENGTH);
        System.arraycopy(bytes, IV_LENGTH, ciphertext, 0, ciphertext.length);
        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        cipher.init(Cipher.DECRYPT_MODE, getOrCreateKey(), new GCMParameterSpec(GCM_TAG_BITS, iv));
        return new String(cipher.doFinal(ciphertext), StandardCharsets.UTF_8);
    }

    private void reset() throws Exception {
        if (!preferences().edit().clear().commit()) {
            throw new IOException("Unable to reset secure authentication data");
        }
        KeyStore keyStore = keyStore();
        if (keyStore.containsAlias(KEY_ALIAS)) {
            keyStore.deleteEntry(KEY_ALIAS);
        }
    }

    private static KeyStore keyStore() throws Exception {
        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        return keyStore;
    }
}

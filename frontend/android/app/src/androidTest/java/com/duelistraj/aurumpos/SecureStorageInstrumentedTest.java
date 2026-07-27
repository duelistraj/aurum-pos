package com.duelistraj.aurumpos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;

import android.content.Context;

import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;

import org.junit.After;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;

import java.security.KeyStore;
import java.util.LinkedHashMap;
import java.util.Map;

@RunWith(AndroidJUnit4.class)
public class SecureStorageInstrumentedTest {
    private static final String ACCESS_TOKEN_KEY = "aurum:v1:access_token";
    private static final String REFRESH_TOKEN_KEY = "aurum:v1:refresh_token";

    private Context context;
    private AurumSecureStorage storage;

    @Before
    public void setUp() throws Exception {
        context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        storage = new AurumSecureStorage(context);
        storage.clear();
    }

    @After
    public void tearDown() throws Exception {
        storage.clear();
    }

    @Test
    public void storesBothTokensAtomicallyAndKeepsPlaintextOutOfPreferences() throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        values.put(ACCESS_TOKEN_KEY, "access-token-value");
        values.put(REFRESH_TOKEN_KEY, "refresh-token-value");

        storage.setMany(values);

        assertEquals("access-token-value", storage.get(ACCESS_TOKEN_KEY));
        assertEquals("refresh-token-value", storage.get(REFRESH_TOKEN_KEY));
        Map<String, ?> persisted = context
            .getSharedPreferences(AurumSecureStorage.PREFERENCES_NAME, Context.MODE_PRIVATE)
            .getAll();
        assertFalse(persisted.values().contains("access-token-value"));
        assertFalse(persisted.values().contains("refresh-token-value"));
    }

    @Test
    public void overwritesAndRemovesStoredTokens() throws Exception {
        Map<String, String> initial = new LinkedHashMap<>();
        initial.put(ACCESS_TOKEN_KEY, "old-access-token");
        initial.put(REFRESH_TOKEN_KEY, "old-refresh-token");
        storage.setMany(initial);

        Map<String, String> replacement = new LinkedHashMap<>();
        replacement.put(ACCESS_TOKEN_KEY, "new-access-token");
        replacement.put(REFRESH_TOKEN_KEY, "new-refresh-token");
        storage.setMany(replacement);
        storage.remove(ACCESS_TOKEN_KEY);

        assertNull(storage.get(ACCESS_TOKEN_KEY));
        assertEquals("new-refresh-token", storage.get(REFRESH_TOKEN_KEY));
    }

    @Test
    public void corruptCiphertextClearsUnusableAuthenticationState() throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        values.put(ACCESS_TOKEN_KEY, "access-token-value");
        values.put(REFRESH_TOKEN_KEY, "refresh-token-value");
        storage.setMany(values);
        context
            .getSharedPreferences(AurumSecureStorage.PREFERENCES_NAME, Context.MODE_PRIVATE)
            .edit()
            .putString(ACCESS_TOKEN_KEY, "not-valid-ciphertext")
            .commit();

        assertNull(storage.get(ACCESS_TOKEN_KEY));
        assertNull(storage.get(REFRESH_TOKEN_KEY));
    }

    @Test
    public void missingKeystoreKeyClearsCiphertextAndAllowsFreshStorage() throws Exception {
        Map<String, String> values = new LinkedHashMap<>();
        values.put(ACCESS_TOKEN_KEY, "access-token-value");
        values.put(REFRESH_TOKEN_KEY, "refresh-token-value");
        storage.setMany(values);

        KeyStore keyStore = KeyStore.getInstance("AndroidKeyStore");
        keyStore.load(null);
        keyStore.deleteEntry(AurumSecureStorage.KEY_ALIAS);

        assertNull(storage.get(ACCESS_TOKEN_KEY));
        assertNull(storage.get(REFRESH_TOKEN_KEY));

        Map<String, String> replacement = new LinkedHashMap<>();
        replacement.put(ACCESS_TOKEN_KEY, "replacement-access-token");
        replacement.put(REFRESH_TOKEN_KEY, "replacement-refresh-token");
        storage.setMany(replacement);
        assertEquals("replacement-access-token", storage.get(ACCESS_TOKEN_KEY));
        assertEquals("replacement-refresh-token", storage.get(REFRESH_TOKEN_KEY));
    }
}

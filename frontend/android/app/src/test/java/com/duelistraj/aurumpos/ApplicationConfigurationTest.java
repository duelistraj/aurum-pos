package com.duelistraj.aurumpos;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class ApplicationConfigurationTest {

    @Test
    public void applicationIdIsNotTheCapacitorPlaceholder() {
        assertTrue(BuildConfig.APPLICATION_ID.matches(
            "[a-zA-Z][a-zA-Z0-9_]*(\\.[a-zA-Z][a-zA-Z0-9_]*)+"
        ));
        assertFalse(BuildConfig.APPLICATION_ID.startsWith("com.getcapacitor."));
    }
}

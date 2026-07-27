package com.duelistraj.aurumpos;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;

import android.content.Context;
import android.content.pm.ApplicationInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class ManifestSecurityTest {

    @Test
    public void manifestUsesExpectedIdentityAndDisablesBackupAndCleartext() {
        Context appContext = InstrumentationRegistry.getInstrumentation().getTargetContext();
        ApplicationInfo applicationInfo = appContext.getApplicationInfo();

        assertEquals(BuildConfig.APPLICATION_ID, appContext.getPackageName());
        assertFalse((applicationInfo.flags & ApplicationInfo.FLAG_ALLOW_BACKUP) != 0);
        assertFalse((applicationInfo.flags & ApplicationInfo.FLAG_USES_CLEARTEXT_TRAFFIC) != 0);
    }
}

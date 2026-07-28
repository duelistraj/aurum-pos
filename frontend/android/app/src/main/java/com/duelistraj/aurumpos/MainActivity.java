package com.duelistraj.aurumpos;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AurumBillingPlugin.class);
        registerPlugin(AurumFileNotificationsPlugin.class);
        registerPlugin(AurumGoogleAuthPlugin.class);
        registerPlugin(AurumSecureStoragePlugin.class);
        super.onCreate(savedInstanceState);
    }
}

package com.duelistraj.aurumpos;

import com.getcapacitor.BridgeActivity;
import android.os.Bundle;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AurumBillingPlugin.class);
        registerPlugin(AurumGoogleAuthPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

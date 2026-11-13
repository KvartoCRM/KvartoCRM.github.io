package com.lumicrm.office;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(VoiceInputPlugin.class);
        super.onCreate(savedInstanceState);
    }
}

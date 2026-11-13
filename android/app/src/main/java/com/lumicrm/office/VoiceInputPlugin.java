package com.lumicrm.office;

import android.app.Activity;
import android.content.Intent;
import android.speech.RecognizerIntent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.util.ArrayList;

@CapacitorPlugin(name = "VoiceInput")
public class VoiceInputPlugin extends Plugin {
    @PluginMethod
    public void recognize(PluginCall call) {
        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "ru-RU");
        intent.putExtra(RecognizerIntent.EXTRA_PROMPT, "Расскажите, что нужно записать");
        try { startActivityForResult(call, intent, "recognized"); }
        catch (Exception error) { call.reject("Speech recognition unavailable"); }
    }
    @ActivityCallback
    private void recognized(PluginCall call, ActivityResult result) {
        if (call == null) return;
        ArrayList<String> texts = result.getResultCode() == Activity.RESULT_OK && result.getData() != null
            ? result.getData().getStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS) : null;
        JSObject response = new JSObject();
        response.put("text", texts != null && !texts.isEmpty() ? texts.get(0) : "");
        call.resolve(response);
    }
}

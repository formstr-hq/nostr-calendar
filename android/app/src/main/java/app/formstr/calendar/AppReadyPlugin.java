package app.formstr.calendar;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "AppReady")
public class AppReadyPlugin extends Plugin {

    @PluginMethod
    public void notifyReady(PluginCall call) {
        if (getActivity() instanceof MainActivity) {
            ((MainActivity) getActivity()).onWebAppReady();
        }
        call.resolve();
    }
}

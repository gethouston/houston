package ai.gethouston.app;

import com.getcapacitor.BridgeActivity;
import com.getcapacitor.PluginLoadException;
import com.getcapacitor.PluginManager;
import com.getcapacitor.Logger;
import java.util.List;
import java.util.stream.Collectors;

public class MainActivity extends BridgeActivity {
    @Override
    protected void load() {
        // FirebaseAuthentication initializes FirebaseAuth during plugin load.
        // Without google-services.json that throws before the email sign-in UI boots.
        if (!getResources().getBoolean(R.bool.houston_firebase_config_present)) {
            try {
                List<Class<? extends com.getcapacitor.Plugin>> plugins =
                    new PluginManager(getAssets()).loadPluginClasses().stream()
                        .filter(plugin -> !plugin.getName().equals(
                            "io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin"))
                        .collect(Collectors.toList());
                bridgeBuilder.setPlugins(plugins);
            } catch (PluginLoadException error) {
                Logger.error("Could not filter unconfigured Firebase Authentication plugin", error);
            }
        }
        super.load();
    }
}

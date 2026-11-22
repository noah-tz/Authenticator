package il.co.dinains.authenticatorfolders;

import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.GoogleAuthUtil;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.auth.api.identity.RevokeAccessRequest;
import com.google.android.gms.common.api.Scope;
import java.util.Collections;

/**
 * Google Identity Services AuthorizationClient: returns a Drive access token for
 * this app (matched by package name + signing SHA-1). No client ID, no redirect.
 */
@CapacitorPlugin(name = "GoogleAuthorization")
public class GoogleAuthorizationPlugin extends Plugin {

    private static final String DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.appdata";

    private ActivityResultLauncher<IntentSenderRequest> consentLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        consentLauncher = getBridge().registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) {
                    return;
                }
                try {
                    AuthorizationResult authorization = Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(result.getData());
                    resolveToken(call, authorization);
                } catch (Exception e) {
                    // user dismissed or denied the consent screen
                    call.reject("Authorization was not granted", "AUTH_DENIED");
                }
            }
        );
    }

    @PluginMethod
    public void authorize(PluginCall call) {
        final boolean interactive = Boolean.TRUE.equals(call.getBoolean("interactive", false));
        AuthorizationRequest request = AuthorizationRequest.builder()
            .setRequestedScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .authorize(request)
            .addOnSuccessListener(authorization -> {
                if (!authorization.hasResolution()) {
                    resolveToken(call, authorization);
                    return;
                }
                if (!interactive) {
                    call.reject("User consent is required", "CONSENT_REQUIRED");
                    return;
                }
                if (pendingCall != null) {
                    call.reject("Another authorization is in progress", "BUSY");
                    return;
                }
                try {
                    pendingCall = call;
                    consentLauncher.launch(
                        new IntentSenderRequest.Builder(authorization.getPendingIntent().getIntentSender()).build()
                    );
                } catch (Exception e) {
                    pendingCall = null;
                    call.reject("Could not open the consent screen", "AUTH_FAILED");
                }
            })
            .addOnFailureListener(e -> call.reject("Authorization failed", "AUTH_FAILED"));
    }

    @PluginMethod
    public void clearToken(PluginCall call) {
        final String token = call.getString("accessToken");
        if (token == null || token.isEmpty()) {
            call.resolve();
            return;
        }
        // GoogleAuthUtil.clearToken does network I/O: keep it off the main thread
        new Thread(() -> {
            try {
                GoogleAuthUtil.clearToken(getContext(), token);
            } catch (Exception e) {
                // best effort
            }
            call.resolve();
        }).start();
    }

    @PluginMethod
    public void signOut(PluginCall call) {
        // Revokes this app's Drive access; the next authorize() asks for consent again.
        RevokeAccessRequest request = RevokeAccessRequest.builder()
            .setScopes(Collections.singletonList(new Scope(DRIVE_SCOPE)))
            .build();
        Identity.getAuthorizationClient(getActivity())
            .revokeAccess(request)
            .addOnSuccessListener(unused -> call.resolve())
            .addOnFailureListener(e -> call.reject("Revoke failed", "AUTH_FAILED"));
    }

    private void resolveToken(PluginCall call, AuthorizationResult authorization) {
        String token = authorization.getAccessToken();
        if (token == null || token.isEmpty()) {
            call.reject("No access token", "AUTH_FAILED");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("accessToken", token);
        call.resolve(ret);
    }
}

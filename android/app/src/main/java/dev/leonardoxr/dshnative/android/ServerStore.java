package dev.leonardoxr.dshnative.android;

import android.content.Context;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

final class ServerStore {
    private static final String PREFS = "servers";
    private static final String KEY_DATA = "data";
    private static final String KEY_LAST = "lastConnectedId";

    private final SharedPreferences preferences;
    private final List<Server> servers = new ArrayList<>();
    private String lastConnectedId;

    ServerStore(Context context) {
        preferences = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        load();
    }

    List<Server> ordered() {
        List<Server> result = new ArrayList<>(servers);
        result.sort(Comparator
                .comparingLong((Server server) -> server.lastUsedAt).reversed()
                .thenComparing(server -> server.name, String.CASE_INSENSITIVE_ORDER));
        return result;
    }

    Server find(String id) {
        for (Server server : servers) {
            if (server.id.equals(id)) return server;
        }
        return null;
    }

    Server lastConnected() {
        return lastConnectedId == null ? null : find(lastConnectedId);
    }

    void upsert(String id, String name, String rawUrl) {
        String cleanName = name == null ? "" : name.trim();
        if (cleanName.isEmpty()) throw new IllegalArgumentException("Give this server a name.");
        String url = ServerPolicy.normalize(rawUrl);
        for (Server existing : servers) {
            if (!existing.id.equals(id == null ? "" : id) && existing.url.equals(url)) {
                throw new IllegalArgumentException("That server is already in your list.");
            }
        }
        Server target = id == null ? null : find(id);
        if (target == null) {
            servers.add(new Server(cleanName, url));
        } else {
            if (!target.url.equals(url)) target.trustedCertificateFingerprint = null;
            target.name = cleanName;
            target.url = url;
        }
        save();
    }

    void trustCertificate(String id, String fingerprint) {
        Server target = find(id);
        if (target == null) throw new IllegalArgumentException("The selected server no longer exists.");
        if (!ServerPolicy.isSha256Fingerprint(fingerprint)) {
            throw new IllegalArgumentException("The certificate fingerprint is unavailable.");
        }
        target.trustedCertificateFingerprint = fingerprint;
        save();
    }

    void clearCertificateTrust(String id) {
        Server target = find(id);
        if (target == null) return;
        target.trustedCertificateFingerprint = null;
        save();
    }

    void markConnected(Server server) {
        Server stored = find(server.id);
        if (stored == null) return;
        stored.lastUsedAt = System.currentTimeMillis();
        lastConnectedId = stored.id;
        save();
    }

    void delete(Server server) {
        servers.removeIf(item -> item.id.equals(server.id));
        if (server.id.equals(lastConnectedId)) lastConnectedId = null;
        save();
    }

    void clearLastConnected() {
        lastConnectedId = null;
        save();
    }

    private void load() {
        try {
            JSONArray array = new JSONArray(preferences.getString(KEY_DATA, "[]"));
            for (int index = 0; index < array.length(); index++) {
                JSONObject object = array.optJSONObject(index);
                if (object == null) continue;
                Server server = Server.fromJson(object);
                if (server == null) continue;
                String normalized = ServerPolicy.normalize(server.url);
                server.url = normalized;
                boolean duplicate = false;
                for (Server existing : servers) {
                    if (existing.url.equals(normalized)) {
                        duplicate = true;
                        break;
                    }
                }
                if (!duplicate) servers.add(server);
            }
            lastConnectedId = preferences.getString(KEY_LAST, null);
            if (lastConnected() == null) lastConnectedId = null;
        } catch (Exception ignored) {
            servers.clear();
            lastConnectedId = null;
        }
    }

    private void save() {
        JSONArray array = new JSONArray();
        try {
            for (Server server : servers) array.put(server.toJson());
        } catch (JSONException ignored) {
            return;
        }
        preferences.edit()
                .putString(KEY_DATA, array.toString())
                .putString(KEY_LAST, lastConnectedId == null ? "" : lastConnectedId)
                .apply();
    }
}

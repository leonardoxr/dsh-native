package dev.leonardoxr.dshnative.android;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.UUID;

final class Server {
    final String id;
    String name;
    String url;
    long lastUsedAt;
    String trustedCertificateFingerprint;

    Server(String name, String url) {
        this(UUID.randomUUID().toString(), name, url, 0L, null);
    }

    Server(String id, String name, String url, long lastUsedAt, String trustedCertificateFingerprint) {
        this.id = id;
        this.name = name;
        this.url = url;
        this.lastUsedAt = lastUsedAt;
        this.trustedCertificateFingerprint = trustedCertificateFingerprint;
    }

    JSONObject toJson() throws JSONException {
        return new JSONObject()
                .put("id", id)
                .put("name", name)
                .put("url", url)
                .put("lastUsedAt", lastUsedAt)
                .put("trustedCertificateFingerprint", trustedCertificateFingerprint == null ? "" : trustedCertificateFingerprint);
    }

    static Server fromJson(JSONObject object) {
        String id = object.optString("id", UUID.randomUUID().toString());
        String name = object.optString("name", "").trim();
        String url = object.optString("url", "");
        long lastUsedAt = object.optLong("lastUsedAt", 0L);
        String fingerprint = object.optString("trustedCertificateFingerprint", "").trim();
        if (!ServerPolicy.isSha256Fingerprint(fingerprint)) fingerprint = null;
        if (name.isEmpty() || url.isEmpty()) return null;
        return new Server(id, name, url, lastUsedAt, fingerprint);
    }
}

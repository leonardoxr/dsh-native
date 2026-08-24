package dev.leonardoxr.dshnative.android;

import java.net.URI;
import java.net.URISyntaxException;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Locale;

final class ServerPolicy {
    private ServerPolicy() {}

    static String normalize(String input) throws IllegalArgumentException {
        String trimmed = input == null ? "" : input.trim();
        if (trimmed.isEmpty()) throw new IllegalArgumentException("Enter a server address.");
        String candidate = trimmed.contains("://") ? trimmed : "https://" + trimmed;
        final URI parsed;
        try {
            parsed = new URI(candidate);
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Enter a valid server hostname.");
        }
        if (!"https".equalsIgnoreCase(parsed.getScheme())) {
            throw new IllegalArgumentException("The server must use HTTPS.");
        }
        if (parsed.getHost() == null || parsed.getHost().isEmpty()) {
            throw new IllegalArgumentException("Enter a valid server hostname.");
        }
        if (parsed.getUserInfo() != null) {
            throw new IllegalArgumentException("Put credentials in the server’s sign-in page, not in its URL.");
        }
        int port = parsed.getPort();
        if (port == 443) port = -1;
        String path = parsed.getRawPath();
        if (path == null || path.isEmpty()) path = "/";
        try {
            return new URI(
                    "https",
                    null,
                    parsed.getHost().toLowerCase(Locale.ROOT),
                    port,
                    path,
                    parsed.getRawQuery(),
                    parsed.getRawFragment()
            ).toASCIIString();
        } catch (URISyntaxException error) {
            throw new IllegalArgumentException("Enter a valid server hostname.");
        }
    }

    static boolean sameOrigin(String candidate, String trusted) {
        if (candidate == null || trusted == null) return false;
        try {
            URI left = new URI(candidate);
            URI right = new URI(trusted);
            int leftPort = left.getPort() < 0 ? 443 : left.getPort();
            int rightPort = right.getPort() < 0 ? 443 : right.getPort();
            return "https".equalsIgnoreCase(left.getScheme())
                    && "https".equalsIgnoreCase(right.getScheme())
                    && leftPort == rightPort
                    && left.getHost() != null
                    && right.getHost() != null
                    && left.getHost().equalsIgnoreCase(right.getHost());
        } catch (URISyntaxException error) {
            return false;
        }
    }

    static boolean isSha256Fingerprint(String value) {
        if (value == null) return false;
        String[] bytes = value.split(":", -1);
        if (bytes.length != 32) return false;
        for (String item : bytes) {
            if (item.length() != 2
                    || Character.digit(item.charAt(0), 16) < 0
                    || Character.digit(item.charAt(1), 16) < 0) {
                return false;
            }
        }
        return true;
    }

    static String sha256Fingerprint(byte[] derCertificate) {
        if (derCertificate == null || derCertificate.length == 0) return null;
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(derCertificate);
            StringBuilder result = new StringBuilder(digest.length * 3 - 1);
            for (byte value : digest) {
                if (result.length() > 0) result.append(':');
                result.append(String.format(Locale.ROOT, "%02X", value & 0xFF));
            }
            return result.toString();
        } catch (NoSuchAlgorithmException error) {
            return null;
        }
    }

    static boolean mayOpenExternally(String url) {
        try {
            String scheme = new URI(url).getScheme();
            if (scheme == null) return false;
            String normalized = scheme.toLowerCase(Locale.ROOT);
            return normalized.equals("https")
                    || normalized.equals("mailto")
                    || normalized.equals("tel")
                    || normalized.equals("sms");
        } catch (URISyntaxException error) {
            return false;
        }
    }
}

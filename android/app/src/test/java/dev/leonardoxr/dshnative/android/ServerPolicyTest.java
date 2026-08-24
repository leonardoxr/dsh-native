package dev.leonardoxr.dshnative.android;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public final class ServerPolicyTest {
    @Test
    public void fingerprintsCertificateBytesWithSha256() {
        assertEquals(
                "6E:34:0B:9C:FF:B3:7A:98:9C:A5:44:E6:BB:78:0A:2C:78:90:1D:3F:B3:37:38:76:85:11:A3:06:17:AF:A0:1D",
                ServerPolicy.sha256Fingerprint(new byte[] {0})
        );
        assertTrue(ServerPolicy.isSha256Fingerprint(
                "6E:34:0B:9C:FF:B3:7A:98:9C:A5:44:E6:BB:78:0A:2C:78:90:1D:3F:B3:37:38:76:85:11:A3:06:17:AF:A0:1D"
        ));
        assertFalse(ServerPolicy.isSha256Fingerprint("AA:BB:CC"));
    }

    @Test
    public void normalizesTrustedHttpsHosts() {
        assertEquals("https://example.com/", ServerPolicy.normalize("example.com"));
        assertEquals("https://example.com/path?q=1", ServerPolicy.normalize("HTTPS://EXAMPLE.COM:443/path?q=1"));
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsNonHttpsHosts() {
        ServerPolicy.normalize("http://example.com");
    }

    @Test(expected = IllegalArgumentException.class)
    public void rejectsEmbeddedCredentials() {
        ServerPolicy.normalize("https://user:secret@example.com");
    }

    @Test
    public void classifiesOriginsAndExternalSchemes() {
        assertTrue(ServerPolicy.sameOrigin("https://example.com/a", "https://example.com/b"));
        assertFalse(ServerPolicy.sameOrigin("https://other.example.com/", "https://example.com/"));
        assertTrue(ServerPolicy.mayOpenExternally("mailto:user@example.com"));
        assertTrue(ServerPolicy.mayOpenExternally("https://example.com"));
        assertFalse(ServerPolicy.mayOpenExternally("javascript:alert(1)"));
    }
}

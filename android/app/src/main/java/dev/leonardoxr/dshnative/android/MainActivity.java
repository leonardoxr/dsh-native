package dev.leonardoxr.dshnative.android;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.text.InputType;
import android.text.format.DateUtils;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.SslErrorHandler;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.webkit.WebStorage;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.PopupMenu;
import android.widget.ProgressBar;
import android.widget.ScrollView;
import android.widget.Space;
import android.widget.TextView;
import android.widget.Toast;

import java.util.List;

public final class MainActivity extends Activity {
    private static final int COLOR_BACKGROUND = R.color.background;
    private static final int COLOR_SURFACE = R.color.surface;
    private static final int COLOR_TEXT = R.color.text_primary;
    private static final int COLOR_SECONDARY = R.color.text_secondary;
    private static final int COLOR_ACCENT = R.color.accent;
    private static final int COLOR_BORDER = R.color.border;
    private static final int COLOR_WARNING = R.color.warning;

    private ServerStore store;
    private Server activeServer;
    private FrameLayout browserRoot;
    private WebView webView;
    private View drawer;
    private View drawerScrim;
    private View browserError;
    private ProgressBar loadingBar;
    private TextView certificateWarning;
    private SslErrorHandler pendingSslHandler;
    private String pendingCertificateFingerprint;
    private Button backButton;
    private Button forwardButton;
    private Button reloadButton;

    @Override
    protected void onCreate(Bundle state) {
        super.onCreate(state);
        store = new ServerStore(this);
        configureSystemBars();
        Server last = store.lastConnected();
        if (last == null) showServerPicker();
        else showBrowser(last);
    }

    private void configureSystemBars() {
        Window window = getWindow();
        boolean dark = (getResources().getConfiguration().uiMode & 0x30) == 0x20;
        window.setStatusBarColor(color(COLOR_BACKGROUND));
        window.setNavigationBarColor(color(COLOR_BACKGROUND));
        if (!dark) {
            window.getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR | View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR
            );
        } else {
            window.getDecorView().setSystemUiVisibility(0);
        }
    }

    private void showServerPicker() {
        closeBrowser();
        activeServer = null;

        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(color(COLOR_BACKGROUND));
        LinearLayout page = vertical();
        page.setPadding(dp(20), dp(20), dp(20), dp(16));
        root.addView(page, fillFrameParams());

        LinearLayout top = horizontal();
        TextView overflow = iconButton("⋯", "More options");
        overflow.setOnClickListener(view -> showPickerMenu(view));
        top.addView(overflow, fixedParams(48, 48));
        TextView title = text("Servers", 32, COLOR_TEXT);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        LinearLayout.LayoutParams titleParams = new LinearLayout.LayoutParams(0, -2, 1);
        titleParams.gravity = Gravity.CENTER_VERTICAL;
        titleParams.leftMargin = dp(10);
        top.addView(title, titleParams);
        TextView add = iconButton("+", "Add server");
        add.setTextSize(30);
        add.setOnClickListener(view -> showEditor(null));
        top.addView(add, fixedParams(48, 48));
        page.addView(top);

        Space topSpace = new Space(this);
        page.addView(topSpace, new LinearLayout.LayoutParams(1, dp(20)));

        ScrollView scroll = new ScrollView(this);
        scroll.setFillViewport(true);
        LinearLayout list = vertical();
        list.setPadding(0, 0, 0, dp(12));
        List<Server> servers = store.ordered();
        if (servers.isEmpty()) {
            addEmptyState(list);
        } else {
            TextView section = text("Trusted HTTPS hosts", 12, COLOR_SECONDARY);
            section.setAllCaps(true);
            section.setLetterSpacing(0.08f);
            section.setPadding(dp(4), dp(8), dp(4), dp(8));
            list.addView(section);
            for (Server server : servers) addServerRow(list, server);
        }
        scroll.addView(list, fillFrameParams());
        LinearLayout.LayoutParams scrollParams = new LinearLayout.LayoutParams(-1, 0, 1);
        scrollParams.topMargin = dp(8);
        page.addView(scroll, scrollParams);

        LinearLayout security = horizontal();
        security.setGravity(Gravity.CENTER_VERTICAL);
        security.setPadding(dp(8), dp(10), dp(8), dp(4));
        TextView lock = text("▣", 20, COLOR_ACCENT);
        security.addView(lock, fixedParams(32, 40));
        TextView securityText = text("Remote pages stay inside WebView. Top-level cross-origin links open in the system browser.", 12, COLOR_SECONDARY);
        securityText.setLineSpacing(0, 1.1f);
        security.addView(securityText, new LinearLayout.LayoutParams(0, -2, 1));
        page.addView(security);

        setContentView(root);
    }

    private void addEmptyState(LinearLayout list) {
        Space upper = new Space(this);
        list.addView(upper, new LinearLayout.LayoutParams(1, 0, 1));
        TextView icon = text("▤", 48, COLOR_SECONDARY);
        icon.setGravity(Gravity.CENTER);
        list.addView(icon, new LinearLayout.LayoutParams(-1, dp(64)));
        TextView title = text("No Servers Yet", 24, COLOR_TEXT);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        list.addView(title, new LinearLayout.LayoutParams(-1, dp(42)));
        TextView description = text("Add the HTTPS address of a DeepSeek Harness or another web app you trust.", 15, COLOR_SECONDARY);
        description.setGravity(Gravity.CENTER);
        description.setGravity(Gravity.CENTER);
        description.setPadding(dp(20), 0, dp(20), 0);
        list.addView(description, new LinearLayout.LayoutParams(-1, dp(68)));
        Button add = actionButton("+  Add Your First Server", true);
        add.setOnClickListener(view -> showEditor(null));
        LinearLayout.LayoutParams buttonParams = new LinearLayout.LayoutParams(-2, dp(50));
        buttonParams.gravity = Gravity.CENTER_HORIZONTAL;
        list.addView(add, buttonParams);
        Space lower = new Space(this);
        list.addView(lower, new LinearLayout.LayoutParams(1, 0, 1));
    }

    private void addServerRow(LinearLayout list, Server server) {
        LinearLayout card = horizontal();
        card.setGravity(Gravity.CENTER_VERTICAL);
        card.setPadding(dp(14), dp(10), dp(8), dp(10));
        card.setBackground(roundRect(color(COLOR_SURFACE), dp(16), color(COLOR_BORDER), dp(1)));

        TextView icon = text("▣", 20, Color.WHITE);
        icon.setGravity(Gravity.CENTER);
        icon.setBackground(roundRect(color(COLOR_ACCENT), dp(13), color(COLOR_ACCENT), 0));
        card.addView(icon, fixedParams(46, 46));

        LinearLayout info = vertical();
        info.setPadding(dp(12), 0, dp(8), 0);
        TextView name = text(server.name, 16, COLOR_TEXT);
        name.setSingleLine(true);
        name.setEllipsize(android.text.TextUtils.TruncateAt.END);
        info.addView(name, new LinearLayout.LayoutParams(-1, dp(26)));
        TextView host = text(secureHost(server.url), 13, COLOR_SECONDARY);
        host.setSingleLine(true);
        host.setEllipsize(android.text.TextUtils.TruncateAt.END);
        info.addView(host, new LinearLayout.LayoutParams(-1, dp(22)));
        LinearLayout.LayoutParams infoParams = new LinearLayout.LayoutParams(0, -2, 1);
        card.addView(info, infoParams);

        if (server.lastUsedAt > 0) {
            TextView used = text(DateUtils.getRelativeTimeSpanString(
                    server.lastUsedAt, System.currentTimeMillis(), DateUtils.MINUTE_IN_MILLIS, DateUtils.FORMAT_ABBREV_RELATIVE).toString(), 11, COLOR_SECONDARY);
            used.setGravity(Gravity.CENTER_VERTICAL);
            used.setPadding(0, 0, dp(4), 0);
            card.addView(used, new LinearLayout.LayoutParams(-2, dp(42)));
        }

        TextView menu = iconButton("⋯", "Options for " + server.name);
        menu.setOnClickListener(view -> showServerMenu(view, server));
        card.addView(menu, fixedParams(48, 48));
        card.setOnClickListener(view -> connect(server));
        card.setContentDescription(server.name + ", secure server " + secureHost(server.url));

        LinearLayout.LayoutParams cardParams = new LinearLayout.LayoutParams(-1, -2);
        cardParams.bottomMargin = dp(8);
        list.addView(card, cardParams);
    }

    private void showPickerMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add("Clear website data").setOnMenuItemClickListener(item -> {
            clearWebsiteData();
            return true;
        });
        menu.getMenu().add("Project on GitHub").setOnMenuItemClickListener(item -> {
            openExternal("https://github.com/leonardoxr/dsh-native");
            return true;
        });
        menu.show();
    }

    private void showServerMenu(View anchor, Server server) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add(1, 1, 0, "Connect");
        menu.getMenu().add(1, 2, 1, "Edit");
        menu.getMenu().add(1, 3, 2, "Open in browser");
        if (server.trustedCertificateFingerprint != null) {
            menu.getMenu().add(1, 5, 3, "Revoke certificate trust");
        }
        menu.getMenu().add(1, 4, 4, "Remove");
        menu.setOnMenuItemClickListener(item -> {
            switch (item.getItemId()) {
                case 1:
                    connect(server);
                    return true;
                case 2:
                    showEditor(server);
                    return true;
                case 3:
                    openExternal(server.url);
                    return true;
                case 5:
                    revokeCertificateTrust(server);
                    return true;
                case 4:
                    new AlertDialog.Builder(this)
                            .setTitle("Remove " + server.name + "?")
                            .setMessage("The saved entry will be removed. Website data is cleared separately.")
                            .setNegativeButton("Cancel", null)
                            .setPositiveButton("Remove", (dialog, which) -> {
                                store.delete(server);
                                showServerPicker();
                            })
                            .show();
                    return true;
                default:
                    return false;
            }
        });
        menu.show();
    }

    private void showEditor(Server existing) {
        LinearLayout form = vertical();
        form.setPadding(dp(24), dp(8), dp(24), 0);
        EditText name = new EditText(this);
        name.setHint("Name");
        name.setSingleLine(true);
        name.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_FLAG_CAP_SENTENCES);
        name.setText(existing == null ? "" : existing.name);
        form.addView(name, new LinearLayout.LayoutParams(-1, dp(56)));
        EditText url = new EditText(this);
        url.setHint("https://host.example.com");
        url.setSingleLine(true);
        url.setInputType(InputType.TYPE_CLASS_TEXT | InputType.TYPE_TEXT_VARIATION_URI);
        url.setText(existing == null ? "" : existing.url);
        form.addView(url, new LinearLayout.LayoutParams(-1, dp(56)));
        TextView hint = text("HTTPS is required. If Android cannot validate a private certificate, DSH Native will show its fingerprint and ask before trusting it.", 12, COLOR_SECONDARY);
        hint.setPadding(0, dp(4), 0, dp(8));
        form.addView(hint);

        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(existing == null ? "Add Server" : "Edit Server")
                .setView(form)
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Save", null)
                .create();
        dialog.setOnShowListener(ignored -> dialog.getButton(AlertDialog.BUTTON_POSITIVE).setOnClickListener(view -> {
            try {
                store.upsert(existing == null ? null : existing.id, name.getText().toString(), url.getText().toString());
                dialog.dismiss();
                showServerPicker();
            } catch (IllegalArgumentException error) {
                url.setError(error.getMessage());
            }
        }));
        dialog.show();
        name.requestFocus();
        dialog.getWindow().setSoftInputMode(android.view.WindowManager.LayoutParams.SOFT_INPUT_STATE_ALWAYS_VISIBLE);
    }

    private void connect(Server server) {
        store.markConnected(server);
        showBrowser(server);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showBrowser(Server server) {
        closeBrowser();
        activeServer = server;
        store.markConnected(server);

        browserRoot = new FrameLayout(this);
        browserRoot.setBackgroundColor(color(COLOR_BACKGROUND));
        LinearLayout content = vertical();
        browserRoot.addView(content, fillFrameParams());

        LinearLayout header = horizontal();
        header.setGravity(Gravity.CENTER_VERTICAL);
        header.setPadding(dp(8), dp(6), dp(8), dp(6));
        header.setBackgroundColor(color(COLOR_SURFACE));
        TextView servers = iconButton("☰", "Servers");
        servers.setOnClickListener(view -> showDrawer());
        header.addView(servers, fixedParams(48, 48));
        LinearLayout identity = vertical();
        identity.setPadding(dp(8), 0, dp(4), 0);
        TextView title = text(server.name, 17, COLOR_TEXT);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setSingleLine(true);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        identity.addView(title, new LinearLayout.LayoutParams(-1, dp(25)));
        TextView host = text(secureHost(server.url), 12, COLOR_SECONDARY);
        host.setSingleLine(true);
        identity.addView(host, new LinearLayout.LayoutParams(-1, dp(21)));
        certificateWarning = text("⚠ Manually trusted certificate", 10, COLOR_WARNING);
        certificateWarning.setSingleLine(true);
        certificateWarning.setVisibility(server.trustedCertificateFingerprint == null ? View.GONE : View.VISIBLE);
        certificateWarning.setContentDescription("This server uses a manually trusted certificate. Tap to revoke trust.");
        certificateWarning.setOnClickListener(view -> revokeCertificateTrust(server));
        identity.addView(certificateWarning, new LinearLayout.LayoutParams(-1, dp(20)));
        header.addView(identity, new LinearLayout.LayoutParams(0, -2, 1));
        TextView more = iconButton("⋯", "Page options");
        more.setOnClickListener(view -> showBrowserMenu(view));
        header.addView(more, fixedParams(48, 48));
        loadingBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        loadingBar.setIndeterminate(true);
        loadingBar.setVisibility(View.GONE);
        content.addView(header);
        content.addView(loadingBar, new LinearLayout.LayoutParams(-1, dp(3)));

        webView = createWebView(server);
        content.addView(webView, new LinearLayout.LayoutParams(-1, 0, 1));

        LinearLayout toolbar = horizontal();
        toolbar.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.setPadding(dp(8), dp(3), dp(8), dp(3));
        toolbar.setBackgroundColor(color(COLOR_SURFACE));
        backButton = toolbarButton("‹", "Back");
        backButton.setOnClickListener(view -> webView.goBack());
        toolbar.addView(backButton, fixedParams(48, 48));
        forwardButton = toolbarButton("›", "Forward");
        forwardButton.setOnClickListener(view -> webView.goForward());
        toolbar.addView(forwardButton, fixedParams(48, 48));
        reloadButton = toolbarButton("↻", "Reload");
        reloadButton.setOnClickListener(view -> {
            if (webView.getProgress() < 100) webView.stopLoading();
            else webView.reload();
        });
        toolbar.addView(reloadButton, fixedParams(48, 48));
        Space spacer = new Space(this);
        toolbar.addView(spacer, new LinearLayout.LayoutParams(0, 1, 1));
        TextView secure = text("▣  HTTPS", 13, COLOR_ACCENT);
        secure.setTypeface(secure.getTypeface(), android.graphics.Typeface.BOLD);
        secure.setGravity(Gravity.CENTER_VERTICAL);
        toolbar.addView(secure, new LinearLayout.LayoutParams(-2, 48));
        content.addView(toolbar);

        setContentView(browserRoot);
        webView.loadUrl(server.url);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private WebView createWebView(final Server server) {
        WebView view = new WebView(this);
        WebSettings settings = view.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        settings.setAllowUniversalAccessFromFileURLs(false);
        settings.setAllowFileAccessFromFileURLs(false);
        if (android.os.Build.VERSION.SDK_INT >= 26) settings.setSafeBrowsingEnabled(true);
        String userAgent = settings.getUserAgentString();
        settings.setUserAgentString(userAgent + " DSHNative/" + BuildConfig.VERSION_NAME);
        view.setBackgroundColor(color(COLOR_BACKGROUND));
        view.setOverScrollMode(View.OVER_SCROLL_NEVER);
        view.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView ignored, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                return handleNavigation(request.getUrl().toString(), request.hasGesture(), server);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView ignored, String url) {
                return handleNavigation(url, true, server);
            }

            @Override
            public void onPageStarted(WebView ignored, String url, android.graphics.Bitmap favicon) {
                setLoading(true);
                hideBrowserError();
                updateBrowserButtons();
            }

            @Override
            public void onPageFinished(WebView ignored, String url) {
                setLoading(false);
                updateBrowserButtons();
            }

            @Override
            public void onReceivedError(WebView ignored, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showBrowserError("Couldn’t load " + server.name + ": " + error.getDescription());
            }

            @Override
            public void onReceivedSslError(WebView ignored, SslErrorHandler handler, SslError error) {
                handleSslError(handler, error, server);
            }

            @Override
            public boolean onRenderProcessGone(WebView ignored, RenderProcessGoneDetail detail) {
                showBrowserError("The web content process stopped. Reload to reconnect safely.");
                return true;
            }
        });
        view.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onPermissionRequest(android.webkit.PermissionRequest request) {
                request.deny();
            }

            @Override
            public boolean onCreateWindow(WebView ignored, boolean isDialog, boolean isUserGesture, android.os.Message resultMsg) {
                return false;
            }
        });
        view.setDownloadListener((url, userAgent1, contentDisposition, mimetype, contentLength) -> {
            if (ServerPolicy.mayOpenExternally(url)) openExternal(url);
        });
        return view;
    }

    private void handleSslError(SslErrorHandler handler, SslError error, Server server) {
        if (pendingSslHandler != null) pendingSslHandler.cancel();
        pendingSslHandler = null;
        pendingCertificateFingerprint = null;

        String errorURL = error.getUrl();
        if (!ServerPolicy.sameOrigin(errorURL, server.url)) {
            handler.cancel();
            showBrowserError("A certificate challenge for another origin was blocked.");
            return;
        }
        if (!error.hasError(SslError.SSL_UNTRUSTED)
                || error.hasError(SslError.SSL_IDMISMATCH)
                || error.hasError(SslError.SSL_EXPIRED)
                || error.hasError(SslError.SSL_NOTYETVALID)
                || error.hasError(SslError.SSL_DATE_INVALID)
                || error.hasError(SslError.SSL_INVALID)) {
            handler.cancel();
            showBrowserError("The certificate does not match this host or is outside its validity period. DSH Native will not override that.");
            return;
        }

        byte[] derCertificate = certificateBytes(error.getCertificate());
        String fingerprint = ServerPolicy.sha256Fingerprint(derCertificate);
        if (fingerprint == null) {
            handler.cancel();
            showBrowserError("Android could not read the certificate fingerprint.");
            return;
        }
        if (fingerprint.equalsIgnoreCase(server.trustedCertificateFingerprint)) {
            handler.proceed();
            return;
        }

        boolean replacement = server.trustedCertificateFingerprint != null;
        pendingSslHandler = handler;
        pendingCertificateFingerprint = fingerprint;
        String title = replacement ? "Certificate changed" : "Certificate not trusted";
        String message = (replacement
                ? "The saved server is presenting a different certificate than the one you approved."
                : "Android does not trust this HTTPS certificate.")
                + "\n\nHost: " + secureHost(server.url)
                + "\nSHA-256: " + fingerprint
                + "\n\nTrusting this exact certificate is a per-server exception. Continue only if you recognize it.";
        AlertDialog dialog = new AlertDialog.Builder(this)
                .setTitle(title)
                .setMessage(message)
                .setNegativeButton("Cancel", (ignored, which) -> cancelPendingSsl())
                .setPositiveButton(replacement ? "Trust new certificate" : "Trust certificate", (ignored, which) -> {
                    try {
                        store.trustCertificate(server.id, fingerprint);
                        if (certificateWarning != null) certificateWarning.setVisibility(View.VISIBLE);
                        SslErrorHandler pending = pendingSslHandler;
                        pendingSslHandler = null;
                        pendingCertificateFingerprint = null;
                        if (pending != null) pending.proceed();
                    } catch (IllegalArgumentException trustError) {
                        cancelPendingSsl();
                        showBrowserError(trustError.getMessage());
                    }
                })
                .create();
        dialog.setOnCancelListener(ignored -> cancelPendingSsl());
        dialog.show();
    }

    private void cancelPendingSsl() {
        if (pendingSslHandler != null) pendingSslHandler.cancel();
        pendingSslHandler = null;
        pendingCertificateFingerprint = null;
        showBrowserError("The certificate was not trusted.");
    }

    private byte[] certificateBytes(android.net.http.SslCertificate certificate) {
        if (certificate == null) return null;
        Bundle state = android.net.http.SslCertificate.saveState(certificate);
        return state == null ? null : state.getByteArray("x509-certificate");
    }

    private void revokeCertificateTrust(Server server) {
        if (server.trustedCertificateFingerprint == null) return;
        new AlertDialog.Builder(this)
                .setTitle("Revoke manual certificate trust?")
                .setMessage("Saved SHA-256: " + server.trustedCertificateFingerprint
                        + "\n\nThe next connection will require a new explicit review of the certificate.")
                .setNegativeButton("Cancel", null)
                .setPositiveButton("Revoke trust", (dialog, which) -> {
                    store.clearCertificateTrust(server.id);
                    if (certificateWarning != null) certificateWarning.setVisibility(View.GONE);
                    Toast.makeText(this, "Manual certificate trust revoked.", Toast.LENGTH_SHORT).show();
                })
                .show();
    }

    private boolean handleNavigation(String url, boolean userInitiated, Server server) {
        if (ServerPolicy.sameOrigin(url, server.url)) return false;
        if (userInitiated && ServerPolicy.mayOpenExternally(url)) {
            openExternal(url);
        } else {
            showBrowserError("Navigation to another origin was blocked. Open it explicitly in the system browser to continue.");
        }
        return true;
    }

    private void showBrowserMenu(View anchor) {
        PopupMenu menu = new PopupMenu(this, anchor);
        menu.getMenu().add("Open in browser").setOnMenuItemClickListener(item -> {
            openExternal(activeServer.url);
            return true;
        });
        menu.getMenu().add("Reload").setOnMenuItemClickListener(item -> {
            webView.reload();
            return true;
        });
        menu.getMenu().add("Clear website data").setOnMenuItemClickListener(item -> {
            clearWebsiteData();
            return true;
        });
        menu.getMenu().add("Servers").setOnMenuItemClickListener(item -> {
            showDrawer();
            return true;
        });
        menu.show();
    }

    private void showDrawer() {
        if (browserRoot == null || drawer != null) return;
        drawerScrim = new View(this);
        drawerScrim.setBackgroundColor(0x99000000);
        drawerScrim.setOnClickListener(view -> hideDrawer());
        browserRoot.addView(drawerScrim, fillFrameParams());

        LinearLayout panel = vertical();
        panel.setPadding(dp(16), dp(18), dp(12), dp(12));
        panel.setBackgroundColor(color(COLOR_SURFACE));
        TextView heading = text("Servers", 22, COLOR_TEXT);
        heading.setTypeface(heading.getTypeface(), android.graphics.Typeface.BOLD);
        LinearLayout headingRow = horizontal();
        headingRow.setGravity(Gravity.CENTER_VERTICAL);
        headingRow.addView(heading, new LinearLayout.LayoutParams(0, dp(48), 1));
        TextView close = iconButton("×", "Close server drawer");
        close.setOnClickListener(view -> hideDrawer());
        headingRow.addView(close, fixedParams(48, 48));
        panel.addView(headingRow);

        ScrollView listScroll = new ScrollView(this);
        LinearLayout list = vertical();
        list.setPadding(0, dp(8), 0, dp(8));
        for (Server server : store.ordered()) {
            Button item = actionButton(server.name + "\n" + secureHost(server.url), server.id.equals(activeServer == null ? "" : activeServer.id));
            item.setGravity(Gravity.CENTER_VERTICAL | Gravity.LEFT);
            item.setOnClickListener(view -> {
                hideDrawer();
                connect(server);
            });
            LinearLayout.LayoutParams itemParams = new LinearLayout.LayoutParams(-1, dp(60));
            itemParams.bottomMargin = dp(6);
            list.addView(item, itemParams);
        }
        listScroll.addView(list, fillFrameParams());
        panel.addView(listScroll, new LinearLayout.LayoutParams(-1, 0, 1));

        Button manage = actionButton("Manage servers", false);
        manage.setOnClickListener(view -> {
            hideDrawer();
            showServerPicker();
        });
        panel.addView(manage, new LinearLayout.LayoutParams(-1, dp(50)));

        int width = Math.min(dp(360), (int) (getResources().getDisplayMetrics().widthPixels * 0.88f));
        FrameLayout.LayoutParams panelParams = new FrameLayout.LayoutParams(width, -1, Gravity.LEFT);
        browserRoot.addView(panel, panelParams);
        drawer = panel;
    }

    private void hideDrawer() {
        if (drawer != null) {
            browserRoot.removeView(drawer);
            drawer = null;
        }
        if (drawerScrim != null) {
            browserRoot.removeView(drawerScrim);
            drawerScrim = null;
        }
    }

    private void showBrowserError(String message) {
        if (browserRoot == null) return;
        if (browserError != null) browserRoot.removeView(browserError);
        LinearLayout panel = vertical();
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(32), dp(32), dp(32), dp(32));
        panel.setBackgroundColor(color(COLOR_BACKGROUND));
        TextView title = text("Can’t Open Server", 22, COLOR_TEXT);
        title.setTypeface(title.getTypeface(), android.graphics.Typeface.BOLD);
        title.setGravity(Gravity.CENTER);
        panel.addView(title, new LinearLayout.LayoutParams(-1, dp(42)));
        TextView detail = text(message, 14, COLOR_SECONDARY);
        detail.setGravity(Gravity.CENTER);
        detail.setPadding(0, dp(8), 0, dp(18));
        panel.addView(detail, new LinearLayout.LayoutParams(-1, -2));
        LinearLayout actions = horizontal();
        actions.setGravity(Gravity.CENTER);
        Button servers = actionButton("Servers", false);
        servers.setOnClickListener(view -> showServerPicker());
        actions.addView(servers, fixedParams(120, 50));
        Button retry = actionButton("Retry", true);
        retry.setOnClickListener(view -> {
            hideBrowserError();
            webView.reload();
        });
        LinearLayout.LayoutParams retryParams = fixedParams(120, 50);
        retryParams.leftMargin = dp(8);
        actions.addView(retry, retryParams);
        panel.addView(actions);
        browserRoot.addView(panel, fillFrameParams());
        browserError = panel;
    }

    private void hideBrowserError() {
        if (browserError != null) {
            browserRoot.removeView(browserError);
            browserError = null;
        }
    }

    private void setLoading(boolean loading) {
        if (loadingBar != null) loadingBar.setVisibility(loading ? View.VISIBLE : View.GONE);
        if (reloadButton != null) reloadButton.setText(loading ? "×" : "↻");
    }

    private void updateBrowserButtons() {
        if (webView == null) return;
        if (backButton != null) backButton.setEnabled(webView.canGoBack());
        if (forwardButton != null) forwardButton.setEnabled(webView.canGoForward());
    }

    private void clearWebsiteData() {
        CookieManager.getInstance().removeAllCookies(value -> CookieManager.getInstance().flush());
        WebStorage.getInstance().deleteAllData();
        if (webView != null) webView.clearCache(true);
        Toast.makeText(this, "Website data was cleared.", Toast.LENGTH_SHORT).show();
    }

    private void openExternal(String url) {
        try {
            startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse(url)));
        } catch (Exception error) {
            Toast.makeText(this, "No system app can open this link.", Toast.LENGTH_SHORT).show();
        }
    }

    private String secureHost(String url) {
        try {
            java.net.URI parsed = new java.net.URI(url);
            String host = parsed.getHost() == null ? url : parsed.getHost();
            int port = parsed.getPort();
            return port > 0 && port != 443 ? host + ":" + port : host;
        } catch (Exception error) {
            return url;
        }
    }

    private void closeBrowser() {
        hideDrawer();
        if (pendingSslHandler != null) pendingSslHandler.cancel();
        pendingSslHandler = null;
        pendingCertificateFingerprint = null;
        certificateWarning = null;
        if (webView != null) {
            webView.stopLoading();
            webView.setWebViewClient(null);
            webView.setWebChromeClient(null);
            webView.destroy();
            webView = null;
        }
        browserRoot = null;
        browserError = null;
    }

    @Override
    protected void onPause() {
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
    }

    @Override
    public void onBackPressed() {
        if (drawer != null) {
            hideDrawer();
        } else if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else if (webView != null) {
            showServerPicker();
        } else {
            super.onBackPressed();
        }
    }

    private TextView text(String value, float size, int colorId) {
        TextView view = new TextView(this);
        view.setText(value);
        view.setTextSize(size);
        view.setTextColor(color(colorId));
        return view;
    }

    private TextView iconButton(String value, String description) {
        TextView view = text(value, 24, COLOR_ACCENT);
        view.setGravity(Gravity.CENTER);
        view.setBackground(roundRect(color(COLOR_SURFACE), dp(24), color(COLOR_BORDER), dp(1)));
        view.setContentDescription(description);
        view.setFocusable(true);
        return view;
    }

    private Button toolbarButton(String value, String description) {
        Button button = actionButton(value, false);
        button.setTextSize(26);
        button.setContentDescription(description);
        return button;
    }

    private Button actionButton(String value, boolean primary) {
        Button button = new Button(this);
        button.setText(value);
        button.setAllCaps(false);
        button.setTextSize(14);
        button.setTextColor(primary ? Color.WHITE : color(COLOR_TEXT));
        button.setGravity(Gravity.CENTER);
        button.setMinHeight(0);
        button.setMinWidth(0);
        button.setPadding(dp(12), 0, dp(12), 0);
        button.setBackground(roundRect(primary ? color(COLOR_ACCENT) : color(COLOR_SURFACE), dp(12), color(COLOR_BORDER), primary ? 0 : dp(1)));
        return button;
    }

    private LinearLayout vertical() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        return layout;
    }

    private LinearLayout horizontal() {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.HORIZONTAL);
        return layout;
    }

    private FrameLayout.LayoutParams fillFrameParams() {
        return new FrameLayout.LayoutParams(-1, -1);
    }

    private <T extends ViewGroup.LayoutParams> T fixedParams(int width, int height) {
        @SuppressWarnings("unchecked")
        T params = (T) new LinearLayout.LayoutParams(dp(width), dp(height));
        return params;
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private int color(int resource) {
        return getResources().getColor(resource, getTheme());
    }

    private GradientDrawable roundRect(int fill, int radius, int stroke, int strokeWidth) {
        GradientDrawable drawable = new GradientDrawable();
        drawable.setColor(fill);
        drawable.setCornerRadius(radius);
        if (strokeWidth > 0) drawable.setStroke(strokeWidth, stroke);
        return drawable;
    }
}

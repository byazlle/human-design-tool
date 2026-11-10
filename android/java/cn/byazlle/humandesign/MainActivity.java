package cn.byazlle.humandesign;

import android.app.Activity;
import android.content.res.AssetManager;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.SocketTimeoutException;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.Collections;
import java.util.HashMap;
import java.util.Iterator;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 原生 WebView 壳。
 *
 * 关键点：前端产物是 ES module，file:// 下会被 CORS 阻断且 localStorage 不可用，
 * 因此这里把资源挂在 https://appassets.androidplatform.net 下，由 shouldInterceptRequest
 * 直接读 assets/www，不经过网络 —— origin 是安全上下文，模块与本地存储都正常。
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String BASE_URL = "https://" + HOST + "/index.html";

    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);
        s.setAllowContentAccess(false);
        s.setLoadWithOverviewMode(true);
        s.setUseWideViewPort(true);
        s.setSupportZoom(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }

        web.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || !HOST.equals(uri.getHost())) {
                    return null;
                }
                String path = uri.getPath();
                if (path == null || path.isEmpty() || "/".equals(path)) {
                    path = "/index.html";
                }
                return serveAsset(path);
            }
        });

        // v2.5.0：AI 请求走原生桥。中转站普遍不返回 CORS 响应头，WebView 里
        // 带 Authorization 的 POST 会在预检阶段被拒；Java 侧没有同源策略。
        web.addJavascriptInterface(new AiBridge(), "hdAndroid");

        setContentView(web);
        applyEdgeToEdge();
        web.loadUrl(BASE_URL);
    }

    /**
     * AI 接口代理。JS 侧（aiTransport.ts）调用 hdAndroid.aiRequest(id, json)，
     * 本类在后台线程完成一次 HTTP 往返，再回主线程调 window.__hdAiResolve(id, json)。
     * 密钥只在进程内存里过一遍，不落盘、不写日志。
     */
    private class AiBridge {
        private final Map<String, HttpURLConnection> inflight = new ConcurrentHashMap<>();
        // 不用 ConcurrentHashMap.newKeySet()：那是 Java 8 新增的静态方法，
        // API 24 的 libcore 未必有；newSetFromMap 自 Java 6 起就存在。
        private final Set<String> cancelled = Collections.newSetFromMap(new ConcurrentHashMap<String, Boolean>());

        @JavascriptInterface
        public void aiRequest(final String id, final String payloadJson) {
            new Thread(() -> {
                HttpURLConnection conn = null;
                try {
                    JSONObject p = new JSONObject(payloadJson);
                    String url = p.optString("url", "");
                    if (!url.startsWith("http://") && !url.startsWith("https://")) {
                        throw new IllegalArgumentException("接口地址需以 http:// 或 https:// 开头");
                    }
                    String method = p.optString("method", "POST");
                    int timeoutMs = Math.max(1000, p.optInt("timeoutMs", 60000));
                    String body = p.isNull("body") ? null : p.optString("body", null);

                    conn = (HttpURLConnection) new URL(url).openConnection();
                    conn.setRequestMethod(method);
                    conn.setConnectTimeout(timeoutMs);
                    conn.setReadTimeout(timeoutMs);
                    conn.setInstanceFollowRedirects(true);
                    JSONObject headers = p.optJSONObject("headers");
                    if (headers != null) {
                        Iterator<String> keys = headers.keys();
                        while (keys.hasNext()) {
                            String key = keys.next();
                            conn.setRequestProperty(key, headers.optString(key, ""));
                        }
                    }
                    inflight.put(id, conn);
                    if (body != null && !"GET".equals(method)) {
                        conn.setDoOutput(true);
                        if (conn.getRequestProperty("Content-Type") == null) {
                            conn.setRequestProperty("Content-Type", "application/json");
                        }
                        try (OutputStream os = conn.getOutputStream()) {
                            os.write(body.getBytes(StandardCharsets.UTF_8));
                        }
                    }

                    int status = conn.getResponseCode();
                    InputStream stream = status >= 200 && status < 300
                            ? conn.getInputStream()
                            : conn.getErrorStream();
                    JSONObject out = new JSONObject();
                    out.put("ok", status >= 200 && status < 300);
                    out.put("status", status);
                    out.put("bodyText", readAll(stream));
                    resolve(id, out);
                } catch (Exception e) {
                    // 主动取消已经回过结果了，不要二次兑现
                    if (cancelled.remove(id)) return;
                    JSONObject out = new JSONObject();
                    try {
                        out.put("ok", false);
                        out.put("status", 0);
                        out.put("bodyText", "");
                        out.put("error", e.getMessage() == null ? "未知错误" : e.getMessage());
                        out.put("errorKind", e instanceof SocketTimeoutException ? "timeout" : "network");
                    } catch (org.json.JSONException ignored) {
                        // JSONObject.put 只可能因 key 为 null 抛错，这里 key 均为字面量
                    }
                    resolve(id, out);
                } finally {
                    if (conn != null) {
                        inflight.remove(id);
                        conn.disconnect();
                    }
                }
            }, "hdt-ai").start();
        }

        @JavascriptInterface
        public void aiCancel(final String id) {
            cancelled.add(id);
            HttpURLConnection conn = inflight.remove(id);
            if (conn != null) conn.disconnect();
            JSONObject out = new JSONObject();
            try {
                out.put("ok", false);
                out.put("status", 0);
                out.put("bodyText", "");
                out.put("error", "已取消");
                out.put("errorKind", "cancelled");
            } catch (org.json.JSONException ignored) {
                // 同上
            }
            resolve(id, out);
        }

        /** evaluateJavascript 必须在主线程调用 */
        private void resolve(final String id, final JSONObject result) {
            final String js = "window.__hdAiResolve&&window.__hdAiResolve("
                    + JSONObject.quote(id) + "," + JSONObject.quote(result.toString()) + ")";
            WebView target = web;
            if (target == null) return;
            target.post(() -> target.evaluateJavascript(js, null));
        }

        private String readAll(InputStream in) throws IOException {
            if (in == null) return "";
            try (InputStream stream = in) {
                ByteArrayOutputStream buffer = new ByteArrayOutputStream();
                byte[] chunk = new byte[8192];
                int n;
                while ((n = stream.read(chunk)) != -1) buffer.write(chunk, 0, n);
                return new String(buffer.toByteArray(), StandardCharsets.UTF_8);
            }
        }
    }

    /** 关闭重定向与资源请求的跳转都走本地拦截 */
    private WebResourceResponse serveAsset(String path) {
        AssetManager assets = getAssets();
        String assetPath = "www" + path;

        try {
            InputStream stream = assets.open(assetPath);
            String mime = mimeOf(path);
            String encoding = isText(mime) ? "utf-8" : null;
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            WebResourceResponse response = new WebResourceResponse(mime, encoding, stream);
            response.setResponseHeaders(headers);
            response.setStatusCodeAndReasonPhrase(200, "OK");
            return response;
        } catch (IOException e) {
            // SPA 兜底：无扩展名的路径交给前端路由
            if (path.indexOf('.') < 0) {
                try {
                    InputStream fallback = assets.open("www/index.html");
                    return new WebResourceResponse("text/html", "utf-8", fallback);
                } catch (IOException ignored) {
                    // 落到 404
                }
            }
            return new WebResourceResponse(
                    "text/plain",
                    "utf-8",
                    new ByteArrayInputStream("404 Not Found".getBytes())
            );
        }
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/")
                || mime.contains("javascript")
                || mime.contains("json")
                || mime.contains("svg")
                || mime.contains("xml");
    }

    private static String mimeOf(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".ico")) return "image/x-icon";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".map")) return "application/json";
        if (p.endsWith(".txt")) return "text/plain";
        return "application/octet-stream";
    }

    /** 状态栏 / 导航栏透明，内容延伸到系统栏之下（配合前端的 safe-area） */
    private void applyEdgeToEdge() {
        Window window = getWindow();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            window.clearFlags(WindowManager.LayoutParams.FLAG_TRANSLUCENT_STATUS);
            window.addFlags(WindowManager.LayoutParams.FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS);
            window.setStatusBarColor(Color.TRANSPARENT);
            window.setNavigationBarColor(Color.TRANSPARENT);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            int flags = View.SYSTEM_UI_FLAG_LIGHT_STATUS_BAR;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                flags |= View.SYSTEM_UI_FLAG_LIGHT_NAVIGATION_BAR;
            }
            flags |= View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                    | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION;
            window.getDecorView().setSystemUiVisibility(flags);
        }
    }

    @Override
    public void onBackPressed() {
        if (web != null && web.canGoBack()) {
            web.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }
}

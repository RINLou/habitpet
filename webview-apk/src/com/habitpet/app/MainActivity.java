package com.habitpet.app;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.res.Configuration;
import android.content.res.Resources;
import android.graphics.Rect;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.util.DisplayMetrics;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;
import android.view.WindowMetrics;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;
import java.io.File;

// v10.1 本地优先：加载 APK 内嵌的 assets/www（断网可开、图片秒加载），
// 云端仅作为数据同步与跨端互动服务（file:// 页面跨域 fetch 需 universal access）。
// v10.1 修复：去标题栏、锁竖屏、viewport 拉伸（file:// 下需 useWideViewPort）、键盘 adjustResize。
public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        // v10.2-diag+: 必须先把资源密度与真实屏幕对齐，否则 WebView 会按错误的密度渲染，
        // 把 359 CSS px 的页面塞进一个 ~91px 宽的画布里，再被系统拉伸铺满屏幕——
        // 视觉上"所有元素变大 N 倍、右侧被切"，但 CSS 内部测量看着都正常（盲区）。
        syncDensityToRealScreen();
        requestWindowFeature(Window.FEATURE_NO_TITLE);   // 去掉顶部灰色标题条
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT); // 锁定竖屏
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);   // localStorage + IndexedDB（本地快照/oplog）
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        // The bundled UI needs asset reads, but it never needs content:// providers.
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(false);
        // 关键：file:// 内页的 viewport meta 需要这两项才被尊重，否则按默认宽度渲染导致横向拉伸
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);             // 不随系统字体缩放放大，保持布局稳定
        // file:// 页面访问 https 云端 API：本地优先壳必须放开跨域（仅用于自有内容）
        settings.setAllowUniversalAccessFromFileURLs(true);
        // App pages may call the HTTPS API, but must not read arbitrary local files.
        settings.setAllowFileAccessFromFileURLs(false);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            // The manifest also disallows cleartext. Keep the WebView policy aligned.
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            settings.setSafeBrowsingEnabled(true);
        }

        webView.setWebViewClient(new WebViewClient());
        webView.setWebChromeClient(new WebChromeClient());
        webView.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        // 只读诊断桥：把系统层真实参数暴露给页面（不改动任何行为，仅用于定位缩放问题）
        webView.addJavascriptInterface(new EnvBridge(this, webView), "Android");
        webView.loadUrl("file:///android_asset/www/index.html");
    }

    // v10.2 诊断用：页面可调用 Android.env() 拿到系统字体缩放/密度/WebView 版本等
    public static class EnvBridge {
        private final Activity act;
        private final WebView wv;
        private long dlId = -1;                       // 当前更新包下载任务 id
        private BroadcastReceiver dlReceiver = null;  // 下载完成广播（只注册一次）
        EnvBridge(Activity a, WebView w) { act = a; wv = w; }

        // v7 应用内更新：把当前安装的版本号暴露给页面，前端与云端 /api/appversion 对比
        @JavascriptInterface
        public String appInfo() {
            try {
                PackageInfo pi = act.getPackageManager().getPackageInfo(act.getPackageName(), 0);
                JSONObject o = new JSONObject();
                o.put("versionCode", pi.versionCode);
                o.put("versionName", pi.versionName);
                return o.toString();
            } catch (Throwable t) {
                return "{}";
            }
        }

        // v7 应用内更新：下载云端 APK（仅 HTTPS），完成后拉起系统安装器。
        // 首次使用 Android 8+ 需允许「安装未知应用」，无权限时直接跳系统设置页，用户开启后再点一次更新。
        @JavascriptInterface
        public void downloadAndInstall(String url) {
            try {
                if (url == null || !url.startsWith("https://")) return;   // manifest 禁明文，只允许 HTTPS
                final Activity a = act;
                if (Build.VERSION.SDK_INT >= 26 && !a.getPackageManager().canRequestPackageInstalls()) {
                    a.startActivity(new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                            Uri.parse("package:" + a.getPackageName())));
                    return;
                }
                DownloadManager dm = (DownloadManager) a.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) return;
                if (dlId != -1) { try { dm.remove(dlId); } catch (Throwable ignored) {} }
                File dst = new File(a.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "habitpet-update.apk");
                if (dst.exists()) dst.delete();
                DownloadManager.Request req = new DownloadManager.Request(Uri.parse(url));
                req.setTitle("养成好习惯 更新包");
                req.setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED);
                req.setDestinationUri(Uri.fromFile(dst));
                req.setMimeType("application/vnd.android.package-archive");
                dlId = dm.enqueue(req);
                if (dlReceiver == null) {
                    dlReceiver = new DlReceiver(this);
                    IntentFilter filter = new IntentFilter(DownloadManager.ACTION_DOWNLOAD_COMPLETE);
                    if (Build.VERSION.SDK_INT >= 33) a.registerReceiver(dlReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
                    else a.registerReceiver(dlReceiver, filter);
                }
            } catch (Throwable t) { /* 更新失败静默，不影响 App 正常使用 */ }
        }

        // v7 下载完成广播。注意：必须是 static + 显式 public 构造器——
        // d8 3.3 对 javac 生成的「哨兵参数合成构造器 (Outer, $1)」会 NPE，非 static 内部类默认构造器正是这种形态。
        public static final class DlReceiver extends BroadcastReceiver {
            private final EnvBridge eb;
            public DlReceiver(EnvBridge eb) { this.eb = eb; }
            @Override public void onReceive(Context ctx, Intent intent) {
                try {
                    long id = intent.getLongExtra(DownloadManager.EXTRA_DOWNLOAD_ID, -1);
                    if (id != eb.dlId) return;
                    File f = new File(eb.act.getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS), "habitpet-update.apk");
                    if (!f.exists() || f.length() == 0) return;
                    // DownloadManager 的 content:// URI 可直接授予安装器读权限（无需 androidx FileProvider）
                    DownloadManager edm = (DownloadManager) eb.act.getSystemService(Context.DOWNLOAD_SERVICE);
                    Uri uri = edm == null ? null : edm.getUriForDownloadedFile(id);
                    if (uri == null) return;
                    Intent i = new Intent(Intent.ACTION_VIEW);
                    i.setDataAndType(uri, "application/vnd.android.package-archive");
                    i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                    eb.act.startActivity(i);
                } catch (Throwable ignored) {}
            }
        }

        @JavascriptInterface
        public String env() {
            try {
                JSONObject o = new JSONObject();
                Configuration cfg = act.getResources().getConfiguration();
                DisplayMetrics dm = act.getResources().getDisplayMetrics();
                o.put("fontScale", cfg.fontScale);              // 系统「字体大小」设置，>1 即文字被系统放大
                o.put("density", dm.density);
                o.put("densityDpi", dm.densityDpi);
                o.put("screenWpx", dm.widthPixels);
                o.put("screenHpx", dm.heightPixels);
                o.put("swdp", cfg.smallestScreenWidthDp);
                o.put("sdk", Build.VERSION.SDK_INT);
                WebSettings s = wv.getSettings();
                o.put("textZoom", s.getTextZoom());
                o.put("wideViewport", s.getUseWideViewPort());
                o.put("overviewMode", s.getLoadWithOverviewMode());
                o.put("minFontSize", s.getMinimumFontSize());
                String pkg = "unknown";
                if (Build.VERSION.SDK_INT >= 26) {
                    PackageInfo pi = WebView.getCurrentWebViewPackage();
                    if (pi != null) pkg = pi.packageName + " " + pi.versionName;
                }
                o.put("webView", pkg);
                // v10.2-diag+: 真实屏幕密度（绕过任何兼容性缩放），用来对照报告值
                Display realDisp = act.getWindowManager().getDefaultDisplay();
                DisplayMetrics real = new DisplayMetrics();
                realDisp.getRealMetrics(real);
                o.put("realDensity", real.density);
                o.put("realDensityDpi", real.densityDpi);
                o.put("realScreenWpx", real.widthPixels);
                o.put("realScreenHpx", real.heightPixels);
                // v10.2c-diag: 窗口真实边界（判断是不是被塞进小窗再放大）
                if (Build.VERSION.SDK_INT >= 24) {
                    o.put("multiWindow", act.isInMultiWindowMode());
                }
                if (Build.VERSION.SDK_INT >= 30) {
                    WindowMetrics cwm = act.getWindowManager().getCurrentWindowMetrics();
                    Rect cb = cwm.getBounds();
                    o.put("curWinW", cb.width());
                    o.put("curWinH", cb.height());
                    Rect mb = act.getWindowManager().getMaximumWindowMetrics().getBounds();
                    o.put("maxWinW", mb.width());
                    o.put("maxWinH", mb.height());
                    o.put("windowWdp", Math.round((float) cb.width() / real.density));
                }
                return o.toString();
            } catch (Throwable t) {
                return "{\"err\":\"" + String.valueOf(t) + "\"}";
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }

    // v10.2-diag+: 把 Activity 资源密度校正为真实屏幕密度。
    // 真机上 getResources().getDisplayMetrics() 被某种"兼容性密度缩放"改成 1，
    // 导致 WebView 渲染比例完全错。强制对齐后 WebView 才会按真实像素铺。
    @SuppressWarnings("deprecation")
    private void syncDensityToRealScreen() {
        try {
            Display d = getWindowManager().getDefaultDisplay();
            DisplayMetrics real = new DisplayMetrics();
            d.getRealMetrics(real);
            Resources res = getResources();
            DisplayMetrics cur = res.getDisplayMetrics();
            if (Math.abs(cur.density - real.density) > 0.01f
                || cur.densityDpi != real.densityDpi) {
                Configuration cfg = new Configuration(res.getConfiguration());
                cfg.densityDpi = real.densityDpi;
                cfg.fontScale = 1.0f; // 顺便清掉系统「字体大小」设置的影响
                res.updateConfiguration(cfg, real);
                cur.setTo(real); // 立刻同步当前 DisplayMetrics，避免 setContentView 期间读到旧值
            }
        } catch (Throwable t) {
            // 不致命——老设备/罕见情况下 updateConfiguration 可能抛错，留给 WebView 自己处理
        }
    }
}

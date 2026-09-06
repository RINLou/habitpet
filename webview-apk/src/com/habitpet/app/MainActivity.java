package com.habitpet.app;

import android.app.Activity;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.res.Configuration;
import android.os.Build;
import android.os.Bundle;
import android.util.DisplayMetrics;
import android.view.Window;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import org.json.JSONObject;

// v10.1 本地优先：加载 APK 内嵌的 assets/www（断网可开、图片秒加载），
// 云端仅作为数据同步与跨端互动服务（file:// 页面跨域 fetch 需 universal access）。
// v10.1 修复：去标题栏、锁竖屏、viewport 拉伸（file:// 下需 useWideViewPort）、键盘 adjustResize。
public class MainActivity extends Activity {
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);   // 去掉顶部灰色标题条
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT); // 锁定竖屏
        setContentView(R.layout.activity_main);

        webView = findViewById(R.id.webview);
        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);   // localStorage + IndexedDB（本地快照/oplog）
        settings.setDatabaseEnabled(true);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setAllowFileAccess(true);
        // 关键：file:// 内页的 viewport meta 需要这两项才被尊重，否则按默认宽度渲染导致横向拉伸
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setTextZoom(100);             // 不随系统字体缩放放大，保持布局稳定
        // file:// 页面访问 https 云端 API：本地优先壳必须放开跨域（仅用于自有内容）
        settings.setAllowUniversalAccessFromFileURLs(true);
        settings.setAllowFileAccessFromFileURLs(true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP) {
            settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
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
        EnvBridge(Activity a, WebView w) { act = a; wv = w; }

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
}

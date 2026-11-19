const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { execSync } = require('child_process');

const ROOT_DIR = path.resolve(__dirname, '..');
const BUILD_DIR = path.join(ROOT_DIR, 'android-build');

const JAVA_HOME = 'C:\\Program Files\\Java\\jdk-22';
const JAVAC_BIN = path.join(JAVA_HOME, 'bin', 'javac.exe');
const JAR_BIN = path.join(JAVA_HOME, 'bin', 'jar.exe');
const KEYTOOL_BIN = path.join(JAVA_HOME, 'bin', 'keytool.exe');

const SDK_DIR = path.join(process.env.LOCALAPPDATA, 'Android', 'Sdk');
const ANDROID_JAR = path.join(SDK_DIR, 'platforms', 'android-34', 'android.jar');
const BUILD_TOOLS = path.join(SDK_DIR, 'build-tools', '35.0.0');

const AAPT2_BIN = path.join(BUILD_TOOLS, 'aapt2.exe');
const D8_BIN = path.join(BUILD_TOOLS, 'd8.bat');
const ZIPALIGN_BIN = path.join(BUILD_TOOLS, 'zipalign.exe');
const APKSIGNER_BIN = path.join(BUILD_TOOLS, 'apksigner.bat');

console.log('======================================================');
console.log('   BUILDING NATIVE ANDROID APKS WITH FLAG_SECURE     ');
console.log('======================================================');
console.log('Java Home:', JAVA_HOME);
console.log('Android SDK:', SDK_DIR);

if (!fs.existsSync(BUILD_DIR)) fs.mkdirSync(BUILD_DIR, { recursive: true });

// 1. Ensure Keystore for signing
const KEYSTORE_FILE = path.join(BUILD_DIR, 'release.keystore');
const KEY_PASS = 'ai925oraani2026';
const KEY_ALIAS = 'portal';

if (!fs.existsSync(KEYSTORE_FILE)) {
  console.log('\n[1/4] Generating application signing keystore...');
  execSync(
    `"${KEYTOOL_BIN}" -genkey -v -keystore "${KEYSTORE_FILE}" -storepass ${KEY_PASS} -alias ${KEY_ALIAS} -keypass ${KEY_PASS} -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=AI925 Oraani, OU=Mobile, O=Jewels, L=Mumbai, S=MH, C=IN"`,
    { stdio: 'inherit' }
  );
}

// PNG helper functions
function readPng(file) {
  const buf = fs.readFileSync(file);
  let offset = 8, w = 0, h = 0, idat = [];
  while (offset < buf.length) {
    const len = buf.readUInt32BE(offset);
    const type = buf.toString('ascii', offset + 4, offset + 8);
    if (type === 'IHDR') {
      w = buf.readUInt32BE(offset + 8);
      h = buf.readUInt32BE(offset + 12);
    } else if (type === 'IDAT') {
      idat.push(buf.subarray(offset + 8, offset + 8 + len));
    }
    offset += 12 + len;
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const bpp = 4;
  const stride = 1 + w * bpp;
  const uncompressed = Buffer.alloc(w * h * bpp);
  function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);
    if (pa <= pb && pa <= pc) return a;
    if (pb <= pc) return b;
    return c;
  }
  for (let y = 0; y < h; y++) {
    const filter = raw[y * stride];
    const rowStart = y * stride + 1;
    const outStart = y * w * bpp;
    const prevOutStart = (y - 1) * w * bpp;
    for (let x = 0; x < w * bpp; x++) {
      const val = raw[rowStart + x];
      const left = x >= bpp ? uncompressed[outStart + x - bpp] : 0;
      const up = y > 0 ? uncompressed[prevOutStart + x] : 0;
      const upLeft = (y > 0 && x >= bpp) ? uncompressed[prevOutStart + x - bpp] : 0;
      let res = 0;
      if (filter === 0) res = val;
      else if (filter === 1) res = (val + left) & 0xff;
      else if (filter === 2) res = (val + up) & 0xff;
      else if (filter === 3) res = (val + Math.floor((left + up) / 2)) & 0xff;
      else if (filter === 4) res = (val + paeth(left, up, upLeft)) & 0xff;
      uncompressed[outStart + x] = res;
    }
  }
  return { w, h, data: uncompressed };
}

function resizeRgba(src, srcW, srcH, dstW, dstH) {
  const dst = Buffer.alloc(dstW * dstH * 4);
  const xRatio = srcW / dstW;
  const yRatio = srcH / dstH;

  for (let y = 0; y < dstH; y++) {
    const srcY = Math.min(srcH - 1, Math.floor(y * yRatio));
    for (let x = 0; x < dstW; x++) {
      const srcX = Math.min(srcW - 1, Math.floor(x * xRatio));
      const srcIdx = (srcY * srcW + srcX) * 4;
      const dstIdx = (y * dstW + x) * 4;
      dst[dstIdx] = src[srcIdx];
      dst[dstIdx + 1] = src[srcIdx + 1];
      dst[dstIdx + 2] = src[srcIdx + 2];
      dst[dstIdx + 3] = src[srcIdx + 3];
    }
  }
  return dst;
}

function makePng(w, h, rgba) {
  const scanlines = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    scanlines[y * (1 + w * 4)] = 0;
    rgba.copy(scanlines, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  const idatData = zlib.deflateSync(scanlines, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const typeBuf = Buffer.from(type, 'ascii');
    const crcBuf = Buffer.alloc(4);
    const crc = crc32(Buffer.concat([typeBuf, data]));
    crcBuf.writeInt32BE(crc);
    return Buffer.concat([len, typeBuf, data, crcBuf]);
  }

  function crc32(buf) {
    let crc = -1;
    for (let i = 0; i < buf.length; i++) {
      crc = (crc >>> 8) ^ table[(crc ^ buf[i]) & 0xff];
    }
    return (crc ^ (-1));
  }
  const table = new Int32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    table[i] = c;
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    signature,
    chunk('IHDR', ihdr),
    chunk('IDAT', idatData),
    chunk('IEND', Buffer.alloc(0))
  ]);
}

// App configurations
const APPS = [
  {
    id: 'oraani',
    appName: 'Oraani',
    packageName: 'com.oraani.portal',
    targetUrl: 'https://entangled-stem-cinema.ngrok-free.dev/oraani',
    sourceIcon: path.join(ROOT_DIR, 'client', 'public', 'oraani-icon-512.png'),
    outputApk: path.join(ROOT_DIR, 'Oraani.apk')
  },
  {
    id: 'ai925',
    appName: 'AI 925',
    packageName: 'com.ai925.portal',
    targetUrl: 'https://entangled-stem-cinema.ngrok-free.dev/ai925',
    sourceIcon: path.join(ROOT_DIR, 'client', 'public', 'icon-512.png'),
    outputApk: path.join(ROOT_DIR, 'AI925.apk')
  }
];

function buildApp(app) {
  console.log(`\n======================================================`);
  console.log(`   BUILDING: ${app.appName} (${app.packageName})`);
  console.log(`   URL: ${app.targetUrl}`);
  console.log(`======================================================`);

  const appDir = path.join(BUILD_DIR, app.id);
  if (fs.existsSync(appDir)) fs.rmSync(appDir, { recursive: true, force: true });
  fs.mkdirSync(appDir, { recursive: true });

  const resDir = path.join(appDir, 'res');
  const valuesDir = path.join(resDir, 'values');
  fs.mkdirSync(valuesDir, { recursive: true });

  // 1. Generate Mipmap Icons
  console.log('Generating launcher icons across all densities...');
  const iconSrc = readPng(app.sourceIcon);
  const densities = [
    { name: 'mipmap-mdpi', size: 48 },
    { name: 'mipmap-hdpi', size: 72 },
    { name: 'mipmap-xhdpi', size: 96 },
    { name: 'mipmap-xxhdpi', size: 144 },
    { name: 'mipmap-xxxhdpi', size: 192 }
  ];

  for (const d of densities) {
    const dir = path.join(resDir, d.name);
    fs.mkdirSync(dir, { recursive: true });
    const resized = resizeRgba(iconSrc.data, iconSrc.w, iconSrc.h, d.size, d.size);
    const pngBuf = makePng(d.size, d.size, resized);
    fs.writeFileSync(path.join(dir, 'ic_launcher.png'), pngBuf);
  }

  // 2. Write strings.xml
  fs.writeFileSync(
    path.join(valuesDir, 'strings.xml'),
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${app.appName}</string>
</resources>`
  );

  // 3. Write AndroidManifest.xml
  const manifestFile = path.join(appDir, 'AndroidManifest.xml');
  fs.writeFileSync(
    manifestFile,
    `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android"
    package="${app.packageName}"
    android:versionCode="1"
    android:versionName="1.0.0">

    <uses-permission android:name="android.permission.INTERNET" />
    <uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />
    <uses-permission android:name="android.permission.READ_MEDIA_IMAGES" />

    <application
        android:label="@string/app_name"
        android:icon="@mipmap/ic_launcher"
        android:hardwareAccelerated="true"
        android:usesCleartextTraffic="true"
        android:theme="@android:style/Theme.NoTitleBar">
        
        <activity
            android:name=".MainActivity"
            android:configChanges="orientation|screenSize|keyboardHidden"
            android:exported="true"
            android:windowSoftInputMode="adjustResize">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>`
  );

  // 4. Write MainActivity.java
  const pkgPath = app.packageName.replace(/\./g, '/');
  const srcDir = path.join(appDir, 'src', pkgPath);
  fs.mkdirSync(srcDir, { recursive: true });

  const javaFile = path.join(srcDir, 'MainActivity.java');
  fs.writeFileSync(
    javaFile,
    `package ${app.packageName};

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.ProgressBar;
import android.widget.RelativeLayout;

public class MainActivity extends Activity {

    private WebView mWebView;
    private ValueCallback<Uri[]> mUploadMessage;
    private final static int FILECHOOSER_RESULTCODE = 1001;

    private static final String TARGET_URL = "${app.targetUrl}";

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // -----------------------------------------------------------------
        // NATIVE HARDWARE SCREENSHOT BLOCKING (FLAG_SECURE)
        // -----------------------------------------------------------------
        // Hardware buttons (Power + Vol Down), screen recorders, and app switcher
        // are forced to 100% PURE BLACK at Android OS kernel level!
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        requestWindowFeature(Window.FEATURE_NO_TITLE);

        RelativeLayout rootLayout = new RelativeLayout(this);
        rootLayout.setBackgroundColor(0xFFF5F0E8);

        mWebView = new WebView(this);
        RelativeLayout.LayoutParams webParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            RelativeLayout.LayoutParams.MATCH_PARENT
        );
        rootLayout.addView(mWebView, webParams);

        final ProgressBar progressBar = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        progressBar.setMax(100);
        RelativeLayout.LayoutParams progressParams = new RelativeLayout.LayoutParams(
            RelativeLayout.LayoutParams.MATCH_PARENT,
            8
        );
        progressParams.addRule(RelativeLayout.ALIGN_PARENT_TOP);
        progressBar.setLayoutParams(progressParams);
        rootLayout.addView(progressBar);

        setContentView(rootLayout);

        WebSettings settings = mWebView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setCacheMode(WebSettings.LOAD_DEFAULT);
        settings.setUseWideViewPort(true);
        settings.setLoadWithOverviewMode(true);
        settings.setSupportZoom(false);
        settings.setBuiltInZoomControls(false);

        mWebView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                if ("tel".equals(scheme) || "mailto".equals(scheme) || "whatsapp".equals(scheme)) {
                    try {
                        Intent intent = new Intent(Intent.ACTION_VIEW, uri);
                        startActivity(intent);
                        return true;
                    } catch (Exception e) {}
                }
                return false;
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                super.onPageFinished(view, url);
                progressBar.setVisibility(View.GONE);
            }
        });

        mWebView.setWebChromeClient(new WebChromeClient() {
            @Override
            public void onProgressChanged(WebView view, int newProgress) {
                if (newProgress < 100) {
                    progressBar.setVisibility(View.VISIBLE);
                    progressBar.setProgress(newProgress);
                } else {
                    progressBar.setVisibility(View.GONE);
                }
            }

            @Override
            public boolean onShowFileChooser(WebView webView, ValueCallback<Uri[]> filePathCallback, FileChooserParams fileChooserParams) {
                if (mUploadMessage != null) {
                    mUploadMessage.onReceiveValue(null);
                }
                mUploadMessage = filePathCallback;
                Intent intent = fileChooserParams.createIntent();
                try {
                    startActivityForResult(intent, FILECHOOSER_RESULTCODE);
                } catch (Exception e) {
                    mUploadMessage = null;
                    return false;
                }
                return true;
            }
        });

        mWebView.loadUrl(TARGET_URL);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILECHOOSER_RESULTCODE) {
            if (mUploadMessage == null) return;
            mUploadMessage.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(resultCode, data));
            mUploadMessage = null;
        } else {
            super.onActivityResult(requestCode, resultCode, data);
        }
    }

    @Override
    public void onBackPressed() {
        if (mWebView != null && mWebView.canGoBack()) {
            mWebView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`
  );

  // 5. Compile resources with aapt2
  console.log('Compiling resources (aapt2 compile)...');
  const compiledResZip = path.join(appDir, 'compiled_res.zip');
  execSync(`"${AAPT2_BIN}" compile --dir "${resDir}" -o "${compiledResZip}"`, { stdio: 'inherit' });

  // 6. Link resources with aapt2
  console.log('Linking resources (aapt2 link)...');
  const unalignedApk = path.join(appDir, 'unaligned.apk');
  const genSrcDir = path.join(appDir, 'gen_src');
  fs.mkdirSync(genSrcDir, { recursive: true });

  execSync(
    `"${AAPT2_BIN}" link -I "${ANDROID_JAR}" --manifest "${manifestFile}" -o "${unalignedApk}" --java "${genSrcDir}" "${compiledResZip}" --auto-add-overlay`,
    { stdio: 'inherit' }
  );

  // 7. Compile Java code (javac)
  console.log('Compiling Java classes (javac)...');
  const binDir = path.join(appDir, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const rJavaFile = path.join(genSrcDir, pkgPath, 'R.java');
  execSync(
    `"${JAVAC_BIN}" -source 1.8 -target 1.8 -classpath "${ANDROID_JAR}" -d "${binDir}" "${rJavaFile}" "${javaFile}"`,
    { stdio: 'inherit' }
  );

  // 8. Convert bytecode to Dalvik DEX (d8)
  console.log('Converting to Dalvik bytecode (d8)...');
  const dexDir = path.join(appDir, 'dex');
  fs.mkdirSync(dexDir, { recursive: true });

  // Find all .class files in bin
  function findClasses(dir) {
    let files = [];
    for (const item of fs.readdirSync(dir)) {
      const full = path.join(dir, item);
      if (fs.statSync(full).isDirectory()) files = files.concat(findClasses(full));
      else if (full.endsWith('.class')) files.push(full);
    }
    return files;
  }
  const classFiles = findClasses(binDir);
  const classArgs = classFiles.map(f => `"${f}"`).join(' ');

  execSync(`"${D8_BIN}" --lib "${ANDROID_JAR}" --output "${dexDir}" ${classArgs}`, { stdio: 'inherit' });

  // 9. Add classes.dex into unaligned APK
  console.log('Packaging classes.dex into APK...');
  execSync(`"${JAR_BIN}" -uf "${unalignedApk}" -C "${dexDir}" classes.dex`, { stdio: 'inherit' });

  // 10. Align APK on 4-byte boundaries (zipalign)
  console.log('Aligning APK (zipalign)...');
  const alignedApk = path.join(appDir, 'aligned.apk');
  if (fs.existsSync(alignedApk)) fs.unlinkSync(alignedApk);
  execSync(`"${ZIPALIGN_BIN}" -f -p 4 "${unalignedApk}" "${alignedApk}"`, { stdio: 'inherit' });

  // 11. Sign APK (apksigner)
  console.log('Signing APK with V1, V2, and V3 signatures (apksigner)...');
  execSync(
    `"${APKSIGNER_BIN}" sign --ks "${KEYSTORE_FILE}" --ks-pass pass:${KEY_PASS} --ks-key-alias ${KEY_ALIAS} --key-pass pass:${KEY_PASS} --out "${app.outputApk}" "${alignedApk}"`,
    { stdio: 'inherit' }
  );

  const stat = fs.statSync(app.outputApk);
  console.log(`\n[SUCCESS] ${app.appName} APK built: ${path.basename(app.outputApk)} (${(stat.size / 1024).toFixed(1)} KB)`);
}

for (const app of APPS) {
  buildApp(app);
}

console.log('\n======================================================');
console.log('       ALL 2 APK FILES BUILT SUCCESSFULLY!           ');
console.log('======================================================');
console.log('1. Oraani.apk -> ' + path.join(ROOT_DIR, 'Oraani.apk'));
console.log('2. AI925.apk  -> ' + path.join(ROOT_DIR, 'AI925.apk'));
console.log('Both apps have native FLAG_SECURE enabled: screenshots on Android are 100% black!');

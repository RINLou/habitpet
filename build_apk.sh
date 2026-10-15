#!/usr/bin/env bash
# 灵汐大陆 · WebView 壳 APK 构建脚本（v12 合并版：灵汐玩法为主 + 开发线工程）
# 与 workspace 根旧版差异：build-tools 引用绝对路径，源码用本仓库 public/ + webview-apk/，去掉 diag.js 检查
# 用法：bash build_apk.sh [输出文件名]
set -e
cd "$(dirname "$0")"
WS="/c/Users/Administrator/WorkBuddy/2026-09-04-22-41-49"

JDK="$WS/build-tools/jdk/jdk-21.0.12.1+1/bin"
export JAVA_HOME="C:\\Users\\Administrator\\WorkBuddy\\2026-09-04-22-41-49\\build-tools\\jdk\\jdk-21.0.12.1+1"
export PATH="$(cygpath -u "$JAVA_HOME")/bin:$PATH"
BT="$WS/build-tools/android-13"
PLAT="$WS/build-tools/platform-33/android-13/android.jar"
KS="$WS/build-tools/habitpet.keystore"      # storepass/keypass/alias 均为 habitpet
DIR="webview-apk"
OUT="${1:-灵汐大陆-v12.apk}"

echo "== 1/6 同步前端资源 public -> assets/www =="
rm -rf "$DIR/assets/www"
mkdir -p "$DIR/assets/www"
cp -r public/. "$DIR/assets/www/"
echo "   同步完成（$(find "$DIR/assets/www" -type f | wc -l) 个文件）"

echo "== 2/6 aapt2 编译资源 =="
rm -rf "$DIR/build" && mkdir -p "$DIR/build/classes" "$DIR/build/dex"
"$BT/aapt2.exe" compile --dir "$DIR/res" -o "$DIR/build/res.zip"

echo "== 3/6 aapt2 链接成未签名 APK =="
"$BT/aapt2.exe" link -I "$PLAT" --manifest "$DIR/AndroidManifest.xml" \
  -A "$DIR/assets" --java "$DIR/build/gen_r" \
  -o "$DIR/build/unsigned.apk" "$DIR/build/res.zip"
# 用本次构建的 R.java 覆盖 src 下的老文件（防止老 ID 导致 findViewById 返回 null 闪退）
cp -f "$DIR/build/gen_r/com/habitpet/app/R.java" "$DIR/src/com/habitpet/app/R.java"

echo "== 4/6 javac 编译 =="
"$JDK/javac" -encoding UTF-8 -nowarn -source 8 -target 8 -bootclasspath "$PLAT" \
  -classpath "$PLAT" -d "$DIR/build/classes" "$DIR"/src/com/habitpet/app/*.java

echo "== 5/6 d8 转 dex 并打包 =="
"$JAVA_HOME/bin/java" -cp "$BT/lib/d8.jar" com.android.tools.r8.D8 --lib "$PLAT" \
  --output "$DIR/build/dex" "$DIR"/build/classes/com/habitpet/app/*.class
python - "$DIR" <<'PY'
import sys, zipfile, os
d = sys.argv[1]
dex = os.path.join(d, 'build', 'dex', 'classes.dex')
apk = os.path.join(d, 'build', 'unsigned.apk')
with zipfile.ZipFile(apk, 'a', zipfile.ZIP_DEFLATED) as z:
    if 'classes.dex' in z.namelist():
        print('   classes.dex 已存在，跳过')
    else:
        z.write(dex, 'classes.dex')
        print('   classes.dex 已写入')
PY

echo "== 6/6 对齐 + 签名 =="
"$BT/zipalign.exe" -f 4 "$DIR/build/unsigned.apk" "$DIR/build/aligned.apk"
"$BT/apksigner.bat" sign --ks "$KS" --ks-key-alias habitpet \
  --ks-pass pass:habitpet --key-pass pass:habitpet \
  --out "$OUT" "$DIR/build/aligned.apk"
"$BT/apksigner.bat" verify -v "$OUT" | grep -E "Verifies|v1|v2|v3" | head -5
ls -la "$OUT"
echo "完成：$OUT"

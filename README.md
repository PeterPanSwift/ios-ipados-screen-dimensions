# iOS / iPadOS 螢幕尺寸解析器

從 Apple Human Interface Guidelines 的官方 DocC JSON 取得
「iOS, iPadOS device screen dimensions」表格，整理為可直接使用的 JSON。
程式只使用 Python 標準函式庫。

## 執行

需要 Python 3.10 以上：

```bash
python3 parse_screen_dimensions.py
```

預設輸出 `ios_ipados_screen_dimensions.json`。也可以指定 URL 與輸出位置：

```bash
python3 parse_screen_dimensions.py \
  'https://developer.apple.com/design/human-interface-guidelines/layout#iOS-iPadOS-device-screen-dimensions' \
  --output dimensions.json
```

輸出到 stdout：

```bash
python3 parse_screen_dimensions.py --output -
```

執行測試：

```bash
python3 -m unittest -v
```

每筆裝置資料包含平台、直向 point 尺寸、pixel 尺寸和 scale。pixel 尺寸照 Apple
表格原值保留，不由 point 和 scale 推算；部分裝置的顯示流程包含縮放，兩者不一定能直接相乘。

## 瀏覽網頁

網頁會讀取同一目錄的 `ios_ipados_screen_dimensions.json`，需透過 HTTP 伺服器開啟：

```bash
python3 -m http.server 8000
```

接著前往 <http://localhost:8000>。表格會依直向 point 尺寸分組，並可篩選
iPhone 或 iPad，也能以裝置名稱或 point 尺寸即時搜尋。頁首可切換繁體中文與英文，並會記住
上次選擇的語言。首次開啟時，中文系統預設顯示繁體中文，其他系統語言預設顯示英文。

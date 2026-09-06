# tronclass-auto

自動觀看 eclass / TronClass 影片、填寫表單的 CLI 工具。

## 安裝

```bash
npm install -g tronclass-auto
```

## 使用方法

### 自動登入取得 Cookie

```bash
tronclass login
```

會自動開啟瀏覽器，手動登入後 Cookie 自動儲存。

### 手動匯入 Cookie

```bash
tronclass import-cookies "session=xxx; key=value; ..."
```

### 開始自動觀看

```bash
tronclass run
```

### 查看進度

```bash
tronclass status
```

### 查看設定

```bash
tronclass config
```

## 設定檔

設定檔位於 `~/.eclass-auto/config.json`：

```json
{
  "headless": false,
  "slowMo": 50,
  "playbackRate": 2,
  "courses": [
    "https://eclass.yuntech.edu.tw/course/127331/content#/",
    "https://eclass.yuntech.edu.tw/course/127343/content#/"
  ]
}
```

## 功能

- 自動偵測已完成 / 未完成的活動
- 影片 2 倍速 + 靜音播放
- 已看完的自動跳過，不重複觀看
- 中斷後重跑自動接續進度（本地 progress.json）
- 跳過考試，只處理影片
- 自動登入取得 Cookie（`tronclass login`）
- Buffering 自動等待、暫停自動重播

## 注意事項

- Cookie 過期後需重新執行 `tronclass login`
- 自動化工具可能違反學校使用條款，請自行評估
- 建議先在測試課程驗證功能

# GymTracker iOS ネイティブアプリ（Capacitor）

Safari/PWA ではバックグラウンド録音と Spotify 同時再生が iOS に止められます。このアプリは Capacitor + `AVAudioSession` + ネイティブ PCM キャプチャでそれを回避します。

## 必要なもの

- macOS + Xcode 15+
- Apple ID（個人の実機インストール／TestFlight）
- このリポジトリを Mac に clone
- Node.js 18+

## セットアップ

```bash
npm install
npm run cap:sync
npm run cap:open
```

Xcode で:

1. Signing & Capabilities で自分の Team を選択
2. Bundle ID `com.keiton212.gymtracker`（必要なら変更）
3. 実機を接続して Run

CocoaPods 未導入の場合（初回）:

```bash
sudo gem install cocoapods
cd ios/App && pod install && cd ../..
npm run cap:sync
```

## 実機検証チェックリスト

録音開始後に次を確認する。

1. アプリ前面 + Spotify 再生中も「録音中（アプリ・音楽同時OK）」のまま続き、発話がセットに入る
2. ホーム画面に送って 1〜2 分後も録音が止まらず、戻ってから発話が反映される
3. 画面ロック中に話した内容が、解除後のセット一覧に出る
4. DJI Mic Mini を「マイク一覧を更新」で選べる
5. OpenAI / Groq の解析と履歴反映が従来どおり動く

失敗時の手がかり:

- ステータスがすぐ「マイク入力が中断」→ まだ Web キャプチャ経路の可能性。アプリ版表示か確認
- Worker が origin エラー → `capacitor://localhost` が Worker で許可されているか（本番 Worker を再デプロイ）

## Web との関係

- GitHub Pages の PWA はそのまま使える（制限あり）
- ネイティブ機能は Capacitor アプリ内だけ有効（`GymNativeAudio.available()`）

# GymTracker iOS アプリ（Windows 開発向け）

Safari/PWA ではバックグラウンド録音と Spotify 同時再生が iOS に止められます。  
このリポジトリの Capacitor アプリは `AVAudioSession` + ネイティブ PCM でそれを回避します。

**Mac は不要です。** コードは Windows、ビルドは GitHub Actions（macOS ランナー）です。

## いま入っているもの

- `ios/` Capacitor シェル
- `GymAudioSession`（mixWithOthers / Bluetooth / バックグラウンド audio / AVAudioEngine PCM）
- アプリ内だけネイティブ録音（`GymNativeAudio.available()`）
- Worker は `capacitor://localhost` を許可済み

## Windows での進め方

### 1. いつもの開発（この PC）

```bat
npm install
npm run www
npm test
```

静的 Web / PWA の確認は従来どおり GitHub Pages。

### 2. iOS コンパイル確認（Mac なし）

GitHub に push するか、Actions で **iOS Build** を `workflow_dispatch` 実行。  
`Compile (iOS Simulator)` が緑なら、Swift / Capacitor プロジェクトはビルド可能な状態です。

### 3. 実機インストール（iPhone）

実機用 IPA の署名には **Apple Developer（有料 Team）の証明書**が必要です。  
Windows からは次のどちらかです。

**A. Sideloadly（手軽・7日ごと再署名が多い）**

1. [Sideloadly](https://sideloadly.io/) を Windows に入れる
2. Apple ID でログイン
3. 署名済み IPA を iPhone にインストール
4. 設定 → 一般 → VPNとデバイス管理 で開発元を信頼

※ 署名済み IPA は、有料 Apple Developer で作った証明書を GitHub Secrets に入れたあと、別途「Device IPA」ジョブを足すか、一度だけ借り物 Mac / クラウド Mac で Archive する必要があります。無料 Apple ID だけでは Background Modes 付きの安定配布が難しい場合があります。

**B. 有料 Apple Developer + 証明書を Secrets に登録（推奨・安定）**

GitHub リポジトリ Secrets 例:

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`（.p12）
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`

用意できたら言ってください。Device IPA 用 workflow を有効化して、Artifacts から IPA を落とせるようにします。

### 4. 実機検証チェックリスト

アプリ版で録音開始後:

1. Spotify 再生中も「録音中（アプリ・音楽同時OK）」のまま続き、発話がセットに入る
2. ホームに送って 1〜2 分後も止まらず、戻ってから発話が反映される
3. 画面ロック中の発話が解除後にセットへ出る
4. DJI Mic Mini を選べる
5. OpenAI / Groq と履歴反映が従来どおり

## Web との関係

| 実行環境 | 裏録音 / Spotify 同時 |
|---|---|
| Safari / GitHub Pages PWA | 不可（iOS 制限） |
| Capacitor iOS アプリ | 対応（このプロジェクト） |

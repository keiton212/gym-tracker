# GymTracker iOS アプリ（Windows 開発向け）

Safari/PWA ではバックグラウンド録音と Spotify 同時再生が iOS に止められます。  
このリポジトリの Capacitor アプリは `AVAudioSession` + ネイティブ PCM で対応を目指しています。シミュレータのコンパイル成功だけでは、Spotify同時再生や画面ロック中の録音・発話反映が成功したとは判断できません。実機検証が必要です。

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

今回のGitHub ActionsによるDevelopment / Ad Hoc配布には、Apple Developer Programの有料Team、秘密鍵を含む証明書（p12）、対象iPhoneを登録したプロビジョニングプロファイルを使用します。無料Apple AccountでSideloadlyが再署名する方法とは別の手順です。

**A. Sideloadlyでインストール**

1. [Sideloadly](https://sideloadly.io/) を Windows に入れる
2. iPhoneをUSB接続し、ロックを解除して「このコンピュータを信頼」を確認
3. 下記Actionsで作るIPAは、既存署名を保持する通常インストール方式が利用できるか確認してインストール。Apple Accountで再署名する方式を選んだ場合は署名条件が変わるため、別方式として記録する
4. iPhoneが要求する信頼設定・Developer Modeを確認。表示されない設定を完了扱いにしない

Sideloadly本体とWindows用Appleドライバの要件は [公式サイト](https://sideloadly.io/) で確認してください。既存のAppleソフトを勝手に削除しないでください。

**B. 有料 Apple Developer + 証明書を Secrets に登録（推奨・安定）**

GitHub リポジトリ Secrets 例:

- `APPLE_TEAM_ID`
- `APPLE_CERTIFICATE_BASE64`（.p12）
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_PROVISIONING_PROFILE_BASE64`

`.github/workflows/ios-device.yml` の **iOS Device IPA** が `scripts/build-ios-device.sh` で署名・Archive・Exportを実行し、`GymTracker-device-ipa`（保存7日）を出力します。シークレットが不足している場合は名前だけを表示して停止します。プロファイルのTeam・Bundle ID・期限・登録端末・証明書の一致も確認します。

2026-09-14確認時点では、GitHubの既定ブランチは `main`、最新iOSコードは `master` にあります。手動実行ボタンは既定ブランチにworkflowがないと使えないため、既定ブランチを勝手に変更しないでください。代わりに、4つのSecretsを登録してから、iOSコードとこのworkflowを含む確認済みコミットに一意の `ios-device-` タグを付けてpushするとビルドが始まります。

```powershell
git status --short
git log -1 --oneline
# 最新コードとworkflowが含まれることを確認してから実行。タグは再利用しない。
$iosTag = 'ios-device-' + (Get-Date -Format 'yyyyMMdd-HHmmss')
git tag $iosTag HEAD
git push origin $iosTag
```

GitHub Actionsが成功するまで、Device IPA生成を完了扱いにしないでください。秘密鍵・p12・プロファイル・パスワードはリポジトリやチャットへ保存しません。IPAにも登録端末情報を含む署名プロファイルが入るため、公開Releaseへ添付しないでください。

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
| Capacitor iOS アプリ | ネイティブ経路を実装済み。実機動作は未検証 |

# PC音声ブリッジ

個人用のCodex方式。iPhoneで録音した短いWAVを認証付きCloudflareキューから取得し、PCのfaster-whisper large-v3-turbo（CPU int8）で文字起こし、ChatGPTログイン済みのcodex.exeで構造化します。OpenAI APIキーへの自動切替はありません。Codexの契約上限・PCの電気代・Cloudflareの利用枠は別です。

このPCでは `Start-GymTracker.cmd` を開くと非表示で起動します。二重起動はロックで防ぎます。PCの電源・ネット接続・スリープ解除が必要です。自動起動は設定していません。iPhoneのバックグラウンド録音の制約は変わりません。

秘密設定・モデル・追加Pythonパッケージ・動作ログは `%LOCALAPPDATA%/GymTracker/voice-bridge` に保存します。`config.json`、Codexの認証ファイル、APIキーをGitに追加しないでください。ブリッジ用秘密鍵はWorkerの `CODEX_BRIDGE_SECRET` とPCのみが保持します。ブラウザは従来のアプリ専用パスワードで認証します。

導入時の設定: `config.json` にendpoint、secret、codex実行パス、python実行パス、必要ならMicrosoft Visual C++ランタイムのdllDirectory。Pythonの `packages` にfaster-whisperをインストールし、`voice-worker/src/protocol.mjs` のschema/auditSchema/promptを `protocol.json` として保存します。このPCでは既存のCodex付属Microsoftランタイムを参照しています。Codexのアップデートでそのパスが消えた場合は設定の更新が必要です。

音声はPCではメモリ上で処理します。Cloudflareのキューは最大100件、15分で失効し、結果を受け取った時点で音声と入力文脈を削除します。端末の未確定録音は従来どおり保持します。処理の再送は同じIDで重複防止します。PCが停止している場合は425で通知し、iPhoneから再試行します。Codexの一時作業フォルダは処理後に削除し、シェル・ブラウザ・プラグインなどのツールを無効化してJSONだけを返します。

音声区間の切り出しはiPhone側の既存検出を使います。PCではWhisperのno-speech/logprob判定で不確かな出力を確認待ちにします。追加のONNX VADは使いません。これらの指標は精度の保証ではありません。

第三方式のGroqはWorkerに `GROQ_API_KEY` を設定すると有効です。Whisper large-v3-turboとGPT-OSS 120Bを使用します。xAIのGrokとは別サービスです。アカウント・接続先の確認と実通信テストが済むまでは設定待ち表示にします。

検証: `node --test tests/ai-voice*.test.cjs tests/voice-worker.test.mjs tests/voice-relay.test.mjs`。
実通信は `GYM_TEST_PROVIDER=codex` を環境変数に設定して `node tests/live-voice-smoke.cjs`。端末外に用意した合成音声のみで試し、通常履歴へは書き込みません。iPhone＋実マイクの80分試験は別途必要です。

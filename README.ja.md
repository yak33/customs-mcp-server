<div align="center">

# customs-mcp-server

**税関業務を MCP ツールとして提供 — AI エージェントにそのまま組み込み可能。**

13 の本番品質の税関・貿易機能(申告書、船舶情報、関税率、デュアルユース判定、
AI 申告書生成 ……)を標準 [Model Context Protocol](https://modelcontextprotocol.io/)
ツールとして公開、Claude Desktop / Claude Code / Cursor / Windsurf / Trae
等あらゆる MCP 対応 AI クライアントから直接呼び出せます。

[![npm](https://img.shields.io/npm/v/@dearmrzhang/customs-mcp-server)](https://www.npmjs.com/package/@dearmrzhang/customs-mcp-server)
[![Node](https://img.shields.io/node/v/@dearmrzhang/customs-mcp-server)](https://nodejs.org/)
[![License](https://img.shields.io/npm/l/@dearmrzhang/customs-mcp-server)](LICENSE)
[![TypeScript](https://img.shields.io/badge/typescript-strict-blue.svg)](tsconfig.json)
[![MCP](https://img.shields.io/badge/MCP-1.x-purple.svg)](https://modelcontextprotocol.io/)
[![GitHub stars](https://img.shields.io/github/stars/yak33/customs-mcp-server?style=social)](https://github.com/yak33/customs-mcp-server)

[English](README.md) · [简体中文](README.zh-CN.md) · **日本語**

</div>

---

## ✨ 機能

- **14 の MCP ツール** — customs-skill のあらゆる機能を zod 検証付きの型安全なツールとして提供
- **全 AI クライアント対応** — Claude Desktop / Claude Code / Cursor / Windsurf / Trae / Codex / 任意の MCP クライアント
- **本番品質の認証** — `/session/exchange` → 5 分有効の `agentToken` → アクションコードホワイトリスト → テナント境界
- **呼び出し単位の身分上書き** — サーバー既定 + ツール呼び出しごとに `_identity` フィールドで上書き可(マルチユーザー / マルチテナント対応)
- **AI 申告書生成** — multipart アップロード、no-wait モード、`decId` ポーリングパターン
- **エラー翻訳** — バックエンドの `NEED_BIND` / `NEED_TENANT` 等を実行可能な英語ガイダンスに変換
- **階層型タイムアウト** — 15 秒(読取)/ 180 秒(アップロード)/ 660 秒(低速 AI クエリ)
- **ランタイム依存ゼロ** — `@modelcontextprotocol/sdk` + `zod` + `dotenv` のみ;Node 18+ ビルトインの `fetch` + `FormData` を使用
- **デュアル Transport** — stdio(Claude Desktop)と Streamable HTTP(リモート / セルフホスト)

## 🚀 クイックスタート

### 1. バックエンドで身分を紐付け

税関システムの管理者に依頼して、`agent_identity_binding` テーブルへ
1 行追加し、`(platform, externalUserId)` を既存の `sys_user_id` にマッピングします。
完全な SQL は [docs/identity-binding.md](docs/identity-binding.md) を参照。

### 2. AI クライアントを設定

[`examples/`](examples/) からテンプレートを選択:
- [Claude Desktop](examples/claude-desktop.json)
- [Cursor](examples/cursor.json)
- [Windsurf](examples/windsurf.json)
- [Trae](examples/trae.json)
- [Claude Code](examples/claude-code.md)

または汎用設定を使用:

```json
{
  "mcpServers": {
    "customs": {
      "command": "npx",
      "args": ["-y", "@dearmrzhang/customs-mcp-server", "--transport", "stdio"],
      "env": {
        "CUSTOMS_API_BASE_URL": "http://your-backend-host:port",
        "CUSTOMS_ACCESS_KEY": "your-access-key",
        "CUSTOMS_SECRET_KEY": "your-secret-key",
        "CUSTOMS_DEFAULT_PLATFORM": "mcp",
        "CUSTOMS_DEFAULT_EXTERNAL_USER_ID": "your-bound-username",
        "CUSTOMS_DEFAULT_EXTERNAL_CORP_ID": "mcp-prod"
      }
    }
  }
}
```

### 3. クライアントを再起動して問い合わせ

> 「`customs_query_tariff` で HS コード 8471300000 を調べてください」

これだけです。AI エージェントがツールを選択、MCP サーバーがリクエストに
署名し、grant を交換、構造化された関税データを返します。

## 🏗 アーキテクチャ

```
                      ┌────────────────────────────────┐
                      │  AI クライアント (Claude /     │
                      │  Cursor / Windsurf / Trae...)  │
                      └───────────────┬────────────────┘
                                      │ MCP プロトコル (stdio | HTTP)
                      ┌───────────────▼────────────────┐
                      │  customs-mcp-server             │
                      │                                 │
                      │  • 14 のツールハンドラ          │
                      │  • 身分解決                     │
                      │  • Signer + GrantBroker         │
                      │    (5 分間 agentToken キャッシュ) │
                      │  • エラー翻訳                   │
                      └───────────────┬────────────────┘
                                      │ HTTPS + 署名ヘッダ
                      ┌───────────────▼────────────────┐
                      │  税関バックエンド                │
                      │  /open-api/agent/v1/...          │
                      └─────────────────────────────────┘
```

## 📚 ドキュメント

| ドキュメント | 内容 |
|---|---|
| **[CHANGELOG.md](CHANGELOG.md)** | バージョン変更履歴、v0.1.2 → v1.0.0 の破壊的変更含む |
| **[docs/tool-reference.md](docs/tool-reference.md)** | 全 14 ツールの完全なスキーマと使い方 |
| **[docs/identity-binding.md](docs/identity-binding.md)** | バックエンド SQL 設定、マルチテナント設計、トラブルシューティング |
| **[examples/](examples/)** | 5 つの AI クライアントの設定例 |

## 🛠 環境変数

| 変数名 | 必須 | デフォルト | 説明 |
|---|---|---|---|
| `CUSTOMS_API_BASE_URL` | ✅ | — | 税関バックエンドのルート URL |
| `CUSTOMS_ACCESS_KEY` | ✅ | — | 静的署名 accessKey |
| `CUSTOMS_SECRET_KEY` | ✅ | — | 静的署名 secretKey |
| `CUSTOMS_DEFAULT_PLATFORM` | ✅ | — | 身分プラットフォーム(例 `mcp` / `cursor`) |
| `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` | ✅ | — | 紐付け済みの外部ユーザー識別子 |
| `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID` | ✅ | — | 紐付け済みの外部企業識別子 |
| `CUSTOMS_API_PREFIX` | | `/open-api/agent` | API パスプレフィックス |
| `CUSTOMS_TIMEOUT_MS` | | `15000` | 既定のリクエストタイムアウト(ミリ秒) |
| `CUSTOMS_UPLOAD_TIMEOUT_MS` | | `180000` | AI 申告書アップロードタイムアウト |
| `CUSTOMS_DUAL_USE_TIMEOUT_MS` | | `660000` | デュアルユース低速クエリタイムアウト |
| `CUSTOMS_TIMESTAMP_TIMEZONE` | | `Asia/Shanghai` | タイムスタンプの TZ(バックエンドと一致必須) |
| `CUSTOMS_DEFAULT_CHANNEL` | | `${PLATFORM}` | `/session/exchange` の channel フィールド |
| `MCP_HTTP_HOST` | | `0.0.0.0` | HTTP transport のバインド host |
| `MCP_HTTP_PORT` | | `8787` | HTTP transport ポート |
| `MCP_HTTP_PATH` | | `/mcp` | HTTP transport パス |
| `CUSTOMS_DEBUG` | | `0` | `1` で stderr 詳細デバッグログを有効化 |

## 🧪 利用可能なツール

14 ツール、7 ドメインに分かれます。完全なスキーマと例は
[tool-reference.md](docs/tool-reference.md) を参照。

| ドメイン | ツール |
|---|---|
| **申告書** | `customs_get_declaration_status` · `customs_query_declaration_list` · `customs_get_declaration_detail` · `customs_get_import_export_status` · `customs_get_full_process_tracking` |
| **船舶** | `customs_query_ship_info`(I→E 自動フォールバック付)· `customs_query_ship_plan` |
| **マニフェスト** | `customs_query_manifest_info` · `customs_query_ship_manifest_info` |
| **関税率** | `customs_query_tariff` |
| **コンプライアンス** | `customs_query_dual_use_item`(低速 AI クエリ) |
| **注文** | `customs_create_order_draft`(プレチェックのみ) |
| **AI Maker** | `customs_submit_ai_maker` · `customs_get_ai_maker_status` |

## ⚠️ v0.1.x からのアップグレード

v1.0.0 は **破壊的リリース** で、新しい必須 env 変数があります。
全変更は [CHANGELOG.md → 1.0.0](CHANGELOG.md#100--2026-05-24) を参照。要点:

1. 3 つの身分 env を追加(`CUSTOMS_DEFAULT_PLATFORM` /
   `CUSTOMS_DEFAULT_EXTERNAL_USER_ID` / `CUSTOMS_DEFAULT_EXTERNAL_CORP_ID`)
2. 管理者に `agent_identity_binding` への紐付け行追加を依頼
3. `customs_query_tariff_info` を `customs_query_tariff` にリネーム
4. `customs_get_declaration_detail` の呼び出しを `cusCiqNo` から `entryId`
   (`decId` が既知ならそちら優先)へ切り替え

## 🛡 セキュリティ

- `CUSTOMS_SECRET_KEY` とメモリ内の `agentToken` キャッシュはサーバープロセス外に漏れません
- 呼び出し単位の `_identity` オーバーライドには PII を埋め込まないでください — MCP 構造化レスポンスに現れます
- すべての書き込み操作はバックエンドのアクションコードホワイトリストを経由
- AI 申告書ステータス照会のクロステナントアクセスはバックエンドで遮断

## 🤝 コントリビュート

[github.com/yak33/customs-mcp-server](https://github.com/yak33/customs-mcp-server/issues) にて Issue / PR を歓迎します。

```bash
git clone https://github.com/yak33/customs-mcp-server.git
cd customs-mcp-server
pnpm install
pnpm build
pnpm dev:stdio      # または dev:http
```

## 📄 ライセンス

MIT © [ZHANGCHAO](https://github.com/yak33)、詳細は [LICENSE](LICENSE)。

## 🙏 関連プロジェクト

- **[customs-skill](https://github.com/yak33/customs-skill)** — 同じ 13 の税関機能を持つ OpenClaw 用 Feishu/Lark 統合版

---

<div align="center">
<sub>Built with 🦞 by ZHANGCHAO · <a href="CHANGELOG.md">v1.0.0</a> · 2026-05-24</sub>
</div>

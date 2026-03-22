# Bord v0.1

> AI-friendly structured component language  
> **bored** (AIが完璧すぎてエンジニアが暇) + **board** (ボード)

## コンセプト

- **書く言語ではなく、編集しやすい構造化言語**
- 1つの責務は1つのブロックにしか存在しない
- コンパイラは推測しない。AIが明示し、コンパイラが変換する

## クイックスタート

```bash
npm install bordjs
npx bord init          # Counter.bord を生成
npx bord check         # 型チェック
npx bord build         # Next.js App Router 向けにコンパイル
```

## 構文

```bord
type Todo = {
  id: string
  task: string
  checked: boolean = false
}

component TodoApp {

  props {
    title: string          // 型注釈は props のみ必須
    maxItems: number = 100
  }

  state {
    inputText: string = ""  // デフォルト値は必須
    count: number = 0
  }

  server {
    todos: Todo[] = await db.getTodos()  // サーバー専用。DBアクセス等
  }

  client {
    handleAdd = () => {
      state.inputText = ""   // state 変更は client からのみ
      state.count += 1
    }

    handleDelete = async (id: string) => {
      await api.delete(id)
      state.count -= 1
    }
  }

  view {
    <div className="app">
      <h1>{props.title}</h1>
      <p>{state.count} items</p>
      <button onClick={client.handleAdd}>追加</button>
    </div>
  }
}
```

## ブロックの責務

| ブロック | 責務 | ルール |
|---------|------|--------|
| `props` | 外部入力 | 型注釈必須・読み取り専用 |
| `state` | クライアントローカル状態 | デフォルト値必須・`client` からのみ変更可 |
| `server` | サーバー専用処理 | DBアクセス・APIキー・認証 |
| `client` | ブラウザ処理 | イベントハンドラ・state更新 |
| `view` | 宣言的UI | JSXのみ・イベントは `client.xxx` 形式 |

## コンパイル出力 (Next.js App Router)

```
bord-out/
  TodoApp/
    page.tsx            ← Server Component (server ブロック)
    TodoApp.client.tsx  ← "use client" (client + state + view)
    types.ts            ← type 定義 + Props interface
```

## 境界チェック

| コード | 内容 |
|--------|------|
| B001 | props フィールドに型注釈がない |
| B002 | state フィールドにデフォルト値がない |
| B003 | view のイベントが client 経由でない |
| B004 | client から server 値を直接参照 |
| B005 | 未定義の型を参照 |
| W001 | view 内のインライン arrow function (warning) |

## 開発

```bash
npm install
npm run build   # tsc
npm test        # jest
```

## ロードマップ

- v0.1: パーサー・型チェック・Next.js コンパイル・CLI ✓
- v0.2: `@rule` バリデーション
- v0.3: Hot-reloading
- v0.4: 独自ビルドシステム

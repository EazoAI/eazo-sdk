# Eazo SDK

Eazo 平台应用的官方 SDK。

[English](./README.md) | 中文

## 包

**`@eazo/sdk`** — [`sdk/`](./sdk/) — 面向 Eazo 应用的 capability-first SDK。一份代码无缝运行在浏览器和 Eazo Mobile WebView 中。

- `auth` — 统一登录流程（浏览器内走 SDK 自带 UI，Eazo Mobile 下委托给宿主原生登录）、会话管理、用户资料、token 获取
- `device` — 运行时上下文（platform / locale / safe area / backend URL）
- `share` — 把文字、图片附件和可选 App 内目标路径交给 Eazo Mobile 的发帖编辑器
- `payments` — Eazo marketplace 收款能力；生成 App 通过 `@eazo/sdk/payments` 发起 checkout，永远不接收 Stripe secret
- `useEazo(selector)` — 基于 `useSyncExternalStore` 的 React 集成
- `requireAuth` — 服务端 Next.js API route 的解密与鉴权守卫
- 内置 ECC secp256k1 + AES-256-GCM 混合加密用于 session token

**安装：**

```bash
npm install @eazo/sdk
```

**快速示例：**

```tsx
// app/layout.tsx
import { EazoProvider } from "@eazo/sdk/react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return <EazoProvider>{children}</EazoProvider>;
}
```

```tsx
// 任意组件
import { auth } from "@eazo/sdk";
import { useEazo } from "@eazo/sdk/react";

function Header() {
  const user = useEazo((s) => s.auth.user);
  if (!user) return <button onClick={() => auth.login()}>登录</button>;
  return <span>你好，{user.name}</span>;
}
```

```bash
# Next.js 单次解锁收款脚手架
pnpm dlx @eazo/sdk payments init --recipe one-time-unlock
```

完整 API 见 [`sdk/README.md`](./sdk/README.md)，Host-App 通信协议见 [`sdk/PROTOCOL.md`](./sdk/PROTOCOL.md)。

## 安全

SDK 使用以下混合加密方案处理 session token：

- **ECC secp256k1** — 密钥封装
- **AES-256-GCM** — 数据加密
- **ECDH** — 共享密钥派生
- **SHA-256** — 密钥推导

## 发布

通过 git tag 触发发布。详见 [PUBLISHING.md](./PUBLISHING.md)。

## 许可证

MIT

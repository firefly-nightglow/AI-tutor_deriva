# ADR-0001: Adopt Windows desktop app form factor (Electron), drop mini-program/plugin form

**Status:** `accepted`
**Date:** `2026-10-02`
**Deciders:** `产品所有者（本人）`

## Context

产品定位是辅助大学生自学的 AI tutor。核心差异化功能——屏幕边缘吸附的快捷悬浮窗（应对"查资料打断学习"的痛点）与实时屏幕感知、选中即问（应对"AI 与学生信息不统一"的痛点）——要求应用能常驻桌面、全局置顶、读取屏幕内容。最初设想"尽量做成小程序或插件"，但微信小程序运行于手机、浏览器插件只能读取标签页内部，两者的权限模型在系统层面均不允许读取其他桌面应用的画面。"轻量"诉求与核心痛点解决能力发生冲突。

## Decision

We will 将产品形态定为 Windows 桌面应用，第一版采用 Electron + React + TypeScript 技术栈，本地存储使用 SQLite，不接入外部数据库。"轻量"诉求通过免外部依赖、小安装包优化来满足，不再作为形态约束。

## Consequences

- 正面：悬浮窗、屏幕感知、树状对话等全部核心功能在技术上成立；可直接参考 Specter-AI（同为 Electron + React + TS）的源码结构；SQLite 满足"不接外部数据库"的限制，数据完全本地私有。
- 负面：需要安装，无法像小程序一样点开即用；Electron 安装包体积较大（约百 MB 级）；跨平台（Android/iPad）不在 Electron 能力范围内。
- 中性：后续若安装包体积成为真实用户反馈的问题，可评估迁移 Tauri，但需承担 Rust 维护成本。

## Alternatives Considered

* 微信小程序 / 浏览器插件 — 系统权限模型不允许读取桌面其他应用画面，核心功能 2、3 无法实现，产品退化为普通套壳聊天框。
* Tauri — 安装包小约 10 倍，但要求 Rust 基础，对大一学生的维护成本过高，第一版不采用。
* PWA + 桌面壳 — 同样无法突破屏幕读取的权限限制。

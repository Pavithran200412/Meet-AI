<div align="center">

# 🧠 Nexus AI — Technical Interview Platform

**AI-powered interview prep with real-time voice, code execution, resume parsing, and grounded web search.**

[![Netlify Status](https://api.netlify.com/api/v1/badges/deploy-status/badge.svg)](https://meet-ai.netlify.app)
![TypeScript](https://img.shields.io/badge/TypeScript-5.2-blue?logo=typescript)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react)
![Gemini](https://img.shields.io/badge/Gemini-2.5_Flash-4285F4?logo=google)

</div>

---

## ✨ Features

| Feature | Detail |
|---|---|
| 🎙️ **Live Voice Interview** | Real-time bidirectional audio via Gemini Live API — interruptions, transcripts, and PCM audio pipeline |
| 📄 **PDF Resume Upload** | PDF sent as native inline data to Gemini — no client-side parsing, full comprehension |
| 🖼️ **Image Attachments** | Attach screenshots, diagrams, or whiteboard photos for visual context |
| 💻 **Code Workspace** | Monaco-style editor with live code execution across 8 languages via Piston API |
| 🔍 **AI Code Review** | Structured per-language rubric scoring (JS, TS, Python, Java, Go, React, Algorithms) |
| 🌐 **Grounded Web Search** | Gemini + Google Search grounding for real-time fact retrieval per question |
| 🧠 **Session Memory** | `sessionStorage`-backed context: facts from each exchange are stored and recalled |
| 🤖 **Dual Persona** | Toggle between strict **Interviewer** and encouraging **Tutor** mode |
| ⚡ **DeepSeek Fallback** | If Gemini errors, automatically falls back to DeepSeek-V3 via HuggingFace Router |
| 🗺️ **Maps Grounding** | Geographic context queries grounded via Google Maps |

---

## 🏗️ Architecture

```
Browser (React + Vite)
│
├── App.tsx                  — Main UI, file upload, voice/text orchestration
├── services/
│   ├── geminiService.ts     — Gemini API (text, live audio, image gen, code review)
│   ├── mcpClient.ts         — MCP layer: real sessionStorage memory, Gemini search, GitHub API
│   └── compilerService.ts   — Code execution via Piston API (emkc.org)
├── utils/
│   ├── ragEngine.ts         — RAG orchestration: retrieves and records session context
│   └── audioUtils.ts        — PCM encode/decode for Live API audio pipeline
└── components/
    ├── CodeEditor.tsx        — Code editor + run/review panel
    ├── TerminalMessage.tsx   — Chat message renderer (markdown, images, grounding links)
    └── AudioVisualizer.tsx   — Real-time waveform animation during voice mode
```

---

## 🚀 Run Locally

**Prerequisites:** Node.js 18+

```bash
# 1. Clone and install
git clone https://github.com/Pavithran200412/Meet-AI
cd Meet-AI
npm install

# 2. Configure environment
cp .env.example .env
# Fill in your API key (see below)

# 3. Start
npm run dev
```

---

## 🔑 Environment Variables

Create a `.env` file in the project root:

```env
# Required — Get from https://aistudio.google.com/apikey
API_KEY=your_gemini_api_key

# Optional — Enables DeepSeek fallback + image generation fallback via HuggingFace
HF_TOKEN=your_huggingface_token

# Optional — GitHub REST API (for candidate repo fetching; public API works without this)
GITHUB_TOKEN=your_github_token
```

> [!WARNING]
> `GITHUB_TOKEN` and other secrets are **server-side only** and must NOT be added to `vite.config.ts`'s `define` block — Vite inlines `define()` values as literals into the client bundle.
> Only `API_KEY` and `HF_TOKEN` are intentionally client-visible (this app has no backend).

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, TypeScript, Vite 5, Tailwind CSS |
| AI — Chat & Reasoning | Gemini 2.5 Flash / Gemini 3.1 Pro Preview |
| AI — Voice | Gemini 2.5 Flash Native Audio (Live API) |
| AI — Image Generation | Gemini 2.5 Flash Image, Imagen 3 |
| AI — Fallback | DeepSeek-V3 via HuggingFace Router |
| Code Execution | [Piston API](https://github.com/engineer-man/piston) (Python, JS, TS, Java, Go, Rust, C++, SQL) |
| Context / MCP | sessionStorage memory + Gemini grounded search |
| Deployment | Netlify |

---

## 🎮 Usage Guide

### Text Interview Mode
1. Type a message or upload your **PDF resume** via the 📎 button
2. The AI reads your resume and begins a structured technical interview
3. Questions adapt based on your experience, covering algorithms, system design, and your stack

### Voice Interview Mode  
1. Tap the **🎙️ mic button** to start a live session
2. Speak naturally — the AI interrupts, asks follow-ups, and transcribes in real-time
3. Tap **END** to stop the session

### Code Workspace
1. Navigate to the **Workspace** tab
2. Write your solution in the editor (supports 8 languages)
3. Hit **Run** to execute against the Piston sandbox
4. Hit **Review** to get AI-powered rubric scoring

---

## 📁 Supported File Types

| Type | Handled As |
|---|---|
| `.pdf` | Native Gemini inline data — full document comprehension |
| Images (`.jpg`, `.png`, `.webp`, etc.) | Visual context passed alongside the prompt |
| `.txt`, `.js`, `.ts`, `.py` | Raw text injected as file context |

---

## 🔧 MCP Context Layer

The app uses a lightweight **Model Context Protocol** implementation running entirely in-browser:

- **Memory** — Each AI exchange stores a summary fact in `sessionStorage`, recalled on future turns
- **Web Search** — Queries use Gemini's Google Search grounding for live web results
- **Rubrics** — Per-language structured scoring rubrics (auto-selected by topic)
- **GitHub** — Public repo fetching via GitHub REST API

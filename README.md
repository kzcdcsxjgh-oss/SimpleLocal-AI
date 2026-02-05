# 🏠 SimpleLocal AI

**The Subscription-Free Document Assistant**

> "So simple your grandma can use it. So private your data never leaves your room."

---

## 🌟 What is SimpleLocal AI?

SimpleLocal AI is a free, open-source desktop application that lets you chat with your documents (PDFs, Word docs, text files) using AI—**100% locally on your computer**. No internet required after setup. No subscriptions. No data collection.

**Just double-click and go.** By default the app uses [Ollama](https://ollama.ai) for fully local, private AI. You can also connect to any OpenAI-compatible API if you prefer.

## ✨ Features

- **🔒 100% Private**: All processing happens on YOUR computer. Your documents never leave your device.
- **💰 Forever Free**: No subscriptions, no API costs, no hidden fees.
- **👵 Senior-Friendly**: Large text, high contrast, simple interface. Passes the "Grandma Test".
- **📄 Multiple Formats**: Supports PDF, DOCX, TXT, and Markdown files.
- **🧠 Smart Search**: Uses RAG (Retrieval-Augmented Generation) to find relevant information.
- **🚀 One-Click Install**: No Terminal, no Python, no Docker. Just a simple installer.

## 🚀 Getting Started

### For Users (Easy Way)

1. **Download** the installer for your system from the Releases page
2. **Install** by double-clicking the downloaded file
3. **Install Ollama** from [ollama.ai](https://ollama.ai) and run `ollama serve` (or skip this step to use an OpenAI-compatible API instead)
4. **Run** SimpleLocal AI and start adding documents and chatting

### For Developers

```bash
# Clone the repository
git clone https://github.com/yourusername/SimpleLocal-AI.git
cd SimpleLocal-AI

# Install dependencies
npm install

# Start in development mode
npm run dev
```

### Building for Distribution

```bash
# Build for your current platform
npm run package

# Or build for specific platforms
npm run package:win    # Windows (.exe)
npm run package:mac    # macOS (.dmg)
npm run package:linux  # Linux (.AppImage)
```

## 🏗️ Project Structure

```
SimpleLocal-AI/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Main entry point & IPC handlers
│   │   └── preload.ts        # Secure IPC bridge (contextBridge)
│   │
│   ├── renderer/             # React frontend
│   │   ├── App.tsx           # Main application
│   │   ├── components/       # UI components
│   │   │   ├── ChatArea.tsx
│   │   │   ├── ChatList.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   ├── Settings.tsx     # LLM provider settings
│   │   │   └── SetupScreen.tsx  # First-run setup
│   │   └── styles.css        # Senior-friendly styling
│   │
│   ├── core/                 # Framework-agnostic core library
│   │   ├── index.ts          # Core class (main entry point)
│   │   ├── document-processor.ts  # PDF/DOCX/TXT/MD parsing & chunking
│   │   ├── adapters/         # LLM provider adapters
│   │   │   ├── ollama.ts     # Ollama HTTP API
│   │   │   ├── openai.ts     # OpenAI-compatible API
│   │   │   └── helpers.ts    # Shared adapter utilities
│   │   ├── storage/          # Persistence
│   │   │   └── sqlite.ts     # SQLite via better-sqlite3
│   │   ├── search/           # Full-text search
│   │   │   └── fts.ts        # SQLite FTS5
│   │   └── interfaces/       # TypeScript interfaces
│   │
│   └── shared/               # Shared types
│       └── types.ts
│
├── package.json
├── vite.config.ts            # Frontend build config
├── tsconfig.json             # TypeScript config (renderer)
└── tsconfig.main.json        # TypeScript config (main process)
```

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Desktop | Electron | Cross-platform desktop app |
| Frontend | React + TypeScript | User interface |
| AI Engine | Ollama / OpenAI-compatible | Local or cloud LLM (user's choice) |
| Search | SQLite FTS5 | Full-text search with BM25 ranking |
| Database | better-sqlite3 | Local persistence (documents, chats) |
| Document Processing | pdf-parse, mammoth | PDF and DOCX parsing |

## 📖 How It Works

1. **First Run**: The app connects to your local Ollama instance (or an OpenAI-compatible API you configure in Settings).

2. **Add Documents**: Click the "Add Document" button to select PDFs, Word docs, text files, or Markdown.

3. **Processing**: The app reads your documents, splits them into chunks, and indexes them locally using SQLite FTS5 for fast full-text search.

4. **Chat**: Ask questions in natural language. The app searches your documents for relevant context, sends it to the LLM together with your question, and streams the answer back.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Docs  │───▶│   Chunking   │───▶│  FTS5 Index │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Answer    │◀───│  Ollama /    │◀───│   SQLite    │
│  (streamed) │    │  OpenAI API  │    │             │
└─────────────┘    └──────────────┘    └─────────────┘
```

## 🤝 Contributing

We welcome contributions! We especially need help with:

1. **UX/UI Design**: Making complex AI feel invisible
2. **Optimization**: Making models run fast on older laptops
3. **Packaging**: Creating seamless installers for all platforms
4. **Testing**: Ensuring the "Grandma Test" passes

### Development Tips

- Run `npm run dev` to start both the Electron main process and Vite dev server
- The app will hot-reload when you make changes to the renderer
- Main process changes require restarting the dev server

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for making local LLMs accessible and easy to run
- [better-sqlite3](https://github.com/JoshuaWise/better-sqlite3) for fast, embedded SQLite with FTS5
- [Electron](https://electronjs.org) for cross-platform desktop support

---

*Made with ❤️ for everyone who believes AI should be accessible and private.*

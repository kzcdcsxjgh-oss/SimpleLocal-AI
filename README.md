# 🏠 SimpleLocal AI

**The Subscription-Free Document Assistant**

> "So simple your grandma can use it. So private your data never leaves your room."

---

## 🌟 What is SimpleLocal AI?

SimpleLocal AI is a free, open-source desktop application that lets you chat with your documents (PDFs, Word docs, text files) using AI—**100% locally on your computer**. No internet required. No subscriptions. No data collection.

## ✨ Features

- **🔒 100% Private**: All processing happens on YOUR computer. Your documents never leave your device.
- **💰 Forever Free**: No subscriptions, no API costs, no hidden fees.
- **👵 Senior-Friendly**: Large text, high contrast, simple interface.
- **📄 Multiple Formats**: Supports PDF, DOCX, TXT, and Markdown files.
- **🧠 Smart Search**: Uses RAG (Retrieval-Augmented Generation) to find relevant information.

## 🚀 Getting Started

### Prerequisites

1. **Install Ollama** (Required for AI features)
   - Visit [ollama.ai](https://ollama.ai) and download the installer
   - After installation, run: `ollama pull llama3.2` (or another model of your choice)

2. **Node.js 18+** (For development)
   - Visit [nodejs.org](https://nodejs.org) to download

### Installation

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
npm run package:win    # Windows
npm run package:mac    # macOS
npm run package:linux  # Linux
```

## 🏗️ Project Structure

```
SimpleLocal-AI/
├── src/
│   ├── main/                 # Electron main process
│   │   ├── index.ts          # Main entry point
│   │   ├── preload.ts        # Secure IPC bridge
│   │   └── services/         # Backend services
│   │       ├── documentProcessor.ts  # PDF/DOCX parsing
│   │       ├── vectorStore.ts        # LanceDB integration
│   │       ├── ollamaService.ts      # Local LLM communication
│   │       └── ragPipeline.ts        # RAG orchestration
│   │
│   ├── renderer/             # React frontend
│   │   ├── App.tsx           # Main application
│   │   ├── components/       # UI components
│   │   └── styles.css        # Senior-friendly styling
│   │
│   └── shared/               # Shared types
│       └── types.ts
│
├── package.json
├── vite.config.ts            # Frontend build config
├── tsconfig.json             # TypeScript config
└── tsconfig.main.json        # Main process TypeScript config
```

## 🛠️ Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Desktop | Electron | Cross-platform desktop app |
| Frontend | React + TypeScript | User interface |
| AI Engine | Ollama | Local LLM inference |
| Vector DB | LanceDB | Local document embeddings |
| Document Processing | pdf-parse, mammoth | PDF and DOCX parsing |

## 📖 How It Works

1. **Add Documents**: Click "Add Document" to select PDFs, Word docs, or text files.

2. **Processing**: The app extracts text, splits it into chunks, and creates searchable embeddings.

3. **Chat**: Ask questions in natural language. The AI searches your documents and provides answers based on their content.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Docs  │───▶│   Chunking   │───▶│  Embeddings │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Answer    │◀───│   Ollama     │◀───│   LanceDB   │
└─────────────┘    └──────────────┘    └─────────────┘
```

## 🤝 Contributing

We welcome contributions! Please see our contributing guidelines for more information.

### Development Tips

- Run `npm run dev` to start both the Electron main process and Vite dev server
- The app will hot-reload when you make changes to the renderer
- Main process changes require restarting the dev server

## 📜 License

MIT License - See [LICENSE](LICENSE) for details.

## 🙏 Acknowledgments

- [Ollama](https://ollama.ai) for making local LLMs accessible
- [LanceDB](https://lancedb.com) for the embedded vector database
- [Electron](https://electronjs.org) for cross-platform desktop support

---

*Made with ❤️ for everyone who believes AI should be accessible and private.*

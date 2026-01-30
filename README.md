# 🏠 SimpleLocal AI

**The Subscription-Free Document Assistant**

> "So simple your grandma can use it. So private your data never leaves your room."

---

## 🌟 What is SimpleLocal AI?

SimpleLocal AI is a free, open-source desktop application that lets you chat with your documents (PDFs, Word docs, text files) using AI—**100% locally on your computer**. No internet required after setup. No subscriptions. No data collection.

**Just double-click and go.** The AI is included - no internet required after installation.

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
3. **Run** SimpleLocal AI - the AI is already included, no internet needed!
4. **Done!** Start adding documents and chatting

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
│   │   ├── index.ts          # Main entry point
│   │   ├── preload.ts        # Secure IPC bridge
│   │   └── services/         # Backend services
│   │       ├── documentProcessor.ts  # PDF/DOCX parsing
│   │       ├── vectorStore.ts        # LanceDB integration
│   │       └── localAIService.ts     # Bundled AI (Transformers.js)
│   │
│   ├── renderer/             # React frontend
│   │   ├── App.tsx           # Main application
│   │   ├── components/       # UI components
│   │   │   ├── ChatArea.tsx
│   │   │   ├── DocumentList.tsx
│   │   │   └── SetupScreen.tsx  # First-run setup
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
| AI Engine | Transformers.js | Bundled local AI (no external setup!) |
| Vector DB | LanceDB | Local document embeddings |
| Document Processing | pdf-parse, mammoth | PDF and DOCX parsing |

## 📖 How It Works

1. **First Run**: The app loads the bundled AI model instantly. No downloads, no waiting!

2. **Add Documents**: Click the big "Add Document" button to select PDFs, Word docs, or text files.

3. **Processing**: The app reads your documents and creates searchable embeddings locally.

4. **Chat**: Ask questions in natural language. The AI searches your documents and answers based on their content.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Docs  │───▶│   Chunking   │───▶│  Embeddings │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Answer    │◀───│  Local AI    │◀───│   LanceDB   │
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

- [Transformers.js](https://huggingface.co/docs/transformers.js) for making AI run in JavaScript
- [LanceDB](https://lancedb.com) for the embedded vector database
- [Electron](https://electronjs.org) for cross-platform desktop support

---

*Made with ❤️ for everyone who believes AI should be accessible and private.*

# MakeItPrivate

**Your Documents, Your Privacy, Your Computer.**

> "So simple your grandma can use it. So private your data never leaves your room."

---

## What is MakeItPrivate?

MakeItPrivate is a free, open-source desktop application that lets you chat with your documents (PDFs, Word docs, text files) using AI — **100% locally on your computer**. No internet required after setup. No subscriptions. No data collection.

**Just double-click and go.** The AI runs locally — no cloud, no tracking, no nonsense.

## Features

- **100% Private**: All processing happens on YOUR computer. Your documents never leave your device.
- **Forever Free**: No subscriptions, no API costs, no hidden fees.
- **Built-in Privacy Filter**: Automatically detects and redacts sensitive data (BSN, names, IBAN, emails, phone numbers, addresses).
- **Senior-Friendly**: Large text, high contrast, simple interface. Passes the "Grandma Test".
- **Multiple Formats**: Supports PDF, DOCX, TXT, and Markdown files.
- **Smart Search**: Uses RAG (Retrieval-Augmented Generation) to find relevant information in your documents.
- **One-Click Install**: No Terminal, no Python, no Docker. Just a simple installer.

## Getting Started

### For Users (Easy Way)

1. **Download** the installer for your system from the [Releases](../../releases) page
2. **Install** by double-clicking the downloaded file
3. **Run** MakeItPrivate — the AI runs locally, no internet needed!
4. **Done!** Start adding documents and chatting

### For Developers

```bash
# Clone the repository
git clone https://github.com/yourusername/MakeItPrivate.git
cd MakeItPrivate

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

## Project Structure

```
MakeItPrivate/
├── src/
│   ├── core/                  # Framework-agnostic core library
│   │   ├── adapters/          # LLM providers (Ollama, OpenAI)
│   │   ├── privacy/           # Privacy filter engine
│   │   ├── search/            # Full-text search (FTS5)
│   │   ├── storage/           # SQLite storage layer
│   │   ├── document-processor.ts
│   │   └── index.ts           # Core orchestration
│   │
│   ├── main/                  # Electron main process
│   │   ├── index.ts           # Main entry point & IPC handlers
│   │   └── preload.ts         # Secure IPC bridge
│   │
│   ├── renderer/              # React frontend
│   │   ├── App.tsx            # Main application
│   │   ├── components/        # UI components
│   │   └── styles.css         # Senior-friendly styling
│   │
│   └── shared/                # Shared types
│       └── types.ts
│
├── package.json
├── vite.config.ts
├── tsconfig.json
└── tsconfig.main.json
```

## Tech Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Desktop | Electron | Cross-platform desktop app |
| Frontend | React + TypeScript | User interface |
| LLM | Ollama / OpenAI | Local or remote AI models |
| Database | SQLite (better-sqlite3) | Local data & full-text search |
| Document Processing | pdf-parse, mammoth | PDF and DOCX parsing |

## How It Works

1. **Add Documents**: Click the "Add Document" button to select PDFs, Word docs, or text files.
2. **Processing**: The app reads your documents and indexes them locally.
3. **Chat**: Ask questions in natural language. The AI searches your documents and answers based on their content.
4. **Privacy Filter**: Optionally scan documents to detect and redact sensitive personal data before sharing.

```
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│  Your Docs  │───▶│   Chunking   │───▶│  FTS Index  │
└─────────────┘    └──────────────┘    └─────────────┘
                                              │
                                              ▼
┌─────────────┐    ┌──────────────┐    ┌─────────────┐
│   Answer    │◀───│  Local LLM   │◀───│   Search    │
└─────────────┘    └──────────────┘    └─────────────┘
```

## Contributing

We welcome contributions! We especially need help with:

1. **UX/UI Design**: Making complex AI feel invisible
2. **Optimization**: Making models run fast on older laptops
3. **Packaging**: Creating seamless installers for all platforms
4. **Testing**: Ensuring the "Grandma Test" passes

### Development Tips

- Run `npm run dev` to start both the Electron main process and Vite dev server
- The app will hot-reload when you make changes to the renderer
- Main process changes require restarting the dev server

## License

Apache 2.0 License — See [LICENSE](LICENSE) for details.

---

*Made with care for everyone who believes AI should be accessible and private.*

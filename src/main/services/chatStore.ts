import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp?: string;
}

export interface ChatSession {
  id: string;
  title: string;
  messages: ChatMessage[];
  createdAt: string;
  updatedAt: string;
}

export class ChatStore {
  private dataDir: string;
  private chatsFile: string;
  private sessions: ChatSession[] = [];

  constructor(dataDir: string) {
    this.dataDir = dataDir;
    this.chatsFile = path.join(dataDir, 'chats.json');
  }

  /**
   * Initialize the chat store by loading existing sessions
   */
  async initialize(): Promise<void> {
    await fs.mkdir(this.dataDir, { recursive: true });

    try {
      const data = await fs.readFile(this.chatsFile, 'utf-8');
      this.sessions = JSON.parse(data);
    } catch {
      // File doesn't exist yet, start with empty array
      this.sessions = [];
    }
  }

  /**
   * Save sessions to disk
   */
  private async save(): Promise<void> {
    await fs.writeFile(this.chatsFile, JSON.stringify(this.sessions, null, 2));
  }

  /**
   * Create a new chat session
   */
  async createSession(): Promise<ChatSession> {
    const now = new Date().toISOString();
    const session: ChatSession = {
      id: uuidv4(),
      title: 'Nieuw gesprek',
      messages: [],
      createdAt: now,
      updatedAt: now,
    };

    this.sessions.unshift(session);
    await this.save();
    return session;
  }

  /**
   * Get all chat sessions
   */
  async getSessions(): Promise<ChatSession[]> {
    return this.sessions.sort(
      (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
    );
  }

  /**
   * Get a specific chat session by ID
   */
  async getSession(sessionId: string): Promise<ChatSession | null> {
    return this.sessions.find((s) => s.id === sessionId) || null;
  }

  /**
   * Update a chat session with new messages
   */
  async updateSession(
    sessionId: string,
    messages: ChatMessage[],
    title?: string
  ): Promise<ChatSession | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    session.messages = messages;
    session.updatedAt = new Date().toISOString();

    // Auto-generate title from first user message if not set
    if (title) {
      session.title = title;
    } else if (session.title === 'Nieuw gesprek' && messages.length > 0) {
      const firstUserMessage = messages.find((m) => m.role === 'user');
      if (firstUserMessage) {
        session.title = firstUserMessage.content.slice(0, 50) + (firstUserMessage.content.length > 50 ? '...' : '');
      }
    }

    await this.save();
    return session;
  }

  /**
   * Delete a chat session
   */
  async deleteSession(sessionId: string): Promise<boolean> {
    const index = this.sessions.findIndex((s) => s.id === sessionId);
    if (index === -1) return false;

    this.sessions.splice(index, 1);
    await this.save();
    return true;
  }

  /**
   * Rename a chat session
   */
  async renameSession(sessionId: string, title: string): Promise<ChatSession | null> {
    const session = this.sessions.find((s) => s.id === sessionId);
    if (!session) return null;

    session.title = title;
    session.updatedAt = new Date().toISOString();
    await this.save();
    return session;
  }
}

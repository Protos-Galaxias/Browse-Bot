import { extStorage } from './ExtStorage';

export interface ChatMeta {
    id: string;
    title: string;
    createdAt: number;
    updatedAt: number;
}

type ChatLog = Array<any>;

const CHAT_LIST_KEY = 'chatList';
const ACTIVE_CHAT_ID_KEY = 'activeChatId';

function buildChatKey(chatId: string): string {
    return `chat:${chatId}`;
}

function generateId(): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${Date.now().toString(36)}-${rand}`;
}

export class ChatStorage {
    static async getChatList(): Promise<ChatMeta[]> {
        const store = await extStorage.local.get([CHAT_LIST_KEY]);
        const list = Array.isArray(store[CHAT_LIST_KEY]) ? store[CHAT_LIST_KEY] : [];
        return list as ChatMeta[];
    }

    private static async setChatList(list: ChatMeta[]): Promise<void> {
        await extStorage.local.set({ [CHAT_LIST_KEY]: list });
    }

    static async getActiveChatId(): Promise<string | null> {
        const store = await extStorage.local.get([ACTIVE_CHAT_ID_KEY]);
        const id = typeof store[ACTIVE_CHAT_ID_KEY] === 'string' ? store[ACTIVE_CHAT_ID_KEY] : null;
        return id;
    }

    static async setActiveChatId(chatId: string | null): Promise<void> {
        await extStorage.local.set({ [ACTIVE_CHAT_ID_KEY]: chatId });
    }

    static async getChatLog(chatId: string): Promise<ChatLog> {
        const store = await extStorage.local.get([buildChatKey(chatId)]);
        const log = Array.isArray(store[buildChatKey(chatId)]) ? store[buildChatKey(chatId)] : [];
        return log;
    }

    static async setChatLog(chatId: string, log: ChatLog): Promise<void> {
        await extStorage.local.set({ [buildChatKey(chatId)]: log });
        await this.touchChat(chatId);
    }

    static async appendToChat(chatId: string, items: ChatLog): Promise<void> {
        if (!items || items.length === 0) return;
        const current = await this.getChatLog(chatId);
        const next = current.concat(items);
        await extStorage.local.set({ [buildChatKey(chatId)]: next });
        await this.touchChat(chatId);
    }

    private static async touchChat(chatId: string): Promise<void> {
        const list = await this.getChatList();
        const idx = list.findIndex(c => c.id === chatId);
        if (idx > -1) {
            list[idx] = { ...list[idx], updatedAt: Date.now() };
            await this.setChatList(list);
        }
    }

    static async createChat(initialTitle?: string, initialLog: ChatLog = []): Promise<ChatMeta> {
        const id = generateId();
        const now = Date.now();
        const meta: ChatMeta = {
            id,
            title: initialTitle && initialTitle.trim() ? initialTitle.trim() : 'New chat',
            createdAt: now,
            updatedAt: now
        };
        const list = await this.getChatList();
        await this.setChatList([meta, ...list]);
        await extStorage.local.set({ [buildChatKey(id)]: Array.isArray(initialLog) ? initialLog : [] });
        await this.setActiveChatId(id);
        return meta;
    }

    static async renameChat(chatId: string, title: string): Promise<void> {
        const list = await this.getChatList();
        const idx = list.findIndex(c => c.id === chatId);
        if (idx > -1) {
            list[idx] = { ...list[idx], title: title.trim() || list[idx].title, updatedAt: Date.now() };
            await this.setChatList(list);
        }
    }

    static async deleteChat(chatId: string): Promise<void> {
        const list = await this.getChatList();
        const nextList = list.filter(c => c.id !== chatId);
        await this.setChatList(nextList);
        await extStorage.local.set({ [buildChatKey(chatId)]: undefined });
        const active = await this.getActiveChatId();
        if (active === chatId) {
            await this.setActiveChatId(nextList[0]?.id || null);
        }
    }
}



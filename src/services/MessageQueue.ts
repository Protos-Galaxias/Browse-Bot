type MessageHandler = (data: any) => Promise<void> | void;

interface QueuedMessage {
  type: string;
  data: any;
  timestamp: number;
  retryCount: number;
}

export class MessageQueue {
    private static instance: MessageQueue;
    private queue: QueuedMessage[] = [];
    private isProcessing = false;
    private handlers: Map<string, MessageHandler[]> = new Map();
    private readonly MAX_RETRIES = 3;
    private readonly RETRY_DELAY = 1000;

    private constructor() {}

    static getInstance(): MessageQueue {
        if (!MessageQueue.instance) {
            MessageQueue.instance = new MessageQueue();
        }
        return MessageQueue.instance;
    }

    subscribe(messageType: string, handler: MessageHandler): () => void {
        if (!this.handlers.has(messageType)) {
            this.handlers.set(messageType, []);
        }
        const handlers = this.handlers.get(messageType)!;
        handlers.push(handler);

        return () => {
            const index = handlers.indexOf(handler);
            if (index > -1) {
                handlers.splice(index, 1);
            }
        };
    }

    async enqueue(type: string, data: any = {}): Promise<void> {
        const message: QueuedMessage = {
            type,
            data,
            timestamp: Date.now(),
            retryCount: 0
        };

        this.queue.push(message);
        await this.processQueue();
    }

    private async processQueue(): Promise<void> {
        if (this.isProcessing || this.queue.length === 0) {
            return;
        }

        this.isProcessing = true;

        try {
            while (this.queue.length > 0) {
                const message = this.queue.shift()!;
                await this.processMessage(message);
            }
        } finally {
            this.isProcessing = false;
        }
    }

    private async processMessage(message: QueuedMessage): Promise<void> {
        const handlers = this.handlers.get(message.type) || [];

        if (handlers.length === 0) {
            console.warn(`No handlers registered for message type: ${message.type}`);
            return;
        }

        try {
            await Promise.all(handlers.map(handler =>
                Promise.resolve(handler(message.data)).catch(error => {
                    console.error(`Error in handler for ${message.type}:`, error);
                })
            ));
        } catch (error) {
            console.error(`Failed to process message ${message.type}:`, error);

            if (message.retryCount < this.MAX_RETRIES) {
                message.retryCount++;
                this.queue.unshift(message);

                await new Promise(resolve =>
                    setTimeout(resolve, this.RETRY_DELAY * message.retryCount)
                );
            } else {
                console.error(`Max retries (${this.MAX_RETRIES}) exceeded for message:`, message);
            }
        }
    }
}

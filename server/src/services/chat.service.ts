interface ChatMessage {
  id: number
  ip: string
  message: string
  timestamp: string
}

export class ChatStore {
  private messages: ChatMessage[] = []

  constructor(private limit = 1000) {}

  listMessages(): ChatMessage[] {
    return [...this.messages]
  }

  addMessage(message: ChatMessage): ChatMessage {
    this.messages.push(message)
    if (this.messages.length > this.limit) {
      this.messages.shift()
    }
    return message
  }
}

export class ChatService {
  constructor(private store: ChatStore) {}

  listMessages(): ChatMessage[] {
    return this.store.listMessages()
  }

  sendMessage(ip: string, text: string): ChatMessage {
    const message: ChatMessage = {
      id: this.store.listMessages().length + 1,
      ip,
      message: text,
      timestamp: new Date().toISOString(),
    }
    return this.store.addMessage(message)
  }
}
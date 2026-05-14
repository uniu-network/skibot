export interface Data {
    [key: string]: any;
}

export class BaseMessage {
    type: string;
    data: Data;

    constructor(type: string, data: Data) {
        this.type = type;
        this.data = data;
    }

    json(): { type: string; data: Data } {
        return {
            type: this.type,
            data: this.data
        };
    }
}

export class Message extends Array<BaseMessage> {
    json(): { type: string; data: Data }[] {
        return this.map(v => v.json());
    }

    addMessage(object: any): this {
        if (object instanceof Message) {
            this.union(object);
            return this;
        }
        super.push(object);
        return this;
    }

    pushMessage(type: string, data: Data): this {
        return this.addMessage(new BaseMessage(type, data));
    }

    union(...s: Message[]): this {
        for (const msg of s) {
            for (const baseMessage of msg) {
                this.addMessage(baseMessage);
            }
        }
        return this;
    }

    static build(): Message {
        return new Message();
    }
}

export class MessageSegment {
    messages: Message;

    constructor() {
        this.messages = Message.build();
    }

    [key: string]: any;

    static text(text: string): Message {
        return Message.build().pushMessage("text", { text });
    }

    static at(user_id: string | number): Message {
        return Message.build().pushMessage("at", { user_id: String(user_id) });
    }

    static reply(id: string | number): Message {
        return Message.build().pushMessage("reply", { id });
    }

    static image(file: string): Message {
        return Message.build().pushMessage("image", { file });
    }

    static raw(platform: string, type: string, data: Data): Message {
        return Message.build().pushMessage("raw", { platform, type, data });
    }

    static fromJson(msg: { type: string; data: Data }[]): Message {
        const array = Message.build();
        for (const m of msg) {
            array.pushMessage(m.type, m.data);
        }
        return array;
    }

    static get METHODS(): string[] {
        return Object.getOwnPropertyNames(MessageSegment)
            .filter(name => typeof (MessageSegment as any)[name] === 'function' && name !== 'fromJson');
    }
}

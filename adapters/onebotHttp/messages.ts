const CQ_TABLES: { [key: string]: string } = {
    "&": "&amp;",
    "[": "&#91;",
    "]": "&#93;",
    ",": "&#44;"
};

function escapeMessage(value: any): string {
    if (typeof value === 'object') {
        value = JSON.stringify(value);
    }
    let str = String(value);
    for (const [k, v] of Object.entries(CQ_TABLES)) {
        str = str.split(k).join(v);
    }
    return str;
}

export function unescapeMessage(value: string): string {
    let str = value;
    for (const [k, v] of Object.entries(CQ_TABLES)) {
        str = str.split(v).join(k);
    }
    return str;
}

export function toCQ(message: any): string {
    if (message && typeof message.cq === 'function') {
        return message.cq();
    }

    if (message && message[0] && typeof message[0].cq === 'function') {
        return message.map((v: any) => {
            if (v.type === "text") {
                return escapeMessage(v.data["text"]);
            } else {
                const parts = Object.entries(v.data).map(([k, val]) => `${k}=${escapeMessage(val)}`);
                return `[CQ:${v.type},${parts.join(",")}]`;
            }
        }).join('');
    }

    return '';
}

import { Message } from '../../app/messages.js';
import type { Data } from '../../app/messages.js';

export function toOneBotMessage(message: Message): { type: string; data: Data }[] {
    return message.map(segment => {
        if (segment.type === 'raw') {
            if (segment.data.platform !== 'onebot') {
                return null;
            }

            return {
                type: segment.data.type,
                data: segment.data.data || {},
            };
        }

        if (segment.type === 'at') {
            return {
                type: 'at',
                data: {
                    qq: String(segment.data.qq ?? segment.data.user_id),
                },
            };
        }

        if (segment.type === 'reply') {
            return {
                type: 'reply',
                data: {
                    id: String(segment.data.id),
                },
            };
        }

        if (segment.type === 'image') {
            return {
                type: 'image',
                data: {
                    file: segment.data.file,
                },
            };
        }

        return segment.json();
    }).filter((segment): segment is { type: string; data: Data } => segment !== null);
}

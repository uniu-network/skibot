import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { IAdapter, ISendMessage, AdapterContext } from '../../app/types.js';
import { Message, MessageSegment } from '../../app/messages.js';
import { PrivateMessageEvent } from '../../app/events.js';
import type { WebChatSender } from './events.js';
import logger from '../../app/log.js';
import { getFrontendHtml, getFrontendFile } from './frontend.js';

interface WebChatClient {
    userId: number;
    ws: WebSocket;
}

const CONTENT_TYPES: Record<string, string> = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
};

export default class WebChatAdapter implements IAdapter, ISendMessage {
    readonly id = 'webchat';
    readonly name = 'WebChat';
    private config: any;
    private ctx: AdapterContext | null = null;
    private clients: Map<number, WebChatClient> = new Map();
    private server: http.Server | null = null;
    private wss: WebSocketServer | null = null;
    private userCounter = 0;

    constructor(config: any) {
        this.config = config;
    }

    async start(ctx: AdapterContext): Promise<void> {
        this.ctx = ctx;
        const port = this.config.port || 8080;
        const host = this.config.host || '0.0.0.0';

        this.server = http.createServer((req, res) => {
            if (req.method === 'GET' && (req.url === '/' || req.url === '/chat' || req.url === '/index.html')) {
                res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
                res.end(getFrontendHtml());
                return;
            }

            if (req.method === 'GET' && req.url) {
                const urlPath = req.url.split('?')[0];
                const ext = urlPath.substring(urlPath.lastIndexOf('.'));
                if (CONTENT_TYPES[ext]) {
                    const filename = urlPath.startsWith('/') ? urlPath.slice(1) : urlPath;
                    const content = getFrontendFile(filename);
                    if (content) {
                        res.writeHead(200, { 'Content-Type': CONTENT_TYPES[ext] });
                        res.end(content);
                        return;
                    }
                }
            }

            res.writeHead(404);
            res.end('Not Found');
        });

        this.wss = new WebSocketServer({ server: this.server });

        this.wss.on('connection', (ws) => {
            const userId = ++this.userCounter;
            const client: WebChatClient = { userId, ws };
            this.clients.set(userId, client);

            ws.send(JSON.stringify({ type: 'connected', userId }));

            ws.on('message', (data) => {
                try {
                    const msg = JSON.parse(data.toString());
                    if (msg.type === 'message' && this.ctx) {
                        const message = Message.build();

                        if (msg.segments && Array.isArray(msg.segments)) {
                            for (const seg of msg.segments) {
                                if (seg.type === 'text') {
                                    message.addMessage(MessageSegment.text(String(seg.data?.text ?? '')));
                                } else if (seg.type === 'image') {
                                    message.addMessage(MessageSegment.image(String(seg.data?.file ?? '')));
                                } else if (seg.type === 'at') {
                                    message.addMessage(MessageSegment.at(String(seg.data?.user_id ?? '')));
                                } else if (seg.type === 'raw') {
                                    message.addMessage(MessageSegment.raw(
                                        String(seg.data?.platform ?? 'webchat'),
                                        String(seg.data?.type ?? ''),
                                        seg.data?.data || {},
                                    ));
                                } else {
                                    message.pushMessage(seg.type, seg.data || {});
                                }
                            }
                        } else if (msg.content) {
                            message.addMessage(MessageSegment.text(String(msg.content)));
                        }

                        if (message.length === 0) return;

                        const rawText = message.reduce((acc, seg) => {
                            if (seg.type === 'text') return acc + String(seg.data.text || '');
                            if (seg.type === 'image') return acc + '[Image]';
                            if (seg.type === 'at') return acc + '@' + String(seg.data.user_id || '');
                            return acc;
                        }, '');

                        const event = new PrivateMessageEvent(
                            Math.floor(Date.now() / 1000),
                            this.ctx.bot.self_id,
                            this.id,
                            this,
                            `web_${Date.now()}`,
                            message,
                            rawText,
                            { user_id: userId } as WebChatSender,
                            userId
                        );
                        this.ctx.emitEvent('message', event);
                    }
                } catch (e) {
                    logger.error(`[WebChat] Error parsing message: ${e}`);
                }
            });

            ws.on('close', () => {
                this.clients.delete(userId);
                logger.info(`[WebChat] Client ${userId} disconnected`);
            });

            ws.on('error', (err) => {
                logger.error(`[WebChat] WebSocket error for ${userId}: ${err}`);
                this.clients.delete(userId);
            });

            logger.info(`[WebChat] Client ${userId} connected`);
        });

        this.server.listen(port, host, () => {
            logger.info(`[WebChat] Server started on http://${host}:${port}`);
        });
    }

    async stop(): Promise<void> {
        for (const [, client] of this.clients) {
            if (client.ws.readyState === WebSocket.OPEN) {
                client.ws.close();
            }
        }
        this.clients.clear();

        if (this.wss) {
            this.wss.close();
            this.wss = null;
        }
        if (this.server) {
            this.server.close();
            this.server = null;
        }
        this.ctx = null;
    }

    async send_private_msg(target_id: string | number, message: Message): Promise<void> {
        const userId = Number(target_id);
        const client = this.clients.get(userId);
        if (!client || client.ws.readyState !== WebSocket.OPEN) {
            logger.warn(`[WebChat] Client ${userId} not found or disconnected`);
            return;
        }

        const segments = message.json();
        const text = message.reduce((acc, seg) => {
            if (seg.type === 'text') return acc + String(seg.data.text || '');
            if (seg.type === 'at') return acc + '@' + String(seg.data.user_id || '');
            return acc;
        }, '');

        client.ws.send(JSON.stringify({
            type: 'reply',
            content: text,
            segments,
        }));
    }

    async send_group_msg(target_id: string | number, message: Message): Promise<void> {
        logger.warn('[WebChat] send_group_msg is not supported in WebChat adapter');
    }
}

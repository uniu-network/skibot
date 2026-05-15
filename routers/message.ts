import { Elysia, type AnyElysia } from "elysia";
import type { BotManager } from "../app/botManager.js";

class ElysiaAdapterResponse {
  statusCode = 200;
  body: unknown;

  status(code: number): this {
    this.statusCode = code;
    return this;
  }

  send(body: unknown): void {
    this.body = body;
  }

  json(body: unknown): void {
    this.body = body;
  }

  toResponse(): Response {
    if (this.body instanceof Response) return this.body;

    if (typeof this.body === "object" && this.body !== null) {
      return Response.json(this.body, { status: this.statusCode });
    }

    return new Response(this.body == null ? null : String(this.body), {
      status: this.statusCode,
    });
  }
}

export function createMessageRoutes(botManager: BotManager): AnyElysia {
  const router = new Elysia({ prefix: "/message" });

  async function handle(
    instance: ReturnType<BotManager["getFirstInstance"]>,
    body: unknown,
  ): Promise<Response> {
    if (!instance) {
      return new Response("No bot instances available", { status: 404 });
    }

    const res = new ElysiaAdapterResponse();
    const handled = await instance.adapterManager.handleHttpRequest(
      { body },
      res,
    );
    if (!handled) {
      return new Response("No adapter handled this request", { status: 404 });
    }

    return res.toResponse();
  }

  router.post("/:botId", async ({ params, body }) => {
    const botId = params.botId;
    const instance = botManager.getInstance(botId);
    if (!instance) {
      return new Response(`Bot "${botId}" not found`, { status: 404 });
    }

    return handle(instance, body);
  });

  router.post("/", async ({ body }) =>
    handle(botManager.getFirstInstance(), body),
  );

  return router;
}

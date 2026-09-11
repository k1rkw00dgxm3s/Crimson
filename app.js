import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { join } from "node:path";
import { hostname } from "node:os";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";



try { process.loadEnvFile(); } catch { /* .env not present or Node is too old */ }

const __dirname = process.cwd();
const publicPath = join(__dirname, "dist");

const fastify = Fastify({
    logger: true,
});

const chatMessages = [];
const chatClients = new Set();

function broadcastChatMessage(message) {
    const payload = `data: ${JSON.stringify(message)}\n\n`;
    for (const client of chatClients) {
        if (!client.destroyed) client.write(payload);
    }
}

fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Embedder-Policy-Report-Only", "require-corp");
    return payload;
});
fastify.server.on("upgrade", (req, socket, head) => {
    wisp.routeRequest(req, socket, head);
});


await fastify.register(fastifyStatic, {
    root: publicPath,
    prefix: "/"
});


fastify.addContentTypeParser('application/javascript', { parseAs: 'string' }, (req, body, done) => {
    done(null, body);
});

await fastify.register(fastifyStatic, {
    root: libcurlPath,
    prefix: "/libcurl/",
    decorateReply: false,
    setHeaders: (res, path, stat) => {
        if (path.endsWith('.mjs')) {
            res.setHeader('Content-Type', 'application/javascript');
        }
    }
});

await fastify.register(fastifyStatic, {
    root: baremuxPath,
    prefix: "/baremux/",
    decorateReply: false
});


fastify.get("/", (request, reply) => {
    return reply.sendFile("index.html");
});

fastify.get("/api/chatroom/messages", async (request, reply) => {
    reply.hijack();
    const response = reply.raw;
    response.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
    });
    response.write(`event: history\ndata: ${JSON.stringify(chatMessages)}\n\n`);
    chatClients.add(response);
    response.on("close", () => chatClients.delete(response));
});

fastify.post("/api/chatroom/messages", async (request, reply) => {
    const body = request.body ?? {};
    const name = typeof body.name === "string" ? body.name.trim().slice(0, 32) : "";
    const text = typeof body.text === "string" ? body.text.trim().slice(0, 500) : "";

    if (!name || !text) {
        return reply.status(400).send({ error: "Name and message are required." });
    }

    const message = {
        id: crypto.randomUUID(),
        name,
        text,
        sentAt: new Date().toISOString(),
    };
    chatMessages.push(message);
    if (chatMessages.length > 100) chatMessages.shift();
    broadcastChatMessage(message);
    return reply.status(201).send(message);
});


fastify.post("/api/chat", async (request, reply) => {
    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
        return reply.status(500).send({ error: "API key not configured on server." });
    }

    const upstream = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json",
            "HTTP-Referer": request.headers["origin"] ?? "",
            "X-Title": "Cr1mson AI",
        },
        body: JSON.stringify(request.body),
    });

    const data = await upstream.json();
    return reply.status(upstream.status).send(data);
});

fastify.post("/api/deepreset", async (request, reply) => {
    const cookieNames = ["session", "auth-token", "refresh-token"];

    for (const name of cookieNames) {
        reply.header(
            "Set-Cookie",
            `${name}=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 UTC; HttpOnly; SameSite=Lax`
        );
    }

    reply.header("Clear-Site-Data", '"cache", "cookies", "storage"');

    return reply.status(200).send({ ok: true });
});


fastify.setNotFoundHandler((request, reply) => {
    return reply.send("404 Not Found");
});


function shutdown() {
    for (const client of chatClients) client.end();
    chatClients.clear();
    console.log("SIGTERM signal received: closing HTTP server");
    fastify.close();
    process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);


let port = parseInt(process.env.PORT || "8080");
if (isNaN(port)) port = 8080;

try {
    const address = await fastify.listen({ port, host: "0.0.0.0" });
    console.log("Listening on:");
    console.log(`\thttp://localhost:${port}`);
    console.log(`\thttp://${hostname()}:${port}`);

    const serverAddress = fastify.server.address();
    console.log(
        `\thttp://${serverAddress.family === "IPv6" ? `[${serverAddress.address}]` : serverAddress.address}:${serverAddress.port}`
    );
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
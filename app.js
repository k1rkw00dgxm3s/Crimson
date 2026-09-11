import Fastify from "fastify";
import fastifyStatic from "@fastify/static";
import { libcurlPath } from "@mercuryworkshop/libcurl-transport";
import { baremuxPath } from "@mercuryworkshop/bare-mux/node";
import { join } from "node:path";
import { hostname } from "node:os";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { server as wisp } from "@mercuryworkshop/wisp-js/server";
import { WebSocketServer } from "ws";



try { process.loadEnvFile(); } catch { /* .env not present or Node is too old */ }

const __dirname = process.cwd();
const publicPath = join(__dirname, "dist");
const dataPath = join(__dirname, "data");
const usersPath = join(dataPath, "chat-users.json");

const fastify = Fastify({
    logger: true,
});

if (!existsSync(dataPath)) mkdirSync(dataPath, { recursive: true });
const storedUsers = existsSync(usersPath) ? JSON.parse(readFileSync(usersPath, "utf8")) : {};
const chatUsers = new Map(Object.entries(storedUsers));

function hashPassword(password, salt = randomBytes(16).toString("hex")) {
    return { salt, hash: scryptSync(password, salt, 64).toString("hex") };
}

function verifyPassword(password, record) {
    const expected = Buffer.from(record.hash, "hex");
    const actual = scryptSync(password, record.salt, 64);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
}

function saveUsers() {
    writeFileSync(usersPath, JSON.stringify(Object.fromEntries(chatUsers), null, 2));
}
const chatRooms = new Map([
    ["general", { name: "#general", private: false, owner: null, members: new Set(), messages: [] }],
]);
const chatSockets = new Map();
const chatWss = new WebSocketServer({ noServer: true });

function sendChat(socket, payload) {
    if (socket.readyState === 1) socket.send(JSON.stringify(payload));
}

function broadcastRoom(roomId, payload) {
    const room = chatRooms.get(roomId);
    if (!room) return;
    for (const socket of room.members) sendChat(socket, payload);
}

function publicRooms() {
    return [...chatRooms.entries()].map(([id, room]) => ({
        id,
        name: room.name,
        private: room.private,
        members: room.members.size,
    }));
}

function roomSnapshot(roomId) {
    const room = chatRooms.get(roomId);
    return room ? room.messages.slice(-100) : [];
}

function leaveRoom(socket, roomId) {
    const room = chatRooms.get(roomId);
    if (!room) return;
    room.members.delete(socket);
    broadcastRoom(roomId, { type: "rooms", rooms: publicRooms() });
}

function broadcastRooms() {
    for (const socket of chatSockets.keys()) sendChat(socket, { type: "rooms", rooms: publicRooms() });
}

chatWss.on("connection", (socket) => {
    chatSockets.set(socket, { username: null, roomId: null });

    socket.on("message", (raw) => {
        let event;
        try { event = JSON.parse(raw.toString()); } catch { return sendChat(socket, { type: "error", message: "Invalid message." }); }
        const session = chatSockets.get(socket);
        if (!session) return;

        if (event.type === "auth") {
            const username = typeof event.username === "string" ? event.username.trim().slice(0, 32) : "";
            const password = typeof event.password === "string" ? event.password : "";
            if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username) || password.length < 4) {
                return sendChat(socket, { type: "error", message: "Use a 3-32 character username and a 4+ character password." });
            }
            const existing = chatUsers.get(username);
            if (event.mode === "signup") {
                if (existing) return sendChat(socket, { type: "error", message: "That username is already registered." });
                chatUsers.set(username, hashPassword(password));
                saveUsers();
            } else if (!existing || !verifyPassword(password, existing)) {
                return sendChat(socket, { type: "error", message: "Incorrect username or password." });
            }
            session.username = username;
            sendChat(socket, { type: "authenticated", username, rooms: publicRooms() });
            return;
        }

        if (!session.username) return sendChat(socket, { type: "error", message: "Sign in first." });

        if (event.type === "join-room") {
            const roomId = typeof event.roomId === "string" ? event.roomId : "";
            const room = chatRooms.get(roomId);
            if (!room || roomId !== "general") return sendChat(socket, { type: "error", message: "Only #general is available." });
            if (session.roomId) leaveRoom(socket, session.roomId);
            room.members.add(socket);
            session.roomId = roomId;
            sendChat(socket, { type: "joined", roomId, messages: roomSnapshot(roomId) });
            broadcastRooms();
            return;
        }

        if (event.type === "message") {
            const room = chatRooms.get(session.roomId);
            const text = typeof event.text === "string" ? event.text.trim().slice(0, 500) : "";
            if (!room || !text) return;
            const message = { id: crypto.randomUUID(), username: session.username, text, sentAt: new Date().toISOString() };
            room.messages.push(message);
            if (room.messages.length > 100) room.messages.shift();
            broadcastRoom(session.roomId, { type: "message", message });
            return;
        }

    });

    socket.on("close", () => {
        const session = chatSockets.get(socket);
        if (session?.roomId) leaveRoom(socket, session.roomId);
        chatSockets.delete(socket);
    });
});

fastify.addHook("onSend", async (request, reply, payload) => {
    reply.header("Cross-Origin-Opener-Policy", "same-origin");
    reply.header("Cross-Origin-Embedder-Policy-Report-Only", "require-corp");
    return payload;
});
fastify.server.on("upgrade", (req, socket, head) => {
    if (req.url === "/chat-ws") {
        chatWss.handleUpgrade(req, socket, head, (client) => chatWss.emit("connection", client, req));
    } else {
        wisp.routeRequest(req, socket, head);
    }
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
    for (const client of chatSockets.keys()) client.close();
    chatSockets.clear();
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
type Message = { id: string; username?: string; text: string; sentAt: string };

const authPanel = document.getElementById("auth-panel") as HTMLElement;
const roomApp = document.getElementById("room-app") as HTMLElement;
const authForm = document.getElementById("auth-form") as HTMLFormElement;
const authStatus = document.getElementById("auth-status") as HTMLElement;
const authModeButton = document.getElementById("auth-mode") as HTMLButtonElement;
const roomStatus = document.getElementById("room-status") as HTMLElement;
const messages = document.getElementById("room-messages") as HTMLElement;
const messageForm = document.getElementById("message-form") as HTMLFormElement;
const messageInput = document.getElementById("message-input") as HTMLInputElement;
const currentUser = document.getElementById("current-user") as HTMLElement;
const socket = new WebSocket(`${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/chat-ws`);
let authMode: "signin" | "signup" = "signin";
const pendingMessages: string[] = [];

function send(payload: object): void {
    const message = JSON.stringify(payload);
    if (socket.readyState === WebSocket.OPEN) socket.send(message);
    else if (socket.readyState === WebSocket.CONNECTING) pendingMessages.push(message);
}

function renderMessage(message: Message): void {
    const element = document.createElement("article");
    element.className = "message";
    const author = document.createElement("strong");
    author.textContent = message.username || "Unknown";
    const text = document.createElement("p");
    text.textContent = message.text;
    element.append(author, text);
    messages.appendChild(element);
    messages.scrollTop = messages.scrollHeight;
}

socket.addEventListener("open", () => {
    authStatus.textContent = "Connected. Sign in to continue.";
    pendingMessages.splice(0).forEach((message) => socket.send(message));
});
socket.addEventListener("error", () => { authStatus.textContent = "Chat connection failed. Check that the server is running."; });
socket.addEventListener("close", () => { roomStatus.textContent = "Connection closed. Refresh to reconnect."; });
socket.addEventListener("message", (event) => {
    const payload = JSON.parse(event.data);
    if (payload.type === "error") {
        (authPanel.classList.contains("hidden") ? roomStatus : authStatus).textContent = payload.message;
        return;
    }
    if (payload.type === "authenticated") {
        currentUser.textContent = payload.username;
        authPanel.classList.add("hidden");
        roomApp.classList.remove("hidden");
        send({ type: "join-room", roomId: "general" });
    }
    if (payload.type === "joined") {
        messages.replaceChildren();
        payload.messages.forEach(renderMessage);
    }
    if (payload.type === "message") renderMessage(payload.message);
});

authForm.addEventListener("submit", (event) => {
    event.preventDefault();
    send({
        type: "auth",
        mode: authMode,
        username: (document.getElementById("auth-username") as HTMLInputElement).value,
        password: (document.getElementById("auth-password") as HTMLInputElement).value,
    });
});

authModeButton.addEventListener("click", () => {
    authMode = authMode === "signin" ? "signup" : "signin";
    const submitButton = authForm.querySelector("button") as HTMLButtonElement;
    submitButton.textContent = authMode === "signup" ? "Sign up" : "Sign in";
    authModeButton.textContent = authMode === "signup" ? "Already have an account? Sign in" : "Need an account? Sign up";
    authStatus.textContent = "";
});

messageForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const text = messageInput.value.trim();
    if (!text) return;
    send({ type: "message", text });
    messageInput.value = "";
});

document.getElementById("sign-out")?.addEventListener("click", () => location.reload());

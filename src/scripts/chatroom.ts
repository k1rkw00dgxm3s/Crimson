const messagesElement = document.getElementById("chat-messages") as HTMLDivElement;
const form = document.getElementById("chat-form") as HTMLFormElement;
const nameInput = document.getElementById("chat-name") as HTMLInputElement;
const textInput = document.getElementById("chat-text") as HTMLInputElement;
const statusElement = document.getElementById("chat-status") as HTMLParagraphElement;
const indicator = document.getElementById("online-indicator") as HTMLDivElement;

const savedName = localStorage.getItem("cr1mson-chat-name");
if (savedName) nameInput.value = savedName;

function renderMessage(message: { name: string; text: string; sentAt: string }): void {
    const element = document.createElement("article");
    element.className = "chat-message";

    const name = document.createElement("strong");
    name.textContent = message.name;
    const text = document.createElement("p");
    text.textContent = message.text;
    const time = document.createElement("time");
    time.dateTime = message.sentAt;
    time.textContent = new Date(message.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

    element.append(name, text, time);
    messagesElement.appendChild(element);
    messagesElement.scrollTop = messagesElement.scrollHeight;
}

const events = new EventSource("/api/chatroom/messages");
events.addEventListener("open", () => {
    statusElement.textContent = "Live room";
    indicator.classList.add("connected");
});
events.addEventListener("history", (event) => {
    const history = JSON.parse((event as MessageEvent).data) as Array<{ name: string; text: string; sentAt: string }>;
    messagesElement.replaceChildren();
    history.forEach(renderMessage);
});
events.addEventListener("message", (event) => {
    renderMessage(JSON.parse((event as MessageEvent).data));
});
events.addEventListener("error", () => {
    statusElement.textContent = "Reconnecting...";
    indicator.classList.remove("connected");
});

form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const text = textInput.value.trim();
    if (!name || !text) return;

    nameInput.value = name;
    localStorage.setItem("cr1mson-chat-name", name);
    textInput.disabled = true;

    try {
        const response = await fetch("/api/chatroom/messages", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name, text }),
        });
        if (!response.ok) throw new Error("Message could not be sent");
        textInput.value = "";
    } catch {
        statusElement.textContent = "Unable to send. Try again.";
    } finally {
        textInput.disabled = false;
        textInput.focus();
    }
});


import Window from "./Window";
import WindowManager from "./WindowManager";
import { notify } from "./notifications";
import { deepReset } from "./settings";

// Initialize WindowManager singleton (windows self-register)
const windowManager = WindowManager.getInstance();
(window as any).Window = Window;
(window as any).WindowManager = WindowManager;
const settings = JSON.parse(localStorage.getItem("bolt-settings") || "{}");
const searchBar = document.querySelector("#searchbar input") as HTMLInputElement;
const searchForm = document.querySelector("#search-form") as HTMLFormElement;
const searchButton = document.querySelector("#search-form button") as HTMLButtonElement;
const shortcutLinks = document.querySelectorAll<HTMLAnchorElement>(".proxy-shortcut");
const searchEngine = settings.searchEngine || 'duckduckgo';
let searchEngineUrl = '';

switch (searchEngine) {
    case 'duckduckgo':
        searchEngineUrl = 'https://duckduckgo.com/?q=';
        break;
    case 'google':
        searchEngineUrl = 'https://www.google.com/search?q=';
        break;
    case 'bing':
        searchEngineUrl = 'https://www.bing.com/search?q=';
        break;
    case 'yahoo':
        searchEngineUrl = 'https://search.yahoo.com/search?q=';
        break;
    case 'brave':
        searchEngineUrl = 'https://search.brave.com/search?q=';
        break;
}

function search(event?: Event) {
    event?.preventDefault();
    const query = searchBar?.value;
    let destinationUrl = "";

    if (query == "" || query == null) {
        return;
    }

    if (query.startsWith('https://') || query.startsWith('http://')) {
        destinationUrl = query;
    } else if (query.includes('.') && !query.includes(' ')) {
        destinationUrl = 'https://' + query;
    } else {
        destinationUrl = searchEngineUrl + query;
    }

    new Window({
        url: "/browser?url=" + encodeURIComponent(destinationUrl),
        title: "Browser",
        icon: "/img/icons/browser.webp",
        startMaximized: false
    });
}

function openShortcut(event: Event): void {
    event.preventDefault();
    const link = event.currentTarget as HTMLAnchorElement;
    const destinationUrl = link.dataset.url;
    if (!destinationUrl) return;

    if (link.dataset.internal === "true") {
        new Window({
            url: destinationUrl,
            title: link.dataset.title || "Cr1mson",
            icon: link.querySelector("img")?.src || "/img/icons/browser.webp",
            startMaximized: false
        });
        return;
    }

    new Window({
        url: "/browser?url=" + encodeURIComponent(destinationUrl),
        title: "Browser",
        icon: link.querySelector("img")?.src || "/img/icons/browser.webp",
        startMaximized: false
    });
}


searchForm.addEventListener("submit", search);
searchButton.addEventListener("click", search);
shortcutLinks.forEach((shortcut) => shortcut.addEventListener("click", openShortcut));
// First visit debug window logic
const firstVisitKey = "bolt-first-visit";
const latestVersion = await fetch("/misc/updateKey.txt").then((res) => res.text());
if (!localStorage.getItem(firstVisitKey)) {

    localStorage.setItem("current-version", latestVersion);
    localStorage.setItem(firstVisitKey, "true");
}


if (typeof window !== 'undefined') {
    if (localStorage.getItem("current-version") !== latestVersion) {
        notify({
            title: "Update Available",
            desc: "Cr1mson needs an update! Some features may be broken until updated. Open settings to update.",
            img: "/img/warning.webp",
            lifespan: 6,
            important: false,
            sound: true,
            buttons: [
                {
                    label: "Open Settings",
                    onClick: () => {
                        new Window({
                            url: "/settings",
                            title: "Settings",
                            icon: "/img/icons/settings.webp",
                            startMaximized: false,
                            width: 800,
                            height: 600
                        });
                    }
                },
                {
                    label: "Update Now",
                    primary: true,
                    onClick: () => {
                        deepReset();
                    }
                }
            ]
        });
    }
}


const express = require("express");
const puppeteer = require("puppeteer");
const http = require("http");
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let browser, page;

async function startBrowser() {
    browser = await puppeteer.launch({ headless: 'new', args: ["--no-sandbox", "--disable-setuid-sandbox"] });
    page = await browser.newPage();
    await page.goto("https://www.google.com");

    // Desativar limite de FPS para capturar imagens mais rápido
    await page.evaluate(() => {
        document.body.style.overflow = "hidden";
    });

    // Iniciar captura de tela contínua
    captureScreen();
}

// Envia capturas de tela constantes para os clientes
async function captureScreen() {
    if (page) {
        const screenshot = await page.screenshot({ encoding: "base64" });
        io.emit("updateScreen", screenshot);
    }
    setTimeout(captureScreen, 30); // Captura a cada 30ms (~33 FPS)
}

// Captura eventos de teclado e mouse dos usuários
io.on("connection", (socket) => {
    console.log("Novo usuário conectado");

    socket.on("navigate", async (url) => {
        if (page) {
            await page.goto(url);
        }
    });

    socket.on("mouseMove", async ({ x, y }) => {
        if (page) await page.mouse.move(x, y);
    });

    socket.on("mouseClick", async () => {
        if (page) await page.mouse.click();
    });

    socket.on("keyPress", async (key) => {
        if (page) await page.keyboard.press(key);
    });

    socket.on("disconnect", () => {
        console.log("Usuário desconectado");
    });
});

// Iniciar servidor
app.use(express.static("public"));
server.listen(2020, async () => {
    console.log("Servidor rodando em http://localhost:2020");
    await startBrowser();
});

const express = require("express");
const puppeteer = require("puppeteer");
const http = require("http");
const { Server } = require("socket.io");
const stateManager = require("./stateManager");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

let browser, page;
let captureInterval;
let config = {
    headless: 'new',
    fps: 30,
    viewport: {
        width: 1280,
        height: 720
    },
    extraArgs: ["--no-sandbox", "--disable-setuid-sandbox"]
};

async function startBrowser() {
    try {
        // Load saved state
        const savedState = await stateManager.getState();
        config = savedState.config || config;

        // Close existing browser if it exists
        if (browser) {
            await browser.close();
        }

        // Launch browser with current configuration
        browser = await puppeteer.launch({
            headless: config.headless,
            args: config.extraArgs
        });

        // Create new page and set viewport
        page = await browser.newPage();
        await page.setViewport(config.viewport);

        // Restore cookies if they exist
        if (savedState.cookies && savedState.cookies.length > 0) {
            await page.setCookie(...savedState.cookies);
        }

        // Navigate to saved URL or default to Google
        const url = savedState.url || "https://www.google.com";
        await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 }).catch(console.error);

        // Optimize page for capturing
        await page.evaluate(() => {
            document.body.style.overflow = "hidden";
            document.documentElement.style.scrollBehavior = "auto";
        });

        // Start screen capture loop
        startScreenCapture();

        return true;
    } catch (error) {
        console.error("Error starting browser:", error);
        return false;
    }
}

function startScreenCapture() {
    if (captureInterval) {
        clearInterval(captureInterval);
    }

    const interval = Math.floor(1000 / config.fps);

    captureInterval = setInterval(async () => {
        try {
            if (page) {
                const screenshot = await page.screenshot({ 
                    encoding: "base64"
                });
                io.emit("updateScreen", screenshot);
            }
        } catch (error) {
            console.error("Screenshot error:", error);
            io.emit("error", { message: "Failed to capture screen" });
        }
    }, interval);
}

// Socket.io connection handler
io.on("connection", (socket) => {
    console.log("New client connected");

    // Navigation handler with improved error handling
    socket.on("navigate", async (url) => {
        try {
            if (!url.startsWith('http://') && !url.startsWith('https://')) {
                url = 'https://' + url;
            }

            if (page) {
                await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
                console.log("Navigated to:", url);
                
                // Save current URL to state
                const currentState = await stateManager.getState();
                await stateManager.saveState({
                    ...currentState,
                    url: url
                });

                // Get and save cookies
                const cookies = await page.cookies();
                await stateManager.saveState({
                    ...currentState,
                    cookies: cookies
                });
            }
        } catch (error) {
            console.error("Navigation error:", error);
            socket.emit("error", { message: "Failed to navigate to the specified URL" });
        }
    });

    // Mouse movement handler
    socket.on("mouseMove", async ({ x, y }) => {
        try {
            if (page) {
                await page.mouse.move(x, y);
            }
        } catch (error) {
            console.error("Mouse move error:", error);
        }
    });

    // Mouse click handler
    socket.on("mouseClick", async ({ x, y }) => {
        try {
            if (page) {
                await page.mouse.click(x, y);
            }
        } catch (error) {
            console.error("Mouse click error:", error);
        }
    });

    // Drag event handlers
    socket.on("dragStart", async ({ x, y }) => {
        try {
            if (page) {
                await page.mouse.move(x, y);
                await page.mouse.down();
            }
        } catch (error) {
            console.error("Drag start error:", error);
        }
    });

    socket.on("dragMove", async ({ x, y }) => {
        try {
            if (page) {
                await page.mouse.move(x, y);
            }
        } catch (error) {
            console.error("Drag move error:", error);
        }
    });

    socket.on("dragEnd", async ({ x, y }) => {
        try {
            if (page) {
                await page.mouse.move(x, y);
                await page.mouse.up();
            }
        } catch (error) {
            console.error("Drag end error:", error);
        }
    });

    // Enhanced text input handler for mobile
    socket.on("sendText", async (text) => {
        try {
            if (page) {
                await page.keyboard.type(text);
                console.log("Text input sent:", text);
            }
        } catch (error) {
            console.error("Text input error:", error);
            socket.emit("error", { message: "Failed to input text" });
        }
    });

    // Configuration update handler with state persistence
    socket.on("updateConfig", async (newConfig) => {
        try {
            // Update configuration
            config = {
                ...config,
                ...newConfig,
                extraArgs: [...config.extraArgs, ...(newConfig.extraArgs || [])]
            };

            // Save new configuration to state
            const currentState = await stateManager.getState();
            await stateManager.saveState({
                ...currentState,
                config: config
            });

            // Restart browser with new configuration
            const success = await startBrowser();
            if (success) {
                console.log("Browser restarted with new configuration");
                socket.emit("configUpdated", { success: true });
            } else {
                console.error("Failed to restart browser with new configuration");
                socket.emit("error", { message: "Failed to apply new configuration" });
            }
        } catch (error) {
            console.error("Configuration update error:", error);
            socket.emit("error", { message: "Failed to update configuration" });
        }
    });

    // Disconnect handler
    socket.on("disconnect", () => {
        console.log("Client disconnected");
    });
});

// Serve static files
app.use(express.static("public"));

// Start server
const PORT = process.env.PORT || 8000;
server.listen(PORT, async () => {
    console.log(`Server running at http://localhost:${PORT}`);
    await startBrowser();
});

// Handle process termination
process.on("SIGINT", async () => {
    if (browser) {
        await browser.close();
    }
    process.exit();
});

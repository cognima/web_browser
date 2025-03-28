const express = require("express");
const puppeteer = require("puppeteer");
const http = require("http");
const { Server } = require("socket.io");

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

        // Navigate to Google by default
        await page.goto("https://www.google.com");

        // Optimize page for capturing
        await page.evaluate(() => {
            document.body.style.overflow = "hidden";
            // Disable smooth scrolling for better performance
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
    // Clear existing interval if it exists
    if (captureInterval) {
        clearInterval(captureInterval);
    }

    // Calculate interval based on FPS
    const interval = Math.floor(1000 / config.fps);

    // Start new capture loop
    captureInterval = setInterval(async () => {
        try {
            if (page) {
                const screenshot = await page.screenshot({ 
                    encoding: "base64"// Slightly reduce quality for better performance
                });
                io.emit("updateScreen", screenshot);
            }
        } catch (error) {
            console.error("Screenshot error:", error);
        }
    }, interval);
}

// Socket.io connection handler
io.on("connection", (socket) => {
    console.log("New client connected");

    // Navigation handler
    socket.on("navigate", async (url) => {
        try {
            if (page) {
                await page.goto(url);
                console.log("Navigated to:", url);
            }
        } catch (error) {
            console.error("Navigation error:", error);
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

    // Keyboard handler
    socket.on("keyPress", async (key) => {
        try {
            if (page) {
                await page.keyboard.press(key);
            }
        } catch (error) {
            console.error("Keyboard press error:", error);
        }
    });

    // Add text input handler
    socket.on("typeText", async (text) => {
        try {
            if (page) {
                await page.keyboard.type(text);
            }
        } catch (error) {
            console.error("Text input error:", error);
        }
    });

    // Configuration update handler
    socket.on("updateConfig", async (newConfig) => {
        try {
            // Update configuration
            config = {
                ...config,
                ...newConfig,
                extraArgs: [...config.extraArgs, ...(newConfig.extraArgs || [])]
            };

            // Restart browser with new configuration
            const success = await startBrowser();
            if (success) {
                console.log("Browser restarted with new configuration");
            } else {
                console.error("Failed to restart browser with new configuration");
            }
        } catch (error) {
            console.error("Configuration update error:", error);
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

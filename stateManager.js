const fs = require('fs').promises;
const path = require('path');

const STATE_FILE = path.join(__dirname, 'data.json');

const defaultState = {
    url: 'https://www.google.com',
    config: {
        headless: 'new',
        fps: 30,
        viewport: {
            width: 1280,
            height: 720
        },
        extraArgs: ["--no-sandbox", "--disable-setuid-sandbox"]
    },
    cookies: []
};

async function getState() {
    try {
        const data = await fs.readFile(STATE_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        // If file doesn't exist or is invalid, return default state
        await saveState(defaultState);
        return defaultState;
    }
}

async function saveState(state) {
    try {
        await fs.writeFile(STATE_FILE, JSON.stringify(state, null, 2));
        return true;
    } catch (error) {
        console.error('Error saving state:', error);
        return false;
    }
}

module.exports = {
    getState,
    saveState
};

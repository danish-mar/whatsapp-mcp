import { FastMCP } from "fastmcp";
import pkg from "whatsapp-web.js";
const { Client, LocalAuth } = pkg;
import qrcode from "qrcode-terminal";
import { z } from "zod";
import "dotenv/config";
import express from "express";
import axios from "axios";

const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;
const REST_PORT = PORT + 1;
const TARGET_PHONE = process.env.TARGET_PHONE || "";

const mcp = new FastMCP({ name: "WhatsApp MCP Server", version: "1.0.0" });

const client = new Client({
    authStrategy: new LocalAuth(),
    puppeteer: {
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-extensions',
            '--disable-dev-shm-usage',
            '--disable-accelerated-2d-canvas',
            '--no-first-run',
            '--no-zygote',
            '--single-process',
            '--disable-gpu'
        ],
        headless: true,
    }
});

let isReady = false;

client.on('loading_screen', (percent, message) => {
    console.error(`LOADING PROGRESS: ${percent}% - ${message}`);
});

client.on('qr', (qr) => {
    console.log('Scan this QR code to log in:');
    qrcode.generate(qr, { small: true });
});

client.on('ready', () => {
    console.error('WhatsApp Client is READY and fully functional!');
    isReady = true;
});

client.on('authenticated', () => {
    console.error('WhatsApp Client is authenticated. Waiting for ready event...');
    
    // Fallback: If we don't get 'ready' in 30s but state is CONNECTED, force it
    setTimeout(async () => {
        if (!isReady) {
            try {
                const state = await client.getState();
                if (state === 'CONNECTED') {
                    console.error('[Debug] Ready event timed out but state is CONNECTED. Forcing ready state...');
                    isReady = true;
                }
            } catch (e) {}
        }
    }, 30000);
});

client.on('auth_failure', (msg) => {
    console.error('WhatsApp Authentication failure:', msg);
});

client.on('message', async (msg) => {
    console.error(`[Debug] Message received from ${msg.from}: ${msg.body.substring(0, 20)}...`);
    await forwardToWebhook(msg);
});

client.on('message_create', async (msg) => {
    if (msg.fromMe) {
        console.error(`[Debug] Outgoing message created to ${msg.to}: ${msg.body.substring(0, 20)}...`);
        // Optionally forward outgoing messages too
        // await forwardToWebhook(msg);
    }
});

async function forwardToWebhook(msg: any) {
    const webhookUrl = process.env.WEBHOOK_URL;
    if (!webhookUrl) {
        console.error('[Debug] No WEBHOOK_URL defined in .env, skipping forward.');
        return;
    }

    console.error(`[Debug] Attempting to forward to ${webhookUrl}...`);

    try {
        let mediaData = null;
        if (msg.hasMedia) {
            console.error('[Debug] Message has media, downloading...');
            try {
                const media = await msg.downloadMedia();
                if (media) {
                    mediaData = {
                        mimetype: media.mimetype,
                        data: media.data,
                        filename: media.filename
                    };
                    console.error('[Debug] Media downloaded successfully.');
                }
            } catch (e: any) {
                console.error(`[Debug] Failed to download media: ${e.message}`);
            }
        }

        const response = await axios.post(webhookUrl, {
            from: msg.from,
            to: msg.to,
            body: msg.body,
            timestamp: msg.timestamp,
            hasMedia: msg.hasMedia,
            media: mediaData,
            author: msg.author,
            isForwarded: msg.isForwarded,
            fromMe: msg.fromMe
        }, { timeout: 5000 });

        console.error(`[Debug] Webhook success! Status: ${response.status}`);
    } catch (error: any) {
        console.error(`[Debug] Webhook failed for message from ${msg.from}: ${error.message}`);
        if (error.response) {
            console.error(`[Debug] Response status: ${error.response.status}`);
            console.error(`[Debug] Response data: ${JSON.stringify(error.response.data)}`);
        }
    }
}

mcp.addTool({
    name: "send_message",
    description: "Send a message to a WhatsApp contact or group",
    parameters: z.object({
        to: z.string().describe("The phone number or chat ID (e.g., '1234567890@c.us' or '919876543210@c.us')"),
        message: z.string().describe("The message text to send")
    }),
    execute: async (args) => {
        let state = "Unknown";
        try { state = await client.getState(); } catch (e) {}

        if (!isReady && state !== 'CONNECTED') {
            return `WhatsApp client is not ready (State: ${state}). Please wait for the "READY" message in the terminal.`;
        }

        try {
            const chatId = args.to.includes('@') ? args.to : `${args.to}@c.us`;
            const chat = await client.sendMessage(chatId, args.message);
            return `Message sent successfully to ${chatId}. Message ID: ${chat.id.id}`;
        } catch (error: any) {
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }
});

mcp.addTool({
    name: "send_message_to_target",
    description: "Send a message to the target user defined in .env",
    parameters: z.object({
        message: z.string().describe("The message text to send")
    }),
    execute: async (args) => {
        let state = "Unknown";
        try { state = await client.getState(); } catch (e) {}

        if (!isReady && state !== 'CONNECTED') {
            return "WhatsApp client is not ready.";
        }
        if (!TARGET_PHONE) {
            throw new Error("TARGET_PHONE is not defined in .env");
        }

        try {
            const chat = await client.sendMessage(TARGET_PHONE, args.message);
            return `Message sent successfully to ${TARGET_PHONE}. Message ID: ${chat.id.id}`;
        } catch (error: any) {
            throw new Error(`Failed to send message: ${error.message}`);
        }
    }
});

mcp.addTool({
    name: "get_status",
    description: "Get the current status of the WhatsApp client",
    parameters: z.object({}),
    execute: async () => {
        let state = "Unknown";
        try {
            state = await client.getState();
        } catch (e) {
            state = isReady ? "CONNECTED (estimated)" : "INITIALIZING";
        }
        return `Client status: ${isReady ? 'Ready' : 'Not Ready'}\nWhatsApp State: ${state}`;
    }
});

mcp.addTool({
    name: "list_chats",
    description: "List recent chats",
    parameters: z.object({}),
    execute: async () => {
        if (!isReady) {
            throw new Error("WhatsApp client is not ready.");
        }

        try {
            const chats = await client.getChats();
            const chatList = chats.slice(0, 10).map(c => `- ${c.name} (${c.id._serialized})`).join('\n');
            return `Recent Chats:\n${chatList}`;
        } catch (error: any) {
            throw new Error(`Failed to list chats: ${error.message}`);
        }
    }
});

mcp.addTool({
    name: "get_unread_messages",
    description: "Get all unread messages from all chats",
    parameters: z.object({}),
    execute: async () => {
        let state = "Unknown";
        try { state = await client.getState(); } catch (e) {}

        if (!isReady && state !== 'CONNECTED') {
            throw new Error("WhatsApp client is not ready.");
        }

        try {
            const chats = await client.getChats().catch(() => []);
            const unreadChats = chats.filter(chat => chat.unreadCount > 0);
            
            if (unreadChats.length === 0) {
                return "No unread messages.";
            }

            let result = "Unread Messages:\n";
            for (const chat of unreadChats) {
                try {
                    const messages = await chat.fetchMessages({ limit: chat.unreadCount });
                    result += `\n--- Chat: ${chat.name} (${chat.id._serialized}) ---\n`;
                    messages.forEach(msg => {
                        result += `[${new Date(msg.timestamp * 1000).toLocaleString()}] ${msg.fromMe ? 'Me' : msg.author || 'User'}: ${msg.body}\n`;
                    });
                } catch (e) {
                    result += `\n--- Chat: ${chat.name} (Loading...) ---\n(Still syncing messages for this chat...)\n`;
                }
            }
            return result;
        } catch (error: any) {
            if (error.message.includes('waitForChatLoading')) {
                return "The client is still syncing data. Please wait a minute and try again.";
            }
            throw new Error(`Failed to get unread messages: ${error.message}`);
        }
    }
});

mcp.addTool({
    name: "get_recent_messages",
    description: "Get recent messages from a specific chat",
    parameters: z.object({
        chatId: z.string().describe("The chat ID (e.g., '1234567890@c.us')"),
        limit: z.number().optional().default(10).describe("Number of messages to fetch")
    }),
    execute: async (args) => {
        let state = "Unknown";
        try { state = await client.getState(); } catch (e) {}

        if (!isReady && state !== 'CONNECTED') {
            throw new Error("WhatsApp client is not ready.");
        }

        try {
            const chat = await client.getChatById(args.chatId);
            const messages = await chat.fetchMessages({ limit: args.limit });
            
            let result = `Recent messages in ${chat.name}:\n`;
            messages.forEach(msg => {
                result += `[${new Date(msg.timestamp * 1000).toLocaleString()}] ${msg.fromMe ? 'Me' : msg.author || 'User'}: ${msg.body}\n`;
            });
            return result;
        } catch (error: any) {
            throw new Error(`Failed to fetch messages: ${error.message}`);
        }
    }
});

// --- REST API SETUP ---
const app = express();
app.use(express.json());

app.get("/status", async (req, res) => {
    let state = "Unknown";
    try { state = await client.getState(); } catch (e) {}
    res.json({ isReady, state });
});

app.post("/send", async (req, res) => {
    const { to, message } = req.body;
    if (!to || !message) {
        return res.status(400).json({ error: "Missing 'to' or 'message' in request body" });
    }

    let state = "Unknown";
    try { state = await client.getState(); } catch (e) {}
    if (!isReady && state !== 'CONNECTED') {
        return res.status(503).json({ error: "WhatsApp client is not ready" });
    }

    try {
        const chatId = to.includes('@') ? to : `${to}@c.us`;
        const chat = await client.sendMessage(chatId, message);
        res.json({ success: true, messageId: chat.id.id, to: chatId });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/unread", async (req, res) => {
    let state = "Unknown";
    try { state = await client.getState(); } catch (e) {}
    if (!isReady && state !== 'CONNECTED') {
        return res.status(503).json({ error: "WhatsApp client is not ready" });
    }

    try {
        const chats = await client.getChats().catch(() => []);
        const unreadChats = chats.filter(chat => chat.unreadCount > 0);
        
        const result = [];
        for (const chat of unreadChats) {
            try {
                const messages = await chat.fetchMessages({ limit: chat.unreadCount });
                result.push({
                    chatName: chat.name,
                    chatId: chat.id._serialized,
                    messages: messages.map(msg => ({
                        timestamp: msg.timestamp,
                        from: msg.fromMe ? 'Me' : msg.author || 'User',
                        body: msg.body
                    }))
                });
            } catch (e) {
                result.push({
                    chatName: chat.name,
                    chatId: chat.id._serialized,
                    error: "Syncing messages..."
                });
            }
        }
        res.json({ unread: result });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.get("/messages/:chatId", async (req, res) => {
    const { chatId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    let state = "Unknown";
    try { state = await client.getState(); } catch (e) {}
    if (!isReady && state !== 'CONNECTED') {
        return res.status(503).json({ error: "WhatsApp client is not ready" });
    }

    try {
        const chat = await client.getChatById(chatId);
        const messages = await chat.fetchMessages({ limit });
        res.json({
            chatName: chat.name,
            messages: messages.map(msg => ({
                timestamp: msg.timestamp,
                from: msg.fromMe ? 'Me' : msg.author || 'User',
                body: msg.body
            }))
        });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

app.listen(REST_PORT, () => {
    console.error(`REST API running on http://localhost:${REST_PORT}`);
});

// Start the WhatsApp client
client.initialize().catch(err => {
    console.error("Failed to initialize WhatsApp client:", err);
});

// Start the MCP server
await mcp.start({
    transportType: "httpStream",
    httpStream: {
        port: PORT,
    }
});

console.error(`WhatsApp MCP Server running on http://localhost:${PORT}/sse`);

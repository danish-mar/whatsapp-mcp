# WhatsApp MCP Server

A powerful Model Context Protocol (MCP) server that connects your AI agents directly to WhatsApp. This server provides a dual interface: an MCP server for AI tools and a REST API for standard HTTP interactions, plus a webhook system for real-time message forwarding with media support.

## 🚀 Features

- **MCP Tools**: Expose WhatsApp functionality (send messages, read unread, etc.) as tools for AI models.
- **REST API**: Standard HTTP endpoints for sending and receiving messages.
- **Webhook Forwarding**: Automatically forward incoming WhatsApp messages to a custom webhook URL.
- **Media Support**: Webhooks include full support for images, videos, voice notes, and documents (as Base64).
- **Auto-Readiness**: Built-in fallbacks to ensure the server starts even if WhatsApp sync is slow.
- **Authentication**: Easy QR code authentication via terminal.

## 🛠️ Setup

### 1. Installation
```bash
npm install
```

### 2. Configuration
Create a `.env` file in the root directory (or copy `.env.example`):
```env
PORT=3012
TARGET_PHONE=xxxxxxxxxxxx@c.us
WEBHOOK_URL=https://your-webhook-endpoint.com/receive
```

### 3. Running the Server
```bash
### 4. Running with Docker (Recommended)
You can run the entire server in a containerized environment using Docker:
```bash
docker compose up --build
```
*Note: Authentication QR code will appear in the container logs. Once scanned, the session is persisted in the `.wwebjs_auth` volume.*

## 🤖 MCP Tools

Once connected, the following tools are available to your AI:
- `send_message`: Send a text message to any number or group.
- `send_message_to_target`: Send a message to the pre-configured `TARGET_PHONE`.
- `get_unread_messages`: Retrieve all currently unread messages.
- `get_recent_messages`: Get chat history for a specific contact.

## 🌐 REST API Endpoints

The REST API runs on `PORT + 1` (default: `3013`).

- **`GET /status`**: Check WhatsApp connection status.
- **`POST /send`**: Send a message.
  - Body: `{"to": "number", "message": "text"}`
- **`GET /unread`**: Fetch all unread messages.
- **`GET /messages/:chatId`**: Fetch recent messages for a chat.

## 🪝 Webhook Forwarding

The server can forward all incoming messages to your `WEBHOOK_URL`. The payload includes:
- `from`: Sender's WhatsApp ID.
- `body`: Message text.
- `hasMedia`: Boolean indicating if media is attached.
- `media`: (Optional) Object containing `mimetype`, `data` (Base64), and `filename`.

## 🛡️ Security & Authentication
On the first run, a QR code will appear in your terminal. Scan it with your WhatsApp mobile app (Linked Devices) to authenticate. Session data is persisted locally in the `.wwebjs_auth` folder.

## 📄 License
ISC

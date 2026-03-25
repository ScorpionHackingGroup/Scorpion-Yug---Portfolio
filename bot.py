#!/usr/bin/env python3
import asyncio
import os
import shutil
import subprocess
import tempfile
import zipfile
from pathlib import Path
import requests
from telegram import Update
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes

# ========= CONFIGURATION =========
TOKEN = "8533661410:AAF87MsCGvBelvqPguWl_XbWM3tytGKAs8o"  # Replace if needed
PUBLIC_IP = None  # Will be fetched automatically
PORT_RANGE = range(8000, 8100)  # Ports to try
# =================================

# In-memory storage: user_id -> (port, directory, process)
user_servers = {}

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text(
        "Welcome! Send me a **download link** to a ZIP file containing PHP files.\n"
        "I'll extract it, run a PHP server, and give you a public URL.\n\n"
        "Example: `https://example.com/project.zip`\n\n"
        "If the ZIP is small (<50 MB) you can also upload it directly.\n"
        "Use /stop when you're done to free up resources."
    )

async def stop(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    if user_id in user_servers:
        port, directory, process = user_servers[user_id]
        process.terminate()
        shutil.rmtree(directory, ignore_errors=True)
        del user_servers[user_id]
        await update.message.reply_text(f"Stopped server on port {port} and cleaned up.")
    else:
        await update.message.reply_text("You don't have any active server.")

async def handle_message(update: Update, context: ContextTypes.DEFAULT_TYPE):
    user_id = update.effective_user.id
    message = update.message

    # If there's a document, check its size
    if message.document:
        file_size = message.document.file_size
        if file_size > 50 * 1024 * 1024:
            await message.reply_text(
                "⚠️ File size exceeds 50 MB. Telegram bots cannot download it.\n"
                "Please upload the file to a hosting service and send me the **download link** instead."
            )
            return
        # Download the file via Telegram
        file = await message.document.get_file()
        with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
            await file.download_to_drive(tmp.name)
            zip_path = tmp.name
    elif message.text and message.text.startswith(("http://", "https://")):
        # It's a URL
        url = message.text.strip()
        try:
            # Download the zip file from the URL
            with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
                response = requests.get(url, stream=True)
                response.raise_for_status()
                for chunk in response.iter_content(chunk_size=8192):
                    tmp.write(chunk)
                zip_path = tmp.name
        except Exception as e:
            await message.reply_text(f"Failed to download from URL: {e}")
            return
    else:
        await message.reply_text("Send me a download link (URL) or a small ZIP file (< 50 MB).")
        return

    # Extract ZIP to a temporary directory
    extract_dir = tempfile.mkdtemp(prefix=f"bot_{user_id}_")
    try:
        with zipfile.ZipFile(zip_path, 'r') as z:
            z.extractall(extract_dir)
    except Exception as e:
        await message.reply_text(f"Error extracting ZIP: {e}")
        os.unlink(zip_path)
        shutil.rmtree(extract_dir, ignore_errors=True)
        return
    finally:
        os.unlink(zip_path)  # Clean up downloaded zip

    # Find an available port
    port = None
    for p in PORT_RANGE:
        proc = subprocess.run(["lsof", "-i", f":{p}"], capture_output=True)
        if proc.returncode != 0:  # Port not in use
            port = p
            break
    if port is None:
        await message.reply_text("No free ports in range. Please try again later.")
        shutil.rmtree(extract_dir, ignore_errors=True)
        return

    # Start PHP built-in server
    process = subprocess.Popen(
        ["php", "-S", f"0.0.0.0:{port}", "-t", extract_dir],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL
    )

    # Store server info
    user_servers[user_id] = (port, extract_dir, process)

    # Get public IP if not already known
    global PUBLIC_IP
    if PUBLIC_IP is None:
        try:
            PUBLIC_IP = requests.get("https://ifconfig.me/ip", timeout=5).text.strip()
        except:
            PUBLIC_IP = "YOUR_SERVER_IP"  # Fallback, user must set manually

    url = f"http://{PUBLIC_IP}:{port}"
    await message.reply_text(
        f"✅ PHP server started!\n\n"
        f"Your application is accessible at: {url}\n\n"
        f"Use /stop when you're done to shut it down."
    )

async def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("stop", stop))
    app.add_handler(MessageHandler(filters.TEXT | filters.Document.ALL, handle_message))
    await app.initialize()
    await app.start()
    await app.updater.start_polling()
    print("Bot is running...")
    await asyncio.Event().wait()  # Keep running

if __name__ == "__main__":
    asyncio.run(main())

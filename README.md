# Akif Taxi Telegram Bot

This is a Telegram bot for Akif Taxi service that handles user and driver registration, group management, and payment processing.

## Features

- User and driver role selection
- Driver registration with full name
- 7-day trial period for drivers
- Group join functionality
- Payment processing
- MongoDB integration for data persistence

## Prerequisites

- Node.js (v14 or higher)
- MongoDB
- Telegram Bot Token

## Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with the following variables:
```
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHAT_ID=your_chat_id
MONGODB_URI=your_mongodb_uri
```

## Running the Bot

To start the bot, run:
```bash
node index.js
```

## Bot Commands

- `/start` - Start the bot and select role (User/Driver)
- "Foydalanuvchi" - Register as a user
- "Haydovchi" - Register as a driver
- "Guruhga qo'shilish" - Join the group (drivers only)
- "To'lov" - Process payment (drivers only)

## Database Schema

### User
- telegramId: Number (unique)
- role: String (user/driver)
- fullName: String
- state: String
- isTrialActive: Boolean
- trialEndDate: Date
- isPaid: Boolean 
# Calorie Tracker Bot — Bot specification

**Archetype:** custom

**Voice:** professional and concise — write every user-facing message, button label, error, and empty state in this voice.

A personal Telegram bot that helps users track daily calories through manual entry, a built-in food database, or meal photos (experimental). Users set a daily target and receive reminders and a daily summary. The bot supports editing logs, viewing history, and exporting data as CSV.

> This is the complete contract for the bot. Implement EVERY entry point, flow, feature, integration, and edge case below. The completeness review checks the bot against this document after each build pass.

## Primary audience

- individual Telegram users
- health-conscious individuals
- people tracking calorie intake

## Success criteria

- Users can successfully track calories through multiple methods
- Users receive timely reminders and daily summaries
- Users can export their logs as CSV

## Entry points

Every feature must be reachable from the bot's command/button surface (button-first; only /start and /help are slash commands).

- **/start** (command, actor: user, command: /start) — Open the main menu
- **Start Tracking** (button, actor: user, callback: tracking:start) — Begin calorie tracking process
- **View Today's Log** (button, actor: user, callback: log:view_today) — Show today's calorie entries
- **Edit/Delete Entry** (button, actor: user, callback: log:edit_delete) — Modify or remove a log entry
- **Export Logs (CSV)** (button, actor: user, callback: export:csv) — Request CSV export of calorie logs

## Flows

### onboarding
_Trigger:_ /start

1. Ask for timezone
2. Offer to collect simple profile (age, sex, height, weight)
3. Calculate suggested daily target
4. Allow user to accept or set custom target

_Data touched:_ user profile

### manual_entry
_Trigger:_ manual entry command

1. Prompt for food name or calories
2. Confirm entry details
3. Save to log

_Data touched:_ log entry

### database_entry
_Trigger:_ database search/browse

1. Show food database items
2. Select item
3. Choose portion
4. Confirm quantity
5. Calculate and save calories

_Data touched:_ food item, log entry

### photo_entry
_Trigger:_ photo message

1. Receive meal photo
2. Provide experimental calorie estimate
3. Ask for confirmation/adjustment
4. Save confirmed entry

_Data touched:_ log entry

### reminders
_Trigger:_ scheduled time

1. Send breakfast/lunch/dinner reminders
2. Send daily summary at set time

_Data touched:_ reminders schedule

### view_history
_Trigger:_ view history command

1. Show today's log
2. Allow viewing past logs (up to 30 days)

_Data touched:_ log entry

### edit_delete
_Trigger:_ edit/delete command

1. Select entry to edit/delete
2. Make changes or remove entry

_Data touched:_ log entry

## Data entities

Durable data (must survive a restart) uses the toolkit's persistent store, never in-memory maps.

- **user profile** _(retention: persistent)_ — User's basic information and settings
  - fields: Telegram account ID, name, timezone, age, sex, height, weight, daily calorie target
- **food item** _(retention: persistent)_ — Predefined food items in the database
  - fields: name, kcal per portion, portion name
- **log entry** _(retention: persistent)_ — User's calorie entries
  - fields: timestamp, food item, portion/quantity, calories, source, confirmed
- **reminders schedule** _(retention: persistent)_ — User's reminder times
  - fields: breakfast time, lunch time, dinner time, daily summary time

## Integrations

- **Telegram** (required) — Bot API messaging
Call external APIs against their real contract (correct endpoints, ids, params); credentials from env. Do not fake responses.

## Owner controls

- Manage food database entries
- View all user logs (for testing)
- Configure system-wide settings

## Notifications

- Meal-time reminders
- Daily summary notifications
- Photo estimate confirmation requests

## Permissions & privacy

- Access to user's Telegram account ID
- Storage of basic profile information
- Storage of calorie logs

## Edge cases

- User sends multiple photos at once
- User tries to edit/delete non-existent entry
- User changes timezone after setting reminders

## Required tests

- End-to-end tracking of a meal via all three methods (manual, database, photo)
- Reminder scheduling across different timezones
- CSV export functionality with sample data

## Assumptions

- One profile per Telegram account
- Photo estimates require confirmation
- Food database seeded with ~10 common items

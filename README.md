# ICAI CA Articleship Work Diary — Server

Created by **Nakum Vishvarajsinh Ghanshyamsinh** (SRN: WRO0863553)

## 🚀 Deploy to Render.com (Free — 5 minutes)

### Step 1: Upload to GitHub
1. Create a new GitHub repository (can be private)
2. Upload all files from this ZIP to that repository

### Step 2: Deploy on Render.com
1. Go to **https://render.com** → Sign up free with GitHub
2. Click **New → Web Service**
3. Connect your GitHub repository
4. Settings:
   - **Name:** `icai-diary-server`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
   - **Plan:** Free
5. Add **Environment Variables:**
   ```
   JWT_SECRET      = (any long random string, e.g. MySecretKey123!@#NakumICAI2025)
   ADMIN_PASSWORD  = YourSecretAdminPassword
   DOWNLOAD_URL    = (your .exe download link — Google Drive or GitHub)
   ```
6. Add **Disk** (for database):
   - Name: `icai-data`
   - Mount Path: `/opt/render/project/src/data`
   - Size: 1 GB (free)
7. Click **Deploy**

### Step 3: Get your server URL
After deploy, Render gives you a URL like:
`https://icai-diary-server.onrender.com`

**This is your SERVER_URL — put it in the app's .env file.**

## 🔐 Admin Panel
Visit: `https://your-server.onrender.com/admin`
- Username: `nakum_admin`
- Password: whatever you set in `ADMIN_PASSWORD`

## 📱 What you can do in Admin Panel
- ✅ **Approve** new user registrations
- 🚫 **Ban** users instantly (they get blocked on next heartbeat)
- ✗ **Reject** registrations
- 🚀 **Publish new versions** → all users see update notification
- 📊 **View stats** — total users, logins, active users
- 📋 **Activity logs** — see what every user is doing

## 🔄 Publish App Update
1. Build new `.exe` with `npm run dist:win`
2. Upload `.exe` to Google Drive or GitHub Releases
3. Get direct download link
4. Go to Admin Panel → App Versions → Publish New Version
5. Enter version number + download URL + release notes
6. All users see "Update Available" on next app start

## 🌐 Website
Visit: `https://your-server.onrender.com`
Public download page where anyone can download your app.

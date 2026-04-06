# Nations of World - Modpack Server

A simple Node.js server to distribute your custom modpack for the Nations of World launcher.

## Setup

```bash
cd modpack-server
npm install
```

## Usage

1. **Add your mods** in the `mods/` folder (`.jar` files)

2. **Edit `distribution.json`** to add your mod entries. Example ForgeMod entry:
   ```json
   {
       "id": "com.example:mymod:1.0.0",
       "name": "My Custom Mod",
       "type": "ForgeMod",
       "required": { "value": true, "def": true },
       "artifact": {
           "size": 12345,
           "url": "http://YOUR_SERVER_IP:3000/mods/mymod-1.0.0.jar",
           "MD5": ""
       },
       "subModules": []
   }
   ```
   Add this inside the `modules` array of the instance in `distribution.json`.

3. **Start the server:**
   ```bash
   npm start
   ```

4. **Configure the launcher:**
   - Open the launcher → Settings → Distribution
   - Set the URL to: `http://YOUR_SERVER_IP:3000/distribution`
   - Save and restart the launcher

## Module Types

| Type | Description |
|------|-------------|
| `ForgeHosted` | Forge installer (main Forge jar) |
| `ForgeMod` | A Forge mod (goes into `mods/` folder) |
| `Library` | A library jar (goes into `libraries/`) |
| `File` | Any file (custom path) |
| `VersionManifest` | Minecraft version manifest |

## Important Notes

- The server **must** expose both `/distribution` and `/mods/*` publicly at the correct IP and port (e.g. `http://163.5.59.154:27015`).
- The Windows Java JDK ZIP (`amazon-corretto-17.0.18.9.1-windows-x64-jdk.zip`) is served from `/mods/` on this server. Place the file in the `mods/` folder.
- If the launcher shows `ERR_CONNECTION_REFUSED`, verify that the Pterodactyl allocation port matches the port the server is actually listening on.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

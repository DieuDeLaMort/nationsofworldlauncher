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

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |

# permagen
CLI that automatically generates a permalink for any file. Useful for quickly creating free permalinks for images, PDFs, etc.

It works by storing the file in your Firebase Storage bucket using your Firebase project credentials. Credentials never leave your computer and are stored locally at ~/.permagenConfig.json. See recommended Firebase setup section below.

### Usage
- `npx permagen` - home menu
- `npx permagen --config` - settings
- `npx permagen [path to file]` - generates a permalink
- `npx permagen [path to file] -c` - generates a permalink and copies it to the clipboard

### Recommended Firebase Setup
1. Create a new Firebase project
2. Enable Storage in production mode
3. Change the security rule to "allow read, write: if true;"
4. Get your credentials by going through the web app registration process and copying the "firebaseConfig" object (also in Project Settings > Web apps > npm)
5. Enter the credentials when prompted or by running `npx permagen --config`

&nbsp;

***

Created by [Rohan Taneja](https://www.rtaneja.com/)
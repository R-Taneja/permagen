#!/usr/bin/env node

import os from 'os';
import * as p from '@clack/prompts';
import color from 'picocolors';
import fs from 'fs';
import { initializeApp } from 'firebase/app';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import path from 'path';
import clipboardy from 'clipboardy';

const CONFIG_PATH = path.join(os.homedir(), '.permagenConfig.json');

async function getFirebaseConfig(runWithConfigFlag = false) {
    const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
    const configFileExists = fs.existsSync(CONFIG_PATH);
    const configFileRead = configFileExists ? fs.readFileSync(CONFIG_PATH, 'utf-8') : null;
    const configFileJSON = configFileRead ? JSON.parse(configFileRead) : null;
    const configExistsAndIsValid = configFileRead && requiredKeys.every(key => {
        const value = configFileJSON[key];
        return value && value.trim();
    });

    if (runWithConfigFlag) {
        if (configExistsAndIsValid) {
            const shouldEditConfig = await p.confirm({ message: 'Existing Firebase configuration found. Do you want to edit them?' });
            if (!shouldEditConfig) {
                p.outro('Using existing Firebase configuration.');
                return configFileJSON;
            }
        }
    }

    if (configExistsAndIsValid) {
        return JSON.parse(configFileRead);
    }

    p.intro('\n---------------------Firebase Configuration---------------------');
    const readyToProceed = await p.confirm({ message: 'Recommended setup:\n  1. Create a new Firebase project\n  2. Enable Storage in production mode\n  3. Change the security rule to "allow read, write: if true;"\n  4. Get your credentials by going through the web app registration process (copy the "firebaseConfig" object).\n\nAll credentials will be stored locally on your computer at ~/.permagenConfig.json.\n\nAre you ready to enter your Firebase configuration details?' });
    if (!readyToProceed) process.exit(0);

    const configString = await p.text({ message: 'Paste your Firebase configuration object here:' });
    const configJSON = configString
        .replace(/const firebaseConfig =/, '')
        .replace(/;$/, '')
        .replace(/(\w+):\s/g, '"$1": ')
        .trim();

    let config;
    try {
        config = JSON.parse(configJSON);
    } catch (error) {
        p.outro('Invalid JSON format. Please try again.');
        process.exit(1);
    }

    fs.writeFileSync(CONFIG_PATH, JSON.stringify({ ...config, autoCopy: false }, null, 2));
    return { ...config, autoCopy: false };
}


async function uploadFile(filePath, storage) {
    filePath = filePath.replace(/^['"]|['"]$/g, '');
    const timestamp = Date.now();
    const fileName = path.basename(filePath);
    const fileNameWithDate = `${path.basename(fileName, path.extname(fileName))}_${timestamp}${path.extname(fileName)}`;
    const fileBuffer = fs.readFileSync(filePath);
    let storageRef = ref(storage, fileNameWithDate);
    const spinner = p.spinner({ message: 'Uploading file...' });
    spinner.start();

    try {
        await uploadBytes(storageRef, fileBuffer);
        const downloadURL = await getDownloadURL(storageRef);
        spinner.stop('File uploaded successfully!');
        return downloadURL;
    } catch (error) {
        spinner.stop('Failed to upload file.');
        console.error(error);
        process.exit(1);
    }
}

async function main() {
    const args = process.argv.slice(2);
    if (args.length === 0) {
        p.intro(`\n${color.bgMagenta(color.black('-------------------------------------------'))}\n\nWelcome! This CLI tool generates permalinks for files by hosting them on your configured Firebase Storage bucket\n  •To instantly generate a permalink, use this command: permagen [local path to file]\n  •If you need to update your Firebase credentials, use the --config flag\n  •To automatically copy permalinks to your clipboard, use the -c flag\n\n${color.bgMagenta(color.black('-------------------------------------------'))}`);
        const config = await getFirebaseConfig();
        const app = initializeApp(config);
        const storage = getStorage(app);
        
        const filePath = await p.text({ message: 'Enter the local path to your file:' });
        const downloadURL = await uploadFile(filePath, storage);
        if (args.includes('-c') || config.autoCopy) {
            clipboardy.writeSync(downloadURL);
            p.outro(`${color.bgBlue(color.black('Your file is copied to the clipboard and hosted at:'))} ${downloadURL}`);
        } else {
            p.outro(`${color.bgBlue(color.black('Your file is hosted at:'))} ${downloadURL}`);
        }
    } else if (args.includes('--config')) {
        const config = await getFirebaseConfig(true);

        const shouldAutoCopy = await p.confirm({ 
            message: 'Do you want to always automatically copy permalinks to the clipboard? (This can be changed later)'
        });

        config.autoCopy = shouldAutoCopy;
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

        p.outro('Firebase configuration updated successfully!');
    } else if (fs.existsSync(args[0])) {
        const config = await getFirebaseConfig();
        const app = initializeApp(config);
        const storage = getStorage(app);
        const downloadURL = await uploadFile(args[0], storage);

        if (args.includes('-c') || config.autoCopy) {
            clipboardy.writeSync(downloadURL);
            p.outro(`${color.bgBlue(color.black('Your file is copied to the clipboard and hosted at:'))} ${downloadURL}`);
        } else {
            p.outro(`${color.bgBlue(color.black('Your file is hosted at:'))} ${downloadURL}`);
        }
    } else if (!fs.existsSync(args[0])) {
        p.outro('Invalid file path.');
    } else {
        p.outro('Invalid command. Please run the command without any arguments for the interactive setup or provide a valid file path.');
    }
}

main().catch(console.error);
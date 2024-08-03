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
    let configExistsAndIsValid = false;
    let configFileRead;

    try {
        const requiredKeys = ['apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'];
        const configFileExists = fs.existsSync(CONFIG_PATH);
        configFileRead = configFileExists ? fs.readFileSync(CONFIG_PATH, 'utf-8') : null;
        const configFileJSON = configFileRead ? JSON.parse(configFileRead) : null;
        configExistsAndIsValid = configFileRead && requiredKeys.every(key => {
            const value = configFileJSON[key];
            return value && value.trim();
        });
    } catch (error) {
        if (!runWithConfigFlag) {
            p.outro('Invalid Firebase configuration. Please run npx permagen --config.');
            process.exit(1);
        }
    }

    if (runWithConfigFlag) {
        if (configExistsAndIsValid) {
            const shouldEditConfig = await p.confirm({ message: 'Existing Firebase configuration found. Do you want to edit it?' });
            if (!shouldEditConfig) {
                p.outro('Using existing Firebase configuration.')
                return configFileJSON;
            }
        }
    } else if (configExistsAndIsValid) {
        return JSON.parse(configFileRead);
    }

    p.intro('\n---------------------Firebase Configuration---------------------');
    const readyToProceed = await p.confirm({ message: 'Recommended setup:\n  1. Create a new Firebase project\n  2. Enable Storage in production mode\n  3. Change the security rule to "allow read, write: if true;"\n  4. Get your credentials by going through the web app registration process and copying the "firebaseConfig" object (also in Project Settings > Web apps > npm)\n\nCredentials will only be stored locally on your computer at ~/.permagenConfig.json.\n\nAre you ready to enter your Firebase configuration details?' });
    if (!readyToProceed) process.exit(0);

    const configString = await p.text({
        message: 'Paste your Firebase configuration object here:',
        validate: (value) => {
            if (!value) return 'Please enter a configuration.';
            if (!value.includes('}') || !value.includes('{')) {
                return 'Invalid or incomplete configuration. Make sure to include the entire config object including the curly braces.';
            }
            return;
        },
        multiline: true
    });

    const configJSON = configString
        .replace(/const firebaseConfig =/, '')
        .replace(/;$/, '')
        .replace(/(\w+):\s/g, '"$1": ')
        .trim();

    let config;
    try {
        config = JSON.parse(configJSON);
    } catch (error) {
        p.outro('Invalid format. Please try again.');
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
        spinner.stop('Failed to upload file. Please ensure your Firebase Storage bucket is correctly configured by running npx permagen --config.');
        console.error(error);
        process.exit(1);
    }
}

function formatFilePath(inputPath) {
    inputPath = inputPath.trim();
            
    if ((inputPath.startsWith('"') && inputPath.endsWith('"')) || 
        (inputPath.startsWith("'") && inputPath.endsWith("'"))) {
        inputPath = inputPath.slice(1, -1).trim();
    }
    
    inputPath = inputPath.replace(/\\ /g, ' ');
    
    const absoluteFilePath = path.isAbsolute(inputPath) 
        ? inputPath 
        : path.resolve(process.cwd(), inputPath);
    
    return Buffer.from(path.normalize(absoluteFilePath)).toString();
}

async function main() {
    try {
        const args = process.argv.slice(2);
        if (args.length === 0) {
            p.intro(`\n${color.bgMagenta(color.black('-------------------------------------------'))}\n\nWelcome! Permagen generates permalinks for files by storing them in your configured Firebase Storage bucket\n  • To instantly generate a permalink, use this command: npx permagen [path to file]\n  • To update your Firebase credentials, use the --config flag\n  • To automatically copy permalinks to your clipboard, use the -c flag\n\n${color.bgMagenta(color.black('-------------------------------------------'))}`);
            const config = await getFirebaseConfig();
            const app = initializeApp(config);
            const storage = getStorage(app);
            
            const filePath = await p.text({ message: 'Enter the path to your file:' }, { validate: (value) => { if (!value) return 'Please enter a configuration.' } });

            const formattedFilePath = formatFilePath(filePath);
            
            if (!fs.existsSync(formattedFilePath)) {
                p.outro('Invalid file path.');
                process.exit(1);
            }

            const downloadURL = await uploadFile(formattedFilePath, storage);

            if (args.includes('-c') || config.autoCopy) {
                clipboardy.writeSync(downloadURL);
                p.outro(`${color.bgMagenta(color.black('Your file is copied to the clipboard and hosted at:'))} ${downloadURL}`);
            } else {
                p.outro(`${color.bgMagenta(color.black('Your file is hosted at:'))} ${downloadURL}`);
            }
        } else if (args.includes('--config')) {
            const config = await getFirebaseConfig(true);

            const shouldAutoCopy = await p.confirm({ 
                message: 'Do you want to always automatically copy permalinks to the clipboard? (This can be changed later)'
            });

            config.autoCopy = shouldAutoCopy;
            fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));

            p.outro('Settings updated successfully!');
        } else if (fs.existsSync(formatFilePath(args[0]))) {
            const config = await getFirebaseConfig();
            const app = initializeApp(config);
            const storage = getStorage(app);
            const formattedFilePath = formatFilePath(args[0]);
            const downloadURL = await uploadFile(formattedFilePath, storage);

            if (args.includes('-c') || config.autoCopy) {
                clipboardy.writeSync(downloadURL);
                p.outro(`${color.bgMagenta(color.black('Your file is copied to the clipboard and hosted at:'))} ${downloadURL}`);
            } else {
                p.outro(`${color.bgMagenta(color.black('Your file is hosted at:'))} ${downloadURL}`);
            }
        } else if (!fs.existsSync(formatFilePath(args[0]))) {
            p.outro('Invalid file path.');
        } else {
            p.outro('Invalid command. Please run the command without any arguments for the interactive setup or provide a valid file path.');
        }
    } catch (error) {
        process.exit(0);
    }
}

main().catch(console.error);
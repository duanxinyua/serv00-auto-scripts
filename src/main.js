import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';

function formatToISO(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}Z/, '');
}

async function delayTime(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function sendTelegramMessage(token, chatId, message) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const data = {
        chat_id: chatId,
        text: message,
    };

    try {
        const response = await axios.post(url, data);
        console.log('消息已发送到 Telegram');
    } catch (error) {
        if (error.response) {
            console.error('发送 Telegram 消息时出错:', error.response.status, error.response.data);
        } else if (error.request) {
            console.error('发送 Telegram 消息时出错:', error.request);
        } else {
            console.error('发送 Telegram 消息时出错:', error.message);
        }
    }
}

(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    const results = [];

    for (const account of accounts) {
        const { username, password, panel } = account;

        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();
        let url = `https://${panel}/login/?next=/`;

        try {
            await page.goto(url);

            const usernameInput = await page.$('#id_username');
            if (usernameInput) {
                await usernameInput.click({ clickCount: 3 });
                await usernameInput.press('Backspace');
            }
            await page.type('#id_username', username);
            await page.type('#id_password', password);

            const loginButton = await page.$('#submit');
            if (loginButton) {
                await loginButton.click();
            } else {
                throw new Error('无法找到登录按钮');
            }

            await page.waitForNavigation();

            const isLoggedIn = await page.evaluate(() => {
                const logoutButton = document.querySelector('a[href="/logout/"]');
                return logoutButton !== null;
            });

            const nowUtc = formatToISO(new Date());
            const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000)); // 北京时间东8区

            if (isLoggedIn) {
                console.log(`账号 ${username} 于北京时间 ${nowBeijing}（UTC时间 ${nowUtc}）登录成功！`);
                results.push(`账号 ${username} 于北京时间 ${nowBeijing}（UTC时间 ${nowUtc}）登录成功！`);
            } else {
                console.error(`账号 ${username} 登录失败，请检查账号和密码是否正确。`);
                results.push(`账号 ${username} 登录失败，请检查账号和密码是否正确。`);
            }
        } catch (error) {
            console.error(`账号 ${username} 登录时出现错误: ${error}`);
            results.push(`账号 ${username} 登录时出现错误: ${error.message}`);
        } finally {
            await page.close();
            await browser.close();
            const delay = Math.floor(Math.random() * 5000) + 1000; // 随机延时1秒到5秒之间
            await delayTime(delay);
        }
    }

    console.log('所有账号登录完成！');

    if (telegramToken && telegramChatId) {
        const MAX_LENGTH = 4000;
        let currentMessage = '';

        for (const result of results) {
            if ((currentMessage + result + '\n').length > MAX_LENGTH) {
                await sendTelegramMessage(telegramToken, telegramChatId, currentMessage);
                currentMessage = '';
            }
            currentMessage += result + '\n';
        }

        if (currentMessage) {
            await sendTelegramMessage(telegramToken, telegramChatId, currentMessage);
        }
    }
})();

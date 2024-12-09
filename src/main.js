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
        text: message
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
        console.error('Telegram 消息发生失败');
    }
}

(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    const timestamp = formatToISO(new Date());

    // 存储每个账号的登录状态信息
    let loginMessages = [];

    for (const account of accounts) {
        const { username, password, panel, addr } = account;

        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        let loginStatus = "登录失败";  // 默认是登录失败

        try {
            let url = `https://${panel}/login/?next=/`;
            await page.goto(url);

            const usernameInput = await page.$('#id_username');
            if (usernameInput) {
                await usernameInput.click({ clickCount: 3 });
                await usernameInput.type(username);
            }

            const passwordInput = await page.$('#id_password');
            if (passwordInput) {
                await passwordInput.click({ clickCount: 3 });
                await passwordInput.type(password);
            }

            const loginButton = await page.$('button[type="submit"]');
            if (loginButton) {
                await loginButton.click();
            }

            // 等待登录成功的页面变化
            await page.waitForNavigation({ waitUntil: 'networkidle2' });

            // 检查是否登录成功，可以根据页面的变化来判断
            const successIndicator = await page.$('.some-success-indicator'); // 请根据实际情况修改
            if (successIndicator) {
                loginStatus = "登录成功";
            }

            await browser.close();

        } catch (error) {
            console.error(`处理账户 ${username} 时发生错误:`, error);
            loginStatus = "登录失败";
            await browser.close();
        }

        // 构建每个账号的登录状态信息
        const accountMessage = addr ? `账号 ${addr}-${username} ${loginStatus}` : `账号 ${username} ${loginStatus}`;
        loginMessages.push(accountMessage);
    }

    // 组合最终的消息内容
    const finalMessage = `${timestamp} 账号登录结果：\n` + loginMessages.join("\n");

    // 发送 Telegram 消息
    await sendTelegramMessage(telegramToken, telegramChatId, finalMessage);
})();

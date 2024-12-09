import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';

// 格式化时间为 ISO 格式并转换为北京时间
function formatToISO(date) {
    return date.toISOString().replace('T', ' ').replace('Z', '').replace(/\.\d{3}Z/, '');
}

// 延时函数
async function delayTime(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 发送 Telegram 消息
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
        console.error('Telegram 消息发生失败');
    }
}

// 单个账号登录函数
async function loginAndCheckAccount(account, notifications) {
    const { username, password, panel } = account;
    const panelUrl = panel.startsWith('panel') ? panel : `panel${panel}.serv00.com`;
    const url = `https://${panelUrl}/login/?next=/`;

    try {
        const browser = await puppeteer.launch({ headless: false });
        const page = await browser.newPage();

        await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });

        await page.type('#id_username', username);
        await page.type('#id_password', password);

        const loginButton = await page.$('#submit');
        if (loginButton) await loginButton.click();

        await page.waitForNavigation({ timeout: 30000 });

        const isLoggedIn = await page.evaluate(() => !!document.querySelector('a[href="/logout/"]'));

        if (isLoggedIn) {
            const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000));
            console.log(`账号 ${username} 于北京时间 ${nowBeijing} 登录成功！`);
            notifications.push(`账号 ${username} 登录成功`);
        } else {
            console.error(`账号 ${username} 登录失败`);
            notifications.push(`账号 ${username} 登录失败`);
        }

        await browser.close();
    } catch (error) {
        console.error(`账号 ${username} 登录时出现错误: ${error.message}`);
        notifications.push(`账号 ${username} 登录时出现错误: ${error.message}`);
    }
}

// 主流程
(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    const notifications = []; // 用来存储所有的登录结果

    for (const account of accounts) {
        await loginAndCheckAccount(account, notifications);
        const delay = Math.floor(Math.random() * 5000) + 1000; // 随机延时1秒到5秒之间
        await delayTime(delay);
    }

    console.log('所有账号登录完成！');

    // 生成总结消息
    const summaryMessage = `登录任务完成！\n\n${notifications.join('\n')}`;
    console.log(summaryMessage);

    if (telegramToken && telegramChatId) {
        await sendTelegramMessage(telegramToken, telegramChatId, summaryMessage);
    }
})();

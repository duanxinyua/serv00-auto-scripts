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
    const data = { chat_id: chatId, text: message };
    try {
        await axios.post(url, data);
        console.log('消息已发送到 Telegram');
    } catch (error) {
        console.error('Telegram 消息发送失败');
    }
}

(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;
    const nowTime = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000));

    let results = [];


    for (let i = 0; i < accounts.length; i++) {
        const { username, password, panel, ssh, addr } = accounts[i];
        const accountIndex = i + 1; // 从 1 开始计数

        const browser = await puppeteer.launch({
            headless: false,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-infobars',
                '--disable-blink-features=AutomationControlled'
            ],
            defaultViewport: null,
            ignoreHTTPSErrors: true
        });
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

 
            // ✅ 等待并点击“登入”按钮
            await page.waitForSelector('.login-form__button button', { timeout: 10000 });
            await page.click('.login-form__button button');

            // const loginButton = await page.$('login-form__button');

            // if (loginButton) {
            //     await loginButton.click();
            // } else {
            //     throw new Error('无法找到登录按钮');
            // }

            await page.waitForNavigation();

            const isLoggedIn = await page.evaluate(() => {
                return document.querySelector('a[href="/logout/"]') !== null;
            });

            const nowUtc = formatToISO(new Date());
            const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000));

            if (isLoggedIn) {
                console.log(`账户${accountIndex} (${username}) - (${addr}) 于北京时间 ${nowBeijing} 登录成功！`);
                results.push(`账户${accountIndex} (${username}) - (${addr})  ✅ 登录成功`);
            } else {
                console.error(`账户${accountIndex} (${username}) - (${addr})  登录失败，请检查账号和密码是否正确。`);
                results.push(`账户${accountIndex} (${username}) - (${addr})  ❌ 登录失败`);
            }
        } catch (error) {
            console.error(`账户${accountIndex} (${username}) - (${addr})  登录时出现错误: ${error}`);
            results.push(`账户${accountIndex} (${username}) - (${addr})  ⚠️ 登录错误: ${error.message}`);
        } finally {
            await page.close();
            await browser.close();
            await delayTime(Math.floor(Math.random() * 5000) + 1000);
        }
    }

    console.log('所有账号登录完成！');

    // 所有账号登录完成后，发送汇总消息
    if (telegramToken && telegramChatId) {
        const summaryMessage = `✅ 北京时间 ${nowTime} 所有账号登录完成：\n\n${results.join('\n')}`;
        await sendTelegramMessage(telegramToken, telegramChatId, summaryMessage);
    }
})();

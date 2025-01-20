import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';
import pLimit from 'p-limit'; // 用于并发控制

// 格式化日期为 ISO 标准
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
    const data = { chat_id: chatId, text: message };

    let retryCount = 0;
    const maxRetries = 5;
    const retryDelay = 10000;

    while (retryCount <= maxRetries) {
        try {
            await axios.post(url, data);
            console.log('消息已发送到 Telegram');
            return;
        } catch (error) {
            retryCount++;
            if (retryCount > maxRetries) {
                console.error('已达到最大重试次数，消息发送失败。');
                return;
            }
            console.error(`消息发送失败，${retryDelay / 1000}秒后重试... (${retryCount}/${maxRetries})`);
            await delayTime(retryDelay);
        }
    }
}


async function connectSSH({ host, username, password }) {
    return new Promise((resolve, reject) => {
        const client = new Client();

        client.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
            console.log('Keyboard Interactive 身份验证触发');
            finish([password]); // 使用密码作为响应
        });

        client.on('ready', () => {
            console.log(成功登录到 ${host});
            
            const command = 'bash <(curl -s https://raw.githubusercontent.com/duanxinyua/socks5-for-serv00/main/check_cron.sh)';
            console.log(正在执行命令: ${command});
            
            client.exec(command, (err, stream) => {
                if (err) {
                    reject(SSH 执行命令失败: ${err.message});
                    client.end(); // 确保在错误情况下关闭连接
                    return;
                }
        
                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                });
        
                stream.on('close', (code, signal) => {
                    console.log(命令执行完成，退出代码: ${code}, 信号: ${signal});
                    console.log(命令输出: ${output});
                    client.end();
                    if (code === 0) {
                        resolve('保活成功！');
                    } else {
                        reject(命令执行失败，退出代码: ${code});
                    }
                });
        
                stream.stderr.on('data', (data) => {
                    console.error(命令错误输出: ${data});
                });
            });
        });


        client.on('error', (err) => {
            reject(SSH 连接出错: ${err.message});
        });

        client.on('end', () => {
            console.log(SSH 连接关闭: ${host});
        });

        client.connect({
            host,
            port: 22, // 默认端口，可以根据需要调整
            username,
            password,
            tryKeyboard: true, // 启用 Keyboard Interactive
        });
    });
}




// 处理单个账号
async function processAccount(account) {
    const { username, password, panel, addr, sshHost } = account;
    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const url = `https://${panel}/login/?next=/`;
    let messagePrefix = addr ? `${addr}-` : '';
    try {
        await page.goto(url);
        await page.type('#id_username', username);
        await page.type('#id_password', password);
        await Promise.all([
            page.click('#submit'),
            page.waitForNavigation()
        ]);

        const isLoggedIn = await page.evaluate(() => {
            const logoutButton = document.querySelector('a[href="/logout/"]');
            return logoutButton !== null;
        });

        if (isLoggedIn) {
            console.log(`账号 ${messagePrefix}${username} 登录成功！`);
            try {
                const result = await connectSSH({ host: sshHost, username, password });
                console.log(result);
                return `账号 ${messagePrefix}${username} 登录成功并保活成功。`;
            } catch (error) {
                console.error(`保活失败: ${error.message}`);
                return `账号 ${messagePrefix}${username} 登录成功，但保活失败。`;
            }
        } else {
            console.error(`账号 ${messagePrefix}${username} 登录失败。`);
            return `账号 ${messagePrefix}${username} 登录失败，请检查账号和密码是否正确。`;
        }
    } catch (error) {
        console.error(`账号 ${username} 登录时出现错误: ${error.message}`);
        return `账号 ${username} 登录时出现错误: ${error.message}`;
    } finally {
        await browser.close();
    }
}

// 主程序
(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    if (!telegramToken || !telegramChatId) {
        console.error('缺少必要的环境变量 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID');
        process.exit(1);
    }

    const limit = pLimit(50); // 最大并发数为 5
    const tasks = accounts.map(account => limit(() => processAccount(account)));
    const results = await Promise.all(tasks);

    // 获取当前时间
    const nowUtc = formatToISO(new Date());
    const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000));

    // 发送结果到 Telegram
    const finalMessage = `北京时间 ${nowBeijing}（UTC时间 ${nowUtc}）账号登录结果：\n` + results.join('\n');
    await sendTelegramMessage(telegramToken, telegramChatId, finalMessage);

    console.log('所有账号登录完成！');
})();

import { Client } from 'ssh2';
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pLimit from 'p-limit';
import { sendTelegramMessage, formatToISO } from './utils'; // 假设你有这个工具函数

// 连接 SSH 并执行命令
async function connectSSH({ ssh, username, password }) {
    return new Promise((resolve, reject) => {
        const client = new Client();

        client.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
            console.log('Keyboard Interactive 身份验证触发');
            finish([password]); // 使用密码作为响应
        });

        client.on('ready', () => {
            console.log(`成功登录到 ${ssh}`);
            
            const command = 'bash <(curl -s https://raw.githubusercontent.com/duanxinyua/socks5-for-serv00/main/check_cron.sh)';
            console.log(`正在执行命令: ${command}`);
            
            client.exec(command, (err, stream) => {
                if (err) {
                    reject(`SSH 执行命令失败: ${err.message}`);
                    client.end(); // 确保在错误情况下关闭连接
                    return;
                }
        
                let output = '';
                stream.on('data', (data) => {
                    output += data.toString();
                });
        
                stream.on('close', (code, signal) => {
                    console.log(`命令执行完成，退出代码: ${code}, 信号: ${signal}`);
                    console.log(`命令输出: ${output}`);
                    client.end();
                    if (code === 0) {
                        resolve('保活成功！');
                    } else {
                        reject(`命令执行失败，退出代码: ${code}`);
                    }
                });
        
                stream.stderr.on('data', (data) => {
                    console.error(`命令错误输出: ${data}`);
                });
            });
        });

        client.on('error', (err) => {
            reject(`SSH 连接出错: ${err.message}`);
        });

        client.on('end', () => {
            console.log(`SSH 连接关闭: ${ssh}`);
        });

        client.connect({
            host: ssh,
            port: 22, // 默认端口，可以根据需要调整
            username,
            password,
            tryKeyboard: true, // 启用 Keyboard Interactive
        });
    });
}

// 处理单个账号
async function processAccount(account) {
    const { username, password, panel, ssh, addr } = account;

    // 参数验证
    if (!username || !password || !ssh) {
        console.error(`账号信息不完整，缺少必需的字段: ${JSON.stringify(account)}`);
        return `账号信息不完整，无法处理账号: ${username}`;
    }

    const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
    const page = await browser.newPage();
    const url = `https://${panel}/login/?next=/`;
    let messagePrefix = addr ? `${addr}-` : '';

    try {
        // 打开登录页面并进行登录
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

            // 尝试连接 SSH 保活
            try {
                const result = await connectSSH({ ssh, username, password });
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

    // 确保必要的环境变量存在
    if (!telegramToken || !telegramChatId) {
        console.error('缺少必要的环境变量 TELEGRAM_BOT_TOKEN 或 TELEGRAM_CHAT_ID');
        process.exit(1);
    }

    const limit = pLimit(5); // 最大并发数为 5
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

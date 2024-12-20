import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2'; // 需要安装 ssh2 模块

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

    let retryCount = 0;
    const maxRetries = 5; // 最大重试次数
    const retryDelay = 10000; // 每次重试之间的延时（10秒）

    while (retryCount <= maxRetries) {
        try {
            const response = await axios.post(url, data);
            console.log('消息已发送到 Telegram');
            return; // 如果发送成功，退出函数
        } catch (error) {
            retryCount++;

            if (retryCount > maxRetries) {
                console.error('已达到最大重试次数，消息发送失败。');
                return;
            }

            if (error.response) {
                console.error('发送 Telegram 消息时出错:', error.response.status, error.response.data);
            } else if (error.request) {
                console.error('发送 Telegram 消息时出错:', error.request);
            } else {
                console.error('发送 Telegram 消息时出错:', error.message);
            }

            console.error(`消息发送失败，${retryDelay / 1000}秒后重试... (${retryCount}/${maxRetries})`);
            await delayTime(retryDelay); // 等待指定时间后重试
        }
    }
}

async function executeSSHCommand(host, username, password, command) {
    return new Promise((resolve, reject) => {
        const conn = new Client();
        let output = ''; // 用于收集命令输出

        conn
            .on('ready', () => {
                console.log(`SSH 已连接到 ${host}`);
                conn.exec(command, (err, stream) => {
                    if (err) {
                        conn.end();
                        return reject(`执行命令时出错: ${err.message}`);
                    }

                    stream
                        .on('close', (code, signal) => {
                            console.log(`命令执行完成，退出码: ${code}, 信号: ${signal}`);
                            conn.end();
                            resolve(output); // 返回完整的命令输出
                        })
                        .on('data', (data) => {
                            output += data.toString(); // 收集标准输出
                            console.log(`STDOUT: ${data}`);
                        })
                        .stderr.on('data', (data) => {
                            console.error(`STDERR: ${data}`);
                        });

                    // 模拟发送回车
                    setTimeout(() => stream.write('\n'), 1000);
                });
            })
            .on('error', (err) => {
                reject(`SSH 连接出错: ${err.message}`);
            })
            .connect({
                host,
                port: 22,
                username,
                password,
            });
    });
}

(async () => {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    const accounts = JSON.parse(fs.readFileSync(path.join(__dirname, '../accounts.json'), 'utf-8'));
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    const telegramChatId = process.env.TELEGRAM_CHAT_ID;

    let zhanghao = 0;
    let allLoginMessages = []; // 用来收集所有登录成功的信息

    // 获取当前时间
    const nowUtc = formatToISO(new Date());
    const nowBeijing = formatToISO(new Date(new Date().getTime() + 8 * 60 * 60 * 1000)); // 北京时间东8区

    for (const account of accounts) {
        const { username, password, panel, addr } = account;

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

            let messagePrefix = '';
            if (addr) {
                messagePrefix = `${addr}-`;
            }

            if (isLoggedIn) {
                zhanghao++;
                console.log(`${zhanghao} 账号 ${messagePrefix}${username} 登录成功！`);
                let loginMessage = `${zhanghao} 账号 ${messagePrefix}${username} 登录成功！`;

                // SSH 登录逻辑
                const sshHost = panel.replace('panel', 's');
                const command = 'bash <(curl -s https://raw.githubusercontent.com/kakluo/nezha-serv00/main/install-agent.sh)';
                console.log(`尝试通过 SSH 登录 ${sshHost} 并执行命令。`);

                try {
                    const sshOutput = await executeSSHCommand(sshHost, username, password, command);
                    if (sshOutput.includes('nezha-agent 已启动！')) {
                        loginMessage += ' 保活成功';
                    }
                    console.log(`命令已成功在 ${sshHost} 上执行。`);
                } catch (error) {
                    console.error(`SSH 登录或命令执行失败: ${error}`);
                }

                allLoginMessages.push(loginMessage); // 收集登录信息
            } else {
                zhanghao++;
                console.error(`${zhanghao} 账号 ${username} 登录失败，请检查账号和密码是否正确。`);
                const loginMessage = `${zhanghao} 账号 ${messagePrefix}${username} 登录失败，请检查账号和密码是否正确。`;
                allLoginMessages.push(loginMessage);
            }
        } catch (error) {
            console.error(`账号 ${username} 登录时出现错误: ${error}`);
            const errorMessage = `账号 ${username} 登录时出现错误: ${error.message}`;
            allLoginMessages.push(errorMessage);
        } finally {
            await page.close();
            await browser.close();

            const delay = Math.floor(Math.random() * 5000) + 1000;
            await delayTime(delay);
        }
    }

    // 发送所有的登录信息到 Telegram
    if (telegramToken && telegramChatId && allLoginMessages.length > 0) {
        const finalMessage = `北京时间 ${nowBeijing}（UTC时间 ${nowUtc}）账号登录结果：\n` + allLoginMessages.join('\n');
        await sendTelegramMessage(telegramToken, telegramChatId, finalMessage);
    }

    console.log('所有账号登录完成！');
})();

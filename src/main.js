import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';
import axios from 'axios';
import { fileURLToPath } from 'url';
import { Client } from 'ssh2';  // 引入 ssh2 库

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

async function connectSSH({ host, username, password }) {
    return new Promise((resolve, reject) => {
        const client = new Client();

        client.on('keyboard-interactive', (name, instructions, instructionsLang, prompts, finish) => {
            console.log('Keyboard Interactive 身份验证触发');
            finish([password]); // 使用密码作为响应
        });

        client.on('ready', () => {
            console.log(`成功登录到 ${host}`);
            client.exec('bash <(curl -s https://raw.githubusercontent.com/kakluo/nezha-serv00/main/install-agent.sh)', (err, stream) => {
                if (err) {
                    reject(`SSH 执行命令失败: ${err.message}`);
                    return;
                }

                let startTime = Date.now(); // 启动时间

                stream
                    .on('close', (code, signal) => {
                        console.log('命令执行完成');
                        client.end();
                        resolve('命令执行成功！');
                    })
                    .on('data', (data) => {
                        console.log('输出: ' + data.toString());

                        let retryCount = 0; // 记录重试次数
                        const maxRetries = 3; // 最大重试次数
                        const retryDelay = 5000; // 重试延时（5秒）
                        
                        // 定义一个定时器，每5秒执行一次
                        const interval = setInterval(() => {
                            if (retryCount < maxRetries) {
                                stream.write('\r'); // 模拟按下回车键
                                retryCount++; // 增加重试计数
                            }
                        
                            // 如果已重试三次，停止定时器
                            if (retryCount >= maxRetries) {
                                clearInterval(interval); // 停止定时器
                                client.end();
                                resolve('保活失败');
                            }

                            // 检查是否出现了启动成功的提示
                            if (data.includes('nezha-agent 已启动！')) {
                                console.log('保活成功！');
                                client.end();
                                clearInterval(interval); // 停止定时器
                                resolve('保活成功');
                            }
                            
                        }, retryDelay);


                    })
                    .stderr.on('data', (data) => {
                        console.error('错误输出: ' + data.toString());
                    });
            });
        });

        client.on('error', (err) => {
            reject(`SSH 连接出错: ${err.message}`);
        });

        client.on('end', () => {
            console.log(`SSH 连接关闭: ${host}`);
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

            // 判断 addr 是否存在，存在就加到消息内容前面
            let messagePrefix = '';
            if (addr) {
                messagePrefix = `${addr}-`;
            }

            if (isLoggedIn) {
                zhanghao++;
                console.log(`${zhanghao} 账号 ${messagePrefix}${username} 登录成功！`);
                const loginMessage = `${zhanghao} 账号 ${messagePrefix}${username} 登录成功！`;

                const sshHost = panel.replace('panel', 's'); // 替换 panel 为 s
                console.log(`尝试通过 SSH 登录 ${sshHost} 并执行命令。`);

                try {
                    const result = await connectSSH({
                        host: sshHost,
                        username,
                        password,
                    });
                    console.log(result);
                    allLoginMessages.push(loginMessage + ' 保活成功');
                } catch (error) {
                    console.error(`SSH 登录或命令执行失败: ${error}`);
                    allLoginMessages.push(loginMessage + ' 保活失败');
                }

            } else {
                zhanghao++;
                console.error(`${zhanghao} 账号 ${username} 登录失败，请检查账号和密码是否正确。`);
                const loginMessage = `${zhanghao} 账号 ${messagePrefix}${username} 登录失败，请检查账号和密码是否正确。`;
                allLoginMessages.push(loginMessage); // 收集失败信息
            }
        } catch (error) {
            console.error(`账号 ${username} 登录时出现错误: ${error}`);
            const errorMessage = `账号 ${username} 登录时出现错误: ${error.message}`;
            allLoginMessages.push(errorMessage); // 收集错误信息
        } finally {
            await page.close();
            await browser.close();

            // 模拟延时
            const delay = Math.floor(Math.random() * 5000) + 1000; // 随机延时1秒到5秒之间
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

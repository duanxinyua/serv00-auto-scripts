
<div align="center">
   <p><b>Serv00/CT8 - 免费主机自动续期脚本。</b></p>
   <p><b>2024年12月27日添加 SSH 保活 Socks5 和 哪吒监控和面板</b></p>
</div>

---

<div align="center">
    <a href="https://panel.serv00.com/">serv00 面板</a> | 
    <a href="https://www.serv00.com/">serv00 官网</a> | 
    <a href="https://docs.serv00.com/">serv00 文档</a> | 
    <a href="https://forum.serv00.com/">serv00 社区</a>
</div>

---

<div align="center">
    <a href="https://panel.ct8.pl/">CT8 面板</a> | 
    <a href="https://www.ct8.pl/">CT8 官网</a> | 
    <a href="https://wiki.mydevil.net/">CT8 文档</a> | 
    <a href="https://forum.ct8.pl/">CT8 社区</a>
</div>

---


## 使用方法

1. 在 GitHub 仓库中，进入右上角`Settings`

2. 在侧边栏找到`Secrets and variables`，点击展开选择`Actions`，点击`New repository secret`
    
3. 然后[创建](https://lopins.github.io/serv00-auto-scripts/)一个名为`ACCOUNTS_JSON`的`Secret`，将 JSON 格式的账号密码字符串作为它的值，如下格式：  

``` json
[
  { "username": "d***a", "password": "s***#i",  "panel": "panel13.serv00.com", "ssh": "s13.serv00.com", "addr": "波兰" }, 
  { "username": "n***j", "password": "1****D",  "panel": "panel14.serv00.com", "ssh": "s14.serv00.com", "addr": "美国" }, 
  { "username": "y***p", "password": "y*@Hpg",  "panel": "panel14.serv00.com", "ssh": "s14.serv00.com", "addr": "澳大利亚" },  
  { "username": "b***d", "password": "fJ!**6",  "panel": "panel14.serv00.com", "ssh": "s14.serv00.com", "addr": "波兰" }
]
```

> 其中`panel`参数为面板域名，即为你所收到注册邮件的`panel*.serv00.com`值。

4. **非必须** 创建Telegram 机器人两个参数的 `Secret`：`TELEGRAM_BOT_TOKEN` 和  `TELEGRAM_CHAT_ID`；addr我填写备注，如果发送TG消息会带有这个参数，可为空。

## SSH登录不上

> 登录不上是因为Ban IP, 点击此处解锁： [Ban](https://www.serv00.com/ip_unban/)


## TG机器人

### 创建 Telegram Bot 并获取 Chat ID

#### 步骤 1: 创建 `Telegram Bot`

1. **打开 `Telegram` 应用**：

   - 打开你的 `Telegram` 应用程序。

2. **搜索 `BotFather`**：

   - 在搜索栏中搜索 `@BotFather` 并点击进入。

3. **创建新机器人**：

   - 发送 `/start` 命令启动 BotFather。
   - 发送 `/newbot` 命令创建一个新的机器人。
   - 按照提示输入机器人的名称（可以是你喜欢的任何名称）。
   - 输入机器人的用户名（必须以 `bot` 结尾，例如 `MyBotNameBot`）。
   - BotFather 会生成一个 API token 并提供给你。请保存这个 token，后续会用到。

#### 步骤 2: 获取 Chat ID

为了能够向特定的用户或群组发送消息，你需要知道他们的 `Chat ID`。你可以通过创建一个简单的 `Telegram Bot` 来获取 `Chat ID`。

1. **创建一个简单的 Bot**：

   - 使用你刚刚生成的 `API token` 创建一个简单的 `Bot`。

2. **设置 Webhook 或轮询**：

   - 你可以选择设置 `Webhook` 或使用轮询来接收消息。这里我们使用轮询方式。

3. **获取 Chat ID**：

   - 当用户发送消息给你的 `Bot` 时，你可以从消息中提取 `Chat ID`。

require('dotenv').config()
const { 
    searchProtocolForSymbol, 
    searchProtocolForName, 
    compareProtocolAToProtocolB,
    getFirstTVLProtocolsChart,
} = require('./app.js')
const { Bot, session, InputFile } = require("grammy");
const { Menu } = require("@grammyjs/menu");
const { conversations, createConversation } = require("@grammyjs/conversations");

const bot = new Bot(process.env.TELEGRAM_API);
const chartType = {
    1: "bar",
    2: "doughnut",
    3: "pie",
}

bot.use(session({
    initial() {
        return {};
    },
}));
bot.use(conversations());
bot.use(createConversation(searchProtocol));
bot.use(createConversation(compareProtocols));
bot.use(createConversation(getFirstTVLChart));

const menu = new Menu("main-menu", { autoAnswer: false })
  .text("🔎 Search Protocol", async (ctx) => await ctx.conversation.enter("searchProtocol")).row()
  .text("➗ Make a comparison", async (ctx) => await ctx.conversation.enter("compareProtocols")).row()
  .text("🏆 Get Chart #1", async (ctx) => await ctx.conversation.enter("getFirstTVLChart")).row()
  .text("📈 Get Chart #2", async (ctx) => searchForSymbol(ctx)).row()
  .text("💎 Get Chart #3", async (ctx) => searchForSymbol(ctx))

bot.use(menu);

async function showMenu(ctx) {
    await ctx.reply(
        `Please chose an option from the menu:\n\n`+
        `🔎 Search a DeFi protocol\n`+
        `➗ Get price of protocol A with \nmcap/tvl ratio of protocol B\n`+
        `🏆 Get top n protocols for TVL\n`+
        `📈 Get top n performers/losers of last day/week\n`+
        `💎 Get top n protocols with best \nmcap/tvl or fdv/tvl weighting mcap/fdv\n`,
        { reply_markup: menu }
    );
}

function getSingleInfo(name, data, ratio) {
    if (data) {
        if (!ratio) {
            return `<b>${name}</b>:     ${parseInt(data).toLocaleString('en-US')}$\n`;
        } else {
            return `<b>${name}</b>:     ${(data).toFixed(2)}\n`;
        }
    } else {
        return ""
    }
}

async function printInfoProtocol(ctx, protocol) {
    await ctx.reply(
        `<a href="${protocol.logo}"><b>${protocol.name}</b> (${protocol.symbol})</a>\n\n`+

        getSingleInfo("TVL", protocol.tvl, false) +
        getSingleInfo("FDV", protocol.fdv, false) +
        getSingleInfo("Mcap", protocol.mcap, false) +

        getSingleInfo("\nMcap / TVL", protocol.mcap / protocol.tvl, true) +
        getSingleInfo("FDV / TVL", protocol.fdv / protocol.tvl, true) +
        getSingleInfo("Mcap / FDV", protocol.mcap / protocol.fdv, true) +

        `\n<a href="${protocol.url}">Website link</a>\n` +
        `<a href="https://www.coingecko.com/en/coins/${protocol.gecko_id}">CoinGecko link</a>`,

        { parse_mode: "HTML" }
    );
}

async function searchWithRightFunction(msg) {
    let result;
    if (msg.startsWith("$")) {
        result = await searchProtocolForSymbol(msg.substring(1));
    }
    else {
        result = await searchProtocolForName(msg);
    }
    return result
}

async function checkIfProtocolFound(result, conversation, ctx) {
    if (result.length > 1) {
        await ctx.reply("❗ They found more than one result. Please reply with a number (1, 2, 69420, ...):");
        await ctx.reply(result.map((r, i) => `${i + 1} - ${r.name}`).join("\n"));
        let ok = true
        do {
            const { message } = await conversation.wait();
            const index = parseInt(message.text) - 1;
            if (index >= 0 && index < result.length) {
                ok = true;
                return result[index];
            } else {
                ok = false
                index+1 == 69420 ? 
                    await ctx.reply("😐 LOL that was a joke man, be serious please.") : 
                    await ctx.reply("😡 Invalid number, try again.");
            }
        } while(!ok)
    } else {            
        if (result.length > 0) {
            return result[0];
        }
    }
}

async function tryFindingProtocolOrCancel(conversation, ctx) {
    let ok = true
    let protocol = undefined
    do {
        const { message } = await conversation.wait();
        if (message.text == "/cancel") {
            ok = true
        }
        else {
            await ctx.reply("🦙 Asking to Llamas...");
            let result = await searchWithRightFunction(message.text);
            protocol = await checkIfProtocolFound(result, conversation, ctx);
            if (protocol) {
                ok = true
            } else {
                ctx.reply("🥲 Whoops! No results found. Try again or press /cancel to abort.");
                ok = false
            }
        }
    } while(!ok)
    return protocol
}

async function searchProtocol(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply("📝 Send the name (ex: Trader Joe) or the symbol with dollar (ex: $JOE):");
    let protocol = await tryFindingProtocolOrCancel(conversation, ctx) 
    if (protocol) await printInfoProtocol(ctx, protocol)
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

// TODO: CHECK IF PROTOCOL_A RESPONSE IS /CANCEL
async function compareProtocols(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply("📝 Send the name (or symbol) of the first protocol");
    let protocolA = await tryFindingProtocolOrCancel(conversation, ctx)
    if (protocolA) {
        await ctx.reply("📝 Send the name (or symbol) of the second protocol");
        let protocolB = await tryFindingProtocolOrCancel(conversation, ctx)
        if (protocolB) {
            let result = await compareProtocolAToProtocolB(protocolA, protocolB)
            await ctx.reply("🤯 Making big maths...");
            await ctx.reply(
                `✅ TADAA!\n\n`+
                `The new price of ${protocolA.name} is <b>${result[0].toFixed(4)}$</b>\n` +
                `That's a <b>x${result[1].toFixed(3)}</b>! ${result[1].toFixed(3)>1 ? "GREAT!" : "SAD STORY..."}`,
                { parse_mode: "HTML" }
            );
        }
    }
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

async function getFirstTVLChart(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply(
        "❓ How many protocols do you want?\n\n"+
        "Send a number between 10 and 50."
    );
    const { message } = await conversation.wait();
    const number = parseInt(message.text);
    if (number >= 10 && number <= 50) {
        await ctx.reply(
            "🥸 Chose the type of the chart:\n\n"+
            "1 - 📊 Bar\n"+
            "2 - 🍩 Doughnut\n"+
            "3 - 🥧 Pie\n"
        );
        const { message } = await conversation.wait();
        const type = parseInt(message.text);
        if (type >= 1 && type <= 3) {
            await ctx.reply("📊 Building your nice chart...");
            let data = await getFirstTVLProtocolsChart(number, chartType[type]);
            // data = data.split(",")[1];
            // console.log(data)
            // let buffer = Buffer.from(data, "base64");
            // cut data from ,
            ctx.replyWithPhoto( new InputFile(data) )
            // bot.api.sendPhoto(message.chat.id, data)
        }
    }
}

bot.command("start", async (ctx) => await ctx.reply(
    "🦙 Welcome to DefiLlamaBot!\n\nTo use the bot, press /menu"
));
bot.command("menu", async (ctx) => await showMenu(ctx) );

bot.api.setMyCommands([
    { command: "menu", description: "Show the main menu" },
])

bot.start();

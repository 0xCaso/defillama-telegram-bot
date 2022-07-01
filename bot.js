require('dotenv').config()

const { 
    searchProtocolForSymbol, 
    searchProtocolForName, 
    compareProtocolAToProtocolB,
    getFirstTVLProtocolsChart,
    getTopPerformersChart,
    getBestRatioChart,
} = require('./utils.js')
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
bot.use(createConversation(getPerformersChart));
bot.use(createConversation(getRatioChart));

const menu = new Menu("main-menu", { autoAnswer: false })
  .text("🔎 Search Protocol", async (ctx) => await ctx.conversation.enter("searchProtocol")).row()
  .text("➗ Make a comparison", async (ctx) => await ctx.conversation.enter("compareProtocols")).row()
  .text("🏆 Get Chart #1", async (ctx) => await ctx.conversation.enter("getFirstTVLChart")).row()
  .text("📈 Get Chart #2", async (ctx) => await ctx.conversation.enter("getPerformersChart")).row()
  .text("💎 Get Chart #3", async (ctx) => await ctx.conversation.enter("getRatioChart"))

bot.use(menu);

async function showMenu(ctx) {
    await ctx.reply(
        `Please chose an option from the menu:\n\n`+
        `🔎 Search a DeFi protocol\n`+
        `➗ Get price of protocol A with \nmcap/tvl ratio of protocol B\n`+
        `🏆 Get top n protocols for TVL\n`+
        `📈 Get top n performers/losers of last day/week\n`+
        `💎 Get top n protocols with best \nmcap/tvl or fdv/tvl weighing mcap/fdv\n`,
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
                await ctx.reply("🥲 Whoops! No results found. Try again or press /cancel to abort.");
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

async function getNumberOrCancel(condition, conversation, ctx) {
    let ok = true
    let number = undefined
    do {
        const { message } = await conversation.wait();
        if (message.text == "/cancel") {
            ok = true
        }
        else {
            number = parseInt(message.text)
            if (condition(number)) {
                ok = true
            } else {
                await ctx.reply("🥲 Invalid number, try again or press /cancel to abort.");
                ok = false
            }
        }
    } while(!ok)
    return number
}

async function getFirstTVLChart(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply(
        "❓ How many protocols do you want in the chart?\n\n"+
        "Send a number between 10 and 50."
    );
    let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
    if (topN) {
        await ctx.reply(
            "🥸 Chose the type of the chart:\n\n"+
            "1 - 📊 Bar\n"+
            "2 - 🍩 Doughnut\n"+
            "3 - 🥧 Pie\n"
        );
        let type = await getNumberOrCancel(number => number >= 1 && number <= 3, conversation, ctx)
        if (type) {
            await ctx.reply("🖌️ Drawing your nice chart...");
            let buffer = await getFirstTVLProtocolsChart(topN, chartType[type]);
            await ctx.replyWithPhoto(new InputFile(buffer))
        }
    }
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

async function getPerformersChart(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply(
        "❓ Do you wanna consider top 50 or top 100 protools?\n\n"+
        "Send 50 or 100."
    );
    let firstN = await getNumberOrCancel(number => number == 50 || number == 100, conversation, ctx)
    if (firstN) {
        await ctx.reply(
            "❓ How many protocols do you want in the chart?\n\n"+
            "Send a number between 10 and 50."
        );
        let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
        if (topN) {
            await ctx.reply(
                "❓ Do you want the best or the worst performers?\n\n"+
                "Send 1 for best, 2 for worst."
            );
            let best = await getNumberOrCancel(number => number == 1 || number == 2, conversation, ctx)
            if (best) {
                best == 1 ? best = true : best = false
                await ctx.reply(
                    "❓ Do you wanna consider last day or week?\n\n"+
                    "Send 1 for day, 2 for week."
                );
                let day = await getNumberOrCancel(number => number == 1 || number == 2, conversation, ctx)
                if (day) {
                    day == 1 ? day = true : day = false
                    await ctx.reply(
                        "🥸 Chose the type of the chart:\n\n"+
                        "1 - 📊 Bar\n"+
                        "2 - 🍩 Doughnut\n"+
                        "3 - 🥧 Pie\n"
                    );
                    let type = await getNumberOrCancel(number => number >= 1 && number <= 3, conversation, ctx)
                    if (type) {
                        await ctx.reply("🖌️ Drawing your nice chart...");
                        let buffer = await getTopPerformersChart(firstN, topN, best, day, chartType[type]);
                        await ctx.replyWithPhoto(new InputFile(buffer))
                    }
                }
            }
        }
    }
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

async function getRatioChart(conversation, ctx) {
    await ctx.deleteMessage();
    await ctx.reply(
        "❓ Do you wanna consider top 50 or top 100 protools?\n\n"+
        "Send 50 or 100."
    );
    let firstN = await getNumberOrCancel(number => number == 50 || number == 100, conversation, ctx)
    if (firstN) {
        await ctx.reply(
            "❓ How many protocols do you want?\n\n"+
            "Send a number between 10 and 50."
        );
        let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
        if (topN) {
            await ctx.reply(
                "❓ Do you wanna consider Mcap or FDV?\n\n"+
                "Send 1 for Mcap, 2 for FDV."
            );
            let mcap = await getNumberOrCancel(number => number == 1 || number == 2, conversation, ctx)
            if (mcap) {
                mcap == 1 ? mcap = true : mcap = false
                await ctx.reply("🖌️ Drawing your nice chart...");
                let buffer = await getBestRatioChart(firstN, topN, mcap);
                await ctx.replyWithPhoto(new InputFile(buffer))
            }
        }
    }
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

bot.command("start", async (ctx) => await ctx.reply(
    "🦙 Welcome to DefiLlamaBot!\n\nTo use the bot, press /menu"
));
bot.command("menu", async (ctx) => await showMenu(ctx) );

bot.api.setMyCommands([
    { command: "menu", description: "Show the main menu" },
])

bot.start();

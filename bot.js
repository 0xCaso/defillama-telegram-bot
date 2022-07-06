require('dotenv').config()

const { 
    searchProtocolForSymbol, 
    searchProtocolForName, 
    compareProtocolAToProtocolB,
    getFirstTVLProtocolsChart,
    getTopPerformersChart,
    getBestRatioChart,
} = require('./utils.js')
const { Bot, session, InputFile, Keyboard } = require("grammy");
const { Menu } = require("@grammyjs/menu");
const { conversations, createConversation } = require("@grammyjs/conversations");

const bot = new Bot(process.env.TELEGRAM_API);
const chartType = {
    1: "bar",
    2: "doughnut",
    3: "pie",
}

// commandHistory value is wrapped in an object
// because of a conversation plugin bugged
bot.use(session({
    initial() {
        return {
            commandHistory: { value: [] }
        };
    },
}));

bot.use(conversations());

bot.use(createConversation(deleteHistory));
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

async function showHistory(ctx) {
    await ctx.reply(
        `<b>Command history:</b>\n`+
        `${ctx.session.commandHistory.value}`,
        { parse_mode: "HTML" }
    );
}

async function deleteHistory(conversation, ctx) {
    await replyWithKeyboard(
        ctx, 
        "Are you sure you want to delete the history?", 
        new Keyboard().text("Yes").text("No")
    )
    const { message } = await conversation.wait();
    if (message.text == "Yes") {
        ctx.session.commandHistory.value = [];
        await ctx.reply("History cleaned ✅");
    }
    else {
        await ctx.reply("History not cleaned 🏳️");
    }
    return
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
        const results = result.map((r, i) => `${i + 1} - ${r.name}`).join("\n")
        const numbers = new Keyboard()
        result.map((r,i) => {
            numbers.text(`${i + 1}`)
            if ((i+1) % 4 == 0) numbers.row()
        })
        await ctx.reply(results,{
            reply_markup: {
                one_time_keyboard: true,
                keyboard: numbers.build(),
            }
        });
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
    if (protocol) {
        await printInfoProtocol(ctx, protocol)
        ctx.session.commandHistory.value.push("/search-protocol " + protocol.name + "\n")
    }
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
            await ctx.reply("🤯 Making big maths...");
            let result = await compareProtocolAToProtocolB(protocolA, protocolB)
            if (result[0] && result[1]) {
                await ctx.reply(
                    `✅ TADAA!\n\n`+
                    `The new price of ${protocolA.name} is <b>${result[0].toFixed(4)}$</b>\n` +
                    `That's a <b>x${result[1].toFixed(3)}</b>! ${result[1].toFixed(3)>1 ? "GREAT!" : "SAD STORY..."}`,
                    { parse_mode: "HTML" }
                );
            }
            else {
                await ctx.reply("🥲 Ooops, something went wrong. Probably we couldn't find the price of one of the protocols.");
            }
        }
    }
    await ctx.reply("That's it! Press /menu to do something else");
    return;
}

async function getNumberOrCancel(condition, conversation, ctx) {
    let ok = true
    let number = undefined
    let canceled = false
    do {
        const { message } = await conversation.wait();
        if (message.text == "/cancel") {
            ok = true
            canceled = true
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
    if (!canceled)
        return number
}

async function replyWithKeyboard(ctx, question, keyboard) {
    await ctx.reply(question,{
        reply_markup: {
            one_time_keyboard: true,
            keyboard: keyboard.build(),
        }
    });
}

async function getFirstTVLChart(conversation, ctx) {
    await ctx.deleteMessage();
    const question = 
        "❓ How many protocols do you want in the chart?\n\n"+
        "Send a number between 10 and 50."
    const numberKeyboard = new Keyboard()
        .text("10").text("15").text("20").row()
        .text("25").text("30").text("35").row()
        .text("40").text("45").text("50")
    await replyWithKeyboard(ctx, question, numberKeyboard)
    let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
    if (topN) {
        const question = 
            "🥸 Chose the type of the chart:\n\n"+
            "1 - 📊 Bar\n"+
            "2 - 🍩 Doughnut\n"+
            "3 - 🥧 Pie\n"
        const numberKeyboard = new Keyboard()
            .text("1").text("2").text("3")
        await replyWithKeyboard(ctx, question, numberKeyboard)
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
    const question =
        "❓ Do you wanna consider top 50 or top 100 protools?\n\n"+
        "Send 50 or 100."
    const numberKeyboard = new Keyboard()
        .text("50").text("100")
    await replyWithKeyboard(ctx, question, numberKeyboard)
    let firstN = await getNumberOrCancel(number => number == 50 || number == 100, conversation, ctx)
    if (firstN) {
        const question = 
            "❓ How many protocols do you want in the chart?\n\n"+
            "Send a number between 10 and 50."
        const numberKeyboard = new Keyboard()
            .text("10").text("15").text("20").row()
            .text("25").text("30").text("35").row()
            .text("40").text("45").text("50")
        await replyWithKeyboard(ctx, question, numberKeyboard)
        let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
        if (topN) {
            const question =
                "❓ Do you want the best or the worst performers?\n\n"+
                "Send 1 for best, 2 for worst."
            const numberKeyboard = new Keyboard()
                .text("1 - Best").text("2 - Worst")
            await replyWithKeyboard(ctx, question, numberKeyboard)
            let best = await getNumberOrCancel(number => number == 1 || number == 2, conversation, ctx)
            if (best) {
                best == 1 ? best = true : best = false
                const question =
                    "❓ Do you wanna consider last day or week?\n\n"+
                    "Send 1 for day, 2 for week."
                const numberKeyboard = new Keyboard()
                    .text("1 - Day").text("2 - Week")
                await replyWithKeyboard(ctx, question, numberKeyboard)
                let day = await getNumberOrCancel(number => number == 1 || number == 2, conversation, ctx)
                if (day) {
                    day == 1 ? day = true : day = false
                    const question = 
                        "🥸 Chose the type of the chart:\n\n"+
                        "1 - 📊 Bar\n"+
                        "2 - 🍩 Doughnut\n"+
                        "3 - 🥧 Pie\n"
                    const numberKeyboard = new Keyboard()
                        .text("1").text("2").text("3")
                    await replyWithKeyboard(ctx, question, numberKeyboard)
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
    const question =
        "❓ Do you wanna consider top 50 or top 100 protools?\n\n"+
        "Send 50 or 100."
    const numberKeyboard = new Keyboard()
        .text("50").text("100")
    await replyWithKeyboard(ctx, question, numberKeyboard)
    let firstN = await getNumberOrCancel(number => number == 50 || number == 100, conversation, ctx)
    if (firstN) {
        const question = 
            "❓ How many protocols do you want in the chart?\n\n"+
            "Send a number between 10 and 50."
        const numberKeyboard = new Keyboard()
            .text("10").text("15").text("20").row()
            .text("25").text("30").text("35").row()
            .text("40").text("45").text("50")
        await replyWithKeyboard(ctx, question, numberKeyboard)
        let topN = await getNumberOrCancel(number => number >= 10 && number <= 50, conversation, ctx)
        if (topN) {
            const question =
                "❓ Do you wanna consider Mcap or FDV?\n\n"+
                "Send 1 for Mcap, 2 for FDV."
            const numberKeyboard = new Keyboard()
                .text("1 - Mcap").text("2 - FDV")
            await replyWithKeyboard(ctx, question, numberKeyboard)
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
bot.command("history", async (ctx) => await showHistory(ctx) );
bot.command("deleteHistory", async (ctx) => await ctx.conversation.enter("deleteHistory") );

bot.api.setMyCommands([
    { command: "menu", description: "Show the main menu" },
])

bot.start();

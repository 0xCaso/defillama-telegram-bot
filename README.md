# DefiLlama Telegram Bot
A bot that you can use to interact with DefiLlama from Telegram. To find it on Telegram, literally search for 'DefiLlamaBot'.

![Preview](https://github.com/0xCaos/defillama-telegram-bot/blob/main/defillama_bot.gif)  

## What can you do with this bot?
You can do some nice things, such as:
- search for a protocol listed in DefiLlama
- compare two protocols, watching the MCAP/TVL ratio
- see the price that a protocol could have had when its TVL was at ATH, if MCAP was equal to TVL
- get a chart of the first N protocols for TVL
- get a chart of the first N performers or losers, of the last day or week
- get a chart with the protocols with highest potential, evaluating MCAP, FDV and TVL  

You can interact with the bot using the `/menu` command, from which you can fire all the commands.  
You can also use the command `/info` to get better explainations about the logic behind the stats you can get.  
If you're interested about the (not complex) math used for the charts and comparisons, look inside `utils.js`.

## Acknowledgments
I would like to say thank you to DefiLlama team (free APIs are nice eheh) and to grammY's (Telegram Bot Framework) community which helped me in their Telegram group, saving me a lot of time for real.

## Contributions
If you would like to see new features for this bot, feel free to open an issue or a pull request here, or write me on Twitter [(0xCaso)](https://twitter.com/0xCaso).  
For local dev, just pull the repo, `npm install` and setup the `.env` file with the variables used inside `bot.js`. Then fire `node bot.js` and enjoy.

Useful links:  
[DefiLlama API](https://defillama.com/docs/api)  
[grammY docs](https://grammy.dev/)  
[Chart.js docs](https://www.chartjs.org/docs/latest/)  

const ethers = require('ethers');
require('dotenv').config()
const Telegraf = require('telegraf').Telegraf;

const bot = new Telegraf('YOUR API TOKEN GOES HERE');

/*
	============
	STARTING BOT
	============
*/

bot.start((context) => {
	console.log('Bot started.')
	context.reply('Bot started...')
})

bot.launch()

/*
	=========================
	====  AUX FUNCTIONS  ====
	=========================
*/

function getDate() {
  var today = new Date();
  var date = today.getDate()+'-'+(today.getMonth()+1)+'-'+today.getFullYear();
  var time = today.getHours() + ":" + today.getMinutes() + ":" + today.getSeconds();
  var dateTime = date+' '+time;

  return dateTime;
}
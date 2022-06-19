require('dotenv').config()
const axios = require('axios').default;
const fs = require('fs').promises;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');

const width = 800
const height = 800
const backgroundColour = 'white'

async function createAndSaveChart(_result, _title, _type, _fileName) {
    let colors = getRandomColors(_result[0].length)
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour})
    const data = {
        labels: _result[0],
        datasets: [{
            label: _title,
            data: _result[1],
            backgroundColor: colors,
            hoverOffset: 4
        }]
    }
    const config = {
        type: _type,
        data: data,
    }
    const buffer = await chartJSNodeCanvas.renderToBuffer(config)
    await fs.writeFile('./charts/'+_fileName+'.png', buffer, 'base64')
}

function getRandomColors(_n) {
    let colors = [];
    for(i = 0; i < _n; ++i) {
        var letters = '0123456789ABCDEF';
        var color = '#';
        for (j = 0; j < 6; ++j) {
            color += letters[Math.floor(Math.random() * 16)];
        }
        colors[i] = color
    }
    return colors;
}

async function getProtocols() {
    let response = await axios.get('https://api.llama.fi/protocols')
    let protocols = response.data;
    return protocols
}

async function getFirstTVLProtocols(_n) {
    let _apiLabels, _apiData
    let totalTvl = 0
    let protocols = await getProtocols();
    protocols.forEach(protocol => {
        totalTvl += protocol.tvl
    })
    let selected = protocols.slice(0, _n)
    _apiLabels = selected.map(p => p.name)
    _apiData = selected.map(p => p.tvl)
    return [_apiLabels, _apiData]
}

async function getBestOrWorseOfFirstNTVL_LastDayOrWeek(_n, _firstN, _best, _day) {
    let _apiLabels, _apiData
    let protocols = await getProtocols();
    let change
    _day ? change = "change_1d" : change = "change_7d"
    protocols = protocols.filter(p => p[change] != null)
    let selected = protocols.slice(0, _firstN)
    _best ?
        selected = selected.sort((a, b) => b[change] - a[change])
    :
        selected = selected.sort((a, b) => a[change] - b[change])  
    selected = selected.slice(0, _n)
    _apiLabels = selected.map(p => p.name)
    _apiData = selected.map(p => p[change])
    return [_apiLabels, _apiData]
}

async function compareProtocolAToProtocolB(_protocolA, _protocolB) {
    let protocols = await getProtocols();
    let protocolAData = protocols.find(p => p.name == _protocolA)
    let protocolBData = protocols.find(p => p.name == _protocolB)
    // take data
    const tokenAMcap = protocolAData.mcap
    const tokenBMcap = protocolBData.mcap
    const tokenATvl = protocolAData.tvl
    const tokenBTvl = protocolBData.tvl
    // take price of protocol A from coingecko
    let response = await axios.get(`https://api.coingecko.com/api/v3/simple/price?ids=${protocolAData.gecko_id}&vs_currencies=usd`)
    const tokenAPrice = response.data[protocolAData.gecko_id].usd
    // calculate change in price and percentage change
    const tokenBMcapTvl = tokenBMcap / tokenBTvl
    const tokenACirculating = tokenAMcap / tokenAPrice
    const tokenAPriceWithTokenBMcapTvl = (tokenBMcapTvl * tokenATvl) / tokenACirculating
    const tokenAPriceChange = tokenAPriceWithTokenBMcapTvl / tokenAPrice
    return [tokenAPriceWithTokenBMcapTvl, tokenAPriceChange]
}

async function getFirstNTVLWithBestRatio(n, firstN, ratio) {
    let _apiLabels, _apiData, num, den
    let protocols = await getProtocols();
    protocols = protocols.filter(p => p.fdv != 0 && p.mcap != 0 && p.tvl != 0)
    let selected = protocols.slice(0, firstN)
    if (ratio == 0) {
        num = "mcap"
        den = "tvl"
        selected = selected.sort((a, b) => a[num] / a[den] - b[num] / b[den])
    } else if (ratio == 1) {
        num = "fdv"
        den = "tvl"
        selected = selected.sort((a, b) => a[num] / a[den] - b[num] / b[den])
    } else {
        num = "mcap"
        den = "fdv"
        selected = selected.sort((a, b) => b[num] / b[den] - a[num] / a[den])
    }
    selected = selected.slice(0, n)
    _apiLabels = selected.map(p => p.name)
    _apiData = selected.map(p => p[num] / p[den])
    return [_apiLabels, _apiData]
}

async function main() {
    // n will be equal to 10 or 20 --> selected from firstN protocols
    // firstN will be equal to 50 or 100
    // best = true --> top performers, false --> top losers
    // day = true --> last day, false --> last week
    // ratio = 0 --> mcap/tvl, 1 --> fdv/tvl, 2 --> mcap/fdv
    const n = 20
    const firstN = 100
    const best = true
    const day = false
    const ratio = 0
    const type = "bar"
    // -----------------------------
    // const result = await getFirstTVLProtocols(n)
    // const title = `Top ${n} protocols for TVL`
    // const fileName = "top_"+n+"_protocols_tvl_"+type
    // -----------------------------
    // const result = await getBestOrWorseOfFirstNTVL_LastDayOrWeek(n, firstN, best, day)
    // const title = `First ${n} ${best ? "best" : "worse"} performers in top ${firstN} protocols for TVL of ${day ? "last day" : "last week"}`
    // const fileName = `top_${n}_${best ? "best" : "worse"}_performers_${day ? "last_day" : "last_week"}`
    // -----------------------------
    const result = await getFirstNTVLWithBestRatio(n, firstN, ratio)
    const title = `First ${n} in top ${firstN} protocols with best ${ratio == 0 ? "mcap/tvl" : ratio == 1 ? "fdv/tvl" : "mcap/fdv"} ratio`
    const fileName = `top_${n}_protocols_${ratio == 0 ? "mcap_tvl" : ratio == 1 ? "fdv_tvl" : "mcap_fdv"}`
    // -----------------------------
    await createAndSaveChart(result, title, type, fileName)
    // -----------------------------
    // const result = await compareProtocolAToProtocolB("MakerDAO", "Curve")
    // console.log(result[0])
    // console.log(result[1])
}

main()
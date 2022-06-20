require('dotenv').config()
const axios = require('axios').default;
const fs = require('fs').promises;
const { ChartJSNodeCanvas } = require('chartjs-node-canvas');
const { Chart } = require('chart.js');
const ChartDataLabels = require('chartjs-plugin-datalabels');

const width = 800
const height = 800
const backgroundColour = 'white'
const bubbleChartOptions = {
    plugins: {
        datalabels: {
            color: function(context) {
                return 'black';
            },
            font: {
                weight: 'bold'
            },
            formatter: function(value) {
                return value[3]
            },
            offset: 2,
            padding: 0
        }
    },

    // Core options
    layout: {
        padding: 16
    },
}


async function createAndSaveChart(_result, _title, _type, _fileName) {
    let config, data
    let colors = getColors(_result[0].length)
    const chartJSNodeCanvas = new ChartJSNodeCanvas({ width, height, backgroundColour})
    console.log(_result)
    if (_type != "bubble") {
        data = {
            labels: _result[0],
            datasets: [{
                label: _title,
                data: _result[1],
                backgroundColor: colors,
                hoverOffset: 4
            }]
        }
        config = {
            type: _type,
            data: data,
        }
    } else {
        Chart.register(ChartDataLabels)
        data = {
            datasets: [{
                label: _title,
                data: _result,
                backgroundColor: colors,
            }]
        }
        config = {
            type: _type,
            data: data,
            options: bubbleChartOptions
        }
    }
    const buffer = await chartJSNodeCanvas.renderToBuffer(config)
    await fs.writeFile('./charts/'+_fileName+'.png', buffer, 'base64')
}

function getColors(_n) {
    const COLORS = [
        '#4dc9f6',
        '#f67019',
        '#f53794',
        '#537bc4',
        '#acc236',
        '#166a8f',
        '#00a950',
        '#58595b',
        '#8549ba'
    ];
    let colors = [];
    for(i = 0; i < _n; ++i) {
       colors.push(COLORS[i % COLORS.length])
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

async function getFirstNTVLWithBestRatio(_n, _firstN, _mcap) {
    let x, y, r, label, num, den
    let protocols = await getProtocols();
    protocols = protocols.filter(p => p.fdv != 0 && p.mcap != 0 && p.tvl != 0)
    let selected = protocols.slice(0, _firstN)
    _mcap ? ( num = "mcap", den = "tvl" ) : ( num = "fdv", den = "tvl" )
    selected = selected.sort((a, b) => a[num] / a[den] - b[num] / b[den])
    selected = selected.slice(0, _n)
    let data = []
    selected.forEach(p => {
        // lower ratio = better protocol --> we must inverse
        x = (p[num] / p[den])*-1
        // higher ratio = better protocol --> no inverse
        y = p["mcap"] / p["fdv"]
        // lower market cap = better protocol --> we must normalize
        // TODO: normalize values
        r = p["mcap"] / 10**7
        label = p.name
        data.push([x,y,r,label])
    })
    return data
}

async function searchProtocolForName(_name) {
    let protocols = await getProtocols();
    let protocol = protocols.filter(
        p => p.name
                .toLowerCase()
                .replace(" ","")
                .includes(
                    _name
                    .toLowerCase()
                    .replace(" ","")
                )
    )
    return protocol
}

async function searchProtocolForSymbol(_symbol) {
    let protocols = await getProtocols();
    let protocol = protocols.filter(p => p.symbol.toLowerCase().includes(_symbol.toLowerCase()))
    return protocol
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
    const mcap = false
    // -----------------------------
    // const type = "bar"
    // const result = await getFirstTVLProtocols(n)
    // const title = `Top ${n} protocols for TVL`
    // const fileName = "top_"+n+"_protocols_tvl_"+type
    // -----------------------------
    // const type = "bar"
    // const result = await getBestOrWorseOfFirstNTVL_LastDayOrWeek(n, firstN, best, day)
    // const title = `First ${n} ${best ? "best" : "worse"} performers in top ${firstN} protocols for TVL of ${day ? "last day" : "last week"}`
    // const fileName = `top_${n}_${best ? "best" : "worse"}_performers_${day ? "last_day" : "last_week"}`
    // -----------------------------
    const type = "bubble"
    const result = await getFirstNTVLWithBestRatio(n, firstN, mcap)
    const title = `First ${n} in top ${firstN} protocols with best ${mcap ? "mcap/tvl" : "fdv/tvl"} ratio weighing mcap/fdv`
    const fileName = `top_${n}_protocols_${mcap ? "mcap_tvl" : "fdv_tvl"}`
    // -----------------------------
    await createAndSaveChart(result, title, type, fileName)
    // -----------------------------
    // const result = await compareProtocolAToProtocolB("MakerDAO", "Curve")
    // console.log(result[0])
    // console.log(result[1])
    // -----------------------------
    // const result = await searchProtocolForName("allbridge")
    // console.log(result)
}

main()